-- =====================================================================
-- 0020_session_id_claims.sql
-- ---------------------------------------------------------------------
-- WHAT THIS FILE IS
--   A one-function security fix (rulebook v0.408, section 10b "Session id
--   in the history log can't be planted through the public forms"). It
--   REPLACES one live function from 0001: public.current_session_id().
--   Nothing else changes - no table, view, trigger, right or other
--   function. It runs after 0001-0006, 0010, 0011 and 0014 (all live); it
--   only needs 0001 (the function) and 0003 (public.change_log).
--
-- WHY IT EXISTS
--   current_session_id() answers "which sign-in session (device) is
--   this?". The PIN lock, the server lock and every history row
--   (public.change_log.session_id) use its answer.
--   0001's version read the session id through Supabase's auth.jwt().
--   auth.jwt() looks at TWO settings, in this order:
--     1. request.jwt.claim   - an old ("legacy") setting, and
--     2. request.jwt.claims  - the one Supabase's API server really fills
--                              with the signed-in user's login token.
--   The public form functions (Color Belt and Star family forms, Forms,
--   Camps) empty request.jwt.claims and request.jwt.claim.sub before they
--   write, but not the old request.jwt.claim. So whoever holds the family
--   form's database login could put a made-up token there, and a history
--   row written by the form would show a STAFF member's session id. That
--   gives no access (auth.uid() and has_data_access() stay empty), but
--   history must not be fakeable - low severity, fixed anyway.
--   Decision B (Jeffrey, 2026-10-20): read the session id ONLY from
--   request.jwt.claims. That covers every current and future public form
--   without touching any form function.
--
-- WHAT IT DOES
--   Replaces public.current_session_id() with a version that:
--     * reads only request.jwt.claims (never request.jwt.claim);
--     * returns NULL (never an error) when that setting is missing, empty,
--       not valid JSON, has no "session_id", or the session id is not a
--       uuid. "Not valid JSON" is checked with pg_input_is_valid() (built
--       into PostgreSQL 16 and later; Supabase runs 17) BEFORE the text is
--       turned into JSON, so a bad value can't crash the cast - and with
--       it every function that logs a change;
--     * keeps everything else exactly as 0001 made it: language sql,
--       stable, security definer, search_path = '' (empty: every name is
--       written in full, so nobody can slip in a look-alike function), the
--       same owner and the same rights. "create or replace" keeps the
--       owner and the existing rights; the revoke line below is 0001's,
--       repeated word for word. No migration ever granted this function
--       to anyone (checked: grep of every migration), so there is nothing
--       to grant back. The app never calls it directly - only other
--       database functions do.
--   What the app sees: nothing. A real signed-in request has the session
--   id in request.jwt.claims, so the answer is the same uuid as before.
--
-- WORDS USED BELOW
--   * "claims" = the login token's contents as JSON text, e.g.
--     {"sub": "<user id>", "session_id": "<uuid>", "amr": [...]}.
--   * "uuid pattern" = 8-4-4-4-12 hexadecimal characters (upper or lower
--     case), the same check 0001 used; text that fails it gives NULL
--     instead of crashing the ::uuid cast.
--
-- HOW TO RUN IT
--   Supabase dashboard -> SQL Editor -> New query -> paste this WHOLE file
--   -> Run. It starts with "begin;" and ends with "commit;", so it is one
--   transaction: if any statement fails, nothing is kept.
--   This file removes nothing, so Supabase should not show a "destructive
--   operations" warning.
--   Safe to run again: the guard only checks that the earlier objects
--   exist, "create or replace" puts the same function back, and the revoke
--   repeats. A second run changes no row and no fingerprint (tested in
--   PGlite, run.mjs step 19).
--   RE-RUN ORDER: re-running 0001 after this file puts the OLD function
--   back -> re-run this file straight after.
--   Undo: the script in supabase/SETUP.md section 0020e (not here).
-- =====================================================================

begin;


-- ---------------------------------------------------------------------
-- 0. Guard: refuse to run unless the earlier objects exist
-- WHY: this file replaces a 0001 function and is only tested on a
-- database that has 0001-0003. If something is missing, stop with a clear
-- message before anything changes (the transaction keeps nothing).
-- ---------------------------------------------------------------------
do $$
begin
  if to_regprocedure('public.current_session_id()') is null then
    raise exception '0020: public.current_session_id() is missing - apply 0001 first. Nothing was changed.';
  end if;
  if to_regprocedure('auth.jwt()') is null then
    raise exception '0020: auth.jwt() is missing - is this a Supabase database? Nothing was changed.';
  end if;
  if to_regclass('public.change_log') is null then
    raise exception '0020: public.change_log is missing - apply 0003 first. Nothing was changed.';
  end if;
  if to_regprocedure('public.verify_pin(text)') is null
     or to_regprocedure('public.has_data_access()') is null then
    raise exception '0020: verify_pin / has_data_access are missing - apply 0001 and 0002 first. Nothing was changed.';
  end if;
  -- pg_input_is_valid() exists from PostgreSQL 16 on
  if current_setting('server_version_num')::integer < 160000 then
    raise exception '0020 needs PostgreSQL 16 or later (this is %). Nothing was changed.',
      current_setting('server_version');
  end if;
end
$$;


-- ---------------------------------------------------------------------
-- 1. current_session_id() - REPLACED (0001 section 4c)
-- This sign-in session's id from the "session_id" in request.jwt.claims,
-- or NULL if it is missing, not valid JSON, or not a valid uuid.
-- Reads ONLY request.jwt.claims - never the legacy request.jwt.claim that
-- auth.jwt() reads first (see the header).
-- The checks are NESTED "case" steps on purpose: PostgreSQL may evaluate
-- the parts of an "and" in any order, but a "case" only looks at its
-- "then" when its "when" was true. So the text is only turned into JSON
-- after pg_input_is_valid() said it is valid JSON, and only cast to uuid
-- after it matched the uuid pattern. ->> on JSON that is not an object
-- (a list, a number, a string, null) just gives NULL, no error.
-- ---------------------------------------------------------------------
create or replace function public.current_session_id()
returns uuid
language sql
stable
security definer
set search_path = ''
as $$
  select case
           when pg_input_is_valid(c.raw, 'jsonb') then
             case
               when (c.raw::jsonb ->> 'session_id')
                    ~* '^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$'
               then (c.raw::jsonb ->> 'session_id')::uuid
             end
         end   -- no "else" = NULL (also when the setting is missing: raw is NULL)
    from (select nullif(current_setting('request.jwt.claims', true), '') as raw) as c;
$$;

-- 0001's revoke, word for word ("create or replace" kept every right the
-- function already had; this makes sure the app roles still have none).
revoke execute on function public.current_session_id() from public, anon, authenticated;


commit;
