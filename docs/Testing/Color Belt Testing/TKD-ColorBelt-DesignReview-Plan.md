# Color Belt — Design Review changes (CB1–CB19): plan

What: the order Color Belt builds the design review's 19 changes, what each touches, and what waits.
Why: the brief (`docs/Design Review/End review/Prompts/3-ColorBelt.md`) asks for a short plan shown to Jeffrey first.
Started 2026-10-28. Rules: mockups first (1280×800, 820×1180 touch, 390×844 touch, 320 wide), Jeffrey OKs one
screen at a time, rulebook rows from 0.400–0.499 (next free 0.413), reviewers before each commit, no push.

## Now (no Dashboard core shared parts needed)

| Screen (one mockup each) | Items | Files | To settle with Jeffrey |
|---|---|---|---|
| 1. Private testing tab | CB3 first half (Edit payment → "Payment changed" + Undo, also the event roster), CB4, CB6, CB8, CB15, CB17 | `private/PrivateTestingTab.jsx`, `PrivateRows.jsx`, new summary (from `event/StudentDialog.jsx` view mode), `event/EventPage.jsx` (CB3, CB15), `event/ResultButtons.jsx` (CB15), `testing-private.css` | Does Change day or time get "Changes saved" + Undo too? |
| 2. Dates in dialogs | CB11 | `events/EventDialog.jsx`, `private/DayTimeFields.jsx`, `event/PaymentDialogs.jsx` | Keep the weekday line under each field? First/last allowed day per field |
| 3. Both | CB13 (+ D5) | `Testing.jsx` (shared file), new Both summary replacing `BlockedOnBoth.jsx` | Private testings in the boxes? Words when a school has none? Phone layout |
| 4. Grading: Print results, "Passed" | CB18 part 1 | `event/GradingTab.jsx`, `text.js`, new results sheet (from Star's `StarResultsSheet.jsx`), `GradingSheet.jsx`, `PrivateSheet.jsx` | A page per class or per testing group? |

Build checks from the reviewed brief (Part 1): after Edit payment and its Undo, Finance's Daily report for that day
still shows the right payments. CB18's CSV button waits for the migration; the screen-only steps can merge first.
Mockup 1 (private testing tab) is in `Design Review mockups/screen1/` — waiting for Jeffrey's OK.

## Database half — one migration (number via Main), planned now, separate security review

- CB18 part 2: admin-only results CSV (model `star_results_csv` + download log). Columns shown to Jeffrey first.
- CB7: history readers for registrations and private testings (model `star_candidate_history`).
- CB1: Mark paid with a way to pay — new arguments while the live site still calls the 2-argument versions.
- One migration or three: decide with Jeffrey.

## Waits for Dashboard core step 1 (M1–M11 on main)

CB1 and CB7 screens, CB2, CB3 second half (Undo payment asks first), CB5, CB9, CB10, CB12, CB16, CB19.
CB14 waits for a joint plan with Dashboard core's M15, agreed through Jeffrey.
