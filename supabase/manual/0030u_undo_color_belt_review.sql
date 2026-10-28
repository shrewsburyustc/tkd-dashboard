-- =====================================================================
-- 0030u_undo_color_belt_review.sql   (UNDO of migration 0030)
-- ---------------------------------------------------------------------
-- WHAT THIS FILE IS
--   Takes migration 0030 (Color Belt: Mark paid with a way to pay,
--   History, results CSV) back out:
--     1. puts back the exact live versions of the two functions 0030
--        replaced - 0005's testing_undo_payment (section 14k) and 0014's
--        testing_private_undo_payment (section 8f), copied word for word
--        with their exact revoke and grant. Undo payment then no longer
--        puts "Paying by" back.
--     2. removes 0030's new functions: testing_mark_paid_by,
--        testing_private_mark_paid_by, testing_registration_history,
--        testing_private_history, testing_history_strip and
--        testing_results_csv.
--     3. removes the download log public.testing_downloads (and its
--        guard function) ONLY IF IT IS EMPTY. If anyone downloaded a CSV,
--        the log stays (with its guard) and a notice says so - a record
--        of who downloaded children's results is not thrown away.
--     4. removes the paying_by_before column (and its rule) from
--        testing_payments and testing_private_payments. What it held is
--        lost: the old Undo payment never reads it. Payments, amounts,
--        methods and "Paying by" values are NOT changed.
--
-- BEFORE YOU PASTE IT
--   The app version that calls the new functions must NOT be live (roll
--   the app back first): its Mark paid box, History line and CSV button
--   would fail. Paste ONLY with Jeffrey's OK (supabase/SETUP.md,
--   Migration 0030, 0030e).
--
-- AFTERWARDS
--   0003_, 0005_ and 0014_fingerprints.sql must equal the records written
--   down BEFORE 0030 was applied (SETUP 0030a). Tested in PGlite (run.mjs
--   step0030). To redo: paste 0030 again. One transaction: on any error
--   nothing is kept. Supabase warns about destructive operations - here
--   they are real (functions, a column and possibly an empty table are
--   removed). Confirm only if you mean it.
-- =====================================================================

begin;


-- ---------------------------------------------------------------------
-- 1. The two Undo payment functions exactly as they were before 0030
-- ---------------------------------------------------------------------

