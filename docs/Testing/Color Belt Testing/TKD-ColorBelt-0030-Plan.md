# Migration 0030 — Color Belt design review database half: plan (draft, not reviewed)

What: the design for migration 0030 (reserved by Main 2026-10-28): CB1 Mark paid with a way to pay, CB7 history
readers, CB18 the admin-only results CSV. Why: the shared Mark paid box and History line (Part 2) and the CSV button
(Part 1) need database functions the app doesn't have. Drafted by a planning agent 2026-10-28; needs Jeffrey's
answers (bottom), then the build, a separate security review, and Jeffrey's paste.

File: `supabase/migrations/0030_color_belt_review.sql`, one transaction. Adds 5 app functions, 1 helper, 1 table
(`testing_downloads`) with a guard trigger. **Changes nothing live** — the old 2-argument `testing_mark_paid` and
`testing_private_mark_paid` stay, so the live site keeps working; 0005/0010/0011/0014/0018/0026 fingerprints don't
move (0003's list gains the new `testing_*` lines). A guard block refuses to run if a needed table/function is missing.
Every app function: security definer, `set search_path = ''`, `has_data_access()` first, no argument defaults,
revoke from public/anon/authenticated/service_role then grant to authenticated, 0005's error mapping.

## CB1 — Mark paid with a way to pay (new names; old ones removed in a later migration)

- `testing_mark_paid_by(p_registration_id, p_expected_version, p_method, p_expected_cents)` and
  `testing_private_mark_paid_by(p_private_id, p_expected_version, p_method, p_expected_cents)`.
- Method cash / check / card. The database still works out the price; if it differs from what the box showed
  (`p_expected_cents`) → `price_changed {amount_cents}`, nothing written (covers the midnight testing-day price).
  Staff can't type an amount (only admins change amounts, via Edit payment).
- Statuses: no_access, invalid, not_found, stale, withdrawn / cancelled, already_paid, price_changed, ok
  `{payment_id, amount_cents, method, paid_on, version}`. Same change-log action names as today.
- **Finance (checked):** Finance reads only `testing_payments.method` / `testing_private_payments.method`, never
  `paying_by` (0011, 0018, 0026; 0029 only changes the reminder). The new functions write `method`, so the Daily
  report's Cash / Check / Card totals are right. No message to Finance needed.

## CB7 — history readers

- Helper `testing_history_strip(jsonb)` removes login ids (created_by, updated_by, withdrawn_by, recorded_by,
  cancelled_by, submission_id); a signature shows only as "on file".
- `testing_registration_history(p_registration_id)`: the registration's, its payments' and its result's change-log
  rows; `testing_private_history(p_private_id)`: the same for a private testing. Newest first, at most 500, only
  `occurred_at, actor_name, action, table_name, op, before, after`. Statuses no_access / invalid / not_found / ok.
- App side (Part 2): HistoryLine's `load()` throws unless ok; money rows hidden while Hide private details is on.

## CB18 — results CSV (admins only)

- Table `testing_downloads` (copies `star_downloads`): who, when, event, row count; nobody in the app can read it;
  updates / deletes / truncate refused.
- `testing_results_csv(p_event_id)`: admins only (`not_allowed`), writes the download row first, returns the event and
  one row per active student (withdrawn, duplicates and moved-to-private left out), in class / belt / name order.
- Proposed columns: registration id, reference (CB-3101), first / last name, class and its times, current belt,
  testing for, result, (note?), paying by, paid, paid amount, paid on, paid by. Never: signature, login ids, staff names.
  Color Belt stores no date of birth, email, address or medical details, so this file has less than Star's.

## Tests, setup, order

- `0030_tests.sql`: who may call what; both Mark paid functions (methods, price changed at midnight, double click,
  already paid, withdrawn / cancelled, top-up); old and new side by side; **Finance's Cash / Check / Card totals move by
  exactly the payment**; history (newest first, no login ids, not_found after delete); CSV (one log row, admin only,
  exact columns); catalog checks. `0030_fingerprints.sql`; PGlite `step0030`; SETUP "## Migration 0030: …" with
  0030a–0030e (before, paste, fingerprints, advisor + tests, undo — app rolled back first; the log table is dropped only
  if empty).
- Order: migration live and checked → then the CSV button merges → Part 2 (Mark paid box, History line) → later a
  small migration removes the old 2-argument functions.

## Questions for Jeffrey (one at a time, with pictures)

Answers so far (go into one rulebook row when all five are answered):
- Q1 (2026-10-28): **A** — refuse with `price_changed`, the box stays open with the new amount and an amber note.
- Q2 (2026-10-28): **B** — "If they change how they pay the dashboard should reflect that": Mark paid by a different way
  also sets `paying_by` to it (logged). Undo payment must then put `paying_by` back to what it was (build this in 0030:
  the new functions remember the old value, e.g. in the change log batch, and the Undo path restores it).
- Q3 (2026-10-28): **B** — the CSV includes the grader's note (column "Grader's note", after Result). Columns:
  Reference, First name, Last name, Class, Class time, Belt, Testing for, Result, Grader's note, Paying by, Paid,
  Amount paid, Paid on, Paid by (plus the registration id). Removed / duplicates / moved-to-private left out; never
  signatures, login ids or staff names; each download logged; button hidden while Hide private details is on.
  Note: the file now carries free-text remarks about children — admins only, logged; the CSV must neutralize
  cells starting with = + - @ (spreadsheet formula injection), which matters more now that free text is in it.
- Q4 (2026-10-28): **A** — a moved private testing's History shows only its own rows, starting at the move; the move
  row names the event. The earlier rows stay on the event registration (Removed list); nothing shown twice.
- Q5 (2026-10-28): **A** — names as listed: `testing_mark_paid_by`, `testing_private_mark_paid_by`,
  `testing_registration_history`, `testing_private_history`, `testing_history_strip`, `testing_results_csv`,
  table `testing_downloads`. All five answered → rulebook v0.418.
- Q6 (2026-10-29): **A** — "A: follows too" (rulebook v0.419): an admin's Edit payment that changes the way also
  changes `paying_by` (logged); the new payment keeps the family's choice in `paying_by_before`, so Undo payment puts
  it back; Move to private and Undo move copy `paying_by_before` with the payments. 0030 replaces
  `testing_edit_payment`, `testing_private_edit_payment`, `testing_move_to_private` and `testing_private_undo_move`
  in place (their fingerprints move). Exact rule: migration section 4b.

1. Price changed at midnight: refuse and show the box again with the new price (recommended), or keep the shown price?
2. When the desk picks a different way than the family chose: keep `paying_by` as "what they chose" (recommended) or
   change it too?
3. CSV columns: approve the list; include the grader's note? the reference? moved-to-private students (recommended no)?
4. A moved private testing's history: only its own rows (recommended), or the event registration's earlier rows too?
5. Function and table names OK?
