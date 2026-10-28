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
- **BB8** — a history reader for Black Belt's `change_log` rows (model: Star's `star_candidate_history`). It never returns what the logs mask (date of birth, email, signature), checks `has_data_access()` first, returns `{status: …}`. The preview store gets a change log too. The screen line waits for M7.
- **BB13** — `bb_time_is_valid` (0016) widened from 15-minute to 5-minute steps (the range stays 6:00 AM–10:00 PM), with the app's copies of the rule and the tests that expect "10:10" refused. The time list itself waits for M8.

**A check to run in the preview (no build unless it fails):** the walkthrough's "Black Belt keeps showing after opening Color Belt testing until a reload" (`Testing.jsx`'s old `blackBeltOpen`). It should be gone since C2.

---

## 2. The screens to draw (one mockup per screen, at 1280×800, 820×1180 touch, 390×844 touch, 320 wide)

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

## 4. Order (proposed)

1. Screens A–D (the ⋯ menus and their boxes: BB3, BB9, BB6), drawn and OK'd one at a time, then built and reviewed together.
2. Screens E–F (BB4, BB5).
3. Screens G–I (BB11, BB12, BB17), small.
4. The two questions whenever they fit.
5. The database half alongside: design, number from Main, build, tests, security review; the paste only with Jeffrey's OK.

Each step: build in preview mode, design reviewer (rulebook + the OK'd mockups, four sizes), code reviewer, `npm run build` + `build:preview-mode` + the check files, commit on `black-belt`, no push.
