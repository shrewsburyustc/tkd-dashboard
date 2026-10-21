-- =====================================================================
-- 0018_finance_private.sql
-- Built over camps' 0017 (0017_finance_camps.sql at git fb4ec24) by
-- supabase/tools/build_0018.py. A guard at the top refuses to run before
-- camps' 0017 is applied.
-- ---------------------------------------------------------------------
-- WHAT THIS FILE IS
--   Finance (0011) learns about Color Belt PRIVATE testing payments (0014):
--   the Daily report, Close the day, History, Export, the payment detail,
--   the Home reminder and the Both summary all include them. Build
--   contract: docs/Dashboard Docs/Build contracts/CONTRACT-0018.md.
--   Production order: 0011 (with its speed fix, SETUP 15e) -> camps'
--   0013 + 0017 -> 0014 -> 0018. Forward-only: there is no undo file.
--
-- WHY IT EXISTS
--   0014 keeps private testing money in its own table
--   (testing_private_payments), and a student can be MOVED from an event
--   to a private testing, taking their payments with them (an event
--   reversal + a private copy, written together). Without this file the
--   Daily report would miss private money and show every move as money
--   given back. Here a move is a TRANSFER: the payment's line carries on,
--   the day's totals, expected cash and fingerprint don't change, and a
--   closed day is not "changed after closing" because of it.
--
-- WHAT IT CHANGES
--   * one index: finance_testing_private_payments_paid_on_idx
--   * six Finance functions, replaced: three as camps' 0017 leaves them
--     (finance_chain_steps_core, finance_money_rows_core,
--     finance_payment_detail - every camp block kept byte for byte) and
--     three as 0011 has them (finance_chain_items, finance_figures_from,
--     finance_closing_changes_from). The two chain helpers are first
--     removed with "drop function if exists", because their list of output
--     columns grows.
--     Every change is inside a block marked
--       -- ===== source: color belt private (0018) =====
--       -- ===== end color belt private =====
--     or on a line ending in a "-- 0018" comment; the rest is the base
--     text unchanged (run.mjs checks that).
--   Nothing else: no table, row, setting, reminder time, closing or right
--   changes. Every answer keeps its keys; the only new values are the
--   payment detail's history "what" codes 'moved' and 'move_undone'.
--
-- HOW TO RUN IT
--   Supabase dashboard -> SQL Editor -> New query -> paste this WHOLE file
--   -> Run, outside desk hours (building the index briefly holds back
--   private payment writes). One transaction: on any error nothing is
--   kept. The destructive-operations warning comes from the two
--   "drop function if exists" lines (they are recreated straight after).
--   Safe to run again.
--   NOTE on re-running earlier files after this one:
--   * 0011: stops with "cannot change return type of existing function"
--     (finance_chain_items) and is rolled back - nothing changes, 0018
--     stays in force.
--   * camps' 0017: RUNS (it drops and recreates the chain helper) and puts
--     back the chain helper and the money rows WITHOUT private testing -
--     and then the report fails, because 0018's finance_chain_items needs
--     the private columns. Re-run this file straight after it, in the same
--     sitting.
--
-- PRIVACY
--   As 0011: login ids are read only inside finance_chain_steps_core (to
--   compare them) and never returned; testing_private has no date of
--   birth or email; only names, the school, the private day and the
--   private flag are read from it.
-- =====================================================================

begin;

