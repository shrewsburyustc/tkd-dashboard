-- =====================================================================
-- 0033u_undo_camps_design_review.sql   (UNDO of migration 0033)
-- ---------------------------------------------------------------------
-- WHAT THIS FILE IS
--   Takes migration 0033 (Camps design review: Mark paid with a way to
--   pay, Camper history) back out and puts back the exact earlier code:
--     * camp_camper_history and camp_history_strip are removed, and the
--       index change_log_camp_camper_idx;
--     * the trigger camp_campers_before_form_choice and its function
--       camp_campers_keep_form_choice are removed;
--     * the view camp_roster is removed and made again exactly as 0013
--       made it (0013 section 15, word for word, with its comment and
--       rights) - it has to go first, because it reads the column below;
--     * the two new columns are removed, with their rules and rights:
--       camp_campers.paying_by_on_form (the family form's choice - it is
--       still in each camper's history, in the camper's insert row) and
--       camp_payments.paying_by_before (what Undo payment would have put
--       back; after the undo, Undo payment never changes Paying by again,
--       as before 0033);
--     * the 4-input camp_mark_paid is removed and 0013's 3-input one made
--       again (0013 section 20j, word for word, with its revoke and
--       grant); camp_undo_payment comes back as 0013's (20k) and
--       camp_edit_payment as 0022's (20l), word for word.
--   Paying by values that Mark paid / Edit payment changed stay as they
--   are (each change is in the history). Payments stay.
--
-- BEFORE YOU PASTE IT
--   The app version that sends p_method or reads camp_camper_history /
--   paying_by_on_form must NOT be live: it would get errors (Mark paid
--   with a way, the History line, the roster's column list).
--   Paste it ONLY with Jeffrey's OK (supabase/SETUP.md, Migration 0033,
--   0033f). Supabase warns about destructive operations: here they are
--   real (two columns, one view, three functions, one trigger, one
--   index). Confirm only if you mean it.
--
-- AFTERWARDS
--   0013_fingerprints.sql and 0022_fingerprints.sql must match their
--   records from before 0033 (SETUP 0033a), and the pre-apply check must
--   answer as before 0033 again. Tested in PGlite (run.mjs step0033). To
--   redo: paste 0033 again. One transaction: on any error nothing is kept.
-- =====================================================================

begin;

-- 1. The history reader, its helper and its index
drop function if exists public.camp_camper_history(uuid);
drop function if exists public.camp_history_strip(jsonb);
drop index if exists public.change_log_camp_camper_idx;

-- 2. The trigger that keeps the form's choice
drop trigger if exists camp_campers_before_form_choice on public.camp_campers;
drop function if exists public.camp_campers_keep_form_choice();

-- 3. The roster view goes first (it reads paying_by_on_form), then the
--    two columns (their rules and column rights go with them)
drop view if exists public.camp_roster;
alter table public.camp_campers  drop column if exists paying_by_on_form;
alter table public.camp_payments drop column if exists paying_by_before;

-- 4. 0013's roster view (section 15), word for word, with its rights
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
       lp.recorded_at                   as last_payment_recorded_at
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
                      limit 1) as lp on true;

comment on view public.camp_roster is
  'Camp roster rows: camper + sign-up reference + days (check-in) + extras + payment state. No phones, signature, waiver copy, submission id or login ids. Runs with the caller''s rights.';

revoke all on table public.camp_roster from public, anon, authenticated, service_role;
grant select on public.camp_roster to authenticated;

-- 5. 0013's 3-input camp_mark_paid (section 20j), word for word
drop function if exists public.camp_mark_paid(uuid, integer, text, text);

