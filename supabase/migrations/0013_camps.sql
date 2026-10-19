-- =====================================================================
-- 0013_camps.sql
-- ---------------------------------------------------------------------
-- WHAT THIS FILE IS
--   A database migration for the TKD staff dashboard: the Camps section
--   (build contract docs/Dashboard Docs/Build contracts/CONTRACT-0013.md,
--   section 1). It runs after 0001-0006 and 0010 (all live) and changes
--   NOTHING they made. It only uses a few of their helpers (from 0003 and
--   0005): today's school date, the name and price rules, the signature
--   rule, the link-code maker, the history writer and has_data_access().
--   (0007-0012 are taken by other sections; this file doesn't need them.)
--
-- WHY IT EXISTS
--   Admins create a CAMP (1 to 10 days, held at one school, optionally
--   "for both schools"), set its prices in a small grid (one row per
--   number of days, member / non-member, early / regular) plus a list of
--   EXTRAS (early drop-off per day, a pizza party once ...) and the ages it
--   takes. They can save a camp as a TEMPLATE. Each camp gets one link;
--   families sign up 1 to 3 children on their phone (no login), with a
--   parent, an emergency contact and a drawn signature, and pay at the
--   school. Staff check the children in each camp day and mark them paid.
--   Like Color Belt's family form (0005), this lets something reach the
--   database WITHOUT a staff sign-in, so the public part is locked down
--   hard (section 13): its own restricted login, two functions, every
--   rule checked again here.
--
-- WHAT IT ADDS
--   1. small rule helpers (section 1)
--   2. public.camps               one camp (school, hours, sign-up dates,
--                                 ages, description, waiver, link code)
--   3. public.camp_days           the camp's days (1 to 10, any dates)
--   4. public.camp_prices         the price grid: one row per number of days
--   5. public.camp_extras         the extras (0 to 10)
--   6. public.camp_templates      saved set-ups (everything but dates)
--   7. public.camp_signups        one family's sign-up (parent, emergency
--                                 contact, signature, early / regular)
--   8. public.camp_campers        one child of a sign-up (1 to 3 per sign-up)
--   9. public.camp_camper_days    the days a child comes, with check-in
--  10. public.camp_camper_extras  the extras a child chose, with the price
--                                 at the time (a "snapshot")
--  11. public.camp_payments       payments, append-only (a mistake is fixed
--                                 by a "reversal" row, never by changing or
--                                 removing a row) - a copy of 0005's
--  12. public.camp_public_attempts every call of the family form, for the
--                                 rate limit (no names, no raw IPs)
--  13. a read-only view public.camp_roster (one row per child, never the
--      phones, the signature or the waiver copy)
--  14. 18 staff functions + camp_camper_detail (the ONLY way to write, and
--      the only way to see phones), and 2 public functions for the form
--  15. a restricted login role, camps_registrar, that can run exactly the
--      2 public functions and nothing else (its password is NOT in this
--      file - see supabase/SETUP.md, "Migration 0013: Camps")
--
-- HOW TO RUN IT
--   Supabase dashboard -> SQL Editor -> New query -> paste this WHOLE file
--   -> Run. It starts with "begin;" and ends with "commit;", so it is one
--   transaction: if any statement fails, nothing is kept.
--   Supabase will warn about DESTRUCTIVE OPERATIONS. That is expected: the
--   words appear inside rules ("on delete cascade"), inside functions that
--   run later (an admin removing a camp, a camper, a template, a camp day
--   or an extra; old rate-limit rows being cleaned up) and in "... if
--   exists" lines that make re-running safe. Nothing is removed now.
--   Confirm.
--   (Claude's Supabase connection refuses SQL containing those words, which
--   is why this file is pasted by hand.)
--   Safe to run again: "create table if not exists", "create or replace
--   function/view", rules and triggers replaced with "... if exists" +
--   create, the role created only if it is missing. Running it twice
--   changes no row and no fingerprint (tested in PGlite).
--
-- WORDS USED BELOW
--   * "today" = the date in Massachusetts: public.testing_today() (0005).
--     No other time zone is used anywhere.
--   * "first day" / "last day" = the earliest / latest camp_days.day of the
--     camp. "camp week" = first day <= today <= last day.
--   * "active" camper = status 'active' (not withdrawn).
--   * "all days" = the camper comes on every day of the camp.
--   * "snapshot": a camper's prices (base_cents and each extra row's
--     price_cents) are written when they sign up and are NEVER changed by a
--     later price edit on the camp. Only a change to that camper's own days,
--     member box or extras (Edit details) prices the whole camper again at
--     the camp's current prices (rulebook v0.700, "re-price rule").
--   * "state" of a camp's sign-up (open, closed ...) is never stored; it is
--     worked out from the dates and the "closed by hand" switch by
--     camp_signup_state (section 5).
--   * "version", "stale", "lock", "security definer", search_path = '':
--     the same meaning as in 0003 (read its header).
--   * statuses the functions answer: ok, no_access, not_allowed, not_found,
--     stale, duplicate_name, invalid, not_empty, finished, already_paid,
--     withdrawn, checked_in, future_day, rate_limited, not_open, closed,
--     price_changed, camp_changed.
-- =====================================================================

begin;


-- ---------------------------------------------------------------------
-- 1. Small rule helpers (used by the table rules below, so they come
--    first). Nobody in the app can call them. Every one of them answers
--    true / false and NEVER raises an error for bad input: jsonb is
--    checked with jsonb_typeof and patterns BEFORE anything is converted.
-- ---------------------------------------------------------------------

-- 1a. camp_text_is_valid(p_text, p_max) - a text of several lines (the
-- camp description, the waiver): after 0005's tidying (testing_normalize_note:
-- Windows line breaks become \n, spaces at the ends removed) 1 to p_max
-- characters, no invisible characters except tab and line break.
-- The same rule as 0005's testing_note_is_valid, with its own length cap.
-- NULL -> false.
create or replace function public.camp_text_is_valid(p_text text, p_max integer)
returns boolean
language sql
immutable
set search_path = ''
as $$
  select coalesce(
           p_text is not null
           and p_max is not null
           and public.testing_normalize_note(p_text) is not null
           and char_length(public.testing_normalize_note(p_text)) <= p_max
           and public.testing_normalize_note(p_text)
               !~ '[\x01-\x08\x0b-\x1f\x7f-\x9f​-‏‪-‮⁠-⁤⁦-⁩﻿]',
         false);
$$;

revoke execute on function public.camp_text_is_valid(text, integer) from public, anon, authenticated, service_role;

-- 1b. camp_days_arg_is_valid(p_days) - the list of camp days the Add /
-- Edit camp dialog sends: a plain one-dimensional list of 1 to 10 dates,
-- no empty entry, no date twice.
create or replace function public.camp_days_arg_is_valid(p_days date[])
returns boolean
language sql
immutable
set search_path = ''
as $$
  select coalesce(
           p_days is not null
           and array_ndims(p_days) = 1
           and cardinality(p_days) between 1 and 10
           and not exists (select 1 from unnest(p_days) as x(d) where x.d is null)
           and (select count(distinct x.d) from unnest(p_days) as x(d)) = cardinality(p_days),
         false);
$$;

revoke execute on function public.camp_days_arg_is_valid(date[]) from public, anon, authenticated, service_role;

-- 1c. camp_uuid_text_is_valid(p_text) - an id written out in full INSIDE a
-- jsonb value (e.g. a day id in the family form's list), checked before
-- it is ever converted to a uuid. Capital or small letters.
create or replace function public.camp_uuid_text_is_valid(p_text text)
returns boolean
language sql
immutable
set search_path = ''
as $$
  select coalesce(p_text ~* '^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$', false);
$$;

revoke execute on function public.camp_uuid_text_is_valid(text) from public, anon, authenticated, service_role;

-- 1d. camp_int_text_is_valid(p_json, p_min, p_max) - one jsonb value that
-- must be a WHOLE number from p_min to p_max: it must be a jsonb number,
-- its text must be digits only (so 9.5, 1e9 and "9" are refused), at most
-- 6 digits (so converting it can never overflow), then the range.
create or replace function public.camp_int_text_is_valid(p_json jsonb, p_min integer, p_max integer)
returns boolean
language plpgsql
immutable
set search_path = ''
as $$
declare
  v_txt text;
begin
  -- one test per statement: the text is only converted once the pattern
  -- has passed (a conversion inside the same test could run first)
  if jsonb_typeof(p_json) is distinct from 'number' then
    return false;
  end if;
  v_txt := p_json::text;
  if v_txt !~ '^-?[0-9]{1,6}$' then
    return false;
  end if;
  return coalesce(v_txt::integer between p_min and p_max, false);
end;
$$;

revoke execute on function public.camp_int_text_is_valid(jsonb, integer, integer) from public, anon, authenticated, service_role;

-- 1e. camp_time_is_valid(p_time) - camp hours are on a 5-minute step
-- (9:00, 9:05 ...) with no seconds.
create or replace function public.camp_time_is_valid(p_time time)
returns boolean
language sql
immutable
set search_path = ''
as $$
  select coalesce(extract(second from p_time) = 0 and extract(minute from p_time)::integer % 5 = 0, false);
$$;

revoke execute on function public.camp_time_is_valid(time) from public, anon, authenticated, service_role;

-- 1f. camp_prices_arg_is_valid(p_prices, p_day_count) - the price grid:
--   [{"day_count": 1, "member_early_cents": 7500, "member_regular_cents": 8000,
--     "nonmember_early_cents": 8500, "nonmember_regular_cents": 9000}, ...]
-- exactly one object for each day count 1 ... p_day_count (any order),
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
  if p_prices is null or p_day_count is null or p_day_count not between 1 and 10
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

-- 1g. camp_extras_arg_is_valid(p_extras, p_kind) - the extras list:
--   [{"name": "Early drop-off, 7:30-9:00 AM", "price_cents": 1500,
--     "per": "day", "not_for_all_days": false, "only_on": [...]}, ...]
-- 0 to 10 objects. Always these 4 keys: name (one line of 1 to 60
-- characters, no two the same ignoring capitals and extra spaces),
-- price_cents (whole dollars $0-$1,000), per ('once' or 'day') and
-- not_for_all_days (true / false). Optional keys, by p_kind:
--   'camp'       (Add camp)  "only_on": the camp days it is offered on -
--                its CONTENT is checked separately by camp_extras_only_on_ok
--                (19e), which answers {status:'invalid', field:'extras'}
--   'camp_edit'  (Edit camp) the same, plus "id": "<uuid>" or null (an
--                existing extra; ids never repeated)
--   'template'   (templates) "only_weekdays": the weekdays it is offered
--                on, ISO numbers 1 = Mon ... 7 = Sun, none twice; only for
--                a per-day extra; [] or missing = every day
-- Any other key -> false. The position in the list is the extra's order on
-- the form (there is no sort key).
create or replace function public.camp_extras_arg_is_valid(p_extras jsonb, p_kind text)
returns boolean
language plpgsql
immutable
set search_path = ''
as $$
declare
  v_item    jsonb;
  v_names   text[] := '{}';
  v_ids     text[] := '{}';
  v_name    text;
  v_allowed text[];
  v_w       jsonb;
  v_days    integer[];
begin
  if p_extras is null or p_kind is null or p_kind not in ('camp', 'camp_edit', 'template')
     or jsonb_typeof(p_extras) <> 'array'
     or jsonb_array_length(p_extras) > 10 then
    return false;
  end if;
  v_allowed := array['name', 'price_cents', 'per', 'not_for_all_days']
               || case p_kind when 'camp' then array['only_on']
                              when 'camp_edit' then array['only_on', 'id']
                              else array['only_weekdays'] end;
  for v_item in select x.value from jsonb_array_elements(p_extras) as x(value) loop
    if jsonb_typeof(v_item) <> 'object'
       or not (v_item ?& array['name', 'price_cents', 'per', 'not_for_all_days'])
       or exists (select 1 from jsonb_object_keys(v_item) as k where k <> all (v_allowed)) then
      return false;
    end if;
    if v_item ? 'id' and jsonb_typeof(v_item -> 'id') <> 'null' then
      if jsonb_typeof(v_item -> 'id') <> 'string'
         or not public.camp_uuid_text_is_valid(v_item ->> 'id')
         or lower(v_item ->> 'id') = any (v_ids) then
        return false;
      end if;
      v_ids := v_ids || lower(v_item ->> 'id');
    end if;
    if jsonb_typeof(v_item -> 'name') is distinct from 'string'
       or not public.testing_line_is_valid(v_item ->> 'name', 60)
       or not public.camp_int_text_is_valid(v_item -> 'price_cents', 0, 100000)
       or jsonb_typeof(v_item -> 'per') is distinct from 'string'
       or (v_item ->> 'per') not in ('once', 'day')
       or jsonb_typeof(v_item -> 'not_for_all_days') is distinct from 'boolean' then
      return false;
    end if;
    -- (converted only after the tests above passed)
    if not public.testing_cents_is_valid((v_item ->> 'price_cents')::integer) then
      return false;
    end if;
    if v_item ? 'only_weekdays' then
      if jsonb_typeof(v_item -> 'only_weekdays') <> 'array'
         or jsonb_array_length(v_item -> 'only_weekdays') > 7
         or (v_item ->> 'per' = 'once' and jsonb_array_length(v_item -> 'only_weekdays') > 0) then
        return false;
      end if;
      v_days := '{}';
      for v_w in select y.value from jsonb_array_elements(v_item -> 'only_weekdays') as y(value) loop
        if not public.camp_int_text_is_valid(v_w, 1, 7) then
          return false;
        end if;
        if (v_w::text)::integer = any (v_days) then
          return false;   -- a weekday twice
        end if;
        v_days := v_days || (v_w::text)::integer;
      end loop;
    end if;
    v_name := lower(public.testing_normalize_name(v_item ->> 'name'));
    if v_name = any (v_names) then
      return false;   -- two extras with the same name
    end if;
    v_names := v_names || v_name;
  end loop;
  return true;
end;
$$;

revoke execute on function public.camp_extras_arg_is_valid(jsonb, text) from public, anon, authenticated, service_role;

-- 1g2. camp_dates_are_sorted_set(p_dates) - a camp extra's only_on list
-- as stored: at most 10 dates, no empty entry, each date only once, in
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
           and cardinality(p_dates) <= 10
           and p_dates = array(select distinct x.d from unnest(p_dates) as x(d) where x.d is not null order by x.d),
         false);
$$;

revoke execute on function public.camp_dates_are_sorted_set(date[]) from public, anon, authenticated, service_role;

-- 1h. camp_uuid_list_is_valid(p_list, p_min, p_max) - (internal to 1i and
-- 1j) a jsonb list of p_min to p_max uuid strings, none repeated.
create or replace function public.camp_uuid_list_is_valid(p_list jsonb, p_min integer, p_max integer)
returns boolean
language plpgsql
immutable
set search_path = ''
as $$
declare
  v_item jsonb;
  v_seen text[] := '{}';
