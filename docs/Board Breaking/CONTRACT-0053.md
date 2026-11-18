# CONTRACT-0053 — Board breaking: delete a student or an event once its money nets to zero

Status: **DRAFT, 2026-11-17.** Migration number 0053 requested from Main on 2026-11-17 (standing OK to reserve; if Main assigns a
different number, rename the files and every mention). Decision (Jeffrey, 2026-11-17, chosen from three options, "Delete once money
nets to zero (Recommended)"; he had asked "I need to permanently remove someone" and "I should be able to remove the event, even if
people are registered"): rulebook **v1.307**. Runs after 0051 and 0052 (live). Jeffrey pastes it only after an independent security
review and his OK; the app half is pushed only after the migration is live.

## 1. Why

0051's `brk_delete_registration` and `brk_delete_event` refuse (`has_payments`) when ANY payment row exists. But Undo never removes a
payment: it adds an opposite row (a reversal), so an undone payment still blocks the delete, and the dialog's advice "Undo the payment
first" could never work. Jeffrey needs to remove test students and test events (the Square sandbox tests make payments).

## 2. The rule (both functions, admin only, as today)

A student (or a whole event with all its students, classes and payment rows) may be **permanently deleted when**:
1. every student concerned has payments that **net to zero** (`sum(brk_payments.amount_cents) = 0` per student; a student with no
   payment rows qualifies, as today; a payment that was edited or refunded and nets to zero qualifies), AND
2. **no closed Finance day counted one of those payments**: no row of `public.finance_day_closing_items` with
   `source = 'board_breaking'` has a `chain_id` or `row_id` equal to a payment id of those students, **for a closing that has not
   been undone or reopened** (no row of `public.finance_day_closings` points at it with `reverses_closing_id`). (A closing item keeps
   the ids of the payment rows it counted; deleting them would change a closed day's "Changed after closing" view. **Undo close and
   Reopen day free the student again**: the day then counts nothing. A day that is closed again writes NEW items, so it is caught
   again. Added after Medium finding M1 of the independent review.)

Otherwise nothing is deleted and the answer is:
- `{"status":"has_payments"}` — money still stands on at least one student (net ≠ 0). (Same word as today, so the live app keeps
  working; the new app words it as "payments that still count".)
- `{"status":"closed_day"}` — new word: a closed Finance day counted a payment. (Checked after `has_payments`.)
Everything else stays as in 0051: `no_access`, `not_allowed`, `invalid`, `not_found`, `stale`, `ok`, locks, version check.

## 3. How the payment rows get deleted (the one subtle part)

`brk_payments_guard` (0051 §3d) refuses every UPDATE and DELETE ("append-only"). 0053 replaces **only this guard function** so that a
DELETE is allowed in exactly one situation: the transaction-local setting `tkd.brk_purge` holds `student:<registration id>` and the
deleted row's `registration_id` equals that id, **or** it holds `event:<event id>` and the deleted row's student belongs to that event.
Only `brk_delete_registration` / `brk_delete_event` set it, **after** they have locked the students, proved the rule in §2, and
immediately before the deletes; they clear it right after (and it is `set_config(..., true)`, so it ends with the transaction anyway).
UPDATE stays refused always; INSERT rules (reversal, net ≥ 0) are unchanged. Nobody in the app has DELETE rights on the table (0051 §4),
and `set_config` is not callable through the API, so the flag can only be set from inside the two definer functions.
Order inside the functions: delete the student's payment rows (one statement, so the self-referencing reversal foreign key is checked
at the end of the statement), then the student (then, for an event, the event; classes and cleared Square links go with it as in 0051;
Square messages keep their row with `registration_id` set to null, as in 0051).

