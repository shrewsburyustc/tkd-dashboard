-- =====================================================================
-- 0027_preapply_check.sql  (read-only - changes nothing)
-- ---------------------------------------------------------------------
-- WHAT THIS FILE IS
--   One query to run on production BEFORE pasting 0027: how many ACTIVE
--   campers already hold an extra row that 0027's Edit camp would refuse
--   (the bug 0027 fixes may already have left some behind). One row:
--     active_campers  active campers with at least one such row
--     camps           how many camps they are in
--     extra_rows      how many such rows in all
--   A row counts when, with the camp's CURRENT days:
--     * its "per" doesn't fit the extra (a once extra's row has a day, or
--       a per-day extra's row has none), or
--     * a per-day row is on a day the extra's only_on list doesn't offer, or
--     * the extra is "not charged to all-days campers" and the camper
--       comes every camp day of that row's Monday-Sunday week (per-day)
--       or of the whole camp (once).
--
-- WHY
--   After 0027, ANY Edit camp save on a camp with such a camper is
--   refused (extra_per / extra_included / extra_day) until staff fix the
--   camper (Edit details: remove the extra) or withdraw them. 0 = nothing
--   to do. Above 0: fix those campers first (Claude can list them through
--   the connection), then paste 0027.
--
-- CONNECTOR-SAFE: a single read-only SELECT, without the words the
-- Supabase connection refuses. run.mjs checks this, and that it answers
-- 0 on a clean database and more than 0 with a planted broken row.
-- =====================================================================

with broken as (
  select r.id as row_id, c.id as camper_id, c.camp_id
    from public.camp_camper_extras r
    join public.camp_campers c on c.id = r.camper_id and c.status = 'active'
    join public.camp_extras e on e.id = r.extra_id
    left join public.camp_days rd on rd.id = r.day_id
   where (e.per = 'once' and r.day_id is not null)
      or (e.per = 'day' and r.day_id is null)
      or (e.per = 'day' and cardinality(e.only_on) > 0 and not (rd.day = any (e.only_on)))
      or (e.not_for_all_days
          and (e.per = 'once' or rd.day is not null)
          -- no camp day (of that week / of the camp) the camper misses
          and not exists (select 1 from public.camp_days d
                           where d.camp_id = c.camp_id
                             and (e.per = 'once'
                                  or date_trunc('week', d.day::timestamp) = date_trunc('week', rd.day::timestamp))
                             and not exists (select 1 from public.camp_camper_days cd
                                              where cd.camper_id = c.id and cd.day_id = d.id)))
)
select count(distinct b.camper_id)::integer as active_campers,
       count(distinct b.camp_id)::integer   as camps,
       count(*)::integer                    as extra_rows
  from broken as b;
