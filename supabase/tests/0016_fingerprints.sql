-- =====================================================================
-- 0016_fingerprints.sql  (read-only - changes nothing)
-- ---------------------------------------------------------------------
-- WHAT THIS FILE IS
--   One query with several kinds of rows about migration 0016 (Black Belt
--   testing), in 0006_fingerprints.sql's format (kind, item, detail):
--     function   - every bb_* function 0016 creates (the 25 staff
--                  functions, the 2 public ones, the internal helpers and
--                  trigger functions), with: body_md5 (an md5 of its code
--                  without comments and spaces), security definer,
--                  settings (must say search_path=""), owner, and who may
--                  call it (role:EXECUTE, sorted)
--     role       - the Black Belt family form's login bb_registrar: its
--                  attributes, its settings, what it is a member of, and
--                  which roles are members of it
--     table      - each of the 13 bb_* tables and the reference counter:
--                  RLS on/off, owner, the exact list of rights (table-wide
--                  and per column, read from the catalog - no column name
--                  is written here)
--     policy     - every read rule on those tables
--     trigger    - every trigger on those tables
--     constraint - each table rule (key, foreign key, check) with its text
--     index      - every bb_* index with its definition
-- The rows are sorted byte by byte (collate "C"), so the list comes out in
-- the same order in PGlite and on production (whose text sorting is ICU).
--
-- WHY
--   supabase/tests/pglite/run.mjs prints this list for the tested copy.
--   After Jeffrey pastes 0016 into the SQL Editor, Claude runs this on
--   production through the read-only connection and every line must
--   match. That proves production has exactly the code, rights and rules
--   that passed the tests.
--
-- CONNECTOR-SAFE: a single read-only SELECT, and none of its text uses
-- the words the Supabase connection refuses (functions are found by their
-- bb_ prefix, so no function name is written here; removed columns are
-- skipped by their type, atttypid = 0, as 0005 does). run.mjs checks this.
-- =====================================================================

with tbls(name) as (
  values ('bb_settings'), ('bb_waiver_versions'), ('bb_starting_point'), ('bb_cycles'), ('bb_cycle_days'),
         ('bb_cycle_day_parts'), ('bb_cycle_plans'), ('bb_cycle_plan_amounts'), ('bb_cycle_kukkiwon_fees'),
         ('bb_cycle_plan_payments'), ('bb_candidates'), ('bb_candidate_waivers'), ('bb_payments'),
         ('bb_candidate_ref_seq')
)
select fp.* from (
select 'function' as kind,
       p.proname || '(' || pg_get_function_identity_arguments(p.oid) || ')' as item,
       md5(regexp_replace(regexp_replace(p.prosrc, '--[^\n]*', '', 'g'), '\s+', '', 'g'))
         || ' definer=' || p.prosecdef::text
         || ' volatile=' || p.provolatile::text
         || ' settings=' || coalesce(array_to_string(p.proconfig, ','), '')
         || ' owner=' || p.proowner::regrole::text
         || ' rights=' || coalesce((select string_agg(a.grantee::regrole::text || ':' || a.privilege_type, ','
                                                      order by a.grantee::regrole::text collate "C", a.privilege_type collate "C")
                                      from aclexplode(coalesce(p.proacl, acldefault('f', p.proowner))) as a), '') as detail
  from pg_proc p
  join pg_namespace n on n.oid = p.pronamespace
 where n.nspname = 'public'
   and p.proname like 'bb\_%'
union all
select 'role',
       r.rolname,
       'login=' || r.rolcanlogin || ' inherit=' || r.rolinherit || ' createdb=' || r.rolcreatedb
         || ' createrole=' || r.rolcreaterole || ' bypassrls=' || r.rolbypassrls || ' replication=' || r.rolreplication
         || ' super=' || r.rolsuper || ' connlimit=' || r.rolconnlimit
         || ' settings=' || coalesce((select array_to_string(s.setconfig, ',') from pg_db_role_setting s
                                       where s.setrole = r.oid and s.setdatabase = 0), '')
         || ' member_of=' || coalesce((select string_agg(m.roleid::regrole::text, ',' order by m.roleid::regrole::text collate "C")
                                         from pg_auth_members m where m.member = r.oid), '')
         || ' members=' || coalesce((select string_agg(m.member::regrole::text, ',' order by m.member::regrole::text collate "C")
                                       from pg_auth_members m where m.roleid = r.oid), '')
  from pg_roles r
 where r.rolname = 'bb_registrar'
union all
select 'table',
       c.relname,
       'rls=' || c.relrowsecurity
         || ' owner=' || c.relowner::regrole::text
         || ' rights=' || coalesce((select string_agg(a.grantee::regrole::text || ':' || a.privilege_type, ','
                                                      order by a.grantee::regrole::text collate "C", a.privilege_type collate "C")
                                      from aclexplode(c.relacl) as a
                                     where a.grantee <> c.relowner), '')
         || ' columns=' || coalesce((select string_agg(t.attname || '>' || a.grantee::regrole::text || ':' || a.privilege_type, ','
                                                       order by t.attname collate "C", a.grantee::regrole::text collate "C",
                                                                a.privilege_type collate "C")
                                       from pg_attribute t, aclexplode(t.attacl) as a
                                      where t.attrelid = c.oid and t.attnum > 0 and t.atttypid <> 0), '')
  from pg_class c join pg_namespace n on n.oid = c.relnamespace
 where n.nspname = 'public' and c.relname in (select name from tbls)
union all
select 'policy',
       pp.tablename || '.' || pp.policyname,
       pp.cmd || ' ' || pp.permissive || ' to=' || array_to_string(pp.roles, '+') || ' using=' || coalesce(pp.qual, '')
         || ' check=' || coalesce(pp.with_check, '')
  from pg_policies pp
 where pp.schemaname = 'public' and pp.tablename in (select name from tbls)
union all
select 'trigger',
       t.tgrelid::regclass::text || '.' || t.tgname,
       pg_get_triggerdef(t.oid) || ' enabled=' || t.tgenabled::text
  from pg_trigger t
 where t.tgrelid in (select to_regclass('public.' || name) from tbls where name <> 'bb_candidate_ref_seq')
   and not t.tgisinternal
union all
select 'constraint',
       c.conrelid::regclass::text || '.' || c.conname,
       pg_get_constraintdef(c.oid)
  from pg_constraint c
 where c.conrelid in (select to_regclass('public.' || name) from tbls where name <> 'bb_candidate_ref_seq')
union all
select 'index',
       i.tablename || '.' || i.indexname,
       i.indexdef
  from pg_indexes i
 where i.schemaname = 'public' and i.tablename in (select name from tbls)
) as fp
 order by fp.kind collate "C", fp.item collate "C";
