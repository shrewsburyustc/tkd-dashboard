-- =====================================================================
-- 0035u_undo_color_belt_cleanup.sql   (UNDO of migration 0035)
-- ---------------------------------------------------------------------
-- WHAT THIS FILE IS
--   Puts back the two old one-click Mark paid functions that 0035
--   removed, exactly as they were live before 0035:
--     public.testing_mark_paid(uuid, integer)          - 0005 section 14i
--     public.testing_private_mark_paid(uuid, integer)  - 0014 section 8e
--   Each is copied word for word from its migration (the same code that
--   was live: body md5 6b4346eb5d04f2866170f54724f8988d and
--   a8dfaf7f8166a45d3eb7f8cc15f0d0cd, checked on production 2026-11-04),
--   with its exact revoke and grant: only authenticated (and the owner)
--   may run them, nothing for anon or service_role. No later migration
--   had replaced either one.
--   Nothing else changes: 0030's testing_mark_paid_by and
--   testing_private_mark_paid_by stay, and the app keeps calling those.
--
-- WHEN
--   Only with Jeffrey's OK (supabase/SETUP.md, Migration 0035, 0035e) -
--   e.g. if an app version that still calls the old functions must go
--   live again. The app does not need to be rolled back for this undo.
--
-- AFTERWARDS
--   0035_preapply_check.sql answers as before 0035, and 0003_, 0005_ and
--   0014_fingerprints.sql equal the records written down before 0035
--   (SETUP 0035a). Tested in PGlite (run.mjs step0035). To redo: paste
--   0035 again. One transaction: on any error nothing is kept. Nothing is
--   removed, so Supabase should not warn.
-- =====================================================================

begin;


-- ---------------------------------------------------------------------
-- 1. The guard: the two functions need 0005's and 0014's tables and
--    helpers. Stops - and changes nothing - if one is missing.
-- ---------------------------------------------------------------------
do $$
begin
  if to_regclass('public.testing_registrations') is null
     or to_regclass('public.testing_private') is null
     or to_regprocedure('public.testing_lock_registration(uuid)') is null
     or to_regprocedure('public.testing_private_lock(uuid)') is null
     or to_regprocedure('public.testing_private_amount_due(uuid)') is null
     or to_regprocedure('public.testing_fee_cents(integer, integer, date, date)') is null
     or to_regprocedure('public.testing_purge_old_signatures()') is null then
    raise exception '0035u needs migrations 0005 and 0014 (Color Belt testing) first';
  end if;
end
$$;


-- ---------------------------------------------------------------------
-- 2. 0005's testing_mark_paid, word for word (0005 section 14i)
-- ---------------------------------------------------------------------

-- 14i. testing_mark_paid(p_registration_id, p_expected_version)   S
-- "Mark paid" (plan answer 6): one click records the FULL fee -
--   amount  = the event copy's early price if today (Massachusetts) is
--             before the testing date, else the testing-day price (1f)
--   method  = the registration's paying_by
--   paid_on = today
-- Allowed in every event state, Finished included. Refused for a
-- withdrawn student (withdrawn) or one already paid (already_paid). The
-- registration's version goes up, so a double click with the old version
-- gets "stale". Last step: the signature clean-up (12a).
-- Ok: {"status":"ok","payment_id":...,"amount_cents":n,"method":"cash","version":n}
create or replace function public.testing_mark_paid(
  p_registration_id  uuid,
  p_expected_version integer
)
returns jsonb
language plpgsql
volatile
security definer
set search_path = ''
as $$
declare
  v_r          public.testing_registrations;
  v_today      date;
  v_amount     integer;
  v_payment_id uuid;
  v_version    integer;
  v_constraint text;
