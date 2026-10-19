-- =====================================================================
-- finance_perf_seed.sql  (PGlite test harness only - NEVER run this on Supabase)
-- ---------------------------------------------------------------------
-- WHAT THIS FILE IS
--   A big pretend history of payments for the Finance SPEED check in
--   run.mjs (step 14g): about 5 years of payments in both schools from
--   both sources - Color Belt (4,000 students, one payment each, every
--   7th edited, every 14th moved to the next day, every 11th undone a day
--   later, every 13th undone as a 5-second mis-click) and Star (4,000
--   candidates, every 9th edited, every 10th refunded the next day, every
--   20th refund undone). About 11,000 payment rows in all.
--
-- WHY
--   0011_tests.sql once ran for over 10 minutes on production (the chain
--   builder joined every payment row with every other). With realistic
--   volume every Finance function must still answer in well under a
--   second; run.mjs times each one on this seed and fails above 2 s.
--
-- It is written as the SQL Editor would (postgres, labelled); the login
-- ids are run.mjs's pretend admin (1111...) and desk (2222...).
-- =====================================================================
begin;
select set_config('request.jwt.claims', '', true);
select set_config('tkd.actor_label', 'PGlite perf seed', true);
select set_config('tkd.action', 'pglite_perf_seed', true);

-- Color Belt: one event per school (a copy of its first class with a final award)
insert into public.testing_events (location_code, name, testing_date, registration_open, public_code)
select l.code, 'PGlite perf ' || l.code, public.testing_today() + 60, false, public.testing_new_public_code()
  from public.locations l;
select public.testing_copy_class_into_event(e.id,
         (select c.id from public.testing_classes c
           where c.location_code = e.location_code and (c.final_award_none or c.final_award_rank_id is not null)
           order by c.position limit 1),
         time '16:00', time '17:00')
  from public.testing_events e where e.name like 'PGlite perf %';
-- 2,000 students per school
insert into public.testing_registrations (event_id, event_rank_id, first_name, last_name, paying_by, stripes_confirmed, source)
select e.id,
       (select k.id from public.testing_event_ranks k join public.testing_event_classes c on c.id = k.event_class_id
         where c.event_id = e.id order by k.position limit 1),
       'Perf', 'Cb ' || g, 'cash', true, 'staff'
  from public.testing_events e, generate_series(1, 2000) as g
 where e.name like 'PGlite perf %';

-- one payment each, spread over 5 years (g / 2000 of 1,825 days back)
insert into public.testing_payments (registration_id, kind, amount_cents, method, paid_on, recorded_at, recorded_by, recorded_by_name)
select r.id, 'payment', 6500, (array['cash', 'check', 'card'])[1 + x.g % 3], x.d,
       (x.d + time '15:00') at time zone 'America/New_York', '22222222-2222-4222-8222-222222222222', 'Staff'
  from public.testing_registrations r
  join public.testing_events e on e.id = r.event_id and e.name like 'PGlite perf %'
  cross join lateral (select split_part(r.last_name, ' ', 2)::integer as g) as gg
  cross join lateral (select gg.g, public.testing_today() - (gg.g * 1825 / 2000) as d) as x;

-- edits (every 7th; every 14th moves to the next day): reversal + new payment, same moment and login
insert into public.testing_payments (registration_id, kind, amount_cents, method, paid_on, recorded_at, recorded_by, recorded_by_name, reverses_payment_id)
select p.registration_id, 'reversal', -p.amount_cents, p.method, least(p.paid_on + 1, public.testing_today()),
       p.recorded_at + interval '1 day', '11111111-1111-4111-8111-111111111111', 'Main Admin', p.id
  from public.testing_payments p join public.testing_registrations r on r.id = p.registration_id
 where r.last_name like 'Cb %' and r.first_name = 'Perf' and split_part(r.last_name, ' ', 2)::integer % 7 = 0;
insert into public.testing_payments (registration_id, kind, amount_cents, method, paid_on, recorded_at, recorded_by, recorded_by_name)
select p.registration_id, 'payment', 7000, 'cash',
       case when split_part(r.last_name, ' ', 2)::integer % 14 = 0 then least(p.paid_on + 1, public.testing_today()) else p.paid_on end,
       p.recorded_at + interval '1 day', '11111111-1111-4111-8111-111111111111', 'Main Admin'
  from public.testing_payments p join public.testing_registrations r on r.id = p.registration_id
 where r.first_name = 'Perf' and split_part(r.last_name, ' ', 2)::integer % 7 = 0 and p.kind = 'payment' and p.amount_cents = 6500;
-- undos (every 11th, not edited) a day later by the admin
insert into public.testing_payments (registration_id, kind, amount_cents, method, paid_on, recorded_at, recorded_by, recorded_by_name, reverses_payment_id)
select p.registration_id, 'reversal', -p.amount_cents, p.method, least(p.paid_on + 1, public.testing_today()),
       p.recorded_at + interval '1 day', '11111111-1111-4111-8111-111111111111', 'Main Admin', p.id
  from public.testing_payments p join public.testing_registrations r on r.id = p.registration_id
 where r.first_name = 'Perf' and p.kind = 'payment'
   and split_part(r.last_name, ' ', 2)::integer % 11 = 0 and split_part(r.last_name, ' ', 2)::integer % 7 <> 0;
