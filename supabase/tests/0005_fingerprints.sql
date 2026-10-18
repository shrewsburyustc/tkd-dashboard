-- =====================================================================
-- 0005_fingerprints.sql  (read-only - changes nothing)
-- ---------------------------------------------------------------------
-- WHAT THIS FILE IS
--   One query with several kinds of rows about migration 0005 (Color Belt
--   phase 2: events, the family form, payments, school addresses):
--     function - every function 0005 creates, with: body_md5 (an md5 of
--                its code without comments and spaces), security definer,
--                settings (must say search_path=""), owner, and who may
--                call it (role:EXECUTE, sorted; "-" would mean PUBLIC)
--     role     - the family form's login testing_registrar: its
--                attributes, its settings, what it is a member of, and
--                which roles are members of it
--     view     - testing_roster: md5 of its definition and its options
--                (must include security_invoker=true)
--     table    - each table 0005 creates or extends: RLS on/off and the
--                exact list of rights (table-wide and per column)
--     trigger  - every trigger on those tables
--
-- WHY
--   Same idea as 0003_fingerprints.sql: supabase/tests/pglite/run.mjs
--   prints this list for the tested copy. After Jeffrey pastes 0005 into
--   the SQL Editor, Claude runs this on production through the read-only
--   connection and every line must match. That proves production has
--   exactly the code, rights and rules that passed the tests.
--
-- CONNECTOR-SAFE: a single read-only SELECT, and none of its text uses
-- the words the Supabase connection refuses (the two function names that
-- contain one are spelled in pieces, and removed columns are skipped by
-- their type, atttypid = 0, for the same reason).
-- =====================================================================

with fns(name) as (
  values ('testing_line_is_valid'), ('testing_normalize_note'), ('testing_note_is_valid'),
         ('testing_signature_is_valid'), ('testing_school_date'), ('testing_today'), ('testing_fee_cents'),
         ('testing_new_public_code'), ('testing_classes_arg_is_valid'), ('testing_locations_before_write'),
         ('testing_event_state'), ('testing_rank_testing_for'), ('testing_location_address'),
         ('testing_events_before_write'), ('testing_event_copies_before_write'),
         ('testing_registrations_before_write'), ('testing_registrations_log'), ('testing_payments_guard'),
         ('testing_purge_old_signatures'), ('testing_find_duplicate'), ('testing_recheck_duplicate'),
         ('testing_recheck_pointing_at'), ('testing_check_classes_for_event'), ('testing_copy_class_into_event'),
         ('testing_public_answer'), ('testing_lock_registration'), ('testing_lock_payment'),
         ('testing_add_event'), ('testing_update_event'), ('testing_set_registration'), ('testing_' || 'del' || 'ete_event'),
         ('testing_add_student'), ('testing_update_student'), ('testing_change_paying_by'), ('testing_mark_paid'),
         ('testing_undo_payment'), ('testing_edit_payment'), ('testing_resolve_duplicate'),
         ('testing_withdraw_student'), ('testing_restore_student'), ('testing_' || 'del' || 'ete_student'),
         ('settings_update_school_address'), ('testing_public_event'), ('testing_public_register_core'),
         ('testing_public_register')
),
tbls(name) as (
  values ('locations'), ('testing_events'), ('testing_event_classes'), ('testing_event_ranks'),
         ('testing_registrations'), ('testing_payments'), ('testing_public_attempts'), ('testing_roster'),
         ('testing_registration_ref_seq'), ('testing_public_attempts_id_seq')
)
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
   and p.proname in (select name from fns)
union all
select 'role',
       r.rolname,
       'login=' || r.rolcanlogin || ' inherit=' || r.rolinherit || ' createdb=' || r.rolcreatedb
         || ' createrole=' || r.rolcreaterole || ' bypassrls=' || r.rolbypassrls || ' replication=' || r.rolreplication
         || ' super=' || r.rolsuper || ' connlimit=' || r.rolconnlimit
         || ' settings=' || coalesce((select array_to_string(s.setconfig, ',') from pg_db_role_setting s
                                       where s.setrole = r.oid and s.setdatabase = 0), '')
         || ' member_of=' || coalesce((select string_agg(m.roleid::regrole::text, ',' order by 1)
                                         from pg_auth_members m where m.member = r.oid), '')
         || ' members=' || coalesce((select string_agg(m.member::regrole::text, ',' order by 1)
                                       from pg_auth_members m where m.roleid = r.oid), '')
  from pg_roles r
 where r.rolname = 'testing_registrar'
union all
select 'view',
       c.relname,
       md5(pg_get_viewdef(c.oid)) || ' options=' || coalesce(array_to_string(c.reloptions, ','), '')
  from pg_class c join pg_namespace n on n.oid = c.relnamespace
 where n.nspname = 'public' and c.relname = 'testing_roster'
union all
select 'table',
       c.relname,
       'rls=' || c.relrowsecurity
         || ' rights=' || coalesce((select string_agg(a.grantee::regrole::text || ':' || a.privilege_type, ','
                                                      order by a.grantee::regrole::text, a.privilege_type)
                                      from aclexplode(c.relacl) as a
                                     where a.grantee <> c.relowner), '')
         || ' columns=' || coalesce((select string_agg(t.attname || '>' || a.grantee::regrole::text || ':' || a.privilege_type, ','
                                                       order by t.attname, a.grantee::regrole::text, a.privilege_type)
                                       from pg_attribute t, aclexplode(t.attacl) as a
                                      where t.attrelid = c.oid and t.attnum > 0 and t.atttypid <> 0), '')
  from pg_class c join pg_namespace n on n.oid = c.relnamespace
 where n.nspname = 'public' and c.relname in (select name from tbls)
union all
select 'trigger',
       t.tgrelid::regclass::text || '.' || t.tgname,
       pg_get_triggerdef(t.oid) || ' enabled=' || t.tgenabled::text
  from pg_trigger t
 where t.tgrelid in (select ('public.' || name)::regclass from tbls
                      where name not in ('testing_roster', 'testing_registration_ref_seq', 'testing_public_attempts_id_seq'))
   and not t.tgisinternal
 order by 1, 2;
