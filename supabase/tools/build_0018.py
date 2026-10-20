"""Builds supabase/migrations/0018_finance_private.sql from the function texts
of the migrations it is laid over, plus the marked 0018 blocks:
  camps' 0017 for finance_chain_steps_core, finance_money_rows_core and
  finance_payment_detail (the three 0017 replaced that 0018 changes too);
  0011 for finance_chain_items, finance_figures_from and
  finance_closing_changes_from (0017 doesn't touch them).
Usage: python build_0018.py <0011 .sql> <0017 .sql> <out .sql>
Every change is an exact text replacement; a missing anchor stops the build
(SystemExit with the anchor's first characters)."""
import sys

base11_path, base17_path, out_path = sys.argv[1], sys.argv[2], sys.argv[3]
base11 = open(base11_path, encoding='utf-8', newline='').read().replace('\r\n', '\n')
base17 = open(base17_path, encoding='utf-8', newline='').read().replace('\r\n', '\n')

B = '-- ===== source: color belt private (0018) ====='
E = '-- ===== end color belt private ====='


def block(base, start, end_line):
    if start not in base:
        raise SystemExit(f'build_0018: block start {start[:70]!r} not found - the base file changed')
    a = base.index(start)
    b = base.index(end_line, a) + len(end_line)
    return base[a:b]


def rep(text, old, new, count=1):
    n = text.count(old)
    if n != count:
        raise SystemExit(f'build_0018: expected {count} x {old[:90]!r}, found {n} - the base file changed; update this anchor')
    return text.replace(old, new)


# ---------------------------------------------------------------------
# 3a. finance_chain_steps_core
steps = block(base17, '-- 3a (0011) with a third source, camp.',
              'revoke execute on function public.finance_chain_steps_core(date, date, text, uuid) from public, anon, authenticated, service_role;\n')
steps = rep(steps, """drop function if exists public.finance_chain_steps_core(date, date, text, uuid);
create function""", """""" + B + """
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
""" + E + """
drop function if exists public.finance_chain_steps_core(date, date, text, uuid);
create function""")
steps = rep(steps, """  undo_amount_cents integer,
  undo_method       text
)
language plpgsql""", """  undo_amount_cents integer,
  undo_method       text,   -- 0018: + the columns below
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
            union all""", """    """ + B + """
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
    """ + E + """
    select x.*, tpp.private_id, tpp.moved_from_payment_id as moved_from   -- 0018: + the private columns
      from (select 0 as is_end, 'color_belt'::text as src, p.registration_id as owner, p.id, p.kind, p.amount_cents,
                   p.method, p.paid_on, p.recorded_at, p.recorded_by, p.recorded_by_name, p.reverses_payment_id
              from public.testing_payments p
             where p.registration_id in (select o.owner from cb_owner o)   -- 0018: owners incl. private testings'
            union all
            """ + B + """
            select 0, 'color_belt'::text, coalesce(t.moved_from_registration_id, t.id), p.id, p.kind, p.amount_cents,
                   p.method, p.paid_on, p.recorded_at, p.recorded_by, p.recorded_by_name, p.reverses_payment_id
              from public.testing_private_payments p
              join public.testing_private t on t.id = p.private_id
             where coalesce(t.moved_from_registration_id, t.id) in (select o.owner from cb_owner o)
            union all
            """ + E + """""")
