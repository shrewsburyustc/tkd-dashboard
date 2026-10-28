"""build_0026.py - builds supabase/migrations/0026_finance_black_belt.sql.

WHAT IT DOES
  Migration 0026 (Finance: Black Belt payments in the Daily report,
  CONTRACT-0026) replaces nine Finance functions. Instead of typing them
  out again by hand, this script copies the LIVE text of each one out of
  the migration that made it, and makes exact text replacements:
    0018 (0018_finance_private.sql) for finance_chain_steps_core,
         finance_money_rows_core, finance_figures_from,
         finance_closing_changes_from and finance_payment_detail
    0017 (0017_finance_camps.sql)   for finance_day and finance_export
    0011 (0011_finance.sql)         for finance_close_day and
                                    finance_day_both
  Every change sits inside a block marked
      -- ===== source: black belt (0026) =====
      -- ===== end black belt =====
  or on a line ending in a "-- 0026" comment, so the rest is the live
  text unchanged.

WHY A SCRIPT
  The same way 0018 was built (build_0018.py): a missing anchor stops the
  build (the base file changed), and a self-check proves that (1) every
  new or changed line is marked, (2) no base line simply disappears, and
  (3) every camp (0017) block and every Color Belt private (0018) block of
  the base text is still there byte for byte. It also works out the md5s
  the migration's guard compares with the live functions.

USAGE (from the repo root)
  python supabase/tools/build_0026.py supabase/migrations/0011_finance.sql \\
      supabase/migrations/0017_finance_camps.sql \\
      supabase/migrations/0018_finance_private.sql \\
      supabase/migrations/0026_finance_black_belt.sql \\
      supabase/tests/0026_preapply_check.sql
  The last file (the read-only pre-apply check) gets the same guard md5s,
  written between its "@@guard" marker lines.
"""
import difflib
import hashlib
import re
import sys

base11_path, base17_path, base18_path, out_path, preapply_path = sys.argv[1:6]


def load(path):
    # the migrations are stored with CRLF line ends; work with LF inside
    return open(path, encoding='utf-8', newline='').read().replace('\r\n', '\n')


base11 = load(base11_path)
base17 = load(base17_path)
base18 = load(base18_path)

B = '-- ===== source: black belt (0026) ====='
E = '-- ===== end black belt ====='


def block(base, start, end_line):
    # the text from `start` to the end of the line `end_line` (one function
    # with its comment above and its rights below)
    if base.count(start) != 1:
        raise SystemExit(f'build_0026: block start {start[:70]!r} found {base.count(start)} times - the base file changed')
    a = base.index(start)
    b = base.index(end_line, a) + len(end_line)
    return base[a:b]


def rep(text, old, new, count=1):
    # one exact replacement; the anchor must be there exactly `count` times
    n = text.count(old)
    if n != count:
        raise SystemExit(f'build_0026: expected {count} x {old[:90]!r}, found {n} - the base file changed; update this anchor')
    return text.replace(old, new)


def bb(indent, *lines):
    # a marked black belt block, each line indented
    pad = ' ' * indent
    return '\n'.join([pad + B] + [pad + x if x else '' for x in lines] + [pad + E]) + '\n'


def bb_extra(indent, row):
    # the extra keys of a Black Belt item (CONTRACT-0026 section 6), worked
    # out from the row shown (`row` = its id): the cycle name as recorded,
    # what it was for (a returned check: the check's items), the candidate's
    # plan name when that plan has one payment, and (a returned check) the
    # day the check was handed in
    pad = ' ' * indent
    return '\n'.join(pad + x for x in [
        "(select jsonb_build_object(",
        "          'event_name', bp.cycle_name,",
        "          'for_items', to_jsonb(coalesce(bk.for_items, bp.for_items)),",
        "          'one_payment_plan', (select pl.name from public.bb_candidates bc",
        "                                 join public.bb_cycle_plans pl on pl.id = bc.cycle_plan_id",
        "                                where bc.id = bp.candidate_id and pl.payments_count = 1),",
        "          'handed_in_on', bk.paid_on)",
        "   from public.bb_payments bp",
        "   left join public.bb_payments bk on bp.kind = 'returned' and bk.id = bp.reverses_payment_id",
        f"  where bp.id = {row})",
    ])


