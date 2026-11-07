-- =====================================================================
-- 0044u_undo_color_belt_rolling_check.sql   (UNDO of migration 0044)
-- ---------------------------------------------------------------------
-- WHAT THIS FILE IS
--   Takes migration 0044 (Color Belt rolling check, step A) back out and
--   puts the database exactly as it was after 0030 (and 0035, if that was
--   applied):
--     * removes testing_undo_event_edit (R2-02);
--     * removes the 4 triggers and their 4 trigger functions
--       (testing_registrations_keep_form_choice,
--       testing_private_keep_form_choice, testing_payments_set_school,
--       testing_private_payments_set_school);
--     * removes the 5-input testing_mark_paid_by /
--       testing_private_mark_paid_by and puts back 0030's 4-input ones,
--       and puts back 0030's bodies of testing_undo_payment,
--       testing_private_undo_payment, testing_edit_payment,
--       testing_private_edit_payment, testing_move_to_private and
--       testing_private_undo_move - all 8 copied WORD FOR WORD from
--       0030_color_belt_review.sql sections 3, 4, 4b and 4c (the code
--       that was live before 0044), with their exact revoke and grant;
--     * re-makes the views testing_roster (0005 section 10) and
--       testing_private_list (0014 section 5) word for word, without the
--       paying_by_on_form column, with their rights (select for
--       authenticated only);
--     * removes the two rules, the two foreign keys and the four columns
--       (testing_registrations.paying_by_on_form,
--       testing_private.paying_by_on_form, testing_payments.school,
--       testing_private_payments.school). Their column rights go with
--       them.
--
-- WHEN IT REFUSES (and changes nothing)
--   While ANY payment row has a school different from its event's school
--   (event payments) or its private testing's school (private payments):
--   that is money a desk at the OTHER school took (v1.035), and after the
--   undo nothing could tell it apart - Finance would count it at the
--   event's school again. Move such money first (Undo payment, then Mark
--   paid on a device set to the event's school) or keep 0044.
--   0044_preapply_check.sql shows the count (payments_off_school).
--
-- WHY IT DOES NOT REFUSE FOR paying_by_on_form
--   The column is never typed by anyone: it is worked out from data that
--   stays after the undo. A family-form registration's value is the
--   paying_by of its own change_log insert row (0044's insert row has it
--   too), and a moved private testing's is its registration's. Pasting
--   0044 again fills it the same way, so removing it loses nothing that
--   can't be put back.
--
-- BEFORE IT
--   Put the app back first to a version that doesn't send p_school, read
--   paying_by_on_form or call testing_undo_event_edit (those would fail).
--   The app from before 0044 works with the database after this undo.
--
-- AFTERWARDS
--   0044_preapply_check.sql answers as before 0044
--   (0 / 2 / 0 / 0 / 8 / 8 / 0 / 0 / 0), and 0003_, 0005_, 0014_ and
--   0030_fingerprints.sql equal the records written down before 0044
--   (SETUP 0044a). Tested in PGlite (run.mjs step0044). To redo: paste
--   0044 again. Running this file twice is safe.
--   One transaction: on any error nothing is kept. Supabase warns about
--   destructive operations - they are the planned removals (functions,
--   triggers, the two views re-made, four columns). Confirm only with
--   Jeffrey's OK.
-- =====================================================================

begin;


-- ---------------------------------------------------------------------
-- 1. The guard: 0030's code needs 0005, 0010, 0014 and 0018. Then the
--    refusal: no payment may have a school other than its event's /
--    private testing's (read through to_jsonb, so a second run - after
--    the column is gone - passes).
-- ---------------------------------------------------------------------
do $$
declare
  v_n integer;
begin
  if to_regclass('public.testing_registrations') is null
     or to_regclass('public.testing_private') is null
     or to_regclass('public.testing_private_payments') is null
     or to_regprocedure('public.testing_lock_registration(uuid)') is null
     or to_regprocedure('public.testing_private_lock(uuid)') is null
     or to_regprocedure('public.testing_private_amount_due(uuid)') is null
     or to_regprocedure('public.testing_fee_cents(integer, integer, date, date)') is null
     or to_regprocedure('public.testing_purge_old_signatures()') is null then
    raise exception '0044u needs migrations 0005 and 0014 (Color Belt testing) first';
  end if;

  select (select count(*) from public.testing_payments p
            join public.testing_registrations r on r.id = p.registration_id
            join public.testing_events e on e.id = r.event_id
           where (to_jsonb(p) ->> 'school') is not null
             and (to_jsonb(p) ->> 'school') is distinct from e.location_code)
       + (select count(*) from public.testing_private_payments x
            join public.testing_private v on v.id = x.private_id
           where (to_jsonb(x) ->> 'school') is not null
             and (to_jsonb(x) ->> 'school') is distinct from v.location_code)
    into v_n;
  if v_n > 0 then
    raise exception '0044 undo refused: % payment row(s) were taken at the other school''s desk; undoing 0044 would lose that. Nothing was changed.', v_n;
  end if;
