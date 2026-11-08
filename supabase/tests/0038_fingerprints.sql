-- =====================================================================
-- 0038_fingerprints.sql  (read-only - changes nothing)
-- ---------------------------------------------------------------------
-- WHAT THIS FILE IS
--   One query listing everything migration 0038 (Star design-review
--   database fixes: Edit event's one-step Undo, payments counted at the
--   desk's school, the form's own Paying by, belt order Worcester first)
--   made or replaced, one row each, in 0041_fingerprints.sql's format
--   (kind, item, detail):
--     function    the 7 functions it replaced or added (star_record_payment
--                 and star_record_refund with one more input,
--                 star_undo_payment, star_edit_payment, star_event_results,
--                 star_results_csv, star_undo_event_edit) and the 2 trigger
--                 functions (star_payments_guard, replaced;
--                 star_candidates_keep_form_choice, new): body_md5 (an md5
--                 of its code without comments and spaces), language,
--                 volatility, return type, security definer, settings (must
--                 say search_path=""), owner, and who may call it
--                 (role:EXECUTE, sorted)
--     column      the 3 new columns (star_payments.school and
--                 paying_by_before, star_candidates.paying_by_on_form):
--                 type, not null, and who may read each (authenticated,
--                 SELECT only; paying_by_before: nobody in the app)
--     constraint  the 3 new table rules (exact definitions)
--     trigger     star_candidates_before_form_choice (exact definition and
--                 whether it is enabled)
--     view        star_roster: md5 of its definition, its options (must say
--                 security_invoker=true) and its rights
--
-- WHY
--   Same idea as 0041_fingerprints.sql: supabase/tests/pglite/run.mjs
--   (step0038) prints these rows for the tested copy. After Jeffrey pastes
--   0038 into the SQL Editor, he runs this file there (or Claude runs it
--   through the read-only connection) and every row must match exactly.
--   That proves production has exactly the code, rights and rules that
--   passed the tests. (Before 0038 it lists only the six older functions,
--   with their old inputs, and the old guard.)
--   Expected change elsewhere: in 0006_fingerprints.sql the lines of the
--   functions above that it lists (star_record_payment / star_record_refund
--   with one more input, star_undo_payment / star_edit_payment /
--   star_event_results only their body md5), the star_payments and
--   star_candidates table lines (their columns and column rights), the
--   star_candidates trigger list (one more trigger), the star_payments_guard
--   function line and the star_roster view line; in 0023_fingerprints.sql
--   the star_results_csv line (body md5). Every other line - and every other
--   fingerprint file - stays.
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
         || ' lang=' || l.lanname
         || ' volatility=' || p.provolatile::text
         || ' returns=' || p.prorettype::regtype::text
         || ' definer=' || p.prosecdef::text
         || ' settings=' || coalesce(array_to_string(p.proconfig, ','), '')
         || ' owner=' || p.proowner::regrole::text
         || ' rights=' || coalesce((select string_agg(a.grantee::regrole::text || ':' || a.privilege_type, ','
                                                      order by a.grantee::regrole::text collate "C", a.privilege_type collate "C")
                                      from aclexplode(coalesce(p.proacl, acldefault('f', p.proowner))) as a), '') as detail
  from pg_proc p
  join pg_namespace n on n.oid = p.pronamespace
  join pg_language l on l.oid = p.prolang
 where n.nspname = 'public'
   and p.proname in ('star_record_payment', 'star_undo_payment', 'star_edit_payment', 'star_record_refund',
                     'star_event_results', 'star_results_csv', 'star_undo_event_edit',
                     'star_payments_guard', 'star_candidates_keep_form_choice')
union all
select 'column',
       t.attrelid::regclass::text || '.' || t.attname,
       format_type(t.atttypid, t.atttypmod) || ' notnull=' || t.attnotnull::text
         || ' rights=' || coalesce((select string_agg(a.grantee::regrole::text || ':' || a.privilege_type, ','
                                                      order by a.grantee::regrole::text collate "C", a.privilege_type collate "C")
                                      from aclexplode(t.attacl) as a), '')
  from pg_attribute t
 where ((t.attrelid = to_regclass('public.star_payments') and t.attname in ('school', 'paying_by_before'))
        or (t.attrelid = to_regclass('public.star_candidates') and t.attname = 'paying_by_on_form'))
union all
select 'constraint',
       c.conrelid::regclass::text || '.' || c.conname,
       c.contype::text || ' ' || pg_get_constraintdef(c.oid)
  from pg_constraint c
 where c.conname in ('star_payments_school_fk', 'star_payments_paying_by_before_check',
                     'star_candidates_paying_by_on_form_check')
union all
select 'trigger',
       t.tgrelid::regclass::text || '.' || t.tgname,
       pg_get_triggerdef(t.oid) || ' enabled=' || t.tgenabled::text
  from pg_trigger t
 where t.tgname = 'star_candidates_before_form_choice'
union all
select 'view',
       c.relname,
       md5(pg_get_viewdef(c.oid)) || ' options=' || coalesce(array_to_string(c.reloptions, ','), '')
         || ' rights=' || coalesce((select string_agg(a.grantee::regrole::text || ':' || a.privilege_type, ','
                                                      order by a.grantee::regrole::text collate "C", a.privilege_type collate "C")
                                      from aclexplode(c.relacl) as a
                                     where a.grantee <> c.relowner), '')
  from pg_class c join pg_namespace n on n.oid = c.relnamespace
 where n.nspname = 'public' and c.relname = 'star_roster'
) as fp
 order by fp.kind collate "C", fp.item collate "C";