# ---------------------------------------------------------------------
# The live texts (each: comment + function + rights)
# ---------------------------------------------------------------------
REVOKE = 'revoke execute on function public.{} from public, anon, authenticated, service_role;\n'
GRANT = 'grant  execute on function public.{} to authenticated;\n'
SRC = {
    'finance_chain_steps_core': (base18, '-- 3a (0011) with a third source, camp.',
                                 REVOKE.format('finance_chain_steps_core(date, date, text, uuid)')),
    'finance_money_rows_core': (base18, '-- 3b (0011) with camp items.',
                                REVOKE.format('finance_money_rows_core(text, date, date, text, uuid)')),
    'finance_figures_from': (base18, '-- 3c. finance_figures(p_location_code, p_from, p_to) - one row per school',
                             REVOKE.format('finance_figures_from(jsonb, text, date, date)')),
    'finance_closing_changes_from': (base18, '-- 3h. finance_closing_changes_from(closing, items) - "Changed after',
                                     REVOKE.format('finance_closing_changes_from(uuid, jsonb)')),
    'finance_payment_detail': (base18, '-- 5d (0011) for camp payments too.',
                               GRANT.format('finance_payment_detail(text, uuid)')),
    'finance_day': (base17, '-- 5a (0011): camp lines carry event_name.', GRANT.format('finance_day(text, date)')),
    'finance_export': (base17, '-- 5i (0011): camp rows carry event_name.', GRANT.format('finance_export(text, date, date)')),
    'finance_close_day': (base11, '-- 5f. finance_close_day(p_location_code, p_day, p_expected_fingerprint,',
                          GRANT.format('finance_close_day(text, date, text, integer, integer, integer, integer, text)')),
    'finance_day_both': (base11, '-- 5b. finance_day_both(p_day)   S (staff: today only)', GRANT.format('finance_day_both(date)')),
}
BASE = {name: block(*args) for name, args in SRC.items()}
BASE_FROM = {'finance_chain_steps_core': '0018', 'finance_money_rows_core': '0018', 'finance_figures_from': '0018',
             'finance_closing_changes_from': '0018', 'finance_payment_detail': '0018', 'finance_day': '0017',
             'finance_export': '0017', 'finance_close_day': '0011', 'finance_day_both': '0011'}
NEW = {}

# ---------------------------------------------------------------------
# 3a. finance_chain_steps_core: a fourth source, black_belt
# ---------------------------------------------------------------------
t = BASE['finance_chain_steps_core']
t = rep(t, """drop function if exists public.finance_chain_steps_core(date, date, text, uuid);
create function""", bb(0,
    "-- 0026: Black Belt payments (0016, table bb_payments) are a fourth",
    "-- source, 'black_belt'; the owner is the candidate. The same chain rules",
    "-- as Color Belt and Star (an edit = a reversal + a new payment at the",
    "-- same moment by the same login; an undo = a reversal alone; the",
    "-- staff's own undo within 10 seconds = a hidden mis-click). One more",
    "-- kind: a 'returned' row (a check the bank returned, v0.809) starts its",
    "-- OWN chain - it is never read as a reversal of the check (only rows of",
    "-- kind 'reversal' are), so the check keeps its line on its own day. A",
    "-- reversal of the returned row (the Undo of the mark) makes that chain",
    "-- 'undone'. No new output column.",
) + """drop function if exists public.finance_chain_steps_core(date, date, text, uuid);
create function""")
t = rep(t, """            -- ===== end camp =====
            union all
            select 1, null::text,""", """            -- ===== end camp =====
""" + bb(12,
    "-- Black Belt payments (0016); the owner is the candidate",
    "union all",
    "select 0, 'black_belt'::text, p.candidate_id, p.id, p.kind, p.amount_cents,",
    "       p.method, p.paid_on, p.recorded_at, p.recorded_by, p.recorded_by_name, p.reverses_payment_id",
    "  from public.bb_payments p",
    " where p.candidate_id in",
    "       (select q.candidate_id from public.bb_payments q",
    "         where (p_owner is null and q.kind <> 'reversal' and q.paid_on between p_from and p_to)",
    "            or (p_source = 'black_belt' and q.candidate_id = p_owner))",
) + """            union all
            select 1, null::text,""")
t = rep(t, """        continue when a_kind[v_j] not in ('payment', 'refund') or a_isnew[v_j];""", bb(8,
    "-- a Black Belt 'returned' row (a bounced check) starts a chain of its",
    "-- own too: its only step is itself; it is 'undone' when the returned",
    "-- mark was undone (a reversal of it), else it counts on its own day",
) + """        continue when a_kind[v_j] not in ('payment', 'refund', 'returned') or a_isnew[v_j];   -- 0026: + 'returned'""")
NEW['finance_chain_steps_core'] = t

