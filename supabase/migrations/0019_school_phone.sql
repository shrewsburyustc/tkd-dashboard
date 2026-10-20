-- =====================================================================
-- 0019_school_phone.sql
-- ---------------------------------------------------------------------
-- WHAT THIS FILE IS
--   A database migration for the TKD staff dashboard. It runs after 0005
--   (school addresses) and 0009 (Forms). It gives each school an
--   optional PHONE number, entered by an admin in Settings -> Schools
--   next to the address.
--
-- WHY IT EXISTS
--   Rulebook (new-students branch), F3 difference 4, option C (Jeffrey,
--   2026-10-19): when a family opens a sign-up form that is closed, the
--   page says "Call us at <phone> to try a free class" instead of only
--   "Please contact the school". 0009's forms_public_get already returns
--   the school row's "phone" - until now the table had no such column,
--   so it was always empty. 0009 is NOT changed by this file.
--
-- WHAT IT DOES
--   1. public.locations gets a "phone" column: empty, or 7-20 characters
--      of digits, spaces, + ( ) - . with 7-15 digits (the same rule as a
--      parent's phone on the forms, 0009's forms_phone_ok).
--   2. locations_phone_before_write (a second BEFORE trigger, after
--      0005's locations_before_write): a phone change bumps the version
--      and stamps "last changed by", like an address change. 0005's
--      trigger function is NOT changed (its fingerprints stay the same -
--      the 0010 undo check compares them).
--   3. settings_update_school_contact(code, expected version, street,
--      city, state, zip, phone) - admins only. Saves the address (by
--      calling 0005's settings_update_school_address, unchanged) and the
--      phone together: both or neither. Settings -> Schools -> Edit uses
--      it; the address-only function still works as before.
--   4. Staff may read the phone column (the school's public number - no
--      family data). Nothing is granted to anon.
--   History: 0005's locations_log trigger already writes every change of
--   a school row to change_log (who, when, before/after), phone included.
--   A save that changes both writes two rows with two batch ids
--   (0005's address function makes its own; accepted - nothing groups
--   school changes by batch, and changing 0005 would move its
--   fingerprints).
--
-- IF 0005 IS EVER RE-RUN (e.g. the 0010 undo, SETUP section 14e)
--   0005 starts with "revoke all on public.locations" and grants back only
--   ITS columns, so the phone can no longer be read (Settings -> Schools
--   then fails to load). Re-run this file right after; nothing else is
--   lost (the phone numbers stay in the table).
--
-- HOW TO RUN IT
--   Supabase dashboard -> SQL Editor -> New query -> paste this WHOLE
--   file -> Run. One transaction: if anything fails, nothing is kept.
--   Supabase may warn about the "drop ... if exists" lines: they only make
--   re-running safe. Nothing is removed. Safe to run again.
--   Apply it BEFORE the app version that shows the phone is deployed.
-- =====================================================================

begin;

do $$
begin
  if to_regprocedure('public.settings_update_school_address(text, integer, text, text, text, text)') is null then
    raise exception '0019 needs 0005 (school addresses) first.';
  end if;
  if to_regprocedure('public.forms_public_get(text)') is null then
    raise exception '0019 needs 0009 (Forms) first.';
  end if;
end;
$$;


-- ---------------------------------------------------------------------
-- 1. The column
-- ---------------------------------------------------------------------
alter table public.locations add column if not exists phone text null;

-- Written out here (not a call to 0009's forms_phone_ok) so the table
-- doesn't depend on a Forms function.
alter table public.locations drop constraint if exists locations_phone_check;
alter table public.locations add constraint locations_phone_check
  check (phone is null
         or (char_length(phone) between 7 and 20
             and phone ~ '^[0-9 +().-]+$'
             and phone = btrim(phone)
             and char_length(regexp_replace(phone, '[^0-9]', '', 'g')) between 7 and 15));

comment on column public.locations.phone is
  'School phone shown to families (a closed sign-up form says "Call us at ..."). Empty = none. Changed only by settings_update_school_contact (0019).';


-- ---------------------------------------------------------------------
-- 2. locations_phone_before_write() - BEFORE UPDATE on locations
-- Postgres runs BEFORE triggers in name order, so this runs AFTER 0005's
-- locations_before_write (b < p), which keeps the version as it was when
-- only the phone changed. Here a phone change bumps it. (In one UPDATE that
-- changes the address too it goes up once; settings_update_school_contact
-- writes the address and the phone one after the other, so a save that
-- changes both raises it by 2 - harmless: it only has to change.)
-- ---------------------------------------------------------------------
create or replace function public.locations_phone_before_write()
returns trigger
language plpgsql
set search_path = ''
as $$
begin
  if new.phone is distinct from old.phone and new.version = old.version then
    new.version         := old.version + 1;
    new.updated_at      := now();
    new.updated_by      := auth.uid();
    new.updated_by_name := public.change_log_actor_name();
  end if;
  return new;
end;
$$;

revoke execute on function public.locations_phone_before_write() from public, anon, authenticated, service_role;

drop trigger if exists locations_phone_before_write on public.locations;
create trigger locations_phone_before_write
  before update on public.locations
  for each row
  execute function public.locations_phone_before_write();


-- ---------------------------------------------------------------------
-- 3. settings_update_school_contact(p_code, p_expected_version,
--      p_street, p_city, p_state, p_zip, p_phone)   A
-- Settings -> Schools -> Edit (one Save for the address and the phone).
-- The address part follows 0005's rules exactly (it is passed on to
-- settings_update_school_address). The phone: spaces at the ends are
-- removed; empty = no phone; otherwise the rule of section 1.
-- Saving the same values writes nothing.
-- Ok: {"status":"ok","version":n}
-- Else: no_access · not_allowed · invalid · not_found · stale
-- ---------------------------------------------------------------------
create or replace function public.settings_update_school_contact(
  p_code             text,
  p_expected_version integer,
  p_street           text,
  p_city             text,
  p_state            text,
  p_zip              text,
  p_phone            text
)
returns jsonb
language plpgsql
volatile
security definer
set search_path = ''
as $$
declare
  v_phone   text := nullif(btrim(p_phone), '');
  v_answer  jsonb;
  v_version integer;
  v_new     integer;
begin
  begin
    if public.has_data_access() is not true then
      return jsonb_build_object('status', 'no_access');
    end if;
    if public.is_admin() is not true then
      return jsonb_build_object('status', 'not_allowed');
    end if;

    if v_phone is not null
       and not coalesce(char_length(v_phone) between 7 and 20
                        and v_phone ~ '^[0-9 +().-]+$'
                        and char_length(regexp_replace(v_phone, '[^0-9]', '', 'g')) between 7 and 15, false) then
      return jsonb_build_object('status', 'invalid');
    end if;

    -- The address first (it checks the version and locks the row).
    v_answer := public.settings_update_school_address(p_code, p_expected_version, p_street, p_city, p_state, p_zip);
    if v_answer ->> 'status' is distinct from 'ok' then
      -- Nothing was saved: raising undoes this block (incl. the address,
      -- if it had been written), then the same status goes back.
      raise exception using errcode = 'P0001', message = 'tkd_school_contact:' || coalesce(v_answer ->> 'status', 'invalid');
    end if;
    v_version := (v_answer ->> 'version')::integer;

    perform set_config('tkd.action', 'update_school_phone', true);
    perform set_config('tkd.batch_id', gen_random_uuid()::text, true);

    update public.locations l
       set phone = v_phone
     where l.code = p_code
       and l.phone is distinct from v_phone
    returning l.version into v_new;

    perform set_config('tkd.action', '', true);
    perform set_config('tkd.batch_id', '', true);

    return jsonb_build_object('status', 'ok', 'version', coalesce(v_new, v_version));
  exception
    when raise_exception then
      if sqlerrm like 'tkd_school_contact:%' then
        return jsonb_build_object('status', substr(sqlerrm, char_length('tkd_school_contact:') + 1));
      end if;
      raise;
    when check_violation or not_null_violation then
      return jsonb_build_object('status', 'invalid');
    when deadlock_detected or serialization_failure or lock_not_available then
      return jsonb_build_object('status', 'stale');
  end;
end;
$$;

revoke execute on function public.settings_update_school_contact(text, integer, text, text, text, text, text) from public, anon, authenticated, service_role;
grant  execute on function public.settings_update_school_contact(text, integer, text, text, text, text, text) to authenticated;


-- ---------------------------------------------------------------------
-- 4. Read right (added to 0005's column list; nothing for anon)
-- ---------------------------------------------------------------------
revoke all (phone) on public.locations from public, anon, authenticated, service_role;
grant select (phone) on public.locations to authenticated;

commit;
