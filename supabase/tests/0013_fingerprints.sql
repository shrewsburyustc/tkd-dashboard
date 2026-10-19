-- =====================================================================
-- 0013_fingerprints.sql  (read-only - changes nothing)
-- ---------------------------------------------------------------------
-- WHAT THIS FILE IS
--   One query with several kinds of rows about migration 0013 (Camps):
--     function - every function 0013 creates, with: body_md5 (an md5 of
--                its code without comments and spaces), security definer,
--                settings (must say search_path=""), owner, and who may
--                call it (role:EXECUTE, sorted; "-" would mean PUBLIC)
--     role     - the camp family form's login camps_registrar: its
--                attributes, its settings, what it is a member of, and
--                which roles are members of it
--     view     - camp_roster: md5 of its definition and its options
--                (must include security_invoker=true)
--     table    - each 0013 table and the two counters: RLS on/off and the
--                exact list of rights (table-wide and per column, read
--                from the catalog - no column name is written here)
--     trigger  - every trigger on those tables
--
-- WHY
--   Same idea as 0005_fingerprints.sql / 0006_fingerprints.sql:
--   supabase/tests/pglite/run.mjs prints this list for the tested copy.
--   After Jeffrey pastes 0013 into the SQL Editor, Claude runs this on
--   production through the read-only connection and every line must
--   match. That proves production has exactly the code, rights and rules
--   that passed the tests.
--
-- CONNECTOR-SAFE: a single read-only SELECT, and none of its text uses
-- the words the Supabase connection refuses (the three function names
-- that contain one are spelled in pieces, and columns that no longer
-- exist are skipped by their type, atttypid = 0, as 0005 does). run.mjs
-- checks this.
-- =====================================================================

with fns(name) as (
  values ('camp_text_is_valid'), ('camp_days_arg_is_valid'), ('camp_uuid_text_is_valid'), ('camp_int_text_is_valid'),
         ('camp_time_is_valid'), ('camp_prices_arg_is_valid'), ('camp_extras_arg_is_valid'), ('camp_uuid_list_is_valid'),
         ('camp_camper_extras_arg_is_valid'), ('camp_children_arg_is_valid'), ('camp_template_setup_is_valid'),
         ('camp_price_kind'), ('camps_before_write'), ('camp_templates_before_write'), ('camp_parts_before_write'),
         ('camp_signups_before_write'), ('camp_campers_before_write'), ('camp_camper_days_before_write'),
         ('camp_camper_extras_before_write'), ('camp_payments_guard'), ('camp_signups_log'), ('camp_first_day'),
         ('camp_last_day'), ('camp_day_count'), ('camp_signup_state'), ('camp_base_cents'), ('camp_camper_total_cents'),
         ('camp_camper_paid_cents'), ('camp_purge_old_signatures'), ('camp_find_duplicate'), ('camp_recheck_duplicate'),
         ('camp_recheck_pointing_at'), ('camp_lock_camper'), ('camp_lock_payment'), ('camp_public_camp_answer'),
         ('camp_public_signup_answer'), ('camp_add_parts'), ('camp_tidy_extras'), ('camp_tidy_prices'),
         ('camp_setup_args_are_valid'), ('camp_extra_rows'), ('camp_camper_extras_are_ok'), ('camp_extras_cents_now'),
         ('camp_public_signup_core'),
         ('camp_add_camp'), ('camp_update_camp'), ('camp_set_signup'), ('camp_' || 'del' || 'ete_camp'),
         ('camp_save_template'), ('camp_update_template'), ('camp_' || 'del' || 'ete_template'), ('camp_update_details'),
         ('camp_change_paying_by'), ('camp_mark_paid'), ('camp_undo_payment'), ('camp_edit_payment'),
         ('camp_resolve_duplicate'), ('camp_withdraw_camper'), ('camp_restore_camper'), ('camp_' || 'del' || 'ete_camper'),
         ('camp_check_in'), ('camp_undo_check_in'), ('camp_camper_detail'),
         ('camp_public_camp'), ('camp_public_signup')
),
tbls(name) as (
  values ('camps'), ('camp_days'), ('camp_prices'), ('camp_extras'), ('camp_templates'), ('camp_signups'), ('camp_campers'),
         ('camp_camper_days'), ('camp_camper_extras'), ('camp_payments'), ('camp_public_attempts'), ('camp_roster'),
         ('camp_signup_ref_seq'), ('camp_public_attempts_id_seq')
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
 where r.rolname = 'camps_registrar'
union all
select 'view',
       c.relname,
       md5(pg_get_viewdef(c.oid)) || ' options=' || coalesce(array_to_string(c.reloptions, ','), '')
  from pg_class c join pg_namespace n on n.oid = c.relnamespace
 where n.nspname = 'public' and c.relname = 'camp_roster'
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
                      where name not in ('camp_roster', 'camp_signup_ref_seq', 'camp_public_attempts_id_seq'))
   and not t.tgisinternal
 order by 1, 2;
