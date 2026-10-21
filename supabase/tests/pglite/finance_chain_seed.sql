-- =====================================================================
-- finance_chain_seed.sql  (PGlite test harness only - NEVER run this on Supabase)
-- ---------------------------------------------------------------------
-- WHAT THIS FILE IS
--   Extra pretend payments for run.mjs step 14h ("old vs new"), added on
--   top of finance_perf_seed.sql. The speed seed has only one-step chains
--   (one edit, or one undo); this one adds the LONGER and MIXED chains the
--   chain rules (contract 0011 section 1.3) have to get right:
--     Color Belt (120 students per school, "Chain Cb <n>"):
--       * every 17th: edited TWICE - first moved to the next day, then
--         moved BACK to the first day (edited on day 1, moved_out on day 2)
--       * every 19th: edited, then the new row undone the next day
--       * every 23rd: SEVERAL chains for one student - a second payment two
--         days later, a third undone 11 seconds later (shown as undone),
--         a fourth undone 5 seconds later by the same login (hidden)
--     Star (120 candidates per school, "Chain St <n>"):
--       * every 17th: edited, then undone
--       * every 19th: a refund, then the refund undone
--       * every 23rd: edited twice, the second edit back to the first day
--       * every 29th: several chains (a second payment two days later)
--   Every chain starts with a payment by the desk; corrections are by the
--   admin, written exactly as the real Edit / Undo functions write them
--   (an edit = a reversal + a new payment at the same moment by the same
--   login; an undo = a reversal dated the day it was made).
--
-- WHY
--   Step 14h runs the PRODUCTION copy of 0011 (the slow but proven chain
--   builder) and today's 0011 over the same data and requires identical
--   answers. These chains make that comparison cover every rule, not just
--   one-step chains.
--
-- It makes its own events ("PGlite chain ..."), so it works alone (14h's
-- second, sparse database) or on top of finance_perf_seed.sql (14h's big
-- database). 120 people per school spread over 5 years keeps a year's
-- worth small enough for the OLD chain builder to answer in seconds (it
-- was the slow one). The login ids are run.mjs's pretend admin (1111...) and desk
-- (2222...).
-- =====================================================================
begin;
select set_config('request.jwt.claims', '', true);
select set_config('tkd.actor_label', 'PGlite chain seed', true);
select set_config('tkd.action', 'pglite_chain_seed', true);

-- ---------------------------------------------------------------------
-- Color Belt
-- ---------------------------------------------------------------------
-- one event per school (a copy of its first class with a final award)
insert into public.testing_events (location_code, name, testing_date, registration_open, public_code)
select l.code, 'PGlite chain ' || l.code, public.testing_today() + 61, false, public.testing_new_public_code()
  from public.locations l;
select public.testing_copy_class_into_event(e.id,
         (select c.id from public.testing_classes c
           where c.location_code = e.location_code and (c.final_award_none or c.final_award_rank_id is not null)
           order by c.position limit 1),
         time '16:00', time '17:00')
  from public.testing_events e where e.name like 'PGlite chain %';
insert into public.testing_registrations (event_id, event_rank_id, first_name, last_name, paying_by, stripes_confirmed, source)
select e.id,
       (select k.id from public.testing_event_ranks k join public.testing_event_classes c on c.id = k.event_class_id
         where c.event_id = e.id order by k.position limit 1),
       'Chain', 'Cb ' || g, 'cash', true, 'staff'
  from public.testing_events e, generate_series(1, 120) as g
 where e.name like 'PGlite chain %';

-- the first payment of each (day = g / 120 of 1,820 days back, at least 3 days ago)
insert into public.testing_payments (registration_id, kind, amount_cents, method, paid_on, recorded_at, recorded_by, recorded_by_name)
select r.id, 'payment', 6500, 'cash', x.d, (x.d + time '15:00') at time zone 'America/New_York',
       '22222222-2222-4222-8222-222222222222', 'Staff'
  from public.testing_registrations r
  cross join lateral (select public.testing_today() - 3 - (split_part(r.last_name, ' ', 2)::integer * 1820 / 120) as d) as x
 where r.first_name = 'Chain';

-- every 17th: edit 1 (a day later) moves it to the next day as 70.00 check
insert into public.testing_payments (registration_id, kind, amount_cents, method, paid_on, recorded_at, recorded_by, recorded_by_name, reverses_payment_id)
select p.registration_id, 'reversal', -p.amount_cents, p.method, p.paid_on + 1, p.recorded_at + interval '1 day',
       '11111111-1111-4111-8111-111111111111', 'Main Admin', p.id
  from public.testing_payments p join public.testing_registrations r on r.id = p.registration_id
 where r.first_name = 'Chain' and split_part(r.last_name, ' ', 2)::integer % 17 = 0 and p.amount_cents = 6500;
