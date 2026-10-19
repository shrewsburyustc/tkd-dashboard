-- =====================================================================
-- 0011_finance.sql
-- ---------------------------------------------------------------------
-- WHAT THIS FILE IS
--   The database part of the Finance section: the Daily report, Close the
--   day, History, Export and the reminder settings. Build contract:
--   docs/Dashboard Docs/Build contracts/CONTRACT-0011.md, section 1. It
--   runs after 0001-0006 and 0010 and changes NONE of their objects,
--   grants, rules or tests: it only adds new finance_* objects.
--
-- WHY IT EXISTS
--   Families pay for Color Belt testing (0005, testing_payments) and Star
--   testing (0006, star_payments) at the desk. Finance READS those
--   payments (it never changes one), adds them up per school and school
--   day, and lets staff "close the day": type what is in the drawer (cash,
--   number + total of checks, the card machine total) and record who
--   checked it. Admins can look at any day, see a month's History, reopen
--   a day, export a date range and set the Home reminder times.
--
-- WHAT IT ADDS
--   * 5 tables:
--       finance_day_closings       one row per close / undo / reopen of a
--                                  school's day (append-only)
--       finance_day_closing_items  the exact items each close counted (a
--                                  snapshot, append-only), so ANY later
--                                  change shows as "Changed after closing"
--       finance_settings           one row: reminder On / Off + a version
--       finance_reminder_times     a time (or Off) per school per weekday
--       finance_exports            one row per CSV export (append-only)
--   * internal helpers nobody in the app can call (section 3): they follow
--     every payment through its corrections ("chains", contract 1.3) and
--     add up a day
--   * 14 functions the app calls (section 5), all "security definer",
--     answering {"status": ...}
--
-- HOW TO RUN IT
--   Supabase dashboard -> SQL Editor -> New query -> paste this WHOLE file
--   -> Run. It starts with "begin;" and ends with "commit;", so it is one
--   transaction: if any statement fails, nothing is kept.
--   Supabase will warn about DESTRUCTIVE OPERATIONS. That is expected: the
--   words appear in "drop trigger if exists" lines that make re-running
--   safe and inside guards that REFUSE removals. Nothing is removed. Confirm.
--   (Claude's Supabase connection refuses SQL containing those words, which
--   is why this file is pasted by hand.)
--   Safe to run again: "create table if not exists", "create or replace
--   function", triggers replaced with "drop trigger if exists" + create,
--   seeds that never overwrite ("on conflict do nothing").
--   UPDATE 2026-10-19 (speed): the first version of this file (pasted
--   into production 2026-10-19) built the payment chains with one big SQL
--   query that joined every payment with every other; on long date ranges
--   it took minutes. This version builds them owner by owner (section 3a),
--   adds two date indexes on the payment tables, and removes the old
--   finance_chain_steps(date, date). Pasting THIS file over the first
--   version is safe and is how production gets it: no table, row,
--   setting or reminder time is changed; only functions are replaced
--   (tested in run.mjs step 14b with the exact production copy).
--
-- WORDS USED BELOW
--   * "today" = the date in Massachusetts: public.testing_today() (0005).
--     "school time" = now() at time zone 'America/New_York'.
--   * "chain": one payment followed through its corrections. An EDIT is a
--     reversal of the old row + a new payment written in the same
--     transaction (same recorded_at, same person); an UNDO is a reversal
--     on its own. Contract 1.3 has the exact rules; section 3 below
--     follows them line by line.
--   * "item": one line of the Daily report. A chain gives one item per day
--     it touches (e.g. "Moved to Oct 3" on Oct 1 and the payment on Oct 3).
--   * "counting item": an item that adds to the totals (state counted,
--     edited or moved_in).
--   * "version", "stale", "lock", "security definer", search_path = '':
--     the same meaning as in 0003, 0005 and 0006 (read their headers).
--   * statuses: ok, no_access, not_allowed, not_found, stale, invalid,
--     note_required, nothing_to_close, already_closed, not_closed, too_late.
--
-- PRIVACY (handoff section 6, guidelines section 5)
--   No answer ever holds a date of birth, an email, a drawn signature or a
--   login id. Only TWO internal helpers read login ids at all
--   (finance_chain_steps: "was the undo made by the same person?";
--   finance_closing_is_mine: "did YOU close this day?") and both return
--   only yes/no facts or names, never the id itself. 0011_tests.sql checks
--   this from the catalog and from every answer.
-- =====================================================================

begin;


-- ---------------------------------------------------------------------
-- 1. Small rule helpers (used by the table rules below). Nobody in the
--    app can call them.
-- ---------------------------------------------------------------------

-- 1a. finance_reminder_time_is_valid(p_time) - a reminder time: 11:00 AM
-- to 11:00 PM on a 15-minute step (11:00, 11:15 ...), no seconds.
-- NULL -> false (the table allows NULL = Off separately).
create or replace function public.finance_reminder_time_is_valid(p_time time)
returns boolean
language sql
immutable
set search_path = ''
as $$
  select coalesce(p_time between time '11:00' and time '23:00'
                  and extract(minute from p_time)::integer % 15 = 0
                  and extract(second from p_time) = 0,
                  false);
$$;

revoke execute on function public.finance_reminder_time_is_valid(time) from public, anon, authenticated, service_role;

-- 1b. finance_date_ok(p_day) - a date the functions accept at all: not
-- NULL, a real date (not 'infinity' / '-infinity', which PostgreSQL allows
-- and which would break date arithmetic) and not before 2020-01-01 (no
-- payment is older; this also keeps absurd ranges out). The functions
-- also refuse days after today separately.
create or replace function public.finance_date_ok(p_day date)
returns boolean
language sql
immutable
set search_path = ''
as $$
  select coalesce(isfinite(p_day) and p_day >= date '2020-01-01', false);
$$;

revoke execute on function public.finance_date_ok(date) from public, anon, authenticated, service_role;


-- ---------------------------------------------------------------------
-- 2. Tables
-- ---------------------------------------------------------------------

-- 2a. finance_day_closings - one row per event in a day's life:
--   kind 'close'  : staff / an admin closed the day. Holds what was
--                   counted (cash, checks, card), what the server
--                   EXPECTED at that moment (a snapshot) and the note.
--   kind 'undo'   : the closer took it back within 10 seconds (toast).
--   kind 'reopen' : an admin reopened the day.
--   reverses_closing_id: for undo / reopen, the close it ends (unique, so
--   a close is ended at most once). A school's day is CLOSED while it has
--   a close row that nothing points at.
--   recorded_by: the login id (auth.uid(), filled by the default) - never
--   returned by any function; used only for "is this YOUR close?" (5f).
--   Cash may be negative (down to -$100,000) only when the expected cash
--   was negative (a day with more cash refunds than cash payments, v0.209).
create table if not exists public.finance_day_closings (
  id                    uuid        not null default gen_random_uuid(),
  location_code         text        not null,
  day                   date        not null,
  kind                  text        not null,
  reverses_closing_id   uuid        null,
  cash_counted_cents    integer     null,
  checks_counted        integer     null,
  checks_counted_cents  integer     null,
  card_counted_cents    integer     null,
  expected_count        integer     null,
  expected_cash_cents   integer     null,
  expected_checks       integer     null,
  expected_checks_cents integer     null,
  expected_card_cents   integer     null,
  note                  text        null,
  recorded_at           timestamptz not null default now(),
  recorded_by           uuid        null default auth.uid(),   -- login id; no foreign key on purpose (as 0003)
  recorded_by_name      text        not null,

  constraint finance_day_closings_pkey primary key (id),
  constraint finance_day_closings_location_fk
    foreign key (location_code) references public.locations (code),
  constraint finance_day_closings_reverses_fk
    foreign key (reverses_closing_id) references public.finance_day_closings (id),
  constraint finance_day_closings_reverses_key unique (reverses_closing_id),
  -- a close has every count and every expected figure; an undo / reopen
  -- points at a close and has none of them (and no note)
  constraint finance_day_closings_kind_check
    check ((kind = 'close' and reverses_closing_id is null
            and num_nulls(cash_counted_cents, checks_counted, checks_counted_cents, card_counted_cents,
                          expected_count, expected_cash_cents, expected_checks, expected_checks_cents,
                          expected_card_cents) = 0)
           or (kind in ('undo', 'reopen') and reverses_closing_id is not null
               and num_nonnulls(cash_counted_cents, checks_counted, checks_counted_cents, card_counted_cents,
                                expected_count, expected_cash_cents, expected_checks, expected_checks_cents,
                                expected_card_cents, note) = 0)),
  constraint finance_day_closings_counts_check
    check ((cash_counted_cents is null or cash_counted_cents between -10000000 and 10000000)
           and (cash_counted_cents is null or cash_counted_cents >= 0 or expected_cash_cents < 0)
           and (checks_counted is null or checks_counted between 0 and 500)
           and (checks_counted_cents is null or checks_counted_cents between 0 and 10000000)
           and (card_counted_cents is null or card_counted_cents between 0 and 10000000)
           and (expected_count is null or expected_count >= 0)
           and (expected_checks is null or expected_checks >= 0)
           and (expected_checks_cents is null or expected_checks_cents >= 0)
           and (expected_card_cents is null or expected_card_cents >= 0)),
  -- the note: up to 500 characters, tidied like 0005's notes (1b there)
  constraint finance_day_closings_note_check
    check (note is null
           or coalesce(char_length(note) <= 500
                       and note = public.testing_normalize_note(note)
                       and public.testing_note_is_valid(note), false)),
  constraint finance_day_closings_name_check check (char_length(recorded_by_name) between 1 and 200)
);

create index if not exists finance_day_closings_location_day_idx
  on public.finance_day_closings (location_code, day);

comment on table public.finance_day_closings is
  'Close / undo / reopen of a school''s day (Finance). Append-only. recorded_by (a login id) is never returned by any function.';

