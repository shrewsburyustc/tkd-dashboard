-- =====================================================================
-- 0027_camps_edit_guard.sql
-- ---------------------------------------------------------------------
-- WHAT THIS FILE IS
--   A small migration for the Camps section (0013 + 0022, both live,
--   rulebook v0.720). It runs AFTER 0022 - it stops with a clear message
--   if 0022 is missing - and REPLACES exactly ONE function,
--   public.camp_update_camp (Edit camp, admins only), with the same name,
--   the same arguments and the same rights. Nothing else changes: no
--   table, no rule, no other function, no data.
--
-- WHY IT EXISTS
--   Before this file, Edit camp could save a change that left an ACTIVE
--   camper holding an extra the camp's rules no longer allow. The
--   camper's row stayed, but Edit details for that camper was then
--   refused until staff removed the extra by hand. Three ways it happened:
--     1. A day was removed that no active camper picked, so a camper now
--        came EVERY camp day of that Monday-Sunday week. A per-day
--        "not charged to all-days campers" extra (pizza) they had on a
--        day of that week was now "included" (rule R6 of 0022). For a
--        ONCE extra of that kind: the camper now came every day of the
--        whole camp.
--     2. "Not charged to all-days campers" was switched ON for an
--        existing extra while an active camper who comes the whole week
--        (per-day) or the whole camp (once) had it.
--     3. An existing extra's "per" changed (once <-> day) while an active
--        camper chose it. A once row has no day and a per-day row needs
--        one, so the camper's rows no longer fit the extra.
--   (Adding days is always safe: it can only make a week "not full".)
--
-- WHAT IT CHANGES
--   camp_update_camp gets two new refusals, checked after the existing
--   ones (removed day / removed extra / extra_day) and BEFORE anything is
--   written, so a refused save changes nothing:
--     A. {"status":"not_empty","kind":"extra_per","extra_name","count"}
--        a kept extra's "per" would change while active campers chose it
--     B. {"status":"not_empty","kind":"extra_included","extra_name","count"}
--        a kept extra that will be "not charged to all-days campers"
--        after the save, which an active camper has on a week (per-day)
--        or a camp (once) they would come every day of
--   "extra_name" is the extra's SAVED name; "count" = how many active
--   campers are affected. When several extras break, the first one in the
--   camp's extras order is named.
--   And one clean-up in the write part, as 0022 does for a removed day
--   ("withdrawn campers' rows first"): WITHDRAWN campers' rows of kept
--   extras that would no longer fit after the save are removed (logged
--   in the history under the save's batch), so Restore can never bring
--   back an active camper holding a broken extra:
--     (a) every row of an extra whose "per" changes
--     (b) rows of an extra that will be "not charged to all-days
--         campers" where the camper comes every camp day (the week of
--         that row / the whole camp), judged against the new days
--     (c) per-day rows on a day the extra's new only_on list no longer
--         offers (0022 refused that for active campers only and left the
--         withdrawn ones' rows behind)
--   Every other line of the function is 0022's, word for word (each new
--   line is marked "0027").
--   Rights, owner, "security definer", has_data_access() first, then
--   is_admin(), and search_path = '' stay exactly as before (re-stated
--   below). Nothing is granted to anon.
--
-- HOW TO RUN IT
--   After 0022. Supabase dashboard -> SQL Editor -> New query -> paste
--   this WHOLE file -> Run. One transaction ("begin;" ... "commit;"): if
--   any statement fails, nothing is kept. Supabase may warn about
--   destructive operations: the words are inside the function (copied
--   from 0022) and only run later, when an admin saves Edit camp - this
--   file itself removes nothing. Confirm.
--   Safe to run again (tested: the second run changes no fingerprint).
--   Undo: SETUP.md, "Migration 0027", 0027e - paste
--   supabase/manual/0027u_undo_camp_update_camp.sql, which puts back
--   0022's camp_update_camp (its section 20b) word for word.
-- =====================================================================

begin;


