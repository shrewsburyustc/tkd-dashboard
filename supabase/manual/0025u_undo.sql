-- =====================================================================
-- 0025u_undo.sql - Undo migration 0025 (Black Belt grading and results)
-- ---------------------------------------------------------------------
-- WHAT THIS FILE IS
--   The "Undo 0025" script of supabase/SETUP.md, step 0025g. It takes the
--   database back to exactly what 0016 + 0024 made: the seven 0025 tables
--   and their triggers, the three new bb_candidates columns, the seven new
--   bb_candidates rules, the three new indexes, the four 0025 triggers on
--   old tables and every new function are removed; and 0016's / 0024's
--   own versions of everything 0025 replaced are put back FROM COPIES KEPT
--   IN THIS FILE (word for word from 0016_black_belt.sql and
--   0024_black_belt_rubric.sql). It never re-runs 0016 or 0024 (re-running
--   0016 would undo 0024).
--
-- WHEN TO USE IT
--   Only with Jeffrey's OK, and only if 0025 must come off production
--   before anyone graded. It REFUSES (and changes nothing) while any of
--   these exists: a grade, a count or a make-up subject; a "grading
--   started" mark; a make-up candidate; a "sent" mark; a CSV download
--   row; a result email text that isn't the seeded one any more; a kept
--   age. Those are real records; removing them is not an undo.
--
-- HOW TO RUN IT
--   SQL Editor -> New query -> paste this whole file -> Run. One
--   transaction ("begin;" ... "commit;"): if any statement fails, nothing
--   is kept. Supabase warns about destructive operations - expected: the
--   point is to remove 0025's objects. The history (change_log) is
--   append-only: the seed's rows of 0025 stay in it.
--   Afterwards: 0016_fingerprints.sql and 0024_fingerprints.sql must equal
--   the baselines of step 0025a, and 0016_tests.sql / 0024_tests.sql pass.
--   (PGlite step0025 g runs this file exactly as written.)
-- =====================================================================

begin;

-- 0. Hold the tables still: nobody can write a grade, a send, a download
--    or a candidate between the check below and the removal (the locks
--    end with this transaction). If 0025 isn't installed, the check below
--    says so; these lines then fail on the missing tables, which also
--    changes nothing.
lock table public.bb_grades, public.bb_extra_counts, public.bb_makeup_subjects, public.bb_result_texts,
           public.bb_result_sends, public.bb_downloads, public.bb_cycle_grading_started, public.bb_candidates
  in access exclusive mode;

-- 1. Refuse unless nothing real was recorded with 0025
do $$
declare
  v_why text;
begin
  if to_regclass('public.bb_grades') is null then
    raise exception 'Undo 0025 refused: 0025 is not installed (public.bb_grades is missing). Nothing was changed.';
  end if;
  v_why := case
    when exists (select 1 from public.bb_grades) then 'grades exist'
    when exists (select 1 from public.bb_extra_counts) then 'extra-points counts exist'
    when exists (select 1 from public.bb_makeup_subjects) then 'make-up subjects exist'
    when exists (select 1 from public.bb_cycle_grading_started) then 'a cycle has a "grading started" mark'
    when exists (select 1 from public.bb_candidates where source = 'makeup' or makeup_of_candidate_id is not null) then 'make-up candidates exist'
    when exists (select 1 from public.bb_result_sends) then '"sent" marks exist'
    when exists (select 1 from public.bb_downloads) then 'CSV downloads were logged'
    when exists (select 1 from public.bb_result_texts where version <> 1) then 'a result email text was changed'
    when exists (select 1 from public.bb_candidates where age_kept is not null) then 'a kept age exists'
  end;
  if v_why is not null then
    raise exception 'Undo 0025 refused: % (real records; this is not an undo any more). Nothing was changed.', v_why;
  end if;
end
$$;

-- 2. Put back 0016's and 0024's own versions of every function 0025
--    replaced (copies, word for word, with their rights)

-- bb_purge_due_on: 0016's version
create or replace function public.bb_purge_due_on(p_candidate_id uuid)
returns date
language sql
stable
set search_path = ''
as $$
  select greatest((select max(d.day_date) from public.bb_cycle_days d where d.cycle_id = c.cycle_id)
                    + make_interval(years => s.keep_years_after_last_day::integer),
                  c.date_of_birth + make_interval(years => 18 + s.keep_years_after_18::integer))::date
    from public.bb_candidates c
    cross join public.bb_settings s
   where c.id = p_candidate_id
     and s.keep_years_after_last_day is not null
     and s.keep_years_after_18 is not null;
$$;

revoke execute on function public.bb_purge_due_on(uuid) from public, anon, authenticated, service_role;

-- bb_purge_due: 0016's version
create or replace function public.bb_purge_due()
returns integer
language plpgsql
volatile
set search_path = ''
as $$
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
           personal_removed_at = now()
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

-- bb_update_cycle: 0016's version
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
    when foreign_key_violation or check_violation or not_null_violation then
      return jsonb_build_object('status', 'invalid');
    when deadlock_detected or serialization_failure or lock_not_available then
      return jsonb_build_object('status', 'stale');
  end;
