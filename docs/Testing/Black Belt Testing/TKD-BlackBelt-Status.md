# Black Belt testing — status

**Updated:** 2026-10-18 (Black Belt worktree session, branch `black-belt`)
**Rulebook at this update:** v0.300 on main (merged). **Black Belt's number block is 0.900–0.999** (v0.300); used so far: 0.900–0.908. Older Black Belt rows: v0.204, v0.205, v0.918–v0.213, v0.919–v0.220, v0.224 (0.209 and 0.216 clash with Finance and move into 0.9xx at merge if Finance merges first).

> Read `CLAUDE.md` (repo root) first. This file says where Black Belt testing stands and what comes next. Keep it current: update it in the same turn a step finishes or a decision is made.

---

## 1. Where things stand

**Design stage.** Jeffrey asked (2026-10-18) for Black Belt testing to be the last testing section, focusing on registration, grading and recording payments, built alongside Finance's Daily report.

- Research is done (inventory files in `Inventory/`).
- **The plan is approved** (v0.204): `TKD-BlackBelt-Plan.md`. Two reviewer agents checked it first (§4).
- **Black Belt is built now**, not queued behind other sections (v0.205; B1 withdrawn). B2 (where it lives) follows rule v0.59: the third row of the Testing chooser, with Star's page layout (v0.60). B3 answered (v0.918): a cycle holds a **list of testing days**, each with the parts graded that day. B4 answered (v0.210): roles same as Star. B5 answered (v0.211): form fields like Star's. B6 answered (v0.212): open form, staff check. B7 answered (v0.213): waiver kept a set number of years. B8 answered (v0.919): requirements in a compact full-screen panel; confirmation page replaces the email. **Registration questions done.** B9 answered (v0.217): any payment plans, due dates per plan. B10 answered (v0.218): post-dated checks all count the day they are handed in. B11 answered (v0.219): roster Payments column with next / late / not paid. B12 answered (v0.220): one printable receipt with the full history. **Registration and payment questions done (B2–B12).** Grading questions (B13–B18) wait for Master Jeong's answers (part A; printable sheet `TKD-BlackBelt-Rules-For-Master-Jeong.html` / `.pdf`).
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
| Cycles 5 · Testing day dialog | **OK**: the four v0.918 details: Save refused while a part is on no day; a part may be on two days (grades count as one); outdoor = second part of the same day; a day (or a part) with grades can't be deleted / unticked |
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
| v0.918 | **B3 (B): a cycle holds a list of testing days**, any number, each with name, date, time, place and the parts graded that day; deadlines + payment due dates; copied from the last cycle. Four details to settle with the mockups. |
| v0.210 | **B4 (A): roles same as Star.** Staff record payments (5-second Undo), add/fix candidates, grade; admins do setup, later payment changes, refunds, bounced checks, removals, reopening after the closing date. Enforced in the database. |
| v0.211 | **B5 (A): form fields like Star's**: first + last name for the belt, DOB, Dan, Kukkiwon yes/no, payment plan with amounts, one email for results; school from the link; no sex, phone or parent name (sex only if Kukkiwon needs it). |
| v0.212 | **B6 (A): open form**, registrations count at once, staff check the list; closes at the end of the application date; late families added by staff, or an admin reopens. |
| v0.213 | **B7 (A): waiver step** (versioned text, I agree, signer's name, signature; parent signs for under-18s on the first testing day); **signed waivers kept a set number of years** (admin setting, number from the insurer), then deleted automatically; admins only open signatures. |
| v0.919 | **B8 (compact A): requirements panel** from one line on the form (parts → subjects → scoring, from the cycle's rubric); confirmation page with what to pay, testing days, Kukkiwon steps, reference, print; old Worker page can be switched off later. |
| v0.217 | **B9 (C): any payment plans** (list on Rubric and prices; each plan: number of payments + amount per payment per Dan) + Kukkiwon fee per Dan; cycles copy them; changes v0.918: due dates per plan. Four details to settle with the mockups. |
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

**B1 built and reviewed (2026-10-20):** contract `CONTRACT-0016-B1.md`; builders B (data layer + preview store), C (staff screens Cycles 2–8), D (family form Form 1–9), E (public Function, off until CP5). Security review: no must/should fix; 5 small improvements applied. Design review: 2 layout bugs + 5 mockup mismatches + 6 polish items fixed (efe844d). Checks: both builds, Black Belt / Color Belt / Finance lib checks, Function tests 106/106, PGlite 456/0. **CP2 for B1 OK'd 2026-10-20 (rulebook v0.911); OP-1 = A** (temporary preview-only link until Star's chooser is on main, then step C2). **Next: B2** (candidates and payments). **Still to do before CP3:** a PGlite step `step0016_after_new_students` (0016 on top of 0007–0020).

**B2 built and reviewed (2026-10-20):** contract `CONTRACT-0016-B2.md`; builders B (data layer + preview store), C (Candidates 1–7, 9), R (receipt, Candidates 8). Security review: 1 must (Hide payments showed DOB/email in Edit details) + 1 should + small ones, all fixed; design review: 1 must (focus in Edit details) + 13 layout items + polish, all fixed (024a994). PGlite has `step0016_after_new_students` (508/0). **Decided 2026-10-21:** OP-B1 = A (v0.912), OP-B2 = A (v0.913), OP-B3 = A (v0.914: `ti-cash-plus` / `ti-cash-edit` / `ti-circle-x`). **CP2 for B2 OK'd 2026-10-21 (v0.915).** B1 + B2 done in the preview. **Next:** the go-live steps CP3–CP6 (each with Jeffrey's OK), C2 when Star's chooser reaches main, B3 grading after Master Jeong's answers.

