-- =====================================================================
-- 0054_tests.sql
-- ---------------------------------------------------------------------
-- WHAT THIS FILE IS
--   The tests for migration 0054 (Finance's event money report and its
--   CSV rows: finance_event_report, finance_event_export, the new log
--   table finance_event_exports and four internal helpers; contract
--   docs/Finance/Event reports/CONTRACT-0054-0055.md). It makes one event
--   of EACH of the five kinds (Color Belt, Star, camp, Black Belt cycle,
--   Board breaking) with money in every state Finance knows (a payment at
--   each school's desk, an edit that moves the money to another day or
--   school, an undone payment, a quick Undo that leaves no line, a refund,
--   a returned check, a Star private candidate) and checks:
--     R1  the report of each event: its days, and on every day the totals,
--         refunds and returned figures equal Finance's OWN Daily reports of
--         that day (both schools added), and its lines are Finance's lines
--         with the school added; the totals per school and the grand totals
--         add up; Worcester is listed first; days run newest first
--     R2  the school choice: asking for one school gives only that school's
--         lines and exactly that school's figures from the full report
--     R3  specific lines: who is "edited", "moved in / out", "undone", the
--         quick Undo leaving no line, the refund at the other desk, a
--         Square payment with no login, the returned check, the private
--         Star candidate flagged is_private, another event's money absent
--     E1  the CSV rows: one row per line, the keys of one finance_export
--         row, the counted cents add up to the report's total, and ONE log
--         row is written per call (a school choice and the event are kept)
--     X   the log: nobody can change or remove a log row or empty the table;
--         the log never shows the login id; refused calls write nothing
--     A   access: signed out, PIN-locked and locked sessions read nothing
--         (no_access); the front desk (role staff) gets not_allowed on both
--         functions; anon cannot run either function or read the table
--     V   input: a bad source, no event, an unknown school, an event that
--         does not exist or belongs to another source -> invalid / not_found
--     K   privacy: every key in every answer is on the fixed list and no
--         login id appears anywhere
--     C   the six new functions: security definer or not, search path, who
--         may run them; the table: RLS on, no rights for anyone in the app
--   The money rows are written straight into the payment tables (September
--   2021 days: no real data there), as 0047_tests.sql / 0052_tests.sql do;
--   the events, the camp sign-ups and the Black Belt candidates are made
--   with the app's real functions.
--
-- IS IT SAFE?
--   Yes. One transaction ending with ROLLBACK. NEVER change the final
--   "rollback;" to "commit;".
--
-- BEFORE YOU RUN IT
--   0052 and 0054 are applied. Replace <paste-admin-UID-here> and
--   <paste-desk-UID-here> (Authentication -> Users: an ACTIVE admin and the
--   ACTIVE front-desk login) and run the whole file in the SQL Editor.
--   Passed: one row "ALL 0054 TESTS PASSED". Failed: "TEST FAILED: ..." /
--   "TEST SETUP: ..."; nothing was saved. If it failed, run   rollback;
--   on its own once.
-- =====================================================================

begin;

-- every answer a function gave (for K)
create temp table t_answers (fn text, r jsonb);
-- the expected number of days | lines of each event's report, checked at the end
create temp table t_expect (label text, got text, want text, brief text);

-- t_call(login token, call): ONE call as role authenticated with that
-- login, then back to the SQL Editor's role. Returns the answer.
create function pg_temp.t_call(p_claims text, p_call text)
returns jsonb
language plpgsql
as $$
declare
  v_r jsonb;
begin
  perform set_config('request.jwt.claims', coalesce(p_claims, ''), true);
  set local role authenticated;
  begin
    execute 'select ' || p_call into v_r;
  exception
    when others then
      reset role;
      raise;
  end;
  reset role;
  insert into t_answers values (p_call, v_r);
  return v_r;
end;
$$;

-- t_eq(label, got, want): fail when they differ (as text)
create function pg_temp.t_eq(p_label text, p_got text, p_want text)
returns void
language plpgsql
as $$
begin
  if p_got is distinct from p_want then
    raise exception 'TEST FAILED: % - got %, expected %', p_label, coalesce(p_got, 'NULL'), coalesce(p_want, 'NULL');
  end if;
end;
$$;

-- t_keys(json): every object key anywhere inside a JSON value
create function pg_temp.t_keys(p jsonb)
returns setof text
language sql
as $$
  with recursive w(v) as (
    select p
    union all
    select e.value
      from w,
           lateral (select x.value from jsonb_each(case when jsonb_typeof(w.v) = 'object' then w.v else '{}'::jsonb end) as x
                    union all
                    select y.value from jsonb_array_elements(case when jsonb_typeof(w.v) = 'array' then w.v else '[]'::jsonb end) as y) as e
  )
  select distinct k
    from w, lateral jsonb_object_keys(case when jsonb_typeof(w.v) = 'object' then w.v else '{}'::jsonb end) as k;
$$;

-- t_add(a, b): two JSON objects of the same shape, every number added
create function pg_temp.t_add(a jsonb, b jsonb)
returns jsonb
language plpgsql
as $$
declare
  k text;
  r jsonb := '{}'::jsonb;
