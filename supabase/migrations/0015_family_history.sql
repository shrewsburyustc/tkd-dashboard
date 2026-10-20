-- =====================================================================
-- 0015_family_history.sql
-- ---------------------------------------------------------------------
-- WHAT THIS FILE IS
--   A database migration for the TKD staff dashboard. It runs after 0012
--   (Prospects). It gives the FAMILY records - sign-ups, free-class
--   bookings, prospects and their notes - their own history table,
--   public.family_history, so the 2-year clean-up can remove a family's
--   history together with the family.
--
-- WHY IT EXISTS
--   Rulebook v0.244 answer 1 (Jeffrey): every family that isn't Joined is
--   deleted 2 years after its last activity, "and the history copies go
--   too" - the records are about children. 0003's change_log is
--   append-only for good (nothing can delete from it), so the family
--   tables can't keep logging there.
--   Decision: rulebook v0.400 (Jeffrey, 2026-10-19, Color Belt session),
--   design note docs/Testing/Color Belt Testing/DECISION-history-purge.md
--   (branch color-belt, commit 0103c69) - its rules R1-R7 are followed
--   here and named in the comments below.
--
-- WHAT IT DOES
--   1. Refuses to run if change_log already holds a family row (R5).
--   2. public.family_history - exactly change_log's columns, constraints
--      and indexes; RLS on, no policy, granted to nobody (R1).
--   3. It can't be edited or emptied; a row can only be deleted while the
--      clean-up or "delete prospect" is running (R2).
--   4. family_history_write() (same as 0003's change_log_write, other
--      table) and 0009's forms_submissions_log() now write there; the
--      _log triggers of class_bookings, prospects and prospect_notes point
--      at it (R3). Staff settings (forms, form_booking_offers,
--      form_booking_limits, prospect_statuses) keep logging to change_log.
--   5. prospects_purge_old() and prospects_delete() (0012) also remove the
--      removed records' family_history rows, and leave ONE counts-only
--      row in change_log (R4).
--   NOTHING in 0003 is changed: change_log, change_log_write and
--   change_log_refuse_change stay exactly as they are.
--
-- RULE FOR LATER MIGRATIONS
--   Any new table that holds family data (children, parents, their
--   answers, notes, bookings) logs into family_history with
--   family_history_write() - never into change_log - and the clean-up must
--   remove its rows too.
--   NEVER re-run 0009 or 0012 after this file: that would bring back their
--   old history functions and triggers, so the next family write would land
--   in change_log - where it can never be removed - and this file would
--   then refuse to run again (R5). Ask first if it ever seems needed.
--
-- NOT COVERED (R6)
--   Supabase's own backups keep deleted rows until those backups expire.
--   prospect_activity and prospect_opens aren't logged; they go with the
--   prospect (cascade). The counts row names whoever's screen ran the
--   clean-up; its action column (prospects_purge_old) identifies it.
--   No screen reads either history today (R7).
--
-- HOW TO RUN IT
--   Only AFTER 0012 is live. Supabase dashboard -> SQL Editor -> New query
--   -> paste this WHOLE file -> Run. One transaction: if anything fails,
--   nothing is kept. Supabase warns about DESTRUCTIVE OPERATIONS: the words
--   appear in functions that run later (the clean-up, deleting a prospect)
--   and in "drop ... if exists" lines that make re-running safe. Nothing
--   is removed now. Safe to run again.
-- =====================================================================

begin;

do $$
begin
  if to_regclass('public.prospects') is null or to_regclass('public.form_submissions') is null then
    raise exception '0015 needs 0009 (Forms) and 0012 (Prospects) first.';
  end if;
  -- R5: a family copy must never stay behind in the append-only history
  if exists (select 1 from public.change_log c
              where c.table_name in ('form_submissions', 'class_bookings', 'prospects', 'prospect_notes')) then
    raise exception '0015: change_log already holds family rows (form_submissions, class_bookings, prospects or prospect_notes). Stop and ask: they can''t be moved or deleted from there.';
  end if;
end;
$$;


-- ---------------------------------------------------------------------
-- 1. The table (R1) - a twin of change_log (0003 section 6)
-- ---------------------------------------------------------------------
create table if not exists public.family_history (
  id            bigint      generated always as identity,
  occurred_at   timestamptz not null default now(),
  actor_id      uuid        null,       -- auth.uid(); NULL in the SQL Editor. No foreign key on purpose.
  actor_name    text        not null,   -- name at the time (change_log_actor_name)
  session_id    uuid        null,       -- which sign-in session (device)
  batch_id      uuid        null,       -- same for every row one app call wrote
  action        text        not null,   -- forms_public_submit, prospects_set_status, ..., manual
  table_name    text        not null,
  record_id     uuid        not null,
  location_code text        null,
  op            text        not null,
  before        jsonb       null,
  after         jsonb       null,

  constraint family_history_pkey     primary key (id),
  constraint family_history_op_check check (op in ('insert', 'update', 'delete'))
);