steps = rep(steps, """                   null::text, null::date, null::timestamptz, null::uuid, null::text, null::uuid) as x
""", """                   null::text, null::date, null::timestamptz, null::uuid, null::text, null::uuid) as x
    """ + B + """
    -- the private columns of a private testing row (NULL for every other row)
    left join public.testing_private_payments tpp on x.src = 'color_belt' and tpp.id = x.id
    """ + E + """
""")
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
              if v_k > 0 then a_isnew[v_k] := true; a_ltype[v_i] := 'edit'; end if;   -- 0018: + the link kind
            end if;
          end if;""")
steps = rep(steps, """      -- rule 1: a chain starts at a payment or refund that isn't the new
      -- row of an edit; follow each edit to its new row (rules 2-3)""", """      """ + B + """
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
      """ + E + """

      -- rule 1: a chain starts at a payment or refund that isn't the new
      -- row of an edit; follow each edit to its new row (rules 2-3)""")
steps = rep(steps, """          edit_by_name      := case when a_edits[v_i] > 0 then a_name[a_edits[v_i]] end;
          edit_on           := case when a_edits[v_i] > 0 then a_paid[a_edits[v_i]] end;""",
            """          -- 0018: who / when of an EDIT only (a move is not a correction)
          edit_by_name      := case when a_edits[v_i] > 0 and a_ltype[a_edits[v_i]] = 'edit' then a_name[a_edits[v_i]] end;   -- 0018
          edit_on           := case when a_edits[v_i] > 0 and a_ltype[a_edits[v_i]] = 'edit' then a_paid[a_edits[v_i]] end;      -- 0018""")
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
items = block(base11, '-- 3a2. finance_chain_items(p_from, p_to, p_source, p_owner) - the report\'s',
              'revoke execute on function public.finance_chain_items(date, date, text, uuid) from public, anon, authenticated, service_role;\n')
items = rep(items, """-- that day. Works chain by chain over 3a's rows (same owners rule).
create or replace function""", """-- that day. Works chain by chain over 3a's rows (same owners rule).
""" + B + """
-- 0018: only EDIT steps make an item edited / moved_in and fill was_* and
-- changed_* (a move or an undone move is not a correction: a moved payment
-- stays 'counted'); the final row's recorded_by_name and time are those of
-- the last 'first' or 'edit' step - the person who TOOK the money, not the
-- one who moved it; new output column private_id = the shown row's private
-- testing (NULL = an event / Star row).
""" + E + """
create or replace function""")
items = rep(items, """  changed_on        date,
  first_recorded_at timestamptz
)
language plpgsql""", """  changed_on        date,
  first_recorded_at timestamptz,   -- 0018: + private_id
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
  v_lt     integer;      -- the last step that took money ('first' or 'edit')
  """ + E + """
  -- the chain's own facts""")
items = rep(items, """                   x.end_state, x.undo_by_name, x.undo_on
              from public.finance_chain_steps_core(p_from, p_to, p_source, p_owner) with ordinality as x
            union all
            select 1, null::bigint, null::text, null::uuid, null::uuid, 0, null::uuid, null::text,
                   null::integer, null::text, null::date, null::timestamptz, null::text, null::text, null::date,
                   null::text, null::text, null::date) as y""", """                   x.end_state, x.undo_by_name, x.undo_on,   -- 0018: + the two below
                   x.private_id, x.step_kind   -- 0018
              from public.finance_chain_steps_core(p_from, p_to, p_source, p_owner) with ordinality as x
            union all
            select 1, null::bigint, null::text, null::uuid, null::uuid, 0, null::uuid, null::text,
                   null::integer, null::text, null::date, null::timestamptz, null::text, null::text, null::date,
                   null::text, null::text, null::date,   -- 0018: + the two below
                   null::uuid, null::text) as y   -- 0018""")
items = rep(items, """    if v_n > 0 and (v_s.is_end = 1 or v_s.step = 0) then
      if v_end = 'live' then""", """    if v_n > 0 and (v_s.is_end = 1 or v_s.step = 0) then
      """ + B + """
      v_ned := 0;
      v_le := 0;
      v_lt := 1;
      for v_i in 1 .. v_n loop
        if c_skind[v_i] = 'edit' then v_ned := v_ned + 1; v_le := v_i; end if;
        if c_skind[v_i] in ('first', 'edit') then v_lt := v_i; end if;
      end loop;
      """ + E + """
      if v_end = 'live' then""")
