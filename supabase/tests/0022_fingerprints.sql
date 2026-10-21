-- =====================================================================
-- 0022_fingerprints.sql  (read-only - changes nothing)
-- ---------------------------------------------------------------------
-- WHAT THIS FILE IS
--   One query with several kinds of rows about migration 0022 (camps
--   weekly pricing and longer camps):
--     function   - the 4 functions 0022 adds, the 18 0013 functions it
--                  replaces, and the family form's 2 public functions,
--                  each with: body_md5 (an md5 of its code without
--                  comments and spaces), security definer, settings (must
--                  say search_path=""), owner, and who may call it
--                  (role:EXECUTE, sorted; "-" would mean PUBLIC)
--     constraint - the 5 table rules 0022 sets (exact definitions) and
--                  every other rule of those tables
--     role       - camps_registrar: what it is a member of, and which
--                  camp functions in schema public it may run (must stay
--                  exactly camp_public_camp and camp_public_signup)
--
-- WHY
--   Same idea as 0013_fingerprints.sql / 0017_fingerprints.sql:
--   supabase/tests/pglite/run.mjs prints this list for the tested copy.
--   After Jeffrey pastes 0022 into the SQL Editor, Claude runs this on
--   production through the read-only connection and every line must
--   match. That proves production has exactly the code, rights and rules
--   that passed the tests.
--
-- CONNECTOR-SAFE: a single read-only SELECT, and none of its text uses
-- the words the Supabase connection refuses. run.mjs checks this.
-- =====================================================================

with fns(name) as (
  values ('camp_week_size'), ('camp_weekly_base_cents'), ('camp_comes_whole_week'), ('camp_weeks_breakdown'),
         ('camp_days_arg_is_valid'), ('camp_prices_arg_is_valid'), ('camp_dates_are_sorted_set'),
         ('camp_camper_extras_arg_is_valid'), ('camp_children_arg_is_valid'), ('camp_template_setup_is_valid'),
         ('camp_setup_args_are_valid'), ('camp_camper_extras_are_ok'), ('camp_extras_only_on_ok'),
         ('camp_camper_extras_before_write'), ('camp_public_signup_answer'), ('camp_camper_detail'),
         ('camp_update_camp'), ('camp_save_template'), ('camp_update_template'), ('camp_update_details'),
         ('camp_edit_payment'), ('camp_public_signup_core'),
         ('camp_public_camp'), ('camp_public_signup')
),
tbls(name) as (
  values ('camp_prices'), ('camp_templates'), ('camp_campers'), ('camp_payments'), ('finance_day_closing_items')
)
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
   and p.proname in (select name from fns)
union all
select 'constraint',
       c.conrelid::regclass::text || '.' || c.conname,
       pg_get_constraintdef(c.oid)
  from pg_constraint c
 where c.conrelid in (select to_regclass('public.' || name) from tbls)
union all
select 'role',
       r.rolname,
       'member_of=' || coalesce((select string_agg(m.roleid::regrole::text, ',' order by 1)
                                   from pg_auth_members m where m.member = r.oid), '')
         || ' runs=' || coalesce((select string_agg(p.proname, ',' order by p.proname)
                                    from pg_proc p join pg_namespace n on n.oid = p.pronamespace
                                   where n.nspname = 'public' and (p.proname like 'camp\_%' or p.proname like 'camps\_%')
                                     and has_function_privilege(r.oid, p.oid, 'EXECUTE')), '')
  from pg_roles r
 where r.rolname = 'camps_registrar'
) as fp
 order by fp.kind collate "C", fp.item collate "C";