-- The guard: this file stops here, and nothing is changed, unless
--   * 0011 with its speed fix is applied (SETUP section 15e: its paid_on
--     index exists),
--   * 0014 (Color Belt private testing) is applied,
--   * camps' 0017 is applied (its "source: camp (0017)" mark), and
--   * the three Finance functions 0018 shares with camps' 0017 are EXACTLY
--     what 0017 at git fb4ec24 made - or what this file made (a re-run).
--     They are compared by the md5 of their code without comments and
--     white space (as the fingerprints files do). If camps changed 0017
--     after fb4ec24, pasting this file would silently undo that change, so
--     0018 must first be rebuilt over the new 0017 (supabase/tools/
--     build_0018.py).
do $$
begin
  if to_regclass('public.finance_testing_payments_paid_on_idx') is null then
    raise exception '0018 needs migration 0011 with its speed fix (SETUP section 15e) first';
  end if;
  if to_regclass('public.testing_private_payments') is null then
    raise exception '0018 needs migration 0014 (Color Belt private testing) first';
  end if;
  if not exists (select 1 from pg_proc p join pg_namespace n on n.oid = p.pronamespace
                  where n.nspname = 'public' and p.proname = 'finance_chain_steps_core'
                    and position('source: camp (0017)' in p.prosrc) > 0) then
    raise exception '0018 must be applied after camps'' 0017 - not yet (SETUP, Migration 0018)';
  end if;
  if exists (select 1
               from (values
           ('finance_chain_steps_core', '89a7b20c33aedae9aa1743c92f092fd5', '2a894072df0b320c1c659343bdb5ef3d'),
           ('finance_money_rows_core', '179c26c5e1ebb46e4151904629c257c0', '084099705b5a1f6924ed69c854b7f3c2'),
           ('finance_payment_detail', '0ac9334ddd7d6fc2c4d7a48164384d52', '31cc825ef94b5155b927aefba4a256e2')
                    ) as v(name, md5_0017, md5_0018)
               left join (select p.proname,
                                 md5(regexp_replace(regexp_replace(p.prosrc, '--[^\n]*', '', 'g'), '\s+', '', 'g')) as md5
                            from pg_proc p join pg_namespace n on n.oid = p.pronamespace
                           where n.nspname = 'public') as l on l.proname = v.name
              where l.md5 is null or l.md5 not in (v.md5_0017, v.md5_0018)) then
    raise exception '0018 was built over camps'' 0017 at fb4ec24; the live 0017 differs - rebuild 0018 first (supabase/tools/build_0018.py)';
  end if;
end;
$$;

-- Finance looks private payments up by their date (as 0011 does for the
-- other two payment tables).
create index if not exists finance_testing_private_payments_paid_on_idx on public.testing_private_payments (paid_on);

-- finance_chain_items gets one more output column, which "create or
-- replace" can't do: removed here and created again just below (the chain
-- helper is removed and recreated in its own section, as 0017 does).
drop function if exists public.finance_chain_items(date, date, text, uuid);

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
-- ===== source: color belt private (0018) =====
-- 0018: only EDIT steps make an item edited / moved_in and fill was_* and
-- changed_* (a move or an undone move is not a correction: a moved payment
-- stays 'counted'); the final row's recorded_by_name and time are those of
-- the last 'first' or 'edit' step - the person who TOOK the money, not the
-- one who moved it; new output column private_id = the shown row's private
-- testing (NULL = an event / Star row).
-- ===== end color belt private =====
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
  first_recorded_at timestamptz,   -- 0018: + private_id
  private_id        uuid   -- 0018
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
  -- ===== source: color belt private (0018) =====
  c_priv   uuid[];
  c_skind  text[];
  v_ned    integer;      -- how many EDIT steps the chain has
  v_le     integer;      -- the last edit step (0 = none)
  v_lt     integer;      -- the last step that took money ('first' or 'edit')
  -- ===== end color belt private =====
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
                   x.end_state, x.undo_by_name, x.undo_on,   -- 0018: + the two below
                   x.private_id, x.step_kind   -- 0018
              from public.finance_chain_steps_core(p_from, p_to, p_source, p_owner) with ordinality as x
            union all
            select 1, null::bigint, null::text, null::uuid, null::uuid, 0, null::uuid, null::text,
                   null::integer, null::text, null::date, null::timestamptz, null::text, null::text, null::date,
                   null::text, null::text, null::date,   -- 0018: + the two below
                   null::uuid, null::text) as y   -- 0018
     order by y.is_end, y.ord
  loop
    if v_n > 0 and (v_s.is_end = 1 or v_s.step = 0) then
      -- ===== source: color belt private (0018) =====
      v_ned := 0;
      v_le := 0;
      v_lt := 1;
      for v_i in 1 .. v_n loop
        if c_skind[v_i] = 'edit' then v_ned := v_ned + 1; v_le := v_i; end if;
        if c_skind[v_i] in ('first', 'edit') then v_lt := v_i; end if;
      end loop;
      -- ===== end color belt private =====
      if v_end = 'live' then
        -- the final row on its day
        source := v_src; chain_id := v_chain; owner_id := v_owner;
        day := c_paid[v_n]; row_id := c_row[v_n]; kind := c_kind[v_n]; method := c_method[v_n];
        amount_cents := c_amount[v_n];   -- 0018: (the time and name below)
        recorded_at := c_at[v_lt]; recorded_by_name := c_name[v_lt];   -- 0018: who took the money
        -- 0018: edits only (v_ned) - was "v_n > 1" (every later step was an edit)
        state := case when v_ned = 0 then 'counted'   -- 0018
                      when c_paid[v_n] = c_paid[1] then 'edited'
                      else 'moved_in' end;
        was_amount_cents := case when v_ned > 0 then c_amount[1] end;   -- 0018
        was_method := case when v_ned > 0 then c_method[1] end;   -- 0018
        moved_to := null;
        moved_from := case when v_ned > 0 and c_paid[v_n] <> c_paid[1] then c_paid[1] end;   -- 0018
        changed_by_name := case when v_le > 0 then c_editby[v_le] end;   -- 0018: the last EDIT
        changed_on := case when v_le > 0 then c_editon[v_le] end;   -- 0018
        first_recorded_at := c_at[1];
        private_id := c_priv[v_n];   -- 0018
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
          private_id := c_priv[v_i];   -- 0018
          if v_end = 'live' then
            state := 'moved_out';
            moved_to := c_paid[v_n];
            changed_by_name := case when v_le > 0 then c_editby[v_le] end;   -- 0018: the last EDIT
            changed_on := case when v_le > 0 then c_editon[v_le] end;   -- 0018
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
      c_priv := '{}'; c_skind := '{}';   -- 0018
    end if;
    v_n := v_n + 1;
    c_paid[v_n] := v_s.paid_on;     c_row[v_n] := v_s.row_id;       c_kind[v_n] := v_s.kind;
    c_method[v_n] := v_s.method;    c_amount[v_n] := v_s.amount_cents;
    c_at[v_n] := v_s.recorded_at;   c_name[v_n] := v_s.recorded_by_name;
    c_editby[v_n] := v_s.edit_by_name; c_editon[v_n] := v_s.edit_on;
    c_priv[v_n] := v_s.private_id;  c_skind[v_n] := v_s.step_kind;   -- 0018
  end loop;
