# Star testing — database plan (migration 0006)

**Status:** DRAFT 2026-10-18 for Jeffrey's questions; security-reviewed once (fixes applied). Nothing here is decided until it is recorded in the rulebook. Nothing is applied to Supabase without Jeffrey's OK for that paste.
**Built from:** rulebook v0.154 (every Star row v0.58–v0.154), the Star status file, the approved Star mockups, handoff §6 (security rules) and the real migrations 0001–0005 (0005 is read from the `color-belt` branch, where it is live in production but not merged into `main` yet).
**Sources in plain words:** "rule" = handoff §6 or the rulebook; "0005" = Color Belt phase 2's migration, already live.

---

## 1. What this migration must do (in one paragraph)

Store everything the approved Star screens show: the shared rubrics and prices; events with their own copy of those; two family links per event; candidates (from the form or the desk), their payments, make-ups and private testings; grades and class counts; who marked a result email as sent; a log line for each CSV download. Results are worked out from the grades every time they are shown (proposed, Q-R1). Every rule from handoff §6 applies: RLS on every table, `revoke … from public, anon, authenticated, service_role` on every Star table, sequence, view and function (then only the needed grants), nothing for `anon` or `service_role`, writes only through security-definer functions that check `has_data_access()` first, every change in `change_log`, DOB / email / payments / signatures kept out of lists and logs.

## 2. Facts that shape the plan (from the research)

1. **0005 is live in production** and owns the names `testing_events`, `testing_registrations`, `testing_payments`, `testing_roster` and about 45 `testing_*` functions. Star must not reuse or change them.
2. **0006 is the only free number** (the new-students branch already has 0007–0009).
3. **Star events differ from Color Belt events:** one event for both schools ("Where" is information only, v0.87), two links per event (one per school, v0.98), one shared price list (v0.58), and the form asks for date of birth and email (v0.98). Color Belt events belong to one school.
4. **0005's public form path** (Pages Function → restricted login `testing_registrar` → one database function) is the pattern Star must follow (v0.33). 0005's test T2a fails if that login can run anything except Color Belt's two functions.
5. **Lock order (proposed, reviewer to check):** every existing write locks the school's row first. A Star event covers both schools, so every Star write locks in one order: **event → candidate → payment or grade**. Admin rubric edits lock the template rows in Dan order, so "add event" can never copy a half-saved template.

## 3. Shape: separate `star_…` tables (decided v0.155, Q-D1); table and column details are still proposals

All new objects start with `star_`. Each table has the house columns (plus `revoke … from public, anon, authenticated, service_role` before any grant): `id uuid`, `version`, `created_at/updated_at`, `created_by/updated_by` (never readable), `created_by_name/updated_by_name`, a `*_before_write` trigger, a `*_no_truncate` trigger and a `change_log` trigger.

| Table | What it holds | Rows from |
|---|---|---|
| `star_dan_settings` | the template per Dan: pass mark, star limit, standard / same-day / private fee | v0.61, v0.66 |
| `star_categories` | the template's subjects per Dan: name, credits, position, "from class count" (exactly one per Dan) | v0.61, v0.63, v0.66 |
| `star_grade_values` | the 7 letters and their values (values go down in order) | v0.61, v0.66 |
| `star_assistant_table` | age split and the minimum classes per grade, child and 13+ | v0.61, v0.66 |
| `star_events` | name (unique), testing date, start time, Where (information), registration open / auto-close date / first opened, note, two public codes (one per school) | v0.85–v0.92, v0.98 |
| `star_event_dans`, `star_event_categories`, `star_event_grades`, `star_event_assistant` | the event's own copy, taken when the event is created, never changed later | v0.61 |
| `star_candidates` | one person in one event: names, DOB, email, school, Dan, stars from, paying by, source (form/desk), reference `ST-####` (form only), status (active/withdrawn), duplicate state, make-up link, private day and time, classes attended, assistant classes | v0.98–v0.117, v0.147–v0.151 |
| `star_candidate_signatures` | the form's drawn signature, acknowledgement and its wording version (never granted to any role; Star's own purge runs from Star functions, the period is Q-D5) | v0.102, v0.107 |
| `star_makeup_subjects` | for a make-up candidate: which subjects are retested; for a below-245 result: which subjects an admin chose | v0.96, v0.111, v0.129, v0.130 |
| `star_payments` | append-only: method used, amount, date, who; undo/edit = a reversal row (as 0005). A guard trigger refuses update, and refuses delete except inside a cascade (`pg_trigger_depth() > 1` or the `delete_candidate` / `delete_event` tags) | v0.109, v0.110, v0.151 |
| `star_grades` | one judged grade per candidate × event subject, who and when | v0.124, v0.125, v0.139 |
| `star_result_emails` | Mark as sent: who, when, the result it was for | v0.141 |
| `star_downloads` | CSV downloads: who, when, which event, which Dan | v0.144 |

