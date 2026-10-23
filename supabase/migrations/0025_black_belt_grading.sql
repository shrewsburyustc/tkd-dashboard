-- =====================================================================
-- 0025_black_belt_grading.sql
-- ---------------------------------------------------------------------
-- WHAT THIS FILE IS
--   The database migration for Black Belt GRADING AND RESULTS (rulebook
--   v0.938-v0.958). Build contract: docs/Dashboard Docs/Build contracts/
--   CONTRACT-0025.md (approved at CP0, rulebook v0.958). It runs after
--   every live migration (0001-0024) and builds on 0016 (Black Belt
--   testing) and 0024 (the rubric editor).
--
-- WHY IT EXISTS
--   Until now a Black Belt cycle had candidates, payments and its own
--   rubric, but nowhere to put the grades. This file adds:
--     * the grades (a letter, or a measured number and the way it was
--       done), the extra-points counts and the subjects chosen for a
--       make-up, one row each;
--     * make-up candidates: a candidate whose earlier result was a
--       Make-up is added to a later cycle with the grades that are kept
--       (grayed "kept") and the subjects that are tested again (v0.941);
--     * the RESULT, worked out every time by ONE pure function
--       (bb_grade_result, section 1) - never stored, never overridden
--       (v0.938). The app has an exact twin (src/lib/blackBelt/
--       grading.js); both are checked against the same test cases
--       (supabase/tests/0025_grading_cases.json);
--     * the three result email texts admins can edit, "Mark as sent",
--       and the admin-only results CSV with its download log;
--     * the rules that protect grades: a cycle's rubric is locked for good
--       once grading started (Q-G1), a past day or part with grades can't
--       be removed (S2), a candidate or cycle with grades can't be deleted
--       (Q-G3), a Dan change asks before clearing grades (Q-G4), and the
--       age is kept when the purge removes a date of birth (Q-G2).
--
-- WHAT IT ADDS (contract section 0)
--   * 7 tables: bb_grades, bb_extra_counts, bb_makeup_subjects,
--     bb_result_texts, bb_result_sends, bb_downloads,
--     bb_cycle_grading_started
--   * 3 new columns on bb_candidates (makeup_of_candidate_id,
--     makeup_of_cycle_name, age_kept) and its changed rules (section 2)
--   * 9 staff write functions and 6 staff read functions
--   * 15 REPLACED 0016 / 0024 functions and trigger functions (section 9,
--     each marked "-- 0025: replaced" as its first comment) and the
--     replaced trigger bb_candidates_before_write
--   * internal helpers and trigger functions nobody can call
--
-- HOW TO RUN IT
--   Supabase dashboard -> SQL Editor -> New query -> paste this WHOLE file
--   -> Run (supabase/SETUP.md "Migration 0025", step 0025b). It starts with
--   "begin;" and ends with "commit;": one transaction, so if any statement
--   fails nothing is kept.
--   Supabase will warn about DESTRUCTIVE OPERATIONS. That is expected: the
--   words delete and drop appear in rules ("on delete cascade", "on delete
--   set null"), inside functions that run later (Clear removes a grade
--   row), in "drop ... if exists" lines that make re-running safe, and in
--   "alter column ... drop not null". Nothing is removed now. Confirm.
--   Safe to run again: "create table if not exists", "add column if not
--   exists", "create or replace function", triggers and rules replaced
--   with "drop ... if exists" + create, and a seed that never overwrites.
--
-- WARNING - NEVER RE-RUN 0016 OR 0024 AFTER THIS FILE
--   Re-running 0016_black_belt.sql or 0024_black_belt_rubric.sql after
--   0025 silently puts back THEIR versions of the functions listed in
--   section 9 (and 0016 its bb_candidates_before_write trigger). 0016's
--   "create table if not exists" skips the tables, but its functions come
--   back - e.g. its purge, which doesn't keep the age. The 0025-only
--   trigger bb_candidates_keep_age then makes that purge FAIL loudly
--   instead of losing the age, and 0025_fingerprints.sql's "check | rerun"
--   row says "0016 OR 0024 RE-RUN OVER 0025". After 0025, 0016 and 0024
--   are only re-run as part of SETUP step 0025g (Undo 0025), and even
--   that script puts the old functions back from its own copies.
--
-- NO DYNAMIC SQL
--   No function here builds SQL text and runs it (no "execute", no
--   format() building SQL). 0025_tests.sql checks every function's code.
--
-- WORDS USED BELOW
--   * "copy": a cycle's own rubric, bb_cycles.requirements (0024's
--     schema version 2). "Dan object": one entry of copy.dans.
--   * "subject id": the 8-character id of a subject inside one Dan.
--   * "grading rows": rows in bb_grades, bb_extra_counts or
--     bb_makeup_subjects (any kind, kept ones included).
--   * "real grades": grading rows that are NOT kept and NOT retest - a
--     typed grade, number or count, or a chosen make-up subject.
--   * "kept": a grade or count copied into a make-up row from the earlier
--     cycle; never editable there.
--   * "make-up row": a bb_candidates row with source = 'makeup'.
--   * "pure function": same answer for the same inputs, reads no table
--     ("immutable"), so it can be tested on its own and has a JS twin.
--   * "guard trigger": a database rule that runs before a write and can
--     refuse it (errcode 23514 = check_violation, with a named constraint,
--     so the functions answer a status instead of an error).
--   * "hand fix": Jeffrey's own SQL Editor session - session_user is
--     'postgres' and no action tag is set (every function sets one).
--   * "cascade": a removal started by a parent row's "on delete cascade";
--     inside it pg_trigger_depth() > 1 (the action tag is then
--     bb_delete_candidate or bb_delete_cycle).
--   * "lock order": bb_settings -> bb_default_rubric -> cycle ->
--     candidate(s) -> grading row / payment / send row -> result text row
--     (contract 1.3). Every function says its own order ("locks: ...").
--   * the statuses: 0016's and 0024's, plus kept, already_added,
--     choice_needed, not_finished, no_email and has_grades (contract 1.2).
-- =====================================================================

begin;


-- ---------------------------------------------------------------------
-- 0. Guard: refuse to run unless 0016 and 0024 (and what they need) exist
-- WHY: this file replaces 0016 / 0024 functions and builds on their
-- tables. If something is missing, stop with a clear message before
-- anything changes (the transaction keeps nothing).
-- ---------------------------------------------------------------------
do $$
begin
  if to_regclass('public.change_log') is null
     or to_regprocedure('public.change_log_write()') is null
     or to_regprocedure('public.testing_refuse_truncate()') is null
     or to_regprocedure('public.testing_today()') is null then
    raise exception '0025: the history and school dates (0003 / 0005) are missing - apply them first. Nothing was changed.';
  end if;
  if to_regclass('public.bb_candidates') is null
     or to_regprocedure('public.bb_before_write()') is null
     or to_regprocedure('public.bb_lock_candidate(uuid)') is null then
    raise exception '0025: Black Belt testing (0016) is missing - apply 0016 first. Nothing was changed.';
  end if;
  if to_regclass('public.bb_default_rubric') is null
     or to_regprocedure('public.bb_rubric_most_points(jsonb, integer, integer)') is null
     or to_regprocedure('public.bb_rubric_public(jsonb)') is null then
    raise exception '0025: the Black Belt rubric editor (0024) is missing - apply 0024 first. Nothing was changed.';
  end if;
end
$$;


-- ---------------------------------------------------------------------
-- 1. The RESULT, worked out in one place (contract section 4). Every
--    function in this section is PURE: it reads no table, so the same
--    inputs always give the same answer. The app's twin
--    (src/lib/blackBelt/grading.js) is checked against the same cases
--    (supabase/tests/0025_grading_cases.json, PGlite step0025 f).
--    Numbers are "numeric" (exact decimals): no sum is ever rounded.
--    Nobody in the app can call these; the read functions use them.
-- ---------------------------------------------------------------------

