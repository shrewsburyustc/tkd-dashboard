# Star Testing System — Project Notes

**Living document.** Everything decided about the U.S.T.C. Star Testing system lives here.
Update it in the same session anything changes — new decision, new rule, answered question,
shipped feature. If it isn't written here it will be re-litigated in three weeks.

- **Last updated:** 2026-09-10
- **Status:** frontend prototype complete; owner will deploy independently; backend still to be implemented
- **Owner:** Jeffrey Bergeron
- **School:** Jae H. Jeong's U.S. Taekwondo Center (U.S.T.C.) — Worcester and Shrewsbury, MA

## Working record

Keep this file updated whenever the project changes so the folder contains a current record
of what was requested, changed, and verified.

| Date | Change |
|---|---|
| 2026-09-09 | Registration now labels the rank choice as **Star progression** and lists the complete transitions: **0 to 1 star**, **1 to 2 stars**, and **2 to 3 stars**. Removed the redundant “Testing to 1 star” line and the invalid 3-to-4-star option. Updated both HTML versions. |
| 2026-09-09 | Replaced the seven separate grade buttons in every manually graded category with one compact dropdown containing A+, A, B+, B, C+, C, and D. Updated both HTML versions. |
| 2026-09-09 | Corrected the star limits by Dan: 1st Dan up to 4 stars, 2nd Dan up to 3 stars, and 3rd Dan up to 5 stars. Registration now builds the valid transitions in ascending order after the Dan is selected. Confirmed that stages, ranks, progressions, and other ordered choices should appear in chronological/natural order. Removed the separate Assistant Instructor grade control; staff enter the exact assistant-class count once and the grade and points are calculated automatically. Updated both HTML versions and the handoff. |
| 2026-09-10 | Added a dedicated portrait paper grading alternative. The selected Dan prints one candidate per page, with the candidate and event details, manually judged categories in rubric order, a blank grade line for each category, exact-number fields for attendance and assistant classes, a final-score line, and the grading/pass rules. The button no longer prints the webpage table. Updated both HTML versions and the handoff. |
| 2026-09-10 | Reworked the paper grading alternative into a landscape roster to fit many students on each page: student names run down the left column, subjects run across the top row in rubric order, and every intersection is an empty grading box. Attendance, exact assistant-class count, and total remain blank columns. Table headings repeat automatically if the roster continues onto another page. Updated both HTML versions and the handoff. |
| 2026-09-10 | Finalized the paper grading roster for testing day: removed Classes attended, Assistant classes, and Total so the sheet contains only student names and blank subject-grade boxes. Those values remain on the online grading sheet for entry after testing. For a two-school event, Shrewsbury and Worcester print as separate sections, Shrewsbury always comes first, and candidates are ordered by ascending star rank then name within each school. The same school and rank order is used throughout the online roster, grading, and results views. Updated the prototype, project notes, and handoff. |
| 2026-09-10 | Added an approved portrait Final Scoring printout from the Final Scores stage. It lists every candidate's name, star progression, score, and result. Not graded, incomplete, below-pass-mark, and D-category make-up reasons are written explicitly. Two-school events show separate Shrewsbury and Worcester sections in that order, with candidates in rank order. Updated the prototype, project notes, and handoff. |
| 2026-09-10 | Removed the Sites hosting connection after the owner chose to deploy independently. The completed source and deployment-ready `dist/index.html` remain in the project. Data is still stored on one device and emails remain previews until the backend, shared storage, staff access, and email delivery are implemented. |
| 2026-09-10 | Fixed the Final Scoring printout so long lists of make-up subjects wrap within the Result / note cell and expand the row downward instead of running outside the page boundary. Below-pass-mark and D-category reasons now print on separate wrapped lines. Updated the source and deployment-ready copy. |

---

## 1. What star testing is

Stars are the intermediate ranks **between** Dan ranks. A candidate who already holds a Dan
tests to add one star at a time. **1st Dan goes up to 4 stars, 2nd Dan goes up to 3 stars,
and 3rd Dan goes up to 5 stars.** Registration lists each valid progression in ascending
order. It is a separate event from Dan testing, with its own applications, rubrics and fee.

**Star testing exists for 1st, 2nd and 3rd Dan only.** There is no 4th Dan star testing,
even though the Dan testing system covers 4th Dan.