**Worked out, never stored:** event status tag and Upcoming/Past (v0.88, v0.89); stars to (= from + 1); expected fee (standard / same day / private); Paid / Not paid / overpaid (v0.151); Assistant Instructor grade (from the count and age, v0.126); totals and results (Q-R1); the make-up list (v0.111); the Home "Today" card (v0.153).

**Logging DOB and email:** `star_candidates` gets its own log trigger (like 0005's `testing_registrations_log`) that writes DOB and email as "on file", never their values, until Q-D17 is answered. A test proves `change_log` never contains a DOB or an email.

**Shared from 0005, read only:** `locations` (school names and street addresses for "Location:" on family pages), `testing_today()` (Massachusetts date), the name and signature checks. 0006 runs no `revoke` or `grant` on `locations`, `testing_public_attempts`, `testing_registrar` or any other 0005 object (that would undo 0005's grants), except what Q-D4 decides.

## 4. Functions (the only way to write)

Each: `security definer`, `set search_path = ''`, full names, checks in the house order (access → role → arguments → lock and look up → version → rules → write → `{status}`), every status from the existing set.

| Area | Functions (staff = S, admin = A) |
|---|---|
| Rubrics and prices | A: update Dan settings, add / update / reorder / delete subject, update grade values, update assistant table |
| Events | A: add (copies the template), update, delete (counts checked, cascades); S+A: open / close registration with the v0.86 date rule |
| Candidates | S: add (walk-in or make-up), update details, change paying by, resolve duplicate, set / change / remove private testing; A: withdraw, restore, delete |
| Payments | S: record payment, undo within the toast (own, recent); A: edit / undo later |
| Grading | S: set grade (or clear), set class counts; A: choose make-up subjects for below 245 |
| Results | S: mark email as sent / undo; A: CSV download — checks `has_data_access()` first, then `is_admin()`, writes the log row before returning the rows, in the same call (a refused call writes nothing) |
| Public (family form) | read the event by code (returns only the event box, its prices and rubric, the school name and address — never counts or other candidates); register (login: Q-D4). Rate limit reuses `testing_public_attempts` (20 per hour per key, 200 per event); `submission_id` unique so a retry returns the same answer; the answer is identical whether or not the person looks like a duplicate; public codes are unique across Star and Color Belt (or Star gets its own route and Function) |

Reads for the screens use column-level select grants and `security_invoker` views. **`date_of_birth`, `email_for_results` and `signature` are never granted to any role** (like `signature` in 0005): leaving them out of a view would not protect them. They are read only through one security-definer detail function (one candidate by id, `has_data_access()` first, roles per Q-D2/Q-D9) and the admin CSV function (rule 5).

## 5. Tests (copy 0005's shape)

`supabase/tests/0006_tests.sql` (one transaction, ends in `rollback`), `0006_fingerprints.sql` (read-only, no forbidden words), and a new step in the PGlite runner that applies 0001–0006, runs **every** earlier test file again, re-applies 0006 and prints fingerprints. Checks by name only, so 0003–0005 tests keep passing. If Star reuses `testing_registrar` (Q-D4), 0005's test **T2a** ("the registrar can run only Color Belt's two functions") must be changed to check by name; that edit to a live migration's test gets its own review. A `CONTRACT-0006.md` before any SQL, as for 0003 and 0005.

## 6. Order of work after the questions

1. Merge `main` once Color Belt's 0005 is merged into it (Main session), so 0006 is written against the real 0005.
2. Write `CONTRACT-0006.md` → security review (separate agent) → Jeffrey's OK.
3. Write the SQL + tests → PGlite passes → security review → Jeffrey's OK → Jeffrey pastes it in the Supabase SQL Editor → fingerprints, advisor and tests.
4. Build the screens in the 6 phases (v0.61), one at a time.

## 7. Questions for Jeffrey (one at a time, in this order)

Structure first, then details. Each will be shown with a picture and options.

| # | Question | Why it matters | Left open by |
|---|---|---|---|
| Q-D1 ✓ | **Answered v0.155: separate `star_…` tables (A).** Was: separate Star tables, or share Color Belt's events table? | Decides the whole shape; Color Belt's table is one school per event and already live | v0.60, v0.131, 0005 |
| Q-R1 | **Results worked out every time, or saved?** | v0.139 (results stay open) points to worked out | v0.138, v0.139 |
| Q-D4 | **Family form login:** reuse Color Belt's restricted login, or a second one for Star? | Reusing means editing one Color Belt test; a second login is a setup step for Jeffrey | v0.33, v0.105, 0005 T2a |
| Q-D2 | **Who can see DOB and email:** staff and admins, or admins only? | Decides the detail function's role check | status §4, v0.110, v0.112 |
| Q-D9 | **Mat-side tablet:** the database can't tell the tablet from the desk PC. Separate tablet account, or the tablet only uses Grading? | DOB, email and payments must stay off the tablet (v0.108, v0.110); decides the grants | v0.108, v0.122 |
| Q-D5 | **How long is data kept?** Signatures (Color Belt: 90 days); DOB and email of past candidates (the make-up list and CSV need older events, so this conflicts); old events | Privacy of minors | v0.102, v0.136 |
| Q-D7 | **Make-ups across events:** copy the earlier grades into the new event, or read them from the earlier event? | Rubric copies can differ between events | v0.61, v0.129 |
| Q-D11 | **Changing a candidate's Dan or stars after grading:** clear the grades, keep them, or block the change? | Grades belong to one Dan's subjects | v0.112 |
| Q-D10 | **Two people entering the same grade:** last one wins, or "changed by someone else"? | Paper typed in while a tablet grades | v0.122 |
| Q-D12 | **Overpaid:** how is it cleared (refund recorded as a reversal, or a "settled" mark)? | Needed for the payment rows | v0.151 |
| Q-D13 | **Fee after the testing day and discounts:** what fills in, and does a smaller amount count as Paid? | Needed for "Paid / Not paid" | v0.109, v0.110 |
| Q-D18 | **Private testers' age:** counted on the testing day or the private day? Can the private day be earlier? | Assistant Instructor grade uses age | v0.66, v0.147 |
| Q-D17 | **DOB and email in the change log:** masked like signatures, or kept for History? | Privacy | v0.110, v0.112 |
| Q-D6 | **Result changes after Mark as sent:** back to "Not sent yet"? | Shape of `star_result_emails` | v0.141 |
| Q-D14 | **Dans fixed at 1st–3rd,** or can admins add a 4th Dan later? | Check rule vs a Dan table | status §4 |
| — | Smaller items: CSV log place, duplicate copy kept or deleted, desk entries without DOB, link to future student records | Decided with defaults unless Jeffrey wants a say | various |