# ---------------------------------------------------------------------
# 3b. finance_money_rows_core: Black Belt items
# ---------------------------------------------------------------------
t = BASE['finance_money_rows_core']
t = rep(t, """-- ===== end color belt private =====
create or replace function public.finance_money_rows_core(""", """-- ===== end color belt private =====
""" + bb(0,
    "-- 0026: a Black Belt item takes the school and the cycle name of the ROW",
    "-- SHOWN, as they were recorded (bb_payments.location_code / cycle_name,",
    "-- v0.808: a later school change or cycle rename moves nothing), the",
    "-- candidate's names, no event date (a cycle has several testing days)",
    "-- and event_id = the cycle (Open in Testing).",
) + """create or replace function public.finance_money_rows_core(""")
t = rep(t, """           when i.source = 'camp' then cp.school
           -- ===== end camp =====
""", """           when i.source = 'camp' then cp.school
           -- ===== end camp =====
""" + bb(11, "when i.source = 'black_belt' then bp.location_code"))
t = rep(t, """                  , cc.first_name
                  -- ===== end camp =====
""", """                  , cc.first_name
                  -- ===== end camp =====
""" + bb(18, ", bc.first_name"))
t = rep(t, """                  , cc.last_name
                  -- ===== end camp =====
""", """                  , cc.last_name
                  -- ===== end camp =====
""" + bb(18, ", bc.last_name"))
t = rep(t, """              when i.source = 'camp' then public.camp_first_day(ck.id)
              -- ===== end camp =====
""", """              when i.source = 'camp' then public.camp_first_day(ck.id)
              -- ===== end camp =====
""" + bb(14, "when i.source = 'black_belt' then null::date"))
t = rep(t, """                  , ck.name
                  -- ===== end camp =====
""", """                  , ck.name
                  -- ===== end camp =====
""" + bb(18, ", bp.cycle_name"))
t = rep(t, """                  , ck.id
                  -- ===== end camp =====
""", """                  , ck.id
                  -- ===== end camp =====
""" + bb(18, ", bp.cycle_id"))
t = rep(t, """    left join public.camps ck on ck.id = cc.camp_id
    -- ===== end camp =====
""", """    left join public.camps ck on ck.id = cc.camp_id
    -- ===== end camp =====
""" + bb(4,
    "-- the Black Belt row shown (its school and cycle as recorded) and the",
    "-- candidate (names only)",
    "left join public.bb_payments bp on i.source = 'black_belt' and bp.id = i.row_id",
    "left join public.bb_candidates bc on i.source = 'black_belt' and bc.id = i.owner_id",
))
t = rep(t, """          or ck.id is not null
          -- ===== end camp =====
""", """          or ck.id is not null
          -- ===== end camp =====
""" + bb(10, "or bc.id is not null"))
t = rep(t, """                when i.source = 'camp' then cp.school
                -- ===== end camp =====
""", """                when i.source = 'camp' then cp.school
                -- ===== end camp =====
""" + bb(16, "when i.source = 'black_belt' then bp.location_code"))
NEW['finance_money_rows_core'] = t

# ---------------------------------------------------------------------
# 3c. finance_figures_from: returned checks are in the Total only
# ---------------------------------------------------------------------
t = BASE['finance_figures_from']
t = rep(t, """-- figures and the items can never come from two different moments.
create or replace function public.finance_figures_from(""", """-- figures and the items can never come from two different moments.
""" + bb(0,
    "-- 0026: a Black Belt RETURNED check (kind 'returned', negative, v0.809)",
    "-- counts in total_cents only (the day's Total is after it). It is NOT in",
    "-- item_count - so a day whose only items are returned checks has nothing",
    "-- to close, isn't \"Not closed\" in History and isn't in the Home reminder",
    "-- - nor in the fingerprint (Close the day is not affected), nor in",
    "-- pay_count / in_cents / the cash, check and card figures / refunds",
    "-- (those already take kind 'payment' or 'refund' only). The card part",
    "-- of the refunds is refund_cents - refund_cash_cents -",
    "-- refund_check_cents; Close the day's expected card total adds it to",
    "-- card_cents (v0.814) - worked out by the callers, so the output",
    "-- columns stay as they are.",
) + """create or replace function public.finance_figures_from(""")
t = rep(t, """           count(*) filter (where i.counts)::integer as item_count,""",
        """           count(*) filter (where i.counts and i.kind <> 'returned')::integer as item_count,   -- 0026: no returned check""")
t = rep(t, """                                   order by (i.payment_id::text || '|' || i.amount_cents::text || '|' || i.method || '|' || i.state) collate "C"),   -- 0018""",
        """                                   order by (i.payment_id::text || '|' || i.amount_cents::text || '|' || i.method || '|' || i.state) collate "C")   -- 0018 / 0026: + the filter
                               filter (where i.kind <> 'returned'),   -- 0026: no returned check""")
NEW['finance_figures_from'] = t

# ---------------------------------------------------------------------
# 3h. finance_closing_changes_from: returned checks never change a close
# ---------------------------------------------------------------------
t = BASE['finance_closing_changes_from']
t = rep(t, """--                    close's expected_* snapshot
create or replace function public.finance_closing_changes_from(""", """--                    close's expected_* snapshot
""" + bb(0,
    "-- 0026: Black Belt returned checks are left out of the items first",
    "-- (v0.809: Close the day is not affected), so a returned mark - or its",
    "-- undo - after a close never shows as a change; the expected card total",
    "-- is card money in + card refunds (v0.814), as finance_close_day stores it.",
) + """create or replace function public.finance_closing_changes_from(""")
t = rep(t, """  if not found then
    return;
  end if;

  -- ===== source: color belt private (0018) =====""", """  if not found then
    return;
  end if;

""" + bb(2,
    "-- only this school's day, without returned checks (all the rest of",
    "-- this function looks at; History passes a whole month)",
    "p_items := (select coalesce(jsonb_agg(x.e), '[]'::jsonb)",
    "              from jsonb_array_elements(coalesce(p_items, '[]'::jsonb)) as x(e)",
    "             where x.e ->> 'school' = v_c.location_code and (x.e ->> 'day')::date = v_c.day",
    "               and x.e ->> 'kind' is distinct from 'returned');",
) + """
  -- ===== source: color belt private (0018) =====""")
