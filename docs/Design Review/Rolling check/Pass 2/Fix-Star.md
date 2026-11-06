# Star testing — fixes from the design review's rolling check (pass 2)

**Paste into:** the Star testing session.

This file reaches your worktree when `design-review` is merged into main; until then the Design Review session sends its text by message.

**Starter to paste:**

> `git merge main` first. Then read and do `docs/Design Review/Rolling check/Pass 2/Fix-Star.md`: what the design review's rolling check (pass 2) found that reaches Star's screens, and one correction to your pass 1 file. Plan first. Mockups first for anything that changes how a screen looks. Nothing is built before I OK it.

---

## The brief

The design review's rolling check (phase 1d) looks at each section's design-review work after it merges: against the rulebook, the approved mockups, and the other sections that do the same job. Pass 2 covered what merged into `main` after pass 1's cut (e7fd75b), up to 6b27cdd (2026-11-05), in preview mode at the four sizes. Five reviewers looked (M money, records and privacy · U undo, safety nets, confirms and dialogs · L lists, pickers, forms and layout · P New students' visitor profile and printed sheet · C Color Belt, Star's twin). Two separate checkers then verified every finding.

Star merged nothing after pass 1's cut, so this file holds what pass 2 found in other sections' work that reaches your screens: a layout problem the shared panel causes, a place your pass 1 R2-07 item missed, the grips, a correction to your pass 1 R1-02, and questions for Jeffrey that may change your screens. Your pass 1 items (and their migration, 0038) go on as planned.

- **Fix now:** straight fixes. Plan them, show Jeffrey, then build. An item marked "after [owner]'s [id]" waits until that fix is on main: plan it now, build it after.
- **Waits on Jeffrey:** questions in the pass 2 report (`docs/Design Review/Rolling check/Pass 2/Pass 2 report.md`): they are in question 3. Don't build them until his answer comes through the Main session. (Question 1 is answered: L-02 is now a Fix now item, v1.053. Question 2, the results sheet (M-06), is answered too: Jeffrey's v1.052 removes Color Belt's sheet and keeps yours as it is, so it has nothing to build.)
- Each item keeps its finding id (C-06, L-02 …) so Jeffrey can trace it. Use the id in your plan, status file and commits.
- **Line numbers** are main 6b27cdd's (checked 2026-11-05); they may move.
- **Paths:** `star/…` is under `src/screens/testing/star/`; `lib/star/…` is `src/lib/star/…`; `components/…` is `src/components/…`. Other sections' files are written in full.

### Rules

