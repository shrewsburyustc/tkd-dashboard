-- =====================================================================
-- 0024_black_belt_rubric.sql
-- ---------------------------------------------------------------------
-- WHAT THIS FILE IS
--   The database migration for the Black Belt RUBRIC EDITOR (rulebook
--   v0.921-v0.934). Build contract: docs/Dashboard Docs/Build contracts/
--   CONTRACT-0024.md. It runs after every live migration (0001-0021) and
--   after 0016 (Black Belt testing) in particular. It changes no object of
--   0001-0023 except six 0016 objects, each REPLACED here ("create or
--   replace" / "drop ... if exists" + create), never by editing 0016:
--     bb_cycles_rules()  (trigger function), the trigger
--     bb_cycles_before_write, the rule bb_cycles_requirements_check,
--     bb_set_registration, bb_add_cycle and bb_public_cycle.
--
-- WHY IT EXISTS
--   The "rubric" is what each Dan is tested on: the four parts, their
--   subjects, how each subject is scored, the points, the pass marks and
--   the extra points. Until now it was a fixed sheet (0016, "schema
--   version 1") that only Jeffrey could change by hand. Now:
--     * there is ONE default rubric (Rubric and prices) that admins edit,
--       one Dan at a time (v0.921, v0.923);
--     * every new cycle gets its OWN copy of the default when it is added,
--       editable until registration first opens - then locked (v0.921);
--     * only an admin may open registration the first time (it locks the
--       rubric), and that first opening can be undone for 15 seconds
--       (v0.929, v0.930);
--     * a new cycle is always saved closed (v0.933; 0016 already did).
--   The sheet keeps being ONE JSON document per place (a cycle's copy in
--   bb_cycles.requirements, the default in bb_default_rubric.sheet), now
--   in a stricter shape, "schema version 2" (contract section 2.2), which
--   the database checks completely before anything is stored (section 2
--   below, "the validator").
--
-- WHAT IT ADDS
--   * 2 tables: bb_default_rubric (one row: the default rubric) and
--     bb_rubric_undo (hidden "undo slots": what the last save or first
--     opening replaced, so the toast's Undo can put it back)
--   * 5 staff write functions: bb_save_default_dan, bb_undo_default_dan,
--     bb_save_cycle_dan, bb_undo_cycle_dan, bb_undo_first_open
--   * 3 replaced 0016 functions (bb_set_registration, bb_add_cycle,
--     bb_public_cycle) and the replaced trigger function bb_cycles_rules
--   * 14 internal helpers and trigger functions nobody can call
--   * the one-time conversion of every existing cycle's sheet from
--     version 1 to version 2 WITHOUT CHANGING ANY NUMBER (section 7), and
--     the default rubric made from the Fall 2026 starting point (section 8)
--
-- HOW TO RUN IT
--   Supabase dashboard -> SQL Editor -> New query -> paste this WHOLE file
--   -> Run (supabase/SETUP.md "Migration 0024", step 0024b). It starts with
--   "begin;" and ends with "commit;": one transaction, so if any statement
--   fails nothing is kept.
--   Supabase will warn about DESTRUCTIVE OPERATIONS. That is expected: the
--   words delete and drop appear in rules ("on delete cascade"), inside
--   functions that run later (removing an undo slot) and in "... if exists"
--   lines that make re-running safe. Nothing is removed now. Confirm.
--   Safe to run again: "create table if not exists", "create or replace
--   function", triggers and rules replaced with "... if exists" + create,
--   a seed that never overwrites, and the conversion touches only sheets
--   that are still version 1.
--
-- WARNING - NEVER RE-RUN 0016 AFTER THIS FILE
--   Re-running 0016_black_belt.sql after 0024 silently puts back 0016's
--   bb_add_cycle, bb_set_registration, bb_public_cycle, bb_cycles_rules and
--   the bb_cycles_before_write trigger - i.e. it UNDOES 0024's lock and
--   copy rules. After 0024, 0016 is only re-run as part of SETUP step
--   0024f (Undo 0024). 0024_fingerprints.sql shows it ("check | 0016_rerun"
--   says "0016 RE-RUN OVER 0024").
--
-- A COUPLING TO KNOW ABOUT (contract 2.4, OI-15)
--   The table rules below call the shared character rules of 0003 / 0005
--   (testing_name_is_valid, testing_note_is_valid). A table rule ("check")
--   runs on EVERY update of its row, not only when the rubric changes. If
--   a later migration ever makes those shared rules stricter, a stored
--   rubric could fail its next unrelated update (e.g. an Edit cycle). Such
--   a migration must first re-check every stored rubric. 0024 itself never
--   changes 0003 / 0005.
--
-- WORDS USED BELOW
--   * "Dan object": one Dan of a rubric (dan, rev, saved_at,
--     saved_by_name, pass, parts, extra_points).
--   * "rev" (revision): a whole number inside each Dan, +1 on every save of
--     that Dan. It is the "did the screen see the latest?" check for that
--     Dan only, so two admins editing different Dans never block each other.
--   * "bracket": an age range from-to (from empty = the youngest, to empty =
--     and over). "way": one of at most two ways to do a measured subject
--     (e.g. Pull-up or Hold).
--   * "worked-out points": credits x the grade points of the subject's part.
--   * "hand fix": Jeffrey's own SQL Editor session - session_user is
--     'postgres' and no action tag is set (every function sets one before
--     writing). The only way to change a LOCKED rubric (v0.921). A
--     convenience, not a wall: whoever connects as postgres can switch
--     triggers off anyway (CONTRACT-0016 2.3).
--   * "lock order": bb_settings -> bb_default_rubric -> cycle ->
--     candidate(s) -> payment (contract 1.3). Undo slots are only touched
--     while their parent (the default row or the cycle) is locked. Every
--     function says its own order ("locks: ...").
--   * the statuses: 0016's, plus "locked" (the cycle's registration already
--     opened once), "has_registrations" (a family registered since the first
--     opening) and "invalid" with a "problems" list (the validator's).
-- =====================================================================

begin;


-- ---------------------------------------------------------------------
-- 1. Number and letter helpers (the validator below uses them). Nobody in
--    the app can call them.
-- ---------------------------------------------------------------------

-- 1a. bb_rubric_num_ok(value, min, max) - is this JSON value a NUMBER from
-- min to max with at most 2 decimals? (3.35 yes, 2.555 no, "3" no - JSON
-- numbers only, never strings.) Everything is compared as "numeric" (exact
-- decimals), so a huge number like 1e30 is simply "too big" (false), never
-- an error. NULL or JSON null -> false.
create or replace function public.bb_rubric_num_ok(p_v jsonb, p_min numeric, p_max numeric)
returns boolean
language sql
immutable
set search_path = ''
as $$
  select case when jsonb_typeof(p_v) = 'number'
              then coalesce(p_v::numeric between p_min and p_max and p_v::numeric = round(p_v::numeric, 2), false)
              else false end;
$$;

revoke execute on function public.bb_rubric_num_ok(jsonb, numeric, numeric) from public, anon, authenticated, service_role;

-- 1b. bb_rubric_int_ok(value, min, max) - is this JSON value a WHOLE number
-- from min to max? The range is checked in "numeric" BEFORE anything is
-- turned into an integer, so 1e30 is false, never "integer out of range".
create or replace function public.bb_rubric_int_ok(p_v jsonb, p_min integer, p_max integer)
returns boolean
language sql
immutable
set search_path = ''
as $$
  select case when jsonb_typeof(p_v) = 'number'
              then coalesce(p_v::numeric between p_min and p_max and p_v::numeric = trunc(p_v::numeric), false)
              else false end;
$$;

revoke execute on function public.bb_rubric_int_ok(jsonb, integer, integer) from public, anon, authenticated, service_role;

-- 1c. bb_rubric_letters(part code, what) - the grade letters, best first
-- (contract 2.3, v0.922):
--   what = 'grade_points' or 'graded': the part's letters -
--          Physical A+ A B+ B C D; Technical / Curriculum / Other
--          A+ A A- B+ B B- C C- D
--   what = 'measured': a measured subject's points, any part: A+ A B+ B C D
--   what = 'cutoffs':  a way's cut-offs, any part: A+ A B+ B C (below C = D)
-- Anything else -> NULL.
create or replace function public.bb_rubric_letters(p_part text, p_what text)
returns text[]
language sql
immutable
set search_path = ''
as $$
  select case
           when p_what = 'cutoffs' then array['A+', 'A', 'B+', 'B', 'C']
           when p_what = 'measured' then array['A+', 'A', 'B+', 'B', 'C', 'D']
           when p_what in ('grade_points', 'graded') and p_part = 'physical' then array['A+', 'A', 'B+', 'B', 'C', 'D']
           when p_what in ('grade_points', 'graded') and p_part in ('technical', 'curriculum', 'other')
             then array['A+', 'A', 'A-', 'B+', 'B', 'B-', 'C', 'C-', 'D']
         end;
$$;

revoke execute on function public.bb_rubric_letters(text, text) from public, anon, authenticated, service_role;


-- ---------------------------------------------------------------------
-- 2. The validator (contract section 3): every value of a Dan is checked
--    before it is stored. The app's screen checks the same rules while the
--    admin types (src/lib/blackBelt/rubric.js, "danProblems"); both are run
--    against the same list of test cases, supabase/tests/
--    0024_rubric_cases.json, so the two can't drift apart.
--
--    Robust order, so a broken or hostile sheet can't crash it or make it
--    slow: (1) the size first; (2) at each level the type and the EXACT set
--    of keys before anything inside is read (a wrong type, a missing or an
--    unknown key -> "shape" with a "path", and that branch is not walked
--    further); (3) every list's length before looping over it; (4) every
--    comparison null-safe, so a JSON null where a number belongs gives a
--    problem, never a crash.
--
--    Text rules (contract 2.2), used for every free text:
--      a NAME (part, subject, way, extra item, "saved by"): 0003's
--        testing_name_is_valid (1-60 characters, no invisible characters)
--        AND already tidied (= testing_normalize_name of itself);
--      a TEXT (unit, notes, make-up, source): 0005's testing_note_is_valid
--        AND already tidied AND one line (no line break or tab) AND its own
--        length;
--      both: none of a few more invisible characters the shared rules let
--        through: U+061C, U+2028, U+2029, U+00AD, U+180E, U+E0000-U+E007F
--        (the pattern written in each function below).
--    A field with its own problem code gets that code for any bad value
--    (a wrong type too); fields without one (yes/no fields, the stamps, the
--    "graded / measured" and "worked / own" choices) give "shape".
-- ---------------------------------------------------------------------

-- 2a. bb_rubric_brackets_problems(list, where) - the age-bracket rules
-- shared by a pass-mark list and each way's cut-off list (V14, OI-1):
-- 1-6 brackets; ages whole 0-99; from <= to; listed youngest first; the
-- first starts at the youngest (from empty), each next from = the previous
-- to + 1, the last is open (to empty): no gaps, no overlaps.
-- "where" = the keys to put on every problem (e.g. {"part": "physical",
-- "subject": "k3m9x2pa", "way": 0}); each problem also gets "bracket" (its
-- index, 0 = first). Answers [] when the list is fine.
-- The caller has already checked that the list is an array of objects with
-- exactly the right keys (this only reads "from" and "to").
create or replace function public.bb_rubric_brackets_problems(p_list jsonb, p_where jsonb)
returns jsonb
language plpgsql
immutable
set search_path = ''
as $$
declare
  v_out   jsonb := '[]'::jsonb;
  v_where jsonb := coalesce(p_where, '{}'::jsonb);
  v_n     integer;
  v_b     jsonb;
  v_i     integer;
  v_from  integer[] := '{}';
  v_to    integer[] := '{}';
  v_bad   boolean := false;
begin
  if jsonb_typeof(p_list) is distinct from 'array' then
    return jsonb_build_array(v_where || jsonb_build_object('code', 'shape'));
  end if;
  v_n := jsonb_array_length(p_list);
  if v_n not between 1 and 6 then
    return jsonb_build_array(v_where || jsonb_build_object('code', 'brackets_count'));
  end if;

  -- ages: empty or a whole number 0-99, and from <= to
  for v_b, v_i in select t.e, (t.o - 1)::integer from jsonb_array_elements(p_list) with ordinality as t(e, o) loop
    if jsonb_typeof(v_b) is distinct from 'object' then
      v_out := v_out || jsonb_build_array(v_where || jsonb_build_object('code', 'shape', 'bracket', v_i));
      v_bad := true;
    elsif not ((jsonb_typeof(v_b -> 'from') = 'null' or public.bb_rubric_int_ok(v_b -> 'from', 0, 99))
               and (jsonb_typeof(v_b -> 'to') = 'null' or public.bb_rubric_int_ok(v_b -> 'to', 0, 99))) then
      v_out := v_out || jsonb_build_array(v_where || jsonb_build_object('code', 'bracket_ages', 'bracket', v_i));
      v_bad := true;
    elsif jsonb_typeof(v_b -> 'from') = 'number' and jsonb_typeof(v_b -> 'to') = 'number'
          and (v_b -> 'from')::numeric > (v_b -> 'to')::numeric then
      v_out := v_out || jsonb_build_array(v_where || jsonb_build_object('code', 'bracket_ages', 'bracket', v_i));
      v_bad := true;
    else
      -- (whole numbers 0-99 here, so the cast to integer is safe)
      v_from := v_from || (case when jsonb_typeof(v_b -> 'from') = 'number' then (v_b -> 'from')::numeric::integer end);
      v_to   := v_to   || (case when jsonb_typeof(v_b -> 'to') = 'number' then (v_b -> 'to')::numeric::integer end);
    end if;
  end loop;
  if v_bad then
    return v_out;
  end if;

  -- the ends: the first starts at the youngest, the last is open
  if v_from[1] is not null then
    v_out := v_out || jsonb_build_array(v_where || jsonb_build_object('code', 'brackets_ends', 'bracket', 0));
  end if;
  if v_to[v_n] is not null then
    v_out := v_out || jsonb_build_array(v_where || jsonb_build_object('code', 'brackets_ends', 'bracket', v_n - 1));
  end if;

  -- each bracket against the one before it (ONE problem per pair, the
  -- first of these that applies):
  --   the one before is open-ended ("and over") -> brackets_overlap
  --   this one starts at the youngest again       -> brackets_order
  --   this one starts at or before the one before -> brackets_order
  --   this one starts inside the one before       -> brackets_overlap
  --   this one starts more than 1 year later      -> brackets_gap
  for v_i in 2 .. v_n loop
    if v_to[v_i - 1] is null then
      v_out := v_out || jsonb_build_array(v_where || jsonb_build_object('code', 'brackets_overlap', 'bracket', v_i - 1));
    elsif v_from[v_i] is null then
      v_out := v_out || jsonb_build_array(v_where || jsonb_build_object('code', 'brackets_order', 'bracket', v_i - 1));
    elsif v_from[v_i] <= coalesce(v_from[v_i - 1], -1) then
      v_out := v_out || jsonb_build_array(v_where || jsonb_build_object('code', 'brackets_order', 'bracket', v_i - 1));
    elsif v_from[v_i] <= v_to[v_i - 1] then
      v_out := v_out || jsonb_build_array(v_where || jsonb_build_object('code', 'brackets_overlap', 'bracket', v_i - 1));
    elsif v_from[v_i] > v_to[v_i - 1] + 1 then
      v_out := v_out || jsonb_build_array(v_where || jsonb_build_object('code', 'brackets_gap', 'bracket', v_i - 1));
    end if;
  end loop;
  return v_out;
end;
$$;

revoke execute on function public.bb_rubric_brackets_problems(jsonb, jsonb) from public, anon, authenticated, service_role;

-- 2b. bb_rubric_dan_problems(dan object, dan number) - the whole check of
-- ONE Dan (rules V1-V21 of contract 3.1). Answers [] when the Dan is valid,
-- else a list of problems (at most 100), each
--   {"code": ..., "part": "physical"?, "subject": "<id>"?, "way": 0|1?,
--    "bracket": n?, "item": n?, "step": n?, "path": "..."?}
-- with only the keys that apply. It reads no table. Walk order: the
-- stamps, the pass rule, the four parts (each part's subjects, their ways
-- and brackets), the extra points; the two cross-checks that need every
-- number at once (a pass mark above the bracket's most points, a bracket
-- that does no subject) run LAST and only when nothing else is wrong.
-- (Problem codes: contract 3.1. The screen turns each code into a sentence.)
create or replace function public.bb_rubric_dan_problems(p_dan jsonb, p_dan_no integer)
returns jsonb
language plpgsql
immutable
set search_path = ''
as $$
declare
  -- the extra invisible characters 0024 refuses on top of 0003 / 0005's
  -- rules (contract 2.2): U+061C, U+2028, U+2029, U+00AD, U+180E and the
  -- "tag characters" U+E0000-U+E007F
  v_extra   constant text := '[؜  ­᠎\U000e0000-\U000e007f]';
  v_codes   constant text[] := array['physical', 'technical', 'curriculum', 'other'];
  v_out     jsonb := '[]'::jsonb;
  v_x       jsonb;
  v_y       jsonb;
  v_s       text;
  v_t       text;
  v_i       integer;
  v_j       integer;
  v_k       integer;
  v_n       integer;
  v_ok      boolean;
  v_bad     boolean;
  -- the pass rule
  v_pass    jsonb;
  v_plist   jsonb;
  v_pass_ok boolean := false;      -- the pass brackets are usable (for "limited to")
  v_pkeys   jsonb := '[]'::jsonb;  -- the pass brackets as {from, to}
  -- parts and subjects
  v_part    jsonb;
  v_pi      integer;
  v_code    text;
  v_letters text[];
  v_gp      jsonb;
  v_gp_ok   boolean;
  v_pnames  text[] := '{}';
  v_ids     text[] := '{}';
  v_subs    jsonb;
  v_sub     jsonb;
  v_si      integer;
  v_sid     text;
  v_snames  text[];
  v_cred_ok boolean;
  v_scoring text;
  v_sl      text[];
  v_pts     jsonb;
  v_pts_ok  boolean;
  v_spath   text;
  -- ways
  v_ways    jsonb;
  v_way     jsonb;
  v_wi      integer;
  v_wn      integer;
  v_wnames  text[];
  v_dir     text;
  v_blist   jsonb;
  v_b       jsonb;
  v_bi      integer;
  v_c5      constant text[] := array['A+', 'A', 'B+', 'B', 'C'];
  v_wpath   text;
  -- extra points
  v_ex      jsonb;
  v_items   jsonb;
  v_item    jsonb;
  v_ii      integer;
  v_inames  text[] := '{}';
  v_rule    jsonb;
  v_steps   jsonb;
  v_st      jsonb;
  v_sti     integer;
  v_most    numeric;
begin
  if p_dan is null then
    return '[{"code": "shape", "path": "dan"}]'::jsonb;
  end if;
  -- (V2) the size first: one Dan is at most 50 000 bytes
  if octet_length(p_dan::text) > 50000 then
    return '[{"code": "too_big"}]'::jsonb;
  end if;
  -- (V1) a Dan object with exactly its 7 keys
  if jsonb_typeof(p_dan) <> 'object' then
    return '[{"code": "shape", "path": "dan"}]'::jsonb;
  end if;
  if not (p_dan ?& array['dan', 'rev', 'saved_at', 'saved_by_name', 'pass', 'parts', 'extra_points']
          and (p_dan - array['dan', 'rev', 'saved_at', 'saved_by_name', 'pass', 'parts', 'extra_points']) = '{}'::jsonb) then
    return '[{"code": "shape", "path": "dan"}]'::jsonb;
  end if;
  if p_dan -> 'dan' is distinct from to_jsonb(p_dan_no) or p_dan_no is null then
    v_out := v_out || '[{"code": "dan_number", "path": "dan"}]'::jsonb;
  end if;

  -- (V20b) the stamps the server writes: rev 1-1 000 000; saved_at empty or
  -- "YYYY-MM-DDTHH:MM:SSZ"; saved_by_name empty or a name
  if not public.bb_rubric_int_ok(p_dan -> 'rev', 1, 1000000) then
    v_out := v_out || '[{"code": "shape", "path": "rev"}]'::jsonb;
  end if;
  v_x := p_dan -> 'saved_at';
  if not (jsonb_typeof(v_x) = 'null'
          or (jsonb_typeof(v_x) = 'string' and (v_x #>> '{}') ~ '^[0-9]{4}-[0-9]{2}-[0-9]{2}T[0-9]{2}:[0-9]{2}:[0-9]{2}Z$')) then
    v_out := v_out || '[{"code": "shape", "path": "saved_at"}]'::jsonb;
  end if;
  v_x := p_dan -> 'saved_by_name';
  if jsonb_typeof(v_x) <> 'null' then
    v_s := case when jsonb_typeof(v_x) = 'string' then v_x #>> '{}' end;
    if not coalesce(public.testing_name_is_valid(v_s) and v_s = public.testing_normalize_name(v_s) and v_s !~ v_extra, false) then
      v_out := v_out || '[{"code": "shape", "path": "saved_by_name"}]'::jsonb;
    end if;
  end if;

  -- (V18) the pass rule: {brackets, no_d, makeup}
  v_pass := p_dan -> 'pass';
  if not (case when jsonb_typeof(v_pass) = 'object'
               then v_pass ?& array['brackets', 'no_d', 'makeup'] and (v_pass - array['brackets', 'no_d', 'makeup']) = '{}'::jsonb
               else false end) then
    v_out := v_out || '[{"code": "shape", "path": "pass"}]'::jsonb;
  else
    v_plist := v_pass -> 'brackets';
    if jsonb_typeof(v_plist) <> 'array' then
      v_out := v_out || '[{"code": "shape", "path": "pass.brackets"}]'::jsonb;
    elsif jsonb_array_length(v_plist) not between 1 and 6 then
      v_out := v_out || '[{"code": "brackets_count"}]'::jsonb;
    elsif exists (select 1 from jsonb_array_elements(v_plist) as t(e)
                   where not (case when jsonb_typeof(t.e) = 'object'
                                   then t.e ?& array['from', 'to', 'pass_mark'] and (t.e - array['from', 'to', 'pass_mark']) = '{}'::jsonb
                                   else false end)) then
      v_out := v_out || '[{"code": "shape", "path": "pass.brackets"}]'::jsonb;
    else
      v_x := public.bb_rubric_brackets_problems(v_plist, '{}'::jsonb);
      v_out := v_out || v_x;
      v_pass_ok := (v_x = '[]'::jsonb);
      for v_b, v_bi in select t.e, (t.o - 1)::integer from jsonb_array_elements(v_plist) with ordinality as t(e, o) loop
        if not public.bb_rubric_num_ok(v_b -> 'pass_mark', 1, 9999) then
          v_out := v_out || jsonb_build_array(jsonb_build_object('code', 'pass_mark_range', 'bracket', v_bi));
        end if;
        v_pkeys := v_pkeys || jsonb_build_array(jsonb_build_object('from', v_b -> 'from', 'to', v_b -> 'to'));
      end loop;
    end if;
    if jsonb_typeof(v_pass -> 'no_d') <> 'boolean' then
      v_out := v_out || '[{"code": "shape", "path": "pass.no_d"}]'::jsonb;
    end if;
    v_x := v_pass -> 'makeup';
    if jsonb_typeof(v_x) <> 'null' then
      v_s := case when jsonb_typeof(v_x) = 'string' then v_x #>> '{}' end;
      if not coalesce(public.testing_note_is_valid(v_s) and v_s = public.testing_normalize_note(v_s) and v_s !~ '[\n\r\t]'
                      and char_length(v_s) between 1 and 300 and v_s !~ v_extra, false) then
        v_out := v_out || '[{"code": "makeup"}]'::jsonb;
      end if;
    end if;
  end if;

  -- the four parts, in this order: physical, technical, curriculum, other
  v_x := p_dan -> 'parts';
  if jsonb_typeof(v_x) <> 'array' or jsonb_array_length(v_x) <> 4 then
    v_out := v_out || '[{"code": "shape", "path": "parts"}]'::jsonb;
  else
    for v_part, v_pi in select t.e, (t.o - 1)::integer from jsonb_array_elements(v_x) with ordinality as t(e, o) loop
      v_code := v_codes[v_pi + 1];
      if not (case when jsonb_typeof(v_part) = 'object'
                   then v_part ?& array['code', 'name', 'grade_points', 'subjects']
                        and (v_part - array['code', 'name', 'grade_points', 'subjects']) = '{}'::jsonb
                   else false end)
         or v_part -> 'code' is distinct from to_jsonb(v_code) then
        v_out := v_out || jsonb_build_array(jsonb_build_object('code', 'shape', 'path', format('parts[%s]', v_pi)));
        continue;
      end if;
      v_letters := public.bb_rubric_letters(v_code, 'grade_points');

      -- (V3) the part's name; the four names different (ignoring capitals)
      v_y := v_part -> 'name';
      v_s := case when jsonb_typeof(v_y) = 'string' then v_y #>> '{}' end;
      if not coalesce(public.testing_name_is_valid(v_s) and v_s = public.testing_normalize_name(v_s) and v_s !~ v_extra, false) then
        v_out := v_out || jsonb_build_array(jsonb_build_object('code', 'part_name', 'part', v_code));
      elsif lower(v_s) = any (v_pnames) then
        v_out := v_out || jsonb_build_array(jsonb_build_object('code', 'part_name_duplicate', 'part', v_code));
      else
        v_pnames := v_pnames || lower(v_s);
      end if;

      -- (V4) grade points: exactly the part's letters, each 0-999 with up to
      -- 2 decimals, never going up from A+ to D, A+ above 0
      v_gp := v_part -> 'grade_points';
      v_gp_ok := false;
      if jsonb_typeof(v_gp) <> 'object' then
        v_out := v_out || jsonb_build_array(jsonb_build_object('code', 'shape', 'part', v_code,
                                                               'path', format('parts[%s].grade_points', v_pi)));
      elsif not (v_gp ?& v_letters and (v_gp - v_letters) = '{}'::jsonb)
            or exists (select 1 from unnest(v_letters) as l(g) where not public.bb_rubric_num_ok(v_gp -> l.g, 0, 999)) then
        v_out := v_out || jsonb_build_array(jsonb_build_object('code', 'grade_points_range', 'part', v_code));
      else
        v_gp_ok := true;
        if (v_gp -> 'A+')::numeric <= 0
           or exists (select 1 from generate_series(1, cardinality(v_letters) - 1) as g(k)
                       where (v_gp -> v_letters[g.k])::numeric < (v_gp -> v_letters[g.k + 1])::numeric) then
          v_out := v_out || jsonb_build_array(jsonb_build_object('code', 'grade_points_order', 'part', v_code));
        end if;
      end if;

      -- (V5) 1-30 subjects
      v_subs := v_part -> 'subjects';
      if jsonb_typeof(v_subs) <> 'array' then
        v_out := v_out || jsonb_build_array(jsonb_build_object('code', 'shape', 'part', v_code,
                                                               'path', format('parts[%s].subjects', v_pi)));
        continue;
      end if;
      if jsonb_array_length(v_subs) not between 1 and 30 then
        v_out := v_out || jsonb_build_array(jsonb_build_object('code', 'subject_count', 'part', v_code));
        continue;
      end if;

      v_snames := '{}';
      for v_sub, v_si in select t.e, (t.o - 1)::integer from jsonb_array_elements(v_subs) with ordinality as t(e, o) loop
        v_spath := format('parts[%s].subjects[%s]', v_pi, v_si);
        if not (case when jsonb_typeof(v_sub) = 'object'
                     then v_sub ?& array['id', 'name', 'credits', 'scoring', 'ways', 'points_mode', 'points', 'limited_to',
                                         'outdoor', 'handed_in', 'note']
                          and (v_sub - array['id', 'name', 'credits', 'scoring', 'ways', 'points_mode', 'points', 'limited_to',
                                         'outdoor', 'handed_in', 'note']) = '{}'::jsonb
                     else false end) then
          v_out := v_out || jsonb_build_array(jsonb_build_object('code', 'shape', 'part', v_code, 'path', v_spath));
          continue;
        end if;

        -- (V6) the id: 8 characters a-z 0-9, used once in the Dan
        v_sid := null;
        v_y := v_sub -> 'id';
        if jsonb_typeof(v_y) = 'string' and (v_y #>> '{}') ~ '^[a-z0-9]{8}$' then
          if (v_y #>> '{}') = any (v_ids) then
            v_out := v_out || jsonb_build_array(jsonb_build_object('code', 'subject_id', 'part', v_code, 'path', v_spath));
          else
            v_sid := v_y #>> '{}';
            v_ids := v_ids || v_sid;
          end if;
        else
          v_out := v_out || jsonb_build_array(jsonb_build_object('code', 'subject_id', 'part', v_code, 'path', v_spath));
        end if;

        -- (V7) the name; not used twice in its part (ignoring capitals)
        v_y := v_sub -> 'name';
        v_s := case when jsonb_typeof(v_y) = 'string' then v_y #>> '{}' end;
        if not coalesce(public.testing_name_is_valid(v_s) and v_s = public.testing_normalize_name(v_s) and v_s !~ v_extra, false) then
          v_out := v_out || jsonb_build_array(jsonb_strip_nulls(jsonb_build_object('code', 'subject_name', 'part', v_code, 'subject', v_sid)));
        elsif lower(v_s) = any (v_snames) then
          v_out := v_out || jsonb_build_array(jsonb_strip_nulls(jsonb_build_object('code', 'subject_name_duplicate', 'part', v_code, 'subject', v_sid)));
        else
          v_snames := v_snames || lower(v_s);
        end if;

        -- (V8) credits: a whole number 1-20
        v_cred_ok := public.bb_rubric_int_ok(v_sub -> 'credits', 1, 20);
        if not v_cred_ok then
          v_out := v_out || jsonb_build_array(jsonb_strip_nulls(jsonb_build_object('code', 'credits', 'part', v_code, 'subject', v_sid)));
        end if;

        -- graded or measured
        v_scoring := case when v_sub -> 'scoring' in ('"graded"'::jsonb, '"measured"'::jsonb) then v_sub ->> 'scoring' end;
        if v_scoring is null then
          v_out := v_out || jsonb_build_array(jsonb_strip_nulls(jsonb_build_object('code', 'shape', 'part', v_code, 'subject', v_sid,
                                                                                    'path', v_spath || '.scoring')));
        end if;

        -- (V11) graded: no ways; measured: 1 or 2 ways
        v_ways := v_sub -> 'ways';
        if jsonb_typeof(v_ways) <> 'array' then
          v_out := v_out || jsonb_build_array(jsonb_strip_nulls(jsonb_build_object('code', 'shape', 'part', v_code, 'subject', v_sid,
                                                                                    'path', v_spath || '.ways')));
        elsif (v_scoring = 'graded' and jsonb_array_length(v_ways) <> 0)
              or (v_scoring = 'measured' and jsonb_array_length(v_ways) not between 1 and 2) then
          v_out := v_out || jsonb_build_array(jsonb_strip_nulls(jsonb_build_object('code', 'ways_count', 'part', v_code, 'subject', v_sid)));
        elsif v_scoring = 'measured' then
          v_wn := jsonb_array_length(v_ways);
          v_wnames := '{}';
          for v_way, v_wi in select t.e, (t.o - 1)::integer from jsonb_array_elements(v_ways) with ordinality as t(e, o) loop
            v_wpath := format('%s.ways[%s]', v_spath, v_wi);
            if not (case when jsonb_typeof(v_way) = 'object'
                         then v_way ?& array['name', 'unit', 'direction', 'brackets']
                              and (v_way - array['name', 'unit', 'direction', 'brackets']) = '{}'::jsonb
                         else false end) then
              v_out := v_out || jsonb_build_array(jsonb_strip_nulls(jsonb_build_object('code', 'shape', 'part', v_code, 'subject', v_sid,
                                                                                        'way', v_wi, 'path', v_wpath)));
              continue;
            end if;
            -- (V12) two ways: both named and different; one way: no name or a name
            v_y := v_way -> 'name';
            v_s := case when jsonb_typeof(v_y) = 'string' then v_y #>> '{}' end;
            if jsonb_typeof(v_y) = 'null' and v_wn = 1 then
              null;
            elsif not coalesce(public.testing_name_is_valid(v_s) and v_s = public.testing_normalize_name(v_s) and v_s !~ v_extra, false) then
              v_out := v_out || jsonb_build_array(jsonb_strip_nulls(jsonb_build_object('code', 'way_name', 'part', v_code, 'subject', v_sid, 'way', v_wi)));
            elsif lower(v_s) = any (v_wnames) then
              v_out := v_out || jsonb_build_array(jsonb_strip_nulls(jsonb_build_object('code', 'way_name', 'part', v_code, 'subject', v_sid, 'way', v_wi)));
            else
              v_wnames := v_wnames || lower(v_s);
            end if;
            -- (V13) the unit (1-40, one line) and the direction
            v_y := v_way -> 'unit';
            v_s := case when jsonb_typeof(v_y) = 'string' then v_y #>> '{}' end;
            if not coalesce(public.testing_note_is_valid(v_s) and v_s = public.testing_normalize_note(v_s) and v_s !~ '[\n\r\t]'
                            and char_length(v_s) between 1 and 40 and v_s !~ v_extra, false) then
              v_out := v_out || jsonb_build_array(jsonb_strip_nulls(jsonb_build_object('code', 'unit', 'part', v_code, 'subject', v_sid, 'way', v_wi)));
            end if;
            v_dir := case when v_way -> 'direction' in ('"at_least"'::jsonb, '"at_most"'::jsonb, '"under"'::jsonb)
                          then v_way ->> 'direction' end;
            if v_dir is null then
              v_out := v_out || jsonb_build_array(jsonb_strip_nulls(jsonb_build_object('code', 'direction', 'part', v_code, 'subject', v_sid, 'way', v_wi)));
            end if;
            -- (V14) the way's brackets, (V15) their cut-offs
            v_blist := v_way -> 'brackets';
            if jsonb_typeof(v_blist) <> 'array' then
              v_out := v_out || jsonb_build_array(jsonb_strip_nulls(jsonb_build_object('code', 'shape', 'part', v_code, 'subject', v_sid,
                                                                                        'way', v_wi, 'path', v_wpath || '.brackets')));
            elsif jsonb_array_length(v_blist) not between 1 and 6 then
              v_out := v_out || jsonb_build_array(jsonb_strip_nulls(jsonb_build_object('code', 'brackets_count', 'part', v_code, 'subject', v_sid, 'way', v_wi)));
            elsif exists (select 1 from jsonb_array_elements(v_blist) as t(e)
                           where not (case when jsonb_typeof(t.e) = 'object'
                                           then t.e ?& array['from', 'to', 'cutoffs'] and (t.e - array['from', 'to', 'cutoffs']) = '{}'::jsonb
                                           else false end)) then
              v_out := v_out || jsonb_build_array(jsonb_strip_nulls(jsonb_build_object('code', 'shape', 'part', v_code, 'subject', v_sid,
                                                                                        'way', v_wi, 'path', v_wpath || '.brackets')));
            else
              v_out := v_out || public.bb_rubric_brackets_problems(
                                  v_blist, jsonb_strip_nulls(jsonb_build_object('part', v_code, 'subject', v_sid, 'way', v_wi)));
              for v_b, v_bi in select t.e, (t.o - 1)::integer from jsonb_array_elements(v_blist) with ordinality as t(e, o) loop
                v_y := v_b -> 'cutoffs';
                if jsonb_typeof(v_y) <> 'object' then
                  v_out := v_out || jsonb_build_array(jsonb_strip_nulls(jsonb_build_object(
                                      'code', 'shape', 'part', v_code, 'subject', v_sid, 'way', v_wi, 'bracket', v_bi,
                                      'path', format('%s.brackets[%s].cutoffs', v_wpath, v_bi))));
                else
                  -- (plain loops instead of small queries: this runs for
                  -- every bracket of every way, so it must be quick)
                  v_ok := v_y ?& v_c5 and (v_y - v_c5) = '{}'::jsonb;
                  if v_ok then
                    foreach v_t in array v_c5 loop
                      if not public.bb_rubric_num_ok(v_y -> v_t, 0, 999) then
                        v_ok := false;
                      end if;
                    end loop;
                  end if;
                  if not v_ok then
                    v_out := v_out || jsonb_build_array(jsonb_strip_nulls(jsonb_build_object(
                                        'code', 'cutoffs_range', 'part', v_code, 'subject', v_sid, 'way', v_wi, 'bracket', v_bi)));
                  elsif v_dir is not null then
                    -- at least: each next cut-off strictly smaller; at most /
                    -- under: each next strictly larger
                    v_bad := false;
                    for v_k in 1 .. 4 loop
                      if (v_dir = 'at_least' and (v_y -> v_c5[v_k])::numeric <= (v_y -> v_c5[v_k + 1])::numeric)
                         or (v_dir <> 'at_least' and (v_y -> v_c5[v_k])::numeric >= (v_y -> v_c5[v_k + 1])::numeric) then
                        v_bad := true;
                      end if;
                    end loop;
                    if v_bad then
                      v_out := v_out || jsonb_build_array(jsonb_strip_nulls(jsonb_build_object(
                                          'code', 'cutoffs_order', 'part', v_code, 'subject', v_sid, 'way', v_wi, 'bracket', v_bi)));
                    end if;
                  end if;
                end if;
              end loop;
            end if;
          end loop;
        end if;

        -- worked out or own points
        if v_sub -> 'points_mode' not in ('"worked"'::jsonb, '"own"'::jsonb) or v_sub -> 'points_mode' is null then
          v_out := v_out || jsonb_build_array(jsonb_strip_nulls(jsonb_build_object('code', 'shape', 'part', v_code, 'subject', v_sid,
                                                                                    'path', v_spath || '.points_mode')));
        end if;

        -- (V9) points: exactly the subject's letters, each 0-999 (2
        -- decimals), never going up, A+ above 0
        v_sl := public.bb_rubric_letters(v_code, v_scoring);
        v_pts := v_sub -> 'points';
        v_pts_ok := false;
        if jsonb_typeof(v_pts) <> 'object' then
          v_out := v_out || jsonb_build_array(jsonb_strip_nulls(jsonb_build_object('code', 'shape', 'part', v_code, 'subject', v_sid,
                                                                                    'path', v_spath || '.points')));
        elsif v_sl is not null then
          v_ok := v_pts ?& v_sl and (v_pts - v_sl) = '{}'::jsonb;
          if v_ok then
            foreach v_t in array v_sl loop
              if not public.bb_rubric_num_ok(v_pts -> v_t, 0, 999) then
                v_ok := false;
              end if;
            end loop;
          end if;
          if not v_ok then
            v_out := v_out || jsonb_build_array(jsonb_strip_nulls(jsonb_build_object('code', 'points_range', 'part', v_code, 'subject', v_sid)));
          else
            v_pts_ok := true;
            v_bad := (v_pts -> 'A+')::numeric <= 0;
            for v_k in 1 .. cardinality(v_sl) - 1 loop
              if (v_pts -> v_sl[v_k])::numeric < (v_pts -> v_sl[v_k + 1])::numeric then
                v_bad := true;
              end if;
            end loop;
            if v_bad then
              v_out := v_out || jsonb_build_array(jsonb_strip_nulls(jsonb_build_object('code', 'points_order', 'part', v_code, 'subject', v_sid)));
            end if;
          end if;
        end if;

        -- (V10) worked out: every grade's points = credits x the part's grade
        -- points for that letter, exactly (numeric: no rounding at all)
        if v_sub -> 'points_mode' = '"worked"'::jsonb and v_pts_ok and v_cred_ok and v_gp_ok then
          v_bad := false;
          foreach v_t in array v_sl loop
            if (v_pts -> v_t)::numeric <> (v_sub -> 'credits')::numeric * (v_gp -> v_t)::numeric then
              v_bad := true;
            end if;
          end loop;
          if v_bad then
            v_out := v_out || jsonb_build_array(jsonb_strip_nulls(jsonb_build_object('code', 'points_not_worked_out', 'part', v_code, 'subject', v_sid)));
          end if;
        end if;

        -- (V16) who does it: everyone (null), or 1-6 of the Dan's pass
        -- brackets, each exactly {from, to}, no repeats
        v_y := v_sub -> 'limited_to';
        if jsonb_typeof(v_y) = 'null' then
          null;
        elsif jsonb_typeof(v_y) <> 'array' or jsonb_array_length(v_y) not between 1 and 6
              or exists (select 1 from jsonb_array_elements(v_y) as t(e)
                          where not (case when jsonb_typeof(t.e) = 'object'
                                          then t.e ?& array['from', 'to'] and (t.e - array['from', 'to']) = '{}'::jsonb
                                          else false end)) then
          v_out := v_out || jsonb_build_array(jsonb_strip_nulls(jsonb_build_object('code', 'limited_to', 'part', v_code, 'subject', v_sid)));
        elsif (select count(distinct t.e) from jsonb_array_elements(v_y) as t(e)) <> jsonb_array_length(v_y)
              or (v_pass_ok and exists (select 1 from jsonb_array_elements(v_y) as t(e)
                                         where not exists (select 1 from jsonb_array_elements(v_pkeys) as k(e)
                                                            where k.e = t.e))) then
          v_out := v_out || jsonb_build_array(jsonb_strip_nulls(jsonb_build_object('code', 'limited_to', 'part', v_code, 'subject', v_sid)));
        end if;

        -- tags (yes / no) and (V17) the note: none, or 1-200 characters, one line
        if jsonb_typeof(v_sub -> 'outdoor') <> 'boolean' then
          v_out := v_out || jsonb_build_array(jsonb_strip_nulls(jsonb_build_object('code', 'shape', 'part', v_code, 'subject', v_sid,
                                                                                    'path', v_spath || '.outdoor')));
        end if;
        if jsonb_typeof(v_sub -> 'handed_in') <> 'boolean' then
          v_out := v_out || jsonb_build_array(jsonb_strip_nulls(jsonb_build_object('code', 'shape', 'part', v_code, 'subject', v_sid,
                                                                                    'path', v_spath || '.handed_in')));
        end if;
        v_y := v_sub -> 'note';
        if jsonb_typeof(v_y) <> 'null' then
          v_s := case when jsonb_typeof(v_y) = 'string' then v_y #>> '{}' end;
          if not coalesce(public.testing_note_is_valid(v_s) and v_s = public.testing_normalize_note(v_s) and v_s !~ '[\n\r\t]'
                          and char_length(v_s) between 1 and 200 and v_s !~ v_extra, false) then
            v_out := v_out || jsonb_build_array(jsonb_strip_nulls(jsonb_build_object('code', 'note', 'part', v_code, 'subject', v_sid)));
          end if;
        end if;
      end loop;
    end loop;
  end if;

  -- (V20, V21) extra points
  v_ex := p_dan -> 'extra_points';
  if not (case when jsonb_typeof(v_ex) = 'object'
               then v_ex ?& array['counts_toward_total', 'limit', 'to_confirm', 'note', 'items']
                    and (v_ex - array['counts_toward_total', 'limit', 'to_confirm', 'note', 'items']) = '{}'::jsonb
               else false end) then
    v_out := v_out || '[{"code": "shape", "path": "extra_points"}]'::jsonb;
  else
    if jsonb_typeof(v_ex -> 'counts_toward_total') <> 'boolean' then
      v_out := v_out || '[{"code": "shape", "path": "extra_points.counts_toward_total"}]'::jsonb;
    end if;
    if jsonb_typeof(v_ex -> 'to_confirm') <> 'boolean' then
      v_out := v_out || '[{"code": "shape", "path": "extra_points.to_confirm"}]'::jsonb;
    end if;
    if not (jsonb_typeof(v_ex -> 'limit') = 'null' or public.bb_rubric_num_ok(v_ex -> 'limit', 1, 999)) then
      v_out := v_out || '[{"code": "extra_limit"}]'::jsonb;
    end if;
    v_y := v_ex -> 'note';
    if jsonb_typeof(v_y) <> 'null' then
      v_s := case when jsonb_typeof(v_y) = 'string' then v_y #>> '{}' end;
      if not coalesce(public.testing_note_is_valid(v_s) and v_s = public.testing_normalize_note(v_s) and v_s !~ '[\n\r\t]'
                      and char_length(v_s) between 1 and 200 and v_s !~ v_extra, false) then
        v_out := v_out || '[{"code": "extra_note"}]'::jsonb;
      end if;
    end if;
    v_items := v_ex -> 'items';
    if jsonb_typeof(v_items) <> 'array' then
      v_out := v_out || '[{"code": "shape", "path": "extra_points.items"}]'::jsonb;
    elsif jsonb_array_length(v_items) > 12 then
      v_out := v_out || '[{"code": "extra_item_count"}]'::jsonb;
    else
      for v_item, v_ii in select t.e, (t.o - 1)::integer from jsonb_array_elements(v_items) with ordinality as t(e, o) loop
        if not (case when jsonb_typeof(v_item) = 'object'
                     then v_item ?& array['name', 'rule'] and (v_item - array['name', 'rule']) = '{}'::jsonb
                     else false end) then
          v_out := v_out || jsonb_build_array(jsonb_build_object('code', 'shape', 'item', v_ii,
                                                                 'path', format('extra_points.items[%s]', v_ii)));
          continue;
        end if;
        v_y := v_item -> 'name';
        v_s := case when jsonb_typeof(v_y) = 'string' then v_y #>> '{}' end;
        if not coalesce(public.testing_name_is_valid(v_s) and v_s = public.testing_normalize_name(v_s) and v_s !~ v_extra, false) then
          v_out := v_out || jsonb_build_array(jsonb_build_object('code', 'extra_item_name', 'item', v_ii));
        elsif lower(v_s) = any (v_inames) then
          v_out := v_out || jsonb_build_array(jsonb_build_object('code', 'extra_item_name_duplicate', 'item', v_ii));
        else
          v_inames := v_inames || lower(v_s);
        end if;
        -- the rule: per count {kind, points_each}, or steps {kind, steps}
        v_rule := v_item -> 'rule';
        if (case when jsonb_typeof(v_rule) = 'object'
                 then v_rule -> 'kind' = '"per_count"'::jsonb and v_rule ?& array['kind', 'points_each']
                      and (v_rule - array['kind', 'points_each']) = '{}'::jsonb
                 else false end) then
          if not public.bb_rubric_num_ok(v_rule -> 'points_each', 0.01, 999) then
            v_out := v_out || jsonb_build_array(jsonb_build_object('code', 'extra_points_each', 'item', v_ii));
          end if;
        elsif (case when jsonb_typeof(v_rule) = 'object'
                    then v_rule -> 'kind' = '"steps"'::jsonb and v_rule ?& array['kind', 'steps']
                         and (v_rule - array['kind', 'steps']) = '{}'::jsonb
                    else false end) then
          v_steps := v_rule -> 'steps';
          if jsonb_typeof(v_steps) <> 'array' or jsonb_array_length(v_steps) not between 1 and 10 then
            v_out := v_out || jsonb_build_array(jsonb_build_object('code', 'extra_steps_count', 'item', v_ii));
          elsif exists (select 1 from jsonb_array_elements(v_steps) as t(e)
                         where not (case when jsonb_typeof(t.e) = 'object'
                                         then t.e ?& array['at_least', 'points'] and (t.e - array['at_least', 'points']) = '{}'::jsonb
                                         else false end)) then
            v_out := v_out || jsonb_build_array(jsonb_build_object('code', 'shape', 'item', v_ii,
                                                                   'path', format('extra_points.items[%s].rule.steps', v_ii)));
          else
            v_bad := false;
            for v_st, v_sti in select t.e, (t.o - 1)::integer from jsonb_array_elements(v_steps) with ordinality as t(e, o) loop
              if not (public.bb_rubric_int_ok(v_st -> 'at_least', 1, 9999) and public.bb_rubric_num_ok(v_st -> 'points', 0.01, 999)) then
                v_out := v_out || jsonb_build_array(jsonb_build_object('code', 'extra_step_range', 'item', v_ii, 'step', v_sti));
                v_bad := true;
              end if;
            end loop;
            -- each next step: strictly more needed and strictly more points
            if not v_bad and exists (select 1 from generate_series(0, jsonb_array_length(v_steps) - 2) as g(k)
                                      where (v_steps -> g.k -> 'at_least')::numeric >= (v_steps -> (g.k + 1) -> 'at_least')::numeric
                                         or (v_steps -> g.k -> 'points')::numeric >= (v_steps -> (g.k + 1) -> 'points')::numeric) then
              v_out := v_out || jsonb_build_array(jsonb_build_object('code', 'extra_steps_order', 'item', v_ii));
            end if;
          end if;
        else
          v_out := v_out || jsonb_build_array(jsonb_build_object('code', 'extra_rule', 'item', v_ii));
        end if;
      end loop;
    end if;
  end if;

  -- (V18, V19) the cross-checks, only when everything above is fine (they
  -- add up every subject's points): each pass bracket does at least one
  -- subject, and its pass mark is at most the most points it can get
  if v_out = '[]'::jsonb then
    for v_b, v_bi in select t.e, (t.o - 1)::integer from jsonb_array_elements(v_plist) with ordinality as t(e, o) loop
      v_most := public.bb_rubric_most_points(p_dan, (v_b ->> 'from')::integer, (v_b ->> 'to')::integer);
      if v_most = 0 then
        v_out := v_out || jsonb_build_array(jsonb_build_object('code', 'bracket_empty', 'bracket', v_bi));
      elsif (v_b -> 'pass_mark')::numeric > v_most then
        v_out := v_out || jsonb_build_array(jsonb_build_object('code', 'pass_mark_too_high', 'bracket', v_bi));
      end if;
    end loop;
  end if;

  -- at most 100 problems
  if jsonb_array_length(v_out) > 100 then
    v_out := (select jsonb_agg(t.e order by t.o) from jsonb_array_elements(v_out) with ordinality as t(e, o) where t.o <= 100);
  end if;
  return v_out;
end;
$$;

revoke execute on function public.bb_rubric_dan_problems(jsonb, integer) from public, anon, authenticated, service_role;

-- 2c. bb_rubric_is_valid(rubric) - the WHOLE document (used by the table
-- rules): {"schema_version": 2, "source": text 1-100, "dans": [4 Dans]},
-- exactly those keys, at most 240 000 bytes (= 4 x 50 000 per Dan + room
-- for the outer keys), Dans numbered 1-4 in order and each one valid
-- (2b). Never NULL: any NULL or other shape -> false.
create or replace function public.bb_rubric_is_valid(p_doc jsonb)
returns boolean
language plpgsql
immutable
set search_path = ''
as $$
declare
  v_extra constant text := '[؜  ­᠎\U000e0000-\U000e007f]';
  v_s     text;
  v_d     jsonb;
  v_i     integer;
begin
  if p_doc is null then
    return false;
  end if;
  if octet_length(p_doc::text) > 240000 then
    return false;
  end if;
  if jsonb_typeof(p_doc) <> 'object' then
    return false;
  end if;
  if not (p_doc ?& array['schema_version', 'source', 'dans'] and (p_doc - array['schema_version', 'source', 'dans']) = '{}'::jsonb) then
    return false;
  end if;
  if p_doc -> 'schema_version' is distinct from '2'::jsonb then
    return false;
  end if;
  -- source: a text 1-100 characters, one line (staff only; never shown to families)
  if jsonb_typeof(p_doc -> 'source') <> 'string' then
    return false;
  end if;
  v_s := p_doc ->> 'source';
  if not coalesce(public.testing_note_is_valid(v_s) and v_s = public.testing_normalize_note(v_s) and v_s !~ '[\n\r\t]'
                  and char_length(v_s) between 1 and 100 and v_s !~ v_extra, false) then
    return false;
  end if;
  if jsonb_typeof(p_doc -> 'dans') <> 'array' or jsonb_array_length(p_doc -> 'dans') <> 4 then
    return false;
  end if;
  for v_d, v_i in select t.e, t.o::integer from jsonb_array_elements(p_doc -> 'dans') with ordinality as t(e, o) loop
    if public.bb_rubric_dan_problems(v_d, v_i) <> '[]'::jsonb then
      return false;
    end if;
  end loop;
  return true;
end;
$$;

revoke execute on function public.bb_rubric_is_valid(jsonb) from public, anon, authenticated, service_role;


-- ---------------------------------------------------------------------
-- 3. Maxima (contract 3.2): the most points a candidate of an age bracket
--    can get. Worked out every time, never stored. The screen's twin in
--    rubric.js must give the same numbers (Fall 2026: 1st Dan 339 for 17
--    and under / 361.5 for 18 and over, 2nd 343.5, 3rd 384, 4th 595).
-- ---------------------------------------------------------------------

-- 3a. bb_rubric_part_max(part, from, to) - the sum of the A+ points of the
-- part's subjects that the bracket {from, to} does: a subject for everyone
-- (limited_to empty), or one whose limited_to lists exactly that bracket
-- (both ends compared null-safely: "empty" = "empty").
create or replace function public.bb_rubric_part_max(p_part jsonb, p_from integer, p_to integer)
returns numeric
language sql
immutable
set search_path = ''
as $$
  select coalesce(sum((s.e -> 'points' ->> 'A+')::numeric), 0)
    from jsonb_array_elements(case when jsonb_typeof(p_part -> 'subjects') = 'array' then p_part -> 'subjects' else '[]'::jsonb end) as s(e)
   where jsonb_typeof(s.e -> 'limited_to') is distinct from 'array'
      or exists (select 1 from jsonb_array_elements(s.e -> 'limited_to') as l(e)
                  where (l.e ->> 'from')::numeric is not distinct from p_from::numeric
                    and (l.e ->> 'to')::numeric is not distinct from p_to::numeric);
$$;

revoke execute on function public.bb_rubric_part_max(jsonb, integer, integer) from public, anon, authenticated, service_role;

-- 3b. bb_rubric_most_points(dan, from, to) - the four parts' maxima added
-- up for that bracket. Extra points never count.
create or replace function public.bb_rubric_most_points(p_dan jsonb, p_from integer, p_to integer)
returns numeric
language sql
immutable
set search_path = ''
as $$
  select coalesce(sum(public.bb_rubric_part_max(p.e, p_from, p_to)), 0)
    from jsonb_array_elements(case when jsonb_typeof(p_dan -> 'parts') = 'array' then p_dan -> 'parts' else '[]'::jsonb end) as p(e);
$$;

revoke execute on function public.bb_rubric_most_points(jsonb, integer, integer) from public, anon, authenticated, service_role;


-- ---------------------------------------------------------------------
-- 4. From version 1 to version 2, copies, the public view, putting one
--    Dan back into a document
-- ---------------------------------------------------------------------

-- 4a. bb_rubric_from_v1(v1 sheet) - the exact conversion of contract 4.1.
-- It is written for the Fall 2026 sheet and STOPS (an exception, so the
-- whole migration is undone) on anything that sheet doesn't contain,
-- instead of guessing. No number is changed: every point, cut-off, credit,
-- pass mark and extra-points rule is copied as it is (proved by
-- 0024_tests.sql U3 and PGlite step0024).
--   * each Dan gets the part grade points of the v1 grade scales (four
--     identical copies, v0.925); "Other" gets a copy of Technical's
--   * pass marks: a Dan with an "adults only" subject or an adult pass mark
--     gets two brackets, 17 and under / 18 and over; otherwise one, all ages
--   * a subject's id = the first 8 characters of md5("dan/part/name")
--   * "grades" -> graded (no ways); "table" -> measured with one way, or
--     for "Pull-up or hold" two ways: Pull-up (reps) and Hold (seconds)
--   * points_mode = worked when every grade's points = credits x the
--     part's grade points, else own (exactly 19 subjects, v0.924)
--   * "adults only" -> limited to 18 and over; hand_in -> handed_in;
--     missing yes/no tags -> no; the hand-in list is dropped (worked out)
--   * every Dan starts at rev 1 with no "saved" stamps
create or replace function public.bb_rubric_from_v1(p_v1 jsonb)
returns jsonb
language plpgsql
immutable
set search_path = ''
as $$
declare
  v_codes   constant text[] := array['physical', 'technical', 'curriculum', 'other'];
  v_scales  jsonb;
  v_dans    jsonb := '[]'::jsonb;
  v_d       jsonb;
  v_dn      integer;
  v_pr      jsonb;
  v_adult   boolean;
  v_pass    jsonb;
  v_parts   jsonb;
  v_part    jsonb;
  v_pi      integer;
  v_code    text;
  v_gp      jsonb;
  v_letters text[];
  v_subs    jsonb;
  v_s       jsonb;
  v_sc      jsonb;
  v_sl      text[];
  v_ways    jsonb;
  v_g       jsonb;
  v_worked  boolean;
  v_newparts jsonb;
  v_ex      jsonb;
begin
  if jsonb_typeof(p_v1) is distinct from 'object' or p_v1 -> 'schema_version' is distinct from '1'::jsonb
     or exists (select 1 from jsonb_object_keys(p_v1) as k(key) where k.key not in ('schema_version', 'source', 'grade_scales', 'dans'))
     or jsonb_typeof(p_v1 -> 'source') is distinct from 'string' then
    raise exception 'bb_rubric_from_v1: not a version 1 requirements sheet';
  end if;
  v_scales := p_v1 -> 'grade_scales';
  if jsonb_typeof(v_scales) is distinct from 'object'
     or exists (select 1 from jsonb_object_keys(v_scales) as k(key) where k.key not in ('physical', 'technical', 'curriculum'))
     or jsonb_typeof(v_scales -> 'physical') is distinct from 'object'
     or jsonb_typeof(v_scales -> 'technical') is distinct from 'object'
     or jsonb_typeof(v_scales -> 'curriculum') is distinct from 'object' then
    raise exception 'bb_rubric_from_v1: unexpected grade scales';
  end if;
  if jsonb_typeof(p_v1 -> 'dans') is distinct from 'array' or jsonb_array_length(p_v1 -> 'dans') <> 4 then
    raise exception 'bb_rubric_from_v1: a sheet must have 4 Dans';
  end if;

  for v_d, v_dn in select t.e, t.o::integer from jsonb_array_elements(p_v1 -> 'dans') with ordinality as t(e, o) loop
    if jsonb_typeof(v_d) is distinct from 'object' or v_d -> 'dan' is distinct from to_jsonb(v_dn)
       or exists (select 1 from jsonb_object_keys(v_d) as k(key) where k.key not in ('dan', 'pass_rule', 'parts', 'extra_points', 'hand_in')) then
      raise exception 'bb_rubric_from_v1: unexpected Dan %', v_dn;
    end if;
    v_parts := v_d -> 'parts';
    if jsonb_typeof(v_parts) is distinct from 'array' or jsonb_array_length(v_parts) <> 4
       or exists (select 1 from jsonb_array_elements(v_parts) with ordinality as p(e, o)
                   where p.e -> 'code' is distinct from to_jsonb(v_codes[p.o])) then
      raise exception 'bb_rubric_from_v1: Dan % must have the four parts in order', v_dn;
    end if;

    -- the pass rule
    v_pr := v_d -> 'pass_rule';
    if jsonb_typeof(v_pr) is distinct from 'object'
       or exists (select 1 from jsonb_object_keys(v_pr) as k(key) where k.key not in ('points', 'points_adult', 'no_d', 'makeup'))
       or jsonb_typeof(v_pr -> 'points') is distinct from 'number' then
      raise exception 'bb_rubric_from_v1: unexpected pass rule in Dan %', v_dn;
    end if;
    v_adult := exists (select 1 from jsonb_array_elements(v_parts) as p(e), jsonb_array_elements(p.e -> 'subjects') as s(e)
                        where s.e -> 'adults_only' = 'true'::jsonb);
    v_pass := jsonb_build_object(
      'brackets', case when v_adult or v_pr ? 'points_adult'
                       then jsonb_build_array(jsonb_build_object('from', null, 'to', 17, 'pass_mark', v_pr -> 'points'),
                                              jsonb_build_object('from', 18, 'to', null,
                                                                 'pass_mark', coalesce(v_pr -> 'points_adult', v_pr -> 'points')))
                       else jsonb_build_array(jsonb_build_object('from', null, 'to', null, 'pass_mark', v_pr -> 'points')) end,
      'no_d',     v_pr -> 'no_d',
      'makeup',   coalesce(v_pr -> 'makeup', 'null'::jsonb));

    -- the parts
    v_newparts := '[]'::jsonb;
    for v_part, v_pi in select t.e, t.o::integer from jsonb_array_elements(v_parts) with ordinality as t(e, o) loop
      v_code := v_codes[v_pi];
      if exists (select 1 from jsonb_object_keys(v_part) as k(key) where k.key not in ('code', 'name', 'max_points', 'max_points_adult', 'subjects'))
         or jsonb_typeof(v_part -> 'subjects') is distinct from 'array' then
        raise exception 'bb_rubric_from_v1: unexpected part % in Dan %', v_code, v_dn;
      end if;
      v_gp := case when v_code = 'other' then v_scales -> 'technical' else v_scales -> v_code end;
      v_letters := public.bb_rubric_letters(v_code, 'graded');
      v_subs := '[]'::jsonb;
      for v_s in select t.e from jsonb_array_elements(v_part -> 'subjects') with ordinality as t(e, o) order by t.o loop
        if exists (select 1 from jsonb_object_keys(v_s) as k(key)
                    where k.key not in ('name', 'credits', 'scoring', 'outdoor', 'hand_in', 'adults_only')) then
          raise exception 'bb_rubric_from_v1: unexpected subject % in Dan %', v_s ->> 'name', v_dn;
        end if;
        v_sc := v_s -> 'scoring';
        if v_sc ->> 'kind' = 'grades' then
          if exists (select 1 from jsonb_object_keys(v_sc) as k(key) where k.key not in ('kind', 'points')) then
            raise exception 'bb_rubric_from_v1: unexpected grades scoring for %', v_s ->> 'name';
          end if;
          v_sl := v_letters;
          v_ways := '[]'::jsonb;
        elsif v_sc ->> 'kind' = 'table' then
          if exists (select 1 from jsonb_object_keys(v_sc) as k(key) where k.key not in ('kind', 'direction', 'unit', 'groups', 'points', 'note'))
             or exists (select 1 from jsonb_array_elements(v_sc -> 'groups') as g(e),
                                      jsonb_object_keys(g.e) as k(key) where k.key not in ('ages', 'cutoffs', 'method'))
             or exists (select 1 from jsonb_array_elements(v_sc -> 'groups') as g(e),
                                      jsonb_object_keys(g.e -> 'ages') as k(key) where k.key not in ('min', 'max', 'label')) then
            raise exception 'bb_rubric_from_v1: unexpected table scoring for %', v_s ->> 'name';
          end if;
          v_sl := public.bb_rubric_letters(v_code, 'measured');
          if not exists (select 1 from jsonb_array_elements(v_sc -> 'groups') as g(e) where g.e ? 'method') then
            -- one way: no name, the subject's unit and direction
            v_ways := jsonb_build_array(jsonb_build_object(
              'name', null, 'unit', v_sc -> 'unit', 'direction', v_sc -> 'direction',
              'brackets', (select jsonb_agg(jsonb_build_object(
                                    'from', g.e -> 'ages' -> 'min', 'to', g.e -> 'ages' -> 'max',
                                    'cutoffs', (select jsonb_object_agg(c.e ->> 'grade', c.e -> 'value')
                                                  from jsonb_array_elements(g.e -> 'cutoffs') as c(e)))
                                  order by g.o)
                             from jsonb_array_elements(v_sc -> 'groups') with ordinality as g(e, o))));
          elsif not exists (select 1 from jsonb_array_elements(v_sc -> 'groups') as g(e)
                             where g.e -> 'method' is null or g.e ->> 'method' not in ('reps', 'hold'))
                and exists (select 1 from jsonb_array_elements(v_sc -> 'groups') as g(e) where g.e ->> 'method' = 'reps')
                and exists (select 1 from jsonb_array_elements(v_sc -> 'groups') as g(e) where g.e ->> 'method' = 'hold') then
            -- "Pull-up or hold": two ways, Pull-up (reps) first, then Hold (seconds)
            v_ways := (select jsonb_agg(jsonb_build_object(
                                 'name', w.name, 'unit', w.unit, 'direction', v_sc -> 'direction',
                                 'brackets', (select jsonb_agg(jsonb_build_object(
                                                       'from', g.e -> 'ages' -> 'min', 'to', g.e -> 'ages' -> 'max',
                                                       'cutoffs', (select jsonb_object_agg(c.e ->> 'grade', c.e -> 'value')
                                                                     from jsonb_array_elements(g.e -> 'cutoffs') as c(e)))
                                                     order by g.o)
                                                from jsonb_array_elements(v_sc -> 'groups') with ordinality as g(e, o)
                                               where g.e ->> 'method' = w.method))
                               order by w.n)
                         from (values (1, 'Pull-up', 'reps', 'reps'), (2, 'Hold', 'seconds', 'hold')) as w(n, name, unit, method));
          else
            raise exception 'bb_rubric_from_v1: unexpected scoring method for %', v_s ->> 'name';
          end if;
        else
          raise exception 'bb_rubric_from_v1: unexpected scoring kind for %', v_s ->> 'name';
        end if;
        -- worked out = every grade's points equal credits x the part's grade points
        v_worked := jsonb_typeof(v_sc -> 'points') = 'object'
                    and (select count(*) from jsonb_object_keys(v_sc -> 'points')) = cardinality(v_sl)
                    and not exists (select 1 from unnest(v_sl) as l(g)
                                     where (v_sc -> 'points' -> l.g)::numeric is distinct from (v_s -> 'credits')::numeric * (v_gp -> l.g)::numeric);
        v_subs := v_subs || jsonb_build_array(jsonb_build_object(
          'id',          left(md5(v_dn::text || '/' || v_code || '/' || (v_s ->> 'name')), 8),
          'name',        v_s -> 'name',
          'credits',     v_s -> 'credits',
          'scoring',     case when v_sc ->> 'kind' = 'grades' then 'graded' else 'measured' end,
          'ways',        v_ways,
          'points_mode', case when v_worked then 'worked' else 'own' end,
          'points',      v_sc -> 'points',
          'limited_to',  case when v_s -> 'adults_only' = 'true'::jsonb then '[{"from": 18, "to": null}]'::jsonb else 'null'::jsonb end,
          'outdoor',     coalesce(v_s -> 'outdoor', 'false'::jsonb),
          'handed_in',   coalesce(v_s -> 'hand_in', 'false'::jsonb),
          'note',        coalesce(v_sc -> 'note', 'null'::jsonb)));
      end loop;
      v_newparts := v_newparts || jsonb_build_array(jsonb_build_object(
        'code', v_code, 'name', v_part -> 'name',
        'grade_points', (select jsonb_object_agg(l.g, v_gp -> l.g) from unnest(v_letters) as l(g)),
        'subjects', v_subs));
    end loop;
    v_parts := v_newparts;

    -- the extra points, copied as they are (a note added as empty where missing)
    v_ex := v_d -> 'extra_points';
    if jsonb_typeof(v_ex) is distinct from 'object'
       or exists (select 1 from jsonb_object_keys(v_ex) as k(key)
                   where k.key not in ('counts_toward_total', 'limit', 'to_confirm', 'note', 'items')) then
      raise exception 'bb_rubric_from_v1: unexpected extra points in Dan %', v_dn;
    end if;
    if not v_ex ? 'note' then
      v_ex := v_ex || '{"note": null}'::jsonb;
    end if;

    v_dans := v_dans || jsonb_build_array(jsonb_build_object(
      'dan', v_dn, 'rev', 1, 'saved_at', null, 'saved_by_name', null,
      'pass', v_pass, 'parts', v_parts, 'extra_points', v_ex));
  end loop;

  return jsonb_build_object('schema_version', 2, 'source', p_v1 -> 'source', 'dans', v_dans);
end;
$$;

revoke execute on function public.bb_rubric_from_v1(jsonb) from public, anon, authenticated, service_role;

-- 4b. bb_rubric_fresh_copy(rubric) - what Add cycle stores (6.4): the
-- default rubric with source "Default rubric", every Dan back at rev 1 and
-- no "saved" stamps (the cycle's own history starts here).
create or replace function public.bb_rubric_fresh_copy(p_sheet jsonb)
returns jsonb
language sql
immutable
set search_path = ''
as $$
  select p_sheet
         || jsonb_build_object(
              'source', 'Default rubric',
              'dans', coalesce((select jsonb_agg(d.e || '{"rev": 1, "saved_at": null, "saved_by_name": null}'::jsonb order by d.o)
                                  from jsonb_array_elements(p_sheet -> 'dans') with ordinality as d(e, o)), '[]'::jsonb));
$$;

revoke execute on function public.bb_rubric_fresh_copy(jsonb) from public, anon, authenticated, service_role;

-- 4c. bb_rubric_public(rubric) - the copy the FAMILY FORM gets (contract
-- 7). Built from an ALLOW-LIST, key by key (new objects, never "the
-- document minus some keys"), so the revs, the "saved" stamps, the
-- source and ANY key added in the future never reach the public:
--   Rubric  schema_version, dans
--   Dan     dan, pass, parts, extra_points
--   Pass    brackets (from, to, pass_mark), no_d, makeup
--   Part    code, name, grade_points, subjects
--   Subject id, name, credits, scoring, ways, points_mode, points,
--           limited_to (from, to), outdoor, handed_in, note
--   Way     name, unit, direction, brackets (from, to, cutoffs)
--   Extra   counts_toward_total, limit, to_confirm, note,
--           items (name, rule: kind, points_each | steps (at_least, points))
-- Grade points, points and cut-offs keep only the grade letters.
create or replace function public.bb_rubric_public(p_doc jsonb)
returns jsonb
language sql
immutable
set search_path = ''
as $$
  with letters(g) as (values ('A+'), ('A'), ('A-'), ('B+'), ('B'), ('B-'), ('C'), ('C-'), ('D'))
  select case when jsonb_typeof(p_doc) = 'object' then jsonb_build_object(
    'schema_version', p_doc -> 'schema_version',
    'dans', coalesce((
      select jsonb_agg(jsonb_build_object(
               'dan', d.e -> 'dan',
               'pass', jsonb_build_object(
                 'brackets', coalesce((select jsonb_agg(jsonb_build_object('from', b.e -> 'from', 'to', b.e -> 'to',
                                                                           'pass_mark', b.e -> 'pass_mark') order by b.o)
                                         from jsonb_array_elements(case when jsonb_typeof(d.e -> 'pass' -> 'brackets') = 'array'
                                                                        then d.e -> 'pass' -> 'brackets' else '[]'::jsonb end)
                                              with ordinality as b(e, o)), '[]'::jsonb),
                 'no_d',   d.e -> 'pass' -> 'no_d',
                 'makeup', d.e -> 'pass' -> 'makeup'),
               'parts', coalesce((
                 select jsonb_agg(jsonb_build_object(
                          'code', p.e -> 'code',
                          'name', p.e -> 'name',
                          'grade_points', coalesce((select jsonb_object_agg(l.g, p.e -> 'grade_points' -> l.g) from letters l
                                                     where jsonb_typeof(p.e -> 'grade_points') = 'object' and p.e -> 'grade_points' ? l.g), '{}'::jsonb),
                          'subjects', coalesce((
                            select jsonb_agg(jsonb_build_object(
                                     'id', s.e -> 'id', 'name', s.e -> 'name', 'credits', s.e -> 'credits',
                                     'scoring', s.e -> 'scoring',
                                     'ways', coalesce((
                                       select jsonb_agg(jsonb_build_object(
                                                'name', w.e -> 'name', 'unit', w.e -> 'unit', 'direction', w.e -> 'direction',
                                                'brackets', coalesce((
                                                  select jsonb_agg(jsonb_build_object(
                                                           'from', wb.e -> 'from', 'to', wb.e -> 'to',
                                                           'cutoffs', coalesce((select jsonb_object_agg(l.g, wb.e -> 'cutoffs' -> l.g) from letters l
                                                                                 where jsonb_typeof(wb.e -> 'cutoffs') = 'object' and wb.e -> 'cutoffs' ? l.g), '{}'::jsonb))
                                                         order by wb.o)
                                                    from jsonb_array_elements(case when jsonb_typeof(w.e -> 'brackets') = 'array'
                                                                                   then w.e -> 'brackets' else '[]'::jsonb end)
                                                         with ordinality as wb(e, o)), '[]'::jsonb))
                                              order by w.o)
                                         from jsonb_array_elements(case when jsonb_typeof(s.e -> 'ways') = 'array' then s.e -> 'ways' else '[]'::jsonb end)
                                              with ordinality as w(e, o)), '[]'::jsonb),
                                     'points_mode', s.e -> 'points_mode',
                                     'points', coalesce((select jsonb_object_agg(l.g, s.e -> 'points' -> l.g) from letters l
                                                          where jsonb_typeof(s.e -> 'points') = 'object' and s.e -> 'points' ? l.g), '{}'::jsonb),
                                     'limited_to', case when jsonb_typeof(s.e -> 'limited_to') = 'array'
                                                        then coalesce((select jsonb_agg(jsonb_build_object('from', lt.e -> 'from', 'to', lt.e -> 'to') order by lt.o)
                                                                         from jsonb_array_elements(s.e -> 'limited_to') with ordinality as lt(e, o)), '[]'::jsonb)
                                                        else 'null'::jsonb end,
                                     'outdoor', s.e -> 'outdoor', 'handed_in', s.e -> 'handed_in', 'note', s.e -> 'note')
                                   order by s.o)
                              from jsonb_array_elements(case when jsonb_typeof(p.e -> 'subjects') = 'array' then p.e -> 'subjects' else '[]'::jsonb end)
                                   with ordinality as s(e, o)), '[]'::jsonb))
                        order by p.o)
                   from jsonb_array_elements(case when jsonb_typeof(d.e -> 'parts') = 'array' then d.e -> 'parts' else '[]'::jsonb end)
                        with ordinality as p(e, o)), '[]'::jsonb),
               'extra_points', jsonb_build_object(
                 'counts_toward_total', d.e -> 'extra_points' -> 'counts_toward_total',
                 'limit',               d.e -> 'extra_points' -> 'limit',
                 'to_confirm',          d.e -> 'extra_points' -> 'to_confirm',
                 'note',                d.e -> 'extra_points' -> 'note',
                 'items', coalesce((
                   select jsonb_agg(jsonb_build_object(
                            'name', i.e -> 'name',
                            'rule', case when i.e -> 'rule' ->> 'kind' = 'per_count'
                                         then jsonb_build_object('kind', 'per_count', 'points_each', i.e -> 'rule' -> 'points_each')
                                         when i.e -> 'rule' ->> 'kind' = 'steps'
                                         then jsonb_build_object('kind', 'steps', 'steps', coalesce((
                                                select jsonb_agg(jsonb_build_object('at_least', st.e -> 'at_least', 'points', st.e -> 'points') order by st.o)
                                                  from jsonb_array_elements(case when jsonb_typeof(i.e -> 'rule' -> 'steps') = 'array'
                                                                                 then i.e -> 'rule' -> 'steps' else '[]'::jsonb end)
                                                       with ordinality as st(e, o)), '[]'::jsonb))
                                         else jsonb_build_object('kind', i.e -> 'rule' -> 'kind') end)
                          order by i.o)
                     from jsonb_array_elements(case when jsonb_typeof(d.e -> 'extra_points' -> 'items') = 'array'
                                                    then d.e -> 'extra_points' -> 'items' else '[]'::jsonb end)
                          with ordinality as i(e, o)), '[]'::jsonb)))
             order by d.o)
        from jsonb_array_elements(case when jsonb_typeof(p_doc -> 'dans') = 'array' then p_doc -> 'dans' else '[]'::jsonb end)
             with ordinality as d(e, o)), '[]'::jsonb))
  end;
$$;

revoke execute on function public.bb_rubric_public(jsonb) from public, anon, authenticated, service_role;

-- 4d. bb_rubric_put_dan(rubric, dan number, new dan, rev) - the rubric
-- with that Dan replaced and stamped by the server: rev = the given rev,
-- saved_at = now in UTC ("2026-10-21T18:04:05Z"), saved_by_name = who is
-- saving (their staff name, tidied and cut to 60 characters - or EMPTY
-- when what is left still isn't a valid name, so an admin with a long or
-- unusual display name can always save; "Last changed by" is then hidden).
-- Whatever stamps the screen sent are thrown away.
create or replace function public.bb_rubric_put_dan(p_doc jsonb, p_dan integer, p_new_dan jsonb, p_rev integer)
returns jsonb
language plpgsql
stable
set search_path = ''
as $$
declare
  v_name text;
begin
  v_name := public.testing_normalize_name(left(public.testing_normalize_name(public.change_log_actor_name()), 60));
  if not coalesce(public.testing_name_is_valid(v_name)
                  and v_name !~ '[؜  ­᠎\U000e0000-\U000e007f]', false) then
    v_name := null;
  end if;
  return jsonb_set(p_doc, array['dans', (p_dan - 1)::text],
                   (p_new_dan - 'rev' - 'saved_at' - 'saved_by_name')
                   || jsonb_build_object('rev', p_rev,
                                         'saved_at', to_char(now() at time zone 'UTC', 'YYYY-MM-DD"T"HH24:MI:SS"Z"'),
                                         'saved_by_name', v_name));
end;
$$;

revoke execute on function public.bb_rubric_put_dan(jsonb, integer, jsonb, integer) from public, anon, authenticated, service_role;


-- ---------------------------------------------------------------------
-- 5. The two tables
-- ---------------------------------------------------------------------

-- 5a. public.bb_default_rubric - ONE row: the default rubric every new
-- cycle starts from (v0.921). Staff and admins read it (Rubric and prices);
-- only admins change it, one Dan at a time, through bb_save_default_dan /
-- bb_undo_default_dan.
create table if not exists public.bb_default_rubric (
  id              uuid        not null default gen_random_uuid(),
  singleton       boolean     not null default true,
  sheet           jsonb       not null,
  version         integer     not null default 1,
  created_at      timestamptz not null default now(),
  updated_at      timestamptz not null default now(),
  created_by      uuid        null,      -- login id; never readable by the app
  updated_by      uuid        null,      -- login id; never readable by the app
  created_by_name text        not null,
  updated_by_name text        not null,

  constraint bb_default_rubric_pkey primary key (id),
  constraint bb_default_rubric_singleton_key unique (singleton),
  constraint bb_default_rubric_singleton_check check (singleton),
  constraint bb_default_rubric_sheet_check check (public.bb_rubric_is_valid(sheet)),
  constraint bb_default_rubric_version_check check (version >= 1)
);

comment on table public.bb_default_rubric is
  'Black Belt: the default rubric (one row, schema version 2). Every new cycle gets a copy of it.';

-- 5b. public.bb_rubric_undo - the undo slots: what one save or one first
-- opening replaced, so the toast's Undo can put it back for 15 seconds,
-- for the same admin only. One slot per Dan of the default, per Dan of a
-- cycle, and per cycle for the first opening (a new save replaces it).
-- Nobody in the app can read it (RLS on, no rule, no rights).
--   kind:          'default_dan' | 'cycle_dan' | 'first_open'
--   cycle_id:      the cycle (empty for the default); removed with the cycle
--   dan:           1-4 (empty for a first opening)
--   previous:      the Dan object the save replaced, or for a first opening
--                  {"registration_open": false, "first_opened_at": null,
--                   "auto_close": <as it was>}
--   after_version: the Dan's rev (or the cycle's version) the save made;
--                  the Undo only applies to exactly that
--   saved_by:      who saved (login id; never readable)
create table if not exists public.bb_rubric_undo (
  id            uuid        not null default gen_random_uuid(),
  kind          text        not null,
  cycle_id      uuid        null,
  dan           smallint    null,
  previous      jsonb       not null,
  after_version integer     not null,
  saved_by      uuid        null,      -- login id; never readable by the app
  saved_at      timestamptz not null default now(),

  constraint bb_rubric_undo_pkey primary key (id),
  constraint bb_rubric_undo_kind_check check (kind in ('default_dan', 'cycle_dan', 'first_open')),
  constraint bb_rubric_undo_cycle_fk foreign key (cycle_id) references public.bb_cycles (id) on delete cascade,
  constraint bb_rubric_undo_cycle_check check ((kind = 'default_dan') = (cycle_id is null)),
  constraint bb_rubric_undo_dan_check check (dan between 1 and 4),
  constraint bb_rubric_undo_dan_kind_check check ((kind = 'first_open') = (dan is null))
);

-- One slot per (kind, cycle, Dan); "nulls not distinct" makes the empty
-- cycle of the default (and the empty Dan of a first opening) count as
-- equal, so the default can't get two slots for the same Dan either.
create unique index if not exists bb_rubric_undo_slot_key
  on public.bb_rubric_undo (kind, cycle_id, dan) nulls not distinct;

comment on table public.bb_rubric_undo is
  'Black Belt: undo slots for the last rubric save per Dan and the first opening per cycle (15-second Undo). Never granted.';


-- ---------------------------------------------------------------------
-- 6. Triggers: the two new tables' guards, and the REPLACED bb_cycles
--    rules (contract 5). Errors use errcode 23514 (check_violation) with a
--    constraint name saying which rule, as in 0016 section 11.
-- ---------------------------------------------------------------------

-- 6a. bb_default_rubric_guard() - BEFORE INSERT OR UPDATE OR DELETE:
--   insert: only the seed (action tag bb_seed)
--   update: only bb_save_default_dan / bb_undo_default_dan, or a hand fix
--   delete: ALWAYS refused (Undo 0024 removes the whole table instead)
create or replace function public.bb_default_rubric_guard()
returns trigger
language plpgsql
set search_path = ''
as $$
declare
  v_tag text := coalesce(current_setting('tkd.action', true), '');
begin
  if tg_op = 'INSERT' and v_tag = 'bb_seed' then
    return new;
  end if;
  if tg_op = 'UPDATE'
     and (v_tag in ('bb_save_default_dan', 'bb_undo_default_dan')
          or (session_user = 'postgres' and v_tag = '')) then
    return new;
  end if;
  raise exception using
    errcode    = '23514',
    constraint = 'bb_default_rubric_immutable',
    message    = 'the default rubric is changed only through Save / Undo on Rubric and prices (or by hand in the SQL Editor)';
end;
$$;

revoke execute on function public.bb_default_rubric_guard() from public, anon, authenticated, service_role;

-- 6b. bb_rubric_undo_guard() - BEFORE INSERT OR UPDATE OR DELETE on the
-- undo slots: only the six functions that keep them (their action tags),
-- or a hand fix; a slot is also removed together with its cycle (Delete
-- cycle: tag bb_delete_cycle AND inside the cascade, pg_trigger_depth() > 1
-- - both must hold).
create or replace function public.bb_rubric_undo_guard()
returns trigger
language plpgsql
set search_path = ''
as $$
declare
  v_tag text := coalesce(current_setting('tkd.action', true), '');
begin
  if v_tag in ('bb_save_default_dan', 'bb_undo_default_dan', 'bb_save_cycle_dan', 'bb_undo_cycle_dan',
               'bb_set_registration', 'bb_undo_first_open')
     or (tg_op = 'DELETE' and v_tag = 'bb_delete_cycle' and pg_trigger_depth() > 1)
     or (session_user = 'postgres' and v_tag = '') then
    if tg_op = 'DELETE' then
      return old;
    end if;
    return new;
  end if;
  raise exception using
    errcode    = '23514',
    constraint = 'bb_rubric_undo_immutable',
    message    = 'an undo slot is written only by the rubric and registration functions';
end;
$$;

revoke execute on function public.bb_rubric_undo_guard() from public, anon, authenticated, service_role;

-- 6c. bb_cycles_rules() - REPLACES 0016's (11d). BEFORE INSERT OR UPDATE on
-- cycles:
--   * a link code may never be used by ANOTHER cycle (0016's rule,
--     unchanged); constraint bb_cycles_public_code_cross_key
--   * a cycle's rubric (requirements) changes only (a) by a hand fix, (b)
--     through Save / Undo of one of its Dans while registration has NEVER
--     opened (first_opened_at empty before and after - the lock of v0.921,
--     here in the table itself, behind the functions' own "locked" check),
--     or (c) by this migration's one-time conversion of a version 1 sheet
--     (tag bb_rubric_upgrade); constraint bb_cycles_requirements_immutable
--   * first_opened_at changes only (a) by a hand fix, (b) from empty to a
--     time by bb_set_registration (the first opening), (c) from a time to
--     empty by bb_undo_first_open (its Undo) - so "never opened" can only
--     come back through that Undo; constraint bb_cycles_first_opened_immutable
create or replace function public.bb_cycles_rules()
returns trigger
language plpgsql
set search_path = ''
as $$
declare
  v_tag  text := coalesce(current_setting('tkd.action', true), '');
  v_hand boolean := (session_user = 'postgres' and coalesce(current_setting('tkd.action', true), '') = '');
begin
  if exists (select 1 from public.bb_cycles c
              where c.id <> new.id
                and (c.public_code_worcester in (new.public_code_worcester, new.public_code_shrewsbury)
                     or c.public_code_shrewsbury in (new.public_code_worcester, new.public_code_shrewsbury))) then
    raise exception using
      errcode    = '23505',
      constraint = 'bb_cycles_public_code_cross_key',
      message    = 'that link code is already used by another Black Belt cycle';
  end if;
  if tg_op = 'UPDATE' and new.requirements is distinct from old.requirements
     and not (v_hand
              or (v_tag in ('bb_save_cycle_dan', 'bb_undo_cycle_dan')
                  and old.first_opened_at is null and new.first_opened_at is null)
              or (v_tag = 'bb_rubric_upgrade' and old.requirements -> 'schema_version' = '1'::jsonb)) then
    raise exception using
      errcode    = '23514',
      constraint = 'bb_cycles_requirements_immutable',
      message    = 'a cycle''s rubric is locked once registration has opened (or is changed only through Save on its Rubric tab)';
  end if;
  if tg_op = 'UPDATE' and new.first_opened_at is distinct from old.first_opened_at
     and not (v_hand
              or (v_tag = 'bb_set_registration' and old.first_opened_at is null and new.first_opened_at is not null)
              or (v_tag = 'bb_undo_first_open' and old.first_opened_at is not null and new.first_opened_at is null)) then
    raise exception using
      errcode    = '23514',
      constraint = 'bb_cycles_first_opened_immutable',
      message    = 'the first opening is set only by opening registration, and cleared only by its Undo';
  end if;
  return new;
end;
$$;

revoke execute on function public.bb_cycles_rules() from public, anon, authenticated, service_role;

-- 6d. Attach the triggers ("drop trigger if exists" + create = replace).
-- BEFORE triggers of one table run in name order, so <table>_before_write
-- runs before <table>_guard.

-- bb_cycles: the version bookkeeping again, now with "requirements" as a
-- NO-BUMP column (0016's fixed columns unchanged): a rubric save never
-- raises the cycle's version, so an open Edit cycle dialog or the
-- registration switch never goes "stale" because of it.
drop trigger if exists bb_cycles_before_write on public.bb_cycles;
create trigger bb_cycles_before_write
  before insert or update on public.bb_cycles
  for each row execute function public.bb_before_write('id,public_code_worcester,public_code_shrewsbury,prices_from', 'requirements');

drop trigger if exists bb_cycles_rules on public.bb_cycles;
create trigger bb_cycles_rules
  before insert or update on public.bb_cycles
  for each row execute function public.bb_cycles_rules();

drop trigger if exists bb_default_rubric_before_write on public.bb_default_rubric;
create trigger bb_default_rubric_before_write
  before insert or update on public.bb_default_rubric
  for each row execute function public.bb_before_write('id,singleton', '');

drop trigger if exists bb_default_rubric_guard on public.bb_default_rubric;
create trigger bb_default_rubric_guard
  before insert or update or delete on public.bb_default_rubric
  for each row execute function public.bb_default_rubric_guard();

drop trigger if exists bb_default_rubric_log on public.bb_default_rubric;
create trigger bb_default_rubric_log
  after insert or update or delete on public.bb_default_rubric
  for each row execute function public.change_log_write();

drop trigger if exists bb_default_rubric_no_truncate on public.bb_default_rubric;
create trigger bb_default_rubric_no_truncate
  before truncate on public.bb_default_rubric
  for each statement execute function public.testing_refuse_truncate();

drop trigger if exists bb_rubric_undo_guard on public.bb_rubric_undo;
create trigger bb_rubric_undo_guard
  before insert or update or delete on public.bb_rubric_undo
  for each row execute function public.bb_rubric_undo_guard();

-- the undo slots are logged like every table (house rule), although
-- change_log already holds the same values (OI-4)
drop trigger if exists bb_rubric_undo_log on public.bb_rubric_undo;
create trigger bb_rubric_undo_log
  after insert or update or delete on public.bb_rubric_undo
  for each row execute function public.change_log_write();

drop trigger if exists bb_rubric_undo_no_truncate on public.bb_rubric_undo;
create trigger bb_rubric_undo_no_truncate
  before truncate on public.bb_rubric_undo
  for each statement execute function public.testing_refuse_truncate();


-- ---------------------------------------------------------------------
-- 7. Convert every existing cycle's sheet to version 2, then the new rule
--    (contract 4.2, in exactly this order):
--      (i)   the new bb_cycles rules and trigger (section 6, above)
--      (ii)  the OLD rule, which accepts only version 1 sheets, is dropped
--      (iii) every version 1 sheet is converted in place - opened or not
--            (the trigger allows exactly this, tag bb_rubric_upgrade); no
--            version bump (requirements is a no-bump column now)
--      (iv)  the NEW rule: version 2 only, checked against every row as it
--            is added. A "version 1 or 2" rule is on purpose NOT used: it
--            would let a version 1 sheet back in.
--    On a re-run, (ii)-(iv) repeat harmlessly (no version 1 sheet is left).
--    Production had no cycle when this was written (checked at CP2); the
--    code handles any number.
-- ---------------------------------------------------------------------
select set_config('request.jwt.claims', '', true);
select set_config('tkd.actor_label', 'Database admin', true);
select set_config('tkd.action', 'bb_rubric_upgrade', true);
select set_config('tkd.batch_id', gen_random_uuid()::text, true);

alter table public.bb_cycles drop constraint if exists bb_cycles_requirements_check;

update public.bb_cycles y
   set requirements = public.bb_rubric_from_v1(y.requirements)
 where y.requirements -> 'schema_version' = '1'::jsonb;

alter table public.bb_cycles
  add constraint bb_cycles_requirements_check check (public.bb_rubric_is_valid(requirements));


-- ---------------------------------------------------------------------
-- 8. The default rubric: made from the Fall 2026 starting point (the
--    numbers Jeffrey approved at 0016's CP1), tagged bb_seed, by "Database
--    admin". It NEVER overwrites ("on conflict do nothing"). Even if cycles
--    exist, the default comes from the starting point, which itself stays
--    version 1 and untouched (the record of what CP1 approved).
-- ---------------------------------------------------------------------
select set_config('tkd.action', 'bb_seed', true);
select set_config('tkd.batch_id', gen_random_uuid()::text, true);

insert into public.bb_default_rubric (sheet, created_by_name, updated_by_name)
select public.bb_rubric_from_v1(sp.requirements), '', ''
  from public.bb_starting_point sp
on conflict (singleton) do nothing;

select set_config('tkd.actor_label', '', true);
select set_config('tkd.action', '', true);
select set_config('tkd.batch_id', '', true);


-- ---------------------------------------------------------------------
-- 9. Security rules: RLS + grants (the same two layers as 0016 section 12)
--   * bb_default_rubric: staff and admins READ the granted columns while
--     has_data_access() is true; nobody writes it directly
--   * bb_rubric_undo: RLS on, no rule, no rights = nobody in the app
--   * nothing at all for anon, service_role, PUBLIC or any form's login
-- ---------------------------------------------------------------------
alter table public.bb_default_rubric enable row level security;
alter table public.bb_rubric_undo    enable row level security;

-- start from zero (also removes column grants, so re-runs stay clean)...
revoke all on table public.bb_default_rubric, public.bb_rubric_undo from public, anon, authenticated, service_role;

-- ...then add back exactly what the app reads (contract 8)
grant select (id, sheet, version, updated_at, updated_by_name)
  on public.bb_default_rubric to authenticated;        -- NOT singleton, created_*, created_by, updated_by

drop policy if exists bb_default_rubric_select_with_access on public.bb_default_rubric;
create policy bb_default_rubric_select_with_access
  on public.bb_default_rubric for select to authenticated
  using ((select public.has_data_access()));


-- ---------------------------------------------------------------------
-- 10. The staff WRITE functions (all admins only, "A"). The same pattern
--     as 0016 section 15:
--   * returns {"status": ...}
--   * checks in this order (contract 1.1): 1 has_data_access() FIRST
--     (no_access), 2 the role (not_allowed), 3 the input (invalid) -
--     including the whole validator, before anything is locked - 4 it
--     locks and looks up the rows (not_found), 5 locked / stale, 6 the
--     rules that depend on the data, 8 it writes
--   * tags its writes with tkd.action (= the function's name) + one new
--     tkd.batch_id, and clears both after writing
--   * the whole body is inside begin ... exception ... end: if a table
--     rule still says no, everything this call did is undone and a status
--     is answered instead of an error:
--       any unique rule                               -> stale
--       foreign key / check / not-null rule           -> invalid
--       a number too big / a bad conversion (22003, 22P02) -> invalid
--       deadlock / serialization / lock not available -> stale
--   * no argument has a default; whole numbers are "integer"
-- ---------------------------------------------------------------------

-- 10a. bb_save_default_dan(p_dan, p_expected_rev, p_sheet)   A
-- Rubric and prices -> Edit [Dan] -> Save [Dan] (v0.923). p_sheet = the
-- whole Dan object the editor shows; its rev / saved_at / saved_by_name are
-- ignored and replaced by the server. p_expected_rev = the rev the editor
-- loaded (another admin's save in between -> stale).
--   * fails a rule -> {"status":"invalid","problems":[...]} (nothing written)
--   * the same as what is saved -> nothing changes; {"changed": false,
--     "undo_available": false}, and the caller's own undo slot for this Dan
--     is removed (so no Undo can point at an older save)
--   * else the Dan is replaced (rev + 1, stamped) and an undo slot is kept
-- locks: bb_default_rubric (update)
-- Ok: {"status":"ok","rev":n,"saved_at":...,"saved_by_name":...|null,
--      "changed":true|false,"undo_available":true|false,"previous_rev":n|null}
create or replace function public.bb_save_default_dan(
  p_dan          integer,
  p_expected_rev integer,
  p_sheet        jsonb
)
returns jsonb
language plpgsql
volatile
security definer
set search_path = ''
as $$
declare
  v_new      jsonb;
  v_problems jsonb;
  v_row      public.bb_default_rubric;
  v_old      jsonb;
  v_saved    jsonb;
begin
  begin
    if public.has_data_access() is not true then
      return jsonb_build_object('status', 'no_access');
    end if;
    if public.is_admin() is not true then
      return jsonb_build_object('status', 'not_allowed');
    end if;

    -- 3. the input: the Dan number, the rev (checked BEFORE rev + 1 is
    --    worked out), a Dan object for that Dan, then the whole validator
    if p_dan is null or p_dan not between 1 and 4
       or p_expected_rev is null or p_expected_rev not between 1 and 1000000
       or jsonb_typeof(p_sheet) is distinct from 'object'
       or p_sheet -> 'dan' is distinct from to_jsonb(p_dan) then
      return jsonb_build_object('status', 'invalid');
    end if;
    v_new := (p_sheet - 'rev' - 'saved_at' - 'saved_by_name')
             || jsonb_build_object('rev', p_expected_rev + 1, 'saved_at', null, 'saved_by_name', null);
    v_problems := public.bb_rubric_dan_problems(v_new, p_dan);
    if v_problems <> '[]'::jsonb then
      return jsonb_build_object('status', 'invalid', 'problems', v_problems);
    end if;

    -- 4. lock the default (it is seeded, so a missing row is a broken
    --    database, answered "invalid", never "not_found")
    select * into v_row from public.bb_default_rubric r for update;
    if not found then
      return jsonb_build_object('status', 'invalid');
    end if;
    v_old := v_row.sheet -> 'dans' -> (p_dan - 1);

    -- 5. did the editor see the latest version of this Dan?
    if v_old -> 'rev' is distinct from to_jsonb(p_expected_rev) then
      return jsonb_build_object('status', 'stale');
    end if;

    perform set_config('tkd.action', 'bb_save_default_dan', true);
    perform set_config('tkd.batch_id', gen_random_uuid()::text, true);

    -- 6. nothing changed: no write to the rubric; the caller's own slot goes
    if (v_new - 'rev' - 'saved_at' - 'saved_by_name') = (v_old - 'rev' - 'saved_at' - 'saved_by_name') then
      delete from public.bb_rubric_undo u
       where u.kind = 'default_dan' and u.cycle_id is null and u.dan = p_dan and u.saved_by = auth.uid();
      perform set_config('tkd.action', '', true);
      perform set_config('tkd.batch_id', '', true);
      return jsonb_build_object('status', 'ok', 'rev', v_old -> 'rev', 'saved_at', v_old -> 'saved_at',
                                'saved_by_name', v_old -> 'saved_by_name', 'changed', false,
                                'undo_available', false, 'previous_rev', null);
    end if;

    -- 8. keep the undo slot (replacing an older one), then save the Dan
    insert into public.bb_rubric_undo (kind, cycle_id, dan, previous, after_version, saved_by, saved_at)
    values ('default_dan', null, p_dan, v_old, p_expected_rev + 1, auth.uid(), now())
    on conflict (kind, cycle_id, dan) do update
      set previous = excluded.previous, after_version = excluded.after_version,
          saved_by = excluded.saved_by, saved_at = excluded.saved_at;
    update public.bb_default_rubric r
       set sheet = public.bb_rubric_put_dan(r.sheet, p_dan, v_new, p_expected_rev + 1)
     where r.id = v_row.id
    returning r.sheet -> 'dans' -> (p_dan - 1) into v_saved;

    perform set_config('tkd.action', '', true);
    perform set_config('tkd.batch_id', '', true);

    return jsonb_build_object('status', 'ok', 'rev', v_saved -> 'rev', 'saved_at', v_saved -> 'saved_at',
                              'saved_by_name', v_saved -> 'saved_by_name', 'changed', true,
                              'undo_available', true, 'previous_rev', p_expected_rev);
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

revoke execute on function public.bb_save_default_dan(integer, integer, jsonb) from public, anon, authenticated, service_role;
grant  execute on function public.bb_save_default_dan(integer, integer, jsonb) to authenticated;

-- 10b. bb_undo_default_dan(p_dan, p_expected_rev)   A
-- The toast's Undo after a Save of the default (R11): puts back what that
-- save replaced, as ONE MORE save (a new rev, stamped now - v0.923).
-- Only when nothing changed since (p_expected_rev = the rev that save made,
-- and the slot points at exactly it), only by the admin who saved, and only
-- within 15 seconds of the save; otherwise -> stale ("Someone else changed
-- this just now." / too late).
-- locks: bb_default_rubric (update)
-- Ok: {"status":"ok","rev":n,"saved_at":...,"saved_by_name":...|null}
create or replace function public.bb_undo_default_dan(
  p_dan          integer,
  p_expected_rev integer
)
returns jsonb
language plpgsql
volatile
security definer
set search_path = ''
as $$
declare
  v_row   public.bb_default_rubric;
  v_slot  public.bb_rubric_undo;
  v_saved jsonb;
begin
  begin
    if public.has_data_access() is not true then
      return jsonb_build_object('status', 'no_access');
    end if;
    if public.is_admin() is not true then
      return jsonb_build_object('status', 'not_allowed');
    end if;

    if p_dan is null or p_dan not between 1 and 4
       or p_expected_rev is null or p_expected_rev not between 1 and 1000000 then
      return jsonb_build_object('status', 'invalid');
    end if;

    select * into v_row from public.bb_default_rubric r for update;
    if not found then
      return jsonb_build_object('status', 'invalid');
    end if;

    select * into v_slot from public.bb_rubric_undo u
     where u.kind = 'default_dan' and u.cycle_id is null and u.dan = p_dan;
    if v_row.sheet -> 'dans' -> (p_dan - 1) -> 'rev' is distinct from to_jsonb(p_expected_rev)
       or v_slot.id is null
       or v_slot.after_version is distinct from p_expected_rev
       or v_slot.saved_by is distinct from auth.uid()
       or v_slot.saved_at < now() - interval '15 seconds' then
      return jsonb_build_object('status', 'stale');
    end if;

    perform set_config('tkd.action', 'bb_undo_default_dan', true);
    perform set_config('tkd.batch_id', gen_random_uuid()::text, true);

    update public.bb_default_rubric r
       set sheet = public.bb_rubric_put_dan(r.sheet, p_dan, v_slot.previous, p_expected_rev + 1)
     where r.id = v_row.id
    returning r.sheet -> 'dans' -> (p_dan - 1) into v_saved;
    delete from public.bb_rubric_undo u where u.id = v_slot.id;

    perform set_config('tkd.action', '', true);
    perform set_config('tkd.batch_id', '', true);

    return jsonb_build_object('status', 'ok', 'rev', v_saved -> 'rev', 'saved_at', v_saved -> 'saved_at',
                              'saved_by_name', v_saved -> 'saved_by_name');
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

revoke execute on function public.bb_undo_default_dan(integer, integer) from public, anon, authenticated, service_role;
grant  execute on function public.bb_undo_default_dan(integer, integer) to authenticated;

-- 10c. bb_save_cycle_dan(p_cycle_id, p_dan, p_expected_rev, p_sheet)   A
-- A cycle's Rubric tab -> Edit [Dan] -> Save (R12). As 10a, on the cycle's
-- own copy, plus: once the cycle's registration has opened, the copy is
-- LOCKED -> {"status":"locked","first_opened_at":...} (checked before the
-- rev, so the right message wins). A Past cycle that never opened stays
-- editable (OI-9). The cycle's version does not change.
-- locks: the cycle (no key update)
-- Ok: as 10a
create or replace function public.bb_save_cycle_dan(
  p_cycle_id     uuid,
  p_dan          integer,
  p_expected_rev integer,
  p_sheet        jsonb
)
returns jsonb
language plpgsql
volatile
security definer
set search_path = ''
as $$
declare
  v_new      jsonb;
  v_problems jsonb;
  v_c        public.bb_cycles;
  v_old      jsonb;
  v_saved    jsonb;
begin
  begin
    if public.has_data_access() is not true then
      return jsonb_build_object('status', 'no_access');
    end if;
    if public.is_admin() is not true then
      return jsonb_build_object('status', 'not_allowed');
    end if;

    if p_cycle_id is null
       or p_dan is null or p_dan not between 1 and 4
       or p_expected_rev is null or p_expected_rev not between 1 and 1000000
       or jsonb_typeof(p_sheet) is distinct from 'object'
       or p_sheet -> 'dan' is distinct from to_jsonb(p_dan) then
      return jsonb_build_object('status', 'invalid');
    end if;
    v_new := (p_sheet - 'rev' - 'saved_at' - 'saved_by_name')
             || jsonb_build_object('rev', p_expected_rev + 1, 'saved_at', null, 'saved_by_name', null);
    v_problems := public.bb_rubric_dan_problems(v_new, p_dan);
    if v_problems <> '[]'::jsonb then
      return jsonb_build_object('status', 'invalid', 'problems', v_problems);
    end if;

    -- 4. the cycle ("no key update": requirements is not a key, and the
    --    family form's register call takes the same lock, so the two never
    --    interleave)
    select * into v_c from public.bb_cycles y where y.id = p_cycle_id for no key update;
    if not found then
      return jsonb_build_object('status', 'not_found');
    end if;
    -- 5. locked first, then the rev
    if v_c.first_opened_at is not null then
      return jsonb_build_object('status', 'locked', 'first_opened_at', v_c.first_opened_at);
    end if;
    v_old := v_c.requirements -> 'dans' -> (p_dan - 1);
    if v_old -> 'rev' is distinct from to_jsonb(p_expected_rev) then
      return jsonb_build_object('status', 'stale');
    end if;

    perform set_config('tkd.action', 'bb_save_cycle_dan', true);
    perform set_config('tkd.batch_id', gen_random_uuid()::text, true);

    if (v_new - 'rev' - 'saved_at' - 'saved_by_name') = (v_old - 'rev' - 'saved_at' - 'saved_by_name') then
      delete from public.bb_rubric_undo u
       where u.kind = 'cycle_dan' and u.cycle_id = p_cycle_id and u.dan = p_dan and u.saved_by = auth.uid();
      perform set_config('tkd.action', '', true);
      perform set_config('tkd.batch_id', '', true);
      return jsonb_build_object('status', 'ok', 'rev', v_old -> 'rev', 'saved_at', v_old -> 'saved_at',
                                'saved_by_name', v_old -> 'saved_by_name', 'changed', false,
                                'undo_available', false, 'previous_rev', null);
    end if;

    insert into public.bb_rubric_undo (kind, cycle_id, dan, previous, after_version, saved_by, saved_at)
    values ('cycle_dan', p_cycle_id, p_dan, v_old, p_expected_rev + 1, auth.uid(), now())
    on conflict (kind, cycle_id, dan) do update
      set previous = excluded.previous, after_version = excluded.after_version,
          saved_by = excluded.saved_by, saved_at = excluded.saved_at;
    update public.bb_cycles y
       set requirements = public.bb_rubric_put_dan(y.requirements, p_dan, v_new, p_expected_rev + 1)
     where y.id = p_cycle_id
    returning y.requirements -> 'dans' -> (p_dan - 1) into v_saved;

    perform set_config('tkd.action', '', true);
    perform set_config('tkd.batch_id', '', true);

    return jsonb_build_object('status', 'ok', 'rev', v_saved -> 'rev', 'saved_at', v_saved -> 'saved_at',
                              'saved_by_name', v_saved -> 'saved_by_name', 'changed', true,
                              'undo_available', true, 'previous_rev', p_expected_rev);
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

revoke execute on function public.bb_save_cycle_dan(uuid, integer, integer, jsonb) from public, anon, authenticated, service_role;
grant  execute on function public.bb_save_cycle_dan(uuid, integer, integer, jsonb) to authenticated;

-- 10d. bb_undo_cycle_dan(p_cycle_id, p_dan, p_expected_rev)   A
-- The toast's Undo after a Save of a cycle's copy: as 10b, plus "locked"
-- first (once registration opened, nothing changes the copy).
-- locks: the cycle (no key update)
-- Ok: as 10b
create or replace function public.bb_undo_cycle_dan(
  p_cycle_id     uuid,
  p_dan          integer,
  p_expected_rev integer
)
returns jsonb
language plpgsql
volatile
security definer
set search_path = ''
as $$
declare
  v_c     public.bb_cycles;
  v_slot  public.bb_rubric_undo;
  v_saved jsonb;
begin
  begin
    if public.has_data_access() is not true then
      return jsonb_build_object('status', 'no_access');
    end if;
    if public.is_admin() is not true then
      return jsonb_build_object('status', 'not_allowed');
    end if;

    if p_cycle_id is null
       or p_dan is null or p_dan not between 1 and 4
       or p_expected_rev is null or p_expected_rev not between 1 and 1000000 then
      return jsonb_build_object('status', 'invalid');
    end if;

    select * into v_c from public.bb_cycles y where y.id = p_cycle_id for no key update;
    if not found then
      return jsonb_build_object('status', 'not_found');
    end if;
    if v_c.first_opened_at is not null then
      return jsonb_build_object('status', 'locked', 'first_opened_at', v_c.first_opened_at);
    end if;

    select * into v_slot from public.bb_rubric_undo u
     where u.kind = 'cycle_dan' and u.cycle_id = p_cycle_id and u.dan = p_dan;
    if v_c.requirements -> 'dans' -> (p_dan - 1) -> 'rev' is distinct from to_jsonb(p_expected_rev)
       or v_slot.id is null
       or v_slot.after_version is distinct from p_expected_rev
       or v_slot.saved_by is distinct from auth.uid()
       or v_slot.saved_at < now() - interval '15 seconds' then
      return jsonb_build_object('status', 'stale');
    end if;

    perform set_config('tkd.action', 'bb_undo_cycle_dan', true);
    perform set_config('tkd.batch_id', gen_random_uuid()::text, true);

    update public.bb_cycles y
       set requirements = public.bb_rubric_put_dan(y.requirements, p_dan, v_slot.previous, p_expected_rev + 1)
     where y.id = p_cycle_id
    returning y.requirements -> 'dans' -> (p_dan - 1) into v_saved;
    delete from public.bb_rubric_undo u where u.id = v_slot.id;

    perform set_config('tkd.action', '', true);
    perform set_config('tkd.batch_id', '', true);

    return jsonb_build_object('status', 'ok', 'rev', v_saved -> 'rev', 'saved_at', v_saved -> 'saved_at',
                              'saved_by_name', v_saved -> 'saved_by_name');
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

revoke execute on function public.bb_undo_cycle_dan(uuid, integer, integer) from public, anon, authenticated, service_role;
grant  execute on function public.bb_undo_cycle_dan(uuid, integer, integer) to authenticated;

-- 10e. bb_undo_first_open(p_cycle_id, p_expected_version)   A
-- The toast's Undo right after an admin opened registration for the FIRST
-- time (v0.929): the cycle counts as never opened again (closed,
-- first_opened_at empty, auto close as it was), so its rubric is editable
-- again. Only by the admin who opened it, within 15 seconds, and only if
-- nothing changed since (the cycle's version is still the one the opening
-- made, the slot points at exactly it, and registration is still open)
-- -> else stale. If a family registered through the form since it opened
-- (a form candidate of this cycle, or the history row of one that was
-- removed again) -> has_registrations: a family has seen and signed against
-- this rubric, so the lock stays (OI-8).
-- The history lookup can't use an index (it filters by action and table,
-- not by record); accepted, because this rare Undo runs only within 15
-- seconds of an opening.
-- locks: cycle (update) -> its days in id order (update) -> its due dates in id order (update)
-- Ok: {"status":"ok","version":n,"state":{... 0016 10b ...}}
create or replace function public.bb_undo_first_open(
  p_cycle_id         uuid,
  p_expected_version integer
)
returns jsonb
language plpgsql
volatile
security definer
set search_path = ''
as $$
declare
  v_c       public.bb_cycles;
  v_slot    public.bb_rubric_undo;
  v_version integer;
begin
  begin
    if public.has_data_access() is not true then
      return jsonb_build_object('status', 'no_access');
    end if;
    if public.is_admin() is not true then
      return jsonb_build_object('status', 'not_allowed');
    end if;

    if p_cycle_id is null or p_expected_version is null then
      return jsonb_build_object('status', 'invalid');
    end if;

    -- 4. the same locks as bb_set_registration
    select * into v_c from public.bb_cycles y where y.id = p_cycle_id for update;
    if not found then
      return jsonb_build_object('status', 'not_found');
    end if;
    perform 1 from public.bb_cycle_days d where d.cycle_id = p_cycle_id order by d.id for update;
    perform 1 from public.bb_cycle_plan_payments pp
      join public.bb_cycle_plans pl on pl.id = pp.cycle_plan_id
     where pl.cycle_id = p_cycle_id
     order by pp.id
       for update of pp;

    -- 5. still exactly the state the first opening left?
    select * into v_slot from public.bb_rubric_undo u
     where u.kind = 'first_open' and u.cycle_id = p_cycle_id and u.dan is null;
    if v_c.version <> p_expected_version
       or v_slot.id is null
       or v_slot.after_version is distinct from v_c.version
       or v_slot.saved_by is distinct from auth.uid()
       or v_slot.saved_at < now() - interval '15 seconds'
       or v_c.registration_open is not true then
      return jsonb_build_object('status', 'stale');
    end if;

    -- 6. a family registered through the form since it opened? (no time
    --    filter: a family registering in the same instant has registered_at
    --    = its transaction's start, which can be earlier than the opening)
    if exists (select 1 from public.bb_candidates c where c.cycle_id = p_cycle_id and c.source = 'form')
       or exists (select 1 from public.change_log l
                   where l.action = 'bb_public_register' and l.table_name = 'bb_candidates' and l.op = 'insert'
                     and l.after ->> 'cycle_id' = p_cycle_id::text) then
      return jsonb_build_object('status', 'has_registrations');
    end if;

    perform set_config('tkd.action', 'bb_undo_first_open', true);
    perform set_config('tkd.batch_id', gen_random_uuid()::text, true);

    update public.bb_cycles y
       set registration_open = false,
           first_opened_at   = null,
           auto_close        = coalesce((v_slot.previous ->> 'auto_close')::boolean, y.auto_close)
     where y.id = p_cycle_id
    returning y.version into v_version;
    delete from public.bb_rubric_undo u where u.id = v_slot.id;

    perform set_config('tkd.action', '', true);
    perform set_config('tkd.batch_id', '', true);

    return jsonb_build_object('status', 'ok', 'version', v_version,
                              'state', public.bb_cycle_state(p_cycle_id, public.testing_today()));
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

revoke execute on function public.bb_undo_first_open(uuid, integer) from public, anon, authenticated, service_role;
grant  execute on function public.bb_undo_first_open(uuid, integer) to authenticated;


-- ---------------------------------------------------------------------
-- 11. The replaced 0016 functions (same names, arguments and rights)
-- ---------------------------------------------------------------------

-- 11a. bb_add_cycle(p_payload, p_source_cycle_id)   A
-- 0016's Add cycle (15c) exactly, except (contract 6.4):
--   * the new cycle's rubric is a fresh copy of the DEFAULT rubric
--     (bb_rubric_fresh_copy: source "Default rubric", every Dan at rev 1,
--     no stamps) - no longer the source cycle's or the starting point's
--     sheet. p_source_cycle_id is still checked (NULL, or an existing
--     cycle - else invalid) but no longer gives the sheet;
--   * the lock order gains the default rubric (share), after the link-code
--     lock and before the source cycle;
--   * a number too big / a bad conversion -> invalid (as every 0024 function).
-- It still saves every new cycle CLOSED (v0.933 needs no database change).
-- p_payload, the rules and the answers: exactly as 0016 15c:
--   {"name", "application_due", "submissions_due", "auto_close",
--    "days": [{"name", "day_date", "start_time", "end_time",
--              "place": {"code": "worcester"} | {"other": "Horgan Arena ..."},
--              "second": {"start", "end", "place"} | null,
--              "parts": ["physical", ...]}],          (1-20 days)
--    "plans": [{"name", "payments": [{"due_on", "follows_application_due"}],
--               "amounts": {"1": [cents per payment], "2": [...], "3": [...], "4": [...]}}],
--                                                       (1-10 plans, 1-12 payments each)
--    "kukkiwon": {"1": cents, "2": cents, "3": cents, "4": cents},
--    "prices_from": "Spring 2027" | "Fall 2026 starting point" | null}
-- A part on no day -> {"status":"part_without_day","parts":[...]}. A
-- cycle with that name -> duplicate_name. Last step: the purge (0016 13f).
-- locks: settings (share) -> link-code advisory lock -> bb_default_rubric (share) -> the source cycle (share)
-- Ok: {"status":"ok","id":...,"version":1,"public_code_worcester":...,"public_code_shrewsbury":...}
create or replace function public.bb_add_cycle(
  p_payload         jsonb,
  p_source_cycle_id uuid
)
returns jsonb
language plpgsql
volatile
security definer
set search_path = ''
as $$
declare
  v_today       date;
  v_name        text;
  v_app         date;
  v_sub         date;
  v_auto        boolean;
  v_prices_from text;
  v_day         jsonb;
  v_sec         jsonb;
  v_plan        jsonb;
  v_pay         jsonb;
  v_x           jsonb;
  v_date        date;
  v_st          time;
  v_en          time;
  v_last        date;
  v_parts       text[];
  v_all_parts   text[] := '{}';
  v_plan_names  text[] := '{}';
  v_missing     text[];
  v_n           integer;
  v_i           integer;
  v_j           integer;
  v_dan         integer;
  v_req         jsonb;
  v_code_w      text;
  v_code_s      text;
  v_id          uuid;
  v_day_id      uuid;
  v_plan_id     uuid;
  v_constraint  text;
begin
  begin
    if public.has_data_access() is not true then
      return jsonb_build_object('status', 'no_access');
    end if;
    if public.is_admin() is not true then
      return jsonb_build_object('status', 'not_allowed');
    end if;

    -- 3. the input, key by key
    v_today := public.testing_today();
    if jsonb_typeof(p_payload) is distinct from 'object'
       or exists (select 1 from jsonb_object_keys(p_payload) as k(key)
                   where k.key not in ('name', 'application_due', 'submissions_due', 'auto_close', 'days',
                                       'plans', 'kukkiwon', 'prices_from'))
       or jsonb_typeof(p_payload -> 'name') is distinct from 'string'
       or not public.testing_name_is_valid(p_payload ->> 'name')
       or jsonb_typeof(p_payload -> 'application_due') is distinct from 'string'
       or not pg_input_is_valid(p_payload ->> 'application_due', 'date')
       or jsonb_typeof(p_payload -> 'submissions_due') is distinct from 'string'
       or not pg_input_is_valid(p_payload ->> 'submissions_due', 'date')
       or jsonb_typeof(p_payload -> 'auto_close') is distinct from 'boolean'
       or (p_payload ? 'prices_from' and jsonb_typeof(p_payload -> 'prices_from') <> 'null'
           and (jsonb_typeof(p_payload -> 'prices_from') <> 'string'
                or not public.testing_name_is_valid(p_payload ->> 'prices_from')))
       or jsonb_typeof(p_payload -> 'days') is distinct from 'array'
       or jsonb_array_length(p_payload -> 'days') not between 1 and 20
       or jsonb_typeof(p_payload -> 'plans') is distinct from 'array'
       or jsonb_array_length(p_payload -> 'plans') not between 1 and 10
       or jsonb_typeof(p_payload -> 'kukkiwon') is distinct from 'object' then
      return jsonb_build_object('status', 'invalid');
    end if;
    v_name := public.testing_normalize_name(p_payload ->> 'name');
    v_app  := (p_payload ->> 'application_due')::date;
    v_sub  := (p_payload ->> 'submissions_due')::date;
    v_auto := (p_payload ->> 'auto_close')::boolean;
    v_prices_from := public.testing_normalize_name(p_payload ->> 'prices_from');

    -- the days
    for v_day in select d.value from jsonb_array_elements(p_payload -> 'days') as d(value) loop
      if jsonb_typeof(v_day) <> 'object'
         or exists (select 1 from jsonb_object_keys(v_day) as k(key)
                     where k.key not in ('id', 'name', 'day_date', 'start_time', 'end_time', 'place', 'second', 'parts'))
         or (v_day ? 'id' and jsonb_typeof(v_day -> 'id') <> 'null')
         or jsonb_typeof(v_day -> 'name') is distinct from 'string'
         or not public.testing_name_is_valid(v_day ->> 'name')
         or jsonb_typeof(v_day -> 'day_date') is distinct from 'string'
         or not pg_input_is_valid(v_day ->> 'day_date', 'date')
         or jsonb_typeof(v_day -> 'start_time') is distinct from 'string'
         or not pg_input_is_valid(v_day ->> 'start_time', 'time')
         or jsonb_typeof(v_day -> 'end_time') is distinct from 'string'
         or not pg_input_is_valid(v_day ->> 'end_time', 'time') then
        return jsonb_build_object('status', 'invalid');
      end if;
      v_date := (v_day ->> 'day_date')::date;
      v_st   := (v_day ->> 'start_time')::time;
      v_en   := (v_day ->> 'end_time')::time;
      if v_date < v_today
         or not public.bb_time_is_valid(v_st) or not public.bb_time_is_valid(v_en) or v_en <= v_st then
        return jsonb_build_object('status', 'invalid');
      end if;
      -- exactly one place: a school, or other text up to 100 characters
      v_x := v_day -> 'place';
      if not coalesce(jsonb_typeof(v_x) = 'object'
                      and (select count(*) from jsonb_object_keys(v_x)) = 1
                      and ((jsonb_typeof(v_x -> 'code') = 'string'
                            and exists (select 1 from public.locations l where l.code = v_x ->> 'code'))
                           or (jsonb_typeof(v_x -> 'other') = 'string'
                               and public.testing_note_is_valid(v_x ->> 'other')
                               and char_length(public.testing_normalize_note(v_x ->> 'other')) <= 100)), false) then
        return jsonb_build_object('status', 'invalid');
      end if;
      -- the optional second part
      v_sec := v_day -> 'second';
      if v_sec is not null and jsonb_typeof(v_sec) <> 'null' then
        if jsonb_typeof(v_sec) <> 'object'
           or exists (select 1 from jsonb_object_keys(v_sec) as k(key) where k.key not in ('start', 'end', 'place'))
           or jsonb_typeof(v_sec -> 'start') is distinct from 'string'
           or not pg_input_is_valid(v_sec ->> 'start', 'time')
           or jsonb_typeof(v_sec -> 'end') is distinct from 'string'
           or not pg_input_is_valid(v_sec ->> 'end', 'time') then
          return jsonb_build_object('status', 'invalid');
        end if;
        if not public.bb_time_is_valid((v_sec ->> 'start')::time) or not public.bb_time_is_valid((v_sec ->> 'end')::time)
           or (v_sec ->> 'end')::time <= (v_sec ->> 'start')::time or (v_sec ->> 'start')::time < v_en then
          return jsonb_build_object('status', 'invalid');
        end if;
        v_x := v_sec -> 'place';
        if not coalesce(jsonb_typeof(v_x) = 'object'
                        and (select count(*) from jsonb_object_keys(v_x)) = 1
                        and ((jsonb_typeof(v_x -> 'code') = 'string'
                              and exists (select 1 from public.locations l where l.code = v_x ->> 'code'))
                             or (jsonb_typeof(v_x -> 'other') = 'string'
                                 and public.testing_note_is_valid(v_x ->> 'other')
                                 and char_length(public.testing_normalize_note(v_x ->> 'other')) <= 100)), false) then
          return jsonb_build_object('status', 'invalid');
        end if;
      end if;
      -- the parts graded that day: 1-3 of the three codes, no repeats
      if jsonb_typeof(v_day -> 'parts') is distinct from 'array'
         or jsonb_array_length(v_day -> 'parts') not between 1 and 3
         or exists (select 1 from jsonb_array_elements(v_day -> 'parts') as p(value)
                     where jsonb_typeof(p.value) <> 'string'
                        or p.value #>> '{}' not in ('physical', 'technical', 'curriculum'))
         or (select count(distinct p.value) from jsonb_array_elements(v_day -> 'parts') as p(value))
            <> jsonb_array_length(v_day -> 'parts') then
        return jsonb_build_object('status', 'invalid');
      end if;
      v_parts := array(select p.value from jsonb_array_elements_text(v_day -> 'parts') as p(value));
      v_all_parts := v_all_parts || v_parts;
      v_last := greatest(v_last, v_date);
    end loop;

    -- both deadlines on or before the last testing day
    if v_app > v_last or v_sub > v_last then
      return jsonb_build_object('status', 'invalid');
    end if;

    -- the plans
    for v_plan in select p.value from jsonb_array_elements(p_payload -> 'plans') as p(value) loop
      if jsonb_typeof(v_plan) <> 'object'
         or exists (select 1 from jsonb_object_keys(v_plan) as k(key) where k.key not in ('name', 'payments', 'amounts'))
         or jsonb_typeof(v_plan -> 'name') is distinct from 'string'
         or not public.testing_name_is_valid(v_plan ->> 'name')
         or lower(public.testing_normalize_name(v_plan ->> 'name')) = any (v_plan_names)
         or jsonb_typeof(v_plan -> 'payments') is distinct from 'array'
         or jsonb_array_length(v_plan -> 'payments') not between 1 and 12
         or jsonb_typeof(v_plan -> 'amounts') is distinct from 'object'
         or (select count(*) from jsonb_object_keys(v_plan -> 'amounts')) <> 4
         or exists (select 1 from jsonb_object_keys(v_plan -> 'amounts') as k(key) where k.key not in ('1', '2', '3', '4')) then
        return jsonb_build_object('status', 'invalid');
      end if;
      v_plan_names := v_plan_names || lower(public.testing_normalize_name(v_plan ->> 'name'));
      v_n := jsonb_array_length(v_plan -> 'payments');
      v_i := 0;
      for v_pay in select x.value from jsonb_array_elements(v_plan -> 'payments') as x(value) loop
        v_i := v_i + 1;
        if jsonb_typeof(v_pay) <> 'object'
           or exists (select 1 from jsonb_object_keys(v_pay) as k(key) where k.key not in ('due_on', 'follows_application_due'))
           or jsonb_typeof(v_pay -> 'due_on') is distinct from 'string'
           or not pg_input_is_valid(v_pay ->> 'due_on', 'date')
           or jsonb_typeof(v_pay -> 'follows_application_due') is distinct from 'boolean' then
          return jsonb_build_object('status', 'invalid');
        end if;
        if (v_pay ->> 'due_on')::date < v_today
           or ((v_pay ->> 'follows_application_due')::boolean
               and (v_i <> 1 or (v_pay ->> 'due_on')::date <> v_app)) then
          return jsonb_build_object('status', 'invalid');
        end if;
      end loop;
      -- one amount per payment for each Dan, whole dollars $1-$5,000
      for v_dan in 1 .. 4 loop
        v_x := v_plan -> 'amounts' -> v_dan::text;
        if jsonb_typeof(v_x) is distinct from 'array' or jsonb_array_length(v_x) <> v_n
           or exists (select 1 from jsonb_array_elements(v_x) as a(value)
                       where not (case when jsonb_typeof(a.value) = 'number'
                                       then (a.value)::numeric between 100 and 500000 and mod((a.value)::numeric, 100) = 0
                                       else false end)) then
          return jsonb_build_object('status', 'invalid');
        end if;
      end loop;
    end loop;

    -- the Kukkiwon fees: one per Dan, whole dollars $1-$5,000
    if (select count(*) from jsonb_object_keys(p_payload -> 'kukkiwon')) <> 4
       or exists (select 1 from jsonb_each(p_payload -> 'kukkiwon') as f(key, value)
                   where f.key not in ('1', '2', '3', '4')
                      or not (case when jsonb_typeof(f.value) = 'number'
                                   then (f.value)::numeric between 100 and 500000 and mod((f.value)::numeric, 100) = 0
                                   else false end)) then
      return jsonb_build_object('status', 'invalid');
    end if;

    -- 4. locks: the template lock (share), then the link-code lock (a
    --    transaction-long lock on a fixed number, so two Add cycle calls
    --    draw codes one after the other), then the DEFAULT RUBRIC (share:
    --    a Save of the default waits until this cycle has its copy), then
    --    the source cycle (share; still checked, no longer copied)
    perform 1 from public.bb_settings s for share;
    perform pg_advisory_xact_lock(hashtext('bb_public_code'));
    select dr.sheet into v_req from public.bb_default_rubric dr for share;
    if not found then
      return jsonb_build_object('status', 'invalid');
    end if;
    v_req := public.bb_rubric_fresh_copy(v_req);
    if p_source_cycle_id is not null then
      perform 1 from public.bb_cycles y where y.id = p_source_cycle_id for share;
      if not found then
        return jsonb_build_object('status', 'invalid');
      end if;
    end if;

    -- 6. every part on at least one day
    v_missing := array(select x.part from unnest(array['physical', 'technical', 'curriculum']) with ordinality as x(part, n)
                        where not (x.part = any (v_all_parts)) order by x.n);
    if cardinality(v_missing) > 0 then
      return jsonb_build_object('status', 'part_without_day', 'parts', to_jsonb(v_missing));
    end if;

    -- 7. the name
    if exists (select 1 from public.bb_cycles y where lower(public.testing_normalize_name(y.name)) = lower(v_name)) then
      return jsonb_build_object('status', 'duplicate_name');
    end if;

    -- 8. write
    perform set_config('tkd.action', 'bb_add_cycle', true);
    perform set_config('tkd.batch_id', gen_random_uuid()::text, true);

    loop
      v_code_w := public.testing_new_public_code();
      v_code_s := public.testing_new_public_code();
      exit when v_code_w <> v_code_s
            and not exists (select 1 from public.bb_cycles y
                             where y.public_code_worcester in (v_code_w, v_code_s)
                                or y.public_code_shrewsbury in (v_code_w, v_code_s));
    end loop;

    insert into public.bb_cycles
      (name, application_due, submissions_due, auto_close, registration_open, first_opened_at,
       public_code_worcester, public_code_shrewsbury, requirements, prices_from, created_by_name, updated_by_name)
    values
      (v_name, v_app, v_sub, v_auto, false, null, v_code_w, v_code_s, v_req, v_prices_from, '', '')
    returning id into v_id;

    -- the days, in the order given, each with its parts
    for v_day in select d.value from jsonb_array_elements(p_payload -> 'days') as d(value) loop
      v_sec := case when jsonb_typeof(v_day -> 'second') = 'object' then v_day -> 'second' end;
      insert into public.bb_cycle_days
        (cycle_id, name, day_date, start_time, end_time, place_code, place_other,
         second_start, second_end, second_place_code, second_place_other, created_by_name, updated_by_name)
      values
        (v_id, public.testing_normalize_name(v_day ->> 'name'), (v_day ->> 'day_date')::date,
         (v_day ->> 'start_time')::time, (v_day ->> 'end_time')::time,
         v_day -> 'place' ->> 'code', public.testing_normalize_note(v_day -> 'place' ->> 'other'),
         (v_sec ->> 'start')::time, (v_sec ->> 'end')::time,
         v_sec -> 'place' ->> 'code', public.testing_normalize_note(v_sec -> 'place' ->> 'other'), '', '')
      returning id into v_day_id;
      insert into public.bb_cycle_day_parts (day_id, part, created_by_name)
      select v_day_id, p.value, ''
        from jsonb_array_elements_text(v_day -> 'parts') with ordinality as p(value, n)
       order by p.n;
    end loop;

    -- the plans (position = the order given), their due dates and amounts
    for v_plan, v_i in select p.value, (p.n - 1)::integer
                         from jsonb_array_elements(p_payload -> 'plans') with ordinality as p(value, n) loop
      insert into public.bb_cycle_plans (cycle_id, name, payments_count, position, created_by_name)
      values (v_id, public.testing_normalize_name(v_plan ->> 'name'), jsonb_array_length(v_plan -> 'payments'), v_i, '')
      returning id into v_plan_id;
      insert into public.bb_cycle_plan_payments (cycle_plan_id, payment_no, due_on, follows_application_due,
                                                 created_by_name, updated_by_name)
      select v_plan_id, x.n, (x.value ->> 'due_on')::date, (x.value ->> 'follows_application_due')::boolean, '', ''
        from jsonb_array_elements(v_plan -> 'payments') with ordinality as x(value, n)
       order by x.n;
      for v_dan in 1 .. 4 loop
        insert into public.bb_cycle_plan_amounts (cycle_plan_id, dan, payment_no, amount_cents)
        select v_plan_id, v_dan, a.n, ((a.value)::numeric)::integer
          from jsonb_array_elements(v_plan -> 'amounts' -> v_dan::text) with ordinality as a(value, n)
         order by a.n;
      end loop;
    end loop;

    insert into public.bb_cycle_kukkiwon_fees (cycle_id, dan, amount_cents)
    select v_id, f.key::smallint, ((f.value)::numeric)::integer
      from jsonb_each(p_payload -> 'kukkiwon') as f(key, value)
     order by f.key;

    perform set_config('tkd.action', '', true);
    perform set_config('tkd.batch_id', '', true);

    perform public.bb_purge_due();

    return jsonb_build_object('status', 'ok', 'id', v_id, 'version', 1,
                              'public_code_worcester', v_code_w, 'public_code_shrewsbury', v_code_s);
  exception
    when unique_violation then
      get stacked diagnostics v_constraint = constraint_name;
      if v_constraint = 'bb_cycles_lower_name_idx' then
        return jsonb_build_object('status', 'duplicate_name');
      end if;
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

revoke execute on function public.bb_add_cycle(jsonb, uuid) from public, anon, authenticated, service_role;
grant  execute on function public.bb_add_cycle(jsonb, uuid) to authenticated;

-- 11b. bb_set_registration(p_cycle_id, p_expected_version, p_open)   S / A
-- 0016's Open / Closed switch (15e) exactly, with these changes (contract
-- 6.3, v0.929, v0.930):
--   * the FIRST opening (first_opened_at still empty) is admins only - it
--     locks the cycle's rubric; staff -> not_allowed (checked after
--     "finished", before 0016's waiver_needed and after-Application-due
--     rules, which are unchanged)
--   * the first opening keeps an undo slot (what it changed), so the
--     toast's Undo can call bb_undo_first_open within 15 seconds; any
--     other write (a close, a later reopen) removes that slot
--   * the answer gains "first_open" (true only for a first opening)
--   * a number too big / a bad conversion -> invalid
-- Staff may still close, and reopen once an admin opened it, as in 0016.
--   close: staff and admins, any time before the cycle is Past
--   open, Application due not passed (or auto close off): staff and
--     admins once it has been opened before; the first opening: admins
--   open AFTER Application due with auto close on: admins only, and auto
--     close is turned off; staff -> not_allowed
--   once Past nothing changes the switch -> finished
--   opening while the current waiver is the seeded PLACEHOLDER ->
--     waiver_needed
-- Switching to what it already is writes nothing.
-- locks: cycle (update) -> its days in id order (update) -> its due dates in id order (update)
-- Ok: {"status":"ok","version":n,"state":{...0016 10b...},"first_open":true|false}
create or replace function public.bb_set_registration(
  p_cycle_id         uuid,
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
  v_today      date;
  v_c          public.bb_cycles;
  v_state      jsonb;
  v_clear      boolean := false;
  v_first      boolean := false;
  v_rows       integer;
  v_version    integer;
  v_constraint text;
begin
  begin
    if public.has_data_access() is not true then
      return jsonb_build_object('status', 'no_access');
    end if;
    -- 2. role: any staff member with data access (the admin-only cases are below)

    if p_cycle_id is null or p_expected_version is null or p_open is null then
      return jsonb_build_object('status', 'invalid');
    end if;

    select * into v_c from public.bb_cycles y where y.id = p_cycle_id for update;
    if not found then
      return jsonb_build_object('status', 'not_found');
    end if;
    perform 1 from public.bb_cycle_days d where d.cycle_id = p_cycle_id order by d.id for update;
    perform 1 from public.bb_cycle_plan_payments pp
      join public.bb_cycle_plans pl on pl.id = pp.cycle_plan_id
     where pl.cycle_id = p_cycle_id
     order by pp.id
       for update of pp;
    if v_c.version <> p_expected_version then
      return jsonb_build_object('status', 'stale');
    end if;

    v_today := public.testing_today();
    v_state := public.bb_cycle_state(p_cycle_id, v_today);
    if (v_state ->> 'past')::boolean then
      return jsonb_build_object('status', 'finished');
    end if;
    -- 6. the first opening locks the rubric: admins only (v0.930)
    v_first := p_open and v_c.first_opened_at is null;
    if v_first and public.is_admin() is not true then
      return jsonb_build_object('status', 'not_allowed');
    end if;
    if p_open and exists (select 1 from public.bb_waiver_versions v where v.superseded_at is null and v.is_placeholder) then
      return jsonb_build_object('status', 'waiver_needed');
    end if;
    if p_open and v_c.auto_close and v_today > v_c.application_due then
      if public.is_admin() is not true then
        return jsonb_build_object('status', 'not_allowed');
      end if;
      v_clear := true;
    end if;

    perform set_config('tkd.action', 'bb_set_registration', true);
    perform set_config('tkd.batch_id', gen_random_uuid()::text, true);

    update public.bb_cycles y
       set registration_open = p_open,
           first_opened_at   = case when p_open then coalesce(y.first_opened_at, now()) else y.first_opened_at end,
           auto_close        = case when v_clear then false else y.auto_close end
     where y.id = p_cycle_id
       and (y.registration_open is distinct from p_open or v_clear)
    returning y.version into v_version;
    get diagnostics v_rows = row_count;

    if v_rows = 1 and v_first then
      -- the first opening: keep what it changed, for the toast's Undo
      insert into public.bb_rubric_undo (kind, cycle_id, dan, previous, after_version, saved_by, saved_at)
      values ('first_open', p_cycle_id, null,
              jsonb_build_object('registration_open', false, 'first_opened_at', null, 'auto_close', v_c.auto_close),
              v_version, auth.uid(), now())
      on conflict (kind, cycle_id, dan) do update
        set previous = excluded.previous, after_version = excluded.after_version,
            saved_by = excluded.saved_by, saved_at = excluded.saved_at;
    elsif v_rows = 1 then
      -- any other write: the first opening can no longer be undone
      delete from public.bb_rubric_undo u where u.kind = 'first_open' and u.cycle_id = p_cycle_id;
    end if;

    perform set_config('tkd.action', '', true);
    perform set_config('tkd.batch_id', '', true);

    select * into v_c from public.bb_cycles y where y.id = p_cycle_id;
    return jsonb_build_object('status', 'ok', 'version', v_c.version,
                              'state', public.bb_cycle_state(p_cycle_id, v_today),
                              'first_open', (v_rows = 1 and v_first));
  exception
    when unique_violation then
      get stacked diagnostics v_constraint = constraint_name;
      if v_constraint = 'bb_cycles_lower_name_idx' then
        return jsonb_build_object('status', 'duplicate_name');
      end if;
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

revoke execute on function public.bb_set_registration(uuid, integer, boolean) from public, anon, authenticated, service_role;
grant  execute on function public.bb_set_registration(uuid, integer, boolean) to authenticated;


-- ---------------------------------------------------------------------
-- 12. The public function (role bb_registrar ONLY)
-- ---------------------------------------------------------------------

-- 12a. bb_public_cycle(p_code) - 0016's (17a) exactly, except
-- cycle.requirements (contract 7):
--   * it is the PUBLIC VIEW of the cycle's rubric (bb_rubric_public, 4c:
--     an allow-list - no revs, no "saved by" names, no source, no future
--     key);
--   * it is null while the cycle has NEVER opened (first_opened_at empty),
--     whatever the form's status says: a never-opened cycle's rubric is
--     still a draft (a Past, never-opened cycle is "finished" but its copy
--     is still editable, OI-9). The form shows its "not open" / "finished"
--     page then anyway.
-- The code is one of the cycle's two links; the column it matched sets the
-- school. An unknown or badly formed code - or one that matches more than
-- one cycle - -> {"status":"not_found"}.
-- Ok: {"status":"ok","state":"open"|"not_open"|"closed"|"finished",
--      "closed_on":date|null,"school":{code, name, address|null},
--      "cycle":{name, application_due, submissions_due,
--               days:[{name, day_date, start_time "HH:MM", end_time,
--                      place:{name, address|null},
--                      second:{start_time, end_time, place}|null, parts}],
--               plans:[{id, name, position, payments:[{payment_no, due_on}],
--                       amounts:{"1":[...], ...}}],
--               kukkiwon:{"1":c, ...}, requirements: public view | null},
--      "waiver":{version_name, body}}   (the current version)
-- locks: none (a read)
create or replace function public.bb_public_cycle(p_code text)
returns jsonb
language plpgsql
stable
security definer
set search_path = ''
as $$
declare
  v_c      public.bb_cycles;
  v_n      integer;
  v_school text;
  v_state  jsonb;
begin
  if p_code is null or p_code !~ '^[a-hjkmnp-z2-9]{8}$' then
    return jsonb_build_object('status', 'not_found');
  end if;
  select count(*) into v_n from public.bb_cycles y
   where y.public_code_worcester = p_code or y.public_code_shrewsbury = p_code;
  if v_n <> 1 then
    return jsonb_build_object('status', 'not_found');
  end if;
  select * into v_c from public.bb_cycles y
   where y.public_code_worcester = p_code or y.public_code_shrewsbury = p_code;
  v_school := case when v_c.public_code_worcester = p_code then 'worcester' else 'shrewsbury' end;
  v_state := public.bb_cycle_state(v_c.id, public.testing_today());

  return jsonb_build_object(
    'status',    'ok',
    'state',     v_state ->> 'public_status',
    'closed_on', v_state -> 'closed_on',
    'school',    (select jsonb_build_object('code', l.code, 'name', l.name,
                                            'address', public.testing_location_address(l.code))
                    from public.locations l where l.code = v_school),
    'cycle', jsonb_build_object(
      'name',            v_c.name,
      'application_due', v_c.application_due,
      'submissions_due', v_c.submissions_due,
      'days', coalesce((
        select jsonb_agg(jsonb_build_object(
                 'name',       d.name,
                 'day_date',   d.day_date,
                 'start_time', left(d.start_time::text, 5),
                 'end_time',   left(d.end_time::text, 5),
                 'place',      case when d.place_code is not null
                                    then jsonb_build_object('name', (select l.name from public.locations l where l.code = d.place_code),
                                                            'address', public.testing_location_address(d.place_code))
                                    else jsonb_build_object('name', d.place_other, 'address', null) end,
                 'second',     case when d.second_start is null then null
                                    else jsonb_build_object(
                                           'start_time', left(d.second_start::text, 5),
                                           'end_time',   left(d.second_end::text, 5),
                                           'place', case when d.second_place_code is not null
                                                         then jsonb_build_object('name', (select l.name from public.locations l
                                                                                           where l.code = d.second_place_code),
                                                                                 'address', public.testing_location_address(d.second_place_code))
                                                         else jsonb_build_object('name', d.second_place_other, 'address', null) end) end,
                 'parts',      coalesce((select jsonb_agg(p.part order by array_position(array['physical', 'technical', 'curriculum'], p.part))
                                           from public.bb_cycle_day_parts p where p.day_id = d.id), '[]'::jsonb))
               order by d.day_date, d.start_time, d.id)
          from public.bb_cycle_days d where d.cycle_id = v_c.id), '[]'::jsonb),
      'plans', coalesce((
        select jsonb_agg(jsonb_build_object(
                 'id',       pl.id,
                 'name',     pl.name,
                 'position', pl.position,
                 'payments', coalesce((select jsonb_agg(jsonb_build_object('payment_no', pp.payment_no, 'due_on', pp.due_on)
                                                        order by pp.payment_no)
                                         from public.bb_cycle_plan_payments pp where pp.cycle_plan_id = pl.id), '[]'::jsonb),
                 'amounts',  (select jsonb_object_agg(g.dan::text,
                                                      coalesce((select jsonb_agg(a.amount_cents order by a.payment_no)
                                                                  from public.bb_cycle_plan_amounts a
                                                                 where a.cycle_plan_id = pl.id and a.dan = g.dan), '[]'::jsonb))
                                from generate_series(1, 4) as g(dan)))
               order by pl.position)
          from public.bb_cycle_plans pl where pl.cycle_id = v_c.id), '[]'::jsonb),
      'kukkiwon', coalesce((select jsonb_object_agg(f.dan::text, f.amount_cents)
                              from public.bb_cycle_kukkiwon_fees f where f.cycle_id = v_c.id), '{}'::jsonb),
      'requirements', case when v_c.first_opened_at is null then null
                           else public.bb_rubric_public(v_c.requirements) end),
    'waiver', (select jsonb_build_object('version_name', v.version_name, 'body', v.body)
                 from public.bb_waiver_versions v where v.superseded_at is null));
end;
$$;

revoke execute on function public.bb_public_cycle(text) from public, anon, authenticated, service_role;
grant  execute on function public.bb_public_cycle(text) to bb_registrar;

commit;
