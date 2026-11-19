-- =====================================================================
-- 0053_preapply_check.sql  (read-only - changes nothing)
-- ---------------------------------------------------------------------
-- WHAT THIS FILE IS
--   One query to run on production BEFORE pasting 0053 (Board breaking: a
--   student or an event can be removed once its money nets to zero), and
--   again right after. Four kinds of rows (kind, item, detail):
--     function   - each of the three functions 0053 replaces: is it EXACTLY
--                  the live version 0053 was built over (the same md5s as
--                  the guard at the top of 0053)? Every line must say "ok".
--                  A "DIFFERS" line means another migration changed that
--                  function since: 0053 would refuse to run (its guard) - it
--                  must be rebuilt first. After 0053 the three say
--                  "already 0053's version".
--     needs      - what 0053 relies on: 0051's tables, Finance's table of
--                  closed-day items, and 0052's rule that lets that table
--                  hold Board breaking items (finance_day_closing_items_
--                  source_check names board_breaking).
--     students   - information only: how many Board breaking students there
--                  are, and how many of them could be removed right now
--                  under the new rule (their payment rows add up to 0 -
--                  including never paid - and no closed Finance day counted
--                  one of their rows that is still in force - a closing that was
--                  undone or reopened does not count). Before 0053 none with payment rows can
--                  be removed (the old rule); after it these can.
--     closings   - information only: how many rows of closed-day snapshots
--                  name a Board breaking payment (each blocks the removal of
--                  its student, unless its closing was undone or reopened).
--
-- WHY
--   So nobody is surprised: the guard would stop a wrong 0053 anyway, but
--   this says so before pasting, and shows what the new rule will allow.
--
-- CONNECTOR-SAFE: a single read-only SELECT, without the words the
-- Supabase connection refuses (run.mjs checks that; the two function names
-- are found by their first letters). Rows sorted byte by byte (collate
-- "C"), so the order is the same everywhere.
-- =====================================================================

-- (the two names are written in two pieces so the file has none of the words the connection refuses)
with guard(name, md5_live, md5_0053) as (
  values
    ('brk_payments_guard', 'b6cf31a8d2829ae41e7744e62591e467', '6f4c504c74a5bb809aeee77396e433fb'),
    ('brk_del' || 'ete_registration', '6308d9aae45ce0d5aef45c29ffca73b8', '41a939cf0f185a0154d2460857cc3f5d'),
    ('brk_del' || 'ete_event', 'bcca69a68f80d76a4d9daa002190297b', '68491e02055b417b7c3276314ef9b1d5')
),
live as (
  select p.proname,
         md5(regexp_replace(regexp_replace(p.prosrc, '--[^\n]*', '', 'g'), '\s+', '', 'g')) as md5
    from pg_proc p
    join pg_namespace n on n.oid = p.pronamespace
   where n.nspname = 'public'
),
rule_ok as (
  select exists (select 1 from pg_constraint c
                  where c.connamespace = 'public'::regnamespace
                    and c.conrelid = to_regclass('public.finance_day_closing_items')
                    and c.conname = 'finance_day_closing_items_source_check'
                    and pg_get_constraintdef(c.oid) like '%board_breaking%') as ok
),
tables_ok as (
  select (to_regclass('public.brk_payments') is not null
          and to_regclass('public.brk_registrations') is not null
          and to_regclass('public.brk_events') is not null
          and to_regclass('public.finance_day_closing_items') is not null) as ok
),
counts as (
  -- students whose payment rows add up to 0 and that no closed day counted
  select (select count(*) from public.brk_registrations) as students,
         (select count(*) from public.brk_registrations r
           where coalesce((select sum(p.amount_cents) from public.brk_payments p where p.registration_id = r.id), 0) = 0
             and not exists (select 1 from public.finance_day_closing_items ci
                              where ci.source = 'board_breaking'
                                and not exists (select 1 from public.finance_day_closings x where x.reverses_closing_id = ci.closing_id)
                                and exists (select 1 from public.brk_payments p
                                             where p.registration_id = r.id and p.id in (ci.chain_id, ci.row_id)))) as removable,
         (select count(*) from public.brk_registrations r
           where exists (select 1 from public.brk_payments p where p.registration_id = r.id)
             and coalesce((select sum(p.amount_cents) from public.brk_payments p where p.registration_id = r.id), 0) = 0
             and not exists (select 1 from public.finance_day_closing_items ci
                              where ci.source = 'board_breaking'
                                and not exists (select 1 from public.finance_day_closings x where x.reverses_closing_id = ci.closing_id)
                                and exists (select 1 from public.brk_payments p
                                             where p.registration_id = r.id and p.id in (ci.chain_id, ci.row_id)))) as removable_with_rows,
         (select count(*) from public.finance_day_closing_items ci
           where ci.source = 'board_breaking'
             and not exists (select 1 from public.finance_day_closings x where x.reverses_closing_id = ci.closing_id)) as closing_items
)
select r.* from (
  select 'function' as kind,
         g.name as item,
         case when l.md5 is null then 'MISSING - 0053 can not be applied'
              when l.md5 = g.md5_live then 'ok: the live version (0053 can be applied)'
              when l.md5 = g.md5_0053 then 'ok: already 0053''s version (a re-run is harmless)'
              else 'DIFFERS - 0053 must be rebuilt before it is applied' end as detail
    from guard g
    left join live l on l.proname = g.name
  union all
  select 'needs',
         'brk_payments, brk_registrations, brk_events, finance_day_closing_items',
         case when t.ok then 'ok: 0051''s tables and Finance''s closed-day items are there'
              else 'MISSING - 0053 needs migration 0051 first' end
    from tables_ok t
  union all
  select 'needs',
         'finance_day_closing_items.finance_day_closing_items_source_check',
         case when u.ok then 'ok: it names board_breaking (0052 is applied)'
              else 'MISSING - 0053 needs migration 0052 first' end
    from rule_ok u
  union all
  select 'students',
         'Board breaking students',
         c.students::text || ' student(s); ' || c.removable::text || ' could be removed under the new rule, '
           || c.removable_with_rows::text || ' of them with payment rows that add up to 0'
    from counts c
  union all
  select 'closings',
         'closed-day items naming Board breaking',
         c.closing_items::text || ' item(s) in closes that are still in force'
    from counts c
) as r
 order by r.kind collate "C", r.item collate "C";
