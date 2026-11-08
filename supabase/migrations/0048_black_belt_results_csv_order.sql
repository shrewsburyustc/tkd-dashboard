-- =====================================================================
-- 0048_black_belt_results_csv_order.sql
-- ---------------------------------------------------------------------
-- WHAT THIS FILE IS
--   Black Belt's small database half of the design-review rule "wherever
--   both schools are listed, Worcester comes before Shrewsbury, as the
--   school switcher does" (rulebook v1.047 (19), Jeffrey 2026-11-04
--   "Approve all", and his answer "C" on 2026-11-07). It runs AFTER 0025
--   (live; it replaces one 0025 function) and stops with a clear message
--   if 0025 is missing.
--
-- WHAT IT CHANGES (one function, nothing else)
--   public.bb_results_csv(p_cycle_id uuid) - the admin-only download of
--   the whole cycle's results (0025, section 8e). Its rows used to be
--   sorted: by Dan, then school with SHREWSBURY first, then last name,
--   first name, id. Now: by Dan, then school with WORCESTER first, then
--   last name, first name, id. That is the only difference: one line, the
--   `case x.location_code when ... then 0 else 1 end` in the ordering.
--   Same signature, same return type (jsonb), same rules, same answers,
--   same rows and columns, same download log row. Because the signature
--   does not change, "create or replace function" is enough: nothing is
--   removed and nothing is made twice.
--   NOT changed (on purpose, Jeffrey's "C"): bb_cycle_roster,
--   bb_grading_grid, bb_cycle_results and bb_makeup_list - the screens
--   sort those themselves. No table, no row, no other function, and no
--   other section is touched. Existing data is untouched.
--
-- SECURITY (as 0025)
--   security definer, search_path = '', fully qualified names,
--   has_data_access() first, then is_admin() (staff get not_allowed), the
--   download log row written first (and undone with everything else if
--   anything fails afterwards), answers {"status": ...}. Revoked from
--   public, anon, authenticated and service_role and granted to
--   authenticated only - the revoke and grant are stated again below.
--   Nothing for anon. The body is 0025's word for word except the one
--   ordering line.
--
-- HOW TO RUN IT
--   After 0025 (live). Supabase dashboard -> SQL Editor -> New query ->
--   paste this WHOLE file -> Run. One transaction ("begin;" ...
--   "commit;"): if any statement fails, nothing is kept.
--   CONNECTOR-SAFE: the file has none of the words the Supabase
--   connection refuses (run.mjs, step0048, checks it): the signature does
--   not change, so no function has to be removed. Jeffrey still pastes it
--   himself, as always, after his OK.
--   Safe to run again (tested in PGlite: a second run changes no
--   fingerprint and no row).
--   RE-RUN ORDER: re-running 0025 after this file puts back 0025's order
--   (Shrewsbury first) - run this file straight after, or check with
--   tests/0048_preapply_check.sql.
--   Undo: supabase/SETUP.md, "Migration 0048", 0048e
--   (supabase/manual/0048u_undo_black_belt_results_csv_order.sql).
-- =====================================================================

begin;


-- ---------------------------------------------------------------------
-- 1. The guard: this file needs 0025's download function. Stops - and
--    changes nothing - if it is missing.
-- ---------------------------------------------------------------------
do $$
begin
  if to_regprocedure('public.bb_results_csv(uuid)') is null then
    raise exception '0048 needs migration 0025 (Black Belt grading and results) first';
  end if;
end
$$;


-- ---------------------------------------------------------------------
-- 2. bb_results_csv - Worcester before Shrewsbury (v1.047 (19))
--    0025's function, word for word, except the school order below.
-- ---------------------------------------------------------------------
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
    select coalesce(jsonb_agg(x.r order by x.dan, case x.location_code when 'worcester' then 0 else 1 end,
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

commit;

-- End of 0048_black_belt_results_csv_order.sql
