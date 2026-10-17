# Star Testing — Inventory of the existing prototype

**Written:** 2026-10-16, start of the Star Testing work (read-only inventory, nothing changed)
**Sources:** `Testing\Star Testing\` on the ustc machine — `star-testing.html` (prototype, identical copy in `dist\index.html`), `STAR-TESTING.md` (project notes, last updated 2026-09-10), `STAR-TESTING-HANDOFF.md` (full spec + scoring code + test cases).
**Use:** feature reference only (same approach as Color Belt, v0.32). Nothing is copied as-is; the rebuild follows `TKD-Dashboard-Design-Guidelines.md`.

---

## 0. Jeffrey's answers (2026-10-16)

1. Color belt testing is always separate per school. **Dan and Star testing are run with both schools together, in one room.**
2. Date of birth is required — scoring depends on age.
3. Email is required — results are emailed.
4. The prototype was never used (no real data). Goal this time: a **complete, more detailed product**.
5. Both schools test together in one room.
6. Color Belt phase 1 is being built at the same time — flag anything that conflicts.
7. Rubrics and prices are current, but **must be changeable later** (no hard-coding).
8. Make-ups are unfinished candidates; they **do not pay again**. *(Still open: graded only on D categories? What about below 245 with no D?)*
9. Same-day fee = **paying** on testing day.
10. Private star testing exists. A **Calendar** add-on (all events, announcements, etc. from every tab) is the next project after this.
11. Gender: dropped.
12. Classes attended: keep.
13. Send results email from the dashboard if possible.

## 1. How it runs today

| Piece | What it is |
|---|---|
| App | One self-contained HTML file (~148 KB, crest inlined). No backend, no login. |
| Data | Browser `localStorage` on one device only. Demo candidates are made up. One event at a time. |
| Email | Previews only — nothing is ever sent. |
| Deployment | Notes say "owner will deploy independently". **Unknown whether it was ever deployed or used for a real event.** |
| Look | Left sidebar with crest, numbered stages, gold eyebrow labels, uppercase buttons, cards with shadows, light/dark theme switch, "Reset demo data". |

## 2. Domain rules (from the 2024 paper applications, corrected 2026-09)

- Stars are the in-between ranks of a Dan. A candidate adds **one star per testing**.
- **1st Dan → up to 4 stars, 2nd Dan → up to 3, 3rd Dan → up to 5.** No 4th Dan star testing.
- Valid progressions listed ascending (e.g. 1st Dan: 0→1, 1→2, 2→3, 3→4).
- **Rubrics:** every Dan = exactly **70 credits**; max **315**; pass mark **245** for all three (B+ average).
  - 1st Dan — 11 categories; 2nd Dan — 13 (Instructor Sa-Bang-Chuk added 2026-09-01 to fix a 65-credit error); 3rd Dan — 10. Full tables in the handoff, section 2.
  - 3rd Dan paper form typo (Korean Terminology B+ = 18.5) — use 17.5.
- **Grade scale:** A+ 4.5 · A 4.0 · B+ 3.5 · B 3.0 · C+ 2.5 · C 2.0 · D 0. Category points = credit × grade value.
- **Pass rule:** every category graded **and** total ≥ 245 **and no D anywhere**. A D means make-up even with a passing total (A+ everywhere + one 5-credit D = 292.5 → make-up). Passed categories are kept; only D categories are re-tested at the next star testing.
- **Assistant Instructor** grade is never judged — it is calculated from the exact number of assistant classes staff enter. Scale splits at age 13 (12 and under: A+ ≥15 … C 10; 13 and up: A+ ≥20 … C 10; under 10 = D). Age comes from a **stored date of birth**, recalculated each time; unknown age → 13+ scale.
- **Fees:** 1st Dan $140 / $150 same day / $160 private · 2nd $150/$160/$170 · 3rd $160/$170/$180. Cash or check only, paid at the front desk. *(Same-day and private fees are displayed on the register panel and Rubrics page, but the fee actually charged — roster, CSV — is always the standard fee.)*
- Capacity 100 per Dan (deliberate overkill), enforced at submit: "The 1st Dan roster is full at 100 candidates. Ask an instructor to open another testing."
- **Undefined case:** total below 245 with no D → prototype says "MAKE-UP REQUIRED — below 245", but the make-up rule only re-tests D categories, so there is nothing listed to make up.
- No pass-mark column on results (245 stated once).
- Results must never be ambiguous: "MAKE-UP REQUIRED — D in Advanced Motion", never a bare category name next to a score.

## 3. Screens (stages)

0. **Testing Event** (staff) — name, date, which schools are testing (Shrewsbury / Worcester / both), toggle "ask each candidate which school they train at" (disabled when only one school). At least one school required; "Not saved yet" until Save; registered count per school. Guard: can't remove a school that has registered candidates. One-school event stamps that school on everyone and hides the school column everywhere. When not asking, new candidates get the first school as a placeholder; staff click the school pill to cycle it.
1. **Register** (candidate-facing, QR/link) — full name, date of birth (custom calendar with month/year dropdowns), gender, email for results, school (only if the event asks), current Dan, star progression (depends on Dan), paying by Cash/Check. Shows the chosen Dan's rubric and fees beside the form. Gender optional (Male/Female). Checks only on submit (one "Still needed: …" line; email not format-checked). Submit saves unpaid, resets the form and jumps to the staff roster — **no confirmation screen for the candidate, no duplicate check.** **Not collected on purpose:** phone, classes attended, assistant classes.
2. **Master Roster** (staff) — tabs per Dan with counts; school filter (Both / Shrewsbury / Worcester) with counts; "x of 100 places used". Grouped Shrewsbury first, then Worcester; within each, lowest star first, then A–Z. Columns: #, name, age, stars (pips → next), school pill (click to move), classes, fee, payment pill (click to toggle paid/due), email, status (Pass / Make-up / "N of M graded" / Not graded). Paid toggle and school move are instant with a short toast, no Undo. CSV (all three Dans) shown in a copy dialog, not a real download. **No way to edit or remove a candidate anywhere.**
3. **Grading Sheet** (testing day) — judged categories per Dan: **10 / 12 / 9** (Assistant Instructor is calculated). Tabs per Dan; grade scale legend; one wide table: candidate (age · stars · school) then each category as a dropdown A+–D with live points; D shown in red; running total with 245 marker; two staff-entered columns at the far right: **Classes attended** and **Assistant classes** (sets Assistant Instructor automatically). "Print blank grading sheets" → landscape paper roster: names down the left, judged categories across the top, empty boxes; no attendance/assistant/total columns; Shrewsbury section first. Header: event, date, count; numbered names with progression; credit under each subject; footer with grade scale and "Pass 245 · Any D requires a make-up". Selected Dan only.
4. **Final Scores** — tabs per Dan; summary ("4 fully graded · 2 passing · 2 with make-ups"); columns #, name, stars, final score, result/make-ups (Make-up required + reason, PASS!, "Incomplete — N left" with score so far, Not graded), email (Preview & send). "Print final scores" → portrait sheet (name, progression, score, result/reason, Shrewsbury first). "Email everyone graded" (current Dan only, no confirmation, re-sends to already-sent). Preview only for fully graded candidates; button becomes "Sent · view". Email preview dialog: subject "Your 1st Dan Star Testing Results", body explains score, pass mark, result, and why a D means make-up even with a passing total; lists make-up categories.
5. **Rubrics & Rules** (reference) — all three rubrics, grade scale, assistant class table, fees.

**CSV columns:** Dan, Name, Age, Gender, Stars from, Stars to, [School], Email, Fee, Payment, Paid, Classes attended, Assistant classes, Assistant grade, Score, Max, Result.

## 4. Data the prototype stores per candidate

Name, date of birth (with an `age` fallback), gender, email, school, Dan, stars from, payment method, paid flag, grades per category, classes attended, assistant classes, email-sent flag. Plus the event record (name, date, schools, ask toggle). The dashboard is meant to become the school's student system (like Kicksite) and will hold student records, so storing DOB and email is expected. Privacy rules (guidelines section 5) still decide **where** these details are shown (detail views, not list views or mat-side screens).

## 5. Not built / open in the prototype

- Backend, shared storage, staff login, real email sending.
- Make-up handling at the *next* event (how a make-up candidate registers, and grading only their D categories). Notes say passed categories are kept, but nothing models it.
- Same-day and private fees; private star testing.
- Check numbers / receipts (open question in the notes).
- Whether passing updates the student's rank anywhere.
- Classes attended is recorded but computes nothing (trophies were dropped 2026-09-08).
- Multiple events / history (prototype holds one event).
- Editing or removing a candidate.
- **Superseded in the handoff:** its stack (Cloudflare Workers + D1, shared staff password) is replaced by the dashboard's Supabase + Cloudflare Pages + personal logins (10b). `STAR-TESTING.md` §10 still recommends Sheets — outdated; the app route was decided 2026-09-08.

## 6. Defects already found in the prototype — do not reintroduce

From the handoff (section 11): grading table losing scroll/focus after each change; auto-graded Assistant Instructor making "not graded" unreachable (track judged categories separately from the derived one); bare category names in results/CSV; calendar month arrows closing the calendar; future calendar days hidden instead of dimmed; UTC `toISOString()` for "today" (use local date); sticky headers needing a bounded scroll area; DOB captured then discarded; phone width hiding a category's grade and points together; stored-data shape changes wiping data (needs migrations); settings forms that half-save; re-enabled controls losing their committed value; `[hidden]` overridden by a display rule. Also: 0 classes attended shows as "not entered" (truthiness check) — treat 0 as a real value; CSV leaves score/result blank for incomplete rows — always say "Not graded" / "Incomplete".

## 7. Gaps and conflicts with the dashboard rulebook

| # | Item | Notes |
|---|---|---|
| 1 | **Two schools in one event** | **Resolved v0.58:** Star testing is joint (both schools, one room) and works on Both; the one-school rule (v0.34/v0.35) applies to Color belt testing only. |
| 2 | **Horizontal scrolling** | Grading sheet and roster are wide tables that scroll sideways. Rule 1.3: no horizontal scrolling on any screen size. Grading needs a new layout. |
| 3 | **Red for D / make-up** | Prototype marks D and "Make-up required" in red. Rule: red = delete/remove only. Becomes amber (warning) with text. |
| 4 | **Privacy (section 5)** | Roster list shows **fee and paid/due — billing details**, banned from list views. DOB and email are required (scoring and results emails) and fit the dashboard's future role as the student system; gender is dropped. Decision needed only on where they are shown and who can see them (detail view, Admin vs Staff). |
| 5 | **Email sending** | Dashboard has no email service. Results emails need one (new infrastructure, possibly cost). Rule 1.4: any message to families needs a confirmation dialog. |
| 6 | **Public registration** | Must use the v0.33 path (Cloudflare Pages Function + restricted database login). Not built yet — it is Color Belt phase 2. |
| 7 | **Rubric editing** | Handoff recommended rubrics/fees editable from a staff screen. Dashboard equivalent of Color Belt's "Classes and ranks" tab; Admin edits / Staff view (v0.40 pattern)? |
| 8 | **Where it lives** | **Decided v0.58:** inside Testing — clicking Testing lets staff choose Color belt testing or Star testing. How the choice looks is the next decision. |
| 9 | **Look** | Gold accents, uppercase labels/buttons, shadows, ~41px buttons, 29px titles, three font families at 600/700 weight, 9.5–11.5px text in places, dark mode, sidebar crest — all replaced by dashboard rules. |
| 10 | **Payments** | Prototype: one-click paid/due toggle. Color Belt phase 3 plans payment history; should star testing share it? |
| 11 | **Sequencing** | Color Belt phase 1 is approved; phases 2–5 not designed. P7 = one section/phase at a time. Order of Star vs Color Belt work needs a decision. |
| 13 | **Undo vs confirm (1.4)** | Paid toggle/school move need a 5-second Undo toast; bulk email (and any family message) needs a confirmation dialog. |
| 14 | **Lists and forms (8, 3.4)** | Row click → detail dialog; sortable headers; one tag per row (prototype has school + payment + status pills); validate as you type, errors under fields; optional fields under "More details". |
| 15 | **Prices per school (v0.36)** | **Resolved v0.58:** star prices (and rubrics) are shared by both schools and editable later; v0.36 applies to Color belt only. |
| 16 | **Change log + roles (5, 10.5)** | Grades, paid flag, email sends must be logged; who can grade / mark paid / send email / edit rubrics is undecided. |
| 12 | **Student records** | The dashboard will hold student records later (Kicksite-style). Until a Students section exists, star candidates are entered per event; the design should allow linking a candidate to a student record later. |
