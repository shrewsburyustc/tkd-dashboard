"""Builds supabase/migrations/0018_finance_private.sql from the BASE migration's
function texts (today 0011; later camps' 0017) plus the marked 0018 blocks.
Usage: python build_0018.py <base .sql> <out .sql>
Every change is an exact text replacement; a missing anchor stops the build."""
import sys

base_path, out_path = sys.argv[1], sys.argv[2]
base = open(base_path, encoding='utf-8', newline='').read().replace('\r\n', '\n')

B = '-- ===== source: color belt private (0018) ====='
E = '-- ===== end color belt private ====='


def block(start, end_line):
    a = base.index(start)
    b = base.index(end_line, a) + len(end_line)
    return base[a:b]


def rep(text, old, new, count=1):
    n = text.count(old)
    assert n == count, (old[:90], n)
    return text.replace(old, new)


# ---------------------------------------------------------------------
# 3a. finance_chain_steps_core
steps = block('-- 3a. finance_chain_steps_core(p_from, p_to, p_source, p_owner) - every',
              'revoke execute on function public.finance_chain_steps_core(date, date, text, uuid) from public, anon, authenticated, service_role;\n')
steps = rep(steps, """-- Reads login ids (recorded_by) for two comparisons only; never returns one.
create or replace function""", """-- Reads login ids (recorded_by) for two comparisons only; never returns one.
""" + B + """
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
-- step's link was written).
""" + E + """
create or replace function""")
steps = rep(steps, """  undo_amount_cents integer,
  undo_method       text
)
language plpgsql""", """  undo_amount_cents integer,
  undo_method       text,
  """ + B + """
  private_id        uuid,
  step_kind         text,
  link_at           timestamptz,
  link_by_name      text
  """ + E + """
)
language plpgsql""")
steps = rep(steps, """  a_target uuid[];
  -- worked out per owner""", """  a_target uuid[];
  """ + B + """
  a_priv   uuid[];      -- the private testing of the row (NULL = an event / Star row)
  a_mfrom  uuid[];      -- a private copy: the event payment it was moved from
  a_ltype  text[];      -- for reversal i: 'edit', 'move' or 'move_undone' (with a_new)
  """ + E + """
  -- worked out per owner""")
steps = rep(steps, """    select x.*
      from (select 0 as is_end, 'color_belt'::text as src, p.registration_id as owner, p.id, p.kind, p.amount_cents,
                   p.method, p.paid_on, p.recorded_at, p.recorded_by, p.recorded_by_name, p.reverses_payment_id
              from public.testing_payments p
             where p.registration_id in
                   (select q.registration_id from public.testing_payments q
                     where (p_owner is null and q.kind <> 'reversal' and q.paid_on between p_from and p_to)
                        or (p_source = 'color_belt' and q.registration_id = p_owner))
            union all""", """    with cb_owner as (
      -- the Color Belt owners: registrations with a payment in the range
      -- (or the one asked for)
      select q.registration_id as owner from public.testing_payments q
       where (p_owner is null and q.kind <> 'reversal' and q.paid_on between p_from and p_to)
          or (p_source = 'color_belt' and q.registration_id = p_owner)
      """ + B + """
      union
      -- ... and the owners of private testings with a payment in the range
      select coalesce(t.moved_from_registration_id, t.id)
        from public.testing_private_payments q
        join public.testing_private t on t.id = q.private_id
       where (p_owner is null and q.kind <> 'reversal' and q.paid_on between p_from and p_to)
          or (p_source = 'color_belt' and coalesce(t.moved_from_registration_id, t.id) = p_owner)
      """ + E + """
    )
    select x.*
      from (select 0 as is_end, 'color_belt'::text as src, p.registration_id as owner, p.id, p.kind, p.amount_cents,
                   p.method, p.paid_on, p.recorded_at, p.recorded_by, p.recorded_by_name, p.reverses_payment_id,
                   null::uuid as private_id, null::uuid as moved_from
              from public.testing_payments p
             where p.registration_id in (select o.owner from cb_owner o)
            union all
            """ + B + """
            select 0, 'color_belt'::text, coalesce(t.moved_from_registration_id, t.id), p.id, p.kind, p.amount_cents,
                   p.method, p.paid_on, p.recorded_at, p.recorded_by, p.recorded_by_name, p.reverses_payment_id,
                   t.id, p.moved_from_payment_id
              from public.testing_private_payments p
              join public.testing_private t on t.id = p.private_id
             where coalesce(t.moved_from_registration_id, t.id) in (select o.owner from cb_owner o)
            union all
            """ + E + """""")