**CP3 prepared (2026-10-21), nothing applied:** run sheet `TKD-BlackBelt-CP3-RunSheet.md` (reviewed; fixes applied). Read-only production checks clean (no `bb_` objects; 15 shared helpers identical; accounts OK; 22 MB; advisor + whole-database snapshot baselines taken). PGlite production-order step covers every live migration: 678/0. **CP3 done 2026-10-21 (rulebook v0.916): migration 0016 is LIVE on production** (pasted by Jeffrey from commit 5a670d0). Checks: 0016 fingerprints = tested copy (274 rows; only `members=postgres` differs); the 15 earlier fingerprint files and the whole-database snapshot identical before/after; advisor +25 "security definer executable" (Black Belt staff functions) + 2 "RLS no policy" (`bb_candidate_waivers`, `bb_starting_point`), nothing else; tests on production: 0016 ✓, 0006 ✓, 0011 ✓, 0018 ✓; **0005 T5b failed** on a timing assumption in Color Belt's test (it expects the attempts count +1, but the register call first cleans up 2 attempts rows older than 2 days that exist on production; 0016 not involved, 0005 fingerprints unchanged) — reported for the Color Belt session. Reference counter reset: 5001, unused. Size: 24 MB of 500 MB; expected growth ≈ 14 MB a season (≤ 70 KB per drawn signature × ~200), kept for years. **Next:** CP3b (`bb_registrar` password), CP4 (real waiver text), the merge of black-belt into main (Main session), CP5 (Cloudflare), CP6 (deploy with the form off, test registration). PGlite's production-order step should add 0021 (live since 2026-10-21) at the next update.

**CP3b done 2026-10-21:** `bb_registrar` has its own SCRAM password (checked read-only; connection limit 5); saved in Jeffrey's password manager (Google) as "Supabase bb_registrar (Hyperdrive)", username `bb_registrar.eozkfbdfxqlcbpewhach`. Script deleted. **Next:** CP4 (the school's real waiver text on Rubric and prices — needs the Black Belt screens on the live site, i.e. after the merge, or pasted by hand), then the merge into main, CP5 (Cloudflare), CP6.