Source documents: the 2024 star testing applications (`1st_Dan star_Testing_2024.doc`,
`2nd Dan Star Testing 2024.doc`, `3rd Dan Star Test 2024.doc`) and
`Star Testing Final Scoring (Empty Template).docx`, all in the Claude project
**"Black Belt Testing"**.

---

## 2. The three rubrics

Every Dan carries **exactly 70 credits**. Maximum score is 70 × 4.5 = **315**.
Passing is **245** for all three — a B+ average straight across.

### 1st Dan — 11 categories

| Category | Credit | Max |
|---|---:|---:|
| White–Deputy Curriculum | 15 | 67.5 |
| Go-Ryo Poomse | 10 | 45 |
| Advanced Motion | 5 | 22.5 |
| Advance Sa-Bang Chuck | 5 | 22.5 |
| Step Sa-Bang Chuck | 5 | 22.5 |
| Two Step Sparring | 5 | 22.5 |
| Breaking | 5 | 22.5 |
| Appreciation Letters | 5 | 22.5 |
| Assistant Instructor | 5 | 22.5 |
| Knowledge | 5 | 22.5 |
| Korean Terminology | 5 | 22.5 |
| **Total** | **70** | **315** |

### 2nd Dan — 13 categories

| Category | Credit | Max |
|---|---:|---:|
| White–Deputy Curriculum | 10 | 45 |
| Geum-Kang Poomse | 5 | 22.5 |
| Instructor Sa-Bang-Chuk | 5 | 22.5 |
| Go-Ryo Poomse | 5 | 22.5 |
| Advanced Motion | 5 | 22.5 |
| Advance Sa-Bang Chuck | 5 | 22.5 |
| Step Sa-Bang Chuck | 5 | 22.5 |
| Two Step Sparring | 5 | 22.5 |
| Breaking | 5 | 22.5 |
| Appreciation Letters | 5 | 22.5 |
| Assistant Instructor | 5 | 22.5 |
| Knowledge | 5 | 22.5 |
| Korean Terminology | 5 | 22.5 |
| **Total** | **70** | **315** |


### 3rd Dan — 10 categories

| Category | Credit | Max |
|---|---:|---:|
| White–Deputy Curriculum | 20 | 90 |
| 1st & 2nd Dan Curriculum | 10 | 45 |
| Tae Baek Poomsae | 5 | 22.5 |
| 3rd Dan Sa-Bang Chuck | 5 | 22.5 |
| Creative Poomsae | 5 | 22.5 |
| Breaking | 5 | 22.5 |
| Appreciation Letters | 5 | 22.5 |
| Assistant Instructor | 5 | 22.5 |
| Knowledge | 5 | 22.5 |
| Korean Terminology | 5 | 22.5 |
| **Total** | **70** | **315** |

> **Known typo in the paper form:** the 3rd Dan sheet prints Korean Terminology B+ as
> **18.5**. Every other row is 17.5. We use **17.5**.

---

## 3. Scoring rules

### Grade scale

| A+ | A | B+ | B | C+ | C | D |
|---:|---:|---:|---:|---:|---:|---:|
| 4.5 | 4.0 | 3.5 | 3.0 | 2.5 | 2.0 | 0.0 |

**Category points = credit × grade value.** Total = sum of all categories.

### The pass rule — this is the one that matters

A candidate passes **only if all three are true**:

1. Every category is graded, and
2. Total ≥ **245**, and
3. **No category was graded D.**

**A D anywhere means a make-up, even when the total passes.** An all-A+ candidate with a
single D on a 5-credit category scores 292.5 — comfortably over 245 — and still does not
pass. This is not a bug and it is the rule most likely to be reimplemented wrong.

Everything the candidate already passed is kept. Only the D categories are re-tested at the
next star testing.

**Say why in the results email.** A parent who reads "Score 247.5, pass mark 245, result:
make-up required" with no explanation assumes the school made a mistake and phones. The
email must state that a D requires a make-up regardless of total.

---

## 4. Assistant Class table

The number of classes a candidate assisted converts to the **Assistant Instructor** letter
grade. The scale splits at age 13.

| Grade | 12 and under | 13 and up |
|---|---|---|
| A+ | 15 or more | 20 or more |
| A | 14 | 19 or 18 |
| B+ | 13 | 17 or 16 |
| B | 12 | 15 or 14 |
| C+ | 11 | 13 or 12 |
| C | 10 | 11 or 10 |
| D | under 10 | under 10 |

The grade is derived automatically from the exact count entered by staff. There is no
separate grade control and no manual override.

