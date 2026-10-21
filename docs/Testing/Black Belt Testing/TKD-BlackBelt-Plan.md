# Black Belt testing — plan

**Drafted:** 2026-10-18 · Black Belt worktree session, branch `black-belt`
**Status:** **approved by Jeffrey 2026-10-18 (rulebook v0.204).** Checked by two reviewer agents (findings in `TKD-BlackBelt-Status.md` §4).
**Sources:**
- `Inventory/Old-AppsScript.md`, `Inventory/Old-Spreadsheet.md`, `Inventory/Old-RegistrationPage.md` (read-only research, 2026-10-18)
- the rulebook: v0.157 on this branch; the highest number on any branch is v0.200 (Finance)
- the Star testing DB plan and CONTRACT-0006 (star worktree)
- the Finance status file (finance worktree)

> Nothing is built, no rulebook row is written, no migration exists. This file is the plan for **how** we design and build the section. The screens and rules themselves are decided later, one question at a time.

---

## 1. What Black Belt testing is today (short version)

- **One cycle per season** (e.g. "Fall 2026"), with both schools together. A cycle has three **testing days**:
  - Physical: at Worcester, plus an outdoor part at Horgan Arena.
  - Technical: at Shrewsbury.
  - Curriculum: at Shrewsbury.

  It also has deadlines: application due, and "submissions due" for the egg test, meditation, appreciation letter and TKD project.
- **Ranks:** 1st–4th Dan only.
- **Registration:** a public page on a Cloudflare Worker.
  - Fields: name ("as printed on the belt"), DOB, sex, Dan, email, optional Kukkiwon certificate, plan (pay in full or 3 payments), a waiver, and a drawn signature (a parent signs for under-18s).
  - A `?dan=` link presets the Dan.
  - The page also shows the full testing requirements; there is a separate `requirements.html?dan=…` as well.
  - Submissions go straight to Google Apps Script. It writes the Sheet and a Registrations Log, saves the signature to Drive, and emails a confirmation. The email has the payment schedule and the Kukkiwon Tcon instructions.
- **Fees (Fall 2026):**

  | Dan | Testing fee | Kukkiwon certificate (optional) |
  |---|---|---|
  | 1st | $870 | $100 |
  | 2nd | $990 | $110 |
  | 3rd | $1,500 | $140 |
  | 4th | $2,700 | $170 |

  - The fee is the same paid in full or as 3 post-dated checks.
  - Checks are payable to Master Jeong personally.
  - Fees are "non-refundable, **applied to the next test if not passed**" (the waiver text). In effect that's a credit that carries into the next cycle.
- **Payments:** a sheet with 3 amount slots plus 1 Kukkiwon slot per person.
  - The date is stamped automatically.
  - Nothing records the method, check number or who recorded it.
  - A receipt is emailed from a menu. It shows the payment history, totals, balance, and both schools' contact details.
- **Grading:** four blocks, each subject weighted by credits.
  - **Physical:** 9 measured events, graded automatically from age-bracket tables (≤8 / 9–12 / 13+). Max 80.
  - **Technical:** 5 subjects (6 for 4th Dan). Target Kick is graded automatically from a kick count (age ≤9 / 10+).
  - **Curriculum:** 7–9 subjects, different for each Dan. 1st Dan One-Step Sparring counts only for adults, through a separate Yes/No toggle.
  - **Other requirements:** 5 items, plus extra points entered as counts, with no cap.
  - There are three letter-grade scales plus fixed point tables. Pull-ups are "Hold" or "Reps" (age ≤12 / 13+).
  - **PASS = total ≥ pass mark AND no D anywhere.** Pass marks: 1st Dan 275 (child) / 293 (adult) · 2nd 261 · 3rd 293 · 4th 453.
  - One grade per subject. A paper sheet has an "Examiner ___" blank, but there is no judge field and no averaging. Finals cells can be overridden by hand.
- **Make-ups:** D subjects are retested at the next cycle and passed subjects are kept. The "Make-Up Tracker" tab is the only permanent record. "Start New Cycle" wipes everything else, so history survives only as a manual copy of the file.

