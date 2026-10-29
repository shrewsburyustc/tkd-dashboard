-- =====================================================================
-- 0032_black_belt_review.sql
-- ---------------------------------------------------------------------
-- WHAT THIS FILE IS
--   The database half of Black Belt's design-review items (BB8, BB13 and
--   the Edit cycle Undo race). It runs after 0016 (Black Belt testing),
--   0024 (the rubric editor) and 0025 (grading and results), all live.
--   It changes NO table column, NO rule and NO data. It:
--     1. REPLACES one function, public.bb_time_is_valid (0016 section
--        1c), with the same name, argument, answer type and rights;
--     2. ADDS public.bb_history_strip (a helper nobody in the app may
--        call) and public.bb_candidate_history (BB8: the History line of
--        a candidate), with ONE index on the shared change_log so that
--        line stays fast (change_log_bb_candidate_child_idx, section 3b);
--     3. ADDS public.bb_undo_cycle_edit (Edit cycle's "Changes saved ·
--        Undo" in ONE call, refused when a family registered after the
--        save).
--
-- WHY IT EXISTS
--   * BB13 (rulebook v1.019 / S12): every time list in the dashboard
--     runs 6:00 AM - 10:00 PM on a 5-minute step. A testing day's start
--     and end were allowed only on a 15-minute step. The database must
--     accept the new times BEFORE the app offers them.
--   * BB8 (rulebook v1.010): every person's summary ends with the
--     History line. Black Belt had no reader for its change log.
--   * The Undo race: today the app reads the roster, then switches the
--     registration back, then puts the old values back - three separate
--     calls. A family that registers in between is not seen, and a
--     failure halfway leaves the cycle half undone. One database call
--     that locks the cycle first closes both gaps.
--
-- WHY IT IS SAFE
--   * bb_time_is_valid only WIDENS: every old time (6:00 AM - 10:00 PM,
--     15-minute step) is also on the 5-minute step (15 is a multiple of
--     5), so every saved testing day stays valid. Postgres does not
--     re-check saved rows when a function inside a table rule is
--     replaced - here that doesn't matter, because nothing that was
--     allowed becomes refused. The table rules that use it
--     (bb_cycle_days_times_check, bb_cycle_days_second_times_check) and
--     the functions that use it pick up the new rule by themselves.
--   * The two reader / helper functions only READ.
--   * The index (3b) is "partial": it holds only the insert rows of the
--     six Black Belt child tables, so it changes nothing for any other
--     section (no other section's fingerprints or tests list
--     change_log's indexes - run.mjs step0032 checks the fingerprints).
--     Building it holds change_log's writes for a moment; on the
--     school's data that is a few seconds at most.
--   * bb_undo_cycle_edit writes only through the two existing functions
--     (bb_set_registration, bb_update_cycle), so every rule, log row and
--     refusal of theirs still applies. It writes no history row of its
--     own: an Undo that goes through leaves exactly the rows those two
--     write; a refused Undo leaves none.
--   * Nothing is granted to anon. The two staff functions are for
--     signed-in staff ("authenticated") only and check has_data_access()
--     FIRST, like every Black Belt function.
--   Proof before pasting: supabase/tests/0032_preapply_check.sql (SETUP.md,
--   Migration 0032, 0032a).
--
-- WORDS USED BELOW
--   * "immutable": the answer depends only on the input; a table rule
--     (CHECK) may only use such functions.
--   * "security definer": the function runs with its owner's rights, so
--     it can read tables the app itself can't (change_log); it then
--     decides itself who may see what.
--   * search_path = '': the function looks up nothing by a short name,
--     so nobody can slip in a look-alike object (as 0016).
--   * "login id": the uuid of a sign-in (created_by, recorded_by ...).
--     History shows WHO by name only, never by login id.
--
-- HOW TO RUN IT
--   After 0016, 0024 and 0025. Supabase dashboard -> SQL Editor -> New
--   query -> paste this WHOLE file -> Run. One transaction ("begin;" ...
--   "commit;"): if any statement fails, nothing is kept.
--   Safe to run again (tested in PGlite, run.mjs step0032: a second run
--   changes no fingerprint).
--   RE-RUN ORDER: re-running 0016 after this file puts 0016's OLD time
--   rule back -> re-run this file straight after (0025's warning about
--   re-running 0016 applies anyway).
--   Undo: SETUP.md, "Migration 0032", 0032e - paste
--   supabase/manual/0032u_undo.sql (it refuses while any saved testing
--   day uses a time off the 15-minute step; it also removes the index).
--   DEPLOY ORDER: this file must be live BEFORE an app version that
--   calls bb_candidate_history or bb_undo_cycle_edit. The app that is
--   live today keeps working unchanged after it.
-- =====================================================================

begin;


-- ---------------------------------------------------------------------
-- 1. The guard: this file needs 0016, 0024 and 0025. Stops - and
--    changes nothing - if one is missing.
-- ---------------------------------------------------------------------
do $$
begin
  if to_regprocedure('public.bb_time_is_valid(time)') is null
     or to_regclass('public.bb_cycles') is null
     or to_regclass('public.bb_candidates') is null then
    raise exception '0032 needs migration 0016 (Black Belt testing) first';
  end if;
  if to_regclass('public.bb_default_rubric') is null
     or to_regprocedure('public.bb_set_registration(uuid, integer, boolean)') is null then
    raise exception '0032 needs migration 0024 (the Black Belt rubric editor) first';
  end if;
  if to_regclass('public.bb_grades') is null
     or to_regclass('public.bb_result_sends') is null
     or to_regprocedure('public.bb_update_cycle(uuid, integer, jsonb)') is null then
    raise exception '0032 needs migration 0025 (Black Belt grading and results) first';
  end if;
end
$$;


-- ---------------------------------------------------------------------
-- 2. BB13 - testing-day times on a 5-minute step (0016's section 1c;
--    only the step changes)
-- ---------------------------------------------------------------------

-- 1c. bb_time_is_valid(time) - a testing day's start or end time (the
-- screen's time list): 6:00 AM to 10:00 PM on a 5-minute step (6:00, 6:05
-- ...), no seconds. NULL -> false.
-- (0016's text was a 15-minute step; replaced by 0032, rulebook v1.019 /
-- S12, design-review BB13.)
create or replace function public.bb_time_is_valid(p_time time)
returns boolean
language sql
immutable
set search_path = ''
as $$
  select coalesce(p_time between time '06:00' and time '22:00'
                  and extract(minute from p_time)::integer % 5 = 0
                  and extract(second from p_time) = 0,
                  false);
