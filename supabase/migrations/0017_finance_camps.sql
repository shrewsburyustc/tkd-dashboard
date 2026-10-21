-- =====================================================================
-- 0017_finance_camps.sql
-- ---------------------------------------------------------------------
-- WHAT THIS FILE IS
--   A small migration that makes Finance (0011, live) count CAMP payments
--   (0013) too: rulebook v0.707, plan docs/Camps/TKD-Camps-Finance-Plan.md.
--   It runs AFTER 0011 and 0013 - it stops with a clear message if either
--   is missing - and only REPLACES five of 0011's functions (same names,
--   same arguments, same answers, plus camp rows), widens two
--   rules of one 0011 table, and adds one index. Nothing else of 0011, and
--   nothing of 0001-0013, changes.
--   (Number 0017. The Finance session's next migration, 0018 - private
--   Color Belt payments in the Daily report - is built ON TOP of this
--   file's versions of the same functions. So every camp part below sits
--   in its own clearly marked block,
--     -- ===== source: camp (0017) ===== ... -- ===== end camp =====
--   and 0011's Color Belt / Star code is left exactly as it was.)
--
-- WHY IT EXISTS
--   Camp payments (cash / check / card) are taken at the desk like Color
--   Belt and Star payments. Without this, camp money never shows in the
--   Daily report, History, Export or Close the day, and the drawer count
--   comes up short on every camp day. Camp payments become a third
--   SOURCE, 'camp', next to 'color_belt' and 'star':
--     * the school of a camp line = the school whose desk took that money
--       (camp_payments.school, v0.707) - each line takes the school of its
--       OWN payment row, so an Edit payment that corrects the school puts
--       the corrected line at the new school (the old school's day loses
--       the line; a close there shows "Changed after closing")
--     * name = the camper's; what = 'camp'; event = the camp (name, id);
--       event date = the camp's first day; never "private"
--     * the same chain rules as the other two (edit = reversal + new
--       payment at the same moment by the same login; undo; a mis-click
--       undo within 10 seconds hides the payment)
--
-- WHAT IT CHANGES
--   1. a guard: 0011 and 0013 (with camp_payments.school) must be there
--   2. finance_day_closing_items: the source rule also allows 'camp'; the
--      amount rule allows up to $2,000 (a camp payment can be that much;
--      Color Belt and Star stay at $1,000 by their own rules)
--   3. an index on camp_payments (paid_on), like 0011's two on the other
--      payment tables (Finance looks payments up by date). It is named
--      camp_payments_paid_on_idx - NOT finance_..., because 0011's own
--      tests expect exactly its two finance_*_paid_on_idx indexes.
--   4. replaced, word for word 0011's code plus the camp parts, each in a
--      marked camp block (finance_chain_steps_core by "drop function if
--      exists" + "create", because Finance's 0018 changes its return
--      columns; the other four by "create or replace"):
--        finance_chain_steps_core   (3a) - a third union branch
--        finance_money_rows_core    (3b) - camper / camp / school of camp items
--        finance_day                (5a) - a camp line also has event_name
--        finance_payment_detail     (5d) - accepts source 'camp'; a camp
--                                          item also has event_name, and
--                                          the answer camp_days
--        finance_export             (5i) - a camp row also has event_name
--      (event_name = the camp's name, so the screens can write "Camp ·
--      <camp name>". Color Belt and Star lines keep EXACTLY their 0011
--      keys - the extra key is added to camp lines only.)
--   Every function that builds the report goes through 3a / 3b, so Both,
--   History, Close the day, the export preview and the Home reminder count
--   camp payments without being touched.
--   Rights, owners, "security definer" and search_path = '' stay exactly
--   as 0011 set them (re-stated below).
--
-- HOW TO RUN IT
--   After 0013. Supabase dashboard -> SQL Editor -> New query -> paste this
--   WHOLE file -> Run. One transaction ("begin;" ... "commit;"): if any
--   statement fails, nothing is kept. Supabase may warn about destructive
--   operations: the words are only in "drop constraint if exists" and one
--   "drop function if exists" line (the function is created again at once)
--   that make re-running safe. No data is removed. Confirm.
--   If this file is ever re-run AFTER Finance's 0018, re-run 0018 straight
--   after it (0018 is built on this file's function text).
--   Safe to run again (tested: no row and no fingerprint changes).
--   Undo: SETUP.md, "Migration 0017", Undo 0017 (re-run 0011, then a short
--   block) - only while no closed day has counted a camp payment.
--
-- WORDS: "source", "chain", "item", "counting item": as in 0011's header.
-- PERFORMANCE: the same owner-by-owner chain builder as 0011 (never relies
--   on text order - PGlite sorts text byte by byte, production with ICU);
--   tested with a big seed of camp payments added to 0011's speed seed, and
--   on a database that sorts text like production.
-- =====================================================================

begin;

-- ---------------------------------------------------------------------
-- 1. The guard: this file needs Finance (0011) and Camps (0013, with the
--    school of each camp payment). Stops - and changes nothing - if not.
-- ---------------------------------------------------------------------
do $$
begin
  if to_regclass('public.finance_day_closing_items') is null
     or to_regprocedure('public.finance_money_rows_core(text, date, date, text, uuid)') is null then
    raise exception '0017 needs migration 0011 (Finance) first';
  end if;
  if to_regclass('public.camp_payments') is null
     or not exists (select 1 from pg_catalog.pg_attribute a
                     where a.attrelid = 'public.camp_payments'::regclass and a.attname = 'school' and not a.attisdropped) then
    raise exception '0017 needs migration 0013 (Camps, with camp_payments.school) first';
  end if;
end
$$;


-- ---------------------------------------------------------------------
-- 2. finance_day_closing_items (0011): a close's snapshot may now hold
--    camp items, and amounts up to $2,000 (a camp payment's limit).
--    "drop constraint if exists" + add = replace (safe to run again).
-- ---------------------------------------------------------------------
alter table public.finance_day_closing_items drop constraint if exists finance_day_closing_items_source_check;
alter table public.finance_day_closing_items add constraint finance_day_closing_items_source_check
  check (source in ('color_belt', 'star', 'camp'));

alter table public.finance_day_closing_items drop constraint if exists finance_day_closing_items_amount_check;
alter table public.finance_day_closing_items add constraint finance_day_closing_items_amount_check
  check (amount_cents between -200000 and 200000 and amount_cents <> 0);


-- ---------------------------------------------------------------------
-- 3. Finance looks payments up by date: the same index 0011 put on the
--    other two payment tables, now on camp_payments.
-- ---------------------------------------------------------------------
create index if not exists camp_payments_paid_on_idx on public.camp_payments (paid_on);


-- ---------------------------------------------------------------------
-- 4. The five replaced functions (0011's code + the marked camp blocks)
-- ---------------------------------------------------------------------

-- 3a (0011) with a third source, camp.
-- Written as "drop function if exists" + "create" (not "create or
-- replace"): Finance's migration 0018 changes this function's RETURN
-- COLUMNS, and "create or replace" can't change them back, so a later
-- re-run of this file would fail. Dropping it is safe: no other object
-- depends on it in the catalog (the functions that call it are plpgsql /
-- plain sql, looked up when they run; none uses "begin atomic"), and the
-- rights are set again right below, exactly as 0011 sets them.
drop function if exists public.finance_chain_steps_core(date, date, text, uuid);
create function public.finance_chain_steps_core(p_from date, p_to date, p_source text, p_owner uuid)
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
            -- ===== source: camp (0017) =====
            -- camp payments (0013); the owner is the camper
            union all
            select 0, 'camp'::text, p.camper_id, p.id, p.kind, p.amount_cents,
                   p.method, p.paid_on, p.recorded_at, p.recorded_by, p.recorded_by_name, p.reverses_payment_id
              from public.camp_payments p
             where p.camper_id in
                   (select q.camper_id from public.camp_payments q
                     where (p_owner is null and q.kind <> 'reversal' and q.paid_on between p_from and p_to)
                        or (p_source = 'camp' and q.camper_id = p_owner))
            -- ===== end camp =====
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
          if a_new[v_ri] = any (a_steps) or cardinality(a_steps) >= 51 then
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

-- 3b (0011) with camp items.
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
         case
           -- ===== source: camp (0017) =====
           when i.source = 'camp' then cp.school
           -- ===== end camp =====
           else coalesce(e.location_code, c.location_code) end,
         i.day,
         to_char(i.recorded_at at time zone 'America/New_York', 'HH24:MI'),
         coalesce(g.first_name, c.first_name
                  -- ===== source: camp (0017) =====
                  , cc.first_name
                  -- ===== end camp =====
                  ),
         coalesce(g.last_name, c.last_name
                  -- ===== source: camp (0017) =====
                  , cc.last_name
                  -- ===== end camp =====
                  ),
         i.source,
         case when i.source = 'color_belt' then e.testing_date
              -- ===== source: camp (0017) =====
              when i.source = 'camp' then public.camp_first_day(ck.id)
              -- ===== end camp =====
              else coalesce(c.private_on, se.testing_date) end,
         (i.source = 'star' and c.private_on is not null),
         i.kind, i.method, i.amount_cents, i.state,
         i.was_amount_cents, i.was_method, i.moved_to, i.moved_from,
         i.changed_by_name, i.changed_on, i.recorded_by_name,
         i.row_id, i.state in ('counted', 'edited', 'moved_in'), i.first_recorded_at, i.recorded_at,
         coalesce(e.name, se.name
                  -- ===== source: camp (0017) =====
                  , ck.name
                  -- ===== end camp =====
                  ),
         coalesce(e.id, se.id
                  -- ===== source: camp (0017) =====
                  , ck.id
                  -- ===== end camp =====
                  )
    from public.finance_chain_items(p_from, p_to, p_source, p_owner) i
    left join public.testing_registrations g on i.source = 'color_belt' and g.id = i.owner_id
    left join public.testing_events e on e.id = g.event_id
    left join public.star_candidates c on i.source = 'star' and c.id = i.owner_id
    left join public.star_events se on se.id = c.event_id
    -- ===== source: camp (0017) =====
    -- the camper, the camp, and the school of the row shown (the desk that
    -- took that money, camp_payments.school)
    left join public.camp_payments cp on i.source = 'camp' and cp.id = i.row_id
    left join public.camp_campers cc on i.source = 'camp' and cc.id = i.owner_id
    left join public.camps ck on ck.id = cc.camp_id
    -- ===== end camp =====
   where (e.id is not null or se.id is not null
          -- ===== source: camp (0017) =====
          or ck.id is not null
          -- ===== end camp =====
          )
     and (p_location_code is null
          or (case
                -- ===== source: camp (0017) =====
                when i.source = 'camp' then cp.school
                -- ===== end camp =====
                else coalesce(e.location_code, c.location_code) end) = p_location_code)
     and (p_from is null or i.day >= p_from)
     and (p_to is null or i.day <= p_to);
$$;

revoke execute on function public.finance_money_rows_core(text, date, date, text, uuid) from public, anon, authenticated, service_role;

-- 5a (0011): camp lines carry event_name.
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
           -- ===== source: camp (0017) =====
           -- a camp line also carries the camp's name ("Camp - April Vacation
           -- Camp"); Color Belt and Star lines keep exactly their 0011 keys
           || case when m.source = 'camp' then jsonb_build_object('event_name', m.event_name) else '{}'::jsonb end
           -- ===== end camp =====
           order by m.row_recorded_at, m.last_name, m.first_name, m.payment_id), '[]'::jsonb)
    into v_items
    from jsonb_to_recordset(v_all)
         as m(source text, payment_id uuid, day date, "time" text, first_name text, last_name text, what text,
              event_date date, is_private boolean, kind text, method text, amount_cents integer, state text,
              was_amount_cents integer, was_method text, moved_to date, moved_from date, changed_by_name text,
              changed_on date, recorded_by_name text, counts boolean, first_recorded_at timestamptz,
              row_recorded_at timestamptz,
              -- ===== source: camp (0017) =====
              event_name text
              -- ===== end camp =====
              );

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

-- 5d (0011) for camp payments too.
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
                         )
     or p_payment_id is null then
    return jsonb_build_object('status', 'invalid');
  end if;

  -- the owner (registration / candidate); its chains are built from all
  -- its rows (3a with p_owner), whatever their dates
  if p_source = 'color_belt' then
    select p.registration_id into v_owner from public.testing_payments p where p.id = p_payment_id;
    select min(p.paid_on), max(p.paid_on) into v_from, v_to
      from public.testing_payments p where p.registration_id = v_owner and p.kind <> 'reversal';
  -- ===== source: camp (0017) =====
  elsif p_source = 'camp' then
    -- a camp payment's owner is the camper
    select p.camper_id into v_owner from public.camp_payments p where p.id = p_payment_id;
    select min(p.paid_on), max(p.paid_on) into v_from, v_to
      from public.camp_payments p where p.camper_id = v_owner and p.kind <> 'reversal';
  -- ===== end camp =====
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
      'added_after_closing', (v_c.id is not null and v_item.counts and v_item.first_recorded_at > v_c.recorded_at))
      -- ===== source: camp (0017) =====
      -- a camp item also carries the camp's name
      || case when p_source = 'camp' then jsonb_build_object('event_name', v_item.event_name) else '{}'::jsonb end
      -- ===== end camp =====
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

-- 5i (0011): camp rows carry event_name.
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
             -- ===== source: camp (0017) =====
             -- a camp row also carries the camp's name (the export's event)
             || case when m.source = 'camp' then jsonb_build_object('event_name', m.event_name) else '{}'::jsonb end
             -- ===== end camp =====
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

-- End of 0017_finance_camps.sql
