-- =====================================================================
-- 0037_finance_export_private.sql
-- ---------------------------------------------------------------------
-- WHAT THIS FILE IS
--   A one-function migration for Finance (design review, rolling check
--   pass 1, Fix-Finance.md "Smaller": Export keeps "private"). It runs
--   AFTER 0026 (Finance: Black Belt payments, live) and REPLACES exactly
--   ONE function: public.finance_export(text, date, date) - the admin's
--   Export... download (one row per payment line in a date range).
--   Nothing else changes: no table, no table rule, no other function, no
--   right, no data.
--
-- WHY IT EXISTS
--   The Daily report says "Star testing, private" / "Color belt testing,
--   private" for a private testing's payment (finance_day sends
--   is_private, 0018). The CSV export didn't get that field, so the same
--   payment showed as plain "Star testing" / "Color belt testing" in the
--   spreadsheet. Now each export row carries is_private too, and the app
--   (src/lib/finance/csv.js) writes ", private" after the section, as the
--   report does.
--
-- WHAT IT CHANGES
--   Every row of finance_export's answer gains ONE key, is_private
--   (true / false), taken from the same place finance_day takes it
--   (public.finance_money_rows -> finance_money_rows_core, 0026): true for
--   a Star private testing or a Color Belt private testing, false for
--   everything else (event testings, camps, Black Belt). It is not
--   private data - it only says which kind of testing the money was for.
--   The ONLY difference from 0026's text is that one key. Same name, same
--   arguments, same checks (has_data_access() first, then admins only),
--   same date rules, same log row in finance_exports, same security
--   definer with search_path = '', same owner, same revoke + grant lines
--   (authenticated only; nothing for anon).
--
-- WHO ELSE IT TOUCHES
--   Nobody. No other function calls finance_export. Star's 0038 and Color
--   Belt's 0044 touch only star_* / testing_* functions; Finance's later
--   R1-01 migration replaces finance_money_rows_core (not this function).
--   finance_export_preview (the count shown before the download) is not
--   changed: it returns a count, not rows.
--
-- WHAT TO KNOW BEFORE APPLYING
--   * The live app ignores keys it doesn't know, so pasting this before
--     the app update changes nothing on screen; the new CSV words appear
--     once the Finance app with the csv.js change is pushed.
--   * If 0026 is ever re-run after this file, it puts the old function
--     back (re-running 0026 is refused anyway - see SETUP, Migration 0026).
--
-- HOW TO RUN IT
--   Only AFTER 0026 is live (it is). Supabase dashboard -> SQL Editor ->
--   New query -> paste this WHOLE file -> Run. It starts with "begin;"
--   and ends with "commit;", so it is one transaction: if anything fails,
--   nothing is kept. This file removes nothing.
--   Safe to run again: the guard accepts 0026's version OR this file's
--   version, "create or replace" puts the same text back and the revoke /
--   grant repeat (tested in PGlite, run.mjs step0037: a second run changes
--   no fingerprint).
--   Forward-only: there is no undo file. None is needed for safety: the
--   app works with or without the new key, so if it ever had to go, a
--   later migration could put 0026's text back.
-- =====================================================================

begin;


-- ---------------------------------------------------------------------
-- 1. The guard: stops here - and changes nothing - unless
--    * 0026 is applied (finance_export exists and Black Belt's payments
--      table is there), and
--    * finance_export is EXACTLY 0026's version (or what this file made,
--      on a re-run). They are compared by the md5 of the function's code
--      without comments and white space, the same way the fingerprints
--      files do. If someone changed it since, pasting this file would
--      silently undo that change - so this file must be rebuilt first.
--      21eedfa15256ea81d56dd2dc8e7a5706 = 0026's text
--      f812a5b147fda8d8603afe907abd2137 = this file's text (with is_private)
-- ---------------------------------------------------------------------
do $$
declare
  v_md5 text;
begin
  if to_regclass('public.bb_payments') is null
     or to_regprocedure('public.finance_export(text, date, date)') is null then
    raise exception '0037 needs migration 0026 (Finance: Black Belt payments) first';
  end if;
  select md5(regexp_replace(regexp_replace(p.prosrc, '--[^\n]*', '', 'g'), '\s+', '', 'g'))
    into v_md5
    from pg_proc p
   where p.oid = to_regprocedure('public.finance_export(text, date, date)');
  if v_md5 not in ('21eedfa15256ea81d56dd2dc8e7a5706', 'f812a5b147fda8d8603afe907abd2137') then
    raise exception '0037 was built over 0026''s finance_export, but the live one is different (md5 %) - rebuild 0037 first', v_md5;
  end if;
end;
$$;


-- ---------------------------------------------------------------------
-- 2. The replaced function (0026's 5i; only 'is_private' is new)
-- ---------------------------------------------------------------------

-- 5i. finance_export(p_location_code, p_from, p_to)   A (admins only)
-- One school, at most 366 days, up to today. One row per payment line,
-- as finance_day shows them; every row now also carries is_private
-- (0037), like finance_day's items. Writes one finance_exports row per
-- call (same transaction).
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
             'event_date', m.event_date, 'is_private', m.is_private,
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

-- End of 0037_finance_export_private.sql
