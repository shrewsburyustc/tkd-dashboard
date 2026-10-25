-- =====================================================================
-- 0023_star_result_texts.sql
-- ---------------------------------------------------------------------
-- WHAT THIS FILE IS
--   The Star testing migration for build phase 6 (Results). Build
--   contract: docs/Dashboard Docs/Build contracts/CONTRACT-0023.md. It
--   runs after 0006 (Star testing, live) and does three things:
--     1. RESULT EMAIL TEXTS that admins edit (rulebook v0.514, mockup
--        TKD-StarTesting-Phase6-Gap-Mockups.html screen R11, proposals
--        42-53): one new table, public.star_result_texts (three rows:
--        passed, makeup_d, makeup_below), seeded with R3's starting
--        texts, and one admin write function,
--        public.star_set_result_text(p_kind, p_expected_version, p_body).
--     2. M5 (Remaining build plan section 4; rulebook v0.504 case 2):
--        public.star_update_event now keeps registration closed IN THE
--        SAME SAVE when the edit would otherwise make registration open
--        again by itself. It replaces only that one 0006 function, with
--        the same arguments, answers, owner and rights.
--     3. THE RESULTS CSV gains three keys per row (phase 6, R8): the
--        candidate id, the date of the newest payment that still counts
--        (paid_on) and, in "sent", which result was sent (result_status).
--        It replaces only public.star_results_csv, with the same
--        arguments, checks, owner and rights.
--   Nothing else of 0006 (or any other migration) changes.
--
-- WHY IT EXISTS
--   1. Staff press "Email result" on the Results tab; the app fills in
--      one of three texts for the candidate and copies it. Jeffrey chose
--      (R3 = B) that admins can change those texts in the dashboard
--      (Rubrics and prices -> Result emails). Staff can read them (they
--      send the emails), nobody in the app can write them except through
--      the admin function, and every change is in the history.
--   2. v0.504: "an edit never reopens registration by itself". Moving a
--      FINISHED event's testing date into the future (switch Open, no
--      closing date) made registration open again. 0006 could only close
--      it with a second call after the save (a finished event can't be
--      closed first), so the family link was open for one round trip - or
--      longer if that second call failed. Now the save itself closes it.
--
-- WHAT IT ADDS / CHANGES
--   * table public.star_result_texts (+ its triggers, RLS rule, column
--     read rights for signed-in staff; nothing for anon or the family
--     form's login star_registrar)
--   * helper public.star_result_text_problem(kind, body) - the text rules
--     (nobody can call it; the table rule and the function use it)
--   * staff function public.star_set_result_text(...) - admins only
--   * public.star_update_event(...) REPLACED (M5)
--   * public.star_results_csv(...) REPLACED (3 more keys per row)
--   * the seed: the three starting texts, tagged 'star_seed' by
--     "Database admin"; it never overwrites a text an admin changed
--
-- WORDS USED BELOW
--   * "blank" = a name in braces, e.g. {first name}, that the app fills
--     in for each candidate. The list and which blanks each text may use
--     are in section 1.
--   * "version", "stale", "lock", "security definer", search_path = '':
--     the same meaning as in 0003, 0005 and 0006 (read their headers).
--
-- HOW TO RUN IT
--   Supabase dashboard -> SQL Editor -> New query -> paste this WHOLE file
--   -> Run. It starts with "begin;" and ends with "commit;", so it is one
--   transaction: if any statement fails, nothing is kept.
--   Supabase may warn about DESTRUCTIVE OPERATIONS: the word delete
--   appears only in the history trigger ("after insert or update or
--   delete" = log removals too, as 0006). Nothing is removed now. Confirm.
--   Undo of the two replaced functions:
--   supabase/manual/0023u_undo_star_update_event.sql
--   (SETUP, Migration 0023, "Undo").
--   Safe to run again: "create table if not exists", "create or replace"
--   for functions and triggers, the read rule made only when missing and
--   then set to its exact definition, rights revoked then granted again,
--   and a seed that never overwrites (tested in PGlite, run.mjs step0023).
--   RE-RUN ORDER: re-running 0006 after this file puts 0006's OLD
--   star_update_event and star_results_csv back -> re-run this file
--   straight after.
-- =====================================================================

begin;


-- ---------------------------------------------------------------------
-- 0. Guard: refuse to run unless 0006 (and what it needs) exists
-- WHY: this file replaces a 0006 function and uses 0006's triggers and
-- 0003's history. If something is missing, stop with a clear message
-- before anything changes (the transaction keeps nothing).
-- ---------------------------------------------------------------------
do $$
begin
  if to_regclass('public.change_log') is null
     or to_regprocedure('public.change_log_write()') is null
     or to_regprocedure('public.testing_refuse_truncate()') is null then
    raise exception '0023: the history (0003) is missing - apply 0003 first. Nothing was changed.';
  end if;
  if to_regclass('public.star_events') is null
     or to_regprocedure('public.star_before_write()') is null
     or to_regprocedure('public.star_event_state(public.star_events, date)') is null
     or to_regprocedure('public.star_update_event(uuid, integer, text, date, time, text, date, text)') is null
     or to_regprocedure('public.star_results_csv(uuid, integer)') is null then
    raise exception '0023: Star testing (0006) is missing - apply 0006 first. Nothing was changed.';
  end if;
  if to_regprocedure('public.has_data_access()') is null or to_regprocedure('public.is_admin()') is null then
    raise exception '0023: has_data_access / is_admin are missing - apply 0001 and 0002 first. Nothing was changed.';
  end if;
end
$$;


-- ---------------------------------------------------------------------
-- 1. star_result_text_problem(kind, body) - the rules for a result text
--    (R11 proposals 46 and 48). Returns NULL when the text is fine, or
--    the FIRST problem found, in this order:
--      'kind'               kind is not passed / makeup_d / makeup_below
--      'empty'              no text at all
--      'too_long'           more than 2,000 characters
--      'bad_character'      a hidden or control character (the same list
--                           as Forms and Testing; a line break is fine)
--      'first_line'         the first line is empty or only spaces (the
--                           empty-email guard, R2 proposal 11)
--      'unknown_blank'      {something} that isn't one of the 12 blanks
--                           (exact spelling and capitals: {Dan}, not {dan})
--      'blank_not_for_kind' a real blank this kind of email can't fill
--      'stray_brace'        a { or } that isn't part of a blank (almost
--                           always a half-typed blank)
--      'missing_required'   {total} or {pass mark} missing (every text,
--                           v0.141), or {subjects to work on} missing in a
--                           make-up text
--    The blanks (proposal 46):
--      every kind:   {first name} {full name} {event} {Dan} {testing day}
--                    {total} {pass mark} {max}
--      passed:       + {star earned}
--      makeup_d:     + {D subjects} {subjects to work on}
--                      {below-pass-mark note}
--      makeup_below: + {subjects to work on}
--    The app checks the same rules as you type (and says which); the
--    database only answers "invalid". Pure (no table reads): immutable.
--    Nobody can call it; it runs inside the table rule and the function.
-- ---------------------------------------------------------------------
create or replace function public.star_result_text_problem(p_kind text, p_body text)
returns text
language plpgsql
immutable
set search_path = ''
as $$
declare
  v_common   text[] := array['first name', 'full name', 'event', 'Dan', 'testing day', 'total', 'pass mark', 'max'];
  v_all      text[] := array['first name', 'full name', 'event', 'Dan', 'testing day', 'total', 'pass mark', 'max',
                             'star earned', 'subjects to work on', 'D subjects', 'below-pass-mark note'];
  v_allowed  text[];
  v_required text[] := array['total', 'pass mark'];
  v_found    text[];
  v_name     text;
  -- hidden / control characters, built with chr() so this file holds no
  -- invisible characters itself: 1-9, 11-31 (line break 10 allowed),
  -- 127-159, zero-width and direction marks, word joiners, the BOM
  v_bad      text := '[' || chr(1) || '-' || chr(9) || chr(11) || '-' || chr(31) || chr(127) || '-' || chr(159)
                     || chr(8203) || '-' || chr(8207) || chr(8234) || '-' || chr(8238)
                     || chr(8288) || '-' || chr(8292) || chr(8294) || '-' || chr(8297) || chr(65279) || ']';
begin
  if p_kind is null or p_kind not in ('passed', 'makeup_d', 'makeup_below') then
    return 'kind';
  end if;
  if p_body is null or p_body = '' then
    return 'empty';
  end if;
  if char_length(p_body) > 2000 then
    return 'too_long';
  end if;
  if p_body ~ v_bad then
    return 'bad_character';
  end if;
  -- (spaces and no-break spaces only = empty)
  if split_part(p_body, chr(10), 1) ~ ('^[ ' || chr(160) || ']*$') then
    return 'first_line';
  end if;

  if p_kind = 'passed' then
    v_allowed := v_common || array['star earned'];
  elsif p_kind = 'makeup_d' then
    v_allowed  := v_common || array['D subjects', 'subjects to work on', 'below-pass-mark note'];
    v_required := v_required || array['subjects to work on'];
  else
    v_allowed  := v_common || array['subjects to work on'];
    v_required := v_required || array['subjects to work on'];
  end if;

  -- every {...} (no braces inside) in the text
  v_found := array(select m[1] from regexp_matches(p_body, '\{([^{}]*)\}', 'g') as m);
  foreach v_name in array v_found loop
    if not (v_name = any (v_all)) then
      return 'unknown_blank';
    end if;
  end loop;
  foreach v_name in array v_found loop
    if not (v_name = any (v_allowed)) then
      return 'blank_not_for_kind';
    end if;
  end loop;
  if regexp_replace(p_body, '\{[^{}]*\}', '', 'g') ~ '[{}]' then
    return 'stray_brace';
  end if;
  foreach v_name in array v_required loop
    if not (v_name = any (v_found)) then
      return 'missing_required';
    end if;
  end loop;
  return null;
end;
$$;

revoke execute on function public.star_result_text_problem(text, text) from public, anon, authenticated, service_role;


-- ---------------------------------------------------------------------
-- 2. public.star_result_texts - the three result email texts (R11)
--    One row per kind; the kind never changes and rows are never added
--    or removed by the app (there is no function for it). House columns
--    and triggers exactly as every edited Star table (contract 0006
--    section 1.8): id (the history's record id), version, created/updated
--    at/by/by_name, set by star_before_write.
--    The subject line is NOT here: it is fixed in the app (v0.248).
-- ---------------------------------------------------------------------
create table if not exists public.star_result_texts (
  id              uuid        not null default gen_random_uuid(),
  kind            text        not null,
  body            text        not null,
  version         integer     not null default 1,
  created_at      timestamptz not null default now(),
  updated_at      timestamptz not null default now(),
  created_by      uuid        null,       -- login id; no foreign key on purpose (as 0003); never granted
  updated_by      uuid        null,
  created_by_name text        not null,   -- set by the trigger
  updated_by_name text        not null,

  constraint star_result_texts_pkey primary key (id),
  constraint star_result_texts_kind_key unique (kind),
  constraint star_result_texts_kind_check check (kind in ('passed', 'makeup_d', 'makeup_below')),
  constraint star_result_texts_body_check check (public.star_result_text_problem(kind, body) is null),
  constraint star_result_texts_version_check check (version >= 1)
);

comment on table public.star_result_texts is
  'Star result email texts (Passed / Make-up with a D / Make-up below the pass mark), with {blanks} the app fills in. Edited by admins only through star_set_result_text.';

-- Triggers (as 0006 section 13l). "create or replace trigger" replaces
-- an existing one, so a re-run is safe.
--   before_write: kind can never change (id too); version + "last
--     changed by" stamped on every real change
--   log: every insert, update and delete goes to change_log (as 0006)
--   no_truncate: no "empty the whole table" shortcut
create or replace trigger star_result_texts_before_write
  before insert or update on public.star_result_texts
  for each row execute function public.star_before_write('id,kind', '');

create or replace trigger star_result_texts_log
  after insert or update or delete on public.star_result_texts
  for each row execute function public.change_log_write();

create or replace trigger star_result_texts_no_truncate
  before truncate on public.star_result_texts
  for each statement execute function public.testing_refuse_truncate();


-- ---------------------------------------------------------------------
-- 3. Security rules: RLS + rights (the same two layers as 0006 section 15)
--   * every signed-in staff member with data access reads every row (the
--     Rubrics and prices tab shows the texts to staff read-only, and
--     Email result fills them in); NOT the login ids
--   * no INSERT / UPDATE / removal rights for anyone in the app: the only
--     way to write is star_set_result_text below
--   * nothing at all for anon, service_role, PUBLIC or the family form's
--     login (star_registrar never had any right on Star tables)
-- ---------------------------------------------------------------------
alter table public.star_result_texts enable row level security;

-- Start from zero (also removes column rights, so re-runs stay clean)...
revoke all on table public.star_result_texts from public, anon, authenticated, service_role;
-- ...then add back exactly what the app reads.
grant select (id, kind, body, version, created_at, updated_at, created_by_name, updated_by_name)
  on public.star_result_texts to authenticated;   -- NOT created_by, updated_by

-- The read rule ("(select ...)" = run the check once per query, not per
-- row). Made only when it is missing, then always set to exactly this
-- definition (so a re-run repairs a changed rule without removing it).
do $$
begin
  if not exists (select 1 from pg_policies p
                  where p.schemaname = 'public' and p.tablename = 'star_result_texts'
                    and p.policyname = 'star_result_texts_select_with_access') then
    create policy star_result_texts_select_with_access
      on public.star_result_texts for select to authenticated
      using ((select public.has_data_access()));
  end if;
end
$$;
alter policy star_result_texts_select_with_access on public.star_result_texts
  to authenticated
  using ((select public.has_data_access()));


-- ---------------------------------------------------------------------
-- 4. The seed: R3's three starting texts, word for word, with the names
--    and numbers turned into blanks (R11 proposal 46). Written as the SQL
--    Editor's role, tagged 'star_seed', by "Database admin" (as 0006
--    section 13m). It NEVER overwrites: a kind that exists (an admin may
--    have changed it) is left alone ("on conflict do nothing").
--    Each text is one line here; \n is a line break (E'...' strings), so
--    the file's own line endings can never get into a text.
--    The apostrophes are typographic (U+2019), as drawn in R3.
-- ---------------------------------------------------------------------
select set_config('request.jwt.claims', '', true);
select set_config('tkd.actor_label', 'Database admin', true);
select set_config('tkd.action', 'star_seed', true);
select set_config('tkd.batch_id', gen_random_uuid()::text, true);

insert into public.star_result_texts (kind, body, created_by_name, updated_by_name)
values
  ('passed',
   E'Hello,\n\n{full name} passed the {event} ({Dan}) {testing day}, with a total of {total} out of {max}, and earns {star earned}. Congratulations, {first name}!\n\nThe pass mark is {pass mark} out of {max}, with no D in any subject.\n\nThank you for all the hard work. If you have any questions, please contact the school.\n\nJae H. Jeong’s U.S. Taekwondo Center\nWorcester and Shrewsbury',
   '', ''),
  ('makeup_d',
   E'Hello,\n\n{full name} took the {event} ({Dan}) {testing day}, with a total of {total} out of {max}. {first name} has a make-up to do before earning the next star.\n\nThe pass mark is {pass mark} out of {max}, with no D in any subject. {first name} received a D in {D subjects}. {below-pass-mark note}\n\nWhat to work on: {subjects to work on}. Every other grade is kept.\n\nWe’ll let you know how and when the make-up happens. If you have any questions, please contact the school.\n\nJae H. Jeong’s U.S. Taekwondo Center\nWorcester and Shrewsbury',
   '', ''),
  ('makeup_below',
   E'Hello,\n\n{full name} took the {event} ({Dan}) {testing day}, with a total of {total} out of {max}. {first name} has a make-up to do before earning the next star.\n\nThe pass mark is {pass mark} out of {max}, with no D in any subject. {first name}’s total is below the pass mark.\n\nWhat to work on: {subjects to work on}. Every other grade is kept.\n\nWe’ll let you know how and when the make-up happens. If you have any questions, please contact the school.\n\nJae H. Jeong’s U.S. Taekwondo Center\nWorcester and Shrewsbury',
   '', '')
on conflict (kind) do nothing;

select set_config('tkd.actor_label', '', true);
select set_config('tkd.action', '', true);
select set_config('tkd.batch_id', '', true);


-- ---------------------------------------------------------------------
-- 5. star_set_result_text(p_kind, p_expected_version, p_body)   A
-- Save one result email text (R11 "Edit result email" -> Save; also the
-- toast's Undo, which saves the old text back). Admins only.
-- Checks, in this order (contract 0006 section 1.1):
--   1 no data access                -> no_access
--   2 not an admin                  -> not_allowed
--   3 a null argument, or the text breaks a rule of section 1 (kind,
--     empty, first line, > 2,000 characters, hidden characters, a blank
--     not on the list or not for this kind, a stray brace, a required
--     blank missing)                -> invalid
--   4 the row is missing            -> not_found (can't happen through
--                                      the app: the rows are seeded)
--   5 the version isn't the one the dialog opened with -> stale
--   8 save it (the trigger bumps the version and logs before -> after,
--     action 'star_set_result_text'). The same text again writes
--     nothing, bumps nothing and logs nothing (still ok).
-- The text is stored exactly as sent (no trimming), so what the admin
-- saw in the preview is what families get.
-- Changing a text never changes "Sent" (R11 proposal 52): star_sent_state
-- compares results, not wording.
-- locks: the text row (update). It touches no event, candidate or Dan
-- row, so it can't wait in a circle with any other Star write.
-- Ok: {"status":"ok","version":n,"body":"<the saved text>"}
-- ---------------------------------------------------------------------
create or replace function public.star_set_result_text(
  p_kind             text,
  p_expected_version integer,
  p_body             text
)
returns jsonb
language plpgsql
volatile
security definer
set search_path = ''
as $$
declare
  v_t          public.star_result_texts;
  v_version    integer;
begin
  begin
    if public.has_data_access() is not true then
      return jsonb_build_object('status', 'no_access');
    end if;
    if public.is_admin() is not true then
      return jsonb_build_object('status', 'not_allowed');
    end if;

    if p_kind is null or p_expected_version is null or p_body is null
       or public.star_result_text_problem(p_kind, p_body) is not null then
      return jsonb_build_object('status', 'invalid');
    end if;

    select * into v_t from public.star_result_texts t where t.kind = p_kind for update;
    if not found then
      return jsonb_build_object('status', 'not_found');
    end if;
    if v_t.version <> p_expected_version then
      return jsonb_build_object('status', 'stale');
    end if;

    perform set_config('tkd.action', 'star_set_result_text', true);
    perform set_config('tkd.batch_id', gen_random_uuid()::text, true);

    update public.star_result_texts t
       set body = p_body
     where t.kind = p_kind
       and t.body is distinct from p_body
    returning t.version into v_version;

    perform set_config('tkd.action', '', true);
    perform set_config('tkd.batch_id', '', true);

    return jsonb_build_object('status', 'ok', 'version', coalesce(v_version, v_t.version), 'body', p_body);
  exception
    -- (0006 section 1.4's mapping, minus duplicate_name: this table has
    -- no name rule, so any unique violation is a race -> stale)
    when unique_violation then
      return jsonb_build_object('status', 'stale');
    when foreign_key_violation or check_violation or not_null_violation then
      return jsonb_build_object('status', 'invalid');
    when deadlock_detected or serialization_failure or lock_not_available then
      return jsonb_build_object('status', 'stale');
  end;
end;
$$;

revoke execute on function public.star_set_result_text(text, integer, text) from public, anon, authenticated, service_role;
grant  execute on function public.star_set_result_text(text, integer, text) to authenticated;


-- ---------------------------------------------------------------------
-- 6. star_update_event(...) - REPLACED (0006 section 18i; M5)
-- Identical to 0006's version - same arguments, checks, answers, owner
-- and rights - except ONE addition (rulebook v0.504, "an edit never
-- reopens registration by itself"):
--   the event's registration state is worked out before the save and as
--   it would be after it (star_event_state, today in Massachusetts). If
--   it was NOT open and the new dates would make it open - which only
--   happens with the switch Open:
--     case 1: an upcoming event closed by its passed closing date, and
--             the edit removes that date or sets a later one
--     case 2: a finished event moved into the future (no closing date,
--             or one still to come)
--   then the same update also turns the switch to Closed. One write, one
--   version bump, one history row (before -> after shows
--   registration_open true -> false), all in this one call. Opening stays
--   by hand (Open registration in the ... menu).
-- The answer is unchanged ({"status":"ok","version":n}); the app already
-- knows when this happens (starEventRules.editWouldReopen) and shows
-- "Registration stays closed". Its second call (star_set_registration
-- with Open = false) now finds the switch already closed: no write, ok.
-- Everything else as 0006:
--   testing date: a CHANGED date must be today or later (a past event may
--     keep its date; moving it into the future makes it Upcoming again)
--   closing date: a CHANGED one must not be in the past; any closing date
--     must be on or before the (new) testing date
--   The Registration switch is NOT an argument (the dialog calls
--   star_set_registration when the switch changed). The event's copy of
--   the rubrics is never touched. Same values -> nothing written.
-- locks: the event (update)
-- Ok: {"status":"ok","version":n}
-- ---------------------------------------------------------------------
create or replace function public.star_update_event(
  p_event_id         uuid,
  p_expected_version integer,
  p_name             text,
  p_testing_date     date,
  p_start_time       time,
  p_where_code       text,
  p_auto_close_on    date,
  p_note             text
)
returns jsonb
language plpgsql
volatile
security definer
set search_path = ''
as $$
declare
  v_today       date;
  v_name        text;
  v_note        text;
  v_e           public.star_events;
  v_after       public.star_events;   -- the event as it would be after the save (M5)
  v_keep_closed boolean := false;     -- M5: this save also turns the switch to Closed
  v_version     integer;
  v_constraint  text;
begin
  begin
    if public.has_data_access() is not true then
      return jsonb_build_object('status', 'no_access');
    end if;
    if public.is_admin() is not true then
      return jsonb_build_object('status', 'not_allowed');
    end if;

    v_today := public.testing_today();
    v_name  := public.testing_normalize_name(p_name);
    v_note  := public.testing_normalize_note(p_note);
    if p_event_id is null or p_expected_version is null
       or not public.testing_name_is_valid(p_name)
       or p_testing_date is null
       or not public.star_start_time_is_valid(p_start_time)
       or p_where_code is null
       or not exists (select 1 from public.locations l where l.code = p_where_code)
       or (v_note is not null and not public.testing_note_is_valid(v_note)) then
      return jsonb_build_object('status', 'invalid');
    end if;

    select * into v_e from public.star_events e where e.id = p_event_id for update;
    if not found then
      return jsonb_build_object('status', 'not_found');
    end if;
    if v_e.version <> p_expected_version then
      return jsonb_build_object('status', 'stale');
    end if;

    if p_testing_date is distinct from v_e.testing_date and p_testing_date < v_today then
      return jsonb_build_object('status', 'invalid');
    end if;
    if p_auto_close_on is distinct from v_e.auto_close_on and p_auto_close_on is not null
       and p_auto_close_on < v_today then
      return jsonb_build_object('status', 'invalid');
    end if;
    if p_auto_close_on is not null and p_auto_close_on > p_testing_date then
      return jsonb_build_object('status', 'invalid');
    end if;

    if exists (select 1 from public.star_events e
                where e.id <> p_event_id
                  and lower(public.testing_normalize_name(e.name)) = lower(v_name)) then
      return jsonb_build_object('status', 'duplicate_name');
    end if;

    -- M5 (v0.504): would these dates make registration open again by
    -- themselves? (Not open before, open after -> keep it closed.)
    v_after := v_e;
    v_after.testing_date  := p_testing_date;
    v_after.auto_close_on := p_auto_close_on;
    v_keep_closed := public.star_event_state(v_e, v_today) <> 'open'
                     and public.star_event_state(v_after, v_today) = 'open';

    perform set_config('tkd.action', 'star_update_event', true);
    perform set_config('tkd.batch_id', gen_random_uuid()::text, true);

    update public.star_events e
       set name              = v_name,
           testing_date      = p_testing_date,
           start_time        = p_start_time,
           where_code        = p_where_code,
           auto_close_on     = p_auto_close_on,
           note              = v_note,
           registration_open = case when v_keep_closed then false else e.registration_open end
     where e.id = p_event_id
       and (e.name is distinct from v_name
            or e.testing_date is distinct from p_testing_date
            or e.start_time is distinct from p_start_time
            or e.where_code is distinct from p_where_code
            or e.auto_close_on is distinct from p_auto_close_on
            or e.note is distinct from v_note
            or v_keep_closed)
    returning e.version into v_version;

    perform set_config('tkd.action', '', true);
    perform set_config('tkd.batch_id', '', true);

    return jsonb_build_object('status', 'ok', 'version', coalesce(v_version, v_e.version));
  exception
    when unique_violation then
      get stacked diagnostics v_constraint = constraint_name;
      if v_constraint in ('star_events_lower_name_idx', 'star_categories_dan_lower_name_idx') then
        return jsonb_build_object('status', 'duplicate_name');
      end if;
      return jsonb_build_object('status', 'stale');
    when foreign_key_violation or check_violation or not_null_violation then
      return jsonb_build_object('status', 'invalid');
    when deadlock_detected or serialization_failure or lock_not_available then
      return jsonb_build_object('status', 'stale');
  end;
end;
$$;

-- 0006's rights, word for word ("create or replace" kept them; this makes
-- sure they are exactly these).
revoke execute on function public.star_update_event(uuid, integer, text, date, time, text, date, text) from public, anon, authenticated, service_role;
grant  execute on function public.star_update_event(uuid, integer, text, date, time, text, date, text) to authenticated;


-- ---------------------------------------------------------------------
-- 7. star_results_csv(p_event_id, p_dan) - REPLACED (0006 section 18zd)
--    A   (volatile: it writes the download log)
-- Identical to 0006's version - same arguments, checks, statuses, owner,
-- rights, row order, and the download row written FIRST - except that
-- each row has THREE MORE KEYS (phase 6, R8 proposal 34), so the app no
-- longer has to match CSV rows to star_roster by their values (two
-- candidates can look the same):
--   candidate_id  the candidate's id
--   paid_on       the date of the newest payment that still counts:
--                 kind 'payment' and not reversed; refunds and reversals
--                 never change it; null when there is none. The SAME rule
--                 as star_roster's paid_on (newest by recorded_at), so the
--                 CSV and the Candidates tab always agree.
--   sent.result_status  inside "sent": which result that send was for
--                 ('passed' / 'makeup'), next to marked_at, marked_by_name
--                 and matches - for "Not sent yet (Make-up sent ...)".
-- The answer is jsonb, so extra keys don't break a reader that ignores
-- them.
-- The results CSV (v0.144): every ACTIVE candidate of the event (p_dan
-- NULL) or of one Dan, in belt order (Dan, star, school Shrewsbury then
-- Worcester, last name, first name), with raw values incl. DOB and email.
-- A refused call writes nothing; if anything fails after the download row
-- the whole call - log row included - is undone and only a status comes
-- back. No action tag: it writes star_downloads, not change_log.
-- locks: none (the event is only read)
-- Ok: {"status":"ok","rows":[{candidate_id, dan, first_name, last_name,
--      location_code, stars_from, stars_to, date_of_birth,
--      email_for_results, paying_by, is_makeup, paid, paid_cents, paid_on,
--      classes_attended, assistant_classes, total, result_status, needs,
--      sent: null | {marked_at, marked_by_name, result_status, matches}}]}
-- ---------------------------------------------------------------------
create or replace function public.star_results_csv(
  p_event_id uuid,
  p_dan      integer
)
returns jsonb
language plpgsql
volatile
security definer
set search_path = ''
as $$
declare
  v_e    public.star_events;
  v_n    integer;
  v_rows jsonb;
begin
  begin
    if public.has_data_access() is not true then
      return jsonb_build_object('status', 'no_access');
    end if;
    if public.is_admin() is not true then
      return jsonb_build_object('status', 'not_allowed');
    end if;

    if p_event_id is null or (p_dan is not null and p_dan < 1) then
      return jsonb_build_object('status', 'invalid');
    end if;

    select * into v_e from public.star_events e where e.id = p_event_id;
    if not found then
      return jsonb_build_object('status', 'not_found');
    end if;
    if p_dan is not null
       and not exists (select 1 from public.star_event_dans d where d.event_id = p_event_id and d.dan = p_dan) then
      return jsonb_build_object('status', 'invalid');
    end if;

    select count(*) into v_n from public.star_candidates c
     where c.event_id = p_event_id and c.status = 'active' and (p_dan is null or c.dan = p_dan);

    insert into public.star_downloads (event_id, event_name, dan, row_count, downloaded_at, downloaded_by, downloaded_by_name)
    values (p_event_id, v_e.name, p_dan, v_n, now(), auth.uid(), public.change_log_actor_name());

    select coalesce(jsonb_agg(x.row order by x.dan, x.stars_from, x.loc_order, x.last_key, x.first_key, x.id), '[]'::jsonb)
      into v_rows
      from (select c.id, c.dan, c.stars_from,
                   case c.location_code when 'shrewsbury' then 0 else 1 end as loc_order,
                   lower(c.last_name) as last_key, lower(c.first_name) as first_key,
                   jsonb_build_object(
                     'candidate_id',      c.id,
                     'dan',               c.dan,
                     'first_name',        c.first_name,
                     'last_name',         c.last_name,
                     'location_code',     c.location_code,
                     'stars_from',        c.stars_from,
                     'stars_to',          c.stars_from + 1,
                     'date_of_birth',     c.date_of_birth,
                     'email_for_results', c.email_for_results,
                     'paying_by',         c.paying_by,
                     'is_makeup',         c.is_makeup,
                     'paid',              public.star_net_paid_cents(c.id) > 0,
                     'paid_cents',        public.star_net_paid_cents(c.id),
                     'paid_on',           lp.paid_on,
                     'classes_attended',  c.classes_attended,
                     'assistant_classes', c.assistant_classes,
                     'total',             r.res -> 'total',
                     'result_status',     r.res -> 'status',
                     'needs',             r.res -> 'needs',
                     'sent',              case when s.st -> 'sent' = 'null'::jsonb then null
                                               else jsonb_build_object('marked_at', s.st -> 'sent' -> 'marked_at',
                                                                       'marked_by_name', s.st -> 'sent' -> 'marked_by_name',
                                                                       'result_status', s.st -> 'sent' -> 'result_status',
                                                                       'matches', s.st -> 'matches') end) as row
              from public.star_candidates c
              cross join lateral (select public.star_candidate_result(c.id) as res) as r
              cross join lateral (select public.star_sent_state(c.id, r.res) as st) as s
              -- the newest payment that still counts (star_roster's rule)
              left join lateral (select p.paid_on
                                   from public.star_payments p
                                  where p.candidate_id = c.id
                                    and p.kind = 'payment'
                                    and not exists (select 1 from public.star_payments rv
                                                     where rv.reverses_payment_id = p.id)
                                  order by p.recorded_at desc, p.id desc
                                  limit 1) as lp on true
             where c.event_id = p_event_id and c.status = 'active' and (p_dan is null or c.dan = p_dan)) as x;

    return jsonb_build_object('status', 'ok', 'rows', v_rows);
  exception
    -- the same mapping as 0006's: a rare table rule or lock problem
    -- answers a status instead of an error, and everything this call did
    -- (its download row) is undone
    when unique_violation then
      return jsonb_build_object('status', 'stale');
    when foreign_key_violation or check_violation or not_null_violation then
      return jsonb_build_object('status', 'invalid');
    when deadlock_detected or serialization_failure or lock_not_available then
      return jsonb_build_object('status', 'stale');
  end;
end;
$$;

-- 0006's rights, word for word
revoke execute on function public.star_results_csv(uuid, integer) from public, anon, authenticated, service_role;
grant  execute on function public.star_results_csv(uuid, integer) to authenticated;


commit;