steps = rep(steps, """            select 0, 'star'::text, p.candidate_id, p.id, p.kind, p.amount_cents,
                   p.method, p.paid_on, p.recorded_at, p.recorded_by, p.recorded_by_name, p.reverses_payment_id
              from public.star_payments p""", """            select 0, 'star'::text, p.candidate_id, p.id, p.kind, p.amount_cents,
                   p.method, p.paid_on, p.recorded_at, p.recorded_by, p.recorded_by_name, p.reverses_payment_id,
                   null::uuid, null::uuid   -- 0018: (no private testing)
              from public.star_payments p""")
steps = rep(steps, """            select 1, null::text, null::uuid, null::uuid, null::text, null::integer,
                   null::text, null::date, null::timestamptz, null::uuid, null::text, null::uuid) as x""",
            """            select 1, null::text, null::uuid, null::uuid, null::text, null::integer,
                   null::text, null::date, null::timestamptz, null::uuid, null::text, null::uuid,
                   null::uuid, null::uuid) as x   -- 0018: + private_id, moved_from""")
steps = rep(steps, """      a_isnew := array_fill(false, array[v_n]);
""", """      a_isnew := array_fill(false, array[v_n]);
      a_ltype := array_fill(''::text, array[v_n]);   -- 0018
""")
steps = rep(steps, """          if v_t > 0 then
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
          end if;""", """          if v_t > 0 then
            a_revof[v_t] := v_i;
            if a_kind[v_t] = 'payment' then
              v_k := 0;
              """ + B + """
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
              """ + E + """
              for v_j in 1 .. v_n loop
                if a_kind[v_j] = 'payment' and v_j <> v_t
                   and a_at[v_j] = a_at[v_i] and a_by[v_j] = a_by[v_i]
                   and a_priv[v_j] is not distinct from a_priv[v_i]   -- 0018: same table / private testing
                   and (v_k = 0 or a_id[v_j] < a_id[v_k]) then
                  v_k := v_j;
                end if;
              end loop;
              a_new[v_i] := v_k;
              if v_k > 0 then a_isnew[v_k] := true; a_ltype[v_i] := 'edit'; end if;
            end if;
          end if;""")
steps = rep(steps, """      -- rule 1: a chain starts at a payment or refund that isn't the new
      -- row of an edit; follow each edit to its new row (rules 2-3)""", """      """ + B + """
      -- an undone move: an EVENT reversal of an event payment P that is
      -- neither an edit nor a move, and an unclaimed event payment N of the
      -- same student with P's recorded_at, NO login, and P's amount, method
      -- and day (0014's Undo move writes exactly that). On a tie the
      -- smallest id wins (CONTRACT-0018 2.3, edge case 1).
      for v_i in 1 .. v_n loop
        continue when a_kind[v_i] <> 'reversal' or a_new[v_i] > 0 or a_priv[v_i] is not null;
        v_t := 0;
        for v_j in 1 .. v_n loop
          if a_id[v_j] = a_target[v_i] then v_t := v_j; end if;
        end loop;
        continue when v_t = 0 or a_kind[v_t] <> 'payment' or a_priv[v_t] is not null;
        v_k := 0;
        for v_j in 1 .. v_n loop
          if a_kind[v_j] = 'payment' and v_j <> v_t and not a_isnew[v_j] and a_priv[v_j] is null
             and a_by[v_j] is null and a_at[v_j] = a_at[v_t]
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
      """ + E + """

      -- rule 1: a chain starts at a payment or refund that isn't the new
      -- row of an edit; follow each edit to its new row (rules 2-3)""")
