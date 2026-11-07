-- =====================================================================
-- 0039_camps_record_refund.sql
-- ---------------------------------------------------------------------
-- WHAT THIS FILE IS
--   The database half of Camps "Record refund" (rulebook v1.039 = money
--   handed back is its own refund row, on the day it goes out; v1.040 =
--   it counts at the desk that hands it back; v0.743 = the screens and
--   words, picture 22; plan docs/Camps/TKD-Camps-Pass1-Plan.md step 3;
--   contract docs/Camps/CONTRACT-0039.md). The model is Star's refund
--   (0006: star_record_refund, and how star_undo_payment treats refunds).
--   It runs AFTER 0013, 0022, 0027, 0033 and 0043 (all live) and stops
--   with a clear message if one of them is missing.
--
-- WHY IT EXISTS
--   A camper can end up paying more than the total (days or extras
--   removed after paying - Camper detail then says "Paid $X more than the
--   total", v0.700 (6)). When the school hands that money back, an admin
--   records it with ... -> Record refund: its OWN negative row in
--   camp_payments (kind 'refund'), cash or check, dated the day the money
--   goes out, stored with the school of the desk that hands it back
--   (This device, v1.040). The payment itself is never edited for this,
--   so a day already counted never changes, and Finance shows the refund
--   on its own day in its Refunds group, like Star's and Black Belt's.
--   "Paid" stays the sum of all the camper's rows (camp_camper_paid_cents
--   and the roster's paid_cents), so a refund (negative) and its Undo
--   (positive) count by themselves - nothing that adds up money changes.
--
-- WHAT IT CHANGES
--   1. The table rule camp_payments_kind_check (last set by 0022, section
--      7d) gets a third kind:
--        payment   1 cent ... $10,000, reverses nothing    (0022, unchanged)
--        refund    -$10,000 ... -1 cent, reverses nothing, cash or check
--                  (NEW: entered positive, stored negative; the real
--                  limit is what the camper overpaid)
--        reversal  -$10,000 ... +$10,000, never 0, reverses one row
--                  (0022: -$10,000 ... -1 cent; the reversal of a refund
--                  is positive)
--      Replaced the way 0022 replaced it: "drop constraint if exists" and
--      "add constraint" with the same name, in this file's one
--      transaction. The new rule only allows MORE, so every existing row
--      passes it (Postgres checks them all when it is added); nothing is
--      rewritten.
--      A refund is cash or check only, in the kind rule itself (as Star's
--      table rule, 0006 section 8); camp_record_refund checks it first and
--      answers "invalid". The column rule stays cash / check / card (for
--      payments).
--   2. camp_payments_guard() (0013 13h) - a reversal may now undo a
--      payment OR A REFUND (never a reversal) of the same camper, for
--      exactly minus its amount, at its school; and (Star's rule, 0006's
--      star_payments_guard) no new row may make the camper's rows add up
--      to less than 0 (camp_payments_net_check) - the functions never try
--      to (a refund is at most what was overpaid, and Undo / Edit payment
--      wait for the refund's Undo), so this only stops a mistake made
--      straight in the table. Everything else as 0013: no update ever; no
--      removal except inside Delete camper / Delete camp. The trigger
--      itself is not touched (it calls the function by name).
--   3. NEW camp_record_refund(p_camper_id, p_expected_version, p_method,
--      p_amount_cents, p_refunded_on, p_school) - admins. Refused unless
--      the camper is overpaid by at least the amount
--      ({"status":"refund_too_large","overpaid_cents":n}).
--   4. NEW camp_undo_refund(p_payment_id) - admins. A reversal of the
--      refund, at the refund's school (v1.040), dated today.
--   5. camp_undo_payment and camp_edit_payment (0033's versions) - same
--      inputs, rights and answers, plus ONE refusal: while the camper has
--      a refund that stands (not undone) ->
--      {"status":"refund_stands"} ("Undo the refund first."), so the money
--      already handed back can't also be taken out of a payment. As Star
--      (0006 18v / 18w), which answers "invalid" there.
--   6. The view camp_roster (0033's) - the same columns in the same order
--      plus ONE at the end: refunded_cents (the camper's refunds that
--      stand, as a positive number; 0 = none). "create or replace view"
--      can only add columns at the end. It keeps security_invoker = true
--      and its grant (select for authenticated only).
--   NOT changed: camp_camper_detail (0043's; its "payments" list already
--   holds every row with its kind and reverses_payment_id, and its
--   "camper" part is the roster row, so it gains refunded_cents by
--   itself), camp_public_signup_core, camp_mark_paid, camp_change_paying_by,
--   camp_camper_history (it already finds every camp_payments row of the
--   camper), Delete camper / Delete camp, and every Finance function
--   (0017 / 0018 / 0026 read camp_payments by kind and already treat a
--   'refund' row as a refund - Finance's R1-05 checks that, after this
--   file). Nothing is granted to anon, service_role or camps_registrar.
--
-- HOW TO RUN IT
--   After 0043 (live). Pasting it changes nothing on screen: the live app
--   never calls the two new functions, its calls of Undo / Edit payment
--   keep their inputs and answers, and no refund row can exist until the
--   app with Record refund is live (after Finance's R1-05).
--   Supabase dashboard -> SQL Editor -> New query -> paste this WHOLE file
--   -> Run. One transaction ("begin;" ... "commit;"): if any statement
--   fails, nothing is kept.
--   Supabase may warn about destructive operations. The line it means is
--   "alter table public.camp_payments drop constraint if exists
--   camp_payments_kind_check" - the kind rule, added again (wider) on the
--   very next line in the same transaction. The other words it may flag
--   are inside camp_payments_guard: its "DELETE" branch and the two tags
--   camp_delete_camper / camp_delete_camp (0013's rule that REFUSES every
--   other removal, unchanged). No data is removed.
--   From the kind rule's line until the paste commits, camp_payments is
--   locked: reads and saves of payments wait (well under a second), so
--   paste at a quiet moment. The roster view is made again BEFORE that
--   line, so this file locks the view and then camp_payments - the same
--   order as a roster read - and can't deadlock with one.
--   If anything errors, nothing is kept, and running it again is safe
--   (tested in PGlite: a second run changes no fingerprint and no row).
--   RE-RUN ORDER: 0013 and 0033 can't be re-run cleanly after this file:
--   their camp_roster has fewer columns, so their "create or replace
--   view" fails and nothing of them is kept. Re-running 0022 after it
--   would put back 0022's kind rule (refused - and nothing of 0022 kept -
--   once a refund row exists) and 0022's Edit payment: re-run 0039 (and
--   0043, as its notes say) straight after it.
-- =====================================================================

begin;


-- ---------------------------------------------------------------------
-- 1. The guard: this file needs 0013, 0022, 0027, 0033 and 0043. Stops -
--    and changes nothing - if one of them is missing.
-- ---------------------------------------------------------------------
do $$
begin
  if to_regclass('public.camp_campers') is null
     or to_regclass('public.camp_payments') is null
     or to_regclass('public.camp_signups') is null
     or to_regclass('public.camp_roster') is null
     or to_regprocedure('public.has_data_access()') is null
     or to_regprocedure('public.is_admin()') is null
     or to_regprocedure('public.change_log_actor_name()') is null
     or to_regprocedure('public.testing_today()') is null
     or to_regprocedure('public.camp_lock_camper(uuid)') is null
     or to_regprocedure('public.camp_lock_payment(uuid)') is null
     or to_regprocedure('public.camp_camper_total_cents(uuid)') is null
     or to_regprocedure('public.camp_camper_paid_cents(uuid)') is null
     or to_regprocedure('public.camp_payments_guard()') is null then
    raise exception '0039 needs migration 0013 (camps) first';
  end if;
  if to_regprocedure('public.camp_week_size(date[])') is null then
    raise exception '0039 needs migration 0022 (camps weekly pricing) first';
  end if;
  if not exists (select 1 from pg_proc p join pg_namespace n on n.oid = p.pronamespace
                  where n.nspname = 'public' and p.proname = 'camp_update_camp'
                    and position('extra_included' in p.prosrc) > 0) then
    raise exception '0039 needs migration 0027 (Edit camp guard) first';
  end if;
  if to_regprocedure('public.camp_camper_history(uuid)') is null
     or to_regprocedure('public.camp_mark_paid(uuid, integer, text, text)') is null
     or not exists (select 1 from pg_attribute a
                     where a.attrelid = 'public.camp_payments'::regclass and a.attname = 'paying_by_before'
                       and a.attnum > 0 and a.atttypid <> 0) then
    raise exception '0039 needs migration 0033 (Camps design review) first';
  end if;
  if to_regprocedure('public.camp_staff_form(uuid)') is null then
    raise exception '0039 needs migration 0043 (Camps Fill in) first';
  end if;
end
$$;


-- ---------------------------------------------------------------------
-- 2. The roster view again: 0033's section 6, word for word, plus ONE
--    column at the end: refunded_cents (0039). Same options
--    (security_invoker = true: it reads the tables with the CALLER's
--    rights, so RLS and the column rights still apply) and the same
--    grant ("create or replace view" keeps the view's rights; they are
--    stated again below anyway, exactly as 0013 has them).
--    refunded_cents = the camper's refunds that stand (a refund row with
--    no reversal), added up and turned positive; 0 when there is none.
--    The app: a refund stands when it is above 0 (Undo refund takes
--    Record refund's place; Edit / Undo payment are grayed).
--    paid_cents and owes_cents already count every row, refunds included.
--    It comes BEFORE the kind rule (section 3) on purpose: a roster read
--    locks the view, then camp_payments; this file takes them in the same
--    order (the view here, camp_payments in section 3), so the two can
--    never end up waiting for each other (a deadlock).
-- ---------------------------------------------------------------------
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
       lp.recorded_at                   as last_payment_recorded_at,
       c.paying_by_on_form,                                 -- 0033: the family form's choice
       coalesce(rf.refunded_cents, 0)   as refunded_cents   -- 0039: the refunds that stand (last column)
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
                      limit 1) as lp on true
  -- 0039: the camper's refunds that stand, as a positive number
  left join lateral (select sum(-p.amount_cents)::integer as refunded_cents
                       from public.camp_payments p
                      where p.camper_id = c.id
                        and p.kind = 'refund'
                        and not exists (select 1 from public.camp_payments x
                                         where x.reverses_payment_id = p.id)) as rf on true;

comment on view public.camp_roster is
  'Camp roster rows: camper + sign-up reference + days (check-in) + extras + payment state + the family form''s way to pay (0033) + the refunds that stand (refunded_cents, 0039). No phones, signature, waiver copy, submission id or login ids. Runs with the caller''s rights.';

revoke all on table public.camp_roster from public, anon, authenticated, service_role;
grant select on public.camp_roster to authenticated;


-- ---------------------------------------------------------------------
-- 3. The kind rule (0022 7d, widened)
--   0022's $10,000 (R5) for every kind: a payment is 1 cent ... $10,000; a
--   refund is a negative row of 1 cent ... $10,000 that reverses nothing,
--   cash or check only (Star's table rule, 0006 section 8;
--   camp_record_refund also keeps it to what was overpaid); a reversal
--   may now be positive (it undoes a refund). camp_payments_guard
--   (section 4) still makes every reversal exactly minus the row it undoes.
--   "drop constraint if exists" + "add": a re-run replaces it with the
--   same rule (Postgres checks every row again; they all pass). From here
--   to "commit;" camp_payments stays locked (reads and saves of payments
--   wait - well under a second).
-- ---------------------------------------------------------------------
alter table public.camp_payments drop constraint if exists camp_payments_kind_check;
alter table public.camp_payments add constraint camp_payments_kind_check
  check ((kind = 'payment' and amount_cents between 1 and 1000000 and reverses_payment_id is null)
         or (kind = 'refund' and amount_cents between -1000000 and -1 and reverses_payment_id is null
             and method in ('cash', 'check'))
         or (kind = 'reversal' and amount_cents between -1000000 and 1000000 and amount_cents <> 0
             and reverses_payment_id is not null));

comment on table public.camp_payments is
  'Camp payments and refunds, append-only: corrections are reversal rows. A refund (0039) is its own negative row, cash or check, at the school of the desk that hands the money back. Removed only by Delete camper / Delete camp.';


-- ---------------------------------------------------------------------
-- 4. camp_payments_guard() - 0013's 13h, word for word except the lines
--    marked "0039": a reversal may undo a refund too, and Star's net rule.
-- ---------------------------------------------------------------------
-- 13h. camp_payments_guard() - keeps payments append-only (0005's 9e)
--   BEFORE INSERT: a reversal must undo a real PAYMENT or REFUND (0039)
--                  (not a reversal) of the same camper, for exactly minus
--                  its amount, at the same school;
--                  (0039, Star's rule - 0006's star_payments_guard) no
--                  new row may make the camper's rows add up to less than
--                  0 (camp_payments_net_check)
--   BEFORE UPDATE: always refused
--   BEFORE DELETE: refused, EXCEPT inside camp_delete_camper /
--                  camp_delete_camp (the tkd.action tag those two set)
-- Limit: the database owner could switch this trigger off on purpose; it
-- stops mistakes and the app, not a deliberate owner.
create or replace function public.camp_payments_guard()
returns trigger
language plpgsql
set search_path = ''
as $$
declare
  v_reversed public.camp_payments;
  v_net      bigint;   -- 0039: the camper's rows added up
begin
  if tg_op = 'INSERT' then
    if new.kind = 'reversal' then
      select * into v_reversed from public.camp_payments p where p.id = new.reverses_payment_id;
      if not found
         or v_reversed.kind not in ('payment', 'refund')   -- 0039: a refund too (never a reversal)
         or v_reversed.camper_id <> new.camper_id
         or new.amount_cents <> -v_reversed.amount_cents
         or new.school <> v_reversed.school then
        raise exception using
          errcode    = '23514',
          constraint = 'camp_payments_reversal_check',
          message    = 'a reversal must undo one payment or refund of the same camper, for exactly minus its amount, at its school';   -- 0039: "or refund"
      end if;
    end if;
    -- 0039 (Star's rule): the camper's rows may never add up to less than 0
    select coalesce(sum(p.amount_cents), 0) into v_net
      from public.camp_payments p where p.camper_id = new.camper_id;
    if v_net + new.amount_cents < 0 then
      raise exception using
        errcode    = '23514',
        constraint = 'camp_payments_net_check',
        message    = 'a camper''s payments can''t add up to less than zero';
    end if;
    return new;
  end if;

  if tg_op = 'DELETE'
     and coalesce(current_setting('tkd.action', true), '') in ('camp_delete_camper', 'camp_delete_camp') then
    return old;
  end if;

  raise exception 'camp_payments is append-only (use a reversal)';
end;
$$;

revoke execute on function public.camp_payments_guard() from public, anon, authenticated, service_role;


-- ---------------------------------------------------------------------
-- 5. NEW camp_record_refund(...)   A (rulebook v1.039 / v1.040 / v0.743)
-- ---------------------------------------------------------------------
-- camp_record_refund(p_camper_id, p_expected_version, p_method,
--   p_amount_cents, p_refunded_on, p_school)   A
-- (copied from Star's star_record_refund, 0006 18x)
-- A refund of an OVERPAID amount (days or extras removed after paying,
-- v0.700 (6)): its own negative row, cash or check, with its own date
-- (the day the money goes out) and the school of the desk that hands it
-- back (p_school = This device, v1.040). Refused, in this order:
--   no_access; not an admin -> not_allowed;
--   an input missing, a way that isn't cash / check, an amount outside
--     1 cent ... $10,000 (0022's limit; the real limit is what was
--     overpaid, below), no date or a date after today -> invalid;
--   no school, or one that isn't in public.locations
--     -> {"status":"invalid","field":"school"} (as camp_mark_paid);
--   then, with the camper locked (camp -> sign-up -> camper, 17e):
--   no such camper -> not_found; another version -> stale; withdrawn ->
--     withdrawn;
--   a date before the family signed up (the sign-up's signed_up_on)
--     -> {"status":"invalid","field":"date"};
--   overpaid = paid - total (never below 0); nothing overpaid, or more
--     than that -> {"status":"refund_too_large","overpaid_cents":n}.
-- Writes the refund (kind 'refund', amount = minus the amount, paid_on =
-- the refund date, school = p_school, recorded by the admin) and bumps the
-- camper's version (a second click with the old version gets "stale"),
-- in one batch tagged camp_record_refund.
-- Ok: {"status":"ok","payment_id":<the refund row>,"version":n}
create or replace function public.camp_record_refund(
  p_camper_id        uuid,
  p_expected_version integer,
  p_method           text,
  p_amount_cents     integer,
  p_refunded_on      date,
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
  v_signed_up  date;
  v_overpaid   integer;
  v_payment_id uuid;
  v_version    integer;
begin
  begin
    if public.has_data_access() is not true then
      return jsonb_build_object('status', 'no_access');
    end if;
    if public.is_admin() is not true then
      return jsonb_build_object('status', 'not_allowed');
    end if;

    if p_camper_id is null or p_expected_version is null
       or p_method is null or p_method not in ('cash', 'check')
       or p_amount_cents is null or p_amount_cents not between 1 and 1000000   -- 0022's limit
       or p_refunded_on is null or p_refunded_on > public.testing_today() then
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
    -- the refund date never before the day the family signed up
    select s.signed_up_on into v_signed_up from public.camp_signups s where s.id = v_c.signup_id;
    if p_refunded_on < v_signed_up then
      return jsonb_build_object('status', 'invalid', 'field', 'date');
    end if;
    -- what was paid more than the total (never below 0)
    v_overpaid := greatest(public.camp_camper_paid_cents(v_c.id) - public.camp_camper_total_cents(v_c.id), 0);
    if v_overpaid = 0 or p_amount_cents > v_overpaid then
      return jsonb_build_object('status', 'refund_too_large', 'overpaid_cents', v_overpaid);
    end if;

    perform set_config('tkd.action', 'camp_record_refund', true);
    perform set_config('tkd.batch_id', gen_random_uuid()::text, true);

    insert into public.camp_payments
      (camper_id, kind, amount_cents, method, paid_on, school, recorded_at, recorded_by, recorded_by_name)
    values
      (v_c.id, 'refund', -p_amount_cents, p_method, p_refunded_on, p_school, now(), auth.uid(),
       public.change_log_actor_name())
    returning id into v_payment_id;

    update public.camp_campers c
       set version = c.version + 1
     where c.id = v_c.id
    returning c.version into v_version;

    perform set_config('tkd.action', '', true);
    perform set_config('tkd.batch_id', '', true);

    return jsonb_build_object('status', 'ok', 'payment_id', v_payment_id, 'version', v_version);
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

revoke execute on function public.camp_record_refund(uuid, integer, text, integer, date, text) from public, anon, authenticated, service_role;
grant  execute on function public.camp_record_refund(uuid, integer, text, integer, date, text) to authenticated;


-- ---------------------------------------------------------------------
-- 6. NEW camp_undo_refund(p_payment_id)   A (rulebook v1.039 / v1.040)
-- ---------------------------------------------------------------------
-- camp_undo_refund(p_payment_id)   A
-- (Star's Undo of a refund, 0006 18v, as its own function)
-- Writes a reversal of a refund (the refund row stays; the two add up to
-- 0): kind 'reversal', amount = plus the refund, the refund's way, dated
-- today, at the REFUND'S school (v1.040: so the drawer that handed the
-- money back gets it back), reverses_payment_id = the refund. The camper's
-- version goes up; one batch tagged camp_undo_refund. Refused, in this
-- order: no_access; not an admin -> not_allowed; no id -> invalid; no
-- such row -> not_found; a row that isn't a refund -> invalid; already
-- undone -> stale; a withdrawn camper -> withdrawn.
-- locks: camp -> sign-up -> camper -> the refund (17f)
-- Ok: {"status":"ok","version":n}
create or replace function public.camp_undo_refund(p_payment_id uuid)
returns jsonb
language plpgsql
volatile
security definer
set search_path = ''
as $$
declare
  v_p       public.camp_payments;
  v_status  text;
  v_version integer;
begin
  begin
    if public.has_data_access() is not true then
      return jsonb_build_object('status', 'no_access');
    end if;
    if public.is_admin() is not true then
      return jsonb_build_object('status', 'not_allowed');
    end if;
    if p_payment_id is null then
      return jsonb_build_object('status', 'invalid');
    end if;

    v_p := public.camp_lock_payment(p_payment_id);
    if v_p.id is null then
      return jsonb_build_object('status', 'not_found');
    end if;
    if v_p.kind <> 'refund' then
      return jsonb_build_object('status', 'invalid');
    end if;
    if exists (select 1 from public.camp_payments x where x.reverses_payment_id = v_p.id) then
      return jsonb_build_object('status', 'stale');
    end if;
    select c.status into v_status from public.camp_campers c where c.id = v_p.camper_id;
    if v_status = 'withdrawn' then
      return jsonb_build_object('status', 'withdrawn');
    end if;

    perform set_config('tkd.action', 'camp_undo_refund', true);
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

revoke execute on function public.camp_undo_refund(uuid) from public, anon, authenticated, service_role;
grant  execute on function public.camp_undo_refund(uuid) to authenticated;


-- ---------------------------------------------------------------------
-- 7. camp_undo_payment and camp_edit_payment - 0033's versions, word for
--    word except the lines marked "0039": not while a refund stands.
--    Same inputs, same rights, same answers otherwise (the live app keeps
--    working).
-- ---------------------------------------------------------------------

-- 20k. camp_undo_payment(p_payment_id)   A (own, within 10 s: S)
-- (0013's text; replaced by 0033, rulebook v0.735, and by 0039, rulebook
-- v1.039. Every line is 0033's except the ones marked "0039".)
-- Writes a reversal for a payment (the payment row stays; the two add up
-- to 0). Who may: admins (the roster's ... -> Undo payment), or the staff
-- member who recorded it less than 10 seconds ago (the Mark paid toast's
-- Undo) - the database decides from recorded_by and recorded_at; anyone
-- else -> not_allowed. Already reversed, or a reversal itself -> stale.
-- (0039) While the camper has a refund that stands (a refund row not
-- undone) -> {"status":"refund_stands"} ("Undo the refund first."), so the
-- money handed back can't also come out of a payment (Star 0006 18v).
-- The camper's version goes up.
-- (0033) If the payment remembered an earlier Paying by (paying_by_before:
-- Mark paid or Edit payment by another way changed it) and the camper's
-- Paying by is still the payment's method, it is put back, in the same
-- update and batch (logged as camp_undo_payment). If someone changed
-- Paying by again since, it is left alone. A payment without
-- paying_by_before (every payment from before 0033): nothing extra.
-- Ok: {"status":"ok","version":n}  (the camper's new version - the same
-- answer as before 0033)
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
    -- 0039: not while a refund of this camper stands (undo the refund first)
    if exists (select 1 from public.camp_payments r
                where r.camper_id = v_p.camper_id and r.kind = 'refund'
                  and not exists (select 1 from public.camp_payments x where x.reverses_payment_id = r.id)) then
      return jsonb_build_object('status', 'refund_stands');
    end if;

    perform set_config('tkd.action', 'camp_undo_payment', true);
    perform set_config('tkd.batch_id', gen_random_uuid()::text, true);

    insert into public.camp_payments
      (camper_id, kind, amount_cents, method, paid_on, school, recorded_at, recorded_by, recorded_by_name, reverses_payment_id)
    values
      (v_p.camper_id, 'reversal', -v_p.amount_cents, v_p.method, public.testing_today(), v_p.school, now(), auth.uid(),
       public.change_log_actor_name(), v_p.id);

    update public.camp_campers c
       set version   = c.version + 1,
           -- 0033: the old Paying by back, if this payment changed it and nobody changed it since
           paying_by = case when v_p.paying_by_before is not null and c.paying_by = v_p.method
                            then v_p.paying_by_before else c.paying_by end
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

-- 20l. camp_edit_payment(p_payment_id, p_method, p_amount_cents, p_paid_on,
--        p_school)   A
-- (0022's text; replaced by 0033, rulebook v0.735, and by 0039, rulebook
-- v1.039. Every line is 0033's except the ones marked "0039".)
-- Edit payment = a reversal of the old payment (at the old school) + a new
-- payment with the new method / amount (1 cent to $10,000 - 0022: was $2,000) / date (not in
-- the future) / school (v0.707: correct the desk that took it; any school
-- in public.locations, else {"status":"invalid","field":"school"}).
-- Already reversed -> stale; a reversal can't be edited (invalid, as 0005).
-- (0039) While the camper has a refund that stands (a refund row not
-- undone) -> {"status":"refund_stands"} ("Undo the refund first."); a
-- refund itself can't be edited (invalid, as above - Undo refund and
-- Record refund instead; Star 0006 18w).
-- (0033) Paying by follows the edit - Color Belt 0030's rule (its section
-- 4b, testing_edit_payment), copied exactly. o = the payment being
-- edited, "Paying by" = the camper's paying_by right now:
--   * the family's choice = what Undo payment of o would leave: o's
--     paying_by_before if it has one AND Paying by is still o's method;
--     otherwise Paying by itself.
--   * the edit CHANGES the way (p_method is not o's method): Paying by
--     becomes p_method, in the same update as the version bump and in the
--     same batch, so it is logged with the edit.
--   * the edit keeps the way (only the amount, day or school): Paying by
--     is left alone.
--   * the NEW payment's paying_by_before = the family's choice, but only
--     when Paying by equals the new payment's method after the edit and
--     the choice is a different way. Otherwise NULL.
--   So an edit that changes the way = Undo of o + Mark paid by the new
--   way, and Undo payment of the new payment puts the family's choice
--   back. (Like Color Belt, this holds for ANY payment that still stands,
--   not only the camper's newest.)
-- Ok: {"status":"ok","payment_id":<the new payment>,"version":n}  (the
-- same answer as before 0033)
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
  v_p         public.camp_payments;
  v_new_id    uuid;
  v_version   integer;
  v_paying_by text;   -- 0033: Paying by now
  v_choice    text;   -- 0033: the family's choice (what Undo of the old payment would leave)
  v_after     text;   -- 0033: Paying by after the edit
  v_before    text;   -- 0033: the new payment's paying_by_before
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
    -- 0039: not while a refund of this camper stands (undo the refund first)
    if exists (select 1 from public.camp_payments r
                where r.camper_id = v_p.camper_id and r.kind = 'refund'
                  and not exists (select 1 from public.camp_payments x where x.reverses_payment_id = r.id)) then
      return jsonb_build_object('status', 'refund_stands');
    end if;

    -- 0033: Paying by follows the edit (Color Belt 0030). The camper is
    -- already locked (camp_lock_payment locks it before the payment).
    select c.paying_by into v_paying_by from public.camp_campers c where c.id = v_p.camper_id;
    v_choice := case when v_p.paying_by_before is not null and v_paying_by = v_p.method
                     then v_p.paying_by_before else v_paying_by end;
    v_after  := case when p_method <> v_p.method then p_method else v_paying_by end;
    v_before := case when v_after = p_method and v_choice <> p_method then v_choice end;

    perform set_config('tkd.action', 'camp_edit_payment', true);
    perform set_config('tkd.batch_id', gen_random_uuid()::text, true);

    insert into public.camp_payments
      (camper_id, kind, amount_cents, method, paid_on, school, recorded_at, recorded_by, recorded_by_name, reverses_payment_id)
    values
      (v_p.camper_id, 'reversal', -v_p.amount_cents, v_p.method, public.testing_today(), v_p.school, now(), auth.uid(),
       public.change_log_actor_name(), v_p.id);

    insert into public.camp_payments
      (camper_id, kind, amount_cents, method, paid_on, school, recorded_at, recorded_by, recorded_by_name,
       paying_by_before)   -- 0033
    values
      (v_p.camper_id, 'payment', p_amount_cents, p_method, p_paid_on, p_school, now(), auth.uid(),
       public.change_log_actor_name(), v_before)   -- 0033
    returning id into v_new_id;

    update public.camp_campers c
       set version   = c.version + 1,
           paying_by = v_after   -- 0033: the new way, if the edit changed the way
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

-- End of 0039_camps_record_refund.sql
