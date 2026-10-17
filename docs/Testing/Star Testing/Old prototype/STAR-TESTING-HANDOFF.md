# Star Testing System — Complete Handoff

**Read this first.** You are picking up a half-built project cold. This document contains
everything decided so far: the domain rules, the scoring maths, every design decision and why
it was made, the open questions, and a list of bugs already found and fixed so you don't
reintroduce them. A working prototype accompanies it (see Appendix C).

Nothing here needs to be re-derived. The rubrics were transcribed from the school's own 2024
paper applications and the scoring was verified by executing it, not by reading it.

- **Project:** Star Testing registration, roster, grading and results system
- **Client:** Jae H. Jeong's U.S. Taekwondo Center (U.S.T.C.) — Worcester and Shrewsbury, MA
- **Owner:** Jeffrey Bergeron
- **Last updated:** 2026-09-10
- **Status:** DECIDED — building a full app, not Sheets + Apps Script (section 10). The frontend prototype is complete and the owner will deploy it independently; the backend is the next real work.
- **Scope note:** the Testing Event in Stage 0 is designed to cover colour belt, star and Dan
  testing without change. It is the piece that makes "one system for all testings" cheap.

### The five things most likely to be got wrong

1. **A D in any category means a make-up, even when the total passes.** A candidate can score
   292.5 against a pass mark of 245 and still not pass. Section 3.
2. **Every Dan totals exactly 70 credits.** If your rubric doesn't add to 70, it's wrong.
3. **School is a property of the event, not a fixed question on the form.** Section 6, Stage 0.
4. **Attendance and assistant-class counts are entered by staff, never by the candidate.**
   The school holds those records; the students don't.
5. **The pass mark is 245 for all three Dans** — unlike Dan testing, which varies by rank and age.

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

> **History:** the 2024 2nd Dan form totalled only 65 credits while claiming 70 — a real
> error that made 245 harder to reach for 2nd Dan than for anyone else. Jeffrey corrected it
> on 2026-09-01 by adding **Instructor Sa-Bang-Chuk (credit 5)** and renaming the old
> "Kor Poomse" line to **Go-Ryo Poomse**. Fixed form uploaded to the project.

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

## 6. System design — five stages

### Stage 0 · Testing Event (set up before registration opens)

The event is created first, and what it says changes what everyone downstream sees.

| Setting | Notes |
|---|---|
| Event name | e.g. "Fall 2026 Star Testing" |
| Testing date | |
| **Which schools are testing** | Shrewsbury, Worcester, or both |
| **Ask each candidate which school they train at** | On/off, decided by staff — not inferred |

**Why school is an event setting and not a fixed form question.** Colour belt testing runs
at one location, so asking a candidate to choose between two schools is a question with one
right answer and a chance to get it wrong. Star and Dan testing put **both locations in the
same room**, and staff have to tell Worcester students from Shrewsbury ones.

Three configurations, all supported:

1. **One location** — the candidate is never asked; everyone is stamped with that location;
   the school column is hidden on the roster, the grading sheet and the export, because every
   row would say the same thing.
2. **Two locations, asking ON** — registration asks and will not accept a blank. The roster
   shows a school column and a Shrewsbury / Worcester / Both filter with counts.
3. **Two locations, asking OFF** — registration does not ask; new candidates land on the
   first location as a placeholder and staff set the real one by clicking the school on the
   roster. Column and filter still appear.

Staff can always correct a candidate's school from the roster, in every configuration with
more than one location — someone will pick wrong.

**Guard:** removing a location that candidates are already registered under is refused, and
the message names them. Silently relabelling a Shrewsbury student as Worcester is worse than
making staff deal with it.

**Nothing else varies by location.** Fees, rubrics and the 245 pass mark are school-agnostic.

> Generalises to colour belt and Dan testing unchanged — this is the setting that lets one
> system cover all three.

### Stage 1 · Register (candidate-facing)

Reached from a QR code or link. Collects **only what the candidate actually knows**:

- Full name
- Date of birth — a click-a-day calendar with month and year dropdowns, **not** a native
  date input (paging back thirteen years one month at a time is unusable)