**2026-10-21, v0.917 (changes OP-1):** the temporary "Black Belt testing ›" link shows in **every** build (preview, this PC against the real database, and the live site once merged + pushed with Jeffrey's OK). C2 later moves it into Star's chooser. Live build checked: Black Belt staff chunk present; no preview store, sample data, `__tkdPreview` or restricted function names (`bb_public_register_core`, `bb_purge_due`, `bb_starting_point`); only the real staff RPCs and readable tables. **Waiver text: not yet** (Jeffrey to agree it with his boss and coworkers). **Next:** look at Black Belt on this PC against the real database (read-only at first), then the merge into main (Main session), CP5 (Cloudflare), then CP4 + CP6 once the waiver text exists.

**0005 T5b (from CP3):** fixed by Color Belt (test-only; de9d226 on color-belt, reaches main at its next merge); Jeffrey re-ran it on production: ALL 0005 TESTS PASSED. So every test file run at CP3 passes on production. Note for CP5: rulebook v0.410 — the public forms need no RATE_LIMITER binding.

**Rulebook numbers (2026-10-21, before the merge into main):** Black Belt's old rows that clashed with main (Finance's v0.209, v0.216) are renumbered **v0.209 → v0.918** (testing days are a list) and **v0.216 → v0.919** (confirmation page and requirements), in the rulebook (10b + changelog) and every Black Belt doc, contract and code comment. Not changed on purpose: the two comment mentions inside the live migration 0016 (the file must stay as pasted) and the sent `Finance-note-draft.md`. The other old rows (v0.204, 0.205, 0.210–0.213, 0.217–0.220, 0.224) don't clash and keep their numbers. Block 0.900–0.999: **next free 0.920**.

**CP5 (Cloudflare) done 2026-10-21 (v0.920):** Hyperdrive `tkd-bb-registrar` (verified read-only: limit 5, caching off, verify-full), binding `HYPERDRIVE_BB` + `BB_PUBLIC_REGISTRATION=off` on Production (reported by Jeffrey). The `bb_registrar` password was regenerated once (the first saved copy didn't match); now saved under site `bb-registrar.example.com`. black-belt merged into main by the Main session (fast-forward to 0fc8eed + d424ace); 3 newer commits (Function blank-connection fix, CP5 docs) still to merge. **Next:** merge the rest, then the push (deploy) with the form off — Jeffrey's OK; CP4 waiver text when agreed; CP6 test registration.

**Rubric editor (new, 2026-10-21):** Jeffrey wants the rubric editable now (was B3). **Q1 = A (v0.921):** default rubric editable any time; a cycle's copy editable until registration first opens, then locked. Live site: deployed with the form off (main 4f06795, 2026-10-21 07:19 UTC; API answers not_open; Rubric and prices shows the waiver and empty keep-years). Next: rubric Q2 (what's editable), Q3 (checks), mockups, migration (number from Main), build, reviews.

**Rubric editor decisions (2026-10-21):** Q1 default + cycle copy until first open (v0.921) · Q2 everything inside the four parts, per Dan (v0.922) · Q3 edit a whole Dan, Save once, Cancel/Undo (v0.923) · Q4 points worked out from credits or a subject's own points; the 19 Fall 2026 exceptions keep theirs (v0.924) · Q5 grade points per Dan (v0.925) · Q6 age brackets in the rubric: per subject for cut-offs, per Dan for pass marks and limited subjects (v0.926) · Q7 a subject can have two ways (Pull-up or hold) (v0.927) · Q8 phones v0.56 note, PC/tablet "Discard changes?" (v0.928) · Q9 an undone Open registration = never opened (v0.929). First mockups (`TKD-BlackBelt-Rubric-Mockups.html`) failed design review on the scoring model; redraw next. Also to fix: the live family form's panel must use a subject's own points (Dan 4 Target kick shows B = 10, stored 9).

**Rubric editor migration number: 0024** (reserved by the Main session 2026-10-21; 0022 = camps, 0023 = Star). SETUP section "## Migration 0024: …" with "### 0024a." steps (v0.302); run.mjs step `step0024` (v0.304).