create index if not exists family_history_table_record_idx on public.family_history (table_name, record_id);
create index if not exists family_history_occurred_at_idx  on public.family_history (occurred_at);
create index if not exists family_history_batch_idx        on public.family_history (batch_id);

comment on table public.family_history is
  'History of the family records (sign-ups, bookings, prospects, notes). Like change_log, but the 2-year clean-up and "delete prospect" remove a family''s rows (0015, rulebook v0.400).';

-- RLS on, no policy, nothing granted = nobody in the app (same as change_log)
alter table public.family_history enable row level security;
revoke all on table public.family_history from public, anon, authenticated, service_role;
revoke all on sequence public.family_history_id_seq from public, anon, authenticated, service_role;


-- ---------------------------------------------------------------------
-- 2. Protection (R2)
-- ---------------------------------------------------------------------

-- 2a. family_history_refuse_change() - BEFORE UPDATE (each row) and
-- BEFORE TRUNCATE: history that can be edited isn't history.
create or replace function public.family_history_refuse_change()
returns trigger
language plpgsql
set search_path = ''
as $$
begin
  raise exception 'family_history can''t be edited';
end;
$$;

revoke execute on function public.family_history_refuse_change() from public, anon, authenticated, service_role;

-- 2b. family_history_guard_delete() - BEFORE DELETE (each row): only while
-- the 2-year clean-up or "delete prospect" is running (they set
-- tkd.action). A guard against a mistaken manual delete in the SQL Editor;
-- the real protection is that nobody but the table's owner (the clean-up
-- functions) may delete at all.
create or replace function public.family_history_guard_delete()
returns trigger
language plpgsql
set search_path = ''
as $$
begin
  if coalesce(current_setting('tkd.action', true), '') in ('prospects_purge_old', 'prospects_delete') then
    return old;
  end if;
  raise exception 'family_history rows are removed only by the Prospects clean-up or by deleting a prospect';
end;
$$;

revoke execute on function public.family_history_guard_delete() from public, anon, authenticated, service_role;

drop trigger if exists family_history_no_update on public.family_history;
create trigger family_history_no_update
  before update on public.family_history
  for each row
  execute function public.family_history_refuse_change();

drop trigger if exists family_history_no_truncate on public.family_history;
create trigger family_history_no_truncate
  before truncate on public.family_history
  for each statement
  execute function public.family_history_refuse_change();

drop trigger if exists family_history_guard_delete on public.family_history;
create trigger family_history_guard_delete
  before delete on public.family_history
  for each row
  execute function public.family_history_guard_delete();


-- ---------------------------------------------------------------------
-- 3. Writing the history (R3)
-- ---------------------------------------------------------------------

-- 3a. family_history_write() - the same as 0003's change_log_write(), into
-- family_history: one row per changed row; for an update only the columns
-- whose value changed; nothing when nothing changed. Same actor, session,
-- batch and action rules. (The return value of an AFTER trigger is
-- ignored, hence "return null".)
create or replace function public.family_history_write()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_old    jsonb;
  v_new    jsonb;
  v_before jsonb;
  v_after  jsonb;
  v_row    jsonb;   -- whichever of old/new exists, for id + location_code
begin
  if tg_op = 'INSERT' then
    v_new   := to_jsonb(new);
    v_after := v_new;
    v_row   := v_new;
  elsif tg_op = 'UPDATE' then
    v_old := to_jsonb(old);
    v_new := to_jsonb(new);
    -- keep only the columns whose value changed
    select jsonb_object_agg(o.key, o.value)
      into v_before
      from jsonb_each(v_old) as o(key, value)
     where o.value is distinct from v_new -> o.key;
    select jsonb_object_agg(n.key, n.value)
      into v_after
      from jsonb_each(v_new) as n(key, value)
     where n.value is distinct from v_old -> n.key;
    if v_before is null and v_after is null then
      return null;   -- identical rows: nothing to record
    end if;
    v_row := v_new;
  else   -- DELETE: keep the whole old row
    v_old    := to_jsonb(old);
    v_before := v_old;
    v_row    := v_old;
  end if;

  insert into public.family_history
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

revoke execute on function public.family_history_write() from public, anon, authenticated, service_role;

-- 3b. forms_submissions_log() (0009) - unchanged, except that it writes
-- into family_history: the sign-up row WITHOUT the picture ("signature" is
-- "on file" or null).
create or replace function public.forms_submissions_log()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_old jsonb;
  v_new jsonb;