insert into public.testing_payments (registration_id, kind, amount_cents, method, paid_on, recorded_at, recorded_by, recorded_by_name)
select p.registration_id, 'payment', 7000, 'check', p.paid_on + 1, p.recorded_at + interval '1 day',
       '11111111-1111-4111-8111-111111111111', 'Main Admin'
  from public.testing_payments p join public.testing_registrations r on r.id = p.registration_id
 where r.first_name = 'Chain' and split_part(r.last_name, ' ', 2)::integer % 17 = 0 and p.amount_cents = 6500 and p.kind = 'payment';
-- ... edit 2 (two days later) moves it BACK to the first day as 75.00 card
insert into public.testing_payments (registration_id, kind, amount_cents, method, paid_on, recorded_at, recorded_by, recorded_by_name, reverses_payment_id)
select p.registration_id, 'reversal', -p.amount_cents, p.method, p.paid_on + 1, p.recorded_at + interval '1 day',
       '11111111-1111-4111-8111-111111111111', 'Main Admin', p.id
  from public.testing_payments p join public.testing_registrations r on r.id = p.registration_id
 where r.first_name = 'Chain' and split_part(r.last_name, ' ', 2)::integer % 17 = 0 and p.amount_cents = 7000 and p.kind = 'payment';
insert into public.testing_payments (registration_id, kind, amount_cents, method, paid_on, recorded_at, recorded_by, recorded_by_name)
select p.registration_id, 'payment', 7500, 'card', p.paid_on - 1, p.recorded_at + interval '1 day',
       '11111111-1111-4111-8111-111111111111', 'Main Admin'
  from public.testing_payments p join public.testing_registrations r on r.id = p.registration_id
 where r.first_name = 'Chain' and split_part(r.last_name, ' ', 2)::integer % 17 = 0 and p.amount_cents = 7000 and p.kind = 'payment';

-- every 19th (not 17th): edited a day later (same day, 70.00), then the new row undone the next day
insert into public.testing_payments (registration_id, kind, amount_cents, method, paid_on, recorded_at, recorded_by, recorded_by_name, reverses_payment_id)
select p.registration_id, 'reversal', -p.amount_cents, p.method, p.paid_on + 1, p.recorded_at + interval '1 day',
       '11111111-1111-4111-8111-111111111111', 'Main Admin', p.id
  from public.testing_payments p join public.testing_registrations r on r.id = p.registration_id
 where r.first_name = 'Chain' and split_part(r.last_name, ' ', 2)::integer % 19 = 0
   and split_part(r.last_name, ' ', 2)::integer % 17 <> 0 and p.amount_cents = 6500;
insert into public.testing_payments (registration_id, kind, amount_cents, method, paid_on, recorded_at, recorded_by, recorded_by_name)
select p.registration_id, 'payment', 7000, 'cash', p.paid_on, p.recorded_at + interval '1 day',
       '11111111-1111-4111-8111-111111111111', 'Main Admin'
  from public.testing_payments p join public.testing_registrations r on r.id = p.registration_id
 where r.first_name = 'Chain' and split_part(r.last_name, ' ', 2)::integer % 19 = 0
   and split_part(r.last_name, ' ', 2)::integer % 17 <> 0 and p.amount_cents = 6500 and p.kind = 'payment';
insert into public.testing_payments (registration_id, kind, amount_cents, method, paid_on, recorded_at, recorded_by, recorded_by_name, reverses_payment_id)
select p.registration_id, 'reversal', -p.amount_cents, p.method, p.paid_on + 2, p.recorded_at + interval '1 day',
       '11111111-1111-4111-8111-111111111111', 'Main Admin', p.id
  from public.testing_payments p join public.testing_registrations r on r.id = p.registration_id
 where r.first_name = 'Chain' and split_part(r.last_name, ' ', 2)::integer % 19 = 0
   and split_part(r.last_name, ' ', 2)::integer % 17 <> 0 and p.amount_cents = 7000 and p.kind = 'payment';

-- every 23rd: more chains for the same student (two days later):
-- 30.00 cash (counted), 20.00 card undone 11 s later (undone), 10.00 cash
-- undone 5 s later by the same login (hidden)
insert into public.testing_payments (registration_id, kind, amount_cents, method, paid_on, recorded_at, recorded_by, recorded_by_name)
select p.registration_id, 'payment', v.amount, v.method, p.paid_on + 2, p.recorded_at + interval '2 days' + v.later,
       '22222222-2222-4222-8222-222222222222', 'Staff'
  from public.testing_payments p join public.testing_registrations r on r.id = p.registration_id
 cross join (values (3000, 'cash', interval '0 minutes'), (2000, 'card', interval '10 minutes'), (1000, 'cash', interval '20 minutes'))
            as v(amount, method, later)
 where r.first_name = 'Chain' and split_part(r.last_name, ' ', 2)::integer % 23 = 0 and p.amount_cents = 6500 and p.kind = 'payment'
   and p.recorded_by_name = 'Staff';
