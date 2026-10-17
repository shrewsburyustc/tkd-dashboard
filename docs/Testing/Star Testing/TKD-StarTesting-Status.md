# Star Testing — status and next steps

**Updated:** 2026-10-17 (Star testing worktree session — Events tab Questions 1–2 answered, v0.67–v0.68)
**Rulebook at this update:** v0.68 (Star testing rows: v0.58–v0.61, v0.63, v0.66–v0.68) · **Inventory of the old prototype:** `TKD-StarTesting-Inventory.md` (this folder) · **Mockups:** `TKD-StarTesting-Rubrics-Mockups.html` (this folder)

> Read `CLAUDE.md` (repo root) first. This file says where Star testing stands and what comes next. Keep it current: update it in the same turn a step finishes or a decision is made.

---

## 1. Where things stand (one paragraph)

Star testing (the stars between Dan ranks: 1st Dan up to 4 stars, 2nd up to 3, 3rd up to 5) is in the **design stage only**. Nothing is built: no database tables, no screens, no migration. The old prototype (`Old prototype/`, never used, no real data) is the feature reference only. Decided so far: where Star testing lives (inside Testing, next to Color belt testing), how its pages are organised, the order of work, and the rules for the **Rubrics and prices** tab (build phase 1). The **Rubrics and prices mockup (12 screens) is approved** (2026-10-17, after a screen-by-screen pass; recorded as v0.66). The Events tab is being designed one question at a time (`TKD-StarTesting-Events-Questions.html`): **Questions 1–2 answered** (registration switch + optional closing date, v0.67; roles, v0.68). Star work now happens in its own worktree on branch `star-testing` (set up 2026-10-17, level with `main` at 599edd1). Nothing pushed.

## 2. Waiting on Jeffrey right now

Nothing blocking. Next: **Events tab Question 3**, what an event holds besides name and date (start time, building, a note for families, a per-Dan limit), to be drawn as options in `TKD-StarTesting-Events-Questions.html`.

## 3. Next steps, in order

**A. Phase 1 design (Rubrics and prices) — DONE**, approved 2026-10-17 (v0.66).

**B. Design the remaining Star testing screens** (decision v0.61: design everything first, then build). Each: one decision at a time with visuals → mockups at PC / tablet / phone → separate reviewer agent → screen-by-screen pass with Jeffrey → record in the rulebook.
1. Events tab + Add / Edit event — **in progress**, questions in `TKD-StarTesting-Events-Questions.html`: (1) registration open/close — **done v0.67**; (2) who can add/edit and open/close — **done v0.68**; (3) other event fields (time, building, note, per-Dan limit — prototype had 100); (4) status tags through an event's life + upcoming/past split; (5) family link + QR placement; (6) delete/cancel an event. Then full mockups at PC / tablet / phone.
2. Public registration form (no login; uses the shared public-form path v0.33, most likely built first by Color Belt phase 2): full name, date of birth (custom calendar), email for results, school, current Dan, star progression, Cash or Check. **Gender dropped.** No phone, attendance or assistant counts.
3. Event → **Candidates** tab (roster: grouped Shrewsbury first then Worcester, lowest star first then A–Z; payments; school correction; edit / remove a candidate — the prototype had neither)
4. Event → **Grading** tab (no horizontal scroll — new layout needed; D shown amber not red; Classes attended + Assistant classes entered by staff; landscape paper grading sheet)
5. Event → **Results** tab (scores, make-ups, portrait Final Scoring printout, CSV, **results emails from the dashboard**)
6. Private star testing
7. Decide what (if anything) Star testing adds to Home