-- ---------------------------------------------------------------------
-- 1. The guard: this file needs 0022 (camps weekly pricing). Stops - and
--    changes nothing - if it is missing.
-- ---------------------------------------------------------------------
do $$
begin
  if to_regprocedure('public.camp_week_size(date[])') is null
     or to_regprocedure('public.camp_update_camp(uuid, integer, text, boolean, text, date[], time, time, date, date, date, '
                        || 'integer, integer, jsonb, jsonb, text, text)') is null then
    raise exception '0027 needs migration 0022 (camps weekly pricing) first';
  end if;
end
$$;


-- ---------------------------------------------------------------------
-- 2. The replaced function (0022's section 20b; only the lines marked
--    "0027" are new).
-- ---------------------------------------------------------------------

-- 20b. camp_update_camp(p_camp_id, p_expected_version, ...same as 20a...)   A
-- (0022's text; replaced by 0027, rulebook v0.720: two new refusals,
-- "per" and "included" below)
-- Edit camp. Held at / both schools may change (a correction); the link
-- code never changes. Compared with the saved camp:
--   days      added days must be today or later (kept past days are fine).
--             A removed day that an ACTIVE camper picked is refused:
--             {"status":"not_empty","kind":"day","day":"...","first_name",
--              "last_name","more": <how many other active campers>}
--             (v0.701). Otherwise the removed day's rows of WITHDRAWN
--             campers (their day row and per-day extra rows for that day)
--             are removed first (logged), then the day.
--   extras    with "id" = updated in place (name, price, per,
--             not_for_all_days, order); without = new. A removed extra
--             that an ACTIVE camper chose is refused:
--             {"status":"not_empty","kind":"extra","extra_name","count"};
--             otherwise withdrawn campers' rows for it go first, then it.
--   only_on   each extra's "only on these days" list (19e): dates of the
--             new days; a date of a day being removed is dropped from it;
--             a list whose days are ALL being removed is refused (as is
--             any other bad list): {"status":"invalid","field":"extras"}.
--             A list narrowed so that an ACTIVE camper's chosen day drops
--             out is refused: {"status":"not_empty","kind":"extra_day",
--             "extra_name","day","count"}
--   per       (0027) a kept extra whose "per" changes (once <-> day)
--             while ACTIVE campers chose it is refused:
--             {"status":"not_empty","kind":"extra_per","extra_name",
--              "count": <active campers who chose it>}
--   included  (0027) a kept extra that will be "not charged to all-days
--             campers" after the save is refused when an ACTIVE camper
--             has it and, judged against the NEW days, comes every camp
--             day of that row's Monday-Sunday week (per-day extra) or of
--             the whole camp (once extra) - it would be included (R6),
--             e.g. after removing a day or switching the box on:
--             {"status":"not_empty","kind":"extra_included","extra_name",
--              "count": <active campers affected>}
--             Both: extra_name = the SAVED name, the first such extra in
--             the camp's order; checked before anything is written.
--   grid      replaced (one row per day count 1 ... the new W - 0022,
--             R2: the most of the new days in one Monday-Sunday week).
-- (0027) Withdrawn campers' rows that would no longer fit a kept extra
-- are removed (logged), as for a removed day, so that Restore can never
-- bring back an active camper with a broken extra: every row of an extra
-- whose "per" changes; a "not for all-days campers" extra's rows where,
-- judged against the new days, the camper comes every camp day (of that
-- row's week / of the camp); a per-day extra's rows on a day its new
-- only_on list no longer offers.
-- Existing campers' prices are NEVER changed (snapshots). Saving with
-- nothing changed writes nothing; a change to only days, extras or prices
-- still bumps the camp's version.
-- Ok: {"status":"ok","version":n}
create or replace function public.camp_update_camp(
  p_camp_id          uuid,
  p_expected_version integer,
  p_location_code    text,
  p_both_schools     boolean,
  p_name             text,
  p_days             date[],
  p_start_time       time,
  p_end_time         time,
  p_signup_opens_on  date,
  p_signup_closes_on date,
  p_early_until      date,
  p_min_age          integer,
  p_max_age          integer,
  p_prices           jsonb,
  p_extras           jsonb,
  p_description      text,
  p_waiver_text      text
)
returns jsonb
language plpgsql
volatile
security definer
set search_path = ''
as $$
declare
  v_c            public.camps;
  v_today        date;
  v_removed_days uuid[];
  v_removed_ex   uuid[];
  v_kept_ids     uuid[];
  v_day          record;
  v_extra        record;
  v_first        text;
  v_last         text;
  v_day_date     date;
  v_n            integer;
  v_changed      boolean := false;
  v_version      integer;
begin
  begin
    if public.has_data_access() is not true then
      return jsonb_build_object('status', 'no_access');
    end if;
    if public.is_admin() is not true then
      return jsonb_build_object('status', 'not_allowed');
    end if;

    if p_camp_id is null or p_expected_version is null
       or not public.camp_setup_args_are_valid(p_location_code, p_both_schools, p_name, p_days, p_start_time, p_end_time,
                                               p_signup_opens_on, p_signup_closes_on, p_early_until, p_min_age, p_max_age,
                                               p_prices, p_extras, true, p_description, p_waiver_text) then
      return jsonb_build_object('status', 'invalid');
    end if;
    v_today := public.testing_today();

    -- lock the camp ("for update": it is the row being changed)
    select * into v_c from public.camps c where c.id = p_camp_id for update;
    if not found then
      return jsonb_build_object('status', 'not_found');
    end if;
    if v_c.version <> p_expected_version then
      return jsonb_build_object('status', 'stale');
    end if;

    -- rules that depend on the saved camp
    if exists (select 1 from unnest(p_days) as x(d)
                where x.d < v_today
                  and not exists (select 1 from public.camp_days d where d.camp_id = p_camp_id and d.day = x.d)) then
      return jsonb_build_object('status', 'invalid');   -- a NEW day in the past
    end if;
    v_kept_ids := array(select (x.value ->> 'id')::uuid
                          from jsonb_array_elements(p_extras) as x(value)
                         where jsonb_typeof(x.value -> 'id') = 'string');
    if (select count(*) from public.camp_extras e where e.camp_id = p_camp_id and e.id = any (v_kept_ids))
       <> cardinality(v_kept_ids) then
      return jsonb_build_object('status', 'invalid');   -- an "id" that isn't one of this camp's extras
    end if;
    -- the extras' "only on these days" lists, against the new days (the
    -- days being removed are allowed in them and dropped)
    if not public.camp_extras_only_on_ok(p_extras, p_days,
                                         array(select d.day from public.camp_days d
                                                where d.camp_id = p_camp_id and not (d.day = any (p_days)))) then
      return jsonb_build_object('status', 'invalid', 'field', 'extras');
    end if;

    v_removed_days := array(select d.id from public.camp_days d
                             where d.camp_id = p_camp_id and not (d.day = any (p_days))
                             order by d.day);
    v_removed_ex := array(select e.id from public.camp_extras e
                           where e.camp_id = p_camp_id and not (e.id = any (v_kept_ids))
                           order by e.sort);

    -- a removed day or extra an ACTIVE camper picked: refused (v0.701)
    for v_day in select d.id, d.day from public.camp_days d where d.id = any (v_removed_days) order by d.day loop
      select count(*) into v_n
        from public.camp_camper_days cd join public.camp_campers c on c.id = cd.camper_id
       where cd.day_id = v_day.id and c.status = 'active';
      if v_n > 0 then
        select c.first_name, c.last_name into v_first, v_last
          from public.camp_camper_days cd join public.camp_campers c on c.id = cd.camper_id
         where cd.day_id = v_day.id and c.status = 'active'
         order by c.last_name, c.first_name, c.id
         limit 1;
        return jsonb_build_object('status', 'not_empty', 'kind', 'day', 'day', v_day.day,
                                  'first_name', v_first, 'last_name', v_last, 'more', v_n - 1);
      end if;
    end loop;
    for v_extra in select e.id, e.name from public.camp_extras e where e.id = any (v_removed_ex) order by e.sort loop
      select count(distinct c.id) into v_n
        from public.camp_camper_extras x join public.camp_campers c on c.id = x.camper_id
       where x.extra_id = v_extra.id and c.status = 'active';
      if v_n > 0 then
        return jsonb_build_object('status', 'not_empty', 'kind', 'extra', 'extra_name', v_extra.name, 'count', v_n);
      end if;
    end loop;
    -- a kept extra offered on fewer days than before (its only_on list
    -- narrowed): refused when an ACTIVE camper chose it on a day it would
    -- no longer be offered on - the same idea as a picked camp day (v0.701):
    -- {"status":"not_empty","kind":"extra_day","extra_name","day","count"}
    -- (count = active campers who chose it on that day; the earliest such
    -- day is named)
    for v_extra in select e.id, e.name, public.camp_only_on_dates(x.value -> 'only_on', p_days) as new_on
                     from jsonb_array_elements(p_extras) as x(value)
                     join public.camp_extras e on e.id = (x.value ->> 'id')::uuid
                    where jsonb_typeof(x.value -> 'id') = 'string' and e.camp_id = p_camp_id
                    order by e.sort loop
      continue when cardinality(v_extra.new_on) = 0;
      select d.day, count(distinct c.id) into v_day_date, v_n
        from public.camp_camper_extras x
        join public.camp_campers c on c.id = x.camper_id
        join public.camp_days d on d.id = x.day_id
       where x.extra_id = v_extra.id and c.status = 'active' and not (d.day = any (v_extra.new_on))
       group by d.day
       order by d.day
       limit 1;
      if found then
        return jsonb_build_object('status', 'not_empty', 'kind', 'extra_day', 'extra_name', v_extra.name,
                                  'day', v_day_date, 'count', v_n);
      end if;
    end loop;

    -- 0027 A. a kept extra whose "per" changes (once <-> day) while an
    -- ACTIVE camper chose it: refused. A once row has no day and a per-day
    -- row needs one, so the camper's rows would no longer fit the extra.
    -- {"status":"not_empty","kind":"extra_per","extra_name","count"}
    for v_extra in select e.id, e.name                                                      -- 0027
                     from jsonb_array_elements(p_extras) as x(value)                        -- 0027
                     join public.camp_extras e on e.id = (x.value ->> 'id')::uuid           -- 0027
                    where jsonb_typeof(x.value -> 'id') = 'string' and e.camp_id = p_camp_id -- 0027
                      and e.per is distinct from x.value ->> 'per'                          -- 0027
                    order by e.sort loop                                                    -- 0027
      select count(distinct c.id) into v_n                                                  -- 0027
        from public.camp_camper_extras x join public.camp_campers c on c.id = x.camper_id   -- 0027
       where x.extra_id = v_extra.id and c.status = 'active';                               -- 0027
      if v_n > 0 then                                                                       -- 0027
        return jsonb_build_object('status', 'not_empty', 'kind', 'extra_per', 'extra_name', v_extra.name, -- 0027
                                  'count', v_n);                                            -- 0027
      end if;                                                                               -- 0027
    end loop;                                                                               -- 0027
    -- 0027 B. a kept extra that will be "not charged to all-days campers"
    -- after the save (the box as SENT, so switching it on counts), which
    -- an ACTIVE camper has where - judged against the NEW day list p_days -
    -- the camper comes every camp day:
    --   per-day extra: every new day in the same Monday-Sunday week as
    --                  that row's day is one of the camper's days
    --   once extra:    every new day is one of the camper's days
    -- Then the extra would be "included" (R6) and the camper's row would
    -- break Edit details: refused.
    -- {"status":"not_empty","kind":"extra_included","extra_name","count"}
    -- (A ran first, so "per" is unchanged for every extra with active
    -- rows; the saved e.per is the one that counts. The camper's days are
    -- compared by DATE because p_days is a list of dates. An active
    -- camper's days are all in p_days - a removed day with active campers
    -- was refused above.)
    for v_extra in select e.id, e.name, e.per                                               -- 0027
                     from jsonb_array_elements(p_extras) as x(value)                        -- 0027
                     join public.camp_extras e on e.id = (x.value ->> 'id')::uuid           -- 0027
                    where jsonb_typeof(x.value -> 'id') = 'string' and e.camp_id = p_camp_id -- 0027
                      and (x.value ->> 'not_for_all_days')::boolean                         -- 0027
                    order by e.sort loop                                                    -- 0027
      select count(distinct c.id) into v_n                                                  -- 0027
        from public.camp_camper_extras x                                                    -- 0027
        join public.camp_campers c on c.id = x.camper_id                                    -- 0027
        left join public.camp_days xd on xd.id = x.day_id                                   -- 0027
       where x.extra_id = v_extra.id and c.status = 'active'                                -- 0027
         and (v_extra.per = 'once' or xd.day is not null)                                   -- 0027
         -- no new day (of that week / of the camp) that the camper does NOT come on
         and not exists (select 1 from unnest(p_days) as nd(d)                              -- 0027
                          where (v_extra.per = 'once'                                       -- 0027
                                 or date_trunc('week', nd.d::timestamp) = date_trunc('week', xd.day::timestamp)) -- 0027
                            and not exists (select 1 from public.camp_camper_days cd        -- 0027
                                              join public.camp_days d on d.id = cd.day_id   -- 0027
                                             where cd.camper_id = c.id and d.day = nd.d));  -- 0027
      if v_n > 0 then                                                                       -- 0027
        return jsonb_build_object('status', 'not_empty', 'kind', 'extra_included', 'extra_name', v_extra.name, -- 0027
                                  'count', v_n);                                            -- 0027
      end if;                                                                               -- 0027
    end loop;                                                                               -- 0027

    -- write
    perform set_config('tkd.action', 'camp_update_camp', true);
    perform set_config('tkd.batch_id', gen_random_uuid()::text, true);

    -- removed extras: withdrawn campers' rows first, then the extra
    if cardinality(v_removed_ex) > 0 then
      delete from public.camp_camper_extras x where x.extra_id = any (v_removed_ex);
      delete from public.camp_extras e where e.id = any (v_removed_ex);
      v_changed := true;
    end if;

    -- removed days: withdrawn campers' extra rows and day rows first, then the day
    if cardinality(v_removed_days) > 0 then
      delete from public.camp_camper_extras x where x.day_id = any (v_removed_days);
      delete from public.camp_camper_days cd where cd.day_id = any (v_removed_days);
      delete from public.camp_days d where d.id = any (v_removed_days);
      v_changed := true;
    end if;

    -- 0027: withdrawn campers' rows of KEPT extras that would no longer
    -- fit after this save go first (logged, like the removed days above),
    -- so Restore (camp_restore_camper) can never bring back an active
    -- camper holding a broken extra. Active campers never get here: their
    -- cases were refused above (extra_per / extra_included / extra_day).
    -- Removed when ANY of these is true:
    --   (a) the extra's "per" changes (once <-> day): every row of it
    --   (c) a per-day row on a day the extra's new only_on list (when it
    --       has one) no longer offers - 0022 refused this only for active
    --       campers and never cleaned up withdrawn ones
    --   (b) the extra will be "not charged to all-days campers" and,
    --       against the NEW days, the camper comes every camp day of that
    --       row's Monday-Sunday week (per-day) or of the whole camp (once)
    --       - the same test as check B above
    delete from public.camp_camper_extras r                                                 -- 0027
     using public.camp_campers c, public.camp_extras e, jsonb_array_elements(p_extras) as x(value) -- 0027
     where c.id = r.camper_id and c.status <> 'active'                                      -- 0027
       and e.id = r.extra_id and e.camp_id = p_camp_id                                      -- 0027
       and jsonb_typeof(x.value -> 'id') = 'string' and e.id = (x.value ->> 'id')::uuid     -- 0027
       and (e.per is distinct from x.value ->> 'per'                                        -- 0027 (a)
            or (r.day_id is not null                                                        -- 0027 (c)
                and cardinality(public.camp_only_on_dates(x.value -> 'only_on', p_days)) > 0 -- 0027 (c)
                and not exists (select 1 from public.camp_days d                            -- 0027 (c)
                                 where d.id = r.day_id                                      -- 0027 (c)
                                   and d.day = any (public.camp_only_on_dates(x.value -> 'only_on', p_days)))) -- 0027 (c)
            or ((x.value ->> 'not_for_all_days')::boolean                                   -- 0027 (b)
                and (e.per = 'once' or r.day_id is not null)                                -- 0027 (b)
                and not exists (select 1 from unnest(p_days) as nd(d)                       -- 0027 (b)
                                 where (e.per = 'once'                                      -- 0027 (b)
                                        or date_trunc('week', nd.d::timestamp)              -- 0027 (b)
                                           = (select date_trunc('week', rd.day::timestamp)  -- 0027 (b)
                                                from public.camp_days rd where rd.id = r.day_id)) -- 0027 (b)
                                   and not exists (select 1 from public.camp_camper_days cd -- 0027 (b)
                                                     join public.camp_days d on d.id = cd.day_id -- 0027 (b)
                                                    where cd.camper_id = c.id and d.day = nd.d)))); -- 0027 (b)
    get diagnostics v_n = row_count;                                                        -- 0027
    if v_n > 0 then v_changed := true; end if;                                              -- 0027

    -- added days
    insert into public.camp_days (camp_id, day)
    select p_camp_id, x.d from unnest(p_days) as x(d)
     where not exists (select 1 from public.camp_days d where d.camp_id = p_camp_id and d.day = x.d)
     order by x.d;
    get diagnostics v_n = row_count;
    if v_n > 0 then v_changed := true; end if;

    -- kept extras: updated in place where something differs
    update public.camp_extras e
       set name             = public.testing_normalize_name(x.value ->> 'name'),
           price_cents      = (x.value ->> 'price_cents')::integer,
           per              = x.value ->> 'per',
           not_for_all_days = (x.value ->> 'not_for_all_days')::boolean,
           only_on          = public.camp_only_on_dates(x.value -> 'only_on', p_days),
           sort             = (x.n - 1)::smallint
      from jsonb_array_elements(p_extras) with ordinality as x(value, n)
     where jsonb_typeof(x.value -> 'id') = 'string'
       and e.id = (x.value ->> 'id')::uuid
       and (e.name is distinct from public.testing_normalize_name(x.value ->> 'name')
            or e.price_cents is distinct from (x.value ->> 'price_cents')::integer
            or e.per is distinct from x.value ->> 'per'
            or e.not_for_all_days is distinct from (x.value ->> 'not_for_all_days')::boolean
            or e.only_on is distinct from public.camp_only_on_dates(x.value -> 'only_on', p_days)
            or e.sort is distinct from (x.n - 1)::smallint);
    get diagnostics v_n = row_count;
    if v_n > 0 then v_changed := true; end if;

    -- new extras
    insert into public.camp_extras (camp_id, name, price_cents, per, not_for_all_days, only_on, sort)
    select p_camp_id, public.testing_normalize_name(x.value ->> 'name'), (x.value ->> 'price_cents')::integer,
           x.value ->> 'per', (x.value ->> 'not_for_all_days')::boolean,
           public.camp_only_on_dates(x.value -> 'only_on', p_days), (x.n - 1)::smallint
      from jsonb_array_elements(p_extras) with ordinality as x(value, n)
     where jsonb_typeof(x.value -> 'id') is distinct from 'string'
     order by x.n;
    get diagnostics v_n = row_count;
    if v_n > 0 then v_changed := true; end if;

    -- the grid: rows for day counts beyond the new W go (0022: was the
    -- new number of days),
    -- rows that differ are updated, missing rows are added
    delete from public.camp_prices p where p.camp_id = p_camp_id and p.day_count > public.camp_week_size(p_days);
    get diagnostics v_n = row_count;
    if v_n > 0 then v_changed := true; end if;
    update public.camp_prices p
       set member_early_cents      = (x.value ->> 'member_early_cents')::integer,
           member_regular_cents    = (x.value ->> 'member_regular_cents')::integer,
           nonmember_early_cents   = (x.value ->> 'nonmember_early_cents')::integer,
           nonmember_regular_cents = (x.value ->> 'nonmember_regular_cents')::integer
      from jsonb_array_elements(p_prices) as x(value)
     where p.camp_id = p_camp_id
       and p.day_count = (x.value ->> 'day_count')::integer
       and (p.member_early_cents is distinct from (x.value ->> 'member_early_cents')::integer
            or p.member_regular_cents is distinct from (x.value ->> 'member_regular_cents')::integer
            or p.nonmember_early_cents is distinct from (x.value ->> 'nonmember_early_cents')::integer
            or p.nonmember_regular_cents is distinct from (x.value ->> 'nonmember_regular_cents')::integer);
    get diagnostics v_n = row_count;
    if v_n > 0 then v_changed := true; end if;
    insert into public.camp_prices
      (camp_id, day_count, member_early_cents, member_regular_cents, nonmember_early_cents, nonmember_regular_cents)
    select p_camp_id, (x.value ->> 'day_count')::smallint,
           (x.value ->> 'member_early_cents')::integer, (x.value ->> 'member_regular_cents')::integer,
           (x.value ->> 'nonmember_early_cents')::integer, (x.value ->> 'nonmember_regular_cents')::integer
      from jsonb_array_elements(p_prices) as x(value)
     where not exists (select 1 from public.camp_prices p
                        where p.camp_id = p_camp_id and p.day_count = (x.value ->> 'day_count')::integer)
     order by (x.value ->> 'day_count')::integer;
    get diagnostics v_n = row_count;
    if v_n > 0 then v_changed := true; end if;

    -- the camp row: new values, plus a version bump if only its parts changed
    update public.camps c
       set location_code    = p_location_code,
           both_schools     = p_both_schools,
           name             = public.testing_normalize_name(p_name),
           start_time       = p_start_time,
           end_time         = p_end_time,
           signup_opens_on  = p_signup_opens_on,
           signup_closes_on = p_signup_closes_on,
           early_until      = p_early_until,
           min_age          = p_min_age,
           max_age          = p_max_age,
           description      = public.testing_normalize_note(p_description),
           waiver_text      = public.testing_normalize_note(p_waiver_text),
           version          = case when v_changed then c.version + 1 else c.version end
     where c.id = p_camp_id
       and (v_changed
            or c.location_code is distinct from p_location_code
            or c.both_schools is distinct from p_both_schools
            or c.name is distinct from public.testing_normalize_name(p_name)
            or c.start_time is distinct from p_start_time
            or c.end_time is distinct from p_end_time
            or c.signup_opens_on is distinct from p_signup_opens_on
            or c.signup_closes_on is distinct from p_signup_closes_on
            or c.early_until is distinct from p_early_until
            or c.min_age is distinct from p_min_age
            or c.max_age is distinct from p_max_age
            or c.description is distinct from public.testing_normalize_note(p_description)
            or c.waiver_text is distinct from public.testing_normalize_note(p_waiver_text))
    returning c.version into v_version;

    perform set_config('tkd.action', '', true);
    perform set_config('tkd.batch_id', '', true);

    return jsonb_build_object('status', 'ok', 'version', coalesce(v_version, v_c.version));
  exception
    when unique_violation then
      return jsonb_build_object('status', 'stale');
    when foreign_key_violation or check_violation or not_null_violation or data_exception then
      return jsonb_build_object('status', 'invalid');
    when deadlock_detected or serialization_failure or lock_not_available then
      return jsonb_build_object('status', 'stale');
  end;
end;
$$;

revoke execute on function public.camp_update_camp(uuid, integer, text, boolean, text, date[], time, time, date, date, date,
  integer, integer, jsonb, jsonb, text, text) from public, anon, authenticated, service_role;
grant  execute on function public.camp_update_camp(uuid, integer, text, boolean, text, date[], time, time, date, date, date,
  integer, integer, jsonb, jsonb, text, text) to authenticated;


commit;

-- End of 0027_camps_edit_guard.sql
