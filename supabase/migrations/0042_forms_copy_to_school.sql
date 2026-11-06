-- =====================================================================
-- 0042_forms_copy_to_school.sql
-- ---------------------------------------------------------------------
-- WHAT THIS FILE IS
--   New students: "Copy to Worcester / Shrewsbury" in a form's ⋯ menu on
--   the Forms list (rulebook v0.642, v0.644). It ADDS one function and changes
--   nothing else - no table, no rule, no data, no other function, no
--   right:
--     public.forms_copy_to_school(p_form_id uuid, p_location_code text)
--
-- WHY IT EXISTS
--   A form belongs to ONE school, and Duplicate (forms_duplicate, 0031
--   section 11) copies it inside that school. Jeffrey (2026-11-05) wanted
--   Shrewsbury's Visitor Information at Worcester, "copy it exactly".
--   This function makes a Draft copy of a form at the OTHER school:
--     * the same kind, questions and waiver (the form's draft) and the
--       same settings (thank-you words, the family's confirmation email,
--       add to calendar) - but NO alert email (v0.644): the new-sign-up
--       alert address is the first school's, so the copy starts without
--       one and the other school sets its own;
--     * the same name, or "Copy of ..." when that school already has a
--       form with that name (compared without capitals; cut to the 80
--       characters a name may have);
--     * the link with the other school's name (v0.644): a link ending in
--       the form's own school's name gets the other school's instead
--       (walk-in-shrewsbury -> walk-in-worcester), any other link gets it
--       added (visitor-information -> visitor-information-worcester); a
--       link longer than the 40 characters is cut at a dash, never in the
--       middle of a word; "-2", "-3" ... when it is taken;
--     * NO booking times: form_booking_offers / _limits / _group_limits
--       name the classes of the form's OWN school, so the copy starts
--       with none (booking_key '') and an admin picks the other school's
--       times in Booking settings before publishing;
--     * no sign-ups, no kiosk tokens; status Draft, never published.
--   Answers (jsonb): {status:'ok', id, version, slug, name} | no_access |
--   not_allowed (not an admin) | invalid (no form or school given, a
--   school that doesn't exist, or the form's own school) | not_found |
--   duplicate_slug (50 links taken) | stale (another change took the
--   link at the same moment - the app's Retry copies again).
--   The app's Undo (5 seconds) takes the copy away again the usual way:
--   a form without sign-ups may be removed, and a new copy has none.
--
-- WHY IT IS SAFE
--   * Security definer with search_path = '' and fully qualified names;
--     has_data_access() is checked first, then is_admin() (never on its
--     own); then the input; then a lock; then the one write.
--   * EXECUTE is taken from everyone and given back to signed-in staff
--     ("authenticated") only - nothing for anon or for the public form's
--     login forms_registrar. Inside, only admins get past the checks.
--   * Logged like Duplicate: the new forms row goes through the forms
--     table's change_log trigger, with tkd.action = 'forms_copy_to_school'
--     and one batch id (both cleared again straight after).
--   * Two copies to the same school at the same moment wait for each
--     other (that school's row is locked, as Duplicate and Create lock
--     theirs), so they can't both take one name or one link.
--   * The app that is live today keeps working: it never calls the new
--     name. Only the new app's ⋯ menu does.
--   Proof before pasting: supabase/tests/0042_preapply_check.sql
--   (SETUP.md, Migration 0042, 0042a).
--
-- WHO MAY CALL IT
--   Admins with data access, through the app (a form's ⋯ menu).
--
-- HOW TO RUN IT
--   After 0036 (live). 0037-0041 touch nothing it uses: 0037-0039 and
--   0041 are other sections', and 0040 (this branch's clean-up after
--   0036) replaces only forms_check_answers and forms_submit_core, which
--   0042 never calls - so it may go before or after any of them.
--   It needs 0009 (Forms) - it stops, and changes nothing,
--   if the forms table is missing. Supabase dashboard -> SQL Editor ->
--   New query -> paste this WHOLE file -> Run. One transaction ("begin;"
--   ... "commit;"): if any statement fails, nothing is kept.
--   Safe to run again (tested in PGlite, run.mjs step0042: a second run
--   changes no fingerprint).
--   Undo: SETUP.md, "Migration 0042", 0042e - paste
--   supabase/manual/0042u_undo.sql (it takes this one function away;
--   forms copied before stay as ordinary forms).
--   DEPLOY ORDER: this file must be live BEFORE the app version that shows
--   "Copy to Worcester / Shrewsbury".
-- =====================================================================

begin;


-- ---------------------------------------------------------------------
-- 1. The guard: this file needs 0009 (the forms table) and 0003 (the
--    schools and the name rule). Stops - and changes nothing - if one is
--    missing.
-- ---------------------------------------------------------------------
do $$
begin
  if to_regclass('public.forms') is null
     or to_regclass('public.locations') is null
     or to_regprocedure('public.testing_normalize_name(text)') is null then
    raise exception '0042 needs migration 0009 (Forms) first';
  end if;
end
$$;


-- ---------------------------------------------------------------------
-- 2. forms_copy_to_school(form, school) - "Copy to Worcester /
--    Shrewsbury" (rulebook v0.642)
-- ---------------------------------------------------------------------
-- A Draft copy of the form at the OTHER school. Copied: kind, draft
-- (questions + waiver), settings without the alert email. Not copied:
-- booking times (the classes of the form's own school), sign-ups, kiosk
-- tokens, what families see (published). Name: the same, or "Copy of ..."
-- when that school has one like it (any capitals). Link: the other
-- school's name in place of the form's own at its end, else added; cut
-- at a dash to fit 40 characters; "-2" ... "-50" when taken.
-- Who: admins (has_data_access first, then is_admin).
-- Refused: no_access; not_allowed; invalid (no form / no school / an
-- unknown school / the form's own school); not_found; duplicate_slug
-- (50 links taken); stale (a link taken at the same moment, or a lock
-- that couldn't be had).
-- Ok: {"status":"ok","id","version","slug","name"}
-- locks: the OTHER school's locations row (as Duplicate locks its own),
-- so two copies to one school wait for each other
create or replace function public.forms_copy_to_school(p_form_id uuid, p_location_code text)
returns jsonb
language plpgsql
volatile
security definer
set search_path = ''
as $$
declare
  v_f record;
  v_id uuid;
  v_version integer;
  v_name text;
  v_slug text;
  v_tail text;
  v_base text;   -- the link without the form's own school's name at its end
  v_cut text;    -- the part of v_base that fits before the tail
  v_i integer := 1;
begin
  begin
    if public.has_data_access() is not true then return jsonb_build_object('status', 'no_access'); end if;
    if public.is_admin() is not true then return jsonb_build_object('status', 'not_allowed'); end if;
    if p_form_id is null or p_location_code is null then return jsonb_build_object('status', 'invalid'); end if;
    if not exists (select 1 from public.locations l where l.code = p_location_code) then
      return jsonb_build_object('status', 'invalid');
    end if;
    select f.* into v_f from public.forms f where f.id = p_form_id;
    if not found then return jsonb_build_object('status', 'not_found'); end if;
    if v_f.location_code = p_location_code then return jsonb_build_object('status', 'invalid'); end if;
    -- the OTHER school's row, as Duplicate takes its own: two copies to the same school wait for
    -- each other, so they can't both take one name or one link
    perform 1 from public.locations l where l.code = p_location_code for no key update;
    v_name := v_f.name;
    if exists (select 1 from public.forms f where f.location_code = p_location_code and lower(f.name) = lower(v_f.name)) then
      v_name := public.testing_normalize_name(left('Copy of ' || v_f.name, 80));
    end if;
    -- the link (v0.644): the form's own school's name at its end makes way for the other school's
    v_base := v_f.slug;
    if char_length(v_base) > char_length(v_f.location_code) + 1
       and right(v_base, char_length(v_f.location_code) + 1) = '-' || v_f.location_code then
      v_base := left(v_base, char_length(v_base) - char_length(v_f.location_code) - 1);
    end if;
    loop
      v_tail := '-' || p_location_code || case when v_i = 1 then '' else '-' || v_i::text end;
      v_cut := v_base;
      if char_length(v_base) > 40 - char_length(v_tail) then
        -- too long: cut at a dash, never in a word (a first word too long for the room is cut)
        v_cut := left(v_base, 40 - char_length(v_tail));
        if substr(v_base, 41 - char_length(v_tail), 1) <> '-' and strpos(v_cut, '-') > 0 then
          v_cut := regexp_replace(v_cut, '-[^-]*$', '');
        end if;
      end if;
      v_slug := rtrim(v_cut, '-') || v_tail;
      exit when not exists (select 1 from public.forms f where f.slug = v_slug);
      v_i := v_i + 1;
      if v_i > 50 then return jsonb_build_object('status', 'duplicate_slug'); end if;
    end loop;
    perform set_config('tkd.action', 'forms_copy_to_school', true);
    perform set_config('tkd.batch_id', gen_random_uuid()::text, true);
    -- the settings without the alert email (v0.644): that address is the first school's
    insert into public.forms (location_code, name, slug, kind, draft, settings, booking_key)
    values (p_location_code, v_name, v_slug, v_f.kind, v_f.draft,
            jsonb_set(v_f.settings, '{alert_email}', 'null'::jsonb, true), '')
    returning id, version into v_id, v_version;
    perform set_config('tkd.action', '', true);
    perform set_config('tkd.batch_id', '', true);
    return jsonb_build_object('status', 'ok', 'id', v_id, 'version', v_version, 'slug', v_slug, 'name', v_name);
  exception
    when unique_violation then return jsonb_build_object('status', 'stale');
    when foreign_key_violation or check_violation or not_null_violation then return jsonb_build_object('status', 'invalid');
    when deadlock_detected or serialization_failure or lock_not_available then return jsonb_build_object('status', 'stale');
  end;
end;
$$;

-- Rights: nobody, then signed-in staff only (admins only, inside).
revoke execute on function public.forms_copy_to_school(uuid, text) from public, anon, authenticated, service_role;
grant  execute on function public.forms_copy_to_school(uuid, text) to authenticated;


commit;

-- End of 0042_forms_copy_to_school.sql
