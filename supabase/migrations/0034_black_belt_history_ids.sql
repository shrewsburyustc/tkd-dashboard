-- =====================================================================
-- 0034_black_belt_history_ids.sql
-- ---------------------------------------------------------------------
-- WHAT THIS FILE IS
--   A small follow-up to 0032 (Black Belt's design-review database half,
--   live since 2026-11-03), for the History line (design review BB8,
--   rulebook v0.971 / v0.972). It changes NO table, NO rule, NO data and
--   NO right. It REPLACES one function only:
--     public.bb_candidate_history(uuid)   (0032 section 3c)
--   with the same name, argument, answer type, checks and rights. The ONE
--   change: every row it answers also carries 'record_id' - the
--   change_log row's record_id, i.e. the id of the logged row itself (the
--   candidate, the payment, the grade ...).
--
-- WHY IT EXISTS
--   A grade's history is an INSERT row (its "after" names the subject)
--   and later UPDATE rows (they hold only the columns that changed - the
--   letter, not the subject). Without an id the app can't tell which
--   subject a correction like "A -> B" belongs to. With record_id, every
--   UPDATE row of a grade has the same record_id as that grade's INSERT
--   row, so the app joins them and can say "Free sparring: A -> B".
--
-- WHY IT IS SAFE
--   * Nothing private: record_id is the logged row's own id (a row id,
--     like the ids the candidate detail already gives the app). It is
--     NOT a login id (the uuid of a sign-in) - those stay out, as do
--     actor_id, session_id and batch_id, and before / after still go
--     through bb_history_strip (0032 3a).
--   * Same checks, in the same order: has_data_access() first ->
--     no_access; no id -> invalid; no such candidate -> not_found. Same
--     rows (the union-all of the candidate's own rows and its child rows,
--     each part on its index), same order (newest first), same 500 limit.
--   * Same rights: nobody but signed-in staff ("authenticated"); nothing
--     for anon. Security definer, stable, search_path = ''.
--   * The app that is live today keeps working: it reads the keys it
--     knows and ignores the new one.
--   Proof before pasting: supabase/tests/0034_preapply_check.sql (SETUP.md,
--   Migration 0034, 0034a).
--
-- WHO MAY CALL IT
--   Any staff member with data access (as 0032), through the app.
--
-- HOW TO RUN IT
--   After 0032 (live). Supabase dashboard -> SQL Editor -> New query ->
--   paste this WHOLE file -> Run. One transaction ("begin;" ...
--   "commit;"): if any statement fails, nothing is kept.
--   Safe to run again (tested in PGlite, run.mjs step0034: a second run
--   changes no fingerprint).
--   RE-RUN ORDER: re-running 0032 after this file puts 0032's reader
--   (without record_id) back -> re-run this file straight after.
--   Undo: SETUP.md, "Migration 0034", 0034e - paste
--   supabase/manual/0034u_undo.sql (it puts 0032's reader back, word for
--   word).
--   DEPLOY ORDER: this file must be live BEFORE an app version that reads
--   record_id from the History line.
-- =====================================================================

begin;


-- ---------------------------------------------------------------------
-- 1. The guard: this file needs 0032 (its reader and its strip helper).
--    Stops - and changes nothing - if one is missing.
-- ---------------------------------------------------------------------
do $$
begin
  if to_regprocedure('public.bb_candidate_history(uuid)') is null
     or to_regprocedure('public.bb_history_strip(jsonb)') is null then
    raise exception '0034 needs migration 0032 (Black Belt history reader) first';
  end if;
end
$$;


-- ---------------------------------------------------------------------
-- 2. BB8 - History with the logged row's id (0032's section 3c; only
--    record_id is new)
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
-- Only occurred_at, actor_name, action, table_name, record_id, op,
-- before, after. record_id is the logged row's own id (the same on a
-- row's insert and on all its updates, so the app can join them - e.g. a
-- grade's correction to the subject its insert names); it is not a login
-- id. No actor_id, session_id or batch_id.
-- (0032's text had no record_id; replaced by 0034, rulebook v0.971 /
-- v0.972, design-review BB8.)
-- Who: any staff member with data access (as bb_candidate_detail).
-- Refused: no_access; invalid (no id); not_found (no such candidate -
-- also after it was removed for good).
-- No error mapping (unlike the write functions): a read takes no locks
-- and writes nothing, so none of their mapped errors can happen here; an
-- unexpected error reaches the app as an error (its Retry bar).
-- Ok: {"status":"ok","rows":[{occurred_at, actor_name, action, table_name, record_id, op, before, after}]}
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
                         'record_id',   h.record_id,
                         'op',          h.op,
                         'before',      public.bb_history_strip(h.before),
                         'after',       public.bb_history_strip(h.after))
                       order by h.occurred_at desc, h.id desc)
        from (select x.id, x.occurred_at, x.actor_name, x.action, x.table_name, x.record_id, x.op, x.before, x.after
                from (-- (a) the candidate's own rows
                      select l.id, l.occurred_at, l.actor_name, l.action, l.table_name, l.record_id, l.op, l.before, l.after
                        from public.change_log l
                       where l.table_name = 'bb_candidates'
                         and l.record_id = p_candidate_id
                      union all
                      -- (b) every row of each child row this candidate's insert rows name
                      select l.id, l.occurred_at, l.actor_name, l.action, l.table_name, l.record_id, l.op, l.before, l.after
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

-- Rights exactly as 0032: nobody, then signed-in staff only.
revoke execute on function public.bb_candidate_history(uuid) from public, anon, authenticated, service_role;
grant  execute on function public.bb_candidate_history(uuid) to authenticated;


commit;

-- End of 0034_black_belt_history_ids.sql