t = rep(t, """                   or v_f.card_cents     is distinct from v_c.expected_card_cents;""",
        """                   or (v_f.card_cents + v_f.refund_cents - v_f.refund_cash_cents - v_f.refund_check_cents)   -- 0026: + card refunds
                        is distinct from v_c.expected_card_cents;   -- 0026""")
NEW['finance_closing_changes_from'] = t

# ---------------------------------------------------------------------
# 5d. finance_payment_detail: source black_belt
# ---------------------------------------------------------------------
t = BASE['finance_payment_detail']
t = rep(t, """-- ===== end color belt private =====
create or replace function public.finance_payment_detail(""", """-- ===== end color belt private =====
""" + bb(0,
    "-- 0026: p_source may be 'black_belt' (owner = the candidate). Its item",
    "-- also carries event_name (the cycle), for_items, one_payment_plan and",
    "-- handed_in_on; the answer's event_name / event_id are the cycle's. A",
    "-- returned check's history: \"<name> marked it returned by the bank\"",
    "-- ('returned'), \"<name> undid the returned mark\" ('returned_undone')",
    "-- and the check's own 'recorded' line. A returned check is never",
    "-- \"added after closing\" (it isn't part of a close, v0.809).",
) + """create or replace function public.finance_payment_detail(""")
t = rep(t, """                         , 'camp'
                         -- ===== end camp =====
""", """                         , 'camp'
                         -- ===== end camp =====
""" + bb(25, ", 'black_belt'"))
t = rep(t, """      from public.camp_payments p where p.camper_id = v_owner and p.kind <> 'reversal';
  -- ===== end camp =====
""", """      from public.camp_payments p where p.camper_id = v_owner and p.kind <> 'reversal';
  -- ===== end camp =====
""" + bb(2,
    "elsif p_source = 'black_belt' then",
    "  -- a Black Belt payment's owner is the candidate",
    "  select p.candidate_id into v_owner from public.bb_payments p where p.id = p_payment_id;",
    "  select min(p.paid_on), max(p.paid_on) into v_from, v_to",
    "    from public.bb_payments p where p.candidate_id = v_owner and p.kind <> 'reversal';",
))
t = rep(t, """      'added_after_closing', (v_c.id is not null and v_item.counts and v_item.first_recorded_at > v_c.recorded_at))""",
        """      'added_after_closing', (v_c.id is not null and v_item.counts and v_item.kind <> 'returned'   -- 0026: not a returned check
                              and v_item.first_recorded_at > v_c.recorded_at))   -- 0026""")
t = rep(t, """      || case when p_source = 'camp' then jsonb_build_object('event_name', v_item.event_name) else '{}'::jsonb end
      -- ===== end camp =====
""", """      || case when p_source = 'camp' then jsonb_build_object('event_name', v_item.event_name) else '{}'::jsonb end
      -- ===== end camp =====
""" + B.join(['      ', '\n']) + """      -- a Black Belt item also carries its cycle, what it was for, the
      -- one-payment plan's name and (a returned check) the day the check
      -- was handed in
      || case when p_source = 'black_belt' then
""" + bb_extra(10, 'v_item.row_id') + """
         else '{}'::jsonb end
      """ + E + '\n')
t = rep(t, """           where c.source = p_source and c.chain_id = p_payment_id
          union all
          select c.undo_at, 1000,""", """           where c.source = p_source and c.chain_id = p_payment_id
             and c.kind <> 'returned'   -- 0026: a returned check's lines are below
          union all
          select c.undo_at, 1000,""")
