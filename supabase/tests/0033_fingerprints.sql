-- =====================================================================
-- 0033_fingerprints.sql  (read-only - changes nothing)
-- ---------------------------------------------------------------------
-- WHAT THIS FILE IS
--   One query with several kinds of rows about migration 0033 (Camps
--   design review: Mark paid with a way to pay, Camper history):
--     function   - the 3 functions 0033 replaces (camp_mark_paid, now
--                  with 4 inputs, camp_undo_payment, camp_edit_payment)
--                  and the 3 it adds (camp_camper_history,
--                  camp_history_strip, camp_campers_keep_form_choice),
--                  each with: body_md5 (an md5 of its code without
--                  comments and spaces), security definer, settings (must
--                  say search_path=""), owner, and who may call it
--                  (role:EXECUTE, sorted; "-" would mean PUBLIC)
--     column     - the 2 new columns: type, not null, and who may read
--                  them
--     constraint - the 2 new table rules (exact definitions)
--     trigger    - the new trigger on camp_campers
--     index      - the new index on change_log (exact definition)
--     view       - camp_roster: md5 of its definition, its options (must
--                  say security_invoker=true) and its rights
--
-- WHY
--   Same idea as 0027_fingerprints.sql: supabase/tests/pglite/run.mjs
--   prints these rows for the tested copy. After Jeffrey pastes 0033 into
--   the SQL Editor, Claude runs this on production through the read-only
--   connection and every row must match. That proves production has
--   exactly the code, rights and rules that passed the tests.
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
   and p.proname in ('camp_mark_paid', 'camp_undo_payment', 'camp_edit_payment', 'camp_camper_history',
                     'camp_history_strip', 'camp_campers_keep_form_choice')
union all
select 'column',
       t.attrelid::regclass::text || '.' || t.attname,
       format_type(t.atttypid, t.atttypmod) || ' notnull=' || t.attnotnull::text
         || ' rights=' || coalesce((select string_agg(a.grantee::regrole::text || ':' || a.privilege_type, ','
                                                      order by a.grantee::regrole::text, a.privilege_type)
                                      from aclexplode(t.attacl) as a), '')
  from pg_attribute t
 where (t.attrelid = to_regclass('public.camp_campers') and t.attname = 'paying_by_on_form')
    or (t.attrelid = to_regclass('public.camp_payments') and t.attname = 'paying_by_before')
union all
select 'constraint',
       c.conrelid::regclass::text || '.' || c.conname,
       pg_get_constraintdef(c.oid)
  from pg_constraint c
 where c.conname in ('camp_campers_paying_by_on_form_check', 'camp_payments_paying_by_before_check')
union all
select 'trigger',
       t.tgrelid::regclass::text || '.' || t.tgname,
       pg_get_triggerdef(t.oid) || ' enabled=' || t.tgenabled::text
  from pg_trigger t
 where t.tgname = 'camp_campers_before_form_choice'
union all
select 'index',
       c.relname,
       pg_get_indexdef(c.oid)
  from pg_class c join pg_namespace n on n.oid = c.relnamespace
 where n.nspname = 'public' and c.relname = 'change_log_camp_camper_idx'
union all
select 'view',
       c.relname,
       md5(pg_get_viewdef(c.oid)) || ' options=' || coalesce(array_to_string(c.reloptions, ','), '')
         || ' rights=' || coalesce((select string_agg(a.grantee::regrole::text || ':' || a.privilege_type, ','
                                                      order by a.grantee::regrole::text, a.privilege_type)
                                      from aclexplode(c.relacl) as a
                                     where a.grantee <> c.relowner), '')
  from pg_class c join pg_namespace n on n.oid = c.relnamespace
 where n.nspname = 'public' and c.relname = 'camp_roster'
) as fp
 order by fp.kind collate "C", fp.item collate "C";
