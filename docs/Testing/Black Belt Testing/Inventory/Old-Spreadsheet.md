# Black Belt Testing — Google Sheets export inventory

Source: "Copy of Black Belt Testing System_Updated (9_30_26).xlsx" (Jeffrey, 2026-10-18) (opened read-only with openpyxl, formulas + cached values). The companion Apps Script (the Apps Script code Jeffrey exported (Downloads, 2026-10-18)) was read as text only (never run) to explain things the formulas don't show.
Privacy: no person's name, email, DOB, signature link or other personal value is copied here. Only counts and shapes are given.

---

## 0. The big picture

- **22 visible sheets.** None hidden or protected. No named ranges. No IMPORTRANGE or QUERY. One FILTER/SORT (on the print rosters).
- **Hub-and-spoke by row position.** `Master Roster` row *m* (rows 3–202, max 200 candidates) is the hub. Every scoring tab row *r* = *m*+2 (rows 5–204), and `Payments` row = *m*+3. All links work by **row position**, not by an ID.
- **Per-Dan tabs show every row but blank out other Dans' candidates** (formula `IF('Master Roster'!$E$m="1st Dan", …, "")`). Then other Dans' rows are **hidden** (181–197 hidden rows per tab).
- **Apps Script does a lot of the work:** the public registration web app (`doPost`) writes the roster + log, saves a signature PNG to Drive and sends a confirmation email. A custom menu "🥋 Black Belt" sends results / make-up / receipt emails, sorts the roster (moves grades and payments with each person), removes a candidate, starts a new cycle, builds the Payments and print tabs, and archives non-passers. `onEdit` stamps the date beside a typed payment.
- **State of this export:** the Master Roster is **empty** (0 candidates). Payments and all scoring tabs hold no inputs. Only `Registrations Log` (43 rows) and `Make-Up Tracker` (24 rows) contain records. The Final Results tabs have a few **stale literal values** below the formula range (see §7).

---

## 1. Sheets

Type notation: **[in]** = typed by staff (a yellow cell), **[f]** = formula, **[s]** = written by the script, **(hidden)** = hidden column.

### 1.1 Master Roster — the candidate list (hub)
Used range A1:Z999. Title in row 1, header in row 2, data in rows 3–202. Freeze at A3. **0 data rows in this export.**

| Col | Header | Type / shape | Source |
|---|---|---|---|
| A | # | int 1..N | [f] `=IF($B3="","",COUNTA($B$3:$B3))` |
| B | Full Name | text ("exactly as it prints on the belt") | [in]/[s] |
| C | Age | int (worked out from DOB **at registration**, then stored as a fixed number) | [s] |
| D | Gender | DV `M,F` | [s] (the form sends `Male`/`Female`, see §7) |
| E | Testing For | DV `1st Dan,2nd Dan,3rd Dan,4th Dan` | [s] |
| F | Kukkiwon Cert | DV `Y,N` | [s] |
| G | Cert Fee | dollar amount or blank | [f] `=IF($F3="Y", IFS($E3="1st Dan",100,$E3="2nd Dan",110,$E3="3rd Dan",140,$E3="4th Dan",170), "")` (missing on rows 22–27) |
| H | Class (hidden) | DV `Child,Adult` | **[in] only. Registration never sets it** |
| I | Email (hidden) | email | [s] |
| J | Date of Birth | date | [s] |
| K | Signature (hidden) | Google Drive file URL (PNG of signature) | [s] |
| L | Submitted | timestamp | [s] |
| M | Payment Plan | `Pay in Full` / `3 Payments` | [s] |

Data validation covers only rows **3–27** (25 rows), although the roster holds 200.

### 1.2 Registrations Log — append-only copy of every form submission
A1:K44. Header row 1, freeze A2. **43 data rows** (submitted 2026-06-17 → 2026-10-08). 40 distinct names (so there are repeats/re-submissions). Ages 0–44. Some rows are clearly tests (age 0, DOB = submit date).

| Col | Header | Shape | Distribution |
|---|---|---|---|
| A | Submitted | timestamp | — |
| B | Full Name | text | — |
| C | DOB | date | — |
| D | Age | int | 0–44 |
| E | Gender | `Male`/`Female` | 34 / 9 |
| F | Dan | `1st Dan`…`4th Dan` | 26 / 5 / 5 / 7 |
| G | Kukkiwon | `Yes`/`No` | 28 / 15 |
| H | Email | email (25 distinct, so families share one) | — |
| I | Signed By | `Self (18+)` or `Parent/Guardian: <name>` | — |
| J | Signature Link | Drive URL | — |
| K | Payment Plan | `Pay in Full` / `3 Payments` / blank | 14 / 27 / 2 |