$$;

-- Nobody in the app may call it (as in 0016); the Black Belt functions
-- and the table rules use it as its owner.
revoke execute on function public.bb_time_is_valid(time) from public, anon, authenticated, service_role;


-- ---------------------------------------------------------------------
-- 3. BB8 - History
-- ---------------------------------------------------------------------

-- 3a. bb_history_strip(row) - takes every login-id key out of one
-- history row's "before" or "after": created_by, updated_by,
-- withdrawn_by, recorded_by, marked_by, undone_by, plus submission_id
-- (the family browser's send id) and makeup_of_candidate_id (the earlier
-- row's id - the candidate detail never shows it either, 0025 9j).
-- A second line of defence for the private values: the log triggers
-- already write the date of birth, the email, the kept age, the
-- signature and the signer's name as "on file" / "changed" (0016 11k,
-- 0025 5b); if any of them ever holds something else that is not null,
-- it shows as "on file". null stays null. Anything that isn't a JSON
-- object -> null.
-- Like Color Belt's testing_history_strip: nobody in the app may call it.
create or replace function public.bb_history_strip(p_row jsonb)
returns jsonb
language sql
immutable
set search_path = ''
as $$
  select case
           when p_row is null or jsonb_typeof(p_row) <> 'object' then null
           else (p_row - array['created_by', 'updated_by', 'withdrawn_by', 'recorded_by', 'marked_by', 'undone_by',
                               'submission_id', 'makeup_of_candidate_id'])
                || coalesce((select jsonb_object_agg(k.key,
                                                     case when k.value in ('"on file"'::jsonb, '"changed"'::jsonb) then k.value
                                                          else '"on file"'::jsonb end)
                               from jsonb_each(p_row) as k(key, value)
                              where k.key in ('date_of_birth', 'email_for_results', 'age_kept', 'signature', 'signer_name')
                                and jsonb_typeof(k.value) <> 'null'), '{}'::jsonb)
         end;
$$;

revoke execute on function public.bb_history_strip(jsonb) from public, anon, authenticated, service_role;

