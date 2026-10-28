-- =====================================================================
-- 0026_preapply_check.sql  (read-only - changes nothing)
-- ---------------------------------------------------------------------
-- WHAT THIS FILE IS
--   One query to run on production BEFORE pasting 0026 (Finance: Black
--   Belt payments in the Daily report). Three kinds of rows (kind, item,
--   detail):
--     function    - each of the nine Finance functions 0026 replaces: is
--                   it EXACTLY the live version 0026 was built over (the
--                   same md5s as the guard at the top of 0026, written
--                   here by supabase/tools/build_0026.py)? Every line must
--                   say "ok". A "DIFFERS" line means another migration
--                   changed that function since: 0026 would refuse to run
--                   (its guard) - it must be rebuilt first.
--     rule        - each of the two table rules 0026 rebuilds
--                   (finance_day_closing_items_source_check,
--                   finance_day_closings_counts_check): is it exactly the
--                   live text 0026 expects (same md5s as the guard)? Every
--                   line must say "ok", as for the functions.
--     closed day  - each school day that is CLOSED right now and has Black
--                   Belt money on it: how many Black Belt payment / refund
--                   lines still count there (none was counted when the day
--                   was closed, so after 0026 that day shows "Changed after
--                   closing" - expected, nothing is wrong), and how many
--                   returned checks (those never change a close, v0.809).
--                   No row = no closed day changes.
--
-- WHY
--   So nobody is surprised: the guard would stop a wrong 0026 anyway, but
--   this says so before pasting; and an admin can look at each listed day
--   and reopen / close it again if wanted.
--
-- CONNECTOR-SAFE: a single read-only SELECT, without the words the
-- Supabase connection refuses (run.mjs checks that). Run it through the
-- connection or in the SQL Editor. Rows sorted byte by byte (collate "C"),
-- so the order is the same everywhere.
-- =====================================================================

with guard(name, base, md5_live, md5_0026) as (
  values
-- @@guard values (written by build_0026.py)
    ('finance_chain_steps_core', '0018', '2a894072df0b320c1c659343bdb5ef3d', '6d03a519cc5ada725a961b1c672dbe82'),
    ('finance_money_rows_core', '0018', '084099705b5a1f6924ed69c854b7f3c2', '77bc764dfe331a09919ac7c72962b76c'),
    ('finance_figures_from', '0018', '3d07606981394575fec9d20a847aabe0', 'e540ff80c57b6d4866f9244d79eb36a5'),
    ('finance_closing_changes_from', '0018', '323613f239c3dcc59e99ba5991a63f6a', '506106b3b34919e6db74b6080c84fe4f'),
    ('finance_payment_detail', '0018', '31cc825ef94b5155b927aefba4a256e2', '31e25e5951b33aeac8ee4900271f885a'),
    ('finance_day', '0017', 'a4b3c40de667792cab0dc1c1d2f4f5c8', '3f6831f61735e1447c5974cc1dcba2ff'),
    ('finance_export', '0017', 'f10ef5c00455ba33472756f7ef40da34', '21eedfa15256ea81d56dd2dc8e7a5706'),
    ('finance_close_day', '0011', 'fe91ba761a02152f930c75e1fe013e74', '8035a10000062885fdb188ef8ef944cd'),
    ('finance_day_both', '0011', 'b13b986ac02be8e29283f18b386ecb9f', 'f3d68e8a3e32da62945747f7fc3c7692')
-- @@guard end
),
rules(tbl, name, md5_live, md5_0026) as (
  values
-- @@rule values (written by build_0026.py)
    ('finance_day_closing_items', 'finance_day_closing_items_source_check', '93eb4d98d376147b77292e93998b284d', '90f7e1c6ff131e9c45f4b8fca93d533a'),
    ('finance_day_closings', 'finance_day_closings_counts_check', '2fe1d8181a18a1d41caf1faf74ca3a72', 'ea99be87bf080aeb8f47ad959cae10f9')
-- @@rule end
),
live_rules as (
  select c.conname, c.conrelid, md5(regexp_replace(pg_get_constraintdef(c.oid), '\s+', '', 'g')) as md5
    from pg_constraint c
   where c.connamespace = 'public'::regnamespace
),
live as (
  select p.proname,
         md5(regexp_replace(regexp_replace(p.prosrc, '--[^\n]*', '', 'g'), '\s+', '', 'g')) as md5
    from pg_proc p
    join pg_namespace n on n.oid = p.pronamespace
   where n.nspname = 'public'
),
open_closes as (
  -- the closes that keep a day closed right now (nothing points at them)
  select c.location_code, c.day, c.recorded_by_name, c.recorded_at
    from public.finance_day_closings c
   where c.kind = 'close'
     and not exists (select 1 from public.finance_day_closings x where x.reverses_closing_id = c.id)
),
bb_days as (
  -- Black Belt rows by the school and day they were recorded under:
  -- payments / refunds still counting (not reversed - an undo, a hidden
  -- mis-click, or the old row of an edit, whose new row counts instead),
  -- and returned checks
  select p.location_code, p.paid_on as day,
         count(*) filter (where p.kind in ('payment', 'refund')
                            and not exists (select 1 from public.bb_payments x
                                             where x.reverses_payment_id = p.id and x.kind = 'reversal')) as counting,
         count(*) filter (where p.kind = 'returned') as returned
    from public.bb_payments p
   where p.kind <> 'reversal'
   group by p.location_code, p.paid_on
)
select r.* from (
  select 'function' as kind,
         g.name as item,
         case when l.md5 is null then 'MISSING - 0026 can not be applied'
              when l.md5 = g.md5_live then 'ok: the live ' || g.base || ' version (0026 can be applied)'
              when l.md5 = g.md5_0026 then 'ok: already 0026''s version (a re-run is harmless)'
              else 'DIFFERS - 0026 must be rebuilt before it is applied' end as detail
    from guard g
    left join live l on l.proname = g.name
  union all
  select 'rule',
         r.tbl || '.' || r.name,
         case when k.md5 is null then 'MISSING - 0026 can not be applied'
              when k.md5 = r.md5_live then 'ok: the live version (0026 can be applied)'
              when k.md5 = r.md5_0026 then 'ok: already 0026''s version (a re-run is harmless)'
              else 'DIFFERS - 0026 must be rebuilt before it is applied' end
    from rules r
    left join live_rules k on k.conname = r.name and k.conrelid = to_regclass('public.' || r.tbl)
  union all
  select 'closed day',
         o.location_code || ' ' || o.day::text,
         'closed by ' || o.recorded_by_name || ' at ' || o.recorded_at::text || ': '
           || b.counting || ' Black Belt payment / refund line(s) not in that close (shows Changed after closing after 0026), '
           || b.returned || ' returned check(s) (no change)'
    from open_closes o
    join bb_days b on b.location_code = o.location_code and b.day = o.day
) as r
 order by r.kind collate "C", r.item collate "C";
