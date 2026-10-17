-- =====================================================================
-- stubs.sql  (PGlite test harness only - NEVER run this on Supabase)
-- ---------------------------------------------------------------------
-- WHAT THIS FILE IS
--   PGlite is the real PostgreSQL engine compiled to run inside Node.js,
--   with an empty database. Our migrations expect the things Supabase
--   creates in every project before we ever touch it. This file creates
--   small stand-ins ("stubs") for exactly those things, so 0001 -> 0002 ->
--   0003 and their test files can run here just like in the SQL Editor:
--     * the roles anon, authenticated, service_role
--     * the "auth" schema: auth.users, auth.sessions, auth.uid(), auth.jwt()
--     * the "extensions" schema with pgcrypto in it
--     * Supabase's default grants on the public schema
--
-- WHY
--   Testing a migration on a throwaway copy first means a mistake costs
--   nothing; production is touched only once the tests pass (handoff 7).
--
-- HOW CLOSE TO SUPABASE IS IT?
--   auth.uid() and auth.jwt() below read the login token the same way
--   Supabase's own versions do (from the request.jwt.claims setting, which
--   the test files set to pretend to be a signed-in browser). auth.users
--   and auth.sessions keep only the columns our code and tests use.
--   Difference to keep in mind: here "postgres" is a real superuser; on
--   Supabase it is not. Our migrations don't rely on superuser powers.
-- =====================================================================

-- The three API roles Supabase has. "nologin" = nobody signs in as them
-- directly; Supabase's API switches into them per request.
-- service_role skips row level security (that is what the secret key does).
create role anon          nologin noinherit;
create role authenticated nologin noinherit;
create role service_role  nologin noinherit bypassrls;

-- Supabase lets the API roles use the public schema.
grant usage on schema public to anon, authenticated, service_role;

-- Supabase's default: every table, sequence and function that "postgres"
-- creates in public is fully granted to the API roles. 0001 section 11
-- revokes this for anon/authenticated; starting from Supabase's real
-- default here proves that revoke (and our explicit revokes) do the job.
alter default privileges for role postgres in schema public grant all     on tables    to anon, authenticated, service_role;
alter default privileges for role postgres in schema public grant all     on sequences to anon, authenticated, service_role;
alter default privileges for role postgres in schema public grant execute on functions to anon, authenticated, service_role;


-- ---------------------------------------------------------------------
-- extensions schema + pgcrypto (crypt / gen_salt for PIN hashes)
-- ---------------------------------------------------------------------
create schema if not exists extensions;
grant usage on schema extensions to anon, authenticated, service_role;
create extension if not exists pgcrypto with schema extensions;


-- ---------------------------------------------------------------------
-- auth schema (owned by Supabase Auth in a real project)
-- ---------------------------------------------------------------------
create schema if not exists auth;
grant usage on schema auth to anon, authenticated, service_role;

-- One row per login. Only the columns our migrations and tests touch.
create table auth.users (
  id    uuid primary key,
  email text
);

-- One row per sign-in session (device). 0002's session_exists() checks it.
create table auth.sessions (
  id      uuid primary key,
  user_id uuid not null
);

-- auth.uid(): the signed-in user's id ("sub" in the login token), or NULL.
-- Same logic as Supabase's own function.
create or replace function auth.uid()
returns uuid
language sql
stable
as $$
  select coalesce(
    nullif(current_setting('request.jwt.claim.sub', true), ''),
    (nullif(current_setting('request.jwt.claims', true), '')::jsonb ->> 'sub')
  )::uuid;
$$;

-- auth.jwt(): the whole login token as JSON, or NULL.
create or replace function auth.jwt()
returns jsonb
language sql
stable
as $$
  select coalesce(
    nullif(current_setting('request.jwt.claim', true), ''),
    nullif(current_setting('request.jwt.claims', true), '')
  )::jsonb;
$$;

-- On Supabase everyone may call these (row rules run as the caller).
grant execute on function auth.uid() to public, anon, authenticated, service_role;
grant execute on function auth.jwt() to public, anon, authenticated, service_role;
