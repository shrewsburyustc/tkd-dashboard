-- =====================================================================
-- 0050_camps_signup_school.sql
-- ---------------------------------------------------------------------
-- WHAT THIS FILE IS
--   The database half of "one QR code and link per school" for a camp
--   that is for both schools (Jeffrey 2026-11-11: "Have separate QR Codes
--   for worcester and shrewsbury even if they are together so there are
--   different rosters"; contract docs/Camps/CONTRACT-0050.md; rulebook
--   v0.757). A family that signs up through a school's link is a camper
--   OF THAT SCHOOL, and the roster follows the school. It runs AFTER 0013,
--   0022, 0027, 0033, 0043 and 0039 (all live) and stops with a clear
--   message if one of them is missing.
--
-- WHY IT EXISTS
--   Today a both-schools camp has ONE family link, so nobody can tell
--   which school a family belongs to. This file gives the camp a second
--   link and stores the school on every sign-up. It is kept small on
--   purpose: the 290-line sign-up core ("camp_public_signup_core") is NOT
--   replaced - the two public functions only look the code up differently
--   and pass the school on in a transaction-local setting, which a small
--   trigger copies into the new column.
--
-- WHAT IT CHANGES
--   1. camp_signups.school - 'worcester' or 'shrewsbury' (a foreign key to
--      public.locations, as camp_payments.school). Existing sign-ups take
--      their camp's stored school (location_code); production has none
--      today. A sign-up's school is for the whole family (all its
--      children) and NEVER changes after it is saved: a trigger puts the
--      old value back on any update (Camps 0033's paying_by_on_form
--      pattern - no version bump, no history row), and no client role can
--      write the table at all. It is not private data, so authenticated
--      may read it (the roster view reads it with the caller's rights).
--   2. camps.public_code_2 - for a camp with both_schools = true, the
--      family link of the school that is NOT the camp's stored school
--      (location_code). public_code (the link already given out) stays
--      and means the stored school. A camp for one school has none. A
--      small trigger makes it (testing_new_public_code, retried until it
--      is unused in BOTH columns) when both_schools becomes true and
--      clears it when it becomes false; once made it never changes while
--      the camp stays both-schools. Same 8-character pattern, unique, and
--      two table rules: it differs from public_code, and it exists exactly
--      when both_schools is true. Every existing both-schools camp gets
--      one in this file. Staff may read it (as public_code); families
--      never see either code or any school - camp_public_camp's answer is
--      word for word what it was.
--      The same trigger refuses two changes that would make a link mean
--      the wrong school: moving a both-schools camp's stored school, and
--      leaving a camp whose sign-ups' schools no longer match its school
--      (a both-schools camp with another school's families can't become a
--      one-school camp; a one-school camp's school can't move under its
--      sign-ups; a one-school camp can't become a both-schools camp and
--      move its school under sign-ups that used its first link), and a
--      code that equals another camp's code in the other column.
--      camp_update_camp already answers "invalid" for a table rule it
--      hits.
--   3. camp_public_camp(p_code) - finds the camp by EITHER code (still
--      not_found for a malformed or unknown one). Same answer.
--   4. camp_public_signup(...) - the family form's function (0043 section
--      4), same 16 inputs and rights (camps_registrar only): finds the
--      camp and the school from the code (public_code = the camp's stored
--      school, public_code_2 = the other one), sets tkd.signup_school for
--      the transaction, calls the UNCHANGED core with the camp's own
--      public_code. The attempts row still records the camp. An unknown
--      code behaves as before (the core answers not_found).
--   5. NEW BEFORE INSERT trigger on camp_signups: school = tkd.signup_school
--      when it is a school code, else the camp's own school (so every other
--      way a sign-up is made - old callers, tests - still gets one); a
--      school other than the camp's own is refused for a camp that isn't
--      for both schools. Nothing a client sends can set it (the core never
--      inserts the column).
--   6. camp_staff_signup(...) - Fill in (0043 section 6) gains a LAST input
--      p_school text default null: blank = the camp's stored school; an
--      unknown school -> {"status":"invalid","field":"school"}; a school
--      other than the camp's own on a camp for one school -> the same.
--      A 15-input call keeps working (the default). Postgres can't add an
--      input to an existing function, so the old 15-input version is
--      REMOVED ("drop function") and the new one made straight after in
--      the same transaction (see HOW TO RUN IT).
--   7. The view camp_roster (0039's) - the same columns in the same order
--      plus ONE at the end: school (the sign-up's). Camper detail's
--      "camper" part is the roster row, so it has it too; camp_camper_detail
--      is NOT replaced. security_invoker and the grant are unchanged.
--   NOT changed: camp_public_signup_core, camp_staff_form,
--   camp_camper_detail, camp_camper_history, camp_add_camp,
--   camp_update_camp, camps_before_write and camp_signups_before_write
--   (0013 / 0022 / 0027 / 0043 code), and every Finance function (they
--   read camp_payments.school and join campers and camps for names; none
--   reads a column this file changes). Nothing is granted to anon,
--   service_role or camps_registrar beyond the two public functions'
--   existing rights.
--
-- HOW TO RUN IT
--   After 0039 (live). Apply it BEFORE the app that reads school /
--   public_code_2 is deployed (the live app keeps working with it: it never
--   names the new columns, its 15-input Fill in call still works, and the
--   family form is unchanged - the only link a family has is the camp's
--   public_code).
--   Supabase dashboard -> SQL Editor -> New query -> paste this WHOLE file
--   -> Run. One transaction ("begin;" ... "commit;"): if any statement
--   fails, nothing is kept.
--   Supabase will warn about destructive operations: ONE line is real -
--   "drop function if exists public.camp_staff_signup(...15 inputs...)",
--   Fill in's Send, made again with 16 inputs right after it in the same
--   transaction (nothing outside this file notices; no data is removed).
--   The other lines the warning may flag are "alter table ... disable
--   trigger" / "enable trigger" (on the first run only, and only when a
--   row needs filling: they keep the one-time fill out of the history and
--   the versions; production has no sign-ups, so the sign-up one is
--   skipped), the "delete" word inside the family form's function (its
--   2-day attempt clean-up, unchanged from 0013) and "drop trigger if
--   exists" lines that make a re-run safe.
--   Safe to run again (tested in PGlite: a second run changes no
--   fingerprint and no row).
--   RE-RUN ORDER: re-running 0043 after this file would bring the old
--   15-input camp_staff_signup back NEXT TO this one (a 15-input call would
--   then be "ambiguous") and 0043's family-form function - re-run 0050
--   straight after it. Re-running 0013, 0033 or 0039 after this file
--   fails on the roster view (it has more columns now), and nothing of
--   them is kept.
-- =====================================================================