### 1.3 Testing Info — the config table for the cycle (key/value)
A1:B48, two columns: label → value. It is read by VLOOKUP (Payments) and by the script (emails, public site JSONP). It is written by the "admin page" (`doPost action=updateInfo`), which stores every value as **text** (`@` format). Full values are copied in §3.1.

### 1.4 Thresholds — physical-test grade cut-offs
A1:H29. Columns: Event · Bracket · Dir · A+ · A · B+ · B · C. Full table in §3.2. The formulas read it **by fixed row number** (`INDEX(Thresholds!$D:$D, k+bIdx)`).

### 1.5 Physical Scoring — physical test, all Dans (title wrongly says "1st Dan")
A1:BH204. Title row 1, group row 2 (INDOOR — at the dojang / OUTDOOR / RESULT), event row 3, sub-header row 4, data rows 5–204. Freeze D5. 0 graded rows. Z (Method) is pre-filled `Hold` on 199 rows.

| Cols | Header | Shape |
|---|---|---|
| A,B,C | #, Candidate Name, Age | [f] from roster (all Dans) |
| D (hidden) | Bracket | [f] `≤8` / `9-12` / `13+` from Age |
| E (hidden) | bIdx | [f] 1/2/3 |
| F,G,H | Stretching (in) [cr 3] Raw/Grade/Pts | inches [in]; grade A+…D [f]; pts = 3×GP |
| I,J,K | Sit-up (20s) [cr 2] | count |
| L,M,N | Push-up (1min) [cr 2] | count |
| O,P,Q | Static Jump (in) [cr 2] | inches |
| R,S,T,U | Long Jump Feet/In/Grade/Pts [cr 2] | feet + inches (made into inches) |
| V,W,X | Sprint 4x10m (s) [cr 2] | seconds (lower is better) |
| Y | Subtotal /52 | [f] `SUM(H,K,N,Q,U,X)` |
| Z,AA,AB,AC | Pull-up [cr 2] Method/Raw/Grade/Pts | DV `Reps,Hold`; reps or seconds |
| AD,AE,AF | Sprint 100m (s) [cr 2] | seconds |
| AG,AH,AI,AJ | 0.5/1 Mile Min/Sec/Grade/Pts [cr 3] | minutes + seconds |
| AK | Subtotal /28 | [f] `SUM(AC,AF,AJ)` |
| AL | Total /80 | [f] `Y+AK` |
| AM | Percent | [f] `AL/80` |

### 1.6 Technical Testing — 1st–3rd Dan technical test
A1:P204, header rows 2–4, data rows 5–204, freeze E5. Grade DV on E,G,L,N: `A+,A,A-,B+,B,B-,C,C-,D`.

| Cols | Subject [credits] | Input | Points |
|---|---|---|---|
| E,F | Referee Seminar [cr 2] | grade | 2×TechGP |
| G,H | Free Sparring [cr 3] | grade | 3×TechGP |
| I,J,K | Target Kick (30s) [cr 2] | kick count; grade auto from count by age | 2×GP |
| L,M | (Korean) Terminology [cr 2] | grade | 2×TechGP |
| N,O | (TKD) Knowledge [cr 2] | grade | 2×TechGP |
| P | TOTAL /44 | [f] `SUM(F,H,K,M,O)` | |

### 1.7 Other Req & Extra Pts — 1st–3rd Dan other requirements + bonus
A1:BH204, data rows 5–204. Grade DV on E,G,I,K,M.

| Cols | Item | Input | Points |
|---|---|---|---|
| E,F | Egg Test [cr 5] | grade | table 20/17.5/16.25/15/11/10.5/10/5/0 |
| G,H | Meditation [cr 4] | grade | table 16/14/13/12/9/8.5/8/4/0 |
| I,J | Ass. Ins. Course [cr 5] | grade | same table as Egg |
| K,L | Apprec(iation) Letter [cr 2] | grade | 8/7/6.5/6/5/4.5/4/2/0 |
| M,N | TKD Project (also called "Essay") [cr 4] | grade | same table as Meditation |
| O | Subtotal /80 | [f] sum | |
| P,Q | Extra Stripes | count | pts = count |
| R,S | Outstanding Perf. | count | 5 if count ≥ 5 (1st) / ≥ 4 (2nd) / ≥ 3 (3rd+), else 0 |
| T,U | Competition | count | ≥5→15, 4→10, 3→7, 2→5, 1→3 |
| V,W | Attendance | count (classes) | 1st: ≥400→10, ≥375→5, ≥320→3 · 2nd: ≥300/271/250 · 3rd+: ≥250/231/210 |
| X,Y | Special Event | count | ≥10→10, ≥6→5, ≥3→3 |
| Z,AA | Breaking Class | count | 1st: ≥25→10, ≥20→5, ≥16→3 · others: ≥21/17/11 |
| AB | Extra Subtotal | [f] sum (no cap) | |
| AC | SHEET TOTAL | [f] `O+AB` | |

