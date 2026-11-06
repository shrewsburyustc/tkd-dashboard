# Color Belt — fixes from the design review's rolling check (pass 2)

**Paste into:** the Color Belt session.

This file reaches your worktree when `design-review` is merged into main; until then the Design Review session sends its text by message.

**Starter to paste:**

> `git merge main` first. Then read and do `docs/Design Review/Rolling check/Pass 2/Fix-ColorBelt.md`: the fixes the design review's rolling check (pass 2) found in your merged Part 1 and Part 2. Add them to the plan you make for pass 1's notes, after CB14. Plan first. Mockups first for anything that changes how a screen looks. Nothing is built before I OK it.

---

## The brief

The design review's rolling check (phase 1d) looks at each section's design-review work after it merges: against the rulebook, the approved mockups, and the other sections that do the same job. Pass 2 covered what merged into `main` after pass 1's cut (e7fd75b), up to 6b27cdd (2026-11-05), in preview mode at the four sizes. Five reviewers looked (M money, records and privacy · U undo, safety nets, confirms and dialogs · L lists, pickers, forms and layout · P New students' visitor profile and printed sheet · C your Part 1 and Part 2, item by item). Two separate checkers then verified every finding. This file is what they confirmed in your merged Part 1 and Part 2 (84a6e7d: CB1–CB13, CB15–CB19, rows v0.413–v0.426, migration 0030), and in shared problems that reach your screens.