steps = rep(steps, """          edit_by_name      := case when a_edits[v_i] > 0 then a_name[a_edits[v_i]] end;
          edit_on           := case when a_edits[v_i] > 0 then a_paid[a_edits[v_i]] end;""",
            """          -- 0018: who / when of an EDIT only (a move is not a correction)
          edit_by_name      := case when a_edits[v_i] > 0 and a_ltype[a_edits[v_i]] = 'edit' then a_name[a_edits[v_i]] end;
          edit_on           := case when a_edits[v_i] > 0 and a_ltype[a_edits[v_i]] = 'edit' then a_paid[a_edits[v_i]] end;""")
steps = rep(steps, """          undo_method       := case when v_ri > 0 then a_method[v_ri] end;
          return next;""", """          undo_method       := case when v_ri > 0 then a_method[v_ri] end;
          """ + B + """
          private_id        := a_priv[v_k];
          step_kind         := case when a_edits[v_i] = 0 then 'first' else a_ltype[a_edits[v_i]] end;
          link_at           := case when a_edits[v_i] > 0 then a_at[a_edits[v_i]] end;
          -- an undone move: the person who undid it (the recreated row's name)
          link_by_name      := case when a_edits[v_i] = 0 then null
                                    when a_ltype[a_edits[v_i]] = 'move_undone' then a_name[v_k]
                                    else a_name[a_edits[v_i]] end;
          """ + E + """
          return next;""")
steps = rep(steps, """      a_at := '{}'; a_by := '{}'; a_name := '{}'; a_target := '{}';
    end if;""", """      a_at := '{}'; a_by := '{}'; a_name := '{}'; a_target := '{}';
      a_priv := '{}'; a_mfrom := '{}';   -- 0018
    end if;""")
steps = rep(steps, """    a_target[v_n] := v_row.reverses_payment_id;
  end loop;""", """    a_target[v_n] := v_row.reverses_payment_id;
    a_priv[v_n]   := v_row.private_id;   -- 0018
    a_mfrom[v_n]  := v_row.moved_from;   -- 0018
  end loop;""")

# ---------------------------------------------------------------------
# 3a2. finance_chain_items
items = block('-- 3a2. finance_chain_items(p_from, p_to, p_source, p_owner) - the report\'s',
              'revoke execute on function public.finance_chain_items(date, date, text, uuid) from public, anon, authenticated, service_role;\n')
items = rep(items, """-- that day. Works chain by chain over 3a's rows (same owners rule).
create or replace function""", """-- that day. Works chain by chain over 3a's rows (same owners rule).
""" + B + """
-- 0018: only EDIT steps make an item edited / moved_in and fill was_* and
-- changed_* (a move or an undone move is not a correction: a moved payment
-- stays 'counted'); new output column private_id = the shown row's private
-- testing (NULL = an event / Star row).
""" + E + """
create or replace function""")
items = rep(items, """  changed_on        date,
  first_recorded_at timestamptz
)
language plpgsql""", """  changed_on        date,
  first_recorded_at timestamptz,
  private_id        uuid   -- 0018
)
language plpgsql""")
items = rep(items, """  c_editon date[];
  -- the chain's own facts""", """  c_editon date[];
  """ + B + """
  c_priv   uuid[];
  c_skind  text[];
  v_ned    integer;      -- how many EDIT steps the chain has
  v_le     integer;      -- the last edit step (0 = none)
  """ + E + """
  -- the chain's own facts""")