### 1.8 Curriculum tabs (one per Dan)
Data rows 5–204. They show only that Dan's candidates; other rows are hidden. Grade DV = `A+,A,A-,B+,B,B-,C,C-,D` (**no `C+`**, though the formula scores it). Pts = credits × CurrGP.

- **1st Dan – Curriculum** (A1:U204): Basic 10 Motions (1-7) [5] · Tae-Geuk Poomsae (1-8) [5] · Sa Bang Chuck (1-13) [5] · One Step Sparring (1-24) [5] (K = DV `Yes,No` "Score?", adults only; scored only if Yes) · Technical Break [5] · Power Break [5] · Self-Defense [5]. T = Curriculum Subtotal. U = Max `135 + IF(K="Yes",22.5,0)`.
- **2nd Dan – Curriculum** (A1:V204): White-Bodan Curriculum [10] · Go-Ryo Poomsae [3] · Advance 10 Motion (1-5) [3] · Advance Sa Bang Chuck (1-5) [3] · Step Sa Bang Chuck (1-5) [3] · Power Break [3] · Technical Break [3] · Two Step Sparring (1-10) [3]. U = subtotal, V = Max 139.5. The Pts columns are hidden.
- **3rd Dan – Curriculum** (A1:V204): White-Bodan [10] · Geum Gang Poomsae [5] · 1st Dan Curriculum [10] · 2nd Dan Sa Bang Chuck (1-4) [3] · Creative Poomsae [3] · Creative Sa Bang Chuck [3] · Technical Break [3] · Power Break [3]. Max 180.
- **4th Dan – Curriculum** (A1:X204): White-Bodan [10] · Tae Baek Poomsae [4] · 1st Dan Curriculum [10] · 2nd Dan Curriculum [10] · 3rd Dan Sa Bang Chuck (1-6) [4] · Creative Poomsae [4] · Creative Sa Bang Chuck [4] · Technical Break [4] · Power Break [4]. W = subtotal, X = Max 243.

### 1.9 4th Dan – Technical (A1:R204)
Referee Seminar [10] (10×TechGP) · Free Sparring [4] (16/14/13/12/9/8.5/8/4/0) · Target Kick [4] (count → 16/14/12/9/8/0) · Terminology [4] · Knowledge [4] · Written Test [10] (10×TechGP). R = TOTAL /144.

### 1.10 4th Dan – Other Req & Extra Pts (A1:BH204)
Egg Test [4] (16-table) · Meditation [4] (16-table) · Ass. Ins. Course [10] (10×TechGP) · Apprec Letter [4] (16-table) · TKD Project [10] (10×TechGP). O = Subtotal /128. The extra-points block is the same as 1.7 ("4th Dan uses 3rd-Dan thresholds for now").

### 1.11 Final Results tabs (one per Dan)
A1:H204, header row 3, data rows 5–204, freeze A4. Columns: # · Candidate Name · Dan · Class · Final Score · Pass Mark · Result / Make-Ups · H (hidden helper = list of D-graded subjects). CF on G5:G24: `=0` → green fill C6EFCE.

### 1.12 Payments — testing-fee ledger (one row per roster row)
A1:S998, title row 1, note row 3, header row 5, data rows 6–42 in the export (the script builds 200). Freeze A6. Hidden column D. **0 payment rows.**

| Col | Header | Shape | Source |
|---|---|---|---|
| A | # | int | [f] (export: `ROW()-5`; script: roster #) |
| B,C,D | Candidate Name, Dan, Plan (hidden) | text | [f] from roster B/E/M |
| E | Testing Due | $ | [f] VLOOKUP on Testing Info (§6) |
| F | Kukkiwon Due | $ | [f] hard-coded 100/110/140/170 if roster F="Y" |
| G | Total Due | $ | [f per the script] `E+F`. **Empty in the export** |
| H | Paid | $ | [f per the script] `SUM(K,M,O,Q)`. **Empty in the export** |
| I | Balance | $ | [f per the script] `G-H`. **Empty in the export** |
| J | Status | `Not started` / `PAID IN FULL` / `Balance due` | [f per the script]. CF: PAID IN FULL = green D9EAD3, Balance due = orange FCE5CD. **Empty in the export** |
| K,M,O | Amount 1/2/3 | $ (yellow) | [in] |
| L,N,P | Date 1/2/3 | mm/dd | [s] stamped by onEdit when an amount is typed |
| Q | Kukkiwon Paid | $ (blue) | [in] |
| R | Kukkiwon Date | mm/dd | [s] onEdit |
| S | Receipt sent | mm/dd | [s] stamped when "Send Payment Receipt" emails |

