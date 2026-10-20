# Color Belt testing — Phase 4 build plan: the Private testing tab

**Written:** 2026-10-19 (branch `color-belt`, worktree `color-belt-session-01afc8`) · **Rewritten** after Jeffrey redirected phase 4 (rulebook v0.401: private testing is its own tab, not connected to any event). The first plan (event-linked, 2026-10-18) and its build (commit dae8d00) are superseded; nothing of it was applied or deployed. **Status:** independently reviewed (§8, all findings applied; the two owner questions answered in v0.404); waiting for Jeffrey's OK (CP0). Nothing is built, applied or pushed.
**Built from:** rulebook rows **v0.401, v0.402, v0.403, v0.404** (binding) and the parts of v0.225–v0.228 / v0.254 that v0.402 keeps · mockups `TKD-ColorBelt-Private-Mockups.html` **P1–P8** (approved 2026-10-19 with every proposed item as drawn) · the live phase 2 / 3 code and migrations `0005_testing_events.sql`, `0010_testing_results.sql` · the reviewed phase 4 build in dae8d00 (parts are reused, §1.9 / §3).
**Contract:** `docs/Dashboard Docs/Build contracts/CONTRACT-0014.md` (rewritten with this plan). Migration **0014** (0012 = prospects, 0013 = camps).

---

## 0. Scope

**In (v0.401–v0.403):**
- A third Testing tab **Private testing**, at the far right (after Events and Classes and ranks); at 320 px the tab bar scrolls sideways (P1).
- The tab is a roster like an event's Students tab: Upcoming / Past (opens on Upcoming), summary cards (Private testings · Paid with “1 owes more” · Not paid · Payments recorded), **+ Add private testing** (all staff), one row per private testing (day · time, student + class, Testing for · private price, Paying by, Payment, Paid on, Mark paid, ⋯), the empty state (P1).
- **Add private testing** (P2): names, class, current belt, 3 stripes, Paying by, Day (weekday written out), Time (6:00 AM–10:00 PM, 5-minute steps), “$95 private price” (copied from Classes and ranks, never typed); past days refused.
- ⋯ (P3): Edit details · Change how they'll pay (while money is owed) · Change day or time (P4) · Grade · Cancel private testing; admins also Edit payment · Undo payment · Delete permanently. On Past rows (P7): Passed / Not passed → Grade only; No show → Edit details, Change day or time (clears the No show, logged), Grade, Cancel; cancelled → staff no ⋯, admins Restore (only while the day is ahead) and Delete permanently.
- Money: Mark paid records what is owed (full price, or the difference); a belt correction re-prices (up → owed with a warning, down → nothing owed, no refund); payments append-only with Undo / Edit of the most recent payment, as on events.
- **Move to private testing** (P5) from an event roster's ⋯ (all staff): day + time, the student leaves the event (Removed: “Moved to private testing, <day>”, no Restore), appears on the tab with name, class and belt, **the payment moves with them**; allowed with no result or a testing-day No show (cleared, logged), refused after Passed / Not passed; Undo toast.
- **Grading page** (P6): Pass / Not passed / No show + note, the phase 3 lock counted from the private day, a gray Not paid tag while anything is owed, Print a one-student sheet (no payments).
- **Cancel** (P7): confirm, stays under Past grayed with “Cancelled <date>”, the payment stays; cards don't count cancelled ones but Payments recorded keeps their money (“includes $85 from cancelled”).
- The event Grading tab is unchanged (P8): events hold only testing-day students.

**Withdrawn (v0.401 / v0.402):** Set private testing on the event roster, the purple Private line, Back to the testing day, private students hidden from an event's Grading tab and sheet, the event-side top-up, the Private testings list on the Events tab, the Tests privately tick in Add student. **Out (later):** mat-side hiding (Star v0.249 / v0.250, a Color Belt follow-up once Star's switch is on `main`), a Home card, private on the family form (never), Realtime, refunds.

## 1. Database — migration `0014_testing_private.sql` (rewritten from scratch)

### 1.1 Data model — decision and why
**A private testing is its own record, not an event registration.** Three new tables, mirroring the three event-side tables that already work:

