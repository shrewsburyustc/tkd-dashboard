# Black Belt testing — status

**Updated:** 2026-10-18 (Black Belt worktree session, branch `black-belt`)
**Rulebook at this update:** v0.300 on main (merged). **Black Belt's number block is 0.900–0.999** (v0.300); used so far: 0.900–0.908. Older Black Belt rows: v0.204, v0.205, v0.209–v0.213, v0.216–v0.220, v0.224 (0.209 and 0.216 clash with Finance and move into 0.9xx at merge if Finance merges first).

> Read `CLAUDE.md` (repo root) first. This file says where Black Belt testing stands and what comes next. Keep it current: update it in the same turn a step finishes or a decision is made.

---

## 1. Where things stand

**Design stage.** Jeffrey asked (2026-10-18) for Black Belt testing to be the last testing section, focusing on registration, grading and recording payments, built alongside Finance's Daily report.

- Research is done (inventory files in `Inventory/`).
- **The plan is approved** (v0.204): `TKD-BlackBelt-Plan.md`. Two reviewer agents checked it first (§4).
- **Black Belt is built now**, not queued behind other sections (v0.205; B1 withdrawn). B2 (where it lives) follows rule v0.59: the third row of the Testing chooser, with Star's page layout (v0.60). B3 answered (v0.209): a cycle holds a **list of testing days**, each with the parts graded that day. B4 answered (v0.210): roles same as Star. B5 answered (v0.211): form fields like Star's. B6 answered (v0.212): open form, staff check. B7 answered (v0.213): waiver kept a set number of years. B8 answered (v0.216): requirements in a compact full-screen panel; confirmation page replaces the email. **Registration questions done.** B9 answered (v0.217): any payment plans, due dates per plan. B10 answered (v0.218): post-dated checks all count the day they are handed in. B11 answered (v0.219): roster Payments column with next / late / not paid. B12 answered (v0.220): one printable receipt with the full history. **Registration and payment questions done (B2–B12).** Grading questions (B13–B18) wait for Master Jeong's answers (part A; printable sheet `TKD-BlackBelt-Rules-For-Master-Jeong.html` / `.pdf`).
- Nothing is built and there is no migration. The branch includes main up to `5ccb355` (Star 0006 live).

## 2. Files

| File | What |
|---|---|
| `TKD-BlackBelt-Plan.md` | The plan: today's system, urgent live issues, timing, improvements, scope, fit, Finance, order of work, questions |
| `Inventory/Old-AppsScript.md` | Every function, rule and problem in the old Apps Script (2,305 lines) |
| `Inventory/Old-Spreadsheet.md` | Every sheet, formula, dropdown and config table in the old workbook (no personal data) |
| `TKD-BlackBelt-Questions.html` | B1 (withdrawn) |
| `TKD-BlackBelt-Cycle-Questions.html` | B3: what a cycle holds (answered B) |
| `TKD-BlackBelt-Roles-Questions.html` | B4: who can do what (answered A) |
| `TKD-BlackBelt-Form-Questions.html` | B5–B8: the public registration form (all answered) |
| `TKD-BlackBelt-Payments-Questions.html` | B9 onward: plans, prices, payments |
| `images/` | One PNG per question |
| `Inventory/Old-RegistrationPage.md` | The live public page, field by field, plus how Color Belt's form compares |

## 3. Next steps

1. Jeffrey checks the urgent live-system items (plan §2): the live Sheet before Oct 24, and the `updateInfo` stopgap.
2. **Mockups approved (v0.900, 2026-10-19).** **Database plan drafted and security-reviewed** (`TKD-BlackBelt-DB-Plan.md`, proposed migration 0016, to reserve with Main before SQL); its 7 questions (Q-B1…Q-B7) are asked one at a time (`TKD-BlackBelt-DB-Questions.html`), then the §8 defaults together. **Then:** the database plan for cycles, registration and payments (its own questions, like Star's Q-D list) → build contract → security reviewer → build in the preview (B1 cycles + prices + public form, B2 candidates + payments). Grading questions B13–B18 once Master Jeong answers part A.
3. **Finance note sent** 2026-10-18 with Jeffrey's OK (`Finance-note-draft.md`; two questions for Jeffrey in it: Black Belt money in the school's Daily report at all? bounced checks on closed days?).
4. **Jeffrey asks the school's insurer** how many years signed waivers must be kept (v0.213 setting).
5. Jeffrey hands Master Jeong the printable rules sheet (part A) and brings back the answers.

## 3b. Mockup pass (screen by screen, 2026-10-18)