- Follow CLAUDE.md.
- **Preview mode for building and trying changes:** `npm run dev:preview-mode`. `npm run dev`, `npm run preview` and `Start dashboard.bat` use the live database (`.worktreeinclude` copies `.env.local` into every worktree): run them only for a check Jeffrey OKs, never to try a change. `npm run build` is fine: it only builds.
- **Plan first:** a short plan (each item, its files, its mockup, any migration) in your docs folder; show it to Jeffrey.
- **Mockups before code** for every visual change, at PC 1280×800, tablet 820×1180 touch, phone 390×844 touch and 320 wide: a self-contained HTML file plus one PNG per screen with what changes outlined in amber (Jeffrey reviews the PNGs). He OKs them one screen at a time, before any code.
- **One decision at a time,** with pictures: each option drawn, its pros and cons, and a recommendation.
- **Reviews:** a separate design reviewer (the rulebook, the approved mockups, screenshots at the four sizes, and §4's six WCAG 2.2 checks, v1.033); a separate code reviewer; a separate security reviewer for anything touching the database (handoff §6).
- **Order (a push to main deploys):** the migration is live before the push that brings the app that uses it. Screen-only steps can go first. (No item here needs a migration of its own.)
- **Don't change a shared part on your own** (`src/components/…`, the shared helpers in `src/lib/`, `src/styles/shared.css`): every section uses them. If you need something a part can't do, ask Jeffrey first. He decides whether you change it in your branch (then list it as a shared file) or the Dashboard core session does.
- List every CLAUDE.md shared file you touch (`src/styles/shared.css` and `src/components/text.js` are on that list).
- **Status file:** keep `docs/Testing/Star Testing/TKD-StarTesting-Status.md` current, with a short "Rolling check, pass 2" section; update it in the same turn a step finishes or a decision is made.
- Commit on `star-testing` after each reviewed step. **Never push.**
- When a step is done, send the Main session a short report: Done (with the commit) · Needs Jeffrey (one question, options, your recommendation) · Next.

### Rulebook

- New rows only for what Jeffrey decides in your mockups and questions, from your block **0.500–0.599**: the next unused number (check the rulebook first).
- `git merge main` first, and re-read the rulebook right before editing: other sessions edit it too.
- The 10b row goes just above `| Approved 2026-10-16 (v0.26) |`, the changelog line at the end of §11. Bump the header's **Version** and **Last updated**, and keep CRLF.
- A row that changes an older one adds a "(See v0.5xx …)" note at the start of that row.

---

## Fix now

Most severe first.

### L-02 (your part) — Between 640 and 768 px wide, the roster's text overlaps · Medium · Jeffrey's answer to question 1 (v1.053), after Dashboard core's L-02

Picture: `docs/Design Review/Rolling check/Pass 2/pictures/Q1-roster-room.png`. Your roster isn't drawn in it; it would switch the same way as Color Belt's (pictures 1 and 4).

- **What's wrong** (drift; new in pass 2):
  - Your roster picks its tablet columns from the window's width (`star/star.css:886`, `@media (min-width: 640px) and (max-width: 1023.98px)`).
  - But the side panel takes 72 px (Standard) or 96 px (Largest, v1.118) of that window, so near 640 px the columns get less room than they were drawn for.
  - Checker 1, Fall Star Testing at 700 px wide touch with Largest: "Registered Oct 30" runs into "0 stars → 1 star", and the "Candidate" / "Testing for" headers overlap. Reviewer L counted 6 overlapping pairs there and 11 at 667 × 375 touch (a phone turned sideways) with Largest; at 700 with Standard there are none.
- **Rule:** §1.3: tablets are 640–1023 px, "Two columns max; tables drop low-priority columns", and "No horizontal scrolling on any screen size".
- **Change (Jeffrey chose A: "A: room beside panel", v1.053):** after Dashboard core's part, your tablet rules (`star/star.css:886` and the rules that go with it) become `@container page (…)`. When the room beside the panel is too narrow for the tablet columns, the roster uses the phone layout (the stacked rows phones already show); with enough room, nothing changes. Your roster's `isPhone` (`star/candidates/CandidatesTab.jsx:111`, read by `star/candidates/CandidateRows.jsx:167, 285`) then comes from Dashboard core's hook for the roster only; dialogs and ⋯ menus keep the window's. Mockup first: the roster at 683 and 700 wide, with Standard and Largest.
- **Check (preview mode):** Account menu → Panel size → Largest, then Standard. Fall Star Testing at 700 wide touch and 667 × 375 touch: no text over text, no sideways scroll. At 1280, 820 touch, 390 and 320 the roster looks as today.

### C-06 (c, your part) — A failed Undo of Close / Open registration doesn't say "Undo didn't save" · Low · after Dashboard core's R2-07

- **What's wrong** (planned — not built yet: v1.045 (4), R2-07; this place is missing from your pass 1 list):
  - When the Undo of ⋯ Close registration or Open registration doesn't reach the database, the bar says "Registration for [event] wasn't opened. Check the connection and try again." (`star/events/StarEventsTab.jsx:608–616` → `lib/star/eventsText.js:136–137`; the words at `:102–103`).
  - That isn't v1.045 (4)'s failed-Undo sentence. Your pass 1 R2-07 item doesn't name this place. Color Belt has the same twin code (its own item).
- **Rule:** v1.045 (4): a failed Undo says "Undo didn't save. Check the connection, then retry."
- **Change:** when the call was an Undo (`isUndo`), the bar says the failed-Undo sentence, with Retry and the row's "Not saved" mark as today. Your events words already carry it (`UNDO_FAILED`, `star/events/text.js:23`, from Color Belt's file); after Dashboard core's R2-07, take the shared one. Add this place to your R2-07 item.
- **Check (preview mode):** ⋯ Close registration on an open event → `__tkdPreview.failNextSave('star')` → Undo within 5 s: "Undo didn't save. Check the connection, then retry." with Retry → Retry → "Undone. Registration is open again." (your R2-07 open part).

### L-06 (your grips) — Rubrics and prices' drag handles look ready while a save runs · Low · after Dashboard core's L-06

- **What's wrong** (drift for the unused `disabled`; unclear for the look, since no row covers a turned-off grip):
  - Rubrics and prices turns dragging off while a save runs (`star/RubricsTab.jsx:665–666`), but its grips (`star/DanBlock.jsx:185`) don't pass `disabled`.
  - So they stay dark with "Drag to reorder", and screen readers don't hear "dimmed".