begin
  begin
    if public.has_data_access() is not true then
      return jsonb_build_object('status', 'no_access');
    end if;

    if p_registration_id is null or p_expected_version is null then
      return jsonb_build_object('status', 'invalid');
    end if;

    v_r := public.testing_lock_registration(p_registration_id);
    if v_r.id is null then
      return jsonb_build_object('status', 'not_found');
    end if;
    if v_r.version <> p_expected_version then
      return jsonb_build_object('status', 'stale');
    end if;
    if v_r.status = 'withdrawn' then
      return jsonb_build_object('status', 'withdrawn');
    end if;
    if (select coalesce(sum(p.amount_cents), 0) from public.testing_payments p
         where p.registration_id = p_registration_id) > 0 then
      return jsonb_build_object('status', 'already_paid');
    end if;

    v_today := public.testing_today();
    select public.testing_fee_cents(k.early_cents, k.day_cents, v_today, e.testing_date)
      into v_amount
      from public.testing_event_ranks k, public.testing_events e
     where k.id = v_r.event_rank_id and e.id = v_r.event_id;

    perform set_config('tkd.action', 'mark_paid', true);
    perform set_config('tkd.batch_id', gen_random_uuid()::text, true);

    insert into public.testing_payments
      (registration_id, kind, amount_cents, method, paid_on, recorded_at, recorded_by, recorded_by_name)
    values
      (p_registration_id, 'payment', v_amount, v_r.paying_by, v_today, now(), auth.uid(),
       public.change_log_actor_name())
    returning id into v_payment_id;

    update public.testing_registrations r
       set version = r.version + 1
     where r.id = p_registration_id
    returning r.version into v_version;

    perform set_config('tkd.action', '', true);
    perform set_config('tkd.batch_id', '', true);

    perform public.testing_purge_old_signatures();

    return jsonb_build_object('status', 'ok', 'payment_id', v_payment_id, 'amount_cents', v_amount,
                              'method', v_r.paying_by, 'version', v_version);
  exception
    when unique_violation then
      return jsonb_build_object('status', 'stale');
    when foreign_key_violation then
      return jsonb_build_object('status', 'invalid');
    when check_violation or not_null_violation then
      return jsonb_build_object('status', 'invalid');
    when deadlock_detected or serialization_failure or lock_not_available then
      return jsonb_build_object('status', 'stale');
  end;
end;
$$;

revoke execute on function public.testing_mark_paid(uuid, integer) from public, anon, authenticated, service_role;
grant  execute on function public.testing_mark_paid(uuid, integer) to authenticated;


-- ---------------------------------------------------------------------
-- 3. 0014's testing_private_mark_paid, word for word (0014 section 8e)
-- ---------------------------------------------------------------------

-- 8e. testing_private_mark_paid(p_private_id, p_expected_version)   S
-- "Mark paid": one click records what is OWED (7a) - the full private
-- price when nothing is paid, or just the difference - by the current
-- paying by, dated today. Nothing owed (also a $0 price) -> already_paid
-- and nothing is inserted. The version goes up, so a double click with
-- the old version gets "stale".
-- Ok: {"status":"ok","payment_id":...,"amount_cents":n,"method":"cash","version":n}
create or replace function public.testing_private_mark_paid(
  p_private_id       uuid,
  p_expected_version integer
)
returns jsonb
language plpgsql
volatile
security definer
set search_path = ''
as $$
declare
  v_p          public.testing_private;
  v_amount     integer;
  v_payment_id uuid;
  v_version    integer;
  v_constraint text;
begin
  begin
    if public.has_data_access() is not true then
      return jsonb_build_object('status', 'no_access');
    end if;

    if p_private_id is null or p_expected_version is null then
      return jsonb_build_object('status', 'invalid');
    end if;

    v_p := public.testing_private_lock(p_private_id);
    if v_p.id is null then
      return jsonb_build_object('status', 'not_found');
    end if;
    if v_p.version <> p_expected_version then
      return jsonb_build_object('status', 'stale');
    end if;
    if v_p.status = 'cancelled' then
      return jsonb_build_object('status', 'cancelled');
    end if;
    v_amount := public.testing_private_amount_due(p_private_id);
    if coalesce(v_amount, 0) <= 0 then
      return jsonb_build_object('status', 'already_paid');
    end if;

    perform set_config('tkd.action', 'private_mark_paid', true);
    perform set_config('tkd.batch_id', gen_random_uuid()::text, true);

    insert into public.testing_private_payments
      (private_id, kind, amount_cents, method, paid_on, recorded_at, recorded_by, recorded_by_name)
    values
      (p_private_id, 'payment', v_amount, v_p.paying_by, public.testing_today(), now(), auth.uid(),
       public.change_log_actor_name())
    returning id into v_payment_id;

    update public.testing_private p
       set version = p.version + 1
     where p.id = p_private_id
    returning p.version into v_version;

    perform set_config('tkd.action', '', true);
    perform set_config('tkd.batch_id', '', true);

    return jsonb_build_object('status', 'ok', 'payment_id', v_payment_id, 'amount_cents', v_amount,
                              'method', v_p.paying_by, 'version', v_version);
  exception
    when unique_violation then
      return jsonb_build_object('status', 'stale');
    when foreign_key_violation then
      return jsonb_build_object('status', 'invalid');
    when check_violation or not_null_violation then
      return jsonb_build_object('status', 'invalid');
    when deadlock_detected or serialization_failure or lock_not_available then
      return jsonb_build_object('status', 'stale');
  end;
end;
$$;

revoke execute on function public.testing_private_mark_paid(uuid, integer) from public, anon, authenticated, service_role;
grant  execute on function public.testing_private_mark_paid(uuid, integer) to authenticated;


commit;
