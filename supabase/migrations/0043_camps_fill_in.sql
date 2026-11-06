-- =====================================================================
-- 0043_camps_fill_in.sql
-- ---------------------------------------------------------------------
-- WHAT THIS FILE IS
--   The database half of Camps "Fill in" (rulebook v0.740 = when it works,
--   v0.741 = the screens and words; plan docs/Camps/TKD-Camps-FillIn-Plan.md;
--   contract docs/Camps/CONTRACT-0043.md). Staff sign up a walk-in family
--   at the desk: the camp's own family form opens inside the dashboard,
--   the parent signs the waiver on the screen, and the sign-up is marked
--   "Entered by" the staff member. It runs AFTER 0013, 0022, 0027 and 0033
--   (all live) and stops with a clear message if one of them is missing.
--
-- WHY IT EXISTS
--   A family that walks in and can't fill in the online form still has to
--   be signed up by the SAME rules as the form (prices for today's date,
--   age range, extras rules, the duplicate check, up to 3 children, the
--   waiver). So the desk path runs the very same inside function as the
--   family form ("the core"), not a copy of it: the rules can't drift.
--   v0.740 (answer "C") decides when it works:
--     * family sign-up OPEN                -> staff and admins
--     * not open yet / closed by hand / past the closing date
--                                          -> admins only (staff get
--                                             "admin_only")
--     * after the camp's last day          -> nobody ("finished")
--   The online family form stays closed whatever the desk does.
--
-- WHAT IT CHANGES
--   1. Two new columns on camp_signups:
--      * source text not null default 'form' - 'form' (the family form)
--        or 'desk' (Fill in). Every existing sign-up becomes 'form' (the
--        default; adding a column with a default writes no history row and
--        moves no version).
--      * entered_by text null - the staff member's name for a desk
--        sign-up, empty for the family form. Rule: a desk sign-up always
--        has a name, a form sign-up never has one.
--      0013's history trigger for sign-ups (camp_signups_log) copies the
--      whole row, so both columns reach the history by themselves - that
--      function is NOT changed. No read right is added: the app gets them
--      through Camper detail and History (below).
--   2. camp_public_signup_core (0022's version) gets two more inputs, last:
--        p_source text default 'form', p_entered_by text default null
--      Postgres can't add inputs to an existing function, so the old
--      16-input version is REMOVED ("drop function") and the new one made
--      in the same transaction. The defaults keep a 16-input call meaning
--      exactly what it meant (the family form). For p_source = 'desk':
--        * no client key and no per-client limit (30 tries an hour) - the
--          staff path has no client key, as Forms' staff Fill in has none
--          (0009 forms_staff_submit) - and no camp_public_attempts row;
--        * not open yet / closed / past the closing date -> allowed only
--          for an admin, else {"status":"admin_only","signup_state",
--          "closes_on"}; after the last day -> {"status":"finished"};
--        * the write is tagged tkd.action = 'camp_staff_signup', made as
--          the signed-in staff member (never "Family form"), and saves
--          source = 'desk', entered_by = their name.
--      Every other check is the same for both: the children's shape, a
--      repeated submission id answers the first answer again, the waiver
--      version, ages, extras rules, camp_changed, price_changed, the
--      duplicate check, the answer.
--   3. camp_public_signup (0013, the family form's own function) - same
--      inputs and rights; only its call of the core now ends with
--      'form', null. The family form behaves exactly as before.
--   4. NEW camp_staff_form(p_camp_id uuid) - what the Fill in dialog needs
--      to draw the camp's family form: exactly camp_public_camp's answer
--      (the same internal helper, camp_public_camp_answer, builds it) plus
--      fill_in ('open' / 'admin_only' / 'finished'), signup_state,
--      closes_on and closed_by_hand. Read only, not logged.
--   5. NEW camp_staff_signup(p_camp_id uuid, ...) - Fill in's Send: the
--      family form's inputs, the camp by id, no client key. Runs the core
--      with 'desk' and the staff member's name (copied from Forms'
--      forms_staff_submit, 0009).
--   6. camp_camper_detail (0022's version) - same inputs and rights; the
--      answer gains "source" and "entered_by" (of the camper's sign-up).
--   camp_camper_history (0033) is NOT changed: it already returns the
--   sign-up's history rows, whose actor_name is the staff member for a
--   desk sign-up and whose "after" holds source and entered_by (tested).
--   Nothing is granted to anon, service_role or camps_registrar. No
--   Finance change (Fill in takes no payment).
--
-- HOW TO RUN IT
--   After 0033 (live). Apply it BEFORE the app version with Fill in is
--   deployed (the live app keeps working with it: it never calls the core,
--   and the family form's function keeps its inputs and answers).
--   Supabase dashboard -> SQL Editor -> New query -> paste this WHOLE file
--   -> Run. One transaction ("begin;" ... "commit;"): if any statement
--   fails, nothing is kept.
--   Supabase will warn about destructive operations: ONE line is real on
--   the first run - "drop function if exists
--   public.camp_public_signup_core(...16 inputs...)", the old core, made
--   again with 18 inputs right after it in the same transaction. Nobody
--   can call the core (it has no rights), so nothing outside this file
--   notices. No data is removed.
--   Safe to run again (tested in PGlite: a second run changes no
--   fingerprint and no row).
--   RE-RUN ORDER: re-running 0013 or 0022 after this file would bring the
--   old 16-input core back NEXT TO this one (a 16-input call would then be
--   "ambiguous") and the old family-form function and Camper detail -
--   re-run 0043 straight after either.
-- =====================================================================

begin;


-- ---------------------------------------------------------------------
-- 1. The guard: this file needs 0013, 0022, 0027 and 0033. Stops - and
--    changes nothing - if one of them is missing.
-- ---------------------------------------------------------------------
do $$
begin
  if to_regclass('public.camp_signups') is null
     or to_regclass('public.camp_public_attempts') is null
     or to_regprocedure('public.has_data_access()') is null
     or to_regprocedure('public.is_admin()') is null
     or to_regprocedure('public.change_log_actor_name()') is null
     or to_regprocedure('public.testing_today()') is null
     or to_regprocedure('public.camp_signup_state(uuid, date)') is null
     or to_regprocedure('public.camp_public_camp_answer(uuid)') is null
     or to_regprocedure('public.camp_public_signup_answer(uuid)') is null
     or to_regprocedure('public.camp_public_signup(text, text, uuid, jsonb, text, text, text, text, text, text, text, boolean, text, text, text, integer)') is null then
    raise exception '0043 needs migration 0013 (camps) first';
  end if;
  if to_regprocedure('public.camp_weekly_base_cents(uuid, uuid[], boolean, text)') is null then
    raise exception '0043 needs migration 0022 (camps weekly pricing) first';
  end if;
  if not exists (select 1 from pg_proc p join pg_namespace n on n.oid = p.pronamespace
                  where n.nspname = 'public' and p.proname = 'camp_update_camp'
                    and position('extra_included' in p.prosrc) > 0) then
    raise exception '0043 needs migration 0027 (Edit camp guard) first';
  end if;
  if to_regprocedure('public.camp_camper_history(uuid)') is null then
    raise exception '0043 needs migration 0033 (Camps design review) first';
  end if;
end
$$;


-- ---------------------------------------------------------------------
-- 2. camp_signups.source and camp_signups.entered_by
--   "add column if not exists": a re-run skips them. The default fills
--   every existing row with 'form' (and entered_by stays empty) without
--   running any trigger: no history row, no version moves.
--   The two rules are added only if they aren't there yet (a re-run finds
--   them).
-- ---------------------------------------------------------------------
alter table public.camp_signups add column if not exists source     text not null default 'form';
alter table public.camp_signups add column if not exists entered_by text null;

do $$
begin
  if not exists (select 1 from pg_constraint c
                  where c.conrelid = 'public.camp_signups'::regclass and c.conname = 'camp_signups_source_check') then
    alter table public.camp_signups
      add constraint camp_signups_source_check check (source in ('form', 'desk'));
  end if;
  -- a desk sign-up always names who entered it; a form sign-up never does
  if not exists (select 1 from pg_constraint c
                  where c.conrelid = 'public.camp_signups'::regclass and c.conname = 'camp_signups_entered_by_check') then
    alter table public.camp_signups
      add constraint camp_signups_entered_by_check check ((source = 'desk') = (entered_by is not null));
  end if;
end
$$;

comment on column public.camp_signups.source is
  'Where the sign-up came from: form (the family form) or desk (Fill in, 0043).';
comment on column public.camp_signups.entered_by is
  'The staff member''s name for a desk sign-up (Fill in, 0043); empty for the family form.';


-- ---------------------------------------------------------------------
-- 3. The core with two more inputs
--   The old 16-input version goes first (see HOW TO RUN IT), then the new
--   one. Word for word 0022's code except the lines marked "0043".
-- ---------------------------------------------------------------------
drop function if exists public.camp_public_signup_core(text, text, uuid, jsonb, text, text, text, text, text, text,
  text, boolean, text, text, text, integer);

-- 21b. camp_public_signup_core(...) - the inside of 21c and of Fill in
-- (internal; nobody can call it). Steps, in this order (contract §1.16;
-- 0043: CONTRACT-0043):
--   1. the camp by its code                            -> not_found
--      (0043) where it comes from: p_source 'form' with no p_entered_by,
--      or 'desk' with one                              -> invalid
--   2. the children list's shape (1j), before any conversion -> invalid
--   3. this submission_id already signed up FOR THIS CAMP -> the same ok
--      answer again (a double tap or a retry never makes two); for
--      ANOTHER camp -> invalid (never its details)
--   4. lock the camp, read it again
--   5. the state right now. The family form: not_open (+ opens_on) /
--      closed (+ closed_on, null when closed by hand) / finished.
--      (0043) The desk: finished -> finished; not open yet / closed ->
--      only an admin goes on, anyone else gets admin_only (+ signup_state,
--      closes_on) (v0.740 C)
--   6. the other input: client key (the family form only - 0043),
--      names, phones, relationships, paying by, the tick, the signature,
--      the wording version, the waiver version, the expected total
--                                                      -> invalid
--   7. rate limit (the family form only - 0043): 30 tries from this
--      client key in the last hour (in camp_public_attempts only) ->
--      rate_limited. 200 tries for this camp in the last hour is only
--      written to the database log
--   8. the camp changed while the family filled in the form: a day or
--      extra id that isn't this camp's (any more), an extra chosen on a
--      day it is no longer offered on (only_on), an age outside the
--      camp's CURRENT range, or a different waiver ->
--      {"status":"camp_changed","camp": <the camp_public_camp answer>}
--   9. the extra rules (19c)                           -> invalid
--  10. the prices at today's early / regular, each week priced on its own
--      and added up (0022, R3, 2b); a child over $10,000 (0022: was $2,000) ->
--      invalid; a family total different from what the page showed ->
--      {"status":"price_changed","new_total_cents","old_total_cents","camp"}
--  11. the write, by "Family form" - (0043) or, from the desk, by the
--      signed-in staff member, tagged camp_staff_signup, with source and
--      entered_by: sign-up (with the waiver copy), campers, day rows,
--      extra rows with their prices, possible-duplicate marks (silent). A
--      concurrent call with the same submission_id that hits the unique
--      rule is answered like step 3.
--  12. the ok answer (17h)
create or replace function public.camp_public_signup_core(
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
  p_expected_total_cents integer,
  p_source               text default 'form',   -- 0043
  p_entered_by           text default null      -- 0043
)
returns jsonb
language plpgsql
volatile
set search_path = ''
as $$
declare
  v_c          public.camps;
  v_state      text;
  v_today      date;
  v_found_id   uuid;
  v_found_camp uuid;
  v_child      record;
  v_day_ids    uuid[];
  v_kind       text;
  v_base       integer;
  v_child_cts  integer;
  v_family     integer := 0;
  v_bases      integer[] := '{}';
  v_signup_id  uuid;
  v_camper_id  uuid;
  v_dup        uuid;
  v_n          integer;
  v_constraint text;
  v_desk       boolean := (p_source = 'desk');   -- 0043
begin
  -- 0. wait at most 3 seconds for a lock (e.g. a staff member's Edit camp
  --    holding the camp row). Without this the call would wait until the
  --    login's 5-second statement_timeout cancels it, and a cancelled call
  --    writes no attempt row. With it, the wait ends with
  --    lock_not_available, which 21c answers as invalid AND counts.
  --    ("true" = for this transaction only.)
  perform set_config('lock_timeout', '3s', true);

  -- 1. the camp
  if p_code is null or p_code !~ '^[a-hjkmnp-z2-9]{8}$' then
    return jsonb_build_object('status', 'not_found');
  end if;
  select * into v_c from public.camps c where c.public_code = p_code;
  if not found then
    return jsonb_build_object('status', 'not_found');
  end if;
  -- 0043: the family form never names a staff member; the desk always does
  if p_source is null or p_source not in ('form', 'desk')
     or (p_source = 'form' and p_entered_by is not null)
     or (p_source = 'desk' and (p_entered_by is null or char_length(p_entered_by) not between 1 and 200)) then
    return jsonb_build_object('status', 'invalid');
  end if;

  -- 2. the children's shape, before anything is converted
  if not public.camp_children_arg_is_valid(p_children) then
    return jsonb_build_object('status', 'invalid');
  end if;

  -- 3. already signed up with this submission id?
  if p_submission_id is not null then
    select s.id, s.camp_id into v_found_id, v_found_camp
      from public.camp_signups s where s.submission_id = p_submission_id;
    if found then
      if v_found_camp <> v_c.id then
        return jsonb_build_object('status', 'invalid');
      end if;
      return public.camp_public_signup_answer(v_found_id);
    end if;
  end if;

  -- 4. lock the camp (as every camper write does), then read it again
  select * into v_c from public.camps c where c.id = v_c.id for no key update;
  if not found then
    return jsonb_build_object('status', 'not_found');
  end if;

  -- 5. open right now?
  v_today := public.testing_today();
  v_state := public.camp_signup_state(v_c.id, v_today);
  if v_desk then
    -- 0043 (v0.740 C): after the last day nobody; while family sign-up
    -- isn't open, admins only
    if v_state = 'finished' then
      return jsonb_build_object('status', 'finished');
    elsif v_state is distinct from 'open' and public.is_admin() is not true then
      return jsonb_build_object('status', 'admin_only', 'signup_state', v_state, 'closes_on', v_c.signup_closes_on);
    end if;
  elsif v_state = 'not_open_yet' then
    return jsonb_build_object('status', 'not_open', 'opens_on', v_c.signup_opens_on);
  elsif v_state = 'closed' then
    return jsonb_build_object('status', 'closed',
                              'closed_on', case when v_c.closed_by_hand then null else v_c.signup_closes_on end);
  elsif v_state = 'finished' then
    return jsonb_build_object('status', 'finished');
  end if;

  -- 6. the other input (0043: the client key only for the family form)
  if (not v_desk and (p_client_key is null or char_length(p_client_key) not between 1 and 200))
     or p_submission_id is null
     or not public.testing_name_is_valid(p_parent_name)
     or not public.testing_name_is_valid(p_emergency_name)
     or p_parent_phone is null or p_parent_phone !~ '^[0-9]{10}$'
     or p_emergency_phone is null or p_emergency_phone !~ '^[0-9]{10}$'
     or not public.testing_line_is_valid(p_parent_relation, 40)
     or not public.testing_line_is_valid(p_emergency_relation, 40)
     or p_paying_by is null or p_paying_by not in ('cash', 'check', 'card')
     or p_acknowledged is not true
     or not public.testing_signature_is_valid(p_signature)
     or p_ack_version is distinct from 'camp-2026-10-18'
     or p_waiver_version is null or p_waiver_version !~ '^[0-9a-f]{32}$'
     or p_expected_total_cents is null
     or exists (select 1 from jsonb_array_elements(p_children) as x(value)
                 where not public.testing_name_is_valid(x.value ->> 'first_name')
                    or not public.testing_name_is_valid(x.value ->> 'last_name')) then
    return jsonb_build_object('status', 'invalid');
  end if;

  -- 7. rate limit (this call's own row is written afterwards by 21c)
  --    0043: the family form only (the desk has no client key and writes
  --    no attempt row)
  if not v_desk then
    select count(*) into v_n
      from public.camp_public_attempts a
     where a.client_key = p_client_key and a.at > now() - interval '1 hour';
    if v_n >= 30 then
      return jsonb_build_object('status', 'rate_limited');
    end if;
    select count(*) into v_n
      from public.camp_public_attempts a
     where a.camp_id = v_c.id and a.at > now() - interval '1 hour';
    if v_n >= 200 then
      raise log 'camp_public_signup: camp % had % form attempts in the last hour', v_c.id, v_n;
    end if;
  end if;

  -- 8. did the camp change while the family filled in the form?
  if p_waiver_version <> md5(v_c.waiver_text)
     or exists (select 1 from jsonb_array_elements(p_children) as x(value)
                 where (x.value ->> 'age')::integer not between v_c.min_age and v_c.max_age)
     or exists (select 1
                  from jsonb_array_elements(p_children) as x(value),
                       jsonb_array_elements(x.value -> 'day_ids') as y(value)
                 where not exists (select 1 from public.camp_days d
                                    where d.camp_id = v_c.id and d.id = (y.value #>> '{}')::uuid))
     or exists (select 1
                  from jsonb_array_elements(p_children) as x(value),
                       public.camp_extra_rows(x.value -> 'extras') as r
                 where not exists (select 1 from public.camp_extras e where e.camp_id = v_c.id and e.id = r.extra_id)
                    or (r.day_id is not null
                        and not exists (select 1 from public.camp_days d where d.camp_id = v_c.id and d.id = r.day_id))
                    or (r.day_id is not null
                        and exists (select 1 from public.camp_extras e join public.camp_days d on d.id = r.day_id
                                     where e.id = r.extra_id and e.per = 'day' and cardinality(e.only_on) > 0
                                       and not (d.day = any (e.only_on))))) then
    return jsonb_build_object('status', 'camp_changed', 'camp', public.camp_public_camp_answer(v_c.id));
  end if;

  -- 9. the extra rules, child by child
  for v_child in select x.value as c from jsonb_array_elements(p_children) as x(value) loop
    v_day_ids := array(select (y.value #>> '{}')::uuid from jsonb_array_elements(v_child.c -> 'day_ids') as y(value));
    if not public.camp_camper_extras_are_ok(v_c.id, v_day_ids, v_child.c -> 'extras') then
      return jsonb_build_object('status', 'invalid');
    end if;
  end loop;

  -- 10. the prices (today's early / regular)
  v_kind := public.camp_price_kind(v_today, v_c.early_until);
  for v_child in select x.value as c from jsonb_array_elements(p_children) with ordinality as x(value, n) order by x.n loop
    -- 0022: per week (was the row for the total number of days)
    v_base := public.camp_weekly_base_cents(v_c.id,
                                            array(select (y.value #>> '{}')::uuid
                                                    from jsonb_array_elements(v_child.c -> 'day_ids') as y(value)),
                                            (v_child.c ->> 'member')::boolean, v_kind);
    if v_base is null then
      return jsonb_build_object('status', 'invalid');
    end if;
    v_child_cts := v_base + public.camp_extras_cents_now(v_child.c -> 'extras');
    if v_child_cts > 1000000 then   -- 0022: was 200000
      return jsonb_build_object('status', 'invalid');
    end if;
    v_bases  := v_bases || v_base;
    v_family := v_family + v_child_cts;
  end loop;
  if v_family <> p_expected_total_cents then
    return jsonb_build_object('status', 'price_changed', 'new_total_cents', v_family,
                              'old_total_cents', p_expected_total_cents,
                              'camp', public.camp_public_camp_answer(v_c.id));
  end if;

  -- 11. write
  --     0043: from the desk, as the signed-in staff member (their name
  --     comes from the login, change_log_actor_name), never "Family form"
  if v_desk then
    perform set_config('tkd.actor_label', '', true);
    perform set_config('tkd.action', 'camp_staff_signup', true);
  else
    perform set_config('tkd.actor_label', 'Family form', true);
    perform set_config('tkd.action', 'camp_public_signup', true);
  end if;
  perform set_config('tkd.batch_id', gen_random_uuid()::text, true);

  begin
    insert into public.camp_signups
      (camp_id, submission_id, parent_name, parent_relation, parent_phone, emergency_name, emergency_relation,
       emergency_phone, price_kind, signed_up_on, signature, signed_at, waiver_text_signed, ack_version,
       created_by_name, updated_by_name,
       source, entered_by)   -- 0043
    values
      (v_c.id, p_submission_id, public.testing_normalize_name(p_parent_name),
       public.testing_normalize_name(p_parent_relation), p_parent_phone,
       public.testing_normalize_name(p_emergency_name), public.testing_normalize_name(p_emergency_relation),
       p_emergency_phone, v_kind, v_today, p_signature, now(), v_c.waiver_text, p_ack_version, '', '',
       p_source, case when v_desk then p_entered_by end)   -- 0043
    returning id into v_signup_id;
  exception
    when unique_violation then
      get stacked diagnostics v_constraint = constraint_name;
      if v_constraint is distinct from 'camp_signups_submission_id_key' then
        raise;
      end if;
      -- another call with the same submission id got there first
      select s.id, s.camp_id into v_found_id, v_found_camp
        from public.camp_signups s where s.submission_id = p_submission_id;
      if not found or v_found_camp <> v_c.id then
        return jsonb_build_object('status', 'invalid');
      end if;
      return public.camp_public_signup_answer(v_found_id);
  end;

  for v_child in select x.value as c, x.n from jsonb_array_elements(p_children) with ordinality as x(value, n) order by x.n loop
    v_dup := public.camp_find_duplicate(v_c.id, null, v_child.c ->> 'first_name', v_child.c ->> 'last_name');
    insert into public.camp_campers
      (signup_id, camp_id, position, first_name, last_name, age, member, paying_by, base_cents,
       duplicate_state, duplicate_of, created_by_name, updated_by_name)
    values
      (v_signup_id, v_c.id, v_child.n::smallint,
       public.testing_normalize_name(v_child.c ->> 'first_name'), public.testing_normalize_name(v_child.c ->> 'last_name'),
       (v_child.c ->> 'age')::smallint, (v_child.c ->> 'member')::boolean, p_paying_by, v_bases[v_child.n],
       case when v_dup is null then 'none' else 'possible' end, v_dup, '', '')
    returning id into v_camper_id;

    insert into public.camp_camper_days (camper_id, day_id)
    select v_camper_id, (y.value #>> '{}')::uuid
      from jsonb_array_elements(v_child.c -> 'day_ids') as y(value);

    insert into public.camp_camper_extras (camper_id, extra_id, day_id, price_cents)
    select v_camper_id, r.extra_id, r.day_id, e.price_cents
      from public.camp_extra_rows(v_child.c -> 'extras') as r
      join public.camp_extras e on e.id = r.extra_id
     order by e.sort, r.day_id;
  end loop;

  perform set_config('tkd.action', '', true);
  perform set_config('tkd.batch_id', '', true);

  -- 12. the answer
  return public.camp_public_signup_answer(v_signup_id);
end;
$$;

revoke execute on function public.camp_public_signup_core(text, text, uuid, jsonb, text, text, text, text, text, text,
  text, boolean, text, text, text, integer, text, text) from public, anon, authenticated, service_role;


-- ---------------------------------------------------------------------
-- 4. camp_public_signup - the family form's Sign up (0013 21c)
--   Word for word 0013's code except the line marked "0043": the core is
--   called with 'form', null (the family form, nobody's name). Same
--   inputs, same rights (camps_registrar only).
-- ---------------------------------------------------------------------
-- 21c. camp_public_signup(...) - the family form's Sign up. Wraps 21b:
--   * first forgets any login token the caller might have set (so nobody
--     can make a form sign-up look like a staff member's), and removes
--     camp_public_attempts rows older than 2 days
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
begin
  perform set_config('request.jwt.claims', '', true);
  perform set_config('request.jwt.claim.sub', '', true);

  delete from public.camp_public_attempts a where a.at < now() - interval '2 days';

  begin
    v_result := public.camp_public_signup_core(p_code, p_client_key, p_submission_id, p_children, p_parent_name,
                                               p_parent_phone, p_parent_relation, p_emergency_name, p_emergency_phone,
                                               p_emergency_relation, p_paying_by, p_acknowledged, p_signature,
                                               p_ack_version, p_waiver_version, p_expected_total_cents,
                                               'form', null);   -- 0043: the family form, nobody's name
  exception
    when unique_violation or foreign_key_violation or check_violation or not_null_violation or data_exception then
      v_result := jsonb_build_object('status', 'invalid');
    when deadlock_detected or serialization_failure or lock_not_available or query_canceled then
      -- query_canceled: the statement_timeout (5 s) or a cancel ran out
      -- inside 21b; caught here so the attempt row below is still written
      v_result := jsonb_build_object('status', 'invalid');
  end;

  insert into public.camp_public_attempts (client_key, camp_id, outcome)
  values (coalesce(left(p_client_key, 200), ''),
          (select c.id from public.camps c where c.public_code = p_code),
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
-- 5. camp_staff_form(p_camp_id)   S (read only; rulebook v0.740 / v0.741)
--   What the Fill in dialog needs to draw the camp's family form: EXACTLY
--   camp_public_camp's answer for this camp (built by the same internal
--   helper, camp_public_camp_answer, so the family page's parts are
--   reused unchanged), plus:
--     fill_in         'open'       family sign-up is open: staff and admins
--                     'admin_only' not open yet / closed by hand / past
--                                  the closing date: admins only
--                     'finished'   after the camp's last day: nobody
--     signup_state    camp_signup_state's own word (open, not_open_yet,
--                     closed, finished), so the staff tip can say which
--     closes_on       the camp's closing date
--     closed_by_hand  true when someone closed sign-up by hand
--   ("fill_in" says what the RULE is; who may go on is decided again by
--   camp_staff_signup when Send is pressed.)
--   Refused: no_access; not_found (no id, or no such camp). Not logged.
-- ---------------------------------------------------------------------
create or replace function public.camp_staff_form(p_camp_id uuid)
returns jsonb
language plpgsql
stable
security definer
set search_path = ''
as $$
declare
  v_c     public.camps;
  v_state text;
begin
  if public.has_data_access() is not true then
    return jsonb_build_object('status', 'no_access');
  end if;
  if p_camp_id is null then
    return jsonb_build_object('status', 'not_found');
  end if;
  select * into v_c from public.camps c where c.id = p_camp_id;
  if not found then
    return jsonb_build_object('status', 'not_found');
  end if;

  v_state := public.camp_signup_state(v_c.id, public.testing_today());
  return public.camp_public_camp_answer(v_c.id)
         || jsonb_build_object(
              'fill_in',        case when v_state = 'open' then 'open'
                                     when v_state in ('not_open_yet', 'closed') then 'admin_only'
                                     when v_state = 'finished' then 'finished'
                                end,
              'signup_state',   v_state,
              'closes_on',      v_c.signup_closes_on,
              'closed_by_hand', v_c.closed_by_hand);
end;
$$;

revoke execute on function public.camp_staff_form(uuid) from public, anon, authenticated, service_role;
grant  execute on function public.camp_staff_form(uuid) to authenticated;


-- ---------------------------------------------------------------------
-- 6. camp_staff_signup(...)   S (writes; rulebook v0.740 / v0.741)
--   Fill in's Send (staff and admins; copied from Forms'
--   forms_staff_submit, 0009). The family form's inputs, but the camp by
--   its id and no client key. It runs the SAME core as the family form
--   with 'desk' and the signed-in staff member's name
--   (change_log_actor_name), so:
--     * every family-form rule applies (see the core above);
--     * open -> anyone with access; not open yet / closed -> admins only
--       (others: {"status":"admin_only","signup_state","closes_on"});
--       after the last day -> {"status":"finished"};
--     * the sign-up is saved with source 'desk' and entered_by = the name,
--       logged as that staff member with action camp_staff_signup;
--     * no client-key limit and no camp_public_attempts row.
--   Answers: the family form's ok (reference, paying_by,
--   family_total_cents, children, camp - 0022's camp_public_signup_answer),
--   price_changed, camp_changed, invalid, not_found, finished, admin_only,
--   no_access. A table rule, a conversion or a lock that isn't free within
--   3 seconds undoes everything the core did and answers invalid (as the
--   family form).
-- ---------------------------------------------------------------------
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
  p_expected_total_cents integer
)
returns jsonb
language plpgsql
volatile
security definer
set search_path = ''
as $$
declare
  v_code   text;
  v_result jsonb;
begin
  if public.has_data_access() is not true then
    return jsonb_build_object('status', 'no_access');
  end if;
  if p_camp_id is null then
    return jsonb_build_object('status', 'not_found');
  end if;
  select c.public_code into v_code from public.camps c where c.id = p_camp_id;
  if not found then
    return jsonb_build_object('status', 'not_found');
  end if;

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

  perform set_config('tkd.action', '', true);
  perform set_config('tkd.batch_id', '', true);
  return v_result;
end;
$$;

revoke execute on function public.camp_staff_signup(uuid, uuid, jsonb, text, text, text, text, text, text, text, boolean,
  text, text, text, integer) from public, anon, authenticated, service_role;
grant  execute on function public.camp_staff_signup(uuid, uuid, jsonb, text, text, text, text, text, text, text, boolean,
  text, text, text, integer) to authenticated;


-- ---------------------------------------------------------------------
-- 7. camp_camper_detail - 0022's version, word for word except the two
--    lines marked "0043": the answer gains "source" and "entered_by" of
--    the camper's sign-up (v0.741: "Signed up at the desk by {entered_by}
--    ..."). Same input, same rights.
-- ---------------------------------------------------------------------
-- 20s. camp_camper_detail(p_camper_id)   S (read only)
-- Camper detail (C6): the roster row, the family's parent / emergency
-- contact (the ONLY way the app sees phones - staff and admins, v0.700),
-- the price breakdown, the payments and the check-in times per day.
-- {"status":"ok",
--  "camper": {...the camp_roster row...},
--  "source": "form" | "desk",          (0043)
--  "entered_by": staff name | null,    (0043)
--  "family": {parent_name, parent_phone, parent_relation,
--             emergency_name, emergency_phone, emergency_relation},
--  "breakdown": {day_count, price_kind, member, base_cents,
--                weeks: [{monday, day_count, cents}]   (0022, 2d),
--                extras: [{name, per, days: [date], cents}],
--                total_cents, paid_cents, owes_cents},
--  "payments": [{id, kind, amount_cents, method, paid_on, school,
--                recorded_at, recorded_by_name, reverses_payment_id}],
--  "checkins": [{day, checked_in_at, checked_in_by_name}]}  (every day of
--   the camper's, in date order; not checked in = nulls)
-- or {"status":"no_access"} / {"status":"not_found"}.
create or replace function public.camp_camper_detail(p_camper_id uuid)
returns jsonb
language plpgsql
stable
security definer
set search_path = ''
as $$
declare
  v_row jsonb;
  v_s   public.camp_signups;
begin
  if public.has_data_access() is not true then
    return jsonb_build_object('status', 'no_access');
  end if;
  if p_camper_id is null then
    return jsonb_build_object('status', 'not_found');
  end if;

  select to_jsonb(r) into v_row from public.camp_roster r where r.id = p_camper_id;
  if v_row is null then
    return jsonb_build_object('status', 'not_found');
  end if;
  select * into v_s from public.camp_signups s where s.id = (v_row ->> 'signup_id')::uuid;

  return jsonb_build_object(
    'status', 'ok',
    'camper', v_row,
    'source',     v_s.source,       -- 0043
    'entered_by', v_s.entered_by,   -- 0043
    'family', jsonb_build_object(
                'parent_name',        v_s.parent_name,
                'parent_phone',       v_s.parent_phone,
                'parent_relation',    v_s.parent_relation,
                'emergency_name',     v_s.emergency_name,
                'emergency_phone',    v_s.emergency_phone,
                'emergency_relation', v_s.emergency_relation),
    'breakdown', jsonb_build_object(
                'day_count',   jsonb_array_length(v_row -> 'days'),
                'price_kind',  v_row -> 'price_kind',
                'member',      v_row -> 'member',
                'base_cents',  v_row -> 'base_cents',
                -- 0022: the weeks the camper comes (2d)
                'weeks',       public.camp_weeks_breakdown((v_row ->> 'camp_id')::uuid,
                                                           array(select cd.day_id from public.camp_camper_days cd
                                                                  where cd.camper_id = p_camper_id),
                                                           (v_row ->> 'member')::boolean, v_row ->> 'price_kind'),
                'extras',      coalesce((select jsonb_agg(jsonb_build_object('name', g.name, 'per', g.per,
                                                                             'days', g.days, 'cents', g.cents)
                                                          order by g.sort)
                                           from (select e.name, e.per, e.sort,
                                                        coalesce(jsonb_agg(d.day order by d.day)
                                                                   filter (where d.day is not null), '[]'::jsonb) as days,
                                                        sum(x.price_cents)::integer as cents
                                                   from public.camp_camper_extras x
                                                   join public.camp_extras e on e.id = x.extra_id
                                                   left join public.camp_days d on d.id = x.day_id
                                                  where x.camper_id = p_camper_id
                                                  group by e.id, e.name, e.per, e.sort) as g), '[]'::jsonb),
                'total_cents', v_row -> 'total_cents',
                'paid_cents',  v_row -> 'paid_cents',
                'owes_cents',  v_row -> 'owes_cents'),
    'payments', coalesce((select jsonb_agg(jsonb_build_object(
                                     'id', p.id, 'kind', p.kind, 'amount_cents', p.amount_cents, 'method', p.method,
                                     'paid_on', p.paid_on, 'school', p.school, 'recorded_at', p.recorded_at,
                                     'recorded_by_name', p.recorded_by_name, 'reverses_payment_id', p.reverses_payment_id)
                                   order by p.recorded_at, p.id)
                            from public.camp_payments p where p.camper_id = p_camper_id), '[]'::jsonb),
    'checkins', coalesce((select jsonb_agg(jsonb_build_object(
                                     'day', d.day, 'checked_in_at', cd.checked_in_at,
                                     'checked_in_by_name', cd.checked_in_by_name)
                                   order by d.day)
                            from public.camp_camper_days cd
                            join public.camp_days d on d.id = cd.day_id
                           where cd.camper_id = p_camper_id), '[]'::jsonb));
end;
$$;

revoke execute on function public.camp_camper_detail(uuid) from public, anon, authenticated, service_role;
grant  execute on function public.camp_camper_detail(uuid) to authenticated;


commit;

-- End of 0043_camps_fill_in.sql
