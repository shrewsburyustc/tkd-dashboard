-- =====================================================================
-- 0034u_undo.sql   (UNDO of migration 0034)
-- ---------------------------------------------------------------------
-- WHAT THIS FILE IS
--   Takes migration 0034 (Black Belt: the History line names the logged
--   row's id, record_id) back out: it puts back 0032's exact version of
--   the one function 0034 replaced, public.bb_candidate_history(uuid)
--   (0032 section 3c), copied word for word from
--   0032_black_belt_review.sql with its exact revoke and grant.
--   0034 added nothing else, so nothing else needs removing, and no data
--   is touched (the history rows stay in change_log).
--
-- WHY A SEPARATE FILE
--   Re-running the whole 0032 file would do the same for this function,
--   but it re-runs everything else in 0032 too. This touches only what
--   0034 replaced. Paste it ONLY with Jeffrey's OK (SETUP.md, Migration
--   0034, 0034e), and only after the app is back to a version that does
--   not need record_id in the History line.
--
-- AFTERWARDS
--   0032_fingerprints.sql and 0016_fingerprints.sql must equal the ones
--   written down BEFORE 0034 was applied (SETUP 0034a), and
--   0034_preapply_check.sql must answer body_is_0032 = true,
--   body_is_0034 = false. Tested in PGlite (run.mjs step0034). To redo:
--   paste 0034 again. One transaction: on any error nothing is kept.
--   Nothing is removed, so Supabase should not warn.
-- =====================================================================

begin;

-- ---------------------------------------------------------------------
-- 1. The guard: 0032's strip helper must be there (the reader uses it)
-- ---------------------------------------------------------------------
do $$
begin
  if to_regprocedure('public.bb_history_strip(jsonb)') is null then
    raise exception '0034 undo needs migration 0032 (bb_history_strip) - nothing to undo onto';
  end if;
end
$$;

-- ---------------------------------------------------------------------
-- 2. 0032's function, word for word
-- ---------------------------------------------------------------------

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

commit;

-- End of 0034u_undo.sql