- **Rule:** the shared Grip's own header (`disabled`: "true: shown, but can't drag (e.g. while saving)", `components/Grip.jsx:16`); v1.116 / v1.120 (a turned-off control looks turned off).
- **Change:** after Dashboard core's L-06 (the shared Grip grays itself while dragging is off; Jeffrey sees a small picture first), check your grips. If Dashboard core asks screens to pass the state, pass it.
- **Check (preview mode):** `__tkdPreview.setTestingDelay(4000)`; Rubrics and prices → ⋯ on a category → Move down: for the save every grip is gray and `aria-disabled`. Afterwards `__tkdPreview.setTestingDelay(200)`.

---

## Waits on Jeffrey (don't build yet)

Each is in question 3 of the pass 2 report, the small ones. The Main session passes on his answer.

### M-03 (your part) — No Print receipt for a withdrawn candidate with money · Low · question 3 (b)

- **What's wrong** (approved this way: v0.518, S2 and Q8):
  - `canPrintReceipt` (`lib/star/candidateMenu.js:25–27`) offers Print receipt only on a candidate who isn't withdrawn. A withdrawn candidate's ⋯ is Restore · Delete permanently, for admins only (`:32–36`).
  - Yet your Payments recorded card will count their money (v1.038, your pass 1 R5-05).
  - Color Belt and Camps do the same; Black Belt offers it on every row.
- **If A (recommended):** Print receipt also on a withdrawn candidate with a payment or refund that still stands; never with nothing paid; never while Hide private details is on. Who sees it there (today only admins have a ⋯ on a withdrawn row) is drawn in your mockup.

### M-02 — With your R1-02: one save, one History entry · Low · question 3 (a)

- **What's wrong** (approved this way in Color Belt: its P3 drew two entries):
  - Your R1-02 makes a Mark paid by another way change Paying by: one save, two change-log rows.
  - Your History words each row on its own (`star/candidates/CandidateHistory.jsx:55–119`), so it would show two entries for one tap, as Color Belt's does today.
- **If A (recommended):** the rows of one save make one entry, money first, joined with "; ", as Camps does (v0.736), and as your own v0.518 P5 A already does for an edit of several fields. Build it with your R1-02 and R1-03 (R1-03 moves `linesFor` into a plain `.js` file anyway).

### Also in question 3

- **(f) C-04:** you already draw a line between Restore and Delete permanently (`lib/star/candidateMenu.js:34–35`). Nothing changes unless Jeffrey picks B (no line).
- **(g) C-05 (b):** your card filter's empty line, "No candidates match." (`star/candidates/text.js:112`), may change to say what is true, in Color Belt's pattern (for example "No paid candidates." / "Every candidate has paid."): drawn in your mockup if he picks it. (c) "No past events yet." stays.
- **(j) C-06 (b):** your pass 1 R2-07 item already switches the Undo payment and Undo refund boxes' note, "Couldn't undo. Check the connection, then try again." (`star/candidates/text.js:151`), to "Undo didn't save. Check the connection, then retry.". If Jeffrey picks B for (j) (b), leave that line out of R2-07.

---

## Smaller (fix while you're in the file)

Nothing new.

---

## Corrections to pass 1

- **`Fix-Star.md:87` (R1-02) says "Camps (v0.735) and Color Belt (v0.418, on its branch) already do it right."** The Camps half is right (`src/lib/camps/campRules.js:595–598`). The Color Belt half is wrong: Color Belt works out the hint from where the record came from, as you do today (`src/screens/testing/event/EventPage.jsx:1917`; `src/lib/testing/privateRules.js:89–91`), and now has the same fix to make (its M-01 = C-01). **Your own R1-02 fix stays as written:** copy Camps' 0033 pattern.
- **One thing to agree with Color Belt**, which plans its fix with yours: Camps' `payingByChoiceWhere` returns "form" when the form's own choice is missing (for Camps that means a database from before 0033). For Color Belt a missing choice means "added at the desk", so it reads "at the desk". If the two of you share one helper, it takes that default as an input (checker 1). A candidate you add at the desk reads "at the desk" today (`star/candidates/CandidatesTab.jsx:1457`): make sure it still does. And when your migration fills in existing candidates: 0033 itself falls back to today's Paying by when a row has no change-log insert row (`supabase/migrations/0033_camps_design_review.sql:190`), and today's may already be a desk change. No insert row → leave it empty (it then reads "at the desk"), as Color Belt does.

---

## Done when

- Every Fix now item is built, reviewed and approved by Jeffrey in the preview: a design reviewer at the four sizes for visual changes, a code reviewer, and a security reviewer for anything touching the database or privacy.
- Both builds pass (`npm run build` and `npm run build:preview-mode`), and so do Star's eight check files (`node src/lib/star/<name>Checks.mjs`) and `node src/lib/shared/checks.mjs`.
- Jeffrey's decisions are rows from your block.
- The status file is current, and the work is committed on `star-testing`. **No push.**
- The report is sent to the Main session.