### 1.13 Make-Up Tracker — permanent record of people who didn't pass (never cleared)
A1:I75, header row 1. **24 rows**, all archived the same day (2026-10-18), cycle `Fall 2026`. Dan split 19 / 3 / 2 / 0. Total Score 0–66. "Still To Make Up" values: `BELOW PASSING` ×19, `BELOW PASSING + Pull-up` ×4, `BELOW PASSING + Push-up` ×1. Status DV `Pending,Completed` (all are Pending). Columns: Archived (timestamp) · Cycle · Name · Dan · Email · Total Score · Still To Make Up · Status · Notes.

### 1.14 Technical Roster (Print) / Curriculum Roster (Print) — paper grading sheets
B2 = DV `1st Dan,2nd Dan,3rd Dan,4th Dan` ("Show Dan:"). Row 3 = "Date: ___ Examiner: ___ Grade each subject: …" (Technical lists A+·A·B+·B·C·D, which leaves out the minus grades the sheet accepts. Curriculum lists A+…C-·D including C+). The subject headers in row 5 come from a hidden lookup block at AA1:AG4 / AA1:AJ4 (the subject list per Dan, same lists as §1.6–1.10) via `INDEX(…,MATCH($B$2,$AA$1:$AA$4,0),k)`. Candidate list at B6 = `SORT(FILTER({roster B,C,H}, roster E=$B$2, roster B<>""),1,TRUE)` (Google-only, exported as `__xludf.DUMMYFUNCTION`). 40 print rows. The `onEdit` trigger rebuilds the columns when B2 changes.

### 1.15 Start Here — instructions
B2:C24: how-it-works steps, a color key (yellow = type here, auto-calculated, pulled from roster, PASS!), and a tab directory. Documentation only.

---

## 2. Formulas, formatting, validation, hidden things

### 2.1 Distinct formula patterns (r = this row, m = r−2 roster row)
- **Roster pull (all-candidate tabs):** `=IF('Master Roster'!B{m}="","",'Master Roster'!B{m})` (same for C, E). `#` = `=IF('Master Roster'!$B$m="","",'Master Roster'!$A$m)`.
- **Roster pull (per-Dan tabs):** `=IF('Master Roster'!$E$m="<N> Dan",'Master Roster'!$B$m,"")` (and C/E/H). `#` = `=IF($B{r}="","",'Master Roster'!$A$m)`.
- **Bracket:** `=IF($C="","",IF($C<=8,"≤8",IF($C<=12,"9-12","13+")))`. bIdx is the same with 1/2/3.
- **Physical grade (higher is better):** `=IF(F="","",IF(F>=INDEX(Thresholds!$D:$D,k+$E),"A+",IF(F>=INDEX(Thresholds!$E:$E,k+$E),"A",…"C","D")))`, with k = 1 (stretch), 4 (sit-up), 7 (push-up), 10 (static jump), 13 (long jump, value `R*12+S`).
- **Physical grade (lower is better):** 4x10m `<=` k=16; 100m strict `<` k=19; mile `(AG+AH/60)<=` k=22.
- **Physical points:** `=IF(raw="","",credit*IF(…>=A+,4,…A,3.5,…B+,3,…B,2.5,…C,2,0))`.
- **Pull-up (hard-coded, does not use Thresholds):** Hold: ≥31 A+, ≥26 A, ≥21 B+, ≥11 B, ≥9 C. Reps age ≤12: ≥6/5/3/2/1. Reps 13+: ≥10/8/6/4/2. Pts = 2×(4/3.5/3/2.5/2/0).
- **Technical grade→points:** `=IF(E="","",credit*IF(E="A+",4,IF(E="A",3.5,IF(E="A-",3.25,IF(E="B+",3,IF(E="B",2.5,IF(E="B-",2.25,IF(E="C",2,IF(E="C-",1,0)))))))))`.
- **Target kick:** age ≤9: ≥35 A+, ≥31 A, ≥26 B+, ≥22 B, ≥21 C, else D. Age 10+: ≥39/34/29/24/23. Pts = 2×(4/3.5/3/2.5/2/0) for 1st–3rd Dan, or 16/14/12/9/8/0 for 4th Dan.
- **Curriculum grade→points:** `credit*IF(="A+",4.5,"A",4,"A-",3.8,"B+",3.5,"B",3.3,"B-",3,"C+",2.8,"C",2.5,"C-",2,else 0)`.
- **Other-req fixed tables:** see §1.7 / §1.10.
- **Subtotals:** `=IF($B="","",SUM(…))`. Max cells are constants (`135+IF(K="Yes",22.5,0)`, `139.5`, `180`, `243`).
- **Final Score:** 1st Dan `SUM('Physical Scoring'!AL,'Technical Testing'!P,'1st Dan – Curriculum'!T,'Other Req & Extra Pts'!O,'Other Req & Extra Pts'!AB)`. 2nd/3rd use their own curriculum U. 4th uses `'4th Dan – Technical'!R`, `'4th Dan – Other Req…'!O`+`AB`, `'4th Dan – Curriculum'!W`.
- **Pass Mark:** `IF(C="1st Dan",IF(D="Adult",293,275),IF(C="2nd Dan",261,IF(C="3rd Dan",293,IF(C="4th Dan",453,0))))`. **Rows 5–24 only.**
- **Make-up list (H):** `TEXTJOIN(", ",TRUE, IF(<grade cell>="D","<label>",""), …)` over every graded subject on that Dan's tabs. Rows 5–24 only.
- **Result (G):** `IF(AND(E>=F,H=""),"PASS!",TEXTJOIN(" + ",TRUE,IF(E<F,"BELOW PASSING",""),H))`. Rows 5–24 only.
- **Payments:** see §6.
- **Print roster:** INDEX/MATCH header lookup + SORT(FILTER()).
- Excel-compatibility prefixes in the export: `_xludf.IFS`, `_xludf.TEXTJOIN`, `__xludf.DUMMYFUNCTION`. The physical grade columns are stored as single-cell ArrayFormulas.