The reviewers found every Part 1 and Part 2 item built as its row and mockup say, and Hide private details holds on every Color Belt screen. The problems below are four Mediums (three about the same person record, and the roster's layout between tablet and phone sizes, which Jeffrey has now decided, v1.053) and smaller things.

- **Fix now:** straight fixes. Plan them, show Jeffrey, then build. An item marked "after [owner]'s [id]" waits until that fix is on main: plan it now, build it after.
- **Waits on Jeffrey:** nothing now. Questions 1–3 of the pass 2 report (`docs/Design Review/Rolling check/Pass 2/Pass 2 report.md`) are answered (v1.053, v1.052, v1.055), so their items are under Fix now.
- **Smaller:** fix them while you're in the file, or record them.
- Each item keeps its finding id (M-01, C-02 …) so Jeffrey can trace it. Use the id in your plan, status file and commits.
- **Line numbers** are main 6b27cdd's (checked 2026-11-05); they may move. Your branch (`color-belt` 46e745b) has the same code where it matters (M-01: checker 1 read both).
- **Paths:** a path starting with `event/`, `events/` or `private/` is in `src/screens/testing/`; `testing/text.js` is `src/screens/testing/text.js`; `components/…` is `src/components/…`. Other sections' files are written in full.

### Rules

- Follow CLAUDE.md.
- **Preview mode for building and trying changes:** `npm run dev:preview-mode`. `npm run dev`, `npm run preview` and `Start dashboard.bat` use the live database (`.worktreeinclude` copies `.env.local` into every worktree): run them only for a check Jeffrey OKs, never to try a change. `npm run build` is fine: it only builds.
- **Plan first:** a short plan (each item, its files, its mockup, any migration) in your docs folder; show it to Jeffrey.
- **Mockups before code** for every visual change, at PC 1280×800, tablet 820×1180 touch, phone 390×844 touch and 320 wide: a self-contained HTML file plus one PNG per screen with what changes outlined in amber (Jeffrey reviews the PNGs). He OKs them one screen at a time, before any code.
- **One decision at a time,** with pictures. Before asking, check whether another section already does it, and copy that.
- **Reviews:** a separate design reviewer (the rulebook, the approved mockups, screenshots at the four sizes, and §4's six WCAG 2.2 checks, v1.033); a separate code reviewer; a separate security reviewer for anything touching the database (handoff §6).
- **Order (a push to main deploys):** the migration is live before the push that brings the app that uses it. A step whose app calls a new or changed database function is merged only after Jeffrey has applied its migration and the checks passed (fingerprints, security advisor, tests file — CLAUDE.md). Screen-only steps can go first.
- **Migration (M-01):** ask the Main session for a migration number. Follow handoff §6 (`docs/Dashboard Docs/TKD-Dashboard-Handoff.md`). Add a SETUP section "## Migration 00NN: …" with steps `### 00NNa.` …, a `step00NN` in `supabase/tests/pglite/run.mjs`, a tests file and a fingerprints file. Run the PGlite tests with `cd supabase/tests/pglite && npm ci && node run.mjs` (`npm ci` once per worktree). Your fake database for events and private testings is `src/lib/mockTestingEvents.js`.
- **Don't change a shared part on your own** (`src/components/…`, the shared helpers in `src/lib/`, `src/styles/shared.css`): every section uses them. If you need something a part can't do, ask Jeffrey first. He decides whether you change it in your branch (then list it as a shared file) or the Dashboard core session does.
- List every CLAUDE.md shared file you touch (`src/styles/shared.css` and `src/components/text.js` are on that list).
- **Camps re-exports your words** (about 75 from `testing/text.js`). In each report, list the re-exported words you changed, so Camps can check them.
- Keep `docs/Testing/Color Belt Testing/TKD-ColorBelt-Status.md` current, with a short "Rolling check, pass 2" part. Commit on `color-belt` after each reviewed step, and explain the commands. **Never push.**
- When a step is done, send the Main session a short report: Done (with the commit) · Needs Jeffrey (one question, options, your recommendation) · Next.

### Rulebook

- New rows only for what Jeffrey decides, from your block **0.400–0.499**: the next unused number (check the rulebook first; your last is v0.427, on your branch).
- Run `git merge main` first, and re-read the rulebook right before editing: other sessions edit it too.
- The 10b row goes just above `| Approved 2026-10-16 (v0.26) |`, the changelog line at the end of §11. Bump the header's **Version** and **Last updated**, and keep CRLF.
- An older row you change gets a "(See v0.4xx …)" note at its start.

---

## Fix now

Most severe first.

### M-01 = C-01 — The Mark paid box says "They chose … on the form." after the desk changed Paying by · Medium

This was pass 1's R1-02, which said "nothing to change here". That was wrong: see "Corrections to pass 1" below.

- **What's wrong** (drift):
  - The box's hint is worked out from where the record came from, not from where today's Paying by was chosen:
    - the event roster: `event/EventPage.jsx:1917` (`markPaidBoxRow.source === 'form' ? 'form' : 'desk'`);
    - the Private testing tab: `private/PrivateTestingTab.jsx:1415` → `src/lib/testing/privateRules.js:89–91` (`movedFromSource === 'form'`).
  - The words come from `components/text.js:47`.
  - So after ⋯ Change how they'll pay, or a Mark paid or Edit payment by another way (v0.418 and v0.419 make those change Paying by), the box tells staff the family chose the desk's way on the form. On the mat tablet the family can read it too.
  - Checker 1 reproduced it at 1280:
    - Noah Kim (family form, Check) → ⋯ Change how they'll pay → Cash → Save → Mark paid: "They chose Cash on the form."
    - Private testing: Ava Chen (moved from a form registration) → ⋯ Change how they'll pay → Card → Save → Mark paid: "They chose Card on the form." The family form only offers cash or check (`supabase/migrations/0005_testing_events.sql:574–575`, `src/register/RegisterApp.jsx:12`).
  - Nothing keeps the family form's own choice. `testing_payments.paying_by_before` (`supabase/migrations/0030_color_belt_review.sql:310–316`) only holds Paying by as it was just before a payment.
- **Rule:**
  - v1.001 / v1.104 and v0.420: the hint says where the family chose, "… on the form." or "… at the desk."
  - v0.418 (Jeffrey: "If they change how they pay the dashboard should reflect that").
  - v0.424 (3) says "… on the form." **only when** the registration came from the family form. That is a condition that must hold, not one that is always enough, so it doesn't approve this.
  - Camps does it right (v0.735: "at the desk" once Paying by differs from the form's own choice; `src/lib/camps/campRules.js:595–598`, used at `src/screens/camps/CampRoster.jsx:667`).
- **Change** (Camps' 0033 pattern, with checker 1's two corrections):
  - One Color Belt migration keeps the family form's own choice on the registration, as 0033 keeps `camp_campers.paying_by_on_form`. It is set once when the family form saves the registration and never changes.
  - Move to private testing carries it to the private testing, and Undo move carries it back. A registration or private testing added at the desk has none.
  - **Existing rows:** a form registration takes the way from its own change-log insert row, as 0033 does (`supabase/migrations/0033_camps_design_review.sql:173–191`). But 0033 itself falls back to today's Paying by when there is no insert row (`:190`), and today's may already be a desk change. Here: no insert row → leave it empty (it then reads "at the desk").
  - An existing private testing that was moved from an event takes the choice of the registration it came from, through `moved_from_registration_id` (`supabase/migrations/0014_testing_private.sql:177`).
  - The event roster and the Private testing tab then work out the hint as Camps does: "… on the form." only while Paying by still equals the form's own choice; otherwise "… at the desk."
  - **Don't copy `payingByChoiceWhere` as it is.** It returns "form" when the form's choice is missing, because for Camps that means a database from before 0033. Here a missing choice means "added at the desk", so it must return "desk".
  - Plan it with Star's R1-02 (Star's migration 0038 keeps the same kind of column), so the two twins work out the hint the same way. If you and Star share one helper, it takes that missing-choice default as an input. A shared helper in `src/lib/` is Dashboard core's call: ask Jeffrey (the shared-part rule).
  - Ask the Main session for a migration number. Jeffrey applies it. The migration is live before the push that brings the app that uses it.
  - Its fake twin goes in `src/lib/mockTestingEvents.js`, or the check below can't pass.
- **Check (preview mode):** `__tkdPreview.resetTesting()`, reload. Then:
  - November Children Testing → Noah Kim ⋯ → Change how they'll pay → Cash → Save → Mark paid: "They chose Cash at the desk." Change it back to Check: "They chose Check on the form."
  - A student added at the desk: "… at the desk."
  - Mark paid Noah by Card instead of Check, then ⋯ Undo payment: Paying by goes back to Check, and the next Mark paid box says "They chose Check on the form."
  - Private testing → Ava Chen → Change how they'll pay → Card → Mark paid: "They chose Card at the desk."
  - Undo move is only the 5-second toast after a move (`event/EventPage.jsx:777`), so it can't be tried on the seeded Ava Chen. On the event roster: ⋯ Move to private testing on a student from the family form who hasn't paid → Undo in the toast: back on the roster, Mark paid still says "… on the form." Move them again: on the Private testing tab, Mark paid says "… on the form." too.

### C-02 — Mark paid's hidden name "Mark Ava Chen paid" splits the button's words · Medium

- **What's wrong** (drift):
  - Every Mark paid button shows "Mark paid", but its accessible name (what screen readers say and voice control listens for) is "Mark [Name] paid": `testing/text.js:603`, used at `event/RosterRows.jsx:104` and `private/PrivateRows.jsx:104`.
  - The name splits the visible words, so a voice-control user who says "Click Mark paid" may get nothing.
  - Checker 1 read every button's name in the preview: "Mark Ava Chen paid", "Mark Noah Kim paid", and so on. None contains the visible words.
- **Rule:** §4 (WCAG 2.2 AA, v1.033): 2.5.3 "label in name" (level A, part of the AA target) — the name must contain the words shown. v1.111 fixed the shared Download QR code name for the same reason. Star's button is named "Mark paid for [Name]" (`src/screens/testing/star/candidates/text.js:79`).
- **Change:** `testing/text.js:603` → "Mark paid for [Name]", Star's words, with the visible words first. (Camps doesn't re-export this one.)
- **Check (preview mode):** the event roster and the Private testing tab at 1280: every Mark paid button's name reads "Mark paid for [Name]" (DevTools → Accessibility, or `document.querySelector('.ev-markpaid').getAttribute('aria-label')` in the console).

### C-03 — A private testing paid in two parts reads as one made-up payment · Medium

- **What's wrong** (drift from v1.009):
  - The private testing summary writes its Payment row as `T.paidDetail(record.paidCents, record.paidMethod, record.paidOn)` (`private/PrivateSummaryDialog.jsx:74–81`, words at `testing/text.js:734`).
  - That is the **total** of all payments with the **latest** payment's way and day (the list's `paid_on` / `paid_method` are its latest payment that still stands: `supabase/migrations/0014_testing_private.sql:578–584`).
  - Checker 1: Ava Chen paid $65 cash on Oct 29 (moved with her from the event), then $20 by card on Nov 5. Her summary says "Paid · $85 card · paid Nov 5", a payment that never happened. With a cash top-up it says "$85 cash · paid Nov 5", the wrong date for the $65.
  - Anyone checking that day's drawer, or answering a parent, is misled. The receipt and Finance are right.