items = rep(items, """        amount_cents := c_amount[v_n]; recorded_at := c_at[v_n]; recorded_by_name := c_name[v_n];
        state := case when v_n = 1""", """        amount_cents := c_amount[v_n];   -- 0018: (the time and name below)
        recorded_at := c_at[v_lt]; recorded_by_name := c_name[v_lt];   -- 0018: who took the money
        state := case when v_n = 1""")
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
            changed_on := case when v_le > 0 then c_editon[v_le] end;   -- 0018""")
items = rep(items, """      c_at := '{}'; c_name := '{}'; c_editby := '{}'; c_editon := '{}';
    end if;""", """      c_at := '{}'; c_name := '{}'; c_editby := '{}'; c_editon := '{}';
      c_priv := '{}'; c_skind := '{}';   -- 0018
    end if;""")
items = rep(items, """    c_editby[v_n] := v_s.edit_by_name; c_editon[v_n] := v_s.edit_on;
  end loop;""", """    c_editby[v_n] := v_s.edit_by_name; c_editon[v_n] := v_s.edit_on;
    c_priv[v_n] := v_s.private_id;  c_skind[v_n] := v_s.step_kind;   -- 0018
  end loop;""")

# ---------------------------------------------------------------------
# 3b. finance_money_rows_core (camps' 0017 version)
money = block(base17, '-- 3b (0011) with camp items.',
              'revoke execute on function public.finance_money_rows_core(text, date, date, text, uuid) from public, anon, authenticated, service_role;\n')
money = rep(money, """-- 3b (0011) with camp items.
create or replace function""", """-- 3b (0011) with camp items.
""" + B + """
-- 0018: an item whose shown row is a PRIVATE testing payment takes the
-- private testing's school, names and private day (is_private true,
-- event_date = private_date) and has no event (event_name / event_id NULL).
""" + E + """
create or replace function""")
money = rep(money, """           else coalesce(e.location_code, c.location_code) end,""",
            """           else coalesce(tp.location_code, e.location_code, c.location_code) end,   -- 0018: tp first""")
money = rep(money, """         coalesce(g.first_name, c.first_name
""", """         coalesce(tp.first_name, g.first_name, c.first_name   -- 0018: tp first
""")
money = rep(money, """         coalesce(g.last_name, c.last_name
""", """         coalesce(tp.last_name, g.last_name, c.last_name   -- 0018: tp first
""")
money = rep(money, """         case when i.source = 'color_belt' then e.testing_date
""", """         case when tp.id is not null then tp.private_date   -- 0018
              when i.source = 'color_belt' then e.testing_date   -- 0018: (moved down a line)
""")
money = rep(money, """         (i.source = 'star' and c.private_on is not null),""",
            """         (tp.id is not null or (i.source = 'star' and c.private_on is not null)),   -- 0018: tp""")
money = rep(money, """         coalesce(e.name, se.name
""", """         case when tp.id is null then coalesce(e.name, se.name   -- 0018: no event for a private row
""")
money = rep(money, """                  ),
         coalesce(e.id, se.id
""", """                  ) end,   -- 0018
         case when tp.id is null then coalesce(e.id, se.id   -- 0018: no event for a private row
""")
money = rep(money, """                  )
    from public.finance_chain_items(p_from, p_to, p_source, p_owner) i""", """                  ) end   -- 0018
    from public.finance_chain_items(p_from, p_to, p_source, p_owner) i""")
money = rep(money, """    left join public.star_events se on se.id = c.event_id
""", """    left join public.star_events se on se.id = c.event_id
    """ + B + """
    left join public.testing_private tp on tp.id = i.private_id
    """ + E + """
""")
money = rep(money, """   where (e.id is not null or se.id is not null
""", """   where (tp.id is not null or e.id is not null or se.id is not null   -- 0018: tp
""")
money = rep(money, """                else coalesce(e.location_code, c.location_code) end) = p_location_code)""",
            """                else coalesce(tp.location_code, e.location_code, c.location_code) end) = p_location_code)   -- 0018: tp""")

# ---------------------------------------------------------------------
# 3c. finance_figures_from: fingerprint by payment_id
figs = block(base11, '-- 3c. finance_figures(p_location_code, p_from, p_to) - one row per school',
             'revoke execute on function public.finance_figures_from(jsonb, text, date, date) from public, anon, authenticated, service_role;\n')
figs = rep(figs, """--   fingerprint  md5 of the day's shown items, "row_id|amount|method|state"
--                sorted and joined with commas (empty day: md5 of '').""", """""" + B + """
--   fingerprint  md5 of the day's shown items, "payment_id|amount|method|state"
--                sorted and joined with commas (empty day: md5 of '').
--                0018: payment_id (the chain's first row) instead of 0011's
--                row_id, so a Move to private testing (the shown row
--                changes, the money doesn't) leaves it unchanged.
""" + E + """""")
figs = rep(figs, """           as x(school text, day date, kind text, method text, amount_cents integer, state text, row_id uuid, counts boolean)""",
           """           as x(school text, day date, kind text, method text, amount_cents integer, state text, row_id uuid, counts boolean,   -- 0018
                payment_id uuid)   -- 0018""")
figs = rep(figs, """           md5(coalesce(string_agg(i.row_id::text || '|' || i.amount_cents::text || '|' || i.method || '|' || i.state, ','
                                   order by (i.row_id::text || '|' || i.amount_cents::text || '|' || i.method || '|' || i.state) collate "C"),""",
           """           md5(coalesce(string_agg(i.payment_id::text || '|' || i.amount_cents::text || '|' || i.method || '|' || i.state, ','   -- 0018
                                   order by (i.payment_id::text || '|' || i.amount_cents::text || '|' || i.method || '|' || i.state) collate "C"),   -- 0018""")

# ---------------------------------------------------------------------
# 3h. finance_closing_changes_from: by chain id + amount + method + kind
chg = block(base11, '-- 3h. finance_closing_changes_from(closing, items) - "Changed after',
            'revoke execute on function public.finance_closing_changes_from(uuid, jsonb) from public, anon, authenticated, service_role;\n')
chg = rep(chg, """--   changed_count    chains added, removed, or with another row / amount /
--                    method than the snapshot (a deleted student or
--                    event, a Star candidate moved to the other school, a
--                    late mis-click undo ... all show up here)""", """""" + B + """
--   changed_count    chains added, removed, or with another amount / method /
--                    kind than the snapshot. 0018: a snapshot item and an item
--                    now are the same when EITHER the chain id or the row id
--                    agrees (a row belongs to one chain, so nothing pairs
--                    twice) - so a Move, an Undo move made before a close of
--                    0011's time, or a moved payment whose event was deleted
--                    later are not differences; the money still is (a
--                    deleted student or event, a Star candidate moved to the
--                    other school, a late mis-click undo ... all show up)
""" + E + """""")
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

# 3h (continued): the comparison itself (pairs by chain id OR row id)
chg = rep(chg, "  select count(*)::integer into changed_count\n    from (select x.source, x.payment_id, x.row_id, x.amount_cents, x.method, x.kind   -- 0018: + kind\n            from jsonb_to_recordset(coalesce(p_items, '[]'::jsonb))\n                 as x(source text, payment_id uuid, school text, day date, row_id uuid, amount_cents integer,\n                      method text, counts boolean, kind text)\n           where x.school = v_c.location_code and x.day = v_c.day and x.counts) as cur\n    full join (select ci.source, ci.chain_id, ci.row_id, ci.amount_cents, ci.method, ci.kind   -- 0018: + kind\n                 from public.finance_day_closing_items ci\n                where ci.closing_id = p_closing_id) as snap\n      on snap.source = cur.source and snap.chain_id = cur.payment_id\n   where cur.payment_id is null\n      or snap.chain_id is null\n      or cur.amount_cents <> snap.amount_cents   -- 0018: row_id no longer compared\n      or cur.method <> snap.method\n      or cur.kind <> snap.kind;", '  -- ===== source: color belt private (0018) =====\n  -- a snapshot item and an item now are the same chain when EITHER the\n  -- chain id or the row id agrees (a row belongs to one chain, so nothing\n  -- pairs twice). A full join can\'t pair on "this OR that", so the three\n  -- kinds of difference are counted one by one: only now, only in the\n  -- snapshot, paired but with other money.\n  with cur as (\n    select x.source, x.payment_id, x.row_id, x.amount_cents, x.method, x.kind\n      from jsonb_to_recordset(coalesce(p_items, \'[]\'::jsonb))\n           as x(source text, payment_id uuid, school text, day date, row_id uuid, amount_cents integer,\n                method text, counts boolean, kind text)\n     where x.school = v_c.location_code and x.day = v_c.day and x.counts\n  ),\n  snap as (\n    select ci.source, ci.chain_id, ci.row_id, ci.amount_cents, ci.method, ci.kind\n      from public.finance_day_closing_items ci\n     where ci.closing_id = p_closing_id\n  )\n  select ((select count(*) from cur c\n            where not exists (select 1 from snap s\n                               where s.source = c.source and (s.chain_id = c.payment_id or s.row_id = c.row_id)))\n        + (select count(*) from snap s\n            where not exists (select 1 from cur c\n                               where c.source = s.source and (s.chain_id = c.payment_id or s.row_id = c.row_id)))\n        + (select count(*) from cur c join snap s\n                on s.source = c.source and (s.chain_id = c.payment_id or s.row_id = c.row_id)\n            where c.amount_cents <> s.amount_cents or c.method <> s.method or c.kind <> s.kind))::integer\n    into changed_count;\n  -- ===== end color belt private =====')

# ---------------------------------------------------------------------
# 5d. finance_payment_detail (camps' 0017 version)
det = block(base17, '-- 5d (0011) for camp payments too.',
            'grant  execute on function public.finance_payment_detail(text, uuid) to authenticated;\n')
det = rep(det, """-- 5d (0011) for camp payments too.
create or replace function""", """-- 5d (0011) for camp payments too.
""" + B + """
-- 0018: p_payment_id may be a private testing payment (source 'color_belt');
-- its owner is the event registration it was moved from, else the private
-- testing. History "what" codes: recorded | edited | undone | refunded and
-- (0018) moved | move_undone: a Move adds a 'moved' line (when and by whom
-- it was moved), an Undo move a 'move_undone' line (by whom; at the move's
-- time - 0014 keeps no time of the undo on the rows).
""" + E + """
create or replace function""")
det = rep(det, """    select p.registration_id into v_owner from public.testing_payments p where p.id = p_payment_id;
    select min(p.paid_on), max(p.paid_on) into v_from, v_to
      from public.testing_payments p where p.registration_id = v_owner and p.kind <> 'reversal';
""", """    select p.registration_id into v_owner from public.testing_payments p where p.id = p_payment_id;
    """ + B + """
    if v_owner is null then
      select coalesce(t.moved_from_registration_id, t.id) into v_owner
        from public.testing_private_payments p join public.testing_private t on t.id = p.private_id
       where p.id = p_payment_id;
    end if;
    -- (the chain itself is looked up below; this only says "the owner has rows")
    v_from := case when v_owner is not null then v_today end;
    """ + E + """
""")
det = rep(det, """    from (select c.recorded_at as at, c.step as n,
                 jsonb_build_object('at', c.recorded_at, 'by_name', c.recorded_by_name,
                                    'what', case when c.step > 0 then 'edited'
                                                 when c.kind = 'refund' then 'refunded'
                                                 else 'recorded' end,""", """    from (select coalesce(c.link_at, c.recorded_at) as at, c.step as n,   -- 0018
                 """ + B + """
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
                 """ + E + """""")

head = r"""-- =====================================================================
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
@@GUARD_VALUES@@
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

"""
# ---------------------------------------------------------------------
# Self-check: every line that differs from the base text must be inside a
# marked 0018 block or carry "0018" (a comment) - so the unmarked text IS
# the base text - no base line may simply disappear, and every camp block
# of the base must be in the output byte for byte.
import difflib

CAMP_B = '-- ===== source: camp (0017) ====='
CAMP_E = '-- ===== end camp ====='


def verify(name, old, new):
    a, b = old.split('\n'), new.split('\n')
    inside, flag = [], False
    for line in b:
        if B in line:
            flag = True
            inside.append(True)
        elif E in line:
            inside.append(True)
            flag = False
        else:
            inside.append(flag)
    bad = []
    changed = 0
    replaced = []
    for tag, i1, i2, j1, j2 in difflib.SequenceMatcher(None, a, b, autojunk=False).get_opcodes():
        if tag == 'equal':
            continue
        replaced += [x for x in a[i1:i2]]
        if j1 == j2:
            bad.append('base lines removed: ' + ' | '.join(x.strip() for x in a[i1:i2])[:200])
            continue
        for j in range(j1, j2):
            changed += 1
            if not (inside[j] or '0018' in b[j] or b[j].strip() == ''):
                bad.append('unmarked new line: ' + b[j].strip()[:160])
    camps = 0
    pos = 0
    while True:
        i = old.find(CAMP_B, pos)
        if i < 0:
            break
        k = old.index(CAMP_E, i) + len(CAMP_E)
        if old[i:k] not in new:
            bad.append('camp block changed: ' + old[i:k][:120])
        camps += 1
        pos = k
    print(f'  check {name}: {changed} new / changed lines, all marked; {camps} camp blocks kept; '
          f'{len(replaced)} base lines replaced (by marked lines):' if not bad
          else f'  check {name}: PROBLEMS')
    for x in replaced:
        print('      - ' + x.rstrip())
    for x in bad:
        print('    ' + x)
    return not bad


# the md5 of a function body, as the fingerprints and the guard work it
# out: comments (-- to the end of the line) and all white space removed
import hashlib
import re


def body_md5(func_text):
    i = func_text.index('as $$') + len('as $$')
    j = func_text.index('$$;', i)
    body = re.sub(r'--[^\n]*', '', func_text[i:j])
    body = re.sub(r'\s+', '', body)
    return hashlib.md5(body.encode('utf-8')).hexdigest()


def only_function(text, name):
    # the "create ... function public.<name>(" ... "$$;" part of a block
    i = text.index('function public.' + name + '(')
    i = text.rindex('create', 0, i)
    return text[i:text.index('$$;', text.index('as $$', i)) + 3]


GUARD_MD5 = {name: (body_md5(only_function(src17, name)), body_md5(only_function(src18, name)))
             for name, src17, src18 in [
                 ('finance_chain_steps_core', block(base17, '-- 3a (0011) with a third source, camp.',
                  'revoke execute on function public.finance_chain_steps_core(date, date, text, uuid) from public, anon, authenticated, service_role;\n'), steps),
                 ('finance_money_rows_core', block(base17, '-- 3b (0011) with camp items.',
                  'revoke execute on function public.finance_money_rows_core(text, date, date, text, uuid) from public, anon, authenticated, service_role;\n'), money),
                 ('finance_payment_detail', block(base17, '-- 5d (0011) for camp payments too.',
                  'grant  execute on function public.finance_payment_detail(text, uuid) to authenticated;\n'), det)]}
guard_values = ',\n'.join(f"           ('{n}', '{a}', '{b}')" for n, (a, b) in GUARD_MD5.items())
head = head.replace('@@GUARD_VALUES@@', guard_values)
print('  guard: ' + '; '.join(f'{n} 0017 {a[:8]} / 0018 {b[:8]}' for n, (a, b) in GUARD_MD5.items()))

ok = all([
    verify('finance_chain_steps_core (over 0017)', block(base17, '-- 3a (0011) with a third source, camp.',
           'revoke execute on function public.finance_chain_steps_core(date, date, text, uuid) from public, anon, authenticated, service_role;\n'), steps),
    verify('finance_chain_items (over 0011)', block(base11, '-- 3a2.',
           'revoke execute on function public.finance_chain_items(date, date, text, uuid) from public, anon, authenticated, service_role;\n'), items),
    verify('finance_money_rows_core (over 0017)', block(base17, '-- 3b (0011) with camp items.',
           'revoke execute on function public.finance_money_rows_core(text, date, date, text, uuid) from public, anon, authenticated, service_role;\n'), money),
    verify('finance_figures_from (over 0011)', block(base11, '-- 3c. finance_figures(p_location_code, p_from, p_to) - one row per school',
           'revoke execute on function public.finance_figures_from(jsonb, text, date, date) from public, anon, authenticated, service_role;\n'), figs),
    verify('finance_closing_changes_from (over 0011)', block(base11, '-- 3h. finance_closing_changes_from(closing, items) - "Changed after',
           'revoke execute on function public.finance_closing_changes_from(uuid, jsonb) from public, anon, authenticated, service_role;\n'), chg),
    verify('finance_payment_detail (over 0017)', block(base17, '-- 5d (0011) for camp payments too.',
           'grant  execute on function public.finance_payment_detail(text, uuid) to authenticated;\n'), det),
])
if not ok:
    raise SystemExit('build_0018: the self-check failed (see above); nothing written')

out = head + steps + '\n' + items + '\n' + money + '\n' + figs + '\n' + chg + '\n' + det + '\ncommit;\n'
open(out_path, 'w', encoding='utf-8', newline='').write(out.replace('\n', '\r\n'))
print('ok', len(out.splitlines()), 'lines')