t = rep(t, """             and c.step = c.last_step and c.end_state = 'undone') as h;""",
        """             and c.step = c.last_step and c.end_state = 'undone'   -- 0026: (the bracket moved down)
             and c.kind <> 'returned'   -- 0026: a returned check's undo is 'returned_undone' (below)
""" + bb(10,
    "-- a returned check (Black Belt, v0.809): \"<name> marked it returned by",
    "-- the bank\" ('returned'), \"<name> undid the returned mark\"",
    "-- ('returned_undone'), and the check's own \"recorded\" line (who took",
    "-- the check, when, for how much - B4)",
    "union all",
    "select c.recorded_at, c.step,",
    "       jsonb_build_object('at', c.recorded_at, 'by_name', c.recorded_by_name, 'what', 'returned',",
    "                          'amount_cents', c.amount_cents, 'method', c.method, 'paid_on', c.paid_on)",
    "  from public.finance_chain_steps_core(null, null, p_source, v_owner) c",
    " where c.source = p_source and c.chain_id = p_payment_id and c.kind = 'returned'",
    "union all",
    "select c.undo_at, 1000,",
    "       jsonb_build_object('at', c.undo_at, 'by_name', c.undo_by_name, 'what', 'returned_undone',",
    "                          'amount_cents', -c.undo_amount_cents, 'method', c.undo_method, 'paid_on', c.undo_on)",
    "  from public.finance_chain_steps_core(null, null, p_source, v_owner) c",
    " where c.source = p_source and c.chain_id = p_payment_id and c.kind = 'returned'",
    "   and c.step = c.last_step and c.end_state = 'undone'",
    "union all",
    "select k.recorded_at, -1,",
    "       jsonb_build_object('at', k.recorded_at, 'by_name', k.recorded_by_name, 'what', 'recorded',",
    "                          'amount_cents', k.amount_cents, 'method', k.method, 'paid_on', k.paid_on)",
    "  from public.bb_payments r",
    "  join public.bb_payments k on k.id = r.reverses_payment_id",
    " where p_source = 'black_belt' and r.id = p_payment_id and r.kind = 'returned'",
) + """          ) as h;   -- 0026""")
NEW['finance_payment_detail'] = t

# ---------------------------------------------------------------------
# 5a. finance_day: Black Belt item keys, card refunds, returned checks
# ---------------------------------------------------------------------
t = BASE['finance_day']
t = rep(t, """-- 5a (0011): camp lines carry event_name.
create or replace function""", """-- 5a (0011): camp lines carry event_name.
""" + bb(0,
    "-- 0026: a Black Belt line also carries event_name (the cycle),",
    "-- for_items, one_payment_plan and handed_in_on (CONTRACT-0026 section 6;",
    "-- every other line keeps exactly its keys); refunds gains card_cents",
    "-- (the card part, <= 0); a new top-level returned: {count, cents} = the",
    "-- day's returned checks that count (cents <= 0; they are in the Total,",
    "-- not in the cash / check / card cards). A returned check is never",
    "-- \"added after closing\" (it isn't part of a close, v0.809).",
) + """create or replace function""")
t = rep(t, """  v_undo_until timestamptz := null;
begin""", """  v_undo_until timestamptz := null;
""" + bb(2, "v_returned   jsonb;") + """begin""")
t = rep(t, """           'added_after_closing', (v_c.id is not null and m.counts and m.first_recorded_at > v_c.recorded_at))""",
        """           'added_after_closing', (v_c.id is not null and m.counts and m.kind <> 'returned'   -- 0026: not a returned check
                                   and m.first_recorded_at > v_c.recorded_at))   -- 0026""")
t = rep(t, """           || case when m.source = 'camp' then jsonb_build_object('event_name', m.event_name) else '{}'::jsonb end
           -- ===== end camp =====
""", """           || case when m.source = 'camp' then jsonb_build_object('event_name', m.event_name) else '{}'::jsonb end
           -- ===== end camp =====
           """ + B + """
           -- a Black Belt line: its cycle, what it was for, the one-payment
           -- plan's name and (a returned check) the day it was handed in
           || case when m.source = 'black_belt' then
""" + bb_extra(15, 'm.row_id') + """
              else '{}'::jsonb end
           """ + E + '\n')
t = rep(t, """              event_name text
              -- ===== end camp =====
              );""", """              event_name text
              -- ===== end camp =====
""" + bb(14, ", row_id uuid") + """              );""")
t = rep(t, """  if v_c.id is not null then
    select * into v_changes from public.finance_closing_changes_from(v_c.id, v_all);""", bb(2,
    "-- the day's returned checks that count (Black Belt, v0.809)",
    "select jsonb_build_object('count', count(*)::integer, 'cents', coalesce(sum(x.amount_cents), 0)::integer)",
    "  into v_returned",
    "  from jsonb_to_recordset(v_all) as x(kind text, counts boolean, amount_cents integer)",
    " where x.kind = 'returned' and x.counts;",
) + """
  if v_c.id is not null then
    select * into v_changes from public.finance_closing_changes_from(v_c.id, v_all);""")
t = rep(t, """                                  'cash_cents', v_f.refund_cash_cents, 'check_cents', v_f.refund_check_cents),""",
        """                                  'cash_cents', v_f.refund_cash_cents, 'check_cents', v_f.refund_check_cents,   -- 0026: + card_cents
                                  'card_cents', v_f.refund_cents - v_f.refund_cash_cents - v_f.refund_check_cents),   -- 0026
    'returned', v_returned,   -- 0026: the returned checks (Black Belt)""")
NEW['finance_day'] = t