begin;


-- ---------------------------------------------------------------------
-- 1. The guard: this file needs 0013, 0022, 0027, 0033, 0043 and 0039.
--    Stops - and changes nothing - if one of them is missing.
-- ---------------------------------------------------------------------
do $$
begin
  if to_regclass('public.camps') is null
     or to_regclass('public.camp_signups') is null
     or to_regclass('public.camp_roster') is null
     or to_regclass('public.locations') is null
     or to_regprocedure('public.has_data_access()') is null
     or to_regprocedure('public.change_log_actor_name()') is null
     or to_regprocedure('public.testing_new_public_code()') is null
     or to_regprocedure('public.camp_public_camp(text)') is null
     or to_regprocedure('public.camp_public_signup(text, text, uuid, jsonb, text, text, text, text, text, text, text, boolean, text, text, text, integer)') is null
     or to_regprocedure('public.camp_public_signup_core(text, text, uuid, jsonb, text, text, text, text, text, text, text, boolean, text, text, text, integer, text, text)') is null then
    raise exception '0050 needs migration 0013 (camps) first';
  end if;
  if to_regprocedure('public.camp_weekly_base_cents(uuid, uuid[], boolean, text)') is null then
    raise exception '0050 needs migration 0022 (camps weekly pricing) first';
  end if;
  if not exists (select 1 from pg_proc p join pg_namespace n on n.oid = p.pronamespace
                  where n.nspname = 'public' and p.proname = 'camp_update_camp'
                    and position('extra_included' in p.prosrc) > 0) then
    raise exception '0050 needs migration 0027 (Edit camp guard) first';
  end if;
  if to_regprocedure('public.camp_camper_history(uuid)') is null then
    raise exception '0050 needs migration 0033 (Camps design review) first';
  end if;
  -- 0043: Fill in (its 15-input camp_staff_signup, or - on a re-run - this file's 16-input one)
  if to_regprocedure('public.camp_staff_form(uuid)') is null
     or (to_regprocedure('public.camp_staff_signup(uuid, uuid, jsonb, text, text, text, text, text, text, text, boolean, text, text, text, integer)') is null
         and to_regprocedure('public.camp_staff_signup(uuid, uuid, jsonb, text, text, text, text, text, text, text, boolean, text, text, text, integer, text)') is null) then
    raise exception '0050 needs migration 0043 (Camps Fill in) first';
  end if;
  if to_regprocedure('public.camp_record_refund(uuid, integer, text, integer, date, text)') is null
     or not exists (select 1 from pg_attribute a
                     where a.attrelid = 'public.camp_roster'::regclass and a.attname = 'refunded_cents'
                       and a.attnum > 0 and not a.attisdropped) then
    raise exception '0050 needs migration 0039 (Camps Record refund) first';
  end if;
end
$$;


-- ---------------------------------------------------------------------
-- 2. camp_signups.school
--   Order matters:
--   a. the column, empty at first ("add column if not exists": a re-run
--      skips it);
--   b. existing sign-ups get their camp's stored school. Only rows still
--      empty are touched (none on a re-run). The two sign-up triggers
--      that bump the version and write a history row are switched off for
--      this one statement, so the fill writes no history row and no
--      version moves (open screens don't go "stale"); they are on again
--      before anything else runs. (The school guard of section 5 is made
--      AFTER the fill, so it isn't in the way.) Skipped when no row needs
--      it - production has no sign-ups;
--   c. then it may never be empty, and must be a school in public.locations
--      (the same foreign key as camp_payments.school: 'worcester' or
--      'shrewsbury');
--   d. the app may read it (0013 lists the sign-up columns one by one; the
--      roster view reads it with the caller's rights).
-- ---------------------------------------------------------------------
alter table public.camp_signups add column if not exists school text null;

do $$
begin
  if exists (select 1 from public.camp_signups s where s.school is null) then
    alter table public.camp_signups disable trigger camp_signups_before_write;
    alter table public.camp_signups disable trigger camp_signups_log;
    update public.camp_signups s
       set school = c.location_code
      from public.camps c
     where c.id = s.camp_id
       and s.school is null;
    alter table public.camp_signups enable trigger camp_signups_before_write;
    alter table public.camp_signups enable trigger camp_signups_log;
  end if;
end
$$;

alter table public.camp_signups alter column school set not null;

do $$
begin
  if not exists (select 1 from pg_constraint c
                  where c.conrelid = 'public.camp_signups'::regclass and c.conname = 'camp_signups_school_fk') then
    alter table public.camp_signups
      add constraint camp_signups_school_fk foreign key (school) references public.locations (code);
  end if;
end
$$;

grant select (school) on public.camp_signups to authenticated;

comment on column public.camp_signups.school is
  'The school the family belongs to (worcester or shrewsbury), from the family link it used (public_code = the camp''s own school, public_code_2 = the other) or from Fill in''s device school. Set when the sign-up is saved (trigger camp_signups_before_school), never changes. 0050.';


-- ---------------------------------------------------------------------
-- 3. camps.public_code_2
--   a. the column, empty at first;
--   b. every existing both-schools camp gets one (made as camp_add_camp
--      makes public_code: testing_new_public_code, retried until it is
--      unused in BOTH columns). The camp triggers that bump the version
--      and write a history row are switched off for the fill, so no row
--      moves. Skipped when no camp needs it (and on a re-run);
--   c. then the rules: the 8-character pattern and "differs from
--      public_code"; "it exists exactly when both_schools is true"; and
--      unique;
--   d. staff may read it, as public_code (the link box shows both).
-- ---------------------------------------------------------------------
alter table public.camps add column if not exists public_code_2 text null;

do $$
declare
  v_id   uuid;
  v_code text;
begin
  if exists (select 1 from public.camps c where c.both_schools and c.public_code_2 is null) then
    alter table public.camps disable trigger camps_before_write;
    alter table public.camps disable trigger camps_log;
    for v_id in select c.id from public.camps c where c.both_schools and c.public_code_2 is null order by c.id loop
      loop
        v_code := public.testing_new_public_code();
        exit when not exists (select 1 from public.camps c where c.public_code = v_code or c.public_code_2 = v_code);
      end loop;
      update public.camps c set public_code_2 = v_code where c.id = v_id;
    end loop;
    alter table public.camps enable trigger camps_before_write;
    alter table public.camps enable trigger camps_log;
  end if;
end
$$;

do $$
begin
  if not exists (select 1 from pg_constraint c
                  where c.conrelid = 'public.camps'::regclass and c.conname = 'camps_public_code_2_key') then
    alter table public.camps add constraint camps_public_code_2_key unique (public_code_2);
  end if;
  if not exists (select 1 from pg_constraint c
                  where c.conrelid = 'public.camps'::regclass and c.conname = 'camps_public_code_2_check') then
    alter table public.camps add constraint camps_public_code_2_check
      check (public_code_2 is null or (public_code_2 ~ '^[a-hjkmnp-z2-9]{8}$' and public_code_2 <> public_code));
  end if;
  if not exists (select 1 from pg_constraint c
                  where c.conrelid = 'public.camps'::regclass and c.conname = 'camps_public_code_2_both_check') then
    alter table public.camps add constraint camps_public_code_2_both_check
      check ((public_code_2 is not null) = both_schools);
  end if;
end
$$;

grant select (public_code_2) on public.camps to authenticated;   -- NOT for anon; families never see it

comment on column public.camps.public_code_2 is
  'The family link (/camp/<code>) of the school that is NOT the camp''s stored school (location_code), for a camp with both_schools = true; empty for a camp for one school. public_code (given out first) means the stored school. Made by the trigger camps_before_public_code_2, never changes while the camp stays both-schools. 0050.';


-- ---------------------------------------------------------------------
-- 4. camps_keep_public_code_2() - BEFORE INSERT OR UPDATE on camps
--   The trigger is called camps_before_public_code_2 so it runs BEFORE
--   0013's camps_before_write (Postgres runs a table's BEFORE triggers in
--   name order: "..._public_code_2" < "..._write"). So 0013's trigger
--   already sees the final public_code_2 when it works out what changed
--   (a both_schools change bumps the version anyway).
--     * both_schools false          -> public_code_2 := null
--     * both_schools true, insert   -> a fresh code (whatever was sent)
--     * both_schools true, update   -> the old code if there is one (it
--                                      never changes), else a fresh one
--     * update that moves the stored school of a camp that is for both
--       schools before AND after   -> refused (check_violation,
--       camps_location_locked): public_code and public_code_2 would swap
--       their schools
--     * update that leaves the camp for one school while a sign-up's
--       school is not the camp's school -> refused (check_violation,
--       camps_school_has_signups)
--     * update that turns a one-school camp into a both-schools camp AND
--       moves its stored school while a sign-up's school is not the NEW
--       stored school -> refused (same constraint name): the link already
--       printed (public_code) would then mean another school than the
--       families who already signed up through it
--     * a public_code equal to ANY other camp's public_code_2, or a
--       public_code_2 equal to any other camp's public_code -> refused
--       (check_violation, camps_public_codes_distinct). The two unique
--       rules each cover one column only; this covers the two together.
--       camp_add_camp (0013) makes its public_code and only checks that
--       column, so in the one-in-31^8 case that it picks another camp's
--       second code, camp_add_camp answers "invalid" and the admin presses
--       Add again - acceptable, and it never saves a clash.
--   A fresh code is retried until it is unused in BOTH columns.
--   Not security definer; nobody may call it (only the trigger runs it).
-- ---------------------------------------------------------------------
create or replace function public.camps_keep_public_code_2()
returns trigger
language plpgsql
set search_path = ''
as $$
declare
  v_code text;
begin
  if tg_op = 'UPDATE' then
    if old.both_schools and new.both_schools and new.location_code is distinct from old.location_code then
      raise exception using
        errcode    = '23514',
        constraint = 'camps_location_locked',
        message    = 'a camp for both schools can''t change its stored school (its two family links would swap schools)';
    end if;
    if not new.both_schools
       and (new.both_schools is distinct from old.both_schools or new.location_code is distinct from old.location_code)
       and exists (select 1 from public.camp_signups s where s.camp_id = new.id and s.school <> new.location_code) then
      raise exception using
        errcode    = '23514',
        constraint = 'camps_school_has_signups',
        message    = 'a sign-up belongs to a school other than this camp''s school';
    end if;
    if new.both_schools and not old.both_schools and new.location_code is distinct from old.location_code
       and exists (select 1 from public.camp_signups s where s.camp_id = new.id and s.school is distinct from new.location_code) then
      raise exception using
        errcode    = '23514',
        constraint = 'camps_school_has_signups',
        message    = 'the camp''s first family link would mean another school than its sign-ups';
    end if;
  end if;

  if not new.both_schools then
    new.public_code_2 := null;
  elsif tg_op = 'UPDATE' and old.public_code_2 is not null then
    new.public_code_2 := old.public_code_2;
  else
    loop
      v_code := public.testing_new_public_code();
      exit when not exists (select 1 from public.camps c where c.public_code = v_code or c.public_code_2 = v_code);
    end loop;
    new.public_code_2 := v_code;
  end if;

  -- the two codes never clash across the two columns (each column is unique on its own)
  if exists (select 1 from public.camps c where c.id <> new.id and c.public_code_2 = new.public_code)
     or (new.public_code_2 is not null
         and exists (select 1 from public.camps c where c.id <> new.id and c.public_code = new.public_code_2)) then
    raise exception using
      errcode    = '23514',
      constraint = 'camps_public_codes_distinct',
      message    = 'a camp''s family code is already another camp''s second code';
  end if;
  return new;
end;
$$;

revoke execute on function public.camps_keep_public_code_2() from public, anon, authenticated, service_role;

drop trigger if exists camps_before_public_code_2 on public.camps;
create trigger camps_before_public_code_2
  before insert or update on public.camps
  for each row execute function public.camps_keep_public_code_2();


-- ---------------------------------------------------------------------
-- 5. camp_signups_set_school() - BEFORE INSERT OR UPDATE on sign-ups
--   The trigger is called camp_signups_before_school so it runs BEFORE
--   0013's camp_signups_before_write ("..._school" < "..._write"):
--     insert: school := the transaction's tkd.signup_school when that is a
--             school in public.locations, else the camp's own school
--             (location_code) - whatever the caller sent. A school other
--             than the camp's own is refused (check_violation,
--             camp_signups_school_for_camp) for a camp that isn't for both
--             schools.
--     update: school := the old value (whatever the caller sent), so an
--             update that only tried to change it is "no change": no
--             version bump, no history row.
--   Not security definer; nobody may call it (only the trigger runs it).
-- ---------------------------------------------------------------------
create or replace function public.camp_signups_set_school()
returns trigger
language plpgsql
set search_path = ''
as $$
declare
  v_loc  text;
  v_both boolean;
  v_want text;
begin
  if tg_op = 'UPDATE' then
    new.school := old.school;
    return new;
  end if;

  select c.location_code, c.both_schools into v_loc, v_both from public.camps c where c.id = new.camp_id;
  if not found then
    return new;   -- no such camp: the foreign key refuses the row
  end if;
  v_want := nullif(current_setting('tkd.signup_school', true), '');
  if v_want is null or not exists (select 1 from public.locations l where l.code = v_want) then
    v_want := v_loc;
  end if;
  if v_want <> v_loc and not v_both then
    raise exception using
      errcode    = '23514',
      constraint = 'camp_signups_school_for_camp',
      message    = 'a camp for one school takes sign-ups for that school only';
  end if;
  new.school := v_want;
  return new;
end;
$$;

revoke execute on function public.camp_signups_set_school() from public, anon, authenticated, service_role;

drop trigger if exists camp_signups_before_school on public.camp_signups;
create trigger camp_signups_before_school
  before insert or update on public.camp_signups
  for each row execute function public.camp_signups_set_school();


-- ---------------------------------------------------------------------
-- 6. camp_public_camp - 0013's 21a, word for word except the line marked
--    "0050": the camp is found by either code. The answer is
--    camp_public_camp_answer's, unchanged (no school, no second code).
-- ---------------------------------------------------------------------
-- 21a. camp_public_camp(p_code) - what the family page shows first (the
-- shape is in 17g). A code that doesn't match the 8-character pattern ->
-- not_found without looking anything up.
create or replace function public.camp_public_camp(p_code text)
returns jsonb
language plpgsql
stable
security definer
set search_path = ''
as $$
declare
  v_id uuid;
begin
  if p_code is null or p_code !~ '^[a-hjkmnp-z2-9]{8}$' then
    return jsonb_build_object('status', 'not_found');
  end if;
  -- 0050: either family link (public_code, or public_code_2 of a both-schools camp)
  select c.id into v_id from public.camps c
   where c.public_code = p_code or (c.public_code_2 = p_code and c.both_schools);
  if not found then
    return jsonb_build_object('status', 'not_found');
  end if;
  return public.camp_public_camp_answer(v_id);
end;
$$;

revoke execute on function public.camp_public_camp(text) from public, anon, authenticated, service_role;
grant  execute on function public.camp_public_camp(text) to camps_registrar;


-- ---------------------------------------------------------------------
-- 7. camp_public_signup - the family form's Sign up (0043 section 4),
--    word for word except the lines marked "0050": the camp and the school
--    come from the code, the school is passed on in tkd.signup_school and
--    the core is called with the camp's own public_code. Same inputs, same
--    rights (camps_registrar only).
-- ---------------------------------------------------------------------
-- 21c. camp_public_signup(...) - the family form's Sign up. Wraps 21b:
--   * first forgets any login token the caller might have set (so nobody
--     can make a form sign-up look like a staff member's), and removes
--     camp_public_attempts rows older than 2 days
--   * (0050) finds the camp and the school from the code: public_code =
--     the camp's stored school, public_code_2 = the other school
--   * runs 21b; if a table rule or a conversion still says no, a lock
--     isn't free within 3 seconds (21b step 0) or the call is cancelled,
--     everything 21b did is undone and the answer is invalid
--   * THEN writes this call's camp_public_attempts row (outcome = the
--     status answered, ok included) - outside the part that can be undone,
--     so EVERY call counts toward the rate limit, bad input included
--   * no signature clean-up here (contract §1.16)
create or replace function public.camp_public_signup(
  p_code                 text,
  p_client_key           text,
  p_submission_id        uuid,
  p_children             jsonb,
  p_parent_name          text,
  p_parent_phone         text,
  p_parent_relation      text,
  p_emergency_name       text,
  p_emergency_phone      text,
  p_emergency_relation   text,
  p_paying_by            text,
  p_acknowledged         boolean,
  p_signature            text,
  p_ack_version          text,
  p_waiver_version       text,
  p_expected_total_cents integer
)
returns jsonb
language plpgsql
volatile
security definer
set search_path = ''
as $$
declare
  v_result jsonb;
  v_camp   uuid;   -- 0050
  v_code   text;   -- 0050: the camp's own public_code (the core looks the camp up by it)
  v_school text;   -- 0050: the school of the link the family used
begin
  perform set_config('request.jwt.claims', '', true);
  perform set_config('request.jwt.claim.sub', '', true);

  delete from public.camp_public_attempts a where a.at < now() - interval '2 days';

  -- 0050: the camp and the school from the code (nothing found: v_code stays
  -- empty and the core is given the code as it came, so it answers not_found)
  if p_code is not null and p_code ~ '^[a-hjkmnp-z2-9]{8}$' then
    select c.id, c.public_code,
           case when c.public_code = p_code then c.location_code
                else (select l.code from public.locations l where l.code <> c.location_code order by l.code limit 1)
           end
      into v_camp, v_code, v_school
      from public.camps c
     where c.public_code = p_code or (c.public_code_2 = p_code and c.both_schools);
  end if;
  perform set_config('tkd.signup_school', coalesce(v_school, ''), true);

  begin
    v_result := public.camp_public_signup_core(coalesce(v_code, p_code), p_client_key, p_submission_id, p_children,
                                               p_parent_name, p_parent_phone, p_parent_relation, p_emergency_name,
                                               p_emergency_phone, p_emergency_relation, p_paying_by, p_acknowledged,
                                               p_signature, p_ack_version, p_waiver_version, p_expected_total_cents,
                                               'form', null);   -- 0043: the family form, nobody's name
  exception
    when unique_violation or foreign_key_violation or check_violation or not_null_violation or data_exception then
      v_result := jsonb_build_object('status', 'invalid');
    when deadlock_detected or serialization_failure or lock_not_available or query_canceled then
      -- query_canceled: the statement_timeout (5 s) or a cancel ran out
      -- inside 21b; caught here so the attempt row below is still written
      v_result := jsonb_build_object('status', 'invalid');
  end;

  perform set_config('tkd.signup_school', '', true);   -- 0050

  insert into public.camp_public_attempts (client_key, camp_id, outcome)
  values (coalesce(left(p_client_key, 200), ''),
          v_camp,   -- 0050: found above by either code (was: by public_code only)
          coalesce(v_result ->> 'status', 'invalid'));

  perform set_config('tkd.actor_label', '', true);
  return v_result;
end;
$$;

revoke execute on function public.camp_public_signup(text, text, uuid, jsonb, text, text, text, text, text, text,
  text, boolean, text, text, text, integer) from public, anon, authenticated, service_role;
grant  execute on function public.camp_public_signup(text, text, uuid, jsonb, text, text, text, text, text, text,
  text, boolean, text, text, text, integer) to camps_registrar;


-- ---------------------------------------------------------------------
-- 8. camp_staff_signup - Fill in's Send (0043 section 6) with ONE more
--    input, last: p_school text default null.
--   The old 15-input version is removed first (see HOW TO RUN IT), then
--   the new one made - the defaults keep a 15-input call meaning exactly
--   what it meant (the camp's own school). Word for word 0043's code
--   except the lines marked "0050".
--   p_school: the school the family belongs to - the app sends This
--   device's school. Blank (null or empty) = the camp's stored school.
--   A school that isn't in public.locations -> {"status":"invalid",
--   "field":"school"}; a school other than the camp's own on a camp that
--   isn't for both schools -> the same. Checked before the core runs, so
--   nothing is written (the answer for a bad camp id, no access or a
--   camp that is over/closed to the desk is still the core's / this
--   function's earlier answer).
-- ---------------------------------------------------------------------
drop function if exists public.camp_staff_signup(uuid, uuid, jsonb, text, text, text, text, text, text, text, boolean,
  text, text, text, integer);

-- 6. camp_staff_signup(...)   S (writes; rulebook v0.740 / v0.741)
--   Fill in's Send (staff and admins; copied from Forms'
--   forms_staff_submit, 0009). The family form's inputs, but the camp by
--   its id and no client key. It runs the SAME core as the family form
--   with 'desk' and the signed-in staff member's name
--   (change_log_actor_name), so:
--     * every family-form rule applies (see the core, 0043);
--     * open -> anyone with access; not open yet / closed -> admins only
--       (others: {"status":"admin_only","signup_state","closes_on"});
--       after the last day -> {"status":"finished"};
--     * the sign-up is saved with source 'desk' and entered_by = the name,
--       logged as that staff member with action camp_staff_signup;
--     * no client-key limit and no camp_public_attempts row;
--     * (0050) the sign-up's school is p_school (blank = the camp's own).
--   Answers: the family form's ok (reference, paying_by,
--   family_total_cents, children, camp - 0022's camp_public_signup_answer),
--   price_changed, camp_changed, invalid (also {"field":"school"}),
--   not_found, finished, admin_only, no_access. A table rule, a conversion
--   or a lock that isn't free within 3 seconds undoes everything the core
--   did and answers invalid (as the family form).
create or replace function public.camp_staff_signup(
  p_camp_id              uuid,
  p_submission_id        uuid,
  p_children             jsonb,
  p_parent_name          text,
  p_parent_phone         text,
  p_parent_relation      text,
  p_emergency_name       text,
  p_emergency_phone      text,
  p_emergency_relation   text,
  p_paying_by            text,
  p_acknowledged         boolean,
  p_signature            text,
  p_ack_version          text,
  p_waiver_version       text,
  p_expected_total_cents integer,
  p_school               text default null   -- 0050
)
returns jsonb
language plpgsql
volatile
security definer
set search_path = ''
as $$
declare
  v_code   text;
  v_loc    text;      -- 0050
  v_both   boolean;   -- 0050
  v_school text;      -- 0050
  v_result jsonb;
