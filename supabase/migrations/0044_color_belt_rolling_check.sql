-- =====================================================================
-- 0044_color_belt_rolling_check.sql
-- ---------------------------------------------------------------------
-- WHAT THIS FILE IS
--   The database half of Color Belt's rolling-check fixes, step A of
--   docs/Testing/Color Belt Testing/TKD-ColorBelt-RollingCheck-Plan.md:
--     M-01 (= C-01, pass 2)  the family form's own "Paying by" is kept
--     R2-02 (pass 1)         Edit event's Undo in ONE database call
--     R1-01 (pass 1, v1.035) each payment stores the school of the desk
--                            that took it
--   It runs after 0005, 0010, 0014, 0018 and 0030 (all live) and stops
--   with a clear message if one of them is missing. It does NOT need
--   0035 (the clean-up of the old one-click Mark paid): it works with
--   or without it, pasted before or after it.
--   It touches only Color Belt (testing_* / testing_private_*) objects.
--   No Finance function is changed: Finance keeps booking Color Belt money
--   to the event's / private testing's school until its own later
--   migration reads the new "school" column.
--
-- WHY IT EXISTS
--   M-01  The Mark paid box says "They chose Cash on the form." even after
--         the desk changed "Paying by" (Change how they'll pay, or Mark
--         paid / Edit payment by another way). The database never kept
--         what the family picked on the form, so the app can't tell.
--   R2-02 Edit event's toast Undo is two calls today (put the details
--         back, then the Open / Closed switch). If only the second fails,
--         the event is left half undone, and Retry re-sends the first
--         with an old version ("someone else changed it" - not true).
--   R1-01 Finance books a Color Belt payment to the EVENT's school. A
--         family paying at the other school's desk lands in the wrong
--         drawer. The rule (v1.035): a payment counts at the desk that
--         took it (This device), stored when it is recorded; an undo or
--         edit copies it from the payment it corrects.
--
-- WHAT IT CHANGES
--   1. M-01 - two new columns, "paying_by_on_form" (cash / check / card,
--      or empty):
--        * testing_registrations.paying_by_on_form - the family form's own
--          choice. Set ONCE, when the family form adds the registration
--          (source = 'form'); a registration added at the desk has none.
--        * testing_private.paying_by_on_form - a private testing MOVED from
--          an event registration takes the registration's value; one added
--          at the desk has none.
--      Two small new triggers keep them: on insert they work the value out
--      (whatever the caller sent), on every update they put the old value
--      back - so no function can ever change it. They run BEFORE 0005's /
--      0014's own "before write" triggers (Postgres runs a table's BEFORE
--      triggers in name order: "..._before_form_choice" comes before
--      "..._before_write"), so an update that only tried to change it is
--      "no change": no version bump, no history row.
--      Existing rows (filled once, when the column is added):
--        * a form registration: the "Paying by" of its own change_log
--          INSERT row (what the form sent). No insert row -> stays EMPTY
--          (unlike Camps' 0033, which falls back to today's Paying by:
--          today's may already be a desk change). Empty reads "at the
--          desk" in the app.
--        * a desk registration: empty.
--        * a moved private testing: the value of the registration it came
--          from (moved_from_registration_id); if that registration was
--          removed for good, its change_log INSERT row (if it was a form
--          registration). Otherwise empty.
--        * a private testing added at the desk: empty.
--      That fill writes no history row and moves no version (the tables'
--      own triggers are switched off for that one statement, inside this
--      file's transaction).
--      Move to private carries the value (the trigger copies it from the
--      registration); Undo move "carries it back" by itself: the
--      registration row keeps its own value the whole time (moving only
--      withdraws it).
--      The app may read both columns (column rights added), and the two
--      read views, testing_roster and testing_private_list, show it as
--      their LAST column ("create or replace view" can only add columns
--      at the end). The app works out the hint:
--        paying_by = paying_by_on_form -> "on the form", else "at the desk"
--      (an empty value always means "at the desk").
--   2. R1-01 - a new column "school" (a school code, never empty) on both
--      payment tables, testing_payments and testing_private_payments,
--      with a foreign key to public.locations (code), named like Camps'
--      camp_payments.school and Finance's "school".
--        * Existing rows: the school Finance shows for them today - the
--          event's school (testing_events.location_code) for event
--          payments, the private testing's school for private payments.
--          Filled once, with the payment guards and log triggers switched
--          off for that one statement (the tables are append-only, and the
--          fill is not a money change), so no history row is written.
--        * A small new BEFORE INSERT trigger on each table fills it when a
--          writer leaves it empty (the old 2-argument Mark paid, which the
--          live site may still call until 0035, and any older code): a
--          payment -> the registration's event's school (a private one ->
--          the event payment it was moved from, else the private
--          testing's school); a reversal -> ALWAYS the school of the
--          payment it reverses (the chain rule, v0.903: one chain never
--          splits between two schools; a different school is refused).
--        * Read rights follow each table's own rule (as 0030's
--          paying_by_before): NOT readable on testing_payments (0005 lists
--          its columns one by one), readable by authenticated on
--          testing_private_payments (0014: every column but the login
--          ids). Finance names its columns, so nothing there changes.
--      Mark paid takes This device's school - a NEW LAST INPUT WITH A
--      DEFAULT:
--        testing_mark_paid_by(p_registration_id, p_expected_version,
--                             p_method, p_expected_cents,
--                             p_school text default null)
--        testing_private_mark_paid_by(p_private_id, p_expected_version,
--                                     p_method, p_expected_cents,
--                                     p_school text default null)
--      Empty (null or blank) = the registration's event's school / the
--      private testing's own school, so the live app's 4-input call keeps
--      working exactly as today. A school that isn't in public.locations ->
--      {"status":"invalid","field":"school"}. Everything else, and the
--      answer, is 0030's word for word.
--      >>> SIGNATURE CHANGE: Postgres can't add an input to an existing
--      >>> function, and two versions side by side would make every
--      >>> 4-input call "ambiguous". So this file REMOVES the old 4-input
--      >>> versions ("drop function if exists ...(uuid, integer, text,
--      >>> integer)", two lines) and makes the 5-input ones right after,
--      >>> in the same transaction. Jeffrey pastes it himself.
--      REPLACED (same names, arguments, rights, statuses and answers; the
--      bodies are 0030's, plus the school):
--        testing_undo_payment / testing_private_undo_payment - the
--          reversal copies the school of the payment it undoes;
--        testing_edit_payment / testing_private_edit_payment - the
--          reversal AND the new payment copy the school of the payment
--          being edited (an edit fixes amount / way / day, never the
--          desk: money at the wrong school is undone and recorded again
--          on a device set to the right one, v1.035);
--        testing_move_to_private - the event reversal and the private
--          payment both copy the event payment's school (a move stays a
--          transfer, v0.407: no counted day changes);
--        testing_private_undo_move - the event payments recorded again
--          copy the private payment's school.
--   3. R2-02 - NEW function testing_undo_event_edit(p_event_id,
--      p_expected_version, p_name, p_testing_date, p_classes,
--      p_auto_close_on, p_note, p_open): Edit event's Undo in ONE
--      transaction - the old details (through testing_update_event, 0010)
--      and, when p_open is not null, the old switch position (through
--      testing_set_registration, 0005) - together or not at all (model:
--      0032's bb_undo_cycle_edit). A new name, so the live app keeps
--      working. Admins only (Edit event is admin only).
--      No "a family registered after the save" refusal (Black Belt's
--      bb_undo_cycle_edit has one): undoing an event edit never removes
--      anyone's registration. testing_update_event already refuses to
--      take away a class that has a registration (not_empty), and a
--      family who registered meanwhile simply stays on the event with
--      the old details put back.
--   Nothing is granted to anon, service_role or the family form's login
--   (testing_registrar). Every app function: security definer,
--   search_path = '', has_data_access() first, revoked from public, anon,
--   authenticated and service_role, then granted to authenticated only.
--   The trigger functions: not security definer, nobody may call them.
--
-- HOW TO RUN IT
--   After 0005, 0010, 0014, 0018 and 0030 (all live). Apply it BEFORE the
--   app that sends p_school, reads paying_by_on_form or calls
--   testing_undo_event_edit (the app that is live today keeps working with
--   it). Supabase dashboard -> SQL Editor -> New query -> paste this WHOLE
--   file -> Run. One transaction ("begin;" ... "commit;"): if any statement
--   fails, nothing is kept.
--   Supabase will warn about destructive operations: TWO lines are real
--   on the first run - the "drop function if exists" of the old 4-input
--   testing_mark_paid_by and testing_private_mark_paid_by (made again with
--   5 inputs straight after, same transaction). The other "drop ... if
--   exists" lines only make re-running safe. No data is removed.
--   Safe to run again (tested in PGlite: a second run changes no
--   fingerprint and no row).
--   RE-RUN ORDER (read before re-running an OLDER file):
--   * 0005 / 0014 can't be re-run cleanly after this file: their "create
--     or replace view" has one column fewer than this file's view and
--     fails (nothing of that file is kept). If they ever had to run, they
--     would also take away the new column rights (they "revoke all") -
--     re-run this file straight after.
--   * Re-running 0030 after this file brings back the 4-input
--     testing_mark_paid_by / testing_private_mark_paid_by NEXT TO the
--     5-input ones: every 4-input call (the live app's) then fails as
--     "ambiguous", and its Undo / Edit / Move bodies would stop copying
--     the school (the trigger still fills it, from the event / private
--     testing). Re-run this file straight after it.
--   0035 and this file may be pasted in either order: 0035's guard
--   accepts the 4-input testing_mark_paid_by (0030) or this file's 5-input
--   one (tested in PGlite both ways round).
--   Proof before pasting: supabase/tests/0044_preapply_check.sql (SETUP.md,
--   Migration 0044, 0044a).
--   Undo: supabase/SETUP.md, "Migration 0044", 0044e
--   (supabase/manual/0044u_undo_color_belt_rolling_check.sql).
--
-- WORDS USED BELOW
--   * "security definer": the function runs with its owner's rights, so
--     it can write tables the app can't; it then decides itself who may
--     do what (has_data_access() first).
--   * search_path = '': the function looks up nothing by a short name, so
--     nobody can slip in a look-alike object.
--   * "trigger": a small function the database runs by itself on every
--     insert / update of a table.
--   * statuses: ok, no_access, not_allowed, not_found, stale, invalid,
--     withdrawn, cancelled, already_paid, price_changed (0030's), plus
--     whatever testing_update_event / testing_set_registration answer
--     (has_results, not_empty, duplicate_name, finished, ...).
-- =====================================================================

begin;


-- ---------------------------------------------------------------------
-- 1. The guard: this file needs 0005, 0010, 0014, 0018 and 0030. Stops -
--    and changes nothing - if a table or function it uses is missing.
--    testing_mark_paid_by is accepted with 4 inputs (0030) or with 5
--    (this file: a re-run).
-- ---------------------------------------------------------------------
do $$
begin
  if to_regclass('public.testing_registrations') is null
     or to_regclass('public.testing_payments') is null
     or to_regclass('public.testing_events') is null
     or to_regclass('public.testing_roster') is null
     or to_regclass('public.locations') is null
     or to_regclass('public.change_log') is null
     or to_regprocedure('public.has_data_access()') is null
     or to_regprocedure('public.is_admin()') is null
     or to_regprocedure('public.change_log_actor_name()') is null
     or to_regprocedure('public.testing_today()') is null
     or to_regprocedure('public.testing_fee_cents(integer, integer, date, date)') is null
     or to_regprocedure('public.testing_lock_registration(uuid)') is null
     or to_regprocedure('public.testing_lock_payment(uuid)') is null
     or to_regprocedure('public.testing_purge_old_signatures()') is null
     or to_regprocedure('public.testing_rank_testing_for(uuid)') is null
     or to_regprocedure('public.testing_recheck_pointing_at(uuid)') is null
     or to_regprocedure('public.testing_recheck_duplicate(uuid)') is null
     or to_regprocedure('public.testing_event_state(public.testing_events, date)') is null
     or to_regprocedure('public.testing_set_registration(uuid, integer, boolean)') is null then
    raise exception '0044 needs migration 0005 (Color Belt events) first';
  end if;
  if to_regprocedure('public.testing_update_event(uuid, integer, text, date, jsonb, date, text)') is null
     or to_regclass('public.testing_results') is null then
    raise exception '0044 needs migration 0010 (Color Belt grading) first';
  end if;
  if to_regclass('public.testing_private') is null
     or to_regclass('public.testing_private_payments') is null
     or to_regclass('public.testing_private_list') is null
     or to_regprocedure('public.testing_private_lock(uuid)') is null
     or to_regprocedure('public.testing_private_lock_payment(uuid)') is null
     or to_regprocedure('public.testing_private_amount_due(uuid)') is null
     or to_regprocedure('public.testing_private_time_is_valid(time)') is null then
    raise exception '0044 needs migration 0014 (Color Belt private testing) first';
  end if;
  if to_regclass('public.finance_testing_private_payments_paid_on_idx') is null then
    raise exception '0044 needs migration 0018 (private testing payments in Finance) first';
  end if;
  if (to_regprocedure('public.testing_mark_paid_by(uuid, integer, text, integer)') is null
      and to_regprocedure('public.testing_mark_paid_by(uuid, integer, text, integer, text)') is null)
     or (to_regprocedure('public.testing_private_mark_paid_by(uuid, integer, text, integer)') is null
         and to_regprocedure('public.testing_private_mark_paid_by(uuid, integer, text, integer, text)') is null)
     or to_regprocedure('public.testing_registration_history(uuid)') is null
     or not exists (select 1 from pg_attribute a
                     where a.attrelid = 'public.testing_payments'::regclass
                       and a.attname = 'paying_by_before' and not a.attisdropped) then
    raise exception '0044 needs migration 0030 (Color Belt: Mark paid with a way to pay) first';
  end if;
end
$$;


-- ---------------------------------------------------------------------
-- 2. M-01 - testing_registrations.paying_by_on_form
--   Order matters:
--   a. the column, and - only when it is NEW (a re-run skips all of a.) -
--      the fill of existing FORM registrations from their own change_log
--      insert row (0005's log writes every column there, paying_by
--      included). No insert row (or an unreadable value) -> stays empty.
--      0005's two registration triggers are off for that one statement,
--      so no history row is written and no version moves (open screens
--      don't go "stale");
--   b. the rule: empty, or (a form registration and cash / check / card);
--   c. the trigger that keeps it (section 4).
-- ---------------------------------------------------------------------
do $$
begin
  if not exists (select 1 from pg_attribute a
                  where a.attrelid = 'public.testing_registrations'::regclass
                    and a.attname = 'paying_by_on_form' and not a.attisdropped) then
    alter table public.testing_registrations add column paying_by_on_form text null;

    alter table public.testing_registrations disable trigger testing_registrations_before_write;
    alter table public.testing_registrations disable trigger testing_registrations_log;
    update public.testing_registrations r
       set paying_by_on_form = (select l.after ->> 'paying_by'
                                  from public.change_log l
                                 where l.table_name = 'testing_registrations'
                                   and l.record_id = r.id
                                   and l.op = 'insert'
                                   and (l.after ->> 'paying_by') in ('cash', 'check', 'card')
                                 order by l.id
                                 limit 1)
     where r.source = 'form';
    alter table public.testing_registrations enable trigger testing_registrations_before_write;
    alter table public.testing_registrations enable trigger testing_registrations_log;
  end if;

  if not exists (select 1 from pg_constraint c
                  where c.conrelid = 'public.testing_registrations'::regclass
                    and c.conname = 'testing_registrations_paying_by_on_form_check') then
    alter table public.testing_registrations add constraint testing_registrations_paying_by_on_form_check
      check (paying_by_on_form is null
             or (source = 'form' and paying_by_on_form in ('cash', 'check', 'card')));
  end if;
end
$$;

comment on column public.testing_registrations.paying_by_on_form is
  'The way to pay the family chose on the family form (cash / check / card); empty for a registration added at the desk (or a form row whose insert history row was missing in 0044). Set on insert by testing_registrations_keep_form_choice, never changed. The Mark paid hint: paying_by = paying_by_on_form -> "on the form", else "at the desk".';


-- ---------------------------------------------------------------------
-- 3. M-01 - testing_private.paying_by_on_form
--   a. the column and - only when it is NEW - the fill of existing MOVED
--      private testings: the registration's value (section 2 ran first);
--      if that registration was removed for good, the paying_by of its
--      change_log insert row when it was a form registration; otherwise
--      empty. 0014's two private-testing triggers are off for that one
--      statement (no history row, no version moved);
--   b. the rule: empty, or (a moved one and cash / check / card).
-- ---------------------------------------------------------------------
do $$
begin
  if not exists (select 1 from pg_attribute a
                  where a.attrelid = 'public.testing_private'::regclass
                    and a.attname = 'paying_by_on_form' and not a.attisdropped) then
    alter table public.testing_private add column paying_by_on_form text null;

    alter table public.testing_private disable trigger testing_private_before_write;
    alter table public.testing_private disable trigger testing_private_log;
    update public.testing_private p
       set paying_by_on_form = coalesce(
             (select r.paying_by_on_form from public.testing_registrations r where r.id = p.moved_from_registration_id),
             (select l.after ->> 'paying_by'
                from public.change_log l
               where l.table_name = 'testing_registrations'
                 and l.record_id = p.moved_from_registration_id
                 and l.op = 'insert'
                 and (l.after ->> 'source') = 'form'
                 and (l.after ->> 'paying_by') in ('cash', 'check', 'card')
                 and not exists (select 1 from public.testing_registrations r2 where r2.id = p.moved_from_registration_id)
               order by l.id
               limit 1))
     where p.moved_from_registration_id is not null;
    alter table public.testing_private enable trigger testing_private_before_write;
    alter table public.testing_private enable trigger testing_private_log;
  end if;

  if not exists (select 1 from pg_constraint c
                  where c.conrelid = 'public.testing_private'::regclass
                    and c.conname = 'testing_private_paying_by_on_form_check') then
    alter table public.testing_private add constraint testing_private_paying_by_on_form_check
      check (paying_by_on_form is null
             or (moved_from_registration_id is not null and paying_by_on_form in ('cash', 'check', 'card')));
  end if;
end
$$;

comment on column public.testing_private.paying_by_on_form is
  'For a private testing moved from an event: the family form''s own way to pay of the registration it came from (empty when that registration was added at the desk). Empty for one added at the desk. Set on insert by testing_private_keep_form_choice, never changed.';


-- ---------------------------------------------------------------------
-- 4. M-01 - the two triggers that keep paying_by_on_form
--   testing_registrations_keep_form_choice() - BEFORE INSERT OR UPDATE
--     insert: the family form's row (source 'form') -> its paying_by;
--             a desk row -> empty (whatever the caller sent)
--     update: the old value (whatever the caller sent)
--   testing_private_keep_form_choice() - BEFORE INSERT OR UPDATE
--     insert: moved from a registration -> that registration's
--             paying_by_on_form; added at the desk -> empty
--     update: the old value
--   The triggers are named "..._before_form_choice" so they run BEFORE
--   0005's testing_registrations_before_write and 0014's
--   testing_private_before_write (name order), which then see no change
--   when only this column was "changed": no version bump, no history row.
--   Not security definer; nobody may call them (only the triggers run
--   them). They read testing_registrations only to copy a value.
-- ---------------------------------------------------------------------
create or replace function public.testing_registrations_keep_form_choice()
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

revoke execute on function public.testing_registrations_keep_form_choice() from public, anon, authenticated, service_role;

drop trigger if exists testing_registrations_before_form_choice on public.testing_registrations;
create trigger testing_registrations_before_form_choice
  before insert or update on public.testing_registrations
  for each row execute function public.testing_registrations_keep_form_choice();

create or replace function public.testing_private_keep_form_choice()
returns trigger
language plpgsql
set search_path = ''
as $$
begin
  if tg_op = 'INSERT' then
    new.paying_by_on_form := case
      when new.moved_from_registration_id is not null then
        (select r.paying_by_on_form from public.testing_registrations r where r.id = new.moved_from_registration_id)
    end;
  else
    new.paying_by_on_form := old.paying_by_on_form;
  end if;
  return new;
end;
$$;

revoke execute on function public.testing_private_keep_form_choice() from public, anon, authenticated, service_role;

drop trigger if exists testing_private_before_form_choice on public.testing_private;
create trigger testing_private_before_form_choice
  before insert or update on public.testing_private
  for each row execute function public.testing_private_keep_form_choice();


-- ---------------------------------------------------------------------
-- 5. R1-01 - "school" on both payment tables
--   a. the column and - only when it is NEW - the fill of existing rows
--      with the school Finance shows for them today (0018 / 0026): the
--      event's school for an event payment, the private testing's school
--      for a private payment. The payment guards (append-only: they
--      refuse every update) and the log triggers are off for that one
--      statement, so the fill writes no history row; it is not a money
--      change (Finance already counts these rows at exactly that
--      school).
--   b. never empty from now on, and a real school (foreign key to
--      public.locations (code), as camp_payments.school).
-- ---------------------------------------------------------------------
do $$
begin
  if not exists (select 1 from pg_attribute a
                  where a.attrelid = 'public.testing_payments'::regclass
                    and a.attname = 'school' and not a.attisdropped) then
    alter table public.testing_payments add column school text null;

    alter table public.testing_payments disable trigger testing_payments_guard;
    alter table public.testing_payments disable trigger testing_payments_log;
    update public.testing_payments p
       set school = e.location_code
      from public.testing_registrations r
      join public.testing_events e on e.id = r.event_id
     where r.id = p.registration_id;
    alter table public.testing_payments enable trigger testing_payments_guard;
    alter table public.testing_payments enable trigger testing_payments_log;
  end if;

  if not exists (select 1 from pg_attribute a
                  where a.attrelid = 'public.testing_private_payments'::regclass
                    and a.attname = 'school' and not a.attisdropped) then
    alter table public.testing_private_payments add column school text null;

    alter table public.testing_private_payments disable trigger testing_private_payments_guard;
    alter table public.testing_private_payments disable trigger testing_private_payments_log;
    update public.testing_private_payments x
       set school = p.location_code
      from public.testing_private p
     where p.id = x.private_id;
    alter table public.testing_private_payments enable trigger testing_private_payments_guard;
    alter table public.testing_private_payments enable trigger testing_private_payments_log;
  end if;

  if not exists (select 1 from pg_constraint c
                  where c.conrelid = 'public.testing_payments'::regclass
                    and c.conname = 'testing_payments_school_fk') then
    alter table public.testing_payments add constraint testing_payments_school_fk
      foreign key (school) references public.locations (code);
  end if;
  if not exists (select 1 from pg_constraint c
                  where c.conrelid = 'public.testing_private_payments'::regclass
                    and c.conname = 'testing_private_payments_school_fk') then
    alter table public.testing_private_payments add constraint testing_private_payments_school_fk
      foreign key (school) references public.locations (code);
  end if;
end
$$;

alter table public.testing_payments         alter column school set not null;
alter table public.testing_private_payments alter column school set not null;

-- 0014's rule for testing_private_payments: every column but the login ids
-- (0005 lists testing_payments' columns one by one: nothing added there)
grant select (school) on public.testing_private_payments to authenticated;

comment on column public.testing_payments.school is
  'The school whose desk took the money (v1.035): This device''s school, sent by Mark paid (testing_mark_paid_by p_school; empty = the event''s school). A reversal always has the school of the payment it reverses. Rows from before 0044: the event''s school. Not in the app''s column rights (0005 lists them one by one).';
comment on column public.testing_private_payments.school is
  'The school whose desk took the money (v1.035): This device''s school, sent by Mark paid (testing_private_mark_paid_by p_school; empty = the private testing''s school). A reversal always has the school of the payment it reverses; a moved-in payment the school of the event payment it came from. Rows from before 0044: the private testing''s school. Readable by authenticated (0014: every column but the login ids).';


-- ---------------------------------------------------------------------
-- 6. R1-01 - the two triggers that fill and check "school"
--   BEFORE INSERT on each payment table (the tables' guards refuse every
--   update anyway):
--   * a reversal: ALWAYS the school of the payment it reverses (the
--     chain rule). Sent empty -> filled; sent a DIFFERENT school ->
--     refused (check rule "..._school_chain"; the functions answer
--     invalid).
--   * a payment sent empty: the event's school (event payments); the
--     school of the event payment it was moved from, else the private
--     testing's school (private payments). This is what the old 2-input
--     Mark paid (until 0035) and any older code get.
--   The trigger is named "..._school", so it runs after the guard
--   ("..._guard" < "..._school"), which has already checked that a
--   reversal undoes a real payment of the same registration / private
--   testing. Not security definer; nobody may call them.
-- ---------------------------------------------------------------------
create or replace function public.testing_payments_set_school()
returns trigger
language plpgsql
set search_path = ''
as $$
declare
  v_school text;
begin
  if new.kind = 'reversal' then
    select p.school into v_school from public.testing_payments p where p.id = new.reverses_payment_id;
    if new.school is null then
      new.school := v_school;
    elsif new.school is distinct from v_school then
      raise exception using
        errcode    = '23514',
        constraint = 'testing_payments_school_chain',
        message    = 'a reversal must have the school of the payment it reverses';
    end if;
  elsif new.school is null then
    select e.location_code into new.school
      from public.testing_registrations r
      join public.testing_events e on e.id = r.event_id
     where r.id = new.registration_id;
  end if;
  return new;
end;
$$;

revoke execute on function public.testing_payments_set_school() from public, anon, authenticated, service_role;

drop trigger if exists testing_payments_school on public.testing_payments;
create trigger testing_payments_school
  before insert on public.testing_payments
  for each row execute function public.testing_payments_set_school();

create or replace function public.testing_private_payments_set_school()
returns trigger
language plpgsql
set search_path = ''
as $$
declare
  v_school text;
begin
  if new.kind = 'reversal' then
    select x.school into v_school from public.testing_private_payments x where x.id = new.reverses_payment_id;
    if new.school is null then
      new.school := v_school;
    elsif new.school is distinct from v_school then
      raise exception using
        errcode    = '23514',
        constraint = 'testing_private_payments_school_chain',
        message    = 'a reversal must have the school of the payment it reverses';
    end if;
  elsif new.school is null then
    if new.moved_from_payment_id is not null then
      select p.school into new.school from public.testing_payments p where p.id = new.moved_from_payment_id;
    end if;
    if new.school is null then
      select p.location_code into new.school from public.testing_private p where p.id = new.private_id;
    end if;
  end if;
  return new;
end;
$$;

revoke execute on function public.testing_private_payments_set_school() from public, anon, authenticated, service_role;

drop trigger if exists testing_private_payments_school on public.testing_private_payments;
create trigger testing_private_payments_school
  before insert on public.testing_private_payments
  for each row execute function public.testing_private_payments_set_school();


-- ---------------------------------------------------------------------
-- 7. The read views again - 0005's testing_roster and 0014's
--    testing_private_list, word for word, plus ONE column at the end:
--    paying_by_on_form. Same options (security_invoker = true: they read
--    the tables with the CALLER's rights, so RLS and the column rights
--    still apply - section 8 adds the column rights) and the same grant
--    ("create or replace view" keeps a view's rights; stated again below
--    anyway, exactly as 0005 / 0014 have them).
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
       lp.recorded_at as last_payment_recorded_at,
       r.paying_by_on_form                                  -- 0044: the family form's choice (last column)
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
  'Roster rows: registration + class/belt from the event copy + payment state + the family form''s way to pay (0044). No signature, no submission id, no login ids. Runs with the caller''s rights.';

revoke all on table public.testing_roster from public, anon, authenticated, service_role;
grant select on public.testing_roster to authenticated;

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
       greatest(p.private_cents - greatest(coalesce(t.net, 0), 0), 0) as amount_due_cents,
       p.paying_by_on_form                                  -- 0044: the family form's choice (last column)
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
  'Private testing rows + payment state + what is still owed (computed inline) + the family form''s way to pay of a moved one (0044). No login ids. Runs with the caller''s rights.';

revoke all on table public.testing_private_list from public, anon, authenticated, service_role;
grant select on public.testing_private_list to authenticated;


-- ---------------------------------------------------------------------
-- 8. Column rights for paying_by_on_form (the views above run with the
--    caller's rights, so the app needs them on the tables too). No
--    personal data: only cash / check / card. Nothing for anon,
--    service_role or testing_registrar.
-- ---------------------------------------------------------------------
grant select (paying_by_on_form) on public.testing_registrations to authenticated;
grant select (paying_by_on_form) on public.testing_private to authenticated;


-- ---------------------------------------------------------------------
-- 9. R1-01 - Mark paid takes This device's school (new LAST input with a
--    default). The old 4-input versions go first: two versions side by
--    side would make every 4-input call "ambiguous". On a re-run there is
--    no 4-input version, so these two lines do nothing.
-- ---------------------------------------------------------------------
drop function if exists public.testing_mark_paid_by(uuid, integer, text, integer);
drop function if exists public.testing_private_mark_paid_by(uuid, integer, text, integer);

-- 9a. testing_mark_paid_by(p_registration_id, p_expected_version,
--       p_method, p_expected_cents, p_school default null)   S
-- (0030's 3a word for word, except the lines marked "0044".)
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
--   (0044) p_school  the school whose desk takes the money (This device,
--                    v1.035). Left out, null or blank = the event's
--                    school (what the live app's 4-input call gets). A
--                    school not in public.locations ->
--                    {"status":"invalid","field":"school"}.
--   the payment's method = p_method (Finance's Cash / Check / Card totals
--                    read only this).
--   "Paying by"      if p_method is not the registration's paying_by,
--                    paying_by becomes p_method too (Q2), in the same
--                    batch (logged as 'mark_paid'), and the payment
--                    remembers the old value (paying_by_before) for Undo.
-- Refused, in this order: no_access; invalid (a missing argument, a bad
-- method, a negative expected amount, then a school that doesn't exist);
-- not_found; stale (the version moved - also a double click); withdrawn;
-- already_paid (net paid > 0); price_changed. The registration's version
-- goes up. Last step: the signature clean-up (0005 12a), as the old
-- function.
-- Ok: {"status":"ok","payment_id":...,"amount_cents":n,"method":"card",
--      "paid_on":"YYYY-MM-DD","paying_by":"card","version":n}  (0030's
--      answer, unchanged)
create or replace function public.testing_mark_paid_by(
  p_registration_id  uuid,
  p_expected_version integer,
  p_method           text,
  p_expected_cents   integer,
  p_school           text default null   -- 0044
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
  v_school     text;   -- 0044: the desk's school (empty = the event's)
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
    -- 0044: a school that was sent must exist
    v_school := nullif(btrim(p_school), '');
    if v_school is not null and not exists (select 1 from public.locations l where l.code = v_school) then
      return jsonb_build_object('status', 'invalid', 'field', 'school');
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

    -- 0044: no school sent = the event's school (as before 0044)
    if v_school is null then
      select e.location_code into v_school from public.testing_events e where e.id = v_r.event_id;
    end if;

    -- a different way than "Paying by": remember the old value (Q2)
    v_before := case when p_method <> v_r.paying_by then v_r.paying_by end;

    perform set_config('tkd.action', 'mark_paid', true);
    perform set_config('tkd.batch_id', gen_random_uuid()::text, true);

    insert into public.testing_payments
      (registration_id, kind, amount_cents, method, paid_on, recorded_at, recorded_by, recorded_by_name,
       paying_by_before, school)   -- 0044: + school
    values
      (p_registration_id, 'payment', v_amount, p_method, v_today, now(), auth.uid(),
       public.change_log_actor_name(), v_before, v_school)   -- 0044: + school
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

revoke execute on function public.testing_mark_paid_by(uuid, integer, text, integer, text) from public, anon, authenticated, service_role;
grant  execute on function public.testing_mark_paid_by(uuid, integer, text, integer, text) to authenticated;

-- 9b. testing_private_mark_paid_by(p_private_id, p_expected_version,
--       p_method, p_expected_cents, p_school default null)   S
-- (0030's 3b word for word, except the lines marked "0044".)
-- 0014's testing_private_mark_paid (8e), plus the way to pay, exactly as
-- 3a: the amount is what is still OWED (the full private price, or the
-- rest after a part payment - a "top-up"); p_expected_cents must equal it
-- (else price_changed {amount_cents}); the payment's method = p_method;
-- a different way than "Paying by" changes paying_by too (logged as
-- 'private_mark_paid') and the payment remembers the old value.
-- (0044) p_school: the desk's school, as 9a; empty = the private
-- testing's own school.
-- Refused, in this order: no_access; invalid (also a school that doesn't
-- exist: {"status":"invalid","field":"school"}); not_found; stale;
-- cancelled; already_paid (nothing owed, also a $0 price);
-- price_changed. The version goes up.
-- Ok: {"status":"ok","payment_id":...,"amount_cents":n,"method":"card",
--      "paid_on":"YYYY-MM-DD","paying_by":"card","version":n}
create or replace function public.testing_private_mark_paid_by(
  p_private_id       uuid,
  p_expected_version integer,
  p_method           text,
  p_expected_cents   integer,
  p_school           text default null   -- 0044
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
  v_school     text;   -- 0044: the desk's school (empty = the private testing's)
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
    -- 0044: a school that was sent must exist
    v_school := nullif(btrim(p_school), '');
    if v_school is not null and not exists (select 1 from public.locations l where l.code = v_school) then
      return jsonb_build_object('status', 'invalid', 'field', 'school');
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
    v_school := coalesce(v_school, v_p.location_code);   -- 0044: empty = the private testing's school

    perform set_config('tkd.action', 'private_mark_paid', true);
    perform set_config('tkd.batch_id', gen_random_uuid()::text, true);

    insert into public.testing_private_payments
      (private_id, kind, amount_cents, method, paid_on, recorded_at, recorded_by, recorded_by_name,
       paying_by_before, school)   -- 0044: + school
    values
      (p_private_id, 'payment', v_amount, p_method, v_today, now(), auth.uid(),
       public.change_log_actor_name(), v_before, v_school)   -- 0044: + school
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

revoke execute on function public.testing_private_mark_paid_by(uuid, integer, text, integer, text) from public, anon, authenticated, service_role;
grant  execute on function public.testing_private_mark_paid_by(uuid, integer, text, integer, text) to authenticated;


-- ---------------------------------------------------------------------
-- 10. R1-01 - Undo payment copies the school - REPLACED (same names,
--     arguments, rights, statuses and answers). Every line is 0030's
--     (section 4) except the ones marked "0044".
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
-- (0044) The reversal has the school of the payment it undoes (v1.035,
-- the chain rule).
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
       reverses_payment_id, school)   -- 0044: + school
    values
      (v_p.registration_id, 'reversal', -v_p.amount_cents, v_p.method, public.testing_today(), now(), auth.uid(),
       public.change_log_actor_name(), v_p.id, v_p.school);   -- 0044: the undone payment's school

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
-- (0044) The reversal has the school of the payment it undoes.
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
       reverses_payment_id, school)   -- 0044: + school
    values
      (v_pay.private_id, 'reversal', -v_pay.amount_cents, v_pay.method, public.testing_today(), now(), auth.uid(),
       public.change_log_actor_name(), v_pay.id, v_pay.school);   -- 0044: the undone payment's school

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
-- 11. R1-01 - Edit payment copies the school - REPLACED (same names,
--     arguments, rights, statuses and answers). Every line is 0030's
--     (section 4b, whose "Paying by follows the edit" rule stays) except
--     the ones marked "0044": the reversal AND the new payment both have
--     the school of the payment being edited. Edit payment corrects the
--     amount, the way or the day - never the desk (v1.035: money at the
--     wrong school is undone and recorded again on the right device).
-- ---------------------------------------------------------------------

-- 14l. testing_edit_payment(p_payment_id, p_method, p_amount_cents,
--        p_paid_on)   A
-- Edit payment = a reversal of the old payment + a new payment with the
-- new method / amount (1 cent to $1,000) / date (not in the future).
-- Already reversed -> stale; a reversal can't be edited (invalid).
-- (0030) "Paying by" follows the edit - the rule of 0030's section 4b:
-- a changed way makes paying_by the new way (same update and batch,
-- logged as 'edit_payment'); the new payment keeps the family's choice
-- in paying_by_before so Undo payment can put it back.
-- (0044) Both new rows have the edited payment's school.
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
       reverses_payment_id, school)   -- 0044: + school
    values
      (v_p.registration_id, 'reversal', -v_p.amount_cents, v_p.method, public.testing_today(), now(), auth.uid(),
       public.change_log_actor_name(), v_p.id, v_p.school);   -- 0044: the edited payment's school

    insert into public.testing_payments
      (registration_id, kind, amount_cents, method, paid_on, recorded_at, recorded_by, recorded_by_name,
       paying_by_before, school)   -- 0030, 0044: + school
    values
      (v_p.registration_id, 'payment', p_amount_cents, p_method, p_paid_on, now(), auth.uid(),
       public.change_log_actor_name(), v_before, v_p.school)   -- 0030, 0044: the edited payment's school
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
-- (0044) Both new rows have the edited payment's school.
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
       reverses_payment_id, school)   -- 0044: + school
    values
      (v_pay.private_id, 'reversal', -v_pay.amount_cents, v_pay.method, public.testing_today(), now(), auth.uid(),
       public.change_log_actor_name(), v_pay.id, v_pay.school);   -- 0044: the edited payment's school

    insert into public.testing_private_payments
      (private_id, kind, amount_cents, method, paid_on, recorded_at, recorded_by, recorded_by_name,
       paying_by_before, school)   -- 0030, 0044: + school
    values
      (v_pay.private_id, 'payment', p_amount_cents, p_method, p_paid_on, now(), auth.uid(),
       public.change_log_actor_name(), v_before, v_pay.school)   -- 0030, 0044: the edited payment's school
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
-- 12. Move to private and its Undo copy the school - REPLACED (same
--     names, arguments, rights, statuses and answers). Every line is
--     0030's (section 4c) except the ones marked "0044". The family
--     form's choice (M-01) moves by itself: the private testing's
--     trigger (section 4) copies the registration's paying_by_on_form,
--     and the registration keeps its own, so Undo move needs nothing for
--     it.
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
-- testing puts it back the same way.
-- (0044) the event reversal and the private payment both keep the event
-- payment's school (a transfer: no school's counted day changes, v0.407).
-- The private testing gets the registration's paying_by_on_form through
-- its trigger (section 4).
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
    for v_pay in select p.id, p.amount_cents, p.method, p.paid_on, p.recorded_at, p.school   -- 0044: + school
                   from public.testing_payments p
                  where p.registration_id = p_registration_id
                    and p.kind = 'payment'
                    and not exists (select 1 from public.testing_payments x where x.reverses_payment_id = p.id)
                  order by p.recorded_at, p.id loop
      insert into public.testing_payments
        (registration_id, kind, amount_cents, method, paid_on, recorded_at, recorded_by, recorded_by_name,
         reverses_payment_id, school)   -- 0044: + school
      values
        (p_registration_id, 'reversal', -v_pay.amount_cents, v_pay.method, v_pay.paid_on, now(), auth.uid(),
         public.change_log_actor_name(), v_pay.id, v_pay.school);   -- 0044: the event payment's school
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
       moved_from_payment_id, paying_by_before, school)   -- 0030: + paying_by_before; 0044: + school
    select v_private_id, 'payment', p.amount_cents, p.method, p.paid_on,
           p.recorded_at,   -- the ORIGINAL recording time, so "the most recent payment" stays the same one
           auth.uid(), public.change_log_actor_name(), p.id,
           p.paying_by_before,   -- 0030: the family's choice moves with the payment
           p.school              -- 0044: the desk that took it stays the same
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
-- payment's paying_by_before back.
-- (0044) ... and its school. The registration's paying_by_on_form never
-- left it (the move only withdrew the row), so it is back as it was.
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
       paying_by_before, school)   -- 0030, 0044: + school
    select v_r.id, 'payment', x.amount_cents, x.method, x.paid_on,
           x.recorded_at,   -- the original recording time again (the order is kept)
           null, public.change_log_actor_name(),
           x.paying_by_before,   -- 0030: the family's choice comes back with the payment
           x.school              -- 0044: the desk that took it stays the same
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
-- 13. R2-02 - Edit event's Undo in one call (NEW)
-- ---------------------------------------------------------------------

-- 14x. testing_undo_event_edit(p_event_id, p_expected_version, p_name,
--        p_testing_date, p_classes, p_auto_close_on, p_note, p_open)   A
-- "Event saved · Undo" of Edit event, done by the database in ONE
-- transaction (model: 0032's bb_undo_cycle_edit):
--   p_expected_version  the version the save returned
--   p_name ... p_note   the old values, exactly as testing_update_event
--                       (0010 14b) takes them
--   p_open              the registration switch to put back, or NULL
--                       when the save didn't change it
-- Order of the checks:
--   no data access -> no_access; not an admin -> not_allowed (Edit event
--   is admin only); no id / version -> invalid;
--   lock the school, then the event (for update) - the same locks, in the
--   same order, as testing_update_event and testing_set_registration;
--   no such event -> not_found; version moved -> stale (nothing written).
-- Then, in an inner block:
--   testing_update_event(id, version, the old values), and its new
--   version is used next; then, when p_open is not null,
--   testing_set_registration(id, that version, p_open).
--   Either answer not ok -> that answer is kept, the inner block is
--   undone (so details that went through are put back too), and the kept
--   answer is returned as it is (stale, invalid, has_results, not_empty,
--   duplicate_name, finished, not_allowed, ... - their own rules,
--   unchanged).
-- Every rule, log row and refusal of the two functions still applies: it
-- writes only through them, and no history row of its own (an Undo that
-- goes through leaves exactly the rows those two write; a refused one
-- leaves none).
-- Its own new name, not an extra input on testing_update_event: the live
-- app keeps calling the two functions until the new app is deployed.
-- Ok: {"status":"ok","version":n,"state":"open"|...}  (the event's new
-- version and its registration state, as testing_set_registration says)
create or replace function public.testing_undo_event_edit(
  p_event_id         uuid,
  p_expected_version integer,
  p_name             text,
  p_testing_date     date,
  p_classes          jsonb,
  p_auto_close_on    date,
  p_note             text,
  p_open             boolean
)
returns jsonb
language plpgsql
volatile
security definer
set search_path = ''
as $$
declare
  v_loc     text;
  v_e       public.testing_events;
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

    -- the school, then the event - as both inner functions lock them
    select e.location_code into v_loc from public.testing_events e where e.id = p_event_id;
    if not found then
      return jsonb_build_object('status', 'not_found');
    end if;
    perform 1 from public.locations l where l.code = v_loc for no key update;
    select * into v_e from public.testing_events e where e.id = p_event_id for update;
    if not found then
      return jsonb_build_object('status', 'not_found');
    end if;
    if v_e.version <> p_expected_version then
      return jsonb_build_object('status', 'stale');
    end if;

    v_version := p_expected_version;
    begin
      v_r := public.testing_update_event(p_event_id, v_version, p_name, p_testing_date, p_classes, p_auto_close_on, p_note);
      if v_r ->> 'status' is distinct from 'ok' then
        v_kept := v_r;
        raise exception using errcode = 'CBU44', message = 'testing_undo_event_edit: the details were refused';
      end if;
      v_version := (v_r ->> 'version')::integer;
      if p_open is not null then
        v_r := public.testing_set_registration(p_event_id, v_version, p_open);
        if v_r ->> 'status' is distinct from 'ok' then
          v_kept := v_r;
          raise exception using errcode = 'CBU44', message = 'testing_undo_event_edit: the switch was refused';
        end if;
        v_version := (v_r ->> 'version')::integer;
      end if;
    exception
      -- only our own signal: everything this inner block wrote is undone,
      -- and the refusal is answered as it came
      when sqlstate 'CBU44' then
        return v_kept;
    end;

    select * into v_e from public.testing_events e where e.id = p_event_id;
    return jsonb_build_object('status', 'ok', 'version', v_version,
                              'state', public.testing_event_state(v_e, public.testing_today()));
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

revoke execute on function public.testing_undo_event_edit(uuid, integer, text, date, jsonb, date, text, boolean) from public, anon, authenticated, service_role;
grant  execute on function public.testing_undo_event_edit(uuid, integer, text, date, jsonb, date, text, boolean) to authenticated;


commit;

-- End of 0044_color_belt_rolling_check.sql