**2026-10-21 later:** rubric Q10 = B (v0.930: a cycle's first opening is admin-only). Rubric mockups R1–R14 passed two design reviews (df8e451); 3 small decisions left (changed-row tint, red Discard, Add cycle with Open + Undo), then the screen-by-screen pass. **Star is merged into main** (its Testing chooser, features.js, pageAddress.js are now here) → step **C2** (move Black Belt into the chooser's third row) is unblocked. After merging Star: both builds, all 8 checks files, functions 170/170, PGlite 909/0.

**2026-10-22: migration 0024 (rubric editor) LIVE on production (v0.936).** Build reviewed (security: no must-fix; design: 4 must-fixes fixed), pasted from 2e5fdaa; all after-checks clean; 0024 + 0016 tests pass on production; counter 5001. **Next:** Main merges black-belt and deploys (Jeffrey's OK: "push it through"); Jeffrey tests everything on the live site and sends feedback. Still open: CP4 waiver text, CP6 test registration + switch the form on, C2 (link into Star's chooser), grading after Master Jeong. Known: PGlite speed limits miss on a busy PC; Camps' 0013 T11a fails on Thursdays (camps test bug, theirs).

**2026-10-22: deployed** (main b2a0b42, then 0d2f7b2). Star added Black Belt's row to the Testing chooser (v0.516, third row, ti-award); with the Star switch on, the chooser shows Black Belt and the old temporary link is hidden. **C2 left for Black Belt:** the row's "Next: … · both schools" line (v0.900), Black Belt's own page address, and the rail hover-menu item.

**2026-10-22: C2 mockups drawn** (`TKD-BlackBelt-C2-Mockups.html`, picture `images/c2/c2-mockups.png`): checked that Star built only the chooser row (rail menu still lists Color belt + Star). Mockup shows the rail item, the "Next: [day] · both schools" line and the addresses `#testing/black-belt` (`/rubric`, `/cycle/<id>`, `/cycle/<id>/rubric`), each copying Star. **Waiting on Jeffrey's OK** before building (rulebook from v0.937).

**2026-10-22: C2 built and reviewed (v0.937, Jeffrey OK'd the mockups "as drawn").** Rail Testing menu has Black Belt testing (ti-award); the chooser row shows "Next: [day] · both schools" (earliest testing day from today, any cycle); Black Belt has its own addresses `#testing/black-belt` (`/rubric`, `/cycle/<id>`, `/cycle/<id>/rubric`) with the Star switch on or off, so reload, bookmarks and Back/Forward work. Review: 2 must-fix (deleted-cycle toast was cleared; Discard after the unsaved-rubric question did nothing on "← Testing" and on a tab change) + 2 should-fix (focus with the switch off; the Next: read filtered on the server), all fixed and re-checked on both builds. Known nit, left as is: after "← Testing" → Discard, focus lands on the page instead of the chooser row. No database change. **Next:** Main merges black-belt and deploys (needs Jeffrey's OK); then CP4 waiver text, CP6, B3 grading.

**2026-10-22: C2 deployed** (main fast-forwarded to 102742a, Cloudflare success 16:55 UTC; Main ran PGlite 1166/1166, functions 171/171, all check files, 3 builds). **Still to check by Jeffrey on the live site, signed in:** rail hover menu, #testing/black-belt, reload on the rubric tab, Back/Forward. Left: CP4 waiver text, CP6 test registration + switch the form on, B3 grading.