| Screen | Result |
|---|---|
| Cycles 1 · Testing chooser | **OK**: medal icon (`ti-award`), next-testing-day line approved |
| Cycles 2 · Cycles tab (admin) | **OK**: status tags (Open until / Registration closed / Next day / Testing today; Past the day after the last day) and Delete cycle only while no payment is recorded approved |
| Cycles 3 · Staff view, empty states | **OK** |
| Cycles 4 · Add cycle | **OK**: first cycle copies Fall 2026 (loaded once from the Sheet), then each copies the last; "Offer this plan" tick per plan; payment 1 follows Application due until changed |
| Cycles 5 · Testing day dialog | **OK**: the four v0.209 details: Save refused while a part is on no day; a part may be on two days (grades count as one); outdoor = second part of the same day; a day (or a part) with grades can't be deleted / unticked |
| Cycles 6 · Rubric and prices | **OK**: plan order by drag = order on the form; waiver versions "2027-1"; keep signed waivers N years after the last testing day, under-18s until 3 years after 18 if later (N from the insurer) |
| Cycles 7 · Registration links | **OK + change**: Jeffrey added **Download QR code** (PNG) per school, always available (open, not open yet, closed) for staff and admins; no flyer for now; `?dan=` hint; new random codes each cycle |
| Cycles 8 · Cycle page | **OK**: summary line (first day · testing days · both schools · candidates); ⋯ menu (Edit cycle, Registration links, Open/Close registration) instead of a button |
| Form 1 · Step 1 empty | **OK**: cycle box shows dates and places only; Kukkiwon fee and plan amounts show once a Dan is chosen; Kukkiwon starts on "No, thanks" |
| Form 2 · Step 1 filled | **OK**: one two-line card per plan (name + total; payments + dates); total box shows the chosen plan's schedule with Kukkiwon in payment 1 |
| Form 3 · Requirements panel | **OK**: dialog on tablet and PC (full screen on phones); credits per subject and a maximum per part; extra-point numbers wait for Master Jeong (part A) |
| Form 4 · Step 1 errors | **OK**: Star's messages + "Choose the Dan the candidate is testing for." and "Choose how you'll pay." (amber border on the plan cards) |
| Form 5 · Step 2 check and send | **OK**: signature label adds "(parent or guardian)" for under-18s; adult signer's name prefilled from the candidate (editable); Read all opens the full waiver in the panel / dialog; privacy line under Send |
| Form 6 · Step 2 missing items | **OK**: "Tick the box to agree to the waiver." and "Enter the name of the person signing." (+ Star's signature message) |
| Form 7 · Registered | **OK**: What to pay as a Due by · For · Amount table; Kukkiwon steps wording; printout drops buttons and adds the Dan's requirements fully opened; Register another refills email and plan, no combined schedule; results line waits for email |
| Form 8 · Can't register | **OK**: not open yet / closed after the application date ("ask at the front desk") / sending failed ("Try again", no duplicate) / closed while filling in keeps the summary on screen |
| Form 9 · PC version | **OK** |
| Candidates 1 · Candidates tab | **OK**: duplicates left out of cards until resolved; Late shows only the overdue amount; order Dan → school → last name; tablet puts Dan/school under the name and Record payment in ⋯; phone one line + pills; mat-side tablet setting hides cards, money and payment buttons |
| Candidates 2 · Staff view | **OK**: role table as v0.210; gray staff line under the tabs once registration has closed |
| Candidates 3 · Candidate detail | **OK**: Record payment stays on paid-in-full candidates; Remove = Star's Withdraw / Delete permanently; no history section (change log keeps everything) |
| Candidates 4 · Record payment | **OK**: "For" is a checklist of unpaid items that fills the Amount with their sum (editable); "Owes … due today" line; "Save and record another"; one check for two items = one line "Payment 1 + Kukkiwon" |
| Candidates 5 · Admin payment actions | **OK**: Edit needs a reason; Undo = instant with Undo toast; refund capped at what's been paid, counts the day recorded; Mark check returned has a note only (no bank fee); toast wording |
| Candidates 6 · Change plan or Kukkiwon | **OK**: staff before anything is paid; grayed for staff after a payment; admin allowed with the amber "already paid … balance worked out again" line; Kukkiwon added late is due at once; plans in Rubric and prices order with a "Current" tag |
| Candidates 7 · Add candidate (desk) | **OK**: form fields + School + "Waiver signed on paper" (required); desk-added candidates get a reference (BB-####, differs from Star); opens straight away (no New / Make-up menu); due dates already passed count as due today for a late family |
| Candidates 8 · Print receipt | **OK**: letter page as drawn; opens a preview first with "Print or save as PDF"; notes and "recorded by" not printed; DOB and email never printed |
| Candidates 9 · Overpaid, Kukkiwon in the tag | **OK**: "Paid in full · ⚠ $X overpaid" (amber) with −$X balance and "Record refund · $X overpaid" in ⋯ (admins); Paid in full needs the plan and the Kukkiwon fee; a late Kukkiwon-only amount is named ("Late · $110 Kukkiwon since Mar 27"); Plan column shows "· Kukkiwon" |

**All 26 screens approved 2026-10-19** (rulebook v0.900).

**Redraw for v0.902 approved 2026-10-19:** Add cycle with the Prices and payment due dates section (filled in from the previous cycle; + Add plan asks name + number of payments, then amounts and due dates in the grid), Edit cycle with prices read-only (due dates still editable), Rubric and prices with the waiver only.

## 4. Reviewer check of the plan (2026-10-18)

There were two reviewers:
- **(R1)** accuracy and completeness against the raw Apps Script, workbook and inventories
- **(R2)** process rules, rulebook decisions, handoff §6 security, Finance fit and feasibility

All the items below were applied to the plan.

| From | Finding | Change made |
|---|---|---|
| R1 must | "Send Make-Up Emails reads moved columns" was wrong. The real risk is no confirmation prompt, and mid-cycle it emails everyone as not passing | §2.3 rewritten |
| R1 must | The "first 20 rows" bug was understated: it's 20 rows across all Dans, so 2nd–4th Dan likely get no result. Leftover "PASS!" values with pass mark 0 sit below row 24 | §2.3 |
| R1 must | Timing was misread. Spring 2026 application due Mar 28; Fall registrations started Jun 17 and 17 of 43 came after the deadline. Registration must be live by ~early Feb, not March | §3 |
| R1 must | The waiver says fees are "applied to the next test if not passed" (a credit) | §1, §5, §7, A10, B10 |
| R1 must | Go-live would remove the requirements page, payment schedule and Kukkiwon instructions | §5 "needed at go-live", B8 |
| R1 should | Missing questions: make-ups for "BELOW PASSING" with no D, examiners, admin override, student-record link, older make-ups, old log / Drive signatures at switch-off | A7, A8, A11, B6, B18, §3 |
| R1 should | Three different age cut-off sets (physical, target kick, pull-up); the 4th Dan cr-4 table list; late registration | §1, §4, A1, A4, A9 |
| R1 nice | The export is probably a copy; the Log is intact; doGet/JSONP is public; phone/address editable; Kukkiwon may need sex; receipt contents | §1, §2, A12, B5, B12 |
| R2 must | The status file didn't exist | this file |
| R2 must | "Same shape as Color Belt/Star" was false: the $1,000 cap per row is less than a $2,700 4th Dan fee, and the kinds differ. A returned-check kind is needed | §4, §7.1 |
| R2 must | DOB on the grading tablet (Star's hide is screen-only). Physical is graded at a public arena | §4, B14: database returns the age bracket only |
| R2 should | Star version numbers will change at merge | cited by title (§6) |
| R2 should | A Finance "view" can't enforce v0.195 (staff today only) | §7.2: Finance-owned checked function |
| R2 should | Post-dated check question framed wrong; checks payable to Master Jeong personally; bounced checks vs closed days | §7.3 |
| R2 should | School + cycle name must be stored on each payment row | §7.1 |
| R2 should | When signatures are deleted needs its own question | B7 |
| R2 should | Order of work too serial; rubric editor in B1; build queue; a third form login in the checkpoints | §3, §8 (two tracks, editor moved to B3, B1 build-priority question, CP adapted) |
| R2 nice | Stopgap: delete the `updateInfo` branch rather than adding a password; check for planted values; Drive sharing; copy before restoring | §2.1, §2.2 |
| R2 nice | Parent email for under-18s; never store passport photos; `CLAUDE.md` as a shared file; payments off the grading screens | B5, §5, §10, §4 |

## 5. Decisions made

| Version | Decision |
|---|---|
| v0.204 | **Black Belt testing added** as the last testing section; plan approved. Registration, grading and payments come first, for Spring 2027, alongside Finance. Two design tracks (grading waits for Master Jeong's rules answers). |
| v0.205 | **Built now**, in this session, not queued behind other sections; design-first order still applies; B1 withdrawn. |
| v0.209 | **B3 (B): a cycle holds a list of testing days**, any number, each with name, date, time, place and the parts graded that day; deadlines + payment due dates; copied from the last cycle. Four details to settle with the mockups. |
| v0.210 | **B4 (A): roles same as Star.** Staff record payments (5-second Undo), add/fix candidates, grade; admins do setup, later payment changes, refunds, bounced checks, removals, reopening after the closing date. Enforced in the database. |
| v0.211 | **B5 (A): form fields like Star's**: first + last name for the belt, DOB, Dan, Kukkiwon yes/no, payment plan with amounts, one email for results; school from the link; no sex, phone or parent name (sex only if Kukkiwon needs it). |
| v0.212 | **B6 (A): open form**, registrations count at once, staff check the list; closes at the end of the application date; late families added by staff, or an admin reopens. |
| v0.213 | **B7 (A): waiver step** (versioned text, I agree, signer's name, signature; parent signs for under-18s on the first testing day); **signed waivers kept a set number of years** (admin setting, number from the insurer), then deleted automatically; admins only open signatures. |
| v0.216 | **B8 (compact A): requirements panel** from one line on the form (parts → subjects → scoring, from the cycle's rubric); confirmation page with what to pay, testing days, Kukkiwon steps, reference, print; old Worker page can be switched off later. |
| v0.217 | **B9 (C): any payment plans** (list on Rubric and prices; each plan: number of payments + amount per payment per Dan) + Kukkiwon fee per Dan; cycles copy them; changes v0.209: due dates per plan. Four details to settle with the mockups. |
| v0.218 | **B10 (B): post-dated checks** recorded when handed in; all count as paid that day (like Color Belt and Star); optional note, no check date or number. |
| v0.219 | **B11 (A): roster Payments column**: Paid in full / Next $X by date / Late · $X since date / Not paid, + balance; summary cards filter the list. |
| v0.220 | **B12 (A): one printable receipt** per candidate with the full payment history, totals and balance; email later. |
| v0.224 | **Changes v0.219:** unpaid registrants stay gray "Next $X by [date]" (Paying on schedule) until the first due date passes, then red Not paid. |
| v0.900 | **Mockups approved**: cycles (8), family form (9), Candidates/payments (9), all amber proposals, plus Download QR code at any time (Jeffrey). First row of Black Belt's 0.900–0.999 block. |
| v0.901 | **DB Q-B1 (B):** a requirements sheet per cycle (Fall 2026 numbers, no editor) feeds the form panel until grading; the rubric is built in spring after Master Jeong's answers and the sheet dropped. |
| v0.902 | **DB Q-B2:** prices live on each cycle: Add cycle pre-fills the previous cycle's plans, amounts and Kukkiwon fees (editable there); **set once the cycle is saved**; Rubric and prices drops its price sections; "Offer this plan" ticks removed. Changes v0.217 and screens 4 and 6. |
| v0.903 | **DB Q-B3 (A):** each payment row keeps the school and cycle name as they were when paid; corrections copy them; a later school fix doesn't move recorded money. |
| v0.904 | **DB Q-B4 (A):** payment records are never deleted; a candidate with any payment record can only be withdrawn; a cycle with one can't be deleted; enforced in the database (on delete restrict, guard refuses every delete). |
| v0.905 | **DB Q-B5 (A):** a family signs the waiver version they saw if it was current within the last 24 hours; older versions are refused ("Please reload the page"). |
| v0.906 | **DB Q-B6 (A):** at the end of the keeping time the signature and signer's name are removed (also hidden in the change log); that a waiver was signed, when and which version stays. |
| v0.907 | **DB Q-B7 (C):** date of birth and email removed on the same day as the waiver signature, also hidden in the change log; names, Dan, results and payments stay. **All 7 database questions answered.** |
| v0.908 | **DB plan §8: all 19 smaller defaults OK'd.** Next: build contract CONTRACT-0016 → security review → Jeffrey's OK. |

**Where it stopped (2026-10-19):** Migration **0016 reserved** by the Main session (main 8bc5469, merged). `0016_black_belt.sql`, `0016_tests.sql`, `0016_fingerprints.sql`, `0016_seed_review.txt`, PGlite step 15 and SETUP "Migration 0016" (0016a–0016h) written; **PGlite 239 passed, 0 failed**. Separate security review: no must-fix; S1 (clear `request.jwt.claim` in the form wrapper; same gap live in 0005/0006, for Color Belt/Star) and N1 (guard: undo keeps the method, returned row dated today), N4 (reset BB- counter after the first test run), N5 (undo script refuses with data) applied; N2/N3 (rate limit slightly exceedable across cycles; a registration may time out behind a big purge) accepted as in 0006. **Nothing applied to Supabase.** **CP1 OK 2026-10-20** (rulebook v0.910). **Next:** B1 preview build (cycles, Rubric and prices, family form) → security + design review → CP2; then B2 (candidates, payments).

**Color Belt's central `current_session_id()` fix (rulebook v0.408, migration likely 0020):** handled. `0016_tests.sql` C8 accepts both the old and the fixed body (d724cf1), so the paste order doesn't matter.

**For B2 (main's rulebook v0.303, 2026-10-20):** `ti-cash` means cash only, and any "Payments recorded" card or tile uses `ti-sum`. The approved Candidates mockups have no Payments recorded card, but they use `ti-cash` on the **Record payment** button and menu items (card, check or cash). B2 should use a neutral icon there instead; check it at the B2 design review and show Jeffrey at CP2.
