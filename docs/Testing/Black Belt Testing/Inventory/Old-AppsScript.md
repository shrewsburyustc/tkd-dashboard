# Black Belt Testing — Google Apps Script inventory

Source: the Apps Script code Jeffrey exported (Downloads, 2026-10-18), 2305 lines, read in full. This is one Apps Script file bound to a Google Sheet ("the LIVE sheet").

- **No secrets found.** No API keys, tokens, passwords or script properties are hardcoded. Line 399 says a password check used to exist and was removed (see Problems).
- **No prompt-injection text found.** The header comment (lines 1–9) is ordinary instructions for a human editor.
- **People's names:** the school's legal name includes the owner's name. Below it is written as `[Owner]`. No student names, emails or phone numbers are in the code (school phone fields are blank).

**Key point for the rebuild:** much of the grading logic is **not in this script**. It lives in hand-built sheet formulas and dropdowns. That includes the grade→points conversion, the section totals, the pass/fail "Result / Make-Ups" text and the physical-event scoring. The script only wires those formulas together, sums the section totals and emails the result. We need the spreadsheet itself, or the owner, to get those rules (see §6).

---

## 1. Functions, menu items, triggers and endpoints

### Entry points and triggers
| Lines | Function | Kind | Purpose |
|---|---|---|---|
| 58–89 | `onOpen` | simple trigger | Builds the "Black Belt" menu (22 items, listed below) |
| 852–861 | `onEdit(e)` | simple trigger | On the Payments tab: stamps a date beside a typed amount. On the print-roster tabs: when the Dan picker (B2) changes, hides unused subject columns |
| 386–394 | `doGet(e)` | web app GET | Returns the whole Testing Info tab as JSON, or JSONP when `?callback=` is given (the public registration page reads dates and prices this way) |
| 395–404 | `doPost(e)` | web app POST | Body JSON. `action:'updateInfo'` → overwrites Testing Info (**no auth**). Anything else → treated as a registration |
| 405–407 | `json` | helper | JSON response |

There are no installable triggers, time-driven triggers, Google Forms, named ranges or `PropertiesService` usage.

### Menu items (line 59–87) → function
| Menu label | Function (lines) |
|---|---|
| Send Email — Selected Row | `sendResultsSelected` (1098–1144) |
| Send Results — One Candidate… | `sendResultsOne` (1147–1166) |
| Send Results — All Candidates | `sendResultsAll` (1169–1190) |
| Send Make-Up Emails | `sendMakeupEmails` (665–695) |
| Save Non-Passers to Make-Up Tracker | `archiveNonPassers` (893–934) |
| Email Make-Up Tracker (next testing info) | `emailMakeupTracker` (960–987) |
| Sort Roster by Dan (1st at top) | `sortRoster` (2187–2196) |
| Remove Candidate… | `removeCandidate` (342–361) |
| Start New Cycle (clear all)… | `startNewCycle` (364–379) |
| Send Payment Receipt — Selected Row | `sendPaymentReceipt` (1773–1848) |
| Build Printable Rosters | `buildRosters` (726–741) |
| Build Payments Sheet | `buildPayments` (1210–1218) |
| First-time Setup | `setup` (158–239) |
| Fix Per-Dan Sheets | `fixDanColumns` (308–311) |
| Fix Kukkiwon Cert Fee | `installCertFee` (126–136) |
| Fix Kukkiwon Due on Payments | `fixKukkiwonDue` (1733–1759) |
| Add # Column to Testing Tabs | `addNumberColumns` (1691–1726) |
| Remove Make-Up Flag Leftovers (run once) | `removeMakeupFlag` (1626–1684) |
| Extend Grading Rows to All Candidates | `extendGradingRows` (1559–1600) |
| Check All Tabs (before a testing day) | `checkAllTabs` (1493–1550) |
| Install Final Score Formulas | `installFinalScores` (1436–1488) |
| Show All Rows on Per-Dan Tabs | `showAllDanRows` (2181–2185) |

### By feature

**Setup and maintenance (spreadsheet plumbing; none of this is needed in a database app)**
| Lines | Function | Purpose |
|---|---|---|
| 101–103 | `ensureRows_` | Adds sheet rows if the grid is too short |
| 106–112 | `numCol_` | Detects whether a tab has a "#" column at A |
| 116–124 | `installRosterNumbers_` | Writes `#` formulas (COUNTA) into roster col A |
| 126–136 | `installCertFee` | Writes the Kukkiwon fee formula into roster col G (price table copy 1) |
| 139–155 | `seedPayments` | Adds missing per-Dan price and venue/school rows to Testing Info |
| 158–239 | `setup` | Adds roster cols 9–13, creates and styles Testing Info, Registrations Log and Make-Up Tracker, applies the per-Dan filters |
| 243–278 | `applyDanFilters` | On per-Dan tabs, writes formulas that show Name/Age/Dan (or Name/Dan/Class on Finals) only when the roster Dan matches |
| 283–307 | `installTabNumbers_` | Fills the "#" column on testing tabs from the roster |
| 308–311 | `fixDanColumns` | Menu wrapper for `applyDanFilters` |
| 1003–1017 | `colByHeader_` | Finds a column by its header text (fallback to a fixed number) |
| 1019–1025 | `frCols_` | Name, score and result columns on a Final Results tab |
| 1028–1034 | `nameColOf_`, `pullupCol_` | Header lookups (pull-up fallback col 25/26) |
| 1399–1488 | `FINAL_SCORE_PARTS`, `colNum_`, `headerText_`, `installFinalScores` | Writes Final Score = SUM of five section-total cells per Dan (see §4) |
| 1493–1550 | `checkAllTabs` | Read-only check that every tab has grading rows down to the last candidate |
| 1559–1616 | `extendGradingRows`, `lastSetUpRow_` | Copies the last set-up grading row down to row 204 |
| 1626–1684 | `removeMakeupFlag` | One-time cleanup of a removed "Make-Up tickbox" feature (roster col N, helper col BH/60, purple rules) |
| 1691–1726 | `addNumberColumns` | Inserts the "#" column A on all testing tabs |
| 1733–1759 | `fixKukkiwonDue` | Rewrites the Payments "Kukkiwon Due" formula (price table copy 4) and reports cells typed over by hand |
| 744–748 | `colLetter_` | Column number → letter |

