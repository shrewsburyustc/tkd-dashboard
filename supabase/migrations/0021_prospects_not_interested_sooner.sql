-- =====================================================================
-- 0021_prospects_not_interested_sooner.sql
-- ---------------------------------------------------------------------
-- WHAT THIS FILE IS
--   A database migration for the TKD staff dashboard. It runs after 0015
--   (family history). It changes ONE function: public.prospects_purge_old(),
--   the clean-up that runs whenever Prospects is opened.
--
-- WHY IT EXISTS
--   Rulebook v0.611 (Jeffrey, 2026-10-21): families who said no should not
--   pile up for two years. A family in which EVERY child is "Not
--   interested" is now deleted 6 months after its last activity (a note,
--   a call, a status change, a booking or a check-in - the same activity as
--   before; marking someone Not interested is itself activity, so the 6
--   months start at the latest then). Every other family that has no
--   Joined child keeps the 2 years of v0.244. Joined is never deleted.
--   A family with one Not interested child and a brother still Booked (or
--   New, Contacted ...) is NOT "all Not interested": it keeps 2 years.
--
-- WHAT IT DOES
--   Replaces prospects_purge_old() with 0015's version, changed in exactly
--   two places: the "how quiet" test - when the families are picked and
--   again at the moment they are deleted - is 6 months for an all-Not-
--   interested family, else 2 years; and it now also locks the families'
--   children before that re-check (so a save in progress finishes first and
--   is seen). Everything else is 0015's, unchanged:
--   one clean-up at a time, families locked in id order, the rule checked
--   again inside the delete, the families' family_history rows removed, ONE
--   counts-only row in change_log. No table, grant or other function changes.
--
-- WHAT TO KNOW BEFORE APPLYING
--   Nothing is deleted while pasting. The NEXT time anyone opens Prospects,
--   every all-Not-interested family that has been quiet for 6 months or
--   more is deleted for good (with its history).
--   NEVER re-run 0012 or 0015 after this file: they would put back the
--   2-year-only rule (and 0012 the old history triggers - see 0015's
--   header). If 0015 is ever re-run, re-run this file straight after.
--
-- HOW TO RUN IT
--   Only AFTER 0015 is live. Supabase dashboard -> SQL Editor -> New query
--   -> paste this WHOLE file -> Run. One transaction: if anything fails,
--   nothing is kept. Supabase may warn about DESTRUCTIVE OPERATIONS: the
--   word is inside the clean-up function, which only runs later. Nothing is
--   removed now. Safe to run again.
-- =====================================================================

begin;

do $$
begin
  if to_regclass('public.family_history') is null
     or to_regprocedure('public.family_history_forget(uuid[], smallint, uuid[])') is null then
    raise exception '0021 needs 0015 (family history) first.';
  end if;
end;
$$;

-- prospects_purge_old() - 0015's clean-up with the v0.611 rule: no Joined
-- child, and quiet for 6 months if every child is Not interested, else 2
-- years (checked when picking AND again inside the delete).
create or replace function public.prospects_purge_old()
returns integer
language plpgsql
volatile
security invoker
set search_path = ''
as $$
declare
  v_subs   uuid[];
  v_done   uuid[];
  v_kn     jsonb;
  v_known  uuid[];
  v_kids   integer;
  v_label  text := current_setting('tkd.actor_label', true);
  v_action text := current_setting('tkd.action', true);
begin
  if not pg_try_advisory_xact_lock(hashtext('public.prospects_purge_old')) then
    return 0;   -- another clean-up is running right now
  end if;
  perform set_config('tkd.actor_label', 'Prospect clean-up', true);
  perform set_config('tkd.action', 'prospects_purge_old', true);
  -- the families to remove, locked in id order. (Rarely this can deadlock
  -- with prospects_delete, which locks prospect then sign-up; Postgres
  -- stops one of them, and both sides handle it: the list carries on, the
  -- delete answers "stale".)
  select coalesce(array_agg(f.id order by f.id), '{}') into v_subs
    from (select f.id
            from public.form_submissions f
           where f.id in (select p.submission_id
                            from public.prospects p
                            left join public.prospect_statuses s on s.id = p.status_id
                           group by p.submission_id
                          having bool_and(coalesce(s.builtin, '') <> 'joined')
                             and max(p.last_activity_at) < now() - case when bool_and(coalesce(s.builtin, '') = 'not_interested')
                                                                       then interval '6 months' else interval '2 years' end)
           order by f.id
             for update) f;
  if cardinality(v_subs) = 0 then
    perform set_config('tkd.actor_label', coalesce(v_label, ''), true);
    perform set_config('tkd.action', coalesce(v_action, ''), true);
    return 0;
  end if;
  -- everything that goes with them, collected before the delete: each id
  -- with its family ("s") and whether it is a child ("k")
  select coalesce(jsonb_agg(x), '[]') into v_kn
    from (select p.submission_id as s, p.id as i, true as k from public.prospects p where p.submission_id = any (v_subs)
          union all
          select p.submission_id, n.id, false from public.prospect_notes n join public.prospects p on p.id = n.prospect_id
           where p.submission_id = any (v_subs)
          union all
          select b.submission_id, b.id, false from public.class_bookings b where b.submission_id = any (v_subs)) x;
  -- 0021 (security review L1): lock the children too, in id order, so a
  -- status change or note being saved on one of them right now finishes
  -- first - the re-check below then sees it (staff saves lock the child's
  -- row, this clean-up had locked only the sign-up)
  perform 1 from public.prospects p where p.submission_id = any (v_subs) order by p.id for update;
  -- the delete checks the rule AGAIN (a child made Joined, or active, by
  -- someone else a moment ago keeps the family) and says what it removed
  with old_families as (
    select p.submission_id
      from public.prospects p
      left join public.prospect_statuses s on s.id = p.status_id
     where p.submission_id = any (v_subs)
     group by p.submission_id
    having bool_and(coalesce(s.builtin, '') <> 'joined')
       and max(p.last_activity_at) < now() - case when bool_and(coalesce(s.builtin, '') = 'not_interested')
                                                 then interval '6 months' else interval '2 years' end
  ), gone as (
    delete from public.form_submissions f using old_families o
     where f.id = o.submission_id   -- prospects, notes, bookings, views cascade
    returning f.id
  )
  select coalesce(array_agg(g.id), '{}') into v_done from gone g;
  if cardinality(v_done) > 0 then
    select coalesce(array_agg((e ->> 'i')::uuid), '{}'),
           count(*) filter (where (e ->> 'k')::boolean)
      into v_known, v_kids
      from jsonb_array_elements(v_kn) e
     where (e ->> 's')::uuid = any (v_done);
    perform public.family_history_forget(v_done, null, v_known);
    perform public.family_history_counts_row(cardinality(v_done), v_kids, null);
  end if;
  perform set_config('tkd.actor_label', coalesce(v_label, ''), true);
  perform set_config('tkd.action', coalesce(v_action, ''), true);
  return cardinality(v_done);
end;
$$;

revoke execute on function public.prospects_purge_old() from public, anon, authenticated, service_role;

commit;