**Age must be derived from a stored date of birth, not frozen at registration.** A candidate
registered at 12 who turns 13 before the next cycle moves onto the harder adult scale.

---

## 5. Fees and payment

| Dan | Standard | Same day | Private |
|---|---:|---:|---:|
| 1st Dan | $140 | $150 | $160 |
| 2nd Dan | $150 | $160 | $170 |
| 3rd Dan | $160 | $170 | $180 |

- **Cash or check only.** No card for star testing.
- Paid at the front desk. Staff mark the fee received on the roster.
- These are an order of magnitude below Dan testing fees ($760–$2,320 with payment plans),
  so no payment-plan machinery is needed.

---

## 6. System design — four stages

### Stage 1 · Register (candidate-facing)

Reached from a QR code or link. Collects **only what the candidate actually knows**:

- Full name
- Date of birth — a click-a-day calendar with month and year dropdowns, **not** a native
  date input (paging back thirteen years one month at a time is unusable)
- Gender
- Email for results
- School (Shrewsbury / Worcester)
- Current Dan
- Star progression — valid choices depend on the selected Dan and appear in ascending order
- Paying by: Cash or Check

The rubric for the chosen Dan appears on the page so the candidate sees what they will be
graded on before they submit.

**Deliberately NOT collected:** phone number, classes attended, assistant classes taught.
The school holds the attendance records; the students do not. Asking them produces numbers
nobody can trust.

### Stage 2 · Master Roster (staff)

- One tab per Dan
- Within a tab, Shrewsbury is shown before Worcester when both schools attend; within each
  school, candidates are sorted **lowest rank first**, then alphabetically
- Capacity **100 per Dan** — deliberate overkill
- Shows fee, payment method, and a click-to-toggle paid/due marker
- CSV export

### Stage 3 · Grading Sheet (testing day)

- Pick the Dan; the categories change to match that rank
- One compact grade dropdown per manually judged category with A+ through D; a selected D is marked in red
- Points and running total update live, with the 245 mark shown on the meter
- **Two staff-entered columns at the far right**, after all graded categories:
  **Classes attended** and **Assistant classes** — both from school records, both looked up
  rather than judged, which is why they come last
- Staff enter the exact assistant-class count once; it sets the Assistant Instructor grade
  and points automatically, with no separate grade control or override
- Dedicated landscape paper grading roster: student names down the left and manually judged
  categories across the top in rubric order, with empty handwritten-grade cells. It omits
  attendance, assistant classes, and totals because those are entered and calculated online
  after testing day. Two-school events print separate school sections, Shrewsbury first

### Stage 4 · Final Scores

- Final score out of 315, result, and the make-up list
- Printable portrait Final Scoring sheet with each student's name, star progression, score,
  and result. It explicitly identifies not graded, incomplete, below-pass-mark, and D-category
  make-up cases. Two-school events show Shrewsbury above Worcester
- **No pass-mark column** — it is 245 for everyone, so it is stated once in the header
  instead of repeated down 100 rows
- Per-candidate email preview, and a send-to-everyone action
- Export must never be ambiguous: a row reading `247.5 … Advanced Motion` looks like a pass
  to anyone sorting the spreadsheet. Results read `MAKE-UP REQUIRED — D in Advanced Motion`.

---

## 7. Decisions log

| Date | Decision |
|---|---|
| 2026-09-01 | Star testing covers 1st–3rd Dan only; no 4th Dan star testing |
| 2026-09-01 | 2nd Dan rubric corrected to 70 credits by adding Instructor Sa-Bang-Chuk |
| 2026-09-01 | Roster capacity 100 per Dan ("overkill, better safe than sorry") |
| 2026-09-01 | Build a working app prototype first, then decide app vs Sheets |
| 2026-09-08 | Registration drops phone, attendance and assistant-class counts |
| 2026-09-08 | Attendance and assistant classes are entered by staff on the grading sheet |
| 2026-09-08 | Pass-mark column removed from Final Scores |
| 2026-09-08 | Payment method Cash or Check; no card |
| 2026-09-08 | Trophy eligibility removed entirely — the school has stopped awarding testing trophies for now. Attendance is still recorded, it just no longer computes anything |
| 2026-09-08 | Date of birth is a custom calendar with month/year dropdowns |
| 2026-09-08 | School records columns moved to the end of the grading sheet |
| 2026-09-09 | Star limits corrected: 1st Dan up to 4, 2nd Dan up to 3, and 3rd Dan up to 5; choices display in ascending order |
| 2026-09-09 | Assistant Instructor has no manual grade control or override; its grade comes only from the exact assistant-class count entered by staff |
| 2026-09-09 | Ordered stages, ranks, progressions and choices are presented chronologically or in natural ascending order |
| 2026-09-10 | Printing from the grading screen produces a dedicated landscape roster containing only student names and blank subject-grade boxes. Attendance, assistant classes, and totals are omitted for later online entry and calculation. Two-school events print separate school sections with Shrewsbury first; within each school candidates are in ascending star-rank order, then alphabetical order |
| 2026-09-10 | Final Scores has a dedicated portrait printout listing every student's name, star progression, score, and result or unfinished/make-up reason. Shrewsbury appears above Worcester and each school remains in ascending star-rank order |
| 2026-09-10 | Deployment will be handled independently by the owner. Keep the visible warning that data is device-local and emails are not actually sent until the backend is built |