| New table | Mirrors | Holds |
|---|---|---|
| `testing_private` | `testing_registrations` + the event's rank copy | school, names, a **copy** of the class + rank at creation (class / rank names, belt colours, the Testing-for rank and its belt, the private price), paying by, 3 stripes, day, time, status active / cancelled (+ when / who), where it was moved from (event + registration ids and the event's name, nullable), version, who / when stamps |
| `testing_private_payments` | `testing_payments` | append-only payments and reversals (+ the id of the event payment it was moved from) |
| `testing_private_results` | `testing_results` | one row per graded private testing (result and / or one-line note) |

Plus one read view `testing_private_list` (like `testing_roster`: the row + its payment summary + what is owed, computed inline in the view — it never calls a helper the caller can't run), `security_invoker = true`.

**Why separate tables, not a generalised registration** (the reviewer is asked to check this):
- v0.401 says it outright: not connected to any event. A registration needs an `event_id` and an `event_rank_id` (both `not null`, checked by triggers); bending them would change **live** tables, their checks, the roster view, `testing_payments_guard` and every 0005 / 0010 function that assumes “a registration belongs to an event” — the exact risk the old plan had (nine replaced live functions). New tables leave every live object untouched except one function (§1.5).
- Copying the class and rank at creation is the rule events already follow (v0.136: a later Classes and ranks change never changes a booked price). Here there is no event copy to point at, so the private testing carries its own copy.
- Results in their own table for the same reason as phase 3 (v0.187): a grader's tap never changes the private testing's version, so the desk's Mark paid / Edit details never go stale because of grading.
- Payments in their own append-only table keep the proven rules (reversal = minus one payment, never edited, removed only with the whole record) and keep event money and private money apart for the cards and for Finance.
- Rejected: adding nullable `private_id` columns to `testing_payments` / `testing_results` (changes live tables, guard and view, two shapes in one table); one wide table with result columns (grading would bump the version).

### 1.2 Move to private testing (one transaction, all staff — v0.402 Q1, v0.403)
1. Lock school → event → registration (0005's `testing_lock_registration`) → its result row.
2. Refuse: withdrawn; Passed / Not passed (`has_result`). A testing-day **No show** is removed with its note, logged `clear_result` (“Moving clears that result.”). A note alone stays with the event registration.
3. Insert the private testing: names, the **event's** class / rank copy (names, belts, testing-for), **today's private price from Classes and ranks** (the same source as Add; the event's copied price only if that rank no longer exists — v0.404), the registration's paying by, the chosen day / time, `moved_from_*` = the event, the registration and the event's name.
4. **Move the money, append-only, net preserved:** for every live event payment of the student, a **reversal** on the event side and a matching **payment** on the private side (same amount, method and original `paid_on`; the private row keeps the event payment's id). Both reversal and new payment are dated on the original day, so a daily money report by date stays right on both days (the move is a transfer, not a refund).
5. The registration becomes `withdrawn` (reason `withdrawn`, who / when as Withdraw does). It is recognised as **moved** because a private testing points at it (`moved_from_registration_id`, unique) — **no change to the live registrations table or its status rule** (adding a reason `moved_to_private` would change 0005's check constraint, and re-running 0005 would then fail on existing moved rows).
6. Everything under **one** `tkd.batch_id`, action `move_to_private` (+ `clear_result`).

**Undo** (toast, 10 seconds from the registration's `withdrawn_at`, only the person who moved): the private testing is removed, the event payments are recorded again (same amount / method / day, with no “recorded by” login so the live 10-second own-undo can't reverse them), the registration is active again with its duplicate check re-run. Refused once anything changed (a new private payment, a result, an edit on either side) and — in the database too — when the move cleared a No show (it couldn't come back; the phase 3 precedent). A payment that arrived with a move can't be undone by staff with the payment Undo (admins can).

**Who may move (v0.404):** all staff, any time — also after the event's testing day, when a testing-day No show is cleared and logged — although Withdraw and changing results after the day are admin-only elsewhere. Decided by Jeffrey after the review flagged it.

**Removed row on the event:** “Moved to private testing, <day>” + “moved Nov 10 by Staff”; staff see no ⋯; admins see **Open private testing** and a grayed Restore with the reason; no Delete permanently (v0.403). The database refuses Restore of a moved registration (new status `moved`), so the student can't end up in both places.

### 1.3 Money (v0.402 / v0.403, from v0.226 / v0.254)
- **Price** = the copied private price. **Owed** = `price − net paid` (never below 0). Mark paid records the owed amount by the current paying-by method (full price when nothing is paid; the difference after a move or a pricier belt correction). Owed 0 → `already_paid`, nothing inserted (also a $0 price).
- **Belt correction** (Edit details): the class / rank is re-copied from Classes and ranks with its current private price → pricier: “Price $85 → $95 · $10 more to collect” (warned first); cheaper: the payment stays, nothing owed, no refund.
- **Change how they'll pay** while not paid or still owing (earlier payments keep their method). Undo payment (own, 10 s; admins any time) and Edit payment (admins) act on the most recent live payment, as 0005.
- **Cancel** keeps every payment (fees aren't refundable); Delete permanently (admins) removes the private testing with its payments and result (logged, named in the warning).

### 1.4 Grading (v0.402 Q2, v0.403)
Own result rules, the phase 3 pattern counted from the **private day**: before it → `not_open` (admins too); on it staff and admins; after it staff → `finished`, admins always. Last change wins (no version). Only a result counts as graded: Change day or time and Cancel are refused after Pass / Not passed (`graded`); a No show is cleared by Change day or time (logged); a note alone never blocks. A belt change of a graded testing clears its result (as phase 3) and, after the private day, is admin-only.

### 1.5 Live functions changed
- **Only `testing_restore_student`** (0010 body + one check: a moved registration → `moved`). Same arguments.
- **Nothing else:** `testing_mark_paid`, `testing_change_paying_by`, `testing_purge_old_signatures`, `testing_set_result`, `testing_set_result_note`, `testing_update_student`, `testing_resolve_duplicate`, `testing_update_event` keep their live bodies; `testing_registrations` gets no new columns; the roster view is untouched.
- Re-run order: re-running 0005 → re-run 0010, then 0014; re-running 0010 → re-run 0014.

### 1.6 Dates and times
Day from **today** to **today + 1 year** (the old cap was “testing day + 1 year”; with no event the cap counts from today — typo guard only, contract open point); 06:00–22:00 inclusive in 5-minute steps (v0.157); school time (`testing_today()`). Upcoming = active and day ≥ today; Past = day < today **or cancelled** (v0.402 Q3: “stays listed under Past”). Restore of a cancelled one: admins, only while its day is still ahead.

### 1.7 Security (handoff §6)
RLS on all three tables with `(select public.has_data_access())`; explicit column grants to `authenticated` only (never the login-id columns); nothing to `anon`, `service_role` or `testing_registrar`; revoke-first on every function; writes only through `security definer` functions with `search_path = ''`, fully qualified names, `has_data_access()` first, `{status}` answers; triggers stamp who / when and write `change_log` (same as Color Belt today). Private testings hold children's names: they are logged in **`change_log` like all testing data** — v0.400's `family_history` is for the Prospects family records only (their 2-year clean-up); private testings have no automatic removal (like event registrations, v0.162 / v0.136). No signatures, no DOB, no contact details are stored.

### 1.8 Tests and checks
`0014_tests.sql` (every rule, staff vs admin, negative cases, locked sessions, history), `0014_fingerprints.sql`, `run.mjs` step 15 (after Finance's step 14; fresh + upgrade + re-run + down-script, before 13g). **Fingerprint rule:** `0003_fingerprints.sql` lists every `testing_*` function, so the new `testing_*` functions (and the replaced restore) add / change rows there — expected; 0004 / 0006 unchanged; 0005 and 0010 differ only in `testing_restore_student`. `0005_tests.sql` goes back to the live version (the dae8d00 C3 change is reverted — no new registration columns).

### 1.9 What happens to the dae8d00 database work
`0014_testing_private.sql`, `0014_tests.sql`, `0014_fingerprints.sql` and SETUP §16 (§15 before the 2026-10-19 merge of Finance) are **rewritten from scratch** (all nine replaced function bodies and the registration columns go). Reused ideas: the 5-minute time helper, the “owed” helper, the one-batch logging, the down-script-in-SETUP pattern tested by run.mjs, the run.mjs step 14 skeleton (fresh / upgrade / re-run / down before 13g).

## 2. Data layer and preview mock

- **New `src/lib/testing/privateRules.js`** (pure): time choices, day rules, owed amount, menu rules, Upcoming / Past split and sort, card counts, the Move money line, `canMoveToPrivate`. The day / time helpers come from dae8d00's `eventRules.js` (moved here, cap changed to “today + 1 year”).
- **New `src/lib/testing/privateApi.js`**: `loadPrivateTestings`, `loadPrivateTesting`, and one call per database function (add, update, change day, change paying-by, mark paid, undo / edit payment, cancel, restore, delete, set result / note, move, undo move).
- `eventsApi.js`, `eventRules.js`, `mockTestingEvents.js`, `checks.mjs` go back to their live phase 3 versions, then: `loadEvent` adds which removed students were moved (`movedTo`), the status `moved`; the mock gains the three tables, the view and every new function (same rules, same statuses), and Restore's `moved`; checks cover every rule.

## 3. Front end (staff screens)

| File | Change |
|---|---|
| `src/screens/Testing.jsx` (shared) | Third tab **Private testing** at the far right; the private grading page when the address names one. |
| `src/App.jsx` (shared) | dae8d00's event `/private/` route reverted; new `#testing/private/<id>` for the grading page (back link and leaving guarded like the event page). |
| new `src/screens/testing/private/` | `PrivateTestingTab.jsx` (cards, switch, rows, empty state, menu), `PrivateRows.jsx`, `PrivateDialog.jsx` (Add / Edit details), `ChangeDayDialog.jsx`, `DayTimeFields.jsx` (salvaged from dae8d00's `event/PrivateDialog.jsx`), `CancelPrivateDialog.jsx`, `PrivateGradingPage.jsx` + `PrivateSheet.jsx` (moved from `event/`, re-pointed to the private tables). |
| `event/EventPage.jsx`, `RosterRows.jsx` | Back to phase 3, then: ⋯ **Move to private testing** (after Edit details), `event/MoveToPrivateDialog.jsx` (new), the toast with Undo, the moved Removed row (tag, line, admin sheet). |
| `event/useGradingSaves.js` | Back to phase 3, plus optional save functions so the grading page can reuse it. |
| `event/StudentDialog.jsx`, `PaymentDialogs.jsx`, `GradingTab.jsx`, `GradingSheet.jsx`, `NoteDialog.jsx`, `events/EventsTab.jsx` | **Reverted** to phase 3 (NoteDialog keeps only what the grading page needs). |
| `events/PrivateTestingsList.jsx` | **Deleted.** |
| `text.js`, styles | dae8d00's event-linked strings and styles removed; the new wording from P1–P8; new `src/styles/testing-private.css`; `.ttabs` scrolls sideways at 320 px. |

## 4. Tests

- **`0014_tests.sql`** (one block, rollback, `ALL 0014 TESTS PASSED`, made-up names): catalog (RLS, grants, no anon / registrar, definer + search_path, triggers, checks); locked sessions; Add (every refusal, the copy, price); Edit details (re-price up / down, clears a result, after-day lock); Change day (past, cap, step, No show cleared, Pass refused, unchanged = nothing written); money (Mark paid full / difference / `already_paid` / $0, Undo own 10 s / admin, Edit admin, Change paying-by while owed); Cancel / Restore / Delete (staff vs admin, day ahead, payments kept / removed); grading window × staff / admin; **Move** (payments moved with net preserved and dates kept, No show cleared, Pass refused, withdrawn registration, one batch, Restore refused `moved`, Undo within 10 s / refused after a change); history and no `data:image` in `change_log`.
- `run.mjs` step 15 on the main and the upgrade database, after Finance's step 14 (0011) and before 13g; 0014 applied twice; fresh = upgrade; registrar refusals; the down-script (SETUP §16e) then 13g.
- App: `checks.mjs`, both builds, no preview code in production.

## 5. Order and checkpoints

1. **CP0 — Jeffrey OKs this plan** and the contract's open points (after the independent review).
2. **Build:** **A** database + tests · **B** data layer + mock + checks · **C** screens. Then **security review** (A, B), **design review** of C against P1–P8 at 1280×800, 820×1180 touch, 390×844 touch and 320 wide; fix; re-review.
3. **CP1 — preview walkthrough** (Add, Mark paid, Change day, Grade before / on / after the day with `setToday`, Print, Cancel / Restore / Delete, Move with and without a payment, Undo, the event's Removed row).
4. **CP2 — production database** (Jeffrey's OK): paste 0014; fingerprints = PGlite, security advisor, tests pass. The live site keeps working (it never reads the new tables).
5. **CP3 — real-database check** from the local app: one private testing added and one moved from a **Closed** TEST event (with a payment), a top-up, grading on a private day = today, Cancel, Delete; delete the TEST event; read-only check that all is logged and gone.
6. **CP4 — deploy** (Jeffrey's OK): Main merges `color-belt` → `main`, push; live smoke check.
7. **Rollback:** push the previous `main`; 0014 can stay (new tables unused). Down-script only with Jeffrey's OK, before real private testings exist.
8. **Housekeeping:** status, rulebook (icon-map rows `ti-calendar`, `ti-school`, `ti-calendar-x`, `ti-arrow-right`), `docs/README.md`, handoff §9, claude.ai copies; tell **Finance** (private payments live in `testing_private_payments`; a move writes event-side reversals dated on the original day — a transfer, not a refund: sum net amounts, pair them by `moved_from_payment_id`; `0011_finance.sql` must stop hard-coding “not private” for Color Belt) and **Star** (its private build can reuse the shape).

## 6. Questions for Jeffrey

None open for the product: v0.401–v0.403 decided everything drawn. The contract lists small points the drawings don't answer, each with a proposed default (contract §10), for the CP0 OK.

## 7. Risks

| Risk | What we do |
|---|---|
| The move loses or doubles money | One transaction; reversal + payment per live payment, same amount and date; tests check event net 0, private net = old net, both logged under one batch. |
| A moved student restored onto the event while their private testing exists | The database refuses Restore (`moved`); the screen grays it with the reason. |
| Many live functions replaced (the old plan's risk) | Only `testing_restore_student`; everything else is new objects. |
| Children's names in the history | Same as every testing record today (`change_log`, staff-only); nothing else personal is stored. |
| Re-run hazards | 0014 header + SETUP §16: re-run 0005 → 0010 → 0014; re-run 0010 → 0014. |
| Two branches claim the same migration number | 0014 re-checked on every branch at build time. |

## 8. Changes from reviews

**Independent review of the rewrite (2026-10-19): 0 critical, 0 high; all applied** (details in the contract §9).

| # | Change |
|---|---|
| M1 | The view computes the owed amount itself (the helper is granted to nobody). |
| M2 | A moved-in payment can't be undone by staff with the 10-second payment Undo; Undo move recreates event payments without a “recorded by” login. |
| M3 | The Undo-move window counts from the registration's `withdrawn_at`, so the tests can backdate it. |
| M4 | Edit details keeps a class / belt that was removed from Classes and ranks unless another belt is picked. |
| M5 | **Decided v0.404:** Move uses today's private price from Classes and ranks (the event's copy only if the rank is gone). |
| M6 | **Decided v0.404:** the desk may Move any time, also after the testing day (clears a No show, logged). |
| M7 | More negative tests: other-school rank, reversed pairs, overpaid move, the moved registration against the live functions, event delete after a move, guards, immutable columns, truncate, payment-id arrays, staff Restore → `moved`, Undo after an edit. |
| M8 | Closing the grading page lands on the Private testing tab; the address tidy-up accepts it; another school closes it; NoteDialog's hint prop kept. |
| L1–L11 | Undo refused after a cleared No show; duplicate re-check; id-array check; one move per event payment; Change how they'll pay only without Pass / Not passed; extra fingerprint / step-order checks; delete warning for moved ones; overpaid example; Finance note; `movedTo` status. |