begin
  if p_list is null or jsonb_typeof(p_list) <> 'array'
     or jsonb_array_length(p_list) not between p_min and p_max then
    return false;
  end if;
  for v_item in select x.value from jsonb_array_elements(p_list) as x(value) loop
    if jsonb_typeof(v_item) <> 'string'
       or not public.camp_uuid_text_is_valid(v_item #>> '{}')
       or lower(v_item #>> '{}') = any (v_seen) then
      return false;
    end if;
    v_seen := v_seen || lower(v_item #>> '{}');
  end loop;
  return true;
end;
$$;

revoke execute on function public.camp_uuid_list_is_valid(jsonb, integer, integer) from public, anon, authenticated, service_role;

-- 1i. camp_camper_extras_arg_is_valid(p_extras) - one child's extras, as
-- the family form and Edit details send them:
--   [{"extra_id": "<uuid>", "day_ids": ["<uuid>", ...]},   (a per-day extra)
--    {"extra_id": "<uuid>", "day_ids": []}]                (a once extra)
-- 0 to 10 objects with exactly these 2 keys, extra_id a uuid string (no
-- extra twice), day_ids 0 to 10 uuid strings (none twice). Whether the
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
       or not public.camp_uuid_list_is_valid(v_item -> 'day_ids', 0, 10) then
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
-- 1 to 10 uuid strings (none twice), extras as 1i.
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
       or not public.camp_uuid_list_is_valid(v_item -> 'day_ids', 1, 10)
       or not public.camp_camper_extras_arg_is_valid(v_item -> 'extras') then
      return false;
    end if;
  end loop;
  return true;
end;
$$;

revoke execute on function public.camp_children_arg_is_valid(jsonb) from public, anon, authenticated, service_role;

-- 1k. camp_template_setup_is_valid(p_day_count, p_prices, p_extras) - a
-- template's number of days (1 to 10), price grid (1f, one row per day
-- count) and extras (1g, kind 'template': weekdays instead of dates, no
-- ids). Used by the templates table rule.
create or replace function public.camp_template_setup_is_valid(p_day_count integer, p_prices jsonb, p_extras jsonb)
returns boolean
language sql
immutable
set search_path = ''
as $$
  select coalesce(p_day_count between 1 and 10
                  and public.camp_prices_arg_is_valid(p_prices, p_day_count)
                  and public.camp_extras_arg_is_valid(p_extras, 'template'),
                  false);
$$;

revoke execute on function public.camp_template_setup_is_valid(integer, jsonb, jsonb) from public, anon, authenticated, service_role;

-- 1l. camp_price_kind(p_signed_up_on, p_early_until) - the early price
-- applies to sign-ups up to the END of the early date (Massachusetts
-- time); after it, the regular price. Mirrored by campRules.priceKind.
create or replace function public.camp_price_kind(p_signed_up_on date, p_early_until date)
returns text
language sql
immutable
set search_path = ''
as $$
  select case when p_signed_up_on <= p_early_until then 'early' else 'regular' end;
$$;

revoke execute on function public.camp_price_kind(date, date) from public, anon, authenticated, service_role;


-- ---------------------------------------------------------------------
-- 2. public.camps - one camp
--   * location_code: the school the camp is HELD AT (rulebook v0.234). An
--     admin may correct it later in Edit camp.
--   * both_schools: true = the camp is for both schools' families (it
--     shows in both schools' lists; member prices for members of either).
--   * name: same rule as class names; names may repeat (no unique rule).
--   * start_time / end_time: the daily hours, 5-minute steps, end after start.
--   * signup_opens_on / signup_closes_on: the family form is open from
--     the start of the first to the END of the second (Massachusetts time).
--     The closing date is never after the camp's last day (the functions
--     check that, because the days are in another table).
--   * early_until: the early price applies to sign-ups up to the end of
--     this day; never after the closing date.
--   * closed_by_hand: Close sign-up (staff or admin). Reopen clears it.
--   * min_age / max_age: the ages the family form accepts (1-99, v0.703).
--   * description (optional, up to 2000 characters) and waiver_text (up
--     to 8000), both several lines.
--   * public_code: the code in the family link /camp/<code>, made by
--     0005's testing_new_public_code. Never changes.
--   * version / created_* / updated_*: kept by the trigger (section 8).
-- ---------------------------------------------------------------------
create table if not exists public.camps (
  id               uuid        not null default gen_random_uuid(),
  location_code    text        not null,
  both_schools     boolean     not null default false,
  name             text        not null,
  start_time       time        not null,
  end_time         time        not null,
  signup_opens_on  date        not null,
  signup_closes_on date        not null,
  early_until      date        not null,
  closed_by_hand   boolean     not null default false,
  min_age          smallint    not null default 3,
  max_age          smallint    not null default 17,
  description      text        null,
  waiver_text      text        not null,
  public_code      text        not null,
  version          integer     not null default 1,
  created_at       timestamptz not null default now(),
  created_by       uuid        null,          -- login id; no foreign key on purpose (as 0003)
  created_by_name  text        not null,      -- set by the trigger (section 8)
  updated_at       timestamptz not null default now(),
  updated_by       uuid        null,
  updated_by_name  text        not null,

  constraint camps_pkey primary key (id),
  constraint camps_location_fk
    foreign key (location_code) references public.locations (code),
  constraint camps_name_check
    check (coalesce(public.testing_name_is_valid(name) and name = public.testing_normalize_name(name), false)),
  constraint camps_times_check
    check (end_time > start_time and public.camp_time_is_valid(start_time) and public.camp_time_is_valid(end_time)),
  constraint camps_signup_dates_check
    check (signup_opens_on <= signup_closes_on and early_until <= signup_closes_on),
  constraint camps_ages_check
    check (min_age between 1 and 99 and max_age between 1 and 99 and min_age <= max_age),
  constraint camps_description_check
    check (description is null
           or coalesce(public.camp_text_is_valid(description, 2000)
                       and description = public.testing_normalize_note(description), false)),
  constraint camps_waiver_check
    check (coalesce(public.camp_text_is_valid(waiver_text, 8000)
                    and waiver_text = public.testing_normalize_note(waiver_text), false)),
  constraint camps_public_code_key unique (public_code),
  constraint camps_public_code_check check (public_code ~ '^[a-hjkmnp-z2-9]{8}$'),
  constraint camps_version_check check (version >= 1)
);

-- The Camps list reads one school at a time (plus the Both camps).
create index if not exists camps_location_idx     on public.camps (location_code);
create index if not exists camps_both_schools_idx on public.camps (both_schools) where both_schools;

comment on table public.camps is
  'Camps. Sign-up state (open, closed ...) is derived by camp_signup_state, never stored. Written only through the camp_* functions.';
comment on column public.camps.public_code is
  'Code in the family link /camp/<code>: 8 characters a-z and 2-9 without i, l, o. Random, made by the database, never changes.';


-- ---------------------------------------------------------------------
-- 3. public.camp_days - the camp's days (1 to 10 per camp, checked by the
--    functions). They don't have to be next to each other (Thanksgiving:
--    Wed & Fri). Removing a camp removes its days.
-- ---------------------------------------------------------------------
create table if not exists public.camp_days (
  id      uuid not null default gen_random_uuid(),
  camp_id uuid not null,
  day     date not null,

  constraint camp_days_pkey primary key (id),
  constraint camp_days_camp_fk
    foreign key (camp_id) references public.camps (id) on delete cascade,
  constraint camp_days_camp_day_key unique (camp_id, day)
);

comment on table public.camp_days is
  'The days of a camp (1-10). Removed only by Edit camp (never while an active camper picked the day) or with the camp.';


