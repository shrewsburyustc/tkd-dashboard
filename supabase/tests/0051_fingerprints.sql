-- =====================================================================
-- 0051_fingerprints.sql  (read-only - changes nothing)
-- ---------------------------------------------------------------------
-- WHAT THIS FILE IS
--   One query listing everything migration 0051 (the Board breaking
--   section, rulebook v1.300-v1.303) made, one row each, in
--   0050_fingerprints.sql's format (kind, item, detail). It finds
--   everything by the name prefix brk_ (so the list can't miss a helper):
--     function    every function in schema public whose name starts with
--                 brk_ - the 26 the app and the two logins call, the
--                 internal helpers and the trigger functions: body_md5 (an
--                 md5 of its code without comments and spaces), language,
--                 volatility, return type, security definer, settings
--                 (must say search_path=""), owner, and who may call it
--                 (role:EXECUTE, sorted). The staff functions are for
--                 authenticated only, the four family-form ones for
--                 brk_registrar only, brk_square_payment for brk_square
--                 only, everything else for nobody but the owner.
--     table       the nine brk_ tables: row security, the table rights,
--                 and the column rights (the app reads only the columns
--                 listed; never square_order_id, square_link_url,
--                 submission_id, recorded_by, paying_by_before)
--     column      every column of those tables: type, not null, default
--                 (the whole definition of the tables in one place)
--     constraint  every table rule (exact definitions)
--     trigger     every trigger of those tables (exact definitions)
--     policy      the row-security policies
--     sequence    the rights on the sequences the tables own
--     role        brk_registrar and brk_square: login, inherit, create
--                 rights, connection limit, settings, memberships
--
-- WHY
--   Same idea as 0050_fingerprints.sql: supabase/tests/pglite/run.mjs
--   (step0051) prints these rows for the tested copy. After Jeffrey pastes
--   0051 into the SQL Editor, he runs this file there (or Claude runs it
--   through the read-only connection) and every row must match exactly.
--   That proves production has exactly the code, rights and rules that
--   passed the tests. Before 0051 this file lists no row at all.
--   ONE expected difference on Supabase: the two role rows show
--   members=postgres (PostgreSQL 16+ makes the role that created a login
--   an administrator of it; that gives the role nothing). In PGlite the
--   list is empty.
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
   and p.proname like 'brk\_%'
union all
select 'table',
       c.relname,
       'rls=' || c.relrowsecurity::text
         || ' rights=' || coalesce((select string_agg(a.grantee::regrole::text || ':' || a.privilege_type, ','
                                                      order by a.grantee::regrole::text collate "C", a.privilege_type collate "C")
                                      from aclexplode(c.relacl) as a
                                     where a.grantee <> c.relowner), '')
         || ' columns=' || coalesce((select string_agg(t.attname || '>' || a.grantee::regrole::text || ':' || a.privilege_type, ','
                                                       order by t.attname collate "C", a.grantee::regrole::text collate "C", a.privilege_type collate "C")
                                       from pg_attribute t, aclexplode(t.attacl) as a
                                      where t.attrelid = c.oid and t.attnum > 0 and t.atttypid <> 0), '')
  from pg_class c join pg_namespace n on n.oid = c.relnamespace
 where n.nspname = 'public' and c.relkind = 'r' and c.relname like 'brk\_%'
union all
select 'column',
       t.attrelid::regclass::text || '.' || t.attname,
       format_type(t.atttypid, t.atttypmod) || ' notnull=' || t.attnotnull::text
         || ' default=' || coalesce((select pg_get_expr(d.adbin, d.adrelid) from pg_attrdef d
                                      where d.adrelid = t.attrelid and d.adnum = t.attnum), '')
  from pg_attribute t
  join pg_class c on c.oid = t.attrelid
  join pg_namespace n on n.oid = c.relnamespace
 where n.nspname = 'public' and c.relkind = 'r' and c.relname like 'brk\_%'
   and t.attnum > 0 and t.atttypid <> 0
union all
select 'constraint',
       c.conrelid::regclass::text || '.' || c.conname,
       c.contype::text || ' ' || pg_get_constraintdef(c.oid)
  from pg_constraint c
  join pg_class r on r.oid = c.conrelid
  join pg_namespace n on n.oid = r.relnamespace
 where n.nspname = 'public' and r.relname like 'brk\_%'
union all
select 'trigger',
       t.tgrelid::regclass::text || '.' || t.tgname,
       pg_get_triggerdef(t.oid) || ' enabled=' || t.tgenabled::text
  from pg_trigger t
  join pg_class r on r.oid = t.tgrelid
  join pg_namespace n on n.oid = r.relnamespace
 where not t.tgisinternal and n.nspname = 'public' and r.relname like 'brk\_%'
union all
select 'policy',
       p.tablename || '.' || p.policyname,
       'cmd=' || p.cmd || ' roles=' || array_to_string(p.roles, ',') || ' using=' || coalesce(p.qual, '')
         || ' check=' || coalesce(p.with_check, '')
  from pg_policies p
 where p.schemaname = 'public' and p.tablename like 'brk\_%'
union all
select 'sequence',
       c.relname,
       'rights=' || coalesce((select string_agg(a.grantee::regrole::text || ':' || a.privilege_type, ','
                                                order by a.grantee::regrole::text collate "C", a.privilege_type collate "C")
                                from aclexplode(c.relacl) as a
                               where a.grantee <> c.relowner), '')
  from pg_class c join pg_namespace n on n.oid = c.relnamespace
 where n.nspname = 'public' and c.relkind = 'S' and c.relname like 'brk\_%'
union all
select 'role',
       r.rolname,
       'login=' || r.rolcanlogin::text || ' inherit=' || r.rolinherit::text || ' createdb=' || r.rolcreatedb::text
         || ' createrole=' || r.rolcreaterole::text || ' bypassrls=' || r.rolbypassrls::text || ' replication=' || r.rolreplication::text
         || ' super=' || r.rolsuper::text || ' connlimit=' || r.rolconnlimit::text
         || ' settings=' || coalesce((select array_to_string(s.setconfig, ',') from pg_db_role_setting s
                                       where s.setrole = r.oid and s.setdatabase = 0), '')
         || ' member_of=' || coalesce((select string_agg(m.roleid::regrole::text, ',' order by m.roleid::regrole::text collate "C")
                                         from pg_auth_members m where m.member = r.oid), '')
         || ' members=' || coalesce((select string_agg(m.member::regrole::text, ',' order by m.member::regrole::text collate "C")
                                       from pg_auth_members m where m.roleid = r.oid), '')
  from pg_roles r
 where r.rolname in ('brk_registrar', 'brk_square')
) as fp
 order by fp.kind collate "C", fp.item collate "C";
