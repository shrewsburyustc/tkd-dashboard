-- =====================================================================
-- 0027u_undo_camp_update_camp.sql   (UNDO of migration 0027)
-- ---------------------------------------------------------------------
-- WHAT THIS FILE IS
--   Puts back 0022's exact version of the one function 0027 replaced,
--   public.camp_update_camp (Edit camp), copied word for word from
--   0022_camps_weekly_pricing.sql section 20b with its exact revoke and
--   grant. Edit camp then no longer refuses the "extra_per" and
--   "extra_included" cases and no longer removes withdrawn campers'
--   rows that stop fitting (it behaves as before 0027).
--
-- WHY A SEPARATE FILE
--   Re-running the whole 0022 file would also put 0022's version back,
--   but it re-runs 0022's other 17 functions, rules and data tidy-up too.
--   This touches only the one function 0027 replaced. Paste it ONLY with
--   Jeffrey's OK (supabase/SETUP.md, Migration 0027, 0027e).
--
-- AFTERWARDS
--   0027_fingerprints.sql's camp_update_camp line must equal the one
--   written down BEFORE 0027 was applied (SETUP 0027a), and 0022's
--   fingerprints must match 0022c's record again. Tested in PGlite
--   (run.mjs step0027). To redo: paste 0027 again. One transaction: on
--   any error nothing is kept.
-- =====================================================================

begin;

-- 20b. camp_update_camp(p_camp_id, p_expected_version, ...same as 20a...)   A
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
--   grid      replaced (one row per day count 1 ... the new W - 0022,
--             R2: the most of the new days in one Monday-Sunday week).
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

-- End of 0027u_undo_camp_update_camp.sql
