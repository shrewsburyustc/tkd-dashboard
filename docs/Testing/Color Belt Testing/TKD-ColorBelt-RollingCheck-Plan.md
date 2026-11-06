# Color Belt — plan for the rolling check's fixes (pass 1 + pass 2 + v0.638)

What: every item the design review's rolling check gave Color Belt, grouped into build steps, with files, mockups and the database.
Why: pass 1 (`docs/Design Review/Rolling check/Pass 1/Notes-ColorBelt.md`), pass 2 (`docs/Design Review/Rolling check/Pass 2/Fix-ColorBelt.md`) and rulebook v0.638 (Date signed, pass 2's L-08) all ask for a plan first. Nothing is built before Jeffrey OKs it.
Status: **2026-11-06, Jeffrey: "Pass 2 fixes first".** These steps come before CB14, whose plan (`TKD-ColorBelt-CB14-BuildPlan.md`) waits at its step 1. Order: B (words) and A (migration, once Main gives the number) start now; C one mockup at a time; D after Dashboard core.

## Step A — one migration (needs a number from Main, a security review, and Jeffrey's paste)

Three database fixes in one migration, so Jeffrey pastes once:

| Item | What changes |
|---|---|
| **M-01 = C-01** (pass 2; corrects pass 1's R1-02) | New column: the family form's own Paying by on the registration (Camps 0033's `paying_by_on_form`), set once by the form and never changed. Move to private testing carries it, and Undo move carries it back. Existing form rows take it from their change-log insert row; with no insert row it stays empty, which reads "at the desk". The roster and the Private testing tab say "… on the form." only while Paying by still equals it, otherwise "… at the desk." A missing value means "desk", not "form" (unlike Camps). Planned with Star's R1-02 (its 0038): if the two share one helper in `src/lib/`, that's Dashboard core's call, so Jeffrey asks. |
| **R2-02** (pass 1, High) | Edit event's Undo becomes one database step (model: 0032's `bb_undo_cycle_edit`, Star's `star_undo_event_edit`). |
| **R1-01** (pass 1, High) | Each payment stores the desk that took it (Star 0038's pattern: a new input with a default, so the live app keeps working). Finance reads it afterwards in its own migration. |

Includes: the fake twin in `src/lib/mockTestingEvents.js`, a SETUP section, `step00NN`, a tests file and a fingerprints file, and the PGlite run. The order is: migration live, then the app push.

## Step B — words only (no mockup: no change to how anything looks)

- **C-02:** the Mark paid button's screen-reader name becomes "Mark paid for [Name]" (Star's words).
- **C-05 (c):** "No past events yet." / "No past private testings yet."
- **C-06 (a, b):**
  - "[Name] wasn't marked paid. Check the connection, then retry." Camps re-exports it, so the report lists it.
  - The Undo payment box says "Undo didn't save. Check the connection, then retry."
- **R4-13:** "Ask an admin to open it."
- **R2-07 (open words):** reopening registration says so.

## Step C — screen changes (mockups first, at the four sizes, one screen at a time)

| Item | Screen | Mockup shows |
|---|---|---|
| **M-06** | Grading tab: Print results and its sheet go (v1.052). Keep the bar's own CSS rules. | The class switch line without Print results, as admin and as staff |
| **C-03** | Private testing summary: one line per payment, oldest first | Ava Chen paid in two parts |
| **M-02** | History: one save = one entry ("Payment recorded …; Paying by changed …") | After a Mark paid by another way, and after its Undo |
| **M-03** | Print receipt on a removed student or a cancelled private testing that has money | Where it sits, and who gets it (staff see no ⋯ there today) |
| **C-04** | A line between Restore and the red Delete permanently | The two ⋯ menus |
| **C-05 (a)** | No four zero cards until the event has a registration | A new, empty event |
| **R3-10, R3-02** | The duplicate box goes above the cards; possible duplicates stay out of the counts | The roster with a possible duplicate |
| **R2-03** | Undo after restoring a Duplicate copy | The toast |
| **R4-06** | Family-page text weight 600 → 500 | Before / after of the family page |
| **v0.638 (L-08)** | The family form's Check step gets **Date signed** (today, gray, can't be changed), using New students' box (`.fsigned`, `src/screens/forms/FormFields.jsx:449–457`). Staff see the date wherever the signature shows: the student summary's "Signed by" line, e.g. "Parent or guardian, on the form · Nov 2". | The Check step and the summary |

**v0.638's database check is done: no migration.** The form already saves the day it was sent (`testing_registrations.signed_at`, 0005), and the roster read already returns it (`eventsApi.js:57`). **Question for Jeffrey, when this step comes:** who moves the two words ("Date signed", "Filled in automatically with today's date.") from `src/screens/forms/text.js` to the shared `src/components/text.js`: Color Belt (a shared file, listed), New students, or Dashboard core?

## Step D — after Dashboard core's shared fixes land on main

- R1-06 (Undo payment box words), R1-07 (payment and history words, plus C-07 (a)'s "Paying by: Cash → Check")
- R2-05 (queued Undo), R2-07 (shared words, plus C-06 (c): a failed Undo of Close / Open registration)
- R3-06 (back links), R1-08 (Mark paid grays while saving), L-06 (grips gray while saving: checked in Settings after CB14)
- **L-02:** below the tablet width, the roster uses the phone layout once the room beside the panel is too narrow (v1.053). The mockup shows 683 and 700 wide, with Standard and Largest.
  **Settled 2026-11-06: Jeffrey chose B, "B: shared code" (rulebook v1.130, on dashboard-core).** No container query (on Chrome/Edge before 129 and Safari before 18.4, a page-area container moved in-page pop-ups 72 px right and 48 px down). Instead:
  - Dashboard core's shared hook `usePageRoomBelow(px)` says when the room beside the panel is below the roster's own limit;
  - the roster then draws its phone layout (`isPhone` for the roster only, `event/EventPage.jsx` → `event/RosterRows.jsx`) and sets a class;
  - the tablet rules (`testing-events.css`, `@media (min-width: 640px) and (max-width: 1023.98px)`) follow that class instead of `@container page`;
  - dialogs and ⋯ menus keep following the window.
  **Build only after Dashboard core's part is merged into main** (Main says when). Mockup first: the roster at 683 and 700 wide, with Standard and Largest.

## Checks only (record in the status file)

R2-10, R1-03, R4-07 and pass 1b's Not paid icon all pass on main (pass 2, reviewer C). Nothing to build.

## Each step

- Reviewers: a separate design reviewer (rulebook, mockups, four sizes, §4's six WCAG checks), a separate code reviewer, and a security reviewer for step A.
- `npm run build`, `npm run build:preview-mode`, `src/lib/testing/checks.mjs` and `src/lib/shared/checks.mjs` must pass.
- New rows only for Jeffrey's decisions, from 0.428 on.
- Commit on `color-belt`, no push. Then report to Main, listing any Camps re-exported words.