begin
  if public.has_data_access() is not true then
    return jsonb_build_object('status', 'no_access');
  end if;
  if p_camp_id is null then
    return jsonb_build_object('status', 'not_found');
  end if;
  select c.public_code, c.location_code, c.both_schools into v_code, v_loc, v_both
    from public.camps c where c.id = p_camp_id;
  if not found then
    return jsonb_build_object('status', 'not_found');
  end if;

  -- 0050: the family's school (blank = the camp's own)
  v_school := coalesce(nullif(p_school, ''), v_loc);
  if not exists (select 1 from public.locations l where l.code = v_school)
     or (v_school <> v_loc and not v_both) then
    return jsonb_build_object('status', 'invalid', 'field', 'school');
  end if;
  perform set_config('tkd.signup_school', v_school, true);

  begin
    v_result := public.camp_public_signup_core(v_code, null, p_submission_id, p_children, p_parent_name,
                                               p_parent_phone, p_parent_relation, p_emergency_name, p_emergency_phone,
                                               p_emergency_relation, p_paying_by, p_acknowledged, p_signature,
                                               p_ack_version, p_waiver_version, p_expected_total_cents,
                                               'desk', left(public.change_log_actor_name(), 200));
                                               -- (the core takes a name of 1-200 characters: a longer
                                               -- staff name is cut, never a reason to refuse)
  exception
    when unique_violation or foreign_key_violation or check_violation or not_null_violation or data_exception then
      v_result := jsonb_build_object('status', 'invalid');
    when deadlock_detected or serialization_failure or lock_not_available or query_canceled then
      -- query_canceled: the statement_timeout or a cancel ran out inside
      -- the core (as camp_public_signup)
      v_result := jsonb_build_object('status', 'invalid');
  end;

  perform set_config('tkd.signup_school', '', true);   -- 0050
  perform set_config('tkd.action', '', true);
  perform set_config('tkd.batch_id', '', true);
  return v_result;
