-- =====================================================================
-- 0047_finance_stored_school.sql
-- ---------------------------------------------------------------------
-- WHAT THIS FILE IS
--   Finance's Batch A (design review, rolling check pass 1: R1-01, and the
--   school-only edit left open by U-1). It runs AFTER Star's 0038 and Color
--   Belt's 0044 (both put the school of the desk that took the money ON
--   each payment: star_payments.school, testing_payments.school,
--   testing_private_payments.school) and REPLACES five Finance functions,
--   each starting from the live text (0011 / 0026 / 0037):
--     finance_money_rows_core   (0026)  where a payment line counts, + was_school
--     finance_money_rows        (0011)  its wrapper (same result table + was_school)
--     finance_day               (0026)  items gain was_school
--     finance_payment_detail    (0026)  the item gains was_school
--     finance_export            (0037)  rows gain was_school
--   Nothing else changes: no table, no table rule, no other function, no
--   right, no data.
--
-- WHY IT EXISTS
--   1. R1-01. Until now a Star payment counted at the CANDIDATE's school and
--      a Color Belt payment at the EVENT's (or private testing's) school,
--      whatever desk took the money. Camps (camp_payments.school) and Black
--      Belt (bb_payments.location_code) already counted at the school stored
--      on the payment (0017 / 0026), so they need no change here. Now all
--      sections agree: a line - a refund included - counts at the school
--      STORED ON THE PAYMENT SHOWN (rulebook v1.040: each drawer's report
--      matches what went in and out of that drawer). A payment with no
--      stored school (none exist once 0038 and 0044 have run; they fill
--      every old row from its candidate / event) keeps the old school.
--   2. U-1 follow-up (Jeffrey, 2026-11-05: "Commit A, fix in R1-01"): after
--      an Edit payment that only changed the SCHOOL (Camps' Edit payment can
--      correct "the desk that took it"), the line said "Edited" with nothing
--      to say what changed. Now each line carries was_school.
--
-- WHAT IT CHANGES
--   * The school of a line (the report it appears on, and the school filter
--     of every report): Star -> star_payments.school of the row shown;
--     Color Belt event line -> testing_payments.school of the row shown;
--     private testing line -> testing_private_payments.school of the row
--     shown; each falls back to the old school when NULL.
--   * New column was_school (text, the school code): for a line whose state
--     is 'edited' or 'moved_in', the school of the chain's FIRST payment
--     (chain_id is that row) when it is NOT the line's own school; NULL for
--     every other line. Every item in finance_day, the item of
--     finance_payment_detail and every row of finance_export carries the
--     key (null or a school code). It says nothing private: a school.
--   * Everything else in the five functions is the live text, character for
--     character (the md5s below prove which text each was built from).
--   Same names, same arguments, same security (definer / search_path = ''),
--   same owner, same revoke and grant lines (the two internal helpers: nobody
--   but the owner; the three app functions: authenticated only; nothing for
--   anon). The two internal ones change their RESULT TABLE (one more
--   column), which "create or replace" cannot do, so they are dropped and
--   created again (they are called only from inside the database).
--
-- WHO USES THEM (checked: every migration in supabase/migrations)
--   finance_money_rows_core: finance_money_rows, finance_payment_detail.
--   finance_money_rows: finance_items_json (to_jsonb of a row: was_school
--   flows through), finance_export. The other readers (figures, history,
--   close the day, both schools) work from the items' JSON by field name,
--   so one more field changes nothing for them.
--
-- WHAT TO KNOW BEFORE APPLYING
--   * Order: Star's 0038 and Color Belt's 0044 first (this file refuses to
--     run without their columns). It must be live BEFORE the Star and Color
--     Belt apps that send a school are pushed: until then Finance counts
--     those payments at the old school anyway, so nothing breaks either way.
--   * The live app ignores keys it doesn't know, so pasting this before the
--     Finance app update changes nothing on screen.
--   * Existing days do not move: 0038 and 0044 fill every old payment with
--     the school it was counted at, so every closed day keeps its figures.
--
-- HOW TO RUN IT
--   Supabase dashboard -> SQL Editor -> New query -> paste this WHOLE file
--   -> Run. It starts with "begin;" and ends with "commit;", so it is one
--   transaction: if anything fails, nothing is kept. It contains two "drop
--   function" lines (the two internal helpers, created again right after),
--   so Supabase shows a destructive-operations warning: that is expected.
--   Safe to run again: the guard accepts the live text OR this file's text,
--   the helpers are dropped and created again, "create or replace" puts the
--   same text back (tested in PGlite, run.mjs step0047: a second run changes
--   no fingerprint). Forward-only: no undo file (the app works with or
--   without was_school; going back would need a new migration).
-- =====================================================================