- **Rule:** v1.009 (the summary shows "the payment with its date"). P3 drew only the one-payment case ("$65 cash · paid Oct 27 · $20 more to collect"). Your own Edit payment subtitle already writes each part ("$65 cash Nov 2 + $20 card Dec 1", `testing/text.js:1161–1162`), and the receipt lists each payment that still stands (`src/lib/testing/receipt.js:42`, `standingPayments`).
- **Change:** one line per payment that still stands, oldest first: "$65 cash · paid Oct 29", then "$20 card · paid Nov 5" (then "$X more to collect" when something is still owed). A private testing paid once keeps today's one line, so nothing else changes. Mockup first, at the four sizes.
- **Check (preview mode):** `__tkdPreview.resetTesting()`; Private testing → Ava Chen (owes $20) → Mark paid → Card → Mark paid $20 → open her summary: two payment lines, each with its own way and day. A private testing paid once reads as today. At 1280 and 390.

### L-02 (your part) — Between 640 and 768 px wide, the roster's text overlaps · Medium · Jeffrey's answer to question 1 (v1.053), after Dashboard core's L-02

Picture: `docs/Design Review/Rolling check/Pass 2/pictures/Q1-roster-room.png` (your roster is pictures 1, 4, 7, 9 and 10).

- **What's wrong** (drift):
  - The event roster picks its tablet columns from the window's width (`src/styles/testing-events.css:1108`, `@media (min-width: 640px) and (max-width: 1023.98px)`).
  - But the side panel takes 72 px (Standard) or 96 px (Largest, v1.118) of that window, so near 640 px the columns get less room than they were drawn for.
  - Checker 1 saw "LT White →" over "Cash" at 683 px wide with a mouse, Standard (a 1366 laptop window snapped to half the screen; picture 1). Reviewer L counted 9 overlapping pairs there, 12 with Largest, and 3 at 700 px touch with Largest.
  - Dashboard core's plan already lists it as yours ("Known, Color Belt's to fix", `docs/Dashboard Core/TKD-DashboardCore-Plan.md:826`, `:854`). Your status file doesn't have it.
