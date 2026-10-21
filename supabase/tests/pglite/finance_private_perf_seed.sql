-- =====================================================================
-- finance_private_perf_seed.sql  (PGlite test harness only - NEVER run this on Supabase)
-- ---------------------------------------------------------------------
-- WHAT THIS FILE IS
--   Color Belt PRIVATE testing payments (0014) for the 0018 speed and
--   old-vs-new checks in run.mjs (step 16), on top of
--   finance_perf_seed.sql:
--     * 1,000 private testings per school added directly (Add + Mark
--       paid), one payment each, spread over 5 years; every 9th undone a
--       day later by the admin; every 12th edited (method) a day later
--     * every 5th Color Belt student of the speed seed whose only payment
--       is still live is MOVED to a private testing, written exactly as
--       0014's testing_move_to_private writes it: an event reversal dated
--       the payment's day (at the move time, by the mover) + a private
--       copy with moved_from_payment_id, the original day and the
--       ORIGINAL recording time
--   About 3,000 more payment rows.
--
-- WHY
--   0018 builds chains across the two Color Belt tables; every Finance
--   function must still answer in well under a second with them.
--
-- It is written as the SQL Editor would (postgres, labelled); the login
-- ids are run.mjs's pretend admin (1111...) and desk (2222...).
-- =====================================================================
begin;
select set_config('request.jwt.claims', '', true);
select set_config('tkd.actor_label', 'PGlite private seed', true);
select set_config('tkd.action', 'pglite_private_seed', true);

-- 1,000 private testings per school (added directly; the private day is
-- in the past for most - allowed for data written by hand)
insert into public.testing_private (location_code, first_name, last_name, class_name, rank_name,
                                    belt_pattern, belt_color, belt_end_stripes, belt_end_stripe_color, to_kind,
                                    private_cents, paying_by, stripes_confirmed, private_date, private_time,
                                    created_by_name, updated_by_name)
select l.code, 'Priv', 'Pv ' || g, 'Perf class', 'White', 'solid', 'white', 0, 'yellow', 'none',
       8500, 'cash', true, public.testing_today() - (g * 1825 / 1000) + 3, time '10:00', '', ''
  from public.locations l, generate_series(1, 1000) as g;

-- one payment each (Mark paid on the day)
insert into public.testing_private_payments (private_id, kind, amount_cents, method, paid_on, recorded_at, recorded_by, recorded_by_name)
select t.id, 'payment', 8500, (array['cash', 'check', 'card'])[1 + x.g % 3], x.d,
       (x.d + time '13:00') at time zone 'America/New_York', '22222222-2222-4222-8222-222222222222', 'Staff'
  from public.testing_private t
  cross join lateral (select split_part(t.last_name, ' ', 2)::integer as g) as gg
  cross join lateral (select gg.g, public.testing_today() - (gg.g * 1825 / 1000) as d) as x
 where t.first_name = 'Priv';

-- every 9th undone a day later (admin)
insert into public.testing_private_payments (private_id, kind, amount_cents, method, paid_on, recorded_at, recorded_by, recorded_by_name, reverses_payment_id)
select p.private_id, 'reversal', -p.amount_cents, p.method, least(p.paid_on + 1, public.testing_today()),
       p.recorded_at + interval '1 day', '11111111-1111-4111-8111-111111111111', 'Main Admin', p.id
  from public.testing_private_payments p join public.testing_private t on t.id = p.private_id
 where t.first_name = 'Priv' and split_part(t.last_name, ' ', 2)::integer % 9 = 0;

-- every 12th (not 9th) edited a day later: reversal + new payment (card), same moment and login
insert into public.testing_private_payments (private_id, kind, amount_cents, method, paid_on, recorded_at, recorded_by, recorded_by_name, reverses_payment_id)
select p.private_id, 'reversal', -p.amount_cents, p.method, least(p.paid_on + 1, public.testing_today()),
       p.recorded_at + interval '1 day', '11111111-1111-4111-8111-111111111111', 'Main Admin', p.id
  from public.testing_private_payments p join public.testing_private t on t.id = p.private_id
 where t.first_name = 'Priv' and split_part(t.last_name, ' ', 2)::integer % 12 = 0
   and split_part(t.last_name, ' ', 2)::integer % 9 <> 0 and p.kind = 'payment';