**Registration**
| Lines | Function | Purpose |
|---|---|---|
| 414–420 | `handleRegistration` | Takes a script lock (30 s) then registers |
| 422–452 | `handleRegistrationLocked_` | First empty roster row → writes 10 fields, appends to the Log, re-sorts the roster, sends the confirmation |
| 616–622 | `ageFromDOB` | Age as of *today* (registration time) |
| 624–633 | `saveSignature` | Decodes the base64 PNG signature and saves it to a Drive folder by name; returns the file URL |

**Confirmation email**
| Lines | Function | Purpose |
|---|---|---|
| 459–465 | `fmtI` | `YYYY-MM-DD` → "Month D, YYYY" (other formats passed through) |
| 469–480 | `renderTemplate_` | Tiny template engine: `<sc-if value="{{flag}}">` blocks and `{{Placeholders}}` |
| 483–493 | `calUrl_` | Google Calendar "add event" link (all-day), only for ISO dates |
| 495–500 | `money_`, `num_` | Format and parse money |
| 502–585 | `sendConfirmation` | HTML + plain-text registration email to the candidate |
| 588–610 | `_TB`, `_names`, `testingBreakdown`, `SITE_URL`, `REQUIREMENTS_URL` | Per-Dan subjects and credits, passing scores, requirements link (`_TB`, `_names` and `testingBreakdown` look unused here; probably copied from the web page) |
| 1853–2039 | `EMAIL_TEMPLATE` | Designed confirmation HTML |

**Testing Info (cycle settings)**
| Lines | Function | Purpose |
|---|---|---|
| 640–647 | `getTestingInfo` | Reads the key/value tab into an object |
| 648–658 | `updateTestingInfo` | Writes keys as plain text; adds unknown keys as new rows |

**Results and make-ups**
| Lines | Function | Purpose |
|---|---|---|
| 665–695 | `sendMakeupEmails` | Emails every non-PASS candidate on the Finals tabs (**no confirm prompt**) |
| 1037–1060 | `collectResults_` | Gathers name, dan, score, result and email from all Finals tabs |
| 1063–1084 | `resultsEmailBody_` | Results email text (pass / make-up list / "still being finalized") |
| 1086–1091 | `sendOneResult_` | Sends one results email |
| 1098–1144 | `sendResultsSelected` | Selected row on a Finals tab or on the Make-Up Tracker; preview + confirm |
| 1147–1166 | `sendResultsOne` | Type a name, preview, confirm, send |
| 1169–1190 | `sendResultsAll` | Confirm once, send to everyone with an email |
| 871–890 | `MU`, `ensureMakeupTracker_` | Creates the permanent Make-Up Tracker tab (Pending/Completed dropdown) |
| 893–934 | `archiveNonPassers` | Copies non-passers into the tracker, de-duplicated by name+cycle |
| 937–957 | `makeupEmailBody_`, `sendMakeupOne_` | Make-up reminder with the upcoming dates |
| 960–987 | `emailMakeupTracker` | Emails every Pending tracker row (confirm once) |

**Printable grading sheets**
| Lines | Function | Purpose |
|---|---|---|
| 705–724 | constants | Print tab names, subjects per Dan, 40 print rows, hidden lookup at col AA |
| 726–741 | `buildRosters` | Builds the Technical and Curriculum print tabs |
| 751–838 | `buildDanRoster_` | Deletes and recreates a print tab: Dan picker, alphabetical candidates (Name/Age/Class) for that Dan, subject headers, Notes column |
| 841–849 | `syncRosterColumns_` | Hides subject columns the picked Dan doesn't use |

**Payments**
| Lines | Function | Purpose |
|---|---|---|
| 1200–1208 | constants | Payments layout (see §2) |
| 1210–1218 | `buildPayments` | Menu wrapper |
| 1221–1226 | `payKeepLabels_` | Labels of hand-typed columns kept across rebuilds |
| 1228–1397 | `buildPaymentsSheet_` | Saves typed payments by name, deletes and recreates the tab, rewrites formulas, restores payments by name, warns about orphans and dropped slots 4–6 |
| 1762–1771 | `stampPaymentDate_` | Called from `onEdit`: typing an amount stamps today's date if the date is empty; clearing the amount clears the date |
| 1773–1848 | `sendPaymentReceipt` | Selected Payments row → receipt email (history, totals, balance) + stamps "Receipt sent" |
| 2041–2127 | `RECEIPT_TEMPLATE` | Receipt HTML |
| 335–339 | `clearPaymentRow_` | Clears typed payment cells for one row |

