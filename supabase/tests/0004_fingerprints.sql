-- =====================================================================
-- 0004_fingerprints.sql  (read-only - changes nothing)
-- ---------------------------------------------------------------------
-- WHAT THIS FILE IS
--   One query with three kinds of rows about migration 0004 (Staff
--   accounts: reset password / PIN):
--     function - each 0004 function, plus 0002's admin_set_staff_pin
--                (0004 took away the app's right to call it), with:
--                  body_md5 of its code without comments and spaces,
--                  security definer, settings (must say search_path=""),
--                  owner, and who may call it (role:EXECUTE, sorted;
--                  "-" would mean PUBLIC = everyone)
--     column   - every Supabase Auth column 0004 writes or reads, with its
--                type. If Supabase ever renames or retypes one, its row
--                goes missing or changes - a warning BEFORE anyone tries a
--                reset.
--     trigger  - triggers on public.staff and on the five Auth tables 0004
--                writes. Expected: only staff_set_updated_at on
--                public.staff and none on the Auth tables (a trigger
--                there, e.g. a database webhook, would also run during a
--                reset and during 0004_tests.sql). A change_log trigger
--                on public.staff would copy PIN hashes into the history,
--                so it must never appear.
--
-- WHY
--   Same idea as 0003_fingerprints.sql: run.mjs prints this list for the
--   tested copy; after Jeffrey pastes 0004 into the SQL Editor, Claude runs
--   this on production through the read-only connection and every line
--   must match.
--
-- CONNECTOR-SAFE: a single read-only SELECT, and none of its text uses
-- the words the Supabase connection refuses.
-- =====================================================================

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
   and p.proname in ('admin_list_staff', 'admin_reset_password', 'admin_reset_pin',
                     'staff_admin_gate', 'admin_set_staff_pin')
union all
select 'column',
       c.table_schema || '.' || c.table_name || '.' || c.column_name,
       c.udt_name || case when c.is_nullable = 'NO' then ' not null' else '' end
  from information_schema.columns c
 where (c.table_schema, c.table_name, c.column_name) in (
         ('auth', 'users', 'id'), ('auth', 'users', 'encrypted_password'),
         ('auth', 'users', 'recovery_token'), ('auth', 'users', 'reauthentication_token'),
         ('auth', 'users', 'confirmation_token'), ('auth', 'users', 'email_change_token_new'),
         ('auth', 'users', 'email_change_token_current'), ('auth', 'users', 'email_change'),
         ('auth', 'users', 'email_change_confirm_status'), ('auth', 'users', 'phone_change_token'),
         ('auth', 'users', 'banned_until'), ('auth', 'users', 'deleted_at'), ('auth', 'users', 'updated_at'),
         ('auth', 'sessions', 'id'), ('auth', 'sessions', 'user_id'),
         ('auth', 'one_time_tokens', 'user_id'), ('auth', 'flow_state', 'user_id'),
         ('auth', 'refresh_tokens', 'user_id'), ('auth', 'refresh_tokens', 'session_id'))
union all
select 'trigger',
       t.tgrelid::regclass::text || '.' || t.tgname,
       pg_get_triggerdef(t.oid)
  from pg_trigger t
 where t.tgrelid in ('public.staff'::regclass, 'auth.users'::regclass, 'auth.sessions'::regclass,
                     'auth.refresh_tokens'::regclass, 'auth.one_time_tokens'::regclass, 'auth.flow_state'::regclass)
   and not t.tgisinternal
 order by 1, 2;
