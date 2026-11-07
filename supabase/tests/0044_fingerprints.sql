-- =====================================================================
-- 0044_fingerprints.sql  (read-only - changes nothing)
-- ---------------------------------------------------------------------
-- WHAT THIS FILE IS
--   One query listing everything migration 0044 (Color Belt rolling
--   check: the family form's own Paying by, Edit event's Undo in one
--   call, each payment's school) adds or replaces, each with a
--   "fingerprint":
--     function   the 5-input Mark paid functions, the 6 REPLACED live
--                functions (the 2 Undo payment, the 2 Edit payment, Move
--                to private and Undo move), the new
--                testing_undo_event_edit and the 4 trigger functions:
--                body_md5 (an md5 of the code without comments and
--                spaces), security definer, settings (must say
--                search_path=""), owner, and who may call it
--                (role:EXECUTE, sorted)
--     column     the 4 new columns (2 x paying_by_on_form, 2 x school):
--                type, nullable, and who may read them
--     view       testing_roster and testing_private_list: md5 of the
--                definition and the options (security_invoker=true), and
--                who may read them
--     trigger    the 4 new triggers, with their full text
--     constraint the 4 new rules, with their full text
--
-- WHY
--   Same idea as 0030_fingerprints.sql: supabase/tests/pglite/run.mjs
--   prints this list for the tested copy. After Jeffrey pastes 0044 into
--   the SQL Editor, Claude runs this on production through the read-only
--   connection and every line must match. That proves production has
--   exactly the code, rights and rules that passed the tests.
--   (0003_, 0005_, 0014_ and 0030_fingerprints.sql then differ from
--   before 0044 ONLY as SETUP.md 0044c says.)
--
-- CONNECTOR-SAFE: a single read-only SELECT, and none of its text uses
-- the words the Supabase connection refuses (run.mjs checks this).
-- =====================================================================

with fns(name) as (
  values ('testing_mark_paid_by'), ('testing_private_mark_paid_by'),
         ('testing_undo_payment'), ('testing_private_undo_payment'),
         ('testing_edit_payment'), ('testing_private_edit_payment'),
         ('testing_move_to_private'), ('testing_private_undo_move'),
         ('testing_undo_event_edit'),
         ('testing_registrations_keep_form_choice'), ('testing_private_keep_form_choice'),
         ('testing_payments_set_school'), ('testing_private_payments_set_school')
),
cols(tbl, col) as (
  values ('testing_registrations', 'paying_by_on_form'), ('testing_private', 'paying_by_on_form'),
         ('testing_payments', 'school'), ('testing_private_payments', 'school')
),
views(name) as (
  values ('testing_roster'), ('testing_private_list')
),
trgs(tbl, name) as (
  values ('testing_registrations', 'testing_registrations_before_form_choice'),
         ('testing_private', 'testing_private_before_form_choice'),
         ('testing_payments', 'testing_payments_school'),
         ('testing_private_payments', 'testing_private_payments_school')
),
cons(tbl, name) as (
  values ('testing_registrations', 'testing_registrations_paying_by_on_form_check'),
         ('testing_private', 'testing_private_paying_by_on_form_check'),
         ('testing_payments', 'testing_payments_school_fk'),
         ('testing_private_payments', 'testing_private_payments_school_fk')
)
select 'function' as kind,
       p.proname || '(' || pg_get_function_identity_arguments(p.oid) || ')' as item,
       md5(regexp_replace(regexp_replace(p.prosrc, '--[^\n]*', '', 'g'), '\s+', '', 'g'))
         || ' definer=' || p.prosecdef::text
         || ' settings=' || coalesce(array_to_string(p.proconfig, ','), '')
         || ' defaults=' || p.pronargdefaults::text
         || ' owner=' || p.proowner::regrole::text
         || ' rights=' || coalesce((select string_agg(a.grantee::regrole::text || ':' || a.privilege_type, ','
                                                      order by a.grantee::regrole::text, a.privilege_type)
                                      from aclexplode(coalesce(p.proacl, acldefault('f', p.proowner))) as a), '') as detail
  from pg_proc p
  join pg_namespace n on n.oid = p.pronamespace
 where n.nspname = 'public'
   and p.proname in (select name from fns)
union all
select 'column',
       x.tbl || '.' || x.col,
       format_type(t.atttypid, t.atttypmod) || ' notnull=' || t.attnotnull
         || ' rights=' || coalesce((select string_agg(a.grantee::regrole::text || ':' || a.privilege_type, ','
                                                      order by a.grantee::regrole::text, a.privilege_type)
                                      from aclexplode(t.attacl) as a), '')
  from cols x
  join pg_attribute t on t.attrelid = to_regclass('public.' || x.tbl) and t.attname = x.col and t.attnum > 0
union all
select 'view',
       c.relname,
       md5(pg_get_viewdef(c.oid)) || ' options=' || coalesce(array_to_string(c.reloptions, ','), '')
         || ' rights=' || coalesce((select string_agg(a.grantee::regrole::text || ':' || a.privilege_type, ','
                                                      order by a.grantee::regrole::text, a.privilege_type)
                                      from aclexplode(c.relacl) as a
                                     where a.grantee <> c.relowner), '')
  from pg_class c join pg_namespace n on n.oid = c.relnamespace
 where n.nspname = 'public' and c.relname in (select name from views)
union all
select 'trigger',
       t.tgrelid::regclass::text || '.' || t.tgname,
       pg_get_triggerdef(t.oid) || ' enabled=' || t.tgenabled::text
  from pg_trigger t
  join trgs x on t.tgrelid = to_regclass('public.' || x.tbl) and t.tgname = x.name
 where not t.tgisinternal
union all
select 'constraint',
       c.conrelid::regclass::text || '.' || c.conname,
       pg_get_constraintdef(c.oid)
  from pg_constraint c
  join cons x on c.conrelid = to_regclass('public.' || x.tbl) and c.conname = x.name
 order by 1, 2;