### 2.2 Conditional formatting
- Payments J6:J42: `="PAID IN FULL"` → green D9EAD3 / font 274E13. `="Balance due"` → orange FCE5CD / font 7F3F00.
- Each Final Results G5:G24: `=0` → green C6EFCE. (Probably meant for "PASS!". As written, it highlights a zero.)

### 2.3 Data-validation dropdowns (exact option values)
| Where | Options |
|---|---|
| Master Roster D3:D27 | `M,F` |
| Master Roster E3:E27; both print rosters B2 | `1st Dan,2nd Dan,3rd Dan,4th Dan` |
| Master Roster F3:F27 | `Y,N` |
| Master Roster H3:H27 | `Child,Adult` |
| Physical Scoring Z5:Z204 | `Reps,Hold` |
| All technical / other-req / curriculum grade cells | `A+,A,A-,B+,B,B-,C,C-,D` |
| 1st Dan – Curriculum K5:K204 (One-Step Sparring scored?) | `Yes,No` |
| Make-Up Tracker H2:H75 | `Pending,Completed` |
| Form values (from the log) | Plan `Pay in Full`/`3 Payments`. Kukkiwon `Yes`/`No`. Sex `Male`/`Female`. Signed By `Self (18+)` / `Parent/Guardian: …` |

### 2.4 Named ranges, protection, hidden
- Named ranges: **none**. Protected sheets/ranges: **none**. Hidden sheets: **none**. Print areas: none.
- Hidden columns: Payments D. Master Roster H, I, K. Physical Scoring D, E. Final Results H (all 4). 2nd/3rd Dan Curriculum F,H,J,L,N,P,R,T. 4th Dan Curriculum F…V (odd Pts cols). 4th Dan Technical F,H,K,M,O,Q. 4th Dan Other Req F,H,J,L,N,Q,S,U,W,Y,AA. Technical Roster J, AA. Curriculum Roster L, AA.
- Hidden rows: 1st Dan Curriculum/Final 181. 2nd Dan 197. 3rd Dan 195. 4th Dan tabs 197. Payments 6. These hide other Dans' rows. They are set by hand or by the script, so they go stale when the roster re-sorts.

---

## 3. Lookup / config tables (business rules, copied in full)

### 3.1 Testing Info (current values, cycle "Fall 2026")
| Key | Value |
|---|---|
| Cycle | Fall 2026 |
| Physical date / time / location | 2026-09-26 · Indoor 12:30–2:30pm · Outdoor 2:30–3:30pm · Worcester School, 1141 Main St (Outdoor: Horgan Arena) |
| Physical outdoor time / location | Outdoor 2:30–3:30pm · Horgan Arena, 403 Oxford St N, Auburn MA 01501 |
| Technical date / time / location | 2026-10-24 · 12:30–3:30pm · Shrewsbury School, 370 Boston Turnpike |
| Curriculum date / time / location | 2026-11-21 · 2:00–5:00pm · Shrewsbury School, 370 Boston Turnpike |
| Application due | 2026-09-19 |
| Submissions due (project, letters, egg test, meditation) | 2026-11-14 |
| Payment 1 / 2 / 3 due | 2026-09-19 / 2026-10-17 / 2026-11-14 |
| Payment due (pay-in-full) | 2026-09-19 |
| Checks due | 2026-09-19 |
| Fee 1st/2nd/3rd/4th Dan (legacy, used by nothing in the sheet or script) | 790 / 990 / 1500 / 2400 |
| Full Payment 1st/2nd/3rd/4th Dan | 870 / 990 / 1500 / 2700 |
| Payment 1/2/3 — 1st Dan | 290 / 290 / 290 |
| Payment 1/2/3 — 2nd Dan | 330 / 330 / 330 |
| Payment 1/2/3 — 3rd Dan | 500 / 500 / 500 |
| Payment 1/2/3 — 4th Dan | 900 / 900 / 900 |
| School address | 1141 Main St, Worcester MA 01603 (duplicate of School 1) |
| School phone | (blank) |
| School 1 name/address/phone | Worcester · 1141 Main St, Worcester MA 01603 · (508) 767-1717 |
| School 2 name/address/phone | Shrewsbury · 370 Boston Turnpike, Shrewsbury MA 01545 · (508) 792-5534 |

