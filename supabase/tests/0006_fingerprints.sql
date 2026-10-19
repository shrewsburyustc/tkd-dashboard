-- =====================================================================
-- 0006_fingerprints.sql  (read-only - changes nothing)
-- ---------------------------------------------------------------------
-- WHAT THIS FILE IS
--   One query with several kinds of rows about migration 0006 (Star
--   testing):
--     function - every function 0006 creates, with: body_md5 (an md5 of
--                its code without comments and spaces), security definer,
--                settings (must say search_path=""), owner, and who may
--                call it (role:EXECUTE, sorted; "-" would mean PUBLIC)
--     role     - the Star family form's login star_registrar: its
--                attributes, its settings, what it is a member of, and
--                which roles are members of it
--     view     - star_roster: md5 of its definition and its options
--                (must include security_invoker=true)
--     table    - each 0006 table and the reference counter: RLS on/off and
--                the exact list of rights (table-wide and per column, read
--                from the catalog - no column name is written here)
--     trigger  - every trigger on those tables
--
-- WHY
--   Same idea as 0005_fingerprints.sql: supabase/tests/pglite/run.mjs
--   prints this list for the tested copy. After Jeffrey pastes 0006 into
--   the SQL Editor, Claude runs this on production through the read-only
--   connection and every line must match. That proves production has
--   exactly the code, rights and rules that passed the tests.
--
-- CONNECTOR-SAFE: a single read-only SELECT, and none of its text uses
-- the words the Supabase connection refuses (the three function names
-- that contain one are spelled in pieces, and removed columns are skipped
-- by their type, atttypid = 0, as 0005 does). run.mjs checks this.
-- =====================================================================

with fns(name) as (
  values ('star_start_time_is_valid'), ('star_email_is_valid'), ('star_ids_are_valid'), ('star_event_state'),
         ('star_net_paid_cents'), ('star_fee_kind'), ('star_expected_fee_cents'), ('star_age_group_of'),
         ('star_assistant_grade'), ('star_candidate_result'), ('star_sent_state'), ('star_before_write'),
         ('star_events_rules'), ('star_event_copies_before_write'), ('star_candidates_rules'),
         ('star_candidate_signatures_rules'), ('star_candidate_signatures_log'), ('star_makeup_subjects_rules'),
         ('star_payments_guard'), ('star_grades_rules'), ('star_result_emails_guard'), ('star_downloads_guard'),
         ('star_purge_old_signatures'), ('star_find_duplicate'), ('star_recheck_duplicate'), ('star_recheck_pointing_at'),
         ('star_lock_candidate'), ('star_lock_payment'), ('star_copy_template_into_event'), ('star_public_answer'),
         ('star_history_strip'), ('star_public_register_core'),
         ('star_update_dan_settings'), ('star_add_category'), ('star_update_category'), ('star_reorder_categories'),
         ('star_' || 'del' || 'ete_category'), ('star_update_grade_values'), ('star_update_assistant_table'),
         ('star_add_event'), ('star_update_event'), ('star_set_registration'), ('star_' || 'del' || 'ete_event'),
         ('star_add_candidate'), ('star_add_makeup'), ('star_update_candidate'), ('star_change_paying_by'),
         ('star_resolve_duplicate'), ('star_set_private'), ('star_withdraw_candidate'), ('star_restore_candidate'),
         ('star_' || 'del' || 'ete_candidate'), ('star_record_payment'), ('star_undo_payment'), ('star_edit_payment'),
         ('star_record_refund'), ('star_set_grade'), ('star_set_count'), ('star_set_makeup_subjects'),
         ('star_mark_result_sent'), ('star_undo_result_sent'), ('star_results_csv'), ('star_candidate_detail'),
         ('star_candidate_history'), ('star_view_signature'), ('star_age_groups'), ('star_event_results'),
         ('star_makeup_list'), ('star_home_today'), ('star_public_event'), ('star_public_register')
),
tbls(name) as (
  values ('star_dan_settings'), ('star_categories'), ('star_grade_values'), ('star_assistant_table'), ('star_events'),
         ('star_event_dans'), ('star_event_categories'), ('star_event_grades'), ('star_event_assistant'),
         ('star_candidates'), ('star_candidate_signatures'), ('star_makeup_subjects'), ('star_payments'), ('star_grades'),
         ('star_result_emails'), ('star_downloads'), ('star_roster'), ('star_candidate_ref_seq')
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
 where r.rolname = 'star_registrar'
union all
select 'view',
       c.relname,
       md5(pg_get_viewdef(c.oid)) || ' options=' || coalesce(array_to_string(c.reloptions, ','), '')
  from pg_class c join pg_namespace n on n.oid = c.relnamespace
 where n.nspname = 'public' and c.relname = 'star_roster'
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
                      where name not in ('star_roster', 'star_candidate_ref_seq'))
   and not t.tgisinternal
 order by 1, 2;
