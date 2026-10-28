-- =====================================================================
-- 0026_finance_black_belt.sql
-- Built over the LIVE Finance functions by supabase/tools/build_0026.py
-- (0018's versions of five, 0017's of two, 0011's of two). Never edit this
-- file by hand: change build_0026.py and build it again.
-- ---------------------------------------------------------------------
-- WHAT THIS FILE IS
--   Finance learns about Black Belt testing payments (0016, table
--   bb_payments): the Daily report, Close the day, History, Export, the
--   payment detail, the Home reminder and the Both summary all include
--   them, as a fourth source 'black_belt' next to Color Belt, Star and
--   camps. Build contract: docs/Dashboard Docs/Build contracts/
--   CONTRACT-0026.md; rulebook v0.808, v0.809, v0.814, v0.815, v1.034.
--   Production order: 0011 -> 0013 + 0017 -> 0014 -> 0018 -> 0016 -> 0024
--   -> 0025 -> 0026. Forward-only: there is no undo file.
--
-- WHY IT EXISTS
--   Black Belt payments are taken at the desk like the others, but until
--   this file they never show in Finance, so the drawer count would come
--   up short. Black Belt also has two things no other section has:
--     * a RETURNED (bounced) check - its own negative row, shown on the day
--       the bank returned it, in the Total of that day but never in Close
--       the day (v0.809); the day the check was handed in stays exactly as
--       counted and closed
--     * refunds to a CARD - Close the day's expected card total is card
--       money in + card refunds (v0.814), as cash already is
--
-- WHAT IT CHANGES
--   * finance_day_closing_items: the source rule also allows 'black_belt'.
--     (Its amount rule already allows $10,000 since camps' 0022 - more than
--     a Black Belt row's $5,000 - so it is left alone.)
--   * finance_day_closings: the counts rule lets a counted card total be
--     below 0 when the expected card total is (a day with only a card
--     refund), exactly as cash already may (v0.209); the expected card
--     total may be below 0.
--   * nine Finance functions, replaced word for word plus marked blocks:
--       finance_chain_steps_core      (3a) the black_belt source; a returned
--                                          check is its own chain
--       finance_money_rows_core       (3b) school / names / cycle of a
--                                          Black Belt item
--       finance_figures_from          (3c) returned checks only in the Total
--                                          (not in the count to close, the
--                                          fingerprint or the cards)
--       finance_closing_changes_from  (3h) returned checks never change a
--                                          close; expected card after card
--                                          refunds
--       finance_payment_detail        (5d) source black_belt, returned-check
--                                          history lines
--       finance_day                   (5a) Black Belt line keys,
--                                          refunds.card_cents, returned
--       finance_export                (5i) Black Belt row keys
--       finance_close_day             (5f) expected card after card refunds;
--                                          no returned check in the snapshot
--       finance_day_both              (5b) returned per school and together
--     Every change is inside a block marked
--       -- ===== source: black belt (0026) =====
--       -- ===== end black belt =====
--     or on a line ending in a "-- 0026" comment; the rest is the live text
--     unchanged, every camp (0017) and private (0018) block byte for byte
--     (build_0026.py checks that every time it builds this file).
--   Color Belt, Star, camp and private testing answers keep exactly their
--   keys and values; the only new keys everywhere are refunds.card_cents
--   (0 without a card refund) and returned ({count: 0, cents: 0} without a
--   returned check). No table, row, right, setting or closing changes.
--
-- HOW TO RUN IT
--   Supabase dashboard -> SQL Editor -> New query -> paste this WHOLE file
--   -> Run. One transaction: on any error nothing is kept. The
--   destructive-operations warning comes from "drop constraint if exists"
--   (the two rules are added again straight after) and one "drop function
--   if exists" (the chain helper, recreated straight after with the same
--   columns). No data is removed. Safe to run again.
--   NOTE on re-running earlier files after this one:
--   * 0011: stops with "cannot change return type of existing function"
--     (finance_chain_items) and is rolled back - nothing changes.
--   * camps' 0017: may RUN and put back its own versions of five
--     functions (without private testing and Black Belt) - then re-run
--     0018 and this file straight after it, in the same sitting. (If a
--     closed day's snapshot already holds a Black Belt item, 0017 stops on
--     its source rule instead and nothing changes.)
--   * 0018: its guard refuses (the functions are not 0017's or 0018's any
--     more) - nothing changes.
--
-- PRIVACY
--   Finance reads bb_payments (login ids only inside the chain helper, to
--   compare them, never returned; never the note or the reason),
--   bb_candidates (first and last name, the current plan) and
--   bb_cycle_plans (name, number of payments) - never the date of birth,
--   the email, or any waiver data. No answer holds a login id.
-- =====================================================================

begin;

-- The guard: this file stops here, and nothing is changed, unless
--   * Black Belt testing (0016) is applied (its payments table exists),
--   * Finance's 0018 is applied (its "color belt private (0018)" mark), and
--   * the nine Finance functions 0026 replaces are EXACTLY their live
--     versions (0018's / 0017's / 0011's, as listed above) - or what this
--     file made (a re-run). They are compared by the md5 of their code
--     without comments and white space (as the fingerprints files do). If
--     any of them changed since, pasting this file would silently undo that
--     change, so 0026 must first be rebuilt (supabase/tools/build_0026.py).
--   * the two table rules it rebuilds are exactly what is live today (or
--     what this file made): compared by the md5 of their text without
--     white space, as Postgres shows it (pg_get_constraintdef).
do $$
begin
  if to_regclass('public.bb_payments') is null then
    raise exception '0026 needs migration 0016 (Black Belt testing) first';
  end if;
  if not exists (select 1 from pg_proc p join pg_namespace n on n.oid = p.pronamespace
                  where n.nspname = 'public' and p.proname = 'finance_chain_steps_core'
                    and position('source: color belt private (0018)' in p.prosrc) > 0) then
    raise exception '0026 must be applied after Finance''s 0018 - not yet (SETUP, Migration 0026)';
  end if;
  if exists (select 1
               from (values
           ('finance_chain_steps_core', '2a894072df0b320c1c659343bdb5ef3d', '6d03a519cc5ada725a961b1c672dbe82'),
           ('finance_money_rows_core', '084099705b5a1f6924ed69c854b7f3c2', '77bc764dfe331a09919ac7c72962b76c'),
           ('finance_figures_from', '3d07606981394575fec9d20a847aabe0', 'e540ff80c57b6d4866f9244d79eb36a5'),
           ('finance_closing_changes_from', '323613f239c3dcc59e99ba5991a63f6a', '506106b3b34919e6db74b6080c84fe4f'),
           ('finance_payment_detail', '31cc825ef94b5155b927aefba4a256e2', '31e25e5951b33aeac8ee4900271f885a'),
           ('finance_day', 'a4b3c40de667792cab0dc1c1d2f4f5c8', '3f6831f61735e1447c5974cc1dcba2ff'),
           ('finance_export', 'f10ef5c00455ba33472756f7ef40da34', '21eedfa15256ea81d56dd2dc8e7a5706'),
           ('finance_close_day', 'fe91ba761a02152f930c75e1fe013e74', '8035a10000062885fdb188ef8ef944cd'),
           ('finance_day_both', 'b13b986ac02be8e29283f18b386ecb9f', 'f3d68e8a3e32da62945747f7fc3c7692')
                    ) as v(name, md5_live, md5_0026)
               left join (select p.proname,
                                 md5(regexp_replace(regexp_replace(p.prosrc, '--[^\n]*', '', 'g'), '\s+', '', 'g')) as md5
                            from pg_proc p join pg_namespace n on n.oid = p.pronamespace
                           where n.nspname = 'public') as l on l.proname = v.name
              where l.md5 is null or l.md5 not in (v.md5_live, v.md5_0026)) then
    raise exception '0026 was built over other Finance functions than the live ones - rebuild 0026 first (supabase/tools/build_0026.py)';
  end if;
  if exists (select 1
               from (values
           ('finance_day_closing_items', 'finance_day_closing_items_source_check', '93eb4d98d376147b77292e93998b284d', '90f7e1c6ff131e9c45f4b8fca93d533a'),
           ('finance_day_closings', 'finance_day_closings_counts_check', '2fe1d8181a18a1d41caf1faf74ca3a72', 'ea99be87bf080aeb8f47ad959cae10f9')
                    ) as v(tbl, name, md5_live, md5_0026)
               left join (select c.conname, c.conrelid,
                                 md5(regexp_replace(pg_get_constraintdef(c.oid), '\s+', '', 'g')) as md5
                            from pg_constraint c
                           where c.connamespace = 'public'::regnamespace) as k
                      on k.conname = v.name and k.conrelid = to_regclass('public.' || v.tbl)
              where k.md5 is null or k.md5 not in (v.md5_live, v.md5_0026)) then
    raise exception '0026 was built over other Finance table rules than the live ones - rebuild 0026 first (supabase/tools/build_0026.py)';
  end if;
end;
$$;

-- A close's snapshot may now hold Black Belt items. ("drop constraint if
-- exists" + add = replace, safe to run again.)
alter table public.finance_day_closing_items drop constraint if exists finance_day_closing_items_source_check;
alter table public.finance_day_closing_items add constraint finance_day_closing_items_source_check
  check (source in ('color_belt', 'star', 'camp', 'black_belt'));

-- A day whose card refunds are more than its card money in expects a
-- card total below 0 (v0.814); the counted card total may then be below 0
-- too - the same rule as cash (0011). Everything else as 0011 wrote it.
alter table public.finance_day_closings drop constraint if exists finance_day_closings_counts_check;
alter table public.finance_day_closings add constraint finance_day_closings_counts_check
  check ((cash_counted_cents is null or cash_counted_cents between -10000000 and 10000000)
         and (cash_counted_cents is null or cash_counted_cents >= 0 or expected_cash_cents < 0)
         and (checks_counted is null or checks_counted between 0 and 500)
         and (checks_counted_cents is null or checks_counted_cents between 0 and 10000000)
         and (card_counted_cents is null or card_counted_cents between -10000000 and 10000000)
         and (card_counted_cents is null or card_counted_cents >= 0 or expected_card_cents < 0)
         and (expected_count is null or expected_count >= 0)
         and (expected_checks is null or expected_checks >= 0)
         and (expected_checks_cents is null or expected_checks_cents >= 0));

-- 3a (0011) with a third source, camp.
-- Written as "drop function if exists" + "create" (not "create or
-- replace"): Finance's migration 0018 changes this function's RETURN
-- COLUMNS, and "create or replace" can't change them back, so a later
-- re-run of this file would fail. Dropping it is safe: no other object
-- depends on it in the catalog (the functions that call it are plpgsql /
-- plain sql, looked up when they run; none uses "begin atomic"), and the
-- rights are set again right below, exactly as 0011 sets them.
-- ===== source: color belt private (0018) =====
-- 0018: Color Belt PRIVATE testing payments (0014) are Color Belt rows
-- too (source 'color_belt'). A moved private testing belongs to the same
-- OWNER as the event registration it came from (moved_from_registration_id);
-- one added directly is its own owner. Three links between rows (CONTRACT-
-- 0018 section 2):
--   'edit'        a reversal + a new payment of the SAME table and private
--                 testing, same moment, same login (as before)
--   'move'        an EVENT reversal R of payment P, where a private payment
--                 C with moved_from_payment_id = P exists: the chain goes on
--                 at C (Move to private testing, 0014 2.5.1)
--   'move_undone' an EVENT reversal R of P with no private copy left, and an
--                 event payment N of the same student with P's recorded_at,
--                 no login (recorded_by null), the same amount, method and
--                 day: the chain goes on at N (Undo move, 0014 2.5.2)
-- A move and an undo move are not corrections: only 'edit' steps make an
-- item "edited" (3a2). New output columns: private_id (the private testing
-- of the row, NULL for event / Star rows), step_kind ('first', 'edit',
-- 'move', 'move_undone'), link_at / link_by_name (when and by whom the
-- step's link was written). The private rows are one more branch of the
-- query (their extra columns come from a left join after it, so the Color
-- Belt event, Star and camp branches stay as they are); the move and undo
-- move links are looked for only among Color Belt rows.
-- ===== end color belt private =====
-- ===== source: black belt (0026) =====
-- 0026: Black Belt payments (0016, table bb_payments) are a fourth
-- source, 'black_belt'; the owner is the candidate. The same chain rules
-- as Color Belt and Star (an edit = a reversal + a new payment at the
-- same moment by the same login; an undo = a reversal alone; the
-- staff's own undo within 10 seconds = a hidden mis-click). One more
-- kind: a 'returned' row (a check the bank returned, v0.809) starts its
-- OWN chain - it is never read as a reversal of the check (only rows of
-- kind 'reversal' are), so the check keeps its line on its own day. A
-- reversal of the returned row (the Undo of the mark) makes that chain
-- 'undone'. No new output column.
-- ===== end black belt =====
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
  undo_method       text,   -- 0018: + the columns below
  -- ===== source: color belt private (0018) =====
  private_id        uuid,
  step_kind         text,
  link_at           timestamptz,
  link_by_name      text
  -- ===== end color belt private =====
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
  -- ===== source: color belt private (0018) =====
  a_priv   uuid[];      -- the private testing of the row (NULL = an event / Star row)
  a_mfrom  uuid[];      -- a private copy: the event payment it was moved from
  a_ltype  text[];      -- for reversal i: 'edit', 'move' or 'move_undone' (with a_new)
  -- ===== end color belt private =====
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
    -- ===== source: color belt private (0018) =====
    with cb_owner as (
      -- the Color Belt owners: registrations with a payment in the range
      -- (or the one asked for)
      select q.registration_id as owner from public.testing_payments q
       where (p_owner is null and q.kind <> 'reversal' and q.paid_on between p_from and p_to)
          or (p_source = 'color_belt' and q.registration_id = p_owner)
      union
      -- ... and the owners of private testings with a payment in the range
      select coalesce(t.moved_from_registration_id, t.id)
        from public.testing_private_payments q
        join public.testing_private t on t.id = q.private_id
       where (p_owner is null and q.kind <> 'reversal' and q.paid_on between p_from and p_to)
          or (p_source = 'color_belt' and coalesce(t.moved_from_registration_id, t.id) = p_owner)
    )
    -- ===== end color belt private =====
    select x.*, tpp.private_id, tpp.moved_from_payment_id as moved_from   -- 0018: + the private columns
      from (select 0 as is_end, 'color_belt'::text as src, p.registration_id as owner, p.id, p.kind, p.amount_cents,
                   p.method, p.paid_on, p.recorded_at, p.recorded_by, p.recorded_by_name, p.reverses_payment_id
              from public.testing_payments p
             where p.registration_id in (select o.owner from cb_owner o)   -- 0018: owners incl. private testings'
            union all
            -- ===== source: color belt private (0018) =====
            select 0, 'color_belt'::text, coalesce(t.moved_from_registration_id, t.id), p.id, p.kind, p.amount_cents,
                   p.method, p.paid_on, p.recorded_at, p.recorded_by, p.recorded_by_name, p.reverses_payment_id
              from public.testing_private_payments p
              join public.testing_private t on t.id = p.private_id
             where coalesce(t.moved_from_registration_id, t.id) in (select o.owner from cb_owner o)
            union all
            -- ===== end color belt private =====
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
            -- ===== source: black belt (0026) =====
            -- Black Belt payments (0016); the owner is the candidate
            union all
            select 0, 'black_belt'::text, p.candidate_id, p.id, p.kind, p.amount_cents,
                   p.method, p.paid_on, p.recorded_at, p.recorded_by, p.recorded_by_name, p.reverses_payment_id
              from public.bb_payments p
             where p.candidate_id in
                   (select q.candidate_id from public.bb_payments q
                     where (p_owner is null and q.kind <> 'reversal' and q.paid_on between p_from and p_to)
                        or (p_source = 'black_belt' and q.candidate_id = p_owner))
            -- ===== end black belt =====
            union all
            select 1, null::text, null::uuid, null::uuid, null::text, null::integer,
                   null::text, null::date, null::timestamptz, null::uuid, null::text, null::uuid) as x
    -- ===== source: color belt private (0018) =====
    -- the private columns of a private testing row (NULL for every other row)
    left join public.testing_private_payments tpp on x.src = 'color_belt' and tpp.id = x.id
    -- ===== end color belt private =====
     -- only equal (src, owner) rows must come together; which owner comes
     -- first doesn't matter, so the text order of src is never relied on
     order by x.is_end, x.src, x.owner, x.recorded_at, x.id
  loop
    -- a new owner starts (or the end): work out the rows collected so far
    if v_n > 0 and (v_row.is_end = 1 or v_row.src is distinct from v_src or v_row.owner is distinct from v_owner) then
      a_revof := array_fill(0, array[v_n]);
      a_new   := array_fill(0, array[v_n]);
      a_isnew := array_fill(false, array[v_n]);
      a_ltype := array_fill(''::text, array[v_n]);   -- 0018

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
              -- ===== source: color belt private (0018) =====
              -- a move: an EVENT reversal whose payment has a private copy
              if a_priv[v_i] is null then
                for v_j in 1 .. v_n loop
                  if a_mfrom[v_j] = a_id[v_t] and a_kind[v_j] = 'payment' then v_k := v_j; end if;
                end loop;
              end if;
              if v_k > 0 then
                a_new[v_i] := v_k;
                a_ltype[v_i] := 'move';
                a_isnew[v_k] := true;
                continue;
              end if;
              -- ===== end color belt private =====
              for v_j in 1 .. v_n loop
                if a_kind[v_j] = 'payment' and v_j <> v_t
                   and a_at[v_j] = a_at[v_i] and a_by[v_j] = a_by[v_i]
                   and a_priv[v_j] is not distinct from a_priv[v_i]   -- 0018: same table / private testing
                   and (v_k = 0 or a_id[v_j] < a_id[v_k]) then
                  v_k := v_j;
                end if;
              end loop;
              a_new[v_i] := v_k;
              if v_k > 0 then a_isnew[v_k] := true; a_ltype[v_i] := 'edit'; end if;   -- 0018: + the link kind
            end if;
          end if;
        end if;
      end loop;

      -- ===== source: color belt private (0018) =====
      -- an undone move (Color Belt only): an EVENT reversal R of an event payment P that is
      -- neither an edit nor a move, dated on P's day and written by a login
      -- (0014's Move writes it so), and an unclaimed event payment N of the
      -- same student with P's recorded_at, NO login, R's name (only the
      -- mover can undo a move), and P's amount, method and day (0014's Undo
      -- move writes exactly that). On a tie the smallest id wins
      -- (CONTRACT-0018 2.3, edge case 1).
      for v_i in 1 .. v_n loop
        continue when v_src <> 'color_belt' or a_kind[v_i] <> 'reversal' or a_new[v_i] > 0 or a_priv[v_i] is not null;
        v_t := 0;
        for v_j in 1 .. v_n loop
          if a_id[v_j] = a_target[v_i] then v_t := v_j; end if;
        end loop;
        continue when v_t = 0 or a_kind[v_t] <> 'payment' or a_priv[v_t] is not null
                   or a_paid[v_i] <> a_paid[v_t] or a_by[v_i] is null;
        v_k := 0;
        for v_j in 1 .. v_n loop
          if a_kind[v_j] = 'payment' and v_j <> v_t and not a_isnew[v_j] and a_priv[v_j] is null
             and a_by[v_j] is null and a_at[v_j] = a_at[v_t] and a_name[v_j] = a_name[v_i]
             and a_amount[v_j] = a_amount[v_t] and a_method[v_j] = a_method[v_t] and a_paid[v_j] = a_paid[v_t]
             and (v_k = 0 or a_id[v_j] < a_id[v_k]) then
            v_k := v_j;
          end if;
        end loop;
        if v_k > 0 then
          a_new[v_i] := v_k;
          a_ltype[v_i] := 'move_undone';
          a_isnew[v_k] := true;
        end if;
      end loop;
      -- ===== end color belt private =====

      -- rule 1: a chain starts at a payment or refund that isn't the new
      -- row of an edit; follow each edit to its new row (rules 2-3)
      for v_j in 1 .. v_n loop
        -- ===== source: black belt (0026) =====
        -- a Black Belt 'returned' row (a bounced check) starts a chain of its
        -- own too: its only step is itself; it is 'undone' when the returned
        -- mark was undone (a reversal of it), else it counts on its own day
        -- ===== end black belt =====
        continue when a_kind[v_j] not in ('payment', 'refund', 'returned') or a_isnew[v_j];   -- 0026: + 'returned'
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
          -- 0018: who / when of an EDIT only (a move is not a correction)
          edit_by_name      := case when a_edits[v_i] > 0 and a_ltype[a_edits[v_i]] = 'edit' then a_name[a_edits[v_i]] end;   -- 0018
          edit_on           := case when a_edits[v_i] > 0 and a_ltype[a_edits[v_i]] = 'edit' then a_paid[a_edits[v_i]] end;      -- 0018
          end_state         := v_state;
          undo_by_name      := case when v_ri > 0 then a_name[v_ri] end;
          undo_on           := case when v_ri > 0 then a_paid[v_ri] end;
          undo_at           := case when v_ri > 0 then a_at[v_ri] end;
          undo_amount_cents := case when v_ri > 0 then a_amount[v_ri] end;
          undo_method       := case when v_ri > 0 then a_method[v_ri] end;
          -- ===== source: color belt private (0018) =====
          private_id        := a_priv[v_k];
          step_kind         := case when a_edits[v_i] = 0 then 'first' else a_ltype[a_edits[v_i]] end;
          link_at           := case when a_edits[v_i] > 0 then a_at[a_edits[v_i]] end;
          -- an undone move: the person who undid it (the recreated row's name)
          link_by_name      := case when a_edits[v_i] = 0 then null
                                    when a_ltype[a_edits[v_i]] = 'move_undone' then a_name[v_k]
                                    else a_name[a_edits[v_i]] end;
          -- ===== end color belt private =====
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
      a_priv := '{}'; a_mfrom := '{}';   -- 0018
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
    a_priv[v_n]   := v_row.private_id;   -- 0018
    a_mfrom[v_n]  := v_row.moved_from;   -- 0018
  end loop;
end;
$$;

revoke execute on function public.finance_chain_steps_core(date, date, text, uuid) from public, anon, authenticated, service_role;

-- 3b (0011) with camp items.
-- ===== source: color belt private (0018) =====
-- 0018: an item whose shown row is a PRIVATE testing payment takes the
-- private testing's school, names and private day (is_private true,
-- event_date = private_date) and has no event (event_name / event_id NULL).
-- ===== end color belt private =====
-- ===== source: black belt (0026) =====
-- 0026: a Black Belt item takes the school and the cycle name of the ROW
-- SHOWN, as they were recorded (bb_payments.location_code / cycle_name,
-- v0.808: a later school change or cycle rename moves nothing), the
-- candidate's names, no event date (a cycle has several testing days)
-- and event_id = the cycle (Open in Testing).
-- ===== end black belt =====
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
           -- ===== source: black belt (0026) =====
           when i.source = 'black_belt' then bp.location_code
           -- ===== end black belt =====
           else coalesce(tp.location_code, e.location_code, c.location_code) end,   -- 0018: tp first
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
                  ) end   -- 0018
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
                else coalesce(tp.location_code, e.location_code, c.location_code) end) = p_location_code)   -- 0018: tp
     and (p_from is null or i.day >= p_from)
     and (p_to is null or i.day <= p_to);
$$;

revoke execute on function public.finance_money_rows_core(text, date, date, text, uuid) from public, anon, authenticated, service_role;

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
-- ===== source: color belt private (0018) =====
--   fingerprint  md5 of the day's shown items, "payment_id|amount|method|state"
--                sorted and joined with commas (empty day: md5 of '').
--                0018: payment_id (the chain's first row) instead of 0011's
--                row_id, so a Move to private testing (the shown row
--                changes, the money doesn't) leaves it unchanged.
-- ===== end color belt private =====
--                finance_close_day refuses a close when it changed.
-- It works on a JSON COPY of the items (3c2 below makes one): a function
-- that needs the figures AND the items (Close the day, History) builds
-- the items ONCE and works everything out from that one copy, so the
-- figures and the items can never come from two different moments.
-- ===== source: black belt (0026) =====
-- 0026: a Black Belt RETURNED check (kind 'returned', negative, v0.809)
-- counts in total_cents only (the day's Total is after it). It is NOT in
-- item_count - so a day whose only items are returned checks has nothing
-- to close, isn't "Not closed" in History and isn't in the Home reminder
-- - nor in the fingerprint (Close the day is not affected), nor in
-- pay_count / in_cents / the cash, check and card figures / refunds
-- (those already take kind 'payment' or 'refund' only). The card part
-- of the refunds is refund_cents - refund_cash_cents -
-- refund_check_cents; Close the day's expected card total adds it to
-- card_cents (v0.814) - worked out by the callers, so the output
-- columns stay as they are.
-- ===== end black belt =====
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
           as x(school text, day date, kind text, method text, amount_cents integer, state text, row_id uuid, counts boolean,   -- 0018
                payment_id uuid)   -- 0018
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
           count(*) filter (where i.counts and i.kind <> 'returned')::integer as item_count,   -- 0026: no returned check
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
           md5(coalesce(string_agg(i.payment_id::text || '|' || i.amount_cents::text || '|' || i.method || '|' || i.state, ','   -- 0018
                                   order by (i.payment_id::text || '|' || i.amount_cents::text || '|' || i.method || '|' || i.state) collate "C")   -- 0018 / 0026: + the filter
                               filter (where i.kind <> 'returned'),   -- 0026: no returned check
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

-- 3h. finance_closing_changes_from(closing, items) - "Changed after
-- closing" (contract 1.4): compares the close's snapshot
-- (finance_day_closing_items) with that school's day NOW, chain by chain.
-- p_items = a JSON copy of the current items (3c2) that includes that
-- school's day (it may hold more; only that school and day are used), so
-- History can build a whole month once and compare every close with it.
-- ===== source: color belt private (0018) =====
--   changed_count    chains added, removed, or with another amount / method /
--                    kind than the snapshot. 0018: a snapshot item and an item
--                    now are the same when EITHER the chain id or the row id
--                    agrees (a row belongs to one chain, so nothing pairs
--                    twice) - so a Move, an Undo move made before a close of
--                    0011's time, or a moved payment whose event was deleted
--                    later are not differences; the money still is (a
--                    deleted student or event, a Star candidate moved to the
--                    other school, a late mis-click undo ... all show up)
-- ===== end color belt private =====
--   expected_differs the day's expected figures now differ from the
--                    close's expected_* snapshot
-- ===== source: black belt (0026) =====
-- 0026: Black Belt returned checks are left out of the items first
-- (v0.809: Close the day is not affected), so a returned mark - or its
-- undo - after a close never shows as a change; the expected card total
-- is card money in + card refunds (v0.814), as finance_close_day stores it.
-- ===== end black belt =====
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

  -- ===== source: black belt (0026) =====
  -- only this school's day, without returned checks (all the rest of
  -- this function looks at; History passes a whole month)
  p_items := (select coalesce(jsonb_agg(x.e), '[]'::jsonb)
                from jsonb_array_elements(coalesce(p_items, '[]'::jsonb)) as x(e)
               where x.e ->> 'school' = v_c.location_code and (x.e ->> 'day')::date = v_c.day
                 and x.e ->> 'kind' is distinct from 'returned');
  -- ===== end black belt =====

  -- ===== source: color belt private (0018) =====
  -- a snapshot item and an item now are the same chain when EITHER the
  -- chain id or the row id agrees (a row belongs to one chain, so nothing
  -- pairs twice). A full join can't pair on "this OR that", so the three
  -- kinds of difference are counted one by one: only now, only in the
  -- snapshot, paired but with other money.
  with cur as (
    select x.source, x.payment_id, x.row_id, x.amount_cents, x.method, x.kind
      from jsonb_to_recordset(coalesce(p_items, '[]'::jsonb))
           as x(source text, payment_id uuid, school text, day date, row_id uuid, amount_cents integer,
                method text, counts boolean, kind text)
     where x.school = v_c.location_code and x.day = v_c.day and x.counts
  ),
  snap as (
    select ci.source, ci.chain_id, ci.row_id, ci.amount_cents, ci.method, ci.kind
      from public.finance_day_closing_items ci
     where ci.closing_id = p_closing_id
  )
  select ((select count(*) from cur c
            where not exists (select 1 from snap s
                               where s.source = c.source and (s.chain_id = c.payment_id or s.row_id = c.row_id)))
        + (select count(*) from snap s
            where not exists (select 1 from cur c
                               where c.source = s.source and (s.chain_id = c.payment_id or s.row_id = c.row_id)))
        + (select count(*) from cur c join snap s
                on s.source = c.source and (s.chain_id = c.payment_id or s.row_id = c.row_id)
            where c.amount_cents <> s.amount_cents or c.method <> s.method or c.kind <> s.kind))::integer
    into changed_count;
  -- ===== end color belt private =====

  select * into v_f from public.finance_figures_from(p_items, v_c.location_code, v_c.day, v_c.day);
  expected_differs := v_f.item_count     is distinct from v_c.expected_count
                   or v_f.exp_cash_cents is distinct from v_c.expected_cash_cents
                   or v_f.check_count    is distinct from v_c.expected_checks
                   or v_f.check_cents    is distinct from v_c.expected_checks_cents
                   or (v_f.card_cents + v_f.refund_cents - v_f.refund_cash_cents - v_f.refund_check_cents)   -- 0026: + card refunds
                        is distinct from v_c.expected_card_cents;   -- 0026
end;
$$;

revoke execute on function public.finance_closing_changes_from(uuid, jsonb) from public, anon, authenticated, service_role;

-- 5d (0011) for camp payments too.
-- ===== source: color belt private (0018) =====
-- 0018: p_payment_id may be a private testing payment (source 'color_belt');
-- its owner is the event registration it was moved from, else the private
-- testing. History "what" codes: recorded | edited | undone | refunded and
-- (0018) moved | move_undone: a Move adds a 'moved' line (when and by whom
-- it was moved), an Undo move a 'move_undone' line (by whom; at the move's
-- time - 0014 keeps no time of the undo on the rows).
-- ===== end color belt private =====
-- ===== source: black belt (0026) =====
-- 0026: p_source may be 'black_belt' (owner = the candidate). Its item
-- also carries event_name (the cycle), for_items, one_payment_plan and
-- handed_in_on; the answer's event_name / event_id are the cycle's. A
-- returned check's history: "<name> marked it returned by the bank"
-- ('returned'), "<name> undid the returned mark" ('returned_undone')
-- and the check's own 'recorded' line. A returned check is never
-- "added after closing" (it isn't part of a close, v0.809).
-- ===== end black belt =====
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

-- 5a (0011): camp lines carry event_name.
-- ===== source: black belt (0026) =====
-- 0026: a Black Belt line also carries event_name (the cycle),
-- for_items, one_payment_plan and handed_in_on (CONTRACT-0026 section 6;
-- every other line keeps exactly its keys); refunds gains card_cents
-- (the card part, <= 0); a new top-level returned: {count, cents} = the
-- day's returned checks that count (cents <= 0; they are in the Total,
-- not in the cash / check / card cards). A returned check is never
-- "added after closing" (it isn't part of a close, v0.809).
-- ===== end black belt =====
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
              was_amount_cents integer, was_method text, moved_to date, moved_from date, changed_by_name text,
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

-- 5i (0011): camp rows carry event_name.
-- ===== source: black belt (0026) =====
-- 0026: a Black Belt row also carries event_name (the cycle), for_items,
-- one_payment_plan and handed_in_on (a returned check: kind 'returned',
-- negative, counted on the day it was returned). Every other row keeps
-- exactly its keys.
-- ===== end black belt =====
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
-- ===== source: black belt (0026) =====
-- 0026: the expected card total = card money in + card refunds (v0.814;
-- only Black Belt refunds to a card) - stored as expected_card_cents and
-- compared with p_card_cents. Like cash, p_card_cents may be below 0
-- (down to -$100,000) only when the expected card total is. Black Belt
-- returned checks are never part of a close (v0.809): not in the
-- figures (3c) and not in the snapshot.
-- ===== end black belt =====
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
  -- ===== source: black belt (0026) =====
  v_exp_card integer;   -- the expected card total (after card refunds)
  -- ===== end black belt =====
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
       or p_card_cents is null or p_card_cents not between -10000000 and 10000000   -- 0026: below 0 only when expected (below)
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
    -- ===== source: black belt (0026) =====
    v_exp_card := v_f.card_cents + (v_f.refund_cents - v_f.refund_cash_cents - v_f.refund_check_cents);
    if p_card_cents < 0 and v_exp_card >= 0 then
      return jsonb_build_object('status', 'invalid');
    end if;
    -- ===== end black belt =====

    v_results := public.finance_results(v_f.exp_cash_cents, p_cash_cents, v_f.check_count, p_checks_count,
                                        v_f.check_cents, p_checks_cents, v_exp_card, p_card_cents);   -- 0026: v_exp_card
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
       v_f.item_count, v_f.exp_cash_cents, v_f.check_count, v_f.check_cents, v_exp_card,   -- 0026: v_exp_card
       v_note, public.change_log_actor_name())
    returning id into v_id;

    -- the snapshot of exactly what was counted
    insert into public.finance_day_closing_items
      (closing_id, location_code, source, chain_id, row_id, kind, method, amount_cents)
    select v_id, p_location_code, x.source, x.payment_id, x.row_id, x.kind, x.method, x.amount_cents
      from jsonb_to_recordset(v_items)
           as x(source text, payment_id uuid, row_id uuid, kind text, method text, amount_cents integer, counts boolean)
     where x.counts and x.kind <> 'returned';   -- 0026: never a returned check

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

-- 5b. finance_day_both(p_day)   S (staff: today only)
-- The "Both" summary: one box per school (Worcester, then Shrewsbury).
-- count / total_cents as finance_day's totals (count = payments, total =
-- net); cash / check / card_cents = payments only (money in).
-- Ok: {status, day, schools: [{code, name, count, total_cents, cash_cents,
--      check_cents, card_cents, closed}], total_cents, count}
-- ===== source: black belt (0026) =====
-- 0026: each school's box and the answer itself also carry returned:
-- {count, cents} - the returned checks that count (Black Belt, v0.809;
-- cents <= 0, already inside total_cents). The day's items are built
-- once for that (finance_figures_from over them = finance_figures).
-- ===== end black belt =====
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
  -- ===== source: black belt (0026) =====
  v_all     jsonb;
  -- ===== end black belt =====
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

  -- ===== source: black belt (0026) =====
  -- the day's items built ONCE (both schools): the figures and the
  -- returned checks below come from this one copy
  v_all := public.finance_items_json(null, p_day, p_day);
  -- ===== end black belt =====

  select coalesce(jsonb_agg(jsonb_build_object(
           'code', f.school, 'name', l.name, 'count', f.pay_count, 'total_cents', f.total_cents,
           'cash_cents', f.cash_cents, 'check_cents', f.check_cents, 'card_cents', f.card_cents,
           'closed', (public.finance_active_close(f.school, f.day)).id is not null)
           -- ===== source: black belt (0026) =====
           -- the school's returned checks that count
           || jsonb_build_object('returned',
                (select jsonb_build_object('count', count(*)::integer, 'cents', coalesce(sum(x.amount_cents), 0)::integer)
                   from jsonb_to_recordset(v_all) as x(school text, kind text, counts boolean, amount_cents integer)
                  where x.school = f.school and x.kind = 'returned' and x.counts))
           -- ===== end black belt =====
           order by case f.school when 'worcester' then 0 else 1 end), '[]'::jsonb),
         coalesce(sum(f.total_cents), 0)::integer,
         coalesce(sum(f.pay_count), 0)::integer
    into v_schools, v_total, v_count
    from public.finance_figures_from(v_all, null, p_day, p_day) f   -- 0026: from the one copy (= finance_figures)
    join public.locations l on l.code = f.school;

  return jsonb_build_object('status', 'ok', 'day', p_day, 'schools', v_schools,
                            'total_cents', v_total, 'count', v_count)   -- 0026: + returned (below)
         -- ===== source: black belt (0026) =====
         -- both schools' returned checks together
         || jsonb_build_object('returned',
              (select jsonb_build_object('count', count(*)::integer, 'cents', coalesce(sum(x.amount_cents), 0)::integer)
                 from jsonb_to_recordset(v_all) as x(kind text, counts boolean, amount_cents integer)
                where x.kind = 'returned' and x.counts))
         -- ===== end black belt =====
         ;   -- 0026
end;
$$;

revoke execute on function public.finance_day_both(date) from public, anon, authenticated, service_role;
grant  execute on function public.finance_day_both(date) to authenticated;

commit;

-- End of 0026_finance_black_belt.sql