**2026-10-22: B3 grading started** (Jeffrey: "ask me the open questions one at a time, copying Star's grading where it fits"). The rubric editor (0024) already covers part A items 1–6 and 12. Open, in order: G1 pass rule + hand override → G2 a missing other requirement → G3 make-ups → G4 examiners → then the grading screens (entry per day, Results, make-ups into the next cycle, family printout). **G1 asked** (A = Star's rule only, recommended; B = + admin hand override).
**G1 = A (v0.938):** Star's rule only, no hand override. **G2 asked** (a missing Other requirement after the hand-in date: A = flagged Late, a person decides, recommended; B = automatic D).
**G2 = A (v0.939):** a late Other requirement shows Late, Not finished; a person decides on a D. **G3 asked** (what a make-up retests).
**G3 = A (v0.940):** D retests the D subjects; below the mark an admin picks subjects (Star v0.130). **G4 asked** (where the make-up is graded).
**G4 = A (v0.941):** make-ups graded at a later cycle (Add candidate → Make-up from an earlier cycle), as Star. **G5 asked** (examiners).
**G5 = A (v0.942):** no examiner field, the log is enough. Rules questions done; next the grading screens (G6 onward).
**G6 = A (v0.943):** Grading tab = day switch (+ Other requirements), then Dan, grid of that day's subjects. **G7 asked** (measured Physical entry).
**G7 = A (v0.944):** measured subjects take the number; grade worked out with the age bracket. **G8 asked** (where extra points are entered).
**G8 = A (v0.945):** extra points counts in the Grading tab (Extra points in the day switch). **G9 asked** (Results tab).
**G9 = A (v0.946):** Results tab = all of Star's (Email result + texts, printed sheet, admin CSV).
**B3 grading questions done (G1–G9, v0.938–v0.946).** Roles for grading were already set by v0.210 (staff and admins grade; admins choose make-up subjects, download the CSV, edit email texts). **Next:** grading mockups at 1280 / 820 touch / 390 touch / 320 (Grading tab by day and Dan; measured Physical entry; Other requirements with Late; Extra points; Choose subjects; Make-up from an earlier cycle; Results with Email result; email texts editor; printed grading and results sheets) → design review → Jeffrey screen by screen → DB plan + contract (reserve migration 0025 via Main) → build. Still for later, not grading: plan item 18 (switching off the old Sheet and the signatures in Drive).

**Grading + Results mockups** (`TKD-BlackBelt-Grading-Mockups.html` G01–G08 incl. G02A/B, G06B; `TKD-BlackBelt-Results-Mockups.html` R01–R06; shared cast scratchpad bb-cast.json) drawn, design-reviewed twice (all must/should fixed). Screen-by-screen pass with Jeffrey: **G01 OK (proposals 1–10 as drawn).** **G02a OK (11, 12, 15).** **G02b OK (13).** **G03 OK (16, 17).** **G04 OK (18–20).** **G05 OK (21–23).** **G06 OK (24–27).** **G06b changed (Jeffrey: "clearly highlight someone who is making up") → B: on every grading grid, make-ups are grouped at the bottom of each Dan under an amber band "Make-ups · N", each with an amber Make-up label; redraw pending, redrawn; **G06b OK (14 grouped, 36 kept extra points carry over).** **G07 OK (28–32).** **R01 OK (1–11; Results keeps the gray line for carried-in make-ups).** **G08 OK (33–35). All Grading screens OK.** **R02 OK (12–20).** **R03 OK (21–29; no Not finished email).** **R04 OK (30–37).** **R05 OK (38–44; full results as Star).** **R06 OK (45–49; all 21 columns). All 16 screens approved → rulebook v0.947 (2026-10-23).** **Next:** reserve migration 0025 through Main → DB plan + build contract for grading/results (security review) → build in the preview → checkpoints. Open question kept: does anyone owe a Black Belt make-up from Fall 2026 (old Sheet)?

**2026-10-23: migration 0025 reserved** (Main 3abb8a9, merged into black-belt): Black Belt grading and results. **Next:** DB plan `TKD-BlackBelt-DB-Plan-0025.md` → security review → Jeffrey’s questions one at a time → CONTRACT-0025 → build. step0025 in run.mjs, "## Migration 0025" in SETUP.md.

**2026-10-23: 0025 DB plan** (`TKD-BlackBelt-DB-Plan-0025.md`) drafted + security-reviewed (4 must / 10 should applied). Questions answered: Q-G1 A (v0.948), Q-G2 A (v0.949), Q-G3 A (v0.950), Q-G4 A (v0.951), Q-G5 C (v0.952, flag: differs from v0.940), Q-G6 B (v0.953). **S1–S24 OK (v0.954).** **Next:** Q-G4 Dan-change dialog mockup → CONTRACT-0025 → security review → build.