- **Rule:** §1.3: tablets are 640–1023 px, "Two columns max; tables drop low-priority columns", and "No horizontal scrolling on any screen size".
- **Change (Jeffrey chose A: "A: room beside panel", v1.053):** after Dashboard core's part, your tablet rules (`testing-events.css:1108` and the rules that go with it) become `@container page (…)`. When the room beside the panel is too narrow for the tablet columns, the roster uses the phone layout (the stacked rows phones already show; picture 4); with enough room, nothing changes (pictures 9 and 10). Your roster's `isPhone` (`event/EventPage.jsx:210`, read by `event/RosterRows.jsx:145, 222`) then comes from Dashboard core's hook for the roster only; dialogs and ⋯ menus keep the window's. Mockup first: the roster at 683 and 700 wide, with Standard and Largest.
- **Check (preview mode):** Account menu → Panel size → Largest, then Standard. November Children Testing at 683 × 768 with a mouse, 700 wide touch and 667 × 375 touch: no text over text, and no sideways scroll. At 1280, 820 touch, 390 and 320 the roster looks as today.

### M-06 — Print results and its sheet go · Low · Jeffrey's answer to question 2 (v1.052)

Picture: `docs/Design Review/Rolling check/Pass 2/pictures/Q2-colorbelt-print-results.png` (your Grading tab today, and the same page without Print results).

- **What Jeffrey decided** (2026-11-05, rulebook v1.052): "Childrens testing doesnt need to be printed." and "Childrens testing is color belt testing", then "Yes, remove it". Color Belt testing has no printed results sheet, so Print results and the sheet it prints go. Star's and Black Belt's full-results sheets stay; nothing changes for them.
  - The design review wrote v1.052 and the "(See v1.052 …)" notes on v0.189, v1.029, v0.416, v0.417 and v0.426. You need no row of your own unless Jeffrey decides something new in your mockup.
