-- =====================================================================
-- 0054_finance_event_report.sql
-- ---------------------------------------------------------------------
-- WHAT THIS FILE IS
--   The database half of the new "Event money report" (rulebook: event
--   reports, Jeffrey's answers 2026-11-19; contract
--   docs/Finance/Event reports/CONTRACT-0054-0055.md). An admin opens one
--   event (a Color Belt testing, a Star testing, a camp, a Black Belt
--   cycle or a Board breaking event) and sees ALL the money of that event
--   in one place: the totals, the totals per school, and every day with
--   its lines. A second function gives the same rows as a CSV download
--   and writes one log row for each download.
--   It runs AFTER 0052 (Finance reads Board breaking, live) and needs the
--   Finance functions of 0011 / 0026 / 0047 / 0052. It does NOT touch
--   anything Board breaking's 0053 replaces.
--
-- WHAT IT ADDS (all new - no live Finance function is replaced)
--   1. ONE new table, public.finance_event_exports: one row per event CSV
--      download (who, when, which event, which school, how many rows). It
--      is the twin of finance_exports (0011): append-only (the same guard
--      trigger function, finance_append_only), every change logged in
--      public.change_log, no "empty the table" shortcut, RLS on with no
--      rules and NO rights for anyone in the app (the same as
--      finance_exports): only the functions below write it. The login id of
--      the person who downloaded (downloaded_by) is never returned.
--   2. Four small INTERNAL helpers (nobody in the app can call them; only
--      the two functions below do):
--        finance_event_check   (source, event, school) -> ok + the event's
--                              name, or invalid / not_found
--        finance_event_items   all of one event's money lines, as JSON
--        finance_event_figures the totals / refunds / returned figures of a
--                              set of (school, day) figure rows
--        finance_event_extras  the extra keys a camp, Black Belt or Board
--                              breaking line carries (event name, what the
--                              Black Belt payment was for ...)
--   3. TWO functions the app calls (admins only; staff get not_allowed):
--        finance_event_report(source, event, school)  the report
--        finance_event_export(source, event, school)  the CSV rows + 1 log row
--
-- WHY IT READS THROUGH FINANCE'S OWN ROWS
--   Both functions get their lines from public.finance_money_rows_core
--   (0052's version), the same internal reader the Daily report, History
--   and Export use. So EVERY rule is Finance's: which payments count,
--   undone / edited / moved / refund / returned-check states, the school
--   STORED ON each payment (the desk that took the money), the names. The
--   figures come from Finance's own public.finance_figures_from, so a
--   report adds up to exactly what the Daily reports of its days say.
--   Each payment counts on the day it was paid. A Color Belt PRIVATE
--   testing has no event and never appears; a Star private candidate
--   belongs to its Star event and does appear, flagged is_private.
--   One detail: finance_money_rows_core only looks at payments inside the
--   range of days it is given, and a payment can never be dated after
--   today, so the range used is 2020-01-01 (the first day Finance
--   accepts) up to today. (The contract wrote NULL for both ends; the core
--   finds no payments at all when they are NULL.)
--
-- SECURITY
--   Same rules as every Finance function: security definer,
--   search_path = '', fully qualified names, has_data_access() FIRST, then
--   is_admin() (staff get not_allowed), then the input, and every answer is
--   {"status": ...}. Revoked from public, anon, authenticated and
--   service_role; the two app functions are granted to authenticated only.
--   Nothing for anon. The table: RLS on, no rules, no rights for anon,
--   authenticated or service_role. No login id and no private data is
--   returned (names and money only, as the Daily report shows them).
--   Staff NEVER see the report (the admin-only choice, Jeffrey 2026-11-19).
--
-- WHAT TO KNOW BEFORE APPLYING
--   * Order: after 0052 (live). The guard below stops - and changes
--     nothing - if 0052's version of finance_money_rows_core is not there.
--   * Nothing existing changes: no live function is replaced, no row is
--     touched. The live app does not know these functions and does not
--     call them; the Event reports screen that does is pushed after this
--     file is live (and after Jeffrey's OK).
--   * ONE WORD NOTE: the append-only guard trigger of the new table has to
--     say "before update or delete" (like finance_exports' did in 0011),
--     so this file contains that one word. Jeffrey pastes migrations in
--     the SQL Editor himself, so it makes no difference there; it only
--     means the Supabase connector (which refuses that word) can not
--     apply this file. The tests, the fingerprints and the pre-check files
--     do not contain it.
--
-- HOW TO RUN IT
--   Supabase dashboard -> SQL Editor -> New query -> paste this WHOLE file
--   -> Run. It starts with "begin;" and ends with "commit;", so it is one
--   transaction: if anything fails, nothing is kept. Safe to run again
--   (tested in PGlite, run.mjs step0054: a second run changes no
--   fingerprint and writes no row). Forward-only: nothing existing was
--   changed, so there is nothing to put back (the table and the six
--   functions could be removed by a later migration).
-- =====================================================================

begin;


-- ---------------------------------------------------------------------
-- 1. The guard: stops here - and changes nothing - unless 0052 is live.
--    finance_money_rows_core must be exactly 0052's text (compared by an
--    md5 of the code without comments and white space, the same way the
--    fingerprints files do), because the functions below read its columns
--    by name. The other tools this file uses must exist too.
-- ---------------------------------------------------------------------
do $$
declare
  v_md5 text;
begin
  if to_regprocedure('public.finance_money_rows_core(text, date, date, text, uuid)') is null
     or to_regprocedure('public.finance_figures_from(jsonb, text, date, date)') is null
     or to_regprocedure('public.finance_append_only()') is null
     or to_regprocedure('public.change_log_write()') is null
     or to_regprocedure('public.testing_refuse_truncate()') is null
     or to_regprocedure('public.change_log_actor_name()') is null then
    raise exception '0054 needs Finance (migrations 0011, 0026, 0047 and 0052) first';
  end if;
  if to_regclass('public.brk_events') is null or to_regclass('public.bb_cycles') is null
     or to_regclass('public.camps') is null or to_regclass('public.star_events') is null
     or to_regclass('public.testing_events') is null then
    raise exception '0054 needs the event tables of Color Belt, Star, Camps, Black Belt and Board breaking first';
  end if;
  select md5(regexp_replace(regexp_replace(p.prosrc, '--[^\n]*', '', 'g'), '\s+', '', 'g'))
    into v_md5
    from pg_proc p
   where p.oid = to_regprocedure('public.finance_money_rows_core(text, date, date, text, uuid)');
  if v_md5 is distinct from '534cb48c5cc6d5f6c9be6ce4ca0e0d8d' then
    raise exception '0054 was built over 0052''s finance_money_rows_core, but the live one is different (md5 %) - rebuild 0054 first', v_md5;
  end if;
end;
$$;


-- ---------------------------------------------------------------------
-- 2. The table: one row per event CSV download (twin of finance_exports,
--    0011 section 2e). downloaded_by (a login id, filled by its default)
--    is never returned. No foreign key on event_id on purpose: the five
--    kinds of event live in five different tables.
-- ---------------------------------------------------------------------
create table if not exists public.finance_event_exports (
  id                 uuid        not null default gen_random_uuid(),
  source             text        not null,
  event_id           uuid        not null,
  event_name         text        not null,
  location_code      text        null,       -- NULL = both schools
  row_count          integer     not null,
  downloaded_at      timestamptz not null default now(),
  downloaded_by      uuid        null default auth.uid(),   -- login id; no foreign key on purpose
  downloaded_by_name text        not null,

  constraint finance_event_exports_pkey primary key (id),
  constraint finance_event_exports_source_check
    check (source in ('color_belt', 'star', 'camp', 'black_belt', 'board_breaking')),
  constraint finance_event_exports_location_fk
    foreign key (location_code) references public.locations (code),
  constraint finance_event_exports_row_count_check check (row_count >= 0)
);

comment on table public.finance_event_exports is
  'Log of every Finance event CSV download. Append-only. downloaded_by (a login id) is never returned. Written only by finance_event_export.';


-- ---------------------------------------------------------------------
-- 3. Guard triggers and history for the new table (as finance_exports in
--    0011 section 2f). "create or replace trigger" makes a re-run safe.
-- ---------------------------------------------------------------------
-- append-only: an update or a removal is always refused, even for the SQL
-- Editor's role. A mistake is never fixed by changing a log row.
create or replace trigger finance_event_exports_append_only
  before update or delete on public.finance_event_exports
  for each row execute function public.finance_append_only();

-- History: 0003's change_log_write (the table has "id" and "location_code").
create or replace trigger finance_event_exports_log
  after insert or update or delete on public.finance_event_exports
  for each row execute function public.change_log_write();

-- No "empty the whole table" shortcut (it would skip the history), as 0003.
create or replace trigger finance_event_exports_no_truncate
  before truncate on public.finance_event_exports
  for each statement execute function public.testing_refuse_truncate();


-- ---------------------------------------------------------------------
-- 4. Security rules for the table: RLS on, NO rules and NO rights for
--    anyone in the app (the same as finance_exports, 0011 section 4).
--    Every write goes through finance_event_export below (a security
--    definer function), and nothing in the app reads the table.
-- ---------------------------------------------------------------------
alter table public.finance_event_exports enable row level security;

revoke all on table public.finance_event_exports from public, anon, authenticated, service_role;


-- ---------------------------------------------------------------------
-- 5. The internal helpers (nobody in the app can call them)
-- ---------------------------------------------------------------------

-- 5a. finance_event_check(source, event, school): checks 3-5 of the contract
--   3. the source is one of the five and the event id is given -> invalid
--   4. the school, when given, exists                         -> not_found
--   5. the event exists in ITS table                          -> not_found
-- Answers {status:'ok', event_name} or {status: ...}.
create or replace function public.finance_event_check(p_source text, p_event_id uuid, p_location_code text)
returns jsonb
language plpgsql
stable
set search_path = ''
as $$
declare
  v_name text;
begin
  if p_source is null
     or p_source not in ('color_belt', 'star', 'camp', 'black_belt', 'board_breaking')
     or p_event_id is null then
    return jsonb_build_object('status', 'invalid');
  end if;
  if p_location_code is not null
     and not exists (select 1 from public.locations l where l.code = p_location_code) then
    return jsonb_build_object('status', 'not_found');
  end if;
  v_name := case p_source
              when 'color_belt'     then (select e.name from public.testing_events e where e.id = p_event_id)
              when 'star'           then (select e.name from public.star_events e where e.id = p_event_id)
              when 'camp'           then (select e.name from public.camps e where e.id = p_event_id)
              when 'black_belt'     then (select e.name from public.bb_cycles e where e.id = p_event_id)
              else                       (select e.name from public.brk_events e where e.id = p_event_id)
            end;
  if v_name is null then
    return jsonb_build_object('status', 'not_found');
  end if;
  return jsonb_build_object('status', 'ok', 'event_name', v_name);
end;
$$;

revoke execute on function public.finance_event_check(text, uuid, text) from public, anon, authenticated, service_role;

-- 5b. finance_event_items(source, event, school): ALL the event's money
-- lines as one JSON array, exactly as Finance's reader gives them (every
-- state: counted, edited, moved in / out, undone, refund, returned check).
-- p_source does not narrow finance_money_rows_core when no owner is given,
-- so the lines are filtered by source and event here. A Color Belt private
-- testing line has no event id and is never in the result.
create or replace function public.finance_event_items(p_source text, p_event_id uuid, p_location_code text)
returns jsonb
language sql
stable
set search_path = ''
as $$
  select coalesce(jsonb_agg(to_jsonb(m)), '[]'::jsonb)
    from public.finance_money_rows_core(p_location_code, date '2020-01-01', public.testing_today(), p_source, null) m
   where m.source = p_source
     and m.event_id = p_event_id;
$$;

revoke execute on function public.finance_event_items(text, uuid, text) from public, anon, authenticated, service_role;

-- 5c. finance_event_figures(rows): the totals / refunds / returned figures
-- of a set of (school, day) figure rows (JSON rows with pay_count,
-- total_cents, in_cents, cash_*, check_*, card_*, refund_*, returned_*),
-- in the shape of finance_day:
--   totals   {count, total_cents, in_cents, net_cents, cash/check/card {count, cents}}
--   refunds  {count, cents, cash_cents, check_cents, card_cents}
--   returned {count, cents}
-- Adds the rows up (an empty set gives zeros). total_cents = net_cents.
create or replace function public.finance_event_figures(p_rows jsonb)
returns jsonb
language sql
stable
set search_path = ''
as $$
  select jsonb_build_object(
           'totals', jsonb_build_object(
             'count',       coalesce(sum(x.pay_count), 0)::integer,
             'total_cents', coalesce(sum(x.total_cents), 0)::integer,
             'in_cents',    coalesce(sum(x.in_cents), 0)::integer,
             'net_cents',   coalesce(sum(x.total_cents), 0)::integer,
             'cash',  jsonb_build_object('count', coalesce(sum(x.cash_count), 0)::integer,
                                         'cents', coalesce(sum(x.cash_cents), 0)::integer),
             'check', jsonb_build_object('count', coalesce(sum(x.check_count), 0)::integer,
                                         'cents', coalesce(sum(x.check_cents), 0)::integer),
             'card',  jsonb_build_object('count', coalesce(sum(x.card_count), 0)::integer,
                                         'cents', coalesce(sum(x.card_cents), 0)::integer)),
           'refunds', jsonb_build_object(
             'count',       coalesce(sum(x.refund_count), 0)::integer,
             'cents',       coalesce(sum(x.refund_cents), 0)::integer,
             'cash_cents',  coalesce(sum(x.refund_cash_cents), 0)::integer,
             'check_cents', coalesce(sum(x.refund_check_cents), 0)::integer,
             'card_cents',  (coalesce(sum(x.refund_cents), 0) - coalesce(sum(x.refund_cash_cents), 0)
                             - coalesce(sum(x.refund_check_cents), 0))::integer),
           'returned', jsonb_build_object(
             'count', coalesce(sum(x.returned_count), 0)::integer,
             'cents', coalesce(sum(x.returned_cents), 0)::integer))
    from jsonb_to_recordset(coalesce(p_rows, '[]'::jsonb))
         as x(pay_count integer, total_cents integer, in_cents integer,
              cash_count integer, cash_cents integer, check_count integer, check_cents integer,
              card_count integer, card_cents integer,
              refund_count integer, refund_cents integer, refund_cash_cents integer, refund_check_cents integer,
              returned_count integer, returned_cents integer);
$$;

revoke execute on function public.finance_event_figures(jsonb) from public, anon, authenticated, service_role;

-- 5d. finance_event_extras(source, payment row id, event name): the extra
-- keys finance_day / finance_export add to a line of some sources (the
-- same keys, from 0017 camps, 0026 Black Belt and 0052 Board breaking):
--   camp, board breaking: event_name
--   black belt: event_name (the cycle), for_items, one_payment_plan (the
--     name of the candidate's one-payment plan, if any) and handed_in_on
--     (a returned check: the day the check was handed in)
--   color belt, star: nothing
create or replace function public.finance_event_extras(p_source text, p_row_id uuid, p_event_name text)
returns jsonb
language sql
stable
set search_path = ''
as $$
  select case
           when p_source in ('camp', 'board_breaking') then
             jsonb_build_object('event_name', p_event_name)
           when p_source = 'black_belt' then
             coalesce((select jsonb_build_object(
                                'event_name', bp.cycle_name,
                                'for_items', to_jsonb(coalesce(bk.for_items, bp.for_items)),
                                'one_payment_plan', (select pl.name from public.bb_candidates bc
                                                       join public.bb_cycle_plans pl on pl.id = bc.cycle_plan_id
                                                      where bc.id = bp.candidate_id and pl.payments_count = 1),
                                'handed_in_on', bk.paid_on)
                         from public.bb_payments bp
                         left join public.bb_payments bk on bp.kind = 'returned' and bk.id = bp.reverses_payment_id
                        where bp.id = p_row_id), '{}'::jsonb)
           else '{}'::jsonb
         end;
$$;

revoke execute on function public.finance_event_extras(text, uuid, text) from public, anon, authenticated, service_role;


-- ---------------------------------------------------------------------
-- 6. The report (admins only)
-- finance_event_report(p_source, p_event_id, p_location_code = both schools)
-- Checks, in this order, each answering {"status": ...}:
--   1. has_data_access() not true      -> no_access
--   2. is_admin() not true             -> not_allowed (staff never see it)
--   3. bad source / no event id        -> invalid
--   4. unknown school                  -> not_found
--   5. the event does not exist        -> not_found
-- Ok: {status:'ok', source, school, event:{id, name},
--      totals, refunds, returned           (all the event's money, as finance_day)
--      by_school: [{school, totals, refunds, returned}]  Worcester first
--      days: [{day, totals, refunds, returned,
--              items: [one finance_day item + school + the camp / Black Belt /
--                      Board breaking extras]}]           newest day first}
-- Counting rules are Finance's (finance_figures_from): only lines that count
-- add up; the count and the money in are payments only; refunds are negative;
-- net = total_cents; a returned Black Belt check is in the total only.
-- ---------------------------------------------------------------------
create or replace function public.finance_event_report(p_source text, p_event_id uuid, p_location_code text default null)
returns jsonb
language plpgsql
stable
security definer
set search_path = ''
as $$
declare
  v_check     jsonb;
  v_all       jsonb;
  v_min       date;
  v_max       date;
  v_g         jsonb := '[]'::jsonb;   -- one row of figures per school and day that has lines
  v_days      jsonb;
  v_by_school jsonb;
begin
  if public.has_data_access() is not true then
    return jsonb_build_object('status', 'no_access');
  end if;
  if public.is_admin() is not true then
    return jsonb_build_object('status', 'not_allowed');
  end if;
  v_check := public.finance_event_check(p_source, p_event_id, p_location_code);
  if v_check ->> 'status' <> 'ok' then
    return v_check;
  end if;

  -- the event's lines, built ONCE; the figures and the list come from this one copy
  v_all := public.finance_event_items(p_source, p_event_id, p_location_code);
  select min(x.day), max(x.day) into v_min, v_max
    from jsonb_to_recordset(v_all) as x(day date);

  if v_min is not null then
    -- Finance's own figures for every school and day of the event's range, kept for the
    -- days that have lines, with the returned checks that count (as finance_day)
    select coalesce(jsonb_agg(to_jsonb(q)), '[]'::jsonb)
      into v_g
      from (select f.school, f.day, f.pay_count, f.total_cents, f.in_cents,
                   f.cash_count, f.cash_cents, f.check_count, f.check_cents, f.card_count, f.card_cents,
                   f.refund_count, f.refund_cents, f.refund_cash_cents, f.refund_check_cents,
                   coalesce(r.n, 0)::integer as returned_count, coalesce(r.c, 0)::integer as returned_cents
              from public.finance_figures_from(v_all, p_location_code, v_min, v_max) f
              left join (select y.school, y.day, count(*) as n, sum(y.amount_cents) as c
                           from jsonb_to_recordset(v_all) as y(school text, day date, kind text, counts boolean, amount_cents integer)
                          where y.kind = 'returned' and y.counts
                          group by y.school, y.day) r
                     on r.school = f.school and r.day = f.day
             where exists (select 1 from jsonb_to_recordset(v_all) as z(school text, day date)
                            where z.school = f.school and z.day = f.day)) q;
  end if;

  -- per school: Worcester first, then Shrewsbury (never alphabetical)
  select coalesce(jsonb_agg(jsonb_build_object('school', s.school)
                            || public.finance_event_figures((select coalesce(jsonb_agg(g.e), '[]'::jsonb)
                                                               from jsonb_array_elements(v_g) as g(e)
                                                              where g.e ->> 'school' = s.school))
                            order by case s.school when 'worcester' then 0 when 'shrewsbury' then 1 else 2 end,
                                     s.school collate "C"), '[]'::jsonb)
    into v_by_school
    from (select distinct x.school from jsonb_to_recordset(v_all) as x(school text)) s;

  -- per day, newest first: its figures and its lines (in the order of finance_day's list)
  select coalesce(jsonb_agg(d.obj order by d.day desc), '[]'::jsonb)
    into v_days
    from (select dd.day,
                 jsonb_build_object('day', dd.day)
                 || public.finance_event_figures((select coalesce(jsonb_agg(g.e), '[]'::jsonb)
                                                    from jsonb_array_elements(v_g) as g(e)
                                                   where (g.e ->> 'day')::date = dd.day))
                 || jsonb_build_object('items',
                      (select coalesce(jsonb_agg(
                                jsonb_build_object(
                                  'source', m.source, 'payment_id', m.payment_id, 'day', m.day, 'time', m."time",
                                  'first_name', m.first_name, 'last_name', m.last_name, 'what', m.what,
                                  'event_date', m.event_date, 'is_private', m.is_private, 'kind', m.kind,
                                  'method', m.method, 'amount_cents', m.amount_cents, 'state', m.state,
                                  'was_amount_cents', m.was_amount_cents, 'was_method', m.was_method,
                                  'was_school', m.was_school,
                                  'moved_to', m.moved_to, 'moved_from', m.moved_from,
                                  'changed_by_name', m.changed_by_name, 'changed_on', m.changed_on,
                                  'recorded_by_name', m.recorded_by_name, 'school', m.school)
                                || public.finance_event_extras(m.source, m.row_id, m.event_name)
                                order by m.row_recorded_at, m.last_name, m.first_name, m.payment_id), '[]'::jsonb)
                         from jsonb_to_recordset(v_all)
                              as m(source text, payment_id uuid, school text, day date, "time" text,
                                   first_name text, last_name text, what text, event_date date, is_private boolean,
                                   kind text, method text, amount_cents integer, state text,
                                   was_amount_cents integer, was_method text, was_school text,
                                   moved_to date, moved_from date, changed_by_name text, changed_on date,
                                   recorded_by_name text, row_id uuid, row_recorded_at timestamptz, event_name text)
                        where m.day = dd.day)) as obj
            from (select distinct x.day from jsonb_to_recordset(v_all) as x(day date)) dd) d;

  return jsonb_build_object('status', 'ok', 'source', p_source, 'school', p_location_code,
                            'event', jsonb_build_object('id', p_event_id, 'name', v_check ->> 'event_name'))
         || public.finance_event_figures(v_g)
         || jsonb_build_object('by_school', v_by_school, 'days', v_days);
end;
$$;

revoke execute on function public.finance_event_report(text, uuid, text) from public, anon, authenticated, service_role;
grant  execute on function public.finance_event_report(text, uuid, text) to authenticated;


-- ---------------------------------------------------------------------
-- 7. The CSV rows + one log row (admins only)
-- finance_event_export(p_source, p_event_id, p_location_code = both schools)
-- The same five checks as the report. Ok: {status:'ok', source, event_name,
-- school, rows:[...]}: one row per line, with exactly the keys of one
-- finance_export row (day, school, time, first_name, last_name, what,
-- event_date, is_private, was_school, kind, method, amount_cents,
-- counted_cents, recorded_by_name, state, note, plus event_name for camp /
-- Board breaking and the Black Belt keys), in the order day, recorded time,
-- last name, first name, payment id. Writes ONE row into
-- finance_event_exports per call (same transaction as the answer).
-- ---------------------------------------------------------------------
create or replace function public.finance_event_export(p_source text, p_event_id uuid, p_location_code text default null)
returns jsonb
language plpgsql
volatile
security definer
set search_path = ''
as $$
declare
  v_check jsonb;
  v_all   jsonb;
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
    v_check := public.finance_event_check(p_source, p_event_id, p_location_code);
    if v_check ->> 'status' <> 'ok' then
      return v_check;
    end if;

    v_all := public.finance_event_items(p_source, p_event_id, p_location_code);

    select coalesce(jsonb_agg(jsonb_build_object(
             'day', m.day, 'school', m.school, 'time', m."time",
             'first_name', m.first_name, 'last_name', m.last_name, 'what', m.what,
             'event_date', m.event_date, 'is_private', m.is_private, 'was_school', m.was_school,
             'kind', m.kind, 'method', m.method,
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
             || public.finance_event_extras(m.source, m.row_id, m.event_name)
             order by m.day, m.row_recorded_at, m.last_name, m.first_name, m.payment_id), '[]'::jsonb),
           count(*)::integer
      into v_rows, v_count
      from jsonb_to_recordset(v_all)
           as m(source text, payment_id uuid, school text, day date, "time" text,
                first_name text, last_name text, what text, event_date date, is_private boolean,
                kind text, method text, amount_cents integer, state text,
                was_amount_cents integer, was_method text, was_school text,
                moved_to date, moved_from date, changed_by_name text, changed_on date,
                recorded_by_name text, row_id uuid, counts boolean, row_recorded_at timestamptz, event_name text);

    perform set_config('tkd.action', 'finance_event_export', true);
    perform set_config('tkd.batch_id', gen_random_uuid()::text, true);

    insert into public.finance_event_exports (source, event_id, event_name, location_code, row_count, downloaded_by_name)
    values (p_source, p_event_id, v_check ->> 'event_name', p_location_code, v_count, public.change_log_actor_name());

    perform set_config('tkd.action', '', true);
    perform set_config('tkd.batch_id', '', true);

    return jsonb_build_object('status', 'ok', 'source', p_source, 'event_name', v_check ->> 'event_name',
                              'school', p_location_code, 'rows', v_rows);
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

revoke execute on function public.finance_event_export(text, uuid, text) from public, anon, authenticated, service_role;
grant  execute on function public.finance_event_export(text, uuid, text) to authenticated;


commit;

-- End of 0054_finance_event_report.sql