end;
$$;

revoke execute on function public.finance_chain_items(date, date, text, uuid) from public, anon, authenticated, service_role;

-- 3b (0011) with camp items.
-- ===== source: color belt private (0018) =====
-- 0018: an item whose shown row is a PRIVATE testing payment takes the
-- private testing's school, names and private day (is_private true,
-- event_date = private_date) and has no event (event_name / event_id NULL).
-- ===== end color belt private =====
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
           else coalesce(tp.location_code, e.location_code, c.location_code) end,   -- 0018: tp first
         i.day,
         to_char(i.recorded_at at time zone 'America/New_York', 'HH24:MI'),
         coalesce(tp.first_name, g.first_name, c.first_name   -- 0018: tp first
                  -- ===== source: camp (0017) =====
                  , cc.first_name
                  -- ===== end camp =====
                  ),
         coalesce(tp.last_name, g.last_name, c.last_name   -- 0018: tp first
                  -- ===== source: camp (0017) =====
                  , cc.last_name
                  -- ===== end camp =====
                  ),
         i.source,
         case when tp.id is not null then tp.private_date   -- 0018
              when i.source = 'color_belt' then e.testing_date   -- 0018: (moved down a line)
              -- ===== source: camp (0017) =====
              when i.source = 'camp' then public.camp_first_day(ck.id)
              -- ===== end camp =====
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
                  ) end,   -- 0018
         case when tp.id is null then coalesce(e.id, se.id   -- 0018: no event for a private row
                  -- ===== source: camp (0017) =====
                  , ck.id
                  -- ===== end camp =====
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
   where (tp.id is not null or e.id is not null or se.id is not null   -- 0018: tp
          -- ===== source: camp (0017) =====
          or ck.id is not null
          -- ===== end camp =====
          )
     and (p_location_code is null
          or (case
                -- ===== source: camp (0017) =====
                when i.source = 'camp' then cp.school
                -- ===== end camp =====
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
           md5(coalesce(string_agg(i.payment_id::text || '|' || i.amount_cents::text || '|' || i.method || '|' || i.state, ','   -- 0018
                                   order by (i.payment_id::text || '|' || i.amount_cents::text || '|' || i.method || '|' || i.state) collate "C"),   -- 0018
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
                   or v_f.card_cents     is distinct from v_c.expected_card_cents;
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

commit;