- **What goes:**
  - in `event/GradingTab.jsx`: the Print results button (`:246–254`), its print effect (`:167–185`), the sheet's portal (`:356–363`), the helpers `savedResult` and `passedByClass` with their comment (`:368–386`; only the sheet uses them), the `ResultsSheet` import (`:45`), and `loadedResult` in `shownRows` with its comment (`:152–154`; only `savedResult` reads it, and `shownRows` itself stays);
  - `event/ResultsSheet.jsx`;
  - the paper part of `event/resultsSheet.css` (from `:82`, "The printed results sheet", to the end: `.rs-print`, `@page cb-results` and its print rules);
  - its words in `testing/text.js:941–959` (`PRINT_RESULTS`, `resultsSheetTitle`, `resultsSheetSub`, `RESULTS_SHEET_CONTINUED`, `RESULTS_PASSED_HEADING`, `RESULTS_NEW_BELT`, `RESULTS_PASSED_BOX`, `RESULTS_NONE_PASSED`, `resultsSheetFoot`, `resultsSheetPage`). Camps re-exports none of them;
  - imports left unused: in `GradingTab.jsx`, `useEffect`, `useState` (`:36`) and `LOCATION_NAME` (`:39`) are used only by the sheet. `IconPrinter` stays for Print grading sheet (`:207`).
