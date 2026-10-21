-- =====================================================================
-- 0018_preapply_check.sql  (read-only - changes nothing)
-- ---------------------------------------------------------------------
-- WHAT THIS FILE IS
--   One query to run on production BEFORE pasting 0018: the Finance days
--   that are CLOSED right now (closed under 0011, which didn't count
--   Color Belt private testing money) and that have private testing money
--   or a Move to private testing on them. One row per school day:
--     school, day, closed_by, closed_at,
--     private_payments    private testing payments dated that day that
--                         still count (not undone - a mis-click hidden
--                         undo included - and an edited payment once, as
--                         its new row; moved-in copies are in the next
--                         column instead). None was counted when the day
--                         was closed.
--     moved_before_close  event payments of that day moved to a private
--                         testing BEFORE the day was closed (under 0011
--                         they showed as undone, so the close left them
--                         out; one moved after the close was counted then
--                         and is no difference)
--     undone_moves        moved payments whose move was undone (they come
--                         back as one counted line after 0018 - no change)
--
-- WHY
--   After 0018 a closed day correctly shows "Changed after closing" when
--   money that wasn't counted at the close now counts (a private payment,
--   or a payment moved BEFORE the close). This list says which days that
--   will be, so nobody is surprised; an admin can look at each and reopen /
--   close it again if wanted. Empty list = no closed day changes.
--
-- CONNECTOR-SAFE: a single read-only SELECT, without the words the
-- Supabase connection refuses. Run it through the connection or in the
-- SQL Editor. Rows sorted byte by byte (collate "C") so the order is the
-- same everywhere.
-- =====================================================================

with open_closes as (
  select c.id, c.location_code, c.day, c.recorded_by_name, c.recorded_at
    from public.finance_day_closings c
   where c.kind = 'close'
     and not exists (select 1 from public.finance_day_closings x where x.reverses_closing_id = c.id)
),
private_days as (
  select t.location_code, p.paid_on as day, count(*) as n
    from public.testing_private_payments p
    join public.testing_private t on t.id = p.private_id
   where p.kind = 'payment' and p.moved_from_payment_id is null
     -- still counting: not reversed (an undo, a hidden mis-click, or the
     -- old row of an edit - whose new row is counted instead)
     and not exists (select 1 from public.testing_private_payments x where x.reverses_payment_id = p.id)
   group by t.location_code, p.paid_on
),
moved as (
  -- an event payment with a private copy (moved, and not undone), with
  -- the time of its move (the event-side reversal)
  select e.location_code, p.paid_on as day, rv.recorded_at as moved_at
    from public.testing_payments p
    join public.testing_registrations r on r.id = p.registration_id
    join public.testing_events e on e.id = r.event_id
    join public.testing_payments rv on rv.reverses_payment_id = p.id
   where p.kind = 'payment'
     and exists (select 1 from public.testing_private_payments x where x.moved_from_payment_id = p.id)
),
undone_move_days as (
  -- an event payment reversed on its own day with no private copy left,
  -- and the same money recorded again with no login at its old time
  -- (what 0014's Undo move leaves behind)
  select e.location_code, p.paid_on as day, count(*) as n
    from public.testing_payments p
    join public.testing_registrations r on r.id = p.registration_id
    join public.testing_events e on e.id = r.event_id
    join public.testing_payments rv on rv.reverses_payment_id = p.id and rv.paid_on = p.paid_on
   where p.kind = 'payment'
     and not exists (select 1 from public.testing_private_payments x where x.moved_from_payment_id = p.id)
     and exists (select 1 from public.testing_payments n
                  where n.registration_id = p.registration_id and n.kind = 'payment' and n.id <> p.id
                    and n.recorded_by is null and n.recorded_at = p.recorded_at
                    and n.amount_cents = p.amount_cents and n.method = p.method and n.paid_on = p.paid_on)
   group by e.location_code, p.paid_on
)
select o.location_code as school,
       o.day,
       o.recorded_by_name as closed_by,
       o.recorded_at as closed_at,
       coalesce(pd.n, 0) as private_payments,
       (select count(*) from moved m
         where m.location_code = o.location_code and m.day = o.day and m.moved_at < o.recorded_at) as moved_before_close,
       coalesce(ud.n, 0) as undone_moves
  from open_closes o
  left join private_days pd on pd.location_code = o.location_code and pd.day = o.day
  left join undone_move_days ud on ud.location_code = o.location_code and ud.day = o.day
 where pd.n is not null or ud.n is not null
    or exists (select 1 from moved m where m.location_code = o.location_code and m.day = o.day)
 order by o.day, o.location_code collate "C";