# ---------------------------------------------------------------------
# 5i. finance_export: Black Belt row keys
# ---------------------------------------------------------------------
t = BASE['finance_export']
t = rep(t, """-- 5i (0011): camp rows carry event_name.
create or replace function""", """-- 5i (0011): camp rows carry event_name.
""" + bb(0,
    "-- 0026: a Black Belt row also carries event_name (the cycle), for_items,",
    "-- one_payment_plan and handed_in_on (a returned check: kind 'returned',",
    "-- negative, counted on the day it was returned). Every other row keeps",
    "-- exactly its keys.",
) + """create or replace function""")
t = rep(t, """             || case when m.source = 'camp' then jsonb_build_object('event_name', m.event_name) else '{}'::jsonb end
             -- ===== end camp =====
""", """             || case when m.source = 'camp' then jsonb_build_object('event_name', m.event_name) else '{}'::jsonb end
             -- ===== end camp =====
             """ + B + """
             -- a Black Belt row: its cycle, what it was for, the one-payment
             -- plan's name and (a returned check) the day it was handed in
             || case when m.source = 'black_belt' then
""" + bb_extra(17, 'm.row_id') + """
                else '{}'::jsonb end
             """ + E + '\n')
NEW['finance_export'] = t

# ---------------------------------------------------------------------
# 5f. finance_close_day: expected card after card refunds; no returned
#     check in the snapshot
# ---------------------------------------------------------------------
t = BASE['finance_close_day']
t = rep(t, """-- Ok: {status, closing_id, results}
create or replace function public.finance_close_day(""", """-- Ok: {status, closing_id, results}
""" + bb(0,
    "-- 0026: the expected card total = card money in + card refunds (v0.814;",
    "-- only Black Belt refunds to a card) - stored as expected_card_cents and",
    "-- compared with p_card_cents. Like cash, p_card_cents may be below 0",
    "-- (down to -$100,000) only when the expected card total is. Black Belt",
    "-- returned checks are never part of a close (v0.809): not in the",
    "-- figures (3c) and not in the snapshot.",
) + """create or replace function public.finance_close_day(""")
t = rep(t, """  v_id      uuid;
begin""", """  v_id      uuid;
""" + bb(2, "v_exp_card integer;   -- the expected card total (after card refunds)") + """begin""")
t = rep(t, """       or p_card_cents is null or p_card_cents not between 0 and 10000000""",
        """       or p_card_cents is null or p_card_cents not between -10000000 and 10000000   -- 0026: below 0 only when expected (below)""")
t = rep(t, """    if p_cash_cents < 0 and v_f.exp_cash_cents >= 0 then
      return jsonb_build_object('status', 'invalid');
    end if;
""", """    if p_cash_cents < 0 and v_f.exp_cash_cents >= 0 then
      return jsonb_build_object('status', 'invalid');
    end if;
""" + bb(4,
    "v_exp_card := v_f.card_cents + (v_f.refund_cents - v_f.refund_cash_cents - v_f.refund_check_cents);",
    "if p_card_cents < 0 and v_exp_card >= 0 then",
    "  return jsonb_build_object('status', 'invalid');",
    "end if;",
))
t = rep(t, """                                        v_f.check_cents, p_checks_cents, v_f.card_cents, p_card_cents);""",
        """                                        v_f.check_cents, p_checks_cents, v_exp_card, p_card_cents);   -- 0026: v_exp_card""")
t = rep(t, """       v_f.item_count, v_f.exp_cash_cents, v_f.check_count, v_f.check_cents, v_f.card_cents,""",
        """       v_f.item_count, v_f.exp_cash_cents, v_f.check_count, v_f.check_cents, v_exp_card,   -- 0026: v_exp_card""")
t = rep(t, """     where x.counts;""", """     where x.counts and x.kind <> 'returned';   -- 0026: never a returned check""")
NEW['finance_close_day'] = t

# ---------------------------------------------------------------------
# 5b. finance_day_both: returned checks per school and together
# ---------------------------------------------------------------------
t = BASE['finance_day_both']
t = rep(t, """--      check_cents, card_cents, closed}], total_cents, count}
create or replace function public.finance_day_both(""", """--      check_cents, card_cents, closed}], total_cents, count}
""" + bb(0,
    "-- 0026: each school's box and the answer itself also carry returned:",
    "-- {count, cents} - the returned checks that count (Black Belt, v0.809;",
    "-- cents <= 0, already inside total_cents). The day's items are built",
    "-- once for that (finance_figures_from over them = finance_figures).",
) + """create or replace function public.finance_day_both(""")
t = rep(t, """  v_count   integer;
begin""", """  v_count   integer;
""" + bb(2, "v_all     jsonb;") + """begin""")
t = rep(t, """  select coalesce(jsonb_agg(jsonb_build_object(
           'code', f.school,""", bb(2,
    "-- the day's items built ONCE (both schools): the figures and the",
    "-- returned checks below come from this one copy",
    "v_all := public.finance_items_json(null, p_day, p_day);",
) + """
  select coalesce(jsonb_agg(jsonb_build_object(
           'code', f.school,""")