end;
$$;

revoke execute on function public.camp_staff_signup(uuid, uuid, jsonb, text, text, text, text, text, text, text, boolean,
  text, text, text, integer, text) from public, anon, authenticated, service_role;
grant  execute on function public.camp_staff_signup(uuid, uuid, jsonb, text, text, text, text, text, text, text, boolean,
  text, text, text, integer, text) to authenticated;


-- ---------------------------------------------------------------------
-- 9. The roster view again: 0039's section 2, word for word, plus ONE
--    column at the end: school (0050), the sign-up's school. Same options
--    (security_invoker = true: it reads the tables with the CALLER's
--    rights, so RLS and the column rights still apply - authenticated may
--    read camp_signups.school, section 2) and the same grant.
--    "create or replace view" can only add columns at the end.
-- ---------------------------------------------------------------------
create or replace view public.camp_roster
with (security_invoker = true)
as
select c.id,
       c.camp_id,
       c.signup_id,
       c.position,
       c.first_name,
       c.last_name,
       c.age,
       c.member,
       c.paying_by,
       c.status,
       c.withdrawn_reason,
       c.withdrawn_at,
       c.withdrawn_by_name,
       c.duplicate_state,
       c.duplicate_of,
       c.version,
       c.created_at,
       s.version                        as signup_version,
       s.reference,
       s.price_kind,
       s.signed_up_on,
       (s.signed_at is not null)        as signed,
       s.signature_deleted_at,
       c.base_cents,
       coalesce(dy.days, '[]'::jsonb)   as days,
       coalesce(ex.extras, '[]'::jsonb) as extras,
       c.base_cents + coalesce(ex.extras_cents, 0) as total_cents,
       coalesce(t.paid_cents, 0)        as paid_cents,
       c.base_cents + coalesce(ex.extras_cents, 0) - coalesce(t.paid_cents, 0) as owes_cents,
       lp.paid_on,
       lp.method                        as paid_method,
       lp.id                            as last_payment_id,
       lp.recorded_at                   as last_payment_recorded_at,
       c.paying_by_on_form,                                 -- 0033: the family form's choice
       coalesce(rf.refunded_cents, 0)   as refunded_cents,  -- 0039: the refunds that stand
       s.school                                             -- 0050: the family's school (last column)
  from public.camp_campers c
  join public.camp_signups s on s.id = c.signup_id
  left join lateral (select jsonb_agg(jsonb_build_object('day_id', d.id, 'day', d.day,
                                                         'checked_in_at', cd.checked_in_at,
                                                         'checked_in_by_name', cd.checked_in_by_name)
                                      order by d.day) as days
                       from public.camp_camper_days cd
                       join public.camp_days d on d.id = cd.day_id
                      where cd.camper_id = c.id) as dy on true
  left join lateral (select jsonb_agg(jsonb_build_object('extra_id', e.id, 'name', e.name, 'per', e.per,
                                                         'day_id', x.day_id, 'day', d.day,
                                                         'price_cents', x.price_cents)
                                      order by e.sort, d.day nulls first) as extras,
                            sum(x.price_cents)::integer as extras_cents
                       from public.camp_camper_extras x
                       join public.camp_extras e on e.id = x.extra_id
                       left join public.camp_days d on d.id = x.day_id
                      where x.camper_id = c.id) as ex on true
  left join lateral (select sum(p.amount_cents)::integer as paid_cents
                       from public.camp_payments p
                      where p.camper_id = c.id) as t on true
  left join lateral (select p.id, p.paid_on, p.method, p.recorded_at
                       from public.camp_payments p
                      where p.camper_id = c.id
                        and p.kind = 'payment'
                        and not exists (select 1 from public.camp_payments x
                                         where x.reverses_payment_id = p.id)
                      order by p.recorded_at desc, p.id desc
                      limit 1) as lp on true
  -- 0039: the camper's refunds that stand, as a positive number
  left join lateral (select sum(-p.amount_cents)::integer as refunded_cents
                       from public.camp_payments p
                      where p.camper_id = c.id
                        and p.kind = 'refund'
                        and not exists (select 1 from public.camp_payments x
                                         where x.reverses_payment_id = p.id)) as rf on true;

comment on view public.camp_roster is
  'Camp roster rows: camper + sign-up reference + days (check-in) + extras + payment state + the family form''s way to pay (0033) + the refunds that stand (refunded_cents, 0039) + the family''s school (school, 0050). No phones, signature, waiver copy, submission id or login ids. Runs with the caller''s rights.';

revoke all on table public.camp_roster from public, anon, authenticated, service_role;
grant select on public.camp_roster to authenticated;


commit;

-- End of 0050_camps_signup_school.sql
