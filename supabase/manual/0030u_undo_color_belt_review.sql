-- =====================================================================
-- 0030u_undo_color_belt_review.sql   (UNDO of migration 0030)
-- ---------------------------------------------------------------------
-- WHAT THIS FILE IS
--   Takes migration 0030 (Color Belt: Mark paid with a way to pay,
--   History, results CSV) back out:
--     1. puts back the exact live versions of the six functions 0030
--        replaced - 0005's testing_undo_payment (section 14k) and
--        testing_edit_payment (14l), 0014's testing_private_undo_payment
--        (8f), testing_private_edit_payment (8g), testing_move_to_private
--        (9a) and testing_private_undo_move (9b) - copied word for word
--        with their exact revoke and grant (no later migration replaced
--        any of them). Undo payment then no longer puts "Paying by" back,
--        Edit payment no longer changes it, and the move functions no
--        longer copy paying_by_before (the column is removed in step 4).
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
-- 1. The six replaced functions exactly as they were before 0030
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

-- 14l. testing_edit_payment(p_payment_id, p_method, p_amount_cents,
--        p_paid_on)   A
-- Edit payment = a reversal of the old payment + a new payment with the
-- new method / amount (1 cent to $1,000) / date (not in the future).
-- Already reversed -> stale; a reversal can't be edited (invalid).
-- Ok: {"status":"ok","payment_id":<the new payment>,"version":n}
create or replace function public.testing_edit_payment(
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
  v_p          public.testing_payments;
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

    v_p := public.testing_lock_payment(p_payment_id);
    if v_p.id is null then
      return jsonb_build_object('status', 'not_found');
    end if;
    if v_p.kind <> 'payment' then
      return jsonb_build_object('status', 'invalid');
    end if;
    if exists (select 1 from public.testing_payments x where x.reverses_payment_id = p_payment_id) then
      return jsonb_build_object('status', 'stale');
    end if;

    perform set_config('tkd.action', 'edit_payment', true);
    perform set_config('tkd.batch_id', gen_random_uuid()::text, true);

    insert into public.testing_payments
      (registration_id, kind, amount_cents, method, paid_on, recorded_at, recorded_by, recorded_by_name,
       reverses_payment_id)
    values
      (v_p.registration_id, 'reversal', -v_p.amount_cents, v_p.method, public.testing_today(), now(), auth.uid(),
       public.change_log_actor_name(), v_p.id);

    insert into public.testing_payments
      (registration_id, kind, amount_cents, method, paid_on, recorded_at, recorded_by, recorded_by_name)
    values
      (v_p.registration_id, 'payment', p_amount_cents, p_method, p_paid_on, now(), auth.uid(),
       public.change_log_actor_name())
    returning id into v_new_id;

    update public.testing_registrations r
       set version = r.version + 1
     where r.id = v_p.registration_id
    returning r.version into v_version;

    perform set_config('tkd.action', '', true);
    perform set_config('tkd.batch_id', '', true);

    return jsonb_build_object('status', 'ok', 'payment_id', v_new_id, 'version', v_version);
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

revoke execute on function public.testing_edit_payment(uuid, text, integer, date) from public, anon, authenticated, service_role;
grant  execute on function public.testing_edit_payment(uuid, text, integer, date) to authenticated;

-- 8g. testing_private_edit_payment(p_payment_id, p_method,
--       p_amount_cents, p_paid_on)   A
-- Edit payment = a reversal of the old payment + a new payment with the
-- new method / amount (1 cent to $1,000) / date (not in the future), as
-- 0005's testing_edit_payment. A cancelled private testing -> cancelled.
-- Ok: {"status":"ok","payment_id":<the new payment>,"version":n}
create or replace function public.testing_private_edit_payment(
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
  v_pay        public.testing_private_payments;
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

    v_pay := public.testing_private_lock_payment(p_payment_id);
    if v_pay.id is null then
      return jsonb_build_object('status', 'not_found');
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

    perform set_config('tkd.action', 'private_edit_payment', true);
    perform set_config('tkd.batch_id', gen_random_uuid()::text, true);

    insert into public.testing_private_payments
      (private_id, kind, amount_cents, method, paid_on, recorded_at, recorded_by, recorded_by_name,
       reverses_payment_id)
    values
      (v_pay.private_id, 'reversal', -v_pay.amount_cents, v_pay.method, public.testing_today(), now(), auth.uid(),
       public.change_log_actor_name(), v_pay.id);

    insert into public.testing_private_payments
      (private_id, kind, amount_cents, method, paid_on, recorded_at, recorded_by, recorded_by_name)
    values
      (v_pay.private_id, 'payment', p_amount_cents, p_method, p_paid_on, now(), auth.uid(),
       public.change_log_actor_name())
    returning id into v_new_id;

    update public.testing_private p
       set version = p.version + 1
     where p.id = v_pay.private_id
    returning p.version into v_version;

    perform set_config('tkd.action', '', true);
    perform set_config('tkd.batch_id', '', true);

    return jsonb_build_object('status', 'ok', 'payment_id', v_new_id, 'version', v_version);
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

revoke execute on function public.testing_private_edit_payment(uuid, text, integer, date) from public, anon, authenticated, service_role;
grant  execute on function public.testing_private_edit_payment(uuid, text, integer, date) to authenticated;

-- 9a. testing_move_to_private(p_registration_id, p_expected_version,
--       p_private_date, p_private_time)   S (all staff, any time - v0.404)
-- The student leaves the event and becomes a private testing; their money
-- moves with them. One transaction, one batch (contract §2.5.1):
--   refused: withdrawn; a testing-day Pass / Not passed (has_result);
--   a testing-day No show is removed with its note (clear_result); a note
--   alone stays with the event registration.
--   copied from the EVENT copy: class, rank, belt, what they test for;
--   the private price = TODAY's private price of that rank in Classes and
--   ranks (the event copy's private price only if the rank is gone there).
--   the money, append-only, net preserved: for every LIVE event payment
--   (not reversed), oldest first, an event reversal dated on the ORIGINAL
--   day, and a matching private payment (same amount, method and day,
--   moved_from_payment_id = the event payment's id). A transfer, not a
--   refund: a pair that was already reversed stays where it is.
--   the registration becomes withdrawn (as Withdraw does); it is known as
--   "moved" because a private testing points at it.
-- Ok: {"status":"ok","private_id":...,"version":1,"registration_version":n,
--      "amount_due_cents":n,"result_cleared":bool}
create or replace function public.testing_move_to_private(
  p_registration_id  uuid,
  p_expected_version integer,
  p_private_date     date,
  p_private_time     time
)
returns jsonb
language plpgsql
volatile
security definer
set search_path = ''
as $$
declare
  v_r           public.testing_registrations;
  v_e           public.testing_events;
  v_k           public.testing_event_ranks;
  v_c           public.testing_event_classes;
  v_to          jsonb;
  v_cents       integer;
  v_today       date;
  v_res         public.testing_results;
  v_clear       boolean := false;
  v_pay         record;
  v_moved       uuid[] := '{}';
  v_reg_version integer;
  v_private_id  uuid;
  v_constraint  text;
begin
  begin
    -- 1. access
    if public.has_data_access() is not true then
      return jsonb_build_object('status', 'no_access');
    end if;

    -- 2. input
    if p_registration_id is null or p_expected_version is null
       or p_private_date is null or p_private_time is null
       or not public.testing_private_time_is_valid(p_private_time) then
      return jsonb_build_object('status', 'invalid');
    end if;

    -- 3. lock school -> event -> registration, and look it up
    v_r := public.testing_lock_registration(p_registration_id);
    if v_r.id is null then
      return jsonb_build_object('status', 'not_found');
    end if;
    -- 4. did the screen see the latest version?
    if v_r.version <> p_expected_version then
      return jsonb_build_object('status', 'stale');
    end if;
    -- 5. withdrawn (also: already moved)
    if v_r.status = 'withdrawn' then
      return jsonb_build_object('status', 'withdrawn');
    end if;

    -- 6. the day rule
    v_today := public.testing_today();
    if p_private_date < v_today then
      return jsonb_build_object('status', 'past_day');
    end if;
    if p_private_date > v_today + interval '1 year' then
      return jsonb_build_object('status', 'invalid');
    end if;

    -- 7. lock the registration's testing-day result row
    select * into v_res from public.testing_results x where x.registration_id = p_registration_id for update;
    if v_res.result in ('pass', 'not_passed') then
      return jsonb_build_object('status', 'has_result');
    end if;
    v_clear := v_res.result is not distinct from 'no_show';

    -- 8. the copy: from the event copy; the price from today's Classes and ranks
    select * into v_e from public.testing_events e where e.id = v_r.event_id;
    select * into v_k from public.testing_event_ranks k where k.id = v_r.event_rank_id;
    select * into v_c from public.testing_event_classes c where c.id = v_k.event_class_id;
    v_to := public.testing_rank_testing_for(v_r.event_rank_id);
    select r.private_cents into v_cents from public.testing_ranks r where r.id = v_k.rank_id;
    if not found then
      v_cents := v_k.private_cents;   -- the rank is gone from Classes and ranks: the event's copy
    end if;

    -- 9. write, one batch
    perform set_config('tkd.action', 'move_to_private', true);
    perform set_config('tkd.batch_id', gen_random_uuid()::text, true);

    -- (a) an event reversal for every live event payment, oldest first,
    --     dated on the original day
    for v_pay in select p.id, p.amount_cents, p.method, p.paid_on, p.recorded_at
                   from public.testing_payments p
                  where p.registration_id = p_registration_id
                    and p.kind = 'payment'
                    and not exists (select 1 from public.testing_payments x where x.reverses_payment_id = p.id)
                  order by p.recorded_at, p.id loop
      insert into public.testing_payments
        (registration_id, kind, amount_cents, method, paid_on, recorded_at, recorded_by, recorded_by_name,
         reverses_payment_id)
      values
        (p_registration_id, 'reversal', -v_pay.amount_cents, v_pay.method, v_pay.paid_on, now(), auth.uid(),
         public.change_log_actor_name(), v_pay.id);
      v_moved := v_moved || v_pay.id;
    end loop;

    -- (b) the registration leaves the event (as Withdraw does)
    update public.testing_registrations r
       set status            = 'withdrawn',
           withdrawn_reason  = 'withdrawn',
           withdrawn_at      = now(),
           withdrawn_by_name = public.change_log_actor_name(),
           withdrawn_by      = auth.uid(),
           duplicate_state   = 'none',
           duplicate_of      = null
     where r.id = p_registration_id;
    perform public.testing_recheck_pointing_at(p_registration_id);
    select r.version into v_reg_version from public.testing_registrations r where r.id = p_registration_id;

    -- (c) the private testing (version 1)
    insert into public.testing_private
      (location_code, first_name, last_name, class_id, class_name, rank_id, rank_name,
       belt_pattern, belt_color, belt_color_2, belt_end_stripes, belt_end_stripe_color,
       to_kind, to_name, to_belt_pattern, to_belt_color, to_belt_color_2, to_belt_end_stripes,
       to_belt_end_stripe_color, private_cents, paying_by, stripes_confirmed, private_date, private_time,
       moved_from_event_id, moved_from_registration_id, moved_from_event_name, moved_cleared_no_show,
       moved_registration_version)
    values
      (v_e.location_code, v_r.first_name, v_r.last_name, v_c.class_id, v_c.class_name, v_k.rank_id, v_k.name,
       v_k.belt_pattern, v_k.belt_color, v_k.belt_color_2, v_k.belt_end_stripes, v_k.belt_end_stripe_color,
       case when v_to is null then 'none' else 'rank' end,
       v_to ->> 'name', v_to ->> 'belt_pattern', v_to ->> 'belt_color', v_to ->> 'belt_color_2',
       (v_to ->> 'belt_end_stripes')::integer, v_to ->> 'belt_end_stripe_color',
       v_cents, v_r.paying_by, true, p_private_date, p_private_time,
       v_e.id, v_r.id, v_e.name, v_clear, v_reg_version)
    returning id into v_private_id;

    -- (d) one private payment per moved event payment (same amount, method,
    --     day and recording time - the order of the payments is kept)
    insert into public.testing_private_payments
      (private_id, kind, amount_cents, method, paid_on, recorded_at, recorded_by, recorded_by_name,
       moved_from_payment_id)
    select v_private_id, 'payment', p.amount_cents, p.method, p.paid_on,
           p.recorded_at,   -- the ORIGINAL recording time, so "the most recent payment" stays the same one
           auth.uid(), public.change_log_actor_name(), p.id
      from public.testing_payments p
      join unnest(v_moved) with ordinality as m(id, n) on m.id = p.id
     order by m.n;

    -- (e) a testing-day No show is removed (with its note)
    if v_clear then
      perform set_config('tkd.action', 'clear_result', true);
      delete from public.testing_results x where x.registration_id = p_registration_id;
    end if;

    perform set_config('tkd.action', '', true);
    perform set_config('tkd.batch_id', '', true);

    -- 10. answer
    return jsonb_build_object('status', 'ok', 'private_id', v_private_id, 'version', 1,
                              'registration_version', v_reg_version,
                              'amount_due_cents', public.testing_private_amount_due(v_private_id),
                              'result_cleared', v_clear);
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

revoke execute on function public.testing_move_to_private(uuid, integer, date, time) from public, anon, authenticated, service_role;
grant  execute on function public.testing_move_to_private(uuid, integer, date, time) to authenticated;

-- 9b. testing_private_undo_move(p_private_id, p_expected_version)
--       S (only the person who moved it, within 10 seconds)
-- The toast's Undo (contract §2.5.2). Who and when are read from the
-- event registration (withdrawn_by / withdrawn_at):
--   not the mover, or 10 seconds or more ago -> not_allowed (admins too)
--   the move cleared a No show -> not_allowed (it can't come back)
--   anything changed since (the registration isn't withdrawn or was
--   edited, the private testing has a result, a payment recorded here or
--   a reversal) -> stale
--   not moved / the registration is gone -> not_found
-- Then, one batch: the event payments are recorded again (same amount,
-- method and day, with NO "recorded by" login, so the live 10-second
-- own-Undo can never reverse them), the registration is active again with
-- its duplicate check re-run (as testing_restore_student), and the private
-- testing is removed (with its payments).
-- Ok: {"status":"ok","registration_id":...,"registration_version":n}
create or replace function public.testing_private_undo_move(
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
  v_reg_id     uuid;
  v_r          public.testing_registrations;
  v_p          public.testing_private;
  v_of         uuid;
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

    -- lock school -> event -> the registration -> the private testing
    select p.moved_from_registration_id into v_reg_id from public.testing_private p where p.id = p_private_id;
    if v_reg_id is null then
      return jsonb_build_object('status', 'not_found');   -- missing, or not moved
    end if;
    v_r := public.testing_lock_registration(v_reg_id);
    if v_r.id is null then
      return jsonb_build_object('status', 'not_found');   -- the registration (or its event) is gone
    end if;
    v_p := public.testing_private_lock(p_private_id);
    if v_p.id is null then
      return jsonb_build_object('status', 'not_found');
    end if;

    if v_p.version <> p_expected_version then
      return jsonb_build_object('status', 'stale');
    end if;
    -- only the mover, within 10 seconds (admins too)
    if v_r.withdrawn_by is distinct from auth.uid()
       or coalesce(v_r.withdrawn_at <= now() - interval '10 seconds', true) then
      return jsonb_build_object('status', 'not_allowed');
    end if;
    -- a cleared No show can't come back
    if v_p.moved_cleared_no_show then
      return jsonb_build_object('status', 'not_allowed');
    end if;
    -- anything changed since the move?
    if v_r.status <> 'withdrawn'
       or v_r.version <> v_p.moved_registration_version
       or exists (select 1 from public.testing_private_results x where x.private_id = p_private_id)
       or exists (select 1 from public.testing_private_payments x
                   where x.private_id = p_private_id
                     and (x.moved_from_payment_id is null or x.kind <> 'payment')) then
      return jsonb_build_object('status', 'stale');
    end if;

    perform set_config('tkd.action', 'undo_move_to_private', true);
    perform set_config('tkd.batch_id', gen_random_uuid()::text, true);

    -- the event payments again (no "recorded by" login; the original
    -- day and recording time)
    insert into public.testing_payments
      (registration_id, kind, amount_cents, method, paid_on, recorded_at, recorded_by, recorded_by_name)
    select v_r.id, 'payment', x.amount_cents, x.method, x.paid_on,
           x.recorded_at,   -- the original recording time again (the order is kept)
           null, public.change_log_actor_name()
      from public.testing_private_payments x
     where x.private_id = p_private_id
     order by x.recorded_at, x.id;

    -- the registration back to active, with testing_restore_student's
    -- three duplicate re-check lines
    update public.testing_registrations r
       set status            = 'active',
           withdrawn_reason  = null,
           withdrawn_at      = null,
           withdrawn_by_name = null,
           withdrawn_by      = null
     where r.id = v_r.id;
    perform public.testing_recheck_duplicate(v_r.id);
    select r.duplicate_of into v_of from public.testing_registrations r where r.id = v_r.id;
    if v_of is not null then
      perform public.testing_recheck_duplicate(v_of);
    end if;
    perform public.testing_recheck_pointing_at(v_r.id);

    -- the private testing goes (its payments with it)
    delete from public.testing_private p where p.id = p_private_id;

    perform set_config('tkd.action', '', true);
    perform set_config('tkd.batch_id', '', true);

    select r.version into v_version from public.testing_registrations r where r.id = v_r.id;
    return jsonb_build_object('status', 'ok', 'registration_id', v_r.id, 'registration_version', v_version);
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

revoke execute on function public.testing_private_undo_move(uuid, integer) from public, anon, authenticated, service_role;
grant  execute on function public.testing_private_undo_move(uuid, integer) to authenticated;


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
