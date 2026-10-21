-- =====================================================================
-- finance_camps_perf_seed.sql  (PGlite test harness only - NEVER run this on Supabase)
-- ---------------------------------------------------------------------
-- WHAT THIS FILE IS
--   Camp payments for the Finance SPEED check of migration 0017 (run.mjs,
--   step 15, "camps speed"), added ON TOP of finance_perf_seed.sql (about
--   11,000 Color Belt and Star rows): one both-schools camp held at
--   Worcester with 3,000 campers, one payment each over the last 300 days,
--   taken at Worcester or Shrewsbury in turn; every 7th edited the next
--   day by an admin (every 14th also moved to the other school, every
--   21st also to the next day), every 11th undone a day later, every 13th
--   undone as a 5-second mis-click. About 4,000 camp payment rows.
--   The 300 days keep every row inside one 366-day export, so run.mjs can
--   check that an export's camp total equals the money in camp_payments.
--
-- WHY
--   0017 adds a third source to Finance's chain builder; with realistic
--   volume every Finance function must still answer in well under 2 s.
--
-- Written as the SQL Editor would (postgres, labelled); the login ids are
-- run.mjs's pretend admin (1111...) and desk (2222...).
-- =====================================================================
begin;
select set_config('request.jwt.claims', '', true);
select set_config('tkd.actor_label', 'PGlite camps perf seed', true);
select set_config('tkd.action', 'pglite_perf_seed', true);

insert into public.camps (location_code, both_schools, name, start_time, end_time, signup_opens_on, signup_closes_on,
                          early_until, min_age, max_age, waiver_text, public_code, created_by_name, updated_by_name)
values ('worcester', true, 'PGlite Perf Camp', '09:00', '15:00', public.testing_today(), public.testing_today() + 30,
        public.testing_today() + 30, 5, 12, 'I agree to the camp rules.', 'pgpf2345', '', '');
insert into public.camp_days (camp_id, day)
select c.id, public.testing_today() + 30 from public.camps c where c.public_code = 'pgpf2345';

-- 3,000 sign-ups with one camper each (signature already removed)
insert into public.camp_signups (camp_id, submission_id, parent_name, parent_relation, parent_phone, emergency_name,
                                 emergency_relation, emergency_phone, price_kind, signed_up_on, signature, signed_at,
                                 signature_deleted_at, waiver_text_signed, ack_version, created_by_name, updated_by_name)
select c.id, gen_random_uuid(), 'Perf Parent ' || g, 'Parent', '5085550100', 'Perf Contact', 'Friend', '5085550101',
       'early', public.testing_today(), null, now(), now(), 'I agree to the camp rules.', 'camp-2026-10-18', '', ''
  from public.camps c, generate_series(1, 3000) as g
 where c.public_code = 'pgpf2345';
insert into public.camp_campers (signup_id, camp_id, position, first_name, last_name, age, member, paying_by, base_cents,
                                 created_by_name, updated_by_name)
select s.id, s.camp_id, 1, 'Perf', 'Camp ' || split_part(s.parent_name, ' ', 3), 8, true, 'cash', 7500, '', ''
  from public.camp_signups s join public.camps c on c.id = s.camp_id
 where c.public_code = 'pgpf2345';

-- one payment each: day g * 300 / 3000 back, Worcester / Shrewsbury in turn
insert into public.camp_payments (camper_id, kind, amount_cents, method, paid_on, school, recorded_at, recorded_by, recorded_by_name)
select cc.id, 'payment', 7500, (array['cash', 'check', 'card'])[1 + x.g % 3], x.d,
       case when x.g % 2 = 0 then 'worcester' else 'shrewsbury' end,
       (x.d + time '15:00') at time zone 'America/New_York', '22222222-2222-4222-8222-222222222222', 'Staff'
  from public.camp_campers cc
  join public.camps c on c.id = cc.camp_id and c.public_code = 'pgpf2345'
  cross join lateral (select split_part(cc.last_name, ' ', 2)::integer as g) as gg
  cross join lateral (select gg.g, public.testing_today() - (gg.g * 300 / 3000) as d) as x;

-- edits (every 7th): reversal + new payment at the same moment by the admin;
-- every 14th corrected to the other school, every 21st moved to the next day
insert into public.camp_payments (camper_id, kind, amount_cents, method, paid_on, school, recorded_at, recorded_by, recorded_by_name, reverses_payment_id)
select p.camper_id, 'reversal', -p.amount_cents, p.method, least(p.paid_on + 1, public.testing_today()), p.school,
       p.recorded_at + interval '1 day', '11111111-1111-4111-8111-111111111111', 'Main Admin', p.id
  from public.camp_payments p join public.camp_campers cc on cc.id = p.camper_id
 where cc.first_name = 'Perf' and cc.last_name like 'Camp %' and split_part(cc.last_name, ' ', 2)::integer % 7 = 0;
insert into public.camp_payments (camper_id, kind, amount_cents, method, paid_on, school, recorded_at, recorded_by, recorded_by_name)
select p.camper_id, 'payment', 8000, 'cash',
       case when split_part(cc.last_name, ' ', 2)::integer % 21 = 0 then least(p.paid_on + 1, public.testing_today()) else p.paid_on end,
       case when split_part(cc.last_name, ' ', 2)::integer % 14 = 0
            then (case p.school when 'worcester' then 'shrewsbury' else 'worcester' end) else p.school end,
       p.recorded_at + interval '1 day', '11111111-1111-4111-8111-111111111111', 'Main Admin'
  from public.camp_payments p join public.camp_campers cc on cc.id = p.camper_id
 where cc.first_name = 'Perf' and cc.last_name like 'Camp %' and split_part(cc.last_name, ' ', 2)::integer % 7 = 0
   and p.kind = 'payment' and p.amount_cents = 7500;
-- undos (every 11th, not edited) a day later by the admin
insert into public.camp_payments (camper_id, kind, amount_cents, method, paid_on, school, recorded_at, recorded_by, recorded_by_name, reverses_payment_id)
select p.camper_id, 'reversal', -p.amount_cents, p.method, least(p.paid_on + 1, public.testing_today()), p.school,
       p.recorded_at + interval '1 day', '11111111-1111-4111-8111-111111111111', 'Main Admin', p.id
  from public.camp_payments p join public.camp_campers cc on cc.id = p.camper_id
 where cc.first_name = 'Perf' and cc.last_name like 'Camp %' and p.kind = 'payment'
   and split_part(cc.last_name, ' ', 2)::integer % 11 = 0 and split_part(cc.last_name, ' ', 2)::integer % 7 <> 0;
-- mis-click undos (every 13th, neither of the above) 5 seconds later by the desk
insert into public.camp_payments (camper_id, kind, amount_cents, method, paid_on, school, recorded_at, recorded_by, recorded_by_name, reverses_payment_id)
select p.camper_id, 'reversal', -p.amount_cents, p.method, p.paid_on, p.school,
       p.recorded_at + interval '5 seconds', '22222222-2222-4222-8222-222222222222', 'Staff', p.id
  from public.camp_payments p join public.camp_campers cc on cc.id = p.camper_id
 where cc.first_name = 'Perf' and cc.last_name like 'Camp %' and p.kind = 'payment'
   and split_part(cc.last_name, ' ', 2)::integer % 13 = 0 and split_part(cc.last_name, ' ', 2)::integer % 7 <> 0
   and split_part(cc.last_name, ' ', 2)::integer % 11 <> 0;

select set_config('tkd.actor_label', '', true);
select set_config('tkd.action', '', true);
commit;
