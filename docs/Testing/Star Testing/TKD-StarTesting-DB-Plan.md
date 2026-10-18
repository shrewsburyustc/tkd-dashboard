# Star testing — database plan (migration 0006)

**Status:** DRAFT 2026-10-18. All 15 database questions answered (rulebook v0.156, v0.158–v0.171). Security-reviewed twice (fixes applied). §8 lists proposed defaults still waiting for Jeffrey's OK. Nothing is applied to Supabase without Jeffrey's OK for that paste.
**Built from:** rulebook v0.155 (every Star row v0.58–v0.155), the Star status file, the approved Star mockups, handoff §6 (security rules) and the real migrations 0001–0005 (0005 is read from the `color-belt` branch, where it is live in production but not merged into `main` yet).
**Sources in plain words:** "rule" = handoff §6 or the rulebook; "0005" = Color Belt phase 2's migration, already live.

---

## 1. What this migration must do (in one paragraph)

Store everything the approved Star screens show: the shared rubrics and prices; events with their own copy of those; two family links per event; candidates (from the form or the desk), their payments, make-ups and private testings; grades and class counts; who marked a result email as sent; a log line for each CSV download. Results are worked out from the grades every time they are shown (decided v0.158). Every rule from handoff §6 applies: RLS on every table, `revoke … from public, anon, authenticated, service_role` on every Star table, sequence, view and function (then only the needed grants), nothing for `anon` or `service_role`, writes only through security-definer functions that check `has_data_access()` first, every change in `change_log`, signatures never logged ("on file" only); DOB and email never in lists (logged in full, v0.169); payments only on the Candidates roster (v0.108).

## 2. Facts that shape the plan (from the research)

1. **0005 is live in production** and owns the names `testing_events`, `testing_registrations`, `testing_payments`, `testing_roster` and about 45 `testing_*` functions. Star must not reuse or change them.
2. **0006 is the only free number** (the new-students branch already has 0007–0009).
3. **Star events differ from Color Belt events:** one event for both schools ("Where" is information only, v0.87), two links per event (one per school, v0.98), one shared price list (v0.58), and the form asks for date of birth and email (v0.98). Color Belt events belong to one school.
4. **0005's public form path** (Pages Function → restricted login `testing_registrar` → one database function) is the pattern Star must follow (v0.33). 0005's test T2a fails if that login can run anything except Color Belt's two functions.
5. **Lock order (proposed, reviewer to check):** every existing write locks the school's row first. A Star event covers both schools, so every Star write locks in one order: **event → candidate → payment or grade**. Admin rubric edits lock the template rows in Dan order, so "add event" can never copy a half-saved template.

## 3. Shape: separate `star_…` tables (decided v0.156, Q-D1); table and column details are still proposals

All new objects start with `star_`. Each table has the house columns (plus `revoke … from public, anon, authenticated, service_role` before any grant): `id uuid`, `version`, `created_at/updated_at`, `created_by/updated_by` (never readable), `created_by_name/updated_by_name`, a `*_before_write` trigger, a `*_no_truncate` trigger and a `change_log` trigger.

| Table | What it holds | Rows from |
|---|---|---|
| `star_dan_settings` | the Dan list (v0.171: 1st–3rd seeded, no add function) and each Dan's template: pass mark, star limit, standard / same-day / private fee | v0.61, v0.66, v0.171 |
| `star_categories` | the template's subjects per Dan: name, credits, position, "from class count" (exactly one per Dan) | v0.61, v0.63, v0.66 |
| `star_grade_values` | the 7 letters and their values (values go down in order) | v0.61, v0.66 |
| `star_assistant_table` | age split and the minimum classes per grade, child and 13+ | v0.61, v0.66 |
| `star_events` | name (unique), testing date, start time, Where (information), registration open / auto-close date / first opened, note, two public codes (one per school) | v0.85–v0.92, v0.98 |
| `star_event_dans`, `star_event_categories`, `star_event_grades`, `star_event_assistant` | the event's own copy, taken when the event is created, never changed later | v0.61 |
| `star_candidates` | one person in one event: names, DOB (always present on form entries), email, school (column `location_code`, so `change_log` fills it), Dan, stars from, paying by, source (form/desk), reference `ST-####` (form only), status (active/withdrawn), duplicate state, make-up link, private day and time, classes attended, assistant classes | v0.98–v0.117, v0.148–v0.152 |
| `star_candidate_signatures` | the form's drawn signature, acknowledgement and its wording version (never granted to any role; Star's own purge runs from Star functions: deleted 90 days after the testing day, v0.162) | v0.102, v0.107 |
| `star_makeup_subjects` | for a make-up candidate: which subjects are retested; for a below-245 result: which subjects an admin chose | v0.96, v0.111, v0.129, v0.130, v0.163 |
| `star_payments` | append-only: method used, amount, date, who; undo/edit = a reversal row (as 0005). A guard trigger refuses update, and refuses delete except inside a cascade (`pg_trigger_depth() > 1` or the Star-only `star_delete_candidate` / `star_delete_event` action tags). A refund (v0.166) is its own negative row with its own method and date, unlike an undo/edit reversal | v0.109, v0.110, v0.152, v0.166 |
| `star_grades` | one grade per candidate × event subject, who and when; a make-up's kept grades copied from an earlier event are marked "kept, copied from <event>" so they show gray and aren't treated as judged | v0.124, v0.125, v0.139, v0.163 |
| `star_result_emails` | Mark as sent: who, when, and which result was sent (v0.170) | v0.141 |
| `star_downloads` | CSV downloads: who, when, which event, which Dan. No grants to any client role (written and read only by admin functions) | v0.144 |