items = rep(items, """                   x.end_state, x.undo_by_name, x.undo_on
              from public.finance_chain_steps_core(p_from, p_to, p_source, p_owner) with ordinality as x
            union all
            select 1, null::bigint, null::text, null::uuid, null::uuid, 0, null::uuid, null::text,
                   null::integer, null::text, null::date, null::timestamptz, null::text, null::text, null::date,
                   null::text, null::text, null::date) as y""", """                   x.end_state, x.undo_by_name, x.undo_on,
                   x.private_id, x.step_kind   -- 0018
              from public.finance_chain_steps_core(p_from, p_to, p_source, p_owner) with ordinality as x
            union all
            select 1, null::bigint, null::text, null::uuid, null::uuid, 0, null::uuid, null::text,
                   null::integer, null::text, null::date, null::timestamptz, null::text, null::text, null::date,
                   null::text, null::text, null::date,
                   null::uuid, null::text) as y   -- 0018""")
items = rep(items, """    if v_n > 0 and (v_s.is_end = 1 or v_s.step = 0) then
      if v_end = 'live' then""", """    if v_n > 0 and (v_s.is_end = 1 or v_s.step = 0) then
      """ + B + """
      v_ned := 0;
      v_le := 0;
      for v_i in 1 .. v_n loop
        if c_skind[v_i] = 'edit' then v_ned := v_ned + 1; v_le := v_i; end if;
      end loop;
      """ + E + """
      if v_end = 'live' then""")
items = rep(items, """        state := case when v_n = 1 then 'counted'
                      when c_paid[v_n] = c_paid[1] then 'edited'
                      else 'moved_in' end;
        was_amount_cents := case when v_n > 1 then c_amount[1] end;
        was_method := case when v_n > 1 then c_method[1] end;
        moved_to := null;
        moved_from := case when v_n > 1 and c_paid[v_n] <> c_paid[1] then c_paid[1] end;
        changed_by_name := c_editby[v_n]; changed_on := c_editon[v_n];
        first_recorded_at := c_at[1];
        return next;""", """        -- 0018: edits only (v_ned) - was "v_n > 1" (every later step was an edit)
        state := case when v_ned = 0 then 'counted'
                      when c_paid[v_n] = c_paid[1] then 'edited'
                      else 'moved_in' end;
        was_amount_cents := case when v_ned > 0 then c_amount[1] end;
        was_method := case when v_ned > 0 then c_method[1] end;
        moved_to := null;
        moved_from := case when v_ned > 0 and c_paid[v_n] <> c_paid[1] then c_paid[1] end;
        changed_by_name := case when v_le > 0 then c_editby[v_le] end;   -- 0018: the last EDIT
        changed_on := case when v_le > 0 then c_editon[v_le] end;
        first_recorded_at := c_at[1];
        private_id := c_priv[v_n];   -- 0018
        return next;""")
items = rep(items, """          first_recorded_at := c_at[1];
          if v_end = 'live' then
            state := 'moved_out';
            moved_to := c_paid[v_n];
            changed_by_name := c_editby[v_n]; changed_on := c_editon[v_n];""", """          first_recorded_at := c_at[1];
          private_id := c_priv[v_i];   -- 0018
          if v_end = 'live' then
            state := 'moved_out';
            moved_to := c_paid[v_n];
            changed_by_name := case when v_le > 0 then c_editby[v_le] end;   -- 0018: the last EDIT
            changed_on := case when v_le > 0 then c_editon[v_le] end;""")
items = rep(items, """      c_at := '{}'; c_name := '{}'; c_editby := '{}'; c_editon := '{}';
    end if;""", """      c_at := '{}'; c_name := '{}'; c_editby := '{}'; c_editon := '{}';
      c_priv := '{}'; c_skind := '{}';   -- 0018
    end if;""")
items = rep(items, """    c_editby[v_n] := v_s.edit_by_name; c_editon[v_n] := v_s.edit_on;
  end loop;""", """    c_editby[v_n] := v_s.edit_by_name; c_editon[v_n] := v_s.edit_on;
    c_priv[v_n] := v_s.private_id;  c_skind[v_n] := v_s.step_kind;   -- 0018
  end loop;""")