**The school lock (race with Close the day).** `finance_close_day` reads the payments without locking them, so a close and a
delete could overlap and leave a closing item that names a payment that is gone. Both functions therefore take
`perform 1 from public.locations l order by l.code for share;` (all school rows, in code order) **after** the version check and the
student locks and **before** the net-zero and closed-day checks. It conflicts with `finance_close_day`'s `for no key update` on its
school's row, so the two run one after the other: a close that started first finishes before we look (we then see its items and
answer `closed_day`); a close that starts after us waits until we are done and no longer sees the deleted rows. Lock order is event,
then students, then schools. **Invariant: no function that holds a `locations` lock may ever wait for a `brk_` row lock** (Close the
day never locks Board breaking rows today; a future function that locks a school and then a student or event could deadlock with the
deletes). A call that waits longer than the 5-second `lock_timeout` answers `stale`. Concurrency itself cannot be tested in PGlite
(one connection); the test proves the lock is in both functions' text, before the checks.

## 4. What stays on record

`change_log_write` (0003) logs every deleted row (payments, students, event) with who and when, as 0051 does for any delete. Finance:
the deleted payments simply stop existing (their chains vanish from Daily report / History / Export), which is why §2 refuses when a
closed day counted them. A Square message that arrives later for a deleted student's order finds no student and lands in "Square
payments need a look" (0051 behaviour for an unknown order).

## 5. Not changed

No table, column, constraint, grant, other function, Finance function or other section. Same signatures, `security definer`,
`search_path = ''`, `has_data_access()` first, then `is_admin()`; same revoke / grant lines; nothing for anon / service_role / the two
Board breaking logins.

## 6. The app (staff screens, preview data, wording)

Replaces the "Undo the payment first" wording. Student delete confirm (`DeleteStudentConfirm.jsx`, `text/dialogs.js`) and event delete
(`EventsTab.jsx`, `text/events.js`):
- `has_payments` → "<name> has payments that still count. Undo or refund them first, then delete the student." / event: "Some students
  on this event still have payments that count. Undo or refund them first, then delete the event."
- `closed_day` (new) → "<name>'s payments were counted when a day was closed in Finance, so the student can't be deleted. Leave the
  student on the roster." / event: "Money on this event was counted when a day was closed in Finance, so the event can't be deleted."
- Confirmation text before the delete: a student with payment history says it is deleted together with their payment history; an
  event says how many students (and "with their payment history" when there is any). "This can't be undone." stays.
- The delete button of an event with only undone / zero money is available as for an event with none (no pre-blocking by "has
  payments" in the event menu unless the rule is already known to refuse; the server decides, the dialog words the refusal).
`breakingApi.js` knows `closed_day` (status list and doc comments). The preview's fake database (`mockBreaking.js`) follows the same
rule, including the closed-day check when the fake Finance has a closing item that names the payment (if the fake Finance cannot
express it, say so and refuse nothing extra). Checks (`src/lib/breaking/checks.mjs`, `src/screens`-level checks) updated and new ones
added for: delete after undo works (student and event), refused while money stands, refused when a closing counted it, a payment edit
chain that nets to zero, the exact words.

## 7. Tests (database)

`supabase/tests/0053_tests.sql`, `0053_fingerprints.sql`, `0053_preapply_check.sql`, SETUP "Migration 0053: Board breaking delete
once money nets to zero", `step0053` in `supabase/tests/pglite/run.mjs`. Must show: delete a student with no payments (as 0051);
delete after Undo (net 0) works, the student's payment rows are gone and `change_log` has the deletes; delete after an edit chain
(reversal + new payment, still standing) refused; delete after refund + its reversal; refused while a payment stands (`has_payments`);
refused when a closing item names a payment of the student (`closed_day`) and nothing is deleted; whole-event delete with several
students (some never paid, some undone) works and removes everything, event delete refused if ONE student's money stands (nothing at
all deleted: all or nothing); staff (not admin) refused; not signed in / locked refused; stale version refused; the guard still refuses
UPDATE and DELETE outside the two functions (direct DELETE as the owner without the flag raises; with a wrong flag raises); the flag is
cleared afterwards; a Square payment (null login) that was undone can be deleted; the other student's rows of the same event are
untouched by a student delete; every older test file still passes (0051's tests about delete are updated where they asserted the old
rule, nothing else); re-run safety (a second run changes no fingerprint).