-- 2b. finance_day_closing_items - the snapshot of what a close counted:
-- one row per counting item of that school's day at that moment. Written
-- in the SAME transaction as the close. chain_id = the chain's first
-- payment row (the report's payment_id); row_id = the row it showed.
-- No foreign key to the payments on purpose: a removed student or event
-- removes their payments, and the snapshot must still remember them (that
-- is exactly how "Changed after closing" notices it).
create table if not exists public.finance_day_closing_items (
  id            uuid    not null default gen_random_uuid(),
  closing_id    uuid    not null,
  location_code text    not null,
  source        text    not null,
  chain_id      uuid    not null,
  row_id        uuid    not null,
  kind          text    not null,
  method        text    not null,
  amount_cents  integer not null,

  constraint finance_day_closing_items_pkey primary key (id),
  constraint finance_day_closing_items_closing_fk
    foreign key (closing_id) references public.finance_day_closings (id),
  constraint finance_day_closing_items_location_fk
    foreign key (location_code) references public.locations (code),
  constraint finance_day_closing_items_chain_key unique (closing_id, source, chain_id),
  constraint finance_day_closing_items_source_check check (source in ('color_belt', 'star')),
  constraint finance_day_closing_items_kind_check check (kind in ('payment', 'refund')),
  constraint finance_day_closing_items_method_check check (method in ('cash', 'check', 'card')),
  constraint finance_day_closing_items_amount_check check (amount_cents between -100000 and 100000 and amount_cents <> 0)
);

create index if not exists finance_day_closing_items_closing_idx on public.finance_day_closing_items (closing_id);

comment on table public.finance_day_closing_items is
  'Snapshot of the items each close counted (Finance), for Changed after closing. Append-only.';

-- 2c. finance_settings - exactly ONE row (the fixed id below): is the Home
-- reminder on, and a version that goes up on every settings change (the
-- reminder times too), so two admins can't overwrite each other unseen.
-- location_code is always NULL: it is there only because the history
-- trigger (0003's change_log_write) reads that column from every row.
create table if not exists public.finance_settings (
  id              uuid        not null default '00000000-0000-4000-8000-000000000011',
  location_code   text        null,
  reminder_on     boolean     not null default false,
  version         integer     not null default 1,
  updated_at      timestamptz null,
  updated_by_name text        null,

  constraint finance_settings_pkey primary key (id),
  constraint finance_settings_singleton_check check (id = '00000000-0000-4000-8000-000000000011'),
  constraint finance_settings_location_check check (location_code is null),
  constraint finance_settings_version_check check (version >= 1)
);

comment on table public.finance_settings is
  'Finance settings: one row (reminder On / Off + version). Written only through finance_* functions.';

-- 2d. finance_reminder_times - one row per school per weekday (ISO: 1 =
-- Monday ... 7 = Sunday): the time the Home reminder starts, or NULL = Off.
-- Seeded Off for both schools (plan Q3); admins set them in Settings.
create table if not exists public.finance_reminder_times (
  id            uuid     not null default gen_random_uuid(),
  location_code text     not null,
  weekday       smallint not null,
  remind_at     time     null,

  constraint finance_reminder_times_pkey primary key (id),
  constraint finance_reminder_times_location_fk
    foreign key (location_code) references public.locations (code),
  constraint finance_reminder_times_location_weekday_key unique (location_code, weekday),
  constraint finance_reminder_times_weekday_check check (weekday between 1 and 7),
  constraint finance_reminder_times_time_check
    check (remind_at is null or public.finance_reminder_time_is_valid(remind_at))
);

comment on table public.finance_reminder_times is
  'Home reminder time per school per ISO weekday (NULL = Off). Written only through finance_* functions.';

-- 2e. finance_exports - one row per CSV export (who, when, school, range,
-- how many rows). downloaded_by (a login id, filled by the default) is
-- never returned. Append-only.
create table if not exists public.finance_exports (
  id                 uuid        not null default gen_random_uuid(),
  location_code      text        not null,
  from_day           date        not null,
  to_day             date        not null,
  row_count          integer     not null,
  downloaded_at      timestamptz not null default now(),
  downloaded_by      uuid        null default auth.uid(),   -- login id; no foreign key on purpose
  downloaded_by_name text        not null,

  constraint finance_exports_pkey primary key (id),
  constraint finance_exports_location_fk
    foreign key (location_code) references public.locations (code),
  constraint finance_exports_range_check check (from_day <= to_day),
  constraint finance_exports_row_count_check check (row_count >= 0)
);

comment on table public.finance_exports is
  'Log of every Finance CSV export. Append-only. downloaded_by (a login id) is never returned.';


-- ---------------------------------------------------------------------
-- 2f. Guard triggers
-- ---------------------------------------------------------------------

-- finance_append_only() - BEFORE UPDATE OR DELETE on the closings, the
-- closing items and the export log: always refused, even for the SQL
-- Editor's role (like 0006's star_downloads_guard). A mistake is fixed by
-- a NEW row (an undo or reopen), never by changing or removing one.
-- Limit (as 0005): the database owner could switch a trigger off on
-- purpose; it stops mistakes and the app, not a deliberate owner.
create or replace function public.finance_append_only()
returns trigger
language plpgsql
set search_path = ''
as $$
begin
  raise exception '% is append-only', tg_table_name;
end;
$$;

revoke execute on function public.finance_append_only() from public, anon, authenticated, service_role;

-- finance_keep_rows() - BEFORE DELETE on the settings row and the 14
-- reminder-time rows: they are never removed (the functions expect them).
create or replace function public.finance_keep_rows()
returns trigger
language plpgsql
set search_path = ''
as $$
begin
  raise exception '% rows can''t be removed (change them instead)', tg_table_name;
end;
$$;

revoke execute on function public.finance_keep_rows() from public, anon, authenticated, service_role;

-- finance_day_closings_guard() - BEFORE INSERT on the closings (the
-- backstop behind the functions' own checks, contract 1.2):
--   * the day is today or earlier
--   * a 'close' is refused while that school's day is already closed
--   * an 'undo' / 'reopen' must point at a close of the SAME school and
--     day that hasn't been ended yet (the table rule already makes sure
--     it carries no counts, expected figures or note)
-- Errors use errcode 23514 (check_violation) with a constraint name, so
-- they look like any other broken table rule.
create or replace function public.finance_day_closings_guard()
returns trigger
language plpgsql
set search_path = ''
as $$
declare
  v_target public.finance_day_closings;
begin
  if new.day > public.testing_today() then
    raise exception using
      errcode    = '23514',
      constraint = 'finance_day_closings_day_check',
      message    = 'a day can''t be closed before it has started';
  end if;

  if new.kind = 'close' then
    if exists (select 1 from public.finance_day_closings c
                where c.location_code = new.location_code and c.day = new.day and c.kind = 'close'
                  and not exists (select 1 from public.finance_day_closings x where x.reverses_closing_id = c.id)) then
      raise exception using
        errcode    = '23514',
        constraint = 'finance_day_closings_already_closed',
        message    = 'that school''s day is already closed';
    end if;
  else
    select * into v_target from public.finance_day_closings c where c.id = new.reverses_closing_id;
    if not found
       or v_target.kind <> 'close'
       or v_target.location_code <> new.location_code
       or v_target.day <> new.day
       or exists (select 1 from public.finance_day_closings x where x.reverses_closing_id = v_target.id) then
      raise exception using
        errcode    = '23514',
        constraint = 'finance_day_closings_reverse_check',
        message    = 'an undo or reopen must end an open close of the same school and day';
    end if;
  end if;
  return new;
end;
$$;

revoke execute on function public.finance_day_closings_guard() from public, anon, authenticated, service_role;

-- Attach the triggers ("drop trigger if exists" + create = replace).
drop trigger if exists finance_day_closings_guard on public.finance_day_closings;
create trigger finance_day_closings_guard
  before insert on public.finance_day_closings
  for each row execute function public.finance_day_closings_guard();

drop trigger if exists finance_day_closings_append_only on public.finance_day_closings;
create trigger finance_day_closings_append_only
  before update or delete on public.finance_day_closings
  for each row execute function public.finance_append_only();

drop trigger if exists finance_day_closing_items_append_only on public.finance_day_closing_items;
create trigger finance_day_closing_items_append_only
  before update or delete on public.finance_day_closing_items
  for each row execute function public.finance_append_only();

drop trigger if exists finance_exports_append_only on public.finance_exports;
create trigger finance_exports_append_only
  before update or delete on public.finance_exports
  for each row execute function public.finance_append_only();

drop trigger if exists finance_settings_keep_rows on public.finance_settings;
create trigger finance_settings_keep_rows
  before delete on public.finance_settings
  for each row execute function public.finance_keep_rows();

drop trigger if exists finance_reminder_times_keep_rows on public.finance_reminder_times;
create trigger finance_reminder_times_keep_rows
  before delete on public.finance_reminder_times
  for each row execute function public.finance_keep_rows();

-- History: 0003's change_log_write on every new table (each has "id" and
-- "location_code"; finance_settings.location_code is always NULL).
drop trigger if exists finance_day_closings_log on public.finance_day_closings;
create trigger finance_day_closings_log
  after insert or update or delete on public.finance_day_closings
  for each row execute function public.change_log_write();

drop trigger if exists finance_day_closing_items_log on public.finance_day_closing_items;
create trigger finance_day_closing_items_log
  after insert or update or delete on public.finance_day_closing_items
  for each row execute function public.change_log_write();

drop trigger if exists finance_settings_log on public.finance_settings;
create trigger finance_settings_log
  after insert or update or delete on public.finance_settings
  for each row execute function public.change_log_write();

drop trigger if exists finance_reminder_times_log on public.finance_reminder_times;
create trigger finance_reminder_times_log
  after insert or update or delete on public.finance_reminder_times
  for each row execute function public.change_log_write();

drop trigger if exists finance_exports_log on public.finance_exports;
create trigger finance_exports_log
  after insert or update or delete on public.finance_exports
  for each row execute function public.change_log_write();

-- No "empty the whole table" shortcut (it would skip the history), as 0003.
drop trigger if exists finance_day_closings_no_truncate on public.finance_day_closings;
create trigger finance_day_closings_no_truncate
  before truncate on public.finance_day_closings
  for each statement execute function public.testing_refuse_truncate();

drop trigger if exists finance_day_closing_items_no_truncate on public.finance_day_closing_items;
create trigger finance_day_closing_items_no_truncate
  before truncate on public.finance_day_closing_items
  for each statement execute function public.testing_refuse_truncate();

drop trigger if exists finance_settings_no_truncate on public.finance_settings;
create trigger finance_settings_no_truncate
  before truncate on public.finance_settings
  for each statement execute function public.testing_refuse_truncate();

drop trigger if exists finance_reminder_times_no_truncate on public.finance_reminder_times;
create trigger finance_reminder_times_no_truncate
  before truncate on public.finance_reminder_times
  for each statement execute function public.testing_refuse_truncate();

drop trigger if exists finance_exports_no_truncate on public.finance_exports;
create trigger finance_exports_no_truncate
  before truncate on public.finance_exports
  for each statement execute function public.testing_refuse_truncate();


-- ---------------------------------------------------------------------
-- 2g. The seed: the settings row (reminder Off) and 14 reminder times,
-- all Off (plan Q3). "on conflict do nothing" = only added when missing,
-- so re-running this file never changes what an admin set. Logged as
-- action 'finance_seed'.
-- ---------------------------------------------------------------------
select set_config('tkd.action', 'finance_seed', true);
select set_config('tkd.batch_id', gen_random_uuid()::text, true);

insert into public.finance_settings (id, location_code, reminder_on, version)
values ('00000000-0000-4000-8000-000000000011', null, false, 1)
on conflict (id) do nothing;

insert into public.finance_reminder_times (location_code, weekday, remind_at)
select l.code, d.n::smallint, null
  from public.locations l
 cross join generate_series(1, 7) as d(n)
on conflict (location_code, weekday) do nothing;

select set_config('tkd.action', '', true);
select set_config('tkd.batch_id', '', true);


-- ---------------------------------------------------------------------
-- 3. The money helpers (internal: nobody in the app can call them; only
--    the security-definer functions of section 5 use them)
-- ---------------------------------------------------------------------

-- 3-. Indexes and an earlier helper.
-- Finance looks payments up by their date (paid_on); these two indexes
-- make that fast on 0005's and 0006's payment tables (they only speed up
-- reading; nothing else changes). "if not exists": re-running adds nothing.
create index if not exists finance_testing_payments_paid_on_idx on public.testing_payments (paid_on);
create index if not exists finance_star_payments_paid_on_idx on public.star_payments (paid_on);

-- An earlier version of this file (applied 2026-10-19) built the chains in
-- one big SQL query, finance_chain_steps(date, date), which got very slow
-- on long date ranges. 3a below replaces it; the old one is removed so
-- nothing can use it by mistake (it has no rights and nothing calls it).
drop function if exists public.finance_chain_steps(date, date);