## 8. Open questions

1. **Check numbers and receipts.** The Dan system records a check number, stamps a date and
   emails a receipt. Star testing currently knows only Cash/Check and paid/unpaid. Is that
   enough at $140–$160?
2. **App or Sheets** — the actual architecture decision. See section 10.
3. **"One system for all testings."** Jeffrey has raised unifying Dan and star testing.
   Not started; see section 10 for why it is not the next move.
4. **What "School" means on the roster** — Worcester/Shrewsbury location is assumed. The Dan
   system's Master Roster has a "Class" column that may mean something else.

---

## 9. Reference — the existing Dan testing system

Lives on the machine **ustc** at `Desktop\Claude CoWork\Black Belt`. Not in git.

```
Black Belt/
  Candidate Handouts/            1st–4th Dan .docx
  Links & QR Codes/              per-Dan registration QR codes
  Original Applications & Guidelines/
      Dan Testing 2026/          1st–4th Dan applications
      BlackBelt Testing Score Guidelines (Updated).docx
  Printable Rubric/              Black Belt Testing Score Rubric .docx + .pdf
  Scoring Spreadsheet/           Black Belt Testing System (DRAFT v10).xlsx
  Website & Backend/
      AppsScript_Code.gs         1,541 lines, 15 documented sections
      Registration Site/         index.html + 1st–4th dan pages + requirements
      email-template.html, receipt-template.html
```

**Stack: Google Sheets + Apps Script, plus a static HTML registration site.** Not Cloudflare
Workers — that is the camps project (`tkd-camps`).

The spreadsheet has 16 tabs: Start Here, Master Roster, Physical Scoring, Technical Testing,
Other Req & Extra Pts, a Curriculum + Final Results tab per Dan, 4th Dan extras, Thresholds.

The script provides a `🥋 Black Belt` menu in the sheet: results emails, make-up emails, a
permanent Make-Up Tracker that survives "Start New Cycle", printable Technical and Curriculum
rosters with a Dan picker, a Payments sheet with check recording and receipt emails, and
signature capture into Drive.

**Structural details worth knowing before copying it:**
- Roster is hard-capped at 20 rows (`ROSTER_FIRST_ROW = 3`, `ROSTER_LAST_ROW = 22`) and every
  formula on all 16 tabs is written out row by row to match.
- Final Results row N maps to Master Roster row **N − 2**. Fragile coupling; do not mix
  candidate populations in one sheet.
- Dan pass marks vary by rank **and** age: 1st Dan Adult 293 / Child 275, 2nd 261, 3rd 293,
  4th 453. Star testing is a flat 245 with no adult/child split.
- Make-ups are derived from column H: any subject graded D, joined with TEXTJOIN.

### Bug found in the live Dan system (not yet fixed)

`resultsEmailBody_()` has the same gap the prototype had: a candidate who scores above the
pass mark but took a D gets "Result: Make-up required" with no explanation of why a passing
score didn't pass. Two-line fix, worth doing.

---

## 10. Architecture — where this stands

**Recommendation on the table: build Star Testing the same hybrid way the Dan system already
is** — a web registration page plus a Google Sheet with Apps Script for roster, grading and
results. The Dan system is not "a Sheets system"; it is already the correct split, app where
an app is better and Sheets where Sheets is better.

Arguments, honestly:

| | Sheets + Apps Script | Full app |
|---|---|---|
| Cost | $0 | ~$0 (Workers free tier) |
| Who can fix it without Jeffrey | any staff member | nobody |
| Email | `MailApp`, one line, already working | needs a third-party service and API key |
| Backup | Drive version history | his problem |
| Offline at the venue | irrelevant — grading is on paper | irrelevant |
| Rubric change | edit cells | edit code, test, deploy |
| Registration form, validation, phone grading | weak | strong |

The deciding factor is the second row. Jeffrey no longer instructs and will not be the person
running these events, so anything only he can maintain is an operational risk.

**On unifying Dan + star testing:** the instinct is right, the timing is wrong. The two share
almost nothing but a person's name and email — different rubrics, pass marks, fees, events.
Unifying costs a rewrite of 1,541 lines of working Apps Script and buys one candidate list.
The cheap version, if wanted later, is a shared candidate list both systems read from.

---

## 11. The prototype

Published as a Claude Artifact (see the "Star Testing Floor" artifact). Single self-contained
HTML file, source at `/home/claude/star-testing.html` in the Cowork session.

**What it proves:** the four stages, the real rubrics, the real Assistant Class table, the
D-anywhere rule, and the email wording. Scoring verified by running the code, not reading it:
all three Dans total exactly 70 credits, all-B+ lands on exactly 245 and passes, A+ with one
D scores 292.5 and correctly fails.

**What it does not have — and this is the whole question:** a backend. Data lives in one
browser on one device. Grade on a phone, open on the school laptop, see different data.

### Defects found and fixed — do not reintroduce

Two rounds of independent review caught these. They are listed because most would come back
if the system is rebuilt from scratch.

- **Rebuilding the grading table reset its horizontal scroll and dropped focus**, throwing the
  examiner back to the first category after every single tap. Preserve `scrollLeft` and
  refocus the control that was used.
- **The auto-graded Assistant Instructor category made "not graded" unreachable** — an
  untouched candidate showed a score of 22.5 as if partly examined. Track examiner taps
  separately from categories that have a derived grade.
- **A results row of `247.5 … Advanced Motion`** read as a pass in the CSV. Never emit a bare
  category name as a result.
- **Ghost buttons were invisible in 5 of 6 theme states** — a dark-theme rule for solid
  buttons out-ranked the ghost rule on specificity and painted transparent buttons with the
  solid button's text colour. Scope theme overrides with `:not(.ghost)`.
- **Clicking the calendar's month arrows closed the calendar** — redrawing detaches the
  clicked button, so an outside-click handler walking up from `e.target` finds nothing. Use
  `e.composedPath()`, captured at dispatch.
- **Future calendar days rendered completely blank**, making the current month look empty.
  Dim them, don't hide them.
- **`toISOString()` for "is this date in the future"** is UTC — after 8pm Eastern, tomorrow
  became selectable and then failed validation with an unexplainable error. Build today's
  date from local getters.
- **Sticky table headers never stuck** because the scroll container had no bounded height.
- **Date of birth was captured, used once, then discarded**, freezing a candidate on the
  child assistant scale forever.
- At 390px an examiner could not see one category's chips and its points at the same time.
  The grading sheet gets used on a phone; test at that width.

---

## 12. Changelog

- **2026-09-01** — Read the 2024 star applications and the live Dan system. Found the 2nd Dan
  65-credit error and the 3rd Dan 18.5 typo. Confirmed the Dan system is Sheets + Apps
  Script. Built and published the first prototype.
- **2026-09-08** — Registration slimmed; attendance and assistant classes moved to grading.
  Pass-mark column removed. Cash/Check payment added. School logo added. Trophy eligibility
  removed. Date of birth became a real calendar. School-record columns moved to the end of
  the grading sheet. Two review passes; 18 defects fixed.
- **2026-09-08 (later)** — School became a property of the testing event, not a fixed form
  field, with a staff-controlled toggle for whether to ask it. Architecture decided: full app
  (Cloudflare Workers + D1), not Sheets + Apps Script. Wrote `PERPLEXITY-BUILD-BRIEF.md` (a
  tool-agnostic build brief, code withheld, for an independent build with Perplexity Computer)
  and `COMPARISON-SCORECARD.md` (how to judge that build against this prototype).
- **2026-09-09** — Moved all six Star Testing project files (this doc, the handoff doc, the
  Perplexity brief and scorecard, and both HTML prototypes) into a new `Star Testing`
  subfolder inside the `Black Belt` folder, separate from the existing Dan Testing System's
  folders and files, which were left untouched.