# ---------------------------------------------------------------------
# 3b. finance_money_rows_core
money = block('-- 3b. finance_money_rows_core(p_location_code, p_from, p_to, p_source,',
              'revoke execute on function public.finance_money_rows_core(text, date, date, text, uuid) from public, anon, authenticated, service_role;\n')
money = rep(money, """-- id for the payment detail).
create or replace function public.finance_money_rows_core(""", """-- id for the payment detail).
""" + B + """
-- 0018: an item whose shown row is a PRIVATE testing payment takes the
-- private testing's school, names and private day (is_private true,
-- event_date = private_date) and has no event (event_name / event_id NULL).
""" + E + """
create or replace function public.finance_money_rows_core(""")
money = rep(money, """  select i.source, i.chain_id,
         coalesce(e.location_code, c.location_code),
         i.day,
         to_char(i.recorded_at at time zone 'America/New_York', 'HH24:MI'),
         coalesce(g.first_name, c.first_name), coalesce(g.last_name, c.last_name),
         i.source,
         case when i.source = 'color_belt' then e.testing_date else coalesce(c.private_on, se.testing_date) end,
         (i.source = 'star' and c.private_on is not null),""", """  select i.source, i.chain_id,
         coalesce(tp.location_code, e.location_code, c.location_code),   -- 0018: tp first
         i.day,
         to_char(i.recorded_at at time zone 'America/New_York', 'HH24:MI'),
         case when tp.id is not null then tp.first_name else coalesce(g.first_name, c.first_name) end,   -- 0018
         case when tp.id is not null then tp.last_name else coalesce(g.last_name, c.last_name) end,      -- 0018
         i.source,
         case when tp.id is not null then tp.private_date   -- 0018
              when i.source = 'color_belt' then e.testing_date else coalesce(c.private_on, se.testing_date) end,
         (tp.id is not null or (i.source = 'star' and c.private_on is not null)),   -- 0018: tp""")
money = rep(money, """         coalesce(e.name, se.name), coalesce(e.id, se.id)
    from public.finance_chain_items(p_from, p_to, p_source, p_owner) i""", """         case when tp.id is null then coalesce(e.name, se.name) end,   -- 0018: no event for a private row
         case when tp.id is null then coalesce(e.id, se.id) end
    from public.finance_chain_items(p_from, p_to, p_source, p_owner) i
    """ + B + """
    left join public.testing_private tp on tp.id = i.private_id
    """ + E + """""")
money = rep(money, """   where (e.id is not null or se.id is not null)
     and (p_location_code is null or coalesce(e.location_code, c.location_code) = p_location_code)""",
            """   where (tp.id is not null or e.id is not null or se.id is not null)   -- 0018: tp
     and (p_location_code is null or coalesce(tp.location_code, e.location_code, c.location_code) = p_location_code)""")

# ---------------------------------------------------------------------
# 3c. finance_figures_from: fingerprint by payment_id
figs = block('-- 3c. finance_figures(p_location_code, p_from, p_to) - one row per school',
             'revoke execute on function public.finance_figures_from(jsonb, text, date, date) from public, anon, authenticated, service_role;\n')
figs = rep(figs, """--   fingerprint  md5 of the day's shown items, "row_id|amount|method|state"
--                sorted and joined with commas (empty day: md5 of '').""", """--   fingerprint  md5 of the day's shown items, "payment_id|amount|method|state"
--                sorted and joined with commas (empty day: md5 of '').
--                0018: payment_id (the chain's first row) instead of 0011's
--                row_id, so a Move to private testing (the shown row
--                changes, the money doesn't) leaves it unchanged.""")
figs = rep(figs, """           as x(school text, day date, kind text, method text, amount_cents integer, state text, row_id uuid, counts boolean)""",
           """           as x(school text, day date, kind text, method text, amount_cents integer, state text, row_id uuid, counts boolean,
                payment_id uuid)   -- 0018""")