- **Careful: the bar's own layout is in the same CSS file.** `event/resultsSheet.css:14–80` (`.gr-bar`, `.gr-bar .ev-class-switch`, `.gr-bar-buttons`, `.gr-download-csv[aria-disabled]` and the phone rules) also places the class switch and Download CSV, and today only `ResultsSheet.jsx` imports that file (`:40`). Keep those rules and have the Grading tab load them (move them, or rename the file; your call). Otherwise the switch and Download CSV lose their layout.
- **What stays:** Download CSV (admins only; not drawn while Hide private details is on) at the right of the class switch, on phones on its own line under it as one full-width button; Print grading sheet; the Passed / Not passed / No show buttons.
- **Where nothing is left** (staff who aren't admins, or while Hide private details is on), draw no `.gr-bar-buttons` at all: no empty space at the right, and no empty line or extra gap under the switch on phones.
- Update the comments that name Print results or "the buttons" (`event/GradingTab.jsx:27–35, 217`; `event/resultsSheet.css:1–12, 14, 36, 50, 75`) to say what is left.
- **Mockup first,** at the four sizes, as admin and as staff: the Grading tab's class switch line without Print results.
- **Check (preview mode):**
  - November Children Testing → Grading as admin (`__tkdPreview.setRole('admin')`, then reload): only Download CSV at the right of the class switch, and it downloads as today.
  - As staff (`__tkdPreview.setRole('staff')`, then reload), and as admin with Hide private details on: nothing at the right of the class switch; at 390 and 320, no empty line or gap under it.
  - Print grading sheet prints as today (its own paper, with Color Belt's 0.75-inch margins), and so do the flyers.
  - At 1280, 820 touch, 390 and 320. `npm run build` and `npm run build:preview-mode` pass, and so does `src/lib/testing/checks.mjs`.

### M-02 = C-07 (b) — One Mark paid by another way shows as two History entries · Low · Jeffrey approved question 3 (a), v1.055

- **What's wrong** (approved this way: P3 drew it):
  - One save that records, undoes or edits a payment and changes Paying by shows as two entries, and "History · N changes" counts both.
  - Checker 1: private Ava Chen (Paying by Card) → Mark paid → Cash → $20. Her summary reads "History · 4 changes"; the top two are "Paying by changed: Card → Cash" and "Payment recorded: $20 cash, paid Nov 5", same moment, same person. Undo payment adds two more.
  - `src/lib/testing/history.js:105–149` joins only Edit payment pairs and moves; Paying by is its own part at `:347`.
  - Your approved P3 drew it this way: "Payment changed: check → cash" and "Paying by changed: Check → Cash", one second apart (`docs/Testing/Color Belt Testing/Design Review mockups/p3/data-p3.js:11–12`; `history-words.html:70` lists "Paying by changed").
  - Camps makes one entry per save (v0.736: "One save that changes several things is one entry"; `src/screens/camps/camperHistoryWords.js:20–21, 218`).
- **Change (Jeffrey approved A, v1.055):** one save is one entry. Join the registration's Paying by update with the payment row of the same save, money first, with "; ", as you join Edit payment rows today: "Payment recorded: $20 cash, paid Nov 5; Paying by changed: Card → Cash" (the exact payment and Paying by words follow R1-07's one set, which Dashboard core's mockup draws). Both rows carry `action` 'mark_paid' and the same time (`supabase/migrations/0030_color_belt_review.sql:307–324`); the reader returns no `batch_id` (`0030_color_belt_review.sql:1290–1292`). Star follows with its R1-02.
  - v1.055 records it, and the design review wrote the "(See v1.055 …)" notes on your v0.421 (P3) and v0.425 (History words), so you need no row of your own unless Jeffrey decides something new in your mockup. Mockup first: the History after a Mark paid by another way, and after its Undo payment.
- **Check (preview mode):** private Ava Chen → ⋯ Change how they'll pay → Card → Save; then Mark paid → Cash → $20: her History shows one new entry, "Payment recorded: $20 cash, paid Nov 5; Paying by changed: Card → Cash" (in R1-07's words once they land), and "History · N changes" counts it once. Undo payment adds one entry, not two.

### M-03 (your part) — No Print receipt for a removed student or a cancelled private testing that has money · Low · Jeffrey approved question 3 (b), v1.055

- **What's wrong** (approved this way: v0.424 (6)):
  - A removed student or a cancelled private testing with money gets no Print receipt: the event roster offers it only on an active, paid row (`event/EventPage.jsx:1558, 1574–1577`); the Private testing tab only on a paid one (`src/lib/testing/privateRules.js:176`), and a cancelled one's ⋯ holds only Restore and Delete permanently (`private/PrivateTestingTab.jsx:1090–1091, 1109`).
  - Yet v1.038 still counts their money ("includes $65 from removed students").
  - Star and Camps do the same; Black Belt offers it on every row.
- **Change (Jeffrey approved A, v1.055):** Print receipt also on a removed student or cancelled private testing with a payment that still stands; never with nothing paid; never while Hide private details is on. Today staff see no ⋯ on those rows, so who gets it there is drawn in your mockup. v1.055 records it, and the design review wrote the "(See v1.055 …)" note on your v0.424 (6), so you need no row of your own unless Jeffrey decides something new in your mockup.
- **Check (preview mode):** November Children Testing → Owen Reed (paid) → ⋯ Withdraw first. Owen, and Emma Ross's cancelled private testing ($85 paid): Print receipt is where your mockup puts it and prints that payment; Leo Hart (withdrawn, nothing paid) has none; with Hide private details on, none.

### C-04 (your part) — No line between Restore and the red Delete permanently · Low · Jeffrey approved question 3 (f), v1.055

- **What's wrong** (unclear: v1.011 doesn't place Restore):
  - On a removed student, the ⋯ reads "Restore · Delete permanently" with no line between them (`event/EventPage.jsx:1584–1586`); a cancelled private testing the same (`private/PrivateTestingTab.jsx:1091, 1109`, both in the last group).
  - So the red Delete permanently sits right under the harmless Restore. Star (`src/lib/star/candidateMenu.js:34–35`) and Camps (`src/screens/camps/CamperRowMenu.jsx:59–60`) draw a line there; Black Belt doesn't either.