begin;


-- ---------------------------------------------------------------------
-- 1. The guard: stops here - and changes nothing - unless
--    * 0038 and 0044 are applied (the three school columns exist), and
--    * each of the five functions is EXACTLY the live text (or what this
--      file made, on a re-run), compared by the md5 of the function's code
--      without comments and white space, the same way the fingerprints
--      files do. If someone changed one since, pasting this file would
--      silently undo that change - so this file must be rebuilt first.
--      (function, live md5, this file's md5)
-- ---------------------------------------------------------------------
do $$
declare
  v_row record;
  v_md5 text;
begin
  if not exists (select 1 from information_schema.columns
                  where table_schema = 'public' and table_name = 'star_payments' and column_name = 'school')
     or not exists (select 1 from information_schema.columns
                     where table_schema = 'public' and table_name = 'testing_payments' and column_name = 'school')
     or not exists (select 1 from information_schema.columns
                     where table_schema = 'public' and table_name = 'testing_private_payments' and column_name = 'school') then
    raise exception '0047 needs Star''s 0038 and Color Belt''s 0044 first (the school column on each payment table)';
  end if;
  for v_row in
    select * from (values
      ('public.finance_money_rows_core(text, date, date, text, uuid)', '77bc764dfe331a09919ac7c72962b76c', '11479fb6451a956b5f8bb5bc6b5c0366'),
      ('public.finance_money_rows(text, date, date)', '6882b0a0f80407ba97864f47feae0e7f', '6882b0a0f80407ba97864f47feae0e7f'),
      ('public.finance_day(text, date)', '3f6831f61735e1447c5974cc1dcba2ff', '8cb806284e54443fb73bd4a8f679b617'),
      ('public.finance_payment_detail(text, uuid)', '31e25e5951b33aeac8ee4900271f885a', 'cc90ec717325831a58a3063c9cb73c12'),
      ('public.finance_export(text, date, date)', 'f812a5b147fda8d8603afe907abd2137', '0f4b678f757bca72fec14bb78aacd37d')
    ) as t(sig, live_md5, new_md5)
  loop
    if to_regprocedure(v_row.sig) is null then
      raise exception '0047 needs % (Finance, migration 0026) first', v_row.sig;
    end if;
    select md5(regexp_replace(regexp_replace(p.prosrc, '--[^\n]*', '', 'g'), '\s+', '', 'g'))
      into v_md5
      from pg_proc p
     where p.oid = to_regprocedure(v_row.sig);
    if v_md5 not in (v_row.live_md5, v_row.new_md5) then
      raise exception '0047 was built over the live %, but the live one is different (md5 %) - rebuild 0047 first', v_row.sig, v_md5;
    end if;
  end loop;
end;
$$;


-- ---------------------------------------------------------------------
-- 2. The two internal helpers: new result column, so drop and create again
--    (the wrapper first: it calls the core)
-- ---------------------------------------------------------------------
drop function if exists public.finance_money_rows(text, date, date);
drop function if exists public.finance_money_rows_core(text, date, date, text, uuid);

-- 3b (0011, 0017, 0018, 0026) with the STORED payment school (0047, R1-01).
-- Star and Color Belt (event and private) lines count at the school stored on
-- the payment row shown - the desk that took the money - like Camps
-- (camp_payments.school) and Black Belt (bb_payments.location_code) already
-- did (refund rows included: a refund counts at the desk that hands the money
-- back). New last column was_school: for an edited / moved-in line, the school
-- of the chain's first payment when it is not the line's own school.
create function public.finance_money_rows_core(
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
  event_id          uuid,
  was_school        text   -- 0047: the school of an edited line's FIRST payment, when another one
)
language sql
stable
set search_path = ''
as $$
  select i.source, i.chain_id,
         case
           -- ===== source: camp (0017) =====
           when i.source = 'camp' then cp.school
           -- ===== end camp =====
           -- ===== source: black belt (0026) =====
           when i.source = 'black_belt' then bp.location_code
           -- ===== end black belt =====
           -- ===== source: stored payment school (0047) =====
           -- Star and Color Belt count at the school STORED ON THE PAYMENT shown (the desk that
           -- took the money; a payment without one - never after 0038 / 0044 - keeps the
           -- candidate's / event's / private testing's school, as before)
           when i.source = 'star' then coalesce(sp.school, c.location_code)
           when tp.id is not null then coalesce(tpp2.school, tp.location_code)
           when i.source = 'color_belt' then coalesce(cbp.school, e.location_code)
           else coalesce(tp.location_code, e.location_code, c.location_code) end,
           -- ===== end stored payment school =====
         i.day,
         to_char(i.recorded_at at time zone 'America/New_York', 'HH24:MI'),
         coalesce(tp.first_name, g.first_name, c.first_name   -- 0018: tp first
                  -- ===== source: camp (0017) =====
                  , cc.first_name
                  -- ===== end camp =====
                  -- ===== source: black belt (0026) =====
                  , bc.first_name
                  -- ===== end black belt =====
                  ),
         coalesce(tp.last_name, g.last_name, c.last_name   -- 0018: tp first
                  -- ===== source: camp (0017) =====
                  , cc.last_name
                  -- ===== end camp =====
                  -- ===== source: black belt (0026) =====
                  , bc.last_name
                  -- ===== end black belt =====
                  ),
         i.source,
         case when tp.id is not null then tp.private_date   -- 0018
              when i.source = 'color_belt' then e.testing_date   -- 0018: (moved down a line)
              -- ===== source: camp (0017) =====
              when i.source = 'camp' then public.camp_first_day(ck.id)
              -- ===== end camp =====
              -- ===== source: black belt (0026) =====
              when i.source = 'black_belt' then null::date
              -- ===== end black belt =====
              else coalesce(c.private_on, se.testing_date) end,
         (tp.id is not null or (i.source = 'star' and c.private_on is not null)),   -- 0018: tp
         i.kind, i.method, i.amount_cents, i.state,
         i.was_amount_cents, i.was_method, i.moved_to, i.moved_from,
         i.changed_by_name, i.changed_on, i.recorded_by_name,
         i.row_id, i.state in ('counted', 'edited', 'moved_in'), i.first_recorded_at, i.recorded_at,
         case when tp.id is null then coalesce(e.name, se.name   -- 0018: no event for a private row
                  -- ===== source: camp (0017) =====
                  , ck.name
                  -- ===== end camp =====
                  -- ===== source: black belt (0026) =====
                  , bp.cycle_name
                  -- ===== end black belt =====
                  ) end,   -- 0018
         case when tp.id is null then coalesce(e.id, se.id   -- 0018: no event for a private row
                  -- ===== source: camp (0017) =====
                  , ck.id
                  -- ===== end camp =====
                  -- ===== source: black belt (0026) =====
                  , bp.cycle_id
                  -- ===== end black belt =====
                  ) end,   -- 0018
         -- ===== source: stored payment school (0047) =====
         -- was_school: an edited / moved-in line whose FIRST payment (chain_id is its row)
         -- was taken at another school than the line shown - NULL otherwise
         case when i.state in ('edited', 'moved_in') then
           (select f.s
              from (select case
                      when i.source = 'star'       then (select x.school from public.star_payments x where x.id = i.chain_id)
                      when i.source = 'camp'       then (select x.school from public.camp_payments x where x.id = i.chain_id)
                      when i.source = 'black_belt' then (select x.location_code from public.bb_payments x where x.id = i.chain_id)
                      else coalesce((select x.school from public.testing_payments x where x.id = i.chain_id),
                                    (select x.school from public.testing_private_payments x where x.id = i.chain_id)) end as s) f
             where f.s is distinct from (case
                      when i.source = 'camp' then cp.school
                      when i.source = 'black_belt' then bp.location_code
                      when i.source = 'star' then coalesce(sp.school, c.location_code)
                      when tp.id is not null then coalesce(tpp2.school, tp.location_code)
                      when i.source = 'color_belt' then coalesce(cbp.school, e.location_code)
                      else coalesce(tp.location_code, e.location_code, c.location_code) end))
         end
         -- ===== end stored payment school =====
    from public.finance_chain_items(p_from, p_to, p_source, p_owner) i
    left join public.testing_registrations g on i.source = 'color_belt' and g.id = i.owner_id
    left join public.testing_events e on e.id = g.event_id
    left join public.star_candidates c on i.source = 'star' and c.id = i.owner_id
    left join public.star_events se on se.id = c.event_id
    -- ===== source: color belt private (0018) =====
    left join public.testing_private tp on tp.id = i.private_id
    -- ===== end color belt private =====
    -- ===== source: camp (0017) =====
    -- the camper, the camp, and the school of the row shown (the desk that
    -- took that money, camp_payments.school)
    left join public.camp_payments cp on i.source = 'camp' and cp.id = i.row_id
    left join public.camp_campers cc on i.source = 'camp' and cc.id = i.owner_id
    left join public.camps ck on ck.id = cc.camp_id
    -- ===== end camp =====
    -- ===== source: black belt (0026) =====
    -- the Black Belt row shown (its school and cycle as recorded) and the
    -- candidate (names only)
    left join public.bb_payments bp on i.source = 'black_belt' and bp.id = i.row_id
    left join public.bb_candidates bc on i.source = 'black_belt' and bc.id = i.owner_id
    -- ===== end black belt =====
    -- ===== source: stored payment school (0047) =====
    -- the payment row SHOWN, in its own table (the shown row of a private testing line is a
    -- private testing payment; of any other Color Belt line, an event payment)
    left join public.star_payments sp on i.source = 'star' and sp.id = i.row_id
    left join public.testing_payments cbp on i.source = 'color_belt' and i.private_id is null and cbp.id = i.row_id
    left join public.testing_private_payments tpp2 on i.private_id is not null and tpp2.id = i.row_id
    -- ===== end stored payment school =====
   where (tp.id is not null or e.id is not null or se.id is not null   -- 0018: tp
          -- ===== source: camp (0017) =====
          or ck.id is not null
          -- ===== end camp =====
          -- ===== source: black belt (0026) =====
          or bc.id is not null
          -- ===== end black belt =====
          )
     and (p_location_code is null
          or (case
                -- ===== source: camp (0017) =====
                when i.source = 'camp' then cp.school
                -- ===== end camp =====
                -- ===== source: black belt (0026) =====
                when i.source = 'black_belt' then bp.location_code
                -- ===== end black belt =====
                -- ===== source: stored payment school (0047) =====
                when i.source = 'star' then coalesce(sp.school, c.location_code)
                when tp.id is not null then coalesce(tpp2.school, tp.location_code)
                when i.source = 'color_belt' then coalesce(cbp.school, e.location_code)
                else coalesce(tp.location_code, e.location_code, c.location_code) end) = p_location_code)
                -- ===== end stored payment school =====
     and (p_from is null or i.day >= p_from)
     and (p_to is null or i.day <= p_to);
$$;

revoke execute on function public.finance_money_rows_core(text, date, date, text, uuid) from public, anon, authenticated, service_role;

-- 3b2 (0011): finance_money_rows(p_location_code, p_from, p_to) - 3b for a school (NULL = both)
-- and a range of days. Only its result table changed (0047: + was_school).
create function public.finance_money_rows(p_location_code text, p_from date, p_to date)
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
  event_id          uuid,
  was_school        text   -- 0047
)
language sql
stable
set search_path = ''
as $$
  select m.* from public.finance_money_rows_core(p_location_code, p_from, p_to, null, null) m;
$$;

revoke execute on function public.finance_money_rows(text, date, date) from public, anon, authenticated, service_role;

-- ---------------------------------------------------------------------
-- 3. The three app functions (live text + the was_school key)
-- ---------------------------------------------------------------------

-- 5a (0011, 0017, 0026): finance_day - items gain was_school.
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
  -- ===== source: black belt (0026) =====
  v_returned   jsonb;
  -- ===== end black belt =====
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
           'was_school', m.was_school,   -- 0047
           'moved_to', m.moved_to, 'moved_from', m.moved_from,
           'changed_by_name', m.changed_by_name, 'changed_on', m.changed_on,
           'recorded_by_name', m.recorded_by_name,
           'added_after_closing', (v_c.id is not null and m.counts and m.kind <> 'returned'   -- 0026: not a returned check
                                   and m.first_recorded_at > v_c.recorded_at))   -- 0026
           -- ===== source: camp (0017) =====
           -- a camp line also carries the camp's name ("Camp - April Vacation
           -- Camp"); Color Belt and Star lines keep exactly their 0011 keys
           || case when m.source = 'camp' then jsonb_build_object('event_name', m.event_name) else '{}'::jsonb end
           -- ===== end camp =====
           -- ===== source: black belt (0026) =====
           -- a Black Belt line: its cycle, what it was for, the one-payment
           -- plan's name and (a returned check) the day it was handed in
           || case when m.source = 'black_belt' then
               (select jsonb_build_object(
                         'event_name', bp.cycle_name,
                         'for_items', to_jsonb(coalesce(bk.for_items, bp.for_items)),
                         'one_payment_plan', (select pl.name from public.bb_candidates bc
                                                join public.bb_cycle_plans pl on pl.id = bc.cycle_plan_id
                                               where bc.id = bp.candidate_id and pl.payments_count = 1),
                         'handed_in_on', bk.paid_on)
                  from public.bb_payments bp
                  left join public.bb_payments bk on bp.kind = 'returned' and bk.id = bp.reverses_payment_id
                 where bp.id = m.row_id)
              else '{}'::jsonb end
           -- ===== end black belt =====
           order by m.row_recorded_at, m.last_name, m.first_name, m.payment_id), '[]'::jsonb)
    into v_items
    from jsonb_to_recordset(v_all)
         as m(source text, payment_id uuid, day date, "time" text, first_name text, last_name text, what text,
              event_date date, is_private boolean, kind text, method text, amount_cents integer, state text,
              was_amount_cents integer, was_method text, was_school text, moved_to date, moved_from date, changed_by_name text,   -- 0047: + was_school
              changed_on date, recorded_by_name text, counts boolean, first_recorded_at timestamptz,
              row_recorded_at timestamptz,
              -- ===== source: camp (0017) =====
              event_name text
              -- ===== end camp =====
              -- ===== source: black belt (0026) =====
              , row_id uuid
              -- ===== end black belt =====
              );

  -- ===== source: black belt (0026) =====
  -- the day's returned checks that count (Black Belt, v0.809)
  select jsonb_build_object('count', count(*)::integer, 'cents', coalesce(sum(x.amount_cents), 0)::integer)
    into v_returned
    from jsonb_to_recordset(v_all) as x(kind text, counts boolean, amount_cents integer)
   where x.kind = 'returned' and x.counts;
  -- ===== end black belt =====

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
                                  'cash_cents', v_f.refund_cash_cents, 'check_cents', v_f.refund_check_cents,   -- 0026: + card_cents
                                  'card_cents', v_f.refund_cents - v_f.refund_cash_cents - v_f.refund_check_cents),   -- 0026
    'returned', v_returned,   -- 0026: the returned checks (Black Belt)
    'items', v_items,
    'closing', v_closing,
    'can_close', (v_c.id is null and v_f.item_count > 0),
    'can_undo_until', v_undo_until);
