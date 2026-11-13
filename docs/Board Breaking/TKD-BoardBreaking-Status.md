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
- [x] **Batch 1 built 2026-11-12 (Jeffrey approved the pictures + contract: "Approved, start building"):** migration `0051_board_breaking.sql` (8+1 tables, 27 staff / public / Square functions, roles `brk_registrar` and `brk_square`, chart seed), `0051_tests.sql` (685 checks), fingerprints, pre-apply check, `step0051` (94 passed; full runner 3597 passed), SETUP section "Migration 0051"; independent security review done (no Critical/High; 2 Medium + 5 Low fixed: cleared-link memory, sign-up caps, host pin on the pay link, etc.). Staff screens (Events, roster with belt pictures, dialogs, Chart and prices) in preview mode against the fake database (`src/lib/mockBreaking.js`, 73 checks), independent design review done and fixed. Hidden in the live build behind `VITE_BOARD_BREAKING` (on only in preview mode). Commits on `board-breaking`: ce9c0e82 (database), fc2e533f (staff screens). **Nothing pushed.**
- [x] **0051 APPLIED to the live database 2026-11-13 and tested** (Jeffrey: "Preview OK, I'll paste 0051", then "pass" for `0051_tests.sql`). Read-only checks by Claude: pre-check 14 / 2 / 9 / 47 / 2; 49 chart rows; a fingerprint over all non-`brk_` functions (556), tables / views (103) and policies identical before and after; advisor: only the expected notices (3 tables row security without policy, 21 staff functions executable by authenticated, nothing for anon). The two logins have no password yet; Cloudflare / Square not done. The app that uses it stays off in the live build (switch).
- [x] (done, kept for the record) his look at the staff screens in the preview; his OK to paste 0051 (SETUP "Migration 0051": pre-check, paste outside school hours because of a short lock on change_log, fingerprints, advisor, tests). Then the passwords of the two logins `brk_registrar` / `brk_square` (SETUP 0051 steps).
- [x] **Finance 0052 built, reviewed and APPLIED 2026-11-13** (contract `CONTRACT-0052.md`; `step0052` 173 passed, full runner 3770 passed; independent security review: nothing above Low; design review of the Finance screens: no High/Medium, nits fixed; Jeffrey: "Pasted, it ran"; Claude's read-only checks: pre-check "already 0052's version", 11 fingerprint rows equal the tested ones, advisor unchanged). Commit 53c45ece. Jeffrey ran `0052_tests.sql`: "Tests passed" (2026-11-13). **Both migrations 0051 and 0052 are live and tested.**
- [ ] **Next batches (left):** Finance 0052 contract + migration (after 0051 is live; Board breaking payments in the Daily report, Close the day, History, Export, payment detail, labels, Open-in route); public family page + Function + Square webhooks per school (last; needs Domain's helper (merged) and Jeffrey's Square accounts and secrets, sandbox first); later, each with its own migration number via Main: Home card, Calendar items, people search.
- [ ] **Old plan (kept for the record):**
 reserve the migration number through Main (done: 0051, 0052); write the build contract (`docs/Board Breaking/CONTRACT-00NN.md`: tables, functions, who may call what); draw the screens (one picture per page at PC / tablet / phone, as combined PNGs): the family form (age instead of Program), the event list, the roster, Edit event / Settings (prices, age lines, board chart), and the Square "Pay" result screen.
- [x] **Staff screens built against the preview's fake database (2026-11-12, uncommitted on this branch):** Events tab, event page / roster, the student and payment dialogs, Chart and prices; `src/screens/breaking/`, `src/lib/breaking/`, `src/lib/mockBreaking.js` (checks: `node src/lib/breaking/checks.mjs`), wired in behind a build switch `VITE_BOARD_BREAKING` (lib/features.js; on in preview mode only). Pictures of what was built: `docs/Board Breaking/Build/`. Not built yet: the public family page, the Functions (Square), Finance 0052, Home / Calendar / people search.
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

- [x] **PUSHED 2026-11-13, on Jeffrey's own "push boardbreaking":** branch head e1283e97 + Domain batch 4 are live as `main` 297f30fa; Cloudflare Pages: success. Main's live checks: `/breaking/<code>` serves 200 with the strict policy and noindex; `/api/breaking/<code>` answers `{"status":"not_open"}` on GET and POST (switch off); the Square webhook answers 503 with `Cache-Control: no-store` (not configured yet); camp and home pages unchanged. **Nothing is on for users.** The family page, Function and webhooks are deployed but closed; the staff page is off by its build switch.
- [x] **Go-live step 2 DONE 2026-11-13: both logins have their passwords** (Jeffrey made them with a one-run script outside the repo, saved each in his password manager as a new entry, ran the two `alter role … password` lines, deleted the snippets and the script). Claude's read-only check in `pg_authid`: `brk_registrar` and `brk_square` each hold a `SCRAM-SHA-256$4096:…` verifier (before: none; the Camps login unchanged), the three verifiers differ, and nothing else about the two logins changed (connection limits 5 and 3, timeouts, empty search_path, no create / replication / bypass rights, member of nothing). Connection budget checked: max_connections 60, 25 in use, the seven restricted logins' limits add up to 33, so even the worst case fits.
- [x] **Go-live step 3, part 1 DONE 2026-11-13: the two Hyperdrive configurations** exist in Cloudflare (read-only check through the Cloudflare connection, no passwords visible): `tkd-brk-registrar` (user `brk_registrar.eozkfbdfxqlcbpewhach`) and `tkd-brk-square` (user `brk_square.eozkfbdfxqlcbpewhach`), both on the Session pooler `aws-0-us-east-1.pooler.supabase.com:5432`, database `postgres`, caching disabled, Verify full with the existing Supabase certificate, **origin connection limit 5** (the first was created at 20 and lowered). Creating a configuration tests the login, so both passwords work. **Still to do (Jeffrey, not visible to Claude):** the two Production-only bindings `HYPERDRIVE_BREAKING` and `HYPERDRIVE_BREAKING_SQUARE` and the text variable `BREAKING_REGISTRATION` = `off`.
- [ ] **Now: go-live steps with Jeffrey**, one at a time, in `GO-LIVE.md` order (logins → Hyperdrive/bindings → sandbox per school → staff page on → sandbox test → admin undoes the test payments the same day → sandbox-hosts-removal migration (next free number 0053 via Main) → production per school → registration on). Home card / Calendar items / people search for Board breaking: on hold until Jeffrey asks (each needs its own migration number through Main).