-- mis-click undos (every 13th, neither of the above) 5 seconds later by the desk
insert into public.testing_payments (registration_id, kind, amount_cents, method, paid_on, recorded_at, recorded_by, recorded_by_name, reverses_payment_id)
select p.registration_id, 'reversal', -p.amount_cents, p.method, p.paid_on,
       p.recorded_at + interval '5 seconds', '22222222-2222-4222-8222-222222222222', 'Staff', p.id
  from public.testing_payments p join public.testing_registrations r on r.id = p.registration_id
 where r.first_name = 'Perf' and p.kind = 'payment'
   and split_part(r.last_name, ' ', 2)::integer % 13 = 0 and split_part(r.last_name, ' ', 2)::integer % 7 <> 0
   and split_part(r.last_name, ' ', 2)::integer % 11 <> 0;

-- Star: one event, 2,000 candidates per school
insert into public.star_events (name, testing_date, start_time, where_code, registration_open,
                                public_code_worcester, public_code_shrewsbury, created_by_name, updated_by_name)
values ('PGlite perf Star', public.testing_today() + 60, '10:00', 'worcester', false,
        public.testing_new_public_code(), public.testing_new_public_code(), '', '');
select public.star_copy_template_into_event(e.id) from public.star_events e where e.name = 'PGlite perf Star';
insert into public.star_candidates (event_id, first_name, last_name, date_of_birth, email_for_results, location_code,
                                    dan, stars_from, paying_by, source, created_by_name, updated_by_name)
select e.id, 'Perf', 'St ' || g, date '2010-01-01', 'perf@example.com', l.code, 1, 0, 'cash', 'desk', '', ''
  from public.star_events e, public.locations l, generate_series(1, 2000) as g
 where e.name = 'PGlite perf Star';
insert into public.star_payments (candidate_id, kind, amount_cents, method, paid_on, recorded_at, recorded_by, recorded_by_name)
select c.id, 'payment', 14000, (array['cash', 'check', 'card'])[1 + x.g % 3], x.d,
       (x.d + time '14:00') at time zone 'America/New_York', '22222222-2222-4222-8222-222222222222', 'Staff'
  from public.star_candidates c
  cross join lateral (select split_part(c.last_name, ' ', 2)::integer as g) as gg
  cross join lateral (select gg.g, public.testing_today() - (gg.g * 1825 / 2000) as d) as x
 where c.first_name = 'Perf';
-- edits (every 9th, no refund)
insert into public.star_payments (candidate_id, kind, amount_cents, method, paid_on, recorded_at, recorded_by, recorded_by_name, reverses_payment_id)
select p.candidate_id, 'reversal', -p.amount_cents, p.method, least(p.paid_on + 2, public.testing_today()),
       p.recorded_at + interval '2 days', '11111111-1111-4111-8111-111111111111', 'Main Admin', p.id
  from public.star_payments p join public.star_candidates c on c.id = p.candidate_id
 where c.first_name = 'Perf' and split_part(c.last_name, ' ', 2)::integer % 9 = 0 and split_part(c.last_name, ' ', 2)::integer % 10 <> 0;
insert into public.star_payments (candidate_id, kind, amount_cents, method, paid_on, recorded_at, recorded_by, recorded_by_name)
select p.candidate_id, 'payment', 13000, 'card', p.paid_on, p.recorded_at + interval '2 days',
       '11111111-1111-4111-8111-111111111111', 'Main Admin'
  from public.star_payments p join public.star_candidates c on c.id = p.candidate_id
 where c.first_name = 'Perf' and p.kind = 'payment' and p.amount_cents = 14000
   and split_part(c.last_name, ' ', 2)::integer % 9 = 0 and split_part(c.last_name, ' ', 2)::integer % 10 <> 0;
-- refunds (every 10th) the next day; every 20th refund undone later
insert into public.star_payments (candidate_id, kind, amount_cents, method, paid_on, recorded_at, recorded_by, recorded_by_name)
select p.candidate_id, 'refund', -1000, case when split_part(c.last_name, ' ', 2)::integer % 30 = 0 then 'check' else 'cash' end,
       least(p.paid_on + 1, public.testing_today()), p.recorded_at + interval '1 day',
       '11111111-1111-4111-8111-111111111111', 'Main Admin'
  from public.star_payments p join public.star_candidates c on c.id = p.candidate_id
 where c.first_name = 'Perf' and p.kind = 'payment' and split_part(c.last_name, ' ', 2)::integer % 10 = 0;
insert into public.star_payments (candidate_id, kind, amount_cents, method, paid_on, recorded_at, recorded_by, recorded_by_name, reverses_payment_id)
select p.candidate_id, 'reversal', -p.amount_cents, p.method, least(p.paid_on + 3, public.testing_today()),
       p.recorded_at + interval '3 days', '11111111-1111-4111-8111-111111111111', 'Main Admin', p.id
  from public.star_payments p join public.star_candidates c on c.id = p.candidate_id
 where c.first_name = 'Perf' and p.kind = 'refund' and split_part(c.last_name, ' ', 2)::integer % 20 = 0;

select set_config('tkd.actor_label', '', true);
select set_config('tkd.action', '', true);
commit;