-- 14k. testing_undo_payment(p_payment_id)   S (own, within 10 s) / A
-- Writes a reversal for a payment (the payment row stays; the two add up
-- to 0, so the student shows Not paid again). Who may:
--   the staff member who recorded it, less than 10 seconds ago (the toast's
--   Undo) - the database decides this from recorded_by and recorded_at;
--   otherwise admins only (not_allowed).
-- Already reversed -> stale. Undoing a reversal -> invalid. The
-- registration's version goes up.
-- Ok: {"status":"ok","version":n}  (the registration's new version)
create or replace function public.testing_undo_payment(p_payment_id uuid)
returns jsonb
language plpgsql
volatile
security definer
set search_path = ''
as $$
declare
  v_p          public.testing_payments;
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

    v_p := public.testing_lock_payment(p_payment_id);
    if v_p.id is null then
      return jsonb_build_object('status', 'not_found');
    end if;
    if not (v_p.recorded_by is not distinct from auth.uid() and v_p.recorded_at > now() - interval '10 seconds')
       and public.is_admin() is not true then
      return jsonb_build_object('status', 'not_allowed');
    end if;
    if v_p.kind <> 'payment' then
      return jsonb_build_object('status', 'invalid');
    end if;
    if exists (select 1 from public.testing_payments x where x.reverses_payment_id = p_payment_id) then
      return jsonb_build_object('status', 'stale');
    end if;

    perform set_config('tkd.action', 'undo_payment', true);
    perform set_config('tkd.batch_id', gen_random_uuid()::text, true);

    insert into public.testing_payments
      (registration_id, kind, amount_cents, method, paid_on, recorded_at, recorded_by, recorded_by_name,
       reverses_payment_id)
    values
      (v_p.registration_id, 'reversal', -v_p.amount_cents, v_p.method, public.testing_today(), now(), auth.uid(),
       public.change_log_actor_name(), v_p.id);

    update public.testing_registrations r
       set version = r.version + 1
     where r.id = v_p.registration_id
    returning r.version into v_version;

    perform set_config('tkd.action', '', true);
    perform set_config('tkd.batch_id', '', true);

    return jsonb_build_object('status', 'ok', 'version', v_version);
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

revoke execute on function public.testing_undo_payment(uuid) from public, anon, authenticated, service_role;
grant  execute on function public.testing_undo_payment(uuid) to authenticated;

-- 8f. testing_private_undo_payment(p_payment_id)   S (own, within 10 s) / A
-- Writes a reversal for a payment (0005's testing_undo_payment rules). Who
-- may: the staff member who recorded it, less than 10 seconds ago - and
-- only a payment recorded HERE, not one that arrived with a move
-- (moved_from_payment_id set); otherwise admins only (not_allowed).
-- Undoing a reversal -> invalid. Already reversed -> stale. Then a
-- cancelled private testing -> cancelled. The reversal is dated today; the
-- version goes up.
-- Ok: {"status":"ok","version":n}
create or replace function public.testing_private_undo_payment(p_payment_id uuid)
returns jsonb
language plpgsql
volatile
security definer
set search_path = ''
as $$
declare
  v_pay        public.testing_private_payments;
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

    v_pay := public.testing_private_lock_payment(p_payment_id);
    if v_pay.id is null then
      return jsonb_build_object('status', 'not_found');
    end if;
    if not (v_pay.recorded_by is not distinct from auth.uid()
            and v_pay.recorded_at > now() - interval '10 seconds'
            and v_pay.moved_from_payment_id is null)
       and public.is_admin() is not true then
      return jsonb_build_object('status', 'not_allowed');
    end if;
    if v_pay.kind <> 'payment' then
      return jsonb_build_object('status', 'invalid');
    end if;
    if exists (select 1 from public.testing_private_payments x where x.reverses_payment_id = p_payment_id) then
      return jsonb_build_object('status', 'stale');
    end if;
    -- a cancelled private testing: no payment changes (after the 0005-style checks, as the data layer)
    if exists (select 1 from public.testing_private p where p.id = v_pay.private_id and p.status = 'cancelled') then
      return jsonb_build_object('status', 'cancelled');
    end if;

    perform set_config('tkd.action', 'private_undo_payment', true);
    perform set_config('tkd.batch_id', gen_random_uuid()::text, true);

    insert into public.testing_private_payments
      (private_id, kind, amount_cents, method, paid_on, recorded_at, recorded_by, recorded_by_name,
       reverses_payment_id)
    values
      (v_pay.private_id, 'reversal', -v_pay.amount_cents, v_pay.method, public.testing_today(), now(), auth.uid(),
       public.change_log_actor_name(), v_pay.id);

    update public.testing_private p
       set version = p.version + 1
     where p.id = v_pay.private_id
    returning p.version into v_version;

    perform set_config('tkd.action', '', true);
    perform set_config('tkd.batch_id', '', true);

    return jsonb_build_object('status', 'ok', 'version', v_version);
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

revoke execute on function public.testing_private_undo_payment(uuid) from public, anon, authenticated, service_role;
grant  execute on function public.testing_private_undo_payment(uuid) to authenticated;


-- ---------------------------------------------------------------------
-- 2. 0030's new functions (nothing in the database calls them)
-- ---------------------------------------------------------------------
drop function if exists public.testing_mark_paid_by(uuid, integer, text, integer);
drop function if exists public.testing_private_mark_paid_by(uuid, integer, text, integer);
drop function if exists public.testing_registration_history(uuid);
drop function if exists public.testing_private_history(uuid);
drop function if exists public.testing_history_strip(jsonb);
drop function if exists public.testing_results_csv(uuid);


-- ---------------------------------------------------------------------
-- 3. The download log - only if nobody downloaded a CSV yet
-- ---------------------------------------------------------------------
do $$
begin
  if to_regclass('public.testing_downloads') is null then
    return;
  end if;
  if exists (select 1 from public.testing_downloads) then
    raise notice 'testing_downloads has rows: the download log and its guard are KEPT (only an empty log is removed)';
  else
    drop table public.testing_downloads;
    drop function if exists public.testing_downloads_guard();
  end if;
end
$$;


-- ---------------------------------------------------------------------
-- 4. "Paying by before" off the two payment tables
-- ---------------------------------------------------------------------
alter table public.testing_payments         drop constraint if exists testing_payments_paying_by_before_check;
alter table public.testing_private_payments drop constraint if exists testing_private_payments_paying_by_before_check;
alter table public.testing_payments         drop column if exists paying_by_before;
alter table public.testing_private_payments drop column if exists paying_by_before;


commit;