The script's own defaults (seedPayments/setup) are older and different: Full 760/960/1450/2320, 1st Dan installments 270/270/250, 4th Dan 800×3.

**Kukkiwon certificate fee** (hard-coded in 3 places: roster G, Payments F, confirmation email): 1st Dan **$100**, 2nd **$110**, 3rd **$140**, 4th **$170**.

### 3.2 Thresholds (physical events). Grade if the raw value meets the column. Dir H = higher is better (≥), LE = ≤, LT = <
| Event | Bracket | Dir | A+ | A | B+ | B | C |
|---|---|---|---|---|---|---|---|
| Stretching (in) | ≤8 | H | 4 | 3.5 | 3 | 2.5 | 2 |
| Stretching (in) | 9-12 | H | 6 | 5 | 4 | 3 | 2 |
| Stretching (in) | 13+ | H | 8 | 6 | 5 | 4 | 2 |
| Sit-up (20s) | ≤8 | H | 18 | 16 | 11 | 6 | 4 |
| Sit-up (20s) | 9-12 | H | 20 | 18 | 15 | 10 | 4 |
| Sit-up (20s) | 13+ | H | 23 | 20 | 18 | 15 | 6 |
| Push-up (1min) | ≤8 | H | 20 | 18 | 16 | 14 | 12 |
| Push-up (1min) | 9-12 | H | 36 | 30 | 25 | 20 | 15 |
| Push-up (1min) | 13+ | H | 50 | 40 | 30 | 25 | 20 |
| Static Jump (in) | ≤8 | H | 12 | 10 | 9 | 7 | 3 |
| Static Jump (in) | 9-12 | H | 18 | 15 | 13 | 10 | 5 |
| Static Jump (in) | 13+ | H | 23 | 20 | 18 | 15 | 10 |
| Long Jump (in, total) | ≤8 | H | 72 | 60 | 54 | 48 | 36 |
| Long Jump (in, total) | 9-12 | H | 84 | 72 | 66 | 60 | 48 |
| Long Jump (in, total) | 13+ | H | 96 | 84 | 78 | 72 | 60 |
| Sprint 4x10m (s) | ≤8 | LE | 10 | 12 | 13 | 14 | 16 |
| Sprint 4x10m (s) | 9-12 | LE | 9 | 11 | 12 | 13 | 15 |
| Sprint 4x10m (s) | 13+ | LE | 8 | 10 | 11 | 12 | 14 |
| Sprint 100m (s) | ≤8 | LT | 18 | 20 | 22 | 24 | 28 |
| Sprint 100m (s) | 9-12 | LT | 15 | 17 | 19 | 21 | 24 |
| Sprint 100m (s) | 13+ | LT | 14 | 15 | 16 | 17 | 23 |
| 0.5/1 Mile (min) | ≤8 | LE | 5 | 6 | 6.5 | 7 | 8 |
| 0.5/1 Mile (min) | 9-12 | LE | 4 | 5 | 5.5 | 6 | 7 |
| 0.5/1 Mile (min) | 13+ | LE | 8 | 8.5 | 9 | 11 | 12 |
| Pull-up HOLD (all ages, s) | — | H | 31 | 26 | 21 | 11 | 9 |
| Pull-up REPS 9-12 | — | H | 6 | 5 | 3 | 2 | 1 |
| Pull-up REPS 13+ | — | H | 10 | 8 | 6 | 4 | 2 |
(Below C = D = 0 pts. The ≤12 brackets run the half mile and 13+ runs the mile, as the times suggest. The pull-up rows are documentation only: the formula hard-codes the same numbers.)

### 3.3 Grade-point scales
| Grade | Physical | Technical / Other-req "×credit" | Curriculum |
|---|---|---|---|
| A+ | 4 | 4 | 4.5 |
| A | 3.5 | 3.5 | 4 |
| A- | — | 3.25 | 3.8 |
| B+ | 3 | 3 | 3.5 |
| B | 2.5 | 2.5 | 3.3 |
| B- | — | 2.25 | 3 |
| C+ | — | — | 2.8 (not in dropdown) |
| C | 2 | 2 | 2.5 |
| C- | — | 1 | 2 |
| D | 0 | 0 | 0 |