begin
  -- the signature is never copied: "on file" or null instead
  if tg_op <> 'INSERT' then
    v_old := (to_jsonb(old) - 'signature')
             || jsonb_build_object('signature', case when old.signature is null then null else 'on file' end);
  end if;
  if tg_op <> 'DELETE' then
    v_new := (to_jsonb(new) - 'signature')
             || jsonb_build_object('signature', case when new.signature is null then null else 'on file' end);
  end if;
  insert into public.family_history
    (actor_id, actor_name, session_id, batch_id, action, table_name, record_id, location_code, op, before, after)
  values
    (auth.uid(), public.change_log_actor_name(), public.current_session_id(),
     nullif(current_setting('tkd.batch_id', true), '')::uuid,
     coalesce(nullif(current_setting('tkd.action', true), ''), 'manual'),
     tg_table_name, (coalesce(v_new, v_old) ->> 'id')::uuid, coalesce(v_new, v_old) ->> 'location_code', lower(tg_op),
     v_old, v_new);
  return null;
end;
$$;

revoke execute on function public.forms_submissions_log() from public, anon, authenticated, service_role;

-- 3c. Point the family tables' history triggers at family_history.
-- (form_submissions_log already calls forms_submissions_log, replaced above.)
do $$
declare
  t text;
begin
  foreach t in array array['class_bookings', 'prospects', 'prospect_notes'] loop
    execute format('drop trigger if exists %I on public.%I', t || '_log', t);
    execute format('create trigger %I after insert or update or delete on public.%I for each row execute function public.family_history_write()',
                   t || '_log', t);
  end loop;
end;
$$;


-- ---------------------------------------------------------------------
-- 4. Removing a family's history (R4)
-- ---------------------------------------------------------------------

