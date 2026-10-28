-- =====================================================================
-- finance_black_belt_perf_seed.sql  (PGlite test harness only - NEVER run this on Supabase)
-- ---------------------------------------------------------------------
-- WHAT THIS FILE IS
--   Black Belt payments (0016) for the 0026 speed and correctness checks
--   in run.mjs (step0026). run.mjs first adds four cycles named
--   "PGlite fin26 1" .. "4" through bb_add_cycle; this file then adds:
--     * 2,000 candidates over those cycles, half per school
--     * payment 1 for each (cash / check / card in turn), spread over 5
--       years; payment 2 a week later for every 2nd
--     * every 7th payment 1 EDITED a day later (a reversal + a new card
--       payment on the old day, same moment and login - as bb_edit_payment)
--     * every 11th (not 7th) a CARD refund 3 days later
--     * every 4th CHECK payment 1 (not 7th) RETURNED 10 days later, and
--       every 2nd of those returned marks UNDONE a day later
--     * every 17th payment 2 undone the next day
--   About 4,000 rows.
--
-- WHY
--   0026 adds Black Belt to every Finance function; each must still answer
--   in well under 2 s with thousands of Black Belt rows, returned checks
--   and undone marks among them.
--
-- The payment rows are written with the table's triggers switched off for
-- this transaction only (session_replication_role = replica): the guard
-- would refuse a returned row dated on any day but today, and the seed
-- needs them on past days. Login ids: run.mjs's pretend admin (1111...)
-- and desk (2222...).
-- =====================================================================
begin;
select set_config('request.jwt.claims', '', true);
select set_config('tkd.actor_label', 'PGlite black belt seed', true);

-- 2,000 candidates over the four test cycles (by the cycles' own number,
-- never by text order)
insert into public.bb_candidates (cycle_id, first_name, last_name, date_of_birth, email_for_results, location_code, dan,
                                  cycle_plan_id, kukkiwon, source, reference, created_by_name, updated_by_name)
select y.id, 'Bbperf', 'Bp ' || g, date '1980-01-01' + g, 'bbperf.' || g || '@example.com',
       case when g % 2 = 0 then 'worcester' else 'shrewsbury' end, 1,
       (select pl.id from public.bb_cycle_plans pl where pl.cycle_id = y.id order by pl.position limit 1),
       false, 'desk', 'BB-' || nextval('public.bb_candidate_ref_seq'::regclass)::text, '', ''
  from generate_series(1, 2000) as g
  join public.bb_cycles y on y.name = 'PGlite fin26 ' || (1 + g % 4);

set local session_replication_role = replica;

create temp table zz_bb on commit drop as
select c.id as candidate_id, c.cycle_id, c.location_code, y.name as cycle_name,
       split_part(c.last_name, ' ', 2)::integer as g,
       public.testing_today() - (split_part(c.last_name, ' ', 2)::integer * 1825 / 2000) as d
  from public.bb_candidates c join public.bb_cycles y on y.id = c.cycle_id
 where c.first_name = 'Bbperf';

-- payment 1
insert into public.bb_payments (candidate_id, cycle_id, kind, amount_cents, method, paid_on, for_items,
                                location_code, cycle_name, recorded_at, recorded_by, recorded_by_name)
select z.candidate_id, z.cycle_id, 'payment', 29000 + (z.g % 5) * 1000, (array['check', 'cash', 'card'])[1 + z.g % 3],
       z.d, '{p1}', z.location_code, z.cycle_name, (z.d + time '15:00') at time zone 'America/New_York',
       '22222222-2222-4222-8222-222222222222', 'Staff'
  from zz_bb z;

-- payment 2, a week later (never after today), every 2nd
insert into public.bb_payments (candidate_id, cycle_id, kind, amount_cents, method, paid_on, for_items,
                                location_code, cycle_name, recorded_at, recorded_by, recorded_by_name)
select z.candidate_id, z.cycle_id, 'payment', 10000, 'cash', least(z.d + 7, public.testing_today()), '{kukkiwon}',
       z.location_code, z.cycle_name, (least(z.d + 7, public.testing_today()) + time '16:00') at time zone 'America/New_York',
       '22222222-2222-4222-8222-222222222222', 'Staff'
  from zz_bb z where z.g % 2 = 0;

-- every 7th payment 1 edited a day later: reversal + new payment, same moment and login
insert into public.bb_payments (candidate_id, cycle_id, kind, amount_cents, method, paid_on, for_items,
                                location_code, cycle_name, recorded_at, recorded_by, recorded_by_name, reverses_payment_id)