t = rep(t, """           'closed', (public.finance_active_close(f.school, f.day)).id is not null)
""", """           'closed', (public.finance_active_close(f.school, f.day)).id is not null)
""" + bb(11,
    "-- the school's returned checks that count",
    "|| jsonb_build_object('returned',",
    "     (select jsonb_build_object('count', count(*)::integer, 'cents', coalesce(sum(x.amount_cents), 0)::integer)",
    "        from jsonb_to_recordset(v_all) as x(school text, kind text, counts boolean, amount_cents integer)",
    "       where x.school = f.school and x.kind = 'returned' and x.counts))",
))
t = rep(t, """    from public.finance_figures(null, p_day, p_day) f""",
        """    from public.finance_figures_from(v_all, null, p_day, p_day) f   -- 0026: from the one copy (= finance_figures)""")
t = rep(t, """                            'total_cents', v_total, 'count', v_count);""",
        """                            'total_cents', v_total, 'count', v_count)   -- 0026: + returned (below)
""" + bb(9,
    "-- both schools' returned checks together",
    "|| jsonb_build_object('returned',",
    "     (select jsonb_build_object('count', count(*)::integer, 'cents', coalesce(sum(x.amount_cents), 0)::integer)",
    "        from jsonb_to_recordset(v_all) as x(kind text, counts boolean, amount_cents integer)",
    "       where x.kind = 'returned' and x.counts))",
) + """         ;   -- 0026""")
NEW['finance_day_both'] = t


# ---------------------------------------------------------------------
# Self-check: every line that differs from the base text must be inside a
# marked 0026 block or carry "0026" (a comment) - so the unmarked text IS
# the base text - no base line may simply disappear, and every camp block
# and every Color Belt private block of the base must be in the output
# byte for byte.
# ---------------------------------------------------------------------
KEEP = [('camp', '-- ===== source: camp (0017) =====', '-- ===== end camp ====='),
        ('private', '-- ===== source: color belt private (0018) =====', '-- ===== end color belt private =====')]


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
    bad, replaced, changed = [], [], 0
    for tag, i1, i2, j1, j2 in difflib.SequenceMatcher(None, a, b, autojunk=False).get_opcodes():
        if tag == 'equal':
            continue
        replaced += a[i1:i2]
        if j1 == j2:
            bad.append('base lines removed: ' + ' | '.join(x.strip() for x in a[i1:i2])[:200])
            continue
        for j in range(j1, j2):
            changed += 1
            if not (inside[j] or '0026' in b[j] or b[j].strip() == ''):
                bad.append('unmarked new line: ' + b[j].strip()[:160])
    kept = {}
    for label, kb, ke in KEEP:
        kept[label] = 0
        pos = 0
        while True:
            i = old.find(kb, pos)
            if i < 0:
                break
            k = old.index(ke, i) + len(ke)
            if old[i:k] not in new:
                bad.append(f'{label} block changed: ' + old[i:k][:120])
            kept[label] += 1
            pos = k
    print(f'  check {name} (over {BASE_FROM[name]}): ' + (
        f'{changed} new / changed lines, all marked; {kept["camp"]} camp + {kept["private"]} private blocks kept; '
        f'{len(replaced)} base lines replaced (by marked lines):' if not bad else 'PROBLEMS'))
    for x in replaced:
        print('      - ' + x.rstrip())
    for x in bad:
        print('    ' + x)
    return not bad


# the md5 of a function body, as the fingerprints files and the guard work
# it out: comments (-- to the end of the line) and all white space removed
def body_md5(text, name):
    i = text.index('function public.' + name + '(')
    i = text.index('as $$', i) + len('as $$')
    j = text.index('$$;', i)
    body = re.sub(r'--[^\n]*', '', text[i:j])
    body = re.sub(r'\s+', '', body)
    return hashlib.md5(body.encode('utf-8')).hexdigest()


ok = all([verify(n, BASE[n], NEW[n]) for n in SRC])
if not ok:
    raise SystemExit('build_0026: the self-check failed (see above); nothing written')

GUARD = {n: (body_md5(BASE[n], n), body_md5(NEW[n], n)) for n in SRC}
for n, (a, b) in GUARD.items():
    print(f'  guard {n}: live ({BASE_FROM[n]}) {a} / 0026 {b}')
guard_values = ',\n'.join(f"           ('{n}', '{a}', '{b}')" for n, (a, b) in GUARD.items())

