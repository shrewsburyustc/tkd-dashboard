# Board Breaking — status

**Branch:** `board-breaking` (worktree `board-breaking-efd1a3`) · **Started:** 2026-11-12
**Rulebook block:** 1.300–1.399 (none used yet) · **Migration number:** none reserved yet (ask Main first; next free was 0051 on 2026-11-12)
**Goal (Main's brief, 2026-11-12):** a new **Board Breaking event** section in the dashboard, replacing Jeffrey's existing Board Breaking system (a Netlify page + Google Apps Script + Google Sheet, outside this repo).

## Where we are

- [x] Worktree set up: branch renamed to `board-breaking`, `git log -1` = latest `main` (efc02900), `npm ci` done.
- [x] Read first: `CLAUDE.md`, rulebook §0 / §5 / §9, handoff §6.
- [x] Jeffrey uploaded the existing system 2026-11-12: the Apps Script (`AppsScript_BoardBreaking.gs`), the Sheet as .xlsx (structure; see the privacy note below), the board chart PDF (`Board_Breaking_Recommendations.pdf`) and the live page (https://boardbreaking-ustc.netlify.app/, `?admin=1` shows the Instructor tab).
- [x] Studied it → "What it does today" and "What the new section must do" below.
- [ ] **Waiting on Jeffrey:** answers to questions Q1–Q8 (asked together 2026-11-12; picture `Questions/Q3-where-it-lives.png`).
- [ ] One mockup per page at PC / tablet / phone, sent as combined PNGs.
- [ ] After his OK: build in batches, reviewer agent per batch, commit on this branch. No push.

**Privacy note (2026-11-12):** Jeffrey said the uploaded Sheet had no student data, but its **Archive** tab still holds real rows (an event of 2026-06-19, names included) and its **Webhook Log** tab holds raw Square payment messages. Only column-level counts were taken (no names); the unpacked scratch copies were deleted; nothing from those tabs is in this repo. Jeffrey was told.

## Patterns to copy first (check before asking any design question)

- Color Belt testing: one event with **classes that each have a time**, early price vs. testing-day price, roster, Mark paid with a way to pay, Add student for walk-ins, registration link + QR.
- Star testing (`docs/Testing/Star Testing/`), Black Belt testing (`docs/Testing/Black Belt Testing/`, plan + contract style), Camps (`docs/Camps/`: public family form, per-school rosters, payments, refunds), Finance (`docs/Finance/`: how a section's payments reach the Daily report; each payment counts at the school of the desk that took it).
- Public forms go through a Cloudflare Pages Function (`functions/api/…`, with Turnstile + rate limit), never `anon` table access (v0.33).
- Payments everywhere in the dashboard are **cash / check / card taken at the desk**. There is **no online payment** (no Square, no Stripe) anywhere yet.

## What it does today (existing system)

**Pieces:** one web page (Netlify) with a Register tab and a hidden Instructor tab → a Google Apps Script web app → one Google Sheet. Card payments go through **Square payment links**; a Square webhook marks the row paid.

**The event.** One event at a time ("this month's"): an **event date** and a **location** (free text, "Shrewsbury"). The class times are rows in the Sheet's Settings tab, e.g. Group D 4:20–5:00 PM, White / Little Tiger 5:10–5:50, Group A 6:00–6:40, Group B+C 6:50–7:30, Teen / Adult 7:40–8:20. Each class time is its own tab in the Sheet. About 95 registrations for one event (Master tab).

**The family form asks only:**
1. Student name (one box, first and last).
2. Program: Little Tiger · Child · Teen / Adult · Black Belt.
3. Rank (list depends on the program).
4. Class time (any; "we recommend coming to your own class time").
5. Boards: **Technical** and **Adult** counts, filled in from the rank's chart, changeable with − / +. A "View full requirement chart" fold-out.
6. Payment: Cash · Check · Card (Square).
7. Amount due, worked out on the page.

No parent name, phone, email, school, date of birth, waiver or signature. No confirmation email.

**Prices (fixed in the page's code):** cash / check $3 per Technical board, $4 per Adult board; card $3.25 and $4.25; **+$1 per board when registering on the event day or later** ("same day"). A banner says "Pre-register and save $1 per board."

**After Submit:** cash / check → a toast "registered"; card → a "Pay with Square" button with the exact amount (if the link can't be made: "pay at the front desk").

**Instructor tab** (PIN on the page + an Admin Key pasted once per device):
- Set the event date and location; class times are edited in the Sheet.
- Roster grouped by class time, each with "N registered · N done". Per student: name, program · rank, boards, way to pay, amount, and three buttons: **Mark paid** (toggles, stamps today's date), **Mark broken** (toggles "Completed"), **Edit**.
- Edit: board counts, way to pay, class time (moves the student), "Override price manually".
- **Archive This Event:** moves every row to the Archive tab stamped with the event date and empties the class tabs for next month.
- Sorting inside a class tab: students of that class's own program / rank group first, then by rank order.

**Board chart.** Per program and rank: the testing technique and the recommended boards. **The PDF and the live page disagree** (e.g. Child Blue: PDF "3 Technical", page 4 Technical; Teen High Blue: PDF "1 Technical + 2 Adult", page 1 + 3; Child High Brown: PDF "2 Technical + 1 Adult", page 3 + 1; 1st Dan: PDF "2 Tech + Power Breaking", page 4 Technical + 3 Adult). The page says "Power Breaking = 3 Adult boards".

**What is wrong with it today (reasons to replace, not to patch):**
- The PIN is checked in the browser only (default 0000, printed on the page); the Admin Key travels in the web address of every request.
- The **amount comes from the family's browser** and is trusted, including for the Square link.
- Edit recalculates with $3 / $4 only (ignores card and same-day prices) and does not save a changed way to pay.
- No change log, no Undo, no check against double sign-ups, no spam protection.
- Only one event at a time; past events exist only as Archive rows; nothing reaches the dashboard's Daily report.

## What the new section must do

Copying existing dashboard patterns unless Jeffrey answers otherwise:

1. **Events** — a list of Board breaking events (upcoming, past); admins add / edit / delete an event: date, school (Q2), class times (copied from the last event), prices (Q5), registration open / closed. Past events stay with their roster; no "Archive" step.
2. **Family form** (public link + QR, through a Pages Function with Turnstile and rate limit) — student name, program, rank, class time, boards pre-filled from the chart and adjustable, Paying by, amount worked out **by the database**, never trusted from the browser (Q1, Q6).
3. **Roster** — per event, grouped by class time, counts per class (registered · paid · broke); per student Mark paid (with a way to pay, Undo), Mark broken (Undo), Edit (boards, class time, Paying by), Add student for walk-ins, History. Lists show no private data (there is almost none: a name and a rank).
4. **Board chart** — the chart the form uses, editable by admins (Q4).
5. **Payments → Finance** — each payment is a row with a way to pay and the desk's school, and shows in the Daily report, Close the day, History and Export as "Board breaking" (needs a small Finance migration after this section's own; numbers via Main). Refunds admin-only, as in Camps / Star.
6. **Home, Calendar, people search** — the event on Home on its day, on the Calendar, and its students in the top-bar search (each needs its reader replaced; later batches).
7. **Rules** — RLS + `has_data_access()`, security-definer write functions, change log on every change, nothing to anon, tests for locked / signed-out sessions (handoff §6).

**Not planned unless Jeffrey asks:** scoring, per-board results, emails to families, waivers, moving old Archive rows in.

## Decisions

*None yet. Every decision also goes into the rulebook (10b row + changelog line, versions from 1.300–1.399, `git merge main` first, CRLF kept).*

## Open questions (asked 2026-11-12, all together)

| # | Question | Recommendation |
|---|---|---|
| Q1 | Card payments: desk only, or keep Square pay-online links? | C — desk only now, Square online as its own later batch |
| Q2 | Schools: one school per event, joint, or either? | A — one school per event (needs his facts about Worcester) |
| Q3 | Where it lives: inside Testing or its own rail icon? (picture) | A — inside Testing |
| Q4 | Board chart: which source is right (PDF or page), and admin-editable? | Editable by admins; he says which numbers are right |
| Q5 | Prices: per event or one setting; keep card +$0.25 and same-day +$1? | Per event, copied from the last one; keep both rules |
| Q6 | Family form: keep it name-only, or add parent contact / school? | Keep it minimal + school if Q2 needs it |
| Q7 | Staff vs. admin: who may do what? | Staff run the roster; admins own events, prices, chart, price override, refunds |
| Q8 | Old data and switch-over: start fresh or import the Archive? | Start fresh; old page stays until the new one is live |