Fixed point tables used instead of credit×scale (note the B/B- values don't equal credit×2.5/2.25):
- cr-5 table (Egg, AIC 1st–3rd): 20 / 17.5 / 16.25 / 15 / **11** / **10.5** / 10 / 5 / 0
- cr-4 table (Meditation, Project 1st–3rd; 4th Dan Egg, Meditation, Letter, Sparring, Terminology, Knowledge): 16 / 14 / 13 / 12 / **9** / **8.5** / 8 / 4 / 0
- cr-2 table (Letter 1st–3rd): 8 / 7 / 6.5 / 6 / 5 / 4.5 / 4 / 2 / 0 (this one does equal 2×scale)

### 3.4 Pass marks and maxima (without extra points)
| Dan | Physical | Technical | Curriculum | Other Req | Max total | Pass mark | ≈ % |
|---|---|---|---|---|---|---|---|
| 1st (child) | 80 | 44 | 135 | 80 | 339 | **275** | 81% |
| 1st (adult, +One-Step) | 80 | 44 | 157.5 | 80 | 361.5 | **293** | 81% |
| 2nd | 80 | 44 | 139.5 | 80 | 343.5 | **261** | 76% |
| 3rd | 80 | 44 | 180 | 80 | 384 | **293** | 76% |
| 4th | 80 | 144 | 243 | 128 | 595 | **453** | 76% |

### 3.5 Age groups / brackets
Physical: ≤8, 9–12, 13+ (from roster Age). Target kick: ≤9 vs 10+. Pull-up reps: ≤12 vs 13+. Child/Adult: a separate manual roster field. It drives the 1st Dan pass mark only (One-Step Sparring scoring is a separate Yes/No toggle).

---

## 4. How sheets link
- Master Roster → every scoring tab, Final Results, Payments, print rosters (row-position references, `m = r−2` / `r−3`).
- Thresholds → Physical Scoring (INDEX by fixed row offset).
- Physical Scoring + Technical (or 4th Dan Technical) + Other Req (or 4th Dan Other Req) + Nth Dan Curriculum → Nth Dan Final Results (score and make-up list).
- Testing Info → Payments E (VLOOKUP `"Full Payment "&Dan`, `"Payment k "&Dan`).
- Script-only links: Final Results → Make-Up Tracker (archive), Final Results + Roster email → results/make-up emails, Payments → receipt email, form → Roster + Registrations Log + Drive signature file, Testing Info ↔ public website (JSONP GET, POST updateInfo).
- No IMPORTRANGE, no QUERY, no external workbooks.

## 5. Grading model
- **What is scored:** 4 blocks per candidate. (1) Physical: 9 timed/measured events, indoor + outdoor, the same for all Dans. (2) Technical: 5 subjects (6 for 4th Dan, adds Written Test). (3) Curriculum: 7–9 Dan-specific forms/sparring/breaking subjects. (4) Other Requirements: 5 items (egg test, meditation, assistant-instructor course, appreciation letter, TKD project/essay) + Special Extra Points (stripes, performance, competition, attendance, events, breaking class), with **no cap**.
- **By whom:** an examiner on paper (the print rosters have "Date / Examiner" blanks). Staff then type into the yellow cells. **There is no judge/examiner field, no per-judge scores and no averaging. One grade per subject is stored.**
- **Scale:** letter grades (A+…D) for most subjects. Raw measurements are auto-graded for physical events and the target kick. Counts for extra points.
- **Weighting:** each subject has a credit weight ("[cr n]"). Points = credit × grade-point (scales in §3.3), or a fixed table.
- **Pass/fail:** Final Score = sum of the 4 block totals + extras. PASS! only if score ≥ pass mark **and** no subject is graded D. Otherwise the Result lists `BELOW PASSING` and/or every D subject, joined with " + ". Subjects graded D must be made up at the next testing, even when the score passes.
- **Rounding:** none. Points are exact decimals (e.g. 16.25, 22.5). Percent is only on Physical (`/80`).

## 6. Payment model
- **Fee items:** (a) testing fee by Dan and plan, (b) optional Kukkiwon certificate fee by Dan, tracked separately.
- **Testing Due** = `Full Payment <Dan>` if Plan = "Pay in Full", else `Payment 1+2+3 <Dan>` (Testing Info). Currently there's no discount for paying in full (870 = 3×290 and so on).
- **Kukkiwon Due** = 100/110/140/170 if roster Kukkiwon = Y, else 0.
- **Total Due** = Testing + Kukkiwon. **Paid** = Amount1 + Amount2 + Amount3 + Kukkiwon Paid. **Balance** = Total − Paid. **Status**: `Not started` (Paid=0) / `PAID IN FULL` (Balance ≤ 0) / `Balance due`.
- **Partial payments:** 3 free-form amount slots (formerly 6) plus 1 Kukkiwon slot. Any amount is allowed. Each slot's date is auto-stamped on entry. Overpayment just shows as a negative balance or PAID IN FULL.
- **Method:** not recorded. Checks are assumed ("Testing checks go in the yellow Amount boxes", "make checks out to Jae H. Jeong"). No check number, no recorded-by, no refund/discount/waiver fields. No link to the installment due dates (nothing flags "Payment 2 late").
- **Receipt:** a menu action emails an HTML receipt (history, totals, balance, both schools' contact info) and stamps "Receipt sent".
- Payments are tied to roster rows by position. The rebuild script re-matches them **by name** (lower-cased), so a typo or a name change orphans the money.

## 7. Problems found
1. **Final Results formulas only cover rows 5–24** (20 candidates) for Pass Mark, Result and the make-up list. Score (E) covers 200 rows. Any candidate on roster row 23+ gets no pass/fail result. Stale literal values sit in rows 25–35 (e.g. Pass Mark 0 with "PASS!").
2. **Pass mark 0 ⇒ automatic PASS!** If Dan is blank or misspelled, F = 0 and any score passes. The stale rows show exactly that.
3. **Blank grade ≠ D:** an ungraded subject is treated as not failed, so a candidate can show PASS! with subjects never graded, as long as the points add up.
4. **Make-Up Tracker has 24 false non-passers:** archived 2026-10-18, before the Technical (10-24) and Curriculum (11-21) tests, with scores 0–66. Everyone shows "BELOW PASSING". Archiving isn't tied to "all tests done", and re-archiving is skipped by name+cycle, so these won't be corrected automatically.
5. **Class (Child/Adult) is manual and hidden.** Registration never fills it, and blank = child pass mark 275 for 1st Dan adults (should be 293). Age is already known, so this is a redundant field that is easy to miss.
6. **Age is frozen at registration.** It is not recalculated on test day, so brackets can be wrong for birthdays in between.
7. **Gender DV (`M,F`) vs form value (`Male`/`Female`):** validation is violated by every registration.
8. **DV and Cert Fee formulas don't cover the full roster:** DV only rows 3–27. Cert Fee is missing on rows 22–27. One Physical Scoring grade formula (P15) is missing.
9. **Payments export is incomplete:** Total Due/Paid/Balance/Status (G–J) have no formulas and only 37 rows, while the script builds 200 with G–J. The live sheet may differ, so check before trusting it.
10. **Kukkiwon price table is hard-coded in 3 places.** Testing fees are in Testing Info, but the "Fee Nth Dan" rows (790/990/1500/2400) don't match the "Full Payment" rows (870/990/1500/2700) and are unused. The script's seed defaults are a third set of numbers.
11. **Thresholds are read by hard-coded row offsets** (`INDEX(...,13+bIdx)`). Inserting or sorting a row in Thresholds silently breaks every physical grade. The Dir column and pull-up rows are documentation only (the pull-up formula hard-codes its own copy).
12. **Inconsistent point tables:** B and B- in the cr-5/cr-4 fixed tables (11/10.5, 9/8.5) don't follow credit×2.5/2.25 (12.5/11.25, 10/9). The "C+" grade is scored but isn't in any dropdown. The print Technical roster lists only A+·A·B+·B·C·D, while the dropdown accepts A-, B-, C-.
13. **Everything is linked by row position** (roster m ↔ score m+2 ↔ payment m+3). Correctness depends on the custom sort script moving every tab together. A manual sort, insert or delete in any tab misaligns grades and payments across people. Hidden-row "filters" on the per-Dan tabs go stale after a re-sort.
14. **Pull-up reps for ≤8 use the 9–12 table.** Physical Scoring's title says "1st Dan" but it's used for all Dans. 4th Dan extra points "use 3rd-Dan thresholds for now" (a placeholder rule).
15. **CF on Final Results G (`=0` green)** never matches a real result. It looks like it was meant to be "PASS!".
16. **Security (from the script):** the web app's `doPost action=updateInfo` changes dates and prices with **no authentication** ("password requirement removed"). Signature PNGs are saved to Drive named "<name> - <Dan>.png" and linked by URL in the roster/log. Registration duplicates aren't detected (43 log rows / 40 names). Test submissions are mixed into the real log.
17. **Manual steps:** setting Class, the One-Step "Yes", rebuilding print rosters, running Sort/Archive/Send from the menu, and making a "File ▸ Make a copy" archive before Start New Cycle (it wipes the roster, grades and payments; only the Make-Up Tracker survives). There is no history of grades or payments per cycle beyond those manual copies.
18. **Duplicated config text:** Application due / Payment 1 due / Payment due / Checks due all hold the same date. "School address" duplicates School 1. "Physical outdoor time" duplicates part of "Physical time". Dates are stored as text strings.