figs = rep(figs, """           md5(coalesce(string_agg(i.row_id::text || '|' || i.amount_cents::text || '|' || i.method || '|' || i.state, ','
                                   order by (i.row_id::text || '|' || i.amount_cents::text || '|' || i.method || '|' || i.state) collate "C"),""",
           """           md5(coalesce(string_agg(i.payment_id::text || '|' || i.amount_cents::text || '|' || i.method || '|' || i.state, ','
                                   order by (i.payment_id::text || '|' || i.amount_cents::text || '|' || i.method || '|' || i.state) collate "C"),""")

# ---------------------------------------------------------------------
# 3h. finance_closing_changes_from: by chain id + amount + method + kind
chg = block('-- 3h. finance_closing_changes_from(closing, items) - "Changed after',
            'revoke execute on function public.finance_closing_changes_from(uuid, jsonb) from public, anon, authenticated, service_role;\n')
chg = rep(chg, """--   changed_count    chains added, removed, or with another row / amount /
--                    method than the snapshot""", """--   changed_count    chains added, removed, or with another amount / method /
--                    kind than the snapshot (0018: no longer the shown row's
--                    id - a Move to private testing changes the row, not
--                    the money)""")
chg = rep(chg, """    from (select x.source, x.payment_id, x.row_id, x.amount_cents, x.method
            from jsonb_to_recordset(coalesce(p_items, '[]'::jsonb))
                 as x(source text, payment_id uuid, school text, day date, row_id uuid, amount_cents integer,
                      method text, counts boolean)""", """    from (select x.source, x.payment_id, x.row_id, x.amount_cents, x.method, x.kind   -- 0018: + kind
            from jsonb_to_recordset(coalesce(p_items, '[]'::jsonb))
                 as x(source text, payment_id uuid, school text, day date, row_id uuid, amount_cents integer,
                      method text, counts boolean, kind text)""")
chg = rep(chg, """    full join (select ci.source, ci.chain_id, ci.row_id, ci.amount_cents, ci.method
                 from public.finance_day_closing_items ci""", """    full join (select ci.source, ci.chain_id, ci.row_id, ci.amount_cents, ci.method, ci.kind   -- 0018: + kind
                 from public.finance_day_closing_items ci""")
chg = rep(chg, """      or cur.row_id <> snap.row_id
      or cur.amount_cents <> snap.amount_cents
      or cur.method <> snap.method;""", """      or cur.amount_cents <> snap.amount_cents   -- 0018: row_id no longer compared
      or cur.method <> snap.method
      or cur.kind <> snap.kind;""")

# ---------------------------------------------------------------------
# 5d. finance_payment_detail
det = block('-- 5d. finance_payment_detail(p_source, p_payment_id)   S',
            'grant  execute on function public.finance_payment_detail(text, uuid) to authenticated;\n')
det = rep(det, """--      history: [{at, by_name, what: recorded | edited | undone | refunded,
--                 amount_cents, method, paid_on}]}   (newest first; an
--      undone line carries the undone row's amount and the undo's date)""", """--      history: [{at, by_name, what: recorded | edited | undone | refunded
--                 | moved | move_undone (0018), amount_cents, method,
--                 paid_on}]}   (newest first; an undone line carries the
--      undone row's amount and the undo's date)
""" + B + """
-- 0018: p_payment_id may be a private testing payment (source 'color_belt');
-- its owner is the event registration it was moved from, else the private
-- testing. A Move adds a 'moved' line (when and by whom it was moved), an
-- Undo move a 'move_undone' line (by whom; at the move's time - 0014 keeps
-- no time of the undo on the rows).
""" + E + """""")
det = rep(det, """  if p_source = 'color_belt' then
    select p.registration_id into v_owner from public.testing_payments p where p.id = p_payment_id;
    select min(p.paid_on), max(p.paid_on) into v_from, v_to
      from public.testing_payments p where p.registration_id = v_owner and p.kind <> 'reversal';
  else""", """  if p_source = 'color_belt' then
    select p.registration_id into v_owner from public.testing_payments p where p.id = p_payment_id;
    """ + B + """
    if v_owner is null then
      select coalesce(t.moved_from_registration_id, t.id) into v_owner
        from public.testing_private_payments p join public.testing_private t on t.id = p.private_id
       where p.id = p_payment_id;
    end if;
    """ + E + """
    -- (the chain itself is looked up below; this only says "the owner has rows")
    v_from := case when v_owner is not null then v_today end;
  else""")