insert into public.testing_private_payments (private_id, kind, amount_cents, method, paid_on, recorded_at, recorded_by, recorded_by_name)
select p.private_id, 'payment', 8500, 'card', p.paid_on, p.recorded_at + interval '1 day',
       '11111111-1111-4111-8111-111111111111', 'Main Admin'
  from public.testing_private_payments p join public.testing_private t on t.id = p.private_id
 where t.first_name = 'Priv' and split_part(t.last_name, ' ', 2)::integer % 12 = 0
   and split_part(t.last_name, ' ', 2)::integer % 9 <> 0 and p.kind = 'payment';

-- MOVES: every 5th speed-seed Color Belt student whose payment is still
-- live and was never corrected (as 0014's testing_move_to_private writes)
create temp table zz_moves on commit drop as
select r.id as registration_id, r.event_id, e.name as event_name, e.location_code, r.first_name, r.last_name,
       p.id as payment_id, p.amount_cents, p.method, p.paid_on, p.recorded_at
  from public.testing_registrations r
  join public.testing_events e on e.id = r.event_id
  join public.testing_payments p on p.registration_id = r.id and p.kind = 'payment'
 where r.first_name = 'Perf' and split_part(r.last_name, ' ', 2)::integer % 5 = 0
   and (select count(*) from public.testing_payments x where x.registration_id = r.id) = 1;
-- (a) the event reversal, dated the payment's day, at the move time, by the desk
insert into public.testing_payments (registration_id, kind, amount_cents, method, paid_on, recorded_at, recorded_by, recorded_by_name, reverses_payment_id)
select m.registration_id, 'reversal', -m.amount_cents, m.method, m.paid_on, m.recorded_at + interval '2 days',
       '22222222-2222-4222-8222-222222222222', 'Staff', m.payment_id
  from zz_moves m;
-- (b) the registration leaves the event
update public.testing_registrations r
   set status = 'withdrawn', withdrawn_reason = 'withdrawn', withdrawn_at = now(), withdrawn_by_name = 'Staff',
       withdrawn_by = '22222222-2222-4222-8222-222222222222'
 where r.id in (select m.registration_id from zz_moves m);
-- (c) the private testing (same school as the event)
insert into public.testing_private (location_code, first_name, last_name, class_name, rank_name,
                                    belt_pattern, belt_color, belt_end_stripes, belt_end_stripe_color, to_kind,
                                    private_cents, paying_by, stripes_confirmed, private_date, private_time,
                                    moved_from_event_id, moved_from_registration_id, moved_from_event_name,
                                    moved_registration_version, created_by_name, updated_by_name)
select m.location_code, m.first_name, m.last_name, 'Perf class', 'White', 'solid', 'white', 0, 'yellow', 'none',
       8500, 'cash', true, m.paid_on + 10, time '10:00', m.event_id, m.registration_id, m.event_name,
       (select r.version from public.testing_registrations r where r.id = m.registration_id), '', ''
  from zz_moves m;
-- (d) the private copy: same amount, method and day, the ORIGINAL recording time
insert into public.testing_private_payments (private_id, kind, amount_cents, method, paid_on, recorded_at, recorded_by, recorded_by_name, moved_from_payment_id)
select t.id, 'payment', m.amount_cents, m.method, m.paid_on, m.recorded_at,
       '22222222-2222-4222-8222-222222222222', 'Staff', m.payment_id
  from zz_moves m join public.testing_private t on t.moved_from_registration_id = m.registration_id;

select set_config('tkd.actor_label', '', true);
select set_config('tkd.action', '', true);
commit;
