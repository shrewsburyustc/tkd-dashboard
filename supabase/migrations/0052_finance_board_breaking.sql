-- =====================================================================
-- 0052_finance_board_breaking.sql
-- ---------------------------------------------------------------------
-- WHAT THIS FILE IS
--   Finance reads Board breaking money (the Board breaking section's own
--   migration is 0051, live). It runs AFTER 0051 and, like 0017 (camps)
--   and 0026 (Black Belt) before it, adds ONE MORE SOURCE to Finance: a
--   fifth source, 'board_breaking', next to 'color_belt', 'star', 'camp'
--   and 'black_belt'. It REPLACES five Finance functions, each starting
--   from the live text (0026's chain steps; 0047's money rows core, day,
--   payment detail and export), and rebuilds ONE table rule:
--     finance_chain_steps_core    (0026)  reads the payment rows and links edits
--     finance_money_rows_core     (0047)  where a line counts, its names, event, school
--     finance_day                 (0047)  the Daily report / Close the day items
--     finance_payment_detail      (0047)  the dialog behind a row
--     finance_export              (0047)  the CSV rows
--     finance_day_closing_items_source_check (0026)  a close's snapshot may hold Board breaking items
--   Nothing else changes: no table, no other function, no right, no
--   data. It touches no brk_ object and 0051 is not changed.
--
-- WHY IT EXISTS
--   Board breaking payments (brk_payments: cash, check, card by hand, and
--   card through Square) must count on the same Daily report, Close the
--   day, History, Export and payment detail as every other section's
--   money, as "Board breaking" (rulebook v1.300-v1.304). Until this file
--   they are invisible to Finance.
--
-- WHAT IT CHANGES (the Board breaking additions; each one is a marked block
--   that starts with "source: board breaking (0052)" and ends with "end board breaking")
--   * Chain steps: one more branch over public.brk_payments; the owner is
--     the student's registration. The chain rules are the ones every
--     source already uses. brk_edit_payment writes an edit as a reversal +
--     a new payment in ONE transaction (the same recorded_at, the same
--     login), exactly as camps' and Black Belt's functions do, so an edit
--     shows once, as "Edited"; an undo is a reversal alone; a refund is its
--     own row (kind 'refund'); the staff member's own Undo within 10
--     seconds is a hidden mis-click. A Square payment has no login
--     (recorded_by null, recorded_by_name 'Square'), so it can never be
--     taken for the new row of an edit (a missing login never matches).
--   * Money rows: a Board breaking line counts at the school STORED ON THE
--     PAYMENT shown (brk_payments.school: the desk that took the money,
--     the desk that handed a refund back, and for a Square payment the
--     EVENT's school); names from the student's registration; event name,
--     id and day from the event; never private; was_school as for the
--     other sections (the school of the chain's first payment, shown on an
--     edited line when it is not the line's own school).
--   * finance_day / finance_export: a Board breaking line also carries
--     event_name (the camp pattern; no other key).
--   * finance_payment_detail: 'board_breaking' is a source it accepts; its
--     owner and day range come from brk_payments; the item carries
--     event_name like a camp's.
--   * The table rule finance_day_closing_items_source_check also allows
--     'board_breaking' (existing rows stay valid: it only adds a value).
--   * Everything else in the five functions is the live text, character for
--     character (the md5s in the guard below prove which text each was
--     built from). The other readers (figures, history, close the day,
--     both schools, the home reminder) work from the items' JSON by field
--     name, so they need no change and are not replaced.
--   Same names, same arguments, same results, same security (definer /
--   search_path = '' as before), same owner, same revoke and grant lines
--   (the two internal helpers: nobody but the owner; the three app
--   functions: authenticated only; nothing for anon). The result tables of
--   the helpers are unchanged, so "create or replace" is enough: no drop.
--
-- WHAT TO KNOW BEFORE APPLYING
--   * Order: 0051 first (it is live; this file refuses to run without its
--     tables). Finance's 0047 must be live too (it is): the guard checks the
--     live functions are exactly 0047's / 0026's text.
--   * The live app ignores keys it does not know and has never seen the
--     source 'board_breaking', so pasting this changes nothing on screen
--     until Board breaking payments exist and the Finance app that names
--     the source ("Board breaking") is pushed. Until then the new rows would
--     show with a plain source word; no payment exists yet.
--   * Every other section's rows and totals are unchanged (tested: the same
--     Finance answers before and after, on five years of seeded history).
--   * A close that already exists keeps its figures. A closed day that
--     gains a Board breaking line after this file shows "Changed after
--     closing", like any line added after a close.
--
-- HOW TO RUN IT
--   Supabase dashboard -> SQL Editor -> New query -> paste this WHOLE file
--   -> Run. It starts with "begin;" and ends with "commit;", so it is one
--   transaction: if anything fails, nothing is kept. It contains one
--   "drop constraint" (the table rule is dropped and added again right after
--   in the same statement) so Supabase may show a destructive-operations
--   warning: that is expected, no data is removed.
--   Safe to run again: the guard accepts the live text OR this file's text,
--   "create or replace" puts the same text back and the rule is replaced by
--   itself (tested in PGlite, run.mjs step0052: a second run changes no
--   fingerprint). Forward-only: no undo file (with no Board breaking
--   payment the functions behave as before; going back would need a new
--   migration).
-- =====================================================================

begin;


-- ---------------------------------------------------------------------
-- 1. The guard: stops here - and changes nothing - unless
--    * 0051's tables and the columns this file reads exist, and
--    * each of the five functions is EXACTLY the live text (or what this
--      file made, on a re-run), the internal wrapper finance_money_rows is
--      0047's, and the table rule is the live one (or this file's), all
--      compared by an md5 of the code without comments and white space,
--      the same way the fingerprints files do. If someone changed one
--      since, pasting this file would silently undo that change - so this
--      file must be rebuilt first.
--      (function, live md5, this file's md5)
-- ---------------------------------------------------------------------
do $$
declare
  v_row record;
  v_md5 text;
begin
  if to_regclass('public.brk_payments') is null
     or to_regclass('public.brk_registrations') is null
     or to_regclass('public.brk_events') is null then
    raise exception '0052 needs migration 0051 (Board breaking) first';
  end if;
  if (select count(*) from information_schema.columns c
       where c.table_schema = 'public'
         and ((c.table_name = 'brk_payments'
               and c.column_name in ('id', 'registration_id', 'kind', 'amount_cents', 'method', 'paid_on', 'school',
                                     'recorded_at', 'recorded_by', 'recorded_by_name', 'reverses_payment_id'))
              or (c.table_name = 'brk_registrations' and c.column_name in ('id', 'event_id', 'first_name', 'last_name'))
              or (c.table_name = 'brk_events' and c.column_name in ('id', 'name', 'event_date')))) <> 18 then
    raise exception '0052 needs the columns of 0051''s Board breaking tables (brk_payments, brk_registrations, brk_events)';
  end if;
  for v_row in
    select * from (values
      ('public.finance_chain_steps_core(date, date, text, uuid)', '6d03a519cc5ada725a961b1c672dbe82', 'f59ce2d742c8f69e9b76109962cc5edf'),
      ('public.finance_money_rows_core(text, date, date, text, uuid)', '11479fb6451a956b5f8bb5bc6b5c0366', '534cb48c5cc6d5f6c9be6ce4ca0e0d8d'),
      ('public.finance_day(text, date)', '8cb806284e54443fb73bd4a8f679b617', 'fe768b06d00755793c0352c41fabcd3e'),
      ('public.finance_payment_detail(text, uuid)', 'cc90ec717325831a58a3063c9cb73c12', '61b9768f75082591f5e74a79ad5fee33'),
      ('public.finance_export(text, date, date)', '0f4b678f757bca72fec14bb78aacd37d', '637d23b573269daa3e8f4f23f2d1e68a'),
      ('public.finance_money_rows(text, date, date)', '6882b0a0f80407ba97864f47feae0e7f', '6882b0a0f80407ba97864f47feae0e7f')
    ) as t(sig, live_md5, new_md5)
  loop
    if to_regprocedure(v_row.sig) is null then
      raise exception '0052 needs % (Finance, migrations 0026 and 0047) first', v_row.sig;
    end if;
    select md5(regexp_replace(regexp_replace(p.prosrc, '--[^\n]*', '', 'g'), '\s+', '', 'g'))
      into v_md5
      from pg_proc p
     where p.oid = to_regprocedure(v_row.sig);
    if v_md5 not in (v_row.live_md5, v_row.new_md5) then
      raise exception '0052 was built over the live %, but the live one is different (md5 %) - rebuild 0052 first', v_row.sig, v_md5;
    end if;
  end loop;
  -- the table rule: the live one (0026's) or this file's
  select md5(regexp_replace(pg_get_constraintdef(c.oid), '\s+', '', 'g'))
    into v_md5
    from pg_constraint c
   where c.connamespace = 'public'::regnamespace
     and c.conrelid = to_regclass('public.finance_day_closing_items')
     and c.conname = 'finance_day_closing_items_source_check';
  if v_md5 is null or v_md5 not in ('90f7e1c6ff131e9c45f4b8fca93d533a', '4992db56bbcd5091040aea69560a2cf3') then
    raise exception '0052 was built over the live finance_day_closing_items_source_check, but it is different (md5 %) - rebuild 0052 first', coalesce(v_md5, 'missing');
  end if;
end;
$$;


-- ---------------------------------------------------------------------
-- 2. The table rule: a close's snapshot may now hold Board breaking items.
--    ("drop constraint" + "add constraint" in one statement = replace; safe
--    to run again. Existing rows stay valid: the new list only adds a value.)
-- ---------------------------------------------------------------------
alter table public.finance_day_closing_items
  drop constraint if exists finance_day_closing_items_source_check,
  add constraint finance_day_closing_items_source_check
    check (source in ('color_belt', 'star', 'camp', 'black_belt', 'board_breaking'));


-- ---------------------------------------------------------------------
-- 3. The five functions (the live text + Board breaking's marked blocks)
-- ---------------------------------------------------------------------

-- 3a (0011, 0017, 0018, 0026): finance_chain_steps_core - one more source,
-- 'board_breaking' (see the long note above the 0026 version of this function).
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
            -- ===== source: board breaking (0052) =====
            -- Board breaking payments (0051, table brk_payments); the owner is the student's
            -- registration. Same rules as every other source: an edit is a reversal + a new
            -- payment written in ONE transaction (same recorded_at, same login), an undo is a
            -- reversal alone, a refund is its own row. A Square payment has no login
            -- (recorded_by null, recorded_by_name 'Square'): a missing login never matches
            -- anything, so Square's payment is never read as the new row of an edit.
            union all
            select 0, 'board_breaking'::text, p.registration_id, p.id, p.kind, p.amount_cents,
                   p.method, p.paid_on, p.recorded_at, p.recorded_by, p.recorded_by_name, p.reverses_payment_id
              from public.brk_payments p
             where p.registration_id in
                   (select q.registration_id from public.brk_payments q
                     where (p_owner is null and q.kind <> 'reversal' and q.paid_on between p_from and p_to)
                        or (p_source = 'board_breaking' and q.registration_id = p_owner))
            -- ===== end board breaking =====
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

-- 3b (0011, 0017, 0018, 0026, 0047): finance_money_rows_core - Board breaking
-- lines count at the school stored on the payment, with the student's names
-- and the event's name, id and day.
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
           -- ===== source: board breaking (0052) =====
           -- the school STORED ON THE PAYMENT shown: the desk that took the money (a refund: the desk that
           -- handed it back); for a Square payment, the event's school (0051)
           when i.source = 'board_breaking' then kp.school
           -- ===== end board breaking =====
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
                  -- ===== source: board breaking (0052) =====
                  , kr.first_name
                  -- ===== end board breaking =====
                  ),
         coalesce(tp.last_name, g.last_name, c.last_name   -- 0018: tp first
                  -- ===== source: camp (0017) =====
                  , cc.last_name
                  -- ===== end camp =====
                  -- ===== source: black belt (0026) =====
                  , bc.last_name
                  -- ===== end black belt =====
                  -- ===== source: board breaking (0052) =====
                  , kr.last_name
                  -- ===== end board breaking =====
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
              -- ===== source: board breaking (0052) =====
              when i.source = 'board_breaking' then kv.event_date
              -- ===== end board breaking =====
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
                  -- ===== source: board breaking (0052) =====
                  , kv.name
                  -- ===== end board breaking =====
                  ) end,   -- 0018
         case when tp.id is null then coalesce(e.id, se.id   -- 0018: no event for a private row
                  -- ===== source: camp (0017) =====
                  , ck.id
                  -- ===== end camp =====
                  -- ===== source: black belt (0026) =====
                  , bp.cycle_id
                  -- ===== end black belt =====
                  -- ===== source: board breaking (0052) =====
                  , kv.id
                  -- ===== end board breaking =====
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
                      when i.source = 'board_breaking' then (select x.school from public.brk_payments x where x.id = i.chain_id)   -- 0052
                      else coalesce((select x.school from public.testing_payments x where x.id = i.chain_id),
                                    (select x.school from public.testing_private_payments x where x.id = i.chain_id)) end as s) f
             where f.s is distinct from (case
                      when i.source = 'camp' then cp.school
                      when i.source = 'black_belt' then bp.location_code
                      when i.source = 'board_breaking' then kp.school   -- 0052
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
    -- ===== source: board breaking (0052) =====
    -- the Board breaking row shown (its school as recorded), the student (names only) and the event
    -- (its name and day)
    left join public.brk_payments kp on i.source = 'board_breaking' and kp.id = i.row_id
    left join public.brk_registrations kr on i.source = 'board_breaking' and kr.id = i.owner_id
    left join public.brk_events kv on kv.id = kr.event_id
    -- ===== end board breaking =====
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
          -- ===== source: board breaking (0052) =====
          or kr.id is not null
          -- ===== end board breaking =====
          )
     and (p_location_code is null
          or (case
                -- ===== source: camp (0017) =====
                when i.source = 'camp' then cp.school
                -- ===== end camp =====
                -- ===== source: black belt (0026) =====
                when i.source = 'black_belt' then bp.location_code
                -- ===== end black belt =====
                -- ===== source: board breaking (0052) =====
                when i.source = 'board_breaking' then kp.school
                -- ===== end board breaking =====
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

-- 5a (0011, 0017, 0026, 0047): finance_day - a Board breaking line carries event_name.
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
           -- ===== source: board breaking (0052) =====
           -- a Board breaking line also carries the event's name (the camp pattern)
           || case when m.source = 'board_breaking' then jsonb_build_object('event_name', m.event_name) else '{}'::jsonb end
           -- ===== end board breaking =====
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

-- 5h (0011, 0017, 0018, 0026, 0047): finance_payment_detail - accepts 'board_breaking'.
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
                         -- ===== source: board breaking (0052) =====
                         , 'board_breaking'
                         -- ===== end board breaking =====
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
  -- ===== source: board breaking (0052) =====
  elsif p_source = 'board_breaking' then
    -- a Board breaking payment's owner is the student's registration
    select p.registration_id into v_owner from public.brk_payments p where p.id = p_payment_id;
    select min(p.paid_on), max(p.paid_on) into v_from, v_to
      from public.brk_payments p where p.registration_id = v_owner and p.kind <> 'reversal';
  -- ===== end board breaking =====
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
      -- ===== source: board breaking (0052) =====
      -- a Board breaking item also carries the event's name (the camp pattern)
      || case when p_source = 'board_breaking' then jsonb_build_object('event_name', v_item.event_name) else '{}'::jsonb end
      -- ===== end board breaking =====
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

-- 5i (0011, 0017, 0026, 0037, 0047): finance_export - a Board breaking row carries event_name.
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
             -- ===== source: board breaking (0052) =====
             -- a Board breaking row also carries the event's name (the export's event)
             || case when m.source = 'board_breaking' then jsonb_build_object('event_name', m.event_name) else '{}'::jsonb end
             -- ===== end board breaking =====
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

-- End of 0052_finance_board_breaking.sql
