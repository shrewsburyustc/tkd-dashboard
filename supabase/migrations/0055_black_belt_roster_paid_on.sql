-- =====================================================================
-- 0055_black_belt_roster_paid_on.sql
-- ---------------------------------------------------------------------
-- WHAT THIS FILE IS
--   Black Belt's roster (the list of a cycle's candidates) gets ONE new
--   piece of information on every row: paid_on, the day the candidate's
--   LAST payment was paid. The app shows it next to "Paid in full" so the
--   desk can see when the candidate finished paying (rulebook: event
--   reports, paid dates on rosters, Jeffrey's answers 2026-11-19;
--   contract docs/Finance/Event reports/CONTRACT-0054-0055.md). It runs
--   AFTER 0025 (live) and stops with a clear message if 0025's roster
--   function is not the one it was built on.
--
-- WHAT IT CHANGES (one function, one new key, nothing else)
--   public.bb_cycle_roster(p_cycle_id uuid) - 0025's section 9i. Every
--   roster row gains the key "paid_on" (a date, or null):
--     paid_on = the day of the candidate's last payment that STILL COUNTS
--               = the latest paid_on among the candidate's payment rows
--               (kind 'payment') that no reversal points at (not undone)
--               and that are not a bounced check - the very same
--               "counts" rule public.bb_candidate_money uses for the
--               money picture (0016, section 10d: a payment with a live
--               "returned" row is a bounced check and does not count).
--               null when the candidate has no counting payment.
--   The database does NOT decide whether the candidate is paid in full:
--   the app shows the date only when "money" says the balance is 0, as
--   before. Everything else in the function is 0025's text word for word
--   (same rows, same order, same keys, same checks, same purge call).
--   Same signature, same return type (jsonb), same security (definer,
--   search_path = ''), same grants: "create or replace function" is
--   enough, nothing is removed. No table, no row, no other function and
--   no other section is touched. Nothing returned is private: it is a
--   date, like the "paid" dates the roster's money already implies.
--
-- SECURITY (as 0025)
--   security definer, search_path = '', fully qualified names,
--   has_data_access() first, answers {"status": ...}. Revoked from
--   public, anon, authenticated and service_role and granted to
--   authenticated only - the revoke and grant are stated again below.
--   Nothing for anon.
--
-- HOW TO RUN IT
--   After 0025 (live). Supabase dashboard -> SQL Editor -> New query ->
--   paste this WHOLE file -> Run. One transaction ("begin;" ...
--   "commit;"): if any statement fails, nothing is kept. Safe to run
--   again (tested in PGlite: a second run changes no fingerprint). The
--   file has none of the words the Supabase connector refuses.
--   RE-RUN ORDER: re-running 0025 after this file puts back 0025's
--   roster (no paid_on) - run this file straight after.
-- =====================================================================

begin;


-- ---------------------------------------------------------------------
-- 1. The guard: this file is built on 0025's roster function (or its own
--    text, on a re-run), compared by an md5 of the code without comments
--    and white space (the same way the fingerprints files do). Anything
--    else means someone changed the function since: pasting this file
--    would silently undo that change - so it must be rebuilt first.
-- ---------------------------------------------------------------------
do $$
declare
  v_md5 text;
begin
  if to_regprocedure('public.bb_cycle_roster(uuid)') is null then
    raise exception '0055 needs migration 0025 (Black Belt grading and results) first';
  end if;
  select md5(regexp_replace(regexp_replace(p.prosrc, '--[^\n]*', '', 'g'), '\s+', '', 'g'))
    into v_md5
    from pg_proc p
   where p.oid = to_regprocedure('public.bb_cycle_roster(uuid)');
  if v_md5 not in ('b7bcfd84fd802df5cdacbbd10eea20d7', '5e8c053932bb48deeaad4b5161bdd4d4') then
    raise exception '0055 was built over 0025''s bb_cycle_roster, but the live one is different (md5 %) - rebuild 0055 first', v_md5;
  end if;
end;
$$;


-- ---------------------------------------------------------------------
-- 2. bb_cycle_roster(cycle) - 0025's (section 9i), plus the key paid_on.
--    The same rows, plus: the plan join is a LEFT join (a make-up row has
--    no plan, so it is still listed; plan_id / plan_name are null for
--    it), and each row has is_makeup, makeup_of_cycle_name, retest_names
--    (the names of its retest subjects in rubric order; [] for other
--    rows), has_grades (real grades: grays the permanent removal) and, new
--    in 0055, paid_on.
-- ---------------------------------------------------------------------
create or replace function public.bb_cycle_roster(p_cycle_id uuid)
returns jsonb
language plpgsql
volatile
security definer
set search_path = ''
as $$
-- 0025: replaced; 0055: + paid_on
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
             'has_grades',       public.bb_candidate_has_grades(c.id),
             -- 0055: the day of the last payment that still counts (null = none). The same
             -- "counts" rule as bb_candidate_money: a payment row that no reversal points at
             -- and that is not a bounced check (a live "returned" row on it).
             'paid_on',          (select max(p.paid_on)
                                    from public.bb_payments p
                                   where p.candidate_id = c.id
                                     and p.kind = 'payment'
                                     and not exists (select 1 from public.bb_payments r
                                                      where r.reverses_payment_id = p.id and r.kind = 'reversal')
                                     and not exists (select 1 from public.bb_payments t
                                                      where t.reverses_payment_id = p.id and t.kind = 'returned'
                                                        and not exists (select 1 from public.bb_payments u
                                                                         where u.reverses_payment_id = t.id and u.kind = 'reversal'))))
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


commit;

-- End of 0055_black_belt_roster_paid_on.sql