select p.candidate_id, p.cycle_id, 'reversal', -p.amount_cents, p.method, least(p.paid_on + 1, public.testing_today()), null,
       p.location_code, p.cycle_name, p.recorded_at + interval '1 day', '11111111-1111-4111-8111-111111111111', 'Main Admin', p.id
  from public.bb_payments p join zz_bb z on z.candidate_id = p.candidate_id
 where z.g % 7 = 0 and p.kind = 'payment' and p.for_items = '{p1}';
insert into public.bb_payments (candidate_id, cycle_id, kind, amount_cents, method, paid_on, for_items,
                                location_code, cycle_name, recorded_at, recorded_by, recorded_by_name)
select p.candidate_id, p.cycle_id, 'payment', p.amount_cents + 500, 'card', p.paid_on, '{p1}',
       p.location_code, p.cycle_name, p.recorded_at + interval '1 day', '11111111-1111-4111-8111-111111111111', 'Main Admin'
  from public.bb_payments p join zz_bb z on z.candidate_id = p.candidate_id
 where z.g % 7 = 0 and p.kind = 'payment' and p.for_items = '{p1}' and p.recorded_by_name = 'Staff';

-- every 11th (not 7th): a card refund 3 days later
insert into public.bb_payments (candidate_id, cycle_id, kind, amount_cents, method, paid_on, for_items,
                                location_code, cycle_name, recorded_at, recorded_by, recorded_by_name)
select z.candidate_id, z.cycle_id, 'refund', -5000, 'card', least(z.d + 3, public.testing_today()), null,
       z.location_code, z.cycle_name, (least(z.d + 3, public.testing_today()) + time '11:00') at time zone 'America/New_York',
       '11111111-1111-4111-8111-111111111111', 'Main Admin'
  from zz_bb z where z.g % 11 = 0 and z.g % 7 <> 0;

-- every 4th CHECK payment 1 (not 7th): returned 10 days later
insert into public.bb_payments (candidate_id, cycle_id, kind, amount_cents, method, paid_on, for_items,
                                location_code, cycle_name, recorded_at, recorded_by, recorded_by_name, reverses_payment_id)
select p.candidate_id, p.cycle_id, 'returned', -p.amount_cents, 'check', least(p.paid_on + 10, public.testing_today()), null,
       p.location_code, p.cycle_name, (least(p.paid_on + 10, public.testing_today()) + time '10:00') at time zone 'America/New_York',
       '11111111-1111-4111-8111-111111111111', 'Main Admin', p.id
  from public.bb_payments p join zz_bb z on z.candidate_id = p.candidate_id
 where z.g % 3 = 0 and z.g % 4 = 0 and z.g % 7 <> 0 and p.kind = 'payment' and p.for_items = '{p1}';

-- every 2nd of those returned marks undone a day later
insert into public.bb_payments (candidate_id, cycle_id, kind, amount_cents, method, paid_on, for_items,
                                location_code, cycle_name, recorded_at, recorded_by, recorded_by_name, reverses_payment_id)
select p.candidate_id, p.cycle_id, 'reversal', -p.amount_cents, 'check', least(p.paid_on + 1, public.testing_today()), null,
       p.location_code, p.cycle_name, p.recorded_at + interval '1 day', '11111111-1111-4111-8111-111111111111', 'Main Admin', p.id
  from public.bb_payments p join zz_bb z on z.candidate_id = p.candidate_id
 where p.kind = 'returned' and z.g % 8 = 0;

-- every 17th payment 2 undone the next day
insert into public.bb_payments (candidate_id, cycle_id, kind, amount_cents, method, paid_on, for_items,
                                location_code, cycle_name, recorded_at, recorded_by, recorded_by_name, reverses_payment_id)
select p.candidate_id, p.cycle_id, 'reversal', -p.amount_cents, p.method, least(p.paid_on + 1, public.testing_today()), null,
       p.location_code, p.cycle_name, p.recorded_at + interval '1 day', '11111111-1111-4111-8111-111111111111', 'Main Admin', p.id
  from public.bb_payments p join zz_bb z on z.candidate_id = p.candidate_id
 where z.g % 17 = 0 and p.kind = 'payment' and p.for_items = '{kukkiwon}';

select set_config('tkd.actor_label', '', true);
commit;
