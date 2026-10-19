# Black Belt testing — mockups brief (cycles, registration, payments)

**Written:** 2026-10-18 · for the builder agents and the design reviewer · decisions: rulebook v0.204, v0.205, v0.209–v0.213, v0.216–v0.220 (§10b, search "Black Belt testing").

Three self-contained HTML mockup files, in the same style as the approved Star testing mockups. Every screen is drawn at **PC 1280 (mouse)**, **tablet 820 (touch, mat-side tablet style)** and **phone 390 (touch)**, and must also work at **320 wide**. Each screen gets an "explain" box: what it does, plus the rules it follows (cite the rulebook version). **Proposals** that aren't decided yet are written in the Star files' `.prop` (amber text) style, so Jeffrey can see what's still open. Sample data only, made up; the cycle is "Spring 2027" with first day Sat, Apr 3, 2027.

Style source: copy the `<style>` block and inline icons from `docs/Testing/Star Testing/TKD-StarTesting-Events-Mockups.html` (dashboard screens), `TKD-StarTesting-Form-Mockups.html` (public form) and `TKD-StarTesting-Candidates-Mockups.html` (roster, payments). Reuse their components, wording patterns and layouts wherever a Black Belt decision doesn't change them. Rules: rulebook §1–§8 (layout, buttons, toasts, errors, dialogs, phones, touch targets), §5 (privacy: no DOB, email or money in lists or on the grading tablet), v0.45 (page-header button), v0.46/v0.56 (unsaved changes), v0.59 (Testing chooser), v0.60 (Star page pattern), v0.85 (registration switch + closing date), v0.86 (who opens or closes registration), v0.90/v0.98 (one link + QR per school), v0.93–v0.106 (Star form patterns), v0.108–v0.121 (Star Candidates tab patterns).

## File 1 · `TKD-BlackBelt-Cycles-Mockups.html`
1. **Testing chooser** with a third row "Black Belt testing" (icon: suggest `ti-award`, marked as a proposal) and its next cycle line (v0.59). PC hover menu + phone choice page.
2. **Black Belt home → Cycles tab** (admin): Upcoming / Past switch, rows (cycle name, first testing day, candidates, one status tag like "Open until Mar 27"), "+ Add cycle" in the page header. Plus the staff view (no Add, no Edit; gray line as Star v0.86) and the empty state.
3. **Add cycle** (v0.209, v0.217, v0.212): cycle name; **Testing days** list (name · date · time · place · the parts graded that day), "+ Add testing day", edit and delete per day; deadlines (Application due, Submissions due); **payment due dates for each plan's payments** (one small group per plan, e.g. "3 payments: Mar 27 · Apr 24 · May 29"); Registration Open/Closed with "Close automatically at the end of [Application due]". Starts as a copy of the last cycle (hint line). PC/tablet: dialog; phone: full screen.
4. **Add / edit testing day** dialog: name, date, start–end time, place (Worcester school / Shrewsbury school / Other + text), optional "second part" (time + place, e.g. outdoor at Horgan Arena), parts graded (checkboxes: Physical, Technical, Curriculum). The four v0.209 details as **proposals**: (1) Save refused while a part is graded on no day (show the error); (2) a part may be on two days; (3) the outdoor part is a "second part" of the same day; (4) a day with grades can't be deleted (show the reason).
5. **Black Belt home → Rubric and prices tab**, admin view, two sections for now:
   - **Payment plans** (v0.217): plan list (In full · 1 payment, 3 payments · 3 payments, + Add plan), each opening its amounts per Dan (1st–4th); **Kukkiwon fee per Dan**.
   - **Waiver** (v0.213): the text, a version number, Edit (creates a new version), and "Keep signed waivers for [N] years after the last testing day", marked as a proposal waiting for the insurer.

   Add a note that the rubric section is designed with grading (no placeholder screen). Plus the staff view-only version ("View only. Ask an admin to make changes.").
6. **Registration links dialog** for a cycle: one link + QR per school (Worcester, Shrewsbury), copy buttons, "Registration is open until Sat, Mar 27." (Star v0.90/v0.98 pattern).
7. **Cycle page** header and tabs (Candidates · Grading · Results), with "← Black Belt", the summary line (first day · both schools · N candidates) and the ⋯ menu (Edit cycle, Registration links, Open/Close registration). Grading and Results tabs are drawn only as their tab labels (designed later).

