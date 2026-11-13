-- =====================================================================
-- 0052_preapply_check.sql  (read-only - changes nothing)
-- ---------------------------------------------------------------------
-- WHAT THIS FILE IS
--   One query to run on production BEFORE pasting 0052 (Finance reads
--   Board breaking payments: Daily report, Close the day, History, Export,
--   payment detail), and again right after. Four kinds of rows (kind,
--   item, detail):
--     function    - each of the five Finance functions 0052 replaces, and
--                   the one it relies on but does not replace
--                   (finance_money_rows, 0047's wrapper): is it EXACTLY the
--                   live version 0052 was built over (the same md5s as the
--                   guard at the top of 0052)? Every line must say "ok". A
--                   "DIFFERS" line means another migration changed that
--                   function since: 0052 would refuse to run (its guard) -
--                   it must be rebuilt first. After 0052 the five say
--                   "already 0052's version".
--     rule        - the table rule 0052 rebuilds
--                   (finance_day_closing_items_source_check): the live text
--                   (0026's, five sources minus Board breaking) or 0052's.
--     table       - 0051's three tables 0052 reads (brk_payments,
--                   brk_registrations, brk_events) are there.
--     closed day  - each school day that is CLOSED right now and has Board
--                   breaking money on it: how many Board breaking payment /
--                   refund lines still count there (none was counted when
--                   the day was closed, so after 0052 that day shows
--                   "Changed after closing" - expected, nothing is wrong).
--                   No row = no closed day changes (the usual case: before
--                   0052 nothing of Board breaking is in any close).
--
-- WHY
--   So nobody is surprised: the guard would stop a wrong 0052 anyway, but
--   this says so before pasting; and an admin can look at each listed day
--   and reopen / close it again if wanted.
--
-- CONNECTOR-SAFE: a single read-only SELECT, without the words the
-- Supabase connection refuses (run.mjs checks that). Run it through the
-- connection or in the SQL Editor. Rows sorted byte by byte (collate "C"),
-- so the order is the same everywhere.
-- =====================================================================

with guard(name, md5_live, md5_0052) as (
  values
    ('finance_chain_steps_core', '6d03a519cc5ada725a961b1c672dbe82', 'f59ce2d742c8f69e9b76109962cc5edf'),
    ('finance_money_rows_core', '11479fb6451a956b5f8bb5bc6b5c0366', '534cb48c5cc6d5f6c9be6ce4ca0e0d8d'),
    ('finance_day', '8cb806284e54443fb73bd4a8f679b617', 'fe768b06d00755793c0352c41fabcd3e'),
    ('finance_payment_detail', 'cc90ec717325831a58a3063c9cb73c12', '61b9768f75082591f5e74a79ad5fee33'),
    ('finance_export', '0f4b678f757bca72fec14bb78aacd37d', '637d23b573269daa3e8f4f23f2d1e68a'),
    ('finance_money_rows', '6882b0a0f80407ba97864f47feae0e7f', '6882b0a0f80407ba97864f47feae0e7f')
),
live_rule as (
  select md5(regexp_replace(pg_get_constraintdef(c.oid), '\s+', '', 'g')) as md5
    from pg_constraint c
   where c.connamespace = 'public'::regnamespace
     and c.conrelid = to_regclass('public.finance_day_closing_items')
     and c.conname = 'finance_day_closing_items_source_check'
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
brk_days as (
  -- Board breaking rows by the school and day they were recorded under:
  -- payments / refunds still counting (not reversed - an undo, a hidden
  -- mis-click, or the old row of an edit, whose new row counts instead)
  select p.school, p.paid_on as day,
         count(*) filter (where p.kind in ('payment', 'refund')
                            and not exists (select 1 from public.brk_payments x
                                             where x.reverses_payment_id = p.id and x.kind = 'reversal')) as counting
    from public.brk_payments p
   where p.kind <> 'reversal'
   group by p.school, p.paid_on
)
select r.* from (
  select 'function' as kind,
         g.name as item,
         case when l.md5 is null then 'MISSING - 0052 can not be applied'
              when l.md5 = g.md5_live then 'ok: the live version (0052 can be applied)'
              when l.md5 = g.md5_0052 then 'ok: already 0052''s version (a re-run is harmless)'
              else 'DIFFERS - 0052 must be rebuilt before it is applied' end as detail
    from guard g
    left join live l on l.proname = g.name
  union all
  select 'rule',
         'finance_day_closing_items.finance_day_closing_items_source_check',
         case when k.md5 is null then 'MISSING - 0052 can not be applied'
              when k.md5 = '90f7e1c6ff131e9c45f4b8fca93d533a' then 'ok: the live version (0052 can be applied)'
              when k.md5 = '4992db56bbcd5091040aea69560a2cf3' then 'ok: already 0052''s version (a re-run is harmless)'
              else 'DIFFERS - 0052 must be rebuilt before it is applied' end
    from (select 1) as one
    left join live_rule k on true
  union all
  select 'table',
         'brk_payments, brk_registrations, brk_events',
         case when to_regclass('public.brk_payments') is not null
                   and to_regclass('public.brk_registrations') is not null
                   and to_regclass('public.brk_events') is not null
              then 'ok: 0051''s tables are there'
              else 'MISSING - 0052 needs migration 0051 first' end
  union all
  select 'closed day',
         o.location_code || ' ' || o.day::text,
         'closed by ' || o.recorded_by_name || ' at ' || o.recorded_at::text || ': '
           || b.counting || ' Board breaking payment / refund line(s) not in that close (shows Changed after closing after 0052)'
    from open_closes o
    join brk_days b on b.school = o.location_code and b.day = o.day
   where b.counting > 0
) as r
 order by r.kind collate "C", r.item collate "C";
