-- =====================================================================
-- 0022_camps_weekly_pricing.sql
-- ---------------------------------------------------------------------
-- WHAT THIS FILE IS
--   A migration for the Camps section (0013, live): camps are priced PER
--   WEEK and may be longer (rulebook v0.717, spec
--   docs/Camps/TKD-Camps-Weekly-Pricing.md, rules R1-R8). It runs AFTER
--   0013 and 0017 (both live) - it stops with a clear message if 0013 is
--   missing - and only REPLACES the 0013 functions that encode the old
--   rules (same names, same arguments, same rights), adds four small
--   helpers, changes five table rules, and tidies the existing price
--   grids and templates to the new rule (section 6). It does NOT touch
--   0017's (or 0018's) Finance functions.
--
-- WHY IT EXISTS
--   Jeffrey, after the CP6 phone test: "We charge max per week ... the
--   most days should be 5 days for pricing. If it's 2 weeks, then it will
--   charge them for 2 weeks" and "The camp is limited to only 10 days"
--   (it shouldn't be). Before this file a child coming 10 days paid the
--   grid's "10 days" row, and a camp could have at most 10 days.
--
-- THE NEW RULES (the spec's numbers)
--   R1 a WEEK is Monday-Sunday. In SQL: date_trunc('week', day) - the
--      Monday of that day's week. (The app's campWeeks() does the same.)
--   R2 W = the most camp days in any one week of the camp (1-7). The price
--      grid has exactly the rows 1 ... W. Thanksgiving Wed + Fri -> W = 2;
--      two Mon-Fri weeks -> W = 5.
--   R3 a camper's base price = for EACH week they come, the grid row for
--      the number of days they come THAT week, added up (same early /
--      regular and member box for every week). 5 + 3 days = row 5 + row 3;
--      2 + 2 days = two times row 2. Still stored once, as a snapshot, in
--      camp_campers.base_cents.
--   R4 a camp has 1 to 60 days (was 10). Extras per camp and per child
--      stay at most 10; children per sign-up stay 1-3.
--   R5 one camper may cost up to $10,000 (1,000,000 cents; was $2,000) -
--      base price, camper total, a payment (a reversal down to -$10,000),
--      Edit payment, and Finance's snapshot of a closed day.
--   R6 "Not charged to all-days campers" (e.g. pizza) is PER WEEK for a
--      per-day extra: it can't be chosen on a day in a week where the
--      camper comes EVERY camp day of that week (it is included that
--      week). A once extra keeps the whole-camp meaning.
--   R7 a template's day_count now means "days in a week" (the grid's
--      rows, 1-7); Save as template stores W.
--   R8 nothing else changes (early / regular, member, price_changed /
--      camp_changed, check-in, Mark paid, existing campers' prices).
--
-- WHAT IT CHANGES
--   1. a guard: 0013 must be there
--   2. four NEW internal helpers (nobody in the app can call them):
--        camp_week_size(days)            W of a list of dates
--        camp_weekly_base_cents(...)     R3's price for a list of day ids
--        camp_comes_whole_week(...)      R6: every camp day of that week?
--        camp_weeks_breakdown(...)       the "Week of ..." lines (jsonb)
--   3. REPLACED rule helpers (create or replace, same arguments):
--        camp_days_arg_is_valid          1-60 days (was 10)
--        camp_prices_arg_is_valid        a grid of 1-7 rows (was 10)
--        camp_dates_are_sorted_set       an only_on list of up to 60 dates
--        camp_camper_extras_arg_is_valid a per-day extra on up to 60 days
--        camp_children_arg_is_valid      a child on 1-60 days
--        camp_template_setup_is_valid    a template of 1-7 days a week
--        camp_setup_args_are_valid       the grid is 1 ... W (was 1 ... days)
--        camp_camper_extras_are_ok       R6 per week
--        camp_extras_only_on_ok          only_on lists of up to 60 dates
--        camp_camper_extras_before_write the table's own R6 check (trigger)
--   4. REPLACED answers (old keys kept, one key ADDED):
--        camp_public_signup_answer       each child: "weeks"
--        camp_camper_detail              breakdown: "weeks"
--   5. REPLACED staff / form functions:
--        camp_update_camp        keeps grid rows 1 ... W (was 1 ... days)
--        camp_save_template      day_count = W, the grid's rows 1 ... W
--        camp_update_template    1-7 days a week
--        camp_update_details     1-60 days, weekly price, up to $10,000
--        camp_edit_payment       up to $10,000
--        camp_public_signup_core weekly price, up to $10,000 a child
--   6. the existing data, once (logged in the history as "Migration 0022"):
--        * price grid rows above a camp's W are removed and that camp's
--          version goes up (live: camp "Test 2" - 10 days in 3 weeks,
--          W = 5 - loses its rows 6-10; a camp of one week keeps all)
--        * a template with day_count over 7 (the old "days of the camp")
--          becomes 7 days a week with its grid rows 1-7
--        * campers' prices are NOT changed (snapshots, R8)
--   7. table rules (drop constraint if exists + add = replace):
--        camp_prices.day_count 1-7, camp_templates.day_count 1-7 (and its
--        set-up rule checked again on every row), camp_campers.base_cents
--        0-1,000,000, camp_payments amount 1-1,000,000 (reversal
--        -1,000,000 ... -1), finance_day_closing_items amount
--        -1,000,000 ... 1,000,000 (Finance's copy of a closed day's
--        payments - only widened; 0017's Finance functions are untouched)
--   Rights, owners, "security definer", has_data_access() first and
--   search_path = '' stay exactly as 0013 set them (re-stated below). The
--   family form's login camps_registrar can still run ONLY
--   camp_public_camp and camp_public_signup; nothing is granted to anon.
--
-- HOW TO RUN IT
--   After 0013 and 0017. Supabase dashboard -> SQL Editor -> New query ->
--   paste this WHOLE file -> Run. One transaction ("begin;" ... "commit;"):
--   if any statement fails, nothing is kept. Supabase will warn about
--   destructive operations: the words are in "drop constraint if exists"
--   lines (each rule is added again at once), inside functions that run
--   later (copied from 0013), and in section 6, which removes the grid
--   rows above each camp's W (see above). Confirm.
--   Safe to run again (tested: the second run changes no row and no
--   fingerprint). Undo: SETUP.md, "Migration 0022", 0022e.
-- =====================================================================

begin;


-- ---------------------------------------------------------------------
-- 1. The guard: this file needs Camps (0013). Stops - and changes
--    nothing - if it is missing.
-- ---------------------------------------------------------------------
do $$
begin
  if to_regclass('public.camp_prices') is null
     or to_regprocedure('public.camp_base_cents(uuid, integer, boolean, text)') is null then
    raise exception '0022 needs migration 0013 (Camps) first';
  end if;
end
$$;


-- ---------------------------------------------------------------------
-- 2. New internal helpers (nobody in the app can call them). None of
--    them ever raises an error.
-- ---------------------------------------------------------------------

-- 2a. camp_week_size(p_days) - R2's W: the most dates of p_days that fall
-- in one Monday-Sunday week. 0 for an empty list.
-- "date_trunc('week', x)" gives the Monday (00:00) of x's week; the date
-- is turned into a plain timestamp first (d::timestamp) so the answer
-- never depends on a time zone.
create or replace function public.camp_week_size(p_days date[])
returns integer
language sql
immutable
set search_path = ''
as $$
  select coalesce(max(w.n), 0)::integer
    from (select count(distinct x.d) as n
            from unnest(p_days) as x(d)
           where x.d is not null
           group by date_trunc('week', x.d::timestamp)) as w;
$$;

revoke execute on function public.camp_week_size(date[]) from public, anon, authenticated, service_role;

-- 2b. camp_weekly_base_cents(camp, day_ids, member, price_kind) - R3: the
-- camper's base price. The chosen days are grouped by week; each week
-- costs the grid row for its number of days (0013's camp_base_cents: the
-- member / early-regular cell); the weeks are added up.
-- NULL (the callers answer invalid) when: no days, a day id that isn't
-- one of this camp's days, or a week whose row is missing from the grid.
create or replace function public.camp_weekly_base_cents(p_camp_id uuid, p_day_ids uuid[], p_member boolean,
                                                         p_price_kind text)
returns integer
language sql
stable
set search_path = ''
as $$
  select case
           when count(*) = 0 or bool_or(w.cents is null) then null
           when sum(w.n) <> (select count(distinct x.id) from unnest(p_day_ids) as x(id)) then null
           else sum(w.cents)::integer
         end
    from (select count(*)::integer as n,
                 public.camp_base_cents(p_camp_id, count(*)::integer, p_member, p_price_kind) as cents
            from public.camp_days d
           where d.camp_id = p_camp_id and d.id = any (p_day_ids)
           group by date_trunc('week', d.day::timestamp)) as w;
$$;

revoke execute on function public.camp_weekly_base_cents(uuid, uuid[], boolean, text) from public, anon, authenticated, service_role;

-- 2c. camp_comes_whole_week(camp, day_ids, day_id) - R6: true when the
-- camper's days (p_day_ids) include EVERY camp day of the week p_day_id
-- lies in (that week the camper is an "all-days camper", so a
-- not-for-all-days extra - e.g. pizza - is included and can't be bought).
-- false for a day that isn't one of this camp's days.
create or replace function public.camp_comes_whole_week(p_camp_id uuid, p_day_ids uuid[], p_day_id uuid)
returns boolean
language sql
stable
set search_path = ''
as $$
  select coalesce(
           exists (select 1 from public.camp_days x where x.id = p_day_id and x.camp_id = p_camp_id)
           and not exists (select 1
                             from public.camp_days x
                             join public.camp_days d
                               on d.camp_id = x.camp_id
                              and date_trunc('week', d.day::timestamp) = date_trunc('week', x.day::timestamp)
                            where x.id = p_day_id and x.camp_id = p_camp_id
                              and not (d.id = any (coalesce(p_day_ids, '{}'::uuid[])))),
           false);
$$;

revoke execute on function public.camp_comes_whole_week(uuid, uuid[], uuid) from public, anon, authenticated, service_role;

-- 2d. camp_weeks_breakdown(camp, day_ids, member, price_kind) - the
-- "Week of ..." lines for the app (the family form's "You're signed up",
-- Camper detail): one object per week the camper comes, earliest first:
--   {"monday": "2027-07-05", "day_count": 5, "cents": 27500}
-- "cents" is the camp's grid row for that week's day_count (its CURRENT
-- prices) at the sign-up's early / regular and the camper's member box;
-- null if that row is missing. (If an admin edited the grid after the
-- sign-up, the lines show the new prices while base_cents keeps the
-- snapshot - the app decides how to show that.)
create or replace function public.camp_weeks_breakdown(p_camp_id uuid, p_day_ids uuid[], p_member boolean,
                                                       p_price_kind text)
returns jsonb
language sql
stable
set search_path = ''
as $$
  with w as (
    select date_trunc('week', d.day::timestamp)::date as monday,
           count(*)::integer as n
      from public.camp_days d
     where d.camp_id = p_camp_id and d.id = any (p_day_ids)
     group by 1
  )
  select coalesce(jsonb_agg(jsonb_build_object('monday', w.monday, 'day_count', w.n,
                                               'cents', public.camp_base_cents(p_camp_id, w.n, p_member, p_price_kind))
                            order by w.monday), '[]'::jsonb)
    from w;
$$;

revoke execute on function public.camp_weeks_breakdown(uuid, uuid[], boolean, text) from public, anon, authenticated, service_role;


-- ---------------------------------------------------------------------
-- 3. Replaced rule helpers and the camper-extras trigger function
--    (0013's text and numbering; only the lines of the new rules
--    changed, each marked "0022")
-- ---------------------------------------------------------------------

-- 1b. camp_days_arg_is_valid(p_days) - the list of camp days the Add /
-- Edit camp dialog sends: a plain one-dimensional list of 1 to 60 dates
-- (0022, R4: was 10), no empty entry, no date twice.
create or replace function public.camp_days_arg_is_valid(p_days date[])
returns boolean
language sql
immutable
set search_path = ''
as $$
  select coalesce(
           p_days is not null
           and array_ndims(p_days) = 1
           and cardinality(p_days) between 1 and 60   -- 0022: was 10
           and not exists (select 1 from unnest(p_days) as x(d) where x.d is null)
           and (select count(distinct x.d) from unnest(p_days) as x(d)) = cardinality(p_days),
         false);
$$;

revoke execute on function public.camp_days_arg_is_valid(date[]) from public, anon, authenticated, service_role;

-- 1f. camp_prices_arg_is_valid(p_prices, p_day_count) - the price grid:
--   [{"day_count": 1, "member_early_cents": 7500, "member_regular_cents": 8000,
--     "nonmember_early_cents": 8500, "nonmember_regular_cents": 9000}, ...]
-- exactly one object for each day count 1 ... p_day_count (any order;
-- 0022: p_day_count is the number of days in a WEEK, 1-7 - was 1-10),
-- only these 5 keys, whole numbers, each price $0 to $1,000 in whole
-- dollars (0003's testing_cents_is_valid).
create or replace function public.camp_prices_arg_is_valid(p_prices jsonb, p_day_count integer)
returns boolean
language plpgsql
immutable
set search_path = ''
as $$
declare
  v_item   jsonb;
  v_counts integer[] := '{}';
  v_n      integer;
  v_key    text;
begin
  if p_prices is null or p_day_count is null or p_day_count not between 1 and 7   -- 0022: was 10
     or jsonb_typeof(p_prices) <> 'array'
     or jsonb_array_length(p_prices) <> p_day_count then
    return false;
  end if;
  for v_item in select x.value from jsonb_array_elements(p_prices) as x(value) loop
    if jsonb_typeof(v_item) <> 'object'
       or (select count(*) from jsonb_object_keys(v_item)) <> 5
       or not public.camp_int_text_is_valid(v_item -> 'day_count', 1, p_day_count) then
      return false;
    end if;
    foreach v_key in array array['member_early_cents', 'member_regular_cents',
                                 'nonmember_early_cents', 'nonmember_regular_cents'] loop
      if not public.camp_int_text_is_valid(v_item -> v_key, 0, 100000) then
        return false;
      end if;
      -- (converted only after the test above passed)
      if not public.testing_cents_is_valid((v_item ->> v_key)::integer) then
        return false;
      end if;
    end loop;
    v_n := (v_item ->> 'day_count')::integer;
    if v_n = any (v_counts) then
      return false;   -- the same day count twice
    end if;
    v_counts := v_counts || v_n;
  end loop;
  return true;   -- p_day_count objects, all different, all 1..p_day_count
end;
$$;

revoke execute on function public.camp_prices_arg_is_valid(jsonb, integer) from public, anon, authenticated, service_role;

-- 1g2. camp_dates_are_sorted_set(p_dates) - a camp extra's only_on list
-- as stored: at most 60 dates (0022: was 10), no empty entry, each date only once, in
-- date order. (The rule that each date is one of the camp's days needs
-- the days table, so the trigger in section 13 checks that.)
create or replace function public.camp_dates_are_sorted_set(p_dates date[])
returns boolean
language sql
immutable
set search_path = ''
as $$
  select coalesce(
           p_dates is not null
           and coalesce(array_ndims(p_dates), 1) = 1
           and cardinality(p_dates) <= 60   -- 0022: was 10
           and p_dates = array(select distinct x.d from unnest(p_dates) as x(d) where x.d is not null order by x.d),
         false);
$$;

revoke execute on function public.camp_dates_are_sorted_set(date[]) from public, anon, authenticated, service_role;

-- 1i. camp_camper_extras_arg_is_valid(p_extras) - one child's extras, as
-- the family form and Edit details send them:
--   [{"extra_id": "<uuid>", "day_ids": ["<uuid>", ...]},   (a per-day extra)
--    {"extra_id": "<uuid>", "day_ids": []}]                (a once extra)
-- 0 to 10 objects with exactly these 2 keys, extra_id a uuid string (no
-- extra twice), day_ids 0 to 60 uuid strings (none twice; 0022: was 10). Whether the
-- ids belong to the camp is checked by the functions.
create or replace function public.camp_camper_extras_arg_is_valid(p_extras jsonb)
returns boolean
language plpgsql
immutable
set search_path = ''
as $$
declare
  v_item jsonb;
  v_seen text[] := '{}';
begin
  if p_extras is null or jsonb_typeof(p_extras) <> 'array'
     or jsonb_array_length(p_extras) > 10 then
    return false;
  end if;
  for v_item in select x.value from jsonb_array_elements(p_extras) as x(value) loop
    if jsonb_typeof(v_item) <> 'object'
       or (select count(*) from jsonb_object_keys(v_item)) <> 2
       or jsonb_typeof(v_item -> 'extra_id') is distinct from 'string'
       or not public.camp_uuid_text_is_valid(v_item ->> 'extra_id')
       or lower(v_item ->> 'extra_id') = any (v_seen)
       or not public.camp_uuid_list_is_valid(v_item -> 'day_ids', 0, 60) then   -- 0022: was 10
      return false;
    end if;
    v_seen := v_seen || lower(v_item ->> 'extra_id');
  end loop;
  return true;
end;
$$;

revoke execute on function public.camp_camper_extras_arg_is_valid(jsonb) from public, anon, authenticated, service_role;

-- 1j. camp_children_arg_is_valid(p_children) - the family form's children:
--   [{"first_name": "Mia", "last_name": "Rossi", "age": 9, "member": false,
--     "day_ids": ["<uuid>", ...], "extras": [ ...as 1i... ]}, ...]
-- 1 to 3 objects with exactly these 6 keys; names are strings, age a
-- whole number 0 to 150 (the camp's own age range is checked later, so a
-- family sees "This camp is for ages ..."), member true / false, day_ids
-- 1 to 60 uuid strings (none twice; 0022: was 10), extras as 1i.
create or replace function public.camp_children_arg_is_valid(p_children jsonb)
returns boolean
language plpgsql
immutable
set search_path = ''
as $$
declare
  v_item jsonb;
begin
  if p_children is null or jsonb_typeof(p_children) <> 'array'
     or jsonb_array_length(p_children) not between 1 and 3 then
    return false;
  end if;
  for v_item in select x.value from jsonb_array_elements(p_children) as x(value) loop
    if jsonb_typeof(v_item) <> 'object'
       or (select count(*) from jsonb_object_keys(v_item)) <> 6
       or jsonb_typeof(v_item -> 'first_name') is distinct from 'string'
       or jsonb_typeof(v_item -> 'last_name') is distinct from 'string'
       or not public.camp_int_text_is_valid(v_item -> 'age', 0, 150)
       or jsonb_typeof(v_item -> 'member') is distinct from 'boolean'
       or not public.camp_uuid_list_is_valid(v_item -> 'day_ids', 1, 60)   -- 0022: was 10
       or not public.camp_camper_extras_arg_is_valid(v_item -> 'extras') then
      return false;
    end if;
  end loop;
  return true;
end;
$$;

revoke execute on function public.camp_children_arg_is_valid(jsonb) from public, anon, authenticated, service_role;

-- 1k. camp_template_setup_is_valid(p_day_count, p_prices, p_extras) - a
-- template's number of days IN A WEEK (1 to 7; 0022, R7: was the camp's
-- number of days, 1 to 10), price grid (1f, one row per day
-- count) and extras (1g, kind 'template': weekdays instead of dates, no
-- ids). Used by the templates table rule.
create or replace function public.camp_template_setup_is_valid(p_day_count integer, p_prices jsonb, p_extras jsonb)
returns boolean
language sql
immutable
set search_path = ''
as $$
  select coalesce(p_day_count between 1 and 7   -- 0022: was 10
                  and public.camp_prices_arg_is_valid(p_prices, p_day_count)
                  and public.camp_extras_arg_is_valid(p_extras, 'template'),
                  false);
$$;

revoke execute on function public.camp_template_setup_is_valid(integer, jsonb, jsonb) from public, anon, authenticated, service_role;

-- 19a. camp_setup_args_are_valid(...) - the input rules Add camp and Edit
-- camp share (everything that doesn't depend on the saved camp):
--   a known school; both_schools true / false; a valid name; 1-60
--   different days; hours on 5-minute steps, end after start; sign-up
--   opens <= closes <= the last of the days; early price until <= closes;
--   ages 1-99, from <= to; the grid exactly 1 ... W (1f; 0022, R2: W =
--   the most of the days in one Monday-Sunday week, 2a - was 1 ... number
--   of days); the
--   extras (1g; with "id"s when p_with_ids; their only_on lists are checked
--   separately by 19e); description empty or up to
--   2000 characters; a waiver of 1-8000 characters.
create or replace function public.camp_setup_args_are_valid(
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
  p_with_ids         boolean,
  p_description      text,
  p_waiver_text      text
)
returns boolean
language plpgsql
stable
set search_path = ''
as $$
begin
  if p_location_code is null
     or not exists (select 1 from public.locations l where l.code = p_location_code)
     or p_both_schools is null
     or not public.testing_name_is_valid(p_name)
     or not public.camp_days_arg_is_valid(p_days) then
    return false;
  end if;
  if p_start_time is null or p_end_time is null or p_end_time <= p_start_time
     or not public.camp_time_is_valid(p_start_time) or not public.camp_time_is_valid(p_end_time) then
    return false;
  end if;
  if p_signup_opens_on is null or p_signup_closes_on is null or p_early_until is null
     or p_signup_opens_on > p_signup_closes_on
     or p_early_until > p_signup_closes_on
     or p_signup_closes_on > (select max(x.d) from unnest(p_days) as x(d)) then
    return false;
  end if;
  if p_min_age is null or p_max_age is null
     or p_min_age not between 1 and 99 or p_max_age not between 1 and 99 or p_min_age > p_max_age then
    return false;
  end if;
  if not public.camp_prices_arg_is_valid(p_prices, public.camp_week_size(p_days))   -- 0022: was cardinality(p_days)
     or not public.camp_extras_arg_is_valid(p_extras, case when p_with_ids then 'camp_edit' else 'camp' end) then
    return false;
  end if;
  if public.testing_normalize_note(p_description) is not null
     and not public.camp_text_is_valid(p_description, 2000) then
    return false;
  end if;
  return public.camp_text_is_valid(p_waiver_text, 8000);
end;
$$;

revoke execute on function public.camp_setup_args_are_valid(text, boolean, text, date[], time, time, date, date, date,
  integer, integer, jsonb, jsonb, boolean, text, text) from public, anon, authenticated, service_role;

-- 19c. camp_camper_extras_are_ok(camp, day_ids, extras) - the extra rules
-- of contract §1.10 for one child's choice (used by Edit details and the
-- family form after the ids were checked to belong to the camp):
--   a once extra has no days; a per-day extra has 1+ days, all of them
--   the child's own days AND, when the extra is offered only on some days
--   (only_on), all of them among those; a not-for-all-days extra
--   (0022, R6):
--     * a ONCE extra is not chosen when the child comes every day of the
--       camp (unchanged)
--     * a PER-DAY extra is not chosen on a day in a week where the child
--       comes every camp day of that week (2c) - it is included that week
create or replace function public.camp_camper_extras_are_ok(p_camp_id uuid, p_day_ids uuid[], p_extras jsonb)
returns boolean
language plpgsql
stable
set search_path = ''
as $$
declare
  v_item    jsonb;
  v_e       public.camp_extras;
  v_ids     uuid[];
  v_all     boolean;
begin
  v_all := cardinality(p_day_ids) = public.camp_day_count(p_camp_id);   -- (once extras only - 0022)
  for v_item in select x.value from jsonb_array_elements(p_extras) as x(value) loop
    select * into v_e from public.camp_extras e
     where e.id = (v_item ->> 'extra_id')::uuid and e.camp_id = p_camp_id;
    if not found then
      return false;
    end if;
    v_ids := array(select (y.value #>> '{}')::uuid from jsonb_array_elements(v_item -> 'day_ids') as y(value));
    if (v_e.per = 'once' and cardinality(v_ids) <> 0)
       or (v_e.per = 'day' and (cardinality(v_ids) = 0 or not (v_ids <@ p_day_ids)))
       or (v_e.per = 'day' and cardinality(v_e.only_on) > 0
           and exists (select 1 from public.camp_days d where d.id = any (v_ids) and not (d.day = any (v_e.only_on))))
       or (v_e.not_for_all_days and v_e.per = 'once' and v_all)
       -- 0022: a per-day one, per week (2c)
       or (v_e.not_for_all_days and v_e.per = 'day'
           and exists (select 1 from unnest(v_ids) as y(id)
                        where public.camp_comes_whole_week(p_camp_id, p_day_ids, y.id))) then
      return false;
    end if;
  end loop;
  return true;
end;
$$;

revoke execute on function public.camp_camper_extras_are_ok(uuid, uuid[], jsonb) from public, anon, authenticated, service_role;

-- 19e. camp_extras_only_on_ok(extras, days, removed_days) - the "only_on"
-- lists of the extras Add / Edit camp sends (each optional; [] = every
-- day). For each extra: a list of at most 60 dates (0022: was 10) written 'YYYY-MM-DD',
-- none twice; a once extra must have none; every date must be one of the
-- camp's days (p_days) - or one of the days Edit camp is removing right
-- now (p_removed), which are then simply left out; if a list named days
-- and ALL of them are being removed, it is refused (otherwise the extra
-- would quietly become "every day" - the admin decides instead).
-- false -> the functions answer {status:'invalid', field:'extras'}.
-- Dates are compared as text, so a malformed date can never raise an error.
create or replace function public.camp_extras_only_on_ok(p_extras jsonb, p_days date[], p_removed date[])
returns boolean
language plpgsql
stable
set search_path = ''
as $$
declare
  v_item  jsonb;
  v_list  jsonb;
  v_days  text[] := array(select to_char(x.d, 'YYYY-MM-DD') from unnest(p_days) as x(d));
  v_gone  text[] := array(select to_char(x.d, 'YYYY-MM-DD') from unnest(coalesce(p_removed, '{}'::date[])) as x(d));
  v_seen  text[];
  v_kept  integer;
  v_one   jsonb;
begin
  for v_item in select x.value from jsonb_array_elements(p_extras) as x(value) loop
    continue when not (v_item ? 'only_on');
    v_list := v_item -> 'only_on';
    if jsonb_typeof(v_list) <> 'array' or jsonb_array_length(v_list) > 60   -- 0022: was 10
       or (v_item ->> 'per' = 'once' and jsonb_array_length(v_list) > 0) then
      return false;
    end if;
    v_seen := '{}';
    v_kept := 0;
    for v_one in select y.value from jsonb_array_elements(v_list) as y(value) loop
      if jsonb_typeof(v_one) <> 'string'
         or (v_one #>> '{}') = any (v_seen)
         or not ((v_one #>> '{}') = any (v_days || v_gone)) then
        return false;
      end if;
      v_seen := v_seen || (v_one #>> '{}');
      if (v_one #>> '{}') = any (v_days) then
        v_kept := v_kept + 1;
      end if;
    end loop;
    if jsonb_array_length(v_list) > 0 and v_kept = 0 then
      return false;
    end if;
  end loop;
  return true;
end;
$$;

revoke execute on function public.camp_extras_only_on_ok(jsonb, date[], date[]) from public, anon, authenticated, service_role;

-- 13g. camp_camper_extras_before_write() - BEFORE INSERT OR UPDATE
--   insert: the extra is one of the camper's camp's extras; a 'once'
--           extra has no day; a 'day' extra has a day that is one of the
--           camper's own days (and, when the extra is offered only on
--           some days, one of those); a not-for-all-days extra is refused
--           (0022, R6): a once one for a camper who comes every day of the
--           camp; a per-day one on a day in a week where the camper comes
--           every camp day of that week (2c)
--   update: only the price may change (Edit details re-pricing)
create or replace function public.camp_camper_extras_before_write()
returns trigger
language plpgsql
set search_path = ''
as $$
declare
  v_per      text;
  v_not_all  boolean;
  v_camp_id  uuid;
  v_only_on  date[];
begin
  if tg_op = 'UPDATE' then
    if new.id is distinct from old.id
       or new.camper_id is distinct from old.camper_id
       or new.extra_id is distinct from old.extra_id
       or new.day_id is distinct from old.day_id then
      raise exception using
        errcode    = '23514',
        constraint = 'camp_camper_extras_immutable',
        message    = 'a camper extra can''t change (only its price can)';
    end if;
    return new;
  end if;

  select e.per, e.not_for_all_days, c.camp_id, e.only_on into v_per, v_not_all, v_camp_id, v_only_on
    from public.camp_campers c
    join public.camp_extras e on e.camp_id = c.camp_id
   where c.id = new.camper_id and e.id = new.extra_id;
  if not found
     or (v_per = 'once' and new.day_id is not null)
     or (v_per = 'day' and (new.day_id is null
                            or not exists (select 1 from public.camp_camper_days cd
                                            where cd.camper_id = new.camper_id and cd.day_id = new.day_id)))
     or (v_per = 'day' and cardinality(v_only_on) > 0
         and not exists (select 1 from public.camp_days d where d.id = new.day_id and d.day = any (v_only_on)))
     or (v_not_all and v_per = 'once'
         and (select count(*) from public.camp_camper_days cd where cd.camper_id = new.camper_id)
             = (select count(*) from public.camp_days d where d.camp_id = v_camp_id))
     -- 0022: a per-day one, per week (2c)
     or (v_not_all and v_per = 'day'
         and public.camp_comes_whole_week(v_camp_id,
                                          array(select cd.day_id from public.camp_camper_days cd
                                                 where cd.camper_id = new.camper_id),
                                          new.day_id)) then
    raise exception using
      errcode    = '23514',
      constraint = 'camp_camper_extras_rules',
      message    = 'the extra must be one of the camp''s, with a day only for a per-day extra (one of the camper''s days), and not a not-for-all-days extra for an all-days camper (per week for a per-day extra)';
  end if;
  return new;
end;
$$;

revoke execute on function public.camp_camper_extras_before_write() from public, anon, authenticated, service_role;



-- ---------------------------------------------------------------------
-- 4. Replaced answers: every 0013 key is kept (the app before this file
--    still works); each child / breakdown gets ONE new key, "weeks" (2d),
--    so the app can write "Week of Jul 6 · 5 days $275" lines.
-- ---------------------------------------------------------------------

-- 17h. camp_public_signup_answer(signup_id) - the "You're signed up"
-- answer (C7c): only what that family just sent plus the camp's facts.
-- 0022: each child also has "weeks" (2d): [{monday, day_count, cents}],
-- one per week the child comes.
-- Built from the stored rows, so a retry with the same submission id
-- gets exactly the same answer.
create or replace function public.camp_public_signup_answer(p_signup_id uuid)
returns jsonb
language sql
stable
set search_path = ''
as $$
  select jsonb_build_object(
           'status',             'ok',
           'reference',          s.reference,
           'paying_by',          (select c.paying_by from public.camp_campers c where c.signup_id = s.id
                                   order by c.position limit 1),
           'family_total_cents', coalesce((select sum(public.camp_camper_total_cents(c.id))::integer
                                             from public.camp_campers c where c.signup_id = s.id), 0),
           'children', coalesce((
             select jsonb_agg(jsonb_build_object(
                      'first_name',  c.first_name,
                      'last_name',   c.last_name,
                      'day_count',   (select count(*) from public.camp_camper_days cd where cd.camper_id = c.id),
                      'days',        coalesce((select jsonb_agg(d.day order by d.day)
                                                 from public.camp_camper_days cd
                                                 join public.camp_days d on d.id = cd.day_id
                                                where cd.camper_id = c.id), '[]'::jsonb),
                      'price_kind',  s.price_kind,
                      'base_cents',  c.base_cents,
                      -- 0022: the weeks the child comes (2d)
                      'weeks',       public.camp_weeks_breakdown(k.id,
                                                                 array(select cd.day_id from public.camp_camper_days cd
                                                                        where cd.camper_id = c.id),
                                                                 c.member, s.price_kind),
                      'extras',      coalesce((select jsonb_agg(jsonb_build_object('name', g.name, 'per', g.per,
                                                                                   'count', g.n, 'cents', g.cents)
                                                                order by g.sort)
                                                 from (select e.name, e.per, e.sort, count(*)::integer as n,
                                                              sum(x.price_cents)::integer as cents
                                                         from public.camp_camper_extras x
                                                         join public.camp_extras e on e.id = x.extra_id
                                                        where x.camper_id = c.id
                                                        group by e.id, e.name, e.per, e.sort) as g), '[]'::jsonb),
                      'total_cents', public.camp_camper_total_cents(c.id))
                    order by c.position)
               from public.camp_campers c where c.signup_id = s.id), '[]'::jsonb),
           'camp', jsonb_build_object(
             'name',         k.name,
             'days',         coalesce((select jsonb_agg(jsonb_build_object('day_id', d.id, 'day', d.day) order by d.day)
                                         from public.camp_days d where d.camp_id = k.id), '[]'::jsonb),
             'start_time',   left(k.start_time::text, 5),
             'end_time',     left(k.end_time::text, 5),
             'school_name',  l.name,
             'both_schools', k.both_schools,
             'address',      public.testing_location_address(k.location_code),
             'description',  k.description))
    from public.camp_signups s
    join public.camps k     on k.id = s.camp_id
    join public.locations l on l.code = k.location_code
   where s.id = p_signup_id;
$$;

revoke execute on function public.camp_public_signup_answer(uuid) from public, anon, authenticated, service_role;

-- 20s. camp_camper_detail(p_camper_id)   S (read only)
-- Camper detail (C6): the roster row, the family's parent / emergency
-- contact (the ONLY way the app sees phones - staff and admins, v0.700),
-- the price breakdown, the payments and the check-in times per day.
-- {"status":"ok",
--  "camper": {...the camp_roster row...},
--  "family": {parent_name, parent_phone, parent_relation,
--             emergency_name, emergency_phone, emergency_relation},
--  "breakdown": {day_count, price_kind, member, base_cents,
--                weeks: [{monday, day_count, cents}]   (0022, 2d),
--                extras: [{name, per, days: [date], cents}],
--                total_cents, paid_cents, owes_cents},
--  "payments": [{id, kind, amount_cents, method, paid_on, school,
--                recorded_at, recorded_by_name, reverses_payment_id}],
--  "checkins": [{day, checked_in_at, checked_in_by_name}]}  (every day of
--   the camper's, in date order; not checked in = nulls)
-- or {"status":"no_access"} / {"status":"not_found"}.
create or replace function public.camp_camper_detail(p_camper_id uuid)
returns jsonb
language plpgsql
stable
security definer
set search_path = ''
as $$
declare
  v_row jsonb;
  v_s   public.camp_signups;
begin
  if public.has_data_access() is not true then
    return jsonb_build_object('status', 'no_access');
  end if;
  if p_camper_id is null then
    return jsonb_build_object('status', 'not_found');
  end if;

  select to_jsonb(r) into v_row from public.camp_roster r where r.id = p_camper_id;
  if v_row is null then
    return jsonb_build_object('status', 'not_found');
  end if;
  select * into v_s from public.camp_signups s where s.id = (v_row ->> 'signup_id')::uuid;

  return jsonb_build_object(
    'status', 'ok',
    'camper', v_row,
    'family', jsonb_build_object(
                'parent_name',        v_s.parent_name,
                'parent_phone',       v_s.parent_phone,
                'parent_relation',    v_s.parent_relation,
                'emergency_name',     v_s.emergency_name,
                'emergency_phone',    v_s.emergency_phone,
                'emergency_relation', v_s.emergency_relation),
    'breakdown', jsonb_build_object(
                'day_count',   jsonb_array_length(v_row -> 'days'),
                'price_kind',  v_row -> 'price_kind',
                'member',      v_row -> 'member',
                'base_cents',  v_row -> 'base_cents',
                -- 0022: the weeks the camper comes (2d)
                'weeks',       public.camp_weeks_breakdown((v_row ->> 'camp_id')::uuid,
                                                           array(select cd.day_id from public.camp_camper_days cd
                                                                  where cd.camper_id = p_camper_id),
                                                           (v_row ->> 'member')::boolean, v_row ->> 'price_kind'),
                'extras',      coalesce((select jsonb_agg(jsonb_build_object('name', g.name, 'per', g.per,
                                                                             'days', g.days, 'cents', g.cents)
                                                          order by g.sort)
                                           from (select e.name, e.per, e.sort,
                                                        coalesce(jsonb_agg(d.day order by d.day)
                                                                   filter (where d.day is not null), '[]'::jsonb) as days,
                                                        sum(x.price_cents)::integer as cents
                                                   from public.camp_camper_extras x
                                                   join public.camp_extras e on e.id = x.extra_id
                                                   left join public.camp_days d on d.id = x.day_id
                                                  where x.camper_id = p_camper_id
                                                  group by e.id, e.name, e.per, e.sort) as g), '[]'::jsonb),
                'total_cents', v_row -> 'total_cents',
                'paid_cents',  v_row -> 'paid_cents',
                'owes_cents',  v_row -> 'owes_cents'),
    'payments', coalesce((select jsonb_agg(jsonb_build_object(
                                     'id', p.id, 'kind', p.kind, 'amount_cents', p.amount_cents, 'method', p.method,
                                     'paid_on', p.paid_on, 'school', p.school, 'recorded_at', p.recorded_at,
                                     'recorded_by_name', p.recorded_by_name, 'reverses_payment_id', p.reverses_payment_id)
                                   order by p.recorded_at, p.id)
                            from public.camp_payments p where p.camper_id = p_camper_id), '[]'::jsonb),
    'checkins', coalesce((select jsonb_agg(jsonb_build_object(
                                     'day', d.day, 'checked_in_at', cd.checked_in_at,
                                     'checked_in_by_name', cd.checked_in_by_name)
                                   order by d.day)
                            from public.camp_camper_days cd
                            join public.camp_days d on d.id = cd.day_id
                           where cd.camper_id = p_camper_id), '[]'::jsonb));
end;
$$;

revoke execute on function public.camp_camper_detail(uuid) from public, anon, authenticated, service_role;
grant  execute on function public.camp_camper_detail(uuid) to authenticated;



-- ---------------------------------------------------------------------
-- 5. Replaced staff and family-form functions (0013's text and
--    numbering; only the lines of the new rules changed, each marked
--    "0022"). Same names, arguments, owners, "security definer",
--    has_data_access() first, and the same rights as 0013 (re-stated).
-- ---------------------------------------------------------------------

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

-- 20e. camp_save_template(p_camp_id, p_name)   A
-- Save as template: copies everything except the dates and the campers -
-- school, both schools, number of days IN A WEEK (0022, R7: the camp's W,
-- 2a - was its number of days), hours, ages, description, waiver,
-- price grid (rows 1 ... W) and extras - and turns the sign-up dates into "days before
-- the first camp day" (first day - date), and each extra's only_on dates
-- into weekdays ("only_weekdays", 1 = Mon ... 7 = Sun; the app maps them
-- back to a new camp's days with those weekdays). A template with this name
-- (ignoring capitals and extra spaces) -> duplicate_name. Offsets outside
-- -365 ... 365 -> {"status":"invalid","field":"offsets"}.
-- Ok: {"status":"ok","id":...,"version":1}
create or replace function public.camp_save_template(
  p_camp_id uuid,
  p_name    text
)
returns jsonb
language plpgsql
volatile
security definer
set search_path = ''
as $$
declare
  v_c          public.camps;
  v_first      date;
  v_name       text;
  v_opens      integer;
  v_closes     integer;
  v_early      integer;
  v_id         uuid;
  v_version    integer;
  v_constraint text;
begin
  begin
    if public.has_data_access() is not true then
      return jsonb_build_object('status', 'no_access');
    end if;
    if public.is_admin() is not true then
      return jsonb_build_object('status', 'not_allowed');
    end if;

    if p_camp_id is null or not public.testing_name_is_valid(p_name) then
      return jsonb_build_object('status', 'invalid');
    end if;
    v_name := public.testing_normalize_name(p_name);

    -- "for no key update": the camp is read, not changed, but it must not
    -- change half-way through the copy
    select * into v_c from public.camps c where c.id = p_camp_id for no key update;
    if not found then
      return jsonb_build_object('status', 'not_found');
    end if;

    if exists (select 1 from public.camp_templates t
                where lower(public.testing_normalize_name(t.name)) = lower(v_name)) then
      return jsonb_build_object('status', 'duplicate_name');
    end if;
    v_first  := public.camp_first_day(p_camp_id);
    v_opens  := v_first - v_c.signup_opens_on;
    v_closes := v_first - v_c.signup_closes_on;
    v_early  := v_first - v_c.early_until;
    if v_opens not between -365 and 365 or v_closes not between -365 and 365 or v_early not between -365 and 365 then
      return jsonb_build_object('status', 'invalid', 'field', 'offsets');
    end if;

    perform set_config('tkd.action', 'camp_save_template', true);
    perform set_config('tkd.batch_id', gen_random_uuid()::text, true);

    insert into public.camp_templates
      (name, location_code, both_schools, day_count, start_time, end_time, opens_days_before, closes_days_before,
       early_days_before, min_age, max_age, description, waiver_text, prices, extras, created_by_name, updated_by_name)
    values
      (v_name, v_c.location_code, v_c.both_schools,
       public.camp_week_size(array(select d.day from public.camp_days d where d.camp_id = p_camp_id)),   -- 0022: W
       v_c.start_time, v_c.end_time,
       v_opens, v_closes, v_early, v_c.min_age, v_c.max_age, v_c.description, v_c.waiver_text,
       coalesce((select jsonb_agg(jsonb_build_object(
                          'day_count', p.day_count,
                          'member_early_cents', p.member_early_cents,
                          'member_regular_cents', p.member_regular_cents,
                          'nonmember_early_cents', p.nonmember_early_cents,
                          'nonmember_regular_cents', p.nonmember_regular_cents) order by p.day_count)
                   from public.camp_prices p
                  where p.camp_id = p_camp_id
                    and p.day_count <= public.camp_week_size(array(select d.day from public.camp_days d
                                                                    where d.camp_id = p_camp_id))), '[]'::jsonb),   -- 0022
       coalesce((select jsonb_agg(jsonb_build_object(
                          'name', e.name, 'price_cents', e.price_cents, 'per', e.per,
                          'not_for_all_days', e.not_for_all_days,
                          'only_weekdays', to_jsonb(array(select distinct extract(isodow from x.d)::integer
                                                            from unnest(e.only_on) as x(d) order by 1))) order by e.sort)
                   from public.camp_extras e where e.camp_id = p_camp_id), '[]'::jsonb),
       '', '')
    returning id, version into v_id, v_version;

    perform set_config('tkd.action', '', true);
    perform set_config('tkd.batch_id', '', true);

    return jsonb_build_object('status', 'ok', 'id', v_id, 'version', v_version);
  exception
    when unique_violation then
      get stacked diagnostics v_constraint = constraint_name;
      if v_constraint = 'camp_templates_lower_name_idx' then
        return jsonb_build_object('status', 'duplicate_name');
      end if;
      return jsonb_build_object('status', 'stale');
    when foreign_key_violation or check_violation or not_null_violation or data_exception then
      return jsonb_build_object('status', 'invalid');
    when deadlock_detected or serialization_failure or lock_not_available then
      return jsonb_build_object('status', 'stale');
  end;
end;
$$;

revoke execute on function public.camp_save_template(uuid, text) from public, anon, authenticated, service_role;
grant  execute on function public.camp_save_template(uuid, text) to authenticated;

-- 20f. camp_update_template(p_template_id, p_expected_version, p_name,
--        p_location_code, p_both_schools, p_day_count, p_start_time,
--        p_end_time, p_opens_days_before, p_closes_days_before,
--        p_early_days_before, p_min_age, p_max_age, p_prices, p_extras,
--        p_description, p_waiver_text)   A
-- Edit template. The three offsets are checked FIRST: each -365 ... 365,
-- opens >= closes, early >= closes, else
-- {"status":"invalid","field":"offsets"}. Then the other fields (as Add
-- camp, the grid for p_day_count days IN A WEEK - 1 to 7 (0022, R7: was
-- 1 to 10 days of a camp), extras without ids and with
-- "only_weekdays" instead of dates, 1g) -> invalid;
-- the name -> duplicate_name. Never touches any camp.
-- Ok: {"status":"ok","version":n}
create or replace function public.camp_update_template(
  p_template_id        uuid,
  p_expected_version   integer,
  p_name               text,
  p_location_code      text,
  p_both_schools       boolean,
  p_day_count          integer,
  p_start_time         time,
  p_end_time           time,
  p_opens_days_before  integer,
  p_closes_days_before integer,
  p_early_days_before  integer,
  p_min_age            integer,
  p_max_age            integer,
  p_prices             jsonb,
  p_extras             jsonb,
  p_description        text,
  p_waiver_text        text
)
returns jsonb
language plpgsql
volatile
security definer
set search_path = ''
as $$
declare
  v_t          public.camp_templates;
  v_name       text;
  v_version    integer;
  v_constraint text;
begin
  begin
    if public.has_data_access() is not true then
      return jsonb_build_object('status', 'no_access');
    end if;
    if public.is_admin() is not true then
      return jsonb_build_object('status', 'not_allowed');
    end if;

    if p_opens_days_before is null or p_closes_days_before is null or p_early_days_before is null
       or p_opens_days_before not between -365 and 365
       or p_closes_days_before not between -365 and 365
       or p_early_days_before not between -365 and 365
       or p_opens_days_before < p_closes_days_before
       or p_early_days_before < p_closes_days_before then
      return jsonb_build_object('status', 'invalid', 'field', 'offsets');
    end if;
    if p_template_id is null or p_expected_version is null
       or not public.testing_name_is_valid(p_name)
       or p_location_code is null
       or not exists (select 1 from public.locations l where l.code = p_location_code)
       or p_both_schools is null
       or p_day_count is null or p_day_count not between 1 and 7   -- 0022: was 10
       or p_start_time is null or p_end_time is null or p_end_time <= p_start_time
       or not public.camp_time_is_valid(p_start_time) or not public.camp_time_is_valid(p_end_time)
       or p_min_age is null or p_max_age is null
       or p_min_age not between 1 and 99 or p_max_age not between 1 and 99 or p_min_age > p_max_age
       or not public.camp_prices_arg_is_valid(p_prices, p_day_count)
       or not public.camp_extras_arg_is_valid(p_extras, 'template')
       or (public.testing_normalize_note(p_description) is not null
           and not public.camp_text_is_valid(p_description, 2000))
       or not public.camp_text_is_valid(p_waiver_text, 8000) then
      return jsonb_build_object('status', 'invalid');
    end if;
    v_name := public.testing_normalize_name(p_name);

    select * into v_t from public.camp_templates t where t.id = p_template_id for update;
    if not found then
      return jsonb_build_object('status', 'not_found');
    end if;
    if v_t.version <> p_expected_version then
      return jsonb_build_object('status', 'stale');
    end if;
    if exists (select 1 from public.camp_templates t
                where t.id <> p_template_id
                  and lower(public.testing_normalize_name(t.name)) = lower(v_name)) then
      return jsonb_build_object('status', 'duplicate_name');
    end if;

    perform set_config('tkd.action', 'camp_update_template', true);
    perform set_config('tkd.batch_id', gen_random_uuid()::text, true);

    update public.camp_templates t
       set name               = v_name,
           location_code      = p_location_code,
           both_schools       = p_both_schools,
           day_count          = p_day_count,
           start_time         = p_start_time,
           end_time           = p_end_time,
           opens_days_before  = p_opens_days_before,
           closes_days_before = p_closes_days_before,
           early_days_before  = p_early_days_before,
           min_age            = p_min_age,
           max_age            = p_max_age,
           description        = public.testing_normalize_note(p_description),
           waiver_text        = public.testing_normalize_note(p_waiver_text),
           prices             = public.camp_tidy_prices(p_prices),
           extras             = public.camp_tidy_extras(p_extras)
     where t.id = p_template_id
    returning t.version into v_version;   -- the trigger keeps the version when nothing changed

    perform set_config('tkd.action', '', true);
    perform set_config('tkd.batch_id', '', true);

    return jsonb_build_object('status', 'ok', 'version', v_version);
  exception
    when unique_violation then
      get stacked diagnostics v_constraint = constraint_name;
      if v_constraint = 'camp_templates_lower_name_idx' then
        return jsonb_build_object('status', 'duplicate_name');
      end if;
      return jsonb_build_object('status', 'stale');
    when foreign_key_violation or check_violation or not_null_violation or data_exception then
      return jsonb_build_object('status', 'invalid');
    when deadlock_detected or serialization_failure or lock_not_available then
      return jsonb_build_object('status', 'stale');
  end;
end;
$$;

revoke execute on function public.camp_update_template(uuid, integer, text, text, boolean, integer, time, time, integer,
  integer, integer, integer, integer, jsonb, jsonb, text, text) from public, anon, authenticated, service_role;
grant  execute on function public.camp_update_template(uuid, integer, text, text, boolean, integer, time, time, integer,
  integer, integer, integer, integer, jsonb, jsonb, text, text) to authenticated;

-- 20h. camp_update_details(p_camper_id, p_camper_version, p_signup_version,
--        p_first, p_last, p_age, p_member, p_day_ids, p_extras,
--        p_parent_name, p_parent_phone, p_parent_relation,
--        p_emergency_name, p_emergency_phone, p_emergency_relation)   S
-- Edit details (Camper detail): the child's names, age (1-99), member box,
-- days and extras, and the family's parent / emergency contact (shared by
-- every child of the sign-up). Allowed in every camp state, Finished too.
--   p_day_ids   1-60 of this camp's day ids (0022: was 10)
--   p_extras    [{"extra_id": "<uuid>", "day_ids": [...]}] (1i): a once
--               extra with [], a per-day extra with some of p_day_ids; a
--               not-for-all-days extra is refused for an all-days camper
--               (the screen removes it before sending) -> invalid
-- Day rows are DIFFED: kept days keep their check-in; removing a day the
-- camper was checked in on -> {"status":"checked_in","day":"..."}.
-- Re-price rule (v0.700, literally): if the days, the member box or the
-- extras change, the WHOLE camper is priced again at the camp's CURRENT
-- prices (base = each week's grid row for the days that week, added up -
-- 0022, R3, 2b; was the row for the total number of days - every extra row
-- at the extra's current price), with the sign-up's fixed early / regular.
-- A change to only names, age or family fields re-prices nothing.
-- A camper total over $10,000 (0022: was $2,000) -> invalid. A name change checks the
-- possible-duplicate mark again.
-- Ok: {"status":"ok","camper_version":n,"signup_version":n,
--      "total_cents":n,"owes_cents":n}
create or replace function public.camp_update_details(
  p_camper_id          uuid,
  p_camper_version     integer,
  p_signup_version     integer,
  p_first              text,
  p_last               text,
  p_age                integer,
  p_member             boolean,
  p_day_ids            uuid[],
  p_extras             jsonb,
  p_parent_name        text,
  p_parent_phone       text,
  p_parent_relation    text,
  p_emergency_name     text,
  p_emergency_phone    text,
  p_emergency_relation text
)
returns jsonb
language plpgsql
volatile
security definer
set search_path = ''
as $$
declare
  v_c         public.camp_campers;
  v_s         public.camp_signups;
  v_first     text := public.testing_normalize_name(p_first);
  v_last      text := public.testing_normalize_name(p_last);
  v_day       date;
  v_reprice   boolean;
  v_renamed   boolean;
  v_base      integer;
  v_total     integer;
  v_n         integer;
  v_cv        integer;
  v_sv        integer;
begin
  begin
    if public.has_data_access() is not true then
      return jsonb_build_object('status', 'no_access');
    end if;
    -- 2. role: any staff member with data access

    if p_camper_id is null or p_camper_version is null or p_signup_version is null
       or not public.testing_name_is_valid(p_first)
       or not public.testing_name_is_valid(p_last)
       or p_age is null or p_age not between 1 and 99
       or p_member is null
       or not public.testing_ids_are_valid(p_day_ids)
       or cardinality(p_day_ids) not between 1 and 60   -- 0022: was 10
       or not public.camp_camper_extras_arg_is_valid(p_extras)
       or not public.testing_name_is_valid(p_parent_name)
       or not public.testing_name_is_valid(p_emergency_name)
       or p_parent_phone is null or p_parent_phone !~ '^[0-9]{10}$'
       or p_emergency_phone is null or p_emergency_phone !~ '^[0-9]{10}$'
       or not public.testing_line_is_valid(p_parent_relation, 40)
       or not public.testing_line_is_valid(p_emergency_relation, 40) then
      return jsonb_build_object('status', 'invalid');
    end if;

    v_c := public.camp_lock_camper(p_camper_id);
    if v_c.id is null then
      return jsonb_build_object('status', 'not_found');
    end if;
    select * into v_s from public.camp_signups s where s.id = v_c.signup_id;
    if v_c.version <> p_camper_version or v_s.version <> p_signup_version then
      return jsonb_build_object('status', 'stale');
    end if;
    if v_c.status = 'withdrawn' then
      return jsonb_build_object('status', 'withdrawn');
    end if;

    -- the days and extras must be this camp's, and follow the extra rules
    if (select count(*) from public.camp_days d where d.camp_id = v_c.camp_id and d.id = any (p_day_ids))
       <> cardinality(p_day_ids)
       or not public.camp_camper_extras_are_ok(v_c.camp_id, p_day_ids, p_extras) then
      return jsonb_build_object('status', 'invalid');
    end if;

    -- a day being removed that the camper was checked in on
    select d.day into v_day
      from public.camp_camper_days cd
      join public.camp_days d on d.id = cd.day_id
     where cd.camper_id = v_c.id
       and not (cd.day_id = any (p_day_ids))
       and cd.checked_in_at is not null
     order by d.day
     limit 1;
    if found then
      return jsonb_build_object('status', 'checked_in', 'day', v_day);
    end if;

    -- re-price? (days, member box or extras changed)
    v_reprice := v_c.member is distinct from p_member
                 or array(select cd.day_id from public.camp_camper_days cd where cd.camper_id = v_c.id order by cd.day_id)
                    is distinct from array(select x.id from unnest(p_day_ids) as x(id) order by x.id)
                 or array(select x.extra_id::text || '/' || coalesce(x.day_id::text, '')
                            from public.camp_camper_extras x where x.camper_id = v_c.id order by 1)
                    is distinct from array(select r.extra_id::text || '/' || coalesce(r.day_id::text, '')
                                             from public.camp_extra_rows(p_extras) as r order by 1);
    if v_reprice then
      v_base := public.camp_weekly_base_cents(v_c.camp_id, p_day_ids, p_member, v_s.price_kind);   -- 0022: per week
      if v_base is null then
        return jsonb_build_object('status', 'invalid');
      end if;
      v_total := v_base + public.camp_extras_cents_now(p_extras);
    else
      v_base  := v_c.base_cents;
      v_total := public.camp_camper_total_cents(v_c.id);
    end if;
    if v_total > 1000000 then   -- 0022: was 200000
      return jsonb_build_object('status', 'invalid');
    end if;
    v_renamed := v_c.first_name is distinct from v_first or v_c.last_name is distinct from v_last;

    perform set_config('tkd.action', 'camp_update_details', true);
    perform set_config('tkd.batch_id', gen_random_uuid()::text, true);

    -- the family's fields (sign-up)
    update public.camp_signups s
       set parent_name        = public.testing_normalize_name(p_parent_name),
           parent_phone       = p_parent_phone,
           parent_relation    = public.testing_normalize_name(p_parent_relation),
           emergency_name     = public.testing_normalize_name(p_emergency_name),
           emergency_phone    = p_emergency_phone,
           emergency_relation = public.testing_normalize_name(p_emergency_relation)
     where s.id = v_s.id
       and (s.parent_name is distinct from public.testing_normalize_name(p_parent_name)
            or s.parent_phone is distinct from p_parent_phone
            or s.parent_relation is distinct from public.testing_normalize_name(p_parent_relation)
            or s.emergency_name is distinct from public.testing_normalize_name(p_emergency_name)
            or s.emergency_phone is distinct from p_emergency_phone
            or s.emergency_relation is distinct from public.testing_normalize_name(p_emergency_relation));

    if v_reprice then
      -- extra rows no longer chosen go first (they may name a day that goes)
      delete from public.camp_camper_extras x
       where x.camper_id = v_c.id
         and not exists (select 1 from public.camp_extra_rows(p_extras) as r
                          where r.extra_id = x.extra_id and r.day_id is not distinct from x.day_id);
      -- days: removed ones go, new ones are added; kept ones keep their check-in
      delete from public.camp_camper_days cd
       where cd.camper_id = v_c.id and not (cd.day_id = any (p_day_ids));
      insert into public.camp_camper_days (camper_id, day_id)
      select v_c.id, x.id from unnest(p_day_ids) as x(id)
       where not exists (select 1 from public.camp_camper_days cd where cd.camper_id = v_c.id and cd.day_id = x.id)
       order by x.id;
      -- kept extra rows at the extra's current price, then the new ones
      update public.camp_camper_extras x
         set price_cents = e.price_cents
        from public.camp_extras e
       where x.camper_id = v_c.id and e.id = x.extra_id and x.price_cents <> e.price_cents;
      insert into public.camp_camper_extras (camper_id, extra_id, day_id, price_cents)
      select v_c.id, r.extra_id, r.day_id, e.price_cents
        from public.camp_extra_rows(p_extras) as r
        join public.camp_extras e on e.id = r.extra_id
       where not exists (select 1 from public.camp_camper_extras x
                          where x.camper_id = v_c.id and x.extra_id = r.extra_id
                            and x.day_id is not distinct from r.day_id)
       order by e.sort, r.day_id;
    end if;

    -- the camper row (a re-price always bumps its version, even if the
    -- base price came out the same)
    update public.camp_campers c
       set first_name = v_first,
           last_name  = v_last,
           age        = p_age,
           member     = p_member,
           base_cents = v_base,
           version    = case when v_reprice then c.version + 1 else c.version end
     where c.id = v_c.id
       and (v_reprice
            or c.first_name is distinct from v_first
            or c.last_name is distinct from v_last
            or c.age is distinct from p_age);
    get diagnostics v_n = row_count;

    if v_renamed then
      perform public.camp_recheck_duplicate(v_c.id);
      perform public.camp_recheck_pointing_at(v_c.id);
    end if;

    perform set_config('tkd.action', '', true);
    perform set_config('tkd.batch_id', '', true);

    select c.version into v_cv from public.camp_campers c where c.id = v_c.id;
    select s.version into v_sv from public.camp_signups s where s.id = v_s.id;
    v_total := public.camp_camper_total_cents(v_c.id);
    return jsonb_build_object('status', 'ok', 'camper_version', v_cv, 'signup_version', v_sv,
                              'total_cents', v_total,
                              'owes_cents', v_total - public.camp_camper_paid_cents(v_c.id));
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

revoke execute on function public.camp_update_details(uuid, integer, integer, text, text, integer, boolean, uuid[], jsonb,
  text, text, text, text, text, text) from public, anon, authenticated, service_role;
grant  execute on function public.camp_update_details(uuid, integer, integer, text, text, integer, boolean, uuid[], jsonb,
  text, text, text, text, text, text) to authenticated;

-- 20l. camp_edit_payment(p_payment_id, p_method, p_amount_cents, p_paid_on,
--        p_school)   A
-- Edit payment = a reversal of the old payment (at the old school) + a new
-- payment with the new method / amount (1 cent to $10,000 - 0022: was $2,000) / date (not in
-- the future) / school (v0.707: correct the desk that took it; any school
-- in public.locations, else {"status":"invalid","field":"school"}).
-- Already reversed -> stale; a reversal can't be edited (invalid, as 0005).
-- Ok: {"status":"ok","payment_id":<the new payment>,"version":n}
create or replace function public.camp_edit_payment(
  p_payment_id   uuid,
  p_method       text,
  p_amount_cents integer,
  p_paid_on      date,
  p_school       text
)
returns jsonb
language plpgsql
volatile
security definer
set search_path = ''
as $$
declare
  v_p       public.camp_payments;
  v_new_id  uuid;
  v_version integer;
begin
  begin
    if public.has_data_access() is not true then
      return jsonb_build_object('status', 'no_access');
    end if;
    if public.is_admin() is not true then
      return jsonb_build_object('status', 'not_allowed');
    end if;

    if p_payment_id is null
       or p_method is null or p_method not in ('cash', 'check', 'card')
       or p_amount_cents is null or p_amount_cents not between 1 and 1000000   -- 0022: was 200000
       or p_paid_on is null or p_paid_on > public.testing_today() then
      return jsonb_build_object('status', 'invalid');
    end if;
    if p_school is null or not exists (select 1 from public.locations l where l.code = p_school) then
      return jsonb_build_object('status', 'invalid', 'field', 'school');
    end if;

    v_p := public.camp_lock_payment(p_payment_id);
    if v_p.id is null then
      return jsonb_build_object('status', 'not_found');
    end if;
    if v_p.kind <> 'payment' then
      return jsonb_build_object('status', 'invalid');
    end if;
    if exists (select 1 from public.camp_payments x where x.reverses_payment_id = p_payment_id) then
      return jsonb_build_object('status', 'stale');
    end if;

    perform set_config('tkd.action', 'camp_edit_payment', true);
    perform set_config('tkd.batch_id', gen_random_uuid()::text, true);

    insert into public.camp_payments
      (camper_id, kind, amount_cents, method, paid_on, school, recorded_at, recorded_by, recorded_by_name, reverses_payment_id)
    values
      (v_p.camper_id, 'reversal', -v_p.amount_cents, v_p.method, public.testing_today(), v_p.school, now(), auth.uid(),
       public.change_log_actor_name(), v_p.id);

    insert into public.camp_payments
      (camper_id, kind, amount_cents, method, paid_on, school, recorded_at, recorded_by, recorded_by_name)
    values
      (v_p.camper_id, 'payment', p_amount_cents, p_method, p_paid_on, p_school, now(), auth.uid(),
       public.change_log_actor_name())
    returning id into v_new_id;

    update public.camp_campers c
       set version = c.version + 1
     where c.id = v_p.camper_id
    returning c.version into v_version;

    perform set_config('tkd.action', '', true);
    perform set_config('tkd.batch_id', '', true);

    return jsonb_build_object('status', 'ok', 'payment_id', v_new_id, 'version', v_version);
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

revoke execute on function public.camp_edit_payment(uuid, text, integer, date, text) from public, anon, authenticated, service_role;
grant  execute on function public.camp_edit_payment(uuid, text, integer, date, text) to authenticated;

-- 21b. camp_public_signup_core(...) - the inside of 21c (internal; nobody
-- can call it). Steps, in this order (contract §1.16):
--   1. the camp by its code                            -> not_found
--   2. the children list's shape (1j), before any conversion -> invalid
--   3. this submission_id already signed up FOR THIS CAMP -> the same ok
--      answer again (a double tap or a retry never makes two); for
--      ANOTHER camp -> invalid (never its details)
--   4. lock the camp, read it again
--   5. the state right now: not_open (+ opens_on) / closed (+ closed_on,
--      null when closed by hand) / finished
--   6. the other input: client key, names, phones, relationships, paying
--      by, the tick, the signature, the wording version, the waiver
--      version, the expected total                    -> invalid
--   7. rate limit: 30 tries from this client key in the last hour (in
--      camp_public_attempts only) -> rate_limited. 200 tries for this camp
--      in the last hour is only written to the database log
--   8. the camp changed while the family filled in the form: a day or
--      extra id that isn't this camp's (any more), an extra chosen on a
--      day it is no longer offered on (only_on), an age outside the
--      camp's CURRENT range, or a different waiver ->
--      {"status":"camp_changed","camp": <the camp_public_camp answer>}
--   9. the extra rules (19c)                           -> invalid
--  10. the prices at today's early / regular, each week priced on its own
--      and added up (0022, R3, 2b); a child over $10,000 (0022: was $2,000) ->
--      invalid; a family total different from what the page showed ->
--      {"status":"price_changed","new_total_cents","old_total_cents","camp"}
--  11. the write, by "Family form": sign-up (with the waiver copy),
--      campers, day rows, extra rows with their prices, possible-duplicate
--      marks (silent). A concurrent call with the same submission_id that
--      hits the unique rule is answered like step 3.
--  12. the ok answer (17h)
create or replace function public.camp_public_signup_core(
  p_code                 text,
  p_client_key           text,
  p_submission_id        uuid,
  p_children             jsonb,
  p_parent_name          text,
  p_parent_phone         text,
  p_parent_relation      text,
  p_emergency_name       text,
  p_emergency_phone      text,
  p_emergency_relation   text,
  p_paying_by            text,
  p_acknowledged         boolean,
  p_signature            text,
  p_ack_version          text,
  p_waiver_version       text,
  p_expected_total_cents integer
)
returns jsonb
language plpgsql
volatile
set search_path = ''
as $$
declare
  v_c          public.camps;
  v_state      text;
  v_today      date;
  v_found_id   uuid;
  v_found_camp uuid;
  v_child      record;
  v_day_ids    uuid[];
  v_kind       text;
  v_base       integer;
  v_child_cts  integer;
  v_family     integer := 0;
  v_bases      integer[] := '{}';
  v_signup_id  uuid;
  v_camper_id  uuid;
  v_dup        uuid;
  v_n          integer;
  v_constraint text;
begin
  -- 0. wait at most 3 seconds for a lock (e.g. a staff member's Edit camp
  --    holding the camp row). Without this the call would wait until the
  --    login's 5-second statement_timeout cancels it, and a cancelled call
  --    writes no attempt row. With it, the wait ends with
  --    lock_not_available, which 21c answers as invalid AND counts.
  --    ("true" = for this transaction only.)
  perform set_config('lock_timeout', '3s', true);

  -- 1. the camp
  if p_code is null or p_code !~ '^[a-hjkmnp-z2-9]{8}$' then
    return jsonb_build_object('status', 'not_found');
  end if;
  select * into v_c from public.camps c where c.public_code = p_code;
  if not found then
    return jsonb_build_object('status', 'not_found');
  end if;

  -- 2. the children's shape, before anything is converted
  if not public.camp_children_arg_is_valid(p_children) then
    return jsonb_build_object('status', 'invalid');
  end if;

  -- 3. already signed up with this submission id?
  if p_submission_id is not null then
    select s.id, s.camp_id into v_found_id, v_found_camp
      from public.camp_signups s where s.submission_id = p_submission_id;
    if found then
      if v_found_camp <> v_c.id then
        return jsonb_build_object('status', 'invalid');
      end if;
      return public.camp_public_signup_answer(v_found_id);
    end if;
  end if;

  -- 4. lock the camp (as every camper write does), then read it again
  select * into v_c from public.camps c where c.id = v_c.id for no key update;
  if not found then
    return jsonb_build_object('status', 'not_found');
  end if;

  -- 5. open right now?
  v_today := public.testing_today();
  v_state := public.camp_signup_state(v_c.id, v_today);
  if v_state = 'not_open_yet' then
    return jsonb_build_object('status', 'not_open', 'opens_on', v_c.signup_opens_on);
  elsif v_state = 'closed' then
    return jsonb_build_object('status', 'closed',
                              'closed_on', case when v_c.closed_by_hand then null else v_c.signup_closes_on end);
  elsif v_state = 'finished' then
    return jsonb_build_object('status', 'finished');
  end if;

  -- 6. the other input
  if p_client_key is null or char_length(p_client_key) not between 1 and 200
     or p_submission_id is null
     or not public.testing_name_is_valid(p_parent_name)
     or not public.testing_name_is_valid(p_emergency_name)
     or p_parent_phone is null or p_parent_phone !~ '^[0-9]{10}$'
     or p_emergency_phone is null or p_emergency_phone !~ '^[0-9]{10}$'
     or not public.testing_line_is_valid(p_parent_relation, 40)
     or not public.testing_line_is_valid(p_emergency_relation, 40)
     or p_paying_by is null or p_paying_by not in ('cash', 'check', 'card')
     or p_acknowledged is not true
     or not public.testing_signature_is_valid(p_signature)
     or p_ack_version is distinct from 'camp-2026-10-18'
     or p_waiver_version is null or p_waiver_version !~ '^[0-9a-f]{32}$'
     or p_expected_total_cents is null
     or exists (select 1 from jsonb_array_elements(p_children) as x(value)
                 where not public.testing_name_is_valid(x.value ->> 'first_name')
                    or not public.testing_name_is_valid(x.value ->> 'last_name')) then
    return jsonb_build_object('status', 'invalid');
  end if;

  -- 7. rate limit (this call's own row is written afterwards by 21c)
  select count(*) into v_n
    from public.camp_public_attempts a
   where a.client_key = p_client_key and a.at > now() - interval '1 hour';
  if v_n >= 30 then
    return jsonb_build_object('status', 'rate_limited');
  end if;
  select count(*) into v_n
    from public.camp_public_attempts a
   where a.camp_id = v_c.id and a.at > now() - interval '1 hour';
  if v_n >= 200 then
    raise log 'camp_public_signup: camp % had % form attempts in the last hour', v_c.id, v_n;
  end if;

  -- 8. did the camp change while the family filled in the form?
  if p_waiver_version <> md5(v_c.waiver_text)
     or exists (select 1 from jsonb_array_elements(p_children) as x(value)
                 where (x.value ->> 'age')::integer not between v_c.min_age and v_c.max_age)
     or exists (select 1
                  from jsonb_array_elements(p_children) as x(value),
                       jsonb_array_elements(x.value -> 'day_ids') as y(value)
                 where not exists (select 1 from public.camp_days d
                                    where d.camp_id = v_c.id and d.id = (y.value #>> '{}')::uuid))
     or exists (select 1
                  from jsonb_array_elements(p_children) as x(value),
                       public.camp_extra_rows(x.value -> 'extras') as r
                 where not exists (select 1 from public.camp_extras e where e.camp_id = v_c.id and e.id = r.extra_id)
                    or (r.day_id is not null
                        and not exists (select 1 from public.camp_days d where d.camp_id = v_c.id and d.id = r.day_id))
                    or (r.day_id is not null
                        and exists (select 1 from public.camp_extras e join public.camp_days d on d.id = r.day_id
                                     where e.id = r.extra_id and e.per = 'day' and cardinality(e.only_on) > 0
                                       and not (d.day = any (e.only_on))))) then
    return jsonb_build_object('status', 'camp_changed', 'camp', public.camp_public_camp_answer(v_c.id));
  end if;

  -- 9. the extra rules, child by child
  for v_child in select x.value as c from jsonb_array_elements(p_children) as x(value) loop
    v_day_ids := array(select (y.value #>> '{}')::uuid from jsonb_array_elements(v_child.c -> 'day_ids') as y(value));
    if not public.camp_camper_extras_are_ok(v_c.id, v_day_ids, v_child.c -> 'extras') then
      return jsonb_build_object('status', 'invalid');
    end if;
  end loop;

  -- 10. the prices (today's early / regular)
  v_kind := public.camp_price_kind(v_today, v_c.early_until);
  for v_child in select x.value as c from jsonb_array_elements(p_children) with ordinality as x(value, n) order by x.n loop
    -- 0022: per week (was the row for the total number of days)
    v_base := public.camp_weekly_base_cents(v_c.id,
                                            array(select (y.value #>> '{}')::uuid
                                                    from jsonb_array_elements(v_child.c -> 'day_ids') as y(value)),
                                            (v_child.c ->> 'member')::boolean, v_kind);
    if v_base is null then
      return jsonb_build_object('status', 'invalid');
    end if;
    v_child_cts := v_base + public.camp_extras_cents_now(v_child.c -> 'extras');
    if v_child_cts > 1000000 then   -- 0022: was 200000
      return jsonb_build_object('status', 'invalid');
    end if;
    v_bases  := v_bases || v_base;
    v_family := v_family + v_child_cts;
  end loop;
  if v_family <> p_expected_total_cents then
    return jsonb_build_object('status', 'price_changed', 'new_total_cents', v_family,
                              'old_total_cents', p_expected_total_cents,
                              'camp', public.camp_public_camp_answer(v_c.id));
  end if;

  -- 11. write
  perform set_config('tkd.actor_label', 'Family form', true);
  perform set_config('tkd.action', 'camp_public_signup', true);
  perform set_config('tkd.batch_id', gen_random_uuid()::text, true);

  begin
    insert into public.camp_signups
      (camp_id, submission_id, parent_name, parent_relation, parent_phone, emergency_name, emergency_relation,
       emergency_phone, price_kind, signed_up_on, signature, signed_at, waiver_text_signed, ack_version,
       created_by_name, updated_by_name)
    values
      (v_c.id, p_submission_id, public.testing_normalize_name(p_parent_name),
       public.testing_normalize_name(p_parent_relation), p_parent_phone,
       public.testing_normalize_name(p_emergency_name), public.testing_normalize_name(p_emergency_relation),
       p_emergency_phone, v_kind, v_today, p_signature, now(), v_c.waiver_text, p_ack_version, '', '')
    returning id into v_signup_id;
  exception
    when unique_violation then
      get stacked diagnostics v_constraint = constraint_name;
      if v_constraint is distinct from 'camp_signups_submission_id_key' then
        raise;
      end if;
      -- another call with the same submission id got there first
      select s.id, s.camp_id into v_found_id, v_found_camp
        from public.camp_signups s where s.submission_id = p_submission_id;
      if not found or v_found_camp <> v_c.id then
        return jsonb_build_object('status', 'invalid');
      end if;
      return public.camp_public_signup_answer(v_found_id);
  end;

  for v_child in select x.value as c, x.n from jsonb_array_elements(p_children) with ordinality as x(value, n) order by x.n loop
    v_dup := public.camp_find_duplicate(v_c.id, null, v_child.c ->> 'first_name', v_child.c ->> 'last_name');
    insert into public.camp_campers
      (signup_id, camp_id, position, first_name, last_name, age, member, paying_by, base_cents,
       duplicate_state, duplicate_of, created_by_name, updated_by_name)
    values
      (v_signup_id, v_c.id, v_child.n::smallint,
       public.testing_normalize_name(v_child.c ->> 'first_name'), public.testing_normalize_name(v_child.c ->> 'last_name'),
       (v_child.c ->> 'age')::smallint, (v_child.c ->> 'member')::boolean, p_paying_by, v_bases[v_child.n],
       case when v_dup is null then 'none' else 'possible' end, v_dup, '', '')
    returning id into v_camper_id;

    insert into public.camp_camper_days (camper_id, day_id)
    select v_camper_id, (y.value #>> '{}')::uuid
      from jsonb_array_elements(v_child.c -> 'day_ids') as y(value);

    insert into public.camp_camper_extras (camper_id, extra_id, day_id, price_cents)
    select v_camper_id, r.extra_id, r.day_id, e.price_cents
      from public.camp_extra_rows(v_child.c -> 'extras') as r
      join public.camp_extras e on e.id = r.extra_id
     order by e.sort, r.day_id;
  end loop;

  perform set_config('tkd.action', '', true);
  perform set_config('tkd.batch_id', '', true);

  -- 12. the answer
  return public.camp_public_signup_answer(v_signup_id);
end;
$$;

revoke execute on function public.camp_public_signup_core(text, text, uuid, jsonb, text, text, text, text, text, text,
  text, boolean, text, text, text, integer) from public, anon, authenticated, service_role;



-- ---------------------------------------------------------------------
-- 6. The existing data, once (re-running finds nothing more to do).
--    Written as the SQL Editor's own role, tagged so the history
--    (change_log) shows "Migration 0022" as who and "0022_weekly_pricing"
--    as the action, all in one batch.
--   a. a price grid row above the camp's W (R2) goes - the old grid had a
--      row for every number of days up to the camp's length, so rows
--      1 ... W are all there already and keep their prices. The camp's
--      version goes up, so an Edit camp screen open right now answers
--      "stale" instead of saving the old grid. Campers' prices are
--      snapshots and do not change.
--   b. a template whose day_count is over 7 (the old "days of the camp",
--      8-10) becomes least(day_count, 7) = 7 days a week with its grid
--      rows 1-7 (an admin can change it in Edit template). A template of
--      1-7 days keeps its grid; its number now reads as "days a week".
-- ---------------------------------------------------------------------
do $$
begin
  perform set_config('tkd.actor_label', 'Migration 0022', true);
  perform set_config('tkd.action', '0022_weekly_pricing', true);
  perform set_config('tkd.batch_id', gen_random_uuid()::text, true);

  -- 6a.
  with gone as (
    delete from public.camp_prices p
     where p.day_count > public.camp_week_size(array(select d.day from public.camp_days d where d.camp_id = p.camp_id))
    returning p.camp_id
  )
  update public.camps c
     set version = c.version + 1
   where c.id in (select g.camp_id from gone as g);

  -- 6b.
  update public.camp_templates t
     set day_count = least(t.day_count, 7),
         prices    = coalesce((select jsonb_agg(x.value order by (x.value ->> 'day_count')::integer)
                                 from jsonb_array_elements(t.prices) as x(value)
                                where (x.value ->> 'day_count')::integer <= least(t.day_count, 7)), '[]'::jsonb)
   where t.day_count > 7;

  perform set_config('tkd.actor_label', '', true);
  perform set_config('tkd.action', '', true);
  perform set_config('tkd.batch_id', '', true);
end
$$;


-- ---------------------------------------------------------------------
-- 7. Table rules ("drop constraint if exists" + add = replace; each is
--    checked against every existing row when it is added)
-- ---------------------------------------------------------------------

-- 7a. a price grid row is for 1-7 days (one week at most - R2)
alter table public.camp_prices drop constraint if exists camp_prices_day_count_check;
alter table public.camp_prices add constraint camp_prices_day_count_check check (day_count between 1 and 7);

-- 7b. a template's number of days is "days a week", 1-7 (R7); its set-up
--     rule (0013's, now with the 1-7 grid of 3) is checked again on every
--     template
alter table public.camp_templates drop constraint if exists camp_templates_day_count_check;
alter table public.camp_templates add constraint camp_templates_day_count_check check (day_count between 1 and 7);
alter table public.camp_templates drop constraint if exists camp_templates_setup_check;
alter table public.camp_templates add constraint camp_templates_setup_check
  check (public.camp_template_setup_is_valid(day_count, prices, extras));

-- 7c. one camper's base price: $0 - $10,000 (R5)
alter table public.camp_campers drop constraint if exists camp_campers_base_check;
alter table public.camp_campers add constraint camp_campers_base_check check (base_cents between 0 and 1000000);

-- 7d. a payment: 1 cent - $10,000; a reversal exactly the other way (R5)
alter table public.camp_payments drop constraint if exists camp_payments_kind_check;
alter table public.camp_payments add constraint camp_payments_kind_check
  check ((kind = 'payment' and amount_cents between 1 and 1000000 and reverses_payment_id is null)
         or (kind = 'reversal' and amount_cents between -1000000 and -1 and reverses_payment_id is not null));

-- 7e. Finance's snapshot of a closed day copies each payment's amount, so
--     its rule must allow a $10,000 camp payment too (only widened: Color
--     Belt and Star payments stay at $1,000 by their own tables' rules).
--     Same name and shape as 0017's version; 0017's functions untouched.
alter table public.finance_day_closing_items drop constraint if exists finance_day_closing_items_amount_check;
alter table public.finance_day_closing_items add constraint finance_day_closing_items_amount_check
  check (amount_cents between -1000000 and 1000000 and amount_cents <> 0);

comment on table public.camp_prices is
  'Camp price grid (per week, rulebook v0.717): one row per number of days in a week, 1 ... W (W = the most camp days in one Monday-Sunday week). A camper pays each week''s row, added up. Edits never change existing campers (their prices are snapshots).';


commit;

-- End of 0022_camps_weekly_pricing.sql