-- 1a. bb_age_groups(dan) - the age groups the screens show instead of an
-- age (S9, G 2). Every "to" age of every age range in the Dan (the pass
-- marks, every way's cut-off ranges, every "limited to") is an edge; the
-- groups are: up to the first edge, then from each edge + 1 to the next,
-- then the last edge + 1 and over. 1st Dan (default): 8 and under, 9,
-- 10-12, 13-17, 18 and over. A Dan with no edges -> one group, all ages.
create or replace function public.bb_age_groups(p_dan jsonb)
returns jsonb
language sql
immutable
set search_path = ''
as $$
  with lists as (
    -- the pass-mark ranges
    select b.e
      from jsonb_array_elements(case when jsonb_typeof(p_dan -> 'pass' -> 'brackets') = 'array'
                                     then p_dan -> 'pass' -> 'brackets' else '[]'::jsonb end) as b(e)
    union all
    -- every way's cut-off ranges of every measured subject
    select wb.e
      from jsonb_array_elements(case when jsonb_typeof(p_dan -> 'parts') = 'array' then p_dan -> 'parts' else '[]'::jsonb end) as p(e)
      cross join lateral jsonb_array_elements(case when jsonb_typeof(p.e -> 'subjects') = 'array' then p.e -> 'subjects' else '[]'::jsonb end) as s(e)
      cross join lateral jsonb_array_elements(case when s.e ->> 'scoring' = 'measured' and jsonb_typeof(s.e -> 'ways') = 'array'
                                                   then s.e -> 'ways' else '[]'::jsonb end) as w(e)
      cross join lateral jsonb_array_elements(case when jsonb_typeof(w.e -> 'brackets') = 'array' then w.e -> 'brackets' else '[]'::jsonb end) as wb(e)
    union all
    -- every "limited to" range
    select l.e
      from jsonb_array_elements(case when jsonb_typeof(p_dan -> 'parts') = 'array' then p_dan -> 'parts' else '[]'::jsonb end) as p(e)
      cross join lateral jsonb_array_elements(case when jsonb_typeof(p.e -> 'subjects') = 'array' then p.e -> 'subjects' else '[]'::jsonb end) as s(e)
      cross join lateral jsonb_array_elements(case when jsonb_typeof(s.e -> 'limited_to') = 'array' then s.e -> 'limited_to' else '[]'::jsonb end) as l(e)
  ),
  edges as (
    select distinct (x.e ->> 'to')::integer as t from lists x where jsonb_typeof(x.e -> 'to') = 'number'
  ),
  groups as (
    -- one group ending at each edge ...
    select (lag(g.t) over (order by g.t)) + 1 as f, g.t, g.t::bigint as o from edges g
    union all
    -- ... and the last one, "and over"
    select (select max(g.t) + 1 from edges g), null::integer, 9999999999::bigint
  )
  select jsonb_agg(jsonb_build_object('from', g.f, 'to', g.t) order by g.o) from groups g;
$$;

revoke execute on function public.bb_age_groups(jsonb) from public, anon, authenticated, service_role;

-- 1b. bb_measured_letter(way, age, value) - the grade a measured number
-- earns (v0.944): the way's cut-off range that holds the age, then the
-- FIRST of A+, A, B+, B, C whose cut-off is met -
--   at_least: value >= cut-off      (e.g. Push-up: 40 or more = A)
--   at_most:  value <= cut-off      (e.g. 1 mile: 8:30 = 8.5 min or less = A)
--   under:    value <  cut-off      (Sprint 100 m: "under 19 sec")
-- none met -> D. No age, no value, or no range for that age -> NULL.
create or replace function public.bb_measured_letter(p_way jsonb, p_age integer, p_value numeric)
returns text
language plpgsql
immutable
set search_path = ''
as $$
declare
  v_dir  text := p_way ->> 'direction';
  v_b    jsonb;
  v_cut  jsonb;
  v_c    numeric;
  v_g    text;
begin
  if p_age is null or p_value is null or jsonb_typeof(p_way -> 'brackets') is distinct from 'array' then
    return null;
  end if;
  -- the first range (youngest first) that holds the age
  for v_b in select b.e from jsonb_array_elements(p_way -> 'brackets') with ordinality as b(e, o) order by b.o loop
    if (jsonb_typeof(v_b -> 'from') is distinct from 'number' or (v_b ->> 'from')::integer <= p_age)
       and (jsonb_typeof(v_b -> 'to') is distinct from 'number' or p_age <= (v_b ->> 'to')::integer) then
      v_cut := v_b -> 'cutoffs';
      -- the first of A+, A, B+, B, C whose cut-off is met; none -> D
      foreach v_g in array array['A+', 'A', 'B+', 'B', 'C'] loop
        if jsonb_typeof(v_cut -> v_g) = 'number' then
          v_c := (v_cut ->> v_g)::numeric;
          if (v_dir = 'at_least' and p_value >= v_c) or (v_dir = 'at_most' and p_value <= v_c)
             or (v_dir = 'under' and p_value < v_c) then
            return v_g;
          end if;
        end if;
      end loop;
      return 'D';
    end if;
  end loop;
  return null;
end;
$$;

revoke execute on function public.bb_measured_letter(jsonb, integer, numeric) from public, anon, authenticated, service_role;

-- 1c. bb_extra_points(extra, counts) - the extra points (v0.945, G 18-19).
-- For each item of the copy, in its order: its count = the entered count
-- with exactly that item name (stored names are the copy's names);
--   per_count: count x points_each
--   steps:     the points of the step with the LARGEST "at least" that is
--              <= the count (chosen by "at least", never by its place in
--              the list); below the first step -> 0
--   not entered -> 0 (count null)
-- Added up, then cut to the limit when there is one. Counts whose name
-- isn't in the copy are ignored. Answer:
--   {"counted": counts_toward_total, "total": n,
--    "items": [{"name", "count", "points", "kept"}]}
create or replace function public.bb_extra_points(p_extra jsonb, p_counts jsonb)
returns jsonb
language sql
immutable
set search_path = ''
as $$
  with items as (
    select i.e as item, i.o,
           c.e as cnt
      from jsonb_array_elements(case when jsonb_typeof(p_extra -> 'items') = 'array' then p_extra -> 'items' else '[]'::jsonb end)
           with ordinality as i(e, o)
      left join lateral (select x.e
                           from jsonb_array_elements(case when jsonb_typeof(p_counts) = 'array' then p_counts else '[]'::jsonb end)
                                with ordinality as x(e, n)
                          where x.e ->> 'item_name' = i.e ->> 'name'
                            and jsonb_typeof(x.e -> 'count') = 'number'
                          order by x.n
                          limit 1) as c on true
  ),
  pts as (
    select it.o, it.item ->> 'name' as name,
           (it.cnt ->> 'count')::numeric as count,
           coalesce((it.cnt ->> 'kept')::boolean, false) as kept,
           case when it.cnt is null then 0::numeric
                when it.item -> 'rule' ->> 'kind' = 'per_count'
                  then (it.cnt ->> 'count')::numeric * coalesce((it.item -> 'rule' ->> 'points_each')::numeric, 0)
                when it.item -> 'rule' ->> 'kind' = 'steps'
                  then coalesce((select (st.e ->> 'points')::numeric
                                   from jsonb_array_elements(case when jsonb_typeof(it.item -> 'rule' -> 'steps') = 'array'
                                                                  then it.item -> 'rule' -> 'steps' else '[]'::jsonb end) as st(e)
                                  where (st.e ->> 'at_least')::numeric <= (it.cnt ->> 'count')::numeric
                                  order by (st.e ->> 'at_least')::numeric desc
                                  limit 1), 0)
                else 0::numeric end as points
      from items it
  )
  select jsonb_build_object(
           'counted', coalesce((p_extra ->> 'counts_toward_total')::boolean, false),
           'total',   case when jsonb_typeof(p_extra -> 'limit') = 'number'
                           then least(coalesce((select sum(x.points) from pts x), 0), (p_extra ->> 'limit')::numeric)
                           else coalesce((select sum(x.points) from pts x), 0) end,
           'items',   coalesce((select jsonb_agg(jsonb_build_object('name', x.name, 'count', x.count, 'points', x.points,
                                                                    'kept', x.kept) order by x.o)
                                  from pts x), '[]'::jsonb));
$$;

revoke execute on function public.bb_extra_points(jsonb, jsonb) from public, anon, authenticated, service_role;

-- 1d. bb_grade_result(dan, age, grades, counts, retest, chosen, today,
-- submissions_due) - THE result (contract 4.1, v0.938-v0.945). Inputs:
--   p_dan     one Dan object of a copy
--   p_age     whole years on the cycle's first testing day, or NULL
--   p_grades  [{subject_id, letter, measured, way, kept,
--              kept_from_cycle_name}] - the candidate's grade rows
--   p_counts  [{item_name, count, kept}] - the entered extra counts
--   p_retest / p_chosen  subject ids of the make-up subjects of each kind
--   p_today, p_submissions_due  school dates
-- Steps (in order):
--   0. no age -> status no_age, everything else empty
--   1. the pass bracket that holds the age -> pass mark; the age group
--   2. which subjects apply: "limited to" empty, or it lists exactly the
--      pass bracket (G 13; One Step Sparring is for 18 and over)
--   3. each subject's letter: a kept row -> its letter; a graded subject
--      -> the row's letter; a measured subject -> bb_measured_letter of
--      the row's way. Any row that doesn't fit the subject (wrong scoring,
--      a letter not of the subject, a way that doesn't exist - only a hand
--      fix can make one) is IGNORED. Points = the copy's points for the
--      letter; a subject that doesn't apply gets no points.
--   4. part points, extra points, total (extra counted only when
--      counts_toward_total), maximum (0024's bb_rubric_most_points)
--   5. late: an applying hand-in subject with no letter after the due day
--   6. status: a D (when no_d) -> makeup ['d'] (+ 'below' when complete
--      and below the mark); else not complete -> not_finished; else
--      total >= pass mark -> passed; else makeup ['below']
--   7. needs: the D subjects; for 'below' alone the chosen subjects
--      (choice_needed when none is chosen yet)
--   8. result_key = md5(status|reasons|total without trailing zeros|needs)
-- The answer's keys are exactly contract 4.2's - never a DOB, the age, an
-- email or money.
create or replace function public.bb_grade_result(
  p_dan             jsonb,
  p_age             integer,
  p_grades          jsonb,
  p_counts          jsonb,
  p_retest          text[],
  p_chosen          text[],
  p_today           date,
  p_submissions_due date
)
returns jsonb
language plpgsql
immutable
set search_path = ''
as $$
declare
  v_retest   text[] := coalesce(p_retest, '{}');
  v_chosen   text[] := coalesce(p_chosen, '{}');
  v_pb       jsonb;
  v_pb_from  integer;
  v_pb_to    integer;
  v_mark     numeric;
  v_group    jsonb;
  v_rows     jsonb;      -- the grade rows by subject id
  v_part     jsonb;
  v_s        jsonb;
  v_code     text;
  v_id       text;
  v_g        jsonb;
  v_letters  text[];
  v_letter   text;
  v_meas     numeric;
  v_way      integer;
  v_kept     boolean;
  v_kfrom    text;
  v_applies  boolean;
  v_points   numeric;
  v_late     boolean;
  v_p_points numeric;
  v_p_graded integer;
  v_p_appl   integer;
  v_parts    jsonb := '[]'::jsonb;
  v_subjects jsonb := '[]'::jsonb;
  v_sum      numeric := 0;
  v_appl     integer := 0;
  v_graded   integer := 0;
  v_d        text[] := '{}';
  v_late_ids text[] := '{}';
  v_missing  text[] := '{}';
  v_chosen_ok text[] := '{}';
  v_extra    jsonb;
  v_total    numeric;
  v_max      numeric;
  v_complete boolean;
  v_status   text;
  v_reasons  text[] := '{}';
  v_needs    text[] := '{}';
  v_choice   boolean := false;
  v_six      text[] := array['A+', 'A', 'B+', 'B', 'C', 'D'];
  v_nine     text[] := array['A+', 'A', 'A-', 'B+', 'B', 'B-', 'C', 'C-', 'D'];
begin
  if p_dan is null then
    raise exception 'bb_grade_result: no Dan object';
  end if;

  -- 0. no age on file
  if p_age is null then
    return jsonb_build_object(
      'status', 'no_age', 'reasons', '[]'::jsonb, 'complete', false, 'total', null, 'maximum', null,
      'pass_mark', null, 'pass_bracket', null, 'age_group', null, 'parts', '[]'::jsonb, 'extra', null,
      'subjects', '[]'::jsonb, 'd_subjects', '[]'::jsonb, 'needs', '[]'::jsonb, 'choice_needed', false,
      'late', '[]'::jsonb, 'missing', '[]'::jsonb, 'counts', null, 'result_key', md5('no_age|||'));
  end if;

  -- 1. the pass bracket and the age group that hold the age
  select b.e into v_pb
    from jsonb_array_elements(case when jsonb_typeof(p_dan -> 'pass' -> 'brackets') = 'array'
                                   then p_dan -> 'pass' -> 'brackets' else '[]'::jsonb end) with ordinality as b(e, o)
   where (jsonb_typeof(b.e -> 'from') is distinct from 'number' or (b.e ->> 'from')::integer <= p_age)
     and (jsonb_typeof(b.e -> 'to') is distinct from 'number' or p_age <= (b.e ->> 'to')::integer)
   order by b.o
   limit 1;
  v_pb_from := (v_pb ->> 'from')::integer;
  v_pb_to   := (v_pb ->> 'to')::integer;
  v_mark    := (v_pb ->> 'pass_mark')::numeric;
  select g.e into v_group
    from jsonb_array_elements(public.bb_age_groups(p_dan)) as g(e)
   where (jsonb_typeof(g.e -> 'from') is distinct from 'number' or (g.e ->> 'from')::integer <= p_age)
     and (jsonb_typeof(g.e -> 'to') is distinct from 'number' or p_age <= (g.e ->> 'to')::integer)
   limit 1;

  -- the grade rows, found by subject id
  v_rows := coalesce((select jsonb_object_agg(x.e ->> 'subject_id', x.e)
                        from jsonb_array_elements(case when jsonb_typeof(p_grades) = 'array' then p_grades else '[]'::jsonb end) as x(e)
                       where jsonb_typeof(x.e -> 'subject_id') = 'string'), '{}'::jsonb);

  -- 2.-3. every subject of the four parts, in rubric order
  for v_part in
    select p.e from jsonb_array_elements(case when jsonb_typeof(p_dan -> 'parts') = 'array' then p_dan -> 'parts' else '[]'::jsonb end)
                    with ordinality as p(e, o) order by p.o
  loop
    v_code := v_part ->> 'code';
    v_p_points := 0;
    v_p_graded := 0;
    v_p_appl := 0;
    for v_s in
      select s.e from jsonb_array_elements(case when jsonb_typeof(v_part -> 'subjects') = 'array' then v_part -> 'subjects' else '[]'::jsonb end)
                      with ordinality as s(e, o) order by s.o
    loop
      v_id := v_s ->> 'id';
      -- 2. does it apply at this age?
      if jsonb_typeof(v_s -> 'limited_to') = 'array' then
        v_applies := exists (select 1 from jsonb_array_elements(v_s -> 'limited_to') as l(e)
                              where (l.e ->> 'from')::integer is not distinct from v_pb_from
                                and (l.e ->> 'to')::integer is not distinct from v_pb_to);
      else
        v_applies := true;
      end if;
      -- the letters this subject can have (0024's bb_rubric_letters, written
      -- out here: this runs for every subject of every row of a list)
      if v_s ->> 'scoring' = 'measured' or v_code = 'physical' then
        v_letters := v_six;
      else
        v_letters := v_nine;
      end if;
      v_letter := null;
      v_meas := null;
      v_way := null;
      v_kept := false;
      v_kfrom := null;
      v_g := v_rows -> v_id;
      -- 3. the letter (a row that doesn't fit the subject is ignored)
      if v_g is not null then
        if coalesce((v_g ->> 'kept')::boolean, false) then
          if v_g ->> 'letter' = any (v_letters) then
            v_letter := v_g ->> 'letter';
            v_kept := true;
            v_kfrom := v_g ->> 'kept_from_cycle_name';
          end if;
        elsif v_s ->> 'scoring' = 'graded' then
          if v_g ->> 'letter' = any (v_letters) and jsonb_typeof(v_g -> 'measured') is distinct from 'number' then
            v_letter := v_g ->> 'letter';
          end if;
        elsif v_s ->> 'scoring' = 'measured' then
          if jsonb_typeof(v_g -> 'letter') is distinct from 'string'
             and jsonb_typeof(v_g -> 'measured') = 'number'
             and jsonb_typeof(v_g -> 'way') = 'number'
             and (v_g ->> 'way') ~ '^[0-9]$'
             and jsonb_typeof(v_s -> 'ways') = 'array'
             and (v_g ->> 'way')::integer < jsonb_array_length(v_s -> 'ways') then
            v_letter := public.bb_measured_letter(v_s -> 'ways' -> (v_g ->> 'way')::integer, p_age, (v_g ->> 'measured')::numeric);
            if v_letter is not null then
              v_meas := (v_g ->> 'measured')::numeric;
              v_way := (v_g ->> 'way')::integer;
            end if;
          end if;
        end if;
      end if;
      -- points from the copy (never worked out again from credits)
      v_points := case when v_applies and v_letter is not null then (v_s -> 'points' ->> v_letter)::numeric end;
      -- 5. late: a hand-in subject not handed in after the due day
      v_late := coalesce(v_applies and (v_s ->> 'handed_in')::boolean and v_letter is null and p_today > p_submissions_due, false);
      if v_applies then
        v_p_appl := v_p_appl + 1;
        if v_letter is not null then
          v_p_graded := v_p_graded + 1;
          v_p_points := v_p_points + coalesce(v_points, 0);
          if v_letter = 'D' then
            v_d := v_d || v_id;
          end if;
          if v_id = any (v_chosen) then
            v_chosen_ok := v_chosen_ok || v_id;
          end if;
        else
          v_missing := v_missing || v_id;
          if v_id = any (v_chosen) then
            v_chosen_ok := v_chosen_ok || v_id;
          end if;
        end if;
        if v_late then
          v_late_ids := v_late_ids || v_id;
        end if;
      end if;
      v_subjects := v_subjects || jsonb_build_array(jsonb_build_object(
        'id', v_id, 'part', v_code, 'letter', v_letter, 'measured', v_meas, 'way', v_way, 'points', v_points,
        'applies', v_applies, 'kept', v_kept, 'kept_from_cycle_name', v_kfrom,
        'retest', v_id = any (v_retest), 'chosen', v_id = any (v_chosen), 'late', v_late,
        'gradable', v_applies and not v_kept));
    end loop;
    v_parts := v_parts || jsonb_build_array(jsonb_build_object('code', v_code, 'points', v_p_points,
                                                               'graded', v_p_graded, 'applying', v_p_appl));
    v_sum := v_sum + v_p_points;
    v_appl := v_appl + v_p_appl;
    v_graded := v_graded + v_p_graded;
  end loop;

  -- 4. extra points, total, maximum
  v_extra := public.bb_extra_points(p_dan -> 'extra_points', p_counts);
  v_total := v_sum + case when (v_extra ->> 'counted')::boolean then (v_extra ->> 'total')::numeric else 0 end;
  v_max := public.bb_rubric_most_points(p_dan, v_pb_from, v_pb_to);

  -- 6. the status
  v_complete := cardinality(v_missing) = 0;
  if cardinality(v_d) > 0 and coalesce((p_dan -> 'pass' ->> 'no_d')::boolean, true) then
    v_status := 'makeup';
    v_reasons := array['d'];
    if v_complete and v_total < v_mark then
      v_reasons := v_reasons || 'below'::text;
    end if;
  elsif not v_complete then
    v_status := 'not_finished';
  elsif v_total >= v_mark then
    v_status := 'passed';
  else
    v_status := 'makeup';
    v_reasons := array['below'];
  end if;

  -- 7. what to work on
  if 'd' = any (v_reasons) then
    v_needs := v_d;
  elsif v_reasons = array['below'] then
    v_needs := v_chosen_ok;
    v_choice := cardinality(v_chosen_ok) = 0;
  end if;

  return jsonb_build_object(
    'status', v_status,
    'reasons', to_jsonb(v_reasons),
    'complete', v_complete,
    'total', v_total,
    'maximum', v_max,
    'pass_mark', v_mark,
    'pass_bracket', jsonb_build_object('from', v_pb_from, 'to', v_pb_to),
    'age_group', jsonb_build_object('from', (v_group ->> 'from')::integer, 'to', (v_group ->> 'to')::integer),
    'parts', v_parts,
    'extra', v_extra,
    'subjects', v_subjects,
    'd_subjects', to_jsonb(v_d),
    'needs', to_jsonb(v_needs),
    'choice_needed', v_choice,
    'late', to_jsonb(v_late_ids),
    'missing', to_jsonb(v_missing),
    'counts', jsonb_build_object('applying', v_appl, 'graded', v_graded, 'left', v_appl - v_graded),
    -- 8. the result key: reasons included, trailing zeros removed (263 = 263.00)
    'result_key', md5(v_status || '|' || array_to_string(v_reasons, ',') || '|'
                      || coalesce(trim_scale(v_total)::text, '') || '|' || array_to_string(v_needs, ',')));
end;
$$;

revoke execute on function public.bb_grade_result(jsonb, integer, jsonb, jsonb, text[], text[], date, date) from public, anon, authenticated, service_role;

-- 1e. bb_kept_match(earlier result, earlier Dan, earlier counts, later
-- Dan, later age) - what a make-up keeps (S10, S11, G 26, G 36). For every
-- subject L of the later Dan (rubric order) that APPLIES at the later age:
--   E = the earlier subject in the SAME part with the same name (capitals
--       and extra spaces ignored; the same name in another part never
--       matches)
--   kept   when E has an applying letter in the earlier result, E is not
--          one of the earlier result's needs, the letter is not D, and the
--          letter is one of L's letters -> {subject_id: L, part, letter}
--          (a measured E keeps its WORKED-OUT letter)
--   retest otherwise (a D, a subject to work on, not graded yet - Q-G6,
--          renamed, new, or a letter L can't have)
-- Subjects that don't apply get nothing. Extra counts: each later item
-- takes the earlier count of the same name (capitals and spaces ignored)
-- under the LATER exact name; earlier counts with no later item are
-- "dropped_extra". Answer:
--   {"kept": [...], "retest": [ids], "new": [ids of L with no E],
--    "dropped": [earlier names with an applying letter or a need but no
--    L], "kept_counts": [{item_name, count}], "dropped_extra": [names]}
-- Add make-up and the picker's preview both use it, so they agree.
create or replace function public.bb_kept_match(
  p_earlier_result jsonb,
  p_earlier_dan    jsonb,
  p_earlier_counts jsonb,
  p_later_dan      jsonb,
  p_later_age      integer
)
returns jsonb
language plpgsql
immutable
set search_path = ''
as $$
declare
  v_pb       jsonb;
  v_pb_from  integer;
  v_pb_to    integer;
  v_needs    text[];
  v_emap     jsonb;     -- earlier subjects: "part|tidied name" -> id (the first of that name)
  v_lmap     jsonb;     -- later subjects:   "part|tidied name" -> id
  v_res      jsonb;     -- the earlier result's subjects by id
  v_l        record;
  v_eid      text;
  v_es       jsonb;
  v_letter   text;
  v_kept     jsonb := '[]'::jsonb;
  v_retest   text[] := '{}';
  v_new      text[] := '{}';
  v_dropped  text[];
  v_kc       jsonb;
  v_de       text[];
begin
  v_needs := array(select jsonb_array_elements_text(case when jsonb_typeof(p_earlier_result -> 'needs') = 'array'
                                                         then p_earlier_result -> 'needs' else '[]'::jsonb end));
  -- the later pass bracket (the same rule as bb_grade_result step 1)
  select b.e into v_pb
    from jsonb_array_elements(case when jsonb_typeof(p_later_dan -> 'pass' -> 'brackets') = 'array'
                                   then p_later_dan -> 'pass' -> 'brackets' else '[]'::jsonb end) with ordinality as b(e, o)
   where p_later_age is not null
     and (jsonb_typeof(b.e -> 'from') is distinct from 'number' or (b.e ->> 'from')::integer <= p_later_age)
     and (jsonb_typeof(b.e -> 'to') is distinct from 'number' or p_later_age <= (b.e ->> 'to')::integer)
   order by b.o
   limit 1;
  v_pb_from := (v_pb ->> 'from')::integer;
  v_pb_to   := (v_pb ->> 'to')::integer;

  -- every name tidied ONCE (capitals and extra spaces ignored), keyed by
  -- part, so "the same name in the same part" is one lookup. (jsonb_object_agg
  -- keeps the LAST of two equal keys, so the rows go in reverse order: the
  -- first subject of a name wins.)
  v_emap := coalesce((select jsonb_object_agg(x.k, x.id order by x.po desc, x.so desc)
                        from (select p.e ->> 'code' || '|' || lower(public.testing_normalize_name(s.e ->> 'name')) as k,
                                     s.e ->> 'id' as id, p.o as po, s.o as so
                                from jsonb_array_elements(case when jsonb_typeof(p_earlier_dan -> 'parts') = 'array'
                                                               then p_earlier_dan -> 'parts' else '[]'::jsonb end) with ordinality as p(e, o)
                                cross join lateral jsonb_array_elements(case when jsonb_typeof(p.e -> 'subjects') = 'array'
                                                                             then p.e -> 'subjects' else '[]'::jsonb end) with ordinality as s(e, o)) as x
                       where x.k is not null), '{}'::jsonb);
  v_res := coalesce((select jsonb_object_agg(x.e ->> 'id', x.e)
                       from jsonb_array_elements(case when jsonb_typeof(p_earlier_result -> 'subjects') = 'array'
                                                      then p_earlier_result -> 'subjects' else '[]'::jsonb end) as x(e)
                      where jsonb_typeof(x.e -> 'id') = 'string'), '{}'::jsonb);

  -- every later subject that applies, in rubric order
  for v_l in
    select p.e ->> 'code' as code, s.e as e, s.e ->> 'id' as id,
           p.e ->> 'code' || '|' || lower(public.testing_normalize_name(s.e ->> 'name')) as k
      from jsonb_array_elements(case when jsonb_typeof(p_later_dan -> 'parts') = 'array' then p_later_dan -> 'parts' else '[]'::jsonb end)
           with ordinality as p(e, o)
      cross join lateral jsonb_array_elements(case when jsonb_typeof(p.e -> 'subjects') = 'array' then p.e -> 'subjects' else '[]'::jsonb end)
           with ordinality as s(e, o)
     where jsonb_typeof(s.e -> 'limited_to') is distinct from 'array'
        or (v_pb is not null
            and exists (select 1 from jsonb_array_elements(s.e -> 'limited_to') as l(e)
                         where (l.e ->> 'from')::integer is not distinct from v_pb_from
                           and (l.e ->> 'to')::integer is not distinct from v_pb_to))
     order by p.o, s.o
  loop
    -- E: the same name in the same part
    v_eid := v_emap ->> v_l.k;
    if v_eid is null then
      v_new := v_new || v_l.id;
      v_retest := v_retest || v_l.id;
      continue;
    end if;
    -- E's letter in the earlier result (only when it applied there)
    v_es := v_res -> v_eid;
    v_letter := case when coalesce((v_es ->> 'applies')::boolean, false) then v_es ->> 'letter' end;
    if v_letter is not null and v_letter <> 'D' and not (v_eid = any (v_needs))
       and v_letter = any (case when v_l.e ->> 'scoring' = 'measured' or v_l.code = 'physical'
                                then array['A+', 'A', 'B+', 'B', 'C', 'D']
                                else array['A+', 'A', 'A-', 'B+', 'B', 'B-', 'C', 'C-', 'D'] end) then
      v_kept := v_kept || jsonb_build_array(jsonb_build_object('subject_id', v_l.id, 'part', v_l.code, 'letter', v_letter));
    else
      v_retest := v_retest || v_l.id;
    end if;
  end loop;

  -- dropped: earlier subjects with an applying letter or a need, and no
  -- later subject of the same name in the same part (applying or not)
  v_lmap := coalesce((select jsonb_object_agg(p.e ->> 'code' || '|' || lower(public.testing_normalize_name(s.e ->> 'name')), true)
                        from jsonb_array_elements(case when jsonb_typeof(p_later_dan -> 'parts') = 'array'
                                                       then p_later_dan -> 'parts' else '[]'::jsonb end) as p(e)
                        cross join lateral jsonb_array_elements(case when jsonb_typeof(p.e -> 'subjects') = 'array'
                                                                     then p.e -> 'subjects' else '[]'::jsonb end) as s(e)
                       where s.e ->> 'name' is not null and p.e ->> 'code' is not null), '{}'::jsonb);
  v_dropped := array(
    select s.e ->> 'name'
      from jsonb_array_elements(case when jsonb_typeof(p_earlier_dan -> 'parts') = 'array' then p_earlier_dan -> 'parts' else '[]'::jsonb end)
           with ordinality as p(e, po)
      cross join lateral jsonb_array_elements(case when jsonb_typeof(p.e -> 'subjects') = 'array' then p.e -> 'subjects' else '[]'::jsonb end)
           with ordinality as s(e, so)
     where ((coalesce((v_res -> (s.e ->> 'id') ->> 'applies')::boolean, false)
             and jsonb_typeof(v_res -> (s.e ->> 'id') -> 'letter') = 'string')
            or (s.e ->> 'id') = any (v_needs))
       and not (v_lmap ? (p.e ->> 'code' || '|' || lower(public.testing_normalize_name(s.e ->> 'name'))))
     order by p.po, s.so);

  -- the extra counts: each later item takes the earlier count of the same
  -- tidied name, under the LATER exact name; earlier counts with no later
  -- item are "dropped_extra"
  with ec as (
    select x.e, x.n, lower(public.testing_normalize_name(x.e ->> 'item_name')) as k
      from jsonb_array_elements(case when jsonb_typeof(p_earlier_counts) = 'array' then p_earlier_counts else '[]'::jsonb end)
           with ordinality as x(e, n)
  ),
  li as (
    select i.e ->> 'name' as name, i.o, lower(public.testing_normalize_name(i.e ->> 'name')) as k
      from jsonb_array_elements(case when jsonb_typeof(p_later_dan -> 'extra_points' -> 'items') = 'array'
                                     then p_later_dan -> 'extra_points' -> 'items' else '[]'::jsonb end) with ordinality as i(e, o)
  )
  select coalesce((select jsonb_agg(jsonb_build_object('item_name', li.name, 'count', m.cnt) order by li.o)
                     from li
                     cross join lateral (select (ec.e ->> 'count')::integer as cnt from ec
                                          where ec.k = li.k and jsonb_typeof(ec.e -> 'count') = 'number'
                                          order by ec.n limit 1) as m), '[]'::jsonb),
         array(select ec.e ->> 'item_name' from ec where not exists (select 1 from li where li.k = ec.k) order by ec.n)
    into v_kc, v_de;

  return jsonb_build_object('kept', v_kept, 'retest', to_jsonb(v_retest), 'new', to_jsonb(v_new),
                            'dropped', to_jsonb(v_dropped), 'kept_counts', v_kc, 'dropped_extra', to_jsonb(v_de));
end;
$$;

revoke execute on function public.bb_kept_match(jsonb, jsonb, jsonb, jsonb, integer) from public, anon, authenticated, service_role;

-- 1f. bb_result_text_problem(kind, body) - the rules for a result email
-- text (G9, R 24-25; a copy of 0023's star_result_text_problem with Black
-- Belt's blanks). NULL when the text is fine, else the FIRST problem, in
-- this order:
--   'kind'               kind is not passed / makeup_d / makeup_below
--   'empty'              no text at all
--   'too_long'           more than 2,000 characters
--   'bad_character'      a hidden or control character (a line break is
--                        fine)
--   'first_line'         the first line is empty or only spaces
--   'unknown_blank'      {something} that isn't one of the 9 blanks (exact
--                        spelling and capitals: {Dan}, not {dan})
--   'blank_not_for_kind' a real blank this kind of email can't fill
--   'stray_brace'        a { or } that isn't part of a blank
--   'missing_required'   {total} or {pass mark} missing (every text), or
--                        {subjects to work on} missing in a make-up text
-- The blanks (R 24):
--   every kind:   {first name} {full name} {cycle} {Dan} {total} {pass mark}
--   makeup_d:     + {D subjects} {subjects to work on} {below-pass-mark note}
--   makeup_below: + {subjects to work on}
-- The app checks the same rules as you type (src/lib/blackBelt/
-- resultEmail.js) and says which; the database only answers "invalid".
create or replace function public.bb_result_text_problem(p_kind text, p_body text)
returns text
language plpgsql
immutable
set search_path = ''
as $$
declare
  v_common   text[] := array['first name', 'full name', 'cycle', 'Dan', 'total', 'pass mark'];
  v_all      text[] := array['first name', 'full name', 'cycle', 'Dan', 'total', 'pass mark',
                             'subjects to work on', 'D subjects', 'below-pass-mark note'];
  v_allowed  text[];
  v_required text[] := array['total', 'pass mark'];
  v_found    text[];
  v_name     text;
  -- hidden / control characters, built with chr() so this file holds no
  -- invisible characters itself: 1-9, 11-31 (line break 10 allowed),
  -- 127-159, zero-width and direction marks, word joiners, the BOM
  v_bad      text := '[' || chr(1) || '-' || chr(9) || chr(11) || '-' || chr(31) || chr(127) || '-' || chr(159)
                     || chr(8203) || '-' || chr(8207) || chr(8234) || '-' || chr(8238)
                     || chr(8288) || '-' || chr(8292) || chr(8294) || '-' || chr(8297) || chr(65279) || ']';
begin
  if p_kind is null or p_kind not in ('passed', 'makeup_d', 'makeup_below') then
    return 'kind';
  end if;
  if p_body is null or p_body = '' then
    return 'empty';
  end if;
  if char_length(p_body) > 2000 then
    return 'too_long';
  end if;
  if p_body ~ v_bad then
    return 'bad_character';
  end if;
  -- (spaces and no-break spaces only = empty)
  if split_part(p_body, chr(10), 1) ~ ('^[ ' || chr(160) || ']*$') then
    return 'first_line';
  end if;

  if p_kind = 'passed' then
    v_allowed := v_common;
  elsif p_kind = 'makeup_d' then
    v_allowed  := v_common || array['D subjects', 'subjects to work on', 'below-pass-mark note'];
    v_required := v_required || array['subjects to work on'];
  else
    v_allowed  := v_common || array['subjects to work on'];
    v_required := v_required || array['subjects to work on'];
  end if;

  -- every {...} (no braces inside) in the text
  v_found := array(select m[1] from regexp_matches(p_body, '\{([^{}]*)\}', 'g') as m);
  foreach v_name in array v_found loop
    if not (v_name = any (v_all)) then
      return 'unknown_blank';
    end if;
  end loop;
  foreach v_name in array v_found loop
    if not (v_name = any (v_allowed)) then
      return 'blank_not_for_kind';
    end if;
  end loop;
  if regexp_replace(p_body, '\{[^{}]*\}', '', 'g') ~ '[{}]' then
    return 'stray_brace';
  end if;
  foreach v_name in array v_required loop
    if not (v_name = any (v_found)) then
      return 'missing_required';
    end if;
  end loop;
  return null;
end;
$$;

revoke execute on function public.bb_result_text_problem(text, text) from public, anon, authenticated, service_role;


-- ---------------------------------------------------------------------
-- 2. The new tables (contract section 2) and the make-up columns of
--    bb_candidates (section 3). Every table with a version has 0016's
--    house columns (id, version, created/updated at/by/by_name); the login
--    ids (created_by, updated_by, marked_by ...) are never granted to
--    anyone. Their triggers are in section 4.
-- ---------------------------------------------------------------------

-- 2a. public.bb_grades - one row per graded subject of a candidate (G1,
-- G7; like Star's star_grades). NO row = not graded (Clear removes it).
--   letter    a graded subject's letter (or a kept row's letter)
--   measured  a measured subject's number (0-999, at most 4 decimals:
--             minutes are stored as decimal minutes, 8:30 = 8.5)
--   way       which way of the subject was done (0 = the first, e.g.
--             Pull-up; 1 = the second, e.g. Hold)
--   kept      copied from the earlier cycle into a make-up row (never
--             editable); kept_from_cycle_id has NO foreign key on purpose:
--             the earlier cycle may be removed later
-- Either a letter, or a number + its way - never both. A kept row is
-- never a D. The version goes up on a change but is never checked: the
-- last save wins and the history keeps both (S3, Star v0.165).
create table if not exists public.bb_grades (
  id                   uuid         not null default gen_random_uuid(),
  candidate_id         uuid         not null,
  dan                  smallint     not null,
  part_code            text         not null,
  subject_id           text         not null,
  letter               text         null,
  measured             numeric(7,4) null,
  way                  smallint     null,
  kept                 boolean      not null default false,
  kept_from_cycle_id   uuid         null,      -- no foreign key on purpose (see above)
  kept_from_cycle_name text         null,
  version              integer      not null default 1,
  created_at           timestamptz  not null default now(),
  updated_at           timestamptz  not null default now(),
  created_by           uuid         null,      -- login id; never readable by the app
  updated_by           uuid         null,      -- login id; never readable by the app
  created_by_name      text         not null,
  updated_by_name      text         not null,

  constraint bb_grades_pkey primary key (id),
  constraint bb_grades_candidate_fk foreign key (candidate_id) references public.bb_candidates (id) on delete cascade,
  constraint bb_grades_dan_check check (dan between 1 and 4),
  constraint bb_grades_part_check check (part_code in ('physical', 'technical', 'curriculum', 'other')),
  constraint bb_grades_subject_check check (subject_id ~ '^[a-z0-9]{8}$'),
  constraint bb_grades_letter_check check (letter is null or letter in ('A+', 'A', 'A-', 'B+', 'B', 'B-', 'C', 'C-', 'D')),
  constraint bb_grades_measured_check check (measured is null or measured between 0 and 999),
  constraint bb_grades_way_check check (way is null or way in (0, 1)),
  constraint bb_grades_value_check
    check ((letter is not null and measured is null and way is null)
           or (letter is null and measured is not null and way is not null)),
  constraint bb_grades_kept_check check (kept = (kept_from_cycle_name is not null) and (kept_from_cycle_id is null or kept)),
  constraint bb_grades_kept_letter_check check (not kept or (letter is not null and letter <> 'D')),
  constraint bb_grades_candidate_subject_key unique (candidate_id, dan, subject_id),
  constraint bb_grades_version_check check (version >= 1)
);

create index if not exists bb_grades_part_idx on public.bb_grades (candidate_id, part_code);

comment on table public.bb_grades is
  'Black Belt grades: one row per graded subject of a candidate (a letter, or a measured number and its way). Kept rows are copied from an earlier cycle into a make-up row. No row = not graded.';

-- 2b. public.bb_extra_counts - one row per entered extra-points count
-- (G8). item_name is exactly an item name of the copy's Dan. No row = not
-- entered (0 points, G 19). Kept rows as 2a.
create table if not exists public.bb_extra_counts (
  id                   uuid        not null default gen_random_uuid(),
  candidate_id         uuid        not null,
  dan                  smallint    not null,
  item_name            text        not null,
  count                integer     not null,
  kept                 boolean     not null default false,
  kept_from_cycle_id   uuid        null,      -- no foreign key on purpose (as 2a)
  kept_from_cycle_name text        null,
  version              integer     not null default 1,
  created_at           timestamptz not null default now(),
  updated_at           timestamptz not null default now(),
  created_by           uuid        null,      -- login id; never readable by the app
  updated_by           uuid        null,      -- login id; never readable by the app
  created_by_name      text        not null,
  updated_by_name      text        not null,

  constraint bb_extra_counts_pkey primary key (id),
  constraint bb_extra_counts_candidate_fk foreign key (candidate_id) references public.bb_candidates (id) on delete cascade,
  constraint bb_extra_counts_dan_check check (dan between 1 and 4),
  constraint bb_extra_counts_count_check check (count between 0 and 9999),
  constraint bb_extra_counts_kept_check check (kept = (kept_from_cycle_name is not null) and (kept_from_cycle_id is null or kept)),
  constraint bb_extra_counts_version_check check (version >= 1)
);

create unique index if not exists bb_extra_counts_item_key on public.bb_extra_counts (candidate_id, dan, lower(item_name));

comment on table public.bb_extra_counts is
  'Black Belt extra-points counts (one row per entered count of an item). No row = not entered.';

-- 2c. public.bb_makeup_subjects - the make-up subjects (G3, G6; like
-- Star's star_makeup_subjects):
--   chosen  an admin's choice of subjects to work on, for a complete
--           result below the pass mark with no D (G5, v0.940)
--   retest  written by Add make-up on a make-up row: the subjects that are
--           tested again (G 26)
-- Rows are only added and removed, never changed.
create table if not exists public.bb_makeup_subjects (
  id              uuid        not null default gen_random_uuid(),
  candidate_id    uuid        not null,
  dan             smallint    not null,
  subject_id      text        not null,
  kind            text        not null,
  version         integer     not null default 1,
  created_at      timestamptz not null default now(),
  updated_at      timestamptz not null default now(),
  created_by      uuid        null,      -- login id; never readable by the app
  updated_by      uuid        null,      -- login id; never readable by the app
  created_by_name text        not null,
  updated_by_name text        not null,

  constraint bb_makeup_subjects_pkey primary key (id),
  constraint bb_makeup_subjects_candidate_fk foreign key (candidate_id) references public.bb_candidates (id) on delete cascade,
  constraint bb_makeup_subjects_dan_check check (dan between 1 and 4),
  constraint bb_makeup_subjects_subject_check check (subject_id ~ '^[a-z0-9]{8}$'),
  constraint bb_makeup_subjects_kind_check check (kind in ('chosen', 'retest')),
  constraint bb_makeup_subjects_key unique (candidate_id, dan, subject_id, kind),
  constraint bb_makeup_subjects_version_check check (version >= 1)
);

comment on table public.bb_makeup_subjects is
  'Black Belt make-up subjects: the subjects an admin chose to work on (chosen) and the subjects a make-up row is tested on again (retest).';

-- 2d. public.bb_result_texts - the three result email texts (G9, R 21-29;
-- a copy of Star's 0023 table). One row per kind; the kind never changes
-- and the app never adds or removes a row. The subject line is NOT here:
-- it is fixed in the app ("Your black belt testing result - U.S.T.C.").
create table if not exists public.bb_result_texts (
  id              uuid        not null default gen_random_uuid(),
  kind            text        not null,
  body            text        not null,
  version         integer     not null default 1,
  created_at      timestamptz not null default now(),
  updated_at      timestamptz not null default now(),
  created_by      uuid        null,      -- login id; never readable by the app
  updated_by      uuid        null,      -- login id; never readable by the app
  created_by_name text        not null,
  updated_by_name text        not null,

  constraint bb_result_texts_pkey primary key (id),
  constraint bb_result_texts_kind_key unique (kind),
  constraint bb_result_texts_kind_check check (kind in ('passed', 'makeup_d', 'makeup_below')),
  constraint bb_result_texts_body_check check (public.bb_result_text_problem(kind, body) is null),
  constraint bb_result_texts_version_check check (version >= 1)
);

comment on table public.bb_result_texts is
  'Black Belt result email texts (Passed / Make-up with a D / Make-up below the pass mark), with {blanks} the app fills in. Edited by admins only through bb_set_result_text.';

-- 2e. public.bb_result_sends - "Mark as sent" (R 15-20; like Star's
-- star_result_emails). Each row is a SNAPSHOT of the result that was sent
-- (status, total, needs, result key), so the screen can say "Not sent
-- yet" again when the result changes later (v0.170, R 16: the newest
-- not-undone row's result_key differs from the current one). Undo marks
-- the row undone (once); rows are never changed otherwise. No version
-- columns (as Star): the guard (section 4) stamps who and when.
create table if not exists public.bb_result_sends (
  id             uuid         not null default gen_random_uuid(),
  candidate_id   uuid         not null,
  marked_at      timestamptz  not null default now(),
  marked_by      uuid         null,      -- login id; never readable by the app
  marked_by_name text         not null,
  result_status  text         not null,
  result_total   numeric(8,2) not null,
  result_needs   jsonb        not null,
  result_key     text         not null,
  undone_at      timestamptz  null,
  undone_by      uuid         null,      -- login id; never readable by the app
  undone_by_name text         null,

  constraint bb_result_sends_pkey primary key (id),
  constraint bb_result_sends_candidate_fk foreign key (candidate_id) references public.bb_candidates (id) on delete cascade,
  constraint bb_result_sends_status_check check (result_status in ('passed', 'makeup')),
  constraint bb_result_sends_needs_check check (jsonb_typeof(result_needs) = 'array'),
  constraint bb_result_sends_key_check check (result_key ~ '^[0-9a-f]{32}$'),
  constraint bb_result_sends_undone_check check ((undone_at is null) = (undone_by_name is null))
);

create index if not exists bb_result_sends_candidate_idx on public.bb_result_sends (candidate_id, marked_at desc, id desc);

comment on table public.bb_result_sends is
  'Black Belt "Mark as sent": a snapshot of each result email marked as sent (undone rows kept).';

-- 2f. public.bb_downloads - the log of every results CSV download (R 45;
-- like Star's star_downloads). Written by bb_results_csv BEFORE any row
-- leaves the database. Append-only. No foreign key to the cycle on
-- purpose: the log outlives a removed cycle. Not in change_log (a
-- download isn't a data change). Nobody in the app can read it (SQL
-- Editor only).
create table if not exists public.bb_downloads (
  id                 uuid        not null default gen_random_uuid(),
  cycle_id           uuid        not null,
  cycle_name         text        not null,
  row_count          integer     not null,
  downloaded_at      timestamptz not null default now(),
  downloaded_by      uuid        null,      -- login id; never readable by the app
  downloaded_by_name text        not null,

  constraint bb_downloads_pkey primary key (id),
  constraint bb_downloads_row_count_check check (row_count >= 0)
);

create index if not exists bb_downloads_cycle_idx on public.bb_downloads (cycle_id, downloaded_at);

comment on table public.bb_downloads is
  'Black Belt results CSV downloads (who, when, which cycle, how many rows). Append-only; SQL Editor only.';

-- 2g. public.bb_cycle_grading_started - the rubric lock "for good" (Q-G1,
-- OI-2 = B, rulebook v0.956). ONE row per cycle, written automatically
-- the first time the cycle gets ANY grading row (a trigger, section 4),
-- and never removed except together with its cycle. So clearing every
-- grade again, a Dan change that clears grades, or the Undo of a make-up
-- never unlocks the cycle's rubric. Nobody in the app can read it
-- directly (bb_cycle_grading_state answers its date).
create table if not exists public.bb_cycle_grading_started (
  id              uuid        not null default gen_random_uuid(),
  cycle_id        uuid        not null,
  started_at      timestamptz not null default now(),
  started_by      uuid        null,      -- login id; never readable by the app
  started_by_name text        not null default '',

  constraint bb_cycle_grading_started_pkey primary key (id),
  constraint bb_cycle_grading_started_cycle_key unique (cycle_id),
  constraint bb_cycle_grading_started_cycle_fk foreign key (cycle_id) references public.bb_cycles (id) on delete cascade
);

comment on table public.bb_cycle_grading_started is
  'Black Belt: when each cycle got its first grading row (locks the cycle''s rubric for good, Q-G1).';


-- ---------------------------------------------------------------------
-- 3. Make-up candidates: the changes to bb_candidates (contract section
--    3, G4, v0.941). A make-up row is a candidate on a LATER cycle who
--    comes back to make up an earlier result:
--      * source 'makeup', no plan (never a fee: v0.941), never Kukkiwon
--      * the SAME reference as the earlier row (BB-5012 stays BB-5012), so
--        the reference is unique only among form and desk rows now
--      * makeup_of_candidate_id: the earlier row (set to empty if that row
--        is ever removed); makeup_of_cycle_name: the earlier cycle's name
--        at the time it was added ("Make-up from Spring 2027")
--      * at most ONE active make-up per earlier candidate, anywhere
--    age_kept (Q-G2 A): when the purge removes a date of birth, the age on
--    the cycle's first testing day is kept here, so the result stays
--    exact. Set once, by the purge only; masked in the history like the
--    date of birth. No new column is granted to anyone.
-- ---------------------------------------------------------------------
alter table public.bb_candidates add column if not exists makeup_of_candidate_id uuid null;
alter table public.bb_candidates add column if not exists makeup_of_cycle_name text null;
alter table public.bb_candidates add column if not exists age_kept smallint null;

-- a make-up row has no plan (the plan key skips a row without a plan)
alter table public.bb_candidates alter column cycle_plan_id drop not null;

alter table public.bb_candidates drop constraint if exists bb_candidates_source_check;
alter table public.bb_candidates add constraint bb_candidates_source_check check (source in ('form', 'desk', 'makeup'));

alter table public.bb_candidates drop constraint if exists bb_candidates_makeup_of_fk;
alter table public.bb_candidates add constraint bb_candidates_makeup_of_fk
  foreign key (makeup_of_candidate_id) references public.bb_candidates (id) on delete set null;

alter table public.bb_candidates drop constraint if exists bb_candidates_makeup_of_self_check;
alter table public.bb_candidates add constraint bb_candidates_makeup_of_self_check
  check (makeup_of_candidate_id is distinct from id);

alter table public.bb_candidates drop constraint if exists bb_candidates_makeup_of_check;
alter table public.bb_candidates add constraint bb_candidates_makeup_of_check
  check (makeup_of_candidate_id is null or source = 'makeup');

alter table public.bb_candidates drop constraint if exists bb_candidates_makeup_name_check;
alter table public.bb_candidates add constraint bb_candidates_makeup_name_check
  check ((source = 'makeup') = (makeup_of_cycle_name is not null)
         and (makeup_of_cycle_name is null
              or coalesce(public.testing_name_is_valid(makeup_of_cycle_name)
                          and makeup_of_cycle_name = public.testing_normalize_name(makeup_of_cycle_name), false)));

alter table public.bb_candidates drop constraint if exists bb_candidates_makeup_plan_check;
alter table public.bb_candidates add constraint bb_candidates_makeup_plan_check
  check ((source = 'makeup') = (cycle_plan_id is null));

alter table public.bb_candidates drop constraint if exists bb_candidates_makeup_kukkiwon_check;
alter table public.bb_candidates add constraint bb_candidates_makeup_kukkiwon_check
  check (source <> 'makeup' or not kukkiwon);

alter table public.bb_candidates drop constraint if exists bb_candidates_age_kept_check;
alter table public.bb_candidates add constraint bb_candidates_age_kept_check
  check (age_kept is null or (age_kept between 0 and 120 and personal_removed_at is not null));

-- The reference (G 27): unique among form and desk rows only; a make-up
-- row carries its earlier row's reference.
alter table public.bb_candidates drop constraint if exists bb_candidates_reference_key;
create unique index if not exists bb_candidates_reference_idx
  on public.bb_candidates (reference) where source <> 'makeup';

-- At most one ACTIVE make-up per earlier candidate, in any cycle.
create unique index if not exists bb_candidates_one_active_makeup_idx
  on public.bb_candidates (makeup_of_candidate_id) where status = 'active' and makeup_of_candidate_id is not null;

-- For the "set to empty" key and the purge's walk along a make-up chain.
create index if not exists bb_candidates_makeup_of_idx
  on public.bb_candidates (makeup_of_candidate_id) where makeup_of_candidate_id is not null;


-- ---------------------------------------------------------------------
-- 4. The guard triggers (contract section 5). They run automatically on
--    every write, behind the functions' own checks (defence in depth),
--    so even a write that skips the functions can't break the rules.
--    A refusal is errcode 23514 (check_violation) with a named
--    constraint, so the functions answer a status instead of an error.
--    In every guard:
--      v_tag  = the action tag the writing function set ('' = none)
--      v_hand = a hand fix (Jeffrey's SQL Editor: session_user postgres,
--               no tag)
--      "cascade" = pg_trigger_depth() > 1 AND the tag is
--               bb_delete_candidate or bb_delete_cycle (a removal of the
--               candidate or the cycle taking its rows with it)
-- ---------------------------------------------------------------------

-- 4a. bb_note_grading_started() - AFTER INSERT on bb_grades,
-- bb_extra_counts and bb_makeup_subjects: the first grading row of a
-- cycle writes its bb_cycle_grading_started row (later ones change
-- nothing: "on conflict do nothing"). A trigger, not a line in each
-- function, so EVERY way of writing a grading row records it. Not
-- security definer: every grading insert already runs as the owner.
create or replace function public.bb_note_grading_started()
returns trigger
language plpgsql
set search_path = ''
as $$
begin
  insert into public.bb_cycle_grading_started (cycle_id)
  select c.cycle_id from public.bb_candidates c where c.id = new.candidate_id
  on conflict (cycle_id) do nothing;
  return null;
end;
$$;

revoke execute on function public.bb_note_grading_started() from public, anon, authenticated, service_role;

-- 4b. bb_cycle_grading_started_guard() - BEFORE INSERT OR UPDATE OR DELETE
-- on bb_cycle_grading_started:
--   insert: only while a grading function is writing (or a hand fix);
--           stamps when and who (whatever the writer sent)
--   update: always refused
--   delete: only Delete cycle's cascade (even a hand fix is refused: the
--           Undo 0025 script removes the whole table instead)
create or replace function public.bb_cycle_grading_started_guard()
returns trigger
language plpgsql
set search_path = ''
as $$
declare
  v_tag  text := coalesce(current_setting('tkd.action', true), '');
  v_hand boolean := (session_user = 'postgres' and coalesce(current_setting('tkd.action', true), '') = '');
begin
  if tg_op = 'INSERT'
     and (v_hand or v_tag in ('bb_set_grade', 'bb_set_measured', 'bb_set_extra_count', 'bb_set_makeup_subjects', 'bb_add_makeup')) then
    new.started_at      := now();
    new.started_by      := auth.uid();
    new.started_by_name := public.change_log_actor_name();
    return new;
  end if;
  if tg_op = 'DELETE' and pg_trigger_depth() > 1 and v_tag = 'bb_delete_cycle' then
    return old;
  end if;
  raise exception using
    errcode    = '23514',
    constraint = 'bb_cycle_grading_started_immutable',
    message    = 'the "grading started" mark is written once by the first grade and goes only with its cycle';
end;
$$;

revoke execute on function public.bb_cycle_grading_started_guard() from public, anon, authenticated, service_role;

-- 4c. bb_grades_rules() - BEFORE INSERT OR UPDATE OR DELETE on bb_grades:
--   insert: by Set grade / Set measured (not kept), by Add make-up
--           (kept), or a hand fix
--   update: by Set grade / Set measured, and never of a kept row (not
--           even a hand fix)
--   delete: (a) Clear by Set grade / Set measured (not kept), (b) a Dan
--           change that clears grades (not kept), (c) a cascade of a KEPT
--           row (a real grade stops Delete permanently / Delete cycle,
--           Q-G3), (d) a hand fix
--   always on insert and update (a hand fix too): dan = the candidate's
--   current Dan; the subject exists in that Dan of the cycle's copy, in
--   the row's part; a graded subject has one of its part's letters and
--   no number; a measured subject has a number and a way that exists -
--   or is a kept letter of A+ A B+ B C (never D: the table rule)
create or replace function public.bb_grades_rules()
returns trigger
language plpgsql
set search_path = ''
as $$
declare
  v_tag     text := coalesce(current_setting('tkd.action', true), '');
  v_hand    boolean := (session_user = 'postgres' and coalesce(current_setting('tkd.action', true), '') = '');
  v_cascade boolean := pg_trigger_depth() > 1 and coalesce(current_setting('tkd.action', true), '') in ('bb_delete_candidate', 'bb_delete_cycle');
  v_dan     smallint;
  v_req     jsonb;
  v_s       jsonb;
begin
  if tg_op = 'DELETE' then
    if (v_tag in ('bb_set_grade', 'bb_set_measured') and not old.kept and pg_trigger_depth() = 1)
       or (v_tag = 'bb_clear_dan_grading' and not old.kept and pg_trigger_depth() = 1)
       or (v_cascade and old.kept)
       or v_hand then
      return old;
    end if;
    raise exception using
      errcode    = '23514',
      constraint = 'bb_grades_rules',
      message    = 'a grade is removed only by Clear (or with a kept row''s candidate)';
  end if;

  if tg_op = 'UPDATE' and (old.kept or v_tag not in ('bb_set_grade', 'bb_set_measured')) then
    raise exception using
      errcode    = '23514',
      constraint = 'bb_grades_rules',
      message    = 'a grade is changed only by the grading functions, and a kept grade never';
  end if;
  if tg_op = 'INSERT'
     and not (v_hand or (v_tag in ('bb_set_grade', 'bb_set_measured') and not new.kept) or (v_tag = 'bb_add_makeup' and new.kept)) then
    raise exception using
      errcode    = '23514',
      constraint = 'bb_grades_rules',
      message    = 'a grade is written only by the grading functions (kept grades only by Add make-up)';
  end if;

  -- the row must fit the cycle's copy (also for a hand fix)
  select c.dan, y.requirements into v_dan, v_req
    from public.bb_candidates c join public.bb_cycles y on y.id = c.cycle_id
   where c.id = new.candidate_id;
  if v_dan is null or new.dan <> v_dan then
    raise exception using
      errcode    = '23514',
      constraint = 'bb_grades_rules',
      message    = 'a grade must be for the candidate''s current Dan';
  end if;
  select s.e into v_s
    from jsonb_array_elements(v_req -> 'dans' -> (new.dan - 1) -> 'parts') as p(e)
    cross join lateral jsonb_array_elements(p.e -> 'subjects') as s(e)
   where p.e ->> 'code' = new.part_code and s.e ->> 'id' = new.subject_id
   limit 1;
  if v_s is null
     or (v_s ->> 'scoring' = 'graded'
         and not coalesce(new.letter = any (public.bb_rubric_letters(new.part_code, 'graded')) and new.measured is null, false))
     or (v_s ->> 'scoring' = 'measured'
         and not coalesce((new.measured is not null and new.way is not null and new.way < jsonb_array_length(v_s -> 'ways'))
                          or (new.kept and new.letter = any (public.bb_rubric_letters(new.part_code, 'measured'))), false))
     or v_s ->> 'scoring' not in ('graded', 'measured') then
    raise exception using
      errcode    = '23514',
      constraint = 'bb_grades_rules',
      message    = 'a grade must be for a subject of the cycle''s rubric, with a letter or number that subject can have';
  end if;
  return new;
end;
$$;

revoke execute on function public.bb_grades_rules() from public, anon, authenticated, service_role;

-- 4d. bb_extra_counts_rules() - BEFORE INSERT OR UPDATE OR DELETE on
-- bb_extra_counts: as 4c, with Set extra count (insert / update / Clear),
-- Add make-up (kept insert) and a Dan change that clears grades
-- (removal). Always: dan = the candidate's current Dan, and the item name
-- is EXACTLY an item of that Dan's extra points in the cycle's copy.
create or replace function public.bb_extra_counts_rules()
returns trigger
language plpgsql
set search_path = ''
as $$
declare
  v_tag     text := coalesce(current_setting('tkd.action', true), '');
  v_hand    boolean := (session_user = 'postgres' and coalesce(current_setting('tkd.action', true), '') = '');
  v_cascade boolean := pg_trigger_depth() > 1 and coalesce(current_setting('tkd.action', true), '') in ('bb_delete_candidate', 'bb_delete_cycle');
  v_dan     smallint;
  v_req     jsonb;
begin
  if tg_op = 'DELETE' then
    if (v_tag = 'bb_set_extra_count' and not old.kept and pg_trigger_depth() = 1)
       or (v_tag = 'bb_clear_dan_grading' and not old.kept and pg_trigger_depth() = 1)
       or (v_cascade and old.kept)
       or v_hand then
      return old;
    end if;
    raise exception using
      errcode    = '23514',
      constraint = 'bb_extra_counts_rules',
      message    = 'a count is removed only by Clear (or with a kept row''s candidate)';
  end if;

  if tg_op = 'UPDATE' and (old.kept or v_tag <> 'bb_set_extra_count') then
    raise exception using
      errcode    = '23514',
      constraint = 'bb_extra_counts_rules',
      message    = 'a count is changed only by Set extra count, and a kept count never';
  end if;
  if tg_op = 'INSERT'
     and not (v_hand or (v_tag = 'bb_set_extra_count' and not new.kept) or (v_tag = 'bb_add_makeup' and new.kept)) then
    raise exception using
      errcode    = '23514',
      constraint = 'bb_extra_counts_rules',
      message    = 'a count is written only by Set extra count (kept counts only by Add make-up)';
  end if;

  select c.dan, y.requirements into v_dan, v_req
    from public.bb_candidates c join public.bb_cycles y on y.id = c.cycle_id
   where c.id = new.candidate_id;
  if v_dan is null or new.dan <> v_dan
     or not exists (select 1
                      from jsonb_array_elements(case when jsonb_typeof(v_req -> 'dans' -> (new.dan - 1) -> 'extra_points' -> 'items') = 'array'
                                                     then v_req -> 'dans' -> (new.dan - 1) -> 'extra_points' -> 'items' else '[]'::jsonb end) as i(e)
                     where i.e ->> 'name' = new.item_name) then
    raise exception using
      errcode    = '23514',
      constraint = 'bb_extra_counts_rules',
      message    = 'a count must be for an extra-points item of the candidate''s Dan in the cycle''s rubric';
  end if;
  return new;
end;
$$;

revoke execute on function public.bb_extra_counts_rules() from public, anon, authenticated, service_role;

-- 4e. bb_makeup_subjects_rules() - BEFORE INSERT OR UPDATE OR DELETE on
-- bb_makeup_subjects:
--   insert: 'chosen' by Choose subjects, 'retest' by Add make-up, or a
--           hand fix; the subject exists in the candidate's Dan of the
--           cycle's copy, and dan = the candidate's current Dan
--   update: never
--   delete: 'chosen' by Choose subjects or a Dan change that clears
--           grades; 'retest' by a cascade (Undo of Add make-up, Delete
--           cycle); a hand fix
create or replace function public.bb_makeup_subjects_rules()
returns trigger
language plpgsql
set search_path = ''
as $$
declare
  v_tag     text := coalesce(current_setting('tkd.action', true), '');
  v_hand    boolean := (session_user = 'postgres' and coalesce(current_setting('tkd.action', true), '') = '');
  v_cascade boolean := pg_trigger_depth() > 1 and coalesce(current_setting('tkd.action', true), '') in ('bb_delete_candidate', 'bb_delete_cycle');
  v_dan     smallint;
  v_req     jsonb;
begin
  if tg_op = 'DELETE' then
    if (old.kind = 'chosen' and v_tag in ('bb_set_makeup_subjects', 'bb_clear_dan_grading') and pg_trigger_depth() = 1)
       or (old.kind = 'retest' and v_cascade)
       or v_hand then
      return old;
    end if;
    raise exception using
      errcode    = '23514',
      constraint = 'bb_makeup_subjects_rules',
      message    = 'a make-up subject is removed only by Choose subjects (or a retest with its make-up row)';
  end if;
  if tg_op = 'UPDATE'
     or not (v_hand or (new.kind = 'chosen' and v_tag = 'bb_set_makeup_subjects') or (new.kind = 'retest' and v_tag = 'bb_add_makeup')) then
    raise exception using
      errcode    = '23514',
      constraint = 'bb_makeup_subjects_rules',
      message    = 'make-up subjects are added only by Choose subjects or Add make-up, and never changed';
  end if;

  select c.dan, y.requirements into v_dan, v_req
    from public.bb_candidates c join public.bb_cycles y on y.id = c.cycle_id
   where c.id = new.candidate_id;
  if v_dan is null or new.dan <> v_dan
     or not exists (select 1
                      from jsonb_array_elements(v_req -> 'dans' -> (new.dan - 1) -> 'parts') as p(e)
                      cross join lateral jsonb_array_elements(p.e -> 'subjects') as s(e)
                     where s.e ->> 'id' = new.subject_id) then
    raise exception using
      errcode    = '23514',
      constraint = 'bb_makeup_subjects_rules',
      message    = 'a make-up subject must be a subject of the candidate''s Dan in the cycle''s rubric';
  end if;
  return new;
end;
$$;

revoke execute on function public.bb_makeup_subjects_rules() from public, anon, authenticated, service_role;

-- 4f. bb_result_sends_guard() - BEFORE INSERT OR UPDATE OR DELETE on
-- bb_result_sends:
--   insert: only by Mark as sent; stamps when and who (whatever the
--           writer sent) and starts not undone
--   update: only by Undo Mark as sent, only the undone_* columns, once,
--           from empty (stamped here)
--   delete: only by a cascade (the candidate is removed) or a hand fix
create or replace function public.bb_result_sends_guard()
returns trigger
language plpgsql
set search_path = ''
as $$
declare
  v_tag  text := coalesce(current_setting('tkd.action', true), '');
  v_hand boolean := (session_user = 'postgres' and coalesce(current_setting('tkd.action', true), '') = '');
begin
  if tg_op = 'INSERT' and v_tag = 'bb_mark_result_sent' then
    new.marked_at      := now();
    new.marked_by      := auth.uid();
    new.marked_by_name := public.change_log_actor_name();
    new.undone_at      := null;
    new.undone_by      := null;
    new.undone_by_name := null;
    return new;
  end if;
  if tg_op = 'UPDATE' and v_tag = 'bb_undo_result_sent' and old.undone_at is null
     and (to_jsonb(new) - array['undone_at', 'undone_by', 'undone_by_name'])
         = (to_jsonb(old) - array['undone_at', 'undone_by', 'undone_by_name']) then
    new.undone_at      := now();
    new.undone_by      := auth.uid();
    new.undone_by_name := public.change_log_actor_name();
    return new;
  end if;
  if tg_op = 'DELETE'
     and ((pg_trigger_depth() > 1 and v_tag in ('bb_delete_candidate', 'bb_delete_cycle')) or v_hand) then
    return old;
  end if;
  raise exception using
    errcode    = '23514',
    constraint = 'bb_result_sends_immutable',
    message    = 'a "sent" mark is written by Mark as sent and only ever undone, once';
end;
$$;

revoke execute on function public.bb_result_sends_guard() from public, anon, authenticated, service_role;

-- 4g. bb_downloads_guard() - BEFORE INSERT OR UPDATE OR DELETE on
-- bb_downloads: a row is added only by bb_results_csv (stamped here) and
-- is never changed or removed by anyone.
create or replace function public.bb_downloads_guard()
returns trigger
language plpgsql
set search_path = ''
as $$
begin
  if tg_op = 'INSERT' and coalesce(current_setting('tkd.action', true), '') = 'bb_results_csv' then
    new.downloaded_at      := now();
    new.downloaded_by      := auth.uid();
    new.downloaded_by_name := public.change_log_actor_name();
    return new;
  end if;
  raise exception using
    errcode    = '23514',
    constraint = 'bb_downloads_immutable',
    message    = 'the download log is written only by the results CSV and is never changed or removed';
end;
$$;

revoke execute on function public.bb_downloads_guard() from public, anon, authenticated, service_role;

-- 4h. bb_payments_makeup_guard() - BEFORE INSERT on bb_payments: a make-up
-- row never has money (v0.941: no fee, so no payment, refund, reversal or
-- returned check). No hand-fix exception on purpose: money for a make-up
-- row is never right. (0016's own bb_payments_guard is unchanged.)
create or replace function public.bb_payments_makeup_guard()
returns trigger
language plpgsql
set search_path = ''
as $$
begin
  if exists (select 1 from public.bb_candidates c where c.id = new.candidate_id and c.source = 'makeup') then
    raise exception using
      errcode    = '23514',
      constraint = 'bb_payments_makeup',
      message    = 'a make-up candidate has no fee: no payment, refund or correction is recorded for it';
  end if;
  return new;
end;
$$;

revoke execute on function public.bb_payments_makeup_guard() from public, anon, authenticated, service_role;

-- 4i. bb_candidates_keep_age() - BEFORE UPDATE on bb_candidates (Q-G2, a
-- 0025-only name that 0016 never replaces - review S1):
--   (i)   a date of birth that goes from "on file" to empty needs age_kept
--         set, equal to the age on the row's cycle's first testing day
--         worked out from the OLD date of birth
--   (ii)  a kept age never changes
--   (iii) an age is kept only together with (i), by the purge
-- No hand-fix exception (OI-8). So if 0016 were pasted again over 0025
-- (its purge doesn't keep the age), the purge FAILS loudly instead of
-- losing the age quietly.
create or replace function public.bb_candidates_keep_age()
returns trigger
language plpgsql
set search_path = ''
as $$
begin
  if old.date_of_birth is not null and new.date_of_birth is null
     and not coalesce(new.age_kept = public.bb_age_on(old.date_of_birth,
                                                       (select min(d.day_date) from public.bb_cycle_days d where d.cycle_id = old.cycle_id)),
                      false) then
    raise exception using
      errcode    = '23514',
      constraint = 'bb_candidates_age_kept_required',
      message    = 'removing a date of birth must keep the age on the first testing day (age_kept)';
  end if;
  if old.age_kept is not null and new.age_kept is distinct from old.age_kept then
    raise exception using
      errcode    = '23514',
      constraint = 'bb_candidates_age_kept_immutable',
      message    = 'a kept age never changes';
  end if;
  if old.age_kept is null and new.age_kept is not null
     and not (old.date_of_birth is not null and new.date_of_birth is null
              and coalesce(current_setting('tkd.action', true), '') = 'bb_purge_due') then
    raise exception using
      errcode    = '23514',
      constraint = 'bb_candidates_age_kept_required',
      message    = 'an age is kept only by the purge, when it removes the date of birth';
  end if;
  return new;
end;
$$;

revoke execute on function public.bb_candidates_keep_age() from public, anon, authenticated, service_role;

-- 4j. bb_cycle_days_grading() - BEFORE INSERT OR UPDATE OR DELETE on
-- bb_cycle_days (S2, v0.900 detail 4). Skipped for a hand fix and inside
-- Delete cycle's cascade.
--   (i)  a day on or before today can't be removed, or its date changed,
--        while a real grade of the cycle is in one of that day's parts
--        (bb_cycle_days_has_grades)
--   (ii) the first-day freeze while the cycle has any grading row (the
--        age is worked out on the first testing day, so it must not move):
--        no new day before the first day, no day moved before it, and the
--        first day itself can't move or go unless another day is on the
--        same date (bb_cycle_first_day_frozen)
create or replace function public.bb_cycle_days_grading()
returns trigger
language plpgsql
set search_path = ''
as $$
declare
  v_tag   text := coalesce(current_setting('tkd.action', true), '');
  v_hand  boolean := (session_user = 'postgres' and coalesce(current_setting('tkd.action', true), '') = '');
  v_cycle uuid;
  v_first date;
begin
  if v_hand or (v_tag = 'bb_delete_cycle' and pg_trigger_depth() > 1) then
    return case when tg_op = 'DELETE' then old else new end;
  end if;
  v_cycle := case when tg_op = 'INSERT' then new.cycle_id else old.cycle_id end;

  -- (i) a past day whose parts have real grades
  if (tg_op = 'DELETE' or (tg_op = 'UPDATE' and new.day_date is distinct from old.day_date))
     and old.day_date <= public.testing_today()
     and exists (select 1
                   from public.bb_grades g
                   join public.bb_candidates c on c.id = g.candidate_id
                  where c.cycle_id = old.cycle_id
                    and not g.kept
                    and g.part_code in (select p.part from public.bb_cycle_day_parts p where p.day_id = old.id)) then
    raise exception using
      errcode    = '23514',
      constraint = 'bb_cycle_days_has_grades',
      message    = 'a testing day that has passed and has grades can''t be removed or moved';
  end if;

  -- (ii) the first-day freeze
  if public.bb_cycle_has_grading(v_cycle) then
    select min(d.day_date) into v_first from public.bb_cycle_days d where d.cycle_id = v_cycle;
    if (tg_op in ('INSERT', 'UPDATE') and new.day_date < v_first)
       or (tg_op in ('UPDATE', 'DELETE') and old.day_date = v_first
           and (tg_op = 'DELETE' or new.day_date <> v_first)
           and not exists (select 1 from public.bb_cycle_days d
                            where d.cycle_id = v_cycle and d.id <> old.id and d.day_date = v_first)) then
      raise exception using
        errcode    = '23514',
        constraint = 'bb_cycle_first_day_frozen',
        message    = 'the first testing day can''t move (or get an earlier day) once grading started';
    end if;
  end if;
  return case when tg_op = 'DELETE' then old else new end;
end;
$$;

revoke execute on function public.bb_cycle_days_grading() from public, anon, authenticated, service_role;

-- 4k. bb_cycle_day_parts_grading() - BEFORE DELETE on bb_cycle_day_parts
-- (S2): a part can't be taken off a day on or before today while a real
-- grade of the cycle is in that part. (Adding a part is never refused.)
-- Same skips as 4j.
create or replace function public.bb_cycle_day_parts_grading()
returns trigger
language plpgsql
set search_path = ''
as $$
declare
  v_tag  text := coalesce(current_setting('tkd.action', true), '');
  v_hand boolean := (session_user = 'postgres' and coalesce(current_setting('tkd.action', true), '') = '');
begin
  if v_hand or (v_tag = 'bb_delete_cycle' and pg_trigger_depth() > 1) then
    return old;
  end if;
  if exists (select 1
               from public.bb_cycle_days d
               join public.bb_candidates c on c.cycle_id = d.cycle_id
               join public.bb_grades g on g.candidate_id = c.id
              where d.id = old.day_id
                and d.day_date <= public.testing_today()
                and not g.kept
                and g.part_code = old.part) then
    raise exception using
      errcode    = '23514',
      constraint = 'bb_cycle_day_parts_has_grades',
      message    = 'a part with grades can''t be taken off a testing day that has passed';
  end if;
  return old;
end;
$$;

revoke execute on function public.bb_cycle_day_parts_grading() from public, anon, authenticated, service_role;


-- ---------------------------------------------------------------------
-- 5. REPLACED 0016 / 0024 trigger functions and the bb_candidates
--    version trigger (contract 6.1). Each keeps everything the old one
--    did and adds only what is listed; never by editing 0016 / 0024.
-- ---------------------------------------------------------------------

-- 5a. bb_candidates_rules() - REPLACES 0016's (11h). BEFORE INSERT OR
-- UPDATE on candidates. 0016's two rules (a possible duplicate is in the
-- same cycle; a removed date of birth or email can't come back), plus:
--   (a) a make-up row is added only by Add make-up (or a hand fix), and
--       points at a candidate of ANOTHER cycle with the same Dan and the
--       same reference (bb_candidates_makeup_reference)
--   (b) makeup_of_candidate_id never changes, except to empty (when the
--       earlier row is removed) (bb_candidates_makeup_of_immutable)
--   (c) a make-up row's Dan never changes (bb_candidates_makeup_dan)
--   (d) age_kept is empty on insert (bb_candidates_age_kept_immutable);
--       the update rules for age_kept are in bb_candidates_keep_age (4i)
create or replace function public.bb_candidates_rules()
returns trigger
language plpgsql
set search_path = ''
as $$
-- 0025: replaced
declare
  v_tag  text := coalesce(current_setting('tkd.action', true), '');
  v_hand boolean := (session_user = 'postgres' and coalesce(current_setting('tkd.action', true), '') = '');
begin
  if new.duplicate_of is not null
     and not exists (select 1 from public.bb_candidates m
                      where m.id = new.duplicate_of and m.cycle_id = new.cycle_id) then
    raise exception using
      errcode    = '23514',
      constraint = 'bb_candidates_duplicate_cycle',
      message    = 'a possible duplicate must be in the same cycle';
  end if;
  if tg_op = 'UPDATE' and old.personal_removed_at is not null
     and (new.personal_removed_at is distinct from old.personal_removed_at
          or new.date_of_birth is not null or new.email_for_results is not null) then
    raise exception using
      errcode    = '23514',
      constraint = 'bb_candidates_personal_removed',
      message    = 'a removed date of birth or email can''t come back';
  end if;
  -- (a) a make-up row: only Add make-up, pointing at the right earlier row
  if tg_op = 'INSERT' and new.source = 'makeup'
     and not ((v_hand or v_tag = 'bb_add_makeup')
              and new.makeup_of_candidate_id is not null
              and exists (select 1 from public.bb_candidates m
                           where m.id = new.makeup_of_candidate_id
                             and m.cycle_id <> new.cycle_id
                             and m.dan = new.dan
                             and m.reference = new.reference)) then
    raise exception using
      errcode    = '23514',
      constraint = 'bb_candidates_makeup_reference',
      message    = 'a make-up row is added by Add make-up and points at the same person (same reference and Dan) in another cycle';
  end if;
  -- (b) the earlier row never changes (only to empty, when it is removed)
  if tg_op = 'UPDATE' and new.makeup_of_candidate_id is distinct from old.makeup_of_candidate_id
     and new.makeup_of_candidate_id is not null then
    raise exception using
      errcode    = '23514',
      constraint = 'bb_candidates_makeup_of_immutable',
      message    = 'a make-up row always points at the same earlier candidate';
  end if;
  -- (c) a make-up row keeps its Dan
  if tg_op = 'UPDATE' and old.source = 'makeup' and new.dan is distinct from old.dan then
    raise exception using
      errcode    = '23514',
      constraint = 'bb_candidates_makeup_dan',
      message    = 'a make-up row''s Dan never changes';
  end if;
  -- (d) no kept age on a new row
  if tg_op = 'INSERT' and new.age_kept is not null then
    raise exception using
      errcode    = '23514',
      constraint = 'bb_candidates_age_kept_immutable',
      message    = 'an age is kept only by the purge';
  end if;
  return new;
end;
$$;

revoke execute on function public.bb_candidates_rules() from public, anon, authenticated, service_role;

-- 5b. bb_candidates_log() - REPLACES 0016's (11i). The same history row,
-- with the date of birth, the email AND the kept age masked (Q-G2
-- safeguard 4), for every row, make-ups included:
--   insert -> after "on file" (or null)
--   delete -> before "on file" (or null)
--   update -> only when the value changed: before "on file" (or null),
--             after "changed" (or null)
-- The number itself never reaches change_log.
create or replace function public.bb_candidates_log()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
-- 0025: replaced
declare
  v_secret text[] := array['date_of_birth', 'email_for_results', 'age_kept'];
  v_old    jsonb;
  v_new    jsonb;
  v_before jsonb;
  v_after  jsonb;
  v_row    jsonb;
  v_col    text;
begin
  if tg_op = 'INSERT' then
    v_new   := to_jsonb(new);
    v_after := (v_new - v_secret)
               || jsonb_build_object('date_of_birth', case when new.date_of_birth is null then null else 'on file' end,
                                     'email_for_results', case when new.email_for_results is null then null else 'on file' end,
                                     'age_kept', case when new.age_kept is null then null else 'on file' end);
    v_row   := v_new;
  elsif tg_op = 'UPDATE' then
    v_old := to_jsonb(old);
    v_new := to_jsonb(new);
    -- every other column: only the ones whose value changed, in full
    select jsonb_object_agg(o.key, o.value) into v_before
      from jsonb_each(v_old - v_secret) as o(key, value)
     where o.value is distinct from v_new -> o.key;
    select jsonb_object_agg(n.key, n.value) into v_after
      from jsonb_each(v_new - v_secret) as n(key, value)
     where n.value is distinct from v_old -> n.key;
    -- the secrets: masked, and only when they changed
    foreach v_col in array v_secret loop
      if v_old -> v_col is distinct from v_new -> v_col then
        v_before := coalesce(v_before, '{}'::jsonb)
                    || jsonb_build_object(v_col, case when jsonb_typeof(v_old -> v_col) = 'null' then null else 'on file' end);
        v_after  := coalesce(v_after, '{}'::jsonb)
                    || jsonb_build_object(v_col, case when jsonb_typeof(v_new -> v_col) = 'null' then null else 'changed' end);
      end if;
    end loop;
    if v_before is null and v_after is null then
      return null;
    end if;
    v_row := v_new;
  else
    v_old    := to_jsonb(old);
    v_before := (v_old - v_secret)
                || jsonb_build_object('date_of_birth', case when old.date_of_birth is null then null else 'on file' end,
                                      'email_for_results', case when old.email_for_results is null then null else 'on file' end,
                                      'age_kept', case when old.age_kept is null then null else 'on file' end);
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
     v_row ->> 'location_code',
     lower(tg_op),
     v_before,
     v_after);
  return null;
end;
$$;

revoke execute on function public.bb_candidates_log() from public, anon, authenticated, service_role;

-- 5c. bb_cycles_rules() - REPLACES 0024's (6c). Everything 0024's did,
-- plus: Save / Undo of a cycle's Dan (rule (b)) also needs the cycle to
-- have NO "grading started" mark (Q-G1 A + OI-2 B): once the cycle's
-- first grading row of any kind was written, its rubric is locked FOR
-- GOOD, in the table itself, even after every grade is cleared again.
-- The constraint name, the hand fix and the version 1 upgrade rule are
-- unchanged.
create or replace function public.bb_cycles_rules()
returns trigger
language plpgsql
set search_path = ''
as $$
-- 0025: replaced
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
                  and old.first_opened_at is null and new.first_opened_at is null
                  and public.bb_cycle_grading_started_at(new.id) is null)
              or (v_tag = 'bb_rubric_upgrade' and old.requirements -> 'schema_version' = '1'::jsonb)) then
    raise exception using
      errcode    = '23514',
      constraint = 'bb_cycles_requirements_immutable',
      message    = 'a cycle''s rubric is locked once registration has opened or grading started (or is changed only through Save on its Rubric tab)';
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


-- ---------------------------------------------------------------------
-- 5d. Attach the triggers ("drop trigger if exists" + create = replace).
-- PostgreSQL runs BEFORE triggers of one table in name order, so
-- <table>_before_write always runs before <table>_rules / _guard.
-- ---------------------------------------------------------------------

-- bb_candidates: the version bookkeeping again (0016 11m), with the new
-- columns: makeup_of_cycle_name never changes; makeup_of_candidate_id and
-- age_kept change without a version bump (the earlier row's removal sets
-- the first to empty; the purge sets the second), so an open dialog never
-- goes stale because of them.
drop trigger if exists bb_candidates_before_write on public.bb_candidates;
create trigger bb_candidates_before_write
  before insert or update on public.bb_candidates
  for each row execute function public.bb_before_write(
    'id,cycle_id,source,reference,registered_at,makeup_of_cycle_name',
    'date_of_birth,email_for_results,personal_removed_at,makeup_of_candidate_id,age_kept');

drop trigger if exists bb_candidates_keep_age on public.bb_candidates;
create trigger bb_candidates_keep_age
  before update on public.bb_candidates
  for each row execute function public.bb_candidates_keep_age();

drop trigger if exists bb_payments_makeup_guard on public.bb_payments;
create trigger bb_payments_makeup_guard
  before insert on public.bb_payments
  for each row execute function public.bb_payments_makeup_guard();

drop trigger if exists bb_cycle_days_grading on public.bb_cycle_days;
create trigger bb_cycle_days_grading
  before insert or update or delete on public.bb_cycle_days
  for each row execute function public.bb_cycle_days_grading();

drop trigger if exists bb_cycle_day_parts_grading on public.bb_cycle_day_parts;
create trigger bb_cycle_day_parts_grading
  before delete on public.bb_cycle_day_parts
  for each row execute function public.bb_cycle_day_parts_grading();

-- bb_grades
drop trigger if exists bb_grades_before_write on public.bb_grades;
create trigger bb_grades_before_write
  before insert or update on public.bb_grades
  for each row execute function public.bb_before_write(
    'id,candidate_id,dan,part_code,subject_id,kept,kept_from_cycle_id,kept_from_cycle_name', '');

drop trigger if exists bb_grades_rules on public.bb_grades;
create trigger bb_grades_rules
  before insert or update or delete on public.bb_grades
  for each row execute function public.bb_grades_rules();

drop trigger if exists bb_grades_grading_started on public.bb_grades;
create trigger bb_grades_grading_started
  after insert on public.bb_grades
  for each row execute function public.bb_note_grading_started();

drop trigger if exists bb_grades_log on public.bb_grades;
create trigger bb_grades_log
  after insert or update or delete on public.bb_grades
  for each row execute function public.change_log_write();

drop trigger if exists bb_grades_no_truncate on public.bb_grades;
create trigger bb_grades_no_truncate
  before truncate on public.bb_grades
  for each statement execute function public.testing_refuse_truncate();

-- bb_extra_counts
drop trigger if exists bb_extra_counts_before_write on public.bb_extra_counts;
create trigger bb_extra_counts_before_write
  before insert or update on public.bb_extra_counts
  for each row execute function public.bb_before_write(
    'id,candidate_id,dan,item_name,kept,kept_from_cycle_id,kept_from_cycle_name', '');

drop trigger if exists bb_extra_counts_rules on public.bb_extra_counts;
create trigger bb_extra_counts_rules
  before insert or update or delete on public.bb_extra_counts
  for each row execute function public.bb_extra_counts_rules();

drop trigger if exists bb_extra_counts_grading_started on public.bb_extra_counts;
create trigger bb_extra_counts_grading_started
  after insert on public.bb_extra_counts
  for each row execute function public.bb_note_grading_started();

drop trigger if exists bb_extra_counts_log on public.bb_extra_counts;
create trigger bb_extra_counts_log
  after insert or update or delete on public.bb_extra_counts
  for each row execute function public.change_log_write();

drop trigger if exists bb_extra_counts_no_truncate on public.bb_extra_counts;
create trigger bb_extra_counts_no_truncate
  before truncate on public.bb_extra_counts
  for each statement execute function public.testing_refuse_truncate();

-- bb_makeup_subjects
drop trigger if exists bb_makeup_subjects_before_write on public.bb_makeup_subjects;
create trigger bb_makeup_subjects_before_write
  before insert or update on public.bb_makeup_subjects
  for each row execute function public.bb_before_write('id,candidate_id,dan,subject_id,kind', '');

drop trigger if exists bb_makeup_subjects_rules on public.bb_makeup_subjects;
create trigger bb_makeup_subjects_rules
  before insert or update or delete on public.bb_makeup_subjects
  for each row execute function public.bb_makeup_subjects_rules();

drop trigger if exists bb_makeup_subjects_grading_started on public.bb_makeup_subjects;
create trigger bb_makeup_subjects_grading_started
  after insert on public.bb_makeup_subjects
  for each row execute function public.bb_note_grading_started();

drop trigger if exists bb_makeup_subjects_log on public.bb_makeup_subjects;
create trigger bb_makeup_subjects_log
  after insert or update or delete on public.bb_makeup_subjects
  for each row execute function public.change_log_write();

drop trigger if exists bb_makeup_subjects_no_truncate on public.bb_makeup_subjects;
create trigger bb_makeup_subjects_no_truncate
  before truncate on public.bb_makeup_subjects
  for each statement execute function public.testing_refuse_truncate();

-- bb_result_texts
drop trigger if exists bb_result_texts_before_write on public.bb_result_texts;
create trigger bb_result_texts_before_write
  before insert or update on public.bb_result_texts
  for each row execute function public.bb_before_write('id,kind', '');

drop trigger if exists bb_result_texts_log on public.bb_result_texts;
create trigger bb_result_texts_log
  after insert or update or delete on public.bb_result_texts
  for each row execute function public.change_log_write();

drop trigger if exists bb_result_texts_no_truncate on public.bb_result_texts;
create trigger bb_result_texts_no_truncate
  before truncate on public.bb_result_texts
  for each statement execute function public.testing_refuse_truncate();

-- bb_result_sends
drop trigger if exists bb_result_sends_guard on public.bb_result_sends;
create trigger bb_result_sends_guard
  before insert or update or delete on public.bb_result_sends
  for each row execute function public.bb_result_sends_guard();

drop trigger if exists bb_result_sends_log on public.bb_result_sends;
create trigger bb_result_sends_log
  after insert or update or delete on public.bb_result_sends
  for each row execute function public.change_log_write();

drop trigger if exists bb_result_sends_no_truncate on public.bb_result_sends;
create trigger bb_result_sends_no_truncate
  before truncate on public.bb_result_sends
  for each statement execute function public.testing_refuse_truncate();

-- bb_downloads (not in change_log on purpose)
drop trigger if exists bb_downloads_guard on public.bb_downloads;
create trigger bb_downloads_guard
  before insert or update or delete on public.bb_downloads
  for each row execute function public.bb_downloads_guard();

drop trigger if exists bb_downloads_no_truncate on public.bb_downloads;
create trigger bb_downloads_no_truncate
  before truncate on public.bb_downloads
  for each statement execute function public.testing_refuse_truncate();

-- bb_cycle_grading_started
drop trigger if exists bb_cycle_grading_started_guard on public.bb_cycle_grading_started;
create trigger bb_cycle_grading_started_guard
  before insert or update or delete on public.bb_cycle_grading_started
  for each row execute function public.bb_cycle_grading_started_guard();

drop trigger if exists bb_cycle_grading_started_log on public.bb_cycle_grading_started;
create trigger bb_cycle_grading_started_log
  after insert or delete on public.bb_cycle_grading_started
  for each row execute function public.change_log_write();

drop trigger if exists bb_cycle_grading_started_no_truncate on public.bb_cycle_grading_started;
create trigger bb_cycle_grading_started_no_truncate
  before truncate on public.bb_cycle_grading_started
  for each statement execute function public.testing_refuse_truncate();


-- ---------------------------------------------------------------------
-- 6. Internal readers (contract 7.0). Nobody in the app can call them;
--    the staff functions below use them.
-- ---------------------------------------------------------------------

-- 6a. bb_cycle_grading_started_at(cycle) - when the cycle got its first
-- grading row (2g), or NULL (= its rubric isn't locked by grading).
create or replace function public.bb_cycle_grading_started_at(p_cycle_id uuid)
returns timestamptz
language sql
stable
set search_path = ''
as $$
  select g.started_at from public.bb_cycle_grading_started g where g.cycle_id = p_cycle_id;
$$;

revoke execute on function public.bb_cycle_grading_started_at(uuid) from public, anon, authenticated, service_role;

-- 6b. bb_cycle_has_grading(cycle) - does any candidate of the cycle have
-- any grading row right now (kept and retest rows included)? Used by the
-- first-day freeze (S2), which follows the live rows.
create or replace function public.bb_cycle_has_grading(p_cycle_id uuid)
returns boolean
language sql
stable
set search_path = ''
as $$
  select exists (select 1 from public.bb_grades g join public.bb_candidates c on c.id = g.candidate_id where c.cycle_id = p_cycle_id)
      or exists (select 1 from public.bb_extra_counts g join public.bb_candidates c on c.id = g.candidate_id where c.cycle_id = p_cycle_id)
      or exists (select 1 from public.bb_makeup_subjects g join public.bb_candidates c on c.id = g.candidate_id where c.cycle_id = p_cycle_id);
$$;

revoke execute on function public.bb_cycle_has_grading(uuid) from public, anon, authenticated, service_role;

-- 6c. bb_candidate_has_grades(candidate) - does the candidate have any REAL
-- grade (Q-G3): a grade or count that isn't kept, or a chosen make-up
-- subject? (A just-added make-up with only kept and retest rows has none,
-- so its Undo still works.)
create or replace function public.bb_candidate_has_grades(p_candidate_id uuid)
returns boolean
language sql
stable
set search_path = ''
as $$
  select exists (select 1 from public.bb_grades g where g.candidate_id = p_candidate_id and not g.kept)
      or exists (select 1 from public.bb_extra_counts g where g.candidate_id = p_candidate_id and not g.kept)
      or exists (select 1 from public.bb_makeup_subjects m where m.candidate_id = p_candidate_id and m.kind = 'chosen');
$$;

revoke execute on function public.bb_candidate_has_grades(uuid) from public, anon, authenticated, service_role;

-- 6d. bb_candidate_age(candidate) - whole years on the first testing day
-- of the row's OWN cycle (a make-up row: its later cycle), from the date
-- of birth when it is on file, else the kept age (Q-G2), else NULL. Used
-- ONLY inside the database: no function ever answers it.
create or replace function public.bb_candidate_age(p_candidate_id uuid)
returns integer
language sql
stable
set search_path = ''
as $$
  select case when c.date_of_birth is not null
              then public.bb_age_on(c.date_of_birth, (select min(d.day_date) from public.bb_cycle_days d where d.cycle_id = c.cycle_id))
              else c.age_kept::integer end
    from public.bb_candidates c
   where c.id = p_candidate_id;
$$;

revoke execute on function public.bb_candidate_age(uuid) from public, anon, authenticated, service_role;

-- 6e. bb_candidate_grading_input(candidate, Dan) - the candidate's grading
-- rows of that Dan, in the shape bb_grade_result takes:
--   {"grades": [{subject_id, letter, measured, way, kept, kept_from_cycle_name}],
--    "counts": [{item_name, count, kept}], "retest": [ids], "chosen": [ids]}
create or replace function public.bb_candidate_grading_input(p_candidate_id uuid, p_dan integer)
returns jsonb
language sql
stable
set search_path = ''
as $$
  select jsonb_build_object(
    'grades', coalesce((select jsonb_agg(jsonb_build_object('subject_id', g.subject_id, 'letter', g.letter, 'measured', g.measured,
                                                            'way', g.way, 'kept', g.kept, 'kept_from_cycle_name', g.kept_from_cycle_name)
                                         order by g.subject_id collate "C")
                          from public.bb_grades g where g.candidate_id = p_candidate_id and g.dan = p_dan), '[]'::jsonb),
    'counts', coalesce((select jsonb_agg(jsonb_build_object('item_name', x.item_name, 'count', x.count, 'kept', x.kept)
                                         order by x.item_name collate "C")
                          from public.bb_extra_counts x where x.candidate_id = p_candidate_id and x.dan = p_dan), '[]'::jsonb),
    'retest', coalesce((select jsonb_agg(m.subject_id order by m.subject_id collate "C")
                          from public.bb_makeup_subjects m
                         where m.candidate_id = p_candidate_id and m.dan = p_dan and m.kind = 'retest'), '[]'::jsonb),
    'chosen', coalesce((select jsonb_agg(m.subject_id order by m.subject_id collate "C")
                          from public.bb_makeup_subjects m
                         where m.candidate_id = p_candidate_id and m.dan = p_dan and m.kind = 'chosen'), '[]'::jsonb));
$$;

revoke execute on function public.bb_candidate_grading_input(uuid, integer) from public, anon, authenticated, service_role;

-- 6f. bb_candidate_result_with(candidate row, Dan object, first day,
-- submissions due, today) - one candidate's result, with the copy loaded
-- ONCE by the caller (the lists: no document loading per row, S22). A
-- withdrawn row answers status 'withdrawn' (reasons, needs empty, no
-- choice needed, the same key for every withdrawn row: md5('withdrawn|||')),
-- everything else still worked out (Restore brings it back, S14).
create or replace function public.bb_candidate_result_with(
  p_candidate       public.bb_candidates,
  p_dan             jsonb,
  p_first_day       date,
  p_submissions_due date,
  p_today           date
)
returns jsonb
language plpgsql
stable
set search_path = ''
as $$
declare
  v_age integer;
  v_in  jsonb;
  v_r   jsonb;
begin
  if p_candidate.id is null or p_dan is null then
    return null;
  end if;
  v_age := case when p_candidate.date_of_birth is not null then public.bb_age_on(p_candidate.date_of_birth, p_first_day)
                else p_candidate.age_kept::integer end;
  v_in := public.bb_candidate_grading_input(p_candidate.id, p_candidate.dan);
  v_r := public.bb_grade_result(p_dan, v_age, v_in -> 'grades', v_in -> 'counts',
                                array(select jsonb_array_elements_text(v_in -> 'retest')),
                                array(select jsonb_array_elements_text(v_in -> 'chosen')),
                                p_today, p_submissions_due);
  if p_candidate.status = 'withdrawn' then
    v_r := v_r || jsonb_build_object('status', 'withdrawn', 'reasons', '[]'::jsonb, 'needs', '[]'::jsonb,
                                     'choice_needed', false, 'result_key', md5('withdrawn|||'));
  end if;
  return v_r;
end;
$$;

revoke execute on function public.bb_candidate_result_with(public.bb_candidates, jsonb, date, date, date) from public, anon, authenticated, service_role;

-- 6g. bb_candidate_result(candidate) - one candidate's result: its own
-- cycle's copy (the Dan of the candidate), its age, testing_today() and
-- the cycle's Submissions due. NULL for an unknown candidate.
create or replace function public.bb_candidate_result(p_candidate_id uuid)
returns jsonb
language plpgsql
stable
set search_path = ''
as $$
declare
  v_c   public.bb_candidates;
  v_y   public.bb_cycles;
begin
  select * into v_c from public.bb_candidates c where c.id = p_candidate_id;
  if not found then
    return null;
  end if;
  select * into v_y from public.bb_cycles y where y.id = v_c.cycle_id;
  return public.bb_candidate_result_with(v_c, v_y.requirements -> 'dans' -> (v_c.dan - 1),
                                         (select min(d.day_date) from public.bb_cycle_days d where d.cycle_id = v_c.cycle_id),
                                         v_y.submissions_due, public.testing_today());
end;
$$;

revoke execute on function public.bb_candidate_result(uuid) from public, anon, authenticated, service_role;

-- 6h. bb_sent_state(candidate, result) - "Mark as sent" as the screen
-- shows it (Star's star_sent_state): the newest send that wasn't undone
-- ({id, marked_at, marked_by_name, result_status} or null) and whether it
-- still MATCHES the current result (the same result_key; a changed result
-- shows "Not sent yet" again, v0.170).
create or replace function public.bb_sent_state(p_candidate_id uuid, p_result jsonb)
returns jsonb
language sql
stable
set search_path = ''
as $$
  select jsonb_build_object(
           'sent', case when s.id is null then null
                        else jsonb_build_object('id', s.id, 'marked_at', s.marked_at,
                                                'marked_by_name', s.marked_by_name,
                                                'result_status', s.result_status) end,
           'matches', coalesce(s.result_key = (p_result ->> 'result_key'), false))
    from (select 1) as one
    left join lateral (select r.id, r.marked_at, r.marked_by_name, r.result_status, r.result_key
                         from public.bb_result_sends r
                        where r.candidate_id = p_candidate_id and r.undone_at is null
                        order by r.marked_at desc, r.id desc
                        limit 1) as s on true;
$$;

revoke execute on function public.bb_sent_state(uuid, jsonb) from public, anon, authenticated, service_role;

-- 6i. bb_lock_candidate_shared(candidate) - the start of the three grade
-- writes: finds the candidate's cycle, locks the cycle "for share", then
-- the candidate "for update", and returns the locked candidate (all
-- fields NULL if it is gone). WHY "for share": graders on many tablets
-- don't block each other (several "for share" locks fit together), but a
-- rubric save or a candidate / payment write ("for no key update") waits
-- for them and they for it - so a first grade and a rubric save never
-- happen at the same time (Q-G1). The grade writes never update the cycle
-- row, so this lock is never upgraded (no deadlock).
-- locks: cycle (share) -> candidate (update)
create or replace function public.bb_lock_candidate_shared(p_candidate_id uuid)
returns public.bb_candidates
language plpgsql
volatile
set search_path = ''
as $$
declare
  v_cycle_id uuid;
  v_c        public.bb_candidates;
begin
  select c.cycle_id into v_cycle_id from public.bb_candidates c where c.id = p_candidate_id;
  if not found then
    return null;
  end if;
  perform 1 from public.bb_cycles y where y.id = v_cycle_id for share;
  select * into v_c from public.bb_candidates c where c.id = p_candidate_id for update;
  return v_c;
end;
$$;

revoke execute on function public.bb_lock_candidate_shared(uuid) from public, anon, authenticated, service_role;


-- ---------------------------------------------------------------------
-- 7. The staff WRITE functions (contract 7.1). Same pattern as 0016
--    section 15 and 0024 section 10:
--   * returns {"status": ...}; roles: S = staff (incl. the shared desk)
--     and admins, A = admins only
--   * checks in this order: 1 has_data_access() FIRST (no_access), 2 the
--     role (not_allowed), 3 the input (invalid) - nothing is looked up
--     before 1-2 - 4 it locks and looks up the rows (not_found), 5 "did
--     the screen see the latest?" (stale), 6 the rules that depend on
--     the data, 7 it writes
--   * tags its writes with tkd.action (= the function's name) + one new
--     tkd.batch_id, and clears both after writing
--   * the whole body is inside begin ... exception ... end: if a table
--     rule still says no, everything this call did is undone and a status
--     is answered instead of an error:
--       the cycle-name index -> duplicate_name; any other unique rule ->
--       stale; foreign key / check / not-null rule -> invalid; a number
--       too big / a bad conversion (22003, 22P02) -> invalid; deadlock /
--       serialization / lock not available -> stale
--   * every grade write reads the cycle's copy AFTER taking the cycle lock
--   * no argument has a default; whole numbers are "integer"
-- ---------------------------------------------------------------------

-- 7a. bb_set_grade(p_candidate_id, p_dan, p_subject_id, p_letter)   S
-- One cell of the Grading grid for a GRADED subject (G 12). p_letter =
-- one of the subject's part's letters, or NULL = Clear (the row is
-- removed). The same letter again writes nothing. Refused:
--   withdrawn -> withdrawn
--   p_dan isn't the candidate's Dan -> stale (a tablet that missed a Dan
--     change can't bring cleared grades back, Star v0.164)
--   no age on file, not a graded subject of that Dan, a letter of another
--     part, a subject not for the candidate's age group -> invalid
--   a kept grade of a make-up row -> kept
-- Last save wins (no version check, S3); the history keeps both.
-- locks: cycle (share) -> candidate (update) -> the grade row (update)
-- Ok: {"status":"ok","letter":...,"result":{... section 1d ...}}
create or replace function public.bb_set_grade(
  p_candidate_id uuid,
  p_dan          integer,
  p_subject_id   text,
  p_letter       text
)
returns jsonb
language plpgsql
volatile
security definer
set search_path = ''
as $$
declare
  v_c          public.bb_candidates;
  v_dan        jsonb;
  v_part       text;
  v_s          jsonb;
  v_pb         jsonb;
  v_age        integer;
  v_g          public.bb_grades;
  v_constraint text;
begin
  begin
    if public.has_data_access() is not true then
      return jsonb_build_object('status', 'no_access');
    end if;

    if p_candidate_id is null or p_dan is null or p_dan not between 1 and 4
       or p_subject_id is null or p_subject_id !~ '^[a-z0-9]{8}$' then
      return jsonb_build_object('status', 'invalid');
    end if;

    v_c := public.bb_lock_candidate_shared(p_candidate_id);
    if v_c.id is null then
      return jsonb_build_object('status', 'not_found');
    end if;

    if v_c.status = 'withdrawn' then
      return jsonb_build_object('status', 'withdrawn');
    end if;
    if p_dan <> v_c.dan then
      return jsonb_build_object('status', 'stale');
    end if;
    v_age := public.bb_candidate_age(v_c.id);
    if v_age is null then
      return jsonb_build_object('status', 'invalid');
    end if;
    -- the copy, read after the lock
    select y.requirements -> 'dans' -> (v_c.dan - 1) into v_dan from public.bb_cycles y where y.id = v_c.cycle_id;
    select p.e ->> 'code', s.e into v_part, v_s
      from jsonb_array_elements(v_dan -> 'parts') as p(e)
      cross join lateral jsonb_array_elements(p.e -> 'subjects') as s(e)
     where s.e ->> 'id' = p_subject_id
     limit 1;
    if v_s is null or v_s ->> 'scoring' <> 'graded'
       or (p_letter is not null and not (p_letter = any (public.bb_rubric_letters(v_part, 'graded')))) then
      return jsonb_build_object('status', 'invalid');
    end if;
    -- for the candidate's age group? (the rule of section 1d step 2)
    select b.e into v_pb
      from jsonb_array_elements(v_dan -> 'pass' -> 'brackets') with ordinality as b(e, o)
     where (jsonb_typeof(b.e -> 'from') is distinct from 'number' or (b.e ->> 'from')::integer <= v_age)
       and (jsonb_typeof(b.e -> 'to') is distinct from 'number' or v_age <= (b.e ->> 'to')::integer)
     order by b.o
     limit 1;
    if jsonb_typeof(v_s -> 'limited_to') = 'array'
       and not exists (select 1 from jsonb_array_elements(v_s -> 'limited_to') as l(e)
                        where (l.e ->> 'from')::integer is not distinct from (v_pb ->> 'from')::integer
                          and (l.e ->> 'to')::integer is not distinct from (v_pb ->> 'to')::integer) then
      return jsonb_build_object('status', 'invalid');
    end if;
    select * into v_g from public.bb_grades g
     where g.candidate_id = v_c.id and g.dan = v_c.dan and g.subject_id = p_subject_id
       for update;
    if v_g.kept then
      return jsonb_build_object('status', 'kept');
    end if;

    perform set_config('tkd.action', 'bb_set_grade', true);
    perform set_config('tkd.batch_id', gen_random_uuid()::text, true);

    if p_letter is null then
      delete from public.bb_grades g where g.id = v_g.id;
    elsif v_g.id is null then
      insert into public.bb_grades (candidate_id, dan, part_code, subject_id, letter, created_by_name, updated_by_name)
      values (v_c.id, v_c.dan, v_part, p_subject_id, p_letter, '', '');
    elsif v_g.letter is distinct from p_letter or v_g.measured is not null then
      update public.bb_grades g set letter = p_letter, measured = null, way = null where g.id = v_g.id;
    end if;

    perform set_config('tkd.action', '', true);
    perform set_config('tkd.batch_id', '', true);

    return jsonb_build_object('status', 'ok', 'letter', p_letter, 'result', public.bb_candidate_result(v_c.id));
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

revoke execute on function public.bb_set_grade(uuid, integer, text, text) from public, anon, authenticated, service_role;
grant  execute on function public.bb_set_grade(uuid, integer, text, text) to authenticated;

-- 7b. bb_set_measured(p_candidate_id, p_dan, p_subject_id, p_value, p_way)   S
-- One cell for a MEASURED subject (G 3-G 5): the number (0-999, at most 4
-- decimals - more decimals are refused, never rounded; minutes as decimal
-- minutes, 8:30 = 8.5) and the way it was done (0 = the first way, e.g.
-- Pull-up; 1 = the second, e.g. Hold; 0 for a subject with one way). The
-- grade is worked out from the cut-offs, never typed. p_value NULL =
-- Clear (the way is then ignored). Switching the way keeps the number and
-- works the grade out again (G 5). Refusals as 7a (for a measured
-- subject), plus a way that doesn't exist -> invalid.
-- locks: cycle (share) -> candidate (update) -> the grade row (update)
-- Ok: {"status":"ok","value":n|null,"way":n|null,"result":{...}}
create or replace function public.bb_set_measured(
  p_candidate_id uuid,
  p_dan          integer,
  p_subject_id   text,
  p_value        numeric,
  p_way          integer
)
returns jsonb
language plpgsql
volatile
security definer
set search_path = ''
as $$
declare
  v_c          public.bb_candidates;
  v_dan        jsonb;
  v_part       text;
  v_s          jsonb;
  v_pb         jsonb;
  v_age        integer;
  v_g          public.bb_grades;
  v_constraint text;
begin
  begin
    if public.has_data_access() is not true then
      return jsonb_build_object('status', 'no_access');
    end if;

    -- 3. the input ('NaN' is refused: "between 0 and 999" is false for it)
    if p_candidate_id is null or p_dan is null or p_dan not between 1 and 4
       or p_subject_id is null or p_subject_id !~ '^[a-z0-9]{8}$'
       or (p_value is not null
           and (p_way is null or p_way not in (0, 1)
                or not coalesce(p_value between 0 and 999, false)
                or p_value <> round(p_value, 4))) then
      return jsonb_build_object('status', 'invalid');
    end if;

    v_c := public.bb_lock_candidate_shared(p_candidate_id);
    if v_c.id is null then
      return jsonb_build_object('status', 'not_found');
    end if;

    if v_c.status = 'withdrawn' then
      return jsonb_build_object('status', 'withdrawn');
    end if;
    if p_dan <> v_c.dan then
      return jsonb_build_object('status', 'stale');
    end if;
    v_age := public.bb_candidate_age(v_c.id);
    if v_age is null then
      return jsonb_build_object('status', 'invalid');
    end if;
    select y.requirements -> 'dans' -> (v_c.dan - 1) into v_dan from public.bb_cycles y where y.id = v_c.cycle_id;
    select p.e ->> 'code', s.e into v_part, v_s
      from jsonb_array_elements(v_dan -> 'parts') as p(e)
      cross join lateral jsonb_array_elements(p.e -> 'subjects') as s(e)
     where s.e ->> 'id' = p_subject_id
     limit 1;
    if v_s is null or v_s ->> 'scoring' <> 'measured'
       or (p_value is not null and p_way >= jsonb_array_length(v_s -> 'ways')) then
      return jsonb_build_object('status', 'invalid');
    end if;
    select b.e into v_pb
      from jsonb_array_elements(v_dan -> 'pass' -> 'brackets') with ordinality as b(e, o)
     where (jsonb_typeof(b.e -> 'from') is distinct from 'number' or (b.e ->> 'from')::integer <= v_age)
       and (jsonb_typeof(b.e -> 'to') is distinct from 'number' or v_age <= (b.e ->> 'to')::integer)
     order by b.o
     limit 1;
    if jsonb_typeof(v_s -> 'limited_to') = 'array'
       and not exists (select 1 from jsonb_array_elements(v_s -> 'limited_to') as l(e)
                        where (l.e ->> 'from')::integer is not distinct from (v_pb ->> 'from')::integer
                          and (l.e ->> 'to')::integer is not distinct from (v_pb ->> 'to')::integer) then
      return jsonb_build_object('status', 'invalid');
    end if;
    select * into v_g from public.bb_grades g
     where g.candidate_id = v_c.id and g.dan = v_c.dan and g.subject_id = p_subject_id
       for update;
    if v_g.kept then
      return jsonb_build_object('status', 'kept');
    end if;

    perform set_config('tkd.action', 'bb_set_measured', true);
    perform set_config('tkd.batch_id', gen_random_uuid()::text, true);

    if p_value is null then
      delete from public.bb_grades g where g.id = v_g.id;
    elsif v_g.id is null then
      insert into public.bb_grades (candidate_id, dan, part_code, subject_id, measured, way, created_by_name, updated_by_name)
      values (v_c.id, v_c.dan, v_part, p_subject_id, p_value, p_way, '', '');
    elsif v_g.measured is distinct from p_value or v_g.way is distinct from p_way or v_g.letter is not null then
      update public.bb_grades g set letter = null, measured = p_value, way = p_way where g.id = v_g.id;
    end if;

    perform set_config('tkd.action', '', true);
    perform set_config('tkd.batch_id', '', true);

    return jsonb_build_object('status', 'ok', 'value', p_value, 'way', case when p_value is null then null else p_way end,
                              'result', public.bb_candidate_result(v_c.id));
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

revoke execute on function public.bb_set_measured(uuid, integer, text, numeric, integer) from public, anon, authenticated, service_role;
grant  execute on function public.bb_set_measured(uuid, integer, text, numeric, integer) to authenticated;

-- 7c. bb_set_extra_count(p_candidate_id, p_dan, p_item_name, p_count)   S
-- One count box of the Extra points grid (G8, G 18-19): a whole number
-- 0-9,999, or NULL = Clear. The item must be EXACTLY an item name of the
-- candidate's Dan in the cycle's copy. No age needed (counts don't depend
-- on it). Refused: withdrawn; a stale Dan -> stale; an unknown item ->
-- invalid; a kept count of a make-up row -> kept.
-- locks: cycle (share) -> candidate (update) -> the count row (update)
-- Ok: {"status":"ok","count":n|null,"result":{...}}
create or replace function public.bb_set_extra_count(
  p_candidate_id uuid,
  p_dan          integer,
  p_item_name    text,
  p_count        integer
)
returns jsonb
language plpgsql
volatile
security definer
set search_path = ''
as $$
declare
  v_c          public.bb_candidates;
  v_dan        jsonb;
  v_x          public.bb_extra_counts;
  v_constraint text;
begin
  begin
    if public.has_data_access() is not true then
      return jsonb_build_object('status', 'no_access');
    end if;

    if p_candidate_id is null or p_dan is null or p_dan not between 1 and 4
       or p_item_name is null or char_length(p_item_name) not between 1 and 60
       or (p_count is not null and p_count not between 0 and 9999) then
      return jsonb_build_object('status', 'invalid');
    end if;

    v_c := public.bb_lock_candidate_shared(p_candidate_id);
    if v_c.id is null then
      return jsonb_build_object('status', 'not_found');
    end if;

    if v_c.status = 'withdrawn' then
      return jsonb_build_object('status', 'withdrawn');
    end if;
    if p_dan <> v_c.dan then
      return jsonb_build_object('status', 'stale');
    end if;
    select y.requirements -> 'dans' -> (v_c.dan - 1) into v_dan from public.bb_cycles y where y.id = v_c.cycle_id;
    if not exists (select 1
                     from jsonb_array_elements(case when jsonb_typeof(v_dan -> 'extra_points' -> 'items') = 'array'
                                                    then v_dan -> 'extra_points' -> 'items' else '[]'::jsonb end) as i(e)
                    where i.e ->> 'name' = p_item_name) then
      return jsonb_build_object('status', 'invalid');
    end if;
    select * into v_x from public.bb_extra_counts x
     where x.candidate_id = v_c.id and x.dan = v_c.dan and lower(x.item_name) = lower(p_item_name)
       for update;
    if v_x.kept then
      return jsonb_build_object('status', 'kept');
    end if;

    perform set_config('tkd.action', 'bb_set_extra_count', true);
    perform set_config('tkd.batch_id', gen_random_uuid()::text, true);

    if p_count is null then
      delete from public.bb_extra_counts x where x.id = v_x.id;
    elsif v_x.id is null then
      insert into public.bb_extra_counts (candidate_id, dan, item_name, count, created_by_name, updated_by_name)
      values (v_c.id, v_c.dan, p_item_name, p_count, '', '');
    elsif v_x.count is distinct from p_count then
      update public.bb_extra_counts x set count = p_count where x.id = v_x.id;
    end if;

    perform set_config('tkd.action', '', true);
    perform set_config('tkd.batch_id', '', true);

    return jsonb_build_object('status', 'ok', 'count', p_count, 'result', public.bb_candidate_result(v_c.id));
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

revoke execute on function public.bb_set_extra_count(uuid, integer, text, integer) from public, anon, authenticated, service_role;
grant  execute on function public.bb_set_extra_count(uuid, integer, text, integer) to authenticated;

-- 7d. bb_set_makeup_subjects(p_candidate_id, p_expected_ids, p_ids)   A
-- Choose subjects (G 21-23): an admin picks what a candidate whose
-- complete result is below the pass mark (and has no D) works on.
-- p_expected_ids = the chosen set the dialog opened with ('{}' = none);
-- p_ids = the new set (1-120 subject ids). Refused:
--   arrays not flat, a null element, no id, more than 120, a bad id, an
--     id twice -> invalid
--   the stored set isn't the expected one -> stale
--   withdrawn -> withdrawn
--   an active make-up row already points at this candidate ->
--     already_added (its subjects were copied when it was added)
--   the result isn't "Make-up, below the pass mark" (complete, no D), or
--     an id isn't an applying subject of its Dan -> invalid
-- locks: cycle (no key update) -> candidate (update)
-- Ok: {"status":"ok","ids":[... rubric order ...],"result":{...}}
create or replace function public.bb_set_makeup_subjects(
  p_candidate_id uuid,
  p_expected_ids text[],
  p_ids          text[]
)
returns jsonb
language plpgsql
volatile
security definer
set search_path = ''
as $$
declare
  v_c          public.bb_candidates;
  v_r          jsonb;
  v_stored     text[];
  v_constraint text;
begin
  begin
    if public.has_data_access() is not true then
      return jsonb_build_object('status', 'no_access');
    end if;
    if public.is_admin() is not true then
      return jsonb_build_object('status', 'not_allowed');
    end if;

    if p_candidate_id is null or p_expected_ids is null or p_ids is null
       or coalesce(array_ndims(p_ids), 0) <> 1
       or (cardinality(p_expected_ids) > 0 and array_ndims(p_expected_ids) <> 1)
       or array_position(p_ids, null) is not null or array_position(p_expected_ids, null) is not null
       or cardinality(p_ids) not between 1 and 120 or cardinality(p_expected_ids) > 120
       or exists (select 1 from unnest(p_ids || p_expected_ids) as x(id) where x.id !~ '^[a-z0-9]{8}$')
       or (select count(distinct x.id) from unnest(p_ids) as x(id)) <> cardinality(p_ids)
       or (select count(distinct x.id) from unnest(p_expected_ids) as x(id)) <> cardinality(p_expected_ids) then
      return jsonb_build_object('status', 'invalid');
    end if;

    v_c := public.bb_lock_candidate(p_candidate_id);
    if v_c.id is null then
      return jsonb_build_object('status', 'not_found');
    end if;

    -- 5. the stored set (as a sorted set) must be the one the dialog saw
    v_stored := array(select m.subject_id from public.bb_makeup_subjects m
                       where m.candidate_id = v_c.id and m.kind = 'chosen' order by m.subject_id collate "C");
    if v_stored is distinct from array(select x.id from unnest(p_expected_ids) as x(id) order by x.id collate "C") then
      return jsonb_build_object('status', 'stale');
    end if;

    if v_c.status = 'withdrawn' then
      return jsonb_build_object('status', 'withdrawn');
    end if;
    if exists (select 1 from public.bb_candidates m where m.makeup_of_candidate_id = v_c.id and m.status = 'active') then
      return jsonb_build_object('status', 'already_added');
    end if;
    v_r := public.bb_candidate_result(v_c.id);
    if v_r ->> 'status' is distinct from 'makeup' or v_r -> 'reasons' <> '["below"]'::jsonb
       or (v_r ->> 'complete')::boolean is not true then
      return jsonb_build_object('status', 'invalid');
    end if;
    if exists (select 1 from unnest(p_ids) as x(id)
                where not exists (select 1 from jsonb_array_elements(v_r -> 'subjects') as s(e)
                                   where s.e ->> 'id' = x.id and (s.e ->> 'applies')::boolean)) then
      return jsonb_build_object('status', 'invalid');
    end if;

    perform set_config('tkd.action', 'bb_set_makeup_subjects', true);
    perform set_config('tkd.batch_id', gen_random_uuid()::text, true);

    delete from public.bb_makeup_subjects m
     where m.candidate_id = v_c.id and m.kind = 'chosen' and not (m.subject_id = any (p_ids));
    insert into public.bb_makeup_subjects (candidate_id, dan, subject_id, kind, created_by_name, updated_by_name)
    select v_c.id, v_c.dan, x.id, 'chosen', '', ''
      from unnest(p_ids) with ordinality as x(id, n)
     where not exists (select 1 from public.bb_makeup_subjects m
                        where m.candidate_id = v_c.id and m.kind = 'chosen' and m.subject_id = x.id)
     order by x.n;

    perform set_config('tkd.action', '', true);
    perform set_config('tkd.batch_id', '', true);

    v_r := public.bb_candidate_result(v_c.id);
    return jsonb_build_object('status', 'ok',
                              'ids', coalesce((select jsonb_agg(s.e ->> 'id' order by s.o)
                                                 from jsonb_array_elements(v_r -> 'subjects') with ordinality as s(e, o)
                                                where (s.e ->> 'chosen')::boolean), '[]'::jsonb),
                              'result', v_r);
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

revoke execute on function public.bb_set_makeup_subjects(uuid, text[], text[]) from public, anon, authenticated, service_role;
grant  execute on function public.bb_set_makeup_subjects(uuid, text[], text[]) to authenticated;

-- 7e. bb_add_makeup(p_cycle_id, p_earlier_candidate_id)   S
-- "Make-up from an earlier cycle" (G4, G 24-27, v0.941): the earlier
-- candidate comes back on THIS cycle as a make-up row:
--   * a new candidate row: same names, DOB, email, school and Dan; no plan
--     (no fee), no Kukkiwon, source 'makeup', the SAME reference,
--     pointing at the earlier row and naming its cycle
--   * bb_kept_match (section 1e): the kept grades (letters; a measured
--     subject's worked-out letter) and kept counts are copied in (marked
--     kept, from the earlier cycle); the other applying subjects become
--     retest rows - worked out with THIS cycle's rubric and the age on
--     THIS cycle's first testing day
--   * 0016's possible-duplicate check for the new row; the purge last
--     (as bb_add_candidate, OI-6)
-- Refused:
--   this cycle is Past -> finished
--   the earlier row is in this cycle, its cycle's first day isn't before
--     this cycle's first day, it is withdrawn (also a duplicate copy), or
--     its personal data is removed or due to be (the purge day) -> invalid
--   an active make-up already points at it (in any cycle) -> already_added
--   its result (its own rubric and age) isn't a Make-up any more -> stale
--   a below-the-mark make-up with no subjects chosen yet -> choice_needed
-- A Make-up with a D that isn't complete yet may be added (Q-G6 B): only
-- the grades entered by then are copied; later grades on the earlier
-- cycle don't follow (S10, OI-12).
-- Undo = Delete permanently of the new row (admins, v0.913).
-- locks: this cycle (no key update) -> the earlier candidate (share; it is
--   never written. Order is safe: a later cycle locks an earlier
--   candidate, never the reverse)
-- Ok: {"status":"ok","id":...,"reference":"BB-5001","version":1,
--      "kept_count":n,"retest_count":n}
create or replace function public.bb_add_makeup(
  p_cycle_id             uuid,
  p_earlier_candidate_id uuid
)
returns jsonb
language plpgsql
volatile
security definer
set search_path = ''
as $$
declare
  v_today      date;
  v_y          public.bb_cycles;
  v_e          public.bb_candidates;
  v_ey         public.bb_cycles;
  v_first      date;
  v_efirst     date;
  v_er         jsonb;
  v_ein        jsonb;
  v_age        integer;
  v_match      jsonb;
  v_id         uuid;
  v_version    integer;
  v_of         uuid;
  v_kept_n     integer := 0;
  v_retest_n   integer := 0;
  v_constraint text;
begin
  begin
    if public.has_data_access() is not true then
      return jsonb_build_object('status', 'no_access');
    end if;

    if p_cycle_id is null or p_earlier_candidate_id is null then
      return jsonb_build_object('status', 'invalid');
    end if;

    -- 4. this cycle, then the earlier candidate (only read)
    select * into v_y from public.bb_cycles y where y.id = p_cycle_id for no key update;
    if not found then
      return jsonb_build_object('status', 'not_found');
    end if;
    select * into v_e from public.bb_candidates c where c.id = p_earlier_candidate_id for share;
    if not found then
      return jsonb_build_object('status', 'not_found');
    end if;

    -- 6. the rules
    v_today := public.testing_today();
    if (public.bb_cycle_state(p_cycle_id, v_today) ->> 'past')::boolean then
      return jsonb_build_object('status', 'finished');
    end if;
    select * into v_ey from public.bb_cycles y where y.id = v_e.cycle_id;
    select min(d.day_date) into v_first from public.bb_cycle_days d where d.cycle_id = p_cycle_id;
    select min(d.day_date) into v_efirst from public.bb_cycle_days d where d.cycle_id = v_e.cycle_id;
    if v_e.cycle_id = p_cycle_id
       or not coalesce(v_efirst < v_first, false)
       or v_e.status <> 'active'
       or v_e.personal_removed_at is not null
       or public.bb_purge_is_due(v_e.id, v_today) then
      return jsonb_build_object('status', 'invalid');
    end if;
    if exists (select 1 from public.bb_candidates m where m.makeup_of_candidate_id = v_e.id and m.status = 'active') then
      return jsonb_build_object('status', 'already_added');
    end if;
    v_er := public.bb_candidate_result(v_e.id);
    if v_er ->> 'status' is distinct from 'makeup' then
      return jsonb_build_object('status', 'stale');
    end if;
    if (v_er ->> 'choice_needed')::boolean then
      return jsonb_build_object('status', 'choice_needed');
    end if;
    if v_y.requirements -> 'dans' -> (v_e.dan - 1) is null then
      return jsonb_build_object('status', 'invalid');
    end if;

    perform set_config('tkd.action', 'bb_add_makeup', true);
    perform set_config('tkd.batch_id', gen_random_uuid()::text, true);

    -- 7. the make-up row
    insert into public.bb_candidates
      (cycle_id, first_name, last_name, date_of_birth, email_for_results, location_code, dan, cycle_plan_id,
       kukkiwon, kukkiwon_added_on, source, reference, makeup_of_candidate_id, makeup_of_cycle_name,
       created_by_name, updated_by_name)
    values
      (p_cycle_id, v_e.first_name, v_e.last_name, v_e.date_of_birth, v_e.email_for_results, v_e.location_code, v_e.dan, null,
       false, null, 'makeup', v_e.reference, v_e.id, v_ey.name, '', '')
    returning id into v_id;

    -- what is kept and what is tested again (this cycle's rubric and age)
    v_ein := public.bb_candidate_grading_input(v_e.id, v_e.dan);
    v_age := public.bb_candidate_age(v_id);
    v_match := public.bb_kept_match(v_er, v_ey.requirements -> 'dans' -> (v_e.dan - 1), v_ein -> 'counts',
                                    v_y.requirements -> 'dans' -> (v_e.dan - 1), v_age);
    insert into public.bb_grades
      (candidate_id, dan, part_code, subject_id, letter, kept, kept_from_cycle_id, kept_from_cycle_name, created_by_name, updated_by_name)
    select v_id, v_e.dan, k.e ->> 'part', k.e ->> 'subject_id', k.e ->> 'letter', true, v_ey.id, v_ey.name, '', ''
      from jsonb_array_elements(v_match -> 'kept') with ordinality as k(e, n)
     order by k.n;
    get diagnostics v_kept_n = row_count;
    insert into public.bb_extra_counts
      (candidate_id, dan, item_name, count, kept, kept_from_cycle_id, kept_from_cycle_name, created_by_name, updated_by_name)
    select v_id, v_e.dan, k.e ->> 'item_name', (k.e ->> 'count')::integer, true, v_ey.id, v_ey.name, '', ''
      from jsonb_array_elements(v_match -> 'kept_counts') with ordinality as k(e, n)
     order by k.n;
    insert into public.bb_makeup_subjects (candidate_id, dan, subject_id, kind, created_by_name, updated_by_name)
    select v_id, v_e.dan, r.id, 'retest', '', ''
      from jsonb_array_elements_text(v_match -> 'retest') with ordinality as r(id, n)
     order by r.n;
    get diagnostics v_retest_n = row_count;

    -- 0016's possible-duplicate check for the new row, its partner and
    -- anyone pointing at it
    perform public.bb_recheck_duplicate(v_id);
    select c.duplicate_of into v_of from public.bb_candidates c where c.id = v_id;
    if v_of is not null then
      perform public.bb_recheck_duplicate(v_of);
    end if;
    perform public.bb_recheck_pointing_at(v_id);

    perform set_config('tkd.action', '', true);
    perform set_config('tkd.batch_id', '', true);

    perform public.bb_purge_due();

    select c.version into v_version from public.bb_candidates c where c.id = v_id;
    return jsonb_build_object('status', 'ok', 'id', v_id, 'reference', v_e.reference, 'version', v_version,
                              'kept_count', v_kept_n, 'retest_count', v_retest_n);
  exception
    when unique_violation then
      get stacked diagnostics v_constraint = constraint_name;
      if v_constraint = 'bb_candidates_one_active_makeup_idx' then
        return jsonb_build_object('status', 'already_added');   -- a race between two cycles
      end if;
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

revoke execute on function public.bb_add_makeup(uuid, uuid) from public, anon, authenticated, service_role;
grant  execute on function public.bb_add_makeup(uuid, uuid) to authenticated;

-- 7f. bb_mark_result_sent(p_candidate_id, p_expected_result_key)   S
-- "Did you send it?" -> Mark as sent (R 15): a snapshot of the result the
-- screen showed (status, total, needs, key). p_expected_result_key = the
-- result_key the screen showed. Refused:
--   withdrawn -> withdrawn
--   the result isn't Passed or Make-up, or no subjects are chosen yet ->
--     not_finished (a Make-up with a D that isn't complete yet may be
--     marked, Q-G6 B)
--   no email on file, or the purge day has come -> no_email
--   the result changed since the screen showed it -> stale
-- locks: cycle (no key update) -> candidate (update)
-- Ok: {"status":"ok","sent_id":...,"marked_at":...}
create or replace function public.bb_mark_result_sent(
  p_candidate_id        uuid,
  p_expected_result_key text
)
returns jsonb
language plpgsql
volatile
security definer
set search_path = ''
as $$
declare
  v_c          public.bb_candidates;
  v_r          jsonb;
  v_id         uuid;
  v_at         timestamptz;
  v_constraint text;
begin
  begin
    if public.has_data_access() is not true then
      return jsonb_build_object('status', 'no_access');
    end if;

    if p_candidate_id is null or p_expected_result_key is null then
      return jsonb_build_object('status', 'invalid');
    end if;

    v_c := public.bb_lock_candidate(p_candidate_id);
    if v_c.id is null then
      return jsonb_build_object('status', 'not_found');
    end if;

    if v_c.status = 'withdrawn' then
      return jsonb_build_object('status', 'withdrawn');
    end if;
    v_r := public.bb_candidate_result(v_c.id);
    if v_r ->> 'status' not in ('passed', 'makeup') or (v_r ->> 'choice_needed')::boolean then
      return jsonb_build_object('status', 'not_finished');
    end if;
    if v_c.email_for_results is null or public.bb_purge_is_due(v_c.id, public.testing_today()) then
      return jsonb_build_object('status', 'no_email');
    end if;
    if v_r ->> 'result_key' <> p_expected_result_key then
      return jsonb_build_object('status', 'stale');
    end if;

    perform set_config('tkd.action', 'bb_mark_result_sent', true);
    perform set_config('tkd.batch_id', gen_random_uuid()::text, true);

    insert into public.bb_result_sends (candidate_id, marked_by_name, result_status, result_total, result_needs, result_key)
    values (v_c.id, '', v_r ->> 'status', (v_r ->> 'total')::numeric, v_r -> 'needs', v_r ->> 'result_key')
    returning id, marked_at into v_id, v_at;

    perform set_config('tkd.action', '', true);
    perform set_config('tkd.batch_id', '', true);

    return jsonb_build_object('status', 'ok', 'sent_id', v_id, 'marked_at', v_at);
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

revoke execute on function public.bb_mark_result_sent(uuid, text) from public, anon, authenticated, service_role;
grant  execute on function public.bb_mark_result_sent(uuid, text) to authenticated;

-- 7g. bb_undo_result_sent(p_send_id)   S own < 10 s / A any time
-- The toast's Undo after Mark as sent (5 seconds on screen; the server
-- allows 10, R 15), or an admin's later undo after a confirmation (R 18).
-- Refused: already undone -> stale; staff undoing someone else's mark,
-- or their own after 10 seconds -> not_allowed (Star OPEN-16).
-- locks: cycle (no key update) -> candidate (update) -> the send (update)
-- Ok: {"status":"ok"}
create or replace function public.bb_undo_result_sent(p_send_id uuid)
returns jsonb
language plpgsql
volatile
security definer
set search_path = ''
as $$
declare
  v_candidate  uuid;
  v_c          public.bb_candidates;
  v_s          public.bb_result_sends;
  v_constraint text;
begin
  begin
    if public.has_data_access() is not true then
      return jsonb_build_object('status', 'no_access');
    end if;

    if p_send_id is null then
      return jsonb_build_object('status', 'invalid');
    end if;

    select r.candidate_id into v_candidate from public.bb_result_sends r where r.id = p_send_id;
    if not found then
      return jsonb_build_object('status', 'not_found');
    end if;
    v_c := public.bb_lock_candidate(v_candidate);
    if v_c.id is null then
      return jsonb_build_object('status', 'not_found');
    end if;
    select * into v_s from public.bb_result_sends r where r.id = p_send_id for update;
    if not found then
      return jsonb_build_object('status', 'not_found');
    end if;

    if v_s.undone_at is not null then
      return jsonb_build_object('status', 'stale');
    end if;
    if public.is_admin() is not true
       and not coalesce(v_s.marked_by = auth.uid() and v_s.marked_at > now() - interval '10 seconds', false) then
      return jsonb_build_object('status', 'not_allowed');
    end if;

    perform set_config('tkd.action', 'bb_undo_result_sent', true);
    perform set_config('tkd.batch_id', gen_random_uuid()::text, true);

    -- (the guard stamps when and who)
    update public.bb_result_sends r set undone_at = now(), undone_by_name = '' where r.id = v_s.id;

    perform set_config('tkd.action', '', true);
    perform set_config('tkd.batch_id', '', true);

    return jsonb_build_object('status', 'ok');
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

revoke execute on function public.bb_undo_result_sent(uuid) from public, anon, authenticated, service_role;
grant  execute on function public.bb_undo_result_sent(uuid) to authenticated;

-- 7h. bb_set_result_text(p_kind, p_expected_version, p_body)   A
-- Save one result email text (R 27; also the toast's Undo, which saves the
-- old text back). 0023's star_set_result_text exactly: a null argument or
-- a text that breaks a rule of 1f -> invalid; the row missing ->
-- not_found; another admin saved in between -> stale; the same text again
-- writes nothing, bumps nothing and logs nothing (still ok). Stored
-- exactly as sent. A text change never resets "Sent" (R 27).
-- locks: the text row (update)
-- Ok: {"status":"ok","version":n,"body":"<the saved text>"}
create or replace function public.bb_set_result_text(
  p_kind             text,
  p_expected_version integer,
  p_body             text
)
returns jsonb
language plpgsql
volatile
security definer
set search_path = ''
as $$
declare
  v_t          public.bb_result_texts;
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

    if p_kind is null or p_expected_version is null or p_body is null
       or public.bb_result_text_problem(p_kind, p_body) is not null then
      return jsonb_build_object('status', 'invalid');
    end if;

    select * into v_t from public.bb_result_texts t where t.kind = p_kind for update;
    if not found then
      return jsonb_build_object('status', 'not_found');
    end if;
    if v_t.version <> p_expected_version then
      return jsonb_build_object('status', 'stale');
    end if;

    perform set_config('tkd.action', 'bb_set_result_text', true);
    perform set_config('tkd.batch_id', gen_random_uuid()::text, true);

    update public.bb_result_texts t
       set body = p_body
     where t.kind = p_kind
       and t.body is distinct from p_body
    returning t.version into v_version;

    perform set_config('tkd.action', '', true);
    perform set_config('tkd.batch_id', '', true);

    return jsonb_build_object('status', 'ok', 'version', coalesce(v_version, v_t.version), 'body', p_body);
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

revoke execute on function public.bb_set_result_text(text, integer, text) from public, anon, authenticated, service_role;
grant  execute on function public.bb_set_result_text(text, integer, text) to authenticated;


-- 7i. bb_update_candidate_core(...) - INTERNAL (nobody can call it): the
-- one body behind Edit details, shared by bb_update_candidate (8
-- arguments, section 9) and bb_update_candidate_clear (11 arguments,
-- 7j), so their checks can't drift apart (OI-1). It is 0016's
-- bb_update_candidate (15h) word for word, plus the Dan change rules of
-- Q-G4 (v0.955):
--   a Dan different from the row's -
--     (i)   a make-up row -> invalid (its Dan never changes, DC 4)
--     (ii)  an active make-up row points at this candidate -> already_added
--           (Undo the make-up first, OI-4)
--     (iii) the old Dan has real grading rows:
--           * called with the three expected counts NULL (the 8-argument
--             Edit details): -> {"status":"has_grades", grade_count,
--             count_count, chosen_count} and NOTHING is written
--           * called with the counts (the confirmed Dan change): they must
--             equal the current ones, else has_grades with the new counts
--             (DC 5); then the old Dan's not-kept grades, not-kept counts
--             and chosen subjects are removed (tag bb_clear_dan_grading,
--             logged), and the candidate is updated - one batch
--   called WITH the counts but the Dan isn't changing -> invalid
-- A date of birth fix clears nothing (the result is simply worked out
-- again).
-- locks: cycle (no key update) -> candidate (update)
create or replace function public.bb_update_candidate_core(
  p_candidate_id          uuid,
  p_expected_version      integer,
  p_first                 text,
  p_last                  text,
  p_date_of_birth         date,
  p_email                 text,
  p_location_code         text,
  p_dan                   integer,
  p_expected_grade_count  integer,
  p_expected_count_count  integer,
  p_expected_chosen_count integer
)
returns jsonb
language plpgsql
volatile
set search_path = ''
as $$
declare
  v_clear      boolean := p_expected_grade_count is not null;
  v_today      date;
  v_first      text;
  v_last       text;
  v_email      text;
  v_c          public.bb_candidates;
  v_rows       integer;
  v_of         uuid;
  v_version    integer;
  v_needs      boolean;
  v_grades     integer := 0;
  v_counts     integer := 0;
  v_chosen     integer := 0;
  v_cleared_g  integer := 0;
  v_cleared_c  integer := 0;
  v_cleared_s  integer := 0;
  v_answer     jsonb;
begin
  if public.has_data_access() is not true then
    return jsonb_build_object('status', 'no_access');
  end if;

  v_today := public.testing_today();
  v_first := public.testing_normalize_name(p_first);
  v_last  := public.testing_normalize_name(p_last);
  v_email := btrim(p_email);
  if p_candidate_id is null or p_expected_version is null
     or not public.testing_name_is_valid(p_first)
     or not public.testing_name_is_valid(p_last)
     or ((p_date_of_birth is null) <> (p_email is null))
     or (p_date_of_birth is not null
         and (p_date_of_birth > v_today or p_date_of_birth < date '1900-01-01' or not public.bb_email_is_valid(v_email)))
     or p_location_code is null
     or not exists (select 1 from public.locations l where l.code = p_location_code)
     or p_dan is null or p_dan not between 1 and 4
     or (v_clear and (p_expected_count_count is null or p_expected_chosen_count is null
                      or p_expected_grade_count < 0 or p_expected_count_count < 0 or p_expected_chosen_count < 0)) then
    return jsonb_build_object('status', 'invalid');
  end if;

  v_c := public.bb_lock_candidate(p_candidate_id);
  if v_c.id is null then
    return jsonb_build_object('status', 'not_found');
  end if;
  if v_c.version <> p_expected_version then
    return jsonb_build_object('status', 'stale');
  end if;

  -- 6. rules that depend on the saved row (0016's)
  if (v_c.personal_removed_at is not null) <> (p_date_of_birth is null) then
    return jsonb_build_object('status', 'invalid');   -- purged: must stay empty; not purged: required
  end if;
  if p_dan <> v_c.dan and public.is_admin() is not true
     and exists (select 1 from public.bb_payments p
                  where p.candidate_id = v_c.id and p.kind = 'payment'
                    and not exists (select 1 from public.bb_payments r
                                     where r.reverses_payment_id = p.id and r.kind = 'reversal')) then
    return jsonb_build_object('status', 'not_allowed');
  end if;

  -- 6b. the Dan change rules (Q-G4)
  if p_dan <> v_c.dan then
    if v_c.source = 'makeup' then
      return jsonb_build_object('status', 'invalid');
    end if;
    if exists (select 1 from public.bb_candidates m where m.makeup_of_candidate_id = v_c.id and m.status = 'active') then
      return jsonb_build_object('status', 'already_added');
    end if;
    select count(*) into v_grades from public.bb_grades g where g.candidate_id = v_c.id and g.dan = v_c.dan and not g.kept;
    select count(*) into v_counts from public.bb_extra_counts x where x.candidate_id = v_c.id and x.dan = v_c.dan and not x.kept;
    select count(*) into v_chosen from public.bb_makeup_subjects m
     where m.candidate_id = v_c.id and m.dan = v_c.dan and m.kind = 'chosen';
    if (not v_clear and v_grades + v_counts + v_chosen > 0)
       or (v_clear and (v_grades <> p_expected_grade_count or v_counts <> p_expected_count_count
                        or v_chosen <> p_expected_chosen_count)) then
      return jsonb_build_object('status', 'has_grades', 'grade_count', v_grades, 'count_count', v_counts,
                                'chosen_count', v_chosen);
    end if;
  elsif v_clear then
    return jsonb_build_object('status', 'invalid');   -- the confirmed Dan change must change the Dan
  end if;

  perform set_config('tkd.batch_id', gen_random_uuid()::text, true);

  -- the confirmed Dan change: the old Dan's real grading rows go first
  -- (same batch, their own tag)
  if v_clear then
    perform set_config('tkd.action', 'bb_clear_dan_grading', true);
    delete from public.bb_grades g where g.candidate_id = v_c.id and g.dan = v_c.dan and not g.kept;
    get diagnostics v_cleared_g = row_count;
    delete from public.bb_extra_counts x where x.candidate_id = v_c.id and x.dan = v_c.dan and not x.kept;
    get diagnostics v_cleared_c = row_count;
    delete from public.bb_makeup_subjects m where m.candidate_id = v_c.id and m.dan = v_c.dan and m.kind = 'chosen';
    get diagnostics v_cleared_s = row_count;
  end if;

  perform set_config('tkd.action', 'bb_update_candidate', true);

  -- version + 1 on purpose: a DOB or email fix alone would not bump it
  -- (they are no-bump columns for the purge, 0016 11a)
  update public.bb_candidates c
     set first_name        = v_first,
         last_name         = v_last,
         date_of_birth     = p_date_of_birth,
         email_for_results = v_email,
         location_code     = p_location_code,
         dan               = p_dan,
         version           = c.version + 1
   where c.id = v_c.id
     and (c.first_name is distinct from v_first
          or c.last_name is distinct from v_last
          or c.date_of_birth is distinct from p_date_of_birth
          or c.email_for_results is distinct from v_email
          or c.location_code is distinct from p_location_code
          or c.dan is distinct from p_dan);
  get diagnostics v_rows = row_count;

  if v_rows > 0 and (v_first is distinct from v_c.first_name or v_last is distinct from v_c.last_name
                     or p_date_of_birth is distinct from v_c.date_of_birth) then
    perform public.bb_recheck_duplicate(v_c.id);
    select c.duplicate_of into v_of from public.bb_candidates c where c.id = v_c.id;
    if v_of is not null then
      perform public.bb_recheck_duplicate(v_of);
    end if;
    perform public.bb_recheck_pointing_at(v_c.id);
  end if;

  perform set_config('tkd.action', '', true);
  perform set_config('tkd.batch_id', '', true);

  select c.version,
         coalesce(public.bb_age_on(c.date_of_birth,
                                   (select min(d.day_date) from public.bb_cycle_days d where d.cycle_id = c.cycle_id)) < 18
                  and not (select w.signed_as_minor from public.bb_candidate_waivers w
                            where w.candidate_id = c.id order by w.signed_at desc, w.id desc limit 1), false)
    into v_version, v_needs
    from public.bb_candidates c where c.id = v_c.id;
  v_answer := jsonb_build_object('status', 'ok', 'version', v_version, 'needs_parent_signature', v_needs);
  if v_clear then
    v_answer := v_answer || jsonb_build_object('cleared', jsonb_build_object('grades', v_cleared_g, 'counts', v_cleared_c,
                                                                             'chosen', v_cleared_s));
  end if;
  return v_answer;
end;
$$;

revoke execute on function public.bb_update_candidate_core(uuid, integer, text, text, date, text, text, integer, integer, integer, integer) from public, anon, authenticated, service_role;

-- 7j. bb_update_candidate_clear(p_candidate_id, p_expected_version,
--        p_first, p_last, p_date_of_birth, p_email, p_location_code,
--        p_dan, p_expected_grade_count, p_expected_count_count,
--        p_expected_chosen_count)
--        S; a Dan change when the candidate has a payment: A (0016 S8)
-- The Dan-change dialog's red "Change Dan and clear 9 grades" (v0.955,
-- DC 1-5): Edit details with a NEW Dan, clearing the old Dan's real
-- grading rows. The three expected counts are the ones the dialog showed
-- (from bb_update_candidate's has_grades answer); if they changed ->
-- has_grades with the new counts and the dialog asks again. A null or
-- negative count -> invalid. Everything else as bb_update_candidate (the
-- shared core, 7i).
-- locks: cycle (no key update) -> candidate (update)
-- Ok: {"status":"ok","version":n,"needs_parent_signature":true|false,
--      "cleared":{"grades":n,"counts":n,"chosen":n}}
create or replace function public.bb_update_candidate_clear(
  p_candidate_id          uuid,
  p_expected_version      integer,
  p_first                 text,
  p_last                  text,
  p_date_of_birth         date,
  p_email                 text,
  p_location_code         text,
  p_dan                   integer,
  p_expected_grade_count  integer,
  p_expected_count_count  integer,
  p_expected_chosen_count integer
)
returns jsonb
language plpgsql
volatile
security definer
set search_path = ''
as $$
declare
  v_constraint text;
begin
  begin
    if public.has_data_access() is not true then
      return jsonb_build_object('status', 'no_access');
    end if;
    if p_expected_grade_count is null or p_expected_count_count is null or p_expected_chosen_count is null
       or p_expected_grade_count < 0 or p_expected_count_count < 0 or p_expected_chosen_count < 0 then
      return jsonb_build_object('status', 'invalid');
    end if;
    return public.bb_update_candidate_core(p_candidate_id, p_expected_version, p_first, p_last, p_date_of_birth, p_email,
                                           p_location_code, p_dan, p_expected_grade_count, p_expected_count_count,
                                           p_expected_chosen_count);
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

revoke execute on function public.bb_update_candidate_clear(uuid, integer, text, text, date, text, text, integer, integer, integer, integer) from public, anon, authenticated, service_role;
grant  execute on function public.bb_update_candidate_clear(uuid, integer, text, text, date, text, text, integer, integer, integer, integer) to authenticated;


-- ---------------------------------------------------------------------
-- 8. The staff READ functions (contract 7.2). S = staff and admins,
--    except the CSV (A). None takes a lock and none runs the purge (S22:
--    they are called every 15 seconds on the mat). The answers are built
--    from allow-lists: the Grading answer never holds a date of birth,
--    email, reference, money or age (Star v0.161); the result answer
--    (section 1d) never holds the age.
-- ---------------------------------------------------------------------

-- 8a. bb_grading_grid(p_cycle_id, p_dan)   S
-- The Grading tab (G1-G36) for one Dan: today (the app picks the day from
-- it, never the device clock, G 28), the cycle and its days, that Dan of
-- the rubric (0024's public view: names, credits, scoring, ways with
-- cut-offs, points, limited_to, handed_in, outdoor, extra items,
-- to_confirm), the Dan switch counts (active rows per Dan and school, G
-- 29), and the active candidates of that Dan - own candidates first, then
-- make-ups (G 14, v0.947), each group in roster order (school Shrewsbury
-- then Worcester, last name, first name) - each with its result.
-- Ok: {"status":"ok","today":...,"cycle":{id, name, submissions_due,
--      first_day, days:[...]},"rubric":{...},"dan_counts":[...],
--      "rows":[{id, first_name, last_name, location_code, is_makeup,
--      makeup_of_cycle_name, result}]}
create or replace function public.bb_grading_grid(p_cycle_id uuid, p_dan integer)
returns jsonb
language plpgsql
stable
security definer
set search_path = ''
as $$
declare
  v_today date;
  v_y     public.bb_cycles;
  v_dan   jsonb;
  v_first date;
  v_days  jsonb;
  v_rows  jsonb;
begin
  begin
    if public.has_data_access() is not true then
      return jsonb_build_object('status', 'no_access');
    end if;
    if p_cycle_id is null or p_dan is null or p_dan not between 1 and 4 then
      return jsonb_build_object('status', 'invalid');
    end if;
    select * into v_y from public.bb_cycles y where y.id = p_cycle_id;
    if not found then
      return jsonb_build_object('status', 'not_found');
    end if;

    v_today := public.testing_today();
    v_dan := v_y.requirements -> 'dans' -> (p_dan - 1);
    select min(d.day_date) into v_first from public.bb_cycle_days d where d.cycle_id = p_cycle_id;
    select coalesce(jsonb_agg(jsonb_build_object(
             'id', d.id, 'name', d.name, 'day_date', d.day_date, 'start_time', d.start_time, 'end_time', d.end_time,
             'place_code', d.place_code, 'place_other', d.place_other, 'second_start', d.second_start,
             'second_end', d.second_end, 'second_place_code', d.second_place_code,
             'second_place_other', d.second_place_other,
             'parts', coalesce((select jsonb_agg(p.part order by case p.part when 'physical' then 1 when 'technical' then 2 else 3 end)
                                  from public.bb_cycle_day_parts p where p.day_id = d.id), '[]'::jsonb))
           order by d.day_date, d.start_time, d.id), '[]'::jsonb)
      into v_days
      from public.bb_cycle_days d where d.cycle_id = p_cycle_id;
    select coalesce(jsonb_agg(jsonb_build_object(
             'id', c.id, 'first_name', c.first_name, 'last_name', c.last_name, 'location_code', c.location_code,
             'is_makeup', c.source = 'makeup', 'makeup_of_cycle_name', c.makeup_of_cycle_name,
             'result', public.bb_candidate_result_with(c, v_dan, v_first, v_y.submissions_due, v_today))
           order by (c.source = 'makeup'), case c.location_code when 'shrewsbury' then 0 else 1 end,
                    lower(c.last_name), lower(c.first_name), c.id), '[]'::jsonb)
      into v_rows
      from public.bb_candidates c
     where c.cycle_id = p_cycle_id and c.dan = p_dan and c.status = 'active';

    return jsonb_build_object(
      'status', 'ok',
      'today', v_today,
      'cycle', jsonb_build_object('id', v_y.id, 'name', v_y.name, 'submissions_due', v_y.submissions_due,
                                  'first_day', v_first, 'days', v_days),
      'rubric', public.bb_rubric_public(v_y.requirements) -> 'dans' -> (p_dan - 1),
      'dan_counts', coalesce((select jsonb_agg(jsonb_build_object('dan', x.dan, 'location_code', x.location_code, 'count', x.n)
                                               order by x.dan, x.location_code)
                                from (select c.dan, c.location_code, count(*)::integer as n
                                        from public.bb_candidates c
                                       where c.cycle_id = p_cycle_id and c.status = 'active'
                                       group by c.dan, c.location_code) as x), '[]'::jsonb),
      'rows', v_rows);
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

revoke execute on function public.bb_grading_grid(uuid, integer) from public, anon, authenticated, service_role;
grant  execute on function public.bb_grading_grid(uuid, integer) to authenticated;

-- 8b. bb_cycle_results(p_cycle_id, p_dan)   S
-- The Results tab (R01-R06) and the printed results sheet (R 38): p_dan
-- 1-4 = one Dan, NULL = every Dan. Active rows only (S14), in roster order
-- (Dan, school, last name, first name), each with its result, its "sent"
-- state (bb_sent_state) and has_email (an email on file AND the purge day
-- not reached - from the purge day on it counts as gone, section 9 of the
-- contract). "rubrics" = the requested Dans of the rubric's public view.
-- No date of birth, email or money.
-- Ok: {"status":"ok","today":...,"cycle":{... as 8a + last_day},
--      "rubrics":[...],"dan_counts":[...],"rows":[{id, first_name,
--      last_name, location_code, dan, is_makeup, makeup_of_cycle_name,
--      result, sent, has_email}]}
create or replace function public.bb_cycle_results(p_cycle_id uuid, p_dan integer)
returns jsonb
language plpgsql
stable
security definer
set search_path = ''
as $$
declare
  v_today date;
  v_y     public.bb_cycles;
  v_first date;
  v_last  date;
  v_days  jsonb;
  v_rows  jsonb;
  v_pub   jsonb;
begin
  begin
    if public.has_data_access() is not true then
      return jsonb_build_object('status', 'no_access');
    end if;
    if p_cycle_id is null or (p_dan is not null and p_dan not between 1 and 4) then
      return jsonb_build_object('status', 'invalid');
    end if;
    select * into v_y from public.bb_cycles y where y.id = p_cycle_id;
    if not found then
      return jsonb_build_object('status', 'not_found');
    end if;

    v_today := public.testing_today();
    select min(d.day_date), max(d.day_date) into v_first, v_last from public.bb_cycle_days d where d.cycle_id = p_cycle_id;
    select coalesce(jsonb_agg(jsonb_build_object(
             'id', d.id, 'name', d.name, 'day_date', d.day_date, 'start_time', d.start_time, 'end_time', d.end_time,
             'place_code', d.place_code, 'place_other', d.place_other, 'second_start', d.second_start,
             'second_end', d.second_end, 'second_place_code', d.second_place_code,
             'second_place_other', d.second_place_other,
             'parts', coalesce((select jsonb_agg(p.part order by case p.part when 'physical' then 1 when 'technical' then 2 else 3 end)
                                  from public.bb_cycle_day_parts p where p.day_id = d.id), '[]'::jsonb))
           order by d.day_date, d.start_time, d.id), '[]'::jsonb)
      into v_days
      from public.bb_cycle_days d where d.cycle_id = p_cycle_id;
    v_pub := public.bb_rubric_public(v_y.requirements);
    select coalesce(jsonb_agg(x.r order by x.dan, case x.location_code when 'shrewsbury' then 0 else 1 end,
                                           lower(x.last_name), lower(x.first_name), x.id), '[]'::jsonb)
      into v_rows
      from (select c.id, c.dan, c.location_code, c.last_name, c.first_name,
                   jsonb_build_object(
                     'id', c.id, 'first_name', c.first_name, 'last_name', c.last_name, 'location_code', c.location_code,
                     'dan', c.dan, 'is_makeup', c.source = 'makeup', 'makeup_of_cycle_name', c.makeup_of_cycle_name,
                     'result', r.res,
                     'sent', public.bb_sent_state(c.id, r.res),
                     'has_email', c.email_for_results is not null and not public.bb_purge_is_due(c.id, v_today)) as r
              from public.bb_candidates c
              -- ("offset 0" keeps the result worked out ONCE per row: without
              -- it the planner may copy the call into every place it is used)
              cross join lateral (select public.bb_candidate_result_with(c, v_y.requirements -> 'dans' -> (c.dan - 1),
                                                                         v_first, v_y.submissions_due, v_today) as res
                                  offset 0) as r
             where c.cycle_id = p_cycle_id and c.status = 'active' and (p_dan is null or c.dan = p_dan)) as x;

    return jsonb_build_object(
      'status', 'ok',
      'today', v_today,
      'cycle', jsonb_build_object('id', v_y.id, 'name', v_y.name, 'submissions_due', v_y.submissions_due,
                                  'first_day', v_first, 'last_day', v_last, 'days', v_days),
      'rubrics', coalesce((select jsonb_agg(d.e order by d.o)
                             from jsonb_array_elements(v_pub -> 'dans') with ordinality as d(e, o)
                            where p_dan is null or (d.e ->> 'dan')::integer = p_dan), '[]'::jsonb),
      'dan_counts', coalesce((select jsonb_agg(jsonb_build_object('dan', x.dan, 'location_code', x.location_code, 'count', x.n)
                                               order by x.dan, x.location_code)
                                from (select c.dan, c.location_code, count(*)::integer as n
                                        from public.bb_candidates c
                                       where c.cycle_id = p_cycle_id and c.status = 'active'
                                       group by c.dan, c.location_code) as x), '[]'::jsonb),
      'rows', v_rows);
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

revoke execute on function public.bb_cycle_results(uuid, integer) from public, anon, authenticated, service_role;
grant  execute on function public.bb_cycle_results(uuid, integer) to authenticated;

-- 8c. bb_makeup_list(p_cycle_id)   S
-- The "Make-up from an earlier cycle" picker (G 25, S13). FILTERS FIRST:
-- candidates of other cycles whose first testing day is before this
-- cycle's, active, personal data not removed and the purge day not
-- reached, and with no active make-up in ANOTHER cycle; THEN works out
-- each one's result (its own cycle's rubric, loaded once per cycle) and
-- keeps the Make-ups (complete or not, Q-G6). Newest earlier cycle first,
-- then Dan, school, last name, first name. Each row: the age group on
-- THIS cycle's first day and Dan, what is retested, and the match preview
-- (bb_kept_match, as names; G 26). No DOB, email or reference.
-- Ok: {"status":"ok","rows":[{id, first_name, last_name, location_code,
--      dan, cycle_id, cycle_name, cycle_first_day, age_group, reasons,
--      complete, needs, d_subjects, choice_needed, already_added,
--      preview:{kept, retest, new, dropped, kept_extra, dropped_extra}}]}
create or replace function public.bb_makeup_list(p_cycle_id uuid)
returns jsonb
language plpgsql
stable
security definer
set search_path = ''
as $$
declare
  v_today  date;
  v_y      public.bb_cycles;
  v_first  date;
  v_cy     record;
  v_c      public.bb_candidates;
  v_r      jsonb;
  v_ein    jsonb;
  v_m      jsonb;
  v_edan   jsonb;
  v_ldan   jsonb;
  v_age    integer;
  v_names  jsonb;
  v_lnames jsonb;
  v_rows   jsonb := '[]'::jsonb;
  v_purge  boolean;
  v_edans  jsonb[];
  v_ldans  jsonb[];
begin
  begin
    if public.has_data_access() is not true then
      return jsonb_build_object('status', 'no_access');
    end if;
    if p_cycle_id is null then
      return jsonb_build_object('status', 'invalid');
    end if;
    select * into v_y from public.bb_cycles y where y.id = p_cycle_id;
    if not found then
      return jsonb_build_object('status', 'not_found');
    end if;
    v_today := public.testing_today();
    select min(d.day_date) into v_first from public.bb_cycle_days d where d.cycle_id = p_cycle_id;
    if v_first is null then
      return jsonb_build_object('status', 'ok', 'rows', '[]'::jsonb);
    end if;
    -- is the purge switched on at all? (if not, no purge day is ever
    -- reached, and the per-row check is skipped)
    v_purge := exists (select 1 from public.bb_settings s
                        where s.keep_years_after_last_day is not null and s.keep_years_after_18 is not null);

    -- this cycle's four Dan objects, taken out of the copy once
    v_ldans := array[v_y.requirements -> 'dans' -> 0, v_y.requirements -> 'dans' -> 1,
                     v_y.requirements -> 'dans' -> 2, v_y.requirements -> 'dans' -> 3];

    -- every earlier cycle (first day before this one's), newest first
    for v_cy in
      select y.id, y.name, y.requirements, y.submissions_due, f.first_day
        from public.bb_cycles y
        cross join lateral (select min(d.day_date) as first_day from public.bb_cycle_days d where d.cycle_id = y.id) as f
       where y.id <> p_cycle_id and f.first_day < v_first
       order by f.first_day desc, y.id
    loop
      -- that cycle's four Dan objects, taken out once (not once per row)
      v_edans := array[v_cy.requirements -> 'dans' -> 0, v_cy.requirements -> 'dans' -> 1,
                       v_cy.requirements -> 'dans' -> 2, v_cy.requirements -> 'dans' -> 3];
      for v_c in
        select c.* from public.bb_candidates c
         where c.cycle_id = v_cy.id
           and c.status = 'active'
           and c.personal_removed_at is null
           and not exists (select 1 from public.bb_candidates m
                            where m.makeup_of_candidate_id = c.id and m.status = 'active' and m.cycle_id <> p_cycle_id)
           -- (a quick test that never drops a make-up: a result can be a
           -- Make-up only with a grade typed on THIS row - kept grades are
           -- never D, and a make-up row with nothing typed yet still has its
           -- retests to grade, so it is "not finished")
           and exists (select 1 from public.bb_grades g where g.candidate_id = c.id and not g.kept)
           and not (v_purge and public.bb_purge_is_due(c.id, v_today))
         order by c.dan, case c.location_code when 'shrewsbury' then 0 else 1 end, lower(c.last_name), lower(c.first_name), c.id
      loop
        v_edan := v_edans[v_c.dan];
        v_r := public.bb_candidate_result_with(v_c, v_edan, v_cy.first_day, v_cy.submissions_due, v_today);
        continue when v_r ->> 'status' is distinct from 'makeup';
        v_ldan := v_ldans[v_c.dan];
        v_age := public.bb_age_on(v_c.date_of_birth, v_first);
        v_ein := public.bb_candidate_grading_input(v_c.id, v_c.dan);
        v_m := public.bb_kept_match(v_r, v_edan, v_ein -> 'counts', v_ldan, v_age);
        -- subject names by id (earlier Dan for needs / D, later Dan for the preview)
        v_names := coalesce((select jsonb_object_agg(s.e ->> 'id', s.e ->> 'name')
                               from jsonb_array_elements(v_edan -> 'parts') as p(e)
                               cross join lateral jsonb_array_elements(p.e -> 'subjects') as s(e)), '{}'::jsonb);
        v_lnames := coalesce((select jsonb_object_agg(s.e ->> 'id', s.e ->> 'name')
                                from jsonb_array_elements(v_ldan -> 'parts') as p(e)
                                cross join lateral jsonb_array_elements(p.e -> 'subjects') as s(e)), '{}'::jsonb);
        v_rows := v_rows || jsonb_build_array(jsonb_build_object(
          'id', v_c.id, 'first_name', v_c.first_name, 'last_name', v_c.last_name, 'location_code', v_c.location_code,
          'dan', v_c.dan, 'cycle_id', v_cy.id, 'cycle_name', v_cy.name, 'cycle_first_day', v_cy.first_day,
          'age_group', (select jsonb_build_object('from', (g.e ->> 'from')::integer, 'to', (g.e ->> 'to')::integer)
                          from jsonb_array_elements(public.bb_age_groups(v_ldan)) as g(e)
                         where (jsonb_typeof(g.e -> 'from') is distinct from 'number' or (g.e ->> 'from')::integer <= v_age)
                           and (jsonb_typeof(g.e -> 'to') is distinct from 'number' or v_age <= (g.e ->> 'to')::integer)
                         limit 1),
          'reasons', v_r -> 'reasons',
          'complete', v_r -> 'complete',
          'needs', coalesce((select jsonb_agg(v_names ->> x.id order by x.n)
                               from jsonb_array_elements_text(v_r -> 'needs') with ordinality as x(id, n)), '[]'::jsonb),
          'd_subjects', coalesce((select jsonb_agg(v_names ->> x.id order by x.n)
                                    from jsonb_array_elements_text(v_r -> 'd_subjects') with ordinality as x(id, n)), '[]'::jsonb),
          'choice_needed', v_r -> 'choice_needed',
          'already_added', exists (select 1 from public.bb_candidates m
                                    where m.makeup_of_candidate_id = v_c.id and m.status = 'active' and m.cycle_id = p_cycle_id),
          'preview', jsonb_build_object(
            'kept', coalesce((select jsonb_agg(v_lnames ->> (k.e ->> 'subject_id') order by k.n)
                                from jsonb_array_elements(v_m -> 'kept') with ordinality as k(e, n)), '[]'::jsonb),
            'retest', coalesce((select jsonb_agg(v_lnames ->> x.id order by x.n)
                                  from jsonb_array_elements_text(v_m -> 'retest') with ordinality as x(id, n)), '[]'::jsonb),
            'new', coalesce((select jsonb_agg(v_lnames ->> x.id order by x.n)
                               from jsonb_array_elements_text(v_m -> 'new') with ordinality as x(id, n)), '[]'::jsonb),
            'dropped', v_m -> 'dropped',
            'kept_extra', coalesce((select jsonb_agg(k.e ->> 'item_name' order by k.n)
                                      from jsonb_array_elements(v_m -> 'kept_counts') with ordinality as k(e, n)), '[]'::jsonb),
            'dropped_extra', v_m -> 'dropped_extra')));
      end loop;
    end loop;

    return jsonb_build_object('status', 'ok', 'rows', v_rows);
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

revoke execute on function public.bb_makeup_list(uuid) from public, anon, authenticated, service_role;
grant  execute on function public.bb_makeup_list(uuid) to authenticated;

-- 8d. bb_result_email(p_candidate_id)   S
-- Email result (R 12): ONE candidate, read at the click. The RAW values
-- the app fills the email with (OI-5: the wording is built in the app by
-- resultEmail.js, as Star). kind = passed / makeup_d (reasons hold 'd') /
-- makeup_below. Refused: withdrawn; not Passed or Make-up, or no subjects
-- chosen yet -> not_finished; no email on file or the purge day reached ->
-- no_email. Never the date of birth. Not logged (like the candidate
-- detail, S17).
-- Ok: {"status":"ok","email":...,"kind":...,"first_name","last_name",
--      "cycle_name","dan","total","pass_mark","reasons","needs":[names],
--      "d_subjects":[names],"result_key"}
create or replace function public.bb_result_email(p_candidate_id uuid)
returns jsonb
language plpgsql
stable
security definer
set search_path = ''
as $$
declare
  v_c     public.bb_candidates;
  v_y     public.bb_cycles;
  v_r     jsonb;
  v_names jsonb;
begin
  begin
    if public.has_data_access() is not true then
      return jsonb_build_object('status', 'no_access');
    end if;
    if p_candidate_id is null then
      return jsonb_build_object('status', 'invalid');
    end if;
    select * into v_c from public.bb_candidates c where c.id = p_candidate_id;
    if not found then
      return jsonb_build_object('status', 'not_found');
    end if;
    if v_c.status = 'withdrawn' then
      return jsonb_build_object('status', 'withdrawn');
    end if;
    v_r := public.bb_candidate_result(v_c.id);
    if v_r ->> 'status' not in ('passed', 'makeup') or (v_r ->> 'choice_needed')::boolean then
      return jsonb_build_object('status', 'not_finished');
    end if;
    if v_c.email_for_results is null or public.bb_purge_is_due(v_c.id, public.testing_today()) then
      return jsonb_build_object('status', 'no_email');
    end if;
    select * into v_y from public.bb_cycles y where y.id = v_c.cycle_id;
    v_names := coalesce((select jsonb_object_agg(s.e ->> 'id', s.e ->> 'name')
                           from jsonb_array_elements(v_y.requirements -> 'dans' -> (v_c.dan - 1) -> 'parts') as p(e)
                           cross join lateral jsonb_array_elements(p.e -> 'subjects') as s(e)), '{}'::jsonb);
    return jsonb_build_object(
      'status', 'ok',
      'email', v_c.email_for_results,
      'kind', case when v_r ->> 'status' = 'passed' then 'passed'
                   when v_r -> 'reasons' ? 'd' then 'makeup_d'
                   else 'makeup_below' end,
      'first_name', v_c.first_name,
      'last_name', v_c.last_name,
      'cycle_name', v_y.name,
      'dan', v_c.dan,
      'total', v_r -> 'total',
      'pass_mark', v_r -> 'pass_mark',
      'reasons', v_r -> 'reasons',
      'needs', coalesce((select jsonb_agg(v_names ->> x.id order by x.n)
                           from jsonb_array_elements_text(v_r -> 'needs') with ordinality as x(id, n)), '[]'::jsonb),
      'd_subjects', coalesce((select jsonb_agg(v_names ->> x.id order by x.n)
                                from jsonb_array_elements_text(v_r -> 'd_subjects') with ordinality as x(id, n)), '[]'::jsonb),
      'result_key', v_r -> 'result_key');
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

revoke execute on function public.bb_result_email(uuid) from public, anon, authenticated, service_role;
grant  execute on function public.bb_result_email(uuid) to authenticated;

-- 8e. bb_results_csv(p_cycle_id)   A   (writes the download log, so
-- "volatile")
-- Download CSV (R 45-49): the whole cycle, active rows only, in Results
-- order. FIRST the bb_downloads row is written (who, when, how many rows);
-- if anything fails afterwards the log row is undone with it (one block).
-- A refused call writes nothing. date_of_birth and email_for_results are
-- NULL from the purge day on (bb_purge_is_due). The app turns the rows
-- into R 47-48's 21 columns.
-- Ok: {"status":"ok","cycle_name":...,"rows":[{candidate_id,
--      result_status, dan, first_name, last_name, location_code,
--      makeup_of_cycle_name, date_of_birth, pass_bracket,
--      email_for_results, plan_name, kukkiwon, money, parts, extra_total,
--      total, pass_mark, result:{status, reasons, complete, choice_needed,
--      needs, late, missing (names)}, sent}]}
create or replace function public.bb_results_csv(p_cycle_id uuid)
returns jsonb
language plpgsql
volatile
security definer
set search_path = ''
as $$
declare
  v_today      date;
  v_y          public.bb_cycles;
  v_first      date;
  v_count      integer;
  v_rows       jsonb;
  v_constraint text;
begin
  begin
    if public.has_data_access() is not true then
      return jsonb_build_object('status', 'no_access');
    end if;
    if public.is_admin() is not true then
      return jsonb_build_object('status', 'not_allowed');
    end if;
    if p_cycle_id is null then
      return jsonb_build_object('status', 'invalid');
    end if;
    select * into v_y from public.bb_cycles y where y.id = p_cycle_id;
    if not found then
      return jsonb_build_object('status', 'not_found');
    end if;

    v_today := public.testing_today();
    select count(*)::integer into v_count from public.bb_candidates c where c.cycle_id = p_cycle_id and c.status = 'active';

    -- the log row first, before any row leaves the database
    perform set_config('tkd.action', 'bb_results_csv', true);
    perform set_config('tkd.batch_id', gen_random_uuid()::text, true);
    insert into public.bb_downloads (cycle_id, cycle_name, row_count, downloaded_by_name)
    values (p_cycle_id, v_y.name, v_count, '');
    perform set_config('tkd.action', '', true);
    perform set_config('tkd.batch_id', '', true);

    select min(d.day_date) into v_first from public.bb_cycle_days d where d.cycle_id = p_cycle_id;
    select coalesce(jsonb_agg(x.r order by x.dan, case x.location_code when 'shrewsbury' then 0 else 1 end,
                                           lower(x.last_name), lower(x.first_name), x.id), '[]'::jsonb)
      into v_rows
      from (select c.id, c.dan, c.location_code, c.last_name, c.first_name,
                   jsonb_build_object(
                     'candidate_id', c.id,
                     'result_status', r.res ->> 'status',
                     'dan', c.dan,
                     'first_name', c.first_name,
                     'last_name', c.last_name,
                     'location_code', c.location_code,
                     'makeup_of_cycle_name', c.makeup_of_cycle_name,
                     'date_of_birth', case when r.due then null else c.date_of_birth end,
                     'pass_bracket', r.res -> 'pass_bracket',
                     'email_for_results', case when r.due then null else c.email_for_results end,
                     'plan_name', (select pl.name from public.bb_cycle_plans pl where pl.id = c.cycle_plan_id),
                     'kukkiwon', c.kukkiwon,
                     'money', public.bb_candidate_money(c.id, v_today) - 'items',
                     'parts', r.res -> 'parts',
                     'extra_total', r.res -> 'extra' -> 'total',
                     'total', r.res -> 'total',
                     'pass_mark', r.res -> 'pass_mark',
                     'result', jsonb_build_object(
                       'status', r.res -> 'status',
                       'reasons', r.res -> 'reasons',
                       'complete', r.res -> 'complete',
                       'choice_needed', r.res -> 'choice_needed',
                       'needs', coalesce((select jsonb_agg(r.names ->> x.id order by x.n)
                                            from jsonb_array_elements_text(r.res -> 'needs') with ordinality as x(id, n)), '[]'::jsonb),
                       'late', coalesce((select jsonb_agg(r.names ->> x.id order by x.n)
                                           from jsonb_array_elements_text(r.res -> 'late') with ordinality as x(id, n)), '[]'::jsonb),
                       'missing', coalesce((select jsonb_agg(r.names ->> x.id order by x.n)
                                              from jsonb_array_elements_text(r.res -> 'missing') with ordinality as x(id, n)), '[]'::jsonb)),
                     'sent', public.bb_sent_state(c.id, r.res)) as r
              from public.bb_candidates c
              cross join lateral (
                select public.bb_candidate_result_with(c, v_y.requirements -> 'dans' -> (c.dan - 1),
                                                       v_first, v_y.submissions_due, v_today) as res,
                       public.bb_purge_is_due(c.id, v_today) as due,
                       coalesce((select jsonb_object_agg(s.e ->> 'id', s.e ->> 'name')
                                   from jsonb_array_elements(v_y.requirements -> 'dans' -> (c.dan - 1) -> 'parts') as p(e)
                                   cross join lateral jsonb_array_elements(p.e -> 'subjects') as s(e)), '{}'::jsonb) as names
                offset 0) as r   -- ("offset 0": worked out once per row, as in 8b)
             where c.cycle_id = p_cycle_id and c.status = 'active') as x;

    return jsonb_build_object('status', 'ok', 'cycle_name', v_y.name, 'rows', v_rows);
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

revoke execute on function public.bb_results_csv(uuid) from public, anon, authenticated, service_role;
grant  execute on function public.bb_results_csv(uuid) to authenticated;

-- 8f. bb_cycle_grading_state(p_cycle_id)   S
-- For Edit cycle and the Rubric tab, so the screens gray what the
-- database would refuse instead of failing (S2, Q-G1):
--   has_grading        any grading row now (= first_day_frozen)
--   grading_started_at the "grading started" mark (null = the rubric isn't
--                      locked by grading; "Locked - grading started [date]")
--   parts_with_grades  the parts that have real grades
--   first_day          the cycle's first testing day
--   protected_days     days on or before today with a part that has real
--                      grades: [{id, day_date, parts}]
-- Ok: {"status":"ok","has_grading":...,"grading_started_at":...,
--      "parts_with_grades":[...],"first_day":...,"first_day_frozen":...,
--      "protected_days":[...]}
create or replace function public.bb_cycle_grading_state(p_cycle_id uuid)
returns jsonb
language plpgsql
stable
security definer
set search_path = ''
as $$
declare
  v_today   date;
  v_has     boolean;
  v_parts   text[];
begin
  begin
    if public.has_data_access() is not true then
      return jsonb_build_object('status', 'no_access');
    end if;
    if p_cycle_id is null then
      return jsonb_build_object('status', 'invalid');
    end if;
    if not exists (select 1 from public.bb_cycles y where y.id = p_cycle_id) then
      return jsonb_build_object('status', 'not_found');
    end if;
    v_today := public.testing_today();
    v_has := public.bb_cycle_has_grading(p_cycle_id);
    v_parts := array(select x.part
                       from unnest(array['physical', 'technical', 'curriculum', 'other']) with ordinality as x(part, n)
                      where exists (select 1 from public.bb_grades g join public.bb_candidates c on c.id = g.candidate_id
                                     where c.cycle_id = p_cycle_id and not g.kept and g.part_code = x.part)
                      order by x.n);
    return jsonb_build_object(
      'status', 'ok',
      'has_grading', v_has,
      'grading_started_at', public.bb_cycle_grading_started_at(p_cycle_id),
      'parts_with_grades', to_jsonb(v_parts),
      'first_day', (select min(d.day_date) from public.bb_cycle_days d where d.cycle_id = p_cycle_id),
      'first_day_frozen', v_has,
      'protected_days', coalesce((
        select jsonb_agg(jsonb_build_object('id', d.id, 'day_date', d.day_date,
                                            'parts', (select jsonb_agg(p.part order by case p.part when 'physical' then 1 when 'technical' then 2 else 3 end)
                                                        from public.bb_cycle_day_parts p
                                                       where p.day_id = d.id and p.part = any (v_parts)))
                         order by d.day_date, d.id)
          from public.bb_cycle_days d
         where d.cycle_id = p_cycle_id
           and d.day_date <= v_today
           and exists (select 1 from public.bb_cycle_day_parts p where p.day_id = d.id and p.part = any (v_parts))), '[]'::jsonb));
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

revoke execute on function public.bb_cycle_grading_state(uuid) from public, anon, authenticated, service_role;
grant  execute on function public.bb_cycle_grading_state(uuid) to authenticated;


-- ---------------------------------------------------------------------
-- 9. REPLACED 0016 / 0024 functions (contract 6.2-6.5). Each is the old
--    function word for word ("create or replace": same name, arguments,
--    owner and rights - re-granted below exactly as before) with ONLY the
--    listed change, and "-- 0025: replaced" as its first line (the
--    fingerprints' "check | rerun" row looks for it). Their answers only
--    GAIN keys, so the live app keeps working between the paste and the
--    deploy of the new screens.
-- ---------------------------------------------------------------------

-- 9a. bb_purge_due_on(candidate) - REPLACES 0016's (10e; S20). The day a
-- candidate's personal data may be removed is now the LATEST of 0016's
-- day (the cycle's last testing day + N1 years, or the 18th birthday + N2
-- years, whichever is later) over the candidate AND every make-up row
-- that descends from it (following makeup_of_candidate_id to the end of
-- the chain; withdrawn make-ups count). So the waiver that covered a
-- make-up is kept as long as the make-up's own. "union" (not "union all")
-- in the chain walk, so even a broken loop ends. NULL when either
-- keep-years setting is empty (= never).
create or replace function public.bb_purge_due_on(p_candidate_id uuid)
returns date
language sql
stable
set search_path = ''
as $$
-- 0025: replaced
  -- (the chain is walked only when both keep-years settings are set)
  select case when s.keep_years_after_last_day is null or s.keep_years_after_18 is null then null
              else (with recursive chain(id) as (
                      select p_candidate_id
                      union
                      select m.id from public.bb_candidates m join chain ch on m.makeup_of_candidate_id = ch.id
                    )
                    select max(greatest((select max(d.day_date) from public.bb_cycle_days d where d.cycle_id = c.cycle_id)
                                          + make_interval(years => s.keep_years_after_last_day::integer),
                                        c.date_of_birth + make_interval(years => 18 + s.keep_years_after_18::integer))::date)
                      from chain ch
                      join public.bb_candidates c on c.id = ch.id) end
    from public.bb_settings s;
$$;

revoke execute on function public.bb_purge_due_on(uuid) from public, anon, authenticated, service_role;

-- 9b. bb_purge_due() - REPLACES 0016's (13f; Q-G2, S19). The same purge,
-- except that the candidate update also KEEPS the age on the first
-- testing day in age_kept (set once; no version bump; masked in the
-- history), so the result stays exact after the date of birth is gone.
-- Grades, counts, make-up subjects, sends and the result are all kept.
create or replace function public.bb_purge_due()
returns integer
language plpgsql
volatile
set search_path = ''
as $$
-- 0025: replaced
declare
  v_action text := current_setting('tkd.action', true);
  v_batch  text := current_setting('tkd.batch_id', true);
  v_today  date := public.testing_today();
  v_id     uuid;
  v_n      integer := 0;
begin
  if not exists (select 1 from public.bb_settings s
                  where s.keep_years_after_last_day is not null and s.keep_years_after_18 is not null) then
    return 0;
  end if;

  perform set_config('tkd.action', 'bb_purge_due', true);
  perform set_config('tkd.batch_id', gen_random_uuid()::text, true);

  for v_id in
    select c.id
      from public.bb_candidates c
     where c.personal_removed_at is null
       and public.bb_purge_is_due(c.id, v_today)
     order by c.id
       for update of c skip locked
  loop
    update public.bb_candidates c
       set date_of_birth       = null,
           email_for_results   = null,
           personal_removed_at = now(),
           -- Q-G2: keep the age on the cycle's first testing day (worked
           -- out from the date of birth being removed: the right-hand side
           -- reads the old value)
           age_kept            = case when c.age_kept is null
                                      then public.bb_age_on(c.date_of_birth,
                                                            (select min(d.day_date) from public.bb_cycle_days d
                                                              where d.cycle_id = c.cycle_id))
                                      else c.age_kept end
     where c.id = v_id;
    perform 1 from public.bb_candidate_waivers w
      where w.candidate_id = v_id and w.how = 'drawn' and w.removed_at is null
      order by w.id
        for update;
    update public.bb_candidate_waivers w
       set signature   = null,
           signer_name = null,
           removed_at  = now()
     where w.candidate_id = v_id and w.how = 'drawn' and w.removed_at is null;
    v_n := v_n + 1;
  end loop;

  perform set_config('tkd.action', coalesce(v_action, ''), true);
  perform set_config('tkd.batch_id', coalesce(v_batch, ''), true);
  return v_n;
end;
$$;

revoke execute on function public.bb_purge_due() from public, anon, authenticated, service_role;

-- 9c. bb_update_cycle(...) - REPLACES 0016's (15d; S2, v0.900 detail 4).
-- Identical, except that when a guard trigger refuses a past day or part
-- with grades, or the first day once grading started, the answer is
-- {"status":"has_grades"} instead of "invalid". (0016's comment said the
-- grading migration would add exactly this.)
create or replace function public.bb_update_cycle(
  p_cycle_id         uuid,
  p_expected_version integer,
  p_payload          jsonb
)
returns jsonb
language plpgsql
volatile
security definer
set search_path = ''
as $$
-- 0025: replaced
declare
  v_today       date;
  v_name        text;
  v_app         date;
  v_sub         date;
  v_auto        boolean;
  v_c           public.bb_cycles;
  v_day         jsonb;
  v_sec         jsonb;
  v_x           jsonb;
  v_date        date;
  v_st          time;
  v_en          time;
  v_last        date;
  v_all_parts   text[] := '{}';
  v_ids         uuid[] := '{}';
  v_missing     text[];
  v_day_id      uuid;
  v_old_date    date;
  v_due         date;
  v_rows        integer;
  v_changed     boolean := false;
  v_cycle_done  boolean := false;
  v_version     integer;
  v_constraint  text;
begin
  begin
    if public.has_data_access() is not true then
      return jsonb_build_object('status', 'no_access');
    end if;
    if public.is_admin() is not true then
      return jsonb_build_object('status', 'not_allowed');
    end if;

    -- 3. the input, key by key (the same day rules as Add cycle, except
    --    the past-date rule, which needs the saved dates: step 6)
    v_today := public.testing_today();
    if p_cycle_id is null or p_expected_version is null
       or jsonb_typeof(p_payload) is distinct from 'object'
       or exists (select 1 from jsonb_object_keys(p_payload) as k(key)
                   where k.key not in ('name', 'application_due', 'submissions_due', 'auto_close', 'days', 'due_dates'))
       or jsonb_typeof(p_payload -> 'name') is distinct from 'string'
       or not public.testing_name_is_valid(p_payload ->> 'name')
       or jsonb_typeof(p_payload -> 'application_due') is distinct from 'string'
       or not pg_input_is_valid(p_payload ->> 'application_due', 'date')
       or jsonb_typeof(p_payload -> 'submissions_due') is distinct from 'string'
       or not pg_input_is_valid(p_payload ->> 'submissions_due', 'date')
       or jsonb_typeof(p_payload -> 'auto_close') is distinct from 'boolean'
       or jsonb_typeof(p_payload -> 'days') is distinct from 'array'
       or jsonb_array_length(p_payload -> 'days') not between 1 and 20
       or jsonb_typeof(p_payload -> 'due_dates') is distinct from 'array' then
      return jsonb_build_object('status', 'invalid');
    end if;
    v_name := public.testing_normalize_name(p_payload ->> 'name');
    v_app  := (p_payload ->> 'application_due')::date;
    v_sub  := (p_payload ->> 'submissions_due')::date;
    v_auto := (p_payload ->> 'auto_close')::boolean;

    for v_day in select d.value from jsonb_array_elements(p_payload -> 'days') as d(value) loop
      if jsonb_typeof(v_day) <> 'object'
         or exists (select 1 from jsonb_object_keys(v_day) as k(key)
                     where k.key not in ('id', 'name', 'day_date', 'start_time', 'end_time', 'place', 'second', 'parts'))
         or (v_day ? 'id' and jsonb_typeof(v_day -> 'id') <> 'null'
             and (jsonb_typeof(v_day -> 'id') <> 'string' or not pg_input_is_valid(v_day ->> 'id', 'uuid')))
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
      if not public.bb_time_is_valid(v_st) or not public.bb_time_is_valid(v_en) or v_en <= v_st then
        return jsonb_build_object('status', 'invalid');
      end if;
      if jsonb_typeof(v_day -> 'id') = 'string' then
        if (v_day ->> 'id')::uuid = any (v_ids) then
          return jsonb_build_object('status', 'invalid');   -- the same day twice
        end if;
        v_ids := v_ids || (v_day ->> 'id')::uuid;
      end if;
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
      if jsonb_typeof(v_day -> 'parts') is distinct from 'array'
         or jsonb_array_length(v_day -> 'parts') not between 1 and 3
         or exists (select 1 from jsonb_array_elements(v_day -> 'parts') as p(value)
                     where jsonb_typeof(p.value) <> 'string'
                        or p.value #>> '{}' not in ('physical', 'technical', 'curriculum'))
         or (select count(distinct p.value) from jsonb_array_elements(v_day -> 'parts') as p(value))
            <> jsonb_array_length(v_day -> 'parts') then
        return jsonb_build_object('status', 'invalid');
      end if;
      v_all_parts := v_all_parts || array(select p.value from jsonb_array_elements_text(v_day -> 'parts') as p(value));
      v_last := greatest(v_last, v_date);
    end loop;

    if v_app > v_last or v_sub > v_last then
      return jsonb_build_object('status', 'invalid');
    end if;

    -- the due dates' shape
    if exists (select 1 from jsonb_array_elements(p_payload -> 'due_dates') as x(value)
                where jsonb_typeof(x.value) <> 'object'
                   or exists (select 1 from jsonb_object_keys(x.value) as k(key)
                               where k.key not in ('cycle_plan_id', 'payment_no', 'due_on', 'follows_application_due'))
                   or jsonb_typeof(x.value -> 'cycle_plan_id') is distinct from 'string'
                   or not pg_input_is_valid(x.value ->> 'cycle_plan_id', 'uuid')
                   or jsonb_typeof(x.value -> 'payment_no') is distinct from 'number'
                   or not pg_input_is_valid(x.value ->> 'payment_no', 'smallint')
                   or jsonb_typeof(x.value -> 'due_on') is distinct from 'string'
                   or not pg_input_is_valid(x.value ->> 'due_on', 'date')
                   or jsonb_typeof(x.value -> 'follows_application_due') is distinct from 'boolean') then
      return jsonb_build_object('status', 'invalid');
    end if;

    -- 4. locks: the cycle, then its days and its due dates in id order
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

    -- 5. the version
    if v_c.version <> p_expected_version then
      return jsonb_build_object('status', 'stale');
    end if;

    -- 6. rules that need the saved rows
    -- every day id given is a day of THIS cycle
    if exists (select 1 from unnest(v_ids) as x(id)
                where not exists (select 1 from public.bb_cycle_days d where d.id = x.id and d.cycle_id = p_cycle_id)) then
      return jsonb_build_object('status', 'invalid');
    end if;
    -- a changed (or new) day date can't be in the past
    for v_day in select d.value from jsonb_array_elements(p_payload -> 'days') as d(value) loop
      v_date := (v_day ->> 'day_date')::date;
      v_old_date := null;
      if jsonb_typeof(v_day -> 'id') = 'string' then
        select d.day_date into v_old_date from public.bb_cycle_days d where d.id = (v_day ->> 'id')::uuid;
      end if;
      if v_date is distinct from v_old_date and v_date < v_today then
        return jsonb_build_object('status', 'invalid');
      end if;
    end loop;
    -- due_dates names every (plan, payment) of this cycle exactly once
    if (select count(*) from jsonb_array_elements(p_payload -> 'due_dates'))
         <> (select count(*) from public.bb_cycle_plan_payments pp
               join public.bb_cycle_plans pl on pl.id = pp.cycle_plan_id where pl.cycle_id = p_cycle_id)
       or (select count(distinct ((x.value ->> 'cycle_plan_id')::uuid, (x.value ->> 'payment_no')::smallint))
             from jsonb_array_elements(p_payload -> 'due_dates') as x(value))
          <> jsonb_array_length(p_payload -> 'due_dates')
       or exists (select 1 from jsonb_array_elements(p_payload -> 'due_dates') as x(value)
                   where not exists (select 1 from public.bb_cycle_plan_payments pp
                                       join public.bb_cycle_plans pl on pl.id = pp.cycle_plan_id
                                      where pl.cycle_id = p_cycle_id
                                        and pp.cycle_plan_id = (x.value ->> 'cycle_plan_id')::uuid
                                        and pp.payment_no = (x.value ->> 'payment_no')::smallint)) then
      return jsonb_build_object('status', 'invalid');
    end if;
    -- "follows" only on payment 1; a changed due date can't be in the past
    if exists (select 1 from jsonb_array_elements(p_payload -> 'due_dates') as x(value)
                join public.bb_cycle_plan_payments pp
                  on pp.cycle_plan_id = (x.value ->> 'cycle_plan_id')::uuid
                 and pp.payment_no = (x.value ->> 'payment_no')::smallint
               where ((x.value ->> 'follows_application_due')::boolean and pp.payment_no <> 1)
                  or (case when (x.value ->> 'follows_application_due')::boolean then v_app
                           else (x.value ->> 'due_on')::date end) is distinct from pp.due_on
                     and (case when (x.value ->> 'follows_application_due')::boolean then v_app
                               else (x.value ->> 'due_on')::date end) < v_today) then
      return jsonb_build_object('status', 'invalid');
    end if;
    -- every part on at least one day
    v_missing := array(select x.part from unnest(array['physical', 'technical', 'curriculum']) with ordinality as x(part, n)
                        where not (x.part = any (v_all_parts)) order by x.n);
    if cardinality(v_missing) > 0 then
      return jsonb_build_object('status', 'part_without_day', 'parts', to_jsonb(v_missing));
    end if;

    -- 7. the name
    if exists (select 1 from public.bb_cycles y
                where y.id <> p_cycle_id and lower(public.testing_normalize_name(y.name)) = lower(v_name)) then
      return jsonb_build_object('status', 'duplicate_name');
    end if;

    -- 8. write
    perform set_config('tkd.action', 'bb_update_cycle', true);
    perform set_config('tkd.batch_id', gen_random_uuid()::text, true);

    update public.bb_cycles y
       set name            = v_name,
           application_due = v_app,
           submissions_due = v_sub,
           auto_close      = v_auto
     where y.id = p_cycle_id
       and (y.name is distinct from v_name or y.application_due is distinct from v_app
            or y.submissions_due is distinct from v_sub or y.auto_close is distinct from v_auto);
    get diagnostics v_rows = row_count;
    v_cycle_done := v_rows > 0;

    -- days no longer in the list go, with their parts
    delete from public.bb_cycle_days d
     where d.cycle_id = p_cycle_id and not (d.id = any (v_ids));
    get diagnostics v_rows = row_count;
    v_changed := v_changed or v_rows > 0;

    for v_day in select d.value from jsonb_array_elements(p_payload -> 'days') as d(value) loop
      v_sec := case when jsonb_typeof(v_day -> 'second') = 'object' then v_day -> 'second' end;
      if jsonb_typeof(v_day -> 'id') = 'string' then
        v_day_id := (v_day ->> 'id')::uuid;
        update public.bb_cycle_days d
           set name               = public.testing_normalize_name(v_day ->> 'name'),
               day_date           = (v_day ->> 'day_date')::date,
               start_time         = (v_day ->> 'start_time')::time,
               end_time           = (v_day ->> 'end_time')::time,
               place_code         = v_day -> 'place' ->> 'code',
               place_other        = public.testing_normalize_note(v_day -> 'place' ->> 'other'),
               second_start       = (v_sec ->> 'start')::time,
               second_end         = (v_sec ->> 'end')::time,
               second_place_code  = v_sec -> 'place' ->> 'code',
               second_place_other = public.testing_normalize_note(v_sec -> 'place' ->> 'other')
         where d.id = v_day_id
           and (d.name is distinct from public.testing_normalize_name(v_day ->> 'name')
                or d.day_date is distinct from (v_day ->> 'day_date')::date
                or d.start_time is distinct from (v_day ->> 'start_time')::time
                or d.end_time is distinct from (v_day ->> 'end_time')::time
                or d.place_code is distinct from (v_day -> 'place' ->> 'code')
                or d.place_other is distinct from public.testing_normalize_note(v_day -> 'place' ->> 'other')
                or d.second_start is distinct from (v_sec ->> 'start')::time
                or d.second_end is distinct from (v_sec ->> 'end')::time
                or d.second_place_code is distinct from (v_sec -> 'place' ->> 'code')
                or d.second_place_other is distinct from public.testing_normalize_note(v_sec -> 'place' ->> 'other'));
        get diagnostics v_rows = row_count;
        v_changed := v_changed or v_rows > 0;
        -- the parts, by difference
        delete from public.bb_cycle_day_parts p
         where p.day_id = v_day_id
           and not (p.part = any (array(select x.value from jsonb_array_elements_text(v_day -> 'parts') as x(value))));
        get diagnostics v_rows = row_count;
        v_changed := v_changed or v_rows > 0;
      else
        insert into public.bb_cycle_days
          (cycle_id, name, day_date, start_time, end_time, place_code, place_other,
           second_start, second_end, second_place_code, second_place_other, created_by_name, updated_by_name)
        values
          (p_cycle_id, public.testing_normalize_name(v_day ->> 'name'), (v_day ->> 'day_date')::date,
           (v_day ->> 'start_time')::time, (v_day ->> 'end_time')::time,
           v_day -> 'place' ->> 'code', public.testing_normalize_note(v_day -> 'place' ->> 'other'),
           (v_sec ->> 'start')::time, (v_sec ->> 'end')::time,
           v_sec -> 'place' ->> 'code', public.testing_normalize_note(v_sec -> 'place' ->> 'other'), '', '')
        returning id into v_day_id;
        v_changed := true;
      end if;
      insert into public.bb_cycle_day_parts (day_id, part, created_by_name)
      select v_day_id, x.value, ''
        from jsonb_array_elements_text(v_day -> 'parts') with ordinality as x(value, n)
       where not exists (select 1 from public.bb_cycle_day_parts p where p.day_id = v_day_id and p.part = x.value)
       order by x.n;
      get diagnostics v_rows = row_count;
      v_changed := v_changed or v_rows > 0;
    end loop;

    -- the due dates ("follows" keeps payment 1 on Application due)
    update public.bb_cycle_plan_payments pp
       set due_on                  = case when (x.value ->> 'follows_application_due')::boolean then v_app
                                          else (x.value ->> 'due_on')::date end,
           follows_application_due = (x.value ->> 'follows_application_due')::boolean
      from jsonb_array_elements(p_payload -> 'due_dates') as x(value)
     where pp.cycle_plan_id = (x.value ->> 'cycle_plan_id')::uuid
       and pp.payment_no = (x.value ->> 'payment_no')::smallint
       and (pp.due_on is distinct from (case when (x.value ->> 'follows_application_due')::boolean then v_app
                                             else (x.value ->> 'due_on')::date end)
            or pp.follows_application_due is distinct from (x.value ->> 'follows_application_due')::boolean);
    get diagnostics v_rows = row_count;
    v_changed := v_changed or v_rows > 0;

    -- one version bump for the whole save: the cycle row's own change did
    -- it already; otherwise ask for it on purpose (11a)
    if v_changed and not v_cycle_done then
      update public.bb_cycles y set version = y.version + 1 where y.id = p_cycle_id;
    end if;

    perform set_config('tkd.action', '', true);
    perform set_config('tkd.batch_id', '', true);

    select y.version into v_version from public.bb_cycles y where y.id = p_cycle_id;
    return jsonb_build_object('status', 'ok', 'version', v_version);
  exception
    when unique_violation then
      get stacked diagnostics v_constraint = constraint_name;
      if v_constraint = 'bb_cycles_lower_name_idx' then
        return jsonb_build_object('status', 'duplicate_name');
      end if;
      return jsonb_build_object('status', 'stale');
    when check_violation then
      -- S2: a past day or part with grades, or the first day once grading
      -- started (the guard triggers of section 4) -> has_grades
      get stacked diagnostics v_constraint = constraint_name;
      if v_constraint in ('bb_cycle_days_has_grades', 'bb_cycle_day_parts_has_grades', 'bb_cycle_first_day_frozen') then
        return jsonb_build_object('status', 'has_grades');
      end if;
      return jsonb_build_object('status', 'invalid');
    when foreign_key_violation or not_null_violation then
      return jsonb_build_object('status', 'invalid');
    when deadlock_detected or serialization_failure or lock_not_available then
      return jsonb_build_object('status', 'stale');
  end;
end;
$$;

revoke execute on function public.bb_update_cycle(uuid, integer, jsonb) from public, anon, authenticated, service_role;
grant  execute on function public.bb_update_cycle(uuid, integer, jsonb) to authenticated;

-- 9d. bb_delete_cycle(...) - REPLACES 0016's (15f; Q-G3). Identical, plus:
-- a cycle where any candidate has real grades (a grade, a count or a
-- chosen subject) -> has_grades (checked after has_waivers); and a grade
-- guard refusing the cascade -> has_grades too. Make-up rows that hold
-- only kept and retest rows don't block it.
create or replace function public.bb_delete_cycle(
  p_cycle_id                 uuid,
  p_expected_version         integer,
  p_expected_candidate_count integer
)
returns jsonb
language plpgsql
volatile
security definer
set search_path = ''
as $$
-- 0025: replaced
declare
  v_version    integer;
  v_count      integer;
  v_constraint text;
begin
  begin
    if public.has_data_access() is not true then
      return jsonb_build_object('status', 'no_access');
    end if;
    if public.is_admin() is not true then
      return jsonb_build_object('status', 'not_allowed');
    end if;

    if p_cycle_id is null or p_expected_version is null or p_expected_candidate_count is null then
      return jsonb_build_object('status', 'invalid');
    end if;

    select y.version into v_version from public.bb_cycles y where y.id = p_cycle_id for update;
    if not found then
      return jsonb_build_object('status', 'not_found');
    end if;
    perform 1 from public.bb_candidates c where c.cycle_id = p_cycle_id order by c.id for update;

    if v_version <> p_expected_version then
      return jsonb_build_object('status', 'stale');
    end if;
    select count(*) into v_count from public.bb_candidates c where c.cycle_id = p_cycle_id;
    if v_count <> p_expected_candidate_count then
      return jsonb_build_object('status', 'stale');
    end if;

    if exists (select 1 from public.bb_payments p where p.cycle_id = p_cycle_id) then
      return jsonb_build_object('status', 'has_payments');
    end if;
    if exists (select 1 from public.bb_candidate_waivers w
                 join public.bb_candidates c on c.id = w.candidate_id
                where c.cycle_id = p_cycle_id and w.how = 'drawn') then
      return jsonb_build_object('status', 'has_waivers');
    end if;
    -- Q-G3: a candidate with real grades
    if exists (select 1 from public.bb_candidates c where c.cycle_id = p_cycle_id and public.bb_candidate_has_grades(c.id)) then
      return jsonb_build_object('status', 'has_grades');
    end if;

    perform set_config('tkd.action', 'bb_delete_cycle', true);
    perform set_config('tkd.batch_id', gen_random_uuid()::text, true);

    delete from public.bb_cycles y where y.id = p_cycle_id;

    perform set_config('tkd.action', '', true);
    perform set_config('tkd.batch_id', '', true);

    return jsonb_build_object('status', 'ok');
  exception
    when unique_violation then
      get stacked diagnostics v_constraint = constraint_name;
      if v_constraint = 'bb_cycles_lower_name_idx' then
        return jsonb_build_object('status', 'duplicate_name');
      end if;
      return jsonb_build_object('status', 'stale');
    when foreign_key_violation then
      -- defence in depth behind the check above: a payment row points here
      get stacked diagnostics v_constraint = constraint_name;
      if v_constraint like 'bb\_payments\_%' then
        return jsonb_build_object('status', 'has_payments');
      end if;
      return jsonb_build_object('status', 'invalid');
    when check_violation then
      -- defence in depth behind the check above: a grade guard refused
      get stacked diagnostics v_constraint = constraint_name;
      if v_constraint in ('bb_grades_rules', 'bb_extra_counts_rules', 'bb_makeup_subjects_rules') then
        return jsonb_build_object('status', 'has_grades');
      end if;
      return jsonb_build_object('status', 'invalid');
    when not_null_violation then
      return jsonb_build_object('status', 'invalid');
    when deadlock_detected or serialization_failure or lock_not_available then
      return jsonb_build_object('status', 'stale');
  end;
end;
$$;

revoke execute on function public.bb_delete_cycle(uuid, integer, integer) from public, anon, authenticated, service_role;
grant  execute on function public.bb_delete_cycle(uuid, integer, integer) to authenticated;

-- 9e. bb_update_candidate(8 arguments) - REPLACES 0016's (15h; Q-G4,
-- OI-1). The same 8 arguments and answers; its body is now the shared
-- core (7i) called WITHOUT expected counts: a Dan change on a candidate
-- with real grading rows answers {"status":"has_grades", grade_count,
-- count_count, chosen_count} and writes nothing (the app then shows the
-- Dan-change dialog and calls bb_update_candidate_clear); a Dan change on
-- a make-up row -> invalid; on a row with an active make-up ->
-- already_added. Everything else exactly as 0016.
create or replace function public.bb_update_candidate(
  p_candidate_id     uuid,
  p_expected_version integer,
  p_first            text,
  p_last             text,
  p_date_of_birth    date,
  p_email            text,
  p_location_code    text,
  p_dan              integer
)
returns jsonb
language plpgsql
volatile
security definer
set search_path = ''
as $$
-- 0025: replaced
declare
  v_constraint text;
begin
  begin
    return public.bb_update_candidate_core(p_candidate_id, p_expected_version, p_first, p_last, p_date_of_birth, p_email,
                                           p_location_code, p_dan, null, null, null);
  exception
    when unique_violation then
      get stacked diagnostics v_constraint = constraint_name;
      if v_constraint = 'bb_cycles_lower_name_idx' then
        return jsonb_build_object('status', 'duplicate_name');
      end if;
      return jsonb_build_object('status', 'stale');
    when foreign_key_violation or check_violation or not_null_violation then
      return jsonb_build_object('status', 'invalid');
    when deadlock_detected or serialization_failure or lock_not_available then
      return jsonb_build_object('status', 'stale');
  end;
end;
$$;

revoke execute on function public.bb_update_candidate(uuid, integer, text, text, date, text, text, integer) from public, anon, authenticated, service_role;
grant  execute on function public.bb_update_candidate(uuid, integer, text, text, date, text, text, integer) to authenticated;

-- 9f. bb_change_plan(...) - REPLACES 0016's (15i; contract 3.3). Identical,
-- plus: a make-up row -> invalid, right after the lock, before anything
-- else (a make-up has no plan and never a fee; the table rules are the
-- second wall).
create or replace function public.bb_change_plan(
  p_candidate_id     uuid,
  p_expected_version integer,
  p_cycle_plan_id    uuid,
  p_kukkiwon         boolean
)
returns jsonb
language plpgsql
volatile
security definer
set search_path = ''
as $$
-- 0025: replaced
declare
  v_today      date;
  v_c          public.bb_candidates;
  v_version    integer;
  v_constraint text;
begin
  begin
    if public.has_data_access() is not true then
      return jsonb_build_object('status', 'no_access');
    end if;

    if p_candidate_id is null or p_expected_version is null or p_cycle_plan_id is null or p_kukkiwon is null then
      return jsonb_build_object('status', 'invalid');
    end if;

    v_c := public.bb_lock_candidate(p_candidate_id);
    if v_c.id is null then
      return jsonb_build_object('status', 'not_found');
    end if;
    -- a make-up row has no plan and never a fee (v0.941)
    if v_c.source = 'makeup' then
      return jsonb_build_object('status', 'invalid');
    end if;
    if v_c.version <> p_expected_version then
      return jsonb_build_object('status', 'stale');
    end if;

    if v_c.status = 'withdrawn' then
      return jsonb_build_object('status', 'withdrawn');
    end if;
    if v_c.personal_removed_at is not null then
      return jsonb_build_object('status', 'invalid');
    end if;
    if not exists (select 1 from public.bb_cycle_plans pl where pl.id = p_cycle_plan_id and pl.cycle_id = v_c.cycle_id) then
      return jsonb_build_object('status', 'invalid');
    end if;
    if public.is_admin() is not true
       and exists (select 1 from public.bb_payments p
                    where p.candidate_id = v_c.id and p.kind = 'payment'
                      and not exists (select 1 from public.bb_payments r
                                       where r.reverses_payment_id = p.id and r.kind = 'reversal')) then
      return jsonb_build_object('status', 'not_allowed');
    end if;

    v_today := public.testing_today();
    perform set_config('tkd.action', 'bb_change_plan', true);
    perform set_config('tkd.batch_id', gen_random_uuid()::text, true);

    update public.bb_candidates c
       set cycle_plan_id     = p_cycle_plan_id,
           kukkiwon          = p_kukkiwon,
           kukkiwon_added_on = case when not p_kukkiwon then null
                                    when c.kukkiwon then c.kukkiwon_added_on
                                    else v_today end
     where c.id = v_c.id
       and (c.cycle_plan_id is distinct from p_cycle_plan_id or c.kukkiwon is distinct from p_kukkiwon);

    perform set_config('tkd.action', '', true);
    perform set_config('tkd.batch_id', '', true);

    select c.version into v_version from public.bb_candidates c where c.id = v_c.id;
    return jsonb_build_object('status', 'ok', 'version', v_version,
                              'money', public.bb_candidate_money(v_c.id, v_today));
  exception
    when unique_violation then
      get stacked diagnostics v_constraint = constraint_name;
      if v_constraint = 'bb_cycles_lower_name_idx' then
        return jsonb_build_object('status', 'duplicate_name');
      end if;
      return jsonb_build_object('status', 'stale');
    when foreign_key_violation or check_violation or not_null_violation then
      return jsonb_build_object('status', 'invalid');
    when deadlock_detected or serialization_failure or lock_not_available then
      return jsonb_build_object('status', 'stale');
  end;
end;
$$;

revoke execute on function public.bb_change_plan(uuid, integer, uuid, boolean) from public, anon, authenticated, service_role;
grant  execute on function public.bb_change_plan(uuid, integer, uuid, boolean) to authenticated;

-- 9g. bb_restore_candidate(...) - REPLACES 0016's (15l). Identical, plus:
-- restoring a make-up row while its earlier candidate already has another
-- active make-up -> already_added (also when the one-active-make-up index
-- refuses it in a race).
create or replace function public.bb_restore_candidate(
  p_candidate_id     uuid,
  p_expected_version integer
)
returns jsonb
language plpgsql
volatile
security definer
set search_path = ''
as $$
-- 0025: replaced
declare
  v_c          public.bb_candidates;
  v_of         uuid;
  v_version    integer;
  v_constraint text;
begin
  begin
    if public.has_data_access() is not true then
      return jsonb_build_object('status', 'no_access');
    end if;

    if p_candidate_id is null or p_expected_version is null then
      return jsonb_build_object('status', 'invalid');
    end if;

    v_c := public.bb_lock_candidate(p_candidate_id);
    if v_c.id is null then
      return jsonb_build_object('status', 'not_found');
    end if;
    if v_c.version <> p_expected_version then
      return jsonb_build_object('status', 'stale');
    end if;
    if public.is_admin() is not true
       and not coalesce(v_c.status = 'withdrawn'
                        and v_c.withdrawn_reason = 'duplicate_copy'
                        and v_c.withdrawn_by = auth.uid()
                        and v_c.withdrawn_at > now() - interval '10 seconds', false) then
      return jsonb_build_object('status', 'not_allowed');
    end if;
    if v_c.status <> 'withdrawn' then
      return jsonb_build_object('status', 'stale');
    end if;
    -- a make-up row whose earlier candidate already has another active
    -- make-up (at most one, anywhere)
    if v_c.makeup_of_candidate_id is not null
       and exists (select 1 from public.bb_candidates m
                    where m.makeup_of_candidate_id = v_c.makeup_of_candidate_id and m.status = 'active' and m.id <> v_c.id) then
      return jsonb_build_object('status', 'already_added');
    end if;

    perform set_config('tkd.action', 'bb_restore_candidate', true);
    perform set_config('tkd.batch_id', gen_random_uuid()::text, true);

    update public.bb_candidates c
       set status            = 'active',
           withdrawn_reason  = null,
           withdrawn_at      = null,
           withdrawn_by_name = null,
           withdrawn_by      = null
     where c.id = v_c.id;
    perform public.bb_recheck_duplicate(v_c.id);
    select c.duplicate_of into v_of from public.bb_candidates c where c.id = v_c.id;
    if v_of is not null then
      perform public.bb_recheck_duplicate(v_of);
    end if;
    perform public.bb_recheck_pointing_at(v_c.id);

    perform set_config('tkd.action', '', true);
    perform set_config('tkd.batch_id', '', true);

    select c.version into v_version from public.bb_candidates c where c.id = v_c.id;
    return jsonb_build_object('status', 'ok', 'version', v_version);
  exception
    when unique_violation then
      get stacked diagnostics v_constraint = constraint_name;
      if v_constraint = 'bb_candidates_one_active_makeup_idx' then
        return jsonb_build_object('status', 'already_added');
      end if;
      if v_constraint = 'bb_cycles_lower_name_idx' then
        return jsonb_build_object('status', 'duplicate_name');
      end if;
      return jsonb_build_object('status', 'stale');
    when foreign_key_violation or check_violation or not_null_violation then
      return jsonb_build_object('status', 'invalid');
    when deadlock_detected or serialization_failure or lock_not_available then
      return jsonb_build_object('status', 'stale');
  end;
end;
$$;

revoke execute on function public.bb_restore_candidate(uuid, integer) from public, anon, authenticated, service_role;
grant  execute on function public.bb_restore_candidate(uuid, integer) to authenticated;

-- 9h. bb_delete_candidate(...) - REPLACES 0016's (15m; Q-G3). Identical,
-- plus: a candidate with real grades -> has_grades (after has_payments:
-- "[Name] has grades, so they can't be deleted. Withdraw them instead.",
-- v0.950); and a grade guard refusing the cascade -> has_grades too.
create or replace function public.bb_delete_candidate(
  p_candidate_id     uuid,
  p_expected_version integer
)
returns jsonb
language plpgsql
volatile
security definer
set search_path = ''
as $$
-- 0025: replaced
declare
  v_c          public.bb_candidates;
  v_pointing   uuid[];
  v_id         uuid;
  v_constraint text;
begin
  begin
    if public.has_data_access() is not true then
      return jsonb_build_object('status', 'no_access');
    end if;
    if public.is_admin() is not true then
      return jsonb_build_object('status', 'not_allowed');
    end if;

    if p_candidate_id is null or p_expected_version is null then
      return jsonb_build_object('status', 'invalid');
    end if;

    v_c := public.bb_lock_candidate(p_candidate_id);
    if v_c.id is null then
      return jsonb_build_object('status', 'not_found');
    end if;
    if v_c.version <> p_expected_version then
      return jsonb_build_object('status', 'stale');
    end if;
    if exists (select 1 from public.bb_payments p where p.candidate_id = v_c.id) then
      return jsonb_build_object('status', 'has_payments');
    end if;
    -- Q-G3: real grades (a grade, a count or a chosen subject). A
    -- just-added make-up with only kept and retest rows has none, so its
    -- toast Undo works (v0.913).
    if public.bb_candidate_has_grades(v_c.id) then
      return jsonb_build_object('status', 'has_grades');
    end if;

    v_pointing := array(select c.id from public.bb_candidates c where c.duplicate_of = v_c.id order by c.id);

    perform set_config('tkd.action', 'bb_delete_candidate', true);
    perform set_config('tkd.batch_id', gen_random_uuid()::text, true);

    delete from public.bb_candidates c where c.id = v_c.id;

    foreach v_id in array v_pointing loop
      perform public.bb_recheck_duplicate(v_id);
    end loop;

    perform set_config('tkd.action', '', true);
    perform set_config('tkd.batch_id', '', true);

    return jsonb_build_object('status', 'ok');
  exception
    when unique_violation then
      get stacked diagnostics v_constraint = constraint_name;
      if v_constraint = 'bb_cycles_lower_name_idx' then
        return jsonb_build_object('status', 'duplicate_name');
      end if;
      return jsonb_build_object('status', 'stale');
    when foreign_key_violation then
      -- defence in depth behind the check above: a payment row points here
      get stacked diagnostics v_constraint = constraint_name;
      if v_constraint like 'bb\_payments\_%' then
        return jsonb_build_object('status', 'has_payments');
      end if;
      return jsonb_build_object('status', 'invalid');
    when check_violation then
      -- defence in depth behind the check above: a grade guard refused
      get stacked diagnostics v_constraint = constraint_name;
      if v_constraint in ('bb_grades_rules', 'bb_extra_counts_rules', 'bb_makeup_subjects_rules') then
        return jsonb_build_object('status', 'has_grades');
      end if;
      return jsonb_build_object('status', 'invalid');
    when not_null_violation then
      return jsonb_build_object('status', 'invalid');
    when deadlock_detected or serialization_failure or lock_not_available then
      return jsonb_build_object('status', 'stale');
  end;
end;
$$;

revoke execute on function public.bb_delete_candidate(uuid, integer) from public, anon, authenticated, service_role;
grant  execute on function public.bb_delete_candidate(uuid, integer) to authenticated;

-- 9i. bb_cycle_roster(cycle) - REPLACES 0016's (16c; contract 6.5). The
-- same rows, plus: the plan join is a LEFT join (a make-up row has no
-- plan, so it is still listed; plan_id / plan_name are null for it), and
-- each row gains is_makeup, makeup_of_cycle_name, retest_names (the names
-- of its retest subjects in rubric order; [] for other rows) and
-- has_grades (real grades: grays Delete permanently).
create or replace function public.bb_cycle_roster(p_cycle_id uuid)
returns jsonb
language plpgsql
volatile
security definer
set search_path = ''
as $$
-- 0025: replaced
declare
  v_today date;
  v_rows  jsonb;
  v_req   jsonb;
begin
  begin
    if public.has_data_access() is not true then
      return jsonb_build_object('status', 'no_access');
    end if;
    if p_cycle_id is null then
      return jsonb_build_object('status', 'invalid');
    end if;
    if not exists (select 1 from public.bb_cycles y where y.id = p_cycle_id) then
      return jsonb_build_object('status', 'not_found');
    end if;

    v_today := public.testing_today();
    select y.requirements into v_req from public.bb_cycles y where y.id = p_cycle_id;
    select coalesce(jsonb_agg(jsonb_build_object(
             'id',               c.id,
             'first_name',       c.first_name,
             'last_name',        c.last_name,
             'location_code',    c.location_code,
             'dan',              c.dan,
             'plan_id',          c.cycle_plan_id,
             'plan_name',        pl.name,
             'kukkiwon',         c.kukkiwon,
             'source',           c.source,
             'reference',        c.reference,
             'registered_at',    c.registered_at,
             'status',           c.status,
             'withdrawn_reason', c.withdrawn_reason,
             'duplicate_state',  c.duplicate_state,
             'duplicate_of',     c.duplicate_of,
             'version',          c.version,
             'has_payment_rows', exists (select 1 from public.bb_payments p where p.candidate_id = c.id),
             'money',            public.bb_candidate_money(c.id, v_today) - 'items',
             -- 0025: the make-up keys and "has real grades"
             'is_makeup',        c.source = 'makeup',
             'makeup_of_cycle_name', c.makeup_of_cycle_name,
             'retest_names',     case when c.source = 'makeup' then coalesce((
                                   select jsonb_agg(s.e ->> 'name' order by p.o, s.o)
                                     from jsonb_array_elements(v_req -> 'dans' -> (c.dan - 1) -> 'parts') with ordinality as p(e, o)
                                     cross join lateral jsonb_array_elements(p.e -> 'subjects') with ordinality as s(e, o)
                                    where exists (select 1 from public.bb_makeup_subjects m
                                                   where m.candidate_id = c.id and m.dan = c.dan and m.kind = 'retest'
                                                     and m.subject_id = s.e ->> 'id')), '[]'::jsonb)
                                 else '[]'::jsonb end,
             'has_grades',       public.bb_candidate_has_grades(c.id))
           order by c.dan, case c.location_code when 'shrewsbury' then 0 else 1 end,
                    lower(c.last_name), lower(c.first_name), c.id), '[]'::jsonb)
      into v_rows
      from public.bb_candidates c
      left join public.bb_cycle_plans pl on pl.id = c.cycle_plan_id
     where c.cycle_id = p_cycle_id;

    perform public.bb_purge_due();

    return jsonb_build_object('status', 'ok', 'state', public.bb_cycle_state(p_cycle_id, v_today), 'rows', v_rows);
  exception
    when unique_violation then
      return jsonb_build_object('status', 'stale');
    when foreign_key_violation or check_violation or not_null_violation then
      return jsonb_build_object('status', 'invalid');
    when deadlock_detected or serialization_failure or lock_not_available then
      return jsonb_build_object('status', 'stale');
  end;
end;
$$;

revoke execute on function public.bb_cycle_roster(uuid) from public, anon, authenticated, service_role;
grant  execute on function public.bb_cycle_roster(uuid) to authenticated;

-- 9j. bb_candidate_detail(candidate) - REPLACES 0016's (16d; contract
-- 6.5). The same answer, plus: the candidate object never holds
-- makeup_of_candidate_id or age_kept (deliberately: the detail names the
-- earlier CYCLE, never the earlier row's id or a kept age); it gains the
-- roster's four keys (is_makeup, makeup_of_cycle_name, retest_names,
-- has_grades); plan is null for a make-up row. age_on_first_day stays
-- worked out from the date of birth only (null after the purge day -
-- never from age_kept).
create or replace function public.bb_candidate_detail(p_candidate_id uuid)
returns jsonb
language plpgsql
stable
security definer
set search_path = ''
as $$
-- 0025: replaced
declare
  v_today date;
  v_c     public.bb_candidates;
  v_pl    public.bb_cycle_plans;
  v_w     public.bb_candidate_waivers;
  v_vname text;
  v_first date;
  v_due   boolean;
  v_dob   date;
  v_age   integer;
  v_needs boolean;
begin
  begin
    if public.has_data_access() is not true then
      return jsonb_build_object('status', 'no_access');
    end if;
    if p_candidate_id is null then
      return jsonb_build_object('status', 'invalid');
    end if;

    select * into v_c from public.bb_candidates c where c.id = p_candidate_id;
    if not found then
      return jsonb_build_object('status', 'not_found');
    end if;
    v_today := public.testing_today();
    select * into v_pl from public.bb_cycle_plans pl where pl.id = v_c.cycle_plan_id;
    select * into v_w from public.bb_candidate_waivers w
     where w.candidate_id = v_c.id order by w.signed_at desc, w.id desc limit 1;
    select v.version_name into v_vname from public.bb_waiver_versions v where v.id = v_w.waiver_version_id;
    select min(d.day_date) into v_first from public.bb_cycle_days d where d.cycle_id = v_c.cycle_id;

    -- the purge day has passed: personal values are not answered any more
    v_due := public.bb_purge_is_due(v_c.id, v_today);
    v_dob := case when v_due then null else v_c.date_of_birth end;
    v_age := public.bb_age_on(v_dob, v_first);
    v_needs := coalesce(v_age < 18 and not v_w.signed_as_minor, false);

    return jsonb_build_object(
      'status', 'ok',
      'candidate', (to_jsonb(v_c) - array['created_by', 'updated_by', 'withdrawn_by', 'makeup_of_candidate_id', 'age_kept'])
                   || jsonb_build_object(
                        'date_of_birth',         v_dob,
                        'email_for_results',     case when v_due then null else v_c.email_for_results end,
                        'age_on_first_day',      v_age,
                        'under_18_on_first_day', case when v_age is null then null else v_age < 18 end,
                        'plan',                  case when v_pl.id is null then null
                                                      else jsonb_build_object('name', v_pl.name, 'payments_count', v_pl.payments_count) end,
                        -- 0025: the make-up keys (the earlier cycle's NAME, never the earlier row's id or a kept age)
                        'is_makeup',             v_c.source = 'makeup',
                        'makeup_of_cycle_name',  v_c.makeup_of_cycle_name,
                        'retest_names',          case when v_c.source = 'makeup' then coalesce((
                                                   select jsonb_agg(s.e ->> 'name' order by p.o, s.o)
                                                     from public.bb_cycles y
                                                     cross join lateral jsonb_array_elements(y.requirements -> 'dans' -> (v_c.dan - 1) -> 'parts')
                                                          with ordinality as p(e, o)
                                                     cross join lateral jsonb_array_elements(p.e -> 'subjects') with ordinality as s(e, o)
                                                    where y.id = v_c.cycle_id
                                                      and exists (select 1 from public.bb_makeup_subjects m
                                                                   where m.candidate_id = v_c.id and m.dan = v_c.dan and m.kind = 'retest'
                                                                     and m.subject_id = s.e ->> 'id')), '[]'::jsonb)
                                                 else '[]'::jsonb end,
                        'has_grades',            public.bb_candidate_has_grades(v_c.id)),
      'waiver', case when v_w.id is null then null
                     else jsonb_build_object(
                            'how',               v_w.how,
                            'version_name',      v_vname,
                            'signed_at',         v_w.signed_at,
                            'signer_name',       case when v_due then null else v_w.signer_name end,
                            'signed_as_minor',   v_w.signed_as_minor,
                            'ticked_by_name',    v_w.ticked_by_name,
                            'signature_on_file', v_w.signature is not null,
                            'removed_at',        v_w.removed_at) end,
      'needs_parent_signature', v_needs,
      'payments', coalesce((
        select jsonb_agg(jsonb_build_object(
                 'id',                  p.id,
                 'kind',                p.kind,
                 'amount_cents',        p.amount_cents,
                 'method',              p.method,
                 'paid_on',             p.paid_on,
                 'for_items',           p.for_items,
                 'note',                p.note,
                 'reason',              p.reason,
                 'recorded_at',         p.recorded_at,
                 'recorded_by_name',    p.recorded_by_name,
                 'reverses_payment_id', p.reverses_payment_id,
                 'returned',            p.kind = 'payment'
                                        and exists (select 1 from public.bb_payments t
                                                     where t.reverses_payment_id = p.id and t.kind = 'returned'
                                                       and not exists (select 1 from public.bb_payments u
                                                                        where u.reverses_payment_id = t.id and u.kind = 'reversal')))
               order by p.recorded_at, p.id)
          from public.bb_payments p
         where p.candidate_id = v_c.id
           and p.kind in ('payment', 'refund', 'returned')
           and not exists (select 1 from public.bb_payments r where r.reverses_payment_id = p.id and r.kind = 'reversal')),
        '[]'::jsonb),
      'money', public.bb_candidate_money(v_c.id, v_today));
  exception
    when unique_violation then
      return jsonb_build_object('status', 'stale');
    when foreign_key_violation or check_violation or not_null_violation then
      return jsonb_build_object('status', 'invalid');
    when deadlock_detected or serialization_failure or lock_not_available then
      return jsonb_build_object('status', 'stale');
  end;
end;
$$;

revoke execute on function public.bb_candidate_detail(uuid) from public, anon, authenticated, service_role;
grant  execute on function public.bb_candidate_detail(uuid) to authenticated;

-- 9k. bb_save_cycle_dan(...) - REPLACES 0024's (10c; Q-G1, OI-2 B). Identical, plus:
-- after the "locked" check and before the rev check, a cycle that ever had
-- a grading row -> {"status":"has_grades","grading_started_at":...} (the
-- "grading started" mark of 2g, not a live count: clearing every grade
-- never unlocks it). The table rule (5c) is the second wall.
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
-- 0025: replaced
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
    -- Q-G1 + OI-2 B: once grading started the copy is locked for good
    if public.bb_cycle_grading_started_at(p_cycle_id) is not null then
      return jsonb_build_object('status', 'has_grades', 'grading_started_at', public.bb_cycle_grading_started_at(p_cycle_id));
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

-- 9l. bb_undo_cycle_dan(...) - REPLACES 0024's (10d; Q-G1, OI-2 B). Identical, plus:
-- after the "locked" check and before the rev check, a cycle that ever had
-- a grading row -> {"status":"has_grades","grading_started_at":...} (the
-- "grading started" mark of 2g, not a live count: clearing every grade
-- never unlocks it). The table rule (5c) is the second wall.
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
-- 0025: replaced
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
    -- Q-G1 + OI-2 B: once grading started the copy is locked for good
    if public.bb_cycle_grading_started_at(p_cycle_id) is not null then
      return jsonb_build_object('status', 'has_grades', 'grading_started_at', public.bb_cycle_grading_started_at(p_cycle_id));
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


-- ---------------------------------------------------------------------
-- 10. Security rules: RLS + rights (contract section 8; the same two
--     layers as 0016 section 12)
--   * RLS on all seven new tables. Staff with data access may READ the
--     rows of bb_grades, bb_extra_counts, bb_makeup_subjects,
--     bb_result_sends and bb_result_texts - but only bb_result_texts has
--     a column right (staff read the texts, R 21). The other four are
--     read ONLY through the functions above, so a direct query can never
--     join a grade to a date of birth.
--   * bb_downloads and bb_cycle_grading_started: RLS on, no rule, no
--     rights = nobody in the app (SQL Editor only)
--   * no INSERT / UPDATE / DELETE rights for anyone: every write goes
--     through the functions
--   * the three new bb_candidates columns are granted to NOBODY (0016's
--     column list on bb_candidates is not changed)
--   * nothing at all for anon, service_role, PUBLIC or the family form's
--     login (bb_registrar keeps exactly its two functions)
-- ---------------------------------------------------------------------
alter table public.bb_grades                enable row level security;
alter table public.bb_extra_counts          enable row level security;
alter table public.bb_makeup_subjects       enable row level security;
alter table public.bb_result_texts          enable row level security;
alter table public.bb_result_sends          enable row level security;
alter table public.bb_downloads             enable row level security;
alter table public.bb_cycle_grading_started enable row level security;

-- Start from zero (also removes column rights, so re-runs stay clean)...
revoke all on table public.bb_grades, public.bb_extra_counts, public.bb_makeup_subjects, public.bb_result_texts,
                    public.bb_result_sends, public.bb_downloads, public.bb_cycle_grading_started
  from public, anon, authenticated, service_role;

-- ...then add back exactly what the app reads.
grant select (id, kind, body, version, created_at, updated_at, created_by_name, updated_by_name)
  on public.bb_result_texts to authenticated;          -- NOT created_by, updated_by

-- The read rules ("(select ...)" = run the check once per query, not per
-- row). Each is made only when it is missing, then always set to exactly
-- this definition (so a re-run repairs a changed rule without removing
-- it).
do $$
begin
  if not exists (select 1 from pg_policies p where p.schemaname = 'public' and p.tablename = 'bb_grades'
                    and p.policyname = 'bb_grades_select_with_access') then
    create policy bb_grades_select_with_access on public.bb_grades for select to authenticated
      using ((select public.has_data_access()));
  end if;
  if not exists (select 1 from pg_policies p where p.schemaname = 'public' and p.tablename = 'bb_extra_counts'
                    and p.policyname = 'bb_extra_counts_select_with_access') then
    create policy bb_extra_counts_select_with_access on public.bb_extra_counts for select to authenticated
      using ((select public.has_data_access()));
  end if;
  if not exists (select 1 from pg_policies p where p.schemaname = 'public' and p.tablename = 'bb_makeup_subjects'
                    and p.policyname = 'bb_makeup_subjects_select_with_access') then
    create policy bb_makeup_subjects_select_with_access on public.bb_makeup_subjects for select to authenticated
      using ((select public.has_data_access()));
  end if;
  if not exists (select 1 from pg_policies p where p.schemaname = 'public' and p.tablename = 'bb_result_sends'
                    and p.policyname = 'bb_result_sends_select_with_access') then
    create policy bb_result_sends_select_with_access on public.bb_result_sends for select to authenticated
      using ((select public.has_data_access()));
  end if;
  if not exists (select 1 from pg_policies p where p.schemaname = 'public' and p.tablename = 'bb_result_texts'
                    and p.policyname = 'bb_result_texts_select_with_access') then
    create policy bb_result_texts_select_with_access on public.bb_result_texts for select to authenticated
      using ((select public.has_data_access()));
  end if;
end
$$;
alter policy bb_grades_select_with_access on public.bb_grades
  to authenticated using ((select public.has_data_access()));
alter policy bb_extra_counts_select_with_access on public.bb_extra_counts
  to authenticated using ((select public.has_data_access()));
alter policy bb_makeup_subjects_select_with_access on public.bb_makeup_subjects
  to authenticated using ((select public.has_data_access()));
alter policy bb_result_sends_select_with_access on public.bb_result_sends
  to authenticated using ((select public.has_data_access()));
alter policy bb_result_texts_select_with_access on public.bb_result_texts
  to authenticated using ((select public.has_data_access()));

-- The replaced functions keep exactly 0016's / 0024's rights ("create or
-- replace" kept them; this states them again, word for word).
revoke execute on function public.bb_purge_due_on(uuid) from public, anon, authenticated, service_role;
revoke execute on function public.bb_purge_due() from public, anon, authenticated, service_role;
revoke execute on function public.bb_candidates_rules() from public, anon, authenticated, service_role;
revoke execute on function public.bb_candidates_log() from public, anon, authenticated, service_role;
revoke execute on function public.bb_cycles_rules() from public, anon, authenticated, service_role;
revoke execute on function public.bb_update_cycle(uuid, integer, jsonb) from public, anon, authenticated, service_role;
grant  execute on function public.bb_update_cycle(uuid, integer, jsonb) to authenticated;
revoke execute on function public.bb_delete_cycle(uuid, integer, integer) from public, anon, authenticated, service_role;
grant  execute on function public.bb_delete_cycle(uuid, integer, integer) to authenticated;
revoke execute on function public.bb_update_candidate(uuid, integer, text, text, date, text, text, integer) from public, anon, authenticated, service_role;
grant  execute on function public.bb_update_candidate(uuid, integer, text, text, date, text, text, integer) to authenticated;
revoke execute on function public.bb_change_plan(uuid, integer, uuid, boolean) from public, anon, authenticated, service_role;
grant  execute on function public.bb_change_plan(uuid, integer, uuid, boolean) to authenticated;
revoke execute on function public.bb_restore_candidate(uuid, integer) from public, anon, authenticated, service_role;
grant  execute on function public.bb_restore_candidate(uuid, integer) to authenticated;
revoke execute on function public.bb_delete_candidate(uuid, integer) from public, anon, authenticated, service_role;
grant  execute on function public.bb_delete_candidate(uuid, integer) to authenticated;
revoke execute on function public.bb_cycle_roster(uuid) from public, anon, authenticated, service_role;
grant  execute on function public.bb_cycle_roster(uuid) to authenticated;
revoke execute on function public.bb_candidate_detail(uuid) from public, anon, authenticated, service_role;
grant  execute on function public.bb_candidate_detail(uuid) to authenticated;
revoke execute on function public.bb_save_cycle_dan(uuid, integer, integer, jsonb) from public, anon, authenticated, service_role;
grant  execute on function public.bb_save_cycle_dan(uuid, integer, integer, jsonb) to authenticated;
revoke execute on function public.bb_undo_cycle_dan(uuid, integer, integer) from public, anon, authenticated, service_role;
grant  execute on function public.bb_undo_cycle_dan(uuid, integer, integer) to authenticated;


-- ---------------------------------------------------------------------
-- 11. The seed: R03 proposal 26's three starting texts, word for word
--     (G9). Written as the SQL Editor's role, tagged 'bb_seed', by
--     "Database admin" (as 0016 11n). It NEVER overwrites: a kind that
--     exists (an admin may have changed it) is left alone ("on conflict
--     do nothing"). Each text is one line here; \n is a line break
--     (E'...' strings), so the file's own line endings can never get into
--     a text. The apostrophes are typographic (U+2019), as drawn in R03.
-- ---------------------------------------------------------------------
select set_config('request.jwt.claims', '', true);
select set_config('tkd.actor_label', 'Database admin', true);
select set_config('tkd.action', 'bb_seed', true);
select set_config('tkd.batch_id', gen_random_uuid()::text, true);

insert into public.bb_result_texts (kind, body, created_by_name, updated_by_name)
values
  ('passed',
   E'Hello,\n\n{full name} passed the {cycle} Black Belt testing ({Dan}), with a total of {total} points. Congratulations, {first name}!\n\nThe pass mark for {first name}’s age group is {pass mark} points, with no D in any subject.\n\nThank you for all the hard work. If you have any questions, please contact the school.\n\nJae H. Jeong’s U.S. Taekwondo Center\nWorcester and Shrewsbury',
   '', ''),
  ('makeup_d',
   E'Hello,\n\n{full name} took the {cycle} Black Belt testing ({Dan}), with a total of {total} points. {first name} has a make-up to do before earning {Dan}.\n\nThe pass mark for {first name}’s age group is {pass mark} points, with no D in any subject. {first name} received a D in {D subjects}. {below-pass-mark note}\n\nWhat to work on: {subjects to work on}. Every other grade is kept; only this is tested again.\n\nThe make-up is graded at a later testing cycle, with no extra fee. We’ll let you know when. If you have any questions, please contact the school.\n\nJae H. Jeong’s U.S. Taekwondo Center\nWorcester and Shrewsbury',
   '', ''),
  ('makeup_below',
   E'Hello,\n\n{full name} took the {cycle} Black Belt testing ({Dan}), with a total of {total} points. {first name} has a make-up to do before earning {Dan}.\n\nThe pass mark for {first name}’s age group is {pass mark} points, with no D in any subject. {first name}’s total is below the pass mark.\n\nWhat to work on: {subjects to work on}. Every other grade is kept; only these subjects are tested again.\n\nThe make-up is graded at a later testing cycle, with no extra fee. We’ll let you know when. If you have any questions, please contact the school.\n\nJae H. Jeong’s U.S. Taekwondo Center\nWorcester and Shrewsbury',
   '', '')
on conflict (kind) do nothing;

select set_config('tkd.actor_label', '', true);
select set_config('tkd.action', '', true);
select set_config('tkd.batch_id', '', true);

commit;