-- 20j. camp_mark_paid(p_camper_id, p_expected_version, p_school)   S
-- "Mark paid" / "Mark paid $X": one click records exactly what is OWED
-- now (total - paid), method = the camper's paying_by, paid_on = today,
-- school = p_school: the school whose desk took the money (v0.707; the
-- app sends the device's school, or asks on the Both view). Any school in
-- public.locations is accepted, else {"status":"invalid","field":"school"}.
-- Refused for a withdrawn camper (withdrawn) or one who owes nothing
-- (already_paid). The camper's version goes up, so a double click with
-- the old version gets "stale". Last step: the signature clean-up (17a).
-- Ok: {"status":"ok","payment_id":...,"amount_cents":n,"method":"cash","school":"...","version":n}
create or replace function public.camp_mark_paid(
  p_camper_id        uuid,
  p_expected_version integer,
  p_school           text
)
returns jsonb
language plpgsql
volatile
security definer
set search_path = ''
as $$
declare
  v_c          public.camp_campers;
  v_amount     integer;
  v_payment_id uuid;
  v_version    integer;
begin
  begin
    if public.has_data_access() is not true then
      return jsonb_build_object('status', 'no_access');
    end if;

    if p_camper_id is null or p_expected_version is null then
      return jsonb_build_object('status', 'invalid');
    end if;
    if p_school is null or not exists (select 1 from public.locations l where l.code = p_school) then
      return jsonb_build_object('status', 'invalid', 'field', 'school');
    end if;

    v_c := public.camp_lock_camper(p_camper_id);
    if v_c.id is null then
      return jsonb_build_object('status', 'not_found');
    end if;
    if v_c.version <> p_expected_version then
      return jsonb_build_object('status', 'stale');
    end if;
    if v_c.status = 'withdrawn' then
      return jsonb_build_object('status', 'withdrawn');
    end if;
    v_amount := public.camp_camper_total_cents(v_c.id) - public.camp_camper_paid_cents(v_c.id);
    if v_amount <= 0 then
      return jsonb_build_object('status', 'already_paid');
    end if;

    perform set_config('tkd.action', 'camp_mark_paid', true);
    perform set_config('tkd.batch_id', gen_random_uuid()::text, true);

    insert into public.camp_payments
      (camper_id, kind, amount_cents, method, paid_on, school, recorded_at, recorded_by, recorded_by_name)
    values
      (v_c.id, 'payment', v_amount, v_c.paying_by, public.testing_today(), p_school, now(), auth.uid(),
       public.change_log_actor_name())
    returning id into v_payment_id;

    update public.camp_campers c
       set version = c.version + 1
     where c.id = v_c.id
    returning c.version into v_version;

    perform set_config('tkd.action', '', true);
    perform set_config('tkd.batch_id', '', true);

    perform public.camp_purge_old_signatures();

    return jsonb_build_object('status', 'ok', 'payment_id', v_payment_id, 'amount_cents', v_amount,
                              'method', v_c.paying_by, 'school', p_school, 'version', v_version);
  exception
    when unique_violation then
      return jsonb_build_object('status', 'stale');
    when foreign_key_violation or check_violation or not_null_violation or data_exception then
      return jsonb_build_object('status', 'invalid');
    when deadlock_detected or serialization_failure or lock_not_available then
      return jsonb_build_object('status', 'stale');
  end;
end;
$$;

revoke execute on function public.camp_mark_paid(uuid, integer, text) from public, anon, authenticated, service_role;
grant  execute on function public.camp_mark_paid(uuid, integer, text) to authenticated;

-- 6. 0013's camp_undo_payment (section 20k), word for word

-- 20k. camp_undo_payment(p_payment_id)   A (own, within 10 s: S)
-- Writes a reversal for a payment (the payment row stays; the two add up
-- to 0). Who may: admins (the roster's ... -> Undo payment), or the staff
-- member who recorded it less than 10 seconds ago (the Mark paid toast's
-- Undo) - the database decides from recorded_by and recorded_at; anyone
-- else -> not_allowed. Already reversed, or a reversal itself -> stale.
-- The camper's version goes up.
-- Ok: {"status":"ok","version":n}  (the camper's new version)
create or replace function public.camp_undo_payment(p_payment_id uuid)
returns jsonb
language plpgsql
volatile
security definer
set search_path = ''
as $$
declare
  v_p       public.camp_payments;
  v_version integer;
begin
  begin
    if public.has_data_access() is not true then
      return jsonb_build_object('status', 'no_access');
    end if;

    if p_payment_id is null then
      return jsonb_build_object('status', 'invalid');
    end if;

    v_p := public.camp_lock_payment(p_payment_id);
    if v_p.id is null then
      return jsonb_build_object('status', 'not_found');
    end if;
    if not coalesce(v_p.recorded_by = auth.uid() and v_p.recorded_at > now() - interval '10 seconds', false)
       and public.is_admin() is not true then
      return jsonb_build_object('status', 'not_allowed');
    end if;
    if v_p.kind <> 'payment'
       or exists (select 1 from public.camp_payments x where x.reverses_payment_id = p_payment_id) then
      return jsonb_build_object('status', 'stale');
    end if;

    perform set_config('tkd.action', 'camp_undo_payment', true);
    perform set_config('tkd.batch_id', gen_random_uuid()::text, true);

    insert into public.camp_payments
      (camper_id, kind, amount_cents, method, paid_on, school, recorded_at, recorded_by, recorded_by_name, reverses_payment_id)
    values
      (v_p.camper_id, 'reversal', -v_p.amount_cents, v_p.method, public.testing_today(), v_p.school, now(), auth.uid(),
       public.change_log_actor_name(), v_p.id);

    update public.camp_campers c
       set version = c.version + 1
     where c.id = v_p.camper_id
    returning c.version into v_version;

    perform set_config('tkd.action', '', true);
    perform set_config('tkd.batch_id', '', true);

    return jsonb_build_object('status', 'ok', 'version', v_version);
  exception
    when unique_violation then
      return jsonb_build_object('status', 'stale');
    when foreign_key_violation or check_violation or not_null_violation or data_exception then
      return jsonb_build_object('status', 'invalid');
    when deadlock_detected or serialization_failure or lock_not_available then
      return jsonb_build_object('status', 'stale');
  end;
end;
$$;

revoke execute on function public.camp_undo_payment(uuid) from public, anon, authenticated, service_role;
grant  execute on function public.camp_undo_payment(uuid) to authenticated;

-- 7. 0022's camp_edit_payment (section 20l), word for word

-- 20l. camp_edit_payment(p_payment_id, p_method, p_amount_cents, p_paid_on,
--        p_school)   A
-- Edit payment = a reversal of the old payment (at the old school) + a new
-- payment with the new method / amount (1 cent to $10,000 - 0022: was $2,000) / date (not in
-- the future) / school (v0.707: correct the desk that took it; any school
-- in public.locations, else {"status":"invalid","field":"school"}).
-- Already reversed -> stale; a reversal can't be edited (invalid, as 0005).
-- Ok: {"status":"ok","payment_id":<the new payment>,"version":n}
create or replace function public.camp_edit_payment(
  p_payment_id   uuid,
  p_method       text,
  p_amount_cents integer,
  p_paid_on      date,
  p_school       text
)
returns jsonb
language plpgsql
volatile
security definer
set search_path = ''
as $$
declare
  v_p       public.camp_payments;
  v_new_id  uuid;
  v_version integer;
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
       or p_amount_cents is null or p_amount_cents not between 1 and 1000000   -- 0022: was 200000
       or p_paid_on is null or p_paid_on > public.testing_today() then
      return jsonb_build_object('status', 'invalid');
    end if;
    if p_school is null or not exists (select 1 from public.locations l where l.code = p_school) then
      return jsonb_build_object('status', 'invalid', 'field', 'school');
    end if;

    v_p := public.camp_lock_payment(p_payment_id);
    if v_p.id is null then
      return jsonb_build_object('status', 'not_found');
    end if;
    if v_p.kind <> 'payment' then
      return jsonb_build_object('status', 'invalid');
    end if;
    if exists (select 1 from public.camp_payments x where x.reverses_payment_id = p_payment_id) then
      return jsonb_build_object('status', 'stale');
    end if;

    perform set_config('tkd.action', 'camp_edit_payment', true);
    perform set_config('tkd.batch_id', gen_random_uuid()::text, true);

    insert into public.camp_payments
      (camper_id, kind, amount_cents, method, paid_on, school, recorded_at, recorded_by, recorded_by_name, reverses_payment_id)
    values
      (v_p.camper_id, 'reversal', -v_p.amount_cents, v_p.method, public.testing_today(), v_p.school, now(), auth.uid(),
       public.change_log_actor_name(), v_p.id);

    insert into public.camp_payments
      (camper_id, kind, amount_cents, method, paid_on, school, recorded_at, recorded_by, recorded_by_name)
    values
      (v_p.camper_id, 'payment', p_amount_cents, p_method, p_paid_on, p_school, now(), auth.uid(),
       public.change_log_actor_name())
    returning id into v_new_id;

    update public.camp_campers c
       set version = c.version + 1
     where c.id = v_p.camper_id
    returning c.version into v_version;

    perform set_config('tkd.action', '', true);
    perform set_config('tkd.batch_id', '', true);

    return jsonb_build_object('status', 'ok', 'payment_id', v_new_id, 'version', v_version);
  exception
    when unique_violation then
      return jsonb_build_object('status', 'stale');
    when foreign_key_violation or check_violation or not_null_violation or data_exception then
      return jsonb_build_object('status', 'invalid');
    when deadlock_detected or serialization_failure or lock_not_available then
      return jsonb_build_object('status', 'stale');
  end;
end;
$$;

revoke execute on function public.camp_edit_payment(uuid, text, integer, date, text) from public, anon, authenticated, service_role;
grant  execute on function public.camp_edit_payment(uuid, text, integer, date, text) to authenticated;

commit;

-- End of 0033u_undo_camps_design_review.sql