begin
  if jsonb_typeof(a) = 'object' then
    for k in select jsonb_object_keys(a) loop
      r := r || jsonb_build_object(k, pg_temp.t_add(a -> k, b -> k));
    end loop;
    return r;
  end if;
  return to_jsonb((a #>> '{}')::bigint + (b #>> '{}')::bigint);
end;
$$;

-- t_fig(answer): the figures part of a report / day answer (totals, refunds, returned)
create function pg_temp.t_fig(p jsonb)
returns jsonb
language sql
as $$
  select jsonb_build_object('totals', p -> 'totals', 'refunds', p -> 'refunds', 'returned', p -> 'returned');
$$;

-- t_lines(report, last name, base day): that student's lines over all days as
-- "dayoffset:school:state:was_school:amount:method" (was_school '-' when null), sorted
create function pg_temp.t_lines(p_report jsonb, p_last text, p_base date)
returns text
language sql
as $$
  select coalesce(string_agg(((e ->> 'day')::date - p_base)::text || ':' || (e ->> 'school') || ':' || (e ->> 'state') || ':'
                             || coalesce(e ->> 'was_school', '-') || ':' || (e ->> 'amount_cents') || ':' || (e ->> 'method'), ','
                             order by ((e ->> 'day')::date - p_base), (e ->> 'state') collate "C", (e ->> 'amount_cents') collate "C"), '')
    from jsonb_array_elements(p_report -> 'days') d, jsonb_array_elements(d -> 'items') e
   where e ->> 'last_name' = p_last or e ->> 'first_name' = p_last;
$$;

-- t_brief(report): every line as day:last name:school:state:amount (for a failure message)
create function pg_temp.t_brief(p_report jsonb)
returns text
language sql
as $$
  select coalesce(string_agg((e ->> 'day') || ':' || (e ->> 'last_name') || ':' || (e ->> 'school') || ':' || (e ->> 'state') || ':' || (e ->> 'amount_cents'),
                             ' ' order by (e ->> 'day'), (e ->> 'last_name')), '')
    from jsonb_array_elements(p_report -> 'days') d, jsonb_array_elements(d -> 'items') e;
$$;

-- t_nitems(report): how many lines the report lists over all days
create function pg_temp.t_nitems(p_report jsonb)
returns integer
language sql
as $$
  select coalesce(sum(jsonb_array_length(d -> 'items')), 0)::integer from jsonb_array_elements(p_report -> 'days') d;
$$;

-- t_finday(claims, day): Finance's own Daily report lines of that day, both schools, with the school
-- added and without the "added after closing" key, sorted by payment id
create function pg_temp.t_finday(p_claims text, p_day date)
returns jsonb
language plpgsql
as $$
declare
  v_w jsonb := pg_temp.t_call(p_claims, format('public.finance_day(%L, %L)', 'worcester', p_day));
  v_s jsonb := pg_temp.t_call(p_claims, format('public.finance_day(%L, %L)', 'shrewsbury', p_day));
begin
  return (select coalesce(jsonb_agg(x order by x ->> 'payment_id'), '[]'::jsonb)
            from (select (e - 'added_after_closing') || jsonb_build_object('school', 'worcester') as x
                    from jsonb_array_elements(v_w -> 'items') e
                  union all
                  select (e - 'added_after_closing') || jsonb_build_object('school', 'shrewsbury')
                    from jsonb_array_elements(v_s -> 'items') e) q);
end;
$$;

-- t_check(claims, source, event, name, today, days, lines, extra keys): the checks every event's report must
-- pass (R1 = the report, R2 = one school, E1 = the CSV rows). Returns the full report.
create function pg_temp.t_check(p_claims text, p_source text, p_event uuid, p_name text, p_today date,
                                p_days integer, p_lines integer, p_extra integer)
returns jsonb
language plpgsql
as $$
declare
  v_r     jsonb;
  v_r2    jsonb;
  v_ex    jsonb;
  v_day   jsonb;
  v_d     date;
  v_fw    jsonb;
  v_fs    jsonb;
  v_sum   jsonb := null;
  v_sch   jsonb;
  v_fin   jsonb;
  v_mine  jsonb;
  v_n     integer;
  v_log   integer;
  v_prev  date := null;
  v_l     text := p_source || ' ';
  v_base  text[] := array['day', 'school', 'time', 'first_name', 'last_name', 'what', 'event_date', 'is_private', 'was_school',
                          'kind', 'method', 'amount_cents', 'counted_cents', 'recorded_by_name', 'state', 'note'];
begin
  -- ---- R1: the full report
  v_r := pg_temp.t_call(p_claims, format('public.finance_event_report(%L, %L)', p_source, p_event));
  perform pg_temp.t_eq(v_l || 'R1 status, source, school, event',
    concat_ws('|', v_r ->> 'status', v_r ->> 'source', coalesce(v_r ->> 'school', '-'), v_r #>> '{event,id}', v_r #>> '{event,name}'),
    concat_ws('|', 'ok', p_source, '-', p_event::text, p_name));
  perform pg_temp.t_eq(v_l || 'R1 the report has exactly these keys',
    (select string_agg(k, ',' order by k collate "C") from jsonb_object_keys(v_r) k),
    'by_school,days,event,refunds,returned,school,source,status,totals');
  -- (the number of days and lines is checked at the very end, so a failure lists every report's lines at once)
  insert into t_expect values (v_l || 'R1 days | lines', jsonb_array_length(v_r -> 'days') || '|' || pg_temp.t_nitems(v_r),
                               p_days || '|' || p_lines, pg_temp.t_brief(v_r));
  select count(*)::integer into v_n
    from jsonb_array_elements(v_r -> 'days') d, jsonb_array_elements(d -> 'items') e
   where (select count(*) from jsonb_object_keys(e)) <> 22 + p_extra;
  perform pg_temp.t_eq(v_l || 'R1 every line has the keys of a Finance line + school (+ the extras of its source)', v_n::text, '0');

  for v_day in select e from jsonb_array_elements(v_r -> 'days') e loop
    v_d := (v_day ->> 'day')::date;
    if v_prev is not null and v_d >= v_prev then
      raise exception 'TEST FAILED: % R1 the days are not newest first (% after %)', v_l, v_d, v_prev;
    end if;
    v_prev := v_d;
    v_fin := pg_temp.t_finday(p_claims, v_d);
    v_mine := (select coalesce(jsonb_agg(e order by e ->> 'payment_id'), '[]'::jsonb) from jsonb_array_elements(v_day -> 'items') e);
    if v_d <> p_today then
      -- a day of this test's own: the whole day is this event's, so Finance's day IS the report's day
      v_fw := pg_temp.t_call(p_claims, format('public.finance_day(%L, %L)', 'worcester', v_d));
      v_fs := pg_temp.t_call(p_claims, format('public.finance_day(%L, %L)', 'shrewsbury', v_d));
      perform pg_temp.t_eq(v_l || 'R1 ' || v_d || ': figures = Finance''s two Daily reports added',
        pg_temp.t_fig(v_day)::text, pg_temp.t_add(pg_temp.t_fig(v_fw), pg_temp.t_fig(v_fs))::text);
      perform pg_temp.t_eq(v_l || 'R1 ' || v_d || ': lines = Finance''s lines (with the school)', v_mine::text, v_fin::text);
    else
      -- today may hold other real money: every line of the report must be one of Finance's lines
      select count(*)::integer into v_n
        from jsonb_array_elements(v_mine) e
       where not exists (select 1 from jsonb_array_elements(v_fin) f where f = e);
      perform pg_temp.t_eq(v_l || 'R1 today: every report line is one of Finance''s lines', v_n::text, '0');
    end if;
    v_sum := case when v_sum is null then pg_temp.t_fig(v_day) else pg_temp.t_add(v_sum, pg_temp.t_fig(v_day)) end;
  end loop;
  if v_sum is not null then
    perform pg_temp.t_eq(v_l || 'R1 the days add up to the totals', v_sum::text, pg_temp.t_fig(v_r)::text);
  end if;
  v_sum := null;
  for v_sch in select e from jsonb_array_elements(v_r -> 'by_school') e loop
    v_sum := case when v_sum is null then pg_temp.t_fig(v_sch) else pg_temp.t_add(v_sum, pg_temp.t_fig(v_sch)) end;
  end loop;
  if v_sum is not null then
    perform pg_temp.t_eq(v_l || 'R1 the schools add up to the totals', v_sum::text, pg_temp.t_fig(v_r)::text);
  end if;
  perform pg_temp.t_eq(v_l || 'R1 net = total', v_r #>> '{totals,net_cents}', v_r #>> '{totals,total_cents}');
  perform pg_temp.t_eq(v_l || 'R1 Worcester is listed before Shrewsbury',
    (select string_agg(e ->> 'school', ',' order by n) from jsonb_array_elements(v_r -> 'by_school') with ordinality as t(e, n)),
    (select string_agg(e ->> 'school', ',' order by case e ->> 'school' when 'worcester' then 0 else 1 end)
       from jsonb_array_elements(v_r -> 'by_school') e));

  -- ---- R2: one school at a time
  for v_sch in select e from jsonb_array_elements(v_r -> 'by_school') e loop
    v_r2 := pg_temp.t_call(p_claims, format('public.finance_event_report(%L, %L, %L)', p_source, p_event, v_sch ->> 'school'));
    perform pg_temp.t_eq(v_l || 'R2 ' || (v_sch ->> 'school') || ': status, school, one school listed',
      concat_ws('|', v_r2 ->> 'status', v_r2 ->> 'school', jsonb_array_length(v_r2 -> 'by_school'), v_r2 #>> '{by_school,0,school}'),
      concat_ws('|', 'ok', v_sch ->> 'school', '1', v_sch ->> 'school'));
    perform pg_temp.t_eq(v_l || 'R2 ' || (v_sch ->> 'school') || ': its figures = that school''s part of the full report',
      pg_temp.t_fig(v_r2)::text, pg_temp.t_fig(v_sch)::text);
    select count(*)::integer into v_n
      from jsonb_array_elements(v_r2 -> 'days') d, jsonb_array_elements(d -> 'items') e where e ->> 'school' <> v_sch ->> 'school';
    perform pg_temp.t_eq(v_l || 'R2 ' || (v_sch ->> 'school') || ': only its lines', v_n::text, '0');
    select count(*)::integer into v_n
      from jsonb_array_elements(v_r -> 'days') d, jsonb_array_elements(d -> 'items') e where e ->> 'school' = v_sch ->> 'school';
    perform pg_temp.t_eq(v_l || 'R2 ' || (v_sch ->> 'school') || ': all of its lines', pg_temp.t_nitems(v_r2)::text, v_n::text);
  end loop;

  -- ---- E1: the CSV rows and the log row
  select count(*)::integer into v_log from public.finance_event_exports where event_id = p_event;
  v_ex := pg_temp.t_call(p_claims, format('public.finance_event_export(%L, %L)', p_source, p_event));
  perform pg_temp.t_eq(v_l || 'E1 status, source, event name, school',
    concat_ws('|', v_ex ->> 'status', v_ex ->> 'source', v_ex ->> 'event_name', coalesce(v_ex ->> 'school', '-')),
    concat_ws('|', 'ok', p_source, p_name, '-'));
  perform pg_temp.t_eq(v_l || 'E1 exactly these keys', (select string_agg(k, ',' order by k collate "C") from jsonb_object_keys(v_ex) k),
    'event_name,rows,school,source,status');
  perform pg_temp.t_eq(v_l || 'E1 one row per line', jsonb_array_length(v_ex -> 'rows')::text, pg_temp.t_nitems(v_r)::text);
  select count(*)::integer into v_n
    from jsonb_array_elements(v_ex -> 'rows') e
   where not (e ?& v_base) or (select count(*) from jsonb_object_keys(e)) <> 16 + p_extra;
  perform pg_temp.t_eq(v_l || 'E1 every row has the keys of a finance_export row (+ the extras of its source)', v_n::text, '0');
  perform pg_temp.t_eq(v_l || 'E1 the counted cents add up to the report''s total',
    (select coalesce(sum((e ->> 'counted_cents')::integer), 0)::text from jsonb_array_elements(v_ex -> 'rows') e), v_r #>> '{totals,total_cents}');
  perform pg_temp.t_eq(v_l || 'E1 rows are in day order',
    (select string_agg(e ->> 'day', ',' order by n) from jsonb_array_elements(v_ex -> 'rows') with ordinality as t(e, n)),
    (select string_agg(e ->> 'day', ',' order by e ->> 'day') from jsonb_array_elements(v_ex -> 'rows') e));
  perform pg_temp.t_eq(v_l || 'E1 ONE log row for the call',
    ((select count(*) from public.finance_event_exports where event_id = p_event) - v_log)::text, '1');
  perform pg_temp.t_eq(v_l || 'E1 the log row: source | event | name | school | rows',
    (select concat_ws('|', x.source, x.event_id::text, x.event_name, coalesce(x.location_code, '-'), x.row_count::text)
       from public.finance_event_exports x where x.event_id = p_event and x.location_code is null),
    concat_ws('|', p_source, p_event::text, p_name, '-', pg_temp.t_nitems(v_r)::text));
  -- one school: its rows only, and its own log row
  v_sch := v_r -> 'by_school' -> 0;
  v_ex := pg_temp.t_call(p_claims, format('public.finance_event_export(%L, %L, %L)', p_source, p_event, v_sch ->> 'school'));
  select count(*)::integer into v_n from jsonb_array_elements(v_ex -> 'rows') e where e ->> 'school' <> v_sch ->> 'school';
  perform pg_temp.t_eq(v_l || 'E1 one school: its rows only, the school in the answer',
    v_n || '|' || (v_ex ->> 'school') || '|' || (v_ex ->> 'status'), '0|' || (v_sch ->> 'school') || '|ok');
  perform pg_temp.t_eq(v_l || 'E1 one school: its own log row (rows = its lines)',
    (select concat_ws('|', x.location_code, x.row_count::text) from public.finance_event_exports x
      where x.event_id = p_event and x.location_code = v_sch ->> 'school'),
    (v_sch ->> 'school') || '|' || jsonb_array_length(v_ex -> 'rows'));
  return v_r;
end;
$$;

-- t_reg(event, class, last name, amount, paying by): a Board breaking student, written straight in
create function pg_temp.t_reg(p_event uuid, p_class uuid, p_last text, p_amount integer, p_paying text)
returns uuid
language plpgsql
as $$
declare
  v_id uuid;
begin
  insert into public.brk_registrations
    (event_id, class_id, first_name, last_name, age, rank_name, band_used, tech_boards, adult_boards, paying_by,
     paying_by_on_form, same_day, amount_cents, source, entered_by, created_by_name, updated_by_name)
  values (p_event, p_class, 'Fin54', p_last, 10, 'Yellow', 'child', 1, 0, p_paying, p_paying, false, p_amount, 'desk',
          'Fin54 test', '', '')
  returning id into v_id;
  return v_id;
end;
$$;

-- t_pay(registration, kind, cents, method, day, school, at, login, name, reverses): one Board breaking payment row
create function pg_temp.t_pay(p_reg uuid, p_kind text, p_cents integer, p_method text, p_day date, p_school text,
                              p_at timestamptz, p_by uuid, p_name text, p_reverses uuid default null)
returns uuid
language plpgsql
as $$
declare
  v_id uuid;
begin
  insert into public.brk_payments
    (registration_id, kind, amount_cents, method, paid_on, school, recorded_at, recorded_by, recorded_by_name, reverses_payment_id)
  values (p_reg, p_kind, p_cents, p_method, p_day, p_school, p_at, p_by, p_name, p_reverses)
  returning id into v_id;
  return v_id;
end;
$$;

-- t_row(...): one bb_payments row written straight into the table (for a PAST day; the real functions always use
-- today), with the candidate's cycle and the given school; a reversal / returned row copies its target's school
-- and cycle name (the table's guard demands that)
create function pg_temp.t_row(p_cand uuid, p_kind text, p_amount integer, p_method text, p_paid_on date,
                              p_at timestamptz, p_by uuid, p_name text, p_items text[], p_target uuid, p_school text)
returns uuid
language plpgsql
as $$
declare
  v uuid;
begin
  perform set_config('request.jwt.claims', '', true);
  perform set_config('tkd.actor_label', 'zz fin54 test', true);
  insert into public.bb_payments (candidate_id, cycle_id, kind, amount_cents, method, paid_on, for_items,
                                  location_code, cycle_name, recorded_at, recorded_by, recorded_by_name, reverses_payment_id)
  select c.id, c.cycle_id, p_kind, p_amount, p_method, p_paid_on, p_items,
         coalesce(t.location_code, p_school), coalesce(t.cycle_name, y.name), p_at, p_by, p_name, p_target
    from public.bb_candidates c
    join public.bb_cycles y on y.id = c.cycle_id
    left join public.bb_payments t on t.id = p_target
   where c.id = p_cand
  returning id into v;
  perform set_config('tkd.actor_label', '', true);
  return v;
end;
$$;

-- t_cycle(name, first day, application due): a Black Belt cycle payload for bb_add_cycle
create function pg_temp.t_cycle(p_name text, p_d1 date, p_app date)
returns jsonb
language sql
as $$
  select jsonb_build_object(
    'name', p_name, 'application_due', p_app, 'submissions_due', p_d1 + 10, 'auto_close', true,
    'days', jsonb_build_array(
      jsonb_build_object('name', 'Physical', 'day_date', p_d1, 'start_time', '12:30', 'end_time', '14:30',
                         'place', jsonb_build_object('code', 'worcester'), 'second', null,
                         'parts', jsonb_build_array('physical')),
      jsonb_build_object('name', 'Technical', 'day_date', p_d1 + 7, 'start_time', '12:30', 'end_time', '15:30',
                         'place', jsonb_build_object('code', 'shrewsbury'), 'second', null,
                         'parts', jsonb_build_array('technical')),
      jsonb_build_object('name', 'Curriculum', 'day_date', p_d1 + 14, 'start_time', '14:00', 'end_time', '17:00',
                         'place', jsonb_build_object('code', 'shrewsbury'), 'second', null,
                         'parts', jsonb_build_array('curriculum'))),
    'plans', jsonb_build_array(
      jsonb_build_object('name', 'In full',
                         'payments', jsonb_build_array(jsonb_build_object('due_on', p_app, 'follows_application_due', true)),
                         'amounts', jsonb_build_object('1', jsonb_build_array(87000), '2', jsonb_build_array(99000),
                                                       '3', jsonb_build_array(150000), '4', jsonb_build_array(270000))),
      jsonb_build_object('name', '3 payments',
                         'payments', jsonb_build_array(jsonb_build_object('due_on', p_app, 'follows_application_due', true),
                                                       jsonb_build_object('due_on', p_d1 + 7, 'follows_application_due', false),
                                                       jsonb_build_object('due_on', p_d1 + 14, 'follows_application_due', false)),
                         'amounts', jsonb_build_object('1', jsonb_build_array(29000, 29000, 29000),
                                                       '2', jsonb_build_array(33000, 33000, 33000),
                                                       '3', jsonb_build_array(50000, 50000, 50000),
                                                       '4', jsonb_build_array(90000, 90000, 90000)))),
    'kukkiwon', jsonb_build_object('1', 10000, '2', 11000, '3', 14000, '4', 17000),
    'prices_from', null);
$$;

-- t_signup(code, camp, names, key, sub): the camp family form (no login), the first try sends 0 cents, then
-- the total it is told
create function pg_temp.t_signup(p_code text, p_camp uuid, p_names text[], p_key text, p_sub uuid)
returns jsonb
language plpgsql
as $$
declare
  v_r     jsonb;
  v_total integer := 0;
  v_try   integer;
  v_kids  jsonb;
begin
  select jsonb_agg(jsonb_build_object('first_name', n.name, 'last_name', 'Fin54', 'age', 8, 'member', true,
                     'day_ids', (select jsonb_agg(d.id order by d.day) from public.camp_days d where d.camp_id = p_camp),
                     'extras', '[]'::jsonb) order by n.k)
    into v_kids
    from unnest(p_names) with ordinality as n(name, k);
  perform set_config('request.jwt.claims', '', true);
  for v_try in 1 .. 2 loop
    select public.camp_public_signup(p_code, p_key, p_sub, v_kids,
             'Pat Parent', '5085550100', 'Mother', 'Sam Contact', '5085550101', 'Aunt', 'cash', true,
             'data:image/png;base64,iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR42mNkYPhfDwAChwGA60e6kgAAAABJRU5ErkJggg==',
             'camp-2026-10-18', (select md5(c.waiver_text) from public.camps c where c.id = p_camp), v_total)
      into v_r;
    exit when v_r ->> 'status' is distinct from 'price_changed';
    v_total := (v_r ->> 'new_total_cents')::integer;
  end loop;
  return v_r;
end;
$$;


do $$
declare
  -- >>> EDIT THESE TWO LINES <<<
  v_admin uuid := '<paste-admin-UID-here>';
  v_desk  uuid := '<paste-desk-UID-here>';

  v_a1 uuid := gen_random_uuid();   -- admin, unlocked
  v_a2 uuid := gen_random_uuid();   -- admin, PIN-locked (the unlock ran out)
  v_d1 uuid := gen_random_uuid();   -- front desk, unlocked
  v_d2 uuid := gen_random_uuid();   -- front desk, locked (never unlocked)
  v_now_s  bigint := extract(epoch from now())::bigint;
  v_amr_1m jsonb := jsonb_build_array(jsonb_build_object('method', 'password', 'timestamp', v_now_s - 60));
  v_c_a1 text; v_c_a2 text; v_c_d1 text; v_c_d2 text;

  v_tag   text := 'zz fin54 ' || left(gen_random_uuid()::text, 8);
  v_today date := public.testing_today();
  -- this test's own past days, one block of days per kind of event (so Finance's Daily report of each day is that
  -- event's alone): Color Belt v_d .. v_d+2, Star v_d+10 .., camp v_d+20 .., Black Belt v_d+30 .. (+ today),
  -- Board breaking v_d+40 .. (another event on v_d+45)
  v_d     date := date '2021-08-16';
  v_an    text;   -- the admin's and the desk's names, as the history shows them
  v_dn    text;
  v_role  text;
  v_t     timestamptz;
  v_t0    timestamptz;
  v_mon   date := date_trunc('week', (public.testing_today() + 14)::timestamp)::date + 7;
  v_prices3 jsonb := '[{"day_count": 1, "member_early_cents": 7500, "member_regular_cents": 8000, "nonmember_early_cents": 8500, "nonmember_regular_cents": 9000},
                       {"day_count": 2, "member_early_cents": 14000, "member_regular_cents": 15000, "nonmember_early_cents": 15000, "nonmember_regular_cents": 16000},
                       {"day_count": 3, "member_early_cents": 19500, "member_regular_cents": 21000, "nonmember_early_cents": 20500, "nonmember_regular_cents": 22000}]';

  v_r      jsonb;
  v_x      jsonb;
  v_txt    text;
  v_bad    text;
  v_n      integer;
  v_log0   integer;
  v_logs   integer;
  v_hist0  integer;
  v_msg    text;

  -- Color Belt
  v_cb_cls uuid; v_cb_rank uuid; v_cb_ev uuid; v_cb_er uuid; v_cb1 uuid; v_cb2 uuid; v_cb3 uuid; v_cbp2 uuid;
  -- Star
  v_sevt uuid; v_sc1 uuid; v_sc2 uuid; v_sc3 uuid; v_sp1 uuid;
  -- camp
  v_camp uuid; v_code text; v_ann uuid; v_bob uuid; v_cy uuid; v_cp_bob uuid; v_cp_cy uuid;
  -- Black Belt
  v_cy_bb uuid; v_full uuid; v_k1 uuid; v_k2 uuid; v_k3 uuid; v_bp1 uuid; v_bp2 uuid; v_bp3 uuid;
  v_dob date := (public.testing_today() - interval '30 years')::date;
  -- Board breaking
  v_ew uuid; v_es uuid; v_cw uuid; v_cs uuid;
  v_r1 uuid; v_r2 uuid; v_r3 uuid; v_r5 uuid; v_r6 uuid; v_r8 uuid; v_r9 uuid; v_r10 uuid; v_r12 uuid;
  v_p5 uuid; v_p6 uuid; v_p8 uuid; v_p9 uuid; v_p10 uuid;

  v_rb jsonb; v_rc jsonb; v_rs jsonb; v_rk jsonb; v_rt jsonb;

  v_allowed_keys text[] := array[
    'status', 'source', 'school', 'event', 'id', 'name', 'totals', 'refunds', 'returned', 'by_school', 'days', 'day', 'items',
    'count', 'total_cents', 'in_cents', 'net_cents', 'cash', 'check', 'card', 'cents', 'cash_cents', 'check_cents', 'card_cents',
    'payment_id', 'time', 'first_name', 'last_name', 'what', 'event_date', 'is_private', 'kind', 'method', 'amount_cents',
    'state', 'was_amount_cents', 'was_method', 'was_school', 'moved_to', 'moved_from', 'changed_by_name', 'changed_on',
    'recorded_by_name', 'event_name', 'for_items', 'one_payment_plan', 'handed_in_on', 'rows', 'counted_cents', 'note'];
begin
  -- ===================================================================
  -- Setup (as the SQL Editor's role)
  -- ===================================================================
  select s.role, s.full_name into v_role, v_an from public.staff s where s.id = v_admin and s.active;
  if v_role is distinct from 'admin' then
    raise exception 'TEST SETUP: no ACTIVE admin staff row with id %. Paste the admin UID into v_admin.', v_admin;
  end if;
  select s.role, s.full_name into v_role, v_dn from public.staff s where s.id = v_desk and s.active;
  if v_role is distinct from 'staff' then
    raise exception 'TEST SETUP: no ACTIVE role-staff row with id %. Paste the front-desk UID into v_desk.', v_desk;
  end if;
  if to_regprocedure('public.finance_event_report(text, uuid, text)') is null
     or to_regprocedure('public.finance_event_export(text, uuid, text)') is null
     or to_regclass('public.finance_event_exports') is null then
    raise exception 'TEST SETUP: 0054 must be applied first';
  end if;
  if to_regclass('public.brk_payments') is null then
    raise exception 'TEST SETUP: 0051 (Board breaking) must be applied first';
  end if;
  if exists (select 1 from public.testing_payments p where p.paid_on between v_d - 5 and v_d + 50)
     or exists (select 1 from public.star_payments p where p.paid_on between v_d - 5 and v_d + 50)
     or exists (select 1 from public.camp_payments p where p.paid_on between v_d - 5 and v_d + 50)
     or exists (select 1 from public.testing_private_payments p where p.paid_on between v_d - 5 and v_d + 50)
     or exists (select 1 from public.bb_payments p where p.paid_on between v_d - 5 and v_d + 50)
     or exists (select 1 from public.brk_payments p where p.paid_on between v_d - 5 and v_d + 50) then
    raise exception 'TEST SETUP: there are payments dated around % already; this test needs those days empty', v_d;
  end if;

  perform set_config('request.jwt.claims', '', true);
  insert into auth.sessions (id, user_id) values (v_a1, v_admin), (v_a2, v_admin), (v_d1, v_desk), (v_d2, v_desk);
  insert into public.session_unlock (session_id, staff_id, unlocked_until) values
    (v_a1, v_admin, now() + interval '30 minutes'),
    (v_a2, v_admin, now() - interval '1 minute'),
    (v_d1, v_desk,  now() + interval '30 minutes');
  v_c_a1 := jsonb_build_object('sub', v_admin, 'role', 'authenticated', 'session_id', v_a1, 'amr', v_amr_1m)::text;
  v_c_a2 := jsonb_build_object('sub', v_admin, 'role', 'authenticated', 'session_id', v_a2, 'amr', v_amr_1m)::text;
  v_c_d1 := jsonb_build_object('sub', v_desk,  'role', 'authenticated', 'session_id', v_d1, 'amr', v_amr_1m)::text;
  v_c_d2 := jsonb_build_object('sub', v_desk,  'role', 'authenticated', 'session_id', v_d2, 'amr', v_amr_1m)::text;
  select count(*)::integer into v_log0 from public.finance_event_exports;
  select count(*)::integer into v_hist0 from public.change_log l where l.table_name = 'finance_event_exports' and l.op = 'insert';

  perform set_config('tkd.actor_label', 'PGlite 0054 test', true);

  -- ===================================================================
  -- Color Belt: a testing with three students, v_d .. v_d+2
  -- ===================================================================
  v_cb_cls := (pg_temp.t_call(v_c_a1, format('public.testing_add_class(%L, %L, null, true)', 'worcester', v_tag)) ->> 'id')::uuid;
  v_cb_rank := (pg_temp.t_call(v_c_a1,
    format('public.testing_add_rank(%L, %L, 6500, 7500, 8500, false, %L, %L, null, 0, %L)', v_cb_cls, 'Yellow', 'solid', 'yellow', 'yellow')) ->> 'id')::uuid;
  v_cb_ev := (pg_temp.t_call(v_c_a1, format('public.testing_add_event(%L, %L, %L, %L::jsonb, false, null, null)',
    'worcester', v_tag || ' color belt', v_today + 5,
    jsonb_build_array(jsonb_build_object('class_id', v_cb_cls, 'start_time', '17:00', 'end_time', '18:00'))::text)) ->> 'id')::uuid;
  if v_cb_rank is null or v_cb_ev is null then
    raise exception 'TEST SETUP: could not create the test Color Belt class / event';
  end if;
  select k.id into v_cb_er from public.testing_event_ranks k join public.testing_event_classes c on c.id = k.event_class_id
   where c.event_id = v_cb_ev and k.rank_id = v_cb_rank;
  insert into public.testing_registrations (event_id, event_rank_id, first_name, last_name, paying_by, stripes_confirmed, source)
  values (v_cb_ev, v_cb_er, 'Fin54', 'Cb One', 'cash', true, 'staff') returning id into v_cb1;
  insert into public.testing_registrations (event_id, event_rank_id, first_name, last_name, paying_by, stripes_confirmed, source)
  values (v_cb_ev, v_cb_er, 'Fin54', 'Cb Two', 'cash', true, 'staff') returning id into v_cb2;
  insert into public.testing_registrations (event_id, event_rank_id, first_name, last_name, paying_by, stripes_confirmed, source)
  values (v_cb_ev, v_cb_er, 'Fin54', 'Cb Three', 'cash', true, 'staff') returning id into v_cb3;
  v_t := (v_d + time '10:00') at time zone 'America/New_York';
  -- One: a plain payment taken at the Shrewsbury desk (the event is Worcester's)
  insert into public.testing_payments (registration_id, kind, amount_cents, method, paid_on, school, recorded_at, recorded_by, recorded_by_name)
  values (v_cb1, 'payment', 6500, 'cash', v_d, 'shrewsbury', v_t, v_admin, v_an);
  -- Two: $75 check on day 0; the next day the admin edits it to $80 card (a reversal + a new payment in one moment)
  insert into public.testing_payments (registration_id, kind, amount_cents, method, paid_on, school, recorded_at, recorded_by, recorded_by_name)
  values (v_cb2, 'payment', 7500, 'check', v_d, 'worcester', v_t + interval '1 hour', v_admin, v_an) returning id into v_cbp2;
  insert into public.testing_payments (registration_id, kind, amount_cents, method, paid_on, school, recorded_at, recorded_by, recorded_by_name, reverses_payment_id)
  values (v_cb2, 'reversal', -7500, 'check', v_d + 1, 'worcester', v_t + interval '1 day', v_admin, v_an, v_cbp2);
  insert into public.testing_payments (registration_id, kind, amount_cents, method, paid_on, school, recorded_at, recorded_by, recorded_by_name)
  values (v_cb2, 'payment', 8000, 'card', v_d + 1, 'worcester', v_t + interval '1 day', v_admin, v_an);
  -- Three: a payment undone two days later
  insert into public.testing_payments (registration_id, kind, amount_cents, method, paid_on, school, recorded_at, recorded_by, recorded_by_name)
  values (v_cb3, 'payment', 6500, 'cash', v_d, 'worcester', v_t + interval '2 hours', v_admin, v_an) returning id into v_cbp2;
  insert into public.testing_payments (registration_id, kind, amount_cents, method, paid_on, school, recorded_at, recorded_by, recorded_by_name, reverses_payment_id)
  values (v_cb3, 'reversal', -6500, 'cash', v_d + 2, 'worcester', v_t + interval '2 days', v_admin, v_an, v_cbp2);

  -- ===================================================================
  -- Star: one event, a private candidate, v_d+10 .. v_d+12
  -- ===================================================================
  insert into public.star_events (name, testing_date, start_time, where_code, registration_open,
                                  public_code_worcester, public_code_shrewsbury, created_by_name, updated_by_name)
  values (v_tag || ' star', v_today + 30, '10:00', 'worcester', false,
          public.testing_new_public_code(), public.testing_new_public_code(), '', '')
  returning id into v_sevt;
  perform public.star_copy_template_into_event(v_sevt);
  insert into public.star_candidates (event_id, first_name, last_name, location_code, dan, stars_from, paying_by, source, created_by_name, updated_by_name)
  values (v_sevt, 'Fin54', 'Star One', 'shrewsbury', 1, 0, 'cash', 'desk', '', '') returning id into v_sc1;
  insert into public.star_candidates (event_id, first_name, last_name, location_code, dan, stars_from, paying_by, source,
                                      private_on, private_time, created_by_name, updated_by_name)
  values (v_sevt, 'Fin54', 'Star Two', 'shrewsbury', 1, 0, 'check', 'desk', v_today + 20, '10:00', '', '') returning id into v_sc2;
  insert into public.star_candidates (event_id, first_name, last_name, location_code, dan, stars_from, paying_by, source, created_by_name, updated_by_name)
  values (v_sevt, 'Fin54', 'Star Three', 'worcester', 1, 0, 'card', 'desk', '', '') returning id into v_sc3;
  v_t := ((v_d + 10) + time '10:00') at time zone 'America/New_York';
  -- One: $140 cash at Worcester on day 10; edited on day 11 to $150 card at Shrewsbury; $20 refunded at Worcester on day 12
  insert into public.star_payments (candidate_id, kind, amount_cents, method, paid_on, school, recorded_at, recorded_by, recorded_by_name)
  values (v_sc1, 'payment', 14000, 'cash', v_d + 10, 'worcester', v_t, v_admin, v_an) returning id into v_sp1;
  insert into public.star_payments (candidate_id, kind, amount_cents, method, paid_on, school, recorded_at, recorded_by, recorded_by_name, reverses_payment_id)
  values (v_sc1, 'reversal', -14000, 'cash', v_d + 11, 'worcester', v_t + interval '1 day', v_admin, v_an, v_sp1);
  insert into public.star_payments (candidate_id, kind, amount_cents, method, paid_on, school, recorded_at, recorded_by, recorded_by_name)
  values (v_sc1, 'payment', 15000, 'card', v_d + 11, 'shrewsbury', v_t + interval '1 day', v_admin, v_an);
  insert into public.star_payments (candidate_id, kind, amount_cents, method, paid_on, school, recorded_at, recorded_by, recorded_by_name)
  values (v_sc1, 'refund', -2000, 'cash', v_d + 12, 'worcester', v_t + interval '2 days', v_admin, v_an);
  -- Two (private): $90 check at Shrewsbury on day 10, undone on day 12
  insert into public.star_payments (candidate_id, kind, amount_cents, method, paid_on, school, recorded_at, recorded_by, recorded_by_name)
  values (v_sc2, 'payment', 9000, 'check', v_d + 10, 'shrewsbury', v_t + interval '1 hour', v_admin, v_an) returning id into v_sp1;
  insert into public.star_payments (candidate_id, kind, amount_cents, method, paid_on, school, recorded_at, recorded_by, recorded_by_name, reverses_payment_id)
  values (v_sc2, 'reversal', -9000, 'check', v_d + 12, 'shrewsbury', v_t + interval '2 days 1 hour', v_admin, v_an, v_sp1);
  -- Three: a plain $140 card payment at Worcester on day 10
  insert into public.star_payments (candidate_id, kind, amount_cents, method, paid_on, school, recorded_at, recorded_by, recorded_by_name)
  values (v_sc3, 'payment', 14000, 'card', v_d + 10, 'worcester', v_t + interval '2 hours', v_desk, v_dn);

  -- ===================================================================
  -- Camp: a both-schools camp held at Worcester with three campers, v_d+20 .. v_d+22
  -- ===================================================================
  perform set_config('request.jwt.claims', v_c_a1, true);
  v_r := public.camp_add_camp('worcester', true, v_tag || ' camp', array[v_mon, v_mon + 1, v_mon + 2], '09:00', '15:00',
           v_today - 3, v_today + 5, v_today + 5, 5, 12, v_prices3, '[]'::jsonb, null, 'I agree to the camp rules.');
  if v_r ->> 'status' is distinct from 'ok' then raise exception 'TEST SETUP: camp_add_camp answered %', v_r; end if;
  v_camp := (v_r ->> 'id')::uuid;
  v_code := v_r ->> 'public_code';
  v_r := pg_temp.t_signup(v_code, v_camp, array['Ann', 'Bob', 'Cy'], v_tag || ' key', gen_random_uuid());
  if v_r ->> 'status' is distinct from 'ok' then raise exception 'TEST SETUP: camp_public_signup answered %', v_r; end if;
  select c.id into v_ann from public.camp_campers c where c.camp_id = v_camp and c.first_name = 'Ann';
  select c.id into v_bob from public.camp_campers c where c.camp_id = v_camp and c.first_name = 'Bob';
  select c.id into v_cy  from public.camp_campers c where c.camp_id = v_camp and c.first_name = 'Cy';
  v_t := ((v_d + 20) + time '10:00') at time zone 'America/New_York';
  -- Ann: $100 cash at Shrewsbury on day 20, $20 refunded at Worcester on day 22
  insert into public.camp_payments (camper_id, kind, amount_cents, method, paid_on, school, recorded_at, recorded_by, recorded_by_name)
  values (v_ann, 'payment', 10000, 'cash', v_d + 20, 'shrewsbury', v_t, v_desk, v_dn);
  insert into public.camp_payments (camper_id, kind, amount_cents, method, paid_on, school, recorded_at, recorded_by, recorded_by_name)
  values (v_ann, 'refund', -2000, 'cash', v_d + 22, 'worcester', v_t + interval '2 days', v_admin, v_an);
  -- Bob: $200 check undone by the same desk 5 seconds later (a mis-click: no line at all)
  insert into public.camp_payments (camper_id, kind, amount_cents, method, paid_on, school, recorded_at, recorded_by, recorded_by_name)
  values (v_bob, 'payment', 20000, 'check', v_d + 20, 'worcester', v_t + interval '5 minutes', v_desk, v_dn) returning id into v_cp_bob;
  insert into public.camp_payments (camper_id, kind, amount_cents, method, paid_on, school, recorded_at, recorded_by, recorded_by_name, reverses_payment_id)
  values (v_bob, 'reversal', -20000, 'check', v_d + 20, 'worcester', v_t + interval '5 minutes 5 seconds', v_desk, v_dn, v_cp_bob);
  -- Cy: $150 card at Worcester on day 20, edited on day 21 to $155 cash at Shrewsbury
  insert into public.camp_payments (camper_id, kind, amount_cents, method, paid_on, school, recorded_at, recorded_by, recorded_by_name)
  values (v_cy, 'payment', 15000, 'card', v_d + 20, 'worcester', v_t + interval '1 hour', v_desk, v_dn) returning id into v_cp_cy;
  insert into public.camp_payments (camper_id, kind, amount_cents, method, paid_on, school, recorded_at, recorded_by, recorded_by_name, reverses_payment_id)
  values (v_cy, 'reversal', -15000, 'card', v_d + 21, 'worcester', v_t + interval '1 day', v_admin, v_an, v_cp_cy);
  insert into public.camp_payments (camper_id, kind, amount_cents, method, paid_on, school, recorded_at, recorded_by, recorded_by_name)
  values (v_cy, 'payment', 15500, 'cash', v_d + 21, 'shrewsbury', v_t + interval '1 day', v_admin, v_an);

  -- ===================================================================
  -- Black Belt: a cycle with three candidates, v_d+30, v_d+31 and today (a returned check)
  -- ===================================================================
  if not exists (select 1 from public.bb_waiver_versions v where v.superseded_at is null) then
    insert into public.bb_waiver_versions (version_name, body, is_placeholder, created_by_name)
    values ('1999-54', 'PLACEHOLDER zz fin54 test', true, '');
  end if;
  v_r := pg_temp.t_call(v_c_a1, format('public.bb_add_cycle(%L::jsonb, null)', pg_temp.t_cycle(v_tag || ' Cycle', v_today + 30, v_today + 20)));
  if v_r ->> 'status' <> 'ok' then raise exception 'TEST SETUP: bb_add_cycle answered %', v_r; end if;
  v_cy_bb := (v_r ->> 'id')::uuid;
  select id into v_full from public.bb_cycle_plans where cycle_id = v_cy_bb and name = '3 payments';
  v_r := pg_temp.t_call(v_c_d1, format('public.bb_add_candidate(%L::uuid, %L, %L, %L::date, %L, %L, 1, %L::uuid, false, true)',
    v_cy_bb, 'Fin54', 'Bb One', v_dob, 'zz54.one@example.com', 'worcester', v_full));
  if v_r ->> 'status' <> 'ok' then raise exception 'TEST SETUP: bb_add_candidate answered %', v_r; end if;
  v_k1 := (v_r ->> 'id')::uuid;
  v_r := pg_temp.t_call(v_c_d1, format('public.bb_add_candidate(%L::uuid, %L, %L, %L::date, %L, %L, 1, %L::uuid, false, true)',
    v_cy_bb, 'Fin54', 'Bb Two', v_dob, 'zz54.two@example.com', 'shrewsbury', v_full));
  if v_r ->> 'status' <> 'ok' then raise exception 'TEST SETUP: bb_add_candidate answered %', v_r; end if;
  v_k2 := (v_r ->> 'id')::uuid;
  v_r := pg_temp.t_call(v_c_d1, format('public.bb_add_candidate(%L::uuid, %L, %L, %L::date, %L, %L, 1, %L::uuid, false, true)',
    v_cy_bb, 'Fin54', 'Bb Three', v_dob, 'zz54.three@example.com', 'worcester', v_full));
  if v_r ->> 'status' <> 'ok' then raise exception 'TEST SETUP: bb_add_candidate answered %', v_r; end if;
  v_k3 := (v_r ->> 'id')::uuid;
  v_t := ((v_d + 30) + time '10:00') at time zone 'America/New_York';
  -- One: $290 check at Worcester on day 30, $290 cash on day 31
  v_bp1 := pg_temp.t_row(v_k1, 'payment', 29000, 'check', v_d + 30, v_t, v_admin, v_an, array['p1'], null, 'worcester');
  perform pg_temp.t_row(v_k1, 'payment', 29000, 'cash', v_d + 31, v_t + interval '1 day', v_admin, v_an, array['p2'], null, 'worcester');
  -- Two: $290 check at Shrewsbury on day 30; the bank returns it TODAY (a returned-check line, negative)
  v_bp2 := pg_temp.t_row(v_k2, 'payment', 29000, 'check', v_d + 30, v_t + interval '1 hour', v_admin, v_an, array['p1'], null, 'shrewsbury');
  perform pg_temp.t_row(v_k2, 'returned', -29000, 'check', v_today, now() - interval '3 hours', v_admin, v_an, null, v_bp2, null);
  -- Three: $290 cash on day 30, edited to $300 card at the same moment (a reversal + a new payment)
  v_bp3 := pg_temp.t_row(v_k3, 'payment', 29000, 'cash', v_d + 30, v_t + interval '2 hours', v_admin, v_an, array['p1'], null, 'worcester');
  perform pg_temp.t_row(v_k3, 'reversal', -29000, 'cash', v_d + 30, v_t + interval '3 hours', v_admin, v_an, null, v_bp3, null);
  perform pg_temp.t_row(v_k3, 'payment', 30000, 'card', v_d + 30, v_t + interval '3 hours', v_admin, v_an, array['p1'], null, 'worcester');

  -- ===================================================================
  -- Board breaking: a Worcester event (days v_d+40 .. v_d+42), a Shrewsbury event (v_d+45)
  -- ===================================================================
  insert into public.brk_events (name, location_code, event_date, public_code, created_by_name, updated_by_name)
  values (v_tag || ' Wor night', 'worcester', v_today + 20, public.testing_new_public_code(), '', '') returning id into v_ew;
  insert into public.brk_events (name, location_code, event_date, public_code, created_by_name, updated_by_name)
  values (v_tag || ' Shr night', 'shrewsbury', v_today + 21, public.testing_new_public_code(), '', '') returning id into v_es;
  insert into public.brk_event_classes (event_id, name, start_time, end_time, sort) values (v_ew, 'Group A', '17:00', '18:00', 0) returning id into v_cw;
  insert into public.brk_event_classes (event_id, name, start_time, end_time, sort) values (v_es, 'Group A', '17:00', '18:00', 0) returning id into v_cs;
  v_r1  := pg_temp.t_reg(v_ew, v_cw, 'Cash W', 1200, 'cash');
  v_r2  := pg_temp.t_reg(v_ew, v_cw, 'Desk S', 1500, 'cash');
  v_r3  := pg_temp.t_reg(v_ew, v_cw, 'Sq W', 975, 'card');
  v_r5  := pg_temp.t_reg(v_ew, v_cw, 'Ref', 3000, 'check');
  v_r6  := pg_temp.t_reg(v_ew, v_cw, 'Edit Move', 2500, 'cash');
  v_r8  := pg_temp.t_reg(v_ew, v_cw, 'Undone', 2200, 'cash');
  v_r9  := pg_temp.t_reg(v_ew, v_cw, 'Hidden', 700, 'cash');
  v_r10 := pg_temp.t_reg(v_ew, v_cw, 'Moved', 5500, 'cash');
  v_r12 := pg_temp.t_reg(v_es, v_cs, 'Other Ev', 777, 'cash');
  v_t := ((v_d + 40) + time '10:00') at time zone 'America/New_York';
  perform pg_temp.t_pay(v_r1, 'payment', 1200, 'cash', v_d + 40, 'worcester', v_t, v_admin, v_an);
  perform pg_temp.t_pay(v_r2, 'payment', 1500, 'cash', v_d + 40, 'shrewsbury', v_t + interval '1 hour', v_admin, v_an);
  perform pg_temp.t_pay(v_r3, 'payment', 975, 'card', v_d + 40, 'worcester', v_t + interval '2 hours', null, 'Square');
  v_p5 := pg_temp.t_pay(v_r5, 'payment', 3000, 'check', v_d + 40, 'worcester', v_t + interval '3 hours', v_admin, v_an);
  perform pg_temp.t_pay(v_r5, 'refund', -1000, 'cash', v_d + 41, 'shrewsbury', v_t + interval '1 day', v_admin, v_an);
  v_t0 := ((v_d + 42) + time '09:00') at time zone 'America/New_York';
  v_p6 := pg_temp.t_pay(v_r6, 'payment', 2000, 'cash', v_d + 42, 'worcester', v_t0, v_admin, v_an);
  perform pg_temp.t_pay(v_r6, 'reversal', -2000, 'cash', v_d + 42, 'worcester', v_t0 + interval '30 minutes', v_admin, v_an, v_p6);
  perform pg_temp.t_pay(v_r6, 'payment', 2500, 'check', v_d + 42, 'shrewsbury', v_t0 + interval '30 minutes', v_admin, v_an);
  v_p8 := pg_temp.t_pay(v_r8, 'payment', 2200, 'cash', v_d + 42, 'worcester', v_t0 + interval '2 hours', v_admin, v_an);
  perform pg_temp.t_pay(v_r8, 'reversal', -2200, 'cash', v_d + 42, 'worcester', v_t0 + interval '5 hours', v_admin, v_an, v_p8);
  v_p9 := pg_temp.t_pay(v_r9, 'payment', 700, 'cash', v_d + 42, 'worcester', v_t0 + interval '3 hours', v_desk, v_dn);
  perform pg_temp.t_pay(v_r9, 'reversal', -700, 'cash', v_d + 42, 'worcester', v_t0 + interval '3 hours 5 seconds', v_desk, v_dn, v_p9);
  v_p10 := pg_temp.t_pay(v_r10, 'payment', 5500, 'cash', v_d + 41, 'worcester', ((v_d + 41) + time '12:00') at time zone 'America/New_York', v_admin, v_an);
  perform pg_temp.t_pay(v_r10, 'reversal', -5500, 'cash', v_d + 42, 'worcester', v_t0 + interval '6 hours', v_admin, v_an, v_p10);
  perform pg_temp.t_pay(v_r10, 'payment', 5500, 'cash', v_d + 42, 'shrewsbury', v_t0 + interval '6 hours', v_admin, v_an);
  -- another event, another day: must never show in the Worcester night's report
  perform pg_temp.t_pay(v_r12, 'payment', 777, 'cash', v_d + 45, 'shrewsbury', ((v_d + 45) + time '10:00') at time zone 'America/New_York', v_admin, v_an);
  perform set_config('tkd.actor_label', '', true);

  -- ===================================================================
  -- R / E. The five events: Finance's figures, the lines, one school, the CSV rows
  -- (days | lines | extra keys: camp / Board breaking 1, Black Belt 4, the others 0)
  -- ===================================================================
  v_rc := pg_temp.t_check(v_c_a1, 'color_belt', v_cb_ev, v_tag || ' color belt', v_today, 2, 4, 0);
  v_rs := pg_temp.t_check(v_c_a1, 'star', v_sevt, v_tag || ' star', v_today, 3, 5, 0);
  v_rk := pg_temp.t_check(v_c_a1, 'camp', v_camp, v_tag || ' camp', v_today, 3, 4, 1);
  v_rb := pg_temp.t_check(v_c_a1, 'black_belt', v_cy_bb, v_tag || ' Cycle', v_today, 3, 5, 4);
  v_rt := pg_temp.t_check(v_c_a1, 'board_breaking', v_ew, v_tag || ' Wor night', v_today, 3, 9, 1);

  -- ===================================================================
  -- R3. Specific lines (day offsets are counted from August 16 2021)
  -- ===================================================================
  --   Board breaking
  perform pg_temp.t_eq('R3 brk: a payment at the Worcester desk', pg_temp.t_lines(v_rt, 'Cash W', v_d), '40:worcester:counted:-:1200:cash');
  perform pg_temp.t_eq('R3 brk: taken at the Shrewsbury desk for a Worcester event: counts at Shrewsbury',
    pg_temp.t_lines(v_rt, 'Desk S', v_d), '40:shrewsbury:counted:-:1500:cash');
  perform pg_temp.t_eq('R3 brk: a Square payment: at the event''s school, by "Square"',
    pg_temp.t_lines(v_rt, 'Sq W', v_d) || '|' || (select e ->> 'recorded_by_name' from jsonb_array_elements(v_rt -> 'days') d, jsonb_array_elements(d -> 'items') e
                                                 where e ->> 'last_name' = 'Sq W'), '40:worcester:counted:-:975:card|Square');
  perform pg_temp.t_eq('R3 brk: a payment and the refund handed back at the other desk',
    pg_temp.t_lines(v_rt, 'Ref', v_d), '40:worcester:counted:-:3000:check,41:shrewsbury:counted:-:-1000:cash');
  perform pg_temp.t_eq('R3 brk: an edit that moved the money to the other school shows ONCE, as edited, was Worcester',
    pg_temp.t_lines(v_rt, 'Edit Move', v_d), '42:shrewsbury:edited:worcester:2500:check');
  perform pg_temp.t_eq('R3 brk: an undone payment: one undone line', pg_temp.t_lines(v_rt, 'Undone', v_d), '42:worcester:undone:-:2200:cash');
  perform pg_temp.t_eq('R3 brk: a quick Undo by the same desk leaves no line', pg_temp.t_lines(v_rt, 'Hidden', v_d), '');
  perform pg_temp.t_eq('R3 brk: an edit to another day and school: moved out on the old day, moved in on the new',
    pg_temp.t_lines(v_rt, 'Moved', v_d), '41:worcester:moved_out:-:5500:cash,42:shrewsbury:moved_in:worcester:5500:cash');
  perform pg_temp.t_eq('R3 brk: another event''s student is not in this report', pg_temp.t_lines(v_rt, 'Other Ev', v_d), '');
  perform pg_temp.t_eq('R3 brk: totals count | total | in | cash | check | card',
    concat_ws('|', v_rt #>> '{totals,count}', v_rt #>> '{totals,total_cents}', v_rt #>> '{totals,in_cents}',
              (v_rt #>> '{totals,cash,count}') || ':' || (v_rt #>> '{totals,cash,cents}'),
              (v_rt #>> '{totals,check,count}') || ':' || (v_rt #>> '{totals,check,cents}'),
              (v_rt #>> '{totals,card,count}') || ':' || (v_rt #>> '{totals,card,cents}')),
    '6|13675|14675|3:8200|2:5500|1:975');
  perform pg_temp.t_eq('R3 brk: refunds count | cents | cash | check | card, returned',
    concat_ws('|', v_rt #>> '{refunds,count}', v_rt #>> '{refunds,cents}', v_rt #>> '{refunds,cash_cents}', v_rt #>> '{refunds,check_cents}',
              v_rt #>> '{refunds,card_cents}', v_rt #>> '{returned,count}', v_rt #>> '{returned,cents}'), '1|-1000|-1000|0|0|0|0');
  perform pg_temp.t_eq('R3 brk: per school (Worcester first): net',
    (select string_agg((e ->> 'school') || '=' || (e #>> '{totals,total_cents}'), ',' order by n) from jsonb_array_elements(v_rt -> 'by_school') with ordinality as t(e, n)),
    'worcester=5175,shrewsbury=8500');
  perform pg_temp.t_eq('R3 brk: every line carries the event name',
    (select count(*)::text from jsonb_array_elements(v_rt -> 'days') d, jsonb_array_elements(d -> 'items') e
      where e ->> 'event_name' is distinct from v_tag || ' Wor night'), '0');
  v_x := pg_temp.t_call(v_c_a1, format('public.finance_event_report(%L, %L)', 'board_breaking', v_es));
  perform pg_temp.t_eq('R3 brk: the other event''s own report: one day, one line, its money',
    concat_ws('|', v_x ->> 'status', jsonb_array_length(v_x -> 'days'), pg_temp.t_nitems(v_x), v_x #>> '{totals,total_cents}', v_x #>> '{event,name}'),
    concat_ws('|', 'ok', '1', '1', '777', v_tag || ' Shr night'));
  --   Color Belt
  perform pg_temp.t_eq('R3 cb: One (taken at the Shrewsbury desk)', pg_temp.t_lines(v_rc, 'Cb One', v_d), '0:shrewsbury:counted:-:6500:cash');
  perform pg_temp.t_eq('R3 cb: Two edited to another day: moved out, moved in',
    pg_temp.t_lines(v_rc, 'Cb Two', v_d), '0:worcester:moved_out:-:7500:check,1:worcester:moved_in:-:8000:card');
  perform pg_temp.t_eq('R3 cb: Three undone', pg_temp.t_lines(v_rc, 'Cb Three', v_d), '0:worcester:undone:-:6500:cash');
  perform pg_temp.t_eq('R3 cb: count | total', (v_rc #>> '{totals,count}') || '|' || (v_rc #>> '{totals,total_cents}'), '2|14500');
  --   Star
  perform pg_temp.t_eq('R3 star: One edited to another day and school, then refunded at Worcester',
    pg_temp.t_lines(v_rs, 'Star One', v_d),
    '10:worcester:moved_out:-:14000:cash,11:shrewsbury:moved_in:worcester:15000:card,12:worcester:counted:-:-2000:cash');
  perform pg_temp.t_eq('R3 star: Two (private) undone', pg_temp.t_lines(v_rs, 'Star Two', v_d), '10:shrewsbury:undone:-:9000:check');
  perform pg_temp.t_eq('R3 star: the private candidate''s lines are flagged is_private, the others are not',
    (select string_agg(distinct (e ->> 'last_name') || '=' || (e ->> 'is_private'), ',' order by (e ->> 'last_name') || '=' || (e ->> 'is_private'))
       from jsonb_array_elements(v_rs -> 'days') d, jsonb_array_elements(d -> 'items') e),
    'Star One=false,Star Three=false,Star Two=true');
  perform pg_temp.t_eq('R3 star: count | total | refunds', concat_ws('|', v_rs #>> '{totals,count}', v_rs #>> '{totals,total_cents}',
    v_rs #>> '{refunds,count}', v_rs #>> '{refunds,cents}'), '2|27000|1|-2000');
  --   camp (the three campers share a last name; they are told apart by first name)
  perform pg_temp.t_eq('R3 camp: Ann paid at Shrewsbury, refunded at Worcester',
    pg_temp.t_lines(v_rk, 'Ann', v_d), '20:shrewsbury:counted:-:10000:cash,22:worcester:counted:-:-2000:cash');
  perform pg_temp.t_eq('R3 camp: Bob''s quick Undo leaves no line', pg_temp.t_lines(v_rk, 'Bob', v_d), '');
  perform pg_temp.t_eq('R3 camp: Cy edited to another day and school',
    pg_temp.t_lines(v_rk, 'Cy', v_d), '20:worcester:moved_out:-:15000:card,21:shrewsbury:moved_in:worcester:15500:cash');
  perform pg_temp.t_eq('R3 camp: count | total | refunds', concat_ws('|', v_rk #>> '{totals,count}', v_rk #>> '{totals,total_cents}',
    v_rk #>> '{refunds,count}', v_rk #>> '{refunds,cents}'), '2|23500|1|-2000');
  perform pg_temp.t_eq('R3 camp: every line carries the camp''s name',
    (select count(*)::text from jsonb_array_elements(v_rk -> 'days') d, jsonb_array_elements(d -> 'items') e
      where e ->> 'event_name' is distinct from v_tag || ' camp'), '0');
  --   Black Belt (the returned check is dated TODAY)
  perform pg_temp.t_eq('R3 bb: One paid on two days', pg_temp.t_lines(v_rb, 'Bb One', v_d),
    '30:worcester:counted:-:29000:check,31:worcester:counted:-:29000:cash');
  perform pg_temp.t_eq('R3 bb: Two paid, then the check came back today (a negative returned line)', pg_temp.t_lines(v_rb, 'Bb Two', v_d),
    '30:shrewsbury:counted:-:29000:check,' || (v_today - v_d) || ':shrewsbury:counted:-:-29000:check');
  perform pg_temp.t_eq('R3 bb: Three edited on the same day shows once', pg_temp.t_lines(v_rb, 'Bb Three', v_d), '30:worcester:edited:-:30000:card');
  perform pg_temp.t_eq('R3 bb: count | total | in | returned count | returned cents',
    concat_ws('|', v_rb #>> '{totals,count}', v_rb #>> '{totals,total_cents}', v_rb #>> '{totals,in_cents}',
              v_rb #>> '{returned,count}', v_rb #>> '{returned,cents}'), '4|88000|117000|1|-29000');
  perform pg_temp.t_eq('R3 bb: the returned line is kind "returned" and says the day the check was handed in',
    (select concat_ws('|', e ->> 'kind', e ->> 'handed_in_on', e ->> 'event_name')
       from jsonb_array_elements(v_rb -> 'days') d, jsonb_array_elements(d -> 'items') e where e ->> 'kind' = 'returned'),
    concat_ws('|', 'returned', (v_d + 30)::text, v_tag || ' Cycle'));

  -- ===================================================================
  -- V. Input: invalid / not_found (admin), nothing is logged for a refused call
  -- ===================================================================
  select count(*)::integer into v_logs from public.finance_event_exports;
  for v_x in
    select jsonb_build_object('label', l, 'call', c, 'want', w)
      from (values
        ('a bad source', format('(%L, %L)', 'nope', v_ew), 'invalid'),
        ('no source', format('(null, %L)', v_ew), 'invalid'),
        ('no event', format('(%L, null)', 'star'), 'invalid'),
        ('a bad source beats an unknown school', format('(%L, %L, %L)', 'nope', gen_random_uuid(), 'nowhere'), 'invalid'),
        ('an unknown school', format('(%L, %L, %L)', 'star', v_sevt, 'nowhere'), 'not_found'),
        ('a Star event under the camp source', format('(%L, %L)', 'camp', v_sevt), 'not_found'),
        ('a camp under the Black Belt source', format('(%L, %L)', 'black_belt', v_camp), 'not_found'),
        ('an event that does not exist', format('(%L, %L)', 'color_belt', gen_random_uuid()), 'not_found'),
        ('a Board breaking event under Color Belt', format('(%L, %L)', 'color_belt', v_ew), 'not_found'))
        as t(l, c, w)
  loop
    perform pg_temp.t_eq('V report: ' || (v_x ->> 'label'),
      pg_temp.t_call(v_c_a1, 'public.finance_event_report' || (v_x ->> 'call')) ->> 'status', v_x ->> 'want');
    perform pg_temp.t_eq('V export: ' || (v_x ->> 'label'),
      pg_temp.t_call(v_c_a1, 'public.finance_event_export' || (v_x ->> 'call')) ->> 'status', v_x ->> 'want');
  end loop;

  -- ===================================================================
  -- A. Access: the front desk, signed-out and locked sessions, anon
  -- ===================================================================
  perform pg_temp.t_eq('A the front desk: the report -> not_allowed',
    pg_temp.t_call(v_c_d1, format('public.finance_event_report(%L, %L)', 'board_breaking', v_ew)) ->> 'status', 'not_allowed');
  perform pg_temp.t_eq('A the front desk: the CSV rows -> not_allowed',
    pg_temp.t_call(v_c_d1, format('public.finance_event_export(%L, %L)', 'board_breaking', v_ew)) ->> 'status', 'not_allowed');
  perform pg_temp.t_eq('A the front desk: not_allowed even for a bad source (the role is checked first)',
    pg_temp.t_call(v_c_d1, format('public.finance_event_report(%L, %L)', 'nope', v_ew)) ->> 'status', 'not_allowed');
  select string_agg(x.s, ',' order by x.n) into v_txt
    from (select 1 as n, 'signed out' as lbl, null::text as c union all select 2, 'PIN-locked admin', v_c_a2 union all select 3, 'locked desk', v_c_d2) k,
         lateral (select k.n, k.lbl || ':' || (pg_temp.t_call(k.c, format('public.finance_event_report(%L, %L)', 'star', v_sevt)) ->> 'status') || '/'
                                      || (pg_temp.t_call(k.c, format('public.finance_event_export(%L, %L)', 'star', v_sevt)) ->> 'status') as s) x;
  perform pg_temp.t_eq('A signed out / PIN-locked / locked: both functions answer no_access', v_txt,
    'signed out:no_access/no_access,PIN-locked admin:no_access/no_access,locked desk:no_access/no_access');
  perform pg_temp.t_eq('A refused calls wrote no log row', ((select count(*) from public.finance_event_exports) - v_logs)::text, '0');
  -- anon: no right to run either function (the app's signed-out role), the call itself is refused
  perform set_config('request.jwt.claims', '', true);
  begin
    set local role anon;
    perform public.finance_event_report('star', v_sevt);
    reset role;
    v_msg := 'it ran';
  exception
    when insufficient_privilege then
      reset role;
      v_msg := 'permission denied';
  end;
  perform pg_temp.t_eq('A anon calling finance_event_report is refused', v_msg, 'permission denied');
  begin
    set local role anon;
    perform public.finance_event_export('star', v_sevt);
    reset role;
    v_msg := 'it ran';
  exception
    when insufficient_privilege then
      reset role;
      v_msg := 'permission denied';
  end;
  perform pg_temp.t_eq('A anon calling finance_event_export is refused', v_msg, 'permission denied');
  -- a signed-in user may not call the internal helpers
  begin
    perform set_config('request.jwt.claims', v_c_a1, true);
    set local role authenticated;
    perform public.finance_event_items('star', v_sevt, null);
    reset role;
    v_msg := 'it ran';
  exception
    when insufficient_privilege then
      reset role;
      v_msg := 'permission denied';
  end;
  perform pg_temp.t_eq('A a signed-in admin calling an internal helper directly is refused', v_msg, 'permission denied');
  -- the table: nobody in the app can read or write it
  begin
    perform set_config('request.jwt.claims', v_c_a1, true);
    set local role authenticated;
    perform count(*) from public.finance_event_exports;
    reset role;
    v_msg := 'it ran';
  exception
    when insufficient_privilege then
      reset role;
      v_msg := 'permission denied';
  end;
  perform pg_temp.t_eq('A a signed-in admin reading finance_event_exports directly is refused', v_msg, 'permission denied');
  perform set_config('request.jwt.claims', '', true);

  -- ===================================================================
  -- X. The log: its rows, and nobody can change or remove them
  -- ===================================================================
  perform pg_temp.t_eq('X ten log rows from the ten allowed export calls (two per kind of event)',
    ((select count(*) from public.finance_event_exports) - v_log0)::text, '10');
  perform pg_temp.t_eq('X every new log row: the admin''s name and (kept, never returned) login id',
    (select count(*)::text from public.finance_event_exports x where x.downloaded_at = now() and x.downloaded_by_name = v_an and x.downloaded_by = v_admin), '10');
  perform pg_temp.t_eq('X ten history rows, action finance_event_export',
    ((select count(*) from public.change_log l where l.table_name = 'finance_event_exports' and l.op = 'insert'
        and l.action = 'finance_event_export') - v_hist0)::text, '10');
  begin
    update public.finance_event_exports set row_count = row_count + 1;
    v_msg := 'it ran';
  exception when others then v_msg := sqlerrm;
  end;
  perform pg_temp.t_eq('X a log row can not be changed', v_msg, 'finance_event_exports is append-only');
  begin
    delete from public.finance_event_exports;
    v_msg := 'it ran';
  exception when others then v_msg := sqlerrm;
  end;
  perform pg_temp.t_eq('X a log row can not be removed', v_msg, 'finance_event_exports is append-only');
  begin
    truncate public.finance_event_exports;
    v_msg := 'it ran';
  exception when others then v_msg := sqlerrm;
  end;
  perform pg_temp.t_eq('X the log can not be emptied at once',
    v_msg, 'finance_event_exports can''t be truncated (it would skip the history); remove rows one by one');
  perform pg_temp.t_eq('X nothing was changed by those tries', ((select count(*) from public.finance_event_exports) - v_log0)::text, '10');

  -- ===================================================================
  -- K. Privacy: every key in every answer is on the fixed list; no login id anywhere
  -- ===================================================================
  select string_agg(distinct k, ', ') into v_bad
    from t_answers a, lateral pg_temp.t_keys(a.r) as k
   where a.fn like 'public.finance_event_%' and k <> all (v_allowed_keys);
  perform pg_temp.t_eq('K keys not on the fixed list', coalesce(v_bad, ''), '');
  select count(*)::integer into v_n
    from t_answers a
   where a.fn like 'public.finance_event_%' and (position(v_admin::text in a.r::text) > 0 or position(v_desk::text in a.r::text) > 0);
  perform pg_temp.t_eq('K no answer holds a login id', v_n::text, '0');
  select count(*)::integer into v_n from t_answers a where a.fn like 'public.finance_event_%' and a.r ? 'status';
  perform pg_temp.t_eq('K the event functions were called many times (a sanity count)', (v_n > 40)::text, 'true');

  -- ===================================================================
  -- C. The six new functions and the table: security and rights
  -- ===================================================================
  select string_agg(p.proname || '=' || p.prosecdef::text || '/' || p.provolatile::text || '/' || coalesce(array_to_string(p.proconfig, ','), '') || '/'
                    || has_function_privilege('anon', p.oid, 'execute')::text || '/'
                    || has_function_privilege('authenticated', p.oid, 'execute')::text || '/'
                    || has_function_privilege('service_role', p.oid, 'execute')::text || '/'
                    || exists (select 1 from aclexplode(coalesce(p.proacl, acldefault('f', p.proowner))) a where a.grantee = 0)::text,
                    ',' order by p.proname)
    into v_txt
    from pg_proc p join pg_namespace n on n.oid = p.pronamespace
   where n.nspname = 'public' and p.proname like 'finance\_event\_%';
  perform pg_temp.t_eq('C definer / volatility / search path / anon / authenticated / service_role / PUBLIC, per function', v_txt,
    'finance_event_check=false/s/search_path=""/false/false/false/false,'
    || 'finance_event_export=true/v/search_path=""/false/true/false/false,'
    || 'finance_event_extras=false/s/search_path=""/false/false/false/false,'
    || 'finance_event_figures=false/s/search_path=""/false/false/false/false,'
    || 'finance_event_items=false/s/search_path=""/false/false/false/false,'
    || 'finance_event_report=true/s/search_path=""/false/true/false/false');
  perform pg_temp.t_eq('C the table: RLS on, no rules, the owner''s own rights only',
    (select c.relrowsecurity::text || '/' || (select count(*) from pg_policies pp where pp.schemaname = 'public' and pp.tablename = c.relname)::text
            || '/' || (select count(*) from aclexplode(coalesce(c.relacl, acldefault('r', c.relowner))) a where a.grantee <> c.relowner)::text
       from pg_class c where c.oid = 'public.finance_event_exports'::regclass), 'true/0/0');
  perform pg_temp.t_eq('C no right on the table for anon, authenticated or service_role',
    (select count(*)::text from unnest(array['anon', 'authenticated', 'service_role']) r,
                                 unnest(array['select', 'insert', 'update', 'delete', 'truncate', 'references', 'trigger']) pr
      where has_table_privilege(r, 'public.finance_event_exports', pr)), '0');
  perform pg_temp.t_eq('C the three triggers: append-only, history, no truncate',
    (select string_agg(t.tgname, ',' order by t.tgname collate "C") from pg_trigger t
      where t.tgrelid = 'public.finance_event_exports'::regclass and not t.tgisinternal),
    'finance_event_exports_append_only,finance_event_exports_log,finance_event_exports_no_truncate');

  select string_agg(x.label || ' - got ' || x.got || ', expected ' || x.want || ' [' || x.brief || ']', E'\n')
    into v_txt from t_expect x where x.got is distinct from x.want;
  if v_txt is not null then
    raise exception 'TEST FAILED: %', v_txt;
  end if;
end
$$;

select 'ALL 0054 TESTS PASSED' as result;

rollback;
