-- =====================================================================
-- 0038u_undo_star_design_review.sql   (UNDO of migration 0038)
-- ---------------------------------------------------------------------
-- WHAT THIS FILE IS
--   Takes Star testing back to how it was before 0038 (design-review pass
--   1: Edit event's one-step Undo, payments counted at the desk's school,
--   the form's own Paying by, belt order Worcester first):
--     1. refuses - changing nothing - while any payment was taken at a
--        school other than its candidate's school, or any payment also
--        changed a candidate's Paying by (see below)
--     2. removes star_undo_event_edit and 0038's 6-input star_record_payment
--        and star_record_refund, and puts back 0006's versions of
--        star_record_payment and star_record_refund (5 inputs),
--        star_undo_payment and star_edit_payment, star_event_results (belt
--        order Shrewsbury first again) and the payments guard trigger
--        function, and 0023's star_results_csv - word for word, with their
--        exact rights
--     3. puts back 0006's star_roster view (without paying_by_on_form)
--     4. removes the trigger star_candidates_before_form_choice and its
--        function, the three table rules and staff's read rights, and the
--        columns star_payments.school, star_payments.paying_by_before and
--        star_candidates.paying_by_on_form
--   The function and view text in sections 2 and 3 is copied from
--   0006_star_testing.sql (sections 13h, 14, 18u-18x, 19e) and
--   0023_star_result_texts.sql (section 7), comments included.
--
-- WHY A SEPARATE FILE
--   Re-running 0006 / 0023 would not remove 0038's versions (the 6-input
--   Record payment / Record refund have one more input, so Postgres keeps
--   both side by side), and would not remove the columns. Paste it ONLY
--   with Jeffrey's OK (SETUP.md, Migration 0038, 0038f), and only after
--   the app is back to a version that doesn't send p_school and doesn't
--   call star_undo_event_edit (an app that does would get "function not
--   found" or an unknown input from the old versions).
--
-- IT REFUSES WHILE DATA WOULD BE LOST
--   * a payment taken at a school other than its candidate's: removing
--     star_payments.school would silently throw away which desk took that
--     money (Finance would then count it at the candidate's school);
--   * a payment that also changed a candidate's Paying by
--     (paying_by_before): its Undo could no longer put the old way back.
--   Check first with supabase/tests/0038_preapply_check.sql
--   (payments_elsewhere and payments_with_way must both be 0). There is
--   no automatic fix: an admin decides what to do with those payments.
--   star_candidates.paying_by_on_form is not a loss: it is a copy of what
--   the form's own history insert row already says.
--
-- AFTERWARDS
--   Every fingerprint file (0006's and 0023's included) must equal the one
--   written down BEFORE 0038 was applied (SETUP 0038c), and
--   0038_preapply_check.sql must answer 0 / 2 / 0 / 7 / 7 / 0 / 0 / 0.
--   Tested in PGlite (run.mjs step0038). To redo: paste 0038 again. Safe to
--   paste twice. One transaction: on any error nothing is kept.
--   Supabase may warn about DESTRUCTIVE OPERATIONS: the "drop function",
--   "drop view", "drop trigger", "drop constraint" and "drop column" below
--   are the planned removals of 0038's parts (section 1 has made sure no
--   column holds anything that would be lost). Confirm.
-- =====================================================================

begin;

-- Stop payment and candidate writes while this undo runs, so nothing can
-- be saved between the check below and the columns' removal.
lock table public.star_payments in share mode;
lock table public.star_candidates in share mode;

-- ---------------------------------------------------------------------
-- 1. Refuse while data would be lost (see above). Read through
--    to_jsonb(), so a second paste (no columns any more) passes.
-- ---------------------------------------------------------------------
do $$
declare
  v_elsewhere integer;
  v_way       integer;
begin
  select count(*) into v_elsewhere
    from public.star_payments p
    join public.star_candidates c on c.id = p.candidate_id
   where to_jsonb(p) ->> 'school' is not null
     and to_jsonb(p) ->> 'school' <> c.location_code;
  select count(*) into v_way
    from public.star_payments p
   where to_jsonb(p) ->> 'paying_by_before' is not null;
  if v_elsewhere > 0 or v_way > 0 then
    raise exception '0038 undo refused: % payment(s) were taken at another school than their candidate''s and % payment(s) also changed a Paying by (0038_preapply_check.sql counts them). Nothing was changed.',
      v_elsewhere, v_way;
  end if;
end
$$;

-- ---------------------------------------------------------------------
-- 2. The functions: 0038's out, the earlier ones back
-- ---------------------------------------------------------------------
drop function if exists public.star_undo_event_edit(uuid, integer, text, date, time, text, date, text, time, boolean);
drop function if exists public.star_record_payment(uuid, integer, text, integer, date, text);
drop function if exists public.star_record_refund(uuid, integer, text, integer, date, text);

-- 0006's payments guard (0006 section 13h), word for word:

-- 13h. star_payments_guard() - keeps payments append-only
--   BEFORE INSERT: a reversal must undo one PAYMENT or REFUND (not a
--                  reversal) of the same candidate, for exactly minus its
--                  amount (star_payments_reversal_check); and no insert
--                  may leave the candidate's net total below zero
--                  (star_payments_net_check - the calling function already
--                  holds the candidate lock, so nothing extra is locked)
--   BEFORE UPDATE: always refused
--   BEFORE DELETE: refused, EXCEPT as part of removing a whole candidate
--                  or event ("on delete cascade" runs it from inside
--                  another trigger, so pg_trigger_depth() > 1), or inside
--                  star_delete_candidate / star_delete_event (their action
--                  tags). Color Belt's tags don't count here.
-- Limit (as 0005): the database owner could switch this trigger off on
-- purpose; it stops mistakes and the app, not a deliberate owner.
create or replace function public.star_payments_guard()
returns trigger
language plpgsql
set search_path = ''
as $$
declare
  v_reversed public.star_payments;
  v_net      bigint;
begin
  if tg_op = 'INSERT' then
    if new.kind = 'reversal' then
      select * into v_reversed from public.star_payments p where p.id = new.reverses_payment_id;
      if not found
         or v_reversed.kind not in ('payment', 'refund')
         or v_reversed.candidate_id <> new.candidate_id
         or new.amount_cents <> -v_reversed.amount_cents then
        raise exception using
          errcode    = '23514',
          constraint = 'star_payments_reversal_check',
          message    = 'a reversal must undo one payment or refund of the same candidate, for exactly minus its amount';
      end if;
    end if;
    select coalesce(sum(p.amount_cents), 0) into v_net
      from public.star_payments p where p.candidate_id = new.candidate_id;
    if v_net + new.amount_cents < 0 then
      raise exception using
        errcode    = '23514',
        constraint = 'star_payments_net_check',
        message    = 'a candidate''s payments can''t add up to less than zero';
    end if;
    return new;
  end if;

  if tg_op = 'DELETE'
     and (pg_trigger_depth() > 1
          or coalesce(current_setting('tkd.action', true), '') in ('star_delete_candidate', 'star_delete_event')) then
    return old;
  end if;

  raise exception 'star_payments is append-only (use a reversal)';
end;
$$;

revoke execute on function public.star_payments_guard() from public, anon, authenticated, service_role;

-- 0006's Record payment, Undo payment, Edit payment and Record refund
-- (0006 sections 18u-18x), word for word:

-- 18u. star_record_payment(p_candidate_id, p_expected_version, p_method,
--        p_amount_cents, p_paid_on)   S
-- Record payment (v0.109, v0.110): the dialog fills in the expected fee
-- (12d); staff may type another amount (1 cent to $1,000, e.g. a
-- discount). Any recorded amount counts as Paid (v0.167). Method cash /
-- check / card; date not in the future and not before the day the
-- candidate registered (Massachusetts date, v0.175; later dates are fine,
-- e.g. a late entry of an earlier payment). Allowed in every event state.
-- Refused: withdrawn (withdrawn), a make-up (no_fee), already paid
-- (already_paid). The candidate's version goes up, so a double click with
-- the old version gets "stale". Last step: the signature clean-up (16a).
-- locks: event (no key update) -> candidate (update)
-- Ok: {"status":"ok","payment_id":...,"version":n}
create or replace function public.star_record_payment(
  p_candidate_id     uuid,
  p_expected_version integer,
  p_method           text,
  p_amount_cents     integer,
  p_paid_on          date
)
returns jsonb
language plpgsql
volatile
security definer
set search_path = ''
as $$
declare
  v_c          public.star_candidates;
  v_payment_id uuid;
  v_version    integer;
  v_constraint text;
begin
  begin
    if public.has_data_access() is not true then
      return jsonb_build_object('status', 'no_access');
    end if;

    if p_candidate_id is null or p_expected_version is null
       or p_method is null or p_method not in ('cash', 'check', 'card')
       or p_amount_cents is null or p_amount_cents not between 1 and 100000
       or p_paid_on is null or p_paid_on > public.testing_today() then
      return jsonb_build_object('status', 'invalid');
    end if;

    v_c := public.star_lock_candidate(p_candidate_id);
    if v_c.id is null then
      return jsonb_build_object('status', 'not_found');
    end if;
    if v_c.version <> p_expected_version then
      return jsonb_build_object('status', 'stale');
    end if;
    if v_c.status = 'withdrawn' then
      return jsonb_build_object('status', 'withdrawn');
    end if;
    if v_c.is_makeup then
      return jsonb_build_object('status', 'no_fee');
    end if;
    if public.star_net_paid_cents(v_c.id) > 0 then
      return jsonb_build_object('status', 'already_paid');
    end if;
    -- "Date paid" never before the day the candidate registered (v0.175)
    if p_paid_on < public.testing_school_date(v_c.registered_at) then
      return jsonb_build_object('status', 'invalid');
    end if;

    perform set_config('tkd.action', 'star_record_payment', true);
    perform set_config('tkd.batch_id', gen_random_uuid()::text, true);

    insert into public.star_payments
      (candidate_id, kind, amount_cents, method, paid_on, recorded_at, recorded_by, recorded_by_name)
    values
      (v_c.id, 'payment', p_amount_cents, p_method, p_paid_on, now(), auth.uid(), public.change_log_actor_name())
    returning id into v_payment_id;

    update public.star_candidates c set version = c.version + 1 where c.id = v_c.id
    returning c.version into v_version;

    perform set_config('tkd.action', '', true);
    perform set_config('tkd.batch_id', '', true);

    perform public.star_purge_old_signatures();

    return jsonb_build_object('status', 'ok', 'payment_id', v_payment_id, 'version', v_version);
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

revoke execute on function public.star_record_payment(uuid, integer, text, integer, date) from public, anon, authenticated, service_role;
grant  execute on function public.star_record_payment(uuid, integer, text, integer, date) to authenticated;

-- 18v. star_undo_payment(p_payment_id)   S (own, within 10 s) / A
-- Writes a reversal of a payment OR a refund (the row stays; the two add
-- up to 0). Who may: the staff member who recorded it less than 10
-- seconds ago (the toast's Undo); otherwise admins only (not_allowed).
-- A reversal can't be undone (invalid); already reversed -> stale; a
-- PAYMENT while the candidate has a refund that isn't reversed -> invalid
-- (undo the refund first, so the total can't go below zero).
-- The candidate's version goes up.
-- locks: event (no key update) -> candidate (update) -> payment (update)
-- Ok: {"status":"ok","version":n}
create or replace function public.star_undo_payment(p_payment_id uuid)
returns jsonb
language plpgsql
volatile
security definer
set search_path = ''
as $$
declare
  v_p          public.star_payments;
  v_version    integer;
  v_constraint text;
begin
  begin
    if public.has_data_access() is not true then
      return jsonb_build_object('status', 'no_access');
    end if;

    if p_payment_id is null then
      return jsonb_build_object('status', 'invalid');
    end if;

    v_p := public.star_lock_payment(p_payment_id);
    if v_p.id is null then
      return jsonb_build_object('status', 'not_found');
    end if;
    if not (v_p.recorded_by is not distinct from auth.uid() and v_p.recorded_at > now() - interval '10 seconds')
       and public.is_admin() is not true then
      return jsonb_build_object('status', 'not_allowed');
    end if;
    if v_p.kind = 'reversal' then
      return jsonb_build_object('status', 'invalid');
    end if;
    if exists (select 1 from public.star_payments x where x.reverses_payment_id = v_p.id) then
      return jsonb_build_object('status', 'stale');
    end if;
    if v_p.kind = 'payment'
       and exists (select 1 from public.star_payments r
                    where r.candidate_id = v_p.candidate_id and r.kind = 'refund'
                      and not exists (select 1 from public.star_payments x where x.reverses_payment_id = r.id)) then
      return jsonb_build_object('status', 'invalid');
    end if;

    perform set_config('tkd.action', 'star_undo_payment', true);
    perform set_config('tkd.batch_id', gen_random_uuid()::text, true);

    insert into public.star_payments
      (candidate_id, kind, amount_cents, method, paid_on, recorded_at, recorded_by, recorded_by_name,
       reverses_payment_id)
    values
      (v_p.candidate_id, 'reversal', -v_p.amount_cents, v_p.method, public.testing_today(), now(), auth.uid(),
       public.change_log_actor_name(), v_p.id);

    update public.star_candidates c set version = c.version + 1 where c.id = v_p.candidate_id
    returning c.version into v_version;

    perform set_config('tkd.action', '', true);
    perform set_config('tkd.batch_id', '', true);

    return jsonb_build_object('status', 'ok', 'version', v_version);
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

revoke execute on function public.star_undo_payment(uuid) from public, anon, authenticated, service_role;
grant  execute on function public.star_undo_payment(uuid) to authenticated;

-- 18w. star_edit_payment(p_payment_id, p_method, p_amount_cents,
--        p_paid_on)   A
-- Edit payment = a reversal of the old payment + a new payment with the
-- new method / amount / date (the date not before the candidate's
-- registered day, v0.175). Only a payment (not a refund or reversal:
-- invalid); already reversed -> stale; the candidate has a refund that
-- isn't reversed -> invalid (undo the refund first).
-- locks: event (no key update) -> candidate (update) -> payment (update)
-- Ok: {"status":"ok","payment_id":<the new payment>,"version":n}
create or replace function public.star_edit_payment(
  p_payment_id   uuid,
  p_method       text,
  p_amount_cents integer,
  p_paid_on      date
)
returns jsonb
language plpgsql
volatile
security definer
set search_path = ''
as $$
declare
  v_p          public.star_payments;
  v_new_id     uuid;
  v_version    integer;
  v_constraint text;
begin
  begin
    if public.has_data_access() is not true then
      return jsonb_build_object('status', 'no_access');
    end if;
    if public.is_admin() is not true then
      return jsonb_build_object('status', 'not_allowed');
    end if;

    if p_payment_id is null
       or p_method is null or p_method not in ('cash', 'check', 'card')
       or p_amount_cents is null or p_amount_cents not between 1 and 100000
       or p_paid_on is null or p_paid_on > public.testing_today() then
      return jsonb_build_object('status', 'invalid');
    end if;

    v_p := public.star_lock_payment(p_payment_id);
    if v_p.id is null then
      return jsonb_build_object('status', 'not_found');
    end if;
    if v_p.kind <> 'payment' then
      return jsonb_build_object('status', 'invalid');
    end if;
    if exists (select 1 from public.star_payments x where x.reverses_payment_id = v_p.id) then
      return jsonb_build_object('status', 'stale');
    end if;
    if exists (select 1 from public.star_payments r
                where r.candidate_id = v_p.candidate_id and r.kind = 'refund'
                  and not exists (select 1 from public.star_payments x where x.reverses_payment_id = r.id)) then
      return jsonb_build_object('status', 'invalid');
    end if;
    -- "Date paid" never before the day the candidate registered (v0.175)
    if p_paid_on < (select public.testing_school_date(c.registered_at)
                      from public.star_candidates c where c.id = v_p.candidate_id) then
      return jsonb_build_object('status', 'invalid');
    end if;

    perform set_config('tkd.action', 'star_edit_payment', true);
    perform set_config('tkd.batch_id', gen_random_uuid()::text, true);

    insert into public.star_payments
      (candidate_id, kind, amount_cents, method, paid_on, recorded_at, recorded_by, recorded_by_name,
       reverses_payment_id)
    values
      (v_p.candidate_id, 'reversal', -v_p.amount_cents, v_p.method, public.testing_today(), now(), auth.uid(),
       public.change_log_actor_name(), v_p.id);

    insert into public.star_payments
      (candidate_id, kind, amount_cents, method, paid_on, recorded_at, recorded_by, recorded_by_name)
    values
      (v_p.candidate_id, 'payment', p_amount_cents, p_method, p_paid_on, now(), auth.uid(),
       public.change_log_actor_name())
    returning id into v_new_id;

    update public.star_candidates c set version = c.version + 1 where c.id = v_p.candidate_id
    returning c.version into v_version;

    perform set_config('tkd.action', '', true);
    perform set_config('tkd.batch_id', '', true);

    return jsonb_build_object('status', 'ok', 'payment_id', v_new_id, 'version', v_version);
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

revoke execute on function public.star_edit_payment(uuid, text, integer, date) from public, anon, authenticated, service_role;
grant  execute on function public.star_edit_payment(uuid, text, integer, date) to authenticated;

-- 18x. star_record_refund(p_candidate_id, p_expected_version, p_method,
--        p_amount_cents, p_refunded_on)   A (S7)
-- A refund of an OVERPAID amount (e.g. paid the private fee, then "Back
-- to the testing day"): its own negative row, cash or check, with its own
-- date (v0.166; not before the candidate's registered day, v0.175). Not
-- overpaid, or more than the overpaid amount ->
-- {"status":"refund_too_large","overpaid_cents":n}. The candidate's
-- version goes up.
-- locks: event (no key update) -> candidate (update)
-- Ok: {"status":"ok","payment_id":...,"version":n}
create or replace function public.star_record_refund(
  p_candidate_id     uuid,
  p_expected_version integer,
  p_method           text,
  p_amount_cents     integer,
  p_refunded_on      date
)
returns jsonb
language plpgsql
volatile
security definer
set search_path = ''
as $$
declare
  v_c          public.star_candidates;
  v_paid       integer;
  v_overpaid   integer;
  v_payment_id uuid;
  v_version    integer;
  v_constraint text;
begin
  begin
    if public.has_data_access() is not true then
      return jsonb_build_object('status', 'no_access');
    end if;
    if public.is_admin() is not true then
      return jsonb_build_object('status', 'not_allowed');
    end if;

    if p_candidate_id is null or p_expected_version is null
       or p_method is null or p_method not in ('cash', 'check')
       or p_amount_cents is null or p_amount_cents not between 1 and 100000
       or p_refunded_on is null or p_refunded_on > public.testing_today() then
      return jsonb_build_object('status', 'invalid');
    end if;

    v_c := public.star_lock_candidate(p_candidate_id);
    if v_c.id is null then
      return jsonb_build_object('status', 'not_found');
    end if;
    if v_c.version <> p_expected_version then
      return jsonb_build_object('status', 'stale');
    end if;
    if v_c.status = 'withdrawn' then
      return jsonb_build_object('status', 'withdrawn');
    end if;
    -- the refund date never before the day the candidate registered (v0.175)
    if p_refunded_on < public.testing_school_date(v_c.registered_at) then
      return jsonb_build_object('status', 'invalid');
    end if;
    v_paid := public.star_net_paid_cents(v_c.id);
    v_overpaid := case when v_paid > 0 then greatest(v_paid - public.star_expected_fee_cents(v_c.id), 0) else 0 end;
    if v_overpaid = 0 or p_amount_cents > v_overpaid then
      return jsonb_build_object('status', 'refund_too_large', 'overpaid_cents', v_overpaid);
    end if;

    perform set_config('tkd.action', 'star_record_refund', true);
    perform set_config('tkd.batch_id', gen_random_uuid()::text, true);

    insert into public.star_payments
      (candidate_id, kind, amount_cents, method, paid_on, recorded_at, recorded_by, recorded_by_name)
    values
      (v_c.id, 'refund', -p_amount_cents, p_method, p_refunded_on, now(), auth.uid(), public.change_log_actor_name())
    returning id into v_payment_id;

    update public.star_candidates c set version = c.version + 1 where c.id = v_c.id
    returning c.version into v_version;

    perform set_config('tkd.action', '', true);
    perform set_config('tkd.batch_id', '', true);

    return jsonb_build_object('status', 'ok', 'payment_id', v_payment_id, 'version', v_version);
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

revoke execute on function public.star_record_refund(uuid, integer, text, integer, date) from public, anon, authenticated, service_role;
grant  execute on function public.star_record_refund(uuid, integer, text, integer, date) to authenticated;

-- 0006's star_event_results (0006 section 19e), word for word:

-- 19e. star_event_results(p_event_id, p_dan)   S   (v0.138-v0.150, v0.158)
-- The Results tab (and the Grading grid's Total / Result, the printed
-- sheets) for one Dan: the counts and one row per ACTIVE candidate of
-- that Dan in belt order - the result (12g) plus names, school and the
-- sent state. A Dan not in the event's copy -> invalid.
-- Ok: {"status":"ok","dan":n,"pass_mark":n,"max_score":n,
--      "counts":{candidates, passed, makeup, not_finished, testing_privately},
--      "rows":[result + {first_name, last_name, location_code, sent}]}
-- locks: none (a read)
create or replace function public.star_event_results(p_event_id uuid, p_dan integer)
returns jsonb
language plpgsql
stable
security definer
set search_path = ''
as $$
declare
  v_d     public.star_event_dans;
  v_aplus numeric;
  v_rows  jsonb;
begin
  begin
    if public.has_data_access() is not true then
      return jsonb_build_object('status', 'no_access');
    end if;
    if p_event_id is null or p_dan is null then
      return jsonb_build_object('status', 'invalid');
    end if;
    if not exists (select 1 from public.star_events e where e.id = p_event_id) then
      return jsonb_build_object('status', 'not_found');
    end if;
    select * into v_d from public.star_event_dans d where d.event_id = p_event_id and d.dan = p_dan;
    if not found then
      return jsonb_build_object('status', 'invalid');
    end if;
    select v.value into v_aplus from public.star_event_grades v where v.event_id = p_event_id and v.grade = 'A+';

    select coalesce(jsonb_agg(x.row order by x.stars_from, x.loc_order, x.last_key, x.first_key, x.id), '[]'::jsonb)
      into v_rows
      from (select c.id, c.stars_from,
                   case c.location_code when 'shrewsbury' then 0 else 1 end as loc_order,
                   lower(c.last_name) as last_key, lower(c.first_name) as first_key,
                   r.res || jsonb_build_object('first_name', c.first_name, 'last_name', c.last_name,
                                               'location_code', c.location_code,
                                               'sent', public.star_sent_state(c.id, r.res)) as row
              from public.star_candidates c
              cross join lateral (select public.star_candidate_result(c.id) as res) as r
             where c.event_id = p_event_id and c.dan = p_dan and c.status = 'active') as x;

    return jsonb_build_object(
      'status', 'ok',
      'dan', p_dan,
      'pass_mark', v_d.pass_mark,
      'max_score', round(coalesce((select sum(k.credits) from public.star_event_categories k
                                    where k.event_id = p_event_id and k.dan = p_dan), 0) * coalesce(v_aplus, 0), 1),
      'counts', jsonb_build_object(
                  'candidates',        jsonb_array_length(v_rows),
                  'passed',            (select count(*) from jsonb_array_elements(v_rows) as t(v) where t.v ->> 'status' = 'passed'),
                  'makeup',            (select count(*) from jsonb_array_elements(v_rows) as t(v) where t.v ->> 'status' = 'makeup'),
                  'not_finished',      (select count(*) from jsonb_array_elements(v_rows) as t(v) where t.v ->> 'status' = 'not_finished'),
                  'testing_privately', (select count(*) from jsonb_array_elements(v_rows) as t(v) where t.v ->> 'status' = 'testing_privately')),
      'rows', v_rows);
  exception
    -- the same mapping as the write functions (section 18): a rare table
    -- rule or lock problem answers a status instead of an error, and
    -- everything this call did (for the CSV: its download row) is undone
    when unique_violation then
      return jsonb_build_object('status', 'stale');
    when foreign_key_violation or check_violation or not_null_violation then
      return jsonb_build_object('status', 'invalid');
    when deadlock_detected or serialization_failure or lock_not_available then
      return jsonb_build_object('status', 'stale');
  end;
end;
$$;

revoke execute on function public.star_event_results(uuid, integer) from public, anon, authenticated, service_role;
grant  execute on function public.star_event_results(uuid, integer) to authenticated;

-- 0023's star_results_csv (0023 section 7), word for word:

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

-- ---------------------------------------------------------------------
-- 3. The Candidates view: 0006's again (no paying_by_on_form). A view
--    can't lose a column with "create or replace", so it is removed and
--    made again (nothing depends on it), with 0006 section 15's rights.
-- ---------------------------------------------------------------------
drop view if exists public.star_roster;

-- 0006 section 14, word for word:
create or replace view public.star_roster
with (security_invoker = true)
as
select x.*,
       case x.fee_kind
         when 'none' then 0
         when 'private' then x.private_cents
         when 'standard' then x.standard_cents
         else x.same_day_cents
       end as expected_fee_cents,
       case when x.paid
            then greatest(x.paid_cents - case x.fee_kind
                                           when 'none' then 0
                                           when 'private' then x.private_cents
                                           when 'standard' then x.standard_cents
                                           else x.same_day_cents
                                         end, 0)
            else 0
       end as overpaid_cents
  from (
    select c.id,
           c.event_id,
           c.first_name,
           c.last_name,
           c.location_code,
           c.dan,
           c.stars_from,
           c.paying_by,
           c.source,
           c.reference,
           c.registered_at,
           c.status,
           c.withdrawn_reason,
           c.withdrawn_at,
           c.withdrawn_by_name,
           c.duplicate_state,
           c.duplicate_of,
           c.is_makeup,
           c.makeup_of_candidate_id,
           c.makeup_of_event_name,
           c.private_on,
           c.private_time,
           c.classes_attended,
           c.assistant_classes,
           c.version,
           c.created_at,
           c.updated_at,
           c.created_by_name,
           c.updated_by_name,
           e.testing_date,
           d.label          as dan_label,
           d.star_limit,
           d.standard_cents,
           d.same_day_cents,
           d.private_cents,
           coalesce(t.paid_cents, 0)     as paid_cents,
           coalesce(t.paid_cents, 0) > 0 as paid,
           lp.id            as last_payment_id,
           lp.paid_on,
           lp.method        as paid_method,
           lp.recorded_at   as last_payment_recorded_at,
           lp.recorded_by_name as last_payment_recorded_by_name,
           coalesce(rf.refunded_cents, 0) as refunded_cents,
           case
             when c.is_makeup then 'none'
             when c.private_on is not null then 'private'
             when coalesce(t.paid_cents, 0) > 0 then
               case when lp.paid_on < e.testing_date then 'standard' else 'same_day' end
             when (now() at time zone 'America/New_York')::date < e.testing_date then 'standard'
             else 'same_day'
           end as fee_kind
      from public.star_candidates c
      join public.star_events e     on e.id = c.event_id
      join public.star_event_dans d on d.event_id = c.event_id and d.dan = c.dan
      left join lateral (select sum(p.amount_cents)::integer as paid_cents
                           from public.star_payments p
                          where p.candidate_id = c.id) as t on true
      left join lateral (select p.id, p.paid_on, p.method, p.recorded_at, p.recorded_by_name
                           from public.star_payments p
                          where p.candidate_id = c.id
                            and p.kind = 'payment'
                            and not exists (select 1 from public.star_payments r
                                             where r.reverses_payment_id = p.id)
                          order by p.recorded_at desc, p.id desc
                          limit 1) as lp on true
      left join lateral (select (-sum(p.amount_cents))::integer as refunded_cents
                           from public.star_payments p
                          where p.candidate_id = c.id
                            and p.kind = 'refund'
                            and not exists (select 1 from public.star_payments r
                                             where r.reverses_payment_id = p.id)) as rf on true
  ) as x;

comment on view public.star_roster is
  'Star Candidates tab: candidate (no DOB, email, signature or login ids) + Dan copy + payment state and expected fee. Runs with the caller''s rights.';

revoke all on table public.star_roster from public, anon, authenticated, service_role;
grant select on public.star_roster to authenticated;

-- ---------------------------------------------------------------------
-- 4. The trigger, the table rules, the read rights and the columns
-- ---------------------------------------------------------------------
drop trigger if exists star_candidates_before_form_choice on public.star_candidates;
drop function if exists public.star_candidates_keep_form_choice();

alter table public.star_candidates drop constraint if exists star_candidates_paying_by_on_form_check;
alter table public.star_payments drop constraint if exists star_payments_paying_by_before_check;
alter table public.star_payments drop constraint if exists star_payments_school_fk;

do $$
begin
  if exists (select 1 from pg_attribute a
              where a.attrelid = 'public.star_candidates'::regclass and a.attname = 'paying_by_on_form' and not a.attisdropped) then
    revoke select (paying_by_on_form) on public.star_candidates from authenticated;
  end if;
  if exists (select 1 from pg_attribute a
              where a.attrelid = 'public.star_payments'::regclass and a.attname = 'school' and not a.attisdropped) then
    revoke select (school) on public.star_payments from authenticated;
  end if;
end
$$;

alter table public.star_candidates drop column if exists paying_by_on_form;
alter table public.star_payments drop column if exists paying_by_before;
alter table public.star_payments drop column if exists school;

commit;

-- End of 0038u_undo_star_design_review.sql