-- 3b. change_log_bb_candidate_child_idx - an index for the History line's
-- second half (3c): the INSERT rows of the six Black Belt child tables,
-- looked up by the candidate they name (after ->> 'candidate_id').
-- "Partial": only those rows are in it (a small part of the shared
-- change_log), so it stays small and every other section's writes cost
-- nothing more than skipping it. The reader's WHERE says exactly the same
-- (the same six table names, op = 'insert'), which is what lets Postgres
-- use it. The reader's first half (the candidate's own rows) uses 0003's
-- change_log_table_record_idx (table_name, record_id), as does the step
-- from a child row's insert to all of its rows.
-- Building it locks change_log against writes for a moment (a few
-- seconds at most at the school's size); every other section only waits.
create index if not exists change_log_bb_candidate_child_idx
  on public.change_log ((after ->> 'candidate_id'))
  where table_name in ('bb_payments', 'bb_candidate_waivers', 'bb_grades', 'bb_extra_counts',
                       'bb_makeup_subjects', 'bb_result_sends')
    and op = 'insert';

-- 3c. bb_candidate_history(p_candidate_id)   S
-- The History line of one candidate: newest first, at most 500 rows -
-- the change_log rows of THIS candidate (bb_candidates) and of its own
-- rows in bb_payments, bb_candidate_waivers, bb_grades, bb_extra_counts,
-- bb_makeup_subjects and bb_result_sends. A child row is found through
-- its INSERT row (update rows hold only the changed columns), whose
-- "after" names this candidate_id; then rows are matched by the PAIR
-- (table_name, record_id), so another table's row with the same id
-- never appears (Star's star_candidate_history pattern, without its date
-- of birth and email: everything goes through 3a).
-- Written as two parts joined with "union all" (not one "own rows OR in
-- a list" filter), so each part can use an index (3b) instead of reading
-- the whole shared change_log:
--   (a) the candidate's own rows: table_name + record_id;
--   (b) the child rows: their insert rows by candidate (3b), then every
--       row of each (table_name, record_id) pair.
-- Only occurred_at, actor_name, action, table_name, op, before, after.
-- No actor_id, session_id or batch_id.
-- Who: any staff member with data access (as bb_candidate_detail).
-- Refused: no_access; invalid (no id); not_found (no such candidate -
-- also after it was removed for good).
-- No error mapping (unlike the write functions): a read takes no locks
-- and writes nothing, so none of their mapped errors can happen here; an
-- unexpected error reaches the app as an error (its Retry bar).
-- Ok: {"status":"ok","rows":[{occurred_at, actor_name, action, table_name, op, before, after}]}
-- locks: none (a read)
create or replace function public.bb_candidate_history(p_candidate_id uuid)
returns jsonb
language plpgsql
stable
security definer
set search_path = ''
as $$
begin
  if public.has_data_access() is not true then
    return jsonb_build_object('status', 'no_access');
  end if;
  if p_candidate_id is null then
    return jsonb_build_object('status', 'invalid');
  end if;
  if not exists (select 1 from public.bb_candidates c where c.id = p_candidate_id) then
    return jsonb_build_object('status', 'not_found');
  end if;

  return jsonb_build_object(
    'status', 'ok',
    'rows', coalesce((
      select jsonb_agg(jsonb_build_object(
                         'occurred_at', h.occurred_at,
                         'actor_name',  h.actor_name,
                         'action',      h.action,
                         'table_name',  h.table_name,
                         'op',          h.op,
                         'before',      public.bb_history_strip(h.before),
                         'after',       public.bb_history_strip(h.after))
                       order by h.occurred_at desc, h.id desc)
        from (select x.id, x.occurred_at, x.actor_name, x.action, x.table_name, x.op, x.before, x.after
                from (-- (a) the candidate's own rows
                      select l.id, l.occurred_at, l.actor_name, l.action, l.table_name, l.op, l.before, l.after
                        from public.change_log l
                       where l.table_name = 'bb_candidates'
                         and l.record_id = p_candidate_id
                      union all
                      -- (b) every row of each child row this candidate's insert rows name
                      select l.id, l.occurred_at, l.actor_name, l.action, l.table_name, l.op, l.before, l.after
                        from (select distinct i.table_name, i.record_id
                                from public.change_log i
                               where (i.after ->> 'candidate_id') = p_candidate_id::text
                                 and i.table_name in ('bb_payments', 'bb_candidate_waivers', 'bb_grades', 'bb_extra_counts',
                                                      'bb_makeup_subjects', 'bb_result_sends')
                                 and i.op = 'insert') as k
                        join public.change_log l
                          on l.table_name = k.table_name
                         and l.record_id = k.record_id) as x
               order by x.occurred_at desc, x.id desc
               limit 500) as h), '[]'::jsonb));
end;
$$;

revoke execute on function public.bb_candidate_history(uuid) from public, anon, authenticated, service_role;
grant  execute on function public.bb_candidate_history(uuid) to authenticated;


-- ---------------------------------------------------------------------
-- 4. Edit cycle's Undo in one call
-- ---------------------------------------------------------------------

-- 4a. bb_undo_cycle_edit(p_cycle_id, p_expected_version, p_payload,
--                        p_open, p_known_ids)   A
-- "Changes saved · Undo" of Edit cycle (BB5, v0.967), done by the
-- database in ONE transaction:
--   p_expected_version  the version the save returned
--   p_payload           the old values, exactly as bb_update_cycle takes
--                       them (the app's buildUpdatePayload)
--   p_open              the registration switch to put back, or NULL
--                       when the save didn't change it
--   p_known_ids         every candidate of the cycle the app saw just
--                       BEFORE the save (withdrawn ones too - the roster
--                       lists them); at most 2000
-- Order of the checks:
--   no data access -> no_access; not an admin -> not_allowed;
--   no id / version / list, an empty entry in the list, more than 2000
--   entries -> invalid;
--   lock the cycle (for update; the same lock bb_set_registration and
--   bb_update_cycle take first, so the order of locks is the same);
--   no such cycle -> not_found;
--   a candidate of this cycle that came through the FAMILY FORM and is
--   not in p_known_ids -> registered (a family registered after the
--   save: the Undo would put back values they registered under);
--   nothing is written.
-- Then, in an inner block:
--   p_open not null -> bb_set_registration(id, version, p_open), and
--   its new version is used next; then bb_update_cycle(id, that version,
--   p_payload).
--   Either answer not ok -> that answer is kept, the inner block is
--   undone (so a switch that went through is put back too), and the
--   kept answer is returned as it is (stale, has_grades, duplicate_name,
--   invalid, part_without_day + parts, finished, waiver_needed ...).
-- A registration locks the cycle "for no key update" (0016), which waits
-- for this lock: a family either registers before the Undo (-> refused)
-- or after it (registering under the old values, as it should).
-- Its own new name, not a 4th argument on bb_update_cycle: an argument
-- with a default would make the web API's choice between two versions
-- of bb_update_cycle ambiguous.
-- Ok: {"status":"ok","version":n}
create or replace function public.bb_undo_cycle_edit(
  p_cycle_id         uuid,
  p_expected_version integer,
  p_payload          jsonb,
  p_open             boolean,
  p_known_ids        uuid[]
)
returns jsonb
language plpgsql
volatile
security definer
set search_path = ''
as $$
declare
  v_c       public.bb_cycles;
  v_r       jsonb;
  v_kept    jsonb;
  v_version integer;
begin
  begin
    if public.has_data_access() is not true then
      return jsonb_build_object('status', 'no_access');
    end if;
    if public.is_admin() is not true then
      return jsonb_build_object('status', 'not_allowed');
    end if;

    if p_cycle_id is null or p_expected_version is null or p_known_ids is null
       or cardinality(p_known_ids) > 2000
       or exists (select 1 from unnest(p_known_ids) as k(id) where k.id is null) then
      return jsonb_build_object('status', 'invalid');
    end if;

    -- the cycle first, as both inner functions lock it
    select * into v_c from public.bb_cycles y where y.id = p_cycle_id for update;
    if not found then
      return jsonb_build_object('status', 'not_found');
    end if;

    -- a family registered after the save -> refused, nothing written
    if exists (select 1 from public.bb_candidates c
                where c.cycle_id = p_cycle_id
                  and c.source = 'form'
                  and not (c.id = any (p_known_ids))) then
      return jsonb_build_object('status', 'registered');
    end if;

    v_version := p_expected_version;
    begin
      if p_open is not null then
        v_r := public.bb_set_registration(p_cycle_id, v_version, p_open);
        if v_r ->> 'status' is distinct from 'ok' then
          v_kept := v_r;
          raise exception using errcode = 'BBU32', message = 'bb_undo_cycle_edit: the switch was refused';
        end if;
        v_version := (v_r ->> 'version')::integer;
      end if;
      v_r := public.bb_update_cycle(p_cycle_id, v_version, p_payload);
      if v_r ->> 'status' is distinct from 'ok' then
        v_kept := v_r;
        raise exception using errcode = 'BBU32', message = 'bb_undo_cycle_edit: the values were refused';
      end if;
      v_version := (v_r ->> 'version')::integer;
    exception
      -- only our own signal: everything this inner block wrote is undone,
      -- and the refusal is answered as it came
      when sqlstate 'BBU32' then
        return v_kept;
    end;

    return jsonb_build_object('status', 'ok', 'version', v_version);
  exception
    when unique_violation then
      return jsonb_build_object('status', 'stale');
    when foreign_key_violation or check_violation or not_null_violation then
      return jsonb_build_object('status', 'invalid');
    when numeric_value_out_of_range or invalid_text_representation then
      return jsonb_build_object('status', 'invalid');
    when deadlock_detected or serialization_failure or lock_not_available then
      return jsonb_build_object('status', 'stale');
  end;
end;
$$;

revoke execute on function public.bb_undo_cycle_edit(uuid, integer, jsonb, boolean, uuid[]) from public, anon, authenticated, service_role;
grant  execute on function public.bb_undo_cycle_edit(uuid, integer, jsonb, boolean, uuid[]) to authenticated;


commit;

-- End of 0032_black_belt_review.sql