- Gender
- Email for results
- School — **only when the testing event says to ask** (see Stage 0)
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
- School column, filter and click-to-move pill, when the event has two locations
- CSV export (drops the School column on a one-location event)

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
| 2026-09-08 | School became a property of the **testing event**, not a fixed form question — colour belt runs at one location, star and Dan testing put both locations in one room |
| 2026-09-08 | Whether the candidate is asked is an **explicit staff toggle**, not inferred from the number of locations |
| 2026-09-08 | **Architecture decided: full app, not Sheets + Apps Script.** Backend, email service and staff login are now in scope |
| 2026-09-08 | Evaluating Perplexity Computer as the build tool; it gets the spec and acceptance tests, not the existing code, so the comparison is fair |
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
2. **"One system for all testings."** Raised but not started. Stage 0 is the piece that
   makes it cheap when wanted.
3. **What "School" means on the roster** — Worcester/Shrewsbury location is assumed. The Dan
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

## 10. Architecture — DECIDED: the app route

**2026-09-08 — Jeffrey chose to build a full application, not the Sheets + Apps Script
hybrid.** That decision is made; this section records it and what it now requires. The
argument for the hybrid is kept below for the record, not to reopen it.

### What the app route now needs

| Piece | Notes |
|---|---|
| Frontend | The five stages in section 6. Already prototyped. |
| Backend + database | The prototype has none. This is the real work. Cloudflare Workers + D1 is the default — the school's camp system already runs on it and the owner knows the stack. |
| Email | **Workers cannot send mail.** Needs a free-tier transactional service, or a small relay that sends from the school's existing Google account. Not optional: results emails are the point of stage 4. |
| Staff access control | A shared password, matching the camp system's admin screen. |
| Hosting | Workers, same account as the camp system. |

Zero budget stands — free tiers only.

### The known trade-off, recorded once

An app is something only its builder can fix. Jeffrey no longer instructs and will not be the
person running these events, so a rubric change or a stuck registration goes through him.
The hybrid would have let any staff member edit a cell. He has weighed that and chosen the
app; the mitigation is to keep rubrics and event settings editable from a staff screen rather
than hardcoded, so the common changes never need a deploy.

### The case for the hybrid, for the record

| | Sheets + Apps Script | Full app |
|---|---|---|
| Cost | $0 | ~$0 (Workers free tier) |
| Who can fix it without Jeffrey | any staff member | nobody |
| Email | `MailApp`, one line, already working | needs a service and an API key |
| Backup | Drive version history | his problem |
| Rubric change | edit cells | edit code, test, deploy — unless made editable |
| Registration form, validation, phone grading | weak | strong |

**On unifying Dan + star testing:** the two share almost nothing but a person's name and
email — different rubrics, pass marks, fees, events. The cheap version, if wanted later, is a
shared candidate list both systems read from. The Stage 0 Testing Event is designed to make
this cheap.

## 11. The prototype

Single self-contained HTML file — `star-testing.html`, shipped with this document. No build
step, no dependencies, no external requests except Google Fonts. Open it in a browser.

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
- **Changing the stored data shape silently wiped real rosters.** Storage went from a bare
  candidates array to `{candidates, event}`; the loader checked `d.candidates` on what was
  still an array, found nothing, fell back to demo data, and the next save overwrote the real
  roster. Any change to a stored shape needs a migration for the old one.
- **A settings form that half-committed.** The location checkboxes previewed without saving
  while the ask toggle wrote to storage immediately and re-rendered — which also wiped
  whatever had been typed into the name and date fields. One committer (Save), everything
  else previews.
- **Unchecking then re-checking a location silently turned the school question off.**
  Disabling a checkbox cleared it; re-enabling never restored it, so Save wrote a setting
  nobody chose. Restore the committed value when re-enabling a control.
- **`.field` sets `display:flex`, which out-ranks the `[hidden]` rule**, so the hidden school
  question still rendered outside the artifact host. Any element hidden via `.hidden` needs
  its own `[hidden]{display:none}` rule when its class sets a display.

---

## 12. Changelog

- **2026-09-01** — Read the 2024 star applications and the live Dan system. Found the 2nd Dan
  65-credit error and the 3rd Dan 18.5 typo. Confirmed the Dan system is Sheets + Apps
  Script. Built and published the first prototype.
- **2026-09-08** — Registration slimmed; attendance and assistant classes moved to grading.
  Pass-mark column removed. Cash/Check payment added. School logo added. Trophy eligibility
  removed. Date of birth became a real calendar. School-record columns moved to the end of
  the grading sheet. Two review passes; 18 defects fixed.
