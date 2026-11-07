-- =====================================================================
-- 0038_star_design_review.sql
-- ---------------------------------------------------------------------
-- WHAT THIS FILE IS
--   The database half of Star testing's design-review pass 1 (rolling
--   check; plan docs/Testing/Star Testing/TKD-StarTesting-Pass1-Plan.md,
--   Step C; findings in docs/Design Review/Rolling check/Pass 1/
--   Fix-Star.md: R2-02, R1-01, R1-02 and S-1; Pass 2's M-02 and its
--   correction to R1-02). It runs AFTER 0006, 0023, 0028 and 0041 (all
--   live) and stops with a clear message if one of them is missing. It
--   touches NO Finance function and no other section's table or function.
--
-- WHAT IT CHANGES (four parts)
--   1. R2-02 - Edit event's Undo in ONE call.
--      NEW public.star_undo_event_edit(...): puts an event's old details
--      (name, date, start AND end time, school, closing date, note) and,
--      if the edit changed it, the old Registration switch back in ONE
--      transaction, or nothing at all (the model is Black Belt's 0032
--      bb_undo_cycle_edit). It writes only through the two functions that
--      already exist (star_update_event from 0041 and star_set_registration
--      from 0006), so every rule, log row and refusal of theirs still
--      applies. Admin only (Edit event is admin only). If either step is
--      refused, the refusal is returned as it came (stale, invalid,
--      duplicate_name, finished, not_allowed ...) and everything the call
--      wrote is undone.
--   2. R1-01 - every payment counts at the desk that took it (rulebook
--      v1.035, refund: v1.040).
--      * star_payments.school (text, not empty, a real school code): the
--        school of the DESK that took or handed back the money. Existing
--        payments take their candidate's school as it is when this file
--        runs (the school Finance shows for them today). No history row is
--        written for that fill (section 2).
--      * star_record_payment and star_record_refund get one more input,
--        p_school text default null: the app sends This device's school;
--        left out or null = the candidate's school (so the app that is
--        live today keeps working). A value that is not a school code ->
--        {"status":"invalid","field":"school"}.
--      * star_undo_payment and star_edit_payment (its reversal AND its new
--        payment row) copy the school from the payment they correct. The
--        payments guard trigger now also REFUSES a reversal whose school
--        differs from the row it reverses (Camps' 0013 rule), and fills in
--        a missing school on any insert (a reversal: its original's; any
--        other row: the candidate's), so a direct insert that doesn't know
--        the column - older tests, seeds - still lands in the right place.
--   3. R1-02 - the Mark paid box tells the truth about Paying by
--      (Camps' 0033 pattern, copied; Jeffrey's rule: "If they change how
--      they pay the dashboard should reflect that").
--      * star_candidates.paying_by_on_form: the way the family chose ON THE
--        FORM. A new trigger sets it when a candidate is added: Paying by
--        for a form sign-up (source 'form'), EMPTY for a candidate added at
--        the desk (so the app keeps saying "at the desk" for those, Pass 2
--        correction), and keeps the old value on every update, so no
--        function can ever change it. Existing form sign-ups get the
--        Paying by of their own history insert row (what the form sent). A
--        form sign-up with NO such row, and every desk candidate, stay
--        EMPTY - never today's Paying by (it may already be a desk change).
--        Empty reads "at the desk" in the app. The app may read it (column
--        right added; the roster view shows it as its LAST column;
--        star_candidate_detail already returns every candidate column).
--      * star_payments.paying_by_before: set ONLY when Record payment (or
--        Edit payment) also changed the candidate's Paying by: the old
--        value, so Undo payment can put it back. Rule: empty, or (a
--        payment, cash / check / card, and not the payment's own method).
--        Payments stay append-only, so it never changes. NOT readable by
--        the app.
--      * star_record_payment with a method other than Paying by also makes
--        Paying by that method (same update, same batch, logged);
--        star_undo_payment puts the old one back if nobody changed it since;
--        star_edit_payment follows Color Belt 0030 / Camps 0033's rule
--        exactly (section 5c).
--   4. S-1 - belt order, Worcester first (rulebook v1.047 / v0.519).
--      star_event_results (0006) and star_results_csv (0023) are replaced
--      with the same arguments, checks, answers, owner and rights; only the
--      row order changes: Dan, star, then Worcester before Shrewsbury, then
--      last name, then first name (0006 / 0023 put Shrewsbury first). The
--      school is ordered by an explicit rank (a number), not by sorting the
--      words; only the final last / first name tie-break is text.
--   NOT changed: star_candidate_history (it already returns every
--   change-log row of the candidate and its payments; the new columns just
--   appear in those rows, and "one save = one History entry" is the app
--   joining rows of one batch - M-02), star_change_paying_by (a Paying by
--   change never touches the form's own choice), the family form's
--   functions, Finance (it reads star_payments by column name).
--   Nothing is granted to anon, service_role or star_registrar.
--
-- WHY THE LIVE APP KEEPS WORKING (the database goes live first)
--   The live app calls star_record_payment and star_record_refund by
--   argument NAME without p_school; the default (empty = the candidate's
--   school) covers that. Postgres can't add an argument to an existing
--   function, so the two old 5-input versions are REMOVED in this same
--   file and made again with 6 (Camps' 0033 did the same for
--   camp_mark_paid): no moment without them, and never two versions side
--   by side (every 5-input call would then be "ambiguous"). Undo / Edit
--   payment, the two result readers and the Candidates view keep their
--   arguments (or only gain a column at the end). The answers of all four
--   payment functions are exactly what they were: no new key.
--   Known, small: until the app that sends p_school is live, a payment
--   taken at the other desk is stored with the candidate's school - the
--   school Finance already uses. Finance's own R1-01 migration (it reads
--   the stored school) runs AFTER this file and before the Star app that
--   sends p_school is pushed.
--
-- WORDS USED BELOW
--   * "version", "stale", "security definer", search_path = '': as in
--     0003, 0005 and 0006 (read their headers).
--   * "login id", "batch": as in 0003 (history rows carry a batch id so
--     the rows of one save can be told apart).
--   * default empty: an argument the caller may leave out; it is then NULL.
--
-- HOW TO RUN IT
--   After 0006, 0023, 0028 and 0041. Apply it BEFORE the app that sends
--   p_school or calls star_undo_event_edit is deployed (the app from
--   before keeps working with it). Supabase dashboard -> SQL Editor -> New
--   query -> paste this WHOLE file -> Run. One transaction ("begin;" ...
--   "commit;"): if any statement fails, nothing is kept.
--   Supabase will warn about DESTRUCTIVE OPERATIONS. Two lines are real on
--   the first run: "drop function if exists" for star_record_payment (5
--   inputs) and star_record_refund (5 inputs) - the old versions, made
--   again with 6 inputs right after, in the same transaction. The other
--   "drop ... if exists" lines only make re-running safe. No data is
--   removed. Confirm.
--   Safe to run again (tested in PGlite, run.mjs step0038: a second run
--   changes no fingerprint and no row).
--   RE-RUN ORDER: re-running 0006 or 0023 after this file would put their
--   old versions back (0006's would add the 5-input record payment / refund
--   NEXT TO these, so every Record payment fails as "ambiguous"; 0006's
--   roster view has one column fewer, so its "create or replace view"
--   fails and nothing of it is kept). Don't; if it happens, run the undo
--   (SETUP.md 0038, 0038f) first, then re-run, then this file again.
--   Undo: SETUP.md, "Migration 0038", supabase/manual/0038u_undo_star_design_review.sql
--   (refuses while any payment was taken at a school other than its
--   candidate's, or any Paying by was changed by a payment, since taking
--   those columns away would lose that).
-- =====================================================================

begin;


-- ---------------------------------------------------------------------
-- 1. The guard: this file needs 0006, 0023, 0028 and 0041. Stops - and
--    changes nothing - if one is missing.
-- ---------------------------------------------------------------------
do $$
begin
  if to_regclass('public.star_events') is null
     or to_regclass('public.star_candidates') is null
     or to_regclass('public.star_payments') is null
     or to_regclass('public.star_roster') is null
     or to_regclass('public.star_downloads') is null
     or to_regclass('public.change_log') is null
     or to_regprocedure('public.has_data_access()') is null
     or to_regprocedure('public.is_admin()') is null
     or to_regprocedure('public.change_log_actor_name()') is null
     or to_regprocedure('public.testing_today()') is null
     or to_regprocedure('public.star_lock_candidate(uuid)') is null
     or to_regprocedure('public.star_lock_payment(uuid)') is null
     or to_regprocedure('public.star_net_paid_cents(uuid)') is null
     or to_regprocedure('public.star_expected_fee_cents(uuid)') is null
     or to_regprocedure('public.star_candidate_result(uuid)') is null
     or to_regprocedure('public.star_sent_state(uuid, jsonb)') is null
     or to_regprocedure('public.star_set_registration(uuid, integer, boolean)') is null
     or to_regprocedure('public.star_purge_old_signatures()') is null then
    raise exception '0038 needs migration 0006 (Star testing) first';
  end if;
  if to_regclass('public.star_result_texts') is null then
    raise exception '0038 needs migration 0023 (Star result texts) first';
  end if;
  if to_regprocedure('public.star_start_time_is_valid(time)') is null
     or (select p.prosrc from pg_catalog.pg_proc p
          where p.oid = to_regprocedure('public.star_start_time_is_valid(time)')) not like '%22:00%' then
    raise exception '0038 needs migration 0028 (Star start times) first';
  end if;
  -- 0041 replaced star_update_event: the 9-input version (p_end_time last) must be the only one
  if to_regprocedure('public.star_update_event(uuid, integer, text, date, time, text, date, text, time)') is null
     or to_regprocedure('public.star_update_event(uuid, integer, text, date, time, text, date, text)') is not null
     or not exists (select 1 from pg_attribute a
                     where a.attrelid = 'public.star_events'::regclass and a.attname = 'end_time' and not a.attisdropped) then
    raise exception '0038 needs migration 0041 (Star event end time) first';
  end if;
end
$$;


-- ---------------------------------------------------------------------
-- 2. star_payments.school - the desk that took (or handed back) the money
--   Order matters:
--   a. the column, empty at first ("add column if not exists": a re-run
--      skips it);
--   b. existing payments take their candidate's school as it is NOW (what
--      Finance shows for them today). The payments are append-only (the
--      guard trigger refuses every update) and logged (the log trigger
--      would write one history row per payment), so for this one
--      statement - inside this transaction, which holds the table locked -
--      the guard and the log trigger are switched off and on again. The
--      fill writes no history row and no payment is otherwise changed.
--      Only rows still empty are touched (none on a re-run);
--   c. then it may never be empty, must be a real school (foreign key,
--      as Camps' camp_payments_school_fk), and signed-in staff may read it.
-- ---------------------------------------------------------------------
alter table public.star_payments add column if not exists school text null;

do $$
begin
  if exists (select 1 from public.star_payments p where p.school is null) then
    alter table public.star_payments disable trigger star_payments_guard;
    alter table public.star_payments disable trigger star_payments_log;
    update public.star_payments p
       set school = c.location_code
      from public.star_candidates c
     where c.id = p.candidate_id
       and p.school is null;
    alter table public.star_payments enable trigger star_payments_guard;
    alter table public.star_payments enable trigger star_payments_log;
  end if;
end
$$;

alter table public.star_payments alter column school set not null;

do $$
begin
  if not exists (select 1 from pg_constraint c
                  where c.conrelid = 'public.star_payments'::regclass
                    and c.conname = 'star_payments_school_fk') then
    alter table public.star_payments add constraint star_payments_school_fk
      foreign key (school) references public.locations (code);
  end if;
end
$$;

grant select (school) on public.star_payments to authenticated;

comment on column public.star_payments.school is
  'The school of the DESK that took the money (or handed it back, for a refund): the school set under This device. Undo / Edit payment copy it from the payment they correct (the guard trigger enforces it). Finance counts the payment at this school.';


-- ---------------------------------------------------------------------
-- 3. star_candidates.paying_by_on_form - the family form's own choice
--   Order matters:
--   a. the column, empty at first;
--   b. existing FORM sign-ups get the way the family chose ON THE FORM:
--      the paying_by of the candidate's own history insert row (change_log,
--      table star_candidates, op insert - written when the form added the
--      candidate), so a Paying by already changed at the desk doesn't count
--      as the form's choice. A form sign-up with no such row (or an
--      unreadable one) STAYS EMPTY - never today's Paying by, which may
--      already be a desk change (Pass 2 correction to R1-02; 0033 fell back
--      to today's Paying by, this file doesn't). Desk candidates and
--      make-ups stay empty too. Only rows still empty, with such a row,
--      are touched (none on a re-run). The three candidate triggers that
--      would bump the version, write a history row or re-run the table
--      rules are switched off for this one statement and on again, so open
--      screens don't go "stale";
--   c. the rule: empty, or cash / check / card;
--   d. the trigger that keeps it (section 4) is created AFTER the fill,
--      or its "keep the old value" rule would undo the fill.
-- ---------------------------------------------------------------------
alter table public.star_candidates add column if not exists paying_by_on_form text null;

do $$
begin
  if exists (select 1
               from public.star_candidates c
              where c.paying_by_on_form is null
                and c.source = 'form'
                and exists (select 1 from public.change_log l
                             where l.table_name = 'star_candidates' and l.record_id = c.id and l.op = 'insert'
                               and (l.after ->> 'paying_by') in ('cash', 'check', 'card'))) then
    alter table public.star_candidates disable trigger star_candidates_before_write;
    alter table public.star_candidates disable trigger star_candidates_rules;
    alter table public.star_candidates disable trigger star_candidates_log;
    update public.star_candidates c
       set paying_by_on_form = (select l.after ->> 'paying_by'
                                  from public.change_log l
                                 where l.table_name = 'star_candidates'
                                   and l.record_id = c.id
                                   and l.op = 'insert'
                                   and (l.after ->> 'paying_by') in ('cash', 'check', 'card')
                                 order by l.id
                                 limit 1)
     where c.paying_by_on_form is null
       and c.source = 'form'
       and exists (select 1 from public.change_log l
                    where l.table_name = 'star_candidates' and l.record_id = c.id and l.op = 'insert'
                      and (l.after ->> 'paying_by') in ('cash', 'check', 'card'));
    alter table public.star_candidates enable trigger star_candidates_before_write;
    alter table public.star_candidates enable trigger star_candidates_rules;
    alter table public.star_candidates enable trigger star_candidates_log;
  end if;
end
$$;

do $$
begin
  if not exists (select 1 from pg_constraint c
                  where c.conrelid = 'public.star_candidates'::regclass
                    and c.conname = 'star_candidates_paying_by_on_form_check') then
    alter table public.star_candidates add constraint star_candidates_paying_by_on_form_check
      check (paying_by_on_form is null or paying_by_on_form in ('cash', 'check', 'card'));
  end if;
end
$$;

-- the app may read it (0006 lists the candidate columns one by one)
grant select (paying_by_on_form) on public.star_candidates to authenticated;

comment on column public.star_candidates.paying_by_on_form is
  'The way to pay the family chose on the form (cash / check / card), set from paying_by when a FORM sign-up is added; empty for a candidate added at the desk, and for older form sign-ups with no history insert row. The trigger star_candidates_before_form_choice keeps it on every update, so it never changes. The Mark paid box''s hint: paying_by = paying_by_on_form -> "on the form", else (including empty) "at the desk".';


-- ---------------------------------------------------------------------
-- 4. star_candidates_keep_form_choice() - BEFORE INSERT OR UPDATE on
--    candidates
--   insert: paying_by_on_form := paying_by for a form sign-up, else empty
--           (whatever the caller sent)
--   update: paying_by_on_form := the old value (whatever the caller sent)
--   The trigger is called star_candidates_before_form_choice so it runs
--   BEFORE 0006's star_candidates_before_write (Postgres runs a table's
--   BEFORE triggers in name order: "..._form_choice" < "..._write"). So
--   an update that only tried to change paying_by_on_form is already "no
--   change" when 0006's trigger looks: no version bump, no history row.
--   Not security definer; nobody may call it (only the trigger runs it).
-- ---------------------------------------------------------------------
create or replace function public.star_candidates_keep_form_choice()
returns trigger
language plpgsql
set search_path = ''
as $$
begin
  if tg_op = 'INSERT' then
    new.paying_by_on_form := case when new.source = 'form' then new.paying_by end;
  else
    new.paying_by_on_form := old.paying_by_on_form;
  end if;
  return new;
end;
$$;

revoke execute on function public.star_candidates_keep_form_choice() from public, anon, authenticated, service_role;

drop trigger if exists star_candidates_before_form_choice on public.star_candidates;
create trigger star_candidates_before_form_choice
  before insert or update on public.star_candidates
  for each row execute function public.star_candidates_keep_form_choice();


-- ---------------------------------------------------------------------
-- 5. star_payments.paying_by_before - "Paying by" before this payment
--   * EMPTY for every payment except one made by Record payment by another
--     way than the candidate's Paying by (then: the OLD Paying by), or the
--     new payment of an Edit payment that changed the way (the family's
--     choice, section 6c). Existing payments: empty (nothing is filled in).
--   * the rule: only on a payment (never a refund or reversal), cash /
--     check / card, never the payment's own method - Camps 0033's rule.
--   * NOT granted to the app (0006 lists the payment columns one by one).
-- ---------------------------------------------------------------------
alter table public.star_payments add column if not exists paying_by_before text null;

do $$
begin
  if not exists (select 1 from pg_constraint c
                  where c.conrelid = 'public.star_payments'::regclass
                    and c.conname = 'star_payments_paying_by_before_check') then
    alter table public.star_payments add constraint star_payments_paying_by_before_check
      check (paying_by_before is null
             or (kind = 'payment' and paying_by_before in ('cash', 'check', 'card') and paying_by_before <> method));
  end if;
end
$$;

comment on column public.star_payments.paying_by_before is
  'Set only when Record payment (another way than Paying by) or Edit payment (a changed way) also changed the candidate''s paying_by to this payment''s method: the old value, so Undo payment can put it back. Not in the app''s column rights.';


-- ---------------------------------------------------------------------
-- 6. star_payments_guard() - REPLACED (0006 section 13h)
-- 0006's text, except the lines marked "0038":
--   * an INSERT without a school gets one: a reversal takes its
--     original's, any other row the candidate's (so a direct insert from
--     before 0038 - tests, seeds - still lands in the right place);
--   * a reversal must carry the school of the row it reverses (the chain
--     rule, v1.035; Camps' 0013 has the same).
-- Everything else word for word: append-only, the net total never below
-- zero, deletes only together with their candidate or event.
-- ---------------------------------------------------------------------
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
      if found and new.school is null then
        new.school := v_reversed.school;   -- 0038
      end if;
      if not found
         or v_reversed.kind not in ('payment', 'refund')
         or v_reversed.candidate_id <> new.candidate_id
         or new.amount_cents <> -v_reversed.amount_cents
         or new.school is distinct from v_reversed.school then   -- 0038: same desk as the row it undoes
        raise exception using
          errcode    = '23514',
          constraint = 'star_payments_reversal_check',
          message    = 'a reversal must undo one payment or refund of the same candidate, for exactly minus its amount, at its school';
      end if;
    elsif new.school is null then
      select c.location_code into new.school from public.star_candidates c where c.id = new.candidate_id;   -- 0038
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


-- ---------------------------------------------------------------------
-- 7. The payment functions
-- ---------------------------------------------------------------------

-- The old 5-input Record payment and Record refund go; the 6-input ones
-- replace them. (A second version next to them would make the server
-- refuse every 5-input call as "ambiguous" - see 0003's notes on
-- overloads.) On a re-run there is no 5-input version, so these lines do
-- nothing.
drop function if exists public.star_record_payment(uuid, integer, text, integer, date);
drop function if exists public.star_record_refund(uuid, integer, text, integer, date);

-- 18u. star_record_payment(p_candidate_id, p_expected_version, p_method,
--        p_amount_cents, p_paid_on, p_school default null)   S
-- (0006's text; replaced by 0038. Every line is 0006's except the ones
-- marked "0038".)
-- Record payment (v0.109, v0.110): the dialog fills in the expected fee
-- (12d); staff may type another amount (1 cent to $1,000, e.g. a
-- discount). Any recorded amount counts as Paid (v0.167). Method cash /
-- check / card; date not in the future and not before the day the
-- candidate registered (Massachusetts date, v0.175; later dates are fine,
-- e.g. a late entry of an earlier payment). Allowed in every event state.
-- Refused: withdrawn (withdrawn), a make-up (no_fee), already paid
-- (already_paid). The candidate's version goes up, so a double click with
-- the old version gets "stale". Last step: the signature clean-up (16a).
-- (0038, R1-01) p_school = the school whose DESK took the money (the app
-- sends This device's school); left out or null = the candidate's school
-- (the app from before 0038 calls it with 5 named inputs). Any school in
-- public.locations, else {"status":"invalid","field":"school"}; stored on
-- the payment.
-- (0038, R1-02) A method other than the candidate's Paying by also makes
-- Paying by that method (same update, same batch, logged as
-- star_record_payment) and the payment remembers the old Paying by
-- (paying_by_before) for Undo payment.
-- locks: event (no key update) -> candidate (update)
-- Ok: {"status":"ok","payment_id":...,"version":n}  (the same answer as before 0038)
create or replace function public.star_record_payment(
  p_candidate_id     uuid,
  p_expected_version integer,
  p_method           text,
  p_amount_cents     integer,
  p_paid_on          date,
  p_school           text default null   -- 0038
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
  v_school     text;   -- 0038: the desk that took the money
  v_before     text;   -- 0038: the old paying_by, when the way differs
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
    -- 0038: the desk's school, if one was sent
    if p_school is not null and not exists (select 1 from public.locations l where l.code = p_school) then
      return jsonb_build_object('status', 'invalid', 'field', 'school');
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

    -- 0038: no school sent = the candidate's; another way = remember the old Paying by
    v_school := coalesce(p_school, v_c.location_code);
    v_before := case when p_method <> v_c.paying_by then v_c.paying_by end;

    perform set_config('tkd.action', 'star_record_payment', true);
    perform set_config('tkd.batch_id', gen_random_uuid()::text, true);

    insert into public.star_payments
      (candidate_id, kind, amount_cents, method, paid_on, school, recorded_at, recorded_by, recorded_by_name,
       paying_by_before)   -- 0038
    values
      (v_c.id, 'payment', p_amount_cents, p_method, p_paid_on, v_school, now(), auth.uid(), public.change_log_actor_name(),
       v_before)   -- 0038
    returning id into v_payment_id;

    -- one update: the version goes up (a double click gets "stale") and,
    -- 0038: if the way differed, Paying by becomes the way they paid
    update public.star_candidates c
       set version   = c.version + 1,
           paying_by = p_method   -- 0038
     where c.id = v_c.id
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

revoke execute on function public.star_record_payment(uuid, integer, text, integer, date, text) from public, anon, authenticated, service_role;
grant  execute on function public.star_record_payment(uuid, integer, text, integer, date, text) to authenticated;

-- 18v. star_undo_payment(p_payment_id)   S (own, within 10 s) / A
-- (0006's text; replaced by 0038. Every line is 0006's except the ones
-- marked "0038".)
-- Writes a reversal of a payment OR a refund (the row stays; the two add
-- up to 0). Who may: the staff member who recorded it less than 10
-- seconds ago (the toast's Undo); otherwise admins only (not_allowed).
-- A reversal can't be undone (invalid); already reversed -> stale; a
-- PAYMENT while the candidate has a refund that isn't reversed -> invalid
-- (undo the refund first, so the total can't go below zero).
-- The candidate's version goes up.
-- (0038, R1-01) The reversal carries the school of the payment it undoes.
-- (0038, R1-02) If the payment remembered an earlier Paying by
-- (paying_by_before: Record payment or Edit payment by another way
-- changed it) and the candidate's Paying by is still the payment's
-- method, it is put back, in the same update and batch (logged as
-- star_undo_payment). If someone changed Paying by again since, it is left
-- alone. A payment without paying_by_before (every payment from before
-- 0038, and every refund): nothing extra.
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
      (candidate_id, kind, amount_cents, method, paid_on, school, recorded_at, recorded_by, recorded_by_name,
       reverses_payment_id)
    values
      (v_p.candidate_id, 'reversal', -v_p.amount_cents, v_p.method, public.testing_today(), v_p.school, now(), auth.uid(),
       public.change_log_actor_name(), v_p.id);

    update public.star_candidates c
       set version   = c.version + 1,
           -- 0038: the old Paying by back, if this payment changed it and nobody changed it since
           paying_by = case when v_p.paying_by_before is not null and c.paying_by = v_p.method
                            then v_p.paying_by_before else c.paying_by end
     where c.id = v_p.candidate_id
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
-- (0006's text; replaced by 0038. Every line is 0006's except the ones
-- marked "0038".)
-- Edit payment = a reversal of the old payment + a new payment with the
-- new method / amount / date (the date not before the candidate's
-- registered day, v0.175). Only a payment (not a refund or reversal:
-- invalid); already reversed -> stale; the candidate has a refund that
-- isn't reversed -> invalid (undo the refund first).
-- (0038, R1-01) BOTH new rows (the reversal and the new payment) carry the
-- school of the payment being edited - an Edit never moves money to
-- another desk (money booked to the wrong desk is undone and recorded
-- again on a device set to the right school).
-- (0038, R1-02) Paying by follows the edit - Color Belt 0030's rule and
-- Camps 0033's (its section 5, camp_edit_payment), copied exactly. o = the
-- payment being edited, "Paying by" = the candidate's paying_by right now:
--   * the family's choice = what Undo payment of o would leave: o's
--     paying_by_before if it has one AND Paying by is still o's method;
--     otherwise Paying by itself.
--   * the edit CHANGES the way (p_method is not o's method): Paying by
--     becomes p_method, in the same update as the version bump and in the
--     same batch, so it is logged with the edit.
--   * the edit keeps the way (only the amount or the day): Paying by is
--     left alone.
--   * the NEW payment's paying_by_before = the family's choice, but only
--     when Paying by equals the new payment's method after the edit and
--     the choice is a different way. Otherwise NULL.
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
  v_paying_by  text;   -- 0038: Paying by now
  v_choice     text;   -- 0038: the family's choice (what Undo of the old payment would leave)
  v_after      text;   -- 0038: Paying by after the edit
  v_before     text;   -- 0038: the new payment's paying_by_before
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

    -- 0038: Paying by follows the edit (Color Belt 0030 / Camps 0033). The
    -- candidate is already locked (star_lock_payment locks it before the payment).
    select c.paying_by into v_paying_by from public.star_candidates c where c.id = v_p.candidate_id;
    v_choice := case when v_p.paying_by_before is not null and v_paying_by = v_p.method
                     then v_p.paying_by_before else v_paying_by end;
    v_after  := case when p_method <> v_p.method then p_method else v_paying_by end;
    v_before := case when v_after = p_method and v_choice <> p_method then v_choice end;

    perform set_config('tkd.action', 'star_edit_payment', true);
    perform set_config('tkd.batch_id', gen_random_uuid()::text, true);

    insert into public.star_payments
      (candidate_id, kind, amount_cents, method, paid_on, school, recorded_at, recorded_by, recorded_by_name,
       reverses_payment_id)
    values
      (v_p.candidate_id, 'reversal', -v_p.amount_cents, v_p.method, public.testing_today(), v_p.school, now(), auth.uid(),
       public.change_log_actor_name(), v_p.id);

    insert into public.star_payments
      (candidate_id, kind, amount_cents, method, paid_on, school, recorded_at, recorded_by, recorded_by_name,
       paying_by_before)   -- 0038
    values
      (v_p.candidate_id, 'payment', p_amount_cents, p_method, p_paid_on, v_p.school, now(), auth.uid(),
       public.change_log_actor_name(), v_before)   -- 0038
    returning id into v_new_id;

    update public.star_candidates c
       set version   = c.version + 1,
           paying_by = v_after   -- 0038: the new way, if the edit changed the way
     where c.id = v_p.candidate_id
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
--        p_amount_cents, p_refunded_on, p_school default null)   A (S7)
-- (0006's text; replaced by 0038. Every line is 0006's except the ones
-- marked "0038".)
-- A refund of an OVERPAID amount (e.g. paid the private fee, then "Back
-- to the testing day"): its own negative row, cash or check, with its own
-- date (v0.166; not before the candidate's registered day, v0.175). Not
-- overpaid, or more than the overpaid amount ->
-- {"status":"refund_too_large","overpaid_cents":n}. The candidate's
-- version goes up.
-- (0038, R1-01, rulebook v1.040) p_school = the school whose desk hands
-- the money back (This device's school); left out or null = the
-- candidate's school. Any school in public.locations, else
-- {"status":"invalid","field":"school"}; stored on the refund. Undo of the
-- refund copies it.
-- locks: event (no key update) -> candidate (update)
-- Ok: {"status":"ok","payment_id":...,"version":n}  (the same answer as before 0038)
create or replace function public.star_record_refund(
  p_candidate_id     uuid,
  p_expected_version integer,
  p_method           text,
  p_amount_cents     integer,
  p_refunded_on      date,
  p_school           text default null   -- 0038
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
  v_school     text;   -- 0038: the desk that hands the money back
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
    -- 0038: the desk's school, if one was sent
    if p_school is not null and not exists (select 1 from public.locations l where l.code = p_school) then
      return jsonb_build_object('status', 'invalid', 'field', 'school');
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

    v_school := coalesce(p_school, v_c.location_code);   -- 0038

    perform set_config('tkd.action', 'star_record_refund', true);
    perform set_config('tkd.batch_id', gen_random_uuid()::text, true);

    insert into public.star_payments
      (candidate_id, kind, amount_cents, method, paid_on, school, recorded_at, recorded_by, recorded_by_name)
    values
      (v_c.id, 'refund', -p_amount_cents, p_method, p_refunded_on, v_school, now(), auth.uid(), public.change_log_actor_name())
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

revoke execute on function public.star_record_refund(uuid, integer, text, integer, date, text) from public, anon, authenticated, service_role;
grant  execute on function public.star_record_refund(uuid, integer, text, integer, date, text) to authenticated;


-- ---------------------------------------------------------------------
-- 8. The Candidates view again: 0006's section 14, word for word, plus ONE
--    column at the very end: paying_by_on_form. ("create or replace view"
--    can only add columns at the end, after the two worked-out ones, so
--    the outer select now names its columns instead of "x.*".) Same
--    options (security_invoker = true: it reads the tables with the
--    CALLER's rights, so RLS and the column rights still apply) and the
--    same grant (select for authenticated only; nothing for anon).
-- ---------------------------------------------------------------------
create or replace view public.star_roster
with (security_invoker = true)
as
select x.id,
       x.event_id,
       x.first_name,
       x.last_name,
       x.location_code,
       x.dan,
       x.stars_from,
       x.paying_by,
       x.source,
       x.reference,
       x.registered_at,
       x.status,
       x.withdrawn_reason,
       x.withdrawn_at,
       x.withdrawn_by_name,
       x.duplicate_state,
       x.duplicate_of,
       x.is_makeup,
       x.makeup_of_candidate_id,
       x.makeup_of_event_name,
       x.private_on,
       x.private_time,
       x.classes_attended,
       x.assistant_classes,
       x.version,
       x.created_at,
       x.updated_at,
       x.created_by_name,
       x.updated_by_name,
       x.testing_date,
       x.dan_label,
       x.star_limit,
       x.standard_cents,
       x.same_day_cents,
       x.private_cents,
       x.paid_cents,
       x.paid,
       x.last_payment_id,
       x.paid_on,
       x.paid_method,
       x.last_payment_recorded_at,
       x.last_payment_recorded_by_name,
       x.refunded_cents,
       x.fee_kind,
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
       end as overpaid_cents,
       x.paying_by_on_form                                  -- 0038: the family form's choice (last column)
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
           end as fee_kind,
           c.paying_by_on_form   -- 0038
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

-- the rights, as 0006 section 15 has them (nothing for anon, service_role or PUBLIC)
revoke all on table public.star_roster from public, anon, authenticated, service_role;
grant select on public.star_roster to authenticated;


-- ---------------------------------------------------------------------
-- 9. star_event_results(p_event_id, p_dan) - REPLACED (0006 section 19e)
--    S   - belt order, Worcester first (S-1)
-- Identical to 0006's version - same arguments, checks, answers, owner and
-- rights - except the row order: stars, then Worcester before Shrewsbury
-- (an explicit rank, not a text sort), then last name, then first name.
-- (0006 had Shrewsbury first.) The counts don't depend on the order.
-- The Results tab (and the Grading grid's Total / Result, the printed
-- sheets) for one Dan: the counts and one row per ACTIVE candidate of
-- that Dan in belt order - the result (12g) plus names, school and the
-- sent state. A Dan not in the event's copy -> invalid.
-- Ok: {"status":"ok","dan":n,"pass_mark":n,"max_score":n,
--      "counts":{candidates, passed, makeup, not_finished, testing_privately},
--      "rows":[result + {first_name, last_name, location_code, sent}]}
-- locks: none (a read)
-- ---------------------------------------------------------------------
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
                   case c.location_code when 'worcester' then 0 when 'shrewsbury' then 1 else 2 end as loc_order,   -- 0038: Worcester first
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
    -- rule or lock problem answers a status instead of an error
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


-- ---------------------------------------------------------------------
-- 10. star_results_csv(p_event_id, p_dan) - REPLACED (0023 section 7)
--     A   (volatile: it writes the download log) - belt order, Worcester
--     first (S-1)
-- Identical to 0023's version - same arguments, checks, statuses, owner,
-- rights, row keys, and the download row written FIRST - except the row
-- order: Dan, star, Worcester before Shrewsbury (an explicit rank, not a
-- text sort), last name, first name. (0006 / 0023 had Shrewsbury first.)
-- The results CSV (v0.144): every ACTIVE candidate of the event (p_dan
-- NULL) or of one Dan, with raw values incl. DOB and email. Admin only.
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
                   case c.location_code when 'worcester' then 0 when 'shrewsbury' then 1 else 2 end as loc_order,   -- 0038: Worcester first
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

revoke execute on function public.star_results_csv(uuid, integer) from public, anon, authenticated, service_role;
grant  execute on function public.star_results_csv(uuid, integer) to authenticated;


-- ---------------------------------------------------------------------
-- 11. star_undo_event_edit(...)   A   (R2-02)   NEW
-- "Changes saved - Undo" of Edit event, done by the database in ONE
-- transaction (the model: 0032's bb_undo_cycle_edit):
--   p_event_id, p_expected_version   the event and the version the save
--                                    returned
--   p_name, p_testing_date, p_start_time, p_where_code, p_auto_close_on,
--   p_note, p_end_time               the OLD details, exactly as
--                                    star_update_event (0041's version)
--                                    takes them; p_end_time NULL = no end
--                                    time (the old one had none)
--   p_open                           the registration switch to put back,
--                                    or NULL when the save didn't change it
-- Order of the checks:
--   no data access -> no_access; not an admin -> not_allowed (Edit event
--   is admin only); no event id or version -> invalid;
--   lock the event (for update; the same lock star_update_event and
--   star_set_registration take first, so the order of locks is the same);
--   no such event -> not_found; the event's version is not the one the
--   save returned (someone changed it since) -> stale; nothing is written.
-- Then, in an inner block:
--   star_update_event(event, version, old details...) puts the details
--   back, and its answer's version is used next; then, if p_open is not
--   null, star_set_registration(event, that version, p_open).
--   Either answer not ok -> that answer is kept, the inner block is
--   undone (so details that went through are put back as they were), and
--   the kept answer is returned as it is (stale, invalid, duplicate_name,
--   finished, not_allowed ...). The Edit's own v0.504 rule (an edit never
--   reopens registration by itself) still applies to the details step; if
--   the app asks for the switch to go back to Open, the second step does it.
-- Its own new name, not a new input on star_update_event: an input with a
-- default would make the web API's choice between two versions of
-- star_update_event ambiguous.
-- It writes no history row of its own: an Undo that goes through leaves
-- exactly the rows the two functions write (one batch each, tagged
-- star_update_event and star_set_registration); a refused Undo leaves none.
-- Not checked (unlike Black Belt's, which refuses after a family
-- registered): a family registering does not change the event row, and
-- the old values were valid for it.
-- locks: the event (update)
-- Ok: {"status":"ok","version":n}
-- ---------------------------------------------------------------------
create or replace function public.star_undo_event_edit(
  p_event_id         uuid,
  p_expected_version integer,
  p_name             text,
  p_testing_date     date,
  p_start_time       time,
  p_where_code       text,
  p_auto_close_on    date,
  p_note             text,
  p_end_time         time,
  p_open             boolean
)
returns jsonb
language plpgsql
volatile
security definer
set search_path = ''
as $$
declare
  v_e       public.star_events;
  v_r       jsonb;
  v_kept    jsonb;
  v_version integer;
begin
  begin
    if public.has_data_access() is not true then
      return jsonb_build_object('status', 'no_access');
    end if;
    if public.is_admin() is not true then
      return jsonb_build_object('status', 'not_allowed');
    end if;

    if p_event_id is null or p_expected_version is null then
      return jsonb_build_object('status', 'invalid');
    end if;

    -- the event first, as both inner functions lock it
    select * into v_e from public.star_events e where e.id = p_event_id for update;
    if not found then
      return jsonb_build_object('status', 'not_found');
    end if;
    if v_e.version <> p_expected_version then
      return jsonb_build_object('status', 'stale');
    end if;

    v_version := p_expected_version;
    begin
      v_r := public.star_update_event(p_event_id, v_version, p_name, p_testing_date, p_start_time, p_where_code,
                                      p_auto_close_on, p_note, p_end_time);
      if v_r ->> 'status' is distinct from 'ok' then
        v_kept := v_r;
        raise exception using errcode = 'STU38', message = 'star_undo_event_edit: the details were refused';
      end if;
      v_version := (v_r ->> 'version')::integer;

      if p_open is not null then
        v_r := public.star_set_registration(p_event_id, v_version, p_open);
        if v_r ->> 'status' is distinct from 'ok' then
          v_kept := v_r;
          raise exception using errcode = 'STU38', message = 'star_undo_event_edit: the switch was refused';
        end if;
        v_version := (v_r ->> 'version')::integer;
      end if;
    exception
      -- only our own signal: everything this inner block wrote is undone,
      -- and the refusal is answered as it came
      when sqlstate 'STU38' then
        return v_kept;
    end;

    return jsonb_build_object('status', 'ok', 'version', v_version);
  exception
    when unique_violation then
      return jsonb_build_object('status', 'stale');
    when foreign_key_violation or check_violation or not_null_violation then
      return jsonb_build_object('status', 'invalid');
    when numeric_value_out_of_range or invalid_text_representation then
      return jsonb_build_object('status', 'invalid');
    when deadlock_detected or serialization_failure or lock_not_available then
      return jsonb_build_object('status', 'stale');
  end;
end;
$$;

revoke execute on function public.star_undo_event_edit(uuid, integer, text, date, time, text, date, text, time, boolean) from public, anon, authenticated, service_role;
grant  execute on function public.star_undo_event_edit(uuid, integer, text, date, time, text, date, text, time, boolean) to authenticated;

commit;

-- End of 0038_star_design_review.sql