end;
$$;

revoke execute on function public.finance_day(text, date) from public, anon, authenticated, service_role;
grant  execute on function public.finance_day(text, date) to authenticated;

-- 5h (0011, 0017, 0018, 0026): finance_payment_detail - the item gains was_school.
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
  if p_source is null
     or p_source not in ('color_belt', 'star'
                         -- ===== source: camp (0017) =====
                         , 'camp'
                         -- ===== end camp =====
                         -- ===== source: black belt (0026) =====
                         , 'black_belt'
                         -- ===== end black belt =====
                         )
     or p_payment_id is null then
    return jsonb_build_object('status', 'invalid');
  end if;

  -- the owner (registration / candidate); its chains are built from all
  -- its rows (3a with p_owner), whatever their dates
  if p_source = 'color_belt' then
    select p.registration_id into v_owner from public.testing_payments p where p.id = p_payment_id;
    -- ===== source: color belt private (0018) =====
    if v_owner is null then
      select coalesce(t.moved_from_registration_id, t.id) into v_owner
        from public.testing_private_payments p join public.testing_private t on t.id = p.private_id
       where p.id = p_payment_id;
    end if;
    -- (the chain itself is looked up below; this only says "the owner has rows")
    v_from := case when v_owner is not null then v_today end;
    -- ===== end color belt private =====
  -- ===== source: camp (0017) =====
  elsif p_source = 'camp' then
    -- a camp payment's owner is the camper
    select p.camper_id into v_owner from public.camp_payments p where p.id = p_payment_id;
    select min(p.paid_on), max(p.paid_on) into v_from, v_to
      from public.camp_payments p where p.camper_id = v_owner and p.kind <> 'reversal';
  -- ===== end camp =====
  -- ===== source: black belt (0026) =====
  elsif p_source = 'black_belt' then
    -- a Black Belt payment's owner is the candidate
    select p.candidate_id into v_owner from public.bb_payments p where p.id = p_payment_id;
    select min(p.paid_on), max(p.paid_on) into v_from, v_to
      from public.bb_payments p where p.candidate_id = v_owner and p.kind <> 'reversal';
  -- ===== end black belt =====
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
    from (select coalesce(c.link_at, c.recorded_at) as at, c.step as n,   -- 0018
                 -- ===== source: color belt private (0018) =====
                 -- a step's time and person are its link's (for an edit they
                 -- are the new row's, as before)
                 jsonb_build_object('at', coalesce(c.link_at, c.recorded_at),
                                    'by_name', coalesce(c.link_by_name, c.recorded_by_name),
                                    'what', case c.step_kind
                                              when 'edit' then 'edited'
                                              when 'move' then 'moved'
                                              when 'move_undone' then 'move_undone'
                                              else case when c.kind = 'refund' then 'refunded' else 'recorded' end
                                            end,
                 -- ===== end color belt private =====
                                    'amount_cents', c.amount_cents, 'method', c.method, 'paid_on', c.paid_on) as line
            from public.finance_chain_steps_core(null, null, p_source, v_owner) c
           where c.source = p_source and c.chain_id = p_payment_id
             and c.kind <> 'returned'   -- 0026: a returned check's lines are below
          union all
          select c.undo_at, 1000,
                 jsonb_build_object('at', c.undo_at, 'by_name', c.undo_by_name, 'what', 'undone',
                                    'amount_cents', -c.undo_amount_cents, 'method', c.undo_method, 'paid_on', c.undo_on)
            from public.finance_chain_steps_core(null, null, p_source, v_owner) c
           where c.source = p_source and c.chain_id = p_payment_id
             and c.step = c.last_step and c.end_state = 'undone'   -- 0026: (the bracket moved down)
             and c.kind <> 'returned'   -- 0026: a returned check's undo is 'returned_undone' (below)
          -- ===== source: black belt (0026) =====
          -- a returned check (Black Belt, v0.809): "<name> marked it returned by
          -- the bank" ('returned'), "<name> undid the returned mark"
          -- ('returned_undone'), and the check's own "recorded" line (who took
          -- the check, when, for how much - B4)
          union all
          select c.recorded_at, c.step,
                 jsonb_build_object('at', c.recorded_at, 'by_name', c.recorded_by_name, 'what', 'returned',
                                    'amount_cents', c.amount_cents, 'method', c.method, 'paid_on', c.paid_on)
            from public.finance_chain_steps_core(null, null, p_source, v_owner) c
           where c.source = p_source and c.chain_id = p_payment_id and c.kind = 'returned'
          union all
          select c.undo_at, 1000,
                 jsonb_build_object('at', c.undo_at, 'by_name', c.undo_by_name, 'what', 'returned_undone',
                                    'amount_cents', -c.undo_amount_cents, 'method', c.undo_method, 'paid_on', c.undo_on)
            from public.finance_chain_steps_core(null, null, p_source, v_owner) c
           where c.source = p_source and c.chain_id = p_payment_id and c.kind = 'returned'
             and c.step = c.last_step and c.end_state = 'undone'
          union all
          select k.recorded_at, -1,
                 jsonb_build_object('at', k.recorded_at, 'by_name', k.recorded_by_name, 'what', 'recorded',
                                    'amount_cents', k.amount_cents, 'method', k.method, 'paid_on', k.paid_on)
            from public.bb_payments r
            join public.bb_payments k on k.id = r.reverses_payment_id
           where p_source = 'black_belt' and r.id = p_payment_id and r.kind = 'returned'
          -- ===== end black belt =====
          ) as h;   -- 0026

  return jsonb_build_object(
    'status', 'ok',
    'item', jsonb_build_object(
      'source', v_item.source, 'payment_id', v_item.payment_id, 'school', v_item.school, 'day', v_item.day,
      'time', v_item."time", 'first_name', v_item.first_name, 'last_name', v_item.last_name,
      'what', v_item.what, 'event_date', v_item.event_date, 'is_private', v_item.is_private,
      'kind', v_item.kind, 'method', v_item.method, 'amount_cents', v_item.amount_cents,
      'state', v_item.state, 'was_amount_cents', v_item.was_amount_cents, 'was_method', v_item.was_method,
      'was_school', v_item.was_school,   -- 0047
      'moved_to', v_item.moved_to, 'moved_from', v_item.moved_from,
      'changed_by_name', v_item.changed_by_name, 'changed_on', v_item.changed_on,
      'recorded_by_name', v_item.recorded_by_name,
      'added_after_closing', (v_c.id is not null and v_item.counts and v_item.kind <> 'returned'   -- 0026: not a returned check
                              and v_item.first_recorded_at > v_c.recorded_at))   -- 0026
      -- ===== source: camp (0017) =====
      -- a camp item also carries the camp's name
      || case when p_source = 'camp' then jsonb_build_object('event_name', v_item.event_name) else '{}'::jsonb end
      -- ===== end camp =====
      -- ===== source: black belt (0026) =====
      -- a Black Belt item also carries its cycle, what it was for, the
      -- one-payment plan's name and (a returned check) the day the check
      -- was handed in
      || case when p_source = 'black_belt' then
          (select jsonb_build_object(
                    'event_name', bp.cycle_name,
                    'for_items', to_jsonb(coalesce(bk.for_items, bp.for_items)),
                    'one_payment_plan', (select pl.name from public.bb_candidates bc
                                           join public.bb_cycle_plans pl on pl.id = bc.cycle_plan_id
                                          where bc.id = bp.candidate_id and pl.payments_count = 1),
                    'handed_in_on', bk.paid_on)
             from public.bb_payments bp
             left join public.bb_payments bk on bp.kind = 'returned' and bk.id = bp.reverses_payment_id
            where bp.id = v_item.row_id)
         else '{}'::jsonb end
      -- ===== end black belt =====
      ,
    'event_name', v_item.event_name,
    'event_id', v_item.event_id,
    'history', v_history)
    -- ===== source: camp (0017) =====
    -- a camp payment also carries the camper's days (sorted)
    || case when p_source = 'camp'
            then jsonb_build_object('camp_days', coalesce((select jsonb_agg(d.day order by d.day)
                                                             from public.camp_camper_days cd
                                                             join public.camp_days d on d.id = cd.day_id
                                                            where cd.camper_id = v_owner), '[]'::jsonb))
            else '{}'::jsonb end
    -- ===== end camp =====
    ;