end
$$;


-- ---------------------------------------------------------------------
-- 2. 0044's own objects go
-- ---------------------------------------------------------------------
drop function if exists public.testing_undo_event_edit(uuid, integer, text, date, jsonb, date, text, boolean);

drop trigger if exists testing_registrations_before_form_choice on public.testing_registrations;
drop trigger if exists testing_private_before_form_choice on public.testing_private;
drop trigger if exists testing_payments_school on public.testing_payments;
drop trigger if exists testing_private_payments_school on public.testing_private_payments;
drop function if exists public.testing_registrations_keep_form_choice();
drop function if exists public.testing_private_keep_form_choice();
drop function if exists public.testing_payments_set_school();
drop function if exists public.testing_private_payments_set_school();

-- the 5-input Mark paid functions (0030's 4-input ones come back in 3.)
drop function if exists public.testing_mark_paid_by(uuid, integer, text, integer, text);
drop function if exists public.testing_private_mark_paid_by(uuid, integer, text, integer, text);


-- =====================================================================
-- 3. 0030's code, WORD FOR WORD (0030_color_belt_review.sql sections 3,
--    4, 4b and 4c): the two 4-input Mark paid functions and the six
--    bodies 0044 replaced. Everything from here to "end of 0030's code"
--    is a copy.
-- =====================================================================

-- ---------------------------------------------------------------------
-- 3. CB1 - Mark paid with a way to pay (new names)
-- ---------------------------------------------------------------------