**C. Plan the database once, from all approved designs** (one migration; takes the next free number after Color Belt's — `0003` is Color Belt). Follow `TKD-Dashboard-Handoff.md` §6 security rules; PGlite tests; security + design reviews by separate agents.

**D. Build in 6 phases** (v0.61), each with reviews and Jeffrey's OK: (1) Rubrics and prices · (2) Events + public registration form · (3) Candidates and payments · (4) Grading incl. paper sheet · (5) Results, printouts and email · (6) Private star testing. Only one build runs at a time (Color Belt is building now).

## 4. Open questions (ask one at a time, with visuals, when the related screen is designed)

- **Make-ups** (from Jeffrey: make-ups are unfinished candidates and **do not pay again**): at the next event are they graded only on their D categories? How do they register for the next event? What happens to a candidate **below 245 with no D** (prototype says "make-up" but there is nothing to re-test)?
- Roster default when a device is set to one school: Star testing works on Both, but a Worcester device opens on Worcester — show all candidates by default on testing day?
- Who can see a candidate's date of birth and email (detail view only; Admin vs Staff) — rule 5 privacy.
- **Email service** for results (the dashboard has none yet; may cost money; every message to families needs a confirmation dialog, rule 1.4).
- Check numbers / receipts for payments (prototype only knows Cash/Check + paid/due).
- Are the Dan levels fixed at 1st–3rd, or can an admin add one later (e.g. if 4th Dan stars ever exist)? Not asked yet — the mockup assumes fixed.
- Linking candidates to student records once a Students section exists (the dashboard will hold student info later, Kicksite-style).
- Calendar add-on (all events from every tab) is Jeffrey's next project after this — Star events will need to appear there.

## 5. Decisions made (details in rulebook 10b)

| Version | Decision |
|---|---|
| v0.58 | Star testing lives **inside Testing**; Testing lets staff choose Color belt testing or Star testing. Star events are **joint (both schools, one room)** and **work on Both**; Worcester / Shrewsbury filter candidates of the same event. v0.34–v0.36 (one school per event, Both blocked, per-school prices) apply to Color belt only. **Star rubrics and prices are the same for both schools**, changeable later from a screen. |
| v0.59 | Testing chooser: **click** the Testing icon → choice page (rows with next event); **mouse hover** → menu beside the icon; keyboard supported; touch always gets the choice page; "← Testing" back link inside each testing type. Appears only once Star testing is built. Icons `ti-star`, `ti-chevron-right` added. |
| v0.60 | Star testing home tabs **Events** + **Rubrics and prices**; each event opens its own page with **Candidates · Grading · Results** tabs. |
| v0.61 | **Design every Star screen first, then build in 6 phases.** **Each event keeps its own copy** of rubrics, grade scale, assistant table, star limits and prices from creation. Rubrics and prices: **Admin edits, Staff view only** (enforced in the database). **Everything changeable with live totals** (categories add/rename/re-credit/reorder/delete, pass mark, star limit, grade values, assistant table, fees); exactly one "from class count" category per Dan. **70-credit total shown, not required** (amber note + reminder). |
| v0.63 | **Drag to reorder works on every device** by the grip only (dashboard-wide, changes v0.43; affects Color Belt phase 1 too). Move up/down in ⋯ stays everywhere. |
| v0.68 | **Events roles:** admins add/edit events and open or close registration any time; **staff close any time, reopen only before the closing date** (after it: grayed out, "Ask an admin to reopen."); enforced in the database. |
| v0.67 | **Registration** switch (Open / Closed; new events start Closed) **plus an optional automatic closing date** (starts ticked, 7 days before testing, 11:59 PM Massachusetts time; never reopens; reopening after it removes the date); ⋯ Close / Open registration with Undo; closing date shown openly (exception to rule 8). Label "Registration", not "Family registration" (Jeffrey). |
| v0.66 | **Rubrics and prices mockups approved** (12 screens, all 20 details). **Age for the assistant-class scale counts on the testing day.** **Grade values and assistant-class minimums must go down in order** (Save gray until fixed). |

Facts from Jeffrey (2026-10-16): rubrics and prices are current; same-day fee = **paying** on testing day; DOB required (scoring depends on age); email required (results); classes attended kept; gender dropped; private star testing exists; the prototype was never used — the goal is a complete, more detailed product.

**Rubrics and prices mockup:** approved in full on 2026-10-17 (all 12 screens, details 1–20). The final version was checked by a separate reviewer agent; its one finding (error fields showing a blue focus ring instead of amber) was fixed.

## 6. Files

**This folder (`docs/Testing/Star Testing/`):**
- `TKD-StarTesting-Status.md` — this file.
- `TKD-StarTesting-Inventory.md` — inventory of the old prototype, Jeffrey's answers (§0), domain rules, gaps vs the rulebook.
- `TKD-StarTesting-Rubrics-Mockups.html` — Rubrics and prices mockups, 12 screens at PC / tablet / phone, with "Details for approval". **Approved 2026-10-17 (v0.66).**
- `TKD-StarTesting-Events-Questions.html` — Events tab design questions, one at a time, with option sketches (PC + phone); answered questions stay with their answer. Built from the Rubrics mockup's stylesheet.
- `Old prototype/` — `star-testing.html` (prototype), `STAR-TESTING.md` (notes), `STAR-TESTING-HANDOFF.md` (full spec: rubrics as data, scoring code, test cases, defects not to repeat). Feature reference only — its stack (Workers + D1, shared password) is superseded by the dashboard's.

**Shared files the Star session has edited:** `docs/Dashboard Docs/TKD-Dashboard-Design-Guidelines.md` (Star 10b rows + changelog v0.58–v0.61, v0.63, v0.66–v0.68; v0.43 row note). Also earlier (committed in `4dc7ad4`): docs reorganisation, `docs/README.md`, root `README.md` doc paths, handoff paths.

**Reading copies** in the claude.ai project "Taekwondo Management System": inventory, guidelines (may lag the repo).

## 7. Things that bit us (don't repeat)

- **The rulebook is edited by two sessions.** Version numbers collided twice (Color Belt took v0.62 while Star planned it). Always re-read the version line right before editing; keep CRLF; insert rows by searching for anchors, not line numbers.
- Git checks run from the Linux side of this PC must use `git -c core.autocrlf=true --no-optional-locks …` — otherwise every file looks modified (CRLF vs LF) and `git status` can leave a `.git/index.lock` that blocks Jeffrey's git.
- Every mockup gets a separate reviewer agent; the first Rubrics review found missing screens (reorder / failed save) and frames missing blocks.
- Don't present unconfirmed facts as rules (the reviewer caught an assumed "age on testing day" line — now a question).
- Prototype defects to avoid in the build: see `Old prototype/STAR-TESTING-HANDOFF.md` §11 (grading table losing focus/scroll, "not graded" unreachable with the auto category, bare category names in results, UTC dates, DOB discarded, stored-shape changes wiping data, half-saving forms).
