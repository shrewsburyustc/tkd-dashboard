# Finance — status and plan

**Updated:** 2026-10-18 (Finance worktree session, branch `finance`)
**Rulebook at this update:** v0.216 (Finance rows: v0.193–v0.203, v0.207–v0.209, v0.215–v0.216) · **Questions:** `TKD-Finance-DailyReport-Questions.html` (this folder), images in `images/`

> Read `CLAUDE.md` (repo root) first. This file says where Finance stands and what comes next. Keep it current: update it in the same turn a step finishes or a decision is made.

---

## 1. Where things stand

Jeffrey decided (2026-10-18, v0.193) to add a **Finance** section to the dashboard. Its first tab is the **Daily report**: the day's payments for a school, because families now pay for Color belt testing and Star testing. **Design stage only.** Nothing built, no migration. Q1 answered (v0.194: B, report + Close the day). Q2 answered (v0.195: staff today only + close; admins any day, history, reopen). Q3 answered (v0.196: grouped Cash / Check / Card). Q4 answered (v0.197: arrows + calendar + History list). Q5 answered (v0.198: Both = one summary box per school). Q6 answered (v0.199: corrections shown on the original day). Q7 answered (v0.200: Print + admin CSV export of any range). Q8 answered (v0.201: ti-report-money, last on the rail, More on phones). Q9 answered (v0.202: reminder on Home, no amounts). Q10 answered (v0.203: Finance → Settings, a time per weekday per school). **All 10 questions answered.** Full mockups built (`TKD-Finance-DailyReport-Mockups.html`, 14 screens D1–D14 at PC / tablet / phone, images in `Mockup images/`), design-reviewed by a separate agent (1 blocker + 9 should-fix, all fixed: phone bar per v0.140, icons, staff hint, phone ⋯ menu D14, labeled check fields, error inside the box, Added after closing, 44px Home lines, Settings copy wording). **Next: screen-by-screen pass with Jeffrey, then the rule-5 question** (payments with students' names on any staff login, incl. the mat-side tablet — needs an explicit rule-5 exception or a way to hide Finance there).

## 2. Facts the plan is built on

- **Color belt payments exist and are live** (`public.testing_payments`, migration 0005): append-only rows with `amount_cents`, `method` (cash / check / card), `paid_on` (the school date), `recorded_at`, `recorded_by_name`; corrections are `reversal` rows. Each Color belt event belongs to one school (v0.34).
- **Star testing payments don't exist yet** (Star is designed, migration 0006 not built). Star events are joint; each candidate has a school (v0.58). The report shows Star payments once Star phase 3 is built.
- **Card means a card taken at the desk and recorded by hand.** No Square link yet (v0.98), so the card total is what staff recorded.
- The database dates an undo / edit's reversal on the day it's made (`testing_today()`), and an edit's new payment on the date the admin picks. The report shows corrections on the original day (v0.199), so it groups by the original payment, not by the reversal's date.
- Admins can change a payment's date (Edit payment, v0.147), so `paid_on` and the day it was recorded can differ. Proposed: the report goes by `paid_on`.
- Close the day (v0.194) needs a new table + functions, so Finance gets its own migration (next free number when building).
- Money is billing data: rule 5 keeps it off list views on the mat-side tablet. Who may open Finance is question 2.

## 3. Questions (one at a time, each with a picture; 10 in all — Home split off from 8; the reminder setting added after 9)

