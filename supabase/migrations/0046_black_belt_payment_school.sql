-- =====================================================================
-- 0046_black_belt_payment_school.sql
-- ---------------------------------------------------------------------
-- WHAT THIS FILE IS
--   Black Belt's database half of design-review item R1-01 (rulebook
--   v1.035 and v1.040, Jeffrey 2026-11-04; fix list
--   docs/Design Review/Rolling check/Pass 1/Fix-BlackBelt.md): every Black
--   Belt payment counts at the school of the DESK that took it - the
--   school set under "This device" in the account menu - and no longer at
--   the candidate's own school. It runs AFTER 0016, 0024 and 0025 (all
--   live; it needs 0016's two functions and its bb_payments table) and
--   stops with a clear message if they are missing.
--
-- WHY IT EXISTS
--   Finance's Daily report puts each Black Belt payment under the school
--   stored on the payment (bb_payments.location_code, read by 0026 -
--   nothing in Finance changes). Until now bb_record_payment stored the
--   CANDIDATE's school, so money taken at the Shrewsbury desk for a
--   Worcester candidate was counted at Worcester - the wrong cash drawer.
--
-- WHAT IT CHANGES (two functions, nothing else)
--   1. bb_record_payment gets a new LAST input, p_school text default null:
--        bb_record_payment(p_candidate_id uuid, p_expected_version integer,
--                          p_amount_cents integer, p_method text,
--                          p_for_items text[], p_note text,
--                          p_school text default null)
--      p_school is the desk's school code ('worcester' / 'shrewsbury' - a
--      code in public.locations, the table bb_payments.location_code
--      points to). It is stored on the new row instead of the candidate's
--      school. Blank (null or empty) = today's rule = the candidate's
--      school, so the app that is live today (it does not send the input)
--      keeps working exactly as before. A code that is not a school ->
--      {"status":"invalid"} (the function's own answer for bad input).
--   2. bb_record_refund gets the same last input:
--        bb_record_refund(p_candidate_id uuid, p_expected_version integer,
--                         p_amount_cents integer, p_method text,
--                         p_note text, p_school text default null)
--      A refund counts at the desk that hands the money back (v1.040):
--      the given code is stored; blank = today's rule = the school of the
--      candidate's latest live payment (the money it gives back). The
--      cycle name still comes from that payment, as before.
--   NOT changed (checked): bb_undo_payment, bb_edit_payment and
--   bb_mark_check_returned already copy the school from the very row they
--   correct (v0.903's chain rule: bb_payments_guard also refuses a
--   reversal or a returned row whose school differs from the row it
--   corrects), so an undo, an edit and a returned check follow the
--   payment's school with no change. Existing payments keep the school
--   they were stored with (no backfill). Every finance_* function, and
--   every other section's functions, are untouched.
--
-- SECURITY (as 0016)
--   Both functions stay security definer, search_path = '', fully
--   qualified names, has_data_access() first, every write logged in
--   public.change_log with the same action tags as before, answers
--   {"status": ...}. Revoked from public, anon, authenticated and
--   service_role; granted to authenticated only. Nothing for anon. Each
--   function body is 0016's word for word except the school source.
--
-- WHY THE OLD FUNCTIONS ARE DROPPED
--   An input with a default makes a second version of the function next
--   to the old one, and the server then refuses a call it can't choose
--   between. So the old 6-input bb_record_payment and 5-input
--   bb_record_refund are removed in this same file and made again with
--   the new input (Camps' 0033 did the same with camp_mark_paid): one
--   version of each is left. The app live today calls both by position
--   or by name without p_school; the default covers that (tested as role
--   authenticated).
--
-- HOW TO RUN IT
--   After 0016, 0024 and 0025 (live). Apply it BEFORE the app version
--   that sends p_school. Supabase dashboard -> SQL Editor -> New query ->
--   paste this WHOLE file -> Run. One transaction ("begin;" ...
--   "commit;"): if any statement fails, nothing is kept.
--   THIS FILE CONTAINS "drop function", so the Supabase connection
--   cancels it: Jeffrey pastes it himself in the SQL Editor, after a
--   security review and his OK. Supabase will warn about destructive
--   operations: the two "drop function if exists" lines are real on the
--   first run (the two old versions, made again with the new input right
--   after in the same transaction). No data is removed.
--   Safe to run again (tested in PGlite: a second run changes no
--   fingerprint and no row).
--   RE-RUN ORDER: re-running 0016 after this file brings back the old
--   6-input bb_record_payment and 5-input bb_record_refund NEXT TO the new
--   ones (every call would then fail as "not unique") - run this file
--   straight after, or use the undo first.
--   Undo: supabase/SETUP.md, "Migration 0046", 0046e
--   (supabase/manual/0046u_undo_black_belt_payment_school.sql).
-- =====================================================================

begin;


-- ---------------------------------------------------------------------
-- 1. The guard: this file needs 0016's payments (table and functions).
--    Stops - and changes nothing - if they are missing.
-- ---------------------------------------------------------------------
do $$
begin
  if to_regclass('public.bb_payments') is null
     or (to_regprocedure('public.bb_record_payment(uuid, integer, integer, text, text[], text)') is null
         and to_regprocedure('public.bb_record_payment(uuid, integer, integer, text, text[], text, text)') is null)
     or (to_regprocedure('public.bb_record_refund(uuid, integer, integer, text, text)') is null
         and to_regprocedure('public.bb_record_refund(uuid, integer, integer, text, text, text)') is null) then
    raise exception '0046 needs migration 0016 (Black Belt payments) first';
  end if;
end
$$;


-- ---------------------------------------------------------------------
-- 2. R1-01 - Record payment counts at the desk's school
-- ---------------------------------------------------------------------

-- the old 6-input version goes (a second version would make every call ambiguous)
drop function if exists public.bb_record_payment(uuid, integer, integer, text, text[], text);

-- 15o. bb_record_payment(p_candidate_id, p_expected_version,
--        p_amount_cents, p_method, p_for_items, p_note, p_school)   S
-- Record payment (v0.218): any amount from 1 cent to $5,000 (staff may
-- type any amount, v0.900), cash / check / card, for the ticked items
-- (p1 ... p12, kukkiwon - each of the candidate's CURRENT plan, kukkiwon
-- only when chosen), an optional note (e.g. "post-dated Apr 24"). It
-- counts today (paid_on = today, even a post-dated check, v0.218).
-- Refused: a withdrawn candidate (withdrawn, S2). Last step: the purge.
-- 0046 (v1.035 / v1.040): the payment counts at the school of the DESK that
-- took it. p_school (a school code) is that desk (the school under This
-- device in the account menu) and is stored on the row; blank (null or
-- empty) = the candidate's school, as before 0046, so an app that does not
-- send it keeps working. A school that does not exist: {"status":"invalid"}.
-- locks: cycle (no key update) -> candidate (update)
-- Ok: {"status":"ok","payment_id":...,"version":n,"money":{...}}
create or replace function public.bb_record_payment(
  p_candidate_id     uuid,
  p_expected_version integer,
  p_amount_cents     integer,
  p_method           text,
  p_for_items        text[],
  p_note             text,
  p_school           text default null
)
returns jsonb
language plpgsql
volatile
security definer
set search_path = ''
as $$
declare
  v_today      date;
  v_note       text;
  v_c          public.bb_candidates;
  v_cycle_name text;
  v_payment_id uuid;
  v_version    integer;
  v_school     text;
  v_constraint text;
begin
  begin
    if public.has_data_access() is not true then
      return jsonb_build_object('status', 'no_access');
    end if;

    v_note := public.testing_normalize_note(p_note);
    v_school := nullif(btrim(p_school), '');
    if p_candidate_id is null or p_expected_version is null
       or p_amount_cents is null or p_amount_cents not between 1 and 500000
       or p_method is null or p_method not in ('cash', 'check', 'card')
       or p_for_items is null or coalesce(array_ndims(p_for_items), 0) <> 1
       or cardinality(p_for_items) not between 1 and 13
       or array_position(p_for_items, null) is not null
       or exists (select 1 from unnest(p_for_items) as x(item) where x.item !~ '^(p([1-9]|1[0-2])|kukkiwon)$')
       or (select count(distinct x.item) from unnest(p_for_items) as x(item)) <> cardinality(p_for_items)
       or (v_note is not null and not public.testing_note_is_valid(v_note))
       or (v_school is not null and not exists (select 1 from public.locations l where l.code = v_school)) then
      return jsonb_build_object('status', 'invalid');
    end if;

    v_c := public.bb_lock_candidate(p_candidate_id);
    if v_c.id is null then
      return jsonb_build_object('status', 'not_found');
    end if;
    if v_c.version <> p_expected_version then
      return jsonb_build_object('status', 'stale');
    end if;
    if v_c.status = 'withdrawn' then
      return jsonb_build_object('status', 'withdrawn');
    end if;
    -- every ticked item is one the candidate owes under the CURRENT plan
    if exists (select 1 from unnest(p_for_items) as x(item)
                where not exists (select 1 from public.bb_candidate_items(v_c.id) as i where i.item = x.item)) then
      return jsonb_build_object('status', 'invalid');
    end if;

    v_today := public.testing_today();
    select y.name into v_cycle_name from public.bb_cycles y where y.id = v_c.cycle_id;

    perform set_config('tkd.action', 'bb_record_payment', true);
    perform set_config('tkd.batch_id', gen_random_uuid()::text, true);

    insert into public.bb_payments
      (candidate_id, cycle_id, kind, amount_cents, method, paid_on, for_items, note, reason,
       location_code, cycle_name, recorded_at, recorded_by, recorded_by_name)
    values
      (v_c.id, v_c.cycle_id, 'payment', p_amount_cents, p_method, v_today, p_for_items, v_note, null,
       coalesce(v_school, v_c.location_code), v_cycle_name, now(), auth.uid(), public.change_log_actor_name())
    returning id into v_payment_id;

    update public.bb_candidates c set version = c.version + 1 where c.id = v_c.id
    returning c.version into v_version;

    perform set_config('tkd.action', '', true);
    perform set_config('tkd.batch_id', '', true);

    perform public.bb_purge_due();

    return jsonb_build_object('status', 'ok', 'payment_id', v_payment_id, 'version', v_version,
                              'money', public.bb_candidate_money(v_c.id, v_today));
  exception
    when unique_violation then
      get stacked diagnostics v_constraint = constraint_name;
      if v_constraint = 'bb_cycles_lower_name_idx' then
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

revoke execute on function public.bb_record_payment(uuid, integer, integer, text, text[], text, text) from public, anon, authenticated, service_role;
grant  execute on function public.bb_record_payment(uuid, integer, integer, text, text[], text, text) to authenticated;


-- ---------------------------------------------------------------------
-- 3. R1-01 - Record refund counts at the desk that hands the money back
-- ---------------------------------------------------------------------

-- the old 5-input version goes
drop function if exists public.bb_record_refund(uuid, integer, integer, text, text);

-- 15r. bb_record_refund(p_candidate_id, p_expected_version, p_amount_cents,
--        p_method, p_note, p_school)   A
-- Record refund: its own negative row, counted today, cash / check / card
-- (as drawn), never more than the net paid
-- ({"status":"refund_too_large","paid_cents":n}, v0.900). Allowed on
-- withdrawn candidates (S2). A refund corrects no single row, so it takes
-- the school and cycle name of the candidate's LATEST live payment (the
-- money it gives back; contract 14 OI-4).
-- 0046 (v1.035 / v1.040): a refund counts at the desk that hands the money
-- back. p_school (a school code) is that desk and is stored on the row
-- (the cycle name still comes from the latest live payment); blank (null
-- or empty) = the school of that latest live payment, as before 0046. A
-- school that does not exist: {"status":"invalid"}.
-- locks: cycle (no key update) -> candidate (update)
-- Ok: {"status":"ok","payment_id":...,"version":n,"money":{...}}
create or replace function public.bb_record_refund(
  p_candidate_id     uuid,
  p_expected_version integer,
  p_amount_cents     integer,
  p_method           text,
  p_note             text,
  p_school           text default null
)
returns jsonb
language plpgsql
volatile
security definer
set search_path = ''
as $$
declare
  v_today      date;
  v_note       text;
  v_c          public.bb_candidates;
  v_net        bigint;
  v_loc        text;
  v_cycle_name text;
  v_payment_id uuid;
  v_version    integer;
  v_school     text;
  v_constraint text;
begin
  begin
    if public.has_data_access() is not true then
      return jsonb_build_object('status', 'no_access');
    end if;
    if public.is_admin() is not true then
      return jsonb_build_object('status', 'not_allowed');
    end if;

    v_note := public.testing_normalize_note(p_note);
    v_school := nullif(btrim(p_school), '');
    if p_candidate_id is null or p_expected_version is null
       or p_amount_cents is null or p_amount_cents not between 1 and 500000
       or p_method is null or p_method not in ('cash', 'check', 'card')
       or (v_note is not null and not public.testing_note_is_valid(v_note))
       or (v_school is not null and not exists (select 1 from public.locations l where l.code = v_school)) then
      return jsonb_build_object('status', 'invalid');
    end if;

    v_c := public.bb_lock_candidate(p_candidate_id);
    if v_c.id is null then
      return jsonb_build_object('status', 'not_found');
    end if;
    if v_c.version <> p_expected_version then
      return jsonb_build_object('status', 'stale');
    end if;
    select coalesce(sum(p.amount_cents), 0)::bigint into v_net
      from public.bb_payments p where p.candidate_id = v_c.id;
    if p_amount_cents > v_net then
      return jsonb_build_object('status', 'refund_too_large', 'paid_cents', v_net);
    end if;

    -- the school and cycle name of the latest live payment (not undone,
    -- not a bounced check); the candidate's own as a fallback
    select p.location_code, p.cycle_name into v_loc, v_cycle_name
      from public.bb_payments p
     where p.candidate_id = v_c.id and p.kind = 'payment'
       and not exists (select 1 from public.bb_payments r where r.reverses_payment_id = p.id and r.kind = 'reversal')
       and not exists (select 1 from public.bb_payments t
                        where t.reverses_payment_id = p.id and t.kind = 'returned'
                          and not exists (select 1 from public.bb_payments u
                                           where u.reverses_payment_id = t.id and u.kind = 'reversal'))
     order by p.recorded_at desc, p.id desc
     limit 1;
    if not found then
      v_loc := v_c.location_code;
      select y.name into v_cycle_name from public.bb_cycles y where y.id = v_c.cycle_id;
    end if;
    -- 0046: the desk that hands the money back (blank = the school found above)
    if v_school is not null then
      v_loc := v_school;
    end if;

    v_today := public.testing_today();
    perform set_config('tkd.action', 'bb_record_refund', true);
    perform set_config('tkd.batch_id', gen_random_uuid()::text, true);

    insert into public.bb_payments
      (candidate_id, cycle_id, kind, amount_cents, method, paid_on, for_items, note, reason,
       location_code, cycle_name, recorded_at, recorded_by, recorded_by_name)
    values
      (v_c.id, v_c.cycle_id, 'refund', -p_amount_cents, p_method, v_today, null, v_note, null,
       v_loc, v_cycle_name, now(), auth.uid(), public.change_log_actor_name())
    returning id into v_payment_id;

    update public.bb_candidates c set version = c.version + 1 where c.id = v_c.id
    returning c.version into v_version;

    perform set_config('tkd.action', '', true);
    perform set_config('tkd.batch_id', '', true);

    return jsonb_build_object('status', 'ok', 'payment_id', v_payment_id, 'version', v_version,
                              'money', public.bb_candidate_money(v_c.id, v_today));
  exception
    when unique_violation then
      get stacked diagnostics v_constraint = constraint_name;
      if v_constraint = 'bb_cycles_lower_name_idx' then
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

revoke execute on function public.bb_record_refund(uuid, integer, integer, text, text, text) from public, anon, authenticated, service_role;
grant  execute on function public.bb_record_refund(uuid, integer, integer, text, text, text) to authenticated;

commit;

-- End of 0046_black_belt_payment_school.sql