Full detail, every number and every formula are in the three inventory files.

## 2. Urgent: the live system (in use until the new section replaces it)

1. **⚠ Confirm which file you exported.** The file name is "Copy of … (9_30_26)", so it's probably a copy. But its **Master Roster, grades and payments are empty**, and its Make-Up Tracker has **24 people archived today (2026-10-18)** as "BELOW PASSING" (scores 0–66). That is what **Start New Cycle** leaves behind. Technical (Oct 24) and Curriculum (Nov 21) haven't happened yet.
   - If the **live** Sheet looks like that: first **make a copy of it as it is now**, so today's registrations aren't lost. Then use **File → Version history** to restore from before today, **before Oct 24**.
   - The Registrations Log (43 rows) is intact, so the roster could be rebuilt from it if needed. Physical-day grades exist only in version history.
2. **The public page lets anyone change dates, prices, locations and the school phone and address shown in emails.**
   - The hidden staff editor (`#admin`, or triple-click the logo) sends `updateInfo` to the Apps Script. The script's password check was removed (`doPost`, line 399).
   - The page puts those values into the page as raw HTML, so someone could also plant a script that runs on every family's phone.

   **Recommended stopgap (your call; it's a change to the live Google script, outside this repo):**
   - **Delete the `updateInfo` branch** from `doPost` and edit dates in the Sheet directly. A password check doesn't help if the password sits in the public page.
   - Then **check the Testing Info cells for anything strange** (for example a `<`), because closing the hole doesn't remove values already planted.
   - **Check who the Drive "Black Belt Signatures" folder is shared with.**

   I can write the exact lines for you to paste.
3. **Things that can show a wrong result this cycle.** These are in the Sheet, so check them by hand before results go out.
   - **Pass/fail formulas cover only the first 20 roster rows across all Dans**, and the roster sorts 1st Dan first. With about 26 1st Dans, the 2nd–4th Dan candidates probably get **no formula result at all**.
   - **Old values typed below row 24** include "PASS!" with a pass mark of 0 on some 3rd and 4th Dan rows, so whoever lands on those rows shows a false PASS.
   - A blank or misspelled Dan gives a pass mark of 0, so that candidate passes automatically. An **ungraded** subject counts as passed.
   - **Child/Adult** and the **One-Step "Yes"** toggle are two separate manual fields that must agree.
     - If Child/Adult is blank, a 1st Dan adult gets the child pass mark.
     - If Adult is set without the toggle, the candidate loses 22.5 points but still needs 293.
   - **Don't run "Save Non-Passers to Make-Up Tracker" until all 3 days are graded.** It skips anyone already saved under the same name + cycle, so today's 24 wrong rows would block the correct ones.
   - **"Send Make-Up Emails" and "Send Results — All" mid-cycle** email every candidate as not passing. Make-Up Emails doesn't even ask for confirmation.
   - The form shows "Registration Received" even when the save failed, and anyone can make the school's account send emails to any address.

## 3. Timing

- **The new section is for the next cycle (Spring 2027), not Fall 2026.** Fall 2026 is half-way through, and moving people, payments and Physical grades mid-cycle isn't worth it.
- **Registration must be live by about early February 2027**, roughly 3½ months from now.
  - In Spring 2026 the application was due Mar 28.
  - For Fall 2026 the first registration came in Jun 17, most came Aug–Sep, and 17 of 43 came **after** the Sep 19 deadline (the last on Oct 8).
- **Payments must be live with registration** (the first checks come with the application). **Grading must be live by the first testing day**, around early April.
- **The Testing chooser** (v0.59) isn't built yet, so whichever of Star or Black Belt builds first builds it.
- **Black Belt is built now, in its own session (decided v0.205).** It doesn't wait behind other sections. Each part is designed, then built straight away.
- Before Spring 2027 opens, the corrected **Fall 2026 make-up list**, plus any older pending make-ups kept only in copied files, is brought into the new system.

## 4. What the new system changes

| Problem in Sheets | In the dashboard |
|---|---|
| People are linked to grades and payments **by row position**; each sort moves ~12 tabs, so a grade can land on the wrong person | Each candidate has an **id**. Grades and payments point at it, and nothing moves. |
| Same name = same person (remove, payment restore, make-ups) | Ids, plus duplicate warnings (the Color Belt / Star pattern). |
| Anyone can change prices or dates; registrations have no bot check; replies are hidden (`no-cors`) | Admin-only settings behind login + PIN, with all writes through checked database functions. The public form uses the Color Belt stack: Turnstile, rate limit, honeypot, timing check, a restricted database login, every rule re-checked in the database, retries that can't double-register, and a real "saved / not saved" reply. |
| Prices in 3 conflicting places; the Kukkiwon fee hard-coded in 3–4 places | One price table per cycle, copied from editable defaults (Star's "event keeps its own copy" pattern). |
| Payments: 3 slots, no method, no who, negative amounts shown as positive | An **append-only payment ledger** **like** Color Belt's and Star's, adapted for Black Belt (§7). One row per payment: method, school date, who recorded it, undo/edit as reversal rows, refunds as their own row. |
| Child/adult typed by hand; age frozen at registration; three different age cut-offs | Age is **worked out by the database for each testing day**. Child/adult and every bracket (physical ≤8/9–12/13+, target kick ≤9/10+, pull-up ≤12/13+) come from the rules, not from typing. |
| Blank grade = pass; formulas stop at row 20; pass mark 0 = pass; leftover typed results | Results are worked out in one place for every candidate. **"Not finished" is its own state**: no PASS until every subject has a grade. |
| Start New Cycle wipes everything; history = "make a copy" | Every cycle is kept. Make-ups and credits carry forward automatically. |
| Change history = Google's version history | Every change in `change_log`: who, when, before → after. |
| Minors' DOB and signatures in a Sheet and in Drive forever | DOB never in lists. **The grading tablet gets only the age bracket and child/adult, worked out by the database, never the DOB** (stronger than Star's screen-only hide, because Physical is graded at a public arena). Payments and balances stay off the grading screens (v0.108 / v0.110). Signatures are deleted on a schedule (v0.136 pattern) and only reachable through checked functions. |

## 5. Scope

**In scope now (your three areas):**
1. **Registration:** the public form, plus staff adding or correcting a candidate.
2. **Payments:** recording, balance, plans, the Kukkiwon fee, undo/edit, refunds, bounced checks, credits carried to the next cycle, and how Finance reads them.
3. **Grading:** the rubric (subjects, credits, scales, physical and kick tables, extra points, pass marks), grading entry for the 3 days (paper or tablet), results, and make-ups.

**Needed at go-live, kept small:** the families must not lose what the old page gave them.
- the **testing requirements per Dan**: the content is already public on the old page and in `requirements.html`, so I read it now as a source
- the **payment schedule**
- the **Kukkiwon Tcon instructions**

Until the dashboard can send email, these go on the confirmation page or a printout. **Or the old requirements page stays up**; that's a question below.

**Planned so the data model doesn't block them, built later:**
- the family handout (you'll supply it)
- emails: confirmation, receipt, results, make-up notices. The dashboard can't send email yet; Star's confirmation email waits on this too.
- certificates
- Kukkiwon tracking: Tcon id, "photo received" yes/no; passport photos of minors are never stored
- online card payments (Square, as planned for Star)
- importing old cycles

**Not included:** Poom vs Dan, ranks above 4th Dan, and Cho Dan Bo. None of these exist in the old system; I'll confirm once.

## 6. How it fits the dashboard (proposed; each point is confirmed in the questions)

- **Where it lives:** a third row in the **Testing chooser** (v0.59). It works on **Both** schools, like Star (v0.58), because the cycle is joint. Each candidate has a **home school**.
- **Pages, by Star's pattern (v0.60):**
  - **Black Belt home** has two tabs: **Cycles** and **Rubric and prices**.
  - A **cycle page** has three tabs: **Candidates** (roster, payments, school, make-ups), **Grading** (by testing day, then by Dan) and **Results**.
- **Database:** separate **`bb_…` tables** (Star's choice of separate `star_…` tables), never changing the live 0005 tables. The migration takes the **next free number when it's written**. That's 0011 today, because 0010 is claimed twice (§10).
- **Public form:** its **own restricted database login, Hyperdrive binding, kill switch and route** (Star's choice for its own form). It reuses `functions/_lib` and `SignaturePad.jsx`.
  - Today `register.js` reads one `PUBLIC_REGISTRATION` switch, and `db.js` is wired to Color Belt's two functions.
  - So the shared form code gets a small change, which is listed as a shared-file change.
- **Grading engine:** Star's design is the closest model. It has a grid per Dan with a dropdown per cell, paper or tablet entry, D meaning a make-up, results worked out each time rather than saved, and results staying open (v0.139).
  - Black Belt adds raw measurements graded automatically, three scales plus fixed tables, extra-point counts, three testing days, the child/adult pass mark, and a possible admin override.
  - Whether Star and Black Belt **share code** (e.g. one grading-grid component) is a question for you, because it touches the Star branch.
- Star decisions are cited by **title**, not number, because Star's numbers change when its branch is merged.

## 7. Working alongside Finance (Daily report)

Finance is designing the Daily report now (rulebook v0.193–v0.200). Agreeing the money details now is cheaper than adding Black Belt later.

1. **A ledger like Color Belt's and Star's, but not identical:**
   - **Amount cap:** Color Belt and Star cap one row at **$1,000** (100000 cents). A 4th Dan paid in full is $2,700, so Black Belt needs a higher cap. It's a different table, so its cap is its own.
   - **Kinds:** payment / reversal (undo, edit) / refund (Star's kind), plus **returned check** (a bounced check, which matters with post-dated checks), plus possibly **credit carried to the next cycle** (from the waiver).
   - **Shared fields:** `amount_cents`, `method` (cash / check / card), `paid_on` (school date), `recorded_at`, `recorded_by_name`, `reverses_payment_id`.
   - **What each row stores at the time:** the **school** (so a later change to the candidate's home school doesn't move old money in the Daily report or History) and the **cycle name**. A cycle has 3 dates, so Finance's "For" column ("testing type · event date", v0.196) needs the cycle name instead. Plus **what it's for**: testing fee or Kukkiwon certificate.
2. **How Finance reads it:** Finance decided staff see **today only**, enforced in the database (v0.195). A plain view can't enforce that. So **Finance reads each ledger through a checked function that Finance owns**. Black Belt hands Finance a table with the agreed columns, and Finance adds it to its function. That needs an OK from you and from the Finance session.
3. **Money questions Finance has to be part of:**
   - **Does Black Belt money belong in the school's Daily report at all?** Checks are made out to Master Jeong personally.
   - **Post-dated checks:** the drawer count (v0.194) counts checks physically there. A family hands in 3 checks on one day, and 2 of them can't be deposited for weeks. Do they go in the drawer that day, or does Master Jeong hold them? Do we record each check when it's handed in, with its "written for" date?
   - **A bounced check** weeks later will mark an already-closed day "Changed after closing" (v0.199). Is that wanted, or does a bounce get dated the day it's found?
   - **Testing fee and Kukkiwon fee in one check:** one payment row or two?
4. **Order:** Black Belt's payment questions come **right after** Finance's open questions, so the decisions line up. With your OK, I'd send the Finance session a short note with points 1–3.

## 8. Order of work

Design runs in two tracks. **Registration + payments design starts right away.** **Grading design starts once Master Jeong answers part A** (§9), because the grading rules decide the rubric.

| Step | What | Output |
|---|---|---|
| 0 | **This plan** + inventory files → your OK | plan, status file, first rulebook row ("Black Belt testing added") |
| 1a | **Registration + payments questions**, one at a time (§9 B2–B12), each with pictures: one combined PNG per question, amber outlines, a recommendation. Each answer becomes a rulebook row | questions files + images |
| 1b | **Rules check with Master Jeong** (§9 part A), in parallel with 1a. I'll make a one-page printable sheet you can hand him | answers |
| 2 | **Grading questions** (§9 B12–B18) | questions files + images |
| 3 | **Full mockups** at 1280×800, 820×1180 touch, 390×844 touch and 320 wide → separate design reviewer agent → screen-by-screen pass with you. Registration/payment mockups go first and don't wait for grading | mockups |
| 4 | **Database plan** + its own questions (like Star's Q-D list) → **build contract** → security reviewer. Registration + payments can get their own first migration so they aren't blocked by grading | DB plan, contract(s) |
| 5 | **Build in phases** in the preview with fake data. Each phase is reviewed (security + design) and needs your OK at its checkpoint:<br>**B1** Cycles + prices + public registration form (rubric loaded from the migration, no editor yet)<br>**B2** Candidates + payments (Finance can read from here)<br>**B3** Grading: 3 days, paper sheet + tablet, plus the **rubric editor**<br>**B4** Results + make-ups<br>**B5** Later items: emails, handout page, certificates | code, tests, migration(s) |
| 6 | **Go live for Spring 2027** using Color Belt's checkpoints (CP0–CP6), adapted for a **third form login**: Turnstile, its own Hyperdrive binding and kill switch, paste the migration, test on the real database, deploy with the form off, a TEST registration, then on. B1–B2 live by about early February, B3–B4 by the first testing day. Fall 2026 make-ups imported. Old page and Sheet switched to read-only; the requirements page stays up if chosen | live |

## 9. The questions

### Part A — rules to confirm with Master Jeong (yes/no or a number; no screens)

1. **Point tables:**
   - The fixed tables give B = 11 and B− = 10.5 (Egg Test and Assistant Instructor Course, 1st–3rd Dan). Credit × scale would give 12.5 / 11.25.
   - They give 9 / 8.5 instead of 10 / 9 for Meditation and Project (1st–3rd Dan), and for 4th Dan Egg, Meditation, Letter, Free Sparring, Terminology and Knowledge.

   Are the table numbers intended?
2. **C+** is in the Curriculum scale (2.8) but not in any dropdown. The Technical paper sheet shows no minus grades, but the Sheet accepts them. Which grades does each part really use?
3. **Child/adult** for the 1st Dan pass mark (275 / 293) and One-Step Sparring: what age, and on which date?
4. **Age cut-offs:**
   - Pull-ups for ages ≤8 use the 9–12 table. Is that right?
   - Who does Hold and who does Reps?
   - Target Kick uses ≤9 / 10+, but Physical uses ≤8 / 9–12 / 13+. Is that intended?
5. **The 13+ run** (8 / 8.5 / 9 / 11 / 12 minutes) vs the half mile for ≤12: is 13+ always the full mile?
6. **Extra points:** is there really no cap? 4th Dan "uses 3rd Dan thresholds for now". Are those final?
7. **Pass rule:** total ≥ pass mark **and** no D. Does an "Other requirement" not handed in by the deadline count as a D? Can an admin override a result by hand?
8. **Make-ups:**
   - 19 of the 24 tracker rows say only "BELOW PASSING", with no D. What does that candidate retest: everything, or the lowest subjects?
   - How long do kept subjects stay valid?
   - Is the final score recalculated with the new grades?
   - Is there a make-up fee?
9. **Eligibility:** may anyone register for any Dan, or only their next Dan, after a minimum time or attendance, or with instructor approval? 17 of 43 registered after the deadline: should it stay open late?
10. **Fees:**
    - Is pay-in-full meant to equal the 3-payment total? The old $30–$80 discount is gone.
    - Checks only, or are cash and card OK?
    - Are checks still made out to Master Jeong personally?
    - "Applied to the next test if not passed": does the whole fee carry over? For how long?
    - Are refunds ever given?
11. **Examiners:** one examiner per subject, or several? Should the app record who graded?
12. **Ranks:** only 1st–4th Dan? Any Poom / under-15 difference, e.g. for the Kukkiwon certificate? What does Kukkiwon need from us: sex, DOB?

### Part B — design questions for you (one at a time, pictures, recommendation)

**Foundations**
1. ~~Build priority~~: **withdrawn (v0.205): Black Belt is built now, not queued.**
2. Where Black Belt lives (the third Testing chooser row vs its own rail item) and its page tabs.
3. What a **cycle** holds: 3 testing days (date, time, place, the outdoor part), deadlines, payment due dates; copied from the last cycle.
4. **Who can do what** (Admin / Staff) for settings, candidates, payments, grading and results, enforced in the database.

**Registration**

5. **Form fields:**
   - first + last name, spelled as printed on the belt
   - DOB (needed for the age brackets)
   - sex: only if Kukkiwon needs it
   - **parent email required for under-18s** (results and receipts go to the parent)
   - phone
   - **home school by link** (one link per school, Star's choice)
   - keep the `?dan=` link
6. **Linking to existing student records**, or free-typed like today; eligibility / staff approval; open/closed + automatic closing date (v0.85); late registrations.
7. **Waiver and signature:**
   - the text, with a version stamp, and the checkbox
   - a parent signs for under-18s
   - **when the signature is deleted:** a cycle has 3 days, deadlines and make-ups, so how many days after which date?
8. **After sending:** confirmation page with a reference number, the payment schedule and the Kukkiwon instructions; requirements on the dashboard's form or the **old requirements page kept**. The email comes later.

**Payments** (after Finance's open questions, §7)

9. **Plans and prices:** pay in full vs 3 payments, due dates, the Kukkiwon fee per Dan, all editable per cycle by admins.
10. **Recording a payment:** method, check number, post-dated checks, Kukkiwon in the same check or separate, bounced checks, credit carried to the next cycle.
11. **The roster's money view:** balance, next or late payment, "Paid in full", undo / edit / refund (Star's rules). Never on the grading screens.
12. **Receipts:** printable now (payment history, totals, balance, school contacts), emailed later.

**Grading** (after part A)

13. **Rubric and prices editor:** subjects, credits, scales, physical and kick tables, extra-point tables, pass marks; each cycle has its own copy.
14. **Grading entry per day:**
    - Physical: raw numbers in, grades out, on a tablet at the arena, showing the age bracket only.
    - Technical and Curriculum: dropdowns.
    - Other requirements: graded when handed in.
    - Paper sheet + typing in later (Star's paper-or-tablet choice).
    - Who graded (if part A says so).
15. **Results:** live total, the "not finished" state, PASS / make-up list, admin override (if allowed), what stays editable (v0.139).
16. **Make-ups:** carried into the next cycle, what's kept, how a make-up candidate registers and pays.
17. **Results for families:** printout now, email later (to the parent for under-18s).
18. **Switching off the old system:** what happens to the old Registrations Log and the minors' signatures in Drive (delete after the import?).

The exact order and wording are refined when each question is drawn. Answers can reopen earlier ones (as v0.37).

## 10. Risks and coordination

- **Migration 0010 is claimed twice** (Prospects, committed; Color Belt phase 3, not committed). That's for the Main session / you. Black Belt takes the next free number at build time.
- **Rulebook numbers:** Finance is already at v0.200. Before each rulebook edit: `git merge main`, re-read the rulebook, and check every branch for its highest number.
- **Shared files** to be touched later, each listed in the summaries:
  - the rulebook, `CLAUDE.md` (its "Read first" list and session table), `docs/README.md`
  - `src/App.jsx`, `src/screens/Testing.jsx` (the chooser row), `src/lib/mockClient.js`
  - `functions/_lib/register.js` / `db.js` (a third form)
  - `public/_headers` / `_redirects`
- **Live page during the rebuild:** the old page and Sheet stay in use for Fall 2026. Turning them off is its own step with your OK.
- **The family handout** may contain rules that differ from the Sheet. When it arrives it's checked against part A.
