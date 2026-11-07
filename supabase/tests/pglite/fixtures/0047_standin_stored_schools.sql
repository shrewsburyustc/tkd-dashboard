-- =====================================================================
-- 0047_standin_stored_schools.sql  (a TEST fixture - never run on a real database)
-- ---------------------------------------------------------------------
-- WHAT THIS FILE IS
--   A stand-in for the part of Star's migration 0038 and Color Belt's
--   migration 0044 that Finance's 0047 needs: ONE school column on each
--   payment table - the school of the desk that took the money:
--     star_payments.school, testing_payments.school,
--     testing_private_payments.school
--   (text, null allowed, a foreign key to public.locations(code). The real
--   migrations also fill every old row from the school it was counted at
--   until now - the candidate's, the event's, the private testing's.)
--
-- WHY IT EXISTS
--   0047 is written and tested on the finance branch while 0038 and 0044
--   are still being written on the star-testing and color-belt branches.
--   run.mjs step0047 applies the REAL 0038 / 0044 when their files are in
--   supabase/migrations/ on this branch (after the branches merge), and
--   this stand-in only until then. Then this file can be deleted.
--
-- NOT the real thing: the real migrations also change the Star and Color
-- Belt functions that write payments. 0047 only reads the columns.
--
-- Checked on production 2026-11-07: Color Belt's 0044 (live) made
-- testing_payments.school and testing_private_payments.school NOT NULL (with
-- the foreign key above); Star's 0038 is not live yet. This stand-in keeps all
-- three columns nullable on purpose: the older tests (0011, 0018, 0026) insert
-- payments without a school and would fail on a NOT NULL column until Color
-- Belt's fixed copies of them are merged. 0047 itself reads the columns with a
-- fallback to the old school, so it works with either.
-- =====================================================================

alter table public.star_payments add column school text null;
alter table public.testing_payments add column school text null;
alter table public.testing_private_payments add column school text null;

-- (An empty test database: there are no payment rows to fill. The real migrations fill every
-- old row from the candidate's / event's / private testing's school, switching the payment
-- tables' append-only guard off for that one update - which is why this stand-in doesn't
-- try: those tables refuse every UPDATE, even one that matches no row.)

alter table public.star_payments add constraint star_payments_school_fk
  foreign key (school) references public.locations (code) on delete restrict;
alter table public.testing_payments add constraint testing_payments_school_fk
  foreign key (school) references public.locations (code) on delete restrict;
alter table public.testing_private_payments add constraint testing_private_payments_school_fk
  foreign key (school) references public.locations (code) on delete restrict;
