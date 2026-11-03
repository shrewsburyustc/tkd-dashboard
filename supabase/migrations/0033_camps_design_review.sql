-- =====================================================================
-- 0033_camps_design_review.sql
-- ---------------------------------------------------------------------
-- WHAT THIS FILE IS
--   The database half of the Camps design review (rulebook v0.735 = C2,
--   the shared Mark paid box, and v0.736 = C7, the history line in Camper
--   detail; plan: docs/Camps/TKD-Camps-0033-Plan.md). It runs AFTER 0013,
--   0017, 0022 and 0027 (all live) and stops with a clear message if one
--   of them is missing.
--
-- WHY IT EXISTS
--   C2  The Mark paid box asks HOW the family pays (cash / check / card),
--       preset to the camper's "Paying by". Picking another way also
--       changes "Paying by" (logged), and Undo payment puts the old one
--       back (Color Belt's v0.418 rule). The box's gray hint says "They
--       chose Cash on the form." until Paying by is changed at the desk,
--       then "They chose Card at the desk." - so the database keeps the
--       family form's own choice.
--   C7  A "History - N changes" line in Camper detail: the camper's own
--       changes, their days, extras and payments, and their family's
--       sign-up (shared by brothers and sisters).
--
-- WHAT IT CHANGES
--   1. Two new columns:
--      * camp_campers.paying_by_on_form (cash / check / card, never
--        empty): the way the family chose ON THE FORM. A new small
--        trigger (camp_campers_keep_form_choice) copies paying_by into it
--        when a camper is added, and keeps the old value on every update,
--        so NO function can ever change it. The family form's functions
--        (camp_public_signup / camp_public_signup_core) are NOT touched:
--        the trigger fills the column for them. Existing campers get the
--        paying_by of their own history insert row (what the form sent;
--        section 2), or their current paying_by if they have none (the
--        pre-apply check counts those). That backfill writes no history row
--        and moves no version (the two camper triggers are switched off
--        for that one statement, inside this file's transaction).
--        The app may read it (column right added), and camp_roster shows
--        it as its LAST column.
--        The hint is worked out by the app:
--          paying_by = paying_by_on_form ? "on the form" : "at the desk".
--      * camp_payments.paying_by_before (null): set ONLY when Mark paid
--        or Edit payment also changed the camper's Paying by - the old
--        Paying by, so Undo payment can put it back. Rule: null, or (a
--        payment, one of cash / check / card, and not the payment's own
--        method). Payments stay append-only (0013's guard), so the value
--        never changes. NOT readable by the app (0013 lists the payment
--        columns one by one; Finance names its columns too).
--   2. camp_mark_paid gets a 4th input, p_method text default null:
--        camp_mark_paid(p_camper_id uuid, p_expected_version integer,
--                       p_school text, p_method text default null)
--      The old 3-input version is REMOVED in this same file (two
--      versions side by side would make every 3-input call "ambiguous").
--      The app from before 0033 calls it with 3 named inputs
--      (p_camper_id, p_expected_version, p_school); the default covers
--      that, so it keeps working and records the camper's Paying by,
--      exactly as before. p_method set and different from Paying by ->
--      Paying by becomes p_method in the same batch, and the payment
--      remembers the old value. The answer gains "paying_by".
--   3. REPLACED, same name, same arguments, same rights:
--      * camp_undo_payment (0013 20k): also puts Paying by back when the
--        undone payment has paying_by_before and Paying by is still that
--        payment's method (nobody changed it since).
--      * camp_edit_payment (0022 20l): Paying by follows an edit that
--        changes the way, EXACTLY as Color Belt's 0030 testing_edit_payment
--        (rule in section 5 below); the new payment remembers the
--        family's choice in paying_by_before.
--   4. NEW reader camp_camper_history(p_camper_id uuid) (C7) and its
--      internal helper camp_history_strip(jsonb) (takes every login id
--      out of a history row). Plus one small index on change_log so the
--      reader finds a camper's days, extras and payments fast.
--   5. The view camp_roster is re-made with the SAME columns in the same
--      order, plus paying_by_on_form at the end ("create or replace view"
--      can only add columns at the end). It keeps security_invoker = true
--      (0013) and its grant (select for authenticated only).
--      camp_camper_detail (0022 20s) builds its "camper" part with
--      to_jsonb() of the camp_roster row, so Camper detail gains
--      "paying_by_on_form" automatically - that function is not changed.
--      Nothing else reads camp_roster, and no other function calls
--      camp_mark_paid (checked in every migration up to 0031).
--   NOT changed: camp_change_paying_by (the form's choice never moves,
--   so the hint follows by itself), the public sign-up functions, every
--   Finance function (0017 / 0018 / 0026 read camp_payments by column
--   name, so the new column is invisible to them).
--   Nothing is granted to anon, service_role or camps_registrar.
--
-- HOW TO RUN IT
--   After 0027. Apply it BEFORE the app that sends p_method or reads
--   camp_camper_history is deployed (the app from before keeps working
--   with it). Supabase dashboard -> SQL Editor -> New query -> paste this
--   WHOLE file -> Run. One transaction ("begin;" ... "commit;"): if any
--   statement fails, nothing is kept.
--   Supabase will warn about destructive operations: ONE line is real on
--   the first run - "drop function if exists public.camp_mark_paid(uuid,
--   integer, text)", the old 3-input Mark paid, made again with 4 inputs
--   right after it in the same transaction. The other "drop ... if
--   exists" lines only make re-running safe. No data is removed.
--   Safe to run again (tested in PGlite: a second run changes no
--   fingerprint and no row).
--   RE-RUN ORDER: 0013 can't be re-run cleanly after this file: its
--   camp_roster has one column fewer, so its "create or replace view"
--   fails and nothing of it is kept (run the undo, 0033f, first if 0013
--   ever has to be re-run). Were it to run, it would bring back the
--   3-input camp_mark_paid next to the 4-input one (every Mark paid then
--   fails as "ambiguous") and the old Undo payment. Re-running 0022 puts
--   the old Edit payment back. Re-run 0033 straight after either.
--   Undo: supabase/SETUP.md, "Migration 0033", 0033f
--   (supabase/manual/0033u_undo_camps_design_review.sql).
-- =====================================================================

begin;


-- ---------------------------------------------------------------------
-- 1. The guard: this file needs 0013, 0017, 0022 and 0027. Stops - and
--    changes nothing - if one of them is missing.
-- ---------------------------------------------------------------------
do $$
begin
  if to_regclass('public.camp_campers') is null
     or to_regclass('public.camp_payments') is null
     or to_regclass('public.camp_signups') is null
     or to_regclass('public.camp_roster') is null
     or to_regclass('public.change_log') is null
     or to_regprocedure('public.has_data_access()') is null
     or to_regprocedure('public.is_admin()') is null
     or to_regprocedure('public.change_log_actor_name()') is null
     or to_regprocedure('public.testing_today()') is null
     or to_regprocedure('public.camp_lock_camper(uuid)') is null
     or to_regprocedure('public.camp_lock_payment(uuid)') is null
     or to_regprocedure('public.camp_camper_total_cents(uuid)') is null
     or to_regprocedure('public.camp_camper_paid_cents(uuid)') is null
     or to_regprocedure('public.camp_purge_old_signatures()') is null
     or to_regprocedure('public.camp_undo_payment(uuid)') is null
     or to_regprocedure('public.camp_edit_payment(uuid, text, integer, date, text)') is null
     or (to_regprocedure('public.camp_mark_paid(uuid, integer, text)') is null
         and to_regprocedure('public.camp_mark_paid(uuid, integer, text, text)') is null) then
    raise exception '0033 needs migration 0013 (camps) first';
  end if;
  if to_regclass('public.camp_payments_paid_on_idx') is null then
    raise exception '0033 needs migration 0017 (camp payments in Finance) first';
  end if;
  if to_regprocedure('public.camp_week_size(date[])') is null then
    raise exception '0033 needs migration 0022 (camps weekly pricing) first';
  end if;
  if not exists (select 1 from pg_proc p join pg_namespace n on n.oid = p.pronamespace
                  where n.nspname = 'public' and p.proname = 'camp_update_camp'
                    and position('extra_included' in p.prosrc) > 0) then
    raise exception '0033 needs migration 0027 (Edit camp guard) first';
  end if;
end
$$;


-- ---------------------------------------------------------------------
-- 2. camp_campers.paying_by_on_form - the family form's own choice
--   Order matters:
--   a. the column, empty at first ("add column if not exists": a re-run
--      skips it);
--   b. existing campers get the way the family chose ON THE FORM: the
--      paying_by of the camper's own history insert row (change_log,
--      table camp_campers, op insert - written by the family form when
--      the camper was added), so a Paying by already changed at the desk
--      doesn't count as the form's choice. A camper with no such row (or
--      an unreadable one) gets its current paying_by. Only rows still
--      empty are touched (none on a re-run). The two camper triggers are
--      switched off for this one statement, so the fill writes no history
--      row and no version moves (open screens don't go "stale"); the
--      transaction holds the table locked meanwhile, and they are on
--      again before anything else runs;
--   c. then it may never be empty, and must be cash / check / card;
--   d. then the trigger that keeps it (section 3).
-- ---------------------------------------------------------------------
alter table public.camp_campers add column if not exists paying_by_on_form text null;

do $$
begin
  if exists (select 1 from public.camp_campers c where c.paying_by_on_form is null) then
    alter table public.camp_campers disable trigger camp_campers_before_write;
    alter table public.camp_campers disable trigger camp_campers_log;
    update public.camp_campers c
       set paying_by_on_form = coalesce(
             (select l.after ->> 'paying_by'
                from public.change_log l
               where l.table_name = 'camp_campers'
                 and l.record_id = c.id
                 and l.op = 'insert'
                 and (l.after ->> 'paying_by') in ('cash', 'check', 'card')
               order by l.id
               limit 1),
             c.paying_by)
     where c.paying_by_on_form is null;
    alter table public.camp_campers enable trigger camp_campers_before_write;
    alter table public.camp_campers enable trigger camp_campers_log;
  end if;
end
$$;

alter table public.camp_campers alter column paying_by_on_form set not null;

do $$
begin
  if not exists (select 1 from pg_constraint c
                  where c.conrelid = 'public.camp_campers'::regclass
                    and c.conname = 'camp_campers_paying_by_on_form_check') then
    alter table public.camp_campers add constraint camp_campers_paying_by_on_form_check
      check (paying_by_on_form in ('cash', 'check', 'card'));
  end if;
end
$$;

-- the app may read it (0013 lists the camper columns one by one)
grant select (paying_by_on_form) on public.camp_campers to authenticated;

comment on column public.camp_campers.paying_by_on_form is
  'The way to pay the family chose on the form (cash / check / card). Set from paying_by when the camper is added; the trigger camp_campers_keep_form_choice keeps it on every update, so it never changes. The Mark paid box''s hint: paying_by = paying_by_on_form -> "on the form", else "at the desk".';


-- ---------------------------------------------------------------------
-- 3. camp_campers_keep_form_choice() - BEFORE INSERT OR UPDATE on campers
--   insert: paying_by_on_form := paying_by (whatever the caller sent)
--   update: paying_by_on_form := the old value (whatever the caller sent)
--   The trigger is called camp_campers_before_form_choice so it runs
--   BEFORE 0013's camp_campers_before_write (Postgres runs a table's
--   BEFORE triggers in name order: "..._form_choice" < "..._write"). So
--   an update that only tried to change paying_by_on_form is already
--   "no change" when 0013's trigger looks: no version bump, no history
--   row.
--   Not security definer; nobody may call it (only the trigger runs it).
-- ---------------------------------------------------------------------
create or replace function public.camp_campers_keep_form_choice()
returns trigger
language plpgsql
set search_path = ''
as $$
begin
  if tg_op = 'INSERT' then
    new.paying_by_on_form := new.paying_by;
  else
    new.paying_by_on_form := old.paying_by_on_form;
  end if;
  return new;
end;
$$;

revoke execute on function public.camp_campers_keep_form_choice() from public, anon, authenticated, service_role;

drop trigger if exists camp_campers_before_form_choice on public.camp_campers;
create trigger camp_campers_before_form_choice
  before insert or update on public.camp_campers
  for each row execute function public.camp_campers_keep_form_choice();


-- ---------------------------------------------------------------------
-- 4. camp_payments.paying_by_before - "Paying by" before this payment
--   * NULL for every payment except one made by Mark paid by another way
--     than the camper's Paying by (then: the OLD Paying by), or the new
--     payment of an Edit payment that changed the way (the family's
--     choice, section 5). Existing payments: NULL (nothing is filled in).
--   * the rule: only on a payment (never a reversal), cash / check /
--     card, never the payment's own method - Color Belt 0030's rule.
--   * NOT granted to the app (0013 lists the payment columns one by one;
--     the history reader shows it from change_log instead).
--   "add column if not exists" and the rule added only when missing:
--   re-running changes nothing.
-- ---------------------------------------------------------------------
alter table public.camp_payments add column if not exists paying_by_before text null;

do $$
begin
  if not exists (select 1 from pg_constraint c
                  where c.conrelid = 'public.camp_payments'::regclass
                    and c.conname = 'camp_payments_paying_by_before_check') then
    alter table public.camp_payments add constraint camp_payments_paying_by_before_check
      check (paying_by_before is null
             or (kind = 'payment' and paying_by_before in ('cash', 'check', 'card') and paying_by_before <> method));
  end if;
end
$$;

comment on column public.camp_payments.paying_by_before is
  'Set only when Mark paid (camp_mark_paid with another way) or Edit payment (camp_edit_payment) also changed the camper''s paying_by to this payment''s method: the old value, so Undo payment can put it back. Not in the app''s column rights.';


-- ---------------------------------------------------------------------
-- 5. The payment functions
-- ---------------------------------------------------------------------

-- The old 3-input Mark paid goes; the 4-input one replaces it. (A second
-- version next to it would make the server refuse every 3-input call as
-- "ambiguous" - see 0003's notes on overloads.) On a re-run there is no
-- 3-input version, so this line does nothing.
drop function if exists public.camp_mark_paid(uuid, integer, text);

-- 20j. camp_mark_paid(p_camper_id, p_expected_version, p_school,
--        p_method default null)   S
-- (0013's text; replaced by 0033, rulebook v0.735: the way to pay. Every
-- line is 0013's except the ones marked "0033".)
-- "Mark paid" / "Mark paid $X": one click records exactly what is OWED
-- now (total - paid), paid_on = today,
-- school = p_school: the school whose desk took the money (v0.707; the
-- app sends the device's school, or asks on the Both view). Any school in
-- public.locations is accepted, else {"status":"invalid","field":"school"}.
-- (0033) method = p_method (cash / check / card, else
-- {"status":"invalid","field":"method"}); left out or null = the camper's
-- paying_by, exactly as before 0033 (the app from before calls it with 3
-- named inputs). A way other than paying_by also makes paying_by that way
-- (same update, same batch, logged as camp_mark_paid) and the payment
-- remembers the old paying_by (paying_by_before) for Undo payment.
-- Refused for a withdrawn camper (withdrawn) or one who owes nothing
-- (already_paid). The camper's version goes up, so a double click with
-- the old version gets "stale". Last step: the signature clean-up (17a).
-- Ok: {"status":"ok","payment_id":...,"amount_cents":n,"method":"cash",
--      "school":"...","paying_by":"cash","version":n}
create or replace function public.camp_mark_paid(
  p_camper_id        uuid,
  p_expected_version integer,
  p_school           text,
  p_method           text default null   -- 0033
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
  v_method     text;   -- 0033: the way this payment was made
  v_before     text;   -- 0033: the old paying_by, when the way differs
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
    -- 0033: the way, if one was sent
    if p_method is not null and p_method not in ('cash', 'check', 'card') then
      return jsonb_build_object('status', 'invalid', 'field', 'method');
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

    -- 0033: no way sent = Paying by (as before); another way = remember the old one
    v_method := coalesce(p_method, v_c.paying_by);
    v_before := case when v_method <> v_c.paying_by then v_c.paying_by end;

    perform set_config('tkd.action', 'camp_mark_paid', true);
    perform set_config('tkd.batch_id', gen_random_uuid()::text, true);

    insert into public.camp_payments
      (camper_id, kind, amount_cents, method, paid_on, school, recorded_at, recorded_by, recorded_by_name,
       paying_by_before)   -- 0033
    values
      (v_c.id, 'payment', v_amount, v_method, public.testing_today(), p_school, now(), auth.uid(),
       public.change_log_actor_name(), v_before)   -- 0033
    returning id into v_payment_id;

    -- one update: the version goes up (a double click gets "stale") and,
    -- 0033: if the way differed, Paying by becomes the way they paid
    update public.camp_campers c
       set version   = c.version + 1,
           paying_by = v_method   -- 0033
     where c.id = v_c.id
    returning c.version into v_version;

    perform set_config('tkd.action', '', true);
    perform set_config('tkd.batch_id', '', true);

    perform public.camp_purge_old_signatures();

    return jsonb_build_object('status', 'ok', 'payment_id', v_payment_id, 'amount_cents', v_amount,
                              'method', v_method, 'school', p_school,
                              'paying_by', v_method,   -- 0033
                              'version', v_version);
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

revoke execute on function public.camp_mark_paid(uuid, integer, text, text) from public, anon, authenticated, service_role;
grant  execute on function public.camp_mark_paid(uuid, integer, text, text) to authenticated;

-- 20k. camp_undo_payment(p_payment_id)   A (own, within 10 s: S)
-- (0013's text; replaced by 0033, rulebook v0.735. Every line is 0013's
-- except the ones marked "0033".)
-- Writes a reversal for a payment (the payment row stays; the two add up
-- to 0). Who may: admins (the roster's ... -> Undo payment), or the staff
-- member who recorded it less than 10 seconds ago (the Mark paid toast's
-- Undo) - the database decides from recorded_by and recorded_at; anyone
-- else -> not_allowed. Already reversed, or a reversal itself -> stale.
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
-- (0022's text; replaced by 0033, rulebook v0.735. Every line is 0022's
-- except the ones marked "0033".)
-- Edit payment = a reversal of the old payment (at the old school) + a new
-- payment with the new method / amount (1 cent to $10,000 - 0022: was $2,000) / date (not in
-- the future) / school (v0.707: correct the desk that took it; any school
-- in public.locations, else {"status":"invalid","field":"school"}).
-- Already reversed -> stale; a reversal can't be edited (invalid, as 0005).
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


-- ---------------------------------------------------------------------
-- 6. The roster view again: 0013's section 15, word for word, plus ONE
--    column at the end: paying_by_on_form. Same options
--    (security_invoker = true: it reads the tables with the CALLER's
--    rights, so RLS and the column rights still apply) and the same
--    grant ("create or replace view" keeps the view's rights; they are
--    stated again below anyway, exactly as 0013 has them).
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
       c.paying_by_on_form                                  -- 0033: the family form's choice (last column)
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
  'Camp roster rows: camper + sign-up reference + days (check-in) + extras + payment state + the family form''s way to pay (0033). No phones, signature, waiver copy, submission id or login ids. Runs with the caller''s rights.';

revoke all on table public.camp_roster from public, anon, authenticated, service_role;
grant select on public.camp_roster to authenticated;


-- ---------------------------------------------------------------------
-- 7. C7 - the history line
-- ---------------------------------------------------------------------

-- 7a. One index so the reader finds a camper's days, extras and payments
-- fast: their INSERT rows in change_log, by the camper_id inside "after".
-- Partial (only those three tables' insert rows), so every other history
-- row costs nothing extra. 0003's (table_name, record_id) index finds the
-- rest. "if not exists": a re-run skips it.
create index if not exists change_log_camp_camper_idx
  on public.change_log ((after ->> 'camper_id'))
  where op = 'insert' and table_name in ('camp_camper_days', 'camp_camper_extras', 'camp_payments');

-- 7b. camp_history_strip(row) - takes every login id out of a history
-- row's before / after (History shows who by NAME only: actor_name and
-- the *_by_name columns): created_by, updated_by, withdrawn_by,
-- recorded_by, checked_in_by; plus submission_id and waiver_text_signed
-- (13i already leaves them out of the sign-up rows; this makes sure). A
-- signature shows only as "on file" (13i writes it that way; this makes
-- sure). NULL stays NULL. Like Color Belt's testing_history_strip: nobody
-- in the app may call it.
create or replace function public.camp_history_strip(p_row jsonb)
returns jsonb
language sql
immutable
set search_path = ''
as $$
  select case
           when p_row is null then null
           when coalesce(p_row -> 'signature', 'null'::jsonb) <> 'null'::jsonb then
             (p_row - array['created_by', 'updated_by', 'withdrawn_by', 'recorded_by', 'checked_in_by',
                            'submission_id', 'waiver_text_signed'])
             || jsonb_build_object('signature', 'on file')
           else
             p_row - array['created_by', 'updated_by', 'withdrawn_by', 'recorded_by', 'checked_in_by',
                           'submission_id', 'waiver_text_signed']
         end;
$$;

revoke execute on function public.camp_history_strip(jsonb) from public, anon, authenticated, service_role;

-- 7c. camp_camper_history(p_camper_id)   S (read only; rulebook v0.736)
-- The History line of Camper detail: newest first, at most 500 rows -
-- the change_log rows of
--   * THIS camper (camp_campers, record_id = the camper);
--   * the camper's days, extras and payments (camp_camper_days,
--     camp_camper_extras, camp_payments): found through their INSERT row
--     (update rows hold only the changed columns), whose "after" names
--     this camper_id; then every row is matched by the PAIR (table_name,
--     record_id) - Star's star_candidate_history pattern - so a removed
--     day or extra (Edit details) still shows. Check-ins are LEFT OUT: a
--     camp_camper_days update that changes only checked_in_at /
--     checked_in_by / checked_in_by_name (v0.736: Camper detail's
--     Check-in part already shows them);
--   * the camper's SIGN-UP (camp_signups, record_id = the camper's
--     signup_id): shared by brothers and sisters, so a family change
--     shows in every child's history (v0.736, option A). Its signature
--     is only ever "on file" (13i).
-- Each row: occurred_at, actor_name (the staff member's name; the family
-- form's rows hold what change_log_actor_name gave it), action,
-- table_name, op, batch_id (one save = one batch: the app joins a batch
-- into one entry), before, after - before / after with every login id
-- removed (7b). Never actor_id or session_id.
-- Refused: no_access; invalid (no id); not_found (no such camper - also
-- after Delete permanently).
-- Ok: {"status":"ok","rows":[{occurred_at, actor_name, action, table_name,
--      op, batch_id, before, after}]}
-- locks: none (a read)
create or replace function public.camp_camper_history(p_camper_id uuid)
returns jsonb
language plpgsql
stable
security definer
set search_path = ''
as $$
declare
  v_signup_id uuid;
begin
  begin
    if public.has_data_access() is not true then
      return jsonb_build_object('status', 'no_access');
    end if;
    if p_camper_id is null then
      return jsonb_build_object('status', 'invalid');
    end if;
    select c.signup_id into v_signup_id from public.camp_campers c where c.id = p_camper_id;
    if not found then
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
                           'batch_id',    h.batch_id,
                           'before',      public.camp_history_strip(h.before),
                           'after',       public.camp_history_strip(h.after))
                         order by h.occurred_at desc, h.id desc)
          -- three parts, each found through an index, then joined
          -- ("union all": the parts are different tables, so no row
          -- appears twice):
          --   (a) the camper's own rows   - 0003's (table_name, record_id) index
          --   (b) the sign-up's rows      - the same index
          --   (c) the rows of the camper's days, extras and payments: their
          --       insert rows through the partial index of 7a, then every
          --       row of those records through 0003's index
          from (select u.id, u.occurred_at, u.actor_name, u.action, u.table_name, u.op, u.batch_id, u.before, u.after
                  from (select l.id, l.occurred_at, l.actor_name, l.action, l.table_name, l.op, l.batch_id, l.before, l.after
                          from public.change_log l
                         where l.table_name = 'camp_campers' and l.record_id = p_camper_id
                        union all
                        select l.id, l.occurred_at, l.actor_name, l.action, l.table_name, l.op, l.batch_id, l.before, l.after
                          from public.change_log l
                         where l.table_name = 'camp_signups' and l.record_id = v_signup_id
                        union all
                        select l.id, l.occurred_at, l.actor_name, l.action, l.table_name, l.op, l.batch_id, l.before, l.after
                          from public.change_log l
                         where (l.table_name, l.record_id) in
                               (select i.table_name, i.record_id
                                  from public.change_log i
                                 where i.op = 'insert'
                                   and i.table_name in ('camp_camper_days', 'camp_camper_extras', 'camp_payments')
                                   and i.after ->> 'camper_id' = p_camper_id::text)
                           -- check-ins left out (v0.736)
                           and not (l.table_name = 'camp_camper_days' and l.op = 'update'
                                    and ((coalesce(l.before, '{}'::jsonb) || coalesce(l.after, '{}'::jsonb))
                                         - array['checked_in_at', 'checked_in_by', 'checked_in_by_name']) = '{}'::jsonb)
                       ) as u
                 order by u.occurred_at desc, u.id desc
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

revoke execute on function public.camp_camper_history(uuid) from public, anon, authenticated, service_role;
grant  execute on function public.camp_camper_history(uuid) to authenticated;


commit;

-- End of 0033_camps_design_review.sql
