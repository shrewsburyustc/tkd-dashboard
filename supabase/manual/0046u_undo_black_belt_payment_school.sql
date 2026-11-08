-- =====================================================================
-- 0046u_undo_black_belt_payment_school.sql   (UNDO of migration 0046)
-- ---------------------------------------------------------------------
-- WHAT THIS FILE IS
--   Takes migration 0046 (Black Belt: payments count at the desk's
--   school) back out: it removes the two functions 0046 made
--     public.bb_record_payment(uuid, integer, integer, text, text[], text, text)
--     public.bb_record_refund(uuid, integer, integer, text, text, text)
--   and puts back 0016's exact versions (sections 15o and 15r of
--   0016_black_belt.sql, word for word, with their exact revoke and
--   grant):
--     public.bb_record_payment(uuid, integer, integer, text, text[], text)
--     public.bb_record_refund(uuid, integer, integer, text, text)
--   After it Record payment stores the CANDIDATE's school again and a
--   refund the school of the latest live payment. No table or data is
--   touched: payments already recorded keep the school they were stored
--   with (the undo does not move any money between schools).
--
-- WHY A SEPARATE FILE
--   Re-running 0016 would put the same two functions back, but it re-runs
--   everything else in 0016 too (and the old and new versions would sit
--   side by side). This touches only what 0046 replaced. Paste it ONLY
--   with Jeffrey's OK (SETUP.md, Migration 0046, 0046e), and only after
--   the app is back to a version that does not send p_school (a call
--   with p_school would fail against the old functions).
--
-- AFTERWARDS
--   0016_fingerprints.sql must equal the one written down BEFORE 0046
--   (SETUP 0046a) and 0046_preapply_check.sql must answer as before 0046.
--   Tested in PGlite (run.mjs step0046). To redo: paste 0046 again. One
--   transaction: on any error nothing is kept. Supabase will warn about
--   destructive operations - the two drops are real this time.
-- =====================================================================

begin;

-- ---------------------------------------------------------------------
-- 1. The guard: 0016's payments must be there
-- ---------------------------------------------------------------------
do $$
begin
  if to_regclass('public.bb_payments') is null then
    raise exception '0046 undo needs migration 0016 (bb_payments) - nothing to undo onto';
  end if;
end
$$;

-- ---------------------------------------------------------------------
-- 2. Remove 0046's two versions
-- ---------------------------------------------------------------------
drop function if exists public.bb_record_payment(uuid, integer, integer, text, text[], text, text);
drop function if exists public.bb_record_refund(uuid, integer, integer, text, text, text);

-- ---------------------------------------------------------------------
-- 3. 0016's functions, word for word
-- ---------------------------------------------------------------------

-- 15o. bb_record_payment(p_candidate_id, p_expected_version,
--        p_amount_cents, p_method, p_for_items, p_note)   S
-- Record payment (v0.218): any amount from 1 cent to $5,000 (staff may
-- type any amount, v0.900), cash / check / card, for the ticked items
-- (p1 ... p12, kukkiwon - each of the candidate's CURRENT plan, kukkiwon
-- only when chosen), an optional note (e.g. "post-dated Apr 24"). It
-- counts today (paid_on = today, even a post-dated check, v0.218).
-- Refused: a withdrawn candidate (withdrawn, S2). Last step: the purge.
-- locks: cycle (no key update) -> candidate (update)
-- Ok: {"status":"ok","payment_id":...,"version":n,"money":{...}}
create or replace function public.bb_record_payment(
  p_candidate_id     uuid,
  p_expected_version integer,
  p_amount_cents     integer,
  p_method           text,
  p_for_items        text[],
  p_note             text
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
  v_constraint text;
begin
  begin
    if public.has_data_access() is not true then
      return jsonb_build_object('status', 'no_access');
    end if;

    v_note := public.testing_normalize_note(p_note);
    if p_candidate_id is null or p_expected_version is null
       or p_amount_cents is null or p_amount_cents not between 1 and 500000
       or p_method is null or p_method not in ('cash', 'check', 'card')
       or p_for_items is null or coalesce(array_ndims(p_for_items), 0) <> 1
       or cardinality(p_for_items) not between 1 and 13
       or array_position(p_for_items, null) is not null
       or exists (select 1 from unnest(p_for_items) as x(item) where x.item !~ '^(p([1-9]|1[0-2])|kukkiwon)$')
       or (select count(distinct x.item) from unnest(p_for_items) as x(item)) <> cardinality(p_for_items)
       or (v_note is not null and not public.testing_note_is_valid(v_note)) then
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
       v_c.location_code, v_cycle_name, now(), auth.uid(), public.change_log_actor_name())
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

revoke execute on function public.bb_record_payment(uuid, integer, integer, text, text[], text) from public, anon, authenticated, service_role;
grant  execute on function public.bb_record_payment(uuid, integer, integer, text, text[], text) to authenticated;

-- 15r. bb_record_refund(p_candidate_id, p_expected_version, p_amount_cents,
--        p_method, p_note)   A
-- Record refund: its own negative row, counted today, cash / check / card
-- (as drawn), never more than the net paid
-- ({"status":"refund_too_large","paid_cents":n}, v0.900). Allowed on
-- withdrawn candidates (S2). A refund corrects no single row, so it takes
-- the school and cycle name of the candidate's LATEST live payment (the
-- money it gives back; contract 14 OI-4).
-- locks: cycle (no key update) -> candidate (update)
-- Ok: {"status":"ok","payment_id":...,"version":n,"money":{...}}
create or replace function public.bb_record_refund(
  p_candidate_id     uuid,
  p_expected_version integer,
  p_amount_cents     integer,
  p_method           text,
  p_note             text
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
    if p_candidate_id is null or p_expected_version is null
       or p_amount_cents is null or p_amount_cents not between 1 and 500000
       or p_method is null or p_method not in ('cash', 'check', 'card')
       or (v_note is not null and not public.testing_note_is_valid(v_note)) then
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

revoke execute on function public.bb_record_refund(uuid, integer, integer, text, text) from public, anon, authenticated, service_role;
grant  execute on function public.bb_record_refund(uuid, integer, integer, text, text) to authenticated;

commit;

-- End of 0046u_undo_black_belt_payment_school.sql
