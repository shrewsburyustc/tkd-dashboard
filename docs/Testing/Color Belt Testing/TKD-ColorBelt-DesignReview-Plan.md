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

## Database half — migration 0030 (reserved by Main 2026-10-28), separate security review

SETUP section "## Migration 0030: …", PGlite step `step0030`. Check while designing CB1: the new way-to-pay
value must land where Finance's read functions (0018, 0026) read how a Color Belt payment was paid — or tell Finance.


- CB18 part 2: admin-only results CSV (model `star_results_csv` + download log). Columns shown to Jeffrey first.
- CB7: history readers for registrations and private testings (model `star_candidate_history`).
- CB1: Mark paid with a way to pay — new arguments while the live site still calls the 2-argument versions.
- One migration or three: decide with Jeffrey.

## Part 2 (started 2026-10-29; Dashboard core step 1 is on main, 0030 is live)

**Copy Star first.** Star settled the same questions on the same shared parts in v0.518 (Mark paid box: amount
worked out by the database, shown not typed, date today, "Mark paid $X" focused; receipt: payment lines without undone
payments or their reversals, "Testing fee" on each, Total due · Paid to date · Balance, "Printed … by [name]" from
`get_my_profile` when it opens, hidden while Hide private details is on; History: one entry per edit, amber bar with
Retry on a failed load; confirm boxes: busy words, failure notes that say the verb). Color Belt uses those answers and
asks only what is its own.

| Mockup | Items | Files | Color Belt's own questions |
|---|---|---|---|
| P1. Event roster | CB1 Mark paid box, CB3 second half (Undo payment asks first), CB2 Print receipt in ⋯, CB9 count cards | `event/EventPage.jsx`, new `event/…Receipt` builder (from `lib/star/candidatesReceipt.js`) | none expected |
| P2. Private testing tab | the same four; CB9's cards start filtering (Paid / Not paid) | `private/PrivateTestingTab.jsx`, `PrivateRows.jsx` | the Paid card's amber "1 owes more" (shared note is gray); the filter with Upcoming / Past |
| P3. Summaries + receipt | CB7 History line, CB2 Print receipt button, the receipt itself | `event/StudentDialog.jsx`, CB6's private summary | receipt for a private testing with a top-up, and after Move to private |
| P4. Part swaps (one sheet) | CB5 (leave warnings swap; Keep rank · Delete rank, Keep class · Delete class), CB19, CB10 (+ Download QR code), CB12 | the files named in the brief | none: all decided (v1.008, v1.102, v1.106, v1.109) |

**P1 approved 2026-11-03** (Jeffrey: "OK as drawn"; `Design Review mockups/p1/p1.png`). Nothing new decided, so no
rulebook row.
P2 answers (one rulebook row when both are in): **Q1 (2026-11-03): B** — "B: gray": the Paid card's "1 owes more" note
is gray like every card note (shared CountCards unchanged); the row's amber "⚠ Paid $X · $Y more to collect" line stays. **Q2 (2026-11-03): A** — a Paid / Not paid filter stays on when switching Upcoming / Past (as the event
roster's class switch); a side with nobody left says "Every past private testing is paid." **P2 approved → rulebook v0.420.**

No mockup (nothing visible): the imports (v1.030) and CB16 (`formatMoney`).
Build order after the OKs: imports + CB16 → P4 → P1 → P2 → P3, each reviewed (design, code; security where 0030's
functions are called) and committed on its own. 0030 is live, so steps that call it can merge.
CB14 waits for a joint plan with Dashboard core's M15, agreed through Jeffrey.