-- 4a. family_history_forget(sign-ups, child, known ids) - deletes every
-- family_history row of the records being removed: the sign-ups
-- themselves (whole families only), their prospects, those prospects'
-- notes and the bookings - including bookings replaced earlier ("Change
-- time" deletes the old row) and the "delete" rows the removal itself just
-- wrote. p_child = null: whole families; a number: only that child of the
-- (single) sign-up (a sibling delete - the sign-up's own rows, which list
-- every child, stay until the last child goes).
-- p_known = the ids collected BEFORE the delete (prospects, notes,
-- bookings). Records are found in the history too, by the sign-up id or
-- prospect id in their insert / delete rows (an update row only holds the
-- changed columns; it is caught by its record id). Internal: called only
-- by the two functions below, while tkd.action allows the delete.
create or replace function public.family_history_forget(p_subs uuid[], p_child smallint, p_known uuid[])
returns integer
language plpgsql
volatile
security invoker
set search_path = ''
as $$
declare
  v_subs text[] := coalesce(p_subs::text[], '{}');
  v_ids  uuid[] := coalesce(p_known, '{}');
  v_n    integer;
begin
  if cardinality(v_subs) = 0 then return 0; end if;
  -- prospects and bookings of these families (or of that one child)
  v_ids := v_ids || coalesce((
    select array_agg(distinct h.record_id)
      from public.family_history h
     where h.table_name in ('prospects', 'class_bookings')
       and (h.after ->> 'submission_id' = any (v_subs) or h.before ->> 'submission_id' = any (v_subs))
       and (p_child is null or coalesce(h.after ->> 'child_index', h.before ->> 'child_index')::smallint = p_child)), '{}');
  -- the notes of those prospects
  v_ids := v_ids || coalesce((
    select array_agg(distinct h.record_id)
      from public.family_history h
     where h.table_name = 'prospect_notes'
       and coalesce(h.after ->> 'prospect_id', h.before ->> 'prospect_id') = any (v_ids::text[])), '{}');
  -- a whole family: the sign-up's own rows too
  if p_child is null then
    v_ids := v_ids || p_subs;
  end if;
  delete from public.family_history h
   where h.table_name in ('form_submissions', 'class_bookings', 'prospects', 'prospect_notes')
     and h.record_id = any (v_ids);
  get diagnostics v_n = row_count;
  return v_n;
end;
$$;

revoke execute on function public.family_history_forget(uuid[], smallint, uuid[]) from public, anon, authenticated, service_role;

-- 4b. family_history_counts_row(families, children, school) - the ONE
-- change_log row a removal leaves: counts only - no names, contact
-- details, answers, notes or family record ids. record_id is a fresh
-- random id (change_log needs one). Internal.
create or replace function public.family_history_counts_row(p_families integer, p_children integer, p_location text)
returns void
language sql
volatile
security invoker
set search_path = ''
as $$
  insert into public.change_log
    (actor_id, actor_name, session_id, batch_id, action, table_name, record_id, location_code, op, before, after)
  values
    (auth.uid(), public.change_log_actor_name(), public.current_session_id(),
     nullif(current_setting('tkd.batch_id', true), '')::uuid,
     coalesce(nullif(current_setting('tkd.action', true), ''), 'manual'),
     'family_history', gen_random_uuid(), p_location, 'delete', null,
     jsonb_build_object('families', p_families, 'children', p_children));
$$;

revoke execute on function public.family_history_counts_row(integer, integer, text) from public, anon, authenticated, service_role;

-- 4c. prospects_purge_old() (0012) - the same clean-up (one at a time,
-- families in id order, none with a Joined child, quiet for 2 years),
-- now also removing their history: ids collected first, then the
-- families deleted (the rule checked again at that moment), then their
-- family_history rows, then one counts row - only when a family went
-- (it runs on every list load).
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
                             and max(p.last_activity_at) < now() - interval '2 years')
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
  -- the delete checks the rule AGAIN (a child made Joined, or active, by
  -- someone else a moment ago keeps the family) and says what it removed
  with old_families as (
    select p.submission_id
      from public.prospects p
      left join public.prospect_statuses s on s.id = p.status_id
     where p.submission_id = any (v_subs)
     group by p.submission_id
    having bool_and(coalesce(s.builtin, '') <> 'joined')
       and max(p.last_activity_at) < now() - interval '2 years'
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

-- 4d. prospects_delete(prospect, version) (0012) - ADMINS ONLY, as
-- before: the child's prospect, notes, timeline and free-class booking go;
-- the family's sign-up goes with its LAST child. Now their history goes
-- too, and one counts row stays in change_log.
create or replace function public.prospects_delete(p_prospect_id uuid, p_expected_version integer)
returns jsonb
language plpgsql
volatile
security definer
set search_path = ''
as $$
declare
  v_p record;
  v_check text;
  v_family_gone boolean := false;
  v_known uuid[];
begin
  begin
    if public.has_data_access() is not true then return jsonb_build_object('status', 'no_access'); end if;
    if public.is_admin() is not true then return jsonb_build_object('status', 'not_allowed'); end if;
    if p_prospect_id is null or p_expected_version is null then return jsonb_build_object('status', 'invalid'); end if;
    v_check := public.prospects_lock(p_prospect_id, p_expected_version);
    if v_check <> 'ok' then return jsonb_build_object('status', v_check); end if;
    select p.* into v_p from public.prospects p where p.id = p_prospect_id;
    -- the whole family locked (siblings), so two deletes can't both think they are last
    perform 1 from public.form_submissions s where s.id = v_p.submission_id for update;
    perform set_config('tkd.action', 'prospects_delete', true);
    perform set_config('tkd.batch_id', gen_random_uuid()::text, true);
    if exists (select 1 from public.prospects x where x.submission_id = v_p.submission_id and x.id <> p_prospect_id) then
      -- one child of several: that child's records (collected before the delete)
      v_known := array[p_prospect_id]
              || coalesce((select array_agg(n.id) from public.prospect_notes n where n.prospect_id = p_prospect_id), '{}')
              || coalesce((select array_agg(b.id) from public.class_bookings b
                            where b.submission_id = v_p.submission_id and b.child_index = v_p.child_index), '{}');
      delete from public.class_bookings b where b.submission_id = v_p.submission_id and b.child_index = v_p.child_index;
      delete from public.prospects p where p.id = p_prospect_id;
      perform public.family_history_forget(array[v_p.submission_id], v_p.child_index, v_known);
    else
      -- the last child: the whole family
      v_known := coalesce((select array_agg(p.id) from public.prospects p where p.submission_id = v_p.submission_id), '{}')
              || coalesce((select array_agg(n.id) from public.prospect_notes n
                            join public.prospects p on p.id = n.prospect_id where p.submission_id = v_p.submission_id), '{}')
              || coalesce((select array_agg(b.id) from public.class_bookings b where b.submission_id = v_p.submission_id), '{}');
      delete from public.form_submissions s where s.id = v_p.submission_id;   -- prospects, notes, bookings, views cascade
      v_family_gone := true;
      perform public.family_history_forget(array[v_p.submission_id], null, v_known);
    end if;
    perform public.family_history_counts_row(case when v_family_gone then 1 else 0 end, 1, v_p.location_code);
    perform set_config('tkd.action', '', true);
    perform set_config('tkd.batch_id', '', true);
    return jsonb_build_object('status', 'ok', 'family_removed', v_family_gone);
  exception
    when foreign_key_violation or check_violation then return jsonb_build_object('status', 'invalid');
    when deadlock_detected or serialization_failure or lock_not_available then return jsonb_build_object('status', 'stale');
  end;
end;
$$;

revoke execute on function public.prospects_delete(uuid, integer) from public, anon, authenticated, service_role;
grant execute on function public.prospects_delete(uuid, integer) to authenticated;

commit;