# The two table rules 0026 rebuilds, as pg_get_constraintdef shows them:
# the LIVE text (finance_day_closing_items_source_check as camps' 0017 /
# 0022 left it, finance_day_closings_counts_check as 0011 wrote it) and
# 0026's own. The guard compares the md5 of the text without white space,
# so 0026 can never silently undo another file's change to them either.
RULES = {
    'finance_day_closing_items_source_check': (
        'finance_day_closing_items',
        "CHECK ((source = ANY (ARRAY['color_belt'::text, 'star'::text, 'camp'::text])))",
        "CHECK ((source = ANY (ARRAY['color_belt'::text, 'star'::text, 'camp'::text, 'black_belt'::text])))"),
    'finance_day_closings_counts_check': (
        'finance_day_closings',
        "CHECK ((((cash_counted_cents IS NULL) OR ((cash_counted_cents >= '-10000000'::integer) AND (cash_counted_cents <= 10000000))) "
        "AND ((cash_counted_cents IS NULL) OR (cash_counted_cents >= 0) OR (expected_cash_cents < 0)) "
        "AND ((checks_counted IS NULL) OR ((checks_counted >= 0) AND (checks_counted <= 500))) "
        "AND ((checks_counted_cents IS NULL) OR ((checks_counted_cents >= 0) AND (checks_counted_cents <= 10000000))) "
        "AND ((card_counted_cents IS NULL) OR ((card_counted_cents >= 0) AND (card_counted_cents <= 10000000))) "
        "AND ((expected_count IS NULL) OR (expected_count >= 0)) AND ((expected_checks IS NULL) OR (expected_checks >= 0)) "
        "AND ((expected_checks_cents IS NULL) OR (expected_checks_cents >= 0)) AND ((expected_card_cents IS NULL) OR (expected_card_cents >= 0))))",
        "CHECK ((((cash_counted_cents IS NULL) OR ((cash_counted_cents >= '-10000000'::integer) AND (cash_counted_cents <= 10000000))) "
        "AND ((cash_counted_cents IS NULL) OR (cash_counted_cents >= 0) OR (expected_cash_cents < 0)) "
        "AND ((checks_counted IS NULL) OR ((checks_counted >= 0) AND (checks_counted <= 500))) "
        "AND ((checks_counted_cents IS NULL) OR ((checks_counted_cents >= 0) AND (checks_counted_cents <= 10000000))) "
        "AND ((card_counted_cents IS NULL) OR ((card_counted_cents >= '-10000000'::integer) AND (card_counted_cents <= 10000000))) "
        "AND ((card_counted_cents IS NULL) OR (card_counted_cents >= 0) OR (expected_card_cents < 0)) "
        "AND ((expected_count IS NULL) OR (expected_count >= 0)) AND ((expected_checks IS NULL) OR (expected_checks >= 0)) "
        "AND ((expected_checks_cents IS NULL) OR (expected_checks_cents >= 0))))"),
}


def rule_md5(text):
    return hashlib.md5(re.sub(r'\s+', '', text).encode('utf-8')).hexdigest()


RULE_MD5 = {n: (t, rule_md5(a), rule_md5(b)) for n, (t, a, b) in RULES.items()}
for n, (t, a, b) in RULE_MD5.items():
    print(f'  guard rule {n}: live {a} / 0026 {b}')
rule_values = ',\n'.join(f"           ('{t}', '{n}', '{a}', '{b}')" for n, (t, a, b) in RULE_MD5.items())

head = r"""-- =====================================================================
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
@@GUARD_VALUES@@
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
@@RULE_VALUES@@
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

""".replace('@@GUARD_VALUES@@', guard_values).replace('@@RULE_VALUES@@', rule_values)

out = head + '\n'.join(NEW[n] for n in SRC) + '\ncommit;\n\n-- End of 0026_finance_black_belt.sql\n'
open(out_path, 'w', encoding='utf-8', newline='').write(out.replace('\n', '\r\n'))
print('ok', out_path, len(out.splitlines()), 'lines')

# the read-only pre-apply check gets the same md5s between its two marker lines
pre = open(preapply_path, encoding='utf-8', newline='').read()
nl = '\r\n' if '\r\n' in pre else '\n'
pre = pre.replace('\r\n', '\n')
start, end = '-- @@guard values (written by build_0026.py)\n', '-- @@guard end\n'
if pre.count(start) != 1 or pre.count(end) != 1:
    raise SystemExit('build_0026: the pre-apply file has no "@@guard" marker lines')
a = pre.index(start) + len(start)
b = pre.index(end)
values = ',\n'.join(f"    ('{n}', '{BASE_FROM[n]}', '{a_}', '{b_}')" for n, (a_, b_) in GUARD.items()) + '\n'
pre = pre[:a] + values + pre[b:]
start, end = '-- @@rule values (written by build_0026.py)\n', '-- @@rule end\n'
if pre.count(start) != 1 or pre.count(end) != 1:
    raise SystemExit('build_0026: the pre-apply file has no "@@rule" marker lines')
a = pre.index(start) + len(start)
b = pre.index(end)
values = ',\n'.join(f"    ('{t}', '{n}', '{a_}', '{b_}')" for n, (t, a_, b_) in RULE_MD5.items()) + '\n'
pre = pre[:a] + values + pre[b:]
open(preapply_path, 'w', encoding='utf-8', newline='').write(pre.replace('\n', nl))
print('ok', preapply_path)