-- 3a. testing_mark_paid_by(p_registration_id, p_expected_version,
--       p_method, p_expected_cents)   S
-- 0005's testing_mark_paid (14i), plus the way to pay:
--   p_method         cash / check / card (anything else -> invalid)
--   p_expected_cents the amount the Mark paid box SHOWED. The database
--                    still works out the amount itself (the early price
--                    before the testing day, the testing-day price on it
--                    and after). If they differ - e.g. the box was opened
--                    before midnight and the testing day began - nothing
--                    is written and the answer is
--                    {"status":"price_changed","amount_cents":<new amount>}
--                    so the box can show the new amount (Q1).
--   the payment's method = p_method (Finance's Cash / Check / Card totals
--                    read only this).
--   "Paying by"      if p_method is not the registration's paying_by,
--                    paying_by becomes p_method too (Q2), in the same
--                    batch (logged as 'mark_paid'), and the payment
--                    remembers the old value (paying_by_before) for Undo.
-- Refused, in this order: no_access; invalid (a missing argument, a bad
-- method, a negative expected amount); not_found; stale (the version moved
-- - also a double click); withdrawn; already_paid (net paid > 0);
-- price_changed. The registration's version goes up. Last step: the
-- signature clean-up (0005 12a), as the old function.
-- Ok: {"status":"ok","payment_id":...,"amount_cents":n,"method":"card",
--      "paid_on":"YYYY-MM-DD","paying_by":"card","version":n}
create or replace function public.testing_mark_paid_by(
  p_registration_id  uuid,
  p_expected_version integer,
  p_method           text,
  p_expected_cents   integer
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
  v_before     text;
  v_constraint text;
begin
  begin
    if public.has_data_access() is not true then
      return jsonb_build_object('status', 'no_access');
    end if;

    if p_registration_id is null or p_expected_version is null
       or p_method is null or p_method not in ('cash', 'check', 'card')
       or p_expected_cents is null or p_expected_cents < 0 then
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

    -- the box showed another amount: write nothing, show the new one (Q1)
    if v_amount is distinct from p_expected_cents then
      return jsonb_build_object('status', 'price_changed', 'amount_cents', v_amount);
    end if;

    -- a different way than "Paying by": remember the old value (Q2)
    v_before := case when p_method <> v_r.paying_by then v_r.paying_by end;

    perform set_config('tkd.action', 'mark_paid', true);
    perform set_config('tkd.batch_id', gen_random_uuid()::text, true);

    insert into public.testing_payments
      (registration_id, kind, amount_cents, method, paid_on, recorded_at, recorded_by, recorded_by_name,
       paying_by_before)
    values
      (p_registration_id, 'payment', v_amount, p_method, v_today, now(), auth.uid(),
       public.change_log_actor_name(), v_before)
    returning id into v_payment_id;

    -- one update: the version goes up (a double click gets "stale") and,
    -- if it differed, "Paying by" becomes the way they paid
    update public.testing_registrations r
       set paying_by = p_method,
           version   = r.version + 1
     where r.id = p_registration_id
    returning r.version into v_version;

    perform set_config('tkd.action', '', true);
    perform set_config('tkd.batch_id', '', true);

    perform public.testing_purge_old_signatures();

    return jsonb_build_object('status', 'ok', 'payment_id', v_payment_id, 'amount_cents', v_amount,
                              'method', p_method, 'paid_on', v_today, 'paying_by', p_method,
                              'version', v_version);
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

revoke execute on function public.testing_mark_paid_by(uuid, integer, text, integer) from public, anon, authenticated, service_role;
grant  execute on function public.testing_mark_paid_by(uuid, integer, text, integer) to authenticated;

-- 3b. testing_private_mark_paid_by(p_private_id, p_expected_version,
--       p_method, p_expected_cents)   S
-- 0014's testing_private_mark_paid (8e), plus the way to pay, exactly as
-- 3a: the amount is what is still OWED (the full private price, or the
-- rest after a part payment - a "top-up"); p_expected_cents must equal it
-- (else price_changed {amount_cents}); the payment's method = p_method;
-- a different way than "Paying by" changes paying_by too (logged as
-- 'private_mark_paid') and the payment remembers the old value.
-- Refused, in this order: no_access; invalid; not_found; stale;
-- cancelled; already_paid (nothing owed, also a $0 price);
-- price_changed. The version goes up.
-- Ok: {"status":"ok","payment_id":...,"amount_cents":n,"method":"card",
--      "paid_on":"YYYY-MM-DD","paying_by":"card","version":n}
create or replace function public.testing_private_mark_paid_by(
  p_private_id       uuid,
  p_expected_version integer,
  p_method           text,
  p_expected_cents   integer
)
returns jsonb
language plpgsql
volatile
security definer
set search_path = ''
as $$
declare
  v_p          public.testing_private;
  v_today      date;
  v_amount     integer;
  v_payment_id uuid;
  v_version    integer;
  v_before     text;
  v_constraint text;
begin
  begin
    if public.has_data_access() is not true then
      return jsonb_build_object('status', 'no_access');
    end if;

    if p_private_id is null or p_expected_version is null
       or p_method is null or p_method not in ('cash', 'check', 'card')
       or p_expected_cents is null or p_expected_cents < 0 then
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

    -- the box showed another amount: write nothing, show the new one (Q1)
    if v_amount is distinct from p_expected_cents then
      return jsonb_build_object('status', 'price_changed', 'amount_cents', v_amount);
    end if;

    -- a different way than "Paying by": remember the old value (Q2)
    v_before := case when p_method <> v_p.paying_by then v_p.paying_by end;
    v_today  := public.testing_today();

    perform set_config('tkd.action', 'private_mark_paid', true);
    perform set_config('tkd.batch_id', gen_random_uuid()::text, true);

    insert into public.testing_private_payments
      (private_id, kind, amount_cents, method, paid_on, recorded_at, recorded_by, recorded_by_name,
       paying_by_before)
    values
      (p_private_id, 'payment', v_amount, p_method, v_today, now(), auth.uid(),
       public.change_log_actor_name(), v_before)
    returning id into v_payment_id;

    update public.testing_private p
       set paying_by = p_method,
           version   = p.version + 1
     where p.id = p_private_id
    returning p.version into v_version;

    perform set_config('tkd.action', '', true);
    perform set_config('tkd.batch_id', '', true);

    return jsonb_build_object('status', 'ok', 'payment_id', v_payment_id, 'amount_cents', v_amount,
                              'method', p_method, 'paid_on', v_today, 'paying_by', p_method,
                              'version', v_version);
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

revoke execute on function public.testing_private_mark_paid_by(uuid, integer, text, integer) from public, anon, authenticated, service_role;
grant  execute on function public.testing_private_mark_paid_by(uuid, integer, text, integer) to authenticated;


-- ---------------------------------------------------------------------
-- 4. Undo payment puts "Paying by" back - REPLACED (same names, same
--    arguments, same rights). Every line is 0005's / 0014's except the
--    ones marked "0030".
-- ---------------------------------------------------------------------

-- 14k. testing_undo_payment(p_payment_id)   S (own, within 10 s) / A
-- Writes a reversal for a payment (the payment row stays; the two add up
-- to 0, so the student shows Not paid again). Who may:
--   the staff member who recorded it, less than 10 seconds ago (the toast's
--   Undo) - the database decides this from recorded_by and recorded_at;
--   otherwise admins only (not_allowed).
-- Already reversed -> stale. Undoing a reversal -> invalid. The
-- registration's version goes up.
-- (0030) If the payment remembered an earlier "Paying by"
-- (paying_by_before - Mark paid by a different way changed it), and the
-- registration's "Paying by" is still the payment's method, it is put
-- back, in the same update and batch (logged as 'undo_payment'). If
-- someone changed "Paying by" again since, it is left alone. A payment
-- made by the old Mark paid (paying_by_before NULL): nothing extra.
-- Ok: {"status":"ok","version":n}  (the registration's new version - the
-- same answer as before 0030; the app reloads the row to show the
-- "Paying by")
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
       set version   = r.version + 1,
           -- 0030: the old "Paying by" back, if Mark paid changed it and nobody changed it since
           paying_by = case when v_p.paying_by_before is not null and r.paying_by = v_p.method
                            then v_p.paying_by_before else r.paying_by end
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
-- (0030) "Paying by" is put back exactly as in testing_undo_payment above.
-- Ok: {"status":"ok","version":n}  (the same answer as before 0030)
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
       set version   = p.version + 1,
           -- 0030: the old "Paying by" back, if Mark paid changed it and nobody changed it since
           paying_by = case when v_pay.paying_by_before is not null and p.paying_by = v_pay.method
                            then v_pay.paying_by_before else p.paying_by end
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
-- 4b. Edit payment makes "Paying by" follow too (v0.419) - REPLACED
--     (same names, same arguments, same rights, same statuses and
--     answers). Every line is 0005's (14l) / 0014's (8g) except the ones
--     marked "0030".
--   The rule (o = the payment being edited, "Paying by" = the student's
--   paying_by right now):
--   * the family's choice = what Undo payment of o would leave: o's
--     paying_by_before if it has one AND "Paying by" is still o's method
--     (Mark paid's change still stands); otherwise "Paying by" itself
--     (someone chose a way since - that choice wins, as in Undo).
--   * the edit CHANGES the way (p_method is not o's method): "Paying by"
--     becomes p_method, in the same update as the version bump and in the
--     same batch, so it is logged with the edit. The trigger raises the
--     version exactly once (0005 9c / 0014's private trigger), as before.
--   * the edit keeps the way (only the amount or the day): "Paying by"
--     is left alone.
--   * the NEW payment's paying_by_before = the family's choice, but only
--     when "Paying by" equals the new payment's method after the edit and
--     the choice is a different way (the column's rule: never the
--     payment's own method). Otherwise NULL: Undo has nothing to put back
--     (e.g. edited to the way the family chose - "Paying by" already is
--     that way).
--   So an edit that changes the way = Undo of o + Mark paid by the new
--   way, and Undo payment of the new payment (its own rule: only while
--   "Paying by" is still that payment's method) puts the family's choice
--   back. A payment made before 0030 (no paying_by_before) works the same:
--   its family's choice is "Paying by".
-- ---------------------------------------------------------------------

-- 14l. testing_edit_payment(p_payment_id, p_method, p_amount_cents,
--        p_paid_on)   A
-- Edit payment = a reversal of the old payment + a new payment with the
-- new method / amount (1 cent to $1,000) / date (not in the future).
-- Already reversed -> stale; a reversal can't be edited (invalid).
-- (0030) "Paying by" follows the edit - the rule of section 4b above:
-- a changed way makes paying_by the new way (same update and batch,
-- logged as 'edit_payment'); the new payment keeps the family's choice
-- in paying_by_before so Undo payment can put it back.
-- Ok: {"status":"ok","payment_id":<the new payment>,"version":n}  (the
-- same answer as before 0030)
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
  v_paying_by  text;   -- 0030: "Paying by" now
  v_choice     text;   -- 0030: the family's choice (what Undo of the old payment would leave)
  v_after      text;   -- 0030: "Paying by" after the edit
  v_before     text;   -- 0030: the new payment's paying_by_before
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

    -- 0030: "Paying by" follows the edit (v0.419). The registration is
    -- already locked (testing_lock_payment locks it before the payment).
    select r.paying_by into v_paying_by from public.testing_registrations r where r.id = v_p.registration_id;
    v_choice := case when v_p.paying_by_before is not null and v_paying_by = v_p.method
                     then v_p.paying_by_before else v_paying_by end;
    v_after  := case when p_method <> v_p.method then p_method else v_paying_by end;
    v_before := case when v_after = p_method and v_choice <> p_method then v_choice end;

    perform set_config('tkd.action', 'edit_payment', true);
    perform set_config('tkd.batch_id', gen_random_uuid()::text, true);

    insert into public.testing_payments
      (registration_id, kind, amount_cents, method, paid_on, recorded_at, recorded_by, recorded_by_name,
       reverses_payment_id)
    values
      (v_p.registration_id, 'reversal', -v_p.amount_cents, v_p.method, public.testing_today(), now(), auth.uid(),
       public.change_log_actor_name(), v_p.id);

    insert into public.testing_payments
      (registration_id, kind, amount_cents, method, paid_on, recorded_at, recorded_by, recorded_by_name,
       paying_by_before)   -- 0030
    values
      (v_p.registration_id, 'payment', p_amount_cents, p_method, p_paid_on, now(), auth.uid(),
       public.change_log_actor_name(), v_before)   -- 0030
    returning id into v_new_id;

    update public.testing_registrations r
       set version   = r.version + 1,
           paying_by = v_after   -- 0030: the new way, if the edit changed the way
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
-- (0030) "Paying by" follows the edit exactly as in testing_edit_payment
-- above (logged as 'private_edit_payment').
-- Ok: {"status":"ok","payment_id":<the new payment>,"version":n}  (the
-- same answer as before 0030)
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
  v_paying_by  text;   -- 0030: "Paying by" now
  v_choice     text;   -- 0030: the family's choice (what Undo of the old payment would leave)
  v_after      text;   -- 0030: "Paying by" after the edit
  v_before     text;   -- 0030: the new payment's paying_by_before
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

    -- 0030: "Paying by" follows the edit (v0.419). The private testing is
    -- already locked (testing_private_lock_payment locks it first).
    select p.paying_by into v_paying_by from public.testing_private p where p.id = v_pay.private_id;
    v_choice := case when v_pay.paying_by_before is not null and v_paying_by = v_pay.method
                     then v_pay.paying_by_before else v_paying_by end;
    v_after  := case when p_method <> v_pay.method then p_method else v_paying_by end;
    v_before := case when v_after = p_method and v_choice <> p_method then v_choice end;

    perform set_config('tkd.action', 'private_edit_payment', true);
    perform set_config('tkd.batch_id', gen_random_uuid()::text, true);

    insert into public.testing_private_payments
      (private_id, kind, amount_cents, method, paid_on, recorded_at, recorded_by, recorded_by_name,
       reverses_payment_id)
    values
      (v_pay.private_id, 'reversal', -v_pay.amount_cents, v_pay.method, public.testing_today(), now(), auth.uid(),
       public.change_log_actor_name(), v_pay.id);

    insert into public.testing_private_payments
      (private_id, kind, amount_cents, method, paid_on, recorded_at, recorded_by, recorded_by_name,
       paying_by_before)   -- 0030
    values
      (v_pay.private_id, 'payment', p_amount_cents, p_method, p_paid_on, now(), auth.uid(),
       public.change_log_actor_name(), v_before)   -- 0030
    returning id into v_new_id;

    update public.testing_private p
       set version   = p.version + 1,
           paying_by = v_after   -- 0030: the new way, if the edit changed the way
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


-- ---------------------------------------------------------------------
-- 4c. Move to private and its Undo carry the family's choice (v0.419) -
--     REPLACED (same names, same arguments, same rights, same statuses
--     and answers). Every line is 0014's (9a, 9b) except the ones marked
--     "0030": the copied payments also copy paying_by_before. The
--     private testing takes the registration's "Paying by" (as before),
--     so Undo payment on the private testing works the same as on the
--     event. Finance reads only the method / amount / day of these rows,
--     so its totals are unchanged.
-- ---------------------------------------------------------------------

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
-- (0030) each moved private payment also carries the event payment's
-- paying_by_before (the family's choice), so Undo payment on the private
-- testing puts it back the same way. Nothing else changes.
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
       moved_from_payment_id, paying_by_before)   -- 0030: + paying_by_before
    select v_private_id, 'payment', p.amount_cents, p.method, p.paid_on,
           p.recorded_at,   -- the ORIGINAL recording time, so "the most recent payment" stays the same one
           auth.uid(), public.change_log_actor_name(), p.id,
           p.paying_by_before   -- 0030: the family's choice moves with the payment
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
-- (0030) each event payment recorded again also carries the private
-- payment's paying_by_before back. Nothing else changes.
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
      (registration_id, kind, amount_cents, method, paid_on, recorded_at, recorded_by, recorded_by_name,
       paying_by_before)   -- 0030
    select v_r.id, 'payment', x.amount_cents, x.method, x.paid_on,
           x.recorded_at,   -- the original recording time again (the order is kept)
           null, public.change_log_actor_name(),
           x.paying_by_before   -- 0030: the family's choice comes back with the payment
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

-- =====================================================================
-- end of 0030's code
-- =====================================================================


-- ---------------------------------------------------------------------
-- 4. The two views again, without paying_by_on_form. "create or replace
--    view" can't take a column away, so each is removed and made again,
--    word for word from 0005 section 10 / 0014 section 5, with its rights
--    as 0005 / 0014 set them (everything revoked, then select for
--    authenticated only). Nothing else uses them.
-- ---------------------------------------------------------------------
drop view if exists public.testing_roster;
drop view if exists public.testing_private_list;

-- ---------------------------------------------------------------------
-- 10. The roster view: public.testing_roster
-- One row per registration with its class and belt (from the event copy)
-- and its payment state. NEVER the signature or the submission id (only
-- "signed" true/false and when the signature was removed), never login ids.
--   paid_cents  = all its payments added up (reversals are negative)
--   paid        = paid_cents > 0
--   paid_on / paid_method / last_payment_id / last_payment_recorded_at =
--     its latest payment that has NOT been reversed (for "Paid on", the
--     toast's Undo and the admin's Edit / Undo payment)
-- security_invoker = true: the view reads the tables with the CALLER's
-- rights, so the table rules (RLS has_data_access, column rights) still
-- apply - a locked session sees no rows.
-- ---------------------------------------------------------------------
create or replace view public.testing_roster
with (security_invoker = true)
as
select r.id,
       r.event_id,
       r.event_rank_id,
       r.first_name,
       r.last_name,
       r.paying_by,
       r.stripes_confirmed,
       r.source,
       r.reference,
       (r.signed_at is not null) as signed,
       r.signed_at,
       r.signature_deleted_at,
       r.ack_version,
       r.registered_at,
       r.status,
       r.withdrawn_reason,
       r.withdrawn_at,
       r.withdrawn_by_name,
       r.duplicate_state,
       r.duplicate_of,
       r.version,
       r.created_at,
       r.updated_at,
       r.created_by_name,
       r.updated_by_name,
       c.id           as event_class_id,
       c.class_id,
       c.class_name,
       c.position     as class_position,
       c.start_time,
       c.end_time,
       k.rank_id,
       k.name         as rank_name,
       k.position     as rank_position,
       k.belt_pattern,
       k.belt_color,
       k.belt_color_2,
       k.belt_end_stripes,
       k.belt_end_stripe_color,
       k.early_cents,
       k.day_cents,
       k.sparring_gear,
       coalesce(t.paid_cents, 0)     as paid_cents,
       coalesce(t.paid_cents, 0) > 0 as paid,
       lp.paid_on,
       lp.method      as paid_method,
       lp.id          as last_payment_id,
       lp.recorded_at as last_payment_recorded_at
  from public.testing_registrations r
  join public.testing_event_ranks k   on k.id = r.event_rank_id
  join public.testing_event_classes c on c.id = k.event_class_id
  left join lateral (select sum(p.amount_cents)::integer as paid_cents
                       from public.testing_payments p
                      where p.registration_id = r.id) as t on true
  left join lateral (select p.id, p.paid_on, p.method, p.recorded_at
                       from public.testing_payments p
                      where p.registration_id = r.id
                        and p.kind = 'payment'
                        and not exists (select 1 from public.testing_payments x
                                         where x.reverses_payment_id = p.id)
                      order by p.recorded_at desc, p.id desc
                      limit 1) as lp on true;

comment on view public.testing_roster is
  'Roster rows: registration + class/belt from the event copy + payment state. No signature, no submission id, no login ids. Runs with the caller''s rights.';

revoke all on table public.testing_roster from public, anon, authenticated, service_role;
grant select on public.testing_roster to authenticated;

-- ---------------------------------------------------------------------
-- 5. The read view: public.testing_private_list
-- One row per private testing with its payment state (like 0005's
-- testing_roster):
--   paid_cents = all its payments added up (reversals are negative)
--   paid       = paid_cents > 0
--   paid_on / paid_method / last_payment_id / last_payment_recorded_at =
--     its latest payment that has NOT been reversed
--   amount_due_cents = what is still owed (contract §1.3), worked out HERE
--     from the same sum - the view never calls testing_private_amount_due
--     (it runs with the caller's rights, and that helper is granted to
--     nobody)
-- Never the login ids. security_invoker = true: the table rules (RLS
-- has_data_access, column rights) still apply - a locked session sees no
-- rows.
-- ---------------------------------------------------------------------
create or replace view public.testing_private_list
with (security_invoker = true)
as
select p.id,
       p.location_code,
       p.first_name,
       p.last_name,
       p.class_id,
       p.class_name,
       p.rank_id,
       p.rank_name,
       p.belt_pattern,
       p.belt_color,
       p.belt_color_2,
       p.belt_end_stripes,
       p.belt_end_stripe_color,
       p.to_kind,
       p.to_name,
       p.to_belt_pattern,
       p.to_belt_color,
       p.to_belt_color_2,
       p.to_belt_end_stripes,
       p.to_belt_end_stripe_color,
       p.private_cents,
       p.paying_by,
       p.stripes_confirmed,
       p.private_date,
       p.private_time,
       p.status,
       p.cancelled_at,
       p.cancelled_by_name,
       p.moved_from_event_id,
       p.moved_from_registration_id,
       p.moved_from_event_name,
       p.moved_cleared_no_show,
       p.moved_registration_version,
       p.version,
       p.created_at,
       p.updated_at,
       p.created_by_name,
       p.updated_by_name,
       coalesce(t.net, 0)     as paid_cents,
       coalesce(t.net, 0) > 0 as paid,
       lp.paid_on,
       lp.method      as paid_method,
       lp.id          as last_payment_id,
       lp.recorded_at as last_payment_recorded_at,
       greatest(p.private_cents - greatest(coalesce(t.net, 0), 0), 0) as amount_due_cents
  from public.testing_private p
  left join lateral (select sum(x.amount_cents)::integer as net
                       from public.testing_private_payments x
                      where x.private_id = p.id) as t on true
  left join lateral (select x.id, x.paid_on, x.method, x.recorded_at
                       from public.testing_private_payments x
                      where x.private_id = p.id
                        and x.kind = 'payment'
                        and not exists (select 1 from public.testing_private_payments y
                                         where y.reverses_payment_id = x.id)
                      order by x.recorded_at desc, x.id desc
                      limit 1) as lp on true;

comment on view public.testing_private_list is
  'Private testing rows + payment state + what is still owed (computed inline). No login ids. Runs with the caller''s rights.';

revoke all on table public.testing_private_list from public, anon, authenticated, service_role;
grant select on public.testing_private_list to authenticated;


-- ---------------------------------------------------------------------
-- 5. The rules, foreign keys and columns go (their column rights with
--    them). "if exists": a second run changes nothing.
-- ---------------------------------------------------------------------
alter table public.testing_registrations    drop constraint if exists testing_registrations_paying_by_on_form_check;
alter table public.testing_private          drop constraint if exists testing_private_paying_by_on_form_check;
alter table public.testing_payments         drop constraint if exists testing_payments_school_fk;
alter table public.testing_private_payments drop constraint if exists testing_private_payments_school_fk;

alter table public.testing_registrations    drop column if exists paying_by_on_form;
alter table public.testing_private          drop column if exists paying_by_on_form;
alter table public.testing_payments         drop column if exists school;
alter table public.testing_private_payments drop column if exists school;


commit;

-- End of 0044u_undo_color_belt_rolling_check.sql