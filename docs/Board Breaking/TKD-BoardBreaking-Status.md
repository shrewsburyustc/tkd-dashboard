# Board Breaking — status

**Branch:** `board-breaking` (worktree `board-breaking-efd1a3`) · **Started:** 2026-11-12
**Rulebook block:** 1.300–1.399 (**v1.300–v1.303 used**; next free 1.304) · **Migrations (reserved by Main 2026-11-12):** **0051** = the Board Breaking section; **0052** = Finance: Board Breaking payments in the Daily report (runs after 0051 is live, builds on 0047's `finance_money_rows_core`). No migration file is written before Jeffrey OKs the contract.
**Goal (Main's brief, 2026-11-12):** a new **Board Breaking event** section in the dashboard, replacing Jeffrey's existing Board Breaking system (a Netlify page + Google Apps Script + Google Sheet, outside this repo).

## Where we are

- [x] Worktree set up: branch renamed to `board-breaking`, `git log -1` = latest `main` (efc02900), `npm ci` done.
- [x] Read first: `CLAUDE.md`, rulebook §0 / §5 / §9, handoff §6.
- [x] Jeffrey uploaded the existing system 2026-11-12: the Apps Script (`AppsScript_BoardBreaking.gs`), the Sheet as .xlsx (structure; see the privacy note below), the board chart PDF (`Board_Breaking_Recommendations.pdf`) and the live page (https://boardbreaking-ustc.netlify.app/, `?admin=1` shows the Instructor tab).
- [x] Studied it → "What it does today" and "What the new section must do" below.
- [x] Questions Q1–Q8 answered by Jeffrey one at a time, 2026-11-12 → rulebook v1.300 (10b row + changelog line + section 9 row); see "Decisions" below.
- [x] Contract `CONTRACT-0051.md` drafted, three agents drew the screens (`Mockups/`: A family form, B staff events / roster / dialogs, C admin chart and prices), pictures sent to Jeffrey 2026-11-12 (cut into pages under 8000 px: `Mockups/pages/`). Jeffrey's first reactions → v1.301: belt pictures on the roster rows, the printed chart is wrong (live-page numbers are the chart), one age line at 12 / 13.
- [x] 2026-11-12 Jeffrey: a Square payment counts at the event's school; the schools have different bank accounts, so Square credentials and webhooks are **per school** (v1.302, contract §5/§6).
- [x] 2026-11-12 Jeffrey: a changed amount cancels the old Square link; two name boxes (v1.303). All contract open points answered; waiting only for his OK on the pictures + contract.
- [ ] **Next (old plan, partly done):** reserve the migration number through Main (done: 0051, 0052); write the build contract (`docs/Board Breaking/CONTRACT-00NN.md`: tables, functions, who may call what); draw the screens (one picture per page at PC / tablet / phone, as combined PNGs): the family form (age instead of Program), the event list, the roster, Edit event / Settings (prices, age lines, board chart), and the Square "Pay" result screen.
- [ ] After his OK on the pictures and the contract: build in batches, reviewer agent per batch (security for the database + Square work, design at 1280×800 / 820×1180 / 390×844 / 320), commit on this branch. No push.

**Privacy note (2026-11-12):** Jeffrey said the uploaded Sheet had no student data, but its **Archive** tab still holds real rows (an event of 2026-06-19, names included) and its **Webhook Log** tab holds raw Square payment messages. Only column-level counts were taken (no names); the unpacked scratch copies were deleted; nothing from those tabs is in this repo. Jeffrey was told.

## Patterns to copy first (check before asking any design question)

- Color Belt testing: one event with **classes that each have a time**, early price vs. testing-day price, roster, Mark paid with a way to pay, Add student for walk-ins, registration link + QR.
- Star testing (`docs/Testing/Star Testing/`), Black Belt testing (`docs/Testing/Black Belt Testing/`, plan + contract style), Camps (`docs/Camps/`: public family form, per-school rosters, payments, refunds), Finance (`docs/Finance/`: how a section's payments reach the Daily report; each payment counts at the school of the desk that took it).
- Public forms go through a Cloudflare Pages Function (`functions/api/…`, with Turnstile + rate limit), never `anon` table access (v0.33).
- Payments everywhere else in the dashboard are **cash / check / card taken at the desk**. There is **no online payment** (no Square, no Stripe) anywhere yet — Board breaking will be the first (decision Q1, v1.300), so its Square part gets its own security review.

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

Decided by Jeffrey 2026-11-12 (see Decisions); everything not listed there copies an existing section.

1. **Events** — a list of Board breaking events (upcoming, past) inside Testing; admins add / edit / delete an event: date, **one school**, class times (copied from the last event), registration open / closed. Past events stay with their roster; no "Archive" step.
2. **Family form** (public link + QR, through a Pages Function with Turnstile and rate limit) — student name, **age** (not Program), rank (one long list), class time, boards pre-filled from age band + rank and adjustable, Paying by (Cash · Check · Card). The amount is worked out **by the database**, never trusted from the browser. Card → "Pay with Square" with the exact amount; if the link can't be made: "pay at the front desk".
3. **Roster** — per event, grouped by class time, counts per class (registered · paid · broke); per student Mark paid (with a way to pay, Undo), Mark broken (Undo), Edit (boards, class time, Paying by), Add student for walk-ins, History. Lists show no private data (a name, an age and a rank — no date of birth, address or contact).
4. **Settings (admins)** — the one price setting (Technical / Adult per board, card +$0.25, event day +$1), the three age lines (6 / 7–12 / 13+), and the **board chart** (rank, technique, Technical, Adult), starting from the live page's numbers.
5. **Payments → Finance** — each payment is a row with a way to pay and the school; a Square payment arrives by Square's message (a Pages Function checks its signature) and shows in the Daily report, Close the day, History and Export as "Board breaking" (a small Finance migration after this section's own; numbers via Main). Refunds admin-only, as in Camps / Star. Open to design: how a Square payment counts at a school when no desk took it (Finance's rule is "the school of the desk"; here the event's school).
6. **Home, Calendar, people search** — the event on Home on its day, on the Calendar, and its students in the top-bar search (each needs its reader replaced; later batches).
7. **Rules** — RLS + `has_data_access()`, security-definer write functions, change log on every change, nothing to anon, tests for locked / signed-out sessions (handoff §6). The Square token lives only in a Cloudflare secret, never in the app, git or chat.

**Not planned unless Jeffrey asks:** scoring, per-board results, emails to families, parent contact, waivers, moving old Archive rows in.

## Decisions

*Rulebook v1.300 (10b row "Board breaking: how the section works"), Jeffrey, 2026-11-12, one question at a time.*

| # | Question | Decision |
|---|---|---|
| Q1 | Card payments | **B — keep Square pay-online links in the first build** (I recommended desk-only now, online later; he chose B; flagged once: a Cloudflare secret, a server function for Square's messages and Finance rules for online money make the first security review bigger) |
| Q2 | Schools | **A — one school per event** |
| Q3 | Where it lives | **A — inside Testing**, fourth page after Black Belt testing |
| Q4 | Board chart | **The live page's numbers, editable by admins** (the PDF's differences get listed for him) |
| Q5 | Prices | **One price setting for all events** (not per event); **keep both rules**: card +$0.25 per board, event day +$1 per board; each registration stores the amount charged |
| Q6 | Family form | **As today, but Age replaces Program** (parents pick the wrong program); age lines **6 and under = Little Tiger, 7–12 = Child, 13+ = Teen / Adult**; **one long list of every rank** (Little Tiger belts labeled "Little Tiger …"); no parent contact, no waiver |
| Q7 | Staff vs admin | **Staff run the day; admins own setup** (events, prices, age lines, chart, price override, refunds) |
| Q8 | Old data | **Start fresh**; retire the old page after the new one is live; the Sheet stays his record |

**Details I decided from the answers (change them if wrong):**
- Boards = lookup(age band, rank). A "Little Tiger …" belt always uses the Little Tiger row (3 Technical); Black Belt ranks use the Black Belt row whatever the age (as the page does today).
- The age is stored as a whole number, shown in the roster beside the rank; it is not a date of birth.
- Family can still adjust the board counts (as today); the amount follows.
- Class time stays free choice, with the recommended one first.

## Open questions

None for Jeffrey right now. Still to settle while drawing / writing the contract (will be asked together, with pictures):

- Square: which Square account and location the links use, how the "payment completed" message is verified, and the Cloudflare secret names (values go in Cloudflare by Jeffrey, never in chat or git).
- How a Square payment (no desk involved) counts in Finance: proposed rule = the event's school.
- The chart differences between the PDF and the live page (a list for Jeffrey to confirm which rows he wants changed).
- Migration number (reserve via Main) and the Finance migration number.