**Worked out, never stored:** event status tag and Upcoming/Past (v0.88, v0.89); stars to (= from + 1); expected fee (standard / same day / private); Paid / Not paid / overpaid (v0.152); Assistant Instructor grade (from the count and age, v0.126); totals and results (decided v0.158: one function works them out every time); the make-up list (v0.111); the Home "Today" card (v0.154).

**Logging:** the signature lives only in `star_candidate_signatures`, which gets its own masking log trigger (like 0005's `testing_registrations_log`) that writes "on file", never the image, and no `change_log_write` trigger. `star_candidates` uses the normal log trigger. DOB and email are logged in full, old and new (decided v0.169), and History reads them only through a checked function (staff and admins, v0.160). Tests prove no `change_log_write` trigger exists on `star_candidate_signatures` and `change_log` never contains `data:image` (as 0005 test C8).

**Shared from 0005, read only:** `locations` (school names and street addresses for "Location:" on family pages), `testing_today()` (Massachusetts date), the name and signature checks. 0006 runs no `revoke` or `grant` on `locations`, `testing_public_attempts`, `testing_registrar` or any other 0005 object (that would undo 0005's grants). Star has its own login (v0.159), created with the same settings as `testing_registrar`: no inherit, 5-connection limit, the same timeouts, empty search path, no password in the file.

## 4. Functions (the only way to write)

Each: `security definer`, `set search_path = ''`, full names, checks in the house order (access → role → arguments → lock and look up → version → rules → write → `{status}`), every status from the existing set.

| Area | Functions (staff = S, admin = A) |
|---|---|
| Rubrics and prices | A: update Dan settings, add / update / reorder / delete subject, update grade values, update assistant table |
| Events | A: add (copies the template), update, delete (counts checked, cascades); S+A: open / close registration with the v0.86 date rule |
| Candidates | S: add (walk-in or make-up), update details, change paying by, resolve duplicate, set / change / remove private testing; A: withdraw, restore, delete |
| Payments | S: record payment, undo within the toast (own, recent); A: edit / undo later; record refund to clear an overpaid amount (role and Undo to confirm, v0.166) |
| Grading | S: set grade (or clear) — no version check, last save wins (v0.165), but under the candidate lock it checks in order: access; candidate active (else `withdrawn`); the subject belongs to the candidate's current Dan in this event (so a stale tablet can't bring back grades a Dan change cleared, v0.164); the grade is in the event's own list; the cell isn't a "kept" cell (v0.129); every save logs before and after; set class counts; A: choose make-up subjects for below 245 |
| Candidate detail (reads) | S: `star_candidate_detail(id)` — one candidate, DOB and email included (v0.160); `star_candidate_history(id)` — that candidate's change-log rows only (including its payments, grades and signature-status rows), DOB and email before → after (v0.169), no list or bulk version, never used by the CSV; "View signature" — one candidate's signature, access checked first. All check `has_data_access()` first. `change_log` keeps no grants and no policy. The database takes no device argument: the mat-side tablet setting is **not a security boundary** (v0.161) |
| Age | One security-definer helper works out the age group (12 and under / 13 and up) on the event's testing day (v0.168) for the Assistant Instructor column and results; it returns only the group, never the DOB or age, and checks access first |
| Signature purge | Star's own purge (90 days after the testing day, v0.162) runs inside Star staff functions that open or list an event; logged |
| Results | S: mark email as sent / undo; A: CSV download — checks `has_data_access()` first, then `is_admin()`, writes the log row before returning the rows, in the same call (a refused call writes nothing) |
| Public (family form) | read the event by code (returns only the event box, its prices and rubric, the school name and address — never counts or other candidates); register (login: its own restricted login, proposed `star_registrar`, decided v0.159). Rate limit reuses `testing_public_attempts` (20 per hour per key, 200 per event); `submission_id` unique so a retry returns the same answer; the answer is identical whether or not the person looks like a duplicate; Star gets **its own route and Pages Function** (proposed), so codes never need to be unique across two tables. The shared `testing_public_attempts` table means one 20-per-hour limit per visitor key across both forms (documented; Star-only `outcome` wording). Tests: `star_registrar` has no rights on `testing_public_attempts` (as 0005's T2c), and `authenticator` can't become `star_registrar` |

Reads for the screens use column-level select grants and `security_invoker` views. **`date_of_birth`, `email_for_results` and `signature` are never granted to any role** (like `signature` in 0005): leaving them out of a view would not protect them. They are read only through one security-definer detail function (one candidate by id, `has_data_access()` first, staff and admins, v0.160; the mat-side tablet hides them in the app only, v0.161 — the database does not tell devices apart) and the admin CSV function (rule 5).

## 5. Tests (copy 0005's shape)

`supabase/tests/0006_tests.sql` (one transaction, ends in `rollback`), `0006_fingerprints.sql` (read-only, no forbidden words), and a new step in the PGlite runner that applies 0001–0006, runs **every** earlier test file again, re-applies 0006 and prints fingerprints. Checks by name only, so 0003–0005 tests keep passing. Star has its own login (v0.159), so 0005's test **T2a** and `testing_registrar` are left exactly as they are; 0006's tests prove `star_registrar` can run only Star's two public functions. A `CONTRACT-0006.md` before any SQL, as for 0003 and 0005.

## 6. Order of work after the questions

1. ✓ Done 2026-10-18: `main` (with Color Belt's 0005) merged into `star-testing` (353a050), so 0006 is written against the real 0005.
2. Jeffrey's one-time setup for the Star form login (v0.159): set `star_registrar`'s password in the Supabase SQL Editor and add a second Hyperdrive connection in Cloudflare (step-by-step notes in SETUP).
3. Write `CONTRACT-0006.md` → security review (separate agent) → Jeffrey's OK.
4. Write the SQL + tests → PGlite passes → security review → Jeffrey's OK → Jeffrey pastes it in the Supabase SQL Editor → fingerprints, advisor and tests.
5. Build the screens in the 6 phases (v0.61), one at a time.

## 7. Questions for Jeffrey (one at a time, in this order)

Structure first, then details. Each will be shown with a picture and options.

| # | Question | Why it matters | Left open by |
|---|---|---|---|
| Q-D1 ✓ | **Answered v0.156: separate `star_…` tables (A).** Was: separate Star tables, or share Color Belt's events table? | Decides the whole shape; Color Belt's table is one school per event and already live | v0.60, v0.131, 0005 |
| Q-R1 ✓ | **Answered v0.158: worked out every time (A).** Was: results worked out every time, or saved? | v0.139 (results stay open) points to worked out | v0.138, v0.139 |
| Q-D4 ✓ | **Answered v0.159: a second login just for Star (B).** Was: reuse Color Belt's restricted login, or a second one for Star? | Reusing means editing one Color Belt test; a second login is a setup step for Jeffrey | v0.33, v0.105, 0005 T2a |
| Q-D2 ✓ | **Answered v0.160: staff and admins, detail view only (A).** Was: who can see DOB and email? | Decides the detail function's role check | status §4, v0.110, v0.112 |
| Q-D9 ✓ | **Answered v0.161: a setting in the app (A), not enforced by the database (flagged, Jeffrey's call).** Was: mat-side tablet: the database can't tell the tablet from the desk PC. Separate tablet account, or the tablet only uses Grading? | DOB, email and payments must stay off the tablet (v0.108, v0.110) | v0.108, v0.122 |
| Q-D5 ✓ | **Answered v0.162: like Color Belt (A) — signatures 90 days; DOB, email and records kept.** Was: how long is data kept? Signatures (Color Belt: 90 days); DOB and email of past candidates (the make-up list and CSV need older events, so this conflicts); old events | Privacy of minors | v0.102, v0.136 |
| Q-D7 ✓ | **Answered v0.163: the later event's rubric; kept grades copied in when the make-up is added (B).** Was: make-ups across events: copy the earlier grades into the new event, or read them from the earlier event? | Rubric copies can differ between events | v0.61, v0.129 |
| Q-D11 ✓ | **Answered v0.164: allowed after a confirmation that clears the grades (B); stars changes keep grades.** Was: changing a candidate's Dan or stars after grading: clear the grades, keep them, or block the change? | Grades belong to one Dan's subjects | v0.112 |
| Q-D10 ✓ | **Answered v0.165: last save wins, silently (A); grade saves take no version check (class counts still to confirm); the change log keeps both.** Was: two people entering the same grade: last one wins, or "changed by someone else"? | Paper typed in while a tablet grades | v0.122 |
| Q-D12 ✓ | **Answered v0.166: record a refund as a reversal row (A).** Was: overpaid: how is it cleared (refund recorded as a reversal, or a "settled" mark)? | Needed for the payment rows | v0.152 |
| Q-D13 ✓ | **Answered v0.167: any recorded payment means Paid (A); after the testing day the amount fills in at the testing-day price.** Was: fee after the testing day and discounts: what fills in, and does a smaller amount count as Paid? | Needed for "Paid / Not paid" | v0.109, v0.110 |
| Q-D18 ✓ | **Answered v0.168: the event's testing day counts; the private day may be before or after (A).** Was: private testers' age: counted on the testing day or the private day? Can the private day be earlier? | Assistant Instructor grade uses age | v0.66, v0.148 |
| Q-D17 ✓ | **Answered v0.169: kept in full; History shows before → after to staff and admins (C; privacy flagged, Jeffrey's call).** Was: DOB and email in the change log: masked like signatures, or kept for History? | Privacy | v0.110, v0.112 |
| Q-D6 ✓ | **Answered v0.170: Mark as sent saves the result; a changed result shows "Not sent yet" again (A).** Was: result changes after Mark as sent: back to "Not sent yet"? | Shape of `star_result_emails` | v0.141 |
| Q-D14 ✓ | **Answered v0.171: Dans in their own small list, three now, no Add Dan button (B).** Was: Dans fixed at 1st–3rd, or can admins add a 4th Dan later? | Check rule vs a Dan table | status §4 |
| — | Smaller items: see §8 (proposed defaults, for Jeffrey's OK) | | |

## 8. Smaller items — proposed defaults (for Jeffrey's OK; not decided)

| # | Item | Proposed default | Why |
|---|---|---|---|
| S1 | Where CSV downloads are logged | Their own small table `star_downloads` (who, when, which event, which Dan), written in the same call that returns the rows | The change log only records data changes; a download isn't one (v0.144) |
| S2 | "Keep this one" on a possible duplicate | The other copy is **withdrawn** as "Duplicate copy" and can be restored, as Color Belt does | Nothing is lost by mistake (v0.114) |
| S3 | A desk entry with no date of birth | Allowed; the 13-and-up assistant column is used (v0.66); the duplicate check compares by name alone for that row | The form requires DOB; only walk-ins at the desk could lack it (v0.111) |
| S4 | Link to future student records | No column now; added when a Students section is built (names, grades and results are all kept, v0.162) | Nothing to link to yet; adding a column later is a small change |
| S5 | Lock order for every Star write | Event → candidate → payment or grade. Rubric edits lock the template rows in Dan order; add event takes share locks on the template rows in the same order. Make-up add: the later event, then the earlier event read-only. Resolve duplicate: both candidates in id order. Delete event: the event, then its candidates in id order | Prevents two saves blocking each other (§2.5) |
| S6 | Do class counts skip the version check like grades (v0.165)? | Yes, same as grades (last save wins, logged) | Same cells on the same grid |
| S7 | Who records a refund, and how much (v0.166) | Admins only (like editing a payment after the toast, v0.110); the database refuses a refund larger than the overpaid amount | Money out is the riskiest payment action |
| S8 | Who can change a candidate's Dan after grading (v0.164) | Staff and admins, as Edit details today; on paid rows only admins (v0.110) | Keeps v0.110's rule |
| S9 | Signature deletion for a private tester (v0.162) | 90 days after the event's testing day (same day used for age, v0.168) | One rule for everyone in the event |
| S10 | Delete permanently and the change log | Deleting a candidate permanently does **not** remove their DOB and email from the change log (it is append-only and keeps full values, v0.169); stated so Jeffrey knows | Consequence of v0.169 |

Left for the contract (technical, no decision needed from Jeffrey): column grant lists for each table and view; the result function's exact outputs (v0.158); any new status names.

