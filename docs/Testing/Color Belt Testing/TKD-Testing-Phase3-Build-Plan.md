# Color Belt testing — Phase 3 build plan: the Grading tab

**Written:** 2026-10-18 (branch `color-belt-phase3`, worktree `zen-allen-e41a06`) · **Status:** independently reviewed (§8); plan questions answered (§6); waiting for Jeffrey's OK (CP0). Nothing is built, applied or pushed.
**Built from:** rulebook rows v0.180–v0.190 (questions 1–10 + approved mockups) · mockups `TKD-ColorBelt-Grading-Mockups.html` (G1–G8) · the live phase 2 code and migration `0005_testing_events.sql`.
**Deadline:** the first real Color Belt testing day on the new system is in **November 2026** (v0.180). Phase 3 must be live, and rehearsed on a TEST event, **at least one week before** that day. If it isn't, that event is graded on a hand-made paper list and an admin types the results in once phase 3 is live (see §7).

---

## 0. Scope

**In:** the **Grading** tab on the event page (G1–G7): results Pass / Not passed / No show (v0.181), the gray Not paid tag (v0.183), the optional 200-character note (v0.185), the before / on / after the testing day rules (v0.186), last change wins (v0.187), Not saved + Retry without an offline queue (v0.188), Print grading sheet (v0.189), the all-classes count line and opening on the class testing now (v0.190). The Students tab changes in G8: Result line in the detail view, delete warnings, and a belt / class change clearing a result (admin-only after the testing day).