det = rep(det, """    from (select c.recorded_at as at, c.step as n,
                 jsonb_build_object('at', c.recorded_at, 'by_name', c.recorded_by_name,
                                    'what', case when c.step > 0 then 'edited'
                                                 when c.kind = 'refund' then 'refunded'
                                                 else 'recorded' end,""", """    from (select coalesce(c.link_at, c.recorded_at) as at, c.step as n,
                 -- 0018: a step's time and person are its link's (for an edit
                 -- they are the new row's, as before)
                 jsonb_build_object('at', coalesce(c.link_at, c.recorded_at),
                                    'by_name', coalesce(c.link_by_name, c.recorded_by_name),
                                    'what', case c.step_kind
                                              when 'edit' then 'edited'
                                              when 'move' then 'moved'                 -- 0018
                                              when 'move_undone' then 'move_undone'    -- 0018
                                              else case when c.kind = 'refund' then 'refunded' else 'recorded' end
                                            end,""")

head = r"""-- =====================================================================
-- 0018_finance_private.sql
-- ---------------------------------------------------------------------
-- WHAT THIS FILE IS
--   Finance (0011) learns about Color Belt PRIVATE testing payments (0014):
--   the Daily report, Close the day, History, Export, the payment detail,
--   the Home reminder and the Both summary all include them. Build
--   contract: docs/Dashboard Docs/Build contracts/CONTRACT-0018.md.
--   Production order: 0011 -> (camps) 0013 + 0017 -> 0014 -> 0018.
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
--   * six 0011 functions, replaced (create or replace; two are first
--     removed with "drop function if exists" because their list of output
--     columns grows): finance_chain_steps_core, finance_chain_items,
--     finance_money_rows_core, finance_figures_from,
--     finance_closing_changes_from, finance_payment_detail.
--     Every change is inside a block marked
--       -- ===== source: color belt private (0018) =====
--       -- ===== end color belt private =====
--     or on a line ending in a "-- 0018" comment; the rest is the base
--     text unchanged.
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
--   NOTE: re-running 0011 (or camps' 0017) after this file puts back
--   versions WITHOUT private testing payments: run this file again
--   straight after.
--
-- PRIVACY
--   As 0011: login ids are read only inside finance_chain_steps_core (to
--   compare them) and never returned; testing_private has no date of
--   birth or email; only names, the school, the private day and the
--   private flag are read from it.
-- =====================================================================

begin;

-- Finance looks private payments up by their date (as 0011 does for the
-- other two payment tables).
create index if not exists finance_testing_private_payments_paid_on_idx on public.testing_private_payments (paid_on);

-- These two get more output columns, which "create or replace" can't do:
-- removed here and created again just below (nothing else is removed).
drop function if exists public.finance_chain_items(date, date, text, uuid);
drop function if exists public.finance_chain_steps_core(date, date, text, uuid);

"""
out = head + steps + '\n' + items + '\n' + money + '\n' + figs + chg + det + '\ncommit;\n'
open(out_path, 'w', encoding='utf-8', newline='').write(out.replace('\n', '\r\n'))
print('ok', len(out.splitlines()), 'lines')