**Remove, reset and sort**
| Lines | Function | Purpose |
|---|---|---|
| 318 | `SCORING_SHEETS` | The 9 tabs that hold typed grades |
| 320 | `clearMasterRow` | Clears roster cols 2–6 and 8–13 (keeps # and the fee formula) |
| 322–326 | `clearRowInputs` | Clears non-formula cells in a row, one cell at a time |
| 328–332 | `clearGradeRow` | Clears that row on all 9 scoring tabs; resets Pull-Up Method to "Hold" |
| 342–361 | `removeCandidate` | Exact-name match → clears roster, grade and payment rows → re-sorts |
| 364–379 | `startNewCycle` | Asks "did you make a copy?" → archives non-passers → clears all 200 roster, grade and payment rows |
| 2146–2156 | `DAN_RANK`, `PER_DAN_TABS` | Sort order; the 10 per-Dan tabs |
| 2158–2178 | `tidyDanTabs_` | Hides empty rows on the per-Dan tabs |
| 2187–2196 | `sortRoster` | Menu wrapper; reports unknown Dans |
| 2199–2203 | `sortRosterCore_` | Same, with a 20 s script lock |
| 2208–2254 | `sortRosterUnlocked_` | Stable sort by Dan rank; moves roster values, all grade/Finals rows and payment cells as one permutation |
| 2257–2266 | `snapshot_` | Copies a block before writing |
| 2269–2292 | `permuteTargets_` | All-or-nothing write with best-effort rollback |
| 2296–2304 | `gridWidth_` | Grid width from header rows 3–4 |

---

## 2. Data model

### Sheets (tabs)
| Tab | Role | Rows |
|---|---|---|
| `Master Roster` | One row per candidate | header row 2, data rows 3–202 (`MAX_CANDIDATES` = 200) |
| `Testing Info` | Key/value cycle settings (col A key, col B value) | row 1 title, from row 2 |
| `Registrations Log` | Append-only intake log | header row 1 |
| `Make-Up Tracker` | Permanent non-passer record, never cleared | header row 1 |
| `Payments` | One row per candidate, aligned to the roster | header row 5, data rows 6–205 |
| `Physical Scoring` | Grades, all candidates | data rows 5–204 |
| `Technical Testing` | Grades, 1st–3rd Dan (all-candidate tab) | 5–204 |
| `Other Req & Extra Pts` | Other requirements + extra points, 1st–3rd Dan | 5–204 |
| `1st/2nd/3rd/4th Dan – Curriculum` | Curriculum grades per Dan (en dash in the name) | 5–204 |
| `4th Dan – Technical` | 4th Dan technical | 5–204 |
| `4th Dan – Other Req & Extra Pts` | 4th Dan other req + extra | 5–204 |
| `1st/2nd/3rd/4th Dan – Final Results` | Formula-only finals (name, dan, class, score, result) | 5–204 |
| `Technical Roster (Print)`, `Curriculum Roster (Print)` | Printable grading sheets, rebuilt on demand | header row 5, rows 6–45 |

**Row coupling (the core design flaw):** grading-tab row = roster row + 2. Payments row = roster row + 3. Every link between a candidate and their grades and payments is the **row position**, not an ID.

### Master Roster columns (`COL`, line 44)
| # | Header | Source |
|---|---|---|
| 1 A | # | formula (COUNTA of names) |
| 2 B | Name | registration `fullName` |
| 3 C | Age | computed at registration (static) |
| 4 D | Gender | registration `sex` |
| 5 E | Dan | `danTestingFor` ("1st Dan"…"4th Dan") |
| 6 F | Kukkiwon | "Y"/"N" (from `kukkiwonCert === 'Yes'`) |
| 7 G | Cert Fee | formula: Kukkiwon fee if F="Y" |
| 8 H | Class | **typed by staff; never set by the script.** Meaning unknown (child/adult? class group?) |
| 9 I | Email | registration |
| 10 J | Date of Birth | registration (raw string) |
| 11 K | Signature | Drive file URL (or the text "error: …") |
| 12 L | Submitted | timestamp |
| 13 M | Payment Plan | "Pay in Full" / "3 Payments" (exact strings matter, see bugs) |
| 14 N | (old "Make-Up" tickbox) | removed feature; cleared by `removeMakeupFlag` |

### Registrations Log columns (line 225)
Submitted · Full Name · DOB · Age · Gender · Dan · Kukkiwon · Email · Signed By · Signature Link · Payment Plan. Sort failures are also appended here as warning rows (line 449).

### Registration POST payload (lines 432–447)
`fullName, dateOfBirth, sex, danTestingFor, kukkiwonCert ('Yes'/other), paymentPlan, email, signedBy, signatureImage (data-URL PNG)`.

### Make-Up Tracker columns (`MU`, line 871)
Archived (date) · Cycle · Name · Dan · Email · Total Score · Still To Make Up (comma/semicolon list) · Status (Pending/Completed dropdown) · Notes.

### Payments columns (`PC`, line 1204; `PAY_SLOTS` = 3)
| Col | Header | Kind |
|---|---|---|
| 1 | # | formula from roster |
| 2 | Candidate Name | formula |
| 3 | Dan | formula |
| 4 | Plan | formula (roster M) |
| 5 | Testing Due | formula: "Pay in Full" → `Full Payment <Dan>`, else Payment 1+2+3 `<Dan>` (VLOOKUP into Testing Info) |
| 6 | Kukkiwon Due | formula: roster F="Y" → fee by Dan, else 0 |
| 7 | Total Due | E+F |
| 8 | Paid | SUM(Amount 1–3, Kukkiwon Paid) |
| 9 | Balance | G−H |
| 10 | Status | "Not started" (Paid=0) / "PAID IN FULL" (Balance ≤ 0) / "Balance due" |
| 11–16 | Amount 1, Date 1, Amount 2, Date 2, Amount 3, Date 3 | typed amount; date auto-stamped |
| 17–18 | Kukkiwon Paid, Kukkiwon Date | typed; date auto-stamped |
| 19 | Receipt sent | date of the last receipt email |

The sheet used to have 6 slots. The rebuild warns if Amount 4–6 hold money (1258–1277).

### Testing Info keys (lines 143–153, 181–204)
- Cycle
- Physical date / time / location
- Technical date / time / location
- Curriculum date / time / location
- Application due · Submissions due · Payment 1/2/3 due · Payment due · Checks due
- Fee 1st–4th Dan
- Full Payment 1st–4th Dan
- Payment 1/2/3 1st–4th Dan
- Physical outdoor time / location
- School 1/2 name / address / phone

Values are written as plain text (`'@'`, line 656).

### Final Results columns (looked up by header)
"Candidate Name"/"Name" (default col 2), "Final Score"/"Score" (default 5), "Result / Make-Ups"/"Result" (default 7). Lines 242 and 268–273 show Name/Dan/Class in three consecutive columns.

### External resources (kinds only)
- **Drive folder** named "Black Belt Signatures". It is found by name with `getFoldersByName`, and created if missing.
- **Public site on Cloudflare Workers:** the registration page (`SITE_URL`, line 604), `requirements.html?dan=…` (605) and `logo.png` (used in the email templates).
- **Google Calendar** "render" links.
- **tkdcon.net:** the Kukkiwon Tcon portal, linked in the email.
- **Web app deployment URL:** not in the code. The public page calls it.
- No spreadsheet IDs, form IDs or folder IDs are hardcoded. The script uses the bound spreadsheet.

---

## 3. Workflows end to end

### 3.1 Cycle setup
1. Staff edit Testing Info, directly or through an "admin page" that POSTs `updateInfo` to the web app.
2. The public registration page reads Testing Info through `doGet`/JSONP to show dates and prices.
3. One cycle = one season (e.g. "Spring 2026"). It has **three testing days**:
   - Day 1 Physical Conditioning (indoor + outdoor sessions; outdoor at an off-site arena)
   - Day 2 Technical Requirement
   - Day 3 Curriculum Test
4. There is also a submissions deadline for the project, appreciation letters, egg test and meditation.

### 3.2 Registration (public, unauthenticated)
1. The candidate fills in the web form: name, DOB, sex, Dan testing for, Kukkiwon certificate yes/no, payment plan, email, "signed by" and a drawn signature.
2. `doPost` → `handleRegistration` takes a script lock (waits up to 30 s, otherwise returns "busy").
3. The first empty roster row (by Name) gets the data. Age is computed from DOB as of today.
4. The signature PNG goes to the Drive folder; its URL is stored.
5. A row is appended to the Registrations Log.
6. The roster is re-sorted by Dan (1st→4th, stable by row). All grade and payment rows move with it.
7. The confirmation email is sent to the candidate's email (errors are swallowed).
8. The response is `{ok:true,row}`.
9. **No eligibility or prerequisite checks exist.** There is no check of current rank, time-in-rank, minimum age, membership, duplicates, deadline (Application due) or capacity per Dan. Only the overall 200-row cap is enforced. The Dan is self-selected.

### 3.3 Confirmation email (502–585)
- Subject: "Black Belt Test Registration Received — <Cycle>". Sent from the script owner's account via `MailApp`.
- Content:
  - the three dates, times and locations, with "Add to calendar" links (only if the dates are ISO `YYYY-MM-DD`)
  - the payment block
  - the Kukkiwon instructions (if chosen)
  - deadlines
  - the requirements link
  - school footer
  - "Wear full uniform and belt, bring water"
- Payment block:
  - **3 Payments:** Check 1/2/3 amounts with "post-dated" dates (Payment 1/2/3 due). "Make each check out to [Owner], turn in all three by <Checks due>."
  - **Otherwise (paid in full):** Full Payment amount, due by "Payment due".
  - Total = plan amount + Kukkiwon fee (if chosen).
  - "Testing fees are non-refundable."
- Kukkiwon text: create an account at tkdcon.net, send the school your Tcon user ID and DOB, upload your own photo.

### 3.4 Fees and payments
- **Payment methods:** only checks, payable to the owner personally. "Pay in Full" is also implied to be a check (the receipt says "make checks out to…"). There is no field for method, check number, cash or card.
- **Partial payments:** 3 free-amount slots plus 1 Kukkiwon slot. Any amount can be typed; the date auto-stamps on first entry.
- **Refunds:** not supported ("non-refundable"). No refund or void field. A negative amount would count in the sheet SUM but shows as positive on the receipt (bug, §5).
- **Status:** Not started / Balance due / PAID IN FULL. Overpayment shows a negative balance in the sheet but $0 on the receipt.
- **Receipt:**
  - Staff select a row and run "Send Payment Receipt", which shows a preview and asks for confirmation.
  - The email lists each non-zero slot as "Payment N" plus "Kukkiwon certificate", with dates. It also shows testing fee, Kukkiwon fee, total due, paid to date, and the balance (or "paid in full").
  - "Last payment" = the last non-empty slot (Kukkiwon if paid), not necessarily the most recent by date.
  - The "Receipt sent" date is overwritten each time.
- **No late fees, discounts, sibling or family pricing, or per-school pricing.** The only "discount" is that pay-in-full costs less than three checks (see §4).

### 3.5 Testing day / grading
- **Before the day:**
  - "Check All Tabs" verifies every tab has grading rows down to the last candidate.
  - "Build Printable Rosters" makes paper sheets. One tab each for Technical and Curriculum; pick a Dan, print it. Candidates are listed alphabetically with Age and Class, plus a Notes column.
  - Paper header: "Date ____ Examiner ____".
  - Technical grade scale on paper: A+ · A · B+ · B · C · D.
  - Curriculum grade scale on paper: A+ · A · A- · B+ · B · B- · C+ · C · C- · D.
  - **One examiner per sheet** is implied. There is no multi-judge averaging in code.
- **Grading:** staff type or choose grades in dropdowns on the scoring tabs (dropdowns and per-row formulas are hand-built). Physical Scoring has a "Pull-Up Method" column, default "Hold" (pull-up vs. flexed-arm hang).
- **Totals:** Final Score per Dan = SUM of five section-total cells (§4), shown to one decimal (`0.0`). The score is never rounded, only displayed to one decimal.
- **Result:** the Finals "Result / Make-Ups" column is a sheet formula (not in the script). It shows `PASS!` or a list of subjects to make up, separated by commas or semicolons. Blank = not graded yet. The code also treats "PASS" (any case) as a pass in some places.
- **Overrides:** Finals cells can be hand-typed overrides (comment line 2234).
- **Passing scores** (published text, line 601):
  - 1st Dan: 275 (children) / 293 (adults)
  - 2nd Dan: 261
  - 3rd Dan: 293
  - 4th Dan: 453
  - Where these are enforced is not visible (sheet formulas).

### 3.6 After testing
1. **Results emails** (one, selected row, or all): subject "Your <Dan> Black Belt Testing Results — <Cycle>". The body has the total score plus PASS / "Make-up required" with the item list, or "still being finalized" if the result is blank. To candidates only.
2. **"Send Make-Up Emails"** (older feature, overlaps item 1): emails every non-pass with score and "still to make up". No confirmation.
3. **Save Non-Passers to Make-Up Tracker:** permanent rows, Status = Pending.
4. **Make-up rule (from email text):** "the listed subject(s) must be completed at the NEXT Dan testing. Everything you already passed is kept." So passed subjects carry over and only failed ones are retested. The script does nothing to carry them over into the next cycle's grading; staff do it by hand.
5. **Email Make-Up Tracker:** reminds all Pending people of the next cycle's dates. Staff set Completed by hand.
6. **Start New Cycle:**
   - Asks the user to confirm they made a copy (File → Make a copy). This is the only archive of grades and payments.
   - Saves non-passers, then clears every roster, grade and payment cell.
   - The Registrations Log and the Drive signatures are **never cleared**.
7. **Not generated at all:** certificates, PDFs, Kukkiwon submissions, staff notifications. Emails go only to candidates; staff get none.

---

## 4. Business rules hidden in code

### Ranks and categories
- **Ranks tested:** "1st Dan", "2nd Dan", "3rd Dan", "4th Dan" only (`DAN_RANK`, 2146).
- **Not in the code:** Poom, Cho Dan Bo, or any rank above 4th Dan. An unknown Dan sorts to the bottom (rank 99) and gets no Kukkiwon fee (the IFS formula has no default, so it gives #N/A).
- **Child vs adult** matters for the 1st Dan passing score and for 1st Dan "One Step Sparring (adult only)". The cut-off age is not defined in code (possibly the "Class" column).

### Fees (Testing Info defaults, lines 200–204, 143–147)
| Dan | "Fee" (= 3 checks) | Check 1 / 2 / 3 | Pay in full | Kukkiwon certificate |
|---|---|---|---|---|
| 1st | $790 | 270 / 270 / 250 | $760 | $100 |
| 2nd | $990 | 330 / 330 / 330 | $960 | $110 |
| 3rd | $1,500 | 500 / 500 / 500 | $1,450 | $140 |
| 4th | $2,400 | 800 / 800 / 800 | $2,320 | $170 |

- **Pay-in-full saving:** $30 / $30 / $50 / $80.
- The `Fee <Dan>` keys are never read by this script. Totals are rebuilt from Payment 1+2+3.
- **The Kukkiwon fee is hardcoded in four places:** lines 132, 509, 1323 and 1750. The comments wrongly say "three". It is not in Testing Info, so the admin page can't change it.
- **Payment structure:** checks payable to the owner. Three post-dated checks, all handed in by "Checks due". Fees are non-refundable.

### Example cycle dates (Spring 2026 defaults)
| Item | Date |
|---|---|
| Application due | Mar 28 |
| Payment 1 / full / checks due | Mar 28 |
| Payment 2 | Apr 25 |
| Payment 3 | May 30 |
| Submissions due | May 30 |
| Physical | Sat Apr 4 (indoor 12:30–2:30 at the Worcester school, outdoor 2:30–3:30 at an off-site arena in Auburn) |
| Technical | Sat May 2, 12:30–3:30, Shrewsbury school |
| Curriculum | Sat Jun 6, 2:00–5:00, Shrewsbury school |

### Subjects and credits (`_TB`, 588–602; print lists 709–720)
The number after each subject is its "credit" (`cr`). How credits turn into points is not in the code.

**Physical (all Dans, 9 events, no credits listed):** Stretching · Sit-up (20 sec) · Push-up (1 min) · Static Jump · Long Jump · Sprint (4×10 m) · Pull-up / Hold · Sprint 100 m · 0.5 / 1 Mile (distance probably varies by age or Dan).

**Technical, 1st–3rd Dan (11 cr):** Referee Seminar 2 · Free Sparring 3 · Target Kick (30 sec) 2 · Korean Terminology 2 · TKD Knowledge 2.

**Technical, 4th Dan (36 cr):** Referee Seminar 10 · Free Sparring 4 · Target Kick 4 · Korean Terminology 4 · TKD Knowledge 4 · Written Test 10.

**Other requirements, 1st–3rd Dan (20 cr):** Egg Test 5 · Meditation 4 · Assistant Instructor Course 5 · Appreciation Letter 2 · TKD Project 4.

**Other requirements, 4th Dan (32 cr):** Egg Test 4 · Meditation 4 · Assistant Instructor Course 10 · Appreciation Letter 4 · TKD Project 10.

**Curriculum:**
| Dan | Subjects (credits) | Total |
|---|---|---|
| 1st | Basic 10 Motions (1-7) 5 · Tae-Geuk Poomsae (1-8) 5 · Sa Bang Chuck (1-13) 5 · One Step Sparring (1-24) adults only 5 · Technical Break 5 · Power Break 5 · Self-Defense 5 | 35 cr |
| 2nd | White-Bodan Curriculum 10 · Go-Ryo Poomsae 3 · Advance 10 Motion (1-5) 3 · Advance Sa Bang Chuck (1-5) 3 · Step Sa Bang Chuck (1-5) 3 · Power Break 3 · Technical Break 3 · Two Step Sparring (1-10) 3 | 31 cr |
| 3rd | White-Bodan Curriculum 10 · Geum Gang Poomsae 5 · 1st Dan Curriculum 10 · 2nd Dan Sa Bang Chuck (1-4) 3 · Creative Poomsae 3 · Creative Sa Bang Chuck 3 · Technical Break 3 · Power Break 3 | 40 cr |
| 4th | White-Bodan Curriculum 10 · Tae Baek Poomsae 4 · 1st Dan Curriculum 10 · 2nd Dan Curriculum 10 · 3rd Dan Sa Bang Chuck (1-6) 4 · Creative Poomsae 4 · Creative Sa Bang Chuck 4 · Technical Break 4 · Power Break 4 | 54 cr |

**Extra points (bonus) categories:** Extra Stripes · Outstanding Performance · Competition Experience · Attendance · Special Event Participation · Breaking Class Participation.

### Final Score composition (`FINAL_SCORE_PARTS`, 1411–1420; column letters as of an old "Sep 23" layout, before the # column)
| Dan | Physical | Technical | Curriculum | Other Req | Extra Pts |
|---|---|---|---|---|---|
| 1st | Physical Scoring AK | Technical Testing O | 1st Dan – Curriculum S | Other Req & Extra Pts N | Other Req & Extra Pts AA |
| 2nd | AK | O | 2nd Dan – Curriculum T | N | AA |
| 3rd | AK | O | 3rd Dan – Curriculum T | N | AA |
| 4th | AK | 4th Dan – Technical Q | 4th Dan – Curriculum V | 4th Dan – Other Req N | 4th Dan – Other Req AA |

- Final = plain unweighted SUM of these five section totals. Any weighting is inside each section's formula: probably grade value × credits. Physical is presumably points per event.
- Since the credit totals are small (e.g. 1st Dan 35+11+20) compared with passing scores of 275–453, grades must map to multi-point values. **The mapping is unknown.**

### Other rules
| Rule | Value |
|---|---|
| Capacity | 200 candidates |
| Print rows per Dan | 40 |
| Registration lock wait | 30 s |
| Sort lock wait | 20 s |
| Roster order | by Dan, then registration order (stable) |
| Pass string | `PASS!` |
| Make-up items | separated by `,` or `;` |
| Make-up dedupe key | name + cycle (case-insensitive) |
| Grades kept after a fail | everything passed is kept; only listed items are retested at the next testing |
| Pull-Up Method default | "Hold" |
| Age | whole years at registration time, never recomputed |

---

## 5. Problems and limitations

### Security and privacy
1. **Unauthenticated admin write (line 398–400):** `doPost` with `action:'updateInfo'` overwrites any Testing Info key. The comment says "password requirement removed". Anyone who finds the web-app URL (it is embedded in the public page) can change prices, dates, locations or school text that then goes out in emails. They can also add arbitrary keys, which are then served publicly.
2. **Public read of everything in Testing Info (`doGet`, 386–394):** anything staff type into that tab becomes public. The JSONP `callback` parameter is echoed unsanitized (callback injection / reflected script on the script domain).
3. **Open registration endpoint with no validation:** no checks on email format, Dan value, DOB format, name length or duplicates. There is no CAPTCHA, rate limit or size limit on `signatureImage`. Spam or flooding fills the 200 rows and the Drive folder, and sends emails from the school account to any address (abuse or reputation risk).
4. **Minors' data:**
   - DOB, sex and email sit in plain sheet columns visible to anyone with sheet access.
   - The Registrations Log keeps DOB, email and signature links forever. It is never cleared, including after removal or a new cycle.
   - Signatures stay in Drive forever, with whatever sharing the folder has.
   - `getFoldersByName` (626) could pick up any folder with that name the owner can see, including someone else's shared folder.
   - File names contain the child's name.
5. **Emails go to the candidate's email only.** For minors there is no parent/guardian address field: `signedBy` is just a name. Results and scores are emailed in plain text. `sendResultsSelected` and the preview dialogs display the email address and body on screen.
6. **Checks payable to an individual:** a business/finance rule to confirm, not a code bug.

### Data integrity and races
7. **Row-position coupling everywhere** (grade row = roster+2, payment row = roster+3; e.g. 354–355, 678, 920, 1048, 1136, 1782). Every sort physically moves values across about 12 tabs. One manual row insert or delete, or one sort by hand in the Sheets UI, silently gives grades and checks to the wrong person.
8. **Race between auto-sort and live grading:** every registration re-sorts the roster (448), moving every grade and payment row. The lock only covers script code. A staff member typing a grade or a check amount by hand is not locked, so their value can land on a different candidate after a concurrent sort. `removeCandidate` clears rows (353–355) **before** taking the lock. `startNewCycle` and `updateTestingInfo` take no lock at all.
9. **Rollback is best-effort** (2286–2290): restore errors are swallowed, so a partial failure can still leave a half-permuted workbook. `snapshot_` keeps formulas, but `permuteTargets_` keeps each row's own formula in place, so hand-typed overrides that are formulas don't move.
10. **Identity by name only:**
    - `removeCandidate` (350), `sendResultsOne` (1157), the Payments rebuild (`keepByName`, 1256) and the make-up dedupe (904) all match on name.
    - Two candidates with the same name collide: wrong person removed, payments merged or lost, make-up row skipped.
    - Name typos break the payment restore. Orphans are only shown in an alert, and the money remains only in version history.
11. **Payments rebuild deletes the tab** (1278) and recreates it. Formulas elsewhere that point at `Payments` become #REF, and any manual formatting or notes are lost. The print tabs are deleted and recreated too (754).
12. **Plan-string mismatch (bug):**
    - The confirmation email treats only `'3 Payments'` as checks (512); everything else is "paid in full".
    - The Payments sheet treats only `"Pay in Full"` as full (1316); everything else, including blank or a typo, is billed the three-check total.
    - So a blank or unexpected plan gives a cheaper email quote than the ledger.
13. **Kukkiwon price table duplicated four times** (132, 509, 1323, 1750) and missing from Testing Info. The comments say three copies. The IFS formulas have no default, so an unknown Dan gives #N/A.
14. **`sendMakeupEmails` reads fixed columns** (673–677: name col 2, score col 5, result col 7, from row 5) instead of `frCols_`. Lines 996–1002 say these columns moved when the # column was added. So this menu item probably emails the **wrong score/result text**. It also has **no confirmation prompt** and duplicates `sendResultsAll`.
15. **Refund / negative amounts:** `num_` (500) strips the minus sign, so a −$50 correction shows as a $50 payment on the receipt while the sheet SUM subtracts it. `Math.max(0,bal)` (1822) hides overpayments.
16. **Payment date stamping** (1762–1771): only the top-left cell of a paste or multi-cell edit is handled. Changing an amount later keeps the old date. Simple `onEdit` triggers don't fire for script or API edits. There is no audit of who entered a payment.
17. **"Last payment" on the receipt** is the last filled slot (Kukkiwon wins if present), not the most recent date. "Receipt sent" keeps only the latest date.
18. **Age:**
    - Computed at registration, not at the testing date. This matters for the child/adult passing score.
    - `new Date('YYYY-MM-DD')` parses as UTC, so in US Eastern time a birthday can be off by one day.
    - The age is never recomputed.
19. **Date formats:** `fmtI` and `calUrl_` only understand ISO dates. The setup defaults ("Saturday, April 4, 2026") give no calendar links and are passed through unformatted. `updateTestingInfo` stores everything as text. A price typed as "$760" makes the VLOOKUP sums fail in the Payments sheet.
20. **Results with blank Result** (`sendResultsAll`) still email "still being finalized" to ungraded candidates. Pass detection relies on the exact string "PASS!".
21. **Silent failures:**
    - Confirmation email errors are swallowed (584).
    - A signature save error is stored as the text "error: …" (632).
    - Many `try{}catch(e){}` blocks hide formatting and sort problems.
    - A failed confirmation still returns `ok:true`.
22. **Edge-case crashes:** `getRange(2,1,lastRow-1,2)` throws when Testing Info has only its title row (142, 643, 650).
23. **Start New Cycle depends on a manual "File → Make a copy"** for all history. There is no automatic archive of grades or payments, so past results exist only in copied files. The Make-Up Tracker keeps only the score and owed list.

### Performance and quotas
24. **Per-cell API calls in loops** risk the 6-minute execution limit:
    - `startNewCycle` (372–374): 200 × 11 `clearContent` calls on the roster, plus 200 × 9 tabs × every non-formula cell through `clearRowInputs` (one call per cell), plus 200 payment rows. Tens of thousands of calls, so it will likely time out part-way through and leave a half-cleared workbook.
    - Others: `removeCandidate` (349), `handleRegistrationLocked_` (427–444), `sendMakeupEmails`, `collectResults_`, `archiveNonPassers`, `fixKukkiwonDue` (1747, one `setFormula` per row), `sendPaymentReceipt`.
25. **MailApp quotas:** 100 recipients a day on consumer Gmail, 1,500 on Workspace. With a 200-candidate roster, `sendResultsAll` plus confirmations could hit the limit mid-loop. Failures are listed, but nothing tracks who was already sent, so a rerun double-sends.
26. **Sort on every registration** re-reads and rewrites about 12 tabs × 200 rows inside the lock (≤30 s). During a registration rush, other registrants get "busy, try again".

### Fragility
27. **Hardcoded column letters** (`FINAL_SCORE_PARTS`, "Sep 23 layout") are adjusted by guessing the shift from the Name column. Fallback column numbers (25/26, 2/5/7) and `gridWidth_` reading header rows 3–4 are also fragile. The grading dropdowns and formulas were built by hand and only reached 20 rows until `extendGradingRows`.
28. **Tab names with en dashes** ("1st Dan – Final Results") must match exactly. `sheetName.split(' –')[0]` derives the Dan from the tab name.
29. **Hidden rows on per-Dan tabs** (`tidyDanTabs_`) and **leftovers of the removed make-up tickbox feature** add invisible state.

### What a database app fixes
- Stable candidate IDs instead of row positions.
- Transactions instead of manual rollback.
- Row-level security, and logging every change.
- One fee table per cycle and Dan, including the Kukkiwon fee.
- A real payments ledger: one row per payment, with method, check number, refunds/voids and who recorded it.
- Results history kept per cycle instead of "copy the file".
- An email outbox with sent status (no double-sends) and parent/guardian contacts.
- Server-side validation and rate-limiting for public registration.

---

## 6. Open questions for the owner

1. **Grade → points:** what is each grade worth (A+ … D, and the 10-step curriculum scale)? How do the "credits" combine with grades (grade value × credits)? We need the sheet formulas or the scoring rubric.
2. **Physical scoring:**
   - How is each of the 9 events scored (reps/times → points)? Do standards differ by age, sex or Dan?
   - When is it 0.5 mile vs 1 mile?
   - What is "Pull-Up Method" (Hold vs Pull-up), and who gets which?
3. **Pass/fail rule:**
   - Is it only the total ≥ passing score (275/293/261/293/453)?
   - Or also a minimum per subject or section? What makes a subject show up as a "make-up"?
   - Is a subject failed below a certain grade (e.g. D)?
   - Is a missing "Other requirement" (egg test, project…) an automatic make-up?
4. **Children vs adults:** what age (and as of what date) makes a 1st Dan candidate an "adult" (293 vs 275, One Step Sparring)? What does the roster's **"Class"** column hold, and who fills it in?
5. **Extra points:** how many points per category, and is there a cap? Who awards them?
6. **Make-ups:**
   - How long do passed subjects stay valid (one cycle? any future cycle)?
   - Do make-up candidates re-register or pay again (a make-up fee)?
   - How are they re-graded (only the owed subjects on the next testing day)?
   - Does a passed score carry into a new final score?
7. **Eligibility:** are there prerequisites to enforce, such as current rank, time in rank, minimum age per Dan, attendance, instructor approval or membership in good standing? Should registration close at "Application due"?
8. **Ranks:**
   - Poom vs Dan for under-15s: does the Kukkiwon fee or certificate type differ?
   - Is anything above 4th Dan tested?
   - Where does the color-belt-to-black-belt step (e.g. a Cho Dan Bo / recommended black belt) fit, if anywhere?
9. **Fees:**
   - Are the prices the same at both schools?
   - Are there family/sibling discounts, late fees or a make-up fee?
   - Can people pay by cash, card or online, or only by check?
   - Do partial or irregular payment amounts happen in practice?
   - Are refunds or credits ever given despite "non-refundable"?
   - Why are the "Fee <Dan>" rows ($790 etc.) kept: are they shown on the public page?
10. **Kukkiwon:**
    - Who submits to Kukkiwon, and when?
    - Should we track Tcon user ID, photo received and certificate received or delivered?
    - Should the fee be editable per cycle?
11. **Judges:**
    - Is it one examiner per subject or several, and if several, are scores averaged?
    - Should the new app record which examiner gave which grade?
    - Will grading be entered live on tablets, or on paper first and typed in later?
12. **Communication:**
    - For minors, should emails go to a parent/guardian address?
    - Should staff get copies or notifications (new registration, payment received)?
    - Who is allowed to send results, and only after an admin "finalizes" them?
13. **Certificates and documents:** are certificates or score sheets printed or emailed today outside this script? Should the new system produce them?
14. **The public registration page and admin page (Cloudflare Workers site):**
    - Who maintains it?
    - Does the new dashboard replace it, or keep it as the public form?
    - What does `requirements.html` contain (it may duplicate `_TB`)?
15. **Signature and waiver:** what text is the candidate or parent signing? Must we keep the drawn signature image, and for how long?
16. **Data retention:**
    - How many past cycles must be kept (results, payments, logs)?
    - Can old Registrations Log rows and Drive signatures be deleted?
    - Is there a history from the copied cycle files that should be imported?
17. **Capacity and locations:**
    - Is the outdoor physical session always at the off-site arena?
    - Are testing days shared by both schools (it looks like it: Physical at Worcester, Technical and Curriculum at Shrewsbury)?
    - Should candidates be tagged by home school?