-- 3a. finance_chain_steps_core(p_from, p_to, p_source, p_owner) - every
-- chain, step by step. Contract 1.3, rules 1-4.
-- Which owners (registration / candidate):
--   * p_owner NULL: every owner with a payment or refund dated p_from ..
--     p_to. Chains are then built from ALL the rows of those owners -
--     never from rows filtered by date first. (An undo is dated the day it
--     is made, so a payment on Oct 1 undone on Oct 20 is still found as
--     undone when only Oct 1 is asked for.) Every day a chain shows on is
--     the paid_on of one of its own payment / refund rows, so picking
--     owners this way never misses an item in the range.
--   * p_owner set: just that one owner of source p_source (the payment
--     detail), whatever the dates.
-- One output row per payment / refund row of a chain:
--   step 0 = the chain's first row (chain_id = its id), step 1 = the new
--   row of the first edit, ... last_step = the final row.
--   edit_by_name / edit_on: for step > 0, who made that edit and on which
--   school date (the reversal's paid_on is the day the edit was made).
--   end_state: 'live' (the final row isn't reversed), 'undone', or
--   'hidden' (undone by the SAME login within 10 seconds of recording it,
--   with no edit in between - a mis-click; rule 4).
--   undo_*: the reversal that undid the chain (end_state undone / hidden).
-- HOW (why it is fast): ONE query reads the owners' rows sorted by owner,
-- then each owner's few rows (usually 1 to 4) are worked out in small
-- arrays. The work grows in step with the number of rows (5 years of
-- payments is about a second's work at most), instead of joining every
-- row with every other row.
-- Rows are output chain by chain, in step order (finance_chain_items
-- below relies on that order).
-- Reads login ids (recorded_by) for two comparisons only; never returns one.
create or replace function public.finance_chain_steps_core(p_from date, p_to date, p_source text, p_owner uuid)
returns table (
  source            text,
  chain_id          uuid,
  owner_id          uuid,
  step              integer,
  last_step         integer,
  row_id            uuid,
  kind              text,
  amount_cents      integer,
  method            text,
  paid_on           date,
  recorded_at       timestamptz,
  recorded_by_name  text,
  edit_by_name      text,
  edit_on           date,
  end_state         text,
  undo_by_name      text,
  undo_on           date,
  undo_at           timestamptz,
  undo_amount_cents integer,
  undo_method       text
)
language plpgsql
stable
set search_path = ''
as $$
#variable_conflict use_column
declare
  v_row    record;
  -- the current owner's rows, in recorded_at order (index 1 .. v_n)
  v_src    text;
  v_owner  uuid;
  v_n      integer := 0;
  a_id     uuid[];
  a_kind   text[];
  a_amount integer[];
  a_method text[];
  a_paid   date[];
  a_at     timestamptz[];
  a_by     uuid[];
  a_name   text[];
  a_target uuid[];
  -- worked out per owner
  a_revof  integer[];   -- a_revof[j]  = the reversal of row j (0 = none)
  a_new    integer[];   -- a_new[i]    = for reversal i, the new row of its edit (0 = a plain undo)
  a_isnew  boolean[];   -- a_isnew[k]  = row k is the new row of an edit
  a_steps  integer[];   -- one chain's rows, step by step
  a_edits  integer[];   -- a_edits[s]  = the reversal that led to step s (0 for step 0)
  v_i      integer;
  v_j      integer;
  v_k      integer;
  v_t      integer;
  v_cur    integer;
  v_ri     integer;
  v_last   integer;
  v_state  text;
begin
  for v_row in
    -- the owners' rows, both sources, grouped by owner, then in time
    -- order; a last "end" row (is_end = 1, sorted last by that NUMBER -
    -- never by text, whose order depends on the database's collation)
    -- makes the loop work out the final owner too
    select x.*
      from (select 0 as is_end, 'color_belt'::text as src, p.registration_id as owner, p.id, p.kind, p.amount_cents,
                   p.method, p.paid_on, p.recorded_at, p.recorded_by, p.recorded_by_name, p.reverses_payment_id
              from public.testing_payments p
             where p.registration_id in
                   (select q.registration_id from public.testing_payments q
                     where (p_owner is null and q.kind <> 'reversal' and q.paid_on between p_from and p_to)
                        or (p_source = 'color_belt' and q.registration_id = p_owner))
            union all
            select 0, 'star'::text, p.candidate_id, p.id, p.kind, p.amount_cents,
                   p.method, p.paid_on, p.recorded_at, p.recorded_by, p.recorded_by_name, p.reverses_payment_id
              from public.star_payments p
             where p.candidate_id in
                   (select q.candidate_id from public.star_payments q
                     where (p_owner is null and q.kind <> 'reversal' and q.paid_on between p_from and p_to)
                        or (p_source = 'star' and q.candidate_id = p_owner))
            union all
            select 1, null::text, null::uuid, null::uuid, null::text, null::integer,
                   null::text, null::date, null::timestamptz, null::uuid, null::text, null::uuid) as x
     -- only equal (src, owner) rows must come together; which owner comes
     -- first doesn't matter, so the text order of src is never relied on
     order by x.is_end, x.src, x.owner, x.recorded_at, x.id
  loop
    -- a new owner starts (or the end): work out the rows collected so far
    if v_n > 0 and (v_row.is_end = 1 or v_row.src is distinct from v_src or v_row.owner is distinct from v_owner) then
      a_revof := array_fill(0, array[v_n]);
      a_new   := array_fill(0, array[v_n]);
      a_isnew := array_fill(false, array[v_n]);

      -- each reversal: which row it reverses, and (rule 2) the new
      -- payment of its edit: a payment of the same owner written at the
      -- same moment by the same login (plain "=", so a missing login never
      -- matches). Only a reversed PAYMENT can have been edited (refunds
      -- can't be edited, 0006). On a tie the smallest id wins.
      for v_i in 1 .. v_n loop
        if a_kind[v_i] = 'reversal' then
          v_t := 0;
          for v_j in 1 .. v_n loop
            if a_id[v_j] = a_target[v_i] then v_t := v_j; end if;
          end loop;
          if v_t > 0 then
            a_revof[v_t] := v_i;
            if a_kind[v_t] = 'payment' then
              v_k := 0;
              for v_j in 1 .. v_n loop
                if a_kind[v_j] = 'payment' and v_j <> v_t
                   and a_at[v_j] = a_at[v_i] and a_by[v_j] = a_by[v_i]
                   and (v_k = 0 or a_id[v_j] < a_id[v_k]) then
                  v_k := v_j;
                end if;
              end loop;
              a_new[v_i] := v_k;
              if v_k > 0 then a_isnew[v_k] := true; end if;
            end if;
          end if;
        end if;
      end loop;

      -- rule 1: a chain starts at a payment or refund that isn't the new
      -- row of an edit; follow each edit to its new row (rules 2-3)
      for v_j in 1 .. v_n loop
        continue when a_kind[v_j] not in ('payment', 'refund') or a_isnew[v_j];
        a_steps := array[v_j];
        a_edits := array[0];
        v_cur := v_j;
        v_ri := 0;
        loop
          v_ri := a_revof[v_cur];
          exit when v_ri = 0;                                   -- live
          exit when a_new[v_ri] = 0;                            -- undone
          -- safety stop (a loop, or 50 edits): end the chain here as live,
          -- like the first version of this file did
          if a_new[v_ri] = any (a_steps) or cardinality(a_steps) >= 50 then
            v_ri := 0;
            exit;
          end if;
          a_steps := a_steps || a_new[v_ri];
          a_edits := a_edits || v_ri;
          v_cur := a_new[v_ri];
          v_ri := 0;
        end loop;
        v_last := cardinality(a_steps) - 1;
        v_state := case when v_ri = 0 then 'live'
                        -- rule 4: no edit, the same login (a missing login
                        -- never matches), at most 10 seconds later
                        when v_last = 0 and a_by[v_ri] = a_by[v_j]
                             and a_at[v_ri] - a_at[v_j] <= interval '10 seconds' then 'hidden'
                        else 'undone' end;
        for v_i in 1 .. cardinality(a_steps) loop
          v_k := a_steps[v_i];
          source            := v_src;
          chain_id          := a_id[v_j];
          owner_id          := v_owner;
          step              := v_i - 1;
          last_step         := v_last;
          row_id            := a_id[v_k];
          kind              := a_kind[v_k];
          amount_cents      := a_amount[v_k];
          method            := a_method[v_k];
          paid_on           := a_paid[v_k];
          recorded_at       := a_at[v_k];
          recorded_by_name  := a_name[v_k];
          edit_by_name      := case when a_edits[v_i] > 0 then a_name[a_edits[v_i]] end;
          edit_on           := case when a_edits[v_i] > 0 then a_paid[a_edits[v_i]] end;
          end_state         := v_state;
          undo_by_name      := case when v_ri > 0 then a_name[v_ri] end;
          undo_on           := case when v_ri > 0 then a_paid[v_ri] end;
          undo_at           := case when v_ri > 0 then a_at[v_ri] end;
          undo_amount_cents := case when v_ri > 0 then a_amount[v_ri] end;
          undo_method       := case when v_ri > 0 then a_method[v_ri] end;
          return next;
        end loop;
      end loop;
      v_n := 0;
    end if;

    exit when v_row.is_end = 1;

    -- collect this row
    if v_n = 0 then
      v_src := v_row.src;
      v_owner := v_row.owner;
      a_id := '{}'; a_kind := '{}'; a_amount := '{}'; a_method := '{}'; a_paid := '{}';
      a_at := '{}'; a_by := '{}'; a_name := '{}'; a_target := '{}';
    end if;
    v_n := v_n + 1;
    a_id[v_n]     := v_row.id;
    a_kind[v_n]   := v_row.kind;
    a_amount[v_n] := v_row.amount_cents;
    a_method[v_n] := v_row.method;
    a_paid[v_n]   := v_row.paid_on;
    a_at[v_n]     := v_row.recorded_at;
    a_by[v_n]     := v_row.recorded_by;
    a_name[v_n]   := v_row.recorded_by_name;
    a_target[v_n] := v_row.reverses_payment_id;
  end loop;
end;
$$;

revoke execute on function public.finance_chain_steps_core(date, date, text, uuid) from public, anon, authenticated, service_role;

-- 3a2. finance_chain_items(p_from, p_to, p_source, p_owner) - the report's
-- ITEMS of those chains (contract 1.3, rule 4), without names or school:
--   live chain, no edit   -> 'counted' on its day
--   live chain, edited    -> the final row on its day: 'edited' (same day
--                            as the first row) or 'moved_in'; every OTHER
--                            day of the chain gets 'moved_out' ("Moved to")
--   undone chain          -> 'undone' on every day of the chain
--   hidden chain          -> nothing at all
-- The row shown on a moved_out / undone day is the chain's first row of
-- that day. Works chain by chain over 3a's rows (same owners rule).
create or replace function public.finance_chain_items(p_from date, p_to date, p_source text, p_owner uuid)
returns table (
  source            text,
  chain_id          uuid,
  owner_id          uuid,
  day               date,
  row_id            uuid,
  kind              text,
  method            text,
  amount_cents      integer,
  recorded_at       timestamptz,
  recorded_by_name  text,
  state             text,
  was_amount_cents  integer,
  was_method        text,
  moved_to          date,
  moved_from        date,
  changed_by_name   text,
  changed_on        date,
  first_recorded_at timestamptz
)
language plpgsql
stable
set search_path = ''
as $$
#variable_conflict use_column
declare
  v_s      record;
  -- the current chain (index 1 = step 0), parallel lists
  v_n      integer := 0;
  c_paid   date[];
  c_row    uuid[];
  c_kind   text[];
  c_method text[];
  c_amount integer[];
  c_at     timestamptz[];
  c_name   text[];
  c_editby text[];
  c_editon date[];
  -- the chain's own facts (from its first row)
  v_src    text;
  v_chain  uuid;
  v_owner  uuid;
  v_end    text;
  v_undoby text;
  v_undoon date;
  v_i      integer;
  v_j      integer;
  v_seen   boolean;
begin
  for v_s in
    -- 3a's rows in the order 3a output them (chain by chain, step by
    -- step): "with ordinality" numbers them, and that number - not any
    -- text - decides the order. A last "end" row (is_end = 1) makes the
    -- loop work out the final chain too.
    select y.*
      from (select 0 as is_end, x.ordinality as ord, x.source, x.chain_id, x.owner_id, x.step, x.row_id, x.kind,
                   x.amount_cents, x.method, x.paid_on, x.recorded_at, x.recorded_by_name, x.edit_by_name, x.edit_on,
                   x.end_state, x.undo_by_name, x.undo_on
              from public.finance_chain_steps_core(p_from, p_to, p_source, p_owner) with ordinality as x
            union all
            select 1, null::bigint, null::text, null::uuid, null::uuid, 0, null::uuid, null::text,
                   null::integer, null::text, null::date, null::timestamptz, null::text, null::text, null::date,
                   null::text, null::text, null::date) as y
     order by y.is_end, y.ord
  loop
    if v_n > 0 and (v_s.is_end = 1 or v_s.step = 0) then
      if v_end = 'live' then
        -- the final row on its day
        source := v_src; chain_id := v_chain; owner_id := v_owner;
        day := c_paid[v_n]; row_id := c_row[v_n]; kind := c_kind[v_n]; method := c_method[v_n];
        amount_cents := c_amount[v_n]; recorded_at := c_at[v_n]; recorded_by_name := c_name[v_n];
        state := case when v_n = 1 then 'counted'
                      when c_paid[v_n] = c_paid[1] then 'edited'
                      else 'moved_in' end;
        was_amount_cents := case when v_n > 1 then c_amount[1] end;
        was_method := case when v_n > 1 then c_method[1] end;
        moved_to := null;
        moved_from := case when v_n > 1 and c_paid[v_n] <> c_paid[1] then c_paid[1] end;
        changed_by_name := c_editby[v_n]; changed_on := c_editon[v_n];
        first_recorded_at := c_at[1];
        return next;
      end if;
      if v_end in ('live', 'undone') then
        -- every other day the chain touched (live: moved_out), or every
        -- day (undone); the row shown is the chain's first row of that day
        for v_i in 1 .. v_n loop
          continue when v_end = 'live' and c_paid[v_i] = c_paid[v_n];
          v_seen := false;
          for v_j in 1 .. v_i - 1 loop
            if c_paid[v_j] = c_paid[v_i] then v_seen := true; end if;
          end loop;
          continue when v_seen;
          source := v_src; chain_id := v_chain; owner_id := v_owner;
          day := c_paid[v_i]; row_id := c_row[v_i]; kind := c_kind[v_i]; method := c_method[v_i];
          amount_cents := c_amount[v_i]; recorded_at := c_at[v_i]; recorded_by_name := c_name[v_i];
          was_amount_cents := null; was_method := null; moved_from := null;
          first_recorded_at := c_at[1];
          if v_end = 'live' then
            state := 'moved_out';
            moved_to := c_paid[v_n];
            changed_by_name := c_editby[v_n]; changed_on := c_editon[v_n];
          else
            state := 'undone';
            moved_to := null;
            changed_by_name := v_undoby; changed_on := v_undoon;
          end if;
          return next;
        end loop;
      end if;
      v_n := 0;
    end if;
    exit when v_s.is_end = 1;

    if v_n = 0 then
      v_src := v_s.source; v_chain := v_s.chain_id; v_owner := v_s.owner_id;
      v_end := v_s.end_state; v_undoby := v_s.undo_by_name; v_undoon := v_s.undo_on;
      c_paid := '{}'; c_row := '{}'; c_kind := '{}'; c_method := '{}'; c_amount := '{}';
      c_at := '{}'; c_name := '{}'; c_editby := '{}'; c_editon := '{}';
    end if;
    v_n := v_n + 1;
    c_paid[v_n] := v_s.paid_on;     c_row[v_n] := v_s.row_id;       c_kind[v_n] := v_s.kind;
    c_method[v_n] := v_s.method;    c_amount[v_n] := v_s.amount_cents;
    c_at[v_n] := v_s.recorded_at;   c_name[v_n] := v_s.recorded_by_name;
    c_editby[v_n] := v_s.edit_by_name; c_editon[v_n] := v_s.edit_on;
  end loop;
end;
$$;

revoke execute on function public.finance_chain_items(date, date, text, uuid) from public, anon, authenticated, service_role;

-- 3b. finance_money_rows_core(p_location_code, p_from, p_to, p_source,
-- p_owner) - the report's ITEMS with names and school (contract 1.3): one
-- row per displayed item of the school (NULL = both) on the days p_from ..
-- p_to (both NULL = every day; used with p_owner for the payment detail).
-- Filtering by school and day happens AFTER the chains are built (3a).
-- Color Belt's school = the event's school; Star's = the CANDIDATE's school
-- (v0.58). event_date: the testing date, or a private Star candidate's own
-- private testing day ("Star testing - private <date>"). Only names,
-- dates and the private flag are read from the people tables.
-- Extra columns after recorded_by_name are for the functions only
-- (row_id, counts = adds to the totals, the first row's time for "Added
-- after closing", the shown row's time for sorting, the event's name and
-- id for the payment detail).
create or replace function public.finance_money_rows_core(
  p_location_code text, p_from date, p_to date, p_source text, p_owner uuid)
returns table (
  source            text,
  payment_id        uuid,
  school            text,
  day               date,
  "time"            text,
  first_name        text,
  last_name         text,
  what              text,
  event_date        date,
  is_private        boolean,
  kind              text,
  method            text,
  amount_cents      integer,
  state             text,
  was_amount_cents  integer,
  was_method        text,
  moved_to          date,
  moved_from        date,
  changed_by_name   text,
  changed_on        date,
  recorded_by_name  text,
  row_id            uuid,
  counts            boolean,
  first_recorded_at timestamptz,
  row_recorded_at   timestamptz,
  event_name        text,
  event_id          uuid
)
language sql
stable
set search_path = ''
as $$
  select i.source, i.chain_id,
         coalesce(e.location_code, c.location_code),
         i.day,
         to_char(i.recorded_at at time zone 'America/New_York', 'HH24:MI'),
         coalesce(g.first_name, c.first_name), coalesce(g.last_name, c.last_name),
         i.source,
         case when i.source = 'color_belt' then e.testing_date else coalesce(c.private_on, se.testing_date) end,
         (i.source = 'star' and c.private_on is not null),
         i.kind, i.method, i.amount_cents, i.state,
         i.was_amount_cents, i.was_method, i.moved_to, i.moved_from,
         i.changed_by_name, i.changed_on, i.recorded_by_name,
         i.row_id, i.state in ('counted', 'edited', 'moved_in'), i.first_recorded_at, i.recorded_at,
         coalesce(e.name, se.name), coalesce(e.id, se.id)
    from public.finance_chain_items(p_from, p_to, p_source, p_owner) i
    left join public.testing_registrations g on i.source = 'color_belt' and g.id = i.owner_id
    left join public.testing_events e on e.id = g.event_id
    left join public.star_candidates c on i.source = 'star' and c.id = i.owner_id
    left join public.star_events se on se.id = c.event_id
   where (e.id is not null or se.id is not null)
     and (p_location_code is null or coalesce(e.location_code, c.location_code) = p_location_code)
     and (p_from is null or i.day >= p_from)
     and (p_to is null or i.day <= p_to);
$$;

revoke execute on function public.finance_money_rows_core(text, date, date, text, uuid) from public, anon, authenticated, service_role;

-- 3b2. finance_money_rows(p_location_code, p_from, p_to) - 3b for a school
-- (NULL = both) and a range of days: the contract's helper (1.3).
-- Not security definer, no grants: only the section 5 functions call it.
create or replace function public.finance_money_rows(p_location_code text, p_from date, p_to date)
returns table (
  source            text,
  payment_id        uuid,
  school            text,
  day               date,
  "time"            text,
  first_name        text,
  last_name         text,
  what              text,
  event_date        date,
  is_private        boolean,
  kind              text,
  method            text,
  amount_cents      integer,
  state             text,
  was_amount_cents  integer,
  was_method        text,
  moved_to          date,
  moved_from        date,
  changed_by_name   text,
  changed_on        date,
  recorded_by_name  text,
  row_id            uuid,
  counts            boolean,
  first_recorded_at timestamptz,
  row_recorded_at   timestamptz,
  event_name        text,
  event_id          uuid
)
language sql
stable
set search_path = ''
as $$
  select m.* from public.finance_money_rows_core(p_location_code, p_from, p_to, null, null) m;
$$;

revoke execute on function public.finance_money_rows(text, date, date) from public, anon, authenticated, service_role;

-- 3c. finance_figures(p_location_code, p_from, p_to) - one row per school
-- (NULL = both) per day in the range, empty days included:
--   item_count   counting items (payments AND refunds): "is there anything
--                to close / remind about?"
--   pay_count    counting PAYMENTS only (the "count" the screens show)
--   total_cents  everything counting added up (refunds are negative) = net
--   in_cents     counting PAYMENTS only (money in)
--   cash_* / check_* / card_*  counting PAYMENTS by method (count, cents)
--   refund_*     counting refunds: count, cents (negative), cash / check part
--   exp_cash_cents  what the drawer should hold in cash = cash payments +
--                   cash refunds (may be negative, v0.209). The expected
--                   checks are check_count / check_cents (payments only - a
--                   check refund is the school's own check), the expected
--                   card total is card_cents.
--   fingerprint  md5 of the day's shown items, "row_id|amount|method|state"
--                sorted and joined with commas (empty day: md5 of '').
--                finance_close_day refuses a close when it changed.
-- It works on a JSON COPY of the items (3c2 below makes one): a function
-- that needs the figures AND the items (Close the day, History) builds
-- the items ONCE and works everything out from that one copy, so the
-- figures and the items can never come from two different moments.
create or replace function public.finance_figures_from(p_items jsonb, p_location_code text, p_from date, p_to date)
returns table (
  school             text,
  day                date,
  item_count         integer,
  pay_count          integer,
  total_cents        integer,
  in_cents           integer,
  cash_count         integer,
  cash_cents         integer,
  check_count        integer,
  check_cents        integer,
  card_count         integer,
  card_cents         integer,
  refund_count       integer,
  refund_cents       integer,
  refund_cash_cents  integer,
  refund_check_cents integer,
  exp_cash_cents     integer,
  fingerprint        text
)
language sql
stable
set search_path = ''
as $$
  with i as (
    select x.*
      from jsonb_to_recordset(coalesce(p_items, '[]'::jsonb))
           as x(school text, day date, kind text, method text, amount_cents integer, state text, row_id uuid, counts boolean)
     where (p_location_code is null or x.school = p_location_code)
       and x.day between p_from and p_to
  ),
  grid as (
    select l.code as school, d.d::date as day
      from public.locations l
     cross join generate_series(p_from::timestamp, p_to::timestamp, interval '1 day') as d(d)
     where p_location_code is null or l.code = p_location_code
  ),
  a as (
    select i.school, i.day,
           count(*) filter (where i.counts)::integer as item_count,
           count(*) filter (where i.counts and i.kind = 'payment')::integer as pay_count,
           coalesce(sum(i.amount_cents) filter (where i.counts), 0)::integer as total_cents,
           coalesce(sum(i.amount_cents) filter (where i.counts and i.kind = 'payment'), 0)::integer as in_cents,
           count(*) filter (where i.counts and i.kind = 'payment' and i.method = 'cash')::integer as cash_count,
           coalesce(sum(i.amount_cents) filter (where i.counts and i.kind = 'payment' and i.method = 'cash'), 0)::integer as cash_cents,
           count(*) filter (where i.counts and i.kind = 'payment' and i.method = 'check')::integer as check_count,
           coalesce(sum(i.amount_cents) filter (where i.counts and i.kind = 'payment' and i.method = 'check'), 0)::integer as check_cents,
           count(*) filter (where i.counts and i.kind = 'payment' and i.method = 'card')::integer as card_count,
           coalesce(sum(i.amount_cents) filter (where i.counts and i.kind = 'payment' and i.method = 'card'), 0)::integer as card_cents,
           count(*) filter (where i.counts and i.kind = 'refund')::integer as refund_count,
           coalesce(sum(i.amount_cents) filter (where i.counts and i.kind = 'refund'), 0)::integer as refund_cents,
           coalesce(sum(i.amount_cents) filter (where i.counts and i.kind = 'refund' and i.method = 'cash'), 0)::integer as refund_cash_cents,
           coalesce(sum(i.amount_cents) filter (where i.counts and i.kind = 'refund' and i.method = 'check'), 0)::integer as refund_check_cents,
           md5(coalesce(string_agg(i.row_id::text || '|' || i.amount_cents::text || '|' || i.method || '|' || i.state, ','
                                   order by (i.row_id::text || '|' || i.amount_cents::text || '|' || i.method || '|' || i.state) collate "C"),
                        '')) as fingerprint
      from i
     group by i.school, i.day
  )
  select g.school, g.day,
         coalesce(a.item_count, 0), coalesce(a.pay_count, 0), coalesce(a.total_cents, 0), coalesce(a.in_cents, 0),
         coalesce(a.cash_count, 0), coalesce(a.cash_cents, 0),
         coalesce(a.check_count, 0), coalesce(a.check_cents, 0),
         coalesce(a.card_count, 0), coalesce(a.card_cents, 0),
         coalesce(a.refund_count, 0), coalesce(a.refund_cents, 0),
         coalesce(a.refund_cash_cents, 0), coalesce(a.refund_check_cents, 0),
         coalesce(a.cash_cents, 0) + coalesce(a.refund_cash_cents, 0),
         coalesce(a.fingerprint, md5(''))
    from grid g
    left join a on a.school = g.school and a.day = g.day;
$$;

revoke execute on function public.finance_figures_from(jsonb, text, date, date) from public, anon, authenticated, service_role;

-- 3c2. finance_items_json(p_location_code, p_from, p_to) - the items of
-- finance_money_rows as ONE JSON array (one chain build), for 3c.
create or replace function public.finance_items_json(p_location_code text, p_from date, p_to date)
returns jsonb
language sql
stable
set search_path = ''
as $$
  select coalesce(jsonb_agg(to_jsonb(m)), '[]'::jsonb)
    from public.finance_money_rows(p_location_code, p_from, p_to) m;
$$;

revoke execute on function public.finance_items_json(text, date, date) from public, anon, authenticated, service_role;

-- 3c3. finance_figures(p_location_code, p_from, p_to) - 3c for a range,
-- building the items itself (used where only the figures are needed).
create or replace function public.finance_figures(p_location_code text, p_from date, p_to date)
returns table (
  school             text,
  day                date,
  item_count         integer,
  pay_count          integer,
  total_cents        integer,
  in_cents           integer,
  cash_count         integer,
  cash_cents         integer,
  check_count        integer,
  check_cents        integer,
  card_count         integer,
  card_cents         integer,
  refund_count       integer,
  refund_cents       integer,
  refund_cash_cents  integer,
  refund_check_cents integer,
  exp_cash_cents     integer,
  fingerprint        text
)
language sql
stable
set search_path = ''
as $$
  select f.*
    from public.finance_figures_from(public.finance_items_json(p_location_code, p_from, p_to),
                                     p_location_code, p_from, p_to) f;
$$;

revoke execute on function public.finance_figures(text, date, date) from public, anon, authenticated, service_role;

-- 3d. finance_active_close(school, day) - the close that keeps that
-- school's day closed right now (nothing points at it), or all-NULL.
create or replace function public.finance_active_close(p_location_code text, p_day date)
returns public.finance_day_closings
language sql
stable
set search_path = ''
as $$
  select c.*
    from public.finance_day_closings c
   where c.location_code = p_location_code and c.day = p_day and c.kind = 'close'
     and not exists (select 1 from public.finance_day_closings x where x.reverses_closing_id = c.id)
   order by c.recorded_at desc
   limit 1;
$$;

revoke execute on function public.finance_active_close(text, date) from public, anon, authenticated, service_role;

-- 3e. finance_closing_is_mine(closing) - true when the signed-in login made
-- that close (for the 10-second Undo). Reads the login id; returns only
-- true / false.
create or replace function public.finance_closing_is_mine(p_closing_id uuid)
returns boolean
language sql
stable
set search_path = ''
as $$
  select exists (select 1 from public.finance_day_closings c
                  where c.id = p_closing_id and c.recorded_by = auth.uid());
$$;

revoke execute on function public.finance_closing_is_mine(uuid) from public, anon, authenticated, service_role;

-- 3f. finance_compare(expected, counted) - one part of a close:
-- {"result": "matches" | "short" | "over", "diff_cents": how far off}
-- (to the cent; short = less counted than expected). diff_cents is never
-- negative: the word gives the direction (same as financeRules.js
-- compareCount).
create or replace function public.finance_compare(p_expected integer, p_counted integer)
returns jsonb
language sql
immutable
set search_path = ''
as $$
  select jsonb_build_object(
           'result', case when p_counted = p_expected then 'matches'
                          when p_counted < p_expected then 'short'
                          else 'over' end,
           'diff_cents', abs(p_counted - p_expected));
$$;

revoke execute on function public.finance_compare(integer, integer) from public, anon, authenticated, service_role;

-- 3g. finance_results(...) - the three parts of a close together:
-- {"cash": {result, diff_cents}, "checks": {result, diff_cents,
--  count_result, count_diff}, "card": {result, diff_cents}}.
-- Checks have two parts, how many and their total: the checks result is
-- "matches" only when both match; otherwise the TOTAL decides short /
-- over (or the number of checks, when the total matches). count_result /
-- count_diff say how the number of checks did (count_diff never
-- negative). Same rule as financeRules.js closeResults.
create or replace function public.finance_results(
  p_expected_cash         integer,
  p_cash                  integer,
  p_expected_checks_count integer,
  p_checks_count          integer,
  p_expected_checks       integer,
  p_checks                integer,
  p_expected_card         integer,
  p_card                  integer
)
returns jsonb
language sql
immutable
set search_path = ''
as $$
  with t as (
    select public.finance_compare(p_expected_checks, p_checks) as total,
           public.finance_compare(p_expected_checks_count, p_checks_count) as num
  )
  select jsonb_build_object(
           'cash',   public.finance_compare(p_expected_cash, p_cash),
           'checks', jsonb_build_object(
                       'result', case when t.total ->> 'result' <> 'matches' then t.total ->> 'result'
                                      else t.num ->> 'result' end,
                       'diff_cents', t.total -> 'diff_cents',
                       'count_result', t.num ->> 'result',
                       'count_diff', t.num -> 'diff_cents'),
           'card',   public.finance_compare(p_expected_card, p_card))
    from t;
$$;

revoke execute on function public.finance_results(integer, integer, integer, integer, integer, integer, integer, integer) from public, anon, authenticated, service_role;

-- 3h. finance_closing_changes_from(closing, items) - "Changed after
-- closing" (contract 1.4): compares the close's snapshot
-- (finance_day_closing_items) with that school's day NOW, chain by chain.
-- p_items = a JSON copy of the current items (3c2) that includes that
-- school's day (it may hold more; only that school and day are used), so
-- History can build a whole month once and compare every close with it.
--   changed_count    chains added, removed, or with another row / amount /
--                    method than the snapshot (a deleted student or
--                    event, a Star candidate moved to the other school, a
--                    late mis-click undo ... all show up here)
--   expected_differs the day's expected figures now differ from the
--                    close's expected_* snapshot
create or replace function public.finance_closing_changes_from(
  p_closing_id         uuid,
  p_items              jsonb,
  out changed_count    integer,
  out expected_differs boolean
)
language plpgsql
stable
set search_path = ''
as $$
declare
  v_c public.finance_day_closings;
  v_f record;
begin
  changed_count := 0;
  expected_differs := false;
  select * into v_c from public.finance_day_closings c where c.id = p_closing_id and c.kind = 'close';
  if not found then
    return;
  end if;

  select count(*)::integer into changed_count
    from (select x.source, x.payment_id, x.row_id, x.amount_cents, x.method
            from jsonb_to_recordset(coalesce(p_items, '[]'::jsonb))
                 as x(source text, payment_id uuid, school text, day date, row_id uuid, amount_cents integer,
                      method text, counts boolean)
           where x.school = v_c.location_code and x.day = v_c.day and x.counts) as cur
    full join (select ci.source, ci.chain_id, ci.row_id, ci.amount_cents, ci.method
                 from public.finance_day_closing_items ci
                where ci.closing_id = p_closing_id) as snap
      on snap.source = cur.source and snap.chain_id = cur.payment_id
   where cur.payment_id is null
      or snap.chain_id is null
      or cur.row_id <> snap.row_id
      or cur.amount_cents <> snap.amount_cents
      or cur.method <> snap.method;

  select * into v_f from public.finance_figures_from(p_items, v_c.location_code, v_c.day, v_c.day);
  expected_differs := v_f.item_count     is distinct from v_c.expected_count
                   or v_f.exp_cash_cents is distinct from v_c.expected_cash_cents
                   or v_f.check_count    is distinct from v_c.expected_checks
                   or v_f.check_cents    is distinct from v_c.expected_checks_cents
                   or v_f.card_cents     is distinct from v_c.expected_card_cents;
end;
$$;

revoke execute on function public.finance_closing_changes_from(uuid, jsonb) from public, anon, authenticated, service_role;

-- 3h2. finance_closing_changes(closing) - 3h for one close, building that
-- day's items itself.
create or replace function public.finance_closing_changes(
  p_closing_id         uuid,
  out changed_count    integer,
  out expected_differs boolean
)
language sql
stable
set search_path = ''
as $$
  select x.changed_count, x.expected_differs
    from public.finance_day_closings c,
         lateral public.finance_closing_changes_from(c.id, public.finance_items_json(c.location_code, c.day, c.day)) as x
   where c.id = p_closing_id
  union all
  select 0, false
   where not exists (select 1 from public.finance_day_closings c where c.id = p_closing_id)
  limit 1;
$$;

revoke execute on function public.finance_closing_changes(uuid) from public, anon, authenticated, service_role;

-- 3i. finance_home_at(p_at, p_admin) - the Home reminder worked out for
-- the moment p_at (finance_home passes now(); the tests pass chosen
-- moments, e.g. 7:29:59 PM and 7:30:00 PM New York time):
--   today:   the schools (Worcester first) where the reminder is On, that
--            weekday's time is set and school time >= it, the day has
--            counting items and is not closed
--   earlier: admins: the school days of the 30 days before, both schools,
--            with counting items and not closed, counted as (school, day)
--            pairs: {"count": n, "first_day": the earliest, "by_school":
--            {<school code>: {"count", "first_day"}}} (only schools with
--            count > 0; {"count": 0, "first_day": null, "by_school": {}}
--            when none); staff: null
create or replace function public.finance_home_at(p_at timestamptz, p_admin boolean)
returns jsonb
language plpgsql
stable
set search_path = ''
as $$
declare
  v_local   timestamp := p_at at time zone 'America/New_York';
  v_day     date;
  v_time    time;
  v_weekday integer;
  v_on      boolean;
  v_today   jsonb;
  v_count   integer;
  v_first   date;
  v_by      jsonb;
  v_earlier jsonb := null;
begin
  v_day := v_local::date;
  v_time := v_local::time;
  v_weekday := extract(isodow from v_day)::integer;
  select st.reminder_on into v_on from public.finance_settings st limit 1;

  select coalesce(jsonb_agg(t.location_code order by case t.location_code when 'worcester' then 0 else 1 end), '[]'::jsonb)
    into v_today
    from public.finance_reminder_times t
    join public.finance_figures(null, v_day, v_day) f on f.school = t.location_code
   where coalesce(v_on, false)
     and t.weekday = v_weekday
     and t.remind_at is not null
     and v_time >= t.remind_at
     and f.item_count > 0
     and (public.finance_active_close(t.location_code, v_day)).id is null;

  if p_admin then
    -- per school first, then the totals from those
    select coalesce(sum(x.n), 0)::integer, min(x.first),
           coalesce(jsonb_object_agg(x.school, jsonb_build_object('count', x.n, 'first_day', x.first)), '{}'::jsonb)
      into v_count, v_first, v_by
      from (select f.school, count(*)::integer as n, min(f.day) as first
              from public.finance_figures(null, v_day - 30, v_day - 1) f
             where f.item_count > 0
               and (public.finance_active_close(f.school, f.day)).id is null
             group by f.school) as x;
    v_earlier := jsonb_build_object('count', v_count, 'first_day', v_first, 'by_school', v_by);
  end if;

  return jsonb_build_object('status', 'ok', 'today', v_today, 'earlier', v_earlier);
end;
$$;

revoke execute on function public.finance_home_at(timestamptz, boolean) from public, anon, authenticated, service_role;


-- ---------------------------------------------------------------------
-- 4. Security rules: RLS + no rights at all for the app (contract 1.6).
--   Every read and write goes through the section 5 functions, so the
--   tables get RLS ON with NO rules and NO grants: nobody in the app
--   (anon, authenticated) and not the secret key's role (service_role)
--   can read or write them directly.
-- ---------------------------------------------------------------------
alter table public.finance_day_closings      enable row level security;
alter table public.finance_day_closing_items enable row level security;
alter table public.finance_settings          enable row level security;
alter table public.finance_reminder_times    enable row level security;
alter table public.finance_exports           enable row level security;

revoke all on table public.finance_day_closings, public.finance_day_closing_items, public.finance_settings,
                    public.finance_reminder_times, public.finance_exports
  from public, anon, authenticated, service_role;


-- ---------------------------------------------------------------------
-- 5. The functions the app calls (S = staff and admins, A = admins only).
--   Same pattern as 0005 section 14:
--   * returns {"status": ...}
--   * checks in this order: has_data_access() FIRST, then the role (staff
--     may only use TODAY, v0.195), then the input, then it locks and
--     looks things up (not_found), then "did the screen see the latest
--     figures?" (stale), then the rules that depend on the data, then it
--     writes
--   * writes are tagged with tkd.action + tkd.batch_id (cleared after)
--   * write functions run inside begin ... exception ... end: a table rule
--     that still says no undoes the call and answers a status instead of
--     an error (unique -> stale; foreign key / check / not-null ->
--     invalid; deadlock / serialization / lock not available -> stale)
--   * lock order for writes: the school's row in public.locations ("for
--     no key update", the same mode as 0005's testing_lock_registration,
--     so Color Belt payment writes for that school wait for a close) ->
--     the closings of that (school, day). Payments are only READ here, so
--     no deadlock with 0005 / 0006 is possible.
-- ---------------------------------------------------------------------

-- 5a. finance_day(p_location_code, p_day)   S (staff: today only)
-- The Daily report of one school's day.
-- Ok: {status, day, school, fingerprint,
--      totals:  {count, total_cents, in_cents, net_cents,
--                cash: {count, cents}, check: {count, cents}, card: {count, cents}}
--               (total_cents = net_cents = payments + refunds; count,
--                in_cents and cash / check / card: PAYMENTS only)
--      refunds: {count, cents, cash_cents, check_cents}  (cents negative)
--      items:   [contract 1.3 fields without school, + added_after_closing]
--      closing: null | {id, kind, by_name, at, cash_counted_cents, checks_counted,
--               checks_counted_cents, card_counted_cents, expected_count,
--               expected_cash_cents, expected_checks, expected_checks_cents,
--               expected_card_cents, note, results, changed_after, changed_count}
--      can_close, can_undo_until (only for the person who closed it, while
--      their 10 seconds last; else null)}
create or replace function public.finance_day(p_location_code text, p_day date)
returns jsonb
language plpgsql
stable
security definer
set search_path = ''
as $$
declare
  v_today      date := public.testing_today();
  v_admin      boolean;
  v_f          record;
  v_c          public.finance_day_closings;
  v_all        jsonb;
  v_items      jsonb;
  v_closing    jsonb := null;
  v_changes    record;
  v_undo_until timestamptz := null;
begin
  if public.has_data_access() is not true then
    return jsonb_build_object('status', 'no_access');
  end if;
  v_admin := coalesce(public.is_admin(), false);
  if not v_admin and p_day is distinct from v_today then
    return jsonb_build_object('status', 'not_allowed');
  end if;
  if p_location_code is null or not public.finance_date_ok(p_day) or p_day > v_today then
    return jsonb_build_object('status', 'invalid');
  end if;
  if not exists (select 1 from public.locations l where l.code = p_location_code) then
    return jsonb_build_object('status', 'not_found');
  end if;

  -- the day's items, built ONCE; the figures, the list and "Changed
  -- after closing" all come from this one copy
  v_all := public.finance_items_json(p_location_code, p_day, p_day);
  select * into v_f from public.finance_figures_from(v_all, p_location_code, p_day, p_day);
  v_c := public.finance_active_close(p_location_code, p_day);

  select coalesce(jsonb_agg(jsonb_build_object(
           'source', m.source, 'payment_id', m.payment_id, 'day', m.day, 'time', m."time",
           'first_name', m.first_name, 'last_name', m.last_name, 'what', m.what,
           'event_date', m.event_date, 'is_private', m.is_private, 'kind', m.kind,
           'method', m.method, 'amount_cents', m.amount_cents, 'state', m.state,
           'was_amount_cents', m.was_amount_cents, 'was_method', m.was_method,
           'moved_to', m.moved_to, 'moved_from', m.moved_from,
           'changed_by_name', m.changed_by_name, 'changed_on', m.changed_on,
           'recorded_by_name', m.recorded_by_name,
           'added_after_closing', (v_c.id is not null and m.counts and m.first_recorded_at > v_c.recorded_at))
           order by m.row_recorded_at, m.last_name, m.first_name, m.payment_id), '[]'::jsonb)
    into v_items
    from jsonb_to_recordset(v_all)
         as m(source text, payment_id uuid, day date, "time" text, first_name text, last_name text, what text,
              event_date date, is_private boolean, kind text, method text, amount_cents integer, state text,
              was_amount_cents integer, was_method text, moved_to date, moved_from date, changed_by_name text,
              changed_on date, recorded_by_name text, counts boolean, first_recorded_at timestamptz,
              row_recorded_at timestamptz);

  if v_c.id is not null then
    select * into v_changes from public.finance_closing_changes_from(v_c.id, v_all);
    v_closing := jsonb_build_object(
      'id', v_c.id, 'kind', v_c.kind, 'by_name', v_c.recorded_by_name, 'at', v_c.recorded_at,
      'cash_counted_cents', v_c.cash_counted_cents, 'checks_counted', v_c.checks_counted,
      'checks_counted_cents', v_c.checks_counted_cents, 'card_counted_cents', v_c.card_counted_cents,
      'expected_count', v_c.expected_count, 'expected_cash_cents', v_c.expected_cash_cents,
      'expected_checks', v_c.expected_checks, 'expected_checks_cents', v_c.expected_checks_cents,
      'expected_card_cents', v_c.expected_card_cents, 'note', v_c.note,
      'results', public.finance_results(v_c.expected_cash_cents, v_c.cash_counted_cents,
                                        v_c.expected_checks, v_c.checks_counted,
                                        v_c.expected_checks_cents, v_c.checks_counted_cents,
                                        v_c.expected_card_cents, v_c.card_counted_cents),
      'changed_after', (v_changes.changed_count > 0 or v_changes.expected_differs),
      'changed_count', v_changes.changed_count);
    if public.finance_closing_is_mine(v_c.id) and v_c.recorded_at > now() - interval '10 seconds' then
      v_undo_until := v_c.recorded_at + interval '10 seconds';
    end if;
  end if;

  return jsonb_build_object(
    'status', 'ok', 'day', p_day, 'school', p_location_code, 'fingerprint', v_f.fingerprint,
    'totals', jsonb_build_object(
      'count', v_f.pay_count, 'total_cents', v_f.total_cents,
      'in_cents', v_f.in_cents, 'net_cents', v_f.total_cents,
      'cash',  jsonb_build_object('count', v_f.cash_count,  'cents', v_f.cash_cents),
      'check', jsonb_build_object('count', v_f.check_count, 'cents', v_f.check_cents),
      'card',  jsonb_build_object('count', v_f.card_count,  'cents', v_f.card_cents)),
    'refunds', jsonb_build_object('count', v_f.refund_count, 'cents', v_f.refund_cents,
                                  'cash_cents', v_f.refund_cash_cents, 'check_cents', v_f.refund_check_cents),
    'items', v_items,
    'closing', v_closing,
    'can_close', (v_c.id is null and v_f.item_count > 0),
    'can_undo_until', v_undo_until);
end;
$$;

revoke execute on function public.finance_day(text, date) from public, anon, authenticated, service_role;
grant  execute on function public.finance_day(text, date) to authenticated;

-- 5b. finance_day_both(p_day)   S (staff: today only)
-- The "Both" summary: one box per school (Worcester, then Shrewsbury).
-- count / total_cents as finance_day's totals (count = payments, total =
-- net); cash / check / card_cents = payments only (money in).
-- Ok: {status, day, schools: [{code, name, count, total_cents, cash_cents,
--      check_cents, card_cents, closed}], total_cents, count}
create or replace function public.finance_day_both(p_day date)
returns jsonb
language plpgsql
stable
security definer
set search_path = ''
as $$
declare
  v_today   date := public.testing_today();
  v_schools jsonb;
  v_total   integer;
  v_count   integer;
begin
  if public.has_data_access() is not true then
    return jsonb_build_object('status', 'no_access');
  end if;
  if public.is_admin() is not true and p_day is distinct from v_today then
    return jsonb_build_object('status', 'not_allowed');
  end if;
  if not public.finance_date_ok(p_day) or p_day > v_today then
    return jsonb_build_object('status', 'invalid');
  end if;

  select coalesce(jsonb_agg(jsonb_build_object(
           'code', f.school, 'name', l.name, 'count', f.pay_count, 'total_cents', f.total_cents,
           'cash_cents', f.cash_cents, 'check_cents', f.check_cents, 'card_cents', f.card_cents,
           'closed', (public.finance_active_close(f.school, f.day)).id is not null)
           order by case f.school when 'worcester' then 0 else 1 end), '[]'::jsonb),
         coalesce(sum(f.total_cents), 0)::integer,
         coalesce(sum(f.pay_count), 0)::integer
    into v_schools, v_total, v_count
    from public.finance_figures(null, p_day, p_day) f
    join public.locations l on l.code = f.school;

  return jsonb_build_object('status', 'ok', 'day', p_day, 'schools', v_schools,
                            'total_cents', v_total, 'count', v_count);
end;
$$;

revoke execute on function public.finance_day_both(date) from public, anon, authenticated, service_role;
grant  execute on function public.finance_day_both(date) to authenticated;

-- 5c. finance_history(p_location_code, p_month)   A
-- Every day of the month of p_month (any date in it) up to today, newest
-- first; p_location_code NULL = both schools (Worcester first each day).
-- tag, the FIRST that applies (contract priority):
--   today_open             today, not closed
--   changed_after_closing  closed, and it changed since (3h)
--   short                  closed, a part counted short
--   over                   closed, a part counted over
--                          (short / over: diff_cents = the largest
--                          difference of that kind, never negative, and
--                          diff_part = which part: cash | checks | card;
--                          a checks count-only difference counts as 0
--                          cents; on a tie the first of cash, checks, card)
--   not_closed             not closed, has counting items
--   closed                 closed, everything matched
--   no_payments            not closed, no counting items
-- unclosed_count = the days tagged not_closed.
-- count / total_cents as finance_day's totals (count = payments).
-- Ok: {status, month, unclosed_count, days: [{day, school, total_cents,
--      count, tag, diff_cents, diff_part, closed_by_name, closed_at}]}
create or replace function public.finance_history(p_location_code text, p_month date)
returns jsonb
language plpgsql
stable
security definer
set search_path = ''
as $$
declare
  v_today    date := public.testing_today();
  v_first    date;
  v_last     date;
  v_f        record;
  v_c        public.finance_day_closings;
  v_items    jsonb;
  v_results  jsonb;
  v_changed  boolean;
  v_tag      text;
  v_diff     integer;
  v_part     text;
  v_days     jsonb := '[]'::jsonb;
  v_unclosed integer := 0;
begin
  if public.has_data_access() is not true then
    return jsonb_build_object('status', 'no_access');
  end if;
  if public.is_admin() is not true then
    return jsonb_build_object('status', 'not_allowed');
  end if;
  if not public.finance_date_ok(p_month) then
    return jsonb_build_object('status', 'invalid');
  end if;
  v_first := date_trunc('month', p_month)::date;
  if v_first > v_today then
    return jsonb_build_object('status', 'invalid');
  end if;
  if p_location_code is not null
     and not exists (select 1 from public.locations l where l.code = p_location_code) then
    return jsonb_build_object('status', 'not_found');
  end if;
  -- the last day of the month, or today for the current month
  v_last := least((v_first + interval '1 month')::date - 1, v_today);

  -- ONE build of the month's items (both schools when p_location_code is
  -- NULL); every day's figures and every close's comparison use it
  v_items := public.finance_items_json(p_location_code, v_first, v_last);

  for v_f in
    select f.* from public.finance_figures_from(v_items, p_location_code, v_first, v_last) f
     order by f.day desc, case f.school when 'worcester' then 0 else 1 end
  loop
    v_c := public.finance_active_close(v_f.school, v_f.day);
    v_diff := null;
    v_part := null;
    v_tag := null;
    v_changed := false;
    if v_c.id is not null then
      select (x.changed_count > 0 or x.expected_differs) into v_changed
        from public.finance_closing_changes_from(v_c.id, v_items) as x;
      v_results := public.finance_results(v_c.expected_cash_cents, v_c.cash_counted_cents,
                                          v_c.expected_checks, v_c.checks_counted,
                                          v_c.expected_checks_cents, v_c.checks_counted_cents,
                                          v_c.expected_card_cents, v_c.card_counted_cents);
    end if;

    if v_f.day = v_today and v_c.id is null then
      v_tag := 'today_open';
    elsif v_c.id is not null and v_changed then
      v_tag := 'changed_after_closing';
    elsif v_c.id is not null then
      -- short before over; inside one kind the largest difference wins
      -- (on a tie: cash, then checks, then card)
      select x.kind, x.part, x.diff into v_tag, v_part, v_diff
        from (select v_results -> p.part ->> 'result' as kind, p.part,
                     (v_results -> p.part ->> 'diff_cents')::integer as diff, p.n
                from (values ('cash', 1), ('checks', 2), ('card', 3)) as p(part, n)) as x
       where x.kind in ('short', 'over')
       order by case x.kind when 'short' then 0 else 1 end, x.diff desc, x.n
       limit 1;
      if v_tag is null then
        v_tag := 'closed';
      end if;
    elsif v_f.item_count > 0 then
      v_tag := 'not_closed';
      v_unclosed := v_unclosed + 1;
    else
      v_tag := 'no_payments';
    end if;

    v_days := v_days || jsonb_build_array(jsonb_build_object(
      'day', v_f.day, 'school', v_f.school, 'total_cents', v_f.total_cents, 'count', v_f.pay_count,
      'tag', v_tag, 'diff_cents', v_diff, 'diff_part', v_part,
      'closed_by_name', v_c.recorded_by_name, 'closed_at', v_c.recorded_at));
  end loop;

  return jsonb_build_object('status', 'ok', 'month', v_first, 'unclosed_count', v_unclosed, 'days', v_days);
end;
$$;

revoke execute on function public.finance_history(text, date) from public, anon, authenticated, service_role;
grant  execute on function public.finance_history(text, date) to authenticated;

-- 5d. finance_payment_detail(p_source, p_payment_id)   S
-- One chain for the detail dialog (D12). p_payment_id must be a chain's
-- FIRST row (the report's payment_id), else not_found (a hidden chain is
-- not_found too). Staff: only when one of the chain's items is on TODAY
-- (else not_allowed).
-- Honest limit (contract): the history below can show staff an earlier
-- day's amount; staff can already read payments on the Testing rosters,
-- so the today-only rule keeps the REPORT today-only, it doesn't secure
-- older payments.
-- Ok: {status, item: {contract 1.3 fields}, event_name, event_id (the
--      testing_events / star_events row, for "Open in Testing"),
--      history: [{at, by_name, what: recorded | edited | undone | refunded,
--                 amount_cents, method, paid_on}]}   (newest first; an
--      undone line carries the undone row's amount and the undo's date)
-- item also carries added_after_closing, as on the Daily report.
create or replace function public.finance_payment_detail(p_source text, p_payment_id uuid)
returns jsonb
language plpgsql
stable
security definer
set search_path = ''
as $$
declare
  v_today   date := public.testing_today();
  v_owner   uuid;
  v_from    date;
  v_to      date;
  v_item    record;
  v_c       public.finance_day_closings;
  v_history jsonb;
begin
  if public.has_data_access() is not true then
    return jsonb_build_object('status', 'no_access');
  end if;
  if p_source is null or p_source not in ('color_belt', 'star') or p_payment_id is null then
    return jsonb_build_object('status', 'invalid');
  end if;

  -- the owner (registration / candidate); its chains are built from all
  -- its rows (3a with p_owner), whatever their dates
  if p_source = 'color_belt' then
    select p.registration_id into v_owner from public.testing_payments p where p.id = p_payment_id;
    select min(p.paid_on), max(p.paid_on) into v_from, v_to
      from public.testing_payments p where p.registration_id = v_owner and p.kind <> 'reversal';
  else
    select p.candidate_id into v_owner from public.star_payments p where p.id = p_payment_id;
    select min(p.paid_on), max(p.paid_on) into v_from, v_to
      from public.star_payments p where p.candidate_id = v_owner and p.kind <> 'reversal';
  end if;
  if v_owner is null or v_from is null then
    return jsonb_build_object('status', 'not_found');
  end if;

  if not exists (select 1 from public.finance_money_rows_core(null, null, null, p_source, v_owner) m
                  where m.source = p_source and m.payment_id = p_payment_id) then
    return jsonb_build_object('status', 'not_found');
  end if;
  if public.is_admin() is not true
     and not exists (select 1 from public.finance_money_rows_core(null, null, null, p_source, v_owner) m
                      where m.source = p_source and m.payment_id = p_payment_id and m.day = v_today) then
    return jsonb_build_object('status', 'not_allowed');
  end if;

  -- the item shown: the counting one (live chain), else the first day's
  -- (undone chain: its row is the chain's first row)
  select m.* into v_item
    from public.finance_money_rows_core(null, null, null, p_source, v_owner) m
   where m.source = p_source and m.payment_id = p_payment_id
   order by m.counts desc, (m.row_id = m.payment_id) desc, m.day
   limit 1;
  v_c := public.finance_active_close(v_item.school, v_item.day);

  select coalesce(jsonb_agg(h.line order by h.at desc, h.n desc), '[]'::jsonb) into v_history
    from (select c.recorded_at as at, c.step as n,
                 jsonb_build_object('at', c.recorded_at, 'by_name', c.recorded_by_name,
                                    'what', case when c.step > 0 then 'edited'
                                                 when c.kind = 'refund' then 'refunded'
                                                 else 'recorded' end,
                                    'amount_cents', c.amount_cents, 'method', c.method, 'paid_on', c.paid_on) as line
            from public.finance_chain_steps_core(null, null, p_source, v_owner) c
           where c.source = p_source and c.chain_id = p_payment_id
          union all
          select c.undo_at, 1000,
                 jsonb_build_object('at', c.undo_at, 'by_name', c.undo_by_name, 'what', 'undone',
                                    'amount_cents', -c.undo_amount_cents, 'method', c.undo_method, 'paid_on', c.undo_on)
            from public.finance_chain_steps_core(null, null, p_source, v_owner) c
           where c.source = p_source and c.chain_id = p_payment_id
             and c.step = c.last_step and c.end_state = 'undone') as h;

  return jsonb_build_object(
    'status', 'ok',
    'item', jsonb_build_object(
      'source', v_item.source, 'payment_id', v_item.payment_id, 'school', v_item.school, 'day', v_item.day,
      'time', v_item."time", 'first_name', v_item.first_name, 'last_name', v_item.last_name,
      'what', v_item.what, 'event_date', v_item.event_date, 'is_private', v_item.is_private,
      'kind', v_item.kind, 'method', v_item.method, 'amount_cents', v_item.amount_cents,
      'state', v_item.state, 'was_amount_cents', v_item.was_amount_cents, 'was_method', v_item.was_method,
      'moved_to', v_item.moved_to, 'moved_from', v_item.moved_from,
      'changed_by_name', v_item.changed_by_name, 'changed_on', v_item.changed_on,
      'recorded_by_name', v_item.recorded_by_name,
      'added_after_closing', (v_c.id is not null and v_item.counts and v_item.first_recorded_at > v_c.recorded_at)),
    'event_name', v_item.event_name,
    'event_id', v_item.event_id,
    'history', v_history);
end;
$$;

revoke execute on function public.finance_payment_detail(text, uuid) from public, anon, authenticated, service_role;
grant  execute on function public.finance_payment_detail(text, uuid) to authenticated;

-- 5e. finance_home()   S
-- The Home reminder lines for right now (3i). "earlier" only for admins.
-- Ok: {status, today: [school codes],
--      earlier: null (staff) | {count, first_day, by_school: {<code>: {count, first_day}}}}
create or replace function public.finance_home()
returns jsonb
language plpgsql
stable
security definer
set search_path = ''
as $$
begin
  if public.has_data_access() is not true then
    return jsonb_build_object('status', 'no_access');
  end if;
  return public.finance_home_at(now(), coalesce(public.is_admin(), false));
end;
$$;

revoke execute on function public.finance_home() from public, anon, authenticated, service_role;
grant  execute on function public.finance_home() to authenticated;

-- 5f. finance_close_day(p_location_code, p_day, p_expected_fingerprint,
--       p_cash_cents, p_checks_count, p_checks_cents, p_card_cents, p_note)
--     S (staff: today only; admins: any open day up to today)
-- Close the day. The server works everything out again under the school
-- lock and refuses when the screen's figures are out of date:
--   fingerprint differs (a payment added, undone, edited - even a
--     method-only edit - since the screen loaded)      -> stale
--   no counting item at all                            -> nothing_to_close
--   already closed (e.g. a double click)               -> already_closed
--   cash < 0 while the expected cash is not negative   -> invalid
--   a part short / over and no note                    -> note_required
--                                                         {status, results}
-- Then it writes the close (counts + the expected snapshot + the note)
-- and its finance_day_closing_items, in one transaction.
-- p_cash_cents may be negative (down to -$100,000) only on a day whose
-- expected cash is negative ("Cash taken out of the drawer", v0.209).
-- Ok: {status, closing_id, results}
create or replace function public.finance_close_day(
  p_location_code        text,
  p_day                  date,
  p_expected_fingerprint text,
  p_cash_cents           integer,
  p_checks_count         integer,
  p_checks_cents         integer,
  p_card_cents           integer,
  p_note                 text
)
returns jsonb
language plpgsql
volatile
security definer
set search_path = ''
as $$
declare
  v_today   date := public.testing_today();
  v_note    text;
  v_f       record;
  v_c       public.finance_day_closings;
  v_items   jsonb;
  v_results jsonb;
  v_id      uuid;
begin
  begin
    if public.has_data_access() is not true then
      return jsonb_build_object('status', 'no_access');
    end if;
    if public.is_admin() is not true and p_day is distinct from v_today then
      return jsonb_build_object('status', 'not_allowed');
    end if;

    v_note := public.testing_normalize_note(p_note);
    if p_location_code is null or not public.finance_date_ok(p_day) or p_day > v_today
       or p_expected_fingerprint is null
       or p_cash_cents is null or p_cash_cents not between -10000000 and 10000000
       or p_checks_count is null or p_checks_count not between 0 and 500
       or p_checks_cents is null or p_checks_cents not between 0 and 10000000
       or p_card_cents is null or p_card_cents not between 0 and 10000000
       or (v_note is not null and (char_length(v_note) > 500 or not public.testing_note_is_valid(v_note))) then
      return jsonb_build_object('status', 'invalid');
    end if;
    if not exists (select 1 from public.locations l where l.code = p_location_code) then
      return jsonb_build_object('status', 'not_found');
    end if;

    -- lock: the school, then that day's closings
    perform 1 from public.locations l where l.code = p_location_code for no key update;
    perform 1 from public.finance_day_closings c
     where c.location_code = p_location_code and c.day = p_day
       for update;

    -- work the day out again, under the lock: the items are built ONCE
    -- (v_items) and the fingerprint, the expected figures and the snapshot
    -- below all come from that one copy. (A Star payment doesn't take the
    -- school lock, so it could commit while this runs; with one copy it is
    -- either in all three or in none - and then it shows as Changed after
    -- closing.)
    v_items := public.finance_items_json(p_location_code, p_day, p_day);
    select * into v_f from public.finance_figures_from(v_items, p_location_code, p_day, p_day);
    if v_f.fingerprint is distinct from p_expected_fingerprint then
      return jsonb_build_object('status', 'stale');
    end if;
    if v_f.item_count = 0 then
      return jsonb_build_object('status', 'nothing_to_close');
    end if;
    v_c := public.finance_active_close(p_location_code, p_day);
    if v_c.id is not null then
      return jsonb_build_object('status', 'already_closed');
    end if;
    if p_cash_cents < 0 and v_f.exp_cash_cents >= 0 then
      return jsonb_build_object('status', 'invalid');
    end if;

    v_results := public.finance_results(v_f.exp_cash_cents, p_cash_cents, v_f.check_count, p_checks_count,
                                        v_f.check_cents, p_checks_cents, v_f.card_cents, p_card_cents);
    if v_note is null
       and (v_results #>> '{cash,result}' <> 'matches'
            or v_results #>> '{checks,result}' <> 'matches'
            or v_results #>> '{card,result}' <> 'matches') then
      return jsonb_build_object('status', 'note_required', 'results', v_results);
    end if;

    perform set_config('tkd.action', 'finance_close_day', true);
    perform set_config('tkd.batch_id', gen_random_uuid()::text, true);

    insert into public.finance_day_closings
      (location_code, day, kind, cash_counted_cents, checks_counted, checks_counted_cents, card_counted_cents,
       expected_count, expected_cash_cents, expected_checks, expected_checks_cents, expected_card_cents,
       note, recorded_by_name)
    values
      (p_location_code, p_day, 'close', p_cash_cents, p_checks_count, p_checks_cents, p_card_cents,
       v_f.item_count, v_f.exp_cash_cents, v_f.check_count, v_f.check_cents, v_f.card_cents,
       v_note, public.change_log_actor_name())
    returning id into v_id;

    -- the snapshot of exactly what was counted
    insert into public.finance_day_closing_items
      (closing_id, location_code, source, chain_id, row_id, kind, method, amount_cents)
    select v_id, p_location_code, x.source, x.payment_id, x.row_id, x.kind, x.method, x.amount_cents
      from jsonb_to_recordset(v_items)
           as x(source text, payment_id uuid, row_id uuid, kind text, method text, amount_cents integer, counts boolean)
     where x.counts;

    perform set_config('tkd.action', '', true);
    perform set_config('tkd.batch_id', '', true);

    return jsonb_build_object('status', 'ok', 'closing_id', v_id, 'results', v_results);
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

revoke execute on function public.finance_close_day(text, date, text, integer, integer, integer, integer, text) from public, anon, authenticated, service_role;
grant  execute on function public.finance_close_day(text, date, text, integer, integer, integer, integer, text) to authenticated;

-- 5g. finance_undo_close(p_closing_id)   S
-- The toast's Undo: only the login that closed the day, and only less
-- than 10 seconds after (else too_late; admins reopen instead, 5h).
-- A close that was already ended -> stale (checked first); not a close ->
-- invalid.
-- Ok: {status}
create or replace function public.finance_undo_close(p_closing_id uuid)
returns jsonb
language plpgsql
volatile
security definer
set search_path = ''
as $$
declare
  v_c public.finance_day_closings;
begin
  begin
    if public.has_data_access() is not true then
      return jsonb_build_object('status', 'no_access');
    end if;
    if p_closing_id is null then
      return jsonb_build_object('status', 'invalid');
    end if;

    select * into v_c from public.finance_day_closings c where c.id = p_closing_id;
    if not found then
      return jsonb_build_object('status', 'not_found');
    end if;
    if v_c.kind <> 'close' then
      return jsonb_build_object('status', 'invalid');
    end if;

    perform 1 from public.locations l where l.code = v_c.location_code for no key update;
    perform 1 from public.finance_day_closings c
     where c.location_code = v_c.location_code and c.day = v_c.day
       for update;

    if exists (select 1 from public.finance_day_closings x where x.reverses_closing_id = v_c.id) then
      return jsonb_build_object('status', 'stale');
    end if;
    if not (public.finance_closing_is_mine(v_c.id) and v_c.recorded_at > now() - interval '10 seconds') then
      return jsonb_build_object('status', 'too_late');
    end if;

    perform set_config('tkd.action', 'finance_undo_close', true);
    perform set_config('tkd.batch_id', gen_random_uuid()::text, true);

    insert into public.finance_day_closings (location_code, day, kind, reverses_closing_id, recorded_by_name)
    values (v_c.location_code, v_c.day, 'undo', v_c.id, public.change_log_actor_name());

    perform set_config('tkd.action', '', true);
    perform set_config('tkd.batch_id', '', true);

    return jsonb_build_object('status', 'ok');
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

revoke execute on function public.finance_undo_close(uuid) from public, anon, authenticated, service_role;
grant  execute on function public.finance_undo_close(uuid) to authenticated;

-- 5h. finance_reopen_day(p_location_code, p_day, p_expected_closing_id)   A
-- Reopen a closed day. Not closed -> not_closed; the close the screen saw
-- is no longer the open one -> stale.
-- Ok: {status}
create or replace function public.finance_reopen_day(
  p_location_code       text,
  p_day                 date,
  p_expected_closing_id uuid
)
returns jsonb
language plpgsql
volatile
security definer
set search_path = ''
as $$
declare
  v_c public.finance_day_closings;
begin
  begin
    if public.has_data_access() is not true then
      return jsonb_build_object('status', 'no_access');
    end if;
    if public.is_admin() is not true then
      return jsonb_build_object('status', 'not_allowed');
    end if;
    if p_location_code is null or not public.finance_date_ok(p_day) or p_expected_closing_id is null
       or p_day > public.testing_today() then
      return jsonb_build_object('status', 'invalid');
    end if;
    if not exists (select 1 from public.locations l where l.code = p_location_code) then
      return jsonb_build_object('status', 'not_found');
    end if;

    perform 1 from public.locations l where l.code = p_location_code for no key update;
    perform 1 from public.finance_day_closings c
     where c.location_code = p_location_code and c.day = p_day
       for update;

    v_c := public.finance_active_close(p_location_code, p_day);
    if v_c.id is null then
      return jsonb_build_object('status', 'not_closed');
    end if;
    if v_c.id <> p_expected_closing_id then
      return jsonb_build_object('status', 'stale');
    end if;

    perform set_config('tkd.action', 'finance_reopen_day', true);
    perform set_config('tkd.batch_id', gen_random_uuid()::text, true);

    insert into public.finance_day_closings (location_code, day, kind, reverses_closing_id, recorded_by_name)
    values (p_location_code, p_day, 'reopen', v_c.id, public.change_log_actor_name());

    perform set_config('tkd.action', '', true);
    perform set_config('tkd.batch_id', '', true);

    return jsonb_build_object('status', 'ok');
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

revoke execute on function public.finance_reopen_day(text, date, uuid) from public, anon, authenticated, service_role;
grant  execute on function public.finance_reopen_day(text, date, uuid) to authenticated;

-- 5i. finance_export(p_location_code, p_from, p_to)   A
-- The rows of the CSV for ONE school (Both is not exportable, v0.207):
-- p_from <= p_to <= today and at most 366 days (plan Q4), else invalid.
-- Writes one finance_exports row per call (same transaction).
--   counted_cents = amount_cents when the item adds to the total, else 0
--                   (so adding up that column is always right)
--   note          = a plain description of a correction: edited / moved_in
--                   "was $70.00 check", moved_out "moved to 2026-10-03",
--                   undone "undone by Kim on 2026-10-20"; null for counted
-- Ok: {status, school, from, to, rows: [{day, school, time, first_name,
--      last_name, what, event_date, kind, method, amount_cents,
--      counted_cents, recorded_by_name, state, note}]}
create or replace function public.finance_export(p_location_code text, p_from date, p_to date)
returns jsonb
language plpgsql
volatile
security definer
set search_path = ''
as $$
declare
  v_rows  jsonb;
  v_count integer;
begin
  begin
    if public.has_data_access() is not true then
      return jsonb_build_object('status', 'no_access');
    end if;
    if public.is_admin() is not true then
      return jsonb_build_object('status', 'not_allowed');
    end if;
    -- the dates on their own first: subtracting 'infinity' would fail
    if not public.finance_date_ok(p_from) or not public.finance_date_ok(p_to) then
      return jsonb_build_object('status', 'invalid');
    end if;
    if p_location_code is null or p_from > p_to or p_to > public.testing_today() or p_to - p_from > 365 then
      return jsonb_build_object('status', 'invalid');
    end if;
    if not exists (select 1 from public.locations l where l.code = p_location_code) then
      return jsonb_build_object('status', 'not_found');
    end if;

    select coalesce(jsonb_agg(jsonb_build_object(
             'day', m.day, 'school', m.school, 'time', m."time",
             'first_name', m.first_name, 'last_name', m.last_name, 'what', m.what,
             'event_date', m.event_date, 'kind', m.kind, 'method', m.method,
             'amount_cents', m.amount_cents,
             'counted_cents', case when m.counts then m.amount_cents else 0 end,
             'recorded_by_name', m.recorded_by_name, 'state', m.state,
             'note', case m.state
                       when 'edited' then
                         'was $' || to_char(m.was_amount_cents / 100.0, 'FM9999990.00') || ' ' || m.was_method
                       when 'moved_in' then
                         'was $' || to_char(m.was_amount_cents / 100.0, 'FM9999990.00') || ' ' || m.was_method
                       when 'moved_out' then
                         'moved to ' || m.moved_to::text
                       when 'undone' then
                         'undone by ' || coalesce(m.changed_by_name, '?') || ' on ' || coalesce(m.changed_on::text, '?')
                     end)
             order by m.day, m.row_recorded_at, m.last_name, m.first_name, m.payment_id), '[]'::jsonb),
           count(*)::integer
      into v_rows, v_count
      from public.finance_money_rows(p_location_code, p_from, p_to) m;

    perform set_config('tkd.action', 'finance_export', true);
    perform set_config('tkd.batch_id', gen_random_uuid()::text, true);

    insert into public.finance_exports (location_code, from_day, to_day, row_count, downloaded_by_name)
    values (p_location_code, p_from, p_to, v_count, public.change_log_actor_name());

    perform set_config('tkd.action', '', true);
    perform set_config('tkd.batch_id', '', true);

    return jsonb_build_object('status', 'ok', 'school', p_location_code, 'from', p_from, 'to', p_to, 'rows', v_rows);
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

revoke execute on function public.finance_export(text, date, date) from public, anon, authenticated, service_role;
grant  execute on function public.finance_export(text, date, date) to authenticated;

-- 5i2. finance_export_preview(p_location_code, p_from, p_to)   A
-- What the Export dialog shows before downloading: how many rows the CSV
-- would have and their total, in one call. The same rules as 5i (one
-- school, dates 2020-01-01 .. today, at most 366 days) but it writes
-- NOTHING (no log row: nothing is downloaded).
--   count       = the counted PAYMENTS in the range (refunds and
--                 undone / moved-out lines not counted; like finance_day's
--                 totals.count)
--   total_cents = net of the counted items = the sum of the file's
--                 counted_cents column (refunds negative)
-- Ok: {status, count, total_cents}
create or replace function public.finance_export_preview(p_location_code text, p_from date, p_to date)
returns jsonb
language plpgsql
stable
security definer
set search_path = ''
as $$
declare
  v_count integer;
  v_total integer;
begin
  if public.has_data_access() is not true then
    return jsonb_build_object('status', 'no_access');
  end if;
  if public.is_admin() is not true then
    return jsonb_build_object('status', 'not_allowed');
  end if;
  if not public.finance_date_ok(p_from) or not public.finance_date_ok(p_to) then
    return jsonb_build_object('status', 'invalid');
  end if;
  if p_location_code is null or p_from > p_to or p_to > public.testing_today() or p_to - p_from > 365 then
    return jsonb_build_object('status', 'invalid');
  end if;
  if not exists (select 1 from public.locations l where l.code = p_location_code) then
    return jsonb_build_object('status', 'not_found');
  end if;

  select count(*) filter (where m.counts and m.kind = 'payment')::integer,
         coalesce(sum(m.amount_cents) filter (where m.counts), 0)::integer
    into v_count, v_total
    from public.finance_money_rows(p_location_code, p_from, p_to) m;

  return jsonb_build_object('status', 'ok', 'count', v_count, 'total_cents', v_total);
end;
$$;

revoke execute on function public.finance_export_preview(text, date, date) from public, anon, authenticated, service_role;
grant  execute on function public.finance_export_preview(text, date, date) to authenticated;

-- 5j. finance_settings_get()   A
-- Ok: {status, reminder_on, version, times: [{school, weekday,
--      remind_at: "HH:MM" | null}]}  (Worcester first, Monday first)
create or replace function public.finance_settings_get()
returns jsonb
language plpgsql
stable
security definer
set search_path = ''
as $$
declare
  v_on      boolean;
  v_version integer;
  v_times   jsonb;
begin
  if public.has_data_access() is not true then
    return jsonb_build_object('status', 'no_access');
  end if;
  if public.is_admin() is not true then
    return jsonb_build_object('status', 'not_allowed');
  end if;

  select st.reminder_on, st.version into v_on, v_version from public.finance_settings st limit 1;
  select coalesce(jsonb_agg(jsonb_build_object('school', t.location_code, 'weekday', t.weekday,
                                               'remind_at', to_char(t.remind_at, 'HH24:MI'))
                            order by case t.location_code when 'worcester' then 0 else 1 end, t.weekday), '[]'::jsonb)
    into v_times
    from public.finance_reminder_times t;

  return jsonb_build_object('status', 'ok', 'reminder_on', v_on, 'version', v_version, 'times', v_times);
end;
$$;

revoke execute on function public.finance_settings_get() from public, anon, authenticated, service_role;
grant  execute on function public.finance_settings_get() to authenticated;

-- 5k. finance_set_reminder_on(p_on, p_expected_version)   A
-- The reminder On / Off switch. The same value again writes nothing.
-- Ok: {status, version}
create or replace function public.finance_set_reminder_on(p_on boolean, p_expected_version integer)
returns jsonb
language plpgsql
volatile
security definer
set search_path = ''
as $$
declare
  v_s public.finance_settings;
begin
  begin
    if public.has_data_access() is not true then
      return jsonb_build_object('status', 'no_access');
    end if;
    if public.is_admin() is not true then
      return jsonb_build_object('status', 'not_allowed');
    end if;
    if p_on is null or p_expected_version is null then
      return jsonb_build_object('status', 'invalid');
    end if;

    select * into v_s from public.finance_settings st limit 1 for update;
    if not found then
      return jsonb_build_object('status', 'not_found');
    end if;
    if v_s.version <> p_expected_version then
      return jsonb_build_object('status', 'stale');
    end if;
    if v_s.reminder_on = p_on then
      return jsonb_build_object('status', 'ok', 'version', v_s.version);
    end if;

    perform set_config('tkd.action', 'finance_set_reminder_on', true);
    perform set_config('tkd.batch_id', gen_random_uuid()::text, true);

    update public.finance_settings st
       set reminder_on = p_on, version = st.version + 1,
           updated_at = now(), updated_by_name = public.change_log_actor_name()
     where st.id = v_s.id
    returning st.version into v_s.version;

    perform set_config('tkd.action', '', true);
    perform set_config('tkd.batch_id', '', true);

    return jsonb_build_object('status', 'ok', 'version', v_s.version);
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

revoke execute on function public.finance_set_reminder_on(boolean, integer) from public, anon, authenticated, service_role;
grant  execute on function public.finance_set_reminder_on(boolean, integer) to authenticated;

-- 5l. finance_set_reminder_time(p_location_code, p_weekday, p_time,
--       p_expected_version)   A
-- One school's time for one weekday (1 = Monday ... 7 = Sunday): NULL =
-- Off, else 11:00-23:00 on a 15-minute step (1a), else invalid. The same
-- value again writes nothing; a change bumps the settings version.
-- Ok: {status, version}
create or replace function public.finance_set_reminder_time(
  p_location_code    text,
  p_weekday          smallint,
  p_time             time,
  p_expected_version integer
)
returns jsonb
language plpgsql
volatile
security definer
set search_path = ''
as $$
declare
  v_s public.finance_settings;
  v_t public.finance_reminder_times;
begin
  begin
    if public.has_data_access() is not true then
      return jsonb_build_object('status', 'no_access');
    end if;
    if public.is_admin() is not true then
      return jsonb_build_object('status', 'not_allowed');
    end if;
    if p_location_code is null or p_weekday is null or p_weekday not between 1 and 7
       or p_expected_version is null
       or (p_time is not null and not public.finance_reminder_time_is_valid(p_time)) then
      return jsonb_build_object('status', 'invalid');
    end if;
    if not exists (select 1 from public.locations l where l.code = p_location_code) then
      return jsonb_build_object('status', 'not_found');
    end if;

    select * into v_s from public.finance_settings st limit 1 for update;
    if not found then
      return jsonb_build_object('status', 'not_found');
    end if;
    if v_s.version <> p_expected_version then
      return jsonb_build_object('status', 'stale');
    end if;
    select * into v_t from public.finance_reminder_times t
     where t.location_code = p_location_code and t.weekday = p_weekday
       for update;
    if not found then
      return jsonb_build_object('status', 'not_found');
    end if;
    if v_t.remind_at is not distinct from p_time then
      return jsonb_build_object('status', 'ok', 'version', v_s.version);
    end if;

    perform set_config('tkd.action', 'finance_set_reminder_time', true);
    perform set_config('tkd.batch_id', gen_random_uuid()::text, true);

    update public.finance_reminder_times t set remind_at = p_time where t.id = v_t.id;
    update public.finance_settings st
       set version = st.version + 1, updated_at = now(), updated_by_name = public.change_log_actor_name()
     where st.id = v_s.id
    returning st.version into v_s.version;

    perform set_config('tkd.action', '', true);
    perform set_config('tkd.batch_id', '', true);

    return jsonb_build_object('status', 'ok', 'version', v_s.version);
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

revoke execute on function public.finance_set_reminder_time(text, smallint, time, integer) from public, anon, authenticated, service_role;
grant  execute on function public.finance_set_reminder_time(text, smallint, time, integer) to authenticated;

-- 5m. finance_copy_monday(p_expected_version)   A
-- "Copy Monday to weekdays": each school's Monday time (or Off) goes to
-- its Tuesday - Friday. Nothing different -> writes nothing; otherwise one
-- version bump for the whole copy.
-- Ok: {status, version}
create or replace function public.finance_copy_monday(p_expected_version integer)
returns jsonb
language plpgsql
volatile
security definer
set search_path = ''
as $$
declare
  v_s public.finance_settings;
  v_n integer;
begin
  begin
    if public.has_data_access() is not true then
      return jsonb_build_object('status', 'no_access');
    end if;
    if public.is_admin() is not true then
      return jsonb_build_object('status', 'not_allowed');
    end if;
    if p_expected_version is null then
      return jsonb_build_object('status', 'invalid');
    end if;

    select * into v_s from public.finance_settings st limit 1 for update;
    if not found then
      return jsonb_build_object('status', 'not_found');
    end if;
    if v_s.version <> p_expected_version then
      return jsonb_build_object('status', 'stale');
    end if;

    perform set_config('tkd.action', 'finance_copy_monday', true);
    perform set_config('tkd.batch_id', gen_random_uuid()::text, true);

    update public.finance_reminder_times t
       set remind_at = mon.remind_at
      from public.finance_reminder_times mon
     where mon.location_code = t.location_code and mon.weekday = 1
       and t.weekday between 2 and 5
       and t.remind_at is distinct from mon.remind_at;
    get diagnostics v_n = row_count;

    if v_n > 0 then
      update public.finance_settings st
         set version = st.version + 1, updated_at = now(), updated_by_name = public.change_log_actor_name()
       where st.id = v_s.id
      returning st.version into v_s.version;
    end if;

    perform set_config('tkd.action', '', true);
    perform set_config('tkd.batch_id', '', true);

    return jsonb_build_object('status', 'ok', 'version', v_s.version);
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

revoke execute on function public.finance_copy_monday(integer) from public, anon, authenticated, service_role;
grant  execute on function public.finance_copy_monday(integer) to authenticated;

commit;
