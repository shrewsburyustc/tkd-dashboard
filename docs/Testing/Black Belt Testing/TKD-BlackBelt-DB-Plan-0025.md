# Black Belt testing — database plan for migration 0025 (grading and results)

**What this file is:** the plan for the database part of Black Belt grading and results: the tables, the functions, how the result is worked out, privacy, tests and the order of work. It is a design document, not SQL.
**Why it exists:** Jeffrey approves the database shape question by question **before** any SQL or contract is written (CLAUDE.md "plan before building", "one decision at a time"). The contract `CONTRACT-0025.md` is written from this file once the questions in §10 are answered.
**Status:** DRAFT 2026-10-23, **revised the same day after a security review** (4 must, 7 should, 9 nice findings applied; see §12). No question answered yet, no SQL, no contract. Nothing is applied to Supabase without Jeffrey's OK for that paste. Migration number **0025** is reserved (Main, 3abb8a9).
**Built from:** rulebook v0.938–v0.947 (grading G1–G9 and the approved mockups), v0.210 (roles), v0.904 / v0.906 / v0.907 (payments kept, keeping and deletion), v0.918 / v0.900 detail 4 (testing days), v0.921–v0.936 (rubric editor), Star's v0.111, v0.129, v0.130, v0.139, v0.141, v0.144, v0.163–v0.165, v0.170, v0.173, v0.223, v0.512–v0.514; handoff §6; the approved mockups `TKD-BlackBelt-Grading-Mockups.html` (G proposals 1–36) and `TKD-BlackBelt-Results-Mockups.html` (R proposals 1–49); the live migrations `0016_black_belt.sql` and `0024_black_belt_rubric.sql`, their contracts and tests; Star's `0006_star_testing.sql`, `0023_star_result_texts.sql`, CONTRACT-0006 / 0023; `src/lib/blackBelt/rubric.js` and `rubricDefault.js`.
**Words used:** "0016" / "0024" = Black Belt's live migrations, "0006" / "0023" = Star's. "Copy" = a cycle's own rubric in `bb_cycles.requirements` (schema version 2). "Subject id" = the 8-character id of a subject inside one Dan of the copy (`^[a-z0-9]{8}$`, unique within the Dan). "Kept" = a grade copied into a make-up from the earlier cycle. "Grading rows" = rows in `bb_grades`, `bb_extra_counts` or `bb_makeup_subjects`. A **pure function** gives the same answer for the same inputs and reads no table, so it can be tested on its own. A **guard trigger** is a small database rule that runs before a change and can refuse it.

---

## 1. What this migration must do (in one paragraph)

Store and work out everything the 16 approved screens show: a **grade per candidate per subject** (a letter, or for a measured subject the number and which way it was done), the **extra-points counts**, the **make-up subjects** an admin chooses, **make-up candidates** carried into a later cycle with their **kept grades** copied in, the three **result email texts** admins edit, the **"Mark as sent"** records, and the **CSV download log**. The **Total, the part points, each measured grade, the age group, Late, and the Result are worked out every time, never stored** (v0.938: no hand override; Star v0.158), by **one pure SQL function** that a JS twin copies exactly and a shared fixture checks. Every handoff §6 rule applies: RLS on every new table, policies `to authenticated using ((select public.has_data_access()))`, explicit `revoke … from public, anon, authenticated, service_role`, nothing to `anon` or `bb_registrar`, writes only through `security definer` functions with `set search_path = ''` that check `has_data_access()` first and answer `{status: …}`, every change in `change_log`, **no dynamic SQL anywhere** (no `execute`, no `format()` into SQL). The grading screens never receive a date of birth, email or payment (v0.210, v0.943).

## 2. Facts that shape the plan