- **2026-09-08 (later)** — Added Stage 0, the Testing Event: name, date, which schools are
  testing, and an explicit toggle for whether candidates are asked their school. Roster gained
  a school filter and a click-to-move school pill. Third review pass; 7 more defects fixed,
  including a storage migration that would have wiped a real roster.
- **2026-09-09** — Corrected the star limits to 1st Dan/4, 2nd Dan/3 and 3rd Dan/5. Changed
  manual category grading to compact A+–D dropdowns and made Assistant Instructor derive only
  from the exact assistant-class count.
- **2026-09-10** — Added the dedicated landscape paper roster, then finalized it as a testing-
  day worksheet containing only student names and blank subject-grade boxes. Attendance,
  assistant classes and totals stay online for later entry and calculation. Two-school events
  print separate sections in Shrewsbury-then-Worcester order, with candidates ordered by star
  rank and then name within each school. Added the approved portrait Final Scoring sheet with
  names, star progressions, scores, and explicit unfinished or make-up reasons. The owner
  chose to handle deployment independently, so the Sites hosting connection was removed while
  preserving the deployment-ready page and its device-only data and email-preview warnings.
  Fixed Final Scoring print overflow so long make-up lists wrap inside the result cell, with
  below-pass-mark and D-category reasons on separate lines.

---

# Appendix A — The rubrics as data

Drop-in JavaScript. Every array must sum to 70 credits.

```js
const RUBRICS = {
  "1st Dan": [
    { name: "White–Deputy Curriculum", credit: 15 },
    { name: "Go-Ryo Poomse",            credit: 10 },
    { name: "Advanced Motion",          credit: 5 },
    { name: "Advance Sa-Bang Chuck",    credit: 5 },
    { name: "Step Sa-Bang Chuck",       credit: 5 },
    { name: "Two Step Sparring",        credit: 5 },
    { name: "Breaking",                 credit: 5 },
    { name: "Appreciation Letters",     credit: 5 },
    { name: "Assistant Instructor",     credit: 5, auto: true },
    { name: "Knowledge",                credit: 5 },
    { name: "Korean Terminology",       credit: 5 }
  ],
  "2nd Dan": [
    { name: "White–Deputy Curriculum", credit: 10 },
    { name: "Geum-Kang Poomse",         credit: 5 },
    { name: "Instructor Sa-Bang-Chuk",  credit: 5 },
    { name: "Go-Ryo Poomse",            credit: 5 },
    { name: "Advanced Motion",          credit: 5 },
    { name: "Advance Sa-Bang Chuck",    credit: 5 },
    { name: "Step Sa-Bang Chuck",       credit: 5 },
    { name: "Two Step Sparring",        credit: 5 },
    { name: "Breaking",                 credit: 5 },
    { name: "Appreciation Letters",     credit: 5 },
    { name: "Assistant Instructor",     credit: 5, auto: true },
    { name: "Knowledge",                credit: 5 },
    { name: "Korean Terminology",       credit: 5 }
  ],
  "3rd Dan": [
    { name: "White–Deputy Curriculum",  credit: 20 },
    { name: "1st & 2nd Dan Curriculum",  credit: 10 },
    { name: "Tae Baek Poomsae",          credit: 5 },
    { name: "3rd Dan Sa-Bang Chuck",     credit: 5 },
    { name: "Creative Poomsae",          credit: 5 },
    { name: "Breaking",                  credit: 5 },
    { name: "Appreciation Letters",      credit: 5 },
    { name: "Assistant Instructor",      credit: 5, auto: true },
    { name: "Knowledge",                 credit: 5 },
    { name: "Korean Terminology",        credit: 5 }
  ]
};

const GRADE_VALUES = { "A+": 4.5, "A": 4.0, "B+": 3.5, "B": 3.0, "C+": 2.5, "C": 2.0, "D": 0.0 };
const PASS_MARK = 245;          // same for all three Dans
const MAX_SCORE = 315;          // 70 credits x 4.5
const ROSTER_CAP = 100;         // per Dan

const FEES = {
  "1st Dan": { normal: 140, sameDay: 150, private: 160 },
  "2nd Dan": { normal: 150, sameDay: 160, private: 170 },
  "3rd Dan": { normal: 160, sameDay: 170, private: 180 }
};

// Assistant classes taught -> Assistant Instructor letter grade. Split at age 13.
const ASSIST = {
  child: [ {g:"A+",min:15}, {g:"A",min:14}, {g:"B+",min:13}, {g:"B",min:12}, {g:"C+",min:11}, {g:"C",min:10} ],
  adult: [ {g:"A+",min:20}, {g:"A",min:18}, {g:"B+",min:16}, {g:"B",min:14}, {g:"C+",min:12}, {g:"C",min:10} ]
};
```

