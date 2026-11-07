-- =====================================================================
-- 0047_standin_star_school.sql  (a TEST fixture - never run on a real database)
-- ---------------------------------------------------------------------
-- WHAT THIS FILE IS
--   A stand-in for the part of Star's migration 0038 that Finance's 0047
--   needs: ONE school column on star_payments - the school of the desk that
--   took the money (text, null allowed, a foreign key to
--   public.locations(code)). The real 0038 also fills every old row from
--   the candidate's school and changes the Star functions that write
--   payments; 0047 only reads the column.
--
-- WHY IT EXISTS
--   0047 is tested on the finance branch while Star's 0038 is still being
--   written on the star-testing branch. run.mjs step0047 applies the REAL
--   0038 when its file is in supabase/migrations/ on this branch (after the
--   branches merge), and this stand-in only until then. Then this file can
--   be deleted. (Color Belt's two columns, testing_payments.school and
--   testing_private_payments.school, come from the real 0044, which is on
--   main since 2026-11-07; it made them NOT NULL.)
--
-- Nullable on purpose: Star's 0038 is not written yet, and 0047 reads the
-- column with a fallback to the candidate's school, so it works either way.
-- (An empty test database: there are no payment rows to fill. Payment tables
-- refuse every UPDATE, even one that matches no row.)
-- =====================================================================

alter table public.star_payments add column school text null;
alter table public.star_payments add constraint star_payments_school_fk
  foreign key (school) references public.locations (code) on delete restrict;