end;
$$;

revoke execute on function public.bb_update_cycle(uuid, integer, jsonb) from public, anon, authenticated, service_role;
grant  execute on function public.bb_update_cycle(uuid, integer, jsonb) to authenticated;

-- bb_delete_cycle: 0016's version
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
    when check_violation or not_null_violation then
      return jsonb_build_object('status', 'invalid');
    when deadlock_detected or serialization_failure or lock_not_available then
      return jsonb_build_object('status', 'stale');
  end;
end;
$$;

revoke execute on function public.bb_delete_cycle(uuid, integer, integer) from public, anon, authenticated, service_role;
grant  execute on function public.bb_delete_cycle(uuid, integer, integer) to authenticated;

-- bb_update_candidate: 0016's version
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
declare
  v_today      date;
  v_first      text;
  v_last       text;
  v_email      text;
  v_c          public.bb_candidates;
  v_rows       integer;
  v_of         uuid;
  v_version    integer;
  v_needs      boolean;
  v_constraint text;
begin
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
       or p_dan is null or p_dan not between 1 and 4 then
      return jsonb_build_object('status', 'invalid');
    end if;

    v_c := public.bb_lock_candidate(p_candidate_id);
    if v_c.id is null then
      return jsonb_build_object('status', 'not_found');
    end if;
    if v_c.version <> p_expected_version then
      return jsonb_build_object('status', 'stale');
    end if;

    -- 6. rules that depend on the saved row
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

    perform set_config('tkd.action', 'bb_update_candidate', true);
    perform set_config('tkd.batch_id', gen_random_uuid()::text, true);

    -- version + 1 on purpose: a DOB or email fix alone would not bump it
    -- (they are no-bump columns for the purge, 11a)
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
    return jsonb_build_object('status', 'ok', 'version', v_version, 'needs_parent_signature', v_needs);
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

-- bb_change_plan: 0016's version
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

-- bb_restore_candidate: 0016's version
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

-- bb_delete_candidate: 0016's version
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
    when check_violation or not_null_violation then
      return jsonb_build_object('status', 'invalid');
    when deadlock_detected or serialization_failure or lock_not_available then
      return jsonb_build_object('status', 'stale');
  end;
end;
$$;

revoke execute on function public.bb_delete_candidate(uuid, integer) from public, anon, authenticated, service_role;
grant  execute on function public.bb_delete_candidate(uuid, integer) to authenticated;

-- bb_cycle_roster: 0016's version
create or replace function public.bb_cycle_roster(p_cycle_id uuid)
returns jsonb
language plpgsql
volatile
security definer
set search_path = ''
as $$
declare
  v_today date;
  v_rows  jsonb;
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
             'money',            public.bb_candidate_money(c.id, v_today) - 'items')
           order by c.dan, case c.location_code when 'shrewsbury' then 0 else 1 end,
                    lower(c.last_name), lower(c.first_name), c.id), '[]'::jsonb)
      into v_rows
      from public.bb_candidates c
      join public.bb_cycle_plans pl on pl.id = c.cycle_plan_id
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

-- bb_candidate_detail: 0016's version
create or replace function public.bb_candidate_detail(p_candidate_id uuid)
returns jsonb
language plpgsql
stable
security definer
set search_path = ''
as $$
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
      'candidate', (to_jsonb(v_c) - array['created_by', 'updated_by', 'withdrawn_by'])
                   || jsonb_build_object(
                        'date_of_birth',         v_dob,
                        'email_for_results',     case when v_due then null else v_c.email_for_results end,
                        'age_on_first_day',      v_age,
                        'under_18_on_first_day', case when v_age is null then null else v_age < 18 end,
                        'plan',                  jsonb_build_object('name', v_pl.name, 'payments_count', v_pl.payments_count)),
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

-- bb_candidates_rules: 0016's version
create or replace function public.bb_candidates_rules()
returns trigger
language plpgsql
set search_path = ''
as $$
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
  return new;
end;
$$;

revoke execute on function public.bb_candidates_rules() from public, anon, authenticated, service_role;

-- bb_candidates_log: 0016's version
create or replace function public.bb_candidates_log()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_secret text[] := array['date_of_birth', 'email_for_results'];
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
                                     'email_for_results', case when new.email_for_results is null then null else 'on file' end);
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
    -- the two secrets: masked, and only when they changed
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
                                      'email_for_results', case when old.email_for_results is null then null else 'on file' end);
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

-- bb_save_cycle_dan: 0024's version
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

-- bb_undo_cycle_dan: 0024's version
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

-- bb_cycles_rules: 0024's version
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

-- 3. 0016's version bookkeeping on bb_candidates (its own arguments)
drop trigger if exists bb_candidates_before_write on public.bb_candidates;
create trigger bb_candidates_before_write
  before insert or update on public.bb_candidates
  for each row execute function public.bb_before_write(
    'id,cycle_id,source,reference,registered_at',
    'date_of_birth,email_for_results,personal_removed_at');

