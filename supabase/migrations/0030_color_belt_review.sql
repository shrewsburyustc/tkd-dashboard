-- =====================================================================
-- 0030_color_belt_review.sql
-- ---------------------------------------------------------------------
-- WHAT THIS FILE IS
--   The database half of the Color Belt design review (rulebook v0.418
--   and v0.419; plan: docs/Testing/Color Belt Testing/
--   TKD-ColorBelt-0030-Plan.md, Jeffrey's answers Q1-Q6). It runs after
--   0005, 0010, 0014 and 0018 (all live) and stops with a clear message
--   if something it needs is missing.
--
-- WHY IT EXISTS
--   The reviewed screens need three things the database can't do yet:
--   CB1  "Mark paid" asks HOW the family pays (cash / check / card)
--        instead of always using the "Paying by" they chose.
--   CB7  a History line on a registration and on a private testing.
--   CB18 an admin-only results CSV of one event, with a download log.
--
-- WHAT IT ADDS
--   1. one new column on each of the two payment tables:
--      testing_payments.paying_by_before and
--      testing_private_payments.paying_by_before (text, NULL). Set ONLY
--      when Mark paid by a different way (or an admin's Edit payment to
--      a different way, v0.419) also changed the student's "Paying by" -
--      it remembers the family's choice, so Undo payment can put it back
--      (Q2); Move to private and Undo move copy it with the payment.
--      The payment tables stay append-only (their guards refuse every
--      update), so the value can never change later. Read
--      rights follow each table's own rule (section 2): not readable on
--      testing_payments, readable on testing_private_payments. Finance
--      never reads it (Finance names its columns one by one).
--   2. CB1 - two NEW app functions (new names, so the live site keeps
--      calling the old 2-argument ones until the new app is deployed):
--        testing_mark_paid_by(p_registration_id, p_expected_version,
--                             p_method, p_expected_cents)
--        testing_private_mark_paid_by(p_private_id, p_expected_version,
--                                     p_method, p_expected_cents)
--      The old testing_mark_paid / testing_private_mark_paid are NOT
--      changed (a later small migration removes them).
--   3. TWO REPLACED live functions (same names, same arguments, same
--      rights): testing_undo_payment and testing_private_undo_payment.
--      Their bodies are 0005's / 0014's word for word, plus: when the
--      undone payment remembered an earlier "Paying by", it is put back
--      (in the same batch, so it is logged with the undo). For payments
--      made by the old functions (paying_by_before NULL) nothing extra
--      happens. Their answer stays {"status":"ok","version":n}.
--   3b. FOUR MORE REPLACED live functions (v0.419, "A: follows too"; same
--      names, same arguments, same rights, same statuses and answers):
--        testing_edit_payment (0005 14l) and testing_private_edit_payment
--          (0014 8g): an admin's Edit payment that changes the way it was
--          paid also changes "Paying by" to the new way (same update and
--          batch, logged), and the new payment keeps the family's choice
--          in paying_by_before, so Undo payment still puts back what the
--          family chose (the exact rule: section 4b).
--        testing_move_to_private (0014 9a) and testing_private_undo_move
--          (0014 9b): the payments they copy also copy paying_by_before
--          (section 4c). Nothing else in them changes.
--      None of the six is replaced by any later migration (0018, 0026
--      and the rest only read the payment tables), so their live bodies
--      are 0005's / 0014's.
--      THEIR FINGERPRINTS CHANGE: in 0003_, 0005_ and
--      0014_fingerprints.sql these six function lines move (body md5
--      only: testing_undo_payment and testing_edit_payment in 0005's
--      file, the other four in 0014's, all six in 0003's list); 0014's
--      file also shows the new rule line and the new column right on
--      testing_private_payments (section 2); 0003's list gains the new
--      testing_* functions. Nothing else moves.
--   4. CB7 - testing_history_strip (helper, nobody in the app may call
--      it), testing_registration_history and testing_private_history.
--   5. CB18 - table public.testing_downloads (the CSV download log),
--      its guard trigger function testing_downloads_guard, and
--      testing_results_csv (admins only).
--   Nothing is granted to anon. Nothing for service_role or the family
--   form's login (testing_registrar).
--
-- FOR THE APP BUILDER (CB18)
--   testing_results_csv returns raw values. Cells can hold free text (the
--   grader's note, names). When the app writes the CSV file it MUST make
--   every cell that starts with = + - @ (also after leading spaces, and a
--   tab or carriage return) safe for spreadsheets (formula injection) -
--   e.g. put a ' in front. That is the app's job, not this file's.
--
-- HOW TO RUN IT
--   Supabase dashboard -> SQL Editor -> New query -> paste this WHOLE file
--   -> Run. It starts with "begin;" and ends with "commit;", so it is one
--   transaction: if any statement fails, nothing is kept.
--   Supabase may warn about destructive operations: the words appear only
--   in "drop trigger if exists" lines that make re-running safe and inside
--   the guard trigger's refusal text. Nothing is removed. Confirm.
--   Safe to run again (tested in PGlite: a second run changes no
--   fingerprint).
--   RE-RUN ORDER: re-running 0005 or 0014 after this file puts back the
--   old Undo payment, Edit payment and (0014) Move / Undo move, which do
--   not keep or restore "Paying by" - re-run 0030 straight after it.
--   Undo: supabase/SETUP.md, "Migration 0030", 0030e.
--
-- WORDS USED BELOW
--   * "worked-out amount": what the database charges right now - for an
--     event registration the early price before the testing day, the
--     testing-day price on and after it (0005's testing_fee_cents); for a
--     private testing what is still owed (0014's testing_private_amount_due:
--     the full price, or the rest after an earlier part payment).
--   * "net paid": all of a student's payments added up (reversals are
--     negative).
--   * statuses: ok, no_access, not_allowed, not_found, stale, invalid,
--     withdrawn, cancelled, already_paid, price_changed (new).
--   * tkd.action names: the old ones - mark_paid, private_mark_paid,
--     undo_payment, private_undo_payment, edit_payment,
--     private_edit_payment, move_to_private, undo_move_to_private,
--     clear_result - and testing_results_csv (only
--     for the download log row, which is not in change_log).
-- =====================================================================

begin;


-- ---------------------------------------------------------------------
-- 1. The guard: this file needs 0005, 0010, 0014 and 0018. Stops - and
--    changes nothing - if a table or function it uses is missing.
-- ---------------------------------------------------------------------
do $$
begin
  if to_regclass('public.testing_registrations') is null
     or to_regclass('public.testing_payments') is null
     or to_regclass('public.testing_results') is null
     or to_regclass('public.testing_private') is null
     or to_regclass('public.testing_private_payments') is null
     or to_regclass('public.testing_private_results') is null
     or to_regclass('public.change_log') is null
     or to_regprocedure('public.has_data_access()') is null
     or to_regprocedure('public.is_admin()') is null
     or to_regprocedure('public.change_log_actor_name()') is null
     or to_regprocedure('public.testing_refuse_truncate()') is null
     or to_regprocedure('public.testing_today()') is null
     or to_regprocedure('public.testing_fee_cents(integer, integer, date, date)') is null
     or to_regprocedure('public.testing_lock_registration(uuid)') is null
     or to_regprocedure('public.testing_lock_payment(uuid)') is null
     or to_regprocedure('public.testing_purge_old_signatures()') is null
     or to_regprocedure('public.testing_rank_testing_for(uuid)') is null
     or to_regprocedure('public.testing_mark_paid(uuid, integer)') is null
     or to_regprocedure('public.testing_undo_payment(uuid)') is null
     or to_regprocedure('public.testing_edit_payment(uuid, text, integer, date)') is null
     or to_regprocedure('public.testing_private_lock(uuid)') is null
     or to_regprocedure('public.testing_private_lock_payment(uuid)') is null
     or to_regprocedure('public.testing_private_amount_due(uuid)') is null
     or to_regprocedure('public.testing_private_mark_paid(uuid, integer)') is null
     or to_regprocedure('public.testing_private_undo_payment(uuid)') is null
     or to_regprocedure('public.testing_private_edit_payment(uuid, text, integer, date)') is null
     or to_regprocedure('public.testing_move_to_private(uuid, integer, date, time)') is null
     or to_regprocedure('public.testing_private_undo_move(uuid, integer)') is null
     or to_regprocedure('public.testing_private_time_is_valid(time)') is null
     or to_regprocedure('public.testing_recheck_pointing_at(uuid)') is null
     or to_regprocedure('public.testing_recheck_duplicate(uuid)') is null then
    raise exception '0030 needs migrations 0005, 0010 and 0014 (Color Belt testing) first';
  end if;
  if to_regclass('public.finance_testing_private_payments_paid_on_idx') is null then
    raise exception '0030 needs migration 0018 (private testing payments in Finance) first';
  end if;
end
$$;


-- ---------------------------------------------------------------------
-- 2. "Paying by before" on the two payment tables (Q2)
--   * NULL for every payment except one made by Mark paid by a different
--     way than the student's "Paying by": then it holds the OLD "Paying
--     by" (Mark paid changed it to the payment's method). Since v0.419
--     also the new payment of an Edit payment that changed the way (the
--     family's choice, section 4b), and the copies Move to private / Undo
--     move make of such payments (section 4c).
--   * the rule: only on a payment (never a reversal), one of cash / check
--     / card, and never the same as the payment's method (it only exists
--     when the two differed).
--   * existing rows get NULL ("add column ... null" fills nothing in and
--     rewrites nothing). The payments guards refuse every update, so the
--     value is fixed from the moment the payment is written.
--   * read rights follow each table's own rule: 0005 lists the
--     testing_payments columns the app may read one by one, so this one is
--     NOT added there; 0014's rule is "every column of
--     testing_private_payments except the login ids", so authenticated
--     may read it there (0014_tests.sql V1 checks exactly that rule). It
--     holds no personal data - only cash / check / card. Finance reads its
--     columns by name, so nothing there changes.
--   "add column if not exists", the rule added only when missing and a
--   repeated grant: re-running changes nothing.
-- ---------------------------------------------------------------------
alter table public.testing_payments         add column if not exists paying_by_before text null;
alter table public.testing_private_payments add column if not exists paying_by_before text null;

do $$
begin
  if not exists (select 1 from pg_constraint c
                  where c.conrelid = 'public.testing_payments'::regclass
                    and c.conname = 'testing_payments_paying_by_before_check') then
    alter table public.testing_payments add constraint testing_payments_paying_by_before_check
      check (paying_by_before is null
             or (kind = 'payment' and paying_by_before in ('cash', 'check', 'card') and paying_by_before <> method));
  end if;
  if not exists (select 1 from pg_constraint c
                  where c.conrelid = 'public.testing_private_payments'::regclass
                    and c.conname = 'testing_private_payments_paying_by_before_check') then
    alter table public.testing_private_payments add constraint testing_private_payments_paying_by_before_check
      check (paying_by_before is null
             or (kind = 'payment' and paying_by_before in ('cash', 'check', 'card') and paying_by_before <> method));
  end if;
end
$$;

-- 0014's rule for testing_private_payments: every column but the login ids
grant select (paying_by_before) on public.testing_private_payments to authenticated;

comment on column public.testing_payments.paying_by_before is
  'Set only when Mark paid (testing_mark_paid_by) or Edit payment (testing_edit_payment) also changed the registration''s paying_by to this payment''s method: the family''s choice, so Undo payment can put it back; Undo move copies it back. Not in the app''s column rights (0005 lists them one by one).';
comment on column public.testing_private_payments.paying_by_before is
  'Set only when Mark paid (testing_private_mark_paid_by) or Edit payment (testing_private_edit_payment) also changed the private testing''s paying_by to this payment''s method: the family''s choice, so Undo payment can put it back; Move to private copies it here. Readable by authenticated (0014: every column but the login ids).';


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


-- ---------------------------------------------------------------------
-- 5. CB7 - History
-- ---------------------------------------------------------------------

-- 5a. testing_history_strip(row) - takes every login-id key out of a
-- history row's before / after (History shows who by NAME only - the
-- actor_name and the *_by_name columns): created_by, updated_by,
-- withdrawn_by, recorded_by, cancelled_by, plus submission_id (the family
-- browser's send id; 0005's log already leaves it out). A signature shows
-- only as "on file" (0005's log already writes it that way; this makes
-- sure). NULL stays NULL. Like Star's star_history_strip: nobody in the
-- app may call it.
create or replace function public.testing_history_strip(p_row jsonb)
returns jsonb
language sql
immutable
set search_path = ''
as $$
  select case
           when p_row is null then null
           when coalesce(p_row -> 'signature', 'null'::jsonb) <> 'null'::jsonb then
             (p_row - array['created_by', 'updated_by', 'withdrawn_by', 'recorded_by', 'cancelled_by', 'submission_id'])
             || jsonb_build_object('signature', 'on file')
           else
             p_row - array['created_by', 'updated_by', 'withdrawn_by', 'recorded_by', 'cancelled_by', 'submission_id']
         end;
$$;

revoke execute on function public.testing_history_strip(jsonb) from public, anon, authenticated, service_role;

-- 5b. testing_registration_history(p_registration_id)   S
-- The History line of an event registration: newest first, at most 500
-- rows - the change_log rows of THIS registration (testing_registrations),
-- its result (testing_results; its record_id is the registration's id)
-- and its payments (testing_payments). A payment is found through its
-- INSERT row (update rows hold only the changed columns), whose "after"
-- names this registration_id; then rows are matched by the PAIR
-- (table_name, record_id), so another table's row with the same id never
-- appears (Star's star_candidate_history pattern). A registration moved to
-- a private testing keeps its own rows up to the move (and its reversals);
-- the private testing's rows are not here (Q4).
-- Only occurred_at, actor_name, action, table_name, op, before, after -
-- before / after with every login id removed (5a). No actor_id,
-- session_id or batch_id.
-- Refused: no_access; invalid (no id); not_found (no such registration -
-- also after Delete permanently).
-- Ok: {"status":"ok","rows":[{occurred_at, actor_name, action, table_name, op, before, after}]}
-- locks: none (a read)
create or replace function public.testing_registration_history(p_registration_id uuid)
returns jsonb
language plpgsql
stable
security definer
set search_path = ''
as $$
begin
  begin
    if public.has_data_access() is not true then
      return jsonb_build_object('status', 'no_access');
    end if;
    if p_registration_id is null then
      return jsonb_build_object('status', 'invalid');
    end if;
    if not exists (select 1 from public.testing_registrations r where r.id = p_registration_id) then
      return jsonb_build_object('status', 'not_found');
    end if;

    return jsonb_build_object(
      'status', 'ok',
      'rows', coalesce((
        select jsonb_agg(jsonb_build_object(
                           'occurred_at', h.occurred_at,
                           'actor_name',  h.actor_name,
                           'action',      h.action,
                           'table_name',  h.table_name,
                           'op',          h.op,
                           'before',      public.testing_history_strip(h.before),
                           'after',       public.testing_history_strip(h.after))
                         order by h.occurred_at desc, h.id desc)
          from (select l.id, l.occurred_at, l.actor_name, l.action, l.table_name, l.op, l.before, l.after
                  from public.change_log l
                 where (l.table_name in ('testing_registrations', 'testing_results') and l.record_id = p_registration_id)
                    or (l.table_name, l.record_id) in
                       (select i.table_name, i.record_id
                          from public.change_log i
                         where i.table_name = 'testing_payments'
                           and i.op = 'insert'
                           and i.after ->> 'registration_id' = p_registration_id::text)
                 order by l.occurred_at desc, l.id desc
                 limit 500) as h), '[]'::jsonb));
  exception
    -- the same mapping as the write functions: a rare table rule or lock
    -- problem answers a status instead of an error
    when unique_violation then
      return jsonb_build_object('status', 'stale');
    when foreign_key_violation or check_violation or not_null_violation then
      return jsonb_build_object('status', 'invalid');
    when deadlock_detected or serialization_failure or lock_not_available then
      return jsonb_build_object('status', 'stale');
  end;
end;
$$;

revoke execute on function public.testing_registration_history(uuid) from public, anon, authenticated, service_role;
grant  execute on function public.testing_registration_history(uuid) to authenticated;

-- 5c. testing_private_history(p_private_id)   S
-- The History line of a private testing, as 5b: the rows of THIS private
-- testing (testing_private), its result (testing_private_results; its
-- record_id is the private testing's id) and its payments
-- (testing_private_payments, found through their insert rows whose
-- "after" names this private_id). ONLY its own rows (Q4): a private
-- testing moved from an event starts with its own insert row (whose
-- "after" names the event, moved_from_event_name) and the moved-in
-- payments; the registration's earlier rows stay on the event side.
-- Refused: no_access; invalid; not_found.
-- Ok: {"status":"ok","rows":[{occurred_at, actor_name, action, table_name, op, before, after}]}
-- locks: none (a read)
create or replace function public.testing_private_history(p_private_id uuid)
returns jsonb
language plpgsql
stable
security definer
set search_path = ''
as $$
begin
  begin
    if public.has_data_access() is not true then
      return jsonb_build_object('status', 'no_access');
    end if;
    if p_private_id is null then
      return jsonb_build_object('status', 'invalid');
    end if;
    if not exists (select 1 from public.testing_private p where p.id = p_private_id) then
      return jsonb_build_object('status', 'not_found');
    end if;

    return jsonb_build_object(
      'status', 'ok',
      'rows', coalesce((
        select jsonb_agg(jsonb_build_object(
                           'occurred_at', h.occurred_at,
                           'actor_name',  h.actor_name,
                           'action',      h.action,
                           'table_name',  h.table_name,
                           'op',          h.op,
                           'before',      public.testing_history_strip(h.before),
                           'after',       public.testing_history_strip(h.after))
                         order by h.occurred_at desc, h.id desc)
          from (select l.id, l.occurred_at, l.actor_name, l.action, l.table_name, l.op, l.before, l.after
                  from public.change_log l
                 where (l.table_name in ('testing_private', 'testing_private_results') and l.record_id = p_private_id)
                    or (l.table_name, l.record_id) in
                       (select i.table_name, i.record_id
                          from public.change_log i
                         where i.table_name = 'testing_private_payments'
                           and i.op = 'insert'
                           and i.after ->> 'private_id' = p_private_id::text)
                 order by l.occurred_at desc, l.id desc
                 limit 500) as h), '[]'::jsonb));
  exception
    when unique_violation then
      return jsonb_build_object('status', 'stale');
    when foreign_key_violation or check_violation or not_null_violation then
      return jsonb_build_object('status', 'invalid');
    when deadlock_detected or serialization_failure or lock_not_available then
      return jsonb_build_object('status', 'stale');
  end;
end;
$$;

revoke execute on function public.testing_private_history(uuid) from public, anon, authenticated, service_role;
grant  execute on function public.testing_private_history(uuid) to authenticated;


-- ---------------------------------------------------------------------
-- 6. CB18 - the results CSV
-- ---------------------------------------------------------------------

-- 6a. public.testing_downloads - the log of every results CSV download
-- (like Star's star_downloads and Black Belt's bb_downloads): who, when,
-- which event, how many rows. Written by testing_results_csv BEFORE any
-- row leaves the database. Append-only (6b). No foreign key to the event
-- on purpose: the log outlives a removed event. Not in change_log (a
-- download isn't a data change). Nobody in the app can read it (SQL
-- Editor only). downloaded_by is a login id.
create table if not exists public.testing_downloads (
  id                 uuid        not null default gen_random_uuid(),
  event_id           uuid        not null,
  event_name         text        not null,
  row_count          integer     not null,
  downloaded_at      timestamptz not null default now(),
  downloaded_by      uuid        null,      -- login id; never readable by the app
  downloaded_by_name text        not null,

  constraint testing_downloads_pkey primary key (id),
  constraint testing_downloads_row_count_check check (row_count >= 0)
);

create index if not exists testing_downloads_event_idx on public.testing_downloads (event_id, downloaded_at);

comment on table public.testing_downloads is
  'Color Belt results CSV downloads (who, when, which event, how many rows). Append-only; SQL Editor only; not in change_log.';

-- 6b. testing_downloads_guard() - BEFORE INSERT OR UPDATE OR DELETE on
-- testing_downloads: a row is added only by testing_results_csv (it sets
-- tkd.action; the who / when are stamped here, whatever was sent) and is
-- never changed or removed by anyone, the SQL Editor's role included
-- (bb_downloads_guard's pattern).
create or replace function public.testing_downloads_guard()
returns trigger
language plpgsql
set search_path = ''
as $$
begin
  if tg_op = 'INSERT' and coalesce(current_setting('tkd.action', true), '') = 'testing_results_csv' then
    new.downloaded_at      := now();
    new.downloaded_by      := auth.uid();
    new.downloaded_by_name := public.change_log_actor_name();
    return new;
  end if;
  raise exception using
    errcode    = '23514',
    constraint = 'testing_downloads_immutable',
    message    = 'the download log is written only by the results CSV and is never changed or removed';
end;
$$;

revoke execute on function public.testing_downloads_guard() from public, anon, authenticated, service_role;

drop trigger if exists testing_downloads_guard on public.testing_downloads;
create trigger testing_downloads_guard
  before insert or update or delete on public.testing_downloads
  for each row execute function public.testing_downloads_guard();

drop trigger if exists testing_downloads_no_truncate on public.testing_downloads;
create trigger testing_downloads_no_truncate
  before truncate on public.testing_downloads
  for each statement execute function public.testing_refuse_truncate();

-- Rights: RLS on, no rule, no rights = nobody in the app (as bb_downloads).
alter table public.testing_downloads enable row level security;
revoke all on table public.testing_downloads from public, anon, authenticated, service_role;

-- 6c. testing_results_csv(p_event_id)   A   (writes the download log, so
-- "volatile")
-- Download CSV (CB18, Q3 = B): one event, ACTIVE students only - removed
-- (withdrawn) students, duplicate copies and students moved to a private
-- testing all have status 'withdrawn', so they are left out. In roster
-- order: class (its position in the event), belt (its position in the
-- class), last name, first name (then the id, so the order is fixed).
-- FIRST the testing_downloads row is written (who, when, how many rows);
-- if anything fails afterwards the log row is undone with it (one block).
-- A refused call writes nothing.
-- Never in it: the signature, login ids, staff names (no *_by_name), the
-- submission id. Color Belt stores no date of birth, email, address or
-- medical details.
-- Refused: no_access (has_data_access() first); not_allowed (not an
-- admin); invalid (no id); not_found (no such event).
-- Ok: {"status":"ok",
--      "event":{"id","name","testing_date","location_code","location_name"},
--      "rows":[{"registration_id","reference" (CB-3101),"first_name",
--               "last_name","class_name","start_time","end_time"
--               ("HH:MM:SS", the class's testing time),"current_belt"
--               (the rank name),"testing_for" (the next rank's name, or
--               null = No new rank),"result" (pass / not_passed / no_show
--               / null),"note" (the grader's note, or null),"paying_by",
--               "paid" (true when net paid > 0),"paid_cents" (net paid),
--               "paid_on","paid_method" (the newest payment that still
--               counts - not reversed - or null: the roster's rule)}]}
-- The app writes the columns: Reference, First name, Last name, Class,
-- Class time, Belt, Testing for, Result, Grader's note, Paying by, Paid,
-- Amount paid, Paid on, Paid by - and makes = + - @ cells safe (header).
create or replace function public.testing_results_csv(p_event_id uuid)
returns jsonb
language plpgsql
volatile
security definer
set search_path = ''
as $$
declare
  v_e          public.testing_events;
  v_count      integer;
  v_rows       jsonb;
  v_constraint text;
begin
  begin
    if public.has_data_access() is not true then
      return jsonb_build_object('status', 'no_access');
    end if;
    if public.is_admin() is not true then
      return jsonb_build_object('status', 'not_allowed');
    end if;
    if p_event_id is null then
      return jsonb_build_object('status', 'invalid');
    end if;
    select * into v_e from public.testing_events e where e.id = p_event_id;
    if not found then
      return jsonb_build_object('status', 'not_found');
    end if;

    select coalesce(jsonb_agg(x.row order by x.class_position, x.rank_position, x.last_key, x.first_key, x.id),
                    '[]'::jsonb)
      into v_rows
      from (select r.id,
                   c.position as class_position,
                   k.position as rank_position,
                   lower(r.last_name)  as last_key,
                   lower(r.first_name) as first_key,
                   jsonb_build_object(
                     'registration_id', r.id,
                     'reference',       r.reference,
                     'first_name',      r.first_name,
                     'last_name',       r.last_name,
                     'class_name',      c.class_name,
                     'start_time',      c.start_time,
                     'end_time',        c.end_time,
                     'current_belt',    k.name,
                     'testing_for',     public.testing_rank_testing_for(k.id) ->> 'name',
                     'result',          res.result,
                     'note',            res.note,
                     'paying_by',       r.paying_by,
                     'paid',            coalesce(t.paid_cents, 0) > 0,
                     'paid_cents',      coalesce(t.paid_cents, 0),
                     'paid_on',         lp.paid_on,
                     'paid_method',     lp.method) as row
              from public.testing_registrations r
              join public.testing_event_ranks k   on k.id = r.event_rank_id
              join public.testing_event_classes c on c.id = k.event_class_id
              left join public.testing_results res on res.registration_id = r.id
              left join lateral (select sum(p.amount_cents)::integer as paid_cents
                                   from public.testing_payments p
                                  where p.registration_id = r.id) as t on true
              -- the newest payment that still counts (testing_roster's rule)
              left join lateral (select p.paid_on, p.method
                                   from public.testing_payments p
                                  where p.registration_id = r.id
                                    and p.kind = 'payment'
                                    and not exists (select 1 from public.testing_payments x
                                                     where x.reverses_payment_id = p.id)
                                  order by p.recorded_at desc, p.id desc
                                  limit 1) as lp on true
             where r.event_id = p_event_id and r.status = 'active') as x;

    -- the log row, with the exact number of rows in the file. It is written
    -- before anything leaves the database: the function only answers below.
    -- (Counting from the built list, not a separate count, so a registration
    -- saved between two statements can't make the two numbers differ.)
    v_count := jsonb_array_length(v_rows);
    perform set_config('tkd.action', 'testing_results_csv', true);
    insert into public.testing_downloads (event_id, event_name, row_count, downloaded_by_name)
    values (p_event_id, v_e.name, v_count, '');
    perform set_config('tkd.action', '', true);

    return jsonb_build_object(
      'status', 'ok',
      'event', jsonb_build_object('id', v_e.id, 'name', v_e.name, 'testing_date', v_e.testing_date,
                                  'location_code', v_e.location_code,
                                  'location_name', (select l.name from public.locations l where l.code = v_e.location_code)),
      'rows', v_rows);
  exception
    -- the same mapping as the write functions: a rare table rule or lock
    -- problem answers a status instead of an error, and everything this
    -- call did (its download row) is undone
    when unique_violation then
      return jsonb_build_object('status', 'stale');
    when foreign_key_violation or check_violation or not_null_violation then
      return jsonb_build_object('status', 'invalid');
    when deadlock_detected or serialization_failure or lock_not_available then
      return jsonb_build_object('status', 'stale');
  end;
end;
$$;

revoke execute on function public.testing_results_csv(uuid) from public, anon, authenticated, service_role;
grant  execute on function public.testing_results_csv(uuid) to authenticated;


commit;