1. **What the Daily report does** — A read only · B + close the day (count the drawer, short / over) · C + bank deposit. **done v0.194 (B: report + Close the day)**. Follow-ups to ask: who closes / reopens, no-payment days, checks by number or amount, closed-days history.
2. Who can see Finance, close the day, reopen a closed day (A admins only · B staff close today, admins any day + reopen · C same for both, admins reopen) — **done v0.195 (B)**
3. Page layout: totals, then the list grouped how (by time · by how paid · by testing event) — **done v0.196 (B: grouped by how paid)**
4. How admins move between days and see the closed-day history — **done v0.197 (C: arrows + calendar + History list)**
5. Location switcher: one school vs Both (Star payments count for the candidate's school) — **done v0.198 (C: one box per school, Open [school] shows its full report)**
6. Undone and edited payments: hidden, shown struck through, or listed separately — **done v0.199 (B: struck through / Edited on the original day; Changed after closing)**
7. Print and export (paper copy, CSV for the bookkeeper) — **done v0.200 (C: Print with signable line + admin CSV export of any range, logged)**
8. Rail icon and place (other branches add Schedule, Calendar, Forms, Prospects; phone bar already uses More) — **done v0.201 (A: ti-report-money; Total card gets another icon)**
9. Anything on Home (added: Q8 grew too big for one question) — **done v0.202 (C: close-the-day reminder, no amounts)**
10. The reminder setting in Finance (Jeffrey asked for it): one time per school · a time per weekday · after the last class — **done v0.203 (B: time or Off per weekday per school; admin-only Settings tab)**

## 4. After the questions

**To confirm in the full mockups** (proposals made along the way): History on Both (v0.198); hide 10-second mis-click undos and how a date-changing edit shows (v0.199); Total card icon `ti-sum` (v0.201); `ti-history` is also "Past schedules" on the Prospects branch — same meaning (past records), to confirm; days with no payments; checks counted by number or amount; whether a short / over note is required for a few cents.


Full mockups at PC / tablet / phone → separate design reviewer agent → screen-by-screen pass with Jeffrey → build plan + contract (migration number: next free when building; 0010 is taken by Prospects) → security reviewer → build in the preview → Jeffrey's OK at each checkpoint. Nothing deployed without his OK.

## 5. Decisions made (details in rulebook 10b)

| Version | Decision |
|---|---|
| v0.193 | **Finance section added**; its first tab is the **Daily report** (the day's testing payments per school). Designed one question at a time. |
| v0.194 | **Q1 (B): report + Close the day.** Totals + payments list, any day, Print; staff enter cash counted, number of checks, card machine total; Matches / Short / Over; a short or over needs a note; closed by name and time; later payments on a closed day are flagged. Needs a new table. |
| v0.195 | **Q2 (B): roles.** Staff see today only and close it; admins see any day, the closed-day history, and reopen (logged). Enforced in the database. Risk: desk-account closes log as “Staff”. |
| v0.196 | **Q3 (B): list grouped Cash / Check / Card**, each with count and total; payments in time order inside each group. |
| v0.197 | **Q4 (C): arrows + calendar + Today; History list** of a month's days (total, closed by + time, one tag), click to open a day. Admins only. |
| v0.198 | **Q5 (C): Both = one summary box per school** (total, cash · check · card, closed or not, Open [school]) + combined total; Open switches the dashboard to that school's full report. No list or closing on Both. To confirm: History on Both. |
| v0.199 | **Q6 (B): corrections on the original day.** Undone = struck through + Undone tag + who/when, not counted; edited = new amount + Edited tag + was/who/when; Changed after closing tag on closed days. To confirm: hide 10-second mis-click undos; date-changing edits. |
| v0.200 | **Q7 (C): Print** (one page, Counted by line to sign) + **admin Export…** any date range as CSV; each download logged. |
| v0.201 | **Q8 (A): `ti-report-money`**, last on the rail, under More on phones. Risk: looks like Forms' clipboard. Total card needs another icon (proposed `ti-sum`). |
| v0.202 | **Q9 (C): Home reminder** “Today's drawer isn't closed yet” from a set time on days with payments, no amounts; admins see earlier unclosed days. Reminder time is a setting in Finance (Q10). |
| v0.203 | **Q10 (B): Finance → Settings** (admins only): reminder On / Off + a time or Off per weekday per school; Copy Monday to weekdays. |

## 6. Screen-by-screen pass (mockups D1–D14)

- **D1 approved** 2026-10-18 incl. proposals: checks counted by How many + Total; Expected line shown under each count; Total card icon `ti-sum`; Close the day gray until all three are filled; new icon-map rows as listed.
- **D2 approved** incl. proposal: a note is needed for any amount short or over (even cents).
- **D3 approved** incl. proposals: Undo of a close for 10 seconds (then “Ask an admin to reopen the day”); a payment recorded on a closed day marks it Changed after closing.
- **D4 approved** incl. proposals: staff mis-click undos within 10 seconds are not shown; a payment moved to another date shows on the new day, with “Moved to <date>” struck through on the old day; Added after closing tag.
- **D5 approved** incl. proposals: no-payment days listed (gray); Back to the day returns where you came from; today's row says “Today · open” until closed; amber line counts unclosed days this month.
- **D6 approved** incl. proposals: on Both, arrows / calendar / History still work (History adds a School column); Print and Export hidden on Both; staff on Both see the same boxes for today; boxes in switcher order (Worcester, Shrewsbury).
- **D7 approved** incl. proposals: file name <School>-<from>-to-<to>.csv; From / To are browser date fields with the weekday written under each (as v0.147).
- **D8 approved** incl. proposals: long days continue on page 2 with the header repeated; corrections print as on screen.
- **D9 approved** incl. proposals: times in 15-minute steps (Off, 11:00 AM–11:00 PM); saves on change with a 5-second Undo, logged; phones one school at a time with a switch; Copy each school's Monday to Tue–Fri; Off grays the times.
- **D10 approved** incl. proposals: on Both, one reminder line per school; the admin's earlier-days line counts the last 30 days; whole line is a 44px link.
- **D11 approved** incl. proposal: no Close the day and no Home reminder on days with no payments (“No payments recorded today. Nothing to close.”).
- **D12 approved** incl. proposals: clicking a payment row opens a view-only detail (payment facts + history of changes, Open in Testing); no DOB or private details.
- **D13 approved** incl. proposals: a failed close keeps everything typed, Not saved tag, error inside the box above the button (exception to rule 3.5's banner, this box only), button becomes “Retry close the day”; wording “Couldn’t close the day. Nothing you typed is lost. Check the connection and try again.”
- **D14 approved.** **All 14 screens approved 2026-10-18 (v0.207).** Next: the rule-5 question, then the build plan + contract.
- Rule-5 question (Q11) sent: A exception only · B exception + per-device “Mat-side device” switch (recommended). Picture: `images/Finance-Q11-rule5.png` (`#q11`).
- **Q11 answered (v0.208, B):** rule-5 exception for staff devices + per-device **Mat-side device** switch (account menu → This device) hiding Finance, the reminder link and Testing roster payment details. **Touches Testing screens** — coordinate with the Color Belt and Star sessions. To confirm: admins only can turn it off.

## 7. Next

Build plan + contract (like `TKD-Testing-Phase2-Build-Plan.md` / `CONTRACT-0005.md`): tables (day closings, reminder settings, export log), read functions over `testing_payments` (+ Star's once built), roles, migration number (next free), PGlite tests, security reviewer. Then build in the preview with checkpoints. Nothing built or deployed without Jeffrey's OK.

**2026-10-18:** build plan `TKD-Finance-Build-Plan.md` + draft `CONTRACT-0011.md` written and security-reviewed (fixes applied). Migration **0011** (0010 is used by both Prospects and Color Belt phase 3 — Main session to resolve). Found: **Star refunds** (0006, live) aren't in the approved screens → plan §6 Q1, asked next with a picture. Waiting on: CP0 OK, plan §6 Q1–Q4, OK to merge `main` into `finance` (step 0).
- Plan §6 Q1 (refunds) picture sent: `images/Finance-Q12-refunds.png` (`#q12`): A inside the Cash / Check group · B own Refunds group, cards show money in (recommended). Both: refund-only day asks “Cash taken out of the drawer”.
- Refunds answer (Jeffrey): **both layouts, switchable** (Own group / In groups); Close the day the same in both. Follow-up sent: where the switch lives (`images/Finance-Q13-refund-toggle.png`, `#q13`): A Finance → Settings for everyone (recommended) · B switch on the report per device.
- **Refund switch: B (v0.209)** — on the Daily report next to Print (phones under ⋯), each device remembers; default Own group (proposed); Print / Export follow the screen (proposed). Plan §6 Q1 done. Next: plan §6 Q2 (Mat-side switch as its own step).
- **Q2 changed by Jeffrey (2026-10-18):** don't block payments on the tablets (used during testing); instead a **hide-payments mode** staff turn on when students / parents are around and off when needed. Changes v0.208's fixed Mat-side device. Follow-up sent (`images/Finance-Q14-hide-payments.png`, `#q14`): A account menu · B one-tap top-bar button · C B + hides again on lock / next day (recommended).
- **Hide-payments switch: A (v0.215)** — account menu, anyone, remembered per device, gray Payments hidden chip in the top bar (tap to show). Replaces v0.208's fixed Mat-side device; tablets show payments by default.
- **Plan §6 Q2–Q4 approved as listed (2026-10-18):** hide-payments switch + chip + Finance / Home hiding in this build, Testing roster hiding right after with those sessions; reminder times seeded Off; export ≤ 1 year; History back to the first payment; card total vs hand-recorded card payments; a day with only undone payments = no payments. **Next: step 0 (merge `main` into `finance`, needs Jeffrey's OK), then CP0 (plan + contract OK), then build.**
- **Step 0 done (2026-10-18):** `main` merged into `finance` (8a5ada5); only the rulebook conflicted, both sides kept, version line v0.215. `main` now has 0006 (Star) and 0010 (Color Belt phase 3), so the Prospects branch's 0010 must be renumbered by the Main session; Finance stays 0011. **Next: CP0 (plan + contract OK), then build.**
- **CP0 OK'd (2026-10-18, v0.216):** plan + CONTRACT-0011. Build started: builders A database, B data layer + mock, C screens.

## 8. Later: Black Belt payments (note from the Black Belt session, 2026-10-18)

Black Belt testing (branch `black-belt`) will store payments in its own append-only `bb_…` table: kinds payment / reversal / refund / **returned check (bounced)**; method cash / check / card; amounts above $1,000 (4th Dan fee $2,700); each row stores the school **at recording time** (not the candidate's current school), the cycle name (e.g. "Spring 2027") and what it's for ("Payment 2", Kukkiwon certificate) → For column "Black Belt · Spring 2027 · Payment 2". Same day rule (counts on the day recorded, incl. post-dated checks). Finance adds the table to its own read functions when both are built (not in this build). Finance must then handle a new **returned check** kind.
**Open questions for Jeffrey (not needed for this build):** (1) Does Black Belt money belong in the school's Daily report at all? (BB checks are made out to Master Jeong personally.) (2) A bounced check weeks later shows on the original day (v0.199) and marks that day Changed after closing — wanted?
Rulebook numbers: Black Belt uses v0.204, v0.205, v0.209–v0.213, v0.216–v0.220 on `black-belt` — overlaps Finance's v0.209, v0.215–v0.216; renumbered at merge.

## 9. Build round 1 (2026-10-19)

Builders A (0011 + tests), B (data layer + mock), C (screens) done; PGlite 154 passed / 0 failed; checks + both builds pass. Security review: no must-fix; fixes in progress (infinite dates, close-day single read, History speed + one-call export preview, tests with the real 0005/0006 writers, CSV BOM + guard, mock parity). Design review: no blockers; fixes in progress (Home earlier-days per school + History month, print shows Changed after closing, Open in Testing → the event, focus return, 320 date row, chip tap area, phone Copy Monday = school shown, wording/aria nits).
**At merge (Main session):** Finance must move under **More** on phones (v0.201 / v0.140) — this branch has no More menu, so it's in the bottom bar here. Add `ti-receipt-refund` (phone refunds menu item), `ti-currency-dollar-off` and the v0.207 icon rows to the §2.4 map.
**Kept as built (reviewed, agreed):** Undo toast 5 s (DB allows 10 s); Reopen day without confirmation (logged, can close again); phone ⋯ sheet has a title; dialogs have Close, no X; phone chip icon-only; reminder times locked while Off. **Export count line** has no "· N corrections marked" (no source) — check at CP1.

## 10. After build round 1 (2026-10-19)

- Build committed (278539b) after the reviews; `main` merged again (5fbf8e7): rulebook numbers are now **one block per branch** (v0.300) — Finance's block is **0.800–0.899**; earlier Finance rows keep their numbers until Finance merges into `main`.
- **Close the day → a dialog (v0.800, Option C):** “Close the day…” button next to Print (phones under ⋯) opens the counting box in a dialog; typed counts kept as a draft; Day closed summary stays on the report. Screens builder updating it before CP1.