- **Change (Jeffrey approved A, v1.055):** Delete permanently starts its own group on a removed or cancelled row (`separatorBefore`, as Star's). §8's ⋯ menu rule now says it: "On a removed person's ⋯, Restore sits above the line and the red Delete permanently below it." (the design review wrote the "(See v1.055 …)" note on v1.011).
- **Check (preview mode):** a removed student's ⋯ and a cancelled private testing's ⋯: Restore, a line, then the red Delete permanently. At 1280 and 390.

### C-05 (a) — An event with nobody on it shows four zero cards · Low

- **What's wrong** (drift from your own Private testing tab):
  - The event roster always draws its four cards (`event/EventPage.jsx:1998–2004`, no condition), so a new event shows "Students 0 · Paid 0 · Not paid 0 · $0".
  - Your Private testing tab (`private/PrivateTestingTab.jsx:1212`, `rows.length > 0`), Star (`src/screens/testing/star/candidates/CandidatesTab.jsx:1489`, `hasAny`) and Camps (`src/screens/camps/CampRoster.jsx:625`, `hasCampers`) leave the cards out until someone is listed.
  - Black Belt does what you do; pass 1 gave it the same line (`docs/Design Review/Rolling check/Pass 1/Fix-BlackBelt.md:304`).
- **Rule:** v1.028 (§8 Empty states): an empty list shows one line. Consistency with your own Private testing tab, Star and Camps.
- **Change:** draw the cards only once the event has a registration, active or removed (as Camps' `hasCampers`, `src/screens/camps/CampRoster.jsx:617`). With nobody, the empty line shows alone.
- **Check (preview mode):** Add event → open it before anyone registers: no cards, only the empty line. Add a student → the four cards show. At 1280 and 390.

### C-05 (b, c) — The empty lines for a card filter and the Past side · Low · Jeffrey approved question 3 (g), v1.055

- **(b)** (approved this way: v0.420, v0.424 (4)): when a card filter leaves nobody, you say "No paid students in this class." / "Everyone in this class has paid." (`testing/text.js:607–608`). Star says "No candidates match.", Camps "No campers match.", Black Belt "No candidates in this group." Jeffrey approved your pattern (g1, A): Star, Camps and Black Belt change their lines to say what is true. Nothing changes for you.
- **(c)** (unclear): "No past events." / "No past private testings." (`testing/text.js:397, 1059`), where Star says "No past events yet.", Camps "No past camps yet." and Black Belt "No past cycles yet." **Change (g2, A):** "No past events yet." and "No past private testings yet."
- **Check (preview mode):** Shrewsbury → Private testing → Past (empty in the fake data): "No past private testings yet." Wherever an Events list's Past side is empty: "No past events yet." The Paid card's lines stay as today.

### C-06 (a, b, your part) — The failed Mark paid line and the Undo payment box's note · Low · Jeffrey approved question 3 (j), v1.055

- **(a)** (unclear): a failed Mark paid says "[Name] wasn't marked paid. Check the connection and try again." (`testing/text.js:650`, in the bar with Retry: `event/EventPage.jsx:1268`, `private/PrivateTestingTab.jsx:865`). Star says "That didn't save. Check the connection, then retry." **Change (j1, A):** "[Name] wasn't marked paid. Check the connection, then retry." Camps re-exports this line (`src/screens/camps/text.js:58`, shown at `src/screens/camps/CampPage.jsx:428`): list it in your report.
- **(b)** (approved this way: Star's v0.518 Q2 B, Camps' v0.730): the Undo payment box's failure note says "Couldn't undo. Check the connection, then try again." (`testing/text.js:667`). **Change (j2, A):** v1.045 (4)'s "Undo didn't save. Check the connection, then retry.", and `:667` joins your R2-07 point (Star's and Camps' pass 1 R2-07 items already switch theirs).
- **Check (preview mode):** `__tkdPreview.failNextSave()` → Mark paid → Save: "[Name] wasn't marked paid. Check the connection, then retry." in the bar, with Retry. Then `__tkdPreview.failNextSave()` → ⋯ Undo payment → Undo payment: the box stays open with "Undo didn't save. Check the connection, then retry."

### C-06 (c, your part) — A failed Undo of Close / Open registration doesn't say "Undo didn't save" · Low · after Dashboard core's R2-07

- **What's wrong** (planned — not built yet: v1.045 (4), R2-07; this place is missing from pass 1's list):
  - When the Undo of ⋯ Close registration or Open registration doesn't reach the database, the bar says "Registration for [event] wasn't opened. Check the connection and try again." (`events/EventsTab.jsx:574–582`; words at `testing/text.js:443–444`).
  - That isn't v1.045 (4)'s failed-Undo sentence. Pass 1's R2-07 point lists only `testing/text.js:271, 284, 646`.
  - Star has the same twin code (its own item).
- **Rule:** v1.045 (4): a failed Undo says "Undo didn't save. Check the connection, then retry."
- **Change:** when the call was an Undo (`isUndo`), the bar says the failed-Undo sentence, with Retry and the row's "Not saved" mark as today. Your own `UNDO_FAILED` (`testing/text.js:288`) already reads it; after Dashboard core's R2-07, take the shared one. Add this place to your R2-07 point.
- **Check (preview mode):** Events → ⋯ Close registration on an open event → `__tkdPreview.failNextSave()` → Undo within 5 s: "Undo didn't save. Check the connection, then retry." with Retry → Retry → "Undone. Registration is open again." (your R2-07 open part).

### L-06 (your grips) — Drag handles look ready while a save runs · Low · after Dashboard core's L-06

- **What's wrong** (drift for the unused `disabled`; unclear for the look, since no row covers a turned-off grip):
  - Classes and ranks turns dragging off while a save runs (`src/screens/testing/ClassesRanksTab.jsx:668–669`).
  - But its grips (`src/screens/testing/RankRows.jsx:193, 283`; `src/screens/testing/ClassBlock.jsx:46`) don't pass `disabled`. They stay dark with "Drag to reorder", and screen readers don't hear "dimmed".
- **Rule:** the shared Grip's own header (`disabled`: "true: shown, but can't drag (e.g. while saving)", `components/Grip.jsx:16`); v1.116 / v1.120 (a turned-off control looks turned off).
- **Change:** after Dashboard core's L-06 (the shared Grip grays itself while dragging is off; Jeffrey sees a small picture first), check your grips. If Dashboard core asks screens to pass the state, pass it. CB14 moves Classes and ranks into Settings (v0.427): check them there.
- **Check (preview mode):** `__tkdPreview.setTestingDelay(4000)`; Classes and ranks → ⋯ on White → Move down: for the 4-second save every grip is gray and `aria-disabled`. Afterwards `__tkdPreview.setTestingDelay(200)`.

---

## Smaller (fix while you're in the file)

- **Pass 1 checks that pass 2 saw pass on main 6b27cdd** (reviewer C): R2-10 (the Compare buttons are named "Keep this one: First registration" / "…: Second registration"); R1-03 (History lists "Paying by changed: Cash → Check", and leaves it out while hidden, with the gray line); R4-07 (the gray "Payment history is hidden on this tablet." line in every history while hidden); and pass 1b's Not paid clock (now `ti-circle-x`, CB15). Record them in your status file. Nothing to build.

---

## Corrections to pass 1

- **`Notes-ColorBelt.md` R1-02 ("The Paying by hint · Medium (Star's), nothing to change here") was wrong.**
  - Color Belt has the same bug as Star: the hint follows where the record came from (`event/EventPage.jsx:1917`, `src/lib/testing/privateRules.js:89–91`). It is the same on `color-belt` 46e745b (`EventPage.jsx:1917`, `privateRules.js:90`).
  - The event code was already like this when the note was written: ccb42d5 (2026-11-04 00:12) came before pass 1's 8ef447a (00:32).
  - v0.418 only makes a Mark paid by another way change Paying by. It says nothing about the hint, so it can't make the hint right.
  - It is now M-01 = C-01 above (Fix now, Medium, with a migration). Your status file's list of pass 1 points doesn't have it, because the note said "nothing to change": add it.
- **R1-07 (pass 1's "The payment line and history words follow one set") gains one line** (C-07 (a), a duplicate of R1-07). Your History says "Paying by changed: Cash → Check" (`testing/text.js:1271`); Camps says "Paying by: Cash → Check" (`src/screens/camps/text.js:808, 820`, v0.736). Both are approved. Dashboard core's R1-07 mockup now draws this line too (its pass 2 correction), so switch it with your R1-07 point.

---

## Done when

- Every Fix now item is built, reviewed and approved by Jeffrey in the preview: a design reviewer at the four sizes for visual changes, a code reviewer, and a security reviewer for M-01's migration or anything about privacy.
- M-01's PGlite tests pass, Jeffrey has applied its migration, and the after-apply checks passed (fingerprints, security advisor, tests file).
- `npm run build` and `npm run build:preview-mode` pass, and so do `src/lib/testing/checks.mjs` and `src/lib/shared/checks.mjs`.
- Jeffrey's decisions are rows from your block.
- The status file says what you checked and what you changed. The work is committed on `color-belt`. **No push.**
- The report is sent to the Main session (with any Camps words you changed).