-- ---------------------------------------------------------------------
-- 4. public.camp_prices - the price grid. One row per number of days
--    (1 ... the camp's number of days - the functions keep exactly that):
--    a child coming 3 days pays the 3-day row. Four prices per row:
--    member / non-member x early / regular, whole dollars $0-$1,000.
-- ---------------------------------------------------------------------
create table if not exists public.camp_prices (
  id                      uuid     not null default gen_random_uuid(),
  camp_id                 uuid     not null,
  day_count               smallint not null,
  member_early_cents      integer  not null,
  member_regular_cents    integer  not null,
  nonmember_early_cents   integer  not null,
  nonmember_regular_cents integer  not null,

  constraint camp_prices_pkey primary key (id),
  constraint camp_prices_camp_fk
    foreign key (camp_id) references public.camps (id) on delete cascade,
  constraint camp_prices_camp_count_key unique (camp_id, day_count),
  constraint camp_prices_day_count_check check (day_count between 1 and 10),
  constraint camp_prices_cents_check
    check (public.testing_cents_is_valid(member_early_cents)
           and public.testing_cents_is_valid(member_regular_cents)
           and public.testing_cents_is_valid(nonmember_early_cents)
           and public.testing_cents_is_valid(nonmember_regular_cents))
);

comment on table public.camp_prices is
  'Camp price grid: one row per number of days. Edits never change existing campers (their prices are snapshots).';


-- ---------------------------------------------------------------------
-- 5. public.camp_extras - the extras (0 to 10 per camp)
--   * per: 'once' (e.g. a pizza party) or 'day' (e.g. early drop-off, paid
--     for each day it is used)
--   * not_for_all_days: not offered to a child who comes every day (e.g.
--     the pizza party is part of the all-week price)
--   * only_on: the camp days (dates) a per-day extra is offered on, e.g.
--     "pizza on Wed and Fri"; empty = every camp day. A once extra always
--     has it empty. Sorted, no date twice, each one of the camp's days
--     (the trigger in section 13 checks that last rule). Families choose
--     it - it is never added by itself.
--   * sort: the order on the form (0, 1, 2 ...)
--   * names unique per camp ignoring capitals (the index below)
-- ---------------------------------------------------------------------
create table if not exists public.camp_extras (
  id               uuid     not null default gen_random_uuid(),
  camp_id          uuid     not null,
  name             text     not null,
  price_cents      integer  not null,
  per              text     not null,
  not_for_all_days boolean  not null default false,
  only_on          date[]   not null default '{}',
  sort             smallint not null,

  constraint camp_extras_pkey primary key (id),
  constraint camp_extras_camp_fk
    foreign key (camp_id) references public.camps (id) on delete cascade,
  constraint camp_extras_name_check
    check (coalesce(public.testing_line_is_valid(name, 60) and name = public.testing_normalize_name(name), false)),
  constraint camp_extras_price_check check (public.testing_cents_is_valid(price_cents)),
  constraint camp_extras_per_check check (per in ('once', 'day')),
  constraint camp_extras_sort_check check (sort between 0 and 9),
  constraint camp_extras_only_on_check
    check (public.camp_dates_are_sorted_set(only_on) and (per = 'day' or cardinality(only_on) = 0))
);

create unique index if not exists camp_extras_camp_lower_name_idx on public.camp_extras (camp_id, lower(name));

comment on table public.camp_extras is
  'Camp extras (once or per day). Edits never change existing campers (their extra rows keep the price at the time).';


-- ---------------------------------------------------------------------
-- 6. public.camp_templates - a saved camp set-up (everything except the
--    dates and the campers), shared by both schools.
--   * name: unique ignoring capitals and extra spaces (duplicate_name)
--   * day_count: how many days the camps made from it usually have
--   * opens / closes / early _days_before: the sign-up dates as "days
--     before the first camp day" (negative = after it). Each -365 ... 365;
--     the form opens no later than it closes, and the early price ends no
--     later than the closing date (named rule camp_templates_offsets_check;
--     the functions answer {status:'invalid', field:'offsets'} first)
--   * prices / extras: the grid and the extras as checked jsonb (1k);
--     a template extra keeps "only_weekdays" (1 = Mon ... 7 = Sun) instead
--     of dates - using a template maps them to the new camp's days
-- ---------------------------------------------------------------------
create table if not exists public.camp_templates (
  id                 uuid        not null default gen_random_uuid(),
  name               text        not null,
  location_code      text        not null,
  both_schools       boolean     not null,
  day_count          smallint    not null,
  start_time         time        not null,
  end_time           time        not null,
  opens_days_before  smallint    not null,
  closes_days_before smallint    not null,
  early_days_before  smallint    not null,
  min_age            smallint    not null,
  max_age            smallint    not null,
  description        text        null,
  waiver_text        text        not null,
  prices             jsonb       not null,
  extras             jsonb       not null,
  version            integer     not null default 1,
  created_at         timestamptz not null default now(),
  created_by         uuid        null,
  created_by_name    text        not null,
  updated_at         timestamptz not null default now(),
  updated_by         uuid        null,
  updated_by_name    text        not null,

  constraint camp_templates_pkey primary key (id),
  constraint camp_templates_location_fk
    foreign key (location_code) references public.locations (code),
  constraint camp_templates_name_check
    check (coalesce(public.testing_name_is_valid(name) and name = public.testing_normalize_name(name), false)),
  constraint camp_templates_day_count_check check (day_count between 1 and 10),
  constraint camp_templates_times_check
    check (end_time > start_time and public.camp_time_is_valid(start_time) and public.camp_time_is_valid(end_time)),
  constraint camp_templates_offsets_check
    check (opens_days_before between -365 and 365
           and closes_days_before between -365 and 365
           and early_days_before between -365 and 365
           and opens_days_before >= closes_days_before
           and early_days_before >= closes_days_before),
  constraint camp_templates_ages_check
    check (min_age between 1 and 99 and max_age between 1 and 99 and min_age <= max_age),
  constraint camp_templates_description_check
    check (description is null
           or coalesce(public.camp_text_is_valid(description, 2000)
                       and description = public.testing_normalize_note(description), false)),
  constraint camp_templates_waiver_check
    check (coalesce(public.camp_text_is_valid(waiver_text, 8000)
                    and waiver_text = public.testing_normalize_note(waiver_text), false)),
  constraint camp_templates_setup_check
    check (public.camp_template_setup_is_valid(day_count, prices, extras)),
  constraint camp_templates_version_check check (version >= 1)
);

create unique index if not exists camp_templates_lower_name_idx
  on public.camp_templates (lower(public.testing_normalize_name(name)));

comment on table public.camp_templates is
  'Saved camp set-ups (no dates, no campers), shared by both schools. Never linked to the camps made from them.';


-- ---------------------------------------------------------------------
-- 7. public.camp_signups - one family's sign-up (1 to 3 children)
--   * reference: "CP-4001", "CP-4002" ... from a counter, shown to the
--     family. Sequential, so there is never a public lookup by reference.
--   * submission_id: a random id the family's browser makes once per send;
--     a retry with the same id returns the same sign-up (no doubles).
--   * parent_* / emergency_*: name (up to 60), phone (10 digits),
--     relationship (up to 40). NOT readable by the app's normal rights:
--     only through camp_camper_detail (staff and admins, v0.700).
--   * price_kind: 'early' or 'regular', fixed at sign-up by the sign-up
--     date (signed_up_on, Massachusetts time). Never changes.
--   * signature: the drawn signature, a PNG data URL (0005's rule). NO
--     client role can ever read it. Removed automatically 3 years after
--     the camp's last day (signature_deleted_at says when).
--   * waiver_text_signed: a copy of the waiver the family signed (the camp's
--     waiver may change later). Not readable by the app.
--   * ack_version: which confirmation wording the family ticked.
-- ---------------------------------------------------------------------
create sequence if not exists public.camp_signup_ref_seq
  as bigint
  start with 4001;

create table if not exists public.camp_signups (
  id                   uuid        not null default gen_random_uuid(),
  camp_id              uuid        not null,
  reference            text        not null default ('CP-' || nextval('public.camp_signup_ref_seq'::regclass)::text),
  submission_id        uuid        not null,
  parent_name          text        not null,
  parent_relation      text        not null,
  parent_phone         text        not null,
  emergency_name       text        not null,
  emergency_relation   text        not null,
  emergency_phone      text        not null,
  price_kind           text        not null,
  signed_up_on         date        not null,
  signature            text        null,
  signed_at            timestamptz not null,
  signature_deleted_at timestamptz null,
  waiver_text_signed   text        not null,
  ack_version          text        not null,
  version              integer     not null default 1,
  created_at           timestamptz not null default now(),
  created_by           uuid        null,
  created_by_name      text        not null,
  updated_at           timestamptz not null default now(),
  updated_by           uuid        null,
  updated_by_name      text        not null,

  constraint camp_signups_pkey primary key (id),
  constraint camp_signups_camp_fk
    foreign key (camp_id) references public.camps (id) on delete cascade,
  constraint camp_signups_reference_key unique (reference),
  constraint camp_signups_reference_check check (reference ~ '^CP-[0-9]{4,}$'),
  constraint camp_signups_submission_id_key unique (submission_id),
  constraint camp_signups_parent_name_check
    check (coalesce(public.testing_name_is_valid(parent_name) and parent_name = public.testing_normalize_name(parent_name), false)),
  constraint camp_signups_emergency_name_check
    check (coalesce(public.testing_name_is_valid(emergency_name) and emergency_name = public.testing_normalize_name(emergency_name), false)),
  constraint camp_signups_parent_relation_check
    check (coalesce(public.testing_line_is_valid(parent_relation, 40) and parent_relation = public.testing_normalize_name(parent_relation), false)),
  constraint camp_signups_emergency_relation_check
    check (coalesce(public.testing_line_is_valid(emergency_relation, 40) and emergency_relation = public.testing_normalize_name(emergency_relation), false)),
  constraint camp_signups_phones_check
    check (parent_phone ~ '^[0-9]{10}$' and emergency_phone ~ '^[0-9]{10}$'),
  constraint camp_signups_price_kind_check check (price_kind in ('early', 'regular')),
  constraint camp_signups_signature_check
    check (signature is null or public.testing_signature_is_valid(signature)),
  -- the signature is there OR it was removed later (never both, never neither)
  constraint camp_signups_signature_state_check
    check ((signature is null) = (signature_deleted_at is not null)),
  constraint camp_signups_waiver_check check (public.camp_text_is_valid(waiver_text_signed, 8000)),
  constraint camp_signups_ack_check check (ack_version ~ '^camp-[0-9]{4}-[0-9]{2}-[0-9]{2}$'),
  constraint camp_signups_version_check check (version >= 1)
);

create index if not exists camp_signups_camp_idx on public.camp_signups (camp_id);

comment on table public.camp_signups is
  'Camp sign-ups (one per family form send). Phones only through camp_camper_detail; signature and waiver copy never readable by any client role; signature removed 3 years after the camp''s last day.';
comment on column public.camp_signups.signature is
  'Drawn signature (family form): data:image/png;base64,..., at most 70000 characters. Never granted to a client role; never copied into change_log.';


-- ---------------------------------------------------------------------
-- 8. public.camp_campers - one child of a sign-up
--   * camp_id: the sign-up's camp (the trigger checks; neither changes)
--   * position: 1, 2 or 3 - the child's place in the family's form
--   * names: name rule; age 1-99 (the camp's range binds only the form)
--   * member: U.S.T.C. member (member prices)
--   * paying_by: cash / check / card (Card is only a label, v0.233)
--   * base_cents: the grid price at the time (snapshot), 0-$2,000
--   * status: 'active' or 'withdrawn' (withdrawn_reason 'withdrawn' by
--     staff, or 'duplicate_copy' when a possible duplicate was resolved)
--   * withdrawn_by: the login id of whoever withdrew it. NOT readable by
--     the app; the database uses it for the staff Undo after "keep one".
--   * duplicate_state: 'none', 'possible' (another active camper at this
--     camp has the same name - duplicate_of points at it) or 'kept_both'
--     (staff said both are real; duplicate_of = the other one).
-- ---------------------------------------------------------------------
create table if not exists public.camp_campers (
  id                uuid        not null default gen_random_uuid(),
  signup_id         uuid        not null,
  camp_id           uuid        not null,
  position          smallint    not null,
  first_name        text        not null,
  last_name         text        not null,
  age               smallint    not null,
  member            boolean     not null,
  paying_by         text        not null,
  base_cents        integer     not null,
  status            text        not null default 'active',
  withdrawn_reason  text        null,
  withdrawn_at      timestamptz null,
  withdrawn_by      uuid        null,          -- login id; no foreign key on purpose (as 0003)
  withdrawn_by_name text        null,
  duplicate_state   text        not null default 'none',
  duplicate_of      uuid        null,
  version           integer     not null default 1,
  created_at        timestamptz not null default now(),
  created_by        uuid        null,
  created_by_name   text        not null,
  updated_at        timestamptz not null default now(),
  updated_by        uuid        null,
  updated_by_name   text        not null,

  constraint camp_campers_pkey primary key (id),
  constraint camp_campers_signup_fk
    foreign key (signup_id) references public.camp_signups (id) on delete cascade,
  constraint camp_campers_camp_fk
    foreign key (camp_id) references public.camps (id) on delete cascade,
  constraint camp_campers_duplicate_fk
    foreign key (duplicate_of) references public.camp_campers (id) on delete set null,
  constraint camp_campers_signup_position_key unique (signup_id, position),
  constraint camp_campers_position_check check (position between 1 and 3),
  constraint camp_campers_first_name_check
    check (coalesce(public.testing_name_is_valid(first_name) and first_name = public.testing_normalize_name(first_name), false)),
  constraint camp_campers_last_name_check
    check (coalesce(public.testing_name_is_valid(last_name) and last_name = public.testing_normalize_name(last_name), false)),
  constraint camp_campers_age_check check (age between 1 and 99),
  constraint camp_campers_paying_by_check check (paying_by in ('cash', 'check', 'card')),
  constraint camp_campers_base_check check (base_cents between 0 and 200000),
  constraint camp_campers_status_check
    check ((status = 'active' and num_nonnulls(withdrawn_reason, withdrawn_at, withdrawn_by, withdrawn_by_name) = 0)
           or (status = 'withdrawn' and withdrawn_reason in ('withdrawn', 'duplicate_copy')
               and withdrawn_at is not null and withdrawn_by_name is not null)),
  constraint camp_campers_duplicate_state_check
    check (duplicate_state in ('none', 'possible', 'kept_both')),
  constraint camp_campers_duplicate_self_check check (duplicate_of is distinct from id),
  constraint camp_campers_version_check check (version >= 1)
);

create index if not exists camp_campers_camp_idx      on public.camp_campers (camp_id);
create index if not exists camp_campers_duplicate_idx on public.camp_campers (duplicate_of) where duplicate_of is not null;
create index if not exists camp_campers_names_idx     on public.camp_campers (camp_id, lower(last_name), lower(first_name));

comment on table public.camp_campers is
  'Campers (one child of a sign-up). Prices are snapshots (base_cents + camp_camper_extras). Written only through the camp_* functions.';


-- ---------------------------------------------------------------------
-- 9. public.camp_camper_days - one row per camper per day they come, with
--    the daily check-in (v0.704): when and by whom (checked_in_by is a
--    login id, never readable by the app). No check-out.
--    The key to camp_days is "no action" (not "cascade"): a camp day an
--    active camper picked is never removed (camp_update_camp refuses; it
--    removes withdrawn campers' rows for the day first), and Delete camp
--    removes the campers - with these rows - before the camp's days. A
--    camp removed by hand in the SQL Editor while it has campers is
--    therefore refused (remove its campers first, or use the app).
-- ---------------------------------------------------------------------
create table if not exists public.camp_camper_days (
  id                 uuid        not null default gen_random_uuid(),
  camper_id          uuid        not null,
  day_id             uuid        not null,
  checked_in_at      timestamptz null,
  checked_in_by      uuid        null,
  checked_in_by_name text        null,

  constraint camp_camper_days_pkey primary key (id),
  constraint camp_camper_days_camper_fk
    foreign key (camper_id) references public.camp_campers (id) on delete cascade,
  constraint camp_camper_days_day_fk
    foreign key (day_id) references public.camp_days (id),
  constraint camp_camper_days_camper_day_key unique (camper_id, day_id),
  constraint camp_camper_days_check_in_check
    check ((checked_in_at is null) = (checked_in_by_name is null)
           and (checked_in_at is not null or checked_in_by is null))
);

create index if not exists camp_camper_days_day_idx on public.camp_camper_days (day_id);

comment on table public.camp_camper_days is
  'The days a camper comes, with the check-in time and who checked them in.';


-- ---------------------------------------------------------------------
-- 10. public.camp_camper_extras - the extras a camper chose, with the
--     price at the time (snapshot):
--     a 'once' extra -> exactly one row with day_id empty;
--     a 'day' extra  -> one row per day it is used, each one of the
--                       camper's days.
--     The keys to camp_extras / camp_days are "no action", as in section 9.
--     "unique nulls not distinct" = one row per camper + extra + day, and
--     only one "no day" row per once extra.
-- ---------------------------------------------------------------------
create table if not exists public.camp_camper_extras (
  id          uuid    not null default gen_random_uuid(),
  camper_id   uuid    not null,
  extra_id    uuid    not null,
  day_id      uuid    null,
  price_cents integer not null,

  constraint camp_camper_extras_pkey primary key (id),
  constraint camp_camper_extras_camper_fk
    foreign key (camper_id) references public.camp_campers (id) on delete cascade,
  constraint camp_camper_extras_extra_fk
    foreign key (extra_id) references public.camp_extras (id),
  constraint camp_camper_extras_day_fk
    foreign key (day_id) references public.camp_days (id),
  constraint camp_camper_extras_unique_key unique nulls not distinct (camper_id, extra_id, day_id),
  constraint camp_camper_extras_price_check check (public.testing_cents_is_valid(price_cents))
);

create index if not exists camp_camper_extras_extra_idx on public.camp_camper_extras (extra_id);
create index if not exists camp_camper_extras_day_idx   on public.camp_camper_extras (day_id) where day_id is not null;

comment on table public.camp_camper_extras is
  'Extras a camper chose (once: one row without a day; per day: one row per day), each with the price at the time.';


-- ---------------------------------------------------------------------
-- 11. public.camp_payments - append-only (a copy of 0005's testing_payments)
--   * kind 'payment': 1 cent to $2,000, no reverses_payment_id
--   * kind 'reversal': undoes one payment: exactly minus its amount,
--     reverses_payment_id = that payment (unique: reversed at most once)
--   * paid_on: the school date it was paid; recorded_at / by: when, who
--   Rows are never changed or removed (section 8), except inside
--   camp_delete_camper / camp_delete_camp (plan answer: Delete permanently).
-- ---------------------------------------------------------------------
create table if not exists public.camp_payments (
  id                  uuid        not null default gen_random_uuid(),
  camper_id           uuid        not null,
  kind                text        not null,
  amount_cents        integer     not null,
  method              text        not null,
  paid_on             date        not null,
  recorded_at         timestamptz not null default now(),
  recorded_by         uuid        null,       -- login id; not readable by the app
  recorded_by_name    text        not null,
  reverses_payment_id uuid        null,

  constraint camp_payments_pkey primary key (id),
  constraint camp_payments_camper_fk
    foreign key (camper_id) references public.camp_campers (id) on delete cascade,
  constraint camp_payments_reverses_fk
    foreign key (reverses_payment_id) references public.camp_payments (id),
  constraint camp_payments_reverses_key unique (reverses_payment_id),
  constraint camp_payments_kind_check
    check ((kind = 'payment' and amount_cents between 1 and 200000 and reverses_payment_id is null)
           or (kind = 'reversal' and amount_cents between -200000 and -1 and reverses_payment_id is not null)),
  constraint camp_payments_method_check check (method in ('cash', 'check', 'card'))
);

create index if not exists camp_payments_camper_idx on public.camp_payments (camper_id);

comment on table public.camp_payments is
  'Camp payments, append-only: corrections are reversal rows. Removed only by Delete camper / Delete camp.';


-- ---------------------------------------------------------------------
-- 12. public.camp_public_attempts - one row per call of the camp family
--     form (Camps' OWN ledger; Camps never writes into 0005's
--     testing_public_attempts). client_key: an HMAC the Cloudflare Function
--     makes from the visitor's IP with a secret - never the raw IP. Used
--     only to count tries per hour. Rows older than 2 days are removed by
--     camp_public_signup itself. Nobody in the app can read it (RLS on, no
--     rule, no grants); not part of the history (its id is a number).
-- ---------------------------------------------------------------------
create table if not exists public.camp_public_attempts (
  id         bigint      generated always as identity,
  client_key text        not null,
  camp_id    uuid        null,       -- no foreign key: the attempt outlives a removed camp
  at         timestamptz not null default now(),
  outcome    text        not null,   -- the status the call answered (ok, invalid, rate_limited ...)

  constraint camp_public_attempts_pkey primary key (id)
);

create index if not exists camp_public_attempts_client_idx on public.camp_public_attempts (client_key, at);
create index if not exists camp_public_attempts_camp_idx   on public.camp_public_attempts (camp_id, at);
create index if not exists camp_public_attempts_at_idx     on public.camp_public_attempts (at);

comment on table public.camp_public_attempts is
  'Rate-limit ledger for the camp family form (hashed client key, never a raw IP). Not readable by any client role; kept 2 days.';



-- ---------------------------------------------------------------------
-- 13. Trigger functions (run automatically on every write)
--     "Bookkeeping" columns = version, created_*, updated_*. On insert the
--     trigger sets them, whatever the writer supplied; on update created_*
--     never change and ANY other change bumps the version and stamps
--     "last changed by". A function may also ask for a bump on purpose by
--     writing version + 1 (e.g. Edit camp changing only the days, Mark
--     paid), so a second screen with the old version gets "stale".
--     Errors use errcode 23514 (check_violation) with a constraint name
--     saying which rule, like 0003 / 0005.
-- ---------------------------------------------------------------------

-- 13a. camps_before_write() - BEFORE INSERT OR UPDATE on camps.
-- id and public_code never change (the family link stays the same).
-- location_code and both_schools MAY change (an admin's correction).
-- Every change bumps the version - closed_by_hand included.
create or replace function public.camps_before_write()
returns trigger
language plpgsql
set search_path = ''
as $$
begin
  if tg_op = 'INSERT' then
    new.version         := 1;
    new.created_at      := now();
    new.updated_at      := now();
    new.created_by      := auth.uid();
    new.updated_by      := auth.uid();
    new.created_by_name := public.change_log_actor_name();
    new.updated_by_name := new.created_by_name;
    return new;
  end if;

  if new.id is distinct from old.id or new.public_code is distinct from old.public_code then
    raise exception using
      errcode    = '23514',
      constraint = 'camps_immutable',
      message    = 'a camp''s id and public_code can''t change';
  end if;

  new.created_at      := old.created_at;
  new.created_by      := old.created_by;
  new.created_by_name := old.created_by_name;

  if (to_jsonb(new) - array['version', 'created_at', 'created_by', 'created_by_name', 'updated_at', 'updated_by', 'updated_by_name'])
       is distinct from
     (to_jsonb(old) - array['version', 'created_at', 'created_by', 'created_by_name', 'updated_at', 'updated_by', 'updated_by_name'])
     or new.version is distinct from old.version then
    new.version         := old.version + 1;
    new.updated_at      := now();
    new.updated_by      := auth.uid();
    new.updated_by_name := public.change_log_actor_name();
  else
    new.version         := old.version;
    new.updated_at      := old.updated_at;
    new.updated_by      := old.updated_by;
    new.updated_by_name := old.updated_by_name;
  end if;
  return new;
end;
$$;

revoke execute on function public.camps_before_write() from public, anon, authenticated, service_role;

-- 13b. camp_templates_before_write() - the same bookkeeping for templates
-- (only the id never changes).
create or replace function public.camp_templates_before_write()
returns trigger
language plpgsql
set search_path = ''
as $$
begin
  if tg_op = 'INSERT' then
    new.version         := 1;
    new.created_at      := now();
    new.updated_at      := now();
    new.created_by      := auth.uid();
    new.updated_by      := auth.uid();
    new.created_by_name := public.change_log_actor_name();
    new.updated_by_name := new.created_by_name;
    return new;
  end if;

  if new.id is distinct from old.id then
    raise exception using
      errcode    = '23514',
      constraint = 'camp_templates_immutable',
      message    = 'a template''s id can''t change';
  end if;

  new.created_at      := old.created_at;
  new.created_by      := old.created_by;
  new.created_by_name := old.created_by_name;

  if (to_jsonb(new) - array['version', 'created_at', 'created_by', 'created_by_name', 'updated_at', 'updated_by', 'updated_by_name'])
       is distinct from
     (to_jsonb(old) - array['version', 'created_at', 'created_by', 'created_by_name', 'updated_at', 'updated_by', 'updated_by_name'])
     or new.version is distinct from old.version then
    new.version         := old.version + 1;
    new.updated_at      := now();
    new.updated_by      := auth.uid();
    new.updated_by_name := public.change_log_actor_name();
  else
    new.version         := old.version;
    new.updated_at      := old.updated_at;
    new.updated_by      := old.updated_by;
    new.updated_by_name := old.updated_by_name;
  end if;
  return new;
end;
$$;

revoke execute on function public.camp_templates_before_write() from public, anon, authenticated, service_role;

-- 13c. camp_parts_before_write() - BEFORE UPDATE on camp_days and
-- camp_prices: a row never moves to another camp (and its id never
-- changes). Everything else may be updated by Edit camp.
create or replace function public.camp_parts_before_write()
returns trigger
language plpgsql
set search_path = ''
as $$
begin
  if new.id is distinct from old.id or new.camp_id is distinct from old.camp_id then
    raise exception using
      errcode    = '23514',
      constraint = tg_table_name || '_immutable',
      message    = 'a camp''s day, price row or extra can''t move to another camp';
  end if;
  return new;
end;
$$;

revoke execute on function public.camp_parts_before_write() from public, anon, authenticated, service_role;

-- 13c2. camp_extras_before_write() - BEFORE INSERT OR UPDATE on extras:
-- an extra never moves to another camp, and every date in only_on is one
-- of its camp's days.
create or replace function public.camp_extras_before_write()
returns trigger
language plpgsql
set search_path = ''
as $$
begin
  if tg_op = 'UPDATE' and (new.id is distinct from old.id or new.camp_id is distinct from old.camp_id) then
    raise exception using
      errcode    = '23514',
      constraint = 'camp_extras_immutable',
      message    = 'a camp''s extra can''t move to another camp';
  end if;
  if exists (select 1 from unnest(new.only_on) as x(d)
              where not exists (select 1 from public.camp_days d where d.camp_id = new.camp_id and d.day = x.d)) then
    raise exception using
      errcode    = '23514',
      constraint = 'camp_extras_only_on_days',
      message    = 'an extra can only be offered on the camp''s own days';
  end if;
  return new;
end;
$$;

revoke execute on function public.camp_extras_before_write() from public, anon, authenticated, service_role;

-- 13d. camp_signups_before_write() - BEFORE INSERT OR UPDATE on sign-ups
--   insert: bookkeeping; signed_up_on = the school date of created_at
--   update: id, camp, reference, submission_id, price_kind, signed_up_on,
--           signed_at, the waiver copy and ack_version never change; the
--           signature can only be REMOVED (never replaced) and its removal
--           time set once. A change to ONLY signature / signature_deleted_at
--           (the 3-year clean-up) keeps the version and "last changed by".
create or replace function public.camp_signups_before_write()
returns trigger
language plpgsql
set search_path = ''
as $$
begin
  if tg_op = 'INSERT' then
    new.version         := 1;
    new.created_at      := now();
    new.updated_at      := now();
    new.created_by      := auth.uid();
    new.updated_by      := auth.uid();
    new.created_by_name := public.change_log_actor_name();
    new.updated_by_name := new.created_by_name;
    new.signed_up_on    := public.testing_school_date(new.created_at);
    return new;
  end if;

  if new.id is distinct from old.id
     or new.camp_id is distinct from old.camp_id
     or new.reference is distinct from old.reference
     or new.submission_id is distinct from old.submission_id
     or new.price_kind is distinct from old.price_kind
     or new.signed_up_on is distinct from old.signed_up_on
     or new.signed_at is distinct from old.signed_at
     or new.waiver_text_signed is distinct from old.waiver_text_signed
     or new.ack_version is distinct from old.ack_version
     or (new.signature is distinct from old.signature and new.signature is not null)
     or (new.signature_deleted_at is distinct from old.signature_deleted_at and old.signature_deleted_at is not null) then
    raise exception using
      errcode    = '23514',
      constraint = 'camp_signups_immutable',
      message    = 'this part of a sign-up can''t change';
  end if;

  new.created_at      := old.created_at;
  new.created_by      := old.created_by;
  new.created_by_name := old.created_by_name;

  if (to_jsonb(new) - array['signature', 'signature_deleted_at', 'version', 'created_at', 'created_by',
                            'created_by_name', 'updated_at', 'updated_by', 'updated_by_name'])
       is distinct from
     (to_jsonb(old) - array['signature', 'signature_deleted_at', 'version', 'created_at', 'created_by',
                            'created_by_name', 'updated_at', 'updated_by', 'updated_by_name'])
     or new.version is distinct from old.version then
    new.version         := old.version + 1;
    new.updated_at      := now();
    new.updated_by      := auth.uid();
    new.updated_by_name := public.change_log_actor_name();
  else
    new.version         := old.version;
    new.updated_at      := old.updated_at;
    new.updated_by      := old.updated_by;
    new.updated_by_name := old.updated_by_name;
  end if;
  return new;
end;
$$;

revoke execute on function public.camp_signups_before_write() from public, anon, authenticated, service_role;

-- 13e. camp_campers_before_write() - BEFORE INSERT OR UPDATE on campers
--   insert: camp_id must be the sign-up's camp; bookkeeping
--   update: id, signup_id and camp_id never change; bookkeeping.
--   (The camp check runs on insert only: when a whole camp is removed,
--   "on delete set null" on duplicate_of updates rows whose sign-up is
--   already gone in the same step.)
create or replace function public.camp_campers_before_write()
returns trigger
language plpgsql
set search_path = ''
as $$
begin
  if tg_op = 'INSERT' then
    if not exists (select 1 from public.camp_signups s where s.id = new.signup_id and s.camp_id = new.camp_id) then
      raise exception using
        errcode    = '23514',
        constraint = 'camp_campers_signup_camp',
        message    = 'a camper''s camp must be its sign-up''s camp';
    end if;
    new.version         := 1;
    new.created_at      := now();
    new.updated_at      := now();
    new.created_by      := auth.uid();
    new.updated_by      := auth.uid();
    new.created_by_name := public.change_log_actor_name();
    new.updated_by_name := new.created_by_name;
    return new;
  end if;

  if new.id is distinct from old.id
     or new.signup_id is distinct from old.signup_id
     or new.camp_id is distinct from old.camp_id then
    raise exception using
      errcode    = '23514',
      constraint = 'camp_campers_immutable',
      message    = 'a camper''s id, sign-up and camp can''t change';
  end if;

  new.created_at      := old.created_at;
  new.created_by      := old.created_by;
  new.created_by_name := old.created_by_name;

  if (to_jsonb(new) - array['version', 'created_at', 'created_by', 'created_by_name', 'updated_at', 'updated_by', 'updated_by_name'])
       is distinct from
     (to_jsonb(old) - array['version', 'created_at', 'created_by', 'created_by_name', 'updated_at', 'updated_by', 'updated_by_name'])
     or new.version is distinct from old.version then
    new.version         := old.version + 1;
    new.updated_at      := now();
    new.updated_by      := auth.uid();
    new.updated_by_name := public.change_log_actor_name();
  else
    new.version         := old.version;
    new.updated_at      := old.updated_at;
    new.updated_by      := old.updated_by;
    new.updated_by_name := old.updated_by_name;
  end if;
  return new;
end;
$$;

revoke execute on function public.camp_campers_before_write() from public, anon, authenticated, service_role;

-- 13f. camp_camper_days_before_write() - BEFORE INSERT OR UPDATE
--   insert: the day must be a day of the camper's camp
--   update: only the three check-in columns may change
create or replace function public.camp_camper_days_before_write()
returns trigger
language plpgsql
set search_path = ''
as $$
begin
  if tg_op = 'INSERT' then
    if not exists (select 1
                     from public.camp_campers c
                     join public.camp_days d on d.camp_id = c.camp_id
                    where c.id = new.camper_id and d.id = new.day_id) then
      raise exception using
        errcode    = '23514',
        constraint = 'camp_camper_days_day_camp',
        message    = 'the day must be a day of the camper''s camp';
    end if;
    return new;
  end if;

  if new.id is distinct from old.id
     or new.camper_id is distinct from old.camper_id
     or new.day_id is distinct from old.day_id then
    raise exception using
      errcode    = '23514',
      constraint = 'camp_camper_days_immutable',
      message    = 'a camper day can''t move (only its check-in can change)';
  end if;
  return new;
end;
$$;

revoke execute on function public.camp_camper_days_before_write() from public, anon, authenticated, service_role;

-- 13g. camp_camper_extras_before_write() - BEFORE INSERT OR UPDATE
--   insert: the extra is one of the camper's camp's extras; a 'once'
--           extra has no day; a 'day' extra has a day that is one of the
--           camper's own days (and, when the extra is offered only on
--           some days, one of those); a not-for-all-days extra is refused
--           for a camper who comes every day
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
     or (v_not_all and (select count(*) from public.camp_camper_days cd where cd.camper_id = new.camper_id)
                       = (select count(*) from public.camp_days d where d.camp_id = v_camp_id)) then
    raise exception using
      errcode    = '23514',
      constraint = 'camp_camper_extras_rules',
      message    = 'the extra must be one of the camp''s, with a day only for a per-day extra (one of the camper''s days), and not a not-for-all-days extra for an all-days camper';
  end if;
  return new;
end;
$$;

revoke execute on function public.camp_camper_extras_before_write() from public, anon, authenticated, service_role;

-- 13h. camp_payments_guard() - keeps payments append-only (0005's 9e)
--   BEFORE INSERT: a reversal must undo a real PAYMENT (not a reversal) of
--                  the same camper, for exactly minus its amount
--   BEFORE UPDATE: always refused
--   BEFORE DELETE: refused, EXCEPT inside camp_delete_camper /
--                  camp_delete_camp (the tkd.action tag those two set)
-- Limit: the database owner could switch this trigger off on purpose; it
-- stops mistakes and the app, not a deliberate owner.
create or replace function public.camp_payments_guard()
returns trigger
language plpgsql
set search_path = ''
as $$
declare
  v_reversed public.camp_payments;
begin
  if tg_op = 'INSERT' then
    if new.kind = 'reversal' then
      select * into v_reversed from public.camp_payments p where p.id = new.reverses_payment_id;
      if not found
         or v_reversed.kind <> 'payment'
         or v_reversed.camper_id <> new.camper_id
         or new.amount_cents <> -v_reversed.amount_cents then
        raise exception using
          errcode    = '23514',
          constraint = 'camp_payments_reversal_check',
          message    = 'a reversal must undo one payment of the same camper, for exactly minus its amount';
      end if;
    end if;
    return new;
  end if;

  if tg_op = 'DELETE'
     and coalesce(current_setting('tkd.action', true), '') in ('camp_delete_camper', 'camp_delete_camp') then
    return old;
  end if;

  raise exception 'camp_payments is append-only (use a reversal)';
end;
$$;

revoke execute on function public.camp_payments_guard() from public, anon, authenticated, service_role;

-- 13i. camp_signups_log() - AFTER INSERT OR UPDATE OR DELETE on sign-ups:
-- the same history row as 0003's change_log_write, EXCEPT
--   * the signature is never copied: it shows as "on file" (there is one)
--     or null (there is none), so the history holds no picture at all;
--   * submission_id and waiver_text_signed are left out.
-- Phones are logged like any other field (rulebook v0.700).
-- An update that changed nothing visible after that writes no row.
-- security definer so it can write to change_log, which nobody else can.
create or replace function public.camp_signups_log()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_old    jsonb;
  v_new    jsonb;
  v_before jsonb;
  v_after  jsonb;
  v_row    jsonb;
begin
  if tg_op in ('UPDATE', 'DELETE') then
    v_old := (to_jsonb(old) - array['submission_id', 'waiver_text_signed'])
             || jsonb_build_object('signature', case when old.signature is null then null else 'on file' end);
  end if;
  if tg_op in ('INSERT', 'UPDATE') then
    v_new := (to_jsonb(new) - array['submission_id', 'waiver_text_signed'])
             || jsonb_build_object('signature', case when new.signature is null then null else 'on file' end);
  end if;

  if tg_op = 'INSERT' then
    v_after := v_new;
    v_row   := v_new;
  elsif tg_op = 'UPDATE' then
    select jsonb_object_agg(o.key, o.value) into v_before
      from jsonb_each(v_old) as o(key, value)
     where o.value is distinct from v_new -> o.key;
    select jsonb_object_agg(n.key, n.value) into v_after
      from jsonb_each(v_new) as n(key, value)
     where n.value is distinct from v_old -> n.key;
    if v_before is null and v_after is null then
      return null;
    end if;
    v_row := v_new;
  else
    v_before := v_old;
    v_row    := v_old;
  end if;

  insert into public.change_log
    (actor_id, actor_name, session_id, batch_id, action,
     table_name, record_id, location_code, op, before, after)
  values
    (auth.uid(),
     public.change_log_actor_name(),
     public.current_session_id(),
     nullif(current_setting('tkd.batch_id', true), '')::uuid,
     coalesce(nullif(current_setting('tkd.action', true), ''), 'manual'),
     tg_table_name,
     (v_row ->> 'id')::uuid,
     null,
     lower(tg_op),
     v_before,
     v_after);
  return null;
end;
$$;

revoke execute on function public.camp_signups_log() from public, anon, authenticated, service_role;

-- 13j. Attach the triggers ("drop trigger if exists" + create = replace).
drop trigger if exists camps_before_write on public.camps;
create trigger camps_before_write
  before insert or update on public.camps
  for each row execute function public.camps_before_write();

drop trigger if exists camp_templates_before_write on public.camp_templates;
create trigger camp_templates_before_write
  before insert or update on public.camp_templates
  for each row execute function public.camp_templates_before_write();

drop trigger if exists camp_days_before_write on public.camp_days;
create trigger camp_days_before_write
  before update on public.camp_days
  for each row execute function public.camp_parts_before_write();

drop trigger if exists camp_prices_before_write on public.camp_prices;
create trigger camp_prices_before_write
  before update on public.camp_prices
  for each row execute function public.camp_parts_before_write();

drop trigger if exists camp_extras_before_write on public.camp_extras;
create trigger camp_extras_before_write
  before insert or update on public.camp_extras
  for each row execute function public.camp_extras_before_write();

drop trigger if exists camp_signups_before_write on public.camp_signups;
create trigger camp_signups_before_write
  before insert or update on public.camp_signups
  for each row execute function public.camp_signups_before_write();

drop trigger if exists camp_campers_before_write on public.camp_campers;
create trigger camp_campers_before_write
  before insert or update on public.camp_campers
  for each row execute function public.camp_campers_before_write();

drop trigger if exists camp_camper_days_before_write on public.camp_camper_days;
create trigger camp_camper_days_before_write
  before insert or update on public.camp_camper_days
  for each row execute function public.camp_camper_days_before_write();

drop trigger if exists camp_camper_extras_before_write on public.camp_camper_extras;
create trigger camp_camper_extras_before_write
  before insert or update on public.camp_camper_extras
  for each row execute function public.camp_camper_extras_before_write();

drop trigger if exists camp_payments_guard on public.camp_payments;
create trigger camp_payments_guard
  before insert or update or delete on public.camp_payments
  for each row execute function public.camp_payments_guard();

-- History: 0003's change_log_write for every table except the sign-ups,
-- which use their own version (13i). camp_public_attempts is not logged.
drop trigger if exists camps_log on public.camps;
create trigger camps_log
  after insert or update or delete on public.camps
  for each row execute function public.change_log_write();

drop trigger if exists camp_days_log on public.camp_days;
create trigger camp_days_log
  after insert or update or delete on public.camp_days
  for each row execute function public.change_log_write();

drop trigger if exists camp_prices_log on public.camp_prices;
create trigger camp_prices_log
  after insert or update or delete on public.camp_prices
  for each row execute function public.change_log_write();

drop trigger if exists camp_extras_log on public.camp_extras;
create trigger camp_extras_log
  after insert or update or delete on public.camp_extras
  for each row execute function public.change_log_write();

drop trigger if exists camp_templates_log on public.camp_templates;
create trigger camp_templates_log
  after insert or update or delete on public.camp_templates
  for each row execute function public.change_log_write();

drop trigger if exists camp_signups_log on public.camp_signups;
create trigger camp_signups_log
  after insert or update or delete on public.camp_signups
  for each row execute function public.camp_signups_log();

drop trigger if exists camp_campers_log on public.camp_campers;
create trigger camp_campers_log
  after insert or update or delete on public.camp_campers
  for each row execute function public.change_log_write();

drop trigger if exists camp_camper_days_log on public.camp_camper_days;
create trigger camp_camper_days_log
  after insert or update or delete on public.camp_camper_days
  for each row execute function public.change_log_write();

drop trigger if exists camp_camper_extras_log on public.camp_camper_extras;
create trigger camp_camper_extras_log
  after insert or update or delete on public.camp_camper_extras
  for each row execute function public.change_log_write();

drop trigger if exists camp_payments_log on public.camp_payments;
create trigger camp_payments_log
  after insert or update or delete on public.camp_payments
  for each row execute function public.change_log_write();

-- No "empty the whole table" shortcut (it would skip the history), as 0003.
-- (camp_public_attempts is not logged, so it has no such guard - as 0005.)
drop trigger if exists camps_no_truncate on public.camps;
create trigger camps_no_truncate
  before truncate on public.camps
  for each statement execute function public.testing_refuse_truncate();

drop trigger if exists camp_days_no_truncate on public.camp_days;
create trigger camp_days_no_truncate
  before truncate on public.camp_days
  for each statement execute function public.testing_refuse_truncate();

drop trigger if exists camp_prices_no_truncate on public.camp_prices;
create trigger camp_prices_no_truncate
  before truncate on public.camp_prices
  for each statement execute function public.testing_refuse_truncate();

drop trigger if exists camp_extras_no_truncate on public.camp_extras;
create trigger camp_extras_no_truncate
  before truncate on public.camp_extras
  for each statement execute function public.testing_refuse_truncate();

drop trigger if exists camp_templates_no_truncate on public.camp_templates;
create trigger camp_templates_no_truncate
  before truncate on public.camp_templates
  for each statement execute function public.testing_refuse_truncate();

drop trigger if exists camp_signups_no_truncate on public.camp_signups;
create trigger camp_signups_no_truncate
  before truncate on public.camp_signups
  for each statement execute function public.testing_refuse_truncate();

drop trigger if exists camp_campers_no_truncate on public.camp_campers;
create trigger camp_campers_no_truncate
  before truncate on public.camp_campers
  for each statement execute function public.testing_refuse_truncate();

drop trigger if exists camp_camper_days_no_truncate on public.camp_camper_days;
create trigger camp_camper_days_no_truncate
  before truncate on public.camp_camper_days
  for each statement execute function public.testing_refuse_truncate();

drop trigger if exists camp_camper_extras_no_truncate on public.camp_camper_extras;
create trigger camp_camper_extras_no_truncate
  before truncate on public.camp_camper_extras
  for each statement execute function public.testing_refuse_truncate();

drop trigger if exists camp_payments_no_truncate on public.camp_payments;
create trigger camp_payments_no_truncate
  before truncate on public.camp_payments
  for each statement execute function public.testing_refuse_truncate();


-- ---------------------------------------------------------------------
-- 14. Derived rules (one SQL function each; campRules.js mirrors them
--     exactly and both are tested on the same case table, contract §1.20).
--     Internal: nobody in the app can call them.
-- ---------------------------------------------------------------------

-- 14a. camp_first_day / camp_last_day / camp_day_count (camp_id)
create or replace function public.camp_first_day(p_camp_id uuid)
returns date
language sql
stable
set search_path = ''
as $$
  select min(d.day) from public.camp_days d where d.camp_id = p_camp_id;
$$;

revoke execute on function public.camp_first_day(uuid) from public, anon, authenticated, service_role;

create or replace function public.camp_last_day(p_camp_id uuid)
returns date
language sql
stable
set search_path = ''
as $$
  select max(d.day) from public.camp_days d where d.camp_id = p_camp_id;
$$;

revoke execute on function public.camp_last_day(uuid) from public, anon, authenticated, service_role;

create or replace function public.camp_day_count(p_camp_id uuid)
returns integer
language sql
stable
set search_path = ''
as $$
  select count(*)::integer from public.camp_days d where d.camp_id = p_camp_id;
$$;

revoke execute on function public.camp_day_count(uuid) from public, anon, authenticated, service_role;

-- 14b. camp_signup_state(camp_id, today) - where sign-up stands, checked in
-- this exact order (campRules.signupState is the same code in JavaScript):
--   'finished'      today is after the camp's last day
--   'closed'        closed by hand, or today is after the closing date
--   'not_open_yet'  today is before the opening date
--   'open'          otherwise
-- NULL for an unknown camp.
create or replace function public.camp_signup_state(p_camp_id uuid, p_today date)
returns text
language sql
stable
set search_path = ''
as $$
  select case
           when p_today > public.camp_last_day(c.id) then 'finished'
           when c.closed_by_hand or p_today > c.signup_closes_on then 'closed'
           when p_today < c.signup_opens_on then 'not_open_yet'
           else 'open'
         end
    from public.camps c
   where c.id = p_camp_id;
$$;

revoke execute on function public.camp_signup_state(uuid, date) from public, anon, authenticated, service_role;

-- 14c. camp_base_cents(camp_id, day_count, member, price_kind) - the grid
-- cell: the row for that number of days, member / non-member, early /
-- regular. NULL if there is no such row.
create or replace function public.camp_base_cents(p_camp_id uuid, p_day_count integer, p_member boolean, p_price_kind text)
returns integer
language sql
stable
set search_path = ''
as $$
  select case
           when p_member and p_price_kind = 'early'         then p.member_early_cents
           when p_member and p_price_kind = 'regular'       then p.member_regular_cents
           when not p_member and p_price_kind = 'early'     then p.nonmember_early_cents
           when not p_member and p_price_kind = 'regular'   then p.nonmember_regular_cents
         end
    from public.camp_prices p
   where p.camp_id = p_camp_id and p.day_count = p_day_count;
$$;

revoke execute on function public.camp_base_cents(uuid, integer, boolean, text) from public, anon, authenticated, service_role;

-- 14d. camp_camper_total_cents(camper_id) = base_cents + the camper's extra
-- rows; camp_camper_paid_cents(camper_id) = all payment rows added up
-- (reversals are negative). Owes = total - paid (below 0 = paid more than
-- the total, after days or extras were removed).
create or replace function public.camp_camper_total_cents(p_camper_id uuid)
returns integer
language sql
stable
set search_path = ''
as $$
  select c.base_cents + coalesce((select sum(x.price_cents)::integer from public.camp_camper_extras x
                                   where x.camper_id = c.id), 0)
    from public.camp_campers c
   where c.id = p_camper_id;
$$;

revoke execute on function public.camp_camper_total_cents(uuid) from public, anon, authenticated, service_role;

create or replace function public.camp_camper_paid_cents(p_camper_id uuid)
returns integer
language sql
stable
set search_path = ''
as $$
  select coalesce(sum(p.amount_cents), 0)::integer from public.camp_payments p where p.camper_id = p_camper_id;
$$;

revoke execute on function public.camp_camper_paid_cents(uuid) from public, anon, authenticated, service_role;


-- ---------------------------------------------------------------------
-- 15. The roster view: public.camp_roster
-- One row per camper with its sign-up's reference / early-regular / date,
-- its days (with check-in), its extras and its payment state. NEVER the
-- phones, the parent / contact names, the signature, the waiver copy, the
-- submission id or login ids ("signed" is true / false only).
--   total_cents = base + extras; paid_cents = all payments added up;
--   owes_cents  = total - paid
--   paid_on / paid_method / last_payment_id / last_payment_recorded_at =
--     its latest payment that has NOT been reversed (exactly as 0005's
--     testing_roster: "Paid on", the toast's Undo, Edit / Undo payment)
-- security_invoker = true: the view reads the tables with the CALLER's
-- rights, so the table rules (RLS has_data_access, column rights) still
-- apply - a locked session sees no rows.
-- ---------------------------------------------------------------------
create or replace view public.camp_roster
with (security_invoker = true)
as
select c.id,
       c.camp_id,
       c.signup_id,
       c.position,
       c.first_name,
       c.last_name,
       c.age,
       c.member,
       c.paying_by,
       c.status,
       c.withdrawn_reason,
       c.withdrawn_at,
       c.withdrawn_by_name,
       c.duplicate_state,
       c.duplicate_of,
       c.version,
       c.created_at,
       s.version                        as signup_version,
       s.reference,
       s.price_kind,
       s.signed_up_on,
       (s.signed_at is not null)        as signed,
       s.signature_deleted_at,
       c.base_cents,
       coalesce(dy.days, '[]'::jsonb)   as days,
       coalesce(ex.extras, '[]'::jsonb) as extras,
       c.base_cents + coalesce(ex.extras_cents, 0) as total_cents,
       coalesce(t.paid_cents, 0)        as paid_cents,
       c.base_cents + coalesce(ex.extras_cents, 0) - coalesce(t.paid_cents, 0) as owes_cents,
       lp.paid_on,
       lp.method                        as paid_method,
       lp.id                            as last_payment_id,
       lp.recorded_at                   as last_payment_recorded_at
  from public.camp_campers c
  join public.camp_signups s on s.id = c.signup_id
  left join lateral (select jsonb_agg(jsonb_build_object('day_id', d.id, 'day', d.day,
                                                         'checked_in_at', cd.checked_in_at,
                                                         'checked_in_by_name', cd.checked_in_by_name)
                                      order by d.day) as days
                       from public.camp_camper_days cd
                       join public.camp_days d on d.id = cd.day_id
                      where cd.camper_id = c.id) as dy on true
  left join lateral (select jsonb_agg(jsonb_build_object('extra_id', e.id, 'name', e.name, 'per', e.per,
                                                         'day_id', x.day_id, 'day', d.day,
                                                         'price_cents', x.price_cents)
                                      order by e.sort, d.day nulls first) as extras,
                            sum(x.price_cents)::integer as extras_cents
                       from public.camp_camper_extras x
                       join public.camp_extras e on e.id = x.extra_id
                       left join public.camp_days d on d.id = x.day_id
                      where x.camper_id = c.id) as ex on true
  left join lateral (select sum(p.amount_cents)::integer as paid_cents
                       from public.camp_payments p
                      where p.camper_id = c.id) as t on true
  left join lateral (select p.id, p.paid_on, p.method, p.recorded_at
                       from public.camp_payments p
                      where p.camper_id = c.id
                        and p.kind = 'payment'
                        and not exists (select 1 from public.camp_payments x
                                         where x.reverses_payment_id = p.id)
                      order by p.recorded_at desc, p.id desc
                      limit 1) as lp on true;

comment on view public.camp_roster is
  'Camp roster rows: camper + sign-up reference + days (check-in) + extras + payment state. No phones, signature, waiver copy, submission id or login ids. Runs with the caller''s rights.';


-- ---------------------------------------------------------------------
-- 16. Security rules: RLS + grants (same two layers as 0003 / 0005)
--   * grants: which COLUMNS the app may read - SELECT only, never the
--     phones, parent / contact names and relationships, the signature, the
--     waiver copy, the submission id or login ids (created_by, updated_by,
--     withdrawn_by, checked_in_by, recorded_by). No INSERT / UPDATE /
--     DELETE for anyone in the app.
--   * RLS: which ROWS - every row, but only while has_data_access() is
--     true (unlocked, still signed in, not PIN-locked, password within 7
--     days). camp_public_attempts: RLS on, no rule, no grants = nobody.
--   * service_role (the secret key) gets nothing, as in 0003.
-- ---------------------------------------------------------------------
alter table public.camps                enable row level security;
alter table public.camp_days            enable row level security;
alter table public.camp_prices          enable row level security;
alter table public.camp_extras          enable row level security;
alter table public.camp_templates       enable row level security;
alter table public.camp_signups         enable row level security;
alter table public.camp_campers         enable row level security;
alter table public.camp_camper_days     enable row level security;
alter table public.camp_camper_extras   enable row level security;
alter table public.camp_payments        enable row level security;
alter table public.camp_public_attempts enable row level security;

-- Start from zero (also removes column grants, so re-runs stay clean)...
revoke all on table public.camps, public.camp_days, public.camp_prices, public.camp_extras, public.camp_templates,
                    public.camp_signups, public.camp_campers, public.camp_camper_days, public.camp_camper_extras,
                    public.camp_payments, public.camp_public_attempts, public.camp_roster
  from public, anon, authenticated, service_role;
revoke all on sequence public.camp_signup_ref_seq, public.camp_public_attempts_id_seq
  from public, anon, authenticated, service_role;

-- ...then add back exactly what the app reads.
grant select (id, location_code, both_schools, name, start_time, end_time, signup_opens_on, signup_closes_on,
              early_until, closed_by_hand, min_age, max_age, description, waiver_text, public_code, version,
              created_at, created_by_name, updated_at, updated_by_name)
  on public.camps to authenticated;                       -- NOT created_by, updated_by
grant select (id, camp_id, day) on public.camp_days to authenticated;
grant select (id, camp_id, day_count, member_early_cents, member_regular_cents, nonmember_early_cents,
              nonmember_regular_cents)
  on public.camp_prices to authenticated;
grant select (id, camp_id, name, price_cents, per, not_for_all_days, only_on, sort) on public.camp_extras to authenticated;
grant select (id, name, location_code, both_schools, day_count, start_time, end_time, opens_days_before,
              closes_days_before, early_days_before, min_age, max_age, description, waiver_text, prices, extras,
              version, created_at, created_by_name, updated_at, updated_by_name)
  on public.camp_templates to authenticated;              -- NOT created_by, updated_by
grant select (id, camp_id, reference, price_kind, signed_up_on, signed_at, signature_deleted_at, version)
  on public.camp_signups to authenticated;                -- NOT phones, names, relations, signature, waiver copy, submission_id
grant select (id, signup_id, camp_id, position, first_name, last_name, age, member, paying_by, base_cents, status,
              withdrawn_reason, withdrawn_at, withdrawn_by_name, duplicate_state, duplicate_of, version,
              created_at, created_by_name, updated_at, updated_by_name)
  on public.camp_campers to authenticated;                -- NOT withdrawn_by, created_by, updated_by
grant select (id, camper_id, day_id, checked_in_at, checked_in_by_name)
  on public.camp_camper_days to authenticated;            -- NOT checked_in_by
grant select (id, camper_id, extra_id, day_id, price_cents) on public.camp_camper_extras to authenticated;
grant select (id, camper_id, kind, amount_cents, method, paid_on, recorded_at, recorded_by_name, reverses_payment_id)
  on public.camp_payments to authenticated;               -- NOT recorded_by
grant select on public.camp_roster to authenticated;

-- Read rules ("(select ...)" = run the check once per query, not per row).
drop policy if exists camps_select_with_access on public.camps;
create policy camps_select_with_access
  on public.camps for select to authenticated
  using ((select public.has_data_access()));

drop policy if exists camp_days_select_with_access on public.camp_days;
create policy camp_days_select_with_access
  on public.camp_days for select to authenticated
  using ((select public.has_data_access()));

drop policy if exists camp_prices_select_with_access on public.camp_prices;
create policy camp_prices_select_with_access
  on public.camp_prices for select to authenticated
  using ((select public.has_data_access()));

drop policy if exists camp_extras_select_with_access on public.camp_extras;
create policy camp_extras_select_with_access
  on public.camp_extras for select to authenticated
  using ((select public.has_data_access()));

drop policy if exists camp_templates_select_with_access on public.camp_templates;
create policy camp_templates_select_with_access
  on public.camp_templates for select to authenticated
  using ((select public.has_data_access()));

drop policy if exists camp_signups_select_with_access on public.camp_signups;
create policy camp_signups_select_with_access
  on public.camp_signups for select to authenticated
  using ((select public.has_data_access()));

drop policy if exists camp_campers_select_with_access on public.camp_campers;
create policy camp_campers_select_with_access
  on public.camp_campers for select to authenticated
  using ((select public.has_data_access()));

drop policy if exists camp_camper_days_select_with_access on public.camp_camper_days;
create policy camp_camper_days_select_with_access
  on public.camp_camper_days for select to authenticated
  using ((select public.has_data_access()));

drop policy if exists camp_camper_extras_select_with_access on public.camp_camper_extras;
create policy camp_camper_extras_select_with_access
  on public.camp_camper_extras for select to authenticated
  using ((select public.has_data_access()));

drop policy if exists camp_payments_select_with_access on public.camp_payments;
create policy camp_payments_select_with_access
  on public.camp_payments for select to authenticated
  using ((select public.has_data_access()));



-- ---------------------------------------------------------------------
-- 17. Internal helpers used by the functions (nobody can call them)
-- ---------------------------------------------------------------------

-- 17a. camp_purge_old_signatures() - the 3-year clean-up (rulebook v0.700):
-- removes the drawn signature of every sign-up whose camp's LAST day is
-- more than 3 years ago, and records when. No scheduled job: it runs as
-- the LAST step of camp_add_camp and camp_mark_paid (never from the public
-- form). "skip locked" = rows someone else is working on right now are
-- left for next time, so it never waits. The version and "last changed
-- by" stay as they were (13d); the history row shows only "signature":
-- "on file" -> null plus the removal time. Returns how many were removed.
create or replace function public.camp_purge_old_signatures()
returns integer
language plpgsql
volatile
set search_path = ''
as $$
declare
  v_action text := current_setting('tkd.action', true);
  v_batch  text := current_setting('tkd.batch_id', true);
  v_n      integer;
begin
  perform set_config('tkd.action', 'camp_purge_old_signatures', true);
  perform set_config('tkd.batch_id', gen_random_uuid()::text, true);

  update public.camp_signups s
     set signature = null,
         signature_deleted_at = now()
   where s.id in (select x.id
                    from public.camp_signups x
                   where x.signature is not null
                     and public.camp_last_day(x.camp_id) < (public.testing_today() - interval '3 years')::date
                     for update of x skip locked);
  get diagnostics v_n = row_count;

  -- put back whatever tags were set before (normally empty)
  perform set_config('tkd.action', coalesce(v_action, ''), true);
  perform set_config('tkd.batch_id', coalesce(v_batch, ''), true);
  return v_n;
end;
$$;

revoke execute on function public.camp_purge_old_signatures() from public, anon, authenticated, service_role;

-- 17b. camp_find_duplicate(camp, exclude_id, first, last) - another ACTIVE
-- camper at the same camp with the same first and last name (ignoring
-- capitals and extra spaces), or NULL. The oldest one wins: the earliest
-- created, and among campers created at the same moment (one transaction)
-- the earlier sign-up reference (CP-4001 before CP-4002), then the place on
-- the form - so the answer never depends on random ids. A camper that was
-- "kept both" together with exclude_id doesn't count. (0005's 12b)
create or replace function public.camp_find_duplicate(
  p_camp_id    uuid,
  p_exclude_id uuid,
  p_first      text,
  p_last       text
)
returns uuid
language sql
stable
set search_path = ''
as $$
  select m.id
    from public.camp_campers m
    join public.camp_signups s on s.id = m.signup_id
   where m.camp_id = p_camp_id
     and m.status = 'active'
     and (p_exclude_id is null or m.id <> p_exclude_id)
     and lower(m.first_name) = lower(public.testing_normalize_name(p_first))
     and lower(m.last_name) = lower(public.testing_normalize_name(p_last))
     and not (p_exclude_id is not null and m.duplicate_state = 'kept_both' and m.duplicate_of = p_exclude_id)
   order by m.created_at, char_length(s.reference), s.reference, m.position, m.id
   limit 1;
$$;

revoke execute on function public.camp_find_duplicate(uuid, uuid, text, text) from public, anon, authenticated, service_role;

-- 17c. camp_recheck_duplicate(camper_id) - works out one camper's
-- "possible duplicate" mark again (0005's 12c):
--   withdrawn -> none · kept both with a partner that still matches ->
--   unchanged · another active match -> possible · no match -> none.
-- Writes only if something changes.
create or replace function public.camp_recheck_duplicate(p_camper_id uuid)
returns void
language plpgsql
volatile
set search_path = ''
as $$
declare
  v_c     public.camp_campers;
  v_state text;
  v_of    uuid;
begin
  select * into v_c from public.camp_campers c where c.id = p_camper_id;
  if not found then
    return;
  end if;

  if v_c.status <> 'active' then
    v_state := 'none';
    v_of    := null;
  elsif v_c.duplicate_state = 'kept_both'
        and v_c.duplicate_of is not null
        and exists (select 1 from public.camp_campers m
                     where m.id = v_c.duplicate_of
                       and m.status = 'active'
                       and m.camp_id = v_c.camp_id
                       and lower(m.first_name) = lower(v_c.first_name)
                       and lower(m.last_name) = lower(v_c.last_name)) then
    return;   -- staff said these two are both real
  else
    v_of    := public.camp_find_duplicate(v_c.camp_id, v_c.id, v_c.first_name, v_c.last_name);
    v_state := case when v_of is null then 'none' else 'possible' end;
  end if;

  update public.camp_campers c
     set duplicate_state = v_state,
         duplicate_of    = v_of
   where c.id = p_camper_id
     and (c.duplicate_state is distinct from v_state or c.duplicate_of is distinct from v_of);
end;
$$;

revoke execute on function public.camp_recheck_duplicate(uuid) from public, anon, authenticated, service_role;

-- 17d. camp_recheck_pointing_at(camper_id) - rechecks every camper whose
-- duplicate_of points at this one (in id order).
create or replace function public.camp_recheck_pointing_at(p_camper_id uuid)
returns void
language plpgsql
volatile
set search_path = ''
as $$
declare
  v_id uuid;
begin
  for v_id in select c.id from public.camp_campers c
               where c.duplicate_of = p_camper_id
               order by c.id loop
    perform public.camp_recheck_duplicate(v_id);
  end loop;
end;
$$;

revoke execute on function public.camp_recheck_pointing_at(uuid) from public, anon, authenticated, service_role;

-- 17e. camp_lock_camper(camper_id) - shared start of the camper functions:
-- locks camp ("for no key update") -> sign-up ("for no key update") ->
-- camper ("for update") in that order and returns the locked camper (all
-- fields NULL if it is gone).
create or replace function public.camp_lock_camper(p_camper_id uuid)
returns public.camp_campers
language plpgsql
volatile
set search_path = ''
as $$
declare
  v_camp_id   uuid;
  v_signup_id uuid;
  v_c         public.camp_campers;
begin
  select c.camp_id, c.signup_id into v_camp_id, v_signup_id
    from public.camp_campers c where c.id = p_camper_id;
  if not found then
    return null;
  end if;
  perform 1 from public.camps x where x.id = v_camp_id for no key update;
  perform 1 from public.camp_signups s where s.id = v_signup_id for no key update;
  select * into v_c from public.camp_campers c where c.id = p_camper_id for update;
  return v_c;   -- all fields NULL when it vanished meanwhile
end;
$$;

revoke execute on function public.camp_lock_camper(uuid) from public, anon, authenticated, service_role;

-- 17f. camp_lock_payment(payment_id) - shared start of Undo / Edit
-- payment: locks camp -> sign-up -> camper -> the payment and returns the
-- locked payment (NULL fields if it is gone).
create or replace function public.camp_lock_payment(p_payment_id uuid)
returns public.camp_payments
language plpgsql
volatile
set search_path = ''
as $$
declare
  v_camper_id uuid;
  v_c         public.camp_campers;
  v_p         public.camp_payments;
begin
  select p.camper_id into v_camper_id from public.camp_payments p where p.id = p_payment_id;
  if not found then
    return null;
  end if;
  v_c := public.camp_lock_camper(v_camper_id);
  if v_c.id is null then
    return null;
  end if;
  select * into v_p from public.camp_payments p where p.id = p_payment_id for update;
  return v_p;
end;
$$;

revoke execute on function public.camp_lock_payment(uuid) from public, anon, authenticated, service_role;

-- 17g. camp_public_camp_answer(camp_id) - the whole answer of
-- camp_public_camp (18a) for one camp. Also sent back inside a
-- price_changed / camp_changed refusal, so the family page can show the
-- camp as it is now. Only the camp's own public facts: no counts, no
-- campers, nothing about other camps.
create or replace function public.camp_public_camp_answer(p_camp_id uuid)
returns jsonb
language sql
stable
set search_path = ''
as $$
  select jsonb_build_object(
           'status',           'ok',
           'state',            public.camp_signup_state(c.id, public.testing_today()),
           'opens_on',         c.signup_opens_on,
           'closed_on',        case when public.camp_signup_state(c.id, public.testing_today()) = 'closed'
                                     and not c.closed_by_hand then c.signup_closes_on end,
           'price_kind_today', public.camp_price_kind(public.testing_today(), c.early_until),
           'ack_version',      'camp-2026-10-18',
           'waiver_version',   md5(c.waiver_text),
           'camp', jsonb_build_object(
             'name',             c.name,
             'days',             coalesce((select jsonb_agg(jsonb_build_object('day_id', d.id, 'day', d.day) order by d.day)
                                             from public.camp_days d where d.camp_id = c.id), '[]'::jsonb),
             'start_time',       left(c.start_time::text, 5),
             'end_time',         left(c.end_time::text, 5),
             'both_schools',     c.both_schools,
             'school_name',      l.name,
             'address',          public.testing_location_address(c.location_code),
             'description',      c.description,
             'waiver_text',      c.waiver_text,
             'early_until',      c.early_until,
             'signup_closes_on', c.signup_closes_on,
             'min_age',          c.min_age,
             'max_age',          c.max_age,
             'prices',           coalesce((select jsonb_agg(jsonb_build_object(
                                                     'day_count', p.day_count,
                                                     'member_early_cents', p.member_early_cents,
                                                     'member_regular_cents', p.member_regular_cents,
                                                     'nonmember_early_cents', p.nonmember_early_cents,
                                                     'nonmember_regular_cents', p.nonmember_regular_cents)
                                                   order by p.day_count)
                                             from public.camp_prices p where p.camp_id = c.id), '[]'::jsonb),
             'extras',           coalesce((select jsonb_agg(jsonb_build_object(
                                                     'extra_id', e.id, 'name', e.name, 'price_cents', e.price_cents,
                                                     'per', e.per, 'not_for_all_days', e.not_for_all_days,
                                                     'only_on', to_jsonb(e.only_on))
                                                   order by e.sort)
                                             from public.camp_extras e where e.camp_id = c.id), '[]'::jsonb)))
    from public.camps c
    join public.locations l on l.code = c.location_code
   where c.id = p_camp_id;
$$;

revoke execute on function public.camp_public_camp_answer(uuid) from public, anon, authenticated, service_role;

-- 17h. camp_public_signup_answer(signup_id) - the "You're signed up"
-- answer (C7c): only what that family just sent plus the camp's facts.
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

-- 17i. camp_add_parts(camp_id, prices, extras) - writes a new camp's price
-- grid and extras from the checked jsonb (1f, 1g, 19e). Extras get sort =
-- their position in the list and only_on = the camp's days named in their
-- "only_on" list (sorted). Used by Add camp (Edit camp has its own diff),
-- after the days are written.
create or replace function public.camp_add_parts(p_camp_id uuid, p_prices jsonb, p_extras jsonb)
returns void
language plpgsql
volatile
set search_path = ''
as $$
begin
  insert into public.camp_prices
    (camp_id, day_count, member_early_cents, member_regular_cents, nonmember_early_cents, nonmember_regular_cents)
  select p_camp_id, (x.value ->> 'day_count')::smallint,
         (x.value ->> 'member_early_cents')::integer, (x.value ->> 'member_regular_cents')::integer,
         (x.value ->> 'nonmember_early_cents')::integer, (x.value ->> 'nonmember_regular_cents')::integer
    from jsonb_array_elements(p_prices) as x(value)
   order by (x.value ->> 'day_count')::integer;

  insert into public.camp_extras (camp_id, name, price_cents, per, not_for_all_days, only_on, sort)
  select p_camp_id, public.testing_normalize_name(x.value ->> 'name'), (x.value ->> 'price_cents')::integer,
         x.value ->> 'per', (x.value ->> 'not_for_all_days')::boolean,
         public.camp_only_on_dates(x.value -> 'only_on',
                                   array(select d.day from public.camp_days d where d.camp_id = p_camp_id)),
         (x.n - 1)::smallint
    from jsonb_array_elements(p_extras) with ordinality as x(value, n)
   order by x.n;
end;
$$;

revoke execute on function public.camp_add_parts(uuid, jsonb, jsonb) from public, anon, authenticated, service_role;

-- 17j. camp_tidy_extras(extras) - the extras list as stored in a template:
-- the 4 keys + only_weekdays (sorted; [] when not given), names tidied
-- (spaces). Order kept. Only called on lists that passed 1g.
create or replace function public.camp_tidy_extras(p_extras jsonb)
returns jsonb
language sql
immutable
set search_path = ''
as $$
  select coalesce(jsonb_agg(jsonb_build_object('name', public.testing_normalize_name(x.value ->> 'name'),
                                               'price_cents', x.value -> 'price_cents',
                                               'per', x.value -> 'per',
                                               'not_for_all_days', x.value -> 'not_for_all_days',
                                               'only_weekdays',
                                               coalesce((select jsonb_agg(w.value order by (w.value #>> '{}')::integer)
                                                           from jsonb_array_elements(coalesce(x.value -> 'only_weekdays', '[]'::jsonb)) as w(value)),
                                                        '[]'::jsonb))
                            order by x.n), '[]'::jsonb)
    from jsonb_array_elements(p_extras) with ordinality as x(value, n);
$$;

revoke execute on function public.camp_tidy_extras(jsonb) from public, anon, authenticated, service_role;

-- 17k. camp_tidy_prices(prices) - the grid as stored in a template:
-- sorted by day count, numbers only.
create or replace function public.camp_tidy_prices(p_prices jsonb)
returns jsonb
language sql
immutable
set search_path = ''
as $$
  select coalesce(jsonb_agg(jsonb_build_object('day_count', x.value -> 'day_count',
                                               'member_early_cents', x.value -> 'member_early_cents',
                                               'member_regular_cents', x.value -> 'member_regular_cents',
                                               'nonmember_early_cents', x.value -> 'nonmember_early_cents',
                                               'nonmember_regular_cents', x.value -> 'nonmember_regular_cents')
                            order by (x.value ->> 'day_count')::integer), '[]'::jsonb)
    from jsonb_array_elements(p_prices) as x(value);
$$;

revoke execute on function public.camp_tidy_prices(jsonb) from public, anon, authenticated, service_role;


-- ---------------------------------------------------------------------
-- 18. The restricted login for the camp family form: camps_registrar
-- Same as 0005's testing_registrar and 0006's star_registrar: the
-- Cloudflare Function (via its own Hyperdrive config) signs in as this
-- role and can run exactly two functions (section 21). It has no rights
-- on any table, view or sequence, can't create anything, isn't part of any
-- other role, and Supabase's API (the "authenticator" login) can never
-- switch into it.
--   login              it can sign in (its password is set separately, at
--                      CP3, as a SCRAM verifier made on Jeffrey's PC -
--                      SETUP.md "Migration 0013". NO password in this file.)
--   noinherit ...      no inherited rights, can't create databases or
--                      roles, can't skip RLS, can't replicate
--   connection limit 5 at most 5 connections at once
--   statement_timeout 5s, idle_in_transaction_session_timeout 10s: a stuck
--                      call is cut off instead of holding locks
--   search_path ''     nothing is found without its schema name
-- Created only if it doesn't exist yet, so re-running this file never
-- touches an existing role's attributes or password (e.g. after the
-- emergency "nologin" it stays switched off).
-- ---------------------------------------------------------------------
do $$
begin
  if not exists (select 1 from pg_catalog.pg_roles where rolname = 'camps_registrar') then
    create role camps_registrar login noinherit nocreatedb nocreaterole nobypassrls noreplication connection limit 5;
  end if;
end
$$;

alter role camps_registrar set statement_timeout = '5s';
alter role camps_registrar set idle_in_transaction_session_timeout = '10s';
alter role camps_registrar set search_path = '';

-- It needs to find the two functions in schema public, nothing more.
grant usage on schema public to camps_registrar;



-- ---------------------------------------------------------------------
-- 19. More internal helpers for the staff functions (nobody can call them)
-- ---------------------------------------------------------------------

-- 19a. camp_setup_args_are_valid(...) - the input rules Add camp and Edit
-- camp share (everything that doesn't depend on the saved camp):
--   a known school; both_schools true / false; a valid name; 1-10
--   different days; hours on 5-minute steps, end after start; sign-up
--   opens <= closes <= the last of the days; early price until <= closes;
--   ages 1-99, from <= to; the grid exactly 1 ... number of days (1f); the
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
  if not public.camp_prices_arg_is_valid(p_prices, cardinality(p_days))
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

-- 19b. camp_extra_rows(p_extras) - a child's checked extras list (1i) as
-- rows (extra_id, day_id): a once extra -> one row without a day; a
-- per-day extra -> one row per chosen day. Only called on lists that
-- passed camp_camper_extras_arg_is_valid, so the casts can't fail.
create or replace function public.camp_extra_rows(p_extras jsonb)
returns table (extra_id uuid, day_id uuid)
language sql
immutable
set search_path = ''
as $$
  select (x.value ->> 'extra_id')::uuid, null::uuid
    from jsonb_array_elements(p_extras) as x(value)
   where jsonb_array_length(x.value -> 'day_ids') = 0
  union all
  select (x.value ->> 'extra_id')::uuid, (y.value #>> '{}')::uuid
    from jsonb_array_elements(p_extras) as x(value),
         jsonb_array_elements(x.value -> 'day_ids') as y(value);
$$;

revoke execute on function public.camp_extra_rows(jsonb) from public, anon, authenticated, service_role;

-- 19c. camp_camper_extras_are_ok(camp, day_ids, extras) - the extra rules
-- of contract §1.10 for one child's choice (used by Edit details and the
-- family form after the ids were checked to belong to the camp):
--   a once extra has no days; a per-day extra has 1+ days, all of them
--   the child's own days AND, when the extra is offered only on some days
--   (only_on), all of them among those; a not-for-all-days extra is not
--   chosen when the child comes every day of the camp.
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
  v_all := cardinality(p_day_ids) = public.camp_day_count(p_camp_id);
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
       or (v_e.not_for_all_days and v_all) then
      return false;
    end if;
  end loop;
  return true;
end;
$$;

revoke execute on function public.camp_camper_extras_are_ok(uuid, uuid[], jsonb) from public, anon, authenticated, service_role;

-- 19d. camp_extras_cents_now(extras) - what a child's extras cost at the
-- camp's CURRENT extra prices (a per-day extra once per chosen day).
create or replace function public.camp_extras_cents_now(p_extras jsonb)
returns integer
language sql
stable
set search_path = ''
as $$
  select coalesce(sum(e.price_cents), 0)::integer
    from public.camp_extra_rows(p_extras) as r
    join public.camp_extras e on e.id = r.extra_id;
$$;

revoke execute on function public.camp_extras_cents_now(jsonb) from public, anon, authenticated, service_role;

-- 19e. camp_extras_only_on_ok(extras, days, removed_days) - the "only_on"
-- lists of the extras Add / Edit camp sends (each optional; [] = every
-- day). For each extra: a list of at most 10 dates written 'YYYY-MM-DD',
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
    if jsonb_typeof(v_list) <> 'array' or jsonb_array_length(v_list) > 10
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

-- 19f. camp_only_on_dates(only_on, days) - an extra's checked "only_on"
-- list (19e) as the stored date[]: the days of p_days it names, sorted.
-- Missing / [] -> {} (every day).
create or replace function public.camp_only_on_dates(p_only_on jsonb, p_days date[])
returns date[]
language sql
stable
set search_path = ''
as $$
  select coalesce(array(select x.d from unnest(p_days) as x(d)
                         where to_char(x.d, 'YYYY-MM-DD') in (select y.value #>> '{}'
                                                                from jsonb_array_elements(coalesce(p_only_on, '[]'::jsonb)) as y(value))
                         order by x.d), '{}'::date[]);
$$;

revoke execute on function public.camp_only_on_dates(jsonb, date[]) from public, anon, authenticated, service_role;


-- ---------------------------------------------------------------------
-- 20. The staff functions (the only way to change camps, templates,
--     campers, check-ins and payments). Same pattern as 0005 section 14:
--   * returns {"status": ...}; the statuses are listed in the header
--   * checks in this order: has_data_access() FIRST, then the role (A =
--     admins only; S = staff and admins), then the input, then it locks
--     the rows and looks them up (not_found), then "did the screen see the
--     latest version?" (stale), then the rules that depend on the data,
--     then it writes
--   * tags its writes with tkd.action (= the function's name) +
--     tkd.batch_id and clears them
--   * the whole body is inside begin ... exception ... end: a table rule
--     that still says no undoes everything this call did and answers a
--     status instead of an error, with 0005's mapping:
--       the template name index         -> duplicate_name
--       any other unique rule           -> stale
--       foreign key / check / not-null rule / bad data -> invalid
--       deadlock / serialization / lock not available -> stale
--   * locks, always in this order: the camp ("for update" when the camp
--     itself changes, else "for no key update") -> the sign-up -> the
--     camper ("for update") -> its payments / day rows. No school lock:
--     Camps has no per-school rule (contract §1.1).
-- ---------------------------------------------------------------------

-- 20a. camp_add_camp(...)   A
-- Creates a camp with its days, price grid and extras.
--   p_days          1-10 different dates, all today or later
--   p_prices        the grid, exactly one row per day count 1 ... N (1f)
--   p_extras        0-10 extras (1g), in form order; a per-day extra may
--                   carry "only_on": the camp days it is offered on (19e;
--                   a bad list -> {"status":"invalid","field":"extras"})
--   the rest        as camp_setup_args_are_valid (19a)
-- Makes the link code. Last step: the signature clean-up (17a).
-- Ok: {"status":"ok","id":...,"public_code":"...","version":1}
create or replace function public.camp_add_camp(
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
  v_code    text;
  v_id      uuid;
  v_version integer;
begin
  begin
    if public.has_data_access() is not true then
      return jsonb_build_object('status', 'no_access');
    end if;
    if public.is_admin() is not true then
      return jsonb_build_object('status', 'not_allowed');
    end if;

    if not public.camp_setup_args_are_valid(p_location_code, p_both_schools, p_name, p_days, p_start_time, p_end_time,
                                            p_signup_opens_on, p_signup_closes_on, p_early_until, p_min_age, p_max_age,
                                            p_prices, p_extras, false, p_description, p_waiver_text)
       or exists (select 1 from unnest(p_days) as x(d) where x.d < public.testing_today()) then
      return jsonb_build_object('status', 'invalid');
    end if;
    -- the extras' "only on these days" lists (19e)
    if not public.camp_extras_only_on_ok(p_extras, p_days, '{}') then
      return jsonb_build_object('status', 'invalid', 'field', 'extras');
    end if;

    perform set_config('tkd.action', 'camp_add_camp', true);
    perform set_config('tkd.batch_id', gen_random_uuid()::text, true);

    loop
      v_code := public.testing_new_public_code();
      exit when not exists (select 1 from public.camps c where c.public_code = v_code);
    end loop;

    insert into public.camps
      (location_code, both_schools, name, start_time, end_time, signup_opens_on, signup_closes_on, early_until,
       closed_by_hand, min_age, max_age, description, waiver_text, public_code, created_by_name, updated_by_name)
    values
      (p_location_code, p_both_schools, public.testing_normalize_name(p_name), p_start_time, p_end_time,
       p_signup_opens_on, p_signup_closes_on, p_early_until, false, p_min_age, p_max_age,
       public.testing_normalize_note(p_description), public.testing_normalize_note(p_waiver_text), v_code, '', '')
    returning id, version into v_id, v_version;

    insert into public.camp_days (camp_id, day)
    select v_id, x.d from unnest(p_days) as x(d) order by x.d;

    perform public.camp_add_parts(v_id, p_prices, p_extras);

    perform set_config('tkd.action', '', true);
    perform set_config('tkd.batch_id', '', true);

    perform public.camp_purge_old_signatures();

    return jsonb_build_object('status', 'ok', 'id', v_id, 'public_code', v_code, 'version', v_version);
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

revoke execute on function public.camp_add_camp(text, boolean, text, date[], time, time, date, date, date, integer, integer,
  jsonb, jsonb, text, text) from public, anon, authenticated, service_role;
grant  execute on function public.camp_add_camp(text, boolean, text, date[], time, time, date, date, date, integer, integer,
  jsonb, jsonb, text, text) to authenticated;

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
--             any other bad list): {"status":"invalid","field":"extras"}
--   grid      replaced (one row per day count 1 ... the new N).
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

    -- the grid: rows for day counts beyond the new number of days go,
    -- rows that differ are updated, missing rows are added
    delete from public.camp_prices p where p.camp_id = p_camp_id and p.day_count > cardinality(p_days);
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

-- 20c. camp_set_signup(p_camp_id, p_expected_version, p_open)   S / A
-- Close / Reopen sign-up (v0.700, Star v0.86's reopen rule):
--   once Finished nothing changes -> finished
--   close (p_open false): staff and admins; sets closed_by_hand
--   reopen (true): clears closed_by_hand. If the closing date has already
--     passed: staff -> not_allowed; admins -> also moves the closing date
--     to the camp's last day (so it stays open until the end)
-- Switching to what it already is writes nothing.
-- Ok: {"status":"ok","version":n,"state":"open"|"closed"|"not_open_yet"}
create or replace function public.camp_set_signup(
  p_camp_id          uuid,
  p_expected_version integer,
  p_open             boolean
)
returns jsonb
language plpgsql
volatile
security definer
set search_path = ''
as $$
declare
  v_today  date;
  v_c      public.camps;
  v_closes date;
begin
  begin
    if public.has_data_access() is not true then
      return jsonb_build_object('status', 'no_access');
    end if;
    -- 2. role: any staff member with data access (the admin-only case below)

    if p_camp_id is null or p_expected_version is null or p_open is null then
      return jsonb_build_object('status', 'invalid');
    end if;

    select * into v_c from public.camps c where c.id = p_camp_id for update;
    if not found then
      return jsonb_build_object('status', 'not_found');
    end if;
    if v_c.version <> p_expected_version then
      return jsonb_build_object('status', 'stale');
    end if;

    v_today := public.testing_today();
    if public.camp_signup_state(p_camp_id, v_today) = 'finished' then
      return jsonb_build_object('status', 'finished');
    end if;

    v_closes := v_c.signup_closes_on;
    if p_open and v_today > v_c.signup_closes_on then
      -- the closing date has passed: admins only, and it moves to the last day
      if public.is_admin() is not true then
        return jsonb_build_object('status', 'not_allowed');
      end if;
      v_closes := public.camp_last_day(p_camp_id);
    end if;

    perform set_config('tkd.action', 'camp_set_signup', true);
    perform set_config('tkd.batch_id', gen_random_uuid()::text, true);

    update public.camps c
       set closed_by_hand   = not p_open,
           signup_closes_on = v_closes
     where c.id = p_camp_id
       and (c.closed_by_hand is distinct from (not p_open) or c.signup_closes_on is distinct from v_closes)
    returning * into v_c;
    if not found then
      select * into v_c from public.camps c where c.id = p_camp_id;
    end if;

    perform set_config('tkd.action', '', true);
    perform set_config('tkd.batch_id', '', true);

    return jsonb_build_object('status', 'ok', 'version', v_c.version,
                              'state', public.camp_signup_state(p_camp_id, v_today));
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

revoke execute on function public.camp_set_signup(uuid, integer, boolean) from public, anon, authenticated, service_role;
grant  execute on function public.camp_set_signup(uuid, integer, boolean) to authenticated;

-- 20d. camp_delete_camp(p_camp_id, p_expected_version,
--        p_expected_camper_count, p_expected_payment_total_cents)   A
-- Removes a camp with its days, prices, extras, sign-ups, campers, their
-- day and extra rows and payments (every removed row is in the history). The two numbers are what the confirmation dialog
-- said: ALL campers (withdrawn ones too) and the payments' NET total
-- (reversals subtracted). If either differs now: stale, nothing removed.
-- Ok: {"status":"ok"}
create or replace function public.camp_delete_camp(
  p_camp_id                      uuid,
  p_expected_version             integer,
  p_expected_camper_count        integer,
  p_expected_payment_total_cents integer
)
returns jsonb
language plpgsql
volatile
security definer
set search_path = ''
as $$
declare
  v_version integer;
  v_count   integer;
  v_total   bigint;
begin
  begin
    if public.has_data_access() is not true then
      return jsonb_build_object('status', 'no_access');
    end if;
    if public.is_admin() is not true then
      return jsonb_build_object('status', 'not_allowed');
    end if;

    if p_camp_id is null or p_expected_version is null
       or p_expected_camper_count is null or p_expected_payment_total_cents is null then
      return jsonb_build_object('status', 'invalid');
    end if;

    select c.version into v_version from public.camps c where c.id = p_camp_id for update;
    if not found then
      return jsonb_build_object('status', 'not_found');
    end if;
    -- the sign-ups, campers and payments that will go, in id order
    perform 1 from public.camp_signups s where s.camp_id = p_camp_id order by s.id for update;
    perform 1 from public.camp_campers c where c.camp_id = p_camp_id order by c.id for update;
    perform 1 from public.camp_payments p
      join public.camp_campers c on c.id = p.camper_id
     where c.camp_id = p_camp_id
     order by p.id
       for update of p;

    if v_version <> p_expected_version then
      return jsonb_build_object('status', 'stale');
    end if;
    select count(*) into v_count from public.camp_campers c where c.camp_id = p_camp_id;
    select coalesce(sum(p.amount_cents), 0) into v_total
      from public.camp_payments p
      join public.camp_campers c on c.id = p.camper_id
     where c.camp_id = p_camp_id;
    if v_count <> p_expected_camper_count or v_total <> p_expected_payment_total_cents then
      return jsonb_build_object('status', 'stale');
    end if;

    perform set_config('tkd.action', 'camp_delete_camp', true);
    perform set_config('tkd.batch_id', gen_random_uuid()::text, true);

    -- In this order: the campers first (their day rows, extra rows and
    -- payments go with them - "on delete cascade"), then the sign-ups, then
    -- the camp (its days, prices and extras go with it). The camper rows
    -- must be gone BEFORE the camp's days and extras: their keys to those
    -- are "no action" on purpose, and PostgreSQL checks such a key as soon
    -- as each cascaded step is done, so removing the camp alone would be
    -- refused while camper rows still name its days.
    delete from public.camp_campers c where c.camp_id = p_camp_id;
    delete from public.camp_signups s where s.camp_id = p_camp_id;
    delete from public.camps c where c.id = p_camp_id;

    perform set_config('tkd.action', '', true);
    perform set_config('tkd.batch_id', '', true);

    return jsonb_build_object('status', 'ok');
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

revoke execute on function public.camp_delete_camp(uuid, integer, integer, integer) from public, anon, authenticated, service_role;
grant  execute on function public.camp_delete_camp(uuid, integer, integer, integer) to authenticated;

-- 20e. camp_save_template(p_camp_id, p_name)   A
-- Save as template: copies everything except the dates and the campers -
-- school, both schools, number of days, hours, ages, description, waiver,
-- price grid and extras - and turns the sign-up dates into "days before
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
      (v_name, v_c.location_code, v_c.both_schools, public.camp_day_count(p_camp_id), v_c.start_time, v_c.end_time,
       v_opens, v_closes, v_early, v_c.min_age, v_c.max_age, v_c.description, v_c.waiver_text,
       coalesce((select jsonb_agg(jsonb_build_object(
                          'day_count', p.day_count,
                          'member_early_cents', p.member_early_cents,
                          'member_regular_cents', p.member_regular_cents,
                          'nonmember_early_cents', p.nonmember_early_cents,
                          'nonmember_regular_cents', p.nonmember_regular_cents) order by p.day_count)
                   from public.camp_prices p where p.camp_id = p_camp_id), '[]'::jsonb),
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
-- camp, the grid for p_day_count days, extras without ids and with
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
       or p_day_count is null or p_day_count not between 1 and 10
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

-- 20g. camp_delete_template(p_template_id, p_expected_version)   A
-- Removes a template. Never touches any camp (camps are never linked to
-- the template they were made from).
-- Ok: {"status":"ok"}
create or replace function public.camp_delete_template(
  p_template_id      uuid,
  p_expected_version integer
)
returns jsonb
language plpgsql
volatile
security definer
set search_path = ''
as $$
declare
  v_version integer;
begin
  begin
    if public.has_data_access() is not true then
      return jsonb_build_object('status', 'no_access');
    end if;
    if public.is_admin() is not true then
      return jsonb_build_object('status', 'not_allowed');
    end if;

    if p_template_id is null or p_expected_version is null then
      return jsonb_build_object('status', 'invalid');
    end if;

    select t.version into v_version from public.camp_templates t where t.id = p_template_id for update;
    if not found then
      return jsonb_build_object('status', 'not_found');
    end if;
    if v_version <> p_expected_version then
      return jsonb_build_object('status', 'stale');
    end if;

    perform set_config('tkd.action', 'camp_delete_template', true);
    perform set_config('tkd.batch_id', gen_random_uuid()::text, true);

    delete from public.camp_templates t where t.id = p_template_id;

    perform set_config('tkd.action', '', true);
    perform set_config('tkd.batch_id', '', true);

    return jsonb_build_object('status', 'ok');
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

revoke execute on function public.camp_delete_template(uuid, integer) from public, anon, authenticated, service_role;
grant  execute on function public.camp_delete_template(uuid, integer) to authenticated;


-- 20h. camp_update_details(p_camper_id, p_camper_version, p_signup_version,
--        p_first, p_last, p_age, p_member, p_day_ids, p_extras,
--        p_parent_name, p_parent_phone, p_parent_relation,
--        p_emergency_name, p_emergency_phone, p_emergency_relation)   S
-- Edit details (Camper detail): the child's names, age (1-99), member box,
-- days and extras, and the family's parent / emergency contact (shared by
-- every child of the sign-up). Allowed in every camp state, Finished too.
--   p_day_ids   1-10 of this camp's day ids
--   p_extras    [{"extra_id": "<uuid>", "day_ids": [...]}] (1i): a once
--               extra with [], a per-day extra with some of p_day_ids; a
--               not-for-all-days extra is refused for an all-days camper
--               (the screen removes it before sending) -> invalid
-- Day rows are DIFFED: kept days keep their check-in; removing a day the
-- camper was checked in on -> {"status":"checked_in","day":"..."}.
-- Re-price rule (v0.700, literally): if the days, the member box or the
-- extras change, the WHOLE camper is priced again at the camp's CURRENT
-- prices (base from the grid for the new number of days, every extra row
-- at the extra's current price), with the sign-up's fixed early / regular.
-- A change to only names, age or family fields re-prices nothing.
-- A camper total over $2,000 -> invalid. A name change checks the
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
       or cardinality(p_day_ids) not between 1 and 10
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
      v_base := public.camp_base_cents(v_c.camp_id, cardinality(p_day_ids), p_member, v_s.price_kind);
      if v_base is null then
        return jsonb_build_object('status', 'invalid');
      end if;
      v_total := v_base + public.camp_extras_cents_now(p_extras);
    else
      v_base  := v_c.base_cents;
      v_total := public.camp_camper_total_cents(v_c.id);
    end if;
    if v_total > 200000 then
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

-- 20i. camp_change_paying_by(p_camper_id, p_expected_version, p_paying_by)   S
-- "Change how they'll pay": cash / check / card. Not for a withdrawn
-- camper (withdrawn) or one who owes nothing (already_paid).
-- Ok: {"status":"ok","version":n}
create or replace function public.camp_change_paying_by(
  p_camper_id        uuid,
  p_expected_version integer,
  p_paying_by        text
)
returns jsonb
language plpgsql
volatile
security definer
set search_path = ''
as $$
declare
  v_c       public.camp_campers;
  v_version integer;
begin
  begin
    if public.has_data_access() is not true then
      return jsonb_build_object('status', 'no_access');
    end if;

    if p_camper_id is null or p_expected_version is null
       or p_paying_by is null or p_paying_by not in ('cash', 'check', 'card') then
      return jsonb_build_object('status', 'invalid');
    end if;

    v_c := public.camp_lock_camper(p_camper_id);
    if v_c.id is null then
      return jsonb_build_object('status', 'not_found');
    end if;
    if v_c.version <> p_expected_version then
      return jsonb_build_object('status', 'stale');
    end if;
    if v_c.status = 'withdrawn' then
      return jsonb_build_object('status', 'withdrawn');
    end if;
    if public.camp_camper_total_cents(v_c.id) - public.camp_camper_paid_cents(v_c.id) <= 0 then
      return jsonb_build_object('status', 'already_paid');
    end if;

    perform set_config('tkd.action', 'camp_change_paying_by', true);
    perform set_config('tkd.batch_id', gen_random_uuid()::text, true);

    update public.camp_campers c
       set paying_by = p_paying_by
     where c.id = v_c.id
       and c.paying_by is distinct from p_paying_by
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

revoke execute on function public.camp_change_paying_by(uuid, integer, text) from public, anon, authenticated, service_role;
grant  execute on function public.camp_change_paying_by(uuid, integer, text) to authenticated;

-- 20j. camp_mark_paid(p_camper_id, p_expected_version)   S
-- "Mark paid" / "Mark paid $X": one click records exactly what is OWED
-- now (total - paid), method = the camper's paying_by, paid_on = today.
-- Refused for a withdrawn camper (withdrawn) or one who owes nothing
-- (already_paid). The camper's version goes up, so a double click with
-- the old version gets "stale". Last step: the signature clean-up (17a).
-- Ok: {"status":"ok","payment_id":...,"amount_cents":n,"method":"cash","version":n}
create or replace function public.camp_mark_paid(
  p_camper_id        uuid,
  p_expected_version integer
)
returns jsonb
language plpgsql
volatile
security definer
set search_path = ''
as $$
declare
  v_c          public.camp_campers;
  v_amount     integer;
  v_payment_id uuid;
  v_version    integer;
begin
  begin
    if public.has_data_access() is not true then
      return jsonb_build_object('status', 'no_access');
    end if;

    if p_camper_id is null or p_expected_version is null then
      return jsonb_build_object('status', 'invalid');
    end if;

    v_c := public.camp_lock_camper(p_camper_id);
    if v_c.id is null then
      return jsonb_build_object('status', 'not_found');
    end if;
    if v_c.version <> p_expected_version then
      return jsonb_build_object('status', 'stale');
    end if;
    if v_c.status = 'withdrawn' then
      return jsonb_build_object('status', 'withdrawn');
    end if;
    v_amount := public.camp_camper_total_cents(v_c.id) - public.camp_camper_paid_cents(v_c.id);
    if v_amount <= 0 then
      return jsonb_build_object('status', 'already_paid');
    end if;

    perform set_config('tkd.action', 'camp_mark_paid', true);
    perform set_config('tkd.batch_id', gen_random_uuid()::text, true);

    insert into public.camp_payments
      (camper_id, kind, amount_cents, method, paid_on, recorded_at, recorded_by, recorded_by_name)
    values
      (v_c.id, 'payment', v_amount, v_c.paying_by, public.testing_today(), now(), auth.uid(),
       public.change_log_actor_name())
    returning id into v_payment_id;

    update public.camp_campers c
       set version = c.version + 1
     where c.id = v_c.id
    returning c.version into v_version;

    perform set_config('tkd.action', '', true);
    perform set_config('tkd.batch_id', '', true);

    perform public.camp_purge_old_signatures();

    return jsonb_build_object('status', 'ok', 'payment_id', v_payment_id, 'amount_cents', v_amount,
                              'method', v_c.paying_by, 'version', v_version);
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

revoke execute on function public.camp_mark_paid(uuid, integer) from public, anon, authenticated, service_role;
grant  execute on function public.camp_mark_paid(uuid, integer) to authenticated;

-- 20k. camp_undo_payment(p_payment_id)   A (own, within 10 s: S)
-- Writes a reversal for a payment (the payment row stays; the two add up
-- to 0). Who may: admins (the roster's ... -> Undo payment), or the staff
-- member who recorded it less than 10 seconds ago (the Mark paid toast's
-- Undo) - the database decides from recorded_by and recorded_at; anyone
-- else -> not_allowed. Already reversed, or a reversal itself -> stale.
-- The camper's version goes up.
-- Ok: {"status":"ok","version":n}  (the camper's new version)
create or replace function public.camp_undo_payment(p_payment_id uuid)
returns jsonb
language plpgsql
volatile
security definer
set search_path = ''
as $$
declare
  v_p       public.camp_payments;
  v_version integer;
begin
  begin
    if public.has_data_access() is not true then
      return jsonb_build_object('status', 'no_access');
    end if;

    if p_payment_id is null then
      return jsonb_build_object('status', 'invalid');
    end if;

    v_p := public.camp_lock_payment(p_payment_id);
    if v_p.id is null then
      return jsonb_build_object('status', 'not_found');
    end if;
    if not coalesce(v_p.recorded_by = auth.uid() and v_p.recorded_at > now() - interval '10 seconds', false)
       and public.is_admin() is not true then
      return jsonb_build_object('status', 'not_allowed');
    end if;
    if v_p.kind <> 'payment'
       or exists (select 1 from public.camp_payments x where x.reverses_payment_id = p_payment_id) then
      return jsonb_build_object('status', 'stale');
    end if;

    perform set_config('tkd.action', 'camp_undo_payment', true);
    perform set_config('tkd.batch_id', gen_random_uuid()::text, true);

    insert into public.camp_payments
      (camper_id, kind, amount_cents, method, paid_on, recorded_at, recorded_by, recorded_by_name, reverses_payment_id)
    values
      (v_p.camper_id, 'reversal', -v_p.amount_cents, v_p.method, public.testing_today(), now(), auth.uid(),
       public.change_log_actor_name(), v_p.id);

    update public.camp_campers c
       set version = c.version + 1
     where c.id = v_p.camper_id
    returning c.version into v_version;

    perform set_config('tkd.action', '', true);
    perform set_config('tkd.batch_id', '', true);

    return jsonb_build_object('status', 'ok', 'version', v_version);
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

revoke execute on function public.camp_undo_payment(uuid) from public, anon, authenticated, service_role;
grant  execute on function public.camp_undo_payment(uuid) to authenticated;

-- 20l. camp_edit_payment(p_payment_id, p_method, p_amount_cents, p_paid_on)   A
-- Edit payment = a reversal of the old payment + a new payment with the
-- new method / amount (1 cent to $2,000) / date (not in the future).
-- Already reversed -> stale; a reversal can't be edited (invalid, as 0005).
-- Ok: {"status":"ok","payment_id":<the new payment>,"version":n}
create or replace function public.camp_edit_payment(
  p_payment_id   uuid,
  p_method       text,
  p_amount_cents integer,
  p_paid_on      date
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
       or p_amount_cents is null or p_amount_cents not between 1 and 200000
       or p_paid_on is null or p_paid_on > public.testing_today() then
      return jsonb_build_object('status', 'invalid');
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
      (camper_id, kind, amount_cents, method, paid_on, recorded_at, recorded_by, recorded_by_name, reverses_payment_id)
    values
      (v_p.camper_id, 'reversal', -v_p.amount_cents, v_p.method, public.testing_today(), now(), auth.uid(),
       public.change_log_actor_name(), v_p.id);

    insert into public.camp_payments
      (camper_id, kind, amount_cents, method, paid_on, recorded_at, recorded_by, recorded_by_name)
    values
      (v_p.camper_id, 'payment', p_amount_cents, p_method, p_paid_on, now(), auth.uid(), public.change_log_actor_name())
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

revoke execute on function public.camp_edit_payment(uuid, text, integer, date) from public, anon, authenticated, service_role;
grant  execute on function public.camp_edit_payment(uuid, text, integer, date) to authenticated;

-- 20m. camp_resolve_duplicate(p_keep_id, p_keep_version, p_other_id,
--        p_other_version, p_keep_both)   S (keep one after the last day: A)
-- The "Possible duplicate" box (C4b, v0.702):
--   keep both (true): both are marked kept_both (pointing at each other),
--     so the box doesn't come back for this pair
--   keep one (false): the other is withdrawn as "duplicate_copy" (its
--     payments stay on it); withdrawn_by = the caller, so the same person
--     may Undo it from the toast for 10 seconds (20o). After the camp's
--     last day only admins may keep one (Color Belt v0.194).
-- Both must be active campers of the same camp, and one must be marked
-- "possible duplicate" of the other (else stale: the box changed).
-- Ok: {"status":"ok","keep_version":n,"other_version":n}
create or replace function public.camp_resolve_duplicate(
  p_keep_id       uuid,
  p_keep_version  integer,
  p_other_id      uuid,
  p_other_version integer,
  p_keep_both     boolean
)
returns jsonb
language plpgsql
volatile
security definer
set search_path = ''
as $$
declare
  v_camp_id  uuid;
  v_other_cp uuid;
  v_keep     public.camp_campers;
  v_other    public.camp_campers;
  v_kv       integer;
  v_ov       integer;
begin
  begin
    if public.has_data_access() is not true then
      return jsonb_build_object('status', 'no_access');
    end if;

    if p_keep_id is null or p_keep_version is null or p_other_id is null or p_other_version is null
       or p_keep_both is null or p_keep_id = p_other_id then
      return jsonb_build_object('status', 'invalid');
    end if;

    select c.camp_id into v_camp_id from public.camp_campers c where c.id = p_keep_id;
    if not found then
      return jsonb_build_object('status', 'not_found');
    end if;
    select c.camp_id into v_other_cp from public.camp_campers c where c.id = p_other_id;
    if not found then
      return jsonb_build_object('status', 'not_found');
    end if;
    if v_other_cp <> v_camp_id then
      return jsonb_build_object('status', 'invalid');
    end if;

    -- camp -> the two sign-ups -> the two campers (each pair in id order)
    perform 1 from public.camps x where x.id = v_camp_id for no key update;
    perform 1 from public.camp_signups s
     where s.id in (select c.signup_id from public.camp_campers c where c.id in (p_keep_id, p_other_id))
     order by s.id for no key update;
    perform 1 from public.camp_campers c where c.id in (p_keep_id, p_other_id) order by c.id for update;
    select * into v_keep  from public.camp_campers c where c.id = p_keep_id;
    select * into v_other from public.camp_campers c where c.id = p_other_id;
    if v_keep.id is null or v_other.id is null then
      return jsonb_build_object('status', 'not_found');
    end if;

    if v_keep.version <> p_keep_version or v_other.version <> p_other_version then
      return jsonb_build_object('status', 'stale');
    end if;
    if v_keep.status <> 'active' or v_other.status <> 'active'
       or not ((v_keep.duplicate_state = 'possible' and v_keep.duplicate_of = p_other_id)
               or (v_other.duplicate_state = 'possible' and v_other.duplicate_of = p_keep_id)) then
      return jsonb_build_object('status', 'stale');
    end if;
    if not p_keep_both
       and public.testing_today() > public.camp_last_day(v_camp_id)
       and public.is_admin() is not true then
      return jsonb_build_object('status', 'not_allowed');
    end if;

    perform set_config('tkd.action', 'camp_resolve_duplicate', true);
    perform set_config('tkd.batch_id', gen_random_uuid()::text, true);

    if p_keep_both then
      update public.camp_campers c
         set duplicate_state = 'kept_both',
             duplicate_of    = case when c.id = p_keep_id then p_other_id else p_keep_id end
       where c.id in (p_keep_id, p_other_id);
    else
      update public.camp_campers c
         set status            = 'withdrawn',
             withdrawn_reason  = 'duplicate_copy',
             withdrawn_at      = now(),
             withdrawn_by      = auth.uid(),
             withdrawn_by_name = public.change_log_actor_name(),
             duplicate_state   = 'none',
             duplicate_of      = null
       where c.id = p_other_id;
      perform public.camp_recheck_duplicate(p_keep_id);
      perform public.camp_recheck_pointing_at(p_other_id);
    end if;

    perform set_config('tkd.action', '', true);
    perform set_config('tkd.batch_id', '', true);

    select c.version into v_kv from public.camp_campers c where c.id = p_keep_id;
    select c.version into v_ov from public.camp_campers c where c.id = p_other_id;
    return jsonb_build_object('status', 'ok', 'keep_version', v_kv, 'other_version', v_ov);
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

revoke execute on function public.camp_resolve_duplicate(uuid, integer, uuid, integer, boolean) from public, anon, authenticated, service_role;
grant  execute on function public.camp_resolve_duplicate(uuid, integer, uuid, integer, boolean) to authenticated;

-- 20n. camp_withdraw_camper(p_camper_id, p_expected_version)   S (v0.700)
-- Withdraw: the camper moves to the Removed group (reason 'withdrawn');
-- payments, days and extras stay. Already withdrawn -> withdrawn. Campers
-- marked as its possible duplicate are checked again (usually -> none).
-- Ok: {"status":"ok","version":n}
create or replace function public.camp_withdraw_camper(
  p_camper_id        uuid,
  p_expected_version integer
)
returns jsonb
language plpgsql
volatile
security definer
set search_path = ''
as $$
declare
  v_c       public.camp_campers;
  v_version integer;
begin
  begin
    if public.has_data_access() is not true then
      return jsonb_build_object('status', 'no_access');
    end if;

    if p_camper_id is null or p_expected_version is null then
      return jsonb_build_object('status', 'invalid');
    end if;

    v_c := public.camp_lock_camper(p_camper_id);
    if v_c.id is null then
      return jsonb_build_object('status', 'not_found');
    end if;
    if v_c.version <> p_expected_version then
      return jsonb_build_object('status', 'stale');
    end if;
    if v_c.status = 'withdrawn' then
      return jsonb_build_object('status', 'withdrawn');
    end if;

    perform set_config('tkd.action', 'camp_withdraw_camper', true);
    perform set_config('tkd.batch_id', gen_random_uuid()::text, true);

    update public.camp_campers c
       set status            = 'withdrawn',
           withdrawn_reason  = 'withdrawn',
           withdrawn_at      = now(),
           withdrawn_by      = auth.uid(),
           withdrawn_by_name = public.change_log_actor_name(),
           duplicate_state   = 'none',
           duplicate_of      = null
     where c.id = v_c.id;
    perform public.camp_recheck_pointing_at(v_c.id);

    perform set_config('tkd.action', '', true);
    perform set_config('tkd.batch_id', '', true);

    select c.version into v_version from public.camp_campers c where c.id = v_c.id;
    return jsonb_build_object('status', 'ok', 'version', v_version);
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

revoke execute on function public.camp_withdraw_camper(uuid, integer) from public, anon, authenticated, service_role;
grant  execute on function public.camp_withdraw_camper(uuid, integer) to authenticated;

-- 20o. camp_restore_camper(p_camper_id, p_expected_version)
--        S for an ordinary withdrawal; a "duplicate copy": A, or the staff
--        member who made it with "keep one" less than 10 seconds ago (the
--        toast's Undo - decided from withdrawn_by and withdrawn_at)
-- Back to active; the duplicate mark is worked out again for it, the
-- camper it now matches, and any campers pointing at it. An active
-- camper -> invalid.
-- Ok: {"status":"ok","version":n}
create or replace function public.camp_restore_camper(
  p_camper_id        uuid,
  p_expected_version integer
)
returns jsonb
language plpgsql
volatile
security definer
set search_path = ''
as $$
declare
  v_c       public.camp_campers;
  v_of      uuid;
  v_version integer;
begin
  begin
    if public.has_data_access() is not true then
      return jsonb_build_object('status', 'no_access');
    end if;

    if p_camper_id is null or p_expected_version is null then
      return jsonb_build_object('status', 'invalid');
    end if;

    v_c := public.camp_lock_camper(p_camper_id);
    if v_c.id is null then
      return jsonb_build_object('status', 'not_found');
    end if;
    -- a duplicate copy: staff only their own "keep one", < 10 seconds ago
    if v_c.withdrawn_reason = 'duplicate_copy'
       and public.is_admin() is not true
       and not coalesce(v_c.withdrawn_by = auth.uid() and v_c.withdrawn_at > now() - interval '10 seconds', false) then
      return jsonb_build_object('status', 'not_allowed');
    end if;
    if v_c.version <> p_expected_version then
      return jsonb_build_object('status', 'stale');
    end if;
    if v_c.status <> 'withdrawn' then
      return jsonb_build_object('status', 'invalid');
    end if;

    perform set_config('tkd.action', 'camp_restore_camper', true);
    perform set_config('tkd.batch_id', gen_random_uuid()::text, true);

    update public.camp_campers c
       set status            = 'active',
           withdrawn_reason  = null,
           withdrawn_at      = null,
           withdrawn_by      = null,
           withdrawn_by_name = null
     where c.id = v_c.id;
    perform public.camp_recheck_duplicate(v_c.id);
    select c.duplicate_of into v_of from public.camp_campers c where c.id = v_c.id;
    if v_of is not null then
      perform public.camp_recheck_duplicate(v_of);
    end if;
    perform public.camp_recheck_pointing_at(v_c.id);

    perform set_config('tkd.action', '', true);
    perform set_config('tkd.batch_id', '', true);

    select c.version into v_version from public.camp_campers c where c.id = v_c.id;
    return jsonb_build_object('status', 'ok', 'version', v_version);
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

revoke execute on function public.camp_restore_camper(uuid, integer) from public, anon, authenticated, service_role;
grant  execute on function public.camp_restore_camper(uuid, integer) to authenticated;

-- 20p. camp_delete_camper(p_camper_id, p_expected_version,
--        p_expected_payment_ids)   A
-- Delete permanently: the camper and ALL its rows (days, extras, payments
-- and reversals) are removed; every removed row is in the history. When it
-- was the sign-up's last camper, the sign-up goes too.
-- p_expected_payment_ids = the payment rows the warning named (compared as
-- a set); if they differ now, nothing is removed: stale. Campers marked as
-- its possible duplicate are checked again.
-- Ok: {"status":"ok"}
create or replace function public.camp_delete_camper(
  p_camper_id            uuid,
  p_expected_version     integer,
  p_expected_payment_ids uuid[]
)
returns jsonb
language plpgsql
volatile
security definer
set search_path = ''
as $$
declare
  v_c        public.camp_campers;
  v_pointing uuid[];
  v_id       uuid;
begin
  begin
    if public.has_data_access() is not true then
      return jsonb_build_object('status', 'no_access');
    end if;
    if public.is_admin() is not true then
      return jsonb_build_object('status', 'not_allowed');
    end if;

    if p_camper_id is null or p_expected_version is null
       or not public.testing_ids_are_valid(p_expected_payment_ids) then
      return jsonb_build_object('status', 'invalid');
    end if;

    v_c := public.camp_lock_camper(p_camper_id);
    if v_c.id is null then
      return jsonb_build_object('status', 'not_found');
    end if;
    perform 1 from public.camp_payments p where p.camper_id = v_c.id order by p.id for update;

    if v_c.version <> p_expected_version then
      return jsonb_build_object('status', 'stale');
    end if;
    if array(select p.id from public.camp_payments p where p.camper_id = v_c.id order by p.id)
       <> array(select x.id from unnest(p_expected_payment_ids) as x(id) order by x.id) then
      return jsonb_build_object('status', 'stale');
    end if;

    v_pointing := array(select c.id from public.camp_campers c where c.duplicate_of = v_c.id order by c.id);

    perform set_config('tkd.action', 'camp_delete_camper', true);
    perform set_config('tkd.batch_id', gen_random_uuid()::text, true);

    delete from public.camp_campers c where c.id = v_c.id;
    -- the sign-up's last camper: the sign-up goes too
    delete from public.camp_signups s
     where s.id = v_c.signup_id
       and not exists (select 1 from public.camp_campers c where c.signup_id = v_c.signup_id);

    foreach v_id in array v_pointing loop
      perform public.camp_recheck_duplicate(v_id);
    end loop;

    perform set_config('tkd.action', '', true);
    perform set_config('tkd.batch_id', '', true);

    return jsonb_build_object('status', 'ok');
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

revoke execute on function public.camp_delete_camper(uuid, integer, uuid[]) from public, anon, authenticated, service_role;
grant  execute on function public.camp_delete_camper(uuid, integer, uuid[]) to authenticated;

-- 20q. camp_check_in(p_camper_id, p_day_id)   S today / A earlier days
-- Checks a camper in on one of their days (v0.704): checked_in_at = now,
-- checked_in_by / _name = who. Day rule: a day after today -> future_day;
-- today -> staff and admins; an earlier day -> admins only (not_allowed).
-- A withdrawn camper -> withdrawn; a day the camper didn't pick ->
-- not_found. Already checked in -> ok with the stored values and
-- "already": true. Does NOT bump the camper's version (an open Edit
-- details doesn't go stale because a child arrived).
-- Ok: {"status":"ok","checked_in_at":...,"checked_in_by_name":"...","already":false}
create or replace function public.camp_check_in(
  p_camper_id uuid,
  p_day_id    uuid
)
returns jsonb
language plpgsql
volatile
security definer
set search_path = ''
as $$
declare
  v_c     public.camp_campers;
  v_cd    public.camp_camper_days;
  v_day   date;
  v_today date;
begin
  begin
    if public.has_data_access() is not true then
      return jsonb_build_object('status', 'no_access');
    end if;

    if p_camper_id is null or p_day_id is null then
      return jsonb_build_object('status', 'invalid');
    end if;

    v_c := public.camp_lock_camper(p_camper_id);
    if v_c.id is null then
      return jsonb_build_object('status', 'not_found');
    end if;
    if v_c.status = 'withdrawn' then
      return jsonb_build_object('status', 'withdrawn');
    end if;
    select cd.* into v_cd from public.camp_camper_days cd
     where cd.camper_id = v_c.id and cd.day_id = p_day_id
       for update;
    if not found then
      return jsonb_build_object('status', 'not_found');
    end if;
    select d.day into v_day from public.camp_days d where d.id = p_day_id;

    v_today := public.testing_today();
    if v_day > v_today then
      return jsonb_build_object('status', 'future_day');
    end if;
    if v_day < v_today and public.is_admin() is not true then
      return jsonb_build_object('status', 'not_allowed');
    end if;
    if v_cd.checked_in_at is not null then
      return jsonb_build_object('status', 'ok', 'checked_in_at', v_cd.checked_in_at,
                                'checked_in_by_name', v_cd.checked_in_by_name, 'already', true);
    end if;

    perform set_config('tkd.action', 'camp_check_in', true);
    perform set_config('tkd.batch_id', gen_random_uuid()::text, true);

    update public.camp_camper_days cd
       set checked_in_at      = now(),
           checked_in_by      = auth.uid(),
           checked_in_by_name = public.change_log_actor_name()
     where cd.id = v_cd.id
    returning * into v_cd;

    perform set_config('tkd.action', '', true);
    perform set_config('tkd.batch_id', '', true);

    return jsonb_build_object('status', 'ok', 'checked_in_at', v_cd.checked_in_at,
                              'checked_in_by_name', v_cd.checked_in_by_name, 'already', false);
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

revoke execute on function public.camp_check_in(uuid, uuid) from public, anon, authenticated, service_role;
grant  execute on function public.camp_check_in(uuid, uuid) to authenticated;

-- 20r. camp_undo_check_in(p_camper_id, p_day_id)   same day rule as 20q
-- Clears the check-in (the toast's Undo, or ... -> Undo check-in). Not
-- checked in -> ok (nothing to do). Doesn't bump the camper's version.
-- Ok: {"status":"ok"}
create or replace function public.camp_undo_check_in(
  p_camper_id uuid,
  p_day_id    uuid
)
returns jsonb
language plpgsql
volatile
security definer
set search_path = ''
as $$
declare
  v_c     public.camp_campers;
  v_cd    public.camp_camper_days;
  v_day   date;
  v_today date;
begin
  begin
    if public.has_data_access() is not true then
      return jsonb_build_object('status', 'no_access');
    end if;

    if p_camper_id is null or p_day_id is null then
      return jsonb_build_object('status', 'invalid');
    end if;

    v_c := public.camp_lock_camper(p_camper_id);
    if v_c.id is null then
      return jsonb_build_object('status', 'not_found');
    end if;
    if v_c.status = 'withdrawn' then
      return jsonb_build_object('status', 'withdrawn');
    end if;
    select cd.* into v_cd from public.camp_camper_days cd
     where cd.camper_id = v_c.id and cd.day_id = p_day_id
       for update;
    if not found then
      return jsonb_build_object('status', 'not_found');
    end if;
    select d.day into v_day from public.camp_days d where d.id = p_day_id;

    v_today := public.testing_today();
    if v_day > v_today then
      return jsonb_build_object('status', 'future_day');
    end if;
    if v_day < v_today and public.is_admin() is not true then
      return jsonb_build_object('status', 'not_allowed');
    end if;
    if v_cd.checked_in_at is null then
      return jsonb_build_object('status', 'ok');
    end if;

    perform set_config('tkd.action', 'camp_undo_check_in', true);
    perform set_config('tkd.batch_id', gen_random_uuid()::text, true);

    update public.camp_camper_days cd
       set checked_in_at      = null,
           checked_in_by      = null,
           checked_in_by_name = null
     where cd.id = v_cd.id;

    perform set_config('tkd.action', '', true);
    perform set_config('tkd.batch_id', '', true);

    return jsonb_build_object('status', 'ok');
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

revoke execute on function public.camp_undo_check_in(uuid, uuid) from public, anon, authenticated, service_role;
grant  execute on function public.camp_undo_check_in(uuid, uuid) to authenticated;

-- 20s. camp_camper_detail(p_camper_id)   S (read only)
-- Camper detail (C6): the roster row, the family's parent / emergency
-- contact (the ONLY way the app sees phones - staff and admins, v0.700),
-- the price breakdown, the payments and the check-in times per day.
-- {"status":"ok",
--  "camper": {...the camp_roster row...},
--  "family": {parent_name, parent_phone, parent_relation,
--             emergency_name, emergency_phone, emergency_relation},
--  "breakdown": {day_count, price_kind, member, base_cents,
--                extras: [{name, per, days: [date], cents}],
--                total_cents, paid_cents, owes_cents},
--  "payments": [{id, kind, amount_cents, method, paid_on, recorded_at,
--                recorded_by_name, reverses_payment_id}],
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
                                     'paid_on', p.paid_on, 'recorded_at', p.recorded_at,
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
-- 21. The two public functions (role camps_registrar ONLY)
-- They never trust the Cloudflare Function: every rule is checked again
-- here. Neither returns anything about other sign-ups (no counts, no
-- names, no campers).
-- ---------------------------------------------------------------------

-- 21a. camp_public_camp(p_code) - what the family page shows first (the
-- shape is in 17g). A code that doesn't match the 8-character pattern ->
-- not_found without looking anything up.
create or replace function public.camp_public_camp(p_code text)
returns jsonb
language plpgsql
stable
security definer
set search_path = ''
as $$
declare
  v_id uuid;
begin
  if p_code is null or p_code !~ '^[a-hjkmnp-z2-9]{8}$' then
    return jsonb_build_object('status', 'not_found');
  end if;
  select c.id into v_id from public.camps c where c.public_code = p_code;
  if not found then
    return jsonb_build_object('status', 'not_found');
  end if;
  return public.camp_public_camp_answer(v_id);
end;
$$;

revoke execute on function public.camp_public_camp(text) from public, anon, authenticated, service_role;
grant  execute on function public.camp_public_camp(text) to camps_registrar;

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
--  10. the prices at today's early / regular; a child over $2,000 ->
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
    v_base := public.camp_base_cents(v_c.id, jsonb_array_length(v_child.c -> 'day_ids'),
                                     (v_child.c ->> 'member')::boolean, v_kind);
    if v_base is null then
      return jsonb_build_object('status', 'invalid');
    end if;
    v_child_cts := v_base + public.camp_extras_cents_now(v_child.c -> 'extras');
    if v_child_cts > 200000 then
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

-- 21c. camp_public_signup(...) - the family form's Sign up. Wraps 21b:
--   * first forgets any login token the caller might have set (so nobody
--     can make a form sign-up look like a staff member's), and removes
--     camp_public_attempts rows older than 2 days
--   * runs 21b; if a table rule or a conversion still says no, a lock
--     isn't free within 3 seconds (21b step 0) or the call is cancelled,
--     everything 21b did is undone and the answer is invalid
--   * THEN writes this call's camp_public_attempts row (outcome = the
--     status answered, ok included) - outside the part that can be undone,
--     so EVERY call counts toward the rate limit, bad input included
--   * no signature clean-up here (contract §1.16)
create or replace function public.camp_public_signup(
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
security definer
set search_path = ''
as $$
declare
  v_result jsonb;
begin
  perform set_config('request.jwt.claims', '', true);
  perform set_config('request.jwt.claim.sub', '', true);

  delete from public.camp_public_attempts a where a.at < now() - interval '2 days';

  begin
    v_result := public.camp_public_signup_core(p_code, p_client_key, p_submission_id, p_children, p_parent_name,
                                               p_parent_phone, p_parent_relation, p_emergency_name, p_emergency_phone,
                                               p_emergency_relation, p_paying_by, p_acknowledged, p_signature,
                                               p_ack_version, p_waiver_version, p_expected_total_cents);
  exception
    when unique_violation or foreign_key_violation or check_violation or not_null_violation or data_exception then
      v_result := jsonb_build_object('status', 'invalid');
    when deadlock_detected or serialization_failure or lock_not_available or query_canceled then
      -- query_canceled: the statement_timeout (5 s) or a cancel ran out
      -- inside 21b; caught here so the attempt row below is still written
      v_result := jsonb_build_object('status', 'invalid');
  end;

  insert into public.camp_public_attempts (client_key, camp_id, outcome)
  values (coalesce(left(p_client_key, 200), ''),
          (select c.id from public.camps c where c.public_code = p_code),
          coalesce(v_result ->> 'status', 'invalid'));

  perform set_config('tkd.actor_label', '', true);
  return v_result;
end;
$$;

revoke execute on function public.camp_public_signup(text, text, uuid, jsonb, text, text, text, text, text, text,
  text, boolean, text, text, text, integer) from public, anon, authenticated, service_role;
grant  execute on function public.camp_public_signup(text, text, uuid, jsonb, text, text, text, text, text, text,
  text, boolean, text, text, text, integer) to camps_registrar;


commit;

-- End of 0013_camps.sql