# Appendix B — The scoring, exactly

```js
function assistLetter(age, taught){
  // Unknown age falls to the harder adult scale rather than handing an adult
  // the children's thresholds.
  const band = (age == null || age >= 13) ? ASSIST.adult : ASSIST.child;
  for (const b of band) if (taught >= b.min) return b.g;
  return "D";
}

// Assistant Instructor derives only from the exact class count entered by staff.
function effectiveGrade(candidate, category){
  if (category.auto){
    if (candidate.assist == null || candidate.assist === "") return "";
    return assistLetter(ageOf(candidate), candidate.assist);
  }
  const g = candidate.grades[category.name];
  if (g) return g;
  return "";
}

function score(candidate){
  const cats = RUBRICS[candidate.dan];
  let total = 0, graded = 0, tapped = 0;
  const makeups = [];
  for (const cat of cats){
    if (!cat.auto && candidate.grades[cat.name]) tapped++; // manually judged categories
    const g = effectiveGrade(candidate, cat);
    if (!g) continue;
    graded++;
    total += cat.credit * GRADE_VALUES[g];
    if (g === "D") makeups.push(cat.name);
  }
  const complete = graded === cats.length;
  return {
    total, graded, tapped, complete, makeups,
    of: cats.length,
    max: 315,
    belowMark: total < PASS_MARK,
    // All three conditions. The third is the one that gets forgotten.
    passed: complete && total >= PASS_MARK && makeups.length === 0
  };
}
```

**`tapped` vs `graded` matters.** Assistant Instructor is graded only after staff enter the
exact assistant-class count. It is never counted as a manually judged category.

**Age comes from a stored date of birth, not a number frozen at registration.** A candidate
who registers at 12 and turns 13 before the next cycle moves onto the harder adult scale.

### Test cases — any implementation should pass these

| Input | Expected |
|---|---|
| All A+, any Dan | 315.0, passes |
| All B+, any Dan | **exactly 245.0**, passes |
| All A+ with one D on a 5-credit category | 292.5, **fails**, make-up lists that category |
| Nothing graded, assist = 20 | `tapped` 0, score not shown as a partial result |
| `assistLetter(12, 14)` | `A` |
| `assistLetter(13, 19)` | `A` |
| `assistLetter(13, 18)` | `A` |
| `assistLetter(13, 17)` | `B+` |
| `assistLetter(12, 9)` | `D` |
| `assistLetter(null, 14)` | `B` (adult scale) |
| Credit sum, each Dan | 70 |

# Appendix C — Files in this handoff

| File | What it is |
|---|---|
| `STAR-TESTING-HANDOFF.md` | This document. The complete spec. |
| `star-testing.html` | The working prototype, self-contained, ~133 KB. Open it in a browser. The school crest is inlined as a base64 data URI. |

The prototype is one HTML file with no build step, no dependencies and no external requests
except Google Fonts. It stores data in `localStorage`, which is the point of section 10: it
has no backend, so data lives in one browser on one device.

# Appendix D — Where to pick up

**Unfinished, in rough priority order:**

1. **Build the backend.** This is the whole gap. The prototype's `localStorage` is a
   placeholder, not a design — data currently lives in one browser on one device. Cloudflare
   Workers + D1 is the default stack; the school already runs its camp system there.
2. **Solve email.** Workers cannot send mail. Pick a free-tier service or relay through the
   school's existing Google account. Results emails are the point of stage 4, so this is not
   optional.
3. **Add staff access control.** A shared password matching the camp system is fine.
4. **Keep rubrics and event settings editable from a staff screen**, not hardcoded — this is
   the mitigation for the app route's main weakness, that only the builder can change it.
5. **Answer the remaining open questions** in section 8.

**Not yet started:** signature capture, check-number recording and receipt emails, a make-up
tracker that persists across testing cycles, and any kind of staff login.