insert into public.testing_payments (registration_id, kind, amount_cents, method, paid_on, recorded_at, recorded_by, recorded_by_name, reverses_payment_id)
select p.registration_id, 'reversal', -p.amount_cents, p.method, p.paid_on,
       p.recorded_at + case p.amount_cents when 2000 then interval '11 seconds' else interval '5 seconds' end,
       case p.amount_cents when 2000 then '11111111-1111-4111-8111-111111111111'::uuid else '22222222-2222-4222-8222-222222222222'::uuid end,
       case p.amount_cents when 2000 then 'Main Admin' else 'Staff' end, p.id
  from public.testing_payments p join public.testing_registrations r on r.id = p.registration_id
 where r.first_name = 'Chain' and split_part(r.last_name, ' ', 2)::integer % 23 = 0 and p.amount_cents in (2000, 1000)
   and p.kind = 'payment';

-- ---------------------------------------------------------------------
-- Star
-- ---------------------------------------------------------------------
insert into public.star_events (name, testing_date, start_time, where_code, registration_open,
                                public_code_worcester, public_code_shrewsbury, created_by_name, updated_by_name)
values ('PGlite chain Star', public.testing_today() + 61, '10:00', 'shrewsbury', false,
        public.testing_new_public_code(), public.testing_new_public_code(), '', '');
select public.star_copy_template_into_event(e.id) from public.star_events e where e.name = 'PGlite chain Star';
insert into public.star_candidates (event_id, first_name, last_name, date_of_birth, email_for_results, location_code,
                                    dan, stars_from, paying_by, source, created_by_name, updated_by_name)
select e.id, 'Chain', 'St ' || g, date '2010-01-01', 'chain@example.com', l.code, 1, 0, 'cash', 'desk', '', ''
  from public.star_events e, public.locations l, generate_series(1, 120) as g
 where e.name = 'PGlite chain Star';
insert into public.star_payments (candidate_id, kind, amount_cents, method, paid_on, recorded_at, recorded_by, recorded_by_name)
select c.id, 'payment', 14000, 'cash', x.d, (x.d + time '14:00') at time zone 'America/New_York',
       '22222222-2222-4222-8222-222222222222', 'Staff'
  from public.star_candidates c
  cross join lateral (select public.testing_today() - 4 - (split_part(c.last_name, ' ', 2)::integer * 1820 / 120) as d) as x
 where c.first_name = 'Chain';

-- every 17th: edited (a day later, 130.00 card, same day), then undone two days later
insert into public.star_payments (candidate_id, kind, amount_cents, method, paid_on, recorded_at, recorded_by, recorded_by_name, reverses_payment_id)
select p.candidate_id, 'reversal', -p.amount_cents, p.method, p.paid_on + 1, p.recorded_at + interval '1 day',
       '11111111-1111-4111-8111-111111111111', 'Main Admin', p.id
  from public.star_payments p join public.star_candidates c on c.id = p.candidate_id
 where c.first_name = 'Chain' and split_part(c.last_name, ' ', 2)::integer % 17 = 0 and p.amount_cents = 14000;
insert into public.star_payments (candidate_id, kind, amount_cents, method, paid_on, recorded_at, recorded_by, recorded_by_name)
select p.candidate_id, 'payment', 13000, 'card', p.paid_on, p.recorded_at + interval '1 day',
       '11111111-1111-4111-8111-111111111111', 'Main Admin'
  from public.star_payments p join public.star_candidates c on c.id = p.candidate_id
 where c.first_name = 'Chain' and split_part(c.last_name, ' ', 2)::integer % 17 = 0 and p.amount_cents = 14000 and p.kind = 'payment';
insert into public.star_payments (candidate_id, kind, amount_cents, method, paid_on, recorded_at, recorded_by, recorded_by_name, reverses_payment_id)
select p.candidate_id, 'reversal', -p.amount_cents, p.method, p.paid_on + 3, p.recorded_at + interval '2 days',
       '11111111-1111-4111-8111-111111111111', 'Main Admin', p.id
  from public.star_payments p join public.star_candidates c on c.id = p.candidate_id
 where c.first_name = 'Chain' and split_part(c.last_name, ' ', 2)::integer % 17 = 0 and p.amount_cents = 13000 and p.kind = 'payment';