## File 2 · `TKD-BlackBelt-Form-Mockups.html` (public, no login; v0.211–v0.213, v0.216)
1. **Step 1, empty**: header with the school from the link ("Black Belt testing registration · Shrewsbury"), hero (cycle, testing days with dates and places, "Apply by Saturday, March 27"), fields in this order: First name, Last name (hint about the belt spelling), Date of birth (calendar), Testing for (1st–4th Dan chips), Kukkiwon certificate (No, thanks / Yes, add it, with the fee), How you'll pay (every plan with its real amounts and dates), total box with "What [Dan] is tested on ›", Email for results.
2. **Step 1, filled**. Settle "several plans on a phone" (v0.217 detail 1) as a proposal: radio list showing plan name + total + "3 × $290 · Mar 27, Apr 24, May 29".
3. **Requirements panel** (v0.216): full-screen panel on the phone and a dialog on the PC. Levels: parts (each with day, place, subject count) + Hand in + Extra points + pass rule → a part's subjects with credits → one subject's scoring table. Use the real Fall 2026 subjects and credits from `Inventory/Old-Spreadsheet.md` §1.5–§1.10 and §3.2; the pass marks from §3.4.
4. **Step 1, errors** (Star v0.98 messages, adapted).
5. **Step 2 · Check and send** (v0.213): summary (cycle + first day, candidate, school, DOB with the age on the first testing day, Dan + Kukkiwon, what to pay with dates, results email), waiver text with version + "Read all", the "I have read and agree" tick, Name of the person signing, signature. Two versions: an **adult** signing for themself, and a **candidate under 18** (a parent or guardian signs; the hint says why).
6. **Step 2, missing tick or signature**.
7. **Registered** (v0.216): "[Name] is registered", What to pay (each due date with its amount, Kukkiwon with payment 1, the post-dated checks note, non-refundable), Testing days + hand-in deadline, Kukkiwon steps (only if chosen), the requirements link, reference BB-####, Print or save this page, Register another candidate, "Registered on this visit" (Star v0.93).
8. **Can't register**: not open yet, closed after the application date ("Ask at the front desk.", v0.212), sending failed (Retry), closed while filling in (Star v0.104 patterns).
9. **PC version** of step 1 and step 2 (centered column).

## File 3 · `TKD-BlackBelt-Candidates-Mockups.html` (cycle page → Candidates tab; v0.210, v0.218–v0.220)
1. **Candidates tab, admin, on Apr 25, 2027**: summary cards (Paid in full · Paying on schedule · Late · Not paid; tapping one filters), search, the location switcher on Both, columns Candidate · Dan · School · Plan · Payments (one tag: Paid in full / Next $X by date / Late · $X since date / Not paid) + balance, row ⋯. "+ Add candidate" in the page header. About 8 sample rows, incl. a "Possible duplicate" tag (Star pattern). Phone: one line per candidate with the tag and balance, plus filter pills.
2. **Staff view** of the same tab: what's hidden for staff (v0.210).
3. **Candidate detail** (desk device): name, Dan, school, plan, Kukkiwon, reference, results email and DOB (detail view only), waiver "Signed by Jordan Kim (parent) · Mar 10 · version 2027-1 · on file" (admins: View signature), payments list (date, for, how, amount, note, recorded by), totals (total due, paid, balance, next due), buttons Record payment, Print receipt, ⋯ (Edit details, Change plan or Kukkiwon, Remove — admin).
4. **Record payment** dialog (v0.218): Amount (filled with the next amount due), Method (Cash / Check / Card), For (Payment 1 / 2 / 3 / Kukkiwon), Note (optional, e.g. "post-dated Apr 24"); then the toast "Payment recorded · $290 · Alex Kim · Undo" (5 seconds). Show recording three post-dated checks one after another, and the roster tag turning to "Paid in full".
5. **Admin-only payment actions** on a payment's ⋯: Edit payment, Undo payment, Record refund, Mark check returned (bounced); one dialog each (proposals for the wording). The resulting rows: refund and returned check as their own lines; the balance comes back after a returned check.
6. **Change plan or Kukkiwon**: allowed for staff before anything is paid; after a payment, staff see it grayed out with "Ask an admin" (v0.210).
7. **Add candidate** (desk; walk-in or late family, v0.212): the same fields as the form + school + "Waiver signed on paper" tick.
8. **Print receipt** (v0.220): the one-page receipt (letter size), as printed.
9. **Overpaid** and **Kukkiwon in the tag** (v0.219 details) as proposals: e.g. "Paid in full · ⚠ $50 overpaid" (Star pattern), and Kukkiwon counted inside "Paid in full".

## Check before handing back
- Every screen at 1280 / 820 touch / 390 touch, readable at 320 (no sideways scroll).
- No DOB, email or money in any list on the grading side; DOB and email only in the single-candidate detail.
- Wording follows the Star files (plain, short, sentence case, "Ask an admin…" lines).
- No placeholder sections for undecided features (P7).