1. **The rubric is a JSON document, not tables** (0024). Each Dan has 4 parts (`physical`, `technical`, `curriculum`, `other`, always in that order), each part has subjects with an id, name, credits, `scoring` (`graded` / `measured`), 0–2 `ways` (each with `unit`, `direction` = `at_least` / `at_most` / `under`, age brackets with cut-offs A+ … C), stored `points` per letter, `limited_to` (pass brackets), `outdoor`, `handed_in`. The Dan has `pass` (brackets with `pass_mark`, `no_d`) and `extra_points` (`counts_toward_total`, `limit`, items with `per_count` or `steps`). So grades point at **(cycle, Dan, subject id)**, not at a foreign key. Extra-point items have **no id**, only a name unique in the Dan, so counts point at the item's name.
2. **Subject ids are unique only inside one Dan**, and subject names only inside one part. So every grade row stores the Dan, and make-up matching uses part + name (§3.4).
3. **The copy is locked once registration first opens** (v0.921, 0024's `bb_cycles_rules`), but **not before**: a never-opened cycle (form off, everyone added at the desk) can have its rubric saved while grades exist (0024 OI-9). That is **Q-G1**. A **hand fix** (Jeffrey's SQL Editor) can change a locked copy; grades whose subject id disappeared are ignored by the result and listed by a check query (SETUP 0025f).
4. **Letters and points.** Physical and every measured subject use A+ A B+ B C D; graded Technical, Curriculum and Other subjects use A+ A A- B+ B B- C C- D. A subject's points for a letter are **the stored `points[letter]`** (worked out or own, v0.924), never recomputed from credits at grading time.
5. **Measured grade** (v0.944): the way's age bracket holding the candidate's age, then the highest letter A+ … C whose cut-off is met — `at_least`: number ≥ cut-off; `at_most`: number ≤ cut-off; `under`: number < cut-off (Sprint 100 m, "under 19 sec"); none met → **D**. 0024 guarantees brackets cover every age and cut-offs are strictly ordered, so there is always exactly one answer.
6. **Extra points** (v0.945, G 18–19): per item, `per_count` = count × `points_each`; `steps` = the points of the highest step whose `at_least` ≤ count, else 0; empty = 0. Sum of items, capped at `limit` when set. Added to the Total only when `counts_toward_total`. They never block a result and don't count in "left".
7. **Ages** (v0.926): whole years on the **cycle's first testing day** (`bb_age_on(dob, min(day_date))`, 0016). Confirmed: v0.926 says so in words. A make-up row is aged on **its own (later) cycle's** first day and scored with that cycle's copy (v0.941).
8. **Exact decimals.** Points, cut-offs, grade points and pass marks have at most 2 decimals (`bb_rubric_num_ok`), counts are whole numbers, so every Total is an **exact** sum with at most 2 decimals in `numeric` (305.75, 300.95, 243.6). **The SQL never rounds** (Star rounds to 1 decimal; Black Belt must not). The JS twin rounds every sum with `round2` (0024's rule) only to remove floating-point noise.
9. **DOB and email are removed at the end of the keeping time** (v0.907), but "names, Dan, **results** and payments are kept", and the result needs the age. That is **Q-G2**. **Purge-day masking:** 0016 already treats a candidate as purged **from the purge day on**, even before the purge has run (`bb_purge_is_due`); every new read that touches DOB or email copies that rule (§6).
10. **0016 assumes every candidate has a plan, a waiver row and a unique BB reference**, and its version trigger `bb_before_write('id,cycle_id,source,reference,registered_at', 'date_of_birth,email_for_results,personal_removed_at')` fixes some columns. A make-up row (v0.941, G 27) has "No fee", no new waiver and **keeps its earlier BB reference**, so 0025 changes those rules and the trigger's column lists (§3.4).
11. **What 0016 left for grading:** `bb_cycle_days` ids are stable; `bb_update_cycle` says "the grading migration adds 'a day or part with grades can't be removed'" (v0.900 detail 4); `bb_age_on` exists; 0024 §12 and 0024's problem objects number ways **0 / 1**, so 0025 does too.
12. **Lock order (unchanged, extended):** `bb_settings` → `bb_default_rubric` → cycle → candidate(s) → grade / payment / send row. Every new function states its own order (§7).
13. **Dates:** "today" = `public.testing_today()`; school dates from timestamps via `testing_school_date(…)`; never `::date` on a `timestamptz` (0016's C10 grep covers 0025 too).
14. **Rows that can't be missing:** `bb_cycles.submissions_due` is `not null`; every cycle has 1–20 days (0016's Add / update cycle checks), so an earlier cycle always has a first day. If an age still can't be worked out (no DOB and no kept age), the result is `no_age` (§4), never a guess.

## 3. New tables and changed columns (proposals; key columns only)

Every edited table has the house columns of 0016 §1.8 (`id`, `version`, `created_/updated_at`, `created_/updated_by` never granted, `created_/updated_by_name`), `bb_before_write`, a `change_log` trigger and a `*_no_truncate` trigger.

### 3.1 `bb_grades` — one row per graded subject (G1, G7; Star `star_grades`)

| Column | Rule |
|---|---|
| `candidate_id` | FK → `bb_candidates` `on delete cascade`, behind the delete guard below (and Q-G3) |
| `dan` | 1–4; must equal the candidate's Dan |
| `part_code`, `subject_id` | a subject of that Dan in the cycle's copy (`subject_id ~ '^[a-z0-9]{8}$'`) |
| `letter` | a graded subject's letter, or a **kept** grade's letter |
| `measured`, `way` | a measured subject: `numeric(7,4)` 0–999, **more than 4 decimals refused** (not rounded); `way` **0 or 1** (index in the subject's `ways`, as 0024) |
| `kept`, `kept_from_cycle_id`, `kept_from_cycle_name` | a make-up's copied grade (no FK on the cycle id: the earlier cycle may go, as Star) |

Table rules: exactly one of (`letter`) or (`measured` + `way`); kept rows hold a letter only, never D; `unique (candidate_id, dan, subject_id)`. **No row = not graded** (Clear removes the row, as Star). The version goes up on a change but is **never checked** — last save wins, logged (Star v0.165).
**Guard trigger `bb_grades_rules`** (like Star's `star_grades_rules`, defence behind the functions): `dan` = the candidate's current Dan; the subject exists in that Dan of the copy, with the right scoring; the letter is one of its letters; the way exists; a kept row can never be updated; deletes only from the write functions' Clear (action tag) or a cascade allowed by §3.4 / Q-G3 / Q-G4.

### 3.2 `bb_extra_counts` — one row per entered extra-points count (G8)

`candidate_id`, `dan`, `item_name` (exactly as in the copy), `count` 0–9 999, `kept`, `kept_from_cycle_*`; unique on (candidate, dan, `lower(item_name)`). No row = not entered (counts as 0, G 19). Guard trigger `bb_extra_counts_rules`: Dan matches, the item exists in the copy, kept rows immutable, deletes as §3.1.

### 3.3 `bb_makeup_subjects` — retest subjects (G3; Star `star_makeup_subjects`)

`candidate_id`, `dan`, `subject_id`, `kind` = `chosen` (an admin's choice for a below-the-mark result, G5) or `retest` (on a make-up row, written by Add make-up). Insert and delete only; unique (candidate, dan, subject, kind); guard: the subject exists in that Dan of the copy.

### 3.4 Make-up candidates — new columns and rules on `bb_candidates` (G4; Star's `is_makeup`)

- **New columns:** `makeup_of_candidate_id` (FK → `bb_candidates`, `on delete set null`), `makeup_of_cycle_name`, and (only if Q-G2 = A) `age_kept smallint`.
- **`source` gains `makeup`.** `not null` is dropped from `cycle_plan_id`, and the table checks become:
  - `(source = 'makeup') = (cycle_plan_id is null)` — every form or desk row still has a plan, a make-up row never has one;
  - `source <> 'makeup' or not kukkiwon` — a make-up row never owes a Kukkiwon fee;
  - `(source = 'makeup') = (makeup_of_cycle_name is not null)`; `makeup_of_candidate_id is null or source = 'makeup'`.
- **Never a fee or a refund:** a new guard trigger on `bb_payments` refuses **every** row kind (payment, refund, reversal, returned) for a make-up candidate; `bb_change_plan` (0016 §15i) is replaced to answer `invalid` on a make-up row **before** it touches anything (the table checks are the second wall). `bb_candidate_money` needs no change (no plan → nothing owed).
- **Reference:** a make-up row carries the earlier row's BB reference (G 27). `bb_candidates_reference_key` (unique) is replaced by a **unique index on non-make-up rows**, and `bb_candidates_rules` checks that a make-up's reference equals its earlier row's (at insert).
- **One active make-up per earlier candidate**, anywhere: partial unique index (as Star). A race between two cycles answers `already_added`; so does **Restore** of a withdrawn make-up when another one is active (`bb_restore_candidate` replaced to map it).
- **The version trigger** `bb_candidates_before_write` is dropped and recreated with new lists: fixed = `id, cycle_id, source, reference, registered_at, makeup_of_cycle_name`; no-bump = `date_of_birth, email_for_results, personal_removed_at, makeup_of_candidate_id, age_kept`. `makeup_of_candidate_id` isn't in the fixed list because `on delete set null` must be able to clear it; `bb_candidates_rules` (replaced) allows it to change **only to null**, refuses **any Dan change on a make-up row**, and (Q-G2 A) makes `age_kept` settable once, only by the purge, never changed after.
- **Kept grades** are copied **once**, at Add (Star v0.163): for each subject of the later copy's Dan whose **part and name** match an earlier subject that has a letter, is **not** to be retested and is **not D**, a kept row with the earlier **letter** — for a measured subject, the earlier **worked-out** letter — if that letter is valid for the later subject and the subject applies to the candidate's bracket; every other subject gets a `retest` row (G 26). **Name matching** = `lower(public.testing_normalize_name(name))` on both sides: capitals and extra spaces ignored, as 0016's cycle names and `rubric.js`'s `nameKey` (rubric names are already stored normalized, so this equals Star's rule in practice). Kept extra counts likewise, by item name (G 36).
- **On a make-up row, every applying subject without a kept grade can be graded**, not only the `retest` rows: a DOB fix or rubric differences can make a new subject apply after Add, and the row must never get stuck at Not finished. (The first-day move can't happen once grading started, S2.)

### 3.5 `bb_result_texts` — the three result email texts (G9, R 21–29; a copy of Star 0023)

One row per `kind` = `passed` / `makeup_d` / `makeup_below`; `body` up to 2 000 characters, checked by `bb_result_text_problem(kind, body)` (R 25: unknown blank, blank not for this kind, stray brace, missing `{total}` / `{pass mark}` / `{subjects to work on}`, hidden characters, empty first line). Blanks (R 24): every kind `{first name} {full name} {cycle} {Dan} {total} {pass mark}`; `makeup_d` + `{D subjects} {subjects to work on} {below-pass-mark note}`; `makeup_below` + `{subjects to work on}`. **Versioned:** `version` is the dialog's stale check; every saved text is in `change_log` (who, before → after). Seeded with R03's starting texts (tag `bb_seed`, never overwrites). The subject line is fixed in the app (R 13).

### 3.6 `bb_result_sends` — "Mark as sent" (R 15–20; Star `star_result_emails`)

`candidate_id` (FK, cascade), `marked_at`, `marked_by` (never granted), `marked_by_name`, a snapshot `result_status` (`passed` / `makeup`), `result_total numeric(8,2)`, `result_needs jsonb`, `result_key`, `undone_at / undone_by / undone_by_name`. Guard trigger: after insert only `undone_*` may change, once, from empty; deletes only by cascade. "Changed since sent" (v0.170, R 16) = the newest not-undone row's `result_key` ≠ the current one.

### 3.7 `bb_downloads` — the CSV log (R 45; Star `star_downloads`)

`cycle_id` (no FK), `cycle_name`, `row_count`, `downloaded_at / _by / _by_name`. **Append-only** guard (no update, no delete) and a no-truncate trigger. Written only by the CSV function; **no grant and no policy** (SQL Editor only); not in `change_log` (a download isn't a data change).

### 3.8 Who can read the new tables and columns

RLS on all seven. `bb_result_texts`: select on the house columns minus login ids to `authenticated`, policy `using ((select public.has_data_access()))` (staff see the texts read-only, R 21). `bb_grades`, `bb_extra_counts`, `bb_makeup_subjects`, `bb_result_sends`: the same policy but **no grant** — read only through §5 (a direct query can never join a grade to a DOB). `bb_downloads`: nothing. **New `bb_candidates` columns get no column grant** (the app reads candidates only through functions). Expected advisor change: +1 "RLS enabled, no policy" (`bb_downloads`) and +1 "security definer executable" per new staff function.

## 4. The result, worked out in one place

**`bb_grade_result(dan jsonb, age integer, grades jsonb, counts jsonb, retest text[], chosen text[], today date, submissions_due date)`** — pure (immutable), internal, no table reads. It is the **single source of truth**; `bb_candidate_result(candidate)` only loads the inputs (the copy's Dan, the age per §2.7 / Q-G2, the rows of §3.1–3.3, `testing_today()`, Submissions due) and calls it. For lists, the reads load the cycle's copy **once** and call `bb_grade_result` per row (no per-row document loading). The JS twin `src/lib/blackBelt/grading.js` (new, pure, no React) implements the same steps; `checks.mjs` and PGlite run the same fixture through both (§8).

Steps, in order:

0. **No age** (no DOB, no kept age) → status `no_age`, nothing else worked out.
1. **Pass bracket** = the `pass.brackets` entry holding the age → `pass_mark`. **Age group** (G 2) = the Dan's combined groups (every bracket edge of the pass list, of every way and every `limited_to`; 1st Dan: 8 and under · 9 · 10–12 · 13–17 · 18 and over) → only `{from, to}` leaves the database, never the age.
2. **Which subjects apply:** `limited_to` null, or it lists the pass bracket (G 13: others show "—" and count nowhere).
3. **Each applying subject's letter:** graded → the stored letter; measured → §2.5 from the number and the chosen way's bracket; kept → the kept letter. **Points** = the copy's `points[letter]`. Grade rows of subjects that no longer apply or no longer exist are ignored (kept in the table).
4. **Part points** = sum per part; **extra** = §2.6; **Total** = parts + extra (when counted). **Maximum** = 0024's `bb_rubric_most_points(dan, bracket)` (G 23's "260 of 339").
5. **Late** (v0.939, G 16–17): a `handed_in` subject with no letter while `today > submissions_due`. Never stored, never a D by itself.
6. **Status** (v0.938, G 7, G 15, R 6, R 10):
   - `withdrawn` (the row is withdrawn);
   - **`makeup`, reason `d`** as soon as any applying subject is D **and** `pass.no_d` — even while others are empty (D wins over Late and "left"; whether it may be emailed yet: **Q-G6**);
   - `not_finished` while any applying subject has no letter (with `late`, `missing`, `graded_count`, `subject_count`; "Not started" = nothing graded; extra counts don't count);
   - `passed` when Total ≥ pass mark;
   - otherwise **`makeup`, reason `below`** (with a D too: reasons `d` + `below`).
   With `no_d` false a D simply gives that subject's D points. `complete` (every applying subject has a letter) is returned separately.
7. **Needs** (v0.940): any D → the D subjects only (R 6); below with no D → the `chosen` subjects, or `choice_needed` when none are chosen.
8. **`result_key`** = md5(status | `trim_scale(total)::text` | needs ids in rubric order) — trailing zeros removed, so 263, 263.0 and 263.00 give the same key (tested). It is the "has it changed?" check for Mark as sent and the screens (v0.170 / v0.173: tag, total or subjects).

Output (one object): status, reasons, complete, total, maximum, pass_mark, pass bracket, age group, parts, extra (each item's count, points, kept; extra total), subjects (id, part, letter, measured, way, points, applies, kept, kept_from_cycle_name, retest, chosen, late, gradable), d_subjects, needs, choice_needed, late list, missing, counts, result_key. **Never** a DOB, the age itself, an email or money.

## 5. Functions

House rules of CONTRACT-0016 §1.1: `security definer`, `set search_path = ''`, full names, check order access → role → arguments → lock and look up → stale → rules → write → `{status}`, error mapping as 0016 §1.4, action tags `bb_…`, no argument defaults, no dynamic SQL. Roles per v0.210 / v0.946: **S** = staff (incl. the desk account) and admins; **A** = admins. Every grade write reads the cycle's copy **after** taking the cycle lock, so it can't grade against a copy a rubric save just replaced.

### 5.1 Writes

| Function | Role | What it does / refusals |
|---|---|---|
| `bb_set_grade(candidate, dan, subject_id, letter)` | S | A graded subject; `letter` null = Clear. Refused: withdrawn → `withdrawn`; `dan` ≠ the candidate's → `stale`; not a graded subject of that Dan, a letter not of its part, a subject not for the candidate's bracket → `invalid`; a kept grade → **`kept`**; no age → `invalid`. The same letter again writes nothing. Answers `{status, result}` (§4) |
| `bb_set_measured(candidate, dan, subject_id, value, way)` | S | A measured subject: 0–999, ≤ 4 decimals, way 0 or 1 (0 for one-way subjects); `value` null = Clear. Same refusals. Switching the way keeps the number and re-works the grade (G 5) |
| `bb_set_extra_count(candidate, dan, item_name, count)` | S | Count 0–9 999 or null. Refused: unknown item → `invalid`; kept → `kept`; withdrawn; stale Dan |
| `bb_set_makeup_subjects(candidate, expected_ids, ids)` | A | G5 (Star `star_set_makeup_subjects`): only for a complete result below the mark with no D (else `invalid`); `ids` = 1+ applying subjects; `expected_ids` ≠ stored → `stale`; **refused once an active make-up row was added from this candidate** → `already_added` (the later cycle already copied the choice) |
| `bb_add_makeup(cycle, earlier_candidate)` | S | G6 (Star `star_add_makeup`): this cycle past → `finished`; the earlier cycle's first day isn't before this one's, the earlier row is withdrawn, a duplicate copy, or purged / on its purge day → `invalid`; an active make-up already points at it → `already_added`; its result is no longer `makeup`, or isn't complete (Q-G6) → `stale`; below the mark and nothing chosen → `choice_needed`. Writes the make-up row (§3.4), kept and retest rows, runs the duplicate check. Answers `{status, id, kept_count, retest_count}`. Its toast Undo = 0016's `bb_delete_candidate` (admins, v0.913), which must still work on a make-up row holding only kept rows |
| `bb_mark_result_sent(candidate, expected_result_key)` | S | R 15: refused when withdrawn; the result isn't Passed / Make-up, is `choice_needed`, or (Q-G6 A) isn't complete → `not_finished`; **no email on file or the purge day reached → `no_email`**; the key changed → `stale` |
| `bb_undo_result_sent(send_id)` | S own within 10 s / A any time | R 15, R 18 (Star OPEN-16): already undone → `stale`; staff later → `not_allowed` |
| `bb_set_result_text(kind, expected_version, body)` | A | R 27 (Star `star_set_result_text`): rules → `invalid`, version → `stale`; the same text writes nothing. The toast Undo saves the previous text back. Changing a text never resets "Sent" |

### 5.2 Reads

| Function | Role | Returns |
|---|---|---|
| `bb_grading_grid(cycle, dan)` | S | `today`, the cycle's days with their parts, Submissions due, the Dan's subjects and extra items from the copy (names, credits, part, scoring, unit, direction, ways, `handed_in`, `outdoor`, the cut-offs G 3 words need), and one row per **active** candidate of that Dan: id, names, school, `is_makeup`, `makeup_of_cycle_name`, age group, the §4 result. Own candidates first, then make-ups (G 14). **No DOB, email, reference, plan or money.** The app filters subjects by the chosen day and picks the day to open from `today` (G 28), not the device clock |
| `bb_cycle_results(cycle, dan or null)` | S | The Results tab and the printed sheet (null = every Dan, R 38): counts, pass marks per bracket, rows in roster order with result, sent state (§3.6) and `has_email` (true only when an email is on file **and** the purge day hasn't come). No DOB or money |
| `bb_makeup_list(cycle)` | S | G 25: candidates of earlier cycles (first day before this cycle's) whose result is `makeup`, newest first. It **filters first** (active, not a duplicate copy, not purged / not on the purge day, no active make-up elsewhere) and only then works out results. Each row: names, Dan, school, age group **on this cycle**, needs / `choice_needed`, `already_added`, and the match preview (kept / retest / new subjects, G 26) |
| `bb_result_email(candidate)` | S | R 12: for **one** candidate at the click — the email, the kind, the blank values, `result_key`. Refused: withdrawn → `withdrawn`; not finished, `choice_needed` or (Q-G6 A) incomplete → `not_finished`; no email or purge day reached → `no_email`. Never the DOB |
| `bb_results_csv(cycle)` | A, volatile | R 45–49: writes the `bb_downloads` row **first**, then the 21 columns' raw values for every active candidate in roster order, plus `candidate_id` and `result_status` per row (as Star 0023's M5, so the app matches rows by id). DOB and email are **null from the purge day on** (0016's masking). Any failure undoes the log row too |
| `bb_cycle_grading_state(cycle)` | S | For Edit cycle and the Rubric tab: `has_grading` (any grading row), the parts with grades, the frozen first day, the protected past days — so Save can be grayed with a reason instead of failing |

Internal (no grants): `bb_grade_result`, `bb_candidate_result`, `bb_age_groups(dan)`, `bb_measured_letter(way, age, value)`, `bb_extra_points(extra, counts)`, `bb_sent_state(candidate, result)`, `bb_result_text_problem`, `bb_kept_match(earlier, later_dan)`, `bb_cycle_has_grading(cycle)`.

### 5.3 What 0025 replaces or adds on live 0016 / 0024 objects (for the reviewer)

Each with "create or replace" / "drop … if exists" + create, same arguments, owner and rights; never by editing 0016 / 0024:
- **`bb_candidates`:** new columns, the checks and indexes of §3.4, `bb_candidates_before_write` recreated with the new lists, `bb_candidates_rules` replaced, **`bb_candidates_log` replaced** (masks `age_kept` like DOB / email, if Q-G2 A).
- **`bb_change_plan`** (refuses make-up rows), **`bb_restore_candidate`** (`already_added`), **`bb_update_cycle`** (maps the day guard of S2 to `has_grades`).
- **`bb_cycle_roster`, `bb_candidate_detail`:** add `is_makeup`, `makeup_of_cycle_name` and the retest subject names; a row with **no plan** must still be listed (every plan join checked). `bb_candidate_detail` builds its candidate from `to_jsonb(v_c) - array[…]`, so the subtracted list grows to `created_by, updated_by, withdrawn_by, makeup_of_candidate_id, age_kept` — deliberately: the detail shows the earlier cycle's **name**, never the earlier row's id or a kept age. Additive keys only, so the live app keeps working until the new front end is deployed.
- **New guard triggers:** on `bb_payments` (no row of any kind for a make-up candidate); on `bb_cycle_days` / `bb_cycle_day_parts` (S2).
- **`bb_purge_due_on`** (S20) and, if Q-G2 A, the purge keeps the age first.
- **0024:** `bb_cycles_rules` (Q-G1 A), and `bb_save_cycle_dan` / `bb_undo_cycle_dan` (to answer the new status).
- Depending on answers: `bb_delete_candidate`, `bb_delete_cycle` (Q-G3), `bb_update_candidate` (Q-G4).
- Nothing in Finance, Star, Color Belt or the public form changes. `bb_registrar` gets nothing.

## 6. Privacy

- **Grading screens** (mat side, grading tablet, public arena): `bb_grading_grid` has no DOB, email, reference or money — the protection is in the **read itself**, because the database can't tell a mat tablet from the desk (Star v0.161). The age group is a range; a one-year group ("9") shows an exact age, accepted in G 2.
- **Results:** no DOB or money; `has_email` only. **Email result** reads one email for one candidate at the click (R 12). **Hide payments** (R 36) is a device setting the database can't enforce; the only two reads carrying an email or DOB are exactly the two that switch hides.
- **Purge-day masking everywhere:** `bb_result_email`, `bb_results_csv` and `has_email` use 0016's `bb_purge_is_due(candidate, today)`: from the purge day on, DOB and email count as gone even if the purge hasn't run yet; `bb_mark_result_sent` then refuses `no_email`.
- **CSV:** admins only (v0.144 / R 46), whole cycle, logged in `bb_downloads` before any row is returned; the file is made in the browser (nothing in a web address).
- **Purge (v0.906 / v0.907):** removes DOB, email, signature and signer's name as today; **keeps** grades, counts, make-up subjects, sends and the result. How the result survives without a DOB: Q-G2. A make-up row holds its own copied DOB and email, removed on its own date. Measured numbers aren't personal.
- **`change_log`:** every write logged with its action tag and login (G5: no examiner field). Grade rows hold no personal data, so they are logged in full; `bb_candidates_log` keeps masking DOB / email (and `age_kept`) for every row, make-ups included.

## 7. Concurrency, statuses and undo

- **Locks:** grade / measured / count writes: the cycle **`for share`** → the candidate `for update` → the row. *Why `for share`:* several tablets grade the same cycle at once; `for share` doesn't block other `for share` holders, so they don't queue behind each other on the cycle row, but it **does** conflict with the `for no key update` that a rubric save (0024) and every 0016 candidate / payment write take — so a first grade and a rubric save can never interleave (Q-G1 A), and the function reads the copy only after the lock. These functions never update the cycle row, so no lock upgrade can deadlock. Choose subjects, mark / undo sent: cycle `for no key update` → candidate → send row. Add make-up: this cycle `for no key update`; the earlier candidate and its grades are read **without** locks (Star), the one-active-make-up index closes the race. Set text: the text row only. Reads: none. PGlite runs on one connection, so the lock order is proved by review; the contract adds a two-connection concurrency test if the runner gains a second connection.
- **Stale checks:** grades and counts — none, last save wins (Star v0.165); choose subjects — the expected set; mark sent — the expected `result_key`; texts — `expected_version`; Add make-up — the earlier result must still be a (complete) make-up.
- **New statuses:** `kept`, `already_added`, `choice_needed`, `not_finished` (Mark as sent / Email result on a result that isn't ready), `no_email`, `no_age` (a result status), `has_grades` (Q-G1, Q-G3, Q-G4, the S2 day guard). Everything else from 0016 / 0024.
- **Undo windows:** Mark as sent — own, 10 s on the server for the 5-second toast (R 15); admins any time with the confirm of R 18. Add make-up — admins (v0.913). Result text — the toast re-saves the old text. Grades and counts — no undo (Clear or change the cell; the log has the old value).

## 8. Tests

- **Shared fixture `supabase/tests/0025_grading_cases.json`** (like `0024_rubric_cases.json`): each case `{name, base: "default:<Dan>" + ops, age, grades, counts, retest, chosen, today, submissions_due, expect: {status, reasons, complete, total, parts, extra, needs, late, left, age_group, result_key_input}}`. PGlite runs every case through `bb_grade_result`, `checks.mjs` through `grading.js`; both must equal `expect`. **Required cases:** the 10-candidate cast of the approved mockups (Alex Kim 305.75 Passed, Zoe Martin 263 below 275, Mia Chen D in Free sparring, Lucas Ferreira 275.5 Not finished · TKD project late, Rina Patel D in 1/2 or 1 mile + below 293, Ava Brooks 300.95, Sam Lee, Noah Silva, Bao Nguyen, Leo Garcia 557.5) on the real default rubric; each direction exactly on a cut-off (Hold `at_least` 31 → A+; the 13-and-over mile `at_most` 8.5 → A; Sprint 100 m `under` 19 for 9–12 → B, not B+); m:ss values (8:30 = 8.5 exactly; 8:13 = 8.2167 against a made-up cut-off of 8.22); 5 decimals refused; both ways of Pull-up or hold; One Step Sparring for 13–17 vs 18+; every 1st Dan age group edge (8/9/10/12/13/17/18); no age; `no_d` false; an extra `limit`; `counts_toward_total` false; steps below the first step; D while incomplete; Late vs D vs "left"; a make-up with kept + retest grades and kept extra points (Mia 333.5 Passed on Fall 2027); a make-up whose applying subjects change after Add (a DOB fix moves it into 18 and over: One Step Sparring becomes gradable); `result_key` equal for 263 / 263.00; decimal sums that floats get wrong (7 × 2.15, 3 × 3.35).
- **`supabase/tests/0025_tests.sql`** (0016's shape: one transaction, the 0016 session set A1–A8 / D1–D3 / anon, `zz test` cycles, final `rollback`, last row `ALL 0025 TESTS PASSED`):
  - access: no read or write through a locked, stale or signed-out session; staff refused every A function; `anon` and `bb_registrar` refused every new table and function; **column privileges**: no role can select the new `bb_candidates` columns;
  - **key allow-lists** for `bb_grading_grid`, `bb_cycle_results`, `bb_makeup_list`, `bb_result_email`, `bb_cycle_grading_state` and the new roster / detail keys (no `date_of_birth`, `email_for_results`, `money`, `reference` where not allowed; no `makeup_of_candidate_id` or `age_kept` anywhere);
  - every refusal of §5.1; kept / stale Dan / not-for-age; the guard triggers refuse direct writes that skip the functions (wrong Dan, unknown subject or item, bad letter, a kept row changed, a delete without a tag, a send row changed twice, a download row changed);
  - make-ups: already added — also from a second cycle and through **Restore**; choice needed; stale; purged earlier row; shared reference; no plan; **payment, refund, reversal and returned refused**; **`bb_change_plan` refused**; Dan change refused; Kukkiwon impossible; roster and detail still list it; a D never kept; a measured kept letter = the earlier worked-out one; renamed subject → retest; the same name in another part not matched; Choose subjects refused once a make-up was added;
  - rubric lock by any grading row (Q-G1 A); the day / first-day guard (S2) and `bb_update_cycle` answering `has_grades`;
  - sent: stale key, `no_email` (also on the purge day before the purge ran), own undo inside / outside 10 s, admin later, "changed since sent"; Q-G6's rule;
  - texts: each rule, stale version, staff refused, re-seed doesn't overwrite; CSV: log row first, a refused call writes nothing, staff refused, `candidate_id` / `result_status` present, DOB and email null from the purge day;
  - purge: grades and result kept, DOB gone, `age_kept` set once and immutable (Q-G2 A); every write has a `change_log` row with its tag; no `change_log` row contains a DOB, email or `age_kept` value;
  - the family form's register call (0016) still finishes inside its 5-second limit with the new triggers and the larger duplicate check.
- **`0025_fingerprints.sql`**: read-only, connector-safe (the refused words spelled in pieces, as 0005), with the exact expected changes to `0016_fingerprints.sql` and `0024_fingerprints.sql` listed in the contract (the replaced functions, triggers and `bb_candidates` rules, nothing else).
- **PGlite `step0025`** (main database, after `step0024`): fingerprints of every earlier migration; apply 0025; every earlier fingerprint file identical except the listed rows; `0025_tests.sql`, then **every earlier test file** (0016's and 0024's made version-aware where a replaced function answers new keys, each change reviewed, as 0024 OI-5); re-apply 0025 (no second seed, nothing logged); every fixture case; the undo script of §9; **speed with seeded volume** (PGlite sorts text differently and misses slowness on small data): **six years of cycles** (12 cycles × 60 candidates, a third of them make-ups) — `bb_grading_grid` and `bb_cycle_results` each under 200 ms, `bb_makeup_list` under 300 ms, one `bb_set_grade` under 50 ms. Also **`step0025_production_order`**: every live migration in production order, then 0025, same fingerprints.

## 9. Order of work, production and SETUP

1. This plan → Jeffrey's answers to §10, one at a time, each into the rulebook (Black Belt block, next free **0.948**) → this file updated.
2. `CONTRACT-0025.md` (tables, grants, statuses, every function's checks and lock order, the exact fingerprint differences) → security review → Jeffrey's OK.
3. SQL + tests + fixture + `grading.js` → PGlite passes → security review of the SQL → Jeffrey's OK for the paste. Then the front end (Grading, Results, Rubric and prices block, Candidates make-up menu) in the preview, design review at 1280 / 820 touch / 390 touch / 320, checkpoint with Jeffrey.

**`supabase/SETUP.md` — `## Migration 0025: Black Belt grading and results (rulebook v0.938–v0.947)`:**
- `### 0025a. Before you apply` (Claude, read-only): no `bb_grades` yet; 0016 and 0024 fingerprints equal the live baseline; counts of cycles and candidates; security-advisor and whole-database snapshot baselines.
- `### 0025b. Apply 0025` (Jeffrey, SQL Editor; the destructive-operations warning is expected: "on delete", "drop … if exists", `alter column … drop not null`).
- `### 0025c. Read-only checks` (Claude): `0025_fingerprints.sql` = PGlite; every earlier file identical except the listed rows; advisor +N security definer and +1 RLS no policy (`bb_downloads`), nothing else; the three seeded texts.
- `### 0025d. Run the tests` (Jeffrey): `0025_tests.sql`, then `0024_tests.sql` and `0016_tests.sql` again; UIDs back to placeholders.
- `### 0025e. What the app needs`: deploy the new front end (Jeffrey's OK for the push). The answers are additive, so the live app keeps working in between.
- `### 0025f. Hand-fix check`: a read-only query listing grade rows whose subject id or item isn't in the cycle's copy (run after any hand fix of a locked rubric).
- `### 0025g. Undo 0025` (only with Jeffrey's OK): `supabase/manual/0025u_undo.sql` **refuses unless no grading row, make-up candidate, send, download row, changed text or `age_kept` value exists**; it drops the new functions, triggers and tables, and puts back **exactly**: the `bb_candidates_before_write` trigger arguments, `not null` on `cycle_plan_id`, `bb_candidates_reference_key`, the `source` check, `bb_candidates_rules`, `bb_candidates_log`, `bb_purge_due_on`, and every replaced 0016 / 0024 function — from copies kept in the script, **not** by re-running 0016 or 0024 (0024 warns that re-running 0016 undoes 0024). PGlite proves the fingerprints return to step 0025a.

## 10. Questions for Jeffrey (one at a time, in this order)

Only choices the rulebook and the approved mockups don't settle. Each will be shown with a picture, options side by side.

### Q-G1 · Grading on a cycle whose rubric isn't locked yet

- **The question:** a cycle's rubric locks when registration **first opens** (v0.921). If a cycle is never opened (the form is still off and everyone is added at the desk), admins can still change its rubric **after grading starts**. What should happen?
- **Why it matters:** removing a subject or changing its points after grading silently changes Totals and Results, or leaves grades pointing at a subject that no longer exists.
- **Options:**
  - **A · The first grading row locks the rubric too (recommended).** Once the cycle has any grade, measured number, extra count or chosen make-up subject, Save and Undo on its Rubric tab are refused ("Grading has started, so this rubric is locked"), exactly like after the first opening. Enforced in the table rule `bb_cycles_rules` (not only in the functions), and the grade functions read the rubric only after taking the cycle lock, so a save and a first grade can't slip past each other. *Pro:* one rule: what was graded is what is scored; no extra step for staff. *Con:* replaces three small 0024 pieces (`bb_cycles_rules`, `bb_save_cycle_dan`, `bb_undo_cycle_dan`) and adds a line to the Rubric tab; a mistake found after the first grade goes into the default for next season (or a hand fix), as after opening.
  - **B · No grading until the rubric is locked.** The Grading tab is closed with "An admin opens registration first". *Pro:* no 0024 change. *Con:* to grade a desk-only cycle an admin must open the public form (then close it), publishing the link for a moment.
  - **C · Allow both.** Rubric changes re-work every result; grades of removed subjects are ignored. *Pro:* nothing to build. *Con:* results can change without anyone grading anything; an emailed result would flip back to "Not sent yet".
- **Recommendation:** A.
- **Touches:** v0.921, v0.938, 0024 OI-9.

### Q-G2 · How a result survives when the date of birth is removed

- **The question:** v0.907 removes the DOB at the end of the keeping time but keeps "names, Dan, results and payments". The result needs the age (pass mark 275 or 293, the measured cut-offs, One Step Sparring for adults). How does an old cycle's Results tab still show the right result years later?
- **Options:**
  - **A · The purge keeps the age on the first testing day (recommended), with four safeguards.** Just before the DOB is removed, the database saves one whole number ("13") in `age_kept`, used from then on. Safeguards: (1) it doesn't bump the row's version (no open dialog goes stale); (2) it can be set once, only by the purge, and never changed; (3) no role is ever granted to read it, and no read returns it (only the age group); (4) it is masked in the change log like the DOB. *Pro:* every result, Total and age group stays exactly as it was; the date of birth itself is gone. *Con:* the age plus the cycle's date still points to the birth year (not the day); one more personal-ish number kept for good; replaces `bb_candidates_log` and the purge.
  - **B · The purge keeps only the brackets.** The pass-mark bracket and the age group ("13–17"), not the age. *Pro:* less exact. *Con:* measured grades need each way's bracket too, so several brackets per candidate; more complex; same result in practice.
  - **C · Freeze the result.** The purge saves a snapshot (status, Total, needs) and stops working it out. *Pro:* nothing about the age is kept. *Con:* two ways of showing a result; a frozen copy can't follow a later correction.
- **Recommendation:** A.
- **Touches:** v0.907, v0.926, v0.938.

### Q-G3 · Deleting a candidate or a cycle that has grades

- **The question:** today Delete permanently (one candidate) and Delete cycle are refused only when payment records or online-signed waivers exist (v0.904, S15). Should grades also block them?
- **Options:**
  - **A · Grades block deletion; withdraw instead (recommended).** Both are refused once there is any grade, extra count or chosen subject: "has grades, so they can't be deleted. Withdraw them instead." Kept grades on a just-added make-up don't count, so its Undo still works. Behind the functions' check, the guard triggers on the grading tables refuse any cascade delete except a make-up row holding only kept rows (and Q-G4's Dan clearing), so nothing in the database can remove real grades by mistake. *Pro:* results are kept as v0.907 says; the same rule as payments (v0.904). *Con:* a test row graded by mistake stays as withdrawn; replaces the two 0016 delete functions (for the new status).
  - **B · Grades go with the row (Star's way).** Delete permanently removes the grades too, after the existing warning. *Pro:* matches Star; no 0016 change. *Con:* real results can vanish (still in the change log).
- **Recommendation:** A.
- **Touches:** v0.904, v0.907, v0.913, S15.

### Q-G4 · Changing a candidate's Dan after grading

- **The question:** grades belong to one Dan's subjects. If Edit details changes the Dan after grades exist, what happens to them? (**Make-up rows can never change Dan** in any option: their kept grades and retests are for one Dan; a wrong Dan there means Undo the make-up and fix the earlier row.)
- **Options:**
  - **A · Star's way: confirm and clear (recommended).** "Change Alex Kim to 2nd Dan? The 9 grades entered for 1st Dan subjects will be cleared." Grades, counts and chosen subjects of the old Dan are removed (the guard allows exactly this action), logged, and can be typed again (Star v0.164 / v0.173). *Pro:* the rule staff already know; nothing hidden. *Con:* replaces 0016's `bb_update_candidate` and adds one small confirm dialog (a mockup first).
  - **B · Refused while grades exist.** *Pro:* nothing to draw. *Con:* fixing a wrong Dan after one grade needs the grades cleared by hand first.
  - **C · Kept but hidden.** Grades stay with their Dan; changing back shows them again. *Pro:* no 0016 change. *Con:* Star rejected it (hidden data).
- **Note (all options):** a **DOB fix** in Edit details doesn't clear anything, but it can change the age group, the pass mark and which subjects apply; the result is worked out again at once (grades of subjects that no longer apply are kept, just not counted).
- **Recommendation:** A.
- **Touches:** Star v0.164, v0.173; v0.210.

### Q-G5 · Does anyone owe a Black Belt make-up from Fall 2026?

- **The question:** Fall 2026 ran on the old Google Sheet, so its results aren't in the dashboard, and Star decided make-ups only come from testings in the dashboard (v0.223). If a Fall 2026 candidate owes a make-up, "Make-up from an earlier cycle…" on Spring 2027 can't find them.
- **First step:** Jeffrey checks the Sheet (BELOW PASSING / D rows of Fall 2026). If nobody owes one, the answer is A and nothing is built.
- **Options:**
  - **A · Nobody owes one (as Star).** Nothing built.
  - **B · Load the owing candidates once (recommended if anyone owes).** One SQL paste (Jeffrey's OK, as a hand fix, logged as "Database admin") that meets every 0016 / 0024 table rule: a past cycle "Fall 2026" with its real dates (Application and Submissions due, at least one testing day per part so no part is on no day), closed, `first_opened_at` set (locked rubric), two new link codes, its rubric copy = the default (the Fall 2026 numbers), one plan with valid prices ($1–$5,000) and Kukkiwon fees; each owing candidate with names, DOB, email, school, Dan, that plan, a `BB-` reference from the counter and a **paper waiver row** (every candidate needs one); their grades and any chosen subjects as normal grading rows. Then the normal picker works, with kept grades. Checked row by row with Jeffrey, like CP1. *Pro:* no new screen; the normal make-up flow. *Con:* a hand-made cycle in the Cycles list; with no payments recorded its candidates show **Not paid** on that past cycle (entering old payments would put them in Finance's Daily report, so we leave the tag and say so); their deletion dates count from Fall 2026's last day.
  - **C · Add them as New candidates.** *Pro:* nothing to build. *Con:* charges a fee and grades every subject again (Star rejected it).
- **Recommendation:** check the Sheet; A if nobody, else B.
- **Touches:** v0.941, Star v0.223, plan item 18.

### Q-G6 · When a "Make-up · D" result can be emailed

- **The question:** a D shows **Make-up · D in [subject]** at once, even while other subjects are still empty (approved, G 15 / v0.938). Can staff email that result and mark it sent before the rest is graded?
- **Why it matters:** the email carries `{total}`, which is then a partial total ("so far"), and the result's key changes with every grade that arrives, so a sent email keeps flipping back to "Not sent yet".
- **Options:**
  - **A · Email result and Mark as sent wait until every applying subject is graded (recommended).** The row still shows Make-up · D at once; the Email result button appears when the result is complete (gray hint "Email when all subjects are graded"). Enforced in the database (`not_finished`); Add make-up on a later cycle waits too. *Pro:* every email has the final Total and the final list to work on; "Sent" stays true. *Con:* a family waits for the last testing day to hear about an early D; one hint line not in the approved drawings (shown to Jeffrey first).
  - **B · Allowed as soon as the result shows Make-up · D.** *Pro:* families hear early; matches what the row shows. *Con:* a partial Total in the email; the row returns to "Not sent yet" after each later grade; a second email is likely.
- **Recommendation:** A.
- **Touches:** v0.938, v0.170, G 15, R 8, R 16.

## 11. Smaller defaults to OK together

| # | Item | Proposed default | Why |
|---|---|---|---|
| S1 | How grades find their subject | (cycle, Dan, subject id) of the cycle's own copy; the way as 0 or 1 (0024's numbering); extra items by their exact name | 0024 §12; items have no id |
| S2 | v0.900 detail 4, and the first testing day | Grades belong to a **part**, not a day (a part on two days shows the same cells on both, v0.918 detail 2). A testing day **on or before today** whose parts have grades can't be deleted, moved or have that part unticked. **Once the cycle has any grading row, the first testing day is frozen**: it can't move, be deleted, and no earlier day can be added (ages are counted on it). Guard triggers on days / day parts; `bb_update_cycle` answers `has_grades` | Nothing graded is lost; ages can't shift under existing grades |
| S3 | Two devices on the same cell | Last save wins, logged (Star v0.165), numbers and counts too | House rule for grades |
| S4 | Measured numbers | 0–999, stored in the way's own unit, up to 4 decimals, more refused (not rounded); the app turns m:ss into minutes (8:40 → 8.6667) and back, and limits each unit's format (G 4); compared exactly | 4 decimals can never cross a 2-decimal cut-off |
| S5 | Rounding | None in SQL (exact sums, ≤ 2 decimals); JS `round2` on every sum; the screens drop trailing zeros; `result_key` uses `trim_scale` | Fact 8 |
| S6 | Result order | §4 step 6: D (when `no_d`) wins even while incomplete; "below" only once complete; D + below retests the D only | v0.938, G 15, R 6 |
| S7 | Late | `testing_today()` > Submissions due, `handed_in` subjects only, never stored; make-ups use the later cycle's date | v0.939, G 16–17 |
| S8 | Age | Whole years on the cycle's first testing day; make-up rows on the later cycle's; no age → `no_age` | v0.926, v0.941 |
| S9 | Age group label | The Dan's combined groups, worked out by the database; only `{from, to}` leaves it | G 2 (one-year groups accepted) |
| S10 | Kept grades | The **letter** is copied once (for a measured subject the earlier worked-out letter; G06b shows "A kept"); **a D is never kept** (it becomes a retest); matched by part + `lower(testing_normalize_name(name))`; the letter must be valid for the later subject and the subject must apply, else retest; a later correction on the earlier cycle doesn't follow | Star v0.163, v0.173; G 26 |
| S11 | Kept extra points | Counts copied by item name and worked out with the later cycle's rules; not editable there; items the later rubric doesn't have are dropped (named in the picker) | G 36; Star copies class counts |
| S12 | Make-up rows | §3.4: no plan, no Kukkiwon, no money row of any kind, no new waiver, the earlier BB reference, names / DOB / email / school / Dan copied, Dan fixed, in the duplicate check, one active make-up per earlier candidate; every applying subject without a kept grade is gradable | v0.940, v0.941, G 27 |
| S13 | Who can be picked | Active, non-duplicate candidates of cycles whose first day is before this cycle's, complete Make-up result, not already in an active make-up, not purged or on the purge day | Star `star_makeup_list`, G 25, Q-G6 |
| S14 | Withdrawn candidates | Grades kept; result `withdrawn`; left out of the grid, Results, CSV and the picker; Restore brings everything back (or `already_added`) | R 49, Star |
| S15 | Result texts | Star 0023's table and checks with R 24's blanks, seeded with R03's texts, staff read-only | R 21–28 |
| S16 | Mark as sent | Star's snapshot rows; "changed" = status, Total or needs; a text change never resets Sent; every send kept (newest shown, R 20); refused without an email | v0.170, R 15–20 |
| S17 | Email result | One-candidate read with the email and blank values, staff, not logged (like candidate detail); refuses withdrawn, unfinished, `choice_needed`, no email | R 12, R 33 |
| S18 | CSV | Admins, whole cycle, active rows, roster order, raw values + `candidate_id` / `result_status`, DOB / email masked from the purge day, logged first in append-only `bb_downloads` | R 45–49, Star v0.144, 0023 M5 |
| S19 | Purge | Grades, counts, make-up subjects and sends are kept; Q-G2 decides the age | v0.907 |
| S20 | Earlier waiver of a make-up | A candidate's deletion date becomes the latest of its own and that of **every** make-up row descended from it, following chains (Spring → Fall → next Spring) to the end, so the waiver that covered a make-up is kept as long as the make-up's | Conservative for the insurer |
| S21 | Grading before the first day, and after the last | Allowed (hand-in work arrives early; results never lock, v0.139) | v0.939, v0.139 |
| S22 | Reads and refresh | One grid read per (cycle, Dan), the app filters by day; Results per Dan or all; the copy read once per call; 15-s refresh by the app; no purge inside these reads (speed) | Star v0.507 |
| S23 | Change log | Every write tagged `bb_…`; grade rows not filed under a school (as Star); downloads outside the log | Rule 5, G5 |
| S24 | Grants | §3.8: texts readable by staff; the rest through functions only; `bb_downloads` SQL Editor only; no grant on the new `bb_candidates` columns; nothing for `anon` / `bb_registrar` | Handoff §6 |

Left for the contract (technical, no decision needed): exact argument lists and answer keys, the allow-lists of keys per read, the fingerprint differences, the action tag list, the `bb_kept_match` details, and whether `bb_set_grade` / `bb_set_measured` become one function.

## 12. Security review of this plan (2026-10-23) — what changed

All findings applied. **Must:** make-up rows can't carry any fee or refund (table checks + `bb_change_plan` + the payments guard, §3.4); `bb_candidates_before_write` recreated with new fixed / no-bump lists, `age_kept` conditions, the deliberate `bb_candidate_detail` key list (§3.4, §5.3); every applying subject without a kept grade gradable on a make-up row, Dan changes refused on make-up rows (§3.4); purge-day masking in the email read, the CSV and `has_email`, `no_email` refusal (§6). **Should:** Q-G1 A counts every grading row in `bb_cycles_rules`; `result_key` with `trim_scale`; the first testing day frozen once grading starts (S2); guard triggers on grades, counts and sends; CSV `candidate_id` / `result_status`, append-only downloads; `bb_restore_candidate` and `bb_update_cycle` replaced for their statuses; speed (copy read once, filtered make-up list, six-year seed) and the `for share` lock choice (§7); the full undo list (§9); the extra tests (§8). **Nice:** measured kept letter = the earlier worked-out one; D never kept; name matching = `lower(testing_normalize_name())`; S20 follows chains; Choose subjects refused after a make-up was added; Email result refusals; ways numbered 0 / 1 as 0024; 5-decimal numbers refused; no age / Submissions due / days defined (fact 14); no dynamic SQL. **New question Q-G6.** Not taken: nothing.