-- every 19th (not 17th): a 10.00 cash refund the next day, undone two days after that
insert into public.star_payments (candidate_id, kind, amount_cents, method, paid_on, recorded_at, recorded_by, recorded_by_name)
select p.candidate_id, 'refund', -1000, 'cash', p.paid_on + 1, p.recorded_at + interval '1 day',
       '11111111-1111-4111-8111-111111111111', 'Main Admin'
  from public.star_payments p join public.star_candidates c on c.id = p.candidate_id
 where c.first_name = 'Chain' and split_part(c.last_name, ' ', 2)::integer % 19 = 0
   and split_part(c.last_name, ' ', 2)::integer % 17 <> 0 and p.amount_cents = 14000 and p.kind = 'payment';
insert into public.star_payments (candidate_id, kind, amount_cents, method, paid_on, recorded_at, recorded_by, recorded_by_name, reverses_payment_id)
select p.candidate_id, 'reversal', -p.amount_cents, p.method, p.paid_on + 2, p.recorded_at + interval '2 days',
       '11111111-1111-4111-8111-111111111111', 'Main Admin', p.id
  from public.star_payments p join public.star_candidates c on c.id = p.candidate_id
 where c.first_name = 'Chain' and p.kind = 'refund';

-- every 23rd (not 17th / 19th): edited twice - to the next day, then back
insert into public.star_payments (candidate_id, kind, amount_cents, method, paid_on, recorded_at, recorded_by, recorded_by_name, reverses_payment_id)
select p.candidate_id, 'reversal', -p.amount_cents, p.method, p.paid_on + 1, p.recorded_at + interval '1 day',
       '11111111-1111-4111-8111-111111111111', 'Main Admin', p.id
  from public.star_payments p join public.star_candidates c on c.id = p.candidate_id
 where c.first_name = 'Chain' and split_part(c.last_name, ' ', 2)::integer % 23 = 0
   and split_part(c.last_name, ' ', 2)::integer % 17 <> 0 and split_part(c.last_name, ' ', 2)::integer % 19 <> 0
   and p.amount_cents = 14000;
insert into public.star_payments (candidate_id, kind, amount_cents, method, paid_on, recorded_at, recorded_by, recorded_by_name)
select p.candidate_id, 'payment', 13500, 'check', p.paid_on + 1, p.recorded_at + interval '1 day',
       '11111111-1111-4111-8111-111111111111', 'Main Admin'
  from public.star_payments p join public.star_candidates c on c.id = p.candidate_id
 where c.first_name = 'Chain' and split_part(c.last_name, ' ', 2)::integer % 23 = 0
   and split_part(c.last_name, ' ', 2)::integer % 17 <> 0 and split_part(c.last_name, ' ', 2)::integer % 19 <> 0
   and p.amount_cents = 14000 and p.kind = 'payment';
insert into public.star_payments (candidate_id, kind, amount_cents, method, paid_on, recorded_at, recorded_by, recorded_by_name, reverses_payment_id)
select p.candidate_id, 'reversal', -p.amount_cents, p.method, p.paid_on + 1, p.recorded_at + interval '1 day',
       '11111111-1111-4111-8111-111111111111', 'Main Admin', p.id
  from public.star_payments p join public.star_candidates c on c.id = p.candidate_id
 where c.first_name = 'Chain' and p.amount_cents = 13500 and p.kind = 'payment';
insert into public.star_payments (candidate_id, kind, amount_cents, method, paid_on, recorded_at, recorded_by, recorded_by_name)
select p.candidate_id, 'payment', 12500, 'card', p.paid_on - 1, p.recorded_at + interval '1 day',
       '11111111-1111-4111-8111-111111111111', 'Main Admin'
  from public.star_payments p join public.star_candidates c on c.id = p.candidate_id
 where c.first_name = 'Chain' and p.amount_cents = 13500 and p.kind = 'payment';

-- every 29th: a second chain for the same candidate (5.00 check, two days later)
insert into public.star_payments (candidate_id, kind, amount_cents, method, paid_on, recorded_at, recorded_by, recorded_by_name)
select p.candidate_id, 'payment', 500, 'check', p.paid_on + 2, p.recorded_at + interval '2 days',
       '22222222-2222-4222-8222-222222222222', 'Staff'
  from public.star_payments p join public.star_candidates c on c.id = p.candidate_id
 where c.first_name = 'Chain' and split_part(c.last_name, ' ', 2)::integer % 29 = 0 and p.amount_cents = 14000
   and p.kind = 'payment' and p.recorded_by_name = 'Staff';

select set_config('tkd.actor_label', '', true);
select set_config('tkd.action', '', true);
commit;