**Out (later, separate decisions):** printed results / certificates, student rank history (needs a Students section), the instant Realtime ping (v0.157 B — its own step; this plan doesn't block it), private testing (phase 4).

## 1. Database — migration `0010_testing_results.sql`

Number: next free after checking **every branch and worktree** at build time (claimed today: 0005 Color Belt phase 2 · 0006 Star · 0007 Schedule · 0008 Calendar · 0009 Forms → **0010**). Follows handoff §6 and the 0005 patterns exactly.

**Rule for this migration: no existing function changes its arguments.** The live phase 2 site keeps working between "0010 applied" and "phase 3 deployed".

### 1.1 New table `public.testing_results`

| Column | Notes |
|---|---|
| `registration_id uuid primary key` | FK → `testing_registrations(id)` **on delete cascade** (deleting a student or an event removes the result). |
| `result text null` | check in (`'pass'`, `'not_passed'`, `'no_show'`); null = not recorded yet. |
| `note text null` | ≤ 200 characters, trimmed, empty → null; invisible / control characters refused (same rule as names — keep DB, `names.js`, mock in sync). |
| `updated_at timestamptz`, `updated_by uuid`, `updated_by_name text` | who / when, for the G8 "Nov 20, 5:41 PM by Staff" line. `updated_by` is **not** granted to the app. |

- A row exists only while `result` or `note` is set; clearing both deletes the row.
- **Why a separate table:** results don't touch `testing_registrations.version`, so a grader's tap never makes the desk's Mark paid / Edit details "stale" (and v0.187 needs no version on results).
- RLS on; policy `to authenticated using ((select public.has_data_access()))`. Explicit `revoke all … from public, anon, authenticated, service_role`; **column-level select** to `authenticated` on everything except `updated_by`. No insert / update / delete grants. Nothing to `anon`, nothing to `testing_registrar`.
- Logged by its **own trigger function `testing_results_log()`** (written like `testing_registrations_log`), because the shared `change_log_write()` needs an `id` column; it sets `record_id = registration_id` so a student's history joins straight to the result. `tkd.action` is set by the functions.
- Hygiene like every 0005 table: a `no_truncate` trigger; a check that `result` or `note` is set (`num_nonnulls(result, note) > 0`); `registration_id` can never change; a before-write trigger stamps `updated_at`, `updated_by`, `updated_by_name` (as 0005 does) so the stamps never depend on each function.
- Note text uses 0005's existing `testing_line_is_valid(…, 200)` / note-normalizing helpers, not a new rule.
- **“Graded”** (for the locks in §1.3) means a result row exists — a result **or** a note.

### 1.2 New staff functions (security definer, `set search_path = ''`, fully qualified, granted to `authenticated` only)

`testing_set_result(p_registration_id uuid, p_result text) returns jsonb` — `p_result` null clears it.
`testing_set_result_note(p_registration_id uuid, p_note text) returns jsonb` — null / blank clears it.

Check order (0005 pattern): `has_data_access()` → `no_access` · input → `invalid` · `testing_lock_registration()` (school → event → registration) → `not_found` · registration `withdrawn` → `withdrawn` · **date rule** with `testing_today()` (America/New_York): before `testing_date` → `not_open`; after it and not `is_admin()` → `finished`; admins always allowed after · write with `tkd.action` = `set_result` / `set_result_note` · return `{status:'ok', result, note, updated_at, updated_by_name}`. Same exception block as 0005 (deadlock / serialization → `stale`, constraint → `invalid`). **No expected-version argument** (v0.187: last change wins).

### 1.3 Changed existing functions (same arguments, new rules)

- `testing_update_student`: if the **rank or class changes** and the student is graded → the result row is deleted in the same transaction, logged as its own action **`clear_result`** under the same batch id; **after the testing day only an admin** may change a graded student's rank / class (`not_allowed`). Name-only edits stay as today.
- `testing_resolve_duplicate` (“keep one”, which staff can do today): returns `not_allowed` if the copy being withdrawn is **graded, after the testing day, and the caller isn't an admin**. Closes the path “rename a graded student to match someone → keep one → the graded student disappears from Grading”.
- `testing_restore_student`: its staff branch (10-second undo of a duplicate copy) gets the same graded + after-day condition.
- `testing_add_student`: after the testing day, **admins** may add a student (staff still get `finished`) — v0.191. Same arguments.
- `testing_withdraw_student`: **no change** — it is already admin-only.
- `testing_update_event`: refuses a **date change while any result exists** (new status **`has_results`**, mapped in Edit event: “This event already has testing results, so its date can't change.”). Otherwise moving a finished event to today would reopen grading. (Unticking a class is already refused by `not_empty`.)
- `testing_delete_student`, `testing_delete_event`: **untouched** (same body, same fingerprints). Results go by cascade and are logged under their existing `tkd.action`. The G8 warnings are worded in the app from loaded data. Accepted small risk: a result recorded in the seconds between opening the warning and confirming is deleted without being named (admin-only, rare).
- All date checks read `testing_date` **after** `testing_lock_registration` has locked the event row, so they line up with `testing_update_event`, which locks the same row.
- Replaced functions get new fingerprints → `0010_fingerprints.sql` covers the new and replaced functions and `testing_results_log`. Fingerprint and test SQL must not contain the words that make the Supabase connector cancel a query (spell function names in pieces, as `0005_fingerprints.sql` does).
- **Re-running 0005 after 0010 would put back the old functions without the grading locks.** 0005's header and SETUP get a warning: after 0010 exists, re-run 0005 only together with 0010 right after it.

### 1.4 Read path

`loadEvent` adds one more chunked read: `testing_results` (granted columns) for the event's registration ids, merged into each roster row as `result`, `note`, `resultAt`, `resultByName`. Same 15-second refresh (v0.157).

## 2. Data layer and preview mock

- `src/lib/testing/eventsApi.js`: `setResult(id, result)`, `setResultNote(id, note)`; status → message mapping (`not_open`, `finished` → “Too late to change. Only an admin can change results now.”, `withdrawn`, `no_access` …).
- `src/lib/mockTestingEvents.js`: the `testing_results` store, both handlers, the date rule using the preview's `setToday`, the update-student clearing rule, `GRANTED` / `HIDDEN` for the new columns, `RPC_ARGS`. `src/lib/testing/checks.mjs`: mock = DB rules (results, note length, date rule, clearing).
- Preview helpers to rehearse a testing day: `__tkdPreview.setToday('2026-11-20')` (exists), `failNextSave()` (exists) — plus `failSavesUntilRetry()` to simulate a dropped Wi-Fi for G5.

## 3. Front end (staff screens)

| File | Change |
|---|---|
| `src/screens/testing/event/EventPage.jsx` | Real tabs **Students \| Grading** (roving tabindex, arrow keys); header buttons on both tabs; tab kept in the address `#testing/event/<id>/grading` so Back / refresh keep it (touches **`src/App.jsx`** route parsing — shared file). |
| `GradingTab.jsx` (new) | G1/G3/G4/G7: all-classes line, class switch (opens on the class testing now on the testing day), class line + Print button, count line, rows, lock lines, empty states. |
| `ResultButtons.jsx` (new) | The 3-button toggle group (`role="group"`, `aria-pressed`, 44 px on touch, tap again clears), saving / Not saved states, read-only tags. |
| `useGradingSaves.js` (new) | Optimistic saves: at most one save in flight per row, then the latest choice; pending / unsaved per row, Retry all, page-level banner naming classes, amber mark in the class switch, the 15-second refresh skips saving / unsaved rows and refreshes once after a save, polite “Saved / Not saved” announcement. |
| `NoteDialog.jsx` (new) | G2 on the shared `Dialog.jsx` (phone full screen; unsaved-changes pattern; 200 counter; failure keeps it open). |
| `GradingSheet.jsx` + print CSS (new) | G6: print-only markup, `@media print`, page per class, repeated header, two “Added on the day” rows, no payments / notes; `window.print()`. |
| `StudentDialog.jsx`, delete dialogs | G8: Result line in view mode; warning before a belt / class change clears a result; admin-only message after the testing day; delete wording with results. |
| `src/screens/testing/text.js`, `src/styles/testing.css` | All new wording from the mockups; Grading styles (No show solid gray + dark border; Not paid / Not saved tags). |

Shared files touched (list them in the summary): `src/App.jsx` (route), possibly `src/lib/mockClient.js` (one new helper). Not touched: `navItems.js`, `tokens.css`, `Testing.jsx` (unless the route needs it).

## 4. Tests

- **`supabase/tests/0010_tests.sql`** (0005 style, one block, rollback, `ALL 0010 TESTS PASSED`): grants / RLS / no anon / registrar refused; locked, PIN-locked, signed-out and stale sessions can't read or write (0002 style); before / on / after the testing day for staff and admin; withdrawn refused; each result value, clear, tap-again; note length 200 / 201, blank → cleared, invisible characters refused; last change wins; change_log rows and action names, `updated_by` hidden; update-student clears a result and is admin-only after the day when graded; withdraw / restore / resolve-duplicate rules; delete student / event cascade the result; catalog checks (security definer, search_path, no defaults, owner) like 0005's function lists.
- `run.mjs`: a step 12 applies 0010 on top of 0005 (fresh and upgrade databases), re-runs the 0005, 0003, 0004, 0002 and PIN **test files** (never the 0005 SQL itself), applies 0010 twice (fingerprints unchanged), checks fresh = upgrade fingerprints. **0005's own tests must still pass after 0010** (or the few that test replaced behavior are updated and listed).
- App: `npm run build` and `npm run build:preview-mode` pass; `checks.mjs` passes; no preview code in production.

## 5. Order and checkpoints

1. **CP0 — Jeffrey OKs this plan.** Then a short contract `docs/Dashboard Docs/Build contracts/CONTRACT-0010.md` (exact names, statuses, wording) so builders work in parallel without guessing.
2. **Build** with separate builders: **A** database + tests (`0010_*`, `run.mjs`, SETUP §13) · **B** data layer + mock + checks · **C** screens (after B's interface is fixed in the contract). Then **security review** (A, B), **design review** of C against G1–G8 with screenshots at 1280×800, 820×1180 touch, 390×844 touch and 320 wide, fix round, re-review.
3. **CP1 — preview walkthrough** with Jeffrey (`npm run dev:preview-mode`, `setToday` to rehearse before / on / after the testing day, Wi-Fi failure, printing). Commit on `color-belt-phase3`.
4. **CP2 — production database** (Jeffrey's OK): Jeffrey pastes `0010` in the SQL Editor; read-only checks: fingerprints = PGlite, security advisor, `0010_tests.sql` and the earlier test files all pass. The live site keeps working (no signature changes).
5. **CP3 — real-database check** from the local app: a TEST event dated **today**, two students, grade, note, clear, print, admin after-day rule via a second TEST event dated yesterday (edit check), delete both; read-only check that everything is logged and gone.
6. **CP4 — deploy** (Jeffrey's OK): Main merges `color-belt-phase3` → `main` (rulebook renumbering if needed), push → Cloudflare Pages. Live smoke check on a TEST event.
7. **Rollback:** the screens can be reverted by pushing the previous `main`; 0010 can stay (nothing reads it then). A down-script is written with the migration but only used with Jeffrey's OK.
8. **Housekeeping:** status file, rulebook (build changes), `docs/README.md`, handoff §9, claude.ai copies.

## 6. Questions for Jeffrey (one at a time, before CP0 or at it)

1. ~~**Walk-ins after the testing day**~~ **Decided 2026-10-18 (v0.191): admins can add a student after the testing day; staff can't.** (review finding 3): today `testing_add_student` refuses everyone after the testing date, admins included. So a student written on the sheet's “Added on the day” rows, or a whole paper-graded event (§7), can't be entered later. Let **admins** add students after the testing day (staff still can't)? Or keep it and make “type it in the same day” a hard rule?
2. **The exact date** of the first real testing day in November — **not set yet (Jeffrey, 2026-10-18).** Checkpoints get dates once it is; CP4 stays at least a week before it.

## 7. Risks

| Risk | What we do |
|---|---|
| Not live in time for the November testing day | Start right after CP0; CP4 ≥ 1 week before. If it slips: that day is graded the old way on paper and typed in by an admin once live (v0.186 lets admins enter after the day). |
| Wi-Fi at the mat | Not saved + Retry (v0.188); print the sheet the day before (v0.189). |
| Graded on the wrong day because a device's clock is wrong | The database decides with its own clock in school time; the screen only mirrors it. |
| Not paid shown on the mat (v0.183 exception) | Only the fact, never amounts; recorded as an exception so reviewers don't “fix” it. |
| 0005 tests / fingerprints change because of replaced functions | Listed in 0010's notes; the CP2 checks compare against a fresh PGlite run. |
| Children's names on printed sheets | No payments or notes printed; staff keep / shred sheets like other school papers. |
| Desk corrects a belt on the testing day while a grade arrives (results don't bump the registration's version) | Edit details re-reads the student's result just before saving and shows the “clears the result” warning then; the remaining seconds-wide race is accepted. |

## 8. Changes from the independent review (2026-10-18)

| # | Severity | Change |
|---|---|---|
| 1 | Critical | `change_log_write()` needs an `id` column → `testing_results` gets its own `testing_results_log()` trigger (§1.1). Without it every save would have failed. |
| 2 | High | Staff could remove a graded student after the day through rename → possible duplicate → “keep one”. `resolve_duplicate` and restore's staff branch now refuse that (§1.3); a test covers the path. Withdraw was already admin-only. |
| 3 | High | Nobody (not even admins) could add a student after the testing day → Jeffrey: admins can (v0.191, §1.3). |
| 4 | High | Moving a graded event's date would reopen grading → `update_event` refuses a date change while results exist (`has_results`, §1.3). |
| 5 | Medium | Belt-change race on the testing day → re-read the result before saving (§7). |
| 6 | Medium | Re-running 0005 would undo 0010's locks → `run.mjs` step 12 re-runs 0005's **test files only**, never the 0005 SQL; warning in 0005's header and SETUP; step 12 proves 0010's fingerprints still hold after re-applying 0010 (§1.3, §4). |
| 7 | Medium | Table hygiene: no-truncate trigger, “result or note” check, fixed `registration_id`, stamping trigger (§1.1). |
| 8 | Medium | Two quick taps could land out of order → `useGradingSaves` keeps at most one save in flight per row and then sends only the latest choice; `stale` (deadlock) shows as Not saved (§3). |
| 9 | Medium | Missing decided rules now listed in §3/§9 below: Withdraw keeps the result and Restore brings it back; withdrawn students are hidden on Grading, left out of the counts and off the printed sheet; the sheet prints only classes with students; a `finished` refusal reloads the page; staff see “Only an admin can change this student now. Their result is locked.”; “graded” = result or note. |
| 10 | Low | The delete functions are untouched, not “changed” (§1.3). |
| 11 | Low | Clearing a result by a belt change is logged as `clear_result` (§1.3). |
| 12 | Low | Note validation reuses 0005's helpers (§1.1). |
| 13 | Low | Date checks read `testing_date` after the event row is locked (§1.3). |

## 9. Screen rules the builders must not miss (from v0.186–v0.190 and G1–G8)

- Withdraw keeps the result; Restore brings it back. Withdrawn students are hidden on Grading, not counted, not printed.
- Print grading sheet: only classes with students; page per class; header repeated; two “Added on the day” rows; no Grader line; no payments, notes or Not paid.
- A `finished` answer from the database reloads the page into the read-only view with “Too late to change. Only an admin can change results now.”
- Staff trying to change a graded student after the day: “Only an admin can change this student now. Their result is locked.”
- `useGradingSaves`: one save in flight per row; then the latest choice; Retry repeats absolute values.
- Admin adding a student after the testing day (v0.191): Add student works for admins on a finished event (staff keep the “finished” message); the row shows “Added <date> by <name> (admin)” on Grading and Students.