end;
$$;

revoke execute on function public.finance_payment_detail(text, uuid) from public, anon, authenticated, service_role;
grant  execute on function public.finance_payment_detail(text, uuid) to authenticated;

-- 5i (0011, 0017, 0026, 0037): finance_export - rows gain was_school.
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
             'event_date', m.event_date, 'is_private', m.is_private, 'was_school', m.was_school,   -- 0047: + was_school
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
             -- ===== source: camp (0017) =====
             -- a camp row also carries the camp's name (the export's event)
             || case when m.source = 'camp' then jsonb_build_object('event_name', m.event_name) else '{}'::jsonb end
             -- ===== end camp =====
             -- ===== source: black belt (0026) =====
             -- a Black Belt row: its cycle, what it was for, the one-payment
             -- plan's name and (a returned check) the day it was handed in
             || case when m.source = 'black_belt' then
                 (select jsonb_build_object(
                           'event_name', bp.cycle_name,
                           'for_items', to_jsonb(coalesce(bk.for_items, bp.for_items)),
                           'one_payment_plan', (select pl.name from public.bb_candidates bc
                                                  join public.bb_cycle_plans pl on pl.id = bc.cycle_plan_id
                                                 where bc.id = bp.candidate_id and pl.payments_count = 1),
                           'handed_in_on', bk.paid_on)
                    from public.bb_payments bp
                    left join public.bb_payments bk on bp.kind = 'returned' and bk.id = bp.reverses_payment_id
                   where bp.id = m.row_id)
                else '{}'::jsonb end
             -- ===== end black belt =====
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


commit;

-- End of 0047_finance_stored_school.sql