-- 4. The four 0025 triggers on old tables
drop trigger if exists bb_candidates_keep_age on public.bb_candidates;
drop trigger if exists bb_payments_makeup_guard on public.bb_payments;
drop trigger if exists bb_cycle_days_grading on public.bb_cycle_days;
drop trigger if exists bb_cycle_day_parts_grading on public.bb_cycle_day_parts;

-- 5. The seven 0025 tables (their triggers, rules and read rules go with them)
drop table if exists public.bb_grades;
drop table if exists public.bb_extra_counts;
drop table if exists public.bb_makeup_subjects;
drop table if exists public.bb_result_sends;
drop table if exists public.bb_result_texts;
drop table if exists public.bb_downloads;
drop table if exists public.bb_cycle_grading_started;

-- 6. bb_candidates back to 0016's rules: the seven new rules and three
--    new indexes by name, the three columns, then 0016's reference rule,
--    source rule and "a candidate has a plan"
alter table public.bb_candidates drop constraint if exists bb_candidates_makeup_of_fk;
alter table public.bb_candidates drop constraint if exists bb_candidates_makeup_of_self_check;
alter table public.bb_candidates drop constraint if exists bb_candidates_makeup_of_check;
alter table public.bb_candidates drop constraint if exists bb_candidates_makeup_name_check;
alter table public.bb_candidates drop constraint if exists bb_candidates_makeup_plan_check;
alter table public.bb_candidates drop constraint if exists bb_candidates_makeup_kukkiwon_check;
alter table public.bb_candidates drop constraint if exists bb_candidates_age_kept_check;
drop index if exists public.bb_candidates_reference_idx;
drop index if exists public.bb_candidates_one_active_makeup_idx;
drop index if exists public.bb_candidates_makeup_of_idx;
alter table public.bb_candidates drop column if exists makeup_of_candidate_id;
alter table public.bb_candidates drop column if exists makeup_of_cycle_name;
alter table public.bb_candidates drop column if exists age_kept;
alter table public.bb_candidates drop constraint if exists bb_candidates_reference_key;
alter table public.bb_candidates add constraint bb_candidates_reference_key unique (reference);
alter table public.bb_candidates drop constraint if exists bb_candidates_source_check;
alter table public.bb_candidates add constraint bb_candidates_source_check check (source in ('form', 'desk'));
alter table public.bb_candidates alter column cycle_plan_id set not null;

-- 7. Every function 0025 added
drop function if exists public.bb_set_grade(uuid, integer, text, text);
drop function if exists public.bb_set_measured(uuid, integer, text, numeric, integer);
drop function if exists public.bb_set_extra_count(uuid, integer, text, integer);
drop function if exists public.bb_set_makeup_subjects(uuid, text[], text[]);
drop function if exists public.bb_add_makeup(uuid, uuid);
drop function if exists public.bb_mark_result_sent(uuid, text);
drop function if exists public.bb_undo_result_sent(uuid);
drop function if exists public.bb_set_result_text(text, integer, text);
drop function if exists public.bb_update_candidate_clear(uuid, integer, text, text, date, text, text, integer, integer, integer, integer);
drop function if exists public.bb_grading_grid(uuid, integer);
drop function if exists public.bb_cycle_results(uuid, integer);
drop function if exists public.bb_makeup_list(uuid);
drop function if exists public.bb_result_email(uuid);
drop function if exists public.bb_results_csv(uuid);
drop function if exists public.bb_cycle_grading_state(uuid);
drop function if exists public.bb_update_candidate_core(uuid, integer, text, text, date, text, text, integer, integer, integer, integer);
drop function if exists public.bb_lock_candidate_shared(uuid);
drop function if exists public.bb_sent_state(uuid, jsonb);
drop function if exists public.bb_candidate_has_grades(uuid);
drop function if exists public.bb_cycle_grading_started_at(uuid);
drop function if exists public.bb_cycle_has_grading(uuid);
drop function if exists public.bb_candidate_result(uuid);
drop function if exists public.bb_candidate_result_with(public.bb_candidates, jsonb, date, date, date);
drop function if exists public.bb_candidate_grading_input(uuid, integer);
drop function if exists public.bb_candidate_age(uuid);
drop function if exists public.bb_kept_match(jsonb, jsonb, jsonb, jsonb, integer);
drop function if exists public.bb_grade_result(jsonb, integer, jsonb, jsonb, text[], text[], date, date);
drop function if exists public.bb_extra_points(jsonb, jsonb);
drop function if exists public.bb_measured_letter(jsonb, integer, numeric);
drop function if exists public.bb_age_groups(jsonb);
drop function if exists public.bb_result_text_problem(text, text);
drop function if exists public.bb_note_grading_started();
drop function if exists public.bb_cycle_grading_started_guard();
drop function if exists public.bb_candidates_keep_age();
drop function if exists public.bb_grades_rules();
drop function if exists public.bb_extra_counts_rules();
drop function if exists public.bb_makeup_subjects_rules();
drop function if exists public.bb_result_sends_guard();
drop function if exists public.bb_downloads_guard();
drop function if exists public.bb_payments_makeup_guard();
drop function if exists public.bb_cycle_days_grading();
drop function if exists public.bb_cycle_day_parts_grading();

commit;
