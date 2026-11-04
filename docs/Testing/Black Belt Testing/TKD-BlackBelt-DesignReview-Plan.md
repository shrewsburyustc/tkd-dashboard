# Black Belt testing — plan for the design review's ready-now items

**Started:** 2026-10-28 · **Sources:** Change list §2.4 (BB1–BB20), the Design Review session's split and draft brief (2026-10-28, `Prompts/5-BlackBelt.md`, still under review), rulebook v1.000–v1.034.
**Status:** plan only. Nothing drawn or built yet. Jeffrey OKs this plan, then each screen's mockup one at a time, then code.

**Ready now** = needs nothing from Dashboard core (the shared parts M1–M11, not on main yet). **Waits on Dashboard core:** BB1, BB2, BB7, BB10, BB14, BB15, BB19, and the screens of BB8 and BB13. **Nothing to build:** BB16; BB18 is done (CP6 checklist in the status file).

---

## 1. The items

| # | What changes | Files (all Black Belt's own) | Size |
|---|---|---|---|
| BB3 | The roster row ⋯ gains **Edit payment** and **Undo payment** (admins), acting on the **latest** payment, grayed with the detail's reasons (returned check, recorded refund). Older payments stay on the payment line's ⋯ in the detail. Undo asks first (Black Belt's own box until M2) and **names the payment**: today a card payment covering three installments is titled "Undo payment 1 + Payment 2 + Payment 3?". The row has no payment lines, so the ⋯ loads the candidate the way the detail does. | `staff/candidates/CandidatesTab.jsx`, `useCandidateActions.js`, `UndoPaymentDialog.jsx`, `staff/text.js` (`undoPaymentTitle`) | M |
| BB9 | **One ⋯ order** (Color Belt's three groups, v1.011). Row: Edit details · Change plan or Kukkiwon — Edit payment · Undo payment · refunds · Print receipt — Withdraw · Delete permanently. Detail: Edit details · Change plan or Kukkiwon — Withdraw · Delete permanently (money stays on each payment line). Items that don't apply are left out. | `CandidatesTab.jsx`, `CandidateDialog.jsx` | S |
| BB6 | "Remove candidate" and its choice box become **two items**: **Withdraw** (plain, at once, Undo toast as today) · **Delete permanently** (red, asks first; grayed with its reason while there are payment records (v0.904) or grades (v0.950)). Row ⋯ and detail ⋯. Black Belt's own confirm box until M2. | `CandidatesTab.jsx`, `CandidateDialog.jsx`, `RemoveDialog.jsx`, `staff/text.js` | S |
| BB4 | **Refusals stay on screen** (v1.004): the refusal toasts move to the amber bar (quick-action refusals, "This candidate was deleted.", the make-up picker's, the rubric locked by grading, "This cycle was deleted."). The grayed **Add candidate** gets a visible gray line saying why (today only a toast when pressed). Results' own offline bar is not touched (M12's open question). | `useCandidateActions.js`, `useMakeupPicker.js`, `cycle/CycleRubricTab.jsx`, `cycle/CyclePage.jsx` | S |
| BB5 | **Undo for 5 seconds** after Edit details, Restore and Add / Edit cycle, only where it can be reversed (a Dan change that cleared grades can't; undoing Add cycle deletes the cycle). | `useCandidateActions.js`, `cycle/useCycleEditor.jsx` | S |
| BB11 | Close / Open registration **lose their lock icons**; the words stay. | `cycle/CyclePage.jsx`, `cycles/CyclesTab.jsx` | S |
| BB12 | **Star's date picker** (`src/components/DatePicker.jsx`) replaces both `DateField` copies: Add candidate, Edit details, Add / Edit cycle, testing day, prices, and the family form's date of birth (copying Star's birthday set-up). | `staff/parts/DateField.jsx` (5 users), `form/DateField.jsx`, `form/StepDetails.jsx` | S |
| BB17 | **"Rubric and prices" → "Rubric and waiver"**: the tab, `TAB_RUBRIC` and every mention (words and comments, about 16 files). The first line stays "Same for both schools. Prices are set on each cycle." Applied migrations keep their comments. | `staff/text.js`, `results/text.js`, `src/lib/blackBelt/startingPoint.js`, comments | S |

**Database half (one migration, number through Main once designed; separate security review):**
- **BB8** — a history reader for Black Belt's `change_log` rows (model: Star's `star_candidate_history`). It never returns what the logs mask (date of birth, email, signature), checks `has_data_access()` first, returns `{status: …}`. Strips login ids (as `star_history_strip`). Its loader in the data layer throws when the status isn't ok (else the shared line would say "no changes yet" for a failure). The preview store gets a change log too. The screen line waits for M7.
- **BB13** — `bb_time_is_valid` (0016) widened from 15-minute to 5-minute steps (the range stays 6:00 AM–10:00 PM), widened in the database and the preview store (`mockBlackBelt.js`, checked in `checks.mjs`); `0016_tests.sql`'s '10:10' becomes '10:07' (refused by both rules, so the tests pass before and after), and the run.mjs step lets 0016's `bb_time_is_valid` fingerprint line move (as `step0023` does for 0006). The app's own rule and the time list change with the screen (M8).

**Migration order:** number from Main (0030 was next free on 2026-10-28). The migration is live (Jeffrey applies it; fingerprints, security advisor, tests on production) before any push that brings an app using it. Screen-only steps can merge first.

**BB3 extra check:** after Edit payment and its Undo, Finance's Daily report for that day still shows the right payments (Finance reads them through 0026).

**A check to run in the preview (no build unless it fails):** the walkthrough's "Black Belt keeps showing after opening Color Belt testing until a reload" (`Testing.jsx`'s old `blackBeltOpen`). It should be gone since C2.

---

## 2. The screens to draw (one mockup per screen, at 1280×800, 820×1180 touch, 390×844 touch, 320 wide; a self-contained HTML file plus one PNG per screen with what changes outlined in amber)

| Screen | Items | Questions for Jeffrey in it |
|---|---|---|
| A. Roster row ⋯ | BB3, BB9, BB6 | Where Record payment goes on tablets and phones (it sits in the ⋯ there, v0.900); recommend first in the money group. |
| B. Candidate detail ⋯ | BB9, BB6 | — |
| C. Undo payment box (from the row) | BB3 | The new title: amount, how, when (e.g. "Undo the $870 card payment of Oct 22?"). |
| D. Delete permanently box + its grayed item | BB6 | — |
| E. Refusals in the amber bar + Add candidate's gray line | BB4 | Where the gray line sits, on the PC and on phones. |
| F. Undo toasts | BB5 | Should the Rubric tab's waiver and keeping-time saves get Undo too? (v1.006 names only Edit details and cycle saves.) |
| G. Cycle page and Cycles list ⋯ without locks | BB11 | — |
| H. Date picker in the dialogs and the family form | BB12 | — |
| I. Rubric and waiver tab | BB17 | — |

## 3. Questions on their own (one at a time, with a picture)

1. **BB20** — the printed results sheet says "Testing days … · Worcester and Shrewsbury" (approved in R05, v0.947); v1.022's one wording is "Both schools". Change the print, or keep it?
2. **"On this device"** — Black Belt says "Hidden on this device", "Payments are hidden on this device." and "Email result is off on this device…"; everyone else says "… on this tablet" (v0.507 asks for the same words on every screen). Switch Black Belt to "this tablet"?

## 4. Order (Jeffrey's call; the Design Review session suggests BB4, BB5, BB6, BB3 + BB9, BB11, BB12, BB17)

1. Screens A–D (the ⋯ menus and their boxes: BB3, BB9, BB6), drawn and OK'd one at a time, then built and reviewed together.
2. Screens E–F (BB4, BB5).
3. Screens G–I (BB11, BB12, BB17), small.
4. The two questions whenever they fit.
5. The database half alongside: design, number from Main, build, tests, security review; the paste only with Jeffrey's OK.

Each step: build in preview mode, design reviewer (rulebook + the OK'd mockups, four sizes, §4's six WCAG 2.2 checks), code reviewer, `npm run build` + `build:preview-mode` + the check files, commit on `black-belt`, no push.

---

## 5. Part 2 + the rolling check's pass 1 fixes (added 2026-11-04)

**Sources:** `docs/Design Review/End review/Prompts/5-BlackBelt.md` Part 2 (BB1, BB2, BB7, BB10, BB14, BB15, BB19) and `docs/Design Review/Rolling check/Pass 1/Fix-BlackBelt.md` (finding ids R1-01 … R4-15). **Status:** plan only; Jeffrey OKs it, then each screen's mockup one at a time, then code.

**Already done since the fix list was written:** R4-03's words ("Hidden on this tablet" etc., v0.974, live); BB8's History on the shared `HistoryLine` (R4-07's first half, live); BB13's time list (live); BB20 (v0.975).

### Step 1 — Privacy at the mat (High; screen only, no database)

| Id | What changes | Files |
|---|---|---|
| R1-04 | With Hide private details on, the row ⋯ and detail ⋯ read the same on every row: Delete permanently and (staff's) Change plan grayed with a desk line that names no payment. | `CandidatesTab.jsx`, `CandidateDialog.jsx`, `text.js` |
| R4-01 | Plan hidden while the switch is on (v1.036): Plan column / phone line read gray "Hidden on this tablet"; Compare's Plan row too; Change plan or Kukkiwon desk-only for everyone; its dialog can't open (and closes if the switch turns on). | `RosterRows.jsx`, `text.js`, `CompareDialog.jsx`, `CandidatesTab.jsx`, `CandidateDialog.jsx`, `useCandidateActions.js` |
| R4-03 (gray) | Hidden values drawn in the shared gray (`.ev-hidden-value`), not black. | `CandidateDialog.jsx`, `CompareDialog.jsx` |
| R4-04 | Work like Star while hidden (v1.037): Add candidate opens its menu (New candidate grayed with Star's reason, Make-up works); Edit details opens with DOB / email gray and Star's hint, staff's Dan grayed on every row "Change the Dan at the desk.", the admin's "already paid" line left out. | `cycle/CyclePage.jsx`, `CandidatesTab.jsx`, `CandidateDialog.jsx` (`EditFields`), `useCandidateActions.js`, `text.js` |

**Screens:** J. Roster and both ⋯ with the switch on · K. Edit details with the switch on · L. Add candidate menu with the switch on.
**Questions in them:** the desk lines' words (recommended: "Delete candidates at the desk." / "Change the plan at the desk."); the History's plan and Kukkiwon lines while hidden (v0.972 keeps them; recommended: hidden too).

### Step 2 — Payments count at the desk's school (R1-01, High; database)

- One migration (number from Main): `bb_record_payment` and `bb_record_refund` take This device's school (blank = today's rule, so the live app keeps working); undo / edit / returned keep copying from the payment they correct (v0.903). Tests, fingerprints, SETUP "Migration 00NN", `step00NN`, security review; Jeffrey applies it before the app that uses it is pushed.
- The app passes This device's school: `src/App.jsx` and `src/screens/Testing.jsx` (shared files) plus the preview store.
- **No screen changes, so no mockup.** Check: a Worcester candidate's payment taken on a Shrewsbury device shows in Shrewsbury's Daily report.

### Step 3 — Part 2: switch to the shared parts (BB15 with BB1, BB2, BB7, BB10, BB14, BB19)

| Id | What changes |
|---|---|
| BB15 | Black Belt's own copies → the shared parts (Dialog, ConfirmBox, CompareDialog + DuplicateBox, CountCards, Receipt, RegistrationLinkBox, Select / TimeList, ChoiceGroup, PaidByField, Grip, usePrivateDetailsHidden, useLiveLoad, formatMoney). Old copies deleted once unused. |
| BB1 | Record payment / Edit payment say **"Paid by"**; Record refund **"Refunded by"** (as Star and Finance). |
| BB2 | The shared receipt; Print receipt only on a row with a payment (as Star). |
| BB7 | Every confirm box: the safe button left ("Keep …"), the action right (red when it loses something), "Deleting…" while it works. |
| BB10 | "Registration link" button in the cycle page header (Star's button); its box is the shared one; 1024-px QR download. |
| BB14 | One money helper; on screen only the Add cycle grid's "12.5" preview changes ("$12.50"). |
| BB19 | Discard: Keep editing left, Discard right and red; the Dan-change box as the shared small box on phones. |
| Small | R3-05 (the "Showing … only" line as the shared inline link), R3-07 (make-up icon `ti-repeat`), R4-11 (Retry on a failed ⋯ read), R4-14 (one sentence for a refused Undo), the clear-search ✕ as the shared `IconButton`, the empty roster's line naming "Add candidate". |

**Screens:** M. Paid by / Refunded by · N. Receipt · O. Confirm boxes · P. Cycle page header (Registration link; how the header fits on phones) · Q. Count cards on phones (2×2) · R. Discard and the Dan-change box · S. the small ones together.
**Questions in them:** the "Keep …" words (Undo Mark as sent, Delete personal details, agreed with Star's S5); whether Black Belt's own looks passed to the shared choice buttons may stay (`bb-segmented--fill` etc.); the phone header's full-width Add candidate (keep or its own size).

### Step 4 — after another session's fix lands

R2-05 (Undo pressed during another save, after Dashboard core), R3-13 ("Past days can't be chosen.", after Dashboard core), R4-07's gray line in every hidden History (after Dashboard core), R4-08 (Email result's grayed look for screen readers, after Star). The "Waits on Jeffrey" items (R3-01, R2-03, R2-04, R1-06, R1-07, R2-07, R3-02, R3-06, R3-09, R3-10, R4-02, R4-06, R4-13 and two more) are asked by the Design Review session; answers reach Black Belt through Main.

**Docs at the next rulebook edit:** R4-15's four "(See …)" notes. **Status-file checks:** the chooser check (passed in the checker's preview), BB3's Finance check after Edit payment + Undo (to run).

**Each step:** mockups OK'd one screen at a time → build in preview mode → design reviewer (four sizes, §4's WCAG checks) + code reviewer (+ security reviewer for privacy and database work) → both builds + check files + Function tests → commit on `black-belt` → report to Main. Never push.
