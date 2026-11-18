-- =====================================================================
-- 0053_board_breaking_delete.sql
-- ---------------------------------------------------------------------
-- WHAT THIS FILE IS
--   A small change to the Board breaking section (migration 0051, live):
--   an admin may permanently remove a student, or a whole event with its
--   students, once the money of every student concerned NETS TO ZERO and
--   no closed Finance day counted any of it. It REPLACES three functions,
--   each starting from the live text (0051's), and nothing else:
--     brk_payments_guard       (0051 3d)  the append-only rule of the payments table
--     brk_delete_registration  (0051 8n)  remove one student
--     brk_delete_event         (0051 8c)  remove an event with all its students
--   No table, column, constraint, trigger, grant, other function, Finance
--   function or other section changes. Rulebook v1.307; contract
--   docs/Board Breaking/CONTRACT-0053.md.
--
-- WHY IT EXISTS
--   0051 refused to remove a student or an event when ANY payment row
--   existed (answer "has_payments"). But Undo never removes a payment: it
--   writes an opposite row (a "reversal"), so an undone payment still
--   blocked the removal, and the advice "Undo the payment first" could
--   never work. Test students and test events (the Square sandbox makes
--   payments) could not be cleaned up. The rule now is about the MONEY, not
--   about whether a row exists.
--
-- THE RULE (both functions, admin only, as before)
--   A student (or every student of an event) may be removed when
--     1. the student's payment rows add up to exactly 0 cents (a student who
--        was never paid qualifies, as before; a payment that was edited,
--        undone, or refunded in full also adds up to 0), AND
--     2. no closed Finance day counted one of those payments: no row of
--        public.finance_day_closing_items with source = 'board_breaking'
--        has a chain_id or row_id equal to the id of one of the student's
--        payment rows. (A closing keeps the ids of the rows it counted;
--        removing them would change a closed day's "Changed after closing"
--        view, so that student has to stay on the roster.)
--   Otherwise NOTHING is removed and the answer is
--     {"status":"has_payments"}  money still stands on at least one student
--                                (the same word as before, so the app that
--                                is live today keeps working)
--     {"status":"closed_day"}    new word: a closed Finance day counted a
--                                payment (checked after has_payments)
--   For an event it is all or nothing: if ONE student's money stands, or ONE
--   payment was counted by a closed day, nothing at all is removed.
--   Everything else stays as in 0051: no_access, not_allowed, invalid,
--   not_found, stale, ok, the locks, the version check.
--
-- HOW THE PAYMENT ROWS GET REMOVED (the one subtle part)
--   The payments table is append-only: brk_payments_guard (a trigger) refuses
--   every UPDATE and every DELETE. 0053 replaces ONLY that guard function so
--   that a DELETE is allowed in exactly one situation: the setting
--   tkd.brk_purge (a note that lives only inside the current transaction)
--   says  student:<registration id>  and the row being removed belongs to
--   that student, or says  event:<event id>  and the row's student belongs
--   to that event. Only brk_delete_registration and brk_delete_event write
--   that note, and only AFTER they have locked the student(s) and proved the
--   rule above; they remove the payment rows in one statement and clear the
--   note on the very next line (it is also transaction-local, so it ends
--   with the transaction anyway). UPDATE stays refused always. The INSERT
--   rules (a reversal must undo a real payment or refund of the same student
--   for exactly minus its amount at its school; a student's rows can never
--   add up to less than 0) are unchanged. The app's logins have no DELETE
--   right on the table at all (0051 section 4) and cannot set the note
--   through the API, so it can only be written from inside the two
--   functions (security definer, owned by the database owner).
--   Order inside the functions: the student's payment rows first (ONE
--   statement, so the reversal rows that point at other rows of the same
--   student are checked together at the end of it), then the student, then
--   (for an event) the event. The change history (change_log) records every
--   removed row (payments, students, classes, the event) with who and when,
--   as it does for any removal.
--
-- THE SCHOOL LOCK (a race with Finance's Close the day)
--   Close the day reads the payments without locking them, so a close and a
--   removal could overlap: the close counts a payment row at the moment we
--   remove it and stores the id of a row that is gone. Both removal functions
--   therefore take a SHARE lock on the schools' rows (public.locations, in code
--   order), after locking the student(s) and BEFORE the money and closed-day
--   checks. finance_close_day takes "for no key update" on its school's row;
--   the two lock modes conflict, so they run one after the other: a close that
--   started first finishes first (we then see its items and answer
--   closed_day), a close that starts after us waits for us. Lock order is
--   event, then students, then schools; Close the day never locks Board
--   breaking rows, so the two orders cannot wait for each other in a circle. A
--   waiting call gives up after 5 seconds (lock_timeout, set by the lock
--   helpers) and answers "stale".
--
-- WHAT STAYS ON RECORD / WHAT HAPPENS TO THE REST
--   * Finance: the removed payments simply stop existing, so their lines
--     vanish from the Daily report, History and Export of days that were
--     never closed. That is exactly why a closed day that counted one of
--     them refuses (closed_day).
--   * A Square message that arrives later for a removed student's order
--     finds no student and lands in "Square payments need a look" (0051's
--     behaviour for an unknown order); no payment is made. Every Square
--     message keeps its row (registration_id becomes empty), so a replayed
--     message id can never do anything twice.
--
-- WHAT TO KNOW BEFORE APPLYING
--   * Order: 0051 and Finance's 0052 first (both live). The guard below
--     stops this file unless they are there and each of the three functions
--     is exactly the live text (or this file's own text, on a re-run).
--   * The app that is live today keeps working: same names, arguments and
--     answers; "has_payments" is still the answer while money stands. It
--     just stops refusing when the money nets to zero. The new answer
--     "closed_day" is unknown to the old app (it shows a generic error);
--     the new app words it. Push the app only after this file is live.
--   * Nothing is removed by applying this file: it only changes three
--     functions.
--
-- HOW TO RUN IT
--   Supabase dashboard -> SQL Editor -> New query -> paste this WHOLE file
--   -> Run. It starts with "begin;" and ends with "commit;", so it is one
--   transaction: if anything fails, nothing is kept. Supabase may show a
--   destructive-operations warning because the words "delete" appear in the
--   function names and in the text of the new functions: that is expected,
--   nothing is removed now (it only replaces three functions with
--   "create or replace").
--   Safe to run again: the guard accepts the live text OR this file's text
--   and "create or replace" puts the same text back (tested in PGlite,
--   run.mjs step0053: a second run changes no fingerprint). Forward-only: no
--   undo file (going back would need a new migration).
-- =====================================================================

begin;


-- ---------------------------------------------------------------------
-- 1. The guard: stops here - and changes nothing - unless
--    * 0051's tables and the columns this file reads exist,
--    * Finance's 0052 is there (its table rule names board_breaking), and
--    * each of the three functions is EXACTLY the live text (or what this
--      file made, on a re-run), compared by an md5 of the code without
--      comments and white space, the same way the fingerprints files do. If
--      someone changed one since, pasting this file would silently undo that
--      change - so this file must be rebuilt first.
--      (function, live md5, this file's md5)
-- ---------------------------------------------------------------------
do $$
declare
  v_row record;
  v_md5 text;
begin
  if to_regclass('public.brk_payments') is null
     or to_regclass('public.brk_registrations') is null
     or to_regclass('public.brk_events') is null
     or to_regclass('public.finance_day_closing_items') is null then
    raise exception '0053 needs migration 0051 (Board breaking) and 0052 (Finance reads Board breaking) first';
  end if;
  if (select count(*) from information_schema.columns c
       where c.table_schema = 'public'
         and ((c.table_name = 'brk_payments' and c.column_name in ('id', 'registration_id', 'amount_cents'))
              or (c.table_name = 'brk_registrations' and c.column_name in ('id', 'event_id', 'version'))
              or (c.table_name = 'brk_events' and c.column_name in ('id', 'version'))
              or (c.table_name = 'finance_day_closing_items' and c.column_name in ('source', 'chain_id', 'row_id')))) <> 11 then
    raise exception '0053 needs the columns of 0051''s Board breaking tables and of Finance''s finance_day_closing_items';
  end if;
  if not exists (select 1 from pg_constraint c
                  where c.connamespace = 'public'::regnamespace
                    and c.conrelid = to_regclass('public.finance_day_closing_items')
                    and c.conname = 'finance_day_closing_items_source_check'
                    and pg_get_constraintdef(c.oid) like '%board_breaking%') then
    raise exception '0053 needs migration 0052 (Finance reads Board breaking) first';
  end if;
  for v_row in
    select * from (values
      ('public.brk_payments_guard()', 'b6cf31a8d2829ae41e7744e62591e467', '6f4c504c74a5bb809aeee77396e433fb'),
      ('public.brk_delete_registration(uuid, integer)', '6308d9aae45ce0d5aef45c29ffca73b8', 'f6ad9259087a6c583b2126f4971211d4'),
      ('public.brk_delete_event(uuid, integer)', 'bcca69a68f80d76a4d9daa002190297b', '6bba9594f6e1fe529d9eb3022b175f01')
    ) as t(sig, live_md5, new_md5)
  loop
    if to_regprocedure(v_row.sig) is null then
      raise exception '0053 needs % (Board breaking, migration 0051) first', v_row.sig;
    end if;
    select md5(regexp_replace(regexp_replace(p.prosrc, '--[^\n]*', '', 'g'), '\s+', '', 'g'))
      into v_md5
      from pg_proc p
     where p.oid = to_regprocedure(v_row.sig);
    if v_md5 not in (v_row.live_md5, v_row.new_md5) then
      raise exception '0053 was built over the live %, but the live one is different (md5 %) - rebuild 0053 first', v_row.sig, v_md5;
    end if;
  end loop;
end;
$$;


-- ---------------------------------------------------------------------
-- 2. brk_payments_guard() - keeps payments append-only (0051 3d), with ONE
--    narrow way out for the two delete functions below:
--   BEFORE INSERT: a reversal must undo a real PAYMENT or REFUND (never a
--                  reversal) of the same student, for exactly minus its
--                  amount, at the same school; and no new row may make the
--                  student's rows add up to less than 0   (unchanged)
--   BEFORE UPDATE: always refused                          (unchanged)
--   BEFORE DELETE: refused - EXCEPT while the transaction-local setting
--                  tkd.brk_purge says 'student:<registration id>' and the
--                  row belongs to that student, or says 'event:<event id>'
--                  and the row's student belongs to that event. Only
--                  brk_delete_registration / brk_delete_event write it,
--                  after proving the money nets to zero (0053).
-- RULE: ONLY brk_delete_registration and brk_delete_event may ever write
-- tkd.brk_purge; any future function that wrote it would bypass the money check.
-- Limit: the database owner could switch this trigger off on purpose; it
-- stops mistakes and the app, not a deliberate owner. The guard itself does
-- not look at the money: the two functions prove that before they write the
-- note, and nobody else can write it.
-- ---------------------------------------------------------------------
create or replace function public.brk_payments_guard()
returns trigger
language plpgsql
set search_path = ''
as $$
declare
  v_reversed public.brk_payments;
  v_net      bigint;
  v_purge    text;
begin
  if tg_op = 'INSERT' then
    if new.kind = 'reversal' then
      select * into v_reversed from public.brk_payments p where p.id = new.reverses_payment_id;
      if not found
         or v_reversed.kind not in ('payment', 'refund')
         or v_reversed.registration_id <> new.registration_id
         or new.amount_cents <> -v_reversed.amount_cents
         or new.school <> v_reversed.school then
        raise exception using
          errcode    = '23514',
          constraint = 'brk_payments_reversal_check',
          message    = 'a reversal must undo one payment or refund of the same student, for exactly minus its amount, at its school';
      end if;
    end if;
    select coalesce(sum(p.amount_cents), 0) into v_net
      from public.brk_payments p where p.registration_id = new.registration_id;
    if v_net + new.amount_cents < 0 then
      raise exception using
        errcode    = '23514',
        constraint = 'brk_payments_net_check',
        message    = 'a student''s payments can''t add up to less than zero';
    end if;
    return new;
  end if;

  -- 0053: the one way out. A removal is allowed only while the note of the
  -- two delete functions names this row's student, or this row's event.
  if tg_op = 'DELETE' then
    v_purge := coalesce(current_setting('tkd.brk_purge', true), '');
    if v_purge = 'student:' || old.registration_id::text
       or (v_purge like 'event:%'
           and exists (select 1 from public.brk_registrations r
                        where r.id = old.registration_id
                          and r.event_id::text = substr(v_purge, 7))) then
      return old;
    end if;
  end if;

  raise exception 'brk_payments is append-only (use a reversal)';
end;
$$;

revoke execute on function public.brk_payments_guard() from public, anon, authenticated, service_role;


-- ---------------------------------------------------------------------
-- 3. brk_delete_registration(p_registration_id, p_expected_version)   A
-- Removes a student, permanently, with the student's payment rows, when the
-- money nets to zero and no closed Finance day counted it (the rule above).
-- Refused (has_payments) while the student's rows add up to anything but 0;
-- refused (closed_day) when a closed day counted one of the rows. Nothing is
-- removed in either case.
-- Ok: {"status":"ok"}
-- ---------------------------------------------------------------------
create or replace function public.brk_delete_registration(p_registration_id uuid, p_expected_version integer)
returns jsonb
language plpgsql
volatile
security definer
set search_path = ''
as $$
declare
  v_r public.brk_registrations;
begin
  begin
    if public.has_data_access() is not true then
      return jsonb_build_object('status', 'no_access');
    end if;
    if public.is_admin() is not true then
      return jsonb_build_object('status', 'not_allowed');
    end if;
    if p_registration_id is null or p_expected_version is null then
      return jsonb_build_object('status', 'invalid');
    end if;

    v_r := public.brk_lock_registration(p_registration_id);
    if v_r.id is null then
      return jsonb_build_object('status', 'not_found');
    end if;
    if v_r.version <> p_expected_version then
      return jsonb_build_object('status', 'stale');
    end if;

    -- 0053: lock the schools' rows in SHARE mode (in code order) before looking at the money. Close the day
    -- (finance_close_day) takes "for no key update" on its school's row, and the two modes conflict, so a close
    -- and this removal can never run at the same moment: a close that started first finishes before we look
    -- (we then see its closing items and answer closed_day); a close that starts after us waits until we are
    -- done and then no longer sees the student's payment rows. Without this, a close could count a payment row at the
    -- same moment we removed it and keep the id of a payment that no longer exists.
    perform 1 from public.locations l order by l.code for share;

    -- 0053: the money must net to zero (no rows at all = zero) ...
    if (select coalesce(sum(p.amount_cents), 0) from public.brk_payments p where p.registration_id = v_r.id) <> 0 then
      return jsonb_build_object('status', 'has_payments');
    end if;
    -- ... and no closed Finance day may have counted one of the student's rows
    if exists (select 1
                 from public.finance_day_closing_items ci
                where ci.source = 'board_breaking'
                  and exists (select 1 from public.brk_payments p
                               where p.registration_id = v_r.id
                                 and p.id in (ci.chain_id, ci.row_id))) then
      return jsonb_build_object('status', 'closed_day');
    end if;

    perform set_config('tkd.action', 'brk_delete_registration', true);
    perform set_config('tkd.batch_id', gen_random_uuid()::text, true);

    -- the proof is done and the student is locked: open the guard for THIS
    -- student's rows only, remove them in ONE statement, close the guard
    perform set_config('tkd.brk_purge', 'student:' || v_r.id::text, true);
    delete from public.brk_payments p where p.registration_id = v_r.id;
    perform set_config('tkd.brk_purge', '', true);

    delete from public.brk_registrations r where r.id = v_r.id;

    perform set_config('tkd.action', '', true);
    perform set_config('tkd.batch_id', '', true);

    return jsonb_build_object('status', 'ok');
  exception
    when unique_violation then
      return jsonb_build_object('status', 'stale');
    when foreign_key_violation or check_violation or not_null_violation or data_exception then
      return jsonb_build_object('status', 'invalid');
    when deadlock_detected or serialization_failure or lock_not_available then
      return jsonb_build_object('status', 'stale');
  end;
end;
$$;

revoke execute on function public.brk_delete_registration(uuid, integer) from public, anon, authenticated, service_role;
grant  execute on function public.brk_delete_registration(uuid, integer) to authenticated;


-- ---------------------------------------------------------------------
-- 4. brk_delete_event(p_event_id, p_expected_version)   A
-- Removes an event with its students, their payment rows and its classes,
-- permanently, when EVERY student's money nets to zero and no closed Finance
-- day counted any of it (the rule above). All or nothing: if one student's
-- money stands (has_payments) or one payment was counted by a closed day
-- (closed_day), nothing at all is removed.
-- Ok: {"status":"ok"}
-- ---------------------------------------------------------------------
create or replace function public.brk_delete_event(p_event_id uuid, p_expected_version integer)
returns jsonb
language plpgsql
volatile
security definer
set search_path = ''
as $$
declare
  v_e public.brk_events;
begin
  begin
    if public.has_data_access() is not true then
      return jsonb_build_object('status', 'no_access');
    end if;
    if public.is_admin() is not true then
      return jsonb_build_object('status', 'not_allowed');
    end if;
    if p_event_id is null or p_expected_version is null then
      return jsonb_build_object('status', 'invalid');
    end if;

    v_e := public.brk_lock_event(p_event_id, true);
    if v_e.id is null then
      return jsonb_build_object('status', 'not_found');
    end if;
    if v_e.version <> p_expected_version then
      return jsonb_build_object('status', 'stale');
    end if;
    -- lock every student of the event (in id order) before looking at money
    perform 1 from public.brk_registrations r where r.event_id = v_e.id order by r.id for update;

    -- 0053: lock the schools' rows in SHARE mode (in code order) before looking at the money. Close the day
    -- (finance_close_day) takes "for no key update" on its school's row, and the two modes conflict, so a close
    -- and this removal can never run at the same moment: a close that started first finishes before we look
    -- (we then see its closing items and answer closed_day); a close that starts after us waits until we are
    -- done and then no longer sees the event's payment rows. Without this, a close could count a payment row at the
    -- same moment we removed it and keep the id of a payment that no longer exists.
    perform 1 from public.locations l order by l.code for share;

    -- 0053: every student's money must net to zero (a student with no rows
    -- has no group at all, so never blocks) ...
    if exists (select 1
                 from public.brk_payments p
                 join public.brk_registrations r on r.id = p.registration_id
                where r.event_id = v_e.id
                group by p.registration_id
               having sum(p.amount_cents) <> 0) then
      return jsonb_build_object('status', 'has_payments');
    end if;
    -- ... and no closed Finance day may have counted any of their rows
    if exists (select 1
                 from public.finance_day_closing_items ci
                where ci.source = 'board_breaking'
                  and exists (select 1
                                from public.brk_payments p
                                join public.brk_registrations r on r.id = p.registration_id
                               where r.event_id = v_e.id
                                 and p.id in (ci.chain_id, ci.row_id))) then
      return jsonb_build_object('status', 'closed_day');
    end if;

    perform set_config('tkd.action', 'brk_delete_event', true);
    perform set_config('tkd.batch_id', gen_random_uuid()::text, true);

    -- the proof is done and every student is locked: open the guard for THIS
    -- event's rows only, remove them all in ONE statement, close the guard
    perform set_config('tkd.brk_purge', 'event:' || v_e.id::text, true);
    delete from public.brk_payments p
     using public.brk_registrations r
     where r.id = p.registration_id and r.event_id = v_e.id;
    perform set_config('tkd.brk_purge', '', true);

    delete from public.brk_registrations r where r.event_id = v_e.id;
    delete from public.brk_events e where e.id = v_e.id;

    perform set_config('tkd.action', '', true);
    perform set_config('tkd.batch_id', '', true);

    return jsonb_build_object('status', 'ok');
  exception
    when unique_violation then
      return jsonb_build_object('status', 'stale');
    when foreign_key_violation or check_violation or not_null_violation or data_exception then
      return jsonb_build_object('status', 'invalid');
    when deadlock_detected or serialization_failure or lock_not_available then
      return jsonb_build_object('status', 'stale');
  end;
end;
$$;

revoke execute on function public.brk_delete_event(uuid, integer) from public, anon, authenticated, service_role;
grant  execute on function public.brk_delete_event(uuid, integer) to authenticated;


commit;

-- End of 0053_board_breaking_delete.sql
