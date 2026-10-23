# Contract 0025 — Black Belt grading and results (migration `0025_black_belt_grading.sql`)

**What this file is:** the exact, reviewable build specification for Black Belt grading and results: the database (tables, rules, functions, the result calculation, privacy, purge, make-ups, result emails, sends, CSV), its tests, the data layer, the screens, and the order of work with Jeffrey's checkpoints. It is not the SQL itself.
**Why it exists:** three kinds of builders (SQL, data layer, screens) work from one text so that the database, its JS twin, the preview store and the screens agree exactly, and so a security reviewer can check every rule before any SQL is written (CLAUDE.md "plan before building"; handoff §6).

**Status: DRAFT for review (2026-10-23).** Not approved. Nothing is built from it until Jeffrey OKs it (0025 CP0, §15) after a security review of this contract. Build and test locally only; nothing is applied to Supabase and nothing is pushed without Jeffrey's OK for that specific step. **Migration number 0025 is reserved** (Main session, 3abb8a9).

The single source of truth for: **A — database** (the migration, its tests, fingerprints, the shared fixture, the PGlite steps, the SETUP section, the undo script, the run sheet), **B — data layer** (`grading.js`, `resultEmail.js`, `gradingApi.js`, the preview store, `checks.mjs`, the page address), **C1 — Grading screens**, **C2 — Results screens and the result email texts**, **C3 — Candidates and cycle changes** (make-ups, the Dan-change dialog, the "has grades" refusals). If something here is impossible or contradicts the sources below, **stop and report it** — do not improvise. Undecided technical points are in §16 with a working default; builders use the default.

| Source (in this order of authority) | |
|---|---|
| This contract | wins for 0025 |
| DB plan `docs/Testing/Black Belt Testing/TKD-BlackBelt-DB-Plan-0025.md`: §1–§9, §10b (Jeffrey's answers), §11 (S1–S24, all OK'd), §12 (security review changes) | the shape |
| Rulebook `docs/Dashboard Docs/TKD-Dashboard-Design-Guidelines.md`: **v0.938–v0.946** (G1–G9), **v0.947** (mockups approved + make-ups grouped under an amber band), **v0.948–v0.953** (Q-G1…Q-G6), **v0.954** (S1–S24, S13 widened), **v0.955** (Dan-change dialog); v0.210 (roles), v0.904 / v0.906 / v0.907 (payments kept, keeping and deletion), v0.913 (Undo after Add is admin-only), v0.918 (days), v0.921–v0.936 (rubric), v0.937 (C2 addresses); Star v0.111, v0.129, v0.130, v0.139, v0.141, v0.144, v0.158, v0.163–v0.165, v0.170, v0.173, v0.223, v0.512–v0.514. The newest row wins | decisions |
| Mockups `docs/Testing/Black Belt Testing/TKD-BlackBelt-Grading-Mockups.html` (G01–G08, proposals **G 1–36**), `TKD-BlackBelt-Results-Mockups.html` (R01–R06, proposals **R 1–49**), `TKD-BlackBelt-DanChange-Mockup.html` (proposals **DC 1–5**), all approved | wording and layout |
| Live code: `supabase/migrations/0016_black_belt.sql`, `0024_black_belt_rubric.sql` (**live in production — never edit**), `CONTRACT-0016*.md`, `CONTRACT-0024.md`; Star's `0006_star_testing.sql`, `0023_star_result_texts.sql`, `CONTRACT-0006.md`, `CONTRACT-0023.md` | patterns copied |
| Handoff `docs/Dashboard Docs/TKD-Dashboard-Handoff.md` §6 and `CLAUDE.md` "Database rules" | non-negotiable |

**Working copy:** the Black Belt worktree, branch `black-belt`. Before writing SQL: `git merge main`. No Supabase connector calls, no Cloudflare, no remotes, no other worktree. Builders don't commit; the orchestrator commits after reviews.
**Audience:** Jeffrey is learning IT — every new file starts with a header comment (what + why); short plain-English comments on non-obvious lines; readable over clever. **CRLF line endings** like the neighbouring files.

**Words used (one line each; the rest as CONTRACT-0024):**
- *Copy*: a cycle's own rubric, `bb_cycles.requirements` (schema version 2). *Dan object*: one entry of `copy.dans`.
- *Subject id*: the 8-character id of a subject inside one Dan (`^[a-z0-9]{8}$`, unique in that Dan only).
- *Grading rows*: rows in `bb_grades`, `bb_extra_counts` or `bb_makeup_subjects` (any kind, kept ones included).
- *Real grades*: grading rows that are **not** kept and **not** `retest` (a typed grade / number / count, or a chosen make-up subject) — what Q-G3 protects.
- *Kept*: a grade or count copied into a make-up row from the earlier cycle; never editable there.
- *Make-up row*: a `bb_candidates` row with `source = 'makeup'` (G4, v0.941).
- *Pure function*: same answer for the same inputs, reads no table (`immutable`), so it is tested on its own and has a JS twin.
- *Guard trigger*: a database rule that runs before a write and can refuse it (errcode `23514`, a named constraint).
- *Hand fix*: Jeffrey's own SQL Editor session — `session_user = 'postgres'` and no action tag (0024 §5).
- *Cascade*: a delete started by a parent row's `on delete cascade`; inside it `pg_trigger_depth() > 1`.

---

## 0. Scope

- **In:** grades per candidate per subject (letters, measured numbers and their way), extra-points counts, chosen make-up subjects, make-up candidates with kept grades and retest rows, the result worked out by one pure SQL function and its JS twin, the Q-G1 lock, the S2 day guard, the Q-G2 kept age, the Q-G3 delete guards, the Q-G4 Dan-change clear, the result email texts, Mark as sent, the admin CSV with its download log; the Grading tab, Results tab, Result emails block, Choose subjects, Make-up from an earlier cycle, the Dan-change dialog.
- **Out:** a "Not finished" email (R 23: no), Fall 2026 make-ups (Q-G5 = C: they register as normal Spring 2027 candidates; nothing is built), an examiner field (G5), any hand override of a result (G1), anything in Finance, Star, Color Belt, the public form or `bb_registrar`'s rights.
- **One transaction, re-run safe** (`create table if not exists`, `create or replace`, `drop … if exists` + create for triggers and constraints, `add column if not exists`, seeds `on conflict do nothing`). **No dynamic SQL anywhere** (no `execute`, no `format()` building SQL; U11 checks the sources).
- **Header warnings** (like 0024's): re-running `0016_black_belt.sql` or `0024_black_belt_rubric.sql` after 0025 silently puts back their versions of the objects listed in §6 (and would fail on make-up rows, which break 0016's table checks); after 0025 they are only re-run as part of SETUP §0025g. `0025_fingerprints.sql` detects it (§12.3, the `check | rerun` row). "Supabase will warn about destructive operations — the words *delete* and *drop* appear in rules, `on delete`, `drop … if exists` and `alter column … drop not null`; nothing is removed now."
- **File layout:** 1 pure result helpers (§4) · 2 tables + columns (§2, §3) · 3 indexes · 4 trigger functions and triggers (§5) · 5 replaced 0016 / 0024 trigger functions and the `bb_candidates_before_write` trigger (§6) · 6 internal readers (§7.0) · 7 staff write functions (§7.1) · 8 staff read functions (§7.2) · 9 replaced 0016 / 0024 functions (§6) · 10 RLS, revokes, grants (§8) · 11 the seed of the result texts (§2.4).
- **Size:** 6 new tables, 3 new `bb_candidates` columns, 9 new staff writes + 6 staff reads (incl. `bb_update_candidate_clear`, §6.6), 15 replaced 0016 / 0024 functions and trigger functions, the internal helpers of §17.

---

## 1. General rules

### 1.1 House rules (CONTRACT-0016 §1.1–§1.8 and 0024 §1.1, unchanged)
Owner `postgres`; `set search_path = ''`; fully qualified names; `revoke … from public, anon, authenticated, service_role` then only §8's grants; **nothing to `anon`, `service_role` or `bb_registrar`**; staff functions `language plpgsql security definer returns jsonb`, no argument defaults. **Check order:** 1 `has_data_access()` not true → `no_access` · 2 role (A functions: `is_admin()` not true → `not_allowed`) · 3 argument shape → `invalid` · 4 look up + lock (§1.3) → `not_found` · 5 expected state (`stale`, `locked`) · 6 data rules · 7 tag, write, untag → `ok`. Tags via `set_config('tkd.action', '<tag>', true)` + a fresh `tkd.batch_id`, reset to `''` after. Whole body inside `begin … exception … end` with 0016 §1.4's mapping **plus 0024's** `numeric_value_out_of_range` (22003) and `invalid_text_representation` (22P02) → `invalid`. Reads are `stable` unless they write (`bb_results_csv` is `volatile`). Dates: `public.testing_today()`; never `::date` on a `timestamptz`; no `clock_timestamp()`.

### 1.2 Statuses new in 0025
| Status | Meaning | Extra keys |
|---|---|---|
| `kept` | a write to a kept grade or count of a make-up row | — |
| `already_added` | an active make-up already points at that earlier candidate (Add make-up, Restore, Choose subjects after a make-up was added, OI-4's Dan change) | — |
| `choice_needed` | Add make-up of a below-the-mark result with no subjects chosen yet | — |
| `not_finished` | Mark as sent / Email result on a result that isn't Passed or Make-up, or is `choice_needed` | — |
| `no_email` | no email on file, or the purge day has come (§9) | — |
| `has_grades` | Q-G1 (rubric save / undo after grading started), Q-G3 (delete), Q-G4 (Dan change, with counts), S2 (Edit cycle day rules) | Q-G4 only: `grade_count`, `count_count`, `chosen_count` |

`no_age` is a **result** status (§4), never a function status. Every other answer is exactly `{status}` plus the keys listed per function.

### 1.3 Lock order (extends 0016 §1.5 and 0024 §1.3)
**`bb_settings` → `bb_default_rubric` → cycle → candidate(s) → grading row / payment / send row → result text row.**
| Function | Locks |
|---|---|
| `bb_set_grade`, `bb_set_measured`, `bb_set_extra_count` | the candidate's cycle **`for share`** → the candidate `for update` → the grading row `for update` (helper `bb_lock_candidate_shared`, §7.0). *Why:* `for share` doesn't block other graders' `for share` on the same cycle, but conflicts with the `for no key update` of a rubric save and of every 0016 candidate / payment write, so a first grade and a rubric save never interleave (Q-G1). These functions never update the cycle row, so no lock upgrade can deadlock. The copy is read **after** the lock |
| `bb_set_makeup_subjects`, `bb_mark_result_sent`, `bb_update_candidate`, `bb_update_candidate_clear` | cycle `for no key update` → candidate `for update` (0016's `bb_lock_candidate`) |
| `bb_undo_result_sent` | find the send → `bb_lock_candidate` → the send row `for update` |
| `bb_add_makeup` | **this** cycle `for no key update` → the earlier candidate **`for share`** (OI-3; the earlier row is never written) |
| `bb_set_result_text` | the text row `for update` only |
| `bb_save_cycle_dan`, `bb_undo_cycle_dan`, `bb_update_cycle`, `bb_delete_*`, `bb_change_plan`, `bb_restore_candidate` | as 0016 / 0024 (unchanged) |
| reads | none |
Every function's header comment states its order (`-- locks: …`). PGlite runs on one connection, so the order is proved by review (security review checks it line by line); a two-connection test is added if the runner ever gets a second connection.

### 1.4 Numbers (S4, S5, fact 8)
Points, cut-offs, grade points, pass marks and extra points have ≤ 2 decimals (0024's validator); counts are whole numbers; **every sum is exact in `numeric` and the SQL never rounds**. Measured values: `numeric`, 0–999, ≤ 4 decimals — `p_value = round(p_value, 4)` must hold, **more decimals are refused (`invalid`), never rounded**; `'NaN'` is refused (`between 0 and 999` is false for it). Stored as `numeric(7,4)` after the check. `trim_scale()` removes trailing zeros wherever a number becomes text (the result key). The JS twin rounds every sum with 0024's `round2` only to remove float noise; m:ss → minutes is converted in whole seconds (`Math.round(seconds * 10000 / 60) / 10000`, so 8:30 = 8.5, 8:40 = 8.6667, 8:13 = 8.2167).

---

## 2. New tables

Every table with a version has 0016 §1.8's house columns (`id uuid pk default gen_random_uuid()`, `version integer not null default 1 check (version >= 1)`, `created_at`, `updated_at`, `created_by`, `updated_by` (login ids, never granted), `created_by_name`, `updated_by_name`), the trigger `<table>_before_write` = `bb_before_write('<fixed>', '<no-bump>')`, `<table>_log` = 0003's `change_log_write()` (after insert, update, delete), and `<table>_no_truncate` = `testing_refuse_truncate()`. RLS on every table (§8).

### 2.1 `public.bb_grades` — one row per graded subject (G1, G7; Star `star_grades`)
| Column | Type | Rule |
|---|---|---|
| `candidate_id` | `uuid not null` | `bb_grades_candidate_fk` → `bb_candidates (id) on delete cascade` (behind §5's guard and Q-G3) |
| `dan` | `smallint not null` | `check (dan between 1 and 4)`; equals the candidate's Dan (guard) |
| `part_code` | `text not null` | `check (part_code in ('physical','technical','curriculum','other'))` |
| `subject_id` | `text not null` | `check (subject_id ~ '^[a-z0-9]{8}$')` |
| `letter` | `text null` | `check (letter is null or letter in ('A+','A','A-','B+','B','B-','C','C-','D'))` |
| `measured` | `numeric(7,4) null` | `check (measured is null or measured between 0 and 999)` |
| `way` | `smallint null` | `check (way is null or way in (0, 1))` |
| `kept` | `boolean not null default false` | |
| `kept_from_cycle_id` | `uuid null` | **no FK** (the earlier cycle may be removed later, as Star) |
| `kept_from_cycle_name` | `text null` | |
| house columns | | |
Table checks: `bb_grades_value_check check ((letter is not null and measured is null and way is null) or (letter is null and measured is not null and way is not null))`; `bb_grades_kept_check check (kept = (kept_from_cycle_name is not null) and (kept_from_cycle_id is null or kept))`; `bb_grades_kept_letter_check check (not kept or (letter is not null and letter <> 'D'))`. Unique `bb_grades_candidate_subject_key (candidate_id, dan, subject_id)`. Index `bb_grades_part_idx (candidate_id, part_code)`. **No row = not graded** (Clear removes it). `bb_before_write('id,candidate_id,dan,part_code,subject_id,kept,kept_from_cycle_id,kept_from_cycle_name', '')`. The version goes up on a change but is **never checked** — last save wins, logged (S3, Star v0.165).

### 2.2 `public.bb_extra_counts` — one row per entered extra-points count (G8)
`candidate_id` (FK `bb_extra_counts_candidate_fk` cascade), `dan smallint` 1–4, `item_name text not null` (exactly an item name of the copy's Dan), `count integer not null check (count between 0 and 9999)`, `kept boolean not null default false`, `kept_from_cycle_id uuid null` (no FK), `kept_from_cycle_name text null`, `bb_extra_counts_kept_check` as 2.1, house columns. Unique index `bb_extra_counts_item_key (candidate_id, dan, lower(item_name))`. No row = not entered (0 points, G 19). `bb_before_write('id,candidate_id,dan,item_name,kept,kept_from_cycle_id,kept_from_cycle_name', '')`.

### 2.3 `public.bb_makeup_subjects` — chosen and retest subjects (G3, G6; Star `star_makeup_subjects`)
`candidate_id` (FK `bb_makeup_subjects_candidate_fk` cascade), `dan smallint` 1–4, `subject_id text` (pattern), `kind text not null check (kind in ('chosen','retest'))`, house columns. Unique `bb_makeup_subjects_key (candidate_id, dan, subject_id, kind)`. `chosen` = an admin's choice for a complete below-the-mark result with no D (G5 / v0.940); `retest` = written by Add make-up on a make-up row (G 26). Insert and delete only. `bb_before_write('id,candidate_id,dan,subject_id,kind', '')`.

### 2.4 `public.bb_result_texts` — the three result email texts (G9, R 21–29; a copy of Star 0023 §2)
`id` (pk), `kind text not null` (`bb_result_texts_kind_key unique`; `check (kind in ('passed','makeup_d','makeup_below'))`), `body text not null` (`bb_result_texts_body_check check (public.bb_result_text_problem(kind, body) is null)`), house columns. `bb_before_write('id,kind', '')`. The primary key is the house `id` (change_log needs a uuid `record_id`, as 0023).
**Seed** (tag `bb_seed`, actor "Database admin", `on conflict (kind) do nothing` — never overwrites): R03 proposal 26's starting texts **word for word**, line breaks as `\n` in E-strings, apostrophes U+2019:
- `passed`: `Hello,\n\n{full name} passed the {cycle} Black Belt testing ({Dan}), with a total of {total} points. Congratulations, {first name}!\n\nThe pass mark for {first name}’s age group is {pass mark} points, with no D in any subject.\n\nThank you for all the hard work. If you have any questions, please contact the school.\n\nJae H. Jeong’s U.S. Taekwondo Center\nWorcester and Shrewsbury`
- `makeup_d`: `Hello,\n\n{full name} took the {cycle} Black Belt testing ({Dan}), with a total of {total} points. {first name} has a make-up to do before earning {Dan}.\n\nThe pass mark for {first name}’s age group is {pass mark} points, with no D in any subject. {first name} received a D in {D subjects}. {below-pass-mark note}\n\nWhat to work on: {subjects to work on}. Every other grade is kept; only this is tested again.\n\nThe make-up is graded at a later testing cycle, with no extra fee. We’ll let you know when. If you have any questions, please contact the school.\n\nJae H. Jeong’s U.S. Taekwondo Center\nWorcester and Shrewsbury`
- `makeup_below`: `Hello,\n\n{full name} took the {cycle} Black Belt testing ({Dan}), with a total of {total} points. {first name} has a make-up to do before earning {Dan}.\n\nThe pass mark for {first name}’s age group is {pass mark} points, with no D in any subject. {first name}’s total is below the pass mark.\n\nWhat to work on: {subjects to work on}. Every other grade is kept; only these subjects are tested again.\n\nThe make-up is graded at a later testing cycle, with no extra fee. We’ll let you know when. If you have any questions, please contact the school.\n\nJae H. Jeong’s U.S. Taekwondo Center\nWorcester and Shrewsbury`
The subject line is fixed in the app ("Your black belt testing result — U.S.T.C.", R 13 / R 28), not stored.

**`bb_result_text_problem(p_kind text, p_body text) returns text`** (immutable, internal): null = fine, else the **first** problem in 0023 §4's order and codes — `kind`, `empty`, `too_long` (> 2 000 code points), `bad_character` (0023's exact list), `first_line`, `unknown_blank`, `blank_not_for_kind`, `stray_brace`, `missing_required` — with R 24's blanks (exact spelling and capitals):
| Kind | Allowed | Required |
|---|---|---|
| every kind | `{first name}` `{full name}` `{cycle}` `{Dan}` `{total}` `{pass mark}` | `{total}` `{pass mark}` |
| `passed` | — | — |
| `makeup_d` | + `{D subjects}` `{subjects to work on}` `{below-pass-mark note}` | + `{subjects to work on}` |
| `makeup_below` | + `{subjects to work on}` | + `{subjects to work on}` |
The app's twin (`src/lib/blackBelt/resultEmail.js`, §13.1) gives the same yes/no and shows R 25's specific message.

### 2.5 `public.bb_result_sends` — "Mark as sent" (R 15–20; Star `star_result_emails`)
`id` (pk), `candidate_id uuid not null` (FK `bb_result_sends_candidate_fk` cascade), `marked_at timestamptz not null default now()`, `marked_by uuid null` (never granted), `marked_by_name text not null`, `result_status text not null check (result_status in ('passed','makeup'))`, `result_total numeric(8,2) not null`, `result_needs jsonb not null check (jsonb_typeof(result_needs) = 'array')`, `result_key text not null check (result_key ~ '^[0-9a-f]{32}$')`, `undone_at timestamptz null`, `undone_by uuid null` (never granted), `undone_by_name text null`; `check ((undone_at is null) = (undone_by_name is null))`. Index `bb_result_sends_candidate_idx (candidate_id, marked_at desc, id desc)`. **No version columns** (as Star). Triggers: `bb_result_sends_guard` (§5), `bb_result_sends_log` (`change_log_write`), `bb_result_sends_no_truncate`. "Changed since sent" (v0.170, R 16) = the newest not-undone row's `result_key` ≠ the current one.

### 2.6 `public.bb_downloads` — the CSV log (R 45; Star `star_downloads`)
`id` (pk), `cycle_id uuid not null` (no FK — the log outlives a removed cycle), `cycle_name text not null`, `row_count integer not null check (row_count >= 0)`, `downloaded_at timestamptz not null default now()`, `downloaded_by uuid null`, `downloaded_by_name text not null`. Index `bb_downloads_cycle_idx (cycle_id, downloaded_at)`. Triggers: `bb_downloads_guard` (append-only: update and delete always refused, constraint `bb_downloads_immutable`; insert only with tag `bb_results_csv`), `bb_downloads_no_truncate`. **Not in `change_log`** (a download isn't a data change). **No grant and no policy** (SQL Editor only).

---

## 3. Make-up candidates — changes to `bb_candidates` (G4, v0.941; plan §3.4, S12)

### 3.1 New columns (no column grant to anyone, §8)
| Column | Type | Rule |
|---|---|---|
| `makeup_of_candidate_id` | `uuid null` | `bb_candidates_makeup_of_fk` → `bb_candidates (id) on delete set null`; `bb_candidates_makeup_of_self_check check (makeup_of_candidate_id is distinct from id)` |
| `makeup_of_cycle_name` | `text null` | the earlier cycle's name at Add; `check (makeup_of_cycle_name is null or coalesce(public.testing_name_is_valid(makeup_of_cycle_name) and makeup_of_cycle_name = public.testing_normalize_name(makeup_of_cycle_name), false))` (0016's cycle-name rule) |
| `age_kept` | `smallint null` | Q-G2 A: `bb_candidates_age_kept_check check (age_kept is null or (age_kept between 0 and 120 and personal_removed_at is not null))` |

### 3.2 Changed table rules
- `alter column cycle_plan_id drop not null` (the composite FK `bb_candidates_plan_fk` stays; MATCH SIMPLE skips a null plan).
- `bb_candidates_source_check` dropped and re-added: `check (source in ('form','desk','makeup'))`.
- New: `bb_candidates_makeup_plan_check check ((source = 'makeup') = (cycle_plan_id is null))` · `bb_candidates_makeup_kukkiwon_check check (source <> 'makeup' or not kukkiwon)` · `bb_candidates_makeup_name_check check ((source = 'makeup') = (makeup_of_cycle_name is not null))` · `bb_candidates_makeup_of_check check (makeup_of_candidate_id is null or source = 'makeup')`.
- **Reference (G 27):** constraint `bb_candidates_reference_key` dropped; replaced by `create unique index bb_candidates_reference_idx on public.bb_candidates (reference) where source <> 'makeup'` (form and desk rows stay unique; a make-up row carries the earlier row's reference). `bb_candidates_reference_check` (pattern) unchanged.
- **One active make-up per earlier candidate, anywhere:** `create unique index bb_candidates_one_active_makeup_idx on public.bb_candidates (makeup_of_candidate_id) where status = 'active' and makeup_of_candidate_id is not null`; plus `bb_candidates_makeup_of_idx on (makeup_of_candidate_id) where makeup_of_candidate_id is not null` (the set-null FK and S20's chain walk).
- **Version trigger** `bb_candidates_before_write` dropped and recreated: fixed = `id,cycle_id,source,reference,registered_at,makeup_of_cycle_name`; no-bump = `date_of_birth,email_for_results,personal_removed_at,makeup_of_candidate_id,age_kept`. (`makeup_of_candidate_id` isn't fixed because `on delete set null` must clear it; §6.1 allows only that.)

### 3.3 Never a fee or a refund (security review "must")
- **New guard** `bb_payments_makeup_guard()` — trigger `bb_payments_makeup_guard` BEFORE INSERT on `bb_payments`: a row of **any** kind (payment, refund, reversal, returned) whose candidate has `source = 'makeup'` → `23514`, constraint `bb_payments_makeup`. (0016's own `bb_payments_guard` is unchanged.)
- `bb_change_plan` is replaced to answer `invalid` on a make-up row right after the lock, before anything else (§6.4). The table checks of 3.2 are the second wall. `bb_candidate_money` is unchanged (no plan → no items → nothing owed; the screens show "No fee", Payments tag "Make-up", Balance "—", G 27).

---

## 4. The result — worked out in one place

### 4.1 `bb_grade_result(p_dan jsonb, p_age integer, p_grades jsonb, p_counts jsonb, p_retest text[], p_chosen text[], p_today date, p_submissions_due date) returns jsonb`
`language plpgsql immutable set search_path = ''`, internal (no grant), **reads no table**. The single source of truth (v0.938: never stored, no override). Inputs:
- `p_dan` — one Dan object of a copy (0024 §2.2).
- `p_age` — whole years on the cycle's first testing day (§4.3), or null.
- `p_grades` — array of `{"subject_id", "letter"|null, "measured"|null, "way"|null, "kept": bool, "kept_from_cycle_name"|null}` (the candidate's `bb_grades` rows of this Dan).
- `p_counts` — array of `{"item_name", "count", "kept": bool}` (the `bb_extra_counts` rows of this Dan).
- `p_retest`, `p_chosen` — subject ids of the `bb_makeup_subjects` rows of each kind.
- `p_today`, `p_submissions_due` — `testing_today()` and the cycle's Submissions due.
Any null array argument is treated as empty. A null `p_dan` raises an exception (it can't happen: every copy passes 0024's CHECK).

**Steps, in order:**
0. **No age:** `p_age` null → status `no_age`; every other key present with its empty value (§4.2); stop.
1. **Pass bracket** = the `pass.brackets` entry with `(from is null or from <= age) and (to is null or age <= to)` → `pass_mark`, `pass_bracket {from, to}`. **Age group** (S9, G 2) = `bb_age_groups(p_dan)` (§4.4) entry holding the age → `{from, to}`.
2. **Which subjects apply** (G 13): `limited_to` null, or it contains an entry equal (`is not distinct from` on both ends) to the pass bracket.
3. **Each subject's letter** (every subject of the four parts, in rubric order):
   - find the grade row with that `subject_id`; none → no letter;
   - a **kept** row → its letter (S10);
   - a graded subject → the row's `letter`, only if it is one of the subject's letters (0024 §2.3: Physical `A+ A B+ B C D`, other parts `A+ A A- B+ B B- C C- D`) and the row has no `measured`;
   - a measured subject → `bb_measured_letter(ways[way], age, measured)` (§4.5), only if `way` is a valid index of its `ways`;
   - anything else (subject gone from the copy, wrong scoring, a way that no longer exists — a hand fix) → the row is **ignored** (listed by SETUP §0025f).
   **Points** = the copy's `points[letter]` (never recomputed from credits, fact 4). A subject that doesn't apply keeps its stored letter in the answer but gets `points: null` and counts nowhere.
4. **Part points** = Σ points of applying subjects per part (`numeric`, exact). **Extra** = `bb_extra_points(extra_points, p_counts)` (§4.6). **Total** = Σ parts + (extra total when `counts_toward_total`). **Maximum** = 0024's `bb_rubric_most_points(p_dan, pass_bracket.from, pass_bracket.to)` (G 23's "260 of 339"; extra points never count).
5. **Late** (v0.939, S7): an applying subject with `handed_in` true, no letter, and `p_today > p_submissions_due`. Never stored, never a D.
6. **Status** (v0.938, S6, G 15, R 6, R 10):
   - `has_d` = some applying subject's letter is `D`; `complete` = every applying subject has a letter (extra counts never count, G 19).
   - `has_d` **and** `pass.no_d` → `makeup`, reasons `['d']`, plus `'below'` when `complete` and `total < pass_mark` (D wins over Late and "left", even while incomplete);
   - else not `complete` → `not_finished`;
   - else `total >= pass_mark` → `passed`;
   - else → `makeup`, reasons `['below']`.
   With `no_d` false a D simply gives that subject's D points.
7. **Needs** (v0.940, R 6): reasons contain `'d'` → the D subjects (ids, rubric order); reasons `['below']` → the `p_chosen` ids that are applying subjects, in rubric order; when that is empty → `choice_needed: true`, needs `[]`. Otherwise `[]`.
8. **`result_key`** = `md5(status || '|' || coalesce(trim_scale(total)::text, '') || '|' || array_to_string(needs, ','))` — trailing zeros removed (263, 263.0 and 263.00 give the same key; tested). The fixture's `result_key_input` is the string inside `md5(…)`; both runners check `md5(result_key_input) = result_key`. The string itself is not part of the answer.
`bb_candidate_result` (§7.0) replaces `status` by `withdrawn` (reasons `[]`, needs `[]`, `choice_needed` false, key over `withdrawn`) for a withdrawn row; everything else is still worked out (Restore brings it back, S14).

### 4.2 The answer (exact key set — the allow-list for every read that carries a result)
`{status, reasons, complete, total, maximum, pass_mark, pass_bracket, age_group, parts, extra, subjects, d_subjects, needs, choice_needed, late, missing, counts, result_key}`:
| Key | Value |
|---|---|
| `status` | `'no_age'` · `'not_finished'` · `'passed'` · `'makeup'` · `'withdrawn'` |
| `reasons` | `[]`, `['d']`, `['below']` or `['d','below']` |
| `complete` | boolean |
| `total`, `maximum`, `pass_mark` | JSON numbers (exact; `total` is the running total while not finished; null only for `no_age`) |
| `pass_bracket`, `age_group` | `{from, to}` (null for `no_age`) — **never the age** |
| `parts` | 4 × `{code, points, graded, applying}` in part order (`graded` = applying subjects with a letter) |
| `extra` | `{counted, total, items: [{name, count, points, kept}]}` — `count` null when not entered; `total` after the limit; `counted` = `counts_toward_total` |
| `subjects` | every subject of the Dan in rubric order: `{id, part, letter, measured, way, points, applies, kept, kept_from_cycle_name, retest, chosen, late, gradable}`; `measured` / `way` only non-null for a measured row; `gradable` = applies and not kept (on a make-up row **every** applying subject without a kept grade is gradable, not only retests — plan §3.4) |
| `d_subjects`, `needs`, `late`, `missing` | subject ids in rubric order (`missing` = applying subjects without a letter, late ones included) |
| `choice_needed` | boolean |
| `counts` | `{applying, graded, left}` |
| `result_key` | 32 hex characters |
`no_age`: `reasons []`, `complete false`, numbers / brackets null, `parts []`, `extra null`, `subjects []`, arrays `[]`, `choice_needed false`, `counts null`, key over `no_age`. **Never** a DOB, the age, an email or money.

### 4.3 The age (S8, v0.926, Q-G2)
`bb_candidate_age(p_candidate_id uuid) returns integer` (stable, internal): `bb_age_on(date_of_birth, the first testing day of the row's own cycle)` when the DOB is on file, else `age_kept`, else null. Used **only inside** the database (it is never returned). A make-up row is aged on **its own** (later) cycle's first day and scored with its own copy (v0.941). (Purge-day masking applies to what leaves the database — DOB and email — not to this internal age, §9.)

### 4.4 `bb_age_groups(p_dan jsonb) returns jsonb` (immutable, internal)
Edges = every non-null `to` of: `pass.brackets`, every way's `brackets` of every measured subject (all four parts), every subject's `limited_to`. Sorted, unique: e1 < … < ek. Groups = `[{from:null,to:e1}, {from:e1+1,to:e2}, …, {from:ek+1,to:null}]`. 1st Dan default → 8 and under · 9 · 10–12 · 13–17 · 18 and over (tested). A one-year group ("9") is accepted (G 2). The app finds a way's bracket for a row from its age group (every group lies inside exactly one bracket of every list), so cut-off words (G 3) need no age.

### 4.5 `bb_measured_letter(p_way jsonb, p_age integer, p_value numeric) returns text` (immutable, internal)
The way's bracket holding the age; then the first of `A+, A, B+, B, C` whose cut-off is met — `at_least`: value ≥ cut-off; `at_most`: value ≤ cut-off; `under`: value < cut-off (Sprint 100 m "under 19 sec"); none met → `D` (v0.944). Null age or value → null.

### 4.6 `bb_extra_points(p_extra jsonb, p_counts jsonb) returns jsonb` (immutable, internal; v0.945, G 18–19)
For each item of the copy, in order: its count = the `p_counts` entry whose `item_name` equals the item's `name` exactly (stored names are the copy's names); `per_count` → count × `points_each`; `steps` → the `points` of the highest step with `at_least ≤ count`, else 0; not entered → 0. Sum, then `least(sum, limit)` when `limit` is set. Answer `{counted, total, items}` as §4.2. Counts whose name isn't in the copy are ignored (SETUP §0025f lists them).

### 4.7 `bb_kept_match(p_earlier_result jsonb, p_earlier_dan jsonb, p_earlier_counts jsonb, p_later_dan jsonb, p_later_age integer) returns jsonb` (immutable, internal; S10, S11, G 26, G 36)
For every subject L of `p_later_dan` (rubric order) that **applies** at `p_later_age` (step 2 rules with the later pass bracket):
- E = the earlier subject in the **same part** with `lower(testing_normalize_name(E.name)) = lower(testing_normalize_name(L.name))` (capitals and extra spaces ignored; the same name in another part never matches);
- **kept** when E exists, E has a letter in `p_earlier_result.subjects` (applying there), E is **not** in `p_earlier_result.needs`, the letter is **not** `D`, and the letter is one of L's letters → `{subject_id: L.id, part: L.part, letter}` (for a measured E the earlier **worked-out** letter; G06b "A kept");
- otherwise → **retest** (a D, a subject to retest, a subject not graded yet on the earlier cycle — Q-G6, a renamed or new subject, a letter not valid for L).
Subjects that don't apply get nothing (they show "—"). Extra counts: for every later item, the earlier count whose `lower(testing_normalize_name(item_name))` matches → kept count with the **later** exact name; earlier items with no match → `dropped_extra`. Answer: `{kept: [...], retest: [ids], new: [ids of L with no E], dropped: [earlier subject names with a letter or a need but no L], kept_counts: [{item_name, count}], dropped_extra: [names]}`. The same function feeds Add make-up (§7.1) and the picker preview (§7.2), so they never disagree.

---

## 5. New guard triggers

All `language plpgsql set search_path = ''`, internal; refusals `errcode '23514'` with the named constraint; `v_hand` = hand fix; `v_tag` = `coalesce(current_setting('tkd.action', true), '')`; "cascade" = `pg_trigger_depth() > 1` **and** `v_tag in ('bb_delete_candidate','bb_delete_cycle')`.

| Trigger (BEFORE …) | Allows exactly | Constraint |
|---|---|---|
| `bb_grades_rules` on `bb_grades` (insert, update, delete) | **insert:** tag `bb_set_grade` / `bb_set_measured` with `kept = false`, or tag `bb_add_makeup` with `kept = true`, or hand fix; and always (hand fix included): `dan` = the candidate's current Dan; the subject exists in that Dan of the cycle's copy with `part_code` = its part; graded → letter one of its letters, no `measured`; measured → (`measured` + `way` a valid index) or (`kept` and a letter of `A+ A B+ B C D`). **update:** tag `bb_set_grade` / `bb_set_measured`, old row not kept, same rules on the new values; a kept row is never updated (not even by a hand fix). **delete:** (a) tag `bb_set_grade` / `bb_set_measured`, not kept, depth 1 (Clear); (b) tag `bb_clear_dan_grading`, not kept, depth 1 (Q-G4); (c) cascade and `old.kept`; (d) hand fix | `bb_grades_rules` |
| `bb_extra_counts_rules` on `bb_extra_counts` | the same with tags `bb_set_extra_count` (insert / update / Clear), `bb_add_makeup` (kept insert), `bb_clear_dan_grading` (delete); `item_name` exists exactly in the copy's Dan | `bb_extra_counts_rules` |
| `bb_makeup_subjects_rules` on `bb_makeup_subjects` | **insert:** `chosen` with tag `bb_set_makeup_subjects`; `retest` with tag `bb_add_makeup`; or hand fix; the subject exists in that Dan of the copy; `dan` = the candidate's Dan. **update:** never. **delete:** `chosen` with tag `bb_set_makeup_subjects` or `bb_clear_dan_grading` (depth 1); `retest` by cascade; hand fix | `bb_makeup_subjects_rules` |
| `bb_result_sends_guard` on `bb_result_sends` | **insert:** tag `bb_mark_result_sent`; stamps `marked_at = now()`, `marked_by = auth.uid()`, `marked_by_name = change_log_actor_name()`, undone_* null (whatever the writer sent). **update:** tag `bb_undo_result_sent`, only `undone_*`, once, from empty (stamped by the trigger). **delete:** cascade, or hand fix | `bb_result_sends_immutable` |
| `bb_downloads_guard` on `bb_downloads` | insert with tag `bb_results_csv` (stamps `downloaded_*`); nothing else, ever | `bb_downloads_immutable` |
| `bb_payments_makeup_guard` on `bb_payments` (insert) | §3.3 | `bb_payments_makeup` |
| `bb_cycle_days_grading` on `bb_cycle_days` (insert, update, delete) | S2. Skipped for a hand fix and for `v_tag = 'bb_delete_cycle'` with depth > 1. **(i)** delete, or a `day_date` change, of a day with `old.day_date <= testing_today()` while a **real grade** (`bb_grades`, not kept) of the cycle has `part_code` among that day's parts → refuse (`bb_cycle_days_has_grades`). **(ii)** First-day freeze, while `bb_cycle_has_grading(cycle)`: with `v_first` = the cycle's current `min(day_date)`, refuse an insert with `new.day_date < v_first`, an update with `new.day_date < v_first`, an update moving a day off `v_first` or a delete of a day on `v_first` when no **other** day of the cycle is on `v_first` (`bb_cycle_first_day_frozen`) | as named |
| `bb_cycle_day_parts_grading` on `bb_cycle_day_parts` (delete; insert never refused) | delete of a part from a day with `day_date <= testing_today()` while a real grade of the cycle has that `part_code` → refuse; same skips as above | `bb_cycle_day_parts_has_grades` |
| `bb_result_texts_before_write`, `_log`, `_no_truncate` | as 0023 (writes only through §7.1; no write grants) | — |
Each grading table also has its `<table>_before_write`, `<table>_log` (`change_log_write`; grade rows hold no personal data, so they are logged in full; not filed under a school, S23) and `<table>_no_truncate`. BEFORE triggers run in name order, so `<table>_before_write` runs before `<table>_rules`.

---

## 6. What 0025 replaces on live 0016 / 0024 objects (for the reviewer)

Each with `create or replace` (same signature, owner, rights; re-granted exactly as before) or `drop … if exists` + create; never by editing 0016 / 0024. **Additive answer keys only**, so the live app keeps working between the paste and the deploy. Nothing in Finance, Star, Color Belt or the public form changes; `bb_registrar` gets nothing.

### 6.1 Trigger functions
- **`bb_candidates_rules()`** keeps both 0016 rules and adds: (a) **insert** with `source = 'makeup'` only with tag `bb_add_makeup` (or hand fix), `makeup_of_candidate_id` not null, and `reference` = the referenced row's `reference` (`bb_candidates_makeup_reference`); (b) **update** of `makeup_of_candidate_id` only to null (`bb_candidates_makeup_of_immutable`); (c) **any `dan` change on a make-up row** refused (`bb_candidates_makeup_dan`); (d) `age_kept`: null on insert; on update it may change only from null to a value, with tag `bb_purge_due`, in the same update that empties `date_of_birth`; once set it never changes — **no hand-fix exemption** (`bb_candidates_age_kept_immutable`; OI-8).
- **`bb_candidates_log()`**: `v_secret` becomes `array['date_of_birth','email_for_results','age_kept']` — `age_kept` masked exactly like the DOB ("on file" / "changed" / null), for every row, make-ups included (Q-G2 safeguard 4).
- **`bb_cycles_rules()`** (0024's): rule (b) for `requirements` additionally requires `not public.bb_cycle_has_grading(new.id)` (Q-G1 A: any grading row of any kind locks the copy, in the table itself). Constraint name unchanged (`bb_cycles_requirements_immutable`); the hand fix and the upgrade rule unchanged. (Q-G1's "for good": see OI-2.)
- **Trigger `bb_candidates_before_write`** recreated with §3.2's lists.

### 6.2 Purge (v0.906 / v0.907, Q-G2, S19, S20)
- **`bb_purge_due_on(uuid)`** (same signature): the **latest** over the candidate and **every make-up row descended from it**, following `makeup_of_candidate_id` chains to the end (recursive CTE; withdrawn descendants count), of 0016's own date expression for each row. Null when either keep-years setting is empty. So the waiver that covered a make-up is kept as long as the make-up's (S20). `bb_purge_is_due` is unchanged (it calls this).
- **`bb_purge_due()`**: identical, except the candidate `update` also sets `age_kept = public.bb_age_on(c.date_of_birth, <first day of c's cycle>)` when `age_kept is null` (the right-hand side reads the old DOB in the same statement). Grades, counts, make-up subjects, sends and the result are kept (S19).

### 6.3 Q-G1, S2
- **`bb_save_cycle_dan`, `bb_undo_cycle_dan`** (0024): after the `locked` check and before the rev check: `bb_cycle_has_grading(p_cycle_id)` → `{status:'has_grades'}`. The trigger of 6.1 is the second wall.
- **`bb_update_cycle`**: identical, plus in the exception handler, before 0016's `check_violation → invalid`: `get stacked diagnostics` the constraint; `bb_cycle_days_has_grades`, `bb_cycle_day_parts_has_grades` or `bb_cycle_first_day_frozen` → `{status:'has_grades'}` (v0.900 detail 4, S2).

### 6.4 Candidates
- **`bb_change_plan`**: after the lock (`not_found`), `source = 'makeup'` → `invalid`, before anything else.
- **`bb_restore_candidate`**: before the write, a make-up row whose `makeup_of_candidate_id` already has another **active** make-up → `already_added`; in the handler, `unique_violation` on `bb_candidates_one_active_makeup_idx` → `already_added`.
- **`bb_delete_candidate`** (Q-G3): after `has_payments`: `bb_candidate_has_grades(id)` (real grades only, §7.0) → `has_grades`. A just-added make-up holding only kept and retest rows is not blocked (its toast Undo, v0.913, still works; the cascade of §5 allows exactly those rows and their sends).
- **`bb_delete_cycle`** (Q-G3): after `has_waivers`: any candidate of the cycle with `bb_candidate_has_grades` → `has_grades`.
- **`bb_update_candidate`** (Q-G4; same 8 arguments): after 0016's checks, a `p_dan` different from the row's Dan → (i) a make-up row → `invalid` (DC 4: no Dan field there); (ii) an active make-up descends from this row → `already_added` (OI-4); (iii) the old Dan has real grading rows → `{status:'has_grades', grade_count, count_count, chosen_count}` and **nothing is written**. Everything else as 0016 (a DOB fix clears nothing; the result is worked out again).
- **New `bb_update_candidate_clear`** (§7.1, OI-1) does the confirmed Dan change.

### 6.5 Reads
- **`bb_cycle_roster`**: the plan join becomes `left join` (a make-up row has no plan, so it is still listed — every plan join checked); each row gains `is_makeup` (`source = 'makeup'`), `makeup_of_cycle_name`, `retest_names` (names of its `retest` subjects in rubric order, `[]` otherwise) and `has_grades` (`bb_candidate_has_grades`, for graying Delete permanently). `plan_id` / `plan_name` are null on a make-up row.
- **`bb_candidate_detail`**: the candidate object is `to_jsonb(v_c) - array['created_by','updated_by','withdrawn_by','makeup_of_candidate_id','age_kept']` (deliberately: the detail shows the earlier cycle's **name**, never the earlier row's id or a kept age) plus the same four keys as the roster; `plan` is null for a make-up row; `age_on_first_day` stays DOB-based only (null after the purge day — **never** from `age_kept`).

---

## 7. Functions

Roles (v0.210, v0.946): **S** = staff (incl. the desk account) and admins; **A** = admins. Every grade write reads the cycle's copy **after** taking the cycle lock.

### 7.0 Internal helpers (no grants)
| Helper | What |
|---|---|
| `bb_lock_candidate_shared(p_candidate_id uuid) returns public.bb_candidates` | cycle `for share` → candidate `for update` (as 0016's `bb_lock_candidate`, but sharing the cycle) |
| `bb_candidate_grading_input(p_candidate_id uuid, p_dan integer) returns jsonb` | `{grades, counts, retest, chosen}` for §4.1 from the candidate's rows of that Dan |
| `bb_candidate_result(p_candidate_id uuid) returns jsonb` | loads the copy's Dan for the candidate's Dan, the age (§4.3), the inputs, `testing_today()`, `submissions_due`, and calls `bb_grade_result`; withdrawn → §4.1's override. Lists use the per-row form below |
| `bb_candidate_result_with(p_candidate public.bb_candidates, p_dan jsonb, p_first_day date, p_submissions_due date, p_today date) returns jsonb` | the same with the copy loaded **once** by the caller (lists: no per-row document loading, S22) |
| `bb_cycle_has_grading(p_cycle_id uuid) returns boolean` | any grading row (any kind) of any candidate of the cycle |
| `bb_candidate_has_grades(p_candidate_id uuid) returns boolean` | any **real** grade: a not-kept `bb_grades` or `bb_extra_counts` row, or a `chosen` subject |
| `bb_sent_state(p_candidate_id uuid, p_result jsonb) returns jsonb` | Star's `star_sent_state`: `{sent: {id, marked_at, marked_by_name, result_status} | null, matches}` from the newest not-undone send |
| `bb_grade_result`, `bb_age_groups`, `bb_measured_letter`, `bb_extra_points`, `bb_kept_match`, `bb_result_text_problem`, `bb_candidate_age` | §4, §2.4 |

### 7.1 Writes
| Function | Role · tag | Ordered checks → answer |
|---|---|---|
| `bb_set_grade(p_candidate_id uuid, p_dan integer, p_subject_id text, p_letter text)` | S · `bb_set_grade` | 3: nulls (except `p_letter`), `p_dan` not 1–4, id not the pattern → `invalid` · 4: `bb_lock_candidate_shared` → `not_found` · 6: withdrawn → `withdrawn`; `p_dan` ≠ the candidate's Dan → `stale` (a stale tablet can't bring back cleared grades, Star v0.164); no age → `invalid`; not a **graded** subject of that Dan in the copy, a letter not of its part, or a subject not for the candidate's pass bracket → `invalid`; the existing row is kept → `kept` · 7: `p_letter` null = Clear (delete the row); the same letter again writes nothing → `{status:'ok', letter, result}` |
| `bb_set_measured(p_candidate_id uuid, p_dan integer, p_subject_id text, p_value numeric, p_way integer)` | S · `bb_set_measured` | as `bb_set_grade`, for a **measured** subject; `p_value` 0–999, ≤ 4 decimals, not NaN; `p_way` 0 or 1 and a valid index (0 for one-way subjects); `p_value` null = Clear (way ignored); switching the way keeps the number and re-works the grade (G 5) → `{status:'ok', value, way, result}` |
| `bb_set_extra_count(p_candidate_id uuid, p_dan integer, p_item_name text, p_count integer)` | S · `bb_set_extra_count` | `p_count` 0–9 999 or null (Clear); unknown item (exact name in the copy's Dan) → `invalid`; kept → `kept`; withdrawn; stale Dan; no age is **not** required (counts don't depend on age) → `{status:'ok', count, result}` |
| `bb_set_makeup_subjects(p_candidate_id uuid, p_expected_ids text[], p_ids text[])` | A · `bb_set_makeup_subjects` | 3: nulls, `p_ids` empty, more than 120 ids, a bad pattern or a repeat → `invalid` · 4: `bb_lock_candidate` → `not_found` · 5: the stored `chosen` set (as a sorted set) ≠ `p_expected_ids` → `stale` · 6: withdrawn → `withdrawn`; an **active** make-up row points at this candidate → `already_added`; the result is not (`makeup`, reasons exactly `['below']`, complete) → `invalid`; an id that isn't an applying subject of its Dan → `invalid` · 7: delete chosen rows not in `p_ids`, insert the new ones → `{status:'ok', ids, result}` (ids in rubric order) |
| `bb_add_makeup(p_cycle_id uuid, p_earlier_candidate_id uuid)` | S · `bb_add_makeup` | 3: nulls → `invalid` · 4: this cycle `for no key update` → `not_found`; the earlier candidate `for share` → `not_found` · 6: this cycle is Past (`bb_cycle_state(…).past`) → `finished`; the earlier row is in this cycle, its cycle's first day isn't before this cycle's first day, it is withdrawn (incl. a duplicate copy), or it is purged / on or after its purge day (`bb_purge_is_due`) → `invalid`; an active make-up already points at it → `already_added`; its result (earlier copy, earlier age) is not `makeup` → `stale`; `choice_needed` → `choice_needed`; the later Dan object exists (always) · 7: insert the make-up row: `cycle_id = p_cycle_id`, first / last name, DOB, email, school, Dan copied, `cycle_plan_id null`, `kukkiwon false`, `source 'makeup'`, `reference` = the earlier row's, `makeup_of_candidate_id`, `makeup_of_cycle_name` = the earlier cycle's name, `status 'active'`; then `bb_kept_match(…, later age)` → kept `bb_grades` rows (letter, `kept_from_cycle_id/_name`), kept `bb_extra_counts`, `retest` rows; then 0016's duplicate check (`bb_recheck_duplicate` for the new row, its partner and anyone pointing at it); last step `bb_purge_due()` as `bb_add_candidate` (OI-6). `unique_violation` on `bb_candidates_one_active_makeup_idx` → `already_added` (a race between two cycles). → `{status:'ok', id, reference, version, kept_count, retest_count}`. **Q-G6 / S13:** a Make-up · D result that isn't complete yet may be added; only grades entered by then are copied, later earlier-cycle grades don't follow (S10). Undo = 0016's `bb_delete_candidate` (admins, v0.913) |
| `bb_mark_result_sent(p_candidate_id uuid, p_expected_result_key text)` | S · `bb_mark_result_sent` | 3: nulls → `invalid` · 4: `bb_lock_candidate` → `not_found` · 6: withdrawn → `withdrawn`; result status not `passed` / `makeup`, or `choice_needed` → `not_finished` (**Q-G6 B: a Make-up · D that isn't complete yet may be marked**); email null or `bb_purge_is_due` → `no_email`; `result_key` ≠ expected → `stale` · 7: insert the send (snapshot status, total, needs, key) → `{status:'ok', sent_id, marked_at}` |
| `bb_undo_result_sent(p_send_id uuid)` | S own < 10 s / A any time · `bb_undo_result_sent` | 3: null → `invalid` · 4: the send, then `bb_lock_candidate`, then the send `for update` → `not_found` · 5: already undone → `stale` · 6: not admin and not (`marked_by = auth.uid()` and `marked_at > now() − 10 seconds`) → `not_allowed` (R 15, R 18, Star OPEN-16) · 7: set `undone_*` → `{status:'ok'}` |
| `bb_set_result_text(p_kind text, p_expected_version integer, p_body text)` | A · `bb_set_result_text` | 0023 §5 exactly: nulls or `bb_result_text_problem` not null → `invalid`; row `for update` by kind → `not_found`; version → `stale`; the same text writes nothing → `{status:'ok', version, body}`. Stored exactly as sent. The toast Undo saves the old text back with the new version. A text change never resets "Sent" (R 27) |
| `bb_update_candidate_clear(p_candidate_id uuid, p_expected_version integer, p_first text, p_last text, p_date_of_birth date, p_email text, p_location_code text, p_dan integer, p_expected_grade_count integer, p_expected_count_count integer, p_expected_chosen_count integer)` | S (a Dan change with a payment: A, as 0016 S8) · `bb_update_candidate` + `bb_clear_dan_grading` | 0016's `bb_update_candidate` checks and writes (shared internal core, OI-1), plus: `p_dan` must differ from the row's Dan and the row must not be a make-up and must not have an active make-up descendant (else `invalid` / `already_added`); the three current counts of the old Dan's real grading rows must equal the expected ones, else `{status:'has_grades', grade_count, count_count, chosen_count}` with the new counts (DC 5); then, in the same batch, delete the old Dan's not-kept grades, not-kept counts and chosen subjects under tag `bb_clear_dan_grading` (logged), then update the candidate under `bb_update_candidate` → `{status:'ok', version, needs_parent_signature, cleared: {grades, counts, chosen}}` |

### 7.2 Reads (all S except the CSV; none takes locks; none runs the purge, S22)
| Function | Answer (exact top-level keys) |
|---|---|
| `bb_grading_grid(p_cycle_id uuid, p_dan integer)` | 3: nulls, `p_dan` not 1–4 → `invalid`; 4: → `not_found`. `{status, today, cycle, rubric, dan_counts, rows}` — `cycle` = `{id, name, submissions_due, first_day, days: [{id, name, day_date, start_time, end_time, place_code, place_other, second_start, second_end, second_place_code, second_place_other, parts}]}`; `rubric` = `bb_rubric_public(copy)`'s Dan object for `p_dan` (allow-listed by 0024; names, credits, scoring, ways with cut-offs, points, `limited_to`, `handed_in`, `outdoor`, extra items, `to_confirm`); `dan_counts` = `[{dan, location_code, count}]` of active rows (the Dan switch, filtered by the app's location switch, G 29); `rows` = active candidates of that Dan, **own candidates first, then make-ups** (G 14 / v0.947), each group in roster order (school Shrewsbury then Worcester, last name, first name, id): `{id, first_name, last_name, location_code, is_makeup, makeup_of_cycle_name, result}`. **No DOB, email, reference, plan, money or age.** The app picks the day from `today` (G 28), never the device clock |
| `bb_cycle_results(p_cycle_id uuid, p_dan integer)` | `p_dan` null = every Dan (the printed sheet, R 38) else 1–4. `{status, today, cycle (as above + last_day), rubrics: [Dan objects of the public view], dan_counts, rows}`; rows in roster order (Dan, school, last, first, id), active only (S14): `{id, first_name, last_name, location_code, dan, is_makeup, makeup_of_cycle_name, result, sent, has_email}` — `sent` = `bb_sent_state`; `has_email` = email on file **and** not `bb_purge_is_due`. No DOB or money |
| `bb_makeup_list(p_cycle_id uuid)` | G 25, S13. **Filters first**: candidates of other cycles whose first day is before this cycle's, `status = 'active'`, not purged and not on / after the purge day, and no active make-up **in another cycle** pointing at them; **then** works out each result (its own copy, loaded once per earlier cycle) and keeps `status = 'makeup'` (complete or not, Q-G6). `{status, rows}`; rows newest earlier cycle first (first day desc), then Dan, school, last, first: `{id, first_name, last_name, location_code, dan, cycle_id, cycle_name, cycle_first_day, age_group (on **this** cycle's first day and Dan), reasons, complete, needs (names), d_subjects (names), choice_needed, already_added (an active make-up of it is on **this** cycle), preview}` — `preview` = `bb_kept_match` as names `{kept, retest, new, dropped, kept_extra, dropped_extra}` (G 26). No DOB, email or reference |
| `bb_result_email(p_candidate_id uuid)` | R 12: one candidate at the click. → `not_found`; withdrawn → `withdrawn`; status not `passed`/`makeup` or `choice_needed` → `not_finished`; no email or purge day → `no_email`. `{status, email, kind, first_name, last_name, cycle_name, dan, total, pass_mark, reasons, needs (names), d_subjects (names), result_key}` — `kind` = `passed` / `makeup_d` (reasons contain `d`) / `makeup_below`. The app builds the blank values and wording (OI-5). Never the DOB. Not logged (like candidate detail, S17) |
| `bb_results_csv(p_cycle_id uuid)` | **A, volatile.** 2 → `not_allowed`; 3, 4 → `invalid`, `not_found`; then **writes the `bb_downloads` row first** (`row_count` = active candidates), then answers `{status, cycle_name, rows}`; any failure rolls back the log row too (one statement block). Rows in Results order, active only (R 49): `{candidate_id, result_status, dan, first_name, last_name, location_code, makeup_of_cycle_name, date_of_birth, pass_bracket, email_for_results, plan_name, kukkiwon, money, parts, extra_total, total, pass_mark, result, sent}` — `date_of_birth` and `email_for_results` **null from the purge day on** (`bb_purge_is_due`); `money` = `bb_candidate_money(…) - 'items'`; `result` = `{status, reasons, complete, choice_needed, needs, late, missing}` as **names**; the app formats R 47–48's 21 columns. A refused call writes nothing |
| `bb_cycle_grading_state(p_cycle_id uuid)` | For Edit cycle and the Rubric tab: `{status, has_grading, parts_with_grades, first_day, first_day_frozen, protected_days: [{id, day_date, parts}]}` — `first_day_frozen` = `has_grading`; `protected_days` = days on or before today with a part that has real grades (S2). The screens gray Save with a reason instead of failing |

### 7.3 Action tags new in 0025
`bb_set_grade`, `bb_set_measured`, `bb_set_extra_count`, `bb_set_makeup_subjects`, `bb_add_makeup`, `bb_mark_result_sent`, `bb_undo_result_sent`, `bb_set_result_text`, `bb_clear_dan_grading`, `bb_results_csv` (the download row only; not logged); reused: `bb_seed`, `bb_update_candidate`, `bb_delete_candidate`, `bb_delete_cycle`, `bb_purge_due`.

---

## 8. RLS, grants, revokes (S24, plan §3.8)
- RLS on all six new tables. One policy each on `bb_grades`, `bb_extra_counts`, `bb_makeup_subjects`, `bb_result_sends`, `bb_result_texts`: `<table>_select_with_access for select to authenticated using ((select public.has_data_access()))` (created if missing, then `alter policy` to exactly this). **`bb_downloads`: no policy.**
- `revoke all … from public, anon, authenticated, service_role` on every new table. **Only grant:** `select (id, kind, body, version, created_at, updated_at, created_by_name, updated_by_name) on bb_result_texts to authenticated` (staff read the texts, R 21). `bb_grades`, `bb_extra_counts`, `bb_makeup_subjects`, `bb_result_sends`: **no grant** (read only through §7.2, so a direct query can never join a grade to a DOB). No write grant anywhere.
- **No column grant on the new `bb_candidates` columns** (no role can select `makeup_of_candidate_id`, `makeup_of_cycle_name` or `age_kept`; tested).
- Execute to `authenticated` only: the 9 writes and 6 reads of §7.1–§7.2; replaced functions keep exactly 0016's / 0024's rights. Every helper and trigger function: nobody. `bb_registrar` still executes exactly its two functions.
- Expected security-advisor change: **+15** "security definer function executable by authenticated" (the 15 new staff functions) and **+1** "RLS enabled, no policy" (`bb_downloads`); nothing else.

---

## 9. Privacy (v0.210, v0.943, v0.907, plan §6)
- **Grading screens** (mat side, tablets, the arena): `bb_grading_grid` has no DOB, email, reference, money or age — the protection is in the read itself (Star v0.161). The age group is a range; a one-year group accepted (G 2).
- **Results:** no DOB or money; `has_email` only. Email result reads one email for one candidate at the click (R 12). **Hide payments** (R 36) is a device setting: with it on, Email result is grayed and Download CSV hidden — the only two reads carrying an email or DOB.
- **Purge-day masking everywhere a DOB or email leaves the database:** `bb_result_email`, `bb_results_csv`, `has_email` and `bb_mark_result_sent` use `bb_purge_is_due(candidate, testing_today())`: from the purge day on, DOB and email count as gone even before the purge runs.
- **CSV:** admins only (v0.144, R 46), whole cycle, logged in `bb_downloads` before any row leaves; the file is made in the browser (nothing in a web address).
- **Purge:** removes DOB, email, signature and signer's name as today; keeps grades, counts, make-up subjects, sends and the result; `age_kept` keeps the result exact (Q-G2). A make-up row holds its own copied DOB and email, removed on its own date. Measured numbers aren't personal.
- **`change_log`:** every write logged with its tag and login (G5: no examiner field). No `change_log` row ever contains a DOB, email or `age_kept` value (tested).

---

## 10. Concurrency, statuses and undo (plan §7)
Stale checks: grades and counts — none, last save wins (S3); Choose subjects — the expected set; Mark as sent — the expected `result_key`; texts — `expected_version`; Add make-up — the earlier result must still be a make-up (`stale`); Dan clear — the three counts. Undo windows: Mark as sent — own, 10 s on the server for the 5-second toast (R 15), admins any time after R 18's confirm; Add make-up — admins (v0.913, `bb_delete_candidate`); a result text — the toast re-saves the old text; grades and counts — no undo (Clear or change the cell; the log has the old value).

---

## 11. Files

| File | Who | What |
|---|---|---|
| `supabase/migrations/0025_black_belt_grading.sql` | A (new) | §0–§9 |
| `supabase/tests/0025_tests.sql` | A (new) | §12.1 |
| `supabase/tests/0025_fingerprints.sql` | A (new) | §12.3 |
| `supabase/tests/0025_grading_cases.json` | A (new; B reads it) | §12.2 |
| `supabase/tests/0016_tests.sql`, `0024_tests.sql` | A (edit, version-aware only; §12.4) | pass before **and** after 0025 |
| `supabase/tests/pglite/run.mjs` | A (shared file: `step0025` + `step0025_production_order`; nothing else) | §12.5 |
| `supabase/SETUP.md` | A (shared file: one new section `## Migration 0025: …` + one warning line in the 0016 and 0024 sections) | §12.6 |
| `supabase/manual/0025u_undo.sql` | A (new) | §12.6, step 0025g |
| `docs/Testing/Black Belt Testing/TKD-BlackBelt-0025-RunSheet.md` | A (new, at CP2 prep) | §15 |
| `src/lib/blackBelt/grading.js` (new), `resultEmail.js` (new), `gradingApi.js` (new), `mockGrading.js` (new), `mockBlackBelt.js`, `checks.mjs` | B | §13 |
| `src/lib/blackBelt/api.js` | B (`BB_STATUSES` + the new statuses; `updateCandidate` maps `has_grades`; `updateCandidateClear`) | §13.2 |
| `src/lib/pageAddress.js` | B (shared file: the two new Black Belt cycle tabs only) | §14.1 |
| `src/lib/mockClient.js` | B (shared file: comment lines + one console helper only) | §13.3 |
| `src/blackBelt/staff/grading/**` (new), `src/blackBelt/staff/results/**` (new) | C1, C2 | §14 |
| `src/blackBelt/staff/rubric/ResultEmailsBlock.jsx`, `ResultTextDialog.jsx` (new), `rubric/RubricTab.jsx`, `cycle/CycleRubricTab.jsx` | C2 / C3 | §14.4, §14.5 |
| `src/blackBelt/staff/cycle/CyclePage.jsx`, `cycle/CycleDialog.jsx`, `cycle/useCycleEditor.jsx`, `src/blackBelt/staff/candidates/**`, `src/blackBelt/staff/text.js`, `blackBelt.css`, `BlackBeltTesting.jsx` | C3 (C1 / C2 add their own `text.js` files) | §14.5 |
**Not touched:** every existing migration, Star's and Color Belt's files (Star's grading engine and sheets are **copied** into `src/blackBelt/staff/grading/` and `results/`, never edited or imported across sections), `functions/**`, `src/App.jsx`, `src/screens/Testing.jsx`, `src/styles/tokens.css` (the amber band uses existing tokens: if `#faeeda` / `#8a5a00` have no token, the builder **stops and asks**), `src/components/navItems.js`, the rulebook, `README.md`, `docs/README.md`.

---

## 12. Tests

### 12.1 `supabase/tests/0025_tests.sql`
0016_tests' shape: one transaction, one `do` block, sessions **A1–A8, D1–D3, anon**, placeholders `<paste-admin-UID-here>` / `<paste-desk-UID-here>`, `'zz test …'` cycles, **final `rollback;`**, last row `ALL 0025 TESTS PASSED`. Dates via the internal helpers and as-`postgres` rows with past dates (no fake clock). The fixture can't be read by production, so its required cases are **written inline** too.
| Id | Group |
|---|---|
| **G1 Who may call** | anon → 42501 on all 15 functions and 6 tables; `bb_registrar` → 42501 on all; A2–A8, D2–D3 → `no_access` from every function (sensible, broken and unknown-id arguments), nothing written; D1 → `not_allowed` from `bb_set_makeup_subjects`, `bb_set_result_text`, `bb_results_csv`; D1 undo of someone else's send / after 10 s → `not_allowed` |
| **G2 Column and table privileges** | `authenticated` selects 0 rows / 42501 on `bb_grades`, `bb_extra_counts`, `bb_makeup_subjects`, `bb_result_sends`, `bb_downloads`; `bb_result_texts` only its granted columns (A1, D1 read 3 rows; A2–A8, D2–D3 read 0); **no role can select `makeup_of_candidate_id`, `makeup_of_cycle_name` or `age_kept`** (42501); direct insert / update / delete / truncate → 42501 |
| **G3 Key allow-lists** | exact key sets of every answer of §7.2 and of the result (§4.2) at every level; roster / detail new keys; **no `date_of_birth`, `email_for_results`, `money`, `reference`, `age` anywhere they aren't listed; no `makeup_of_candidate_id` or `age_kept` anywhere** (searched recursively in every answer's text) |
| **G4 Refusals** | every refusal of §7.1 in its order (incl. 5 decimals, NaN, 1000, way 2, way 1 on a one-way subject, an unknown item, a letter of another part, a measured subject via `bb_set_grade`, not-for-this-age, no age, stale Dan, withdrawn, kept) |
| **G5 Guards** | direct writes as postgres **with a tag set** that skip the functions: wrong Dan, unknown subject or item, a bad letter, a kept D, a kept row changed, a delete without a tag, a cascade delete of a real grade, a send changed twice, a send's `marked_by_name` faked (stamped over), a download row changed or removed, a payment of each kind for a make-up row → `check_violation` with the named constraint |
| **G6 Results** | the fixture's required cases inline (statuses, totals exact, reasons, needs, late, left, groups, keys); `result_key` equal for 263 / 263.0 / 263.00; a DOB fix moving a make-up into 18 and over makes One Step Sparring gradable |
| **G7 Make-ups** | Add: ok with kept + retest + kept counts; `already_added` (same cycle, a second cycle, the race via the unique index, **Restore** of a withdrawn make-up while another is active); `choice_needed`; `stale` (earlier result changed to Passed); `invalid` (same cycle, earlier first day not before, withdrawn, duplicate copy, purged, on the purge day before the purge ran); `finished`; shared reference; no plan; Kukkiwon impossible; **payment, refund, reversal and returned refused**; **`bb_change_plan` → `invalid`**; Dan change → `invalid`; roster and detail list it with `plan` null; a D never kept; a measured kept letter = the earlier worked-out one; a renamed subject → retest; the same name in another part not matched; a subject not graded yet on the earlier cycle (Q-G6) → retest; Choose subjects on the earlier row → `already_added`; Undo (admin delete) works with only kept rows and a send |
| **G8 Q-G1** | each kind of grading row (grade, number, count, chosen, kept, retest) makes `bb_save_cycle_dan` / `bb_undo_cycle_dan` answer `has_grades` on a never-opened cycle; the direct `requirements` update with the save tag → `bb_cycles_requirements_immutable`; a hand fix still works; clearing every row makes the copy editable again (OI-2) |
| **G9 S2** | `bb_update_cycle` → `has_grades` for: deleting / moving a past day whose part has grades, unticking that part, moving / deleting the first day, adding an earlier day; a future non-first day with grades can move; nothing written on refusal |
| **G10 Q-G3** | Delete permanently and Delete cycle → `has_grades` with a real grade, a count, a chosen subject; not with only kept / retest rows; the guard refuses a cascade of a real grade even if the check were skipped (as postgres with the tag) |
| **G11 Q-G4** | `bb_update_candidate` Dan change → `has_grades` with the three counts, nothing written; `bb_update_candidate_clear` with wrong counts → `has_grades` with new counts; right counts → cleared (logged under `bb_clear_dan_grading`, same batch), sends kept, the stale tablet's `bb_set_grade` for the old Dan → `stale`; a make-up row → `invalid`; an earlier row with an active make-up → `already_added`; a DOB fix clears nothing |
| **G12 Sent (Q-G6 B)** | Mark as sent on Passed, on Make-up · D **incomplete**, on a complete below with chosen subjects; `not_finished` on Not finished, `no_age`, `choice_needed`; `stale` key; `no_email` after the purge and **on the purge day before the purge ran**; own undo inside 10 s ok, outside → `not_allowed`, admin later ok, twice → `stale`; "changed since sent" after a later grade; a text change leaves `matches` true |
| **G13 Texts** | the seed (3 rows, exact bodies by md5); every rule code; stale version; staff refused; the same text → no write, no log; re-running the seed overwrites nothing |
| **G14 CSV** | the log row is written first (one row per call, `row_count`), a refused call (staff, unknown cycle) writes nothing; keys incl. `candidate_id` / `result_status`; DOB and email null from the purge day; withdrawn rows left out; not in `change_log` |
| **G15 Purge** | grades, counts, subjects, sends and the result kept; DOB gone; `age_kept` set once (by the purge, no version bump, masked in the log), refused afterwards even as postgres; S20: the earlier row's purge day = the latest of its make-up chain (Spring → Fall → next Spring, a withdrawn link included) |
| **G16 Logging** | every write has its `change_log` row with its tag and one batch; **no `change_log` row contains a DOB, email or `age_kept` value** (scan of the rows written by the test) |
| **G17 Catalog (U11 style)** | RLS on all new tables; policies exactly §8; grants exactly §8; every 0025 function: one version, `search_path=""`, `prosecdef` as designed, `pronargdefaults = 0`, identity arguments exactly §17, execute rights exactly §8; triggers of §5 / §6 exist and are enabled (incl. `bb_candidates_before_write`'s new arguments); the constraints and indexes of §2–§3; **no `execute`, `format(`, `clock_timestamp` or `::date` on a timestamp in any 0025 function source** |
| **G18 Form still fast** | `bb_public_register` (as `bb_registrar`, a test cycle) still finishes well inside its 5-second limit with the new triggers, the partial reference index and the larger duplicate check |

### 12.2 The shared fixture `supabase/tests/0025_grading_cases.json`
Two lists. **`result_cases`**: `{name, base: "default:<Dan>", ops: [{op:"set"|"remove", path:[…], value?}], age, grades: [{subject: "<name>", part, letter? | measured+way?, kept?, kept_from_cycle_name?}], counts: [{item, count, kept?}], retest: [names], chosen: [names], today, submissions_due, expect: {status, reasons, complete, total, parts:{code: points}, extra_total, needs:[names], late:[names], left, age_group:{from,to}, result_key_input}}` — names are resolved to ids in the base Dan by both runners (part + name). **`kept_cases`**: earlier and later inputs for `bb_kept_match` with the expected names. PGlite runs every case through the SQL functions, `checks.mjs` through `grading.js`; **both must equal `expect`**. **The expected numbers are typed from the approved mockups and hand-worked boundary cases — never generated by either implementation** (as 0024 §4.3). Required cases:
- **The 10-candidate cast** on the real default rubric (grades as drawn in G01–G04 and the files' "Sample data"; saved in the repo as `docs/Testing/Black Belt Testing/TKD-BlackBelt-Mockup-Cast.json` (fake names only)): Alex Kim 305.75 Passed (pass 275, 13–17); Zoe Martin 263 Make-up below 275 (choice needed; then chosen); Mia Chen 324.5 Make-up · D in Free sparring (18 and over, pass 293); Lucas Ferreira 275.5 Not finished · TKD project late (today 2027-06-09, due 2027-05-29); Rina Patel 252.5 Make-up · D in 1/2 or 1 mile + below 293; Ava Brooks 300.95 Passed; Sam Lee 243.6 Not finished · Meditation late; Noah Silva 323.9 Passed; Bao Nguyen 353.8 Passed; Leo Garcia 557.5 Passed (4th Dan, pass 453).
- Mia Chen on Fall 2027 as a make-up: kept + retest (Free sparring) + kept extra +15 → 324.5 so far, then Free sparring B+ → **333.5 Passed** (a `kept_cases` entry produces her kept rows).
- **Cut-off boundaries:** Hold `at_least` exactly 31 → A+; the 13-and-over mile `at_most` exactly 8.5 (8:30) → A; Sprint 100 m `under` exactly 19 for 9–12 → B, not B+; 8:13 = 8.2167 against a made-up cut-off 8.22 (ops) → met; both ways of Pull-up or hold; One Step Sparring for 13–17 (doesn't apply) vs 18 and over; every 1st Dan group edge (ages 8, 9, 10, 12, 13, 17, 18).
- No age; `no_d` false (a D gives its points, can pass); an extra `limit`; `counts_toward_total` false; a count below the first step (0 points); a per-count item; D while incomplete (makeup, `['d']`, not finished otherwise); Late vs D vs "left"; a make-up whose applying subjects change after Add (a DOB fix into 18 and over: One Step Sparring gradable); `result_key_input` `"makeup|263|"`-style strings and 263 / 263.00 equal; decimal sums floats get wrong (7 × 2.15, 3 × 3.35, 0.1 + 0.2 style).
- `kept_cases`: a D never kept; a measured kept letter; a renamed subject; the same name in another part; a new subject in the later rubric; an item missing from the later rubric (dropped); a letter valid earlier but not for the later subject; a subject not graded yet on the earlier cycle (Q-G6 B).

### 12.3 `supabase/tests/0025_fingerprints.sql` and the exact expected differences
Read-only, one SELECT, connector-safe (the refused words spelled in pieces, as 0005 / 0016). Rows: every 0025 function (new and replaced, by a fixed name list) with identity arguments, md5 of the comment-free source, `prosecdef`, `proconfig`, owner, sorted rights · the six tables (RLS, table and column rights) · their triggers, policies, constraints and indexes · the new `bb_candidates` constraints, indexes and the trigger arguments · the three seeded texts (kind, md5 of body) · a row **`check | rerun`** = `ok` when `bb_candidates_source_check` allows `makeup`, `bb_cycles_rules`'s source mentions `bb_cycle_has_grading` and `bb_candidates_before_write`'s arguments contain `age_kept`; else `0016 OR 0024 RE-RUN OVER 0025 — run SETUP §0025g or re-apply 0025`.
**What `0016_fingerprints.sql` prints differently after 0025** (everything else row for row identical; **every other earlier fingerprint file byte-identical except `0024_fingerprints.sql` below**):
| Kind | Item | Difference |
|---|---|---|
| function | `bb_purge_due_on`, `bb_purge_due`, `bb_candidates_rules`, `bb_candidates_log`, `bb_update_cycle`, `bb_delete_cycle`, `bb_update_candidate`, `bb_change_plan`, `bb_restore_candidate`, `bb_delete_candidate`, `bb_cycle_roster`, `bb_candidate_detail` | md5 only; definer, volatility, settings, owner, rights identical |
| function (added rows) | every new 0025 function and helper of §17, each once (the query lists every `bb\_%` function) | new rows |
| trigger | `bb_candidates.bb_candidates_before_write` | arguments as §3.2 |
| trigger (added) | `bb_payments.bb_payments_makeup_guard`, `bb_cycle_days.bb_cycle_days_grading`, `bb_cycle_day_parts.bb_cycle_day_parts_grading` | new rows |
| constraint | `bb_candidates.bb_candidates_source_check` | the new list |
| constraint (removed) | `bb_candidates.bb_candidates_reference_key` | row gone |
| constraint (added) | the seven of §3.1–§3.2 on `bb_candidates` (`…_makeup_of_fk`, `…_makeup_of_self_check`, `…_makeup_of_check`, `…_makeup_name_check`, `…_makeup_plan_check`, `…_makeup_kukkiwon_check`, `…_age_kept_check`) | new rows |
| index | `bb_candidates.bb_candidates_reference_key` removed; `bb_candidates_reference_idx`, `bb_candidates_one_active_makeup_idx`, `bb_candidates_makeup_of_idx` added | |
`table` rows don't change (no new column is granted). **`0024_fingerprints.sql`**: md5 of `bb_cycles_rules`, `bb_save_cycle_dan`, `bb_undo_cycle_dan` only; its `check | 0016_rerun` row stays `ok`. The builder replaces each "as printed" text with the line **exactly as PGlite prints it** after the first run; the step and the run sheet compare those literal lines, nothing looser.

### 12.4 Earlier test files after 0025 (version-aware, as 0024 §11.2)
At the top of `0016_tests.sql` and `0024_tests.sql`: `v_has_0025 := to_regclass('public.bb_grades') is not null`. Only where 0025 changes behaviour does an assertion branch; **no pre-0025 assertion is weakened**; **both arms assert something**; PGlite runs the edited files **before 0025 too**. Known spots (the builder greps for more and lists every change in the summary): the "no other bb_ function" list; roster and detail exact key sets (+ the four keys); catalog checks on `bb_candidates` (`source` check, `reference_key`, `cycle_plan_id` nullability, the trigger arguments, the log's masked keys); 0024's U11 list for the three replaced functions.

### 12.5 PGlite (`supabase/tests/pglite/run.mjs`)
- **`step0025`** (main database, after `step0024`): (a) fingerprints of every earlier migration; (a′) the edited `0016_tests.sql` / `0024_tests.sql` before 0025; (b) apply 0025; (c) every earlier fingerprint file byte-identical except exactly §12.3's rows (changed rows field by field, added / removed rows by name; anything else fails); (d) `0025_tests.sql`, then **every earlier test file**; (e) re-apply 0025: no second seed, nothing logged, `0025_tests.sql` again; (f) every case of `0025_grading_cases.json` through the SQL functions; (g) the undo script of §12.6 0025g exactly as written: refuses while any grading row / make-up / send / download / changed text / `age_kept` exists; on a clean copy, the fingerprints return to step (a) and the 0016 / 0024 tests pass; then 0025 again; (h) re-run detection: re-apply 0016 and (separately) 0024 over 0025 on a copy → `check | rerun` says RE-RUN; re-apply 0025 → `ok`; (i) **speed with seeded volume** (PGlite sorts text differently and hides slowness on small data): **six years of cycles — 12 cycles × 60 candidates, a third of them make-ups**, every subject graded — `bb_grading_grid` and `bb_cycle_results` (one Dan and all Dans) each under **200 ms**, `bb_makeup_list` under **300 ms**, one `bb_set_grade` under **50 ms**, one `bb_purge_due()` over the whole seed under 2 s.
- **`step0025_production_order`**: a fresh database in the **production order with every live migration** (today 0001–0006, 0010, 0007, 0008, 0009, 0012, 0015, 0011, 0019, 0014, 0020, 0013, 0017, 0018, 0016, 0021, 0022, then 0023 and 0024 in the order production got them — the builder confirms from the status files and lists it), then 0025: every other fingerprint as §12.3, every test file passes, 0025's fingerprints equal `step0025`'s.

### 12.6 `supabase/SETUP.md` — `## Migration 0025: Black Belt grading and results (rulebook v0.938–v0.955)`
`### 0025a. Before you apply` (Claude, read-only: no `bb_grades` yet; 0016 and 0024 fingerprints = the live baseline; counts of cycles and candidates; advisor and whole-database snapshot baselines) · `### 0025b. Apply 0025` (Jeffrey, SQL Editor; the destructive-operations warning is expected) · `### 0025c. Read-only checks` (Claude: `0025_fingerprints.sql` = PGlite incl. `check | rerun = ok`; every earlier file identical except §12.3's rows; advisor +15 / +1, nothing else; the three seeded texts) · `### 0025d. Run the tests` (Jeffrey: `0025_tests.sql`, then `0024_tests.sql` and `0016_tests.sql`; UIDs back to placeholders) · `### 0025e. What the app needs` (deploy the new front end with Jeffrey's OK; the answers are additive, so the live app keeps working in between) · `### 0025f. Hand-fix check` (a read-only query listing grade and count rows whose subject id, way or item isn't in the cycle's copy — run after any hand fix of a locked rubric) · `### 0025g. Undo 0025` (only with Jeffrey's OK): `supabase/manual/0025u_undo.sql` **refuses unless no grading row, make-up candidate, send, download row, changed text or `age_kept` value exists**; drops the new functions, triggers and tables, and puts back **exactly** the `bb_candidates_before_write` arguments, `not null` on `cycle_plan_id`, `bb_candidates_reference_key`, the `source` check, `bb_candidates_rules`, `bb_candidates_log`, `bb_purge_due_on`, `bb_purge_due` and every replaced 0016 / 0024 function — **from copies kept in the script**, never by re-running 0016 or 0024 (0024 warns that re-running 0016 undoes 0024). One warning line each under SETUP's 0016b and 0024b: "After migration 0025, never re-run this file except through 0025g."

---

## 13. Data layer (Builder B)

### 13.1 Pure modules (no React, no supabase; imported by the screens, the preview store and `checks.mjs`)
- **`src/lib/blackBelt/grading.js`** — the **JS twin of §4**: `gradeResult(dan, age, grades, counts, retest, chosen, today, submissionsDue)` returning exactly §4.2's object (**snake_case keys, as the SQL** — it is compared 1:1 with the fixture; the wrappers' own fields stay camelCase, as 0024 §10.1), `ageGroups(dan)`, `measuredLetter(way, age, value)`, `extraPoints(extra, counts)`, `keptMatch(…)`, `resultKeyInput(status, total, needs)` + `resultKey` (0024's `md5Hex`), every sum through `round2`; `trimScaleText(n)` (263 → "263", 300.90 → "300.9"); measured formats per unit (G 4; OI-7): `parseMeasured(unit, text)` / `formatMeasured(unit, value)` (count / reps / kicks whole; inches whole or .5, Long jump also "70 in = 5 ft 10 in"; seconds one decimal; minutes m:ss ↔ 4-decimal minutes, §1.4; 0–999 else "Type a number from 0 to 999."); `cutoffWords(way, ageGroup, letter)` ("31 sec or more", "8:30 or less", "under 19 sec", G 3); `startingTicks(result, dan)` (Star v0.513 word for word: every subject below B, or — when none is below B — every subject tied for the lowest grade; rubric order among equals, G 21); `bestCase(result, dan, ticked)` (G 22: ticked subjects at A+); `leftWords` / `notFinishedWords` (G 7 vs R 10). Letters come from `rubric.js` (`partLetters`, `subjectLetters`).
- **`src/lib/blackBelt/resultEmail.js`** — copied from Star's `src/lib/star/resultEmail.js` with Black Belt names: `RESULT_SUBJECT` = "Your black belt testing result — U.S.T.C."; `resultTextProblem(kind, body)` (the twin of §2.4, same yes/no; R 25's messages); `blankValues(answer)` from `bb_result_email`'s raw answer — `{first name}`, `{full name}`, `{cycle}` (cycle name), `{Dan}` ("1st Dan"), `{total}` / `{pass mark}` (`trimScaleText`), `{subjects to work on}` / `{D subjects}` (Star's `joinNames`), `{below-pass-mark note}` (Star's sentence, only for reasons `d` + `below`: "[first]’s total is also below the pass mark; only the D subject is tested again." / "subjects are"); `fillBlanks`, `buildResultMessage`, `mailtoFor` (subject only, Star's encoding); `csvFileName(cycleName, day)` = `Spring-2027-Black-Belt-results-2027-06-09.csv` (R 45); `csvRows(answer)` → R 47's 21 columns in order with R 48's values, UTF-8 with BOM (R 49).

### 13.2 `src/lib/blackBelt/gradingApi.js` (new) and `api.js`
Same rules as CONTRACT-0016-B1 §1.1 (normal POST RPCs — the CSV writes; `{status:'error'}` on a dropped connection; `no_access` → the app's handler; never throws).
| Function | Calls | Answers |
|---|---|---|
| `loadGradingGrid({cycleId, dan})` | `bb_grading_grid` | `{status:'ok', today, cycle, rubric, danCounts, rows, loadedAt}` |
| `setGrade({candidateId, dan, subjectId, letter})`, `setMeasured({…, value, way})`, `setCount({…, itemName, count})` | the three writes | `{status:'ok', result, …}` · `kept` · `stale` · `withdrawn` · `invalid` · `not_found` |
| `setMakeupSubjects({candidateId, expectedIds, ids})` | `bb_set_makeup_subjects` | + `already_added` · `not_allowed` |
| `loadMakeupList({cycleId})`, `addMakeup({cycleId, earlierCandidateId})` | | `{status:'ok', id, reference, version, keptCount, retestCount}` · `already_added` · `choice_needed` · `stale` · `finished` |
| `loadResults({cycleId, dan})` | `bb_cycle_results` (`dan` null = all) | |
| `loadResultEmail({candidateId})`, `markSent({candidateId, expectedResultKey})`, `undoSent({sendId})` | | + `not_finished` · `no_email` |
| `downloadCsv({cycleId})` | `bb_results_csv` | rows → `csvRows` |
| `loadResultTexts()`, `setResultText({kind, expectedVersion, body})` | select `bb_result_texts` (granted columns), `bb_set_result_text` | |
| `loadGradingState({cycleId})` | `bb_cycle_grading_state` | |
`api.js`: `BB_STATUSES` gains `kept`, `already_added`, `choice_needed`, `not_finished`, `no_email`, `has_grades`; `updateCandidate` returns `has_grades` with `gradeCount`, `countCount`, `chosenCount`; new `updateCandidateClear(…, expectedGradeCount, expectedCountCount, expectedChosenCount)`; `deleteCandidate` / `deleteCycle` / `updateCycle` / `saveCycleDan` / `undoCycleDan` pass `has_grades` through; `loadRoster` / `loadCandidate` map the four new keys (`isMakeup`, `makeupOfCycleName`, `retestNames`, `hasGrades`).

### 13.3 Preview store (Builder B) — `mockGrading.js`, hooked into `mockBlackBelt.js`
- New tables `bb_grades`, `bb_extra_counts`, `bb_makeup_subjects`, `bb_result_sends`, `bb_downloads` (internal, never selectable) and `bb_result_texts` (selectable, granted columns, seeded with §2.4's texts); the `bb_candidates` make-up columns (never selectable). Every RPC of §7 and the changed 0016 / 0024 ones mirror the SQL: same check order and statuses, `gradeResult` as the result, `keptMatch` for Add make-up, the 10-second own undo, purge-day masking, Q-G1 / S2 / Q-G3 / Q-G4 rules, the `for share`-free single-threaded equivalents.
- `loadSample()` gains the shared cast: Spring 2027 graded as of 2027-06-09 and Fall 2027 with Mia Chen's make-up (so the walkthrough shows every drawn state); a new console helper `__tkdPreview.loadBlackBeltGradingSample()` (one line in `mockClient.js`); `simulateOtherAdminEdit()` also changes one grade (the 15-second refresh shows it); `failNextSave('blackBelt')` covers the new writes; `expireUndo()` also ages the newest send by 11 seconds.
- **`checks.mjs`** adds: every `result_cases` and `kept_cases` entry through `grading.js` (must equal `expect`); `resultTextProblem` against §2.4's cases; the seeded texts equal the migration's (md5); the store's rules (one check per status of §1.2); `csvRows` column order; m:ss round trips (8:30, 8:40, 8:13, 12:40); prints `ALL BLACK BELT LIB CHECKS PASSED`.

---

## 14. Screens (Builders C1–C3) — exactly as approved

### 14.1 Page addresses (C2 rules, v0.937; Builder B)
`#testing/black-belt/cycle/<id>/grading` (Grading tab) and `#testing/black-belt/cycle/<id>/results` (Results tab), beside the existing `…/cycle/<id>` (Candidates) and `…/cycle/<id>/rubric`. `pageAddress.js`: the cycle pattern becomes `/cycle/${ID}(/rubric|/grading|/results)?`; `routeTab` for a Black Belt cycle page returns `'grading'`, `'results'` or `'rubric'` when asked, else `'candidates'`. Refresh and bookmarks open that tab; Back / Forward step between tabs; with the Star switch off they work the same. The day and Dan chosen on Grading are **not** in the address. Leaving Grading with Not-saved cells asks first (Star's leave question, G 8) through the existing leave guard.

### 14.2 Grading tab (C1) — `src/blackBelt/staff/grading/`
Tabs **Candidates · Grading · Results · Rubric** (v0.946) on `CyclePage.jsx`.
| Piece | Rules |
|---|---|
| `GradingTab.jsx` | day switch (G 1: one choice per testing day "Sat, Apr 3 · Physical", plus **Other requirements** and **Extra points**; gray selected side; one row at 1280 and 820, a Day dropdown on phones and 320); opens on today's day else the next, after the last day the last (G 28, from `today`); Dan switch with counts following the location switcher (G 29); Print grading sheet; the hand-in line on Other requirements (G 16); the to-confirm line (G 20); a day with two parts → a thin band naming the parts (G 11); staff = admin view minus Choose subjects (G 31); offline banner and lock behaviour (G 32); 15-s quiet refresh (S22) |
| `GradeGrid.jsx` (copied from Star's) | a candidate per row; only that day's parts' subjects; tilted headings with credits and a gray unit / "outdoor" line (G 6); Total and Result at the right end on PC and sideways tablet; **upright 820: Total and Result under the name** so cells stay ≥ 44 px (G 9); "—" for not-for-this-age (G 13); Late cell (G 17); D amber; unfinished rows "N so far" and "N of M left" / "[subject] late (due …)" (G 7); Not started (G 30); **make-ups grouped at the bottom of each Dan under the amber band "Make-ups · N — only the outlined subjects are graded"** (#faeeda / #8a5a00, semibold), each with the amber **Make-up** pill and the gray "from Spring 2027 · retests Free sparring" line, kept cells gray "kept", only gradable cells open with the blue outline (G 14, v0.947) |
| `GradeCell.jsx`, `MeasuredEditor.jsx` | the letter list per part with D amber and Clear, next cell to the right after a choice (G 12); measured cell: number on top, worked-out grade under it, "·" when empty; the small editor with unit, the way switch (Pull-up first; "Hold" written before the number only when Hold was done; 44 px on touch), the cut-off reached in the rubric's words; Enter saves and moves down, Tab right, Esc closes (G 3–G 5) |
| `CountBox.jsx`, Extra points grid | a count box per item, points under it ("+5", gray "+0"), Extra column ("+12"), Total, Result; kept counts gray "+15 kept" (G 18, G 36) |
| `GradeCard.jsx`, `PickerSheet.jsx` (copied from Star's) | phones: one candidate (◀ picker ▶) in the same order as the grid (own, then make-ups); measured lines with a 92 px number field and the worked-out grade; the step rules under each extra item (G 10, G 18) |
| `useBbGradingSaves.js` (copied from Star's `useStarGradingSaves.js`) | one save per cell, saved as you go, Not saved / Retry (44 px on phones), never overwritten by the refresh while in flight; a measured number counts as a "grade", an extra count as a "count" in every message (G 8); the result shown is the server's answer; kept on lock and resent after unlocking (G 32) |
| `MakeupSubjectsDialog.jsx` (Choose subjects, admins; used from Grading and Results) | G 21–23: lowest grade first with part and credits (measured: the number), Star's starting ticks, the best-case line (amber when even all A+ stays below), title / summary / note wording; phones full screen with Save at the top; `stale` / `already_added` messages (new wording, marked) |
| `GradingSheet.jsx` | G 33–35: one per day (and Other requirements, Extra points) and Dan, both schools, landscape Letter, 14 rows a page + two "Added on the day:" rows, repeated header "(continued)", footer, the day's time and place; unit headings; "Pull-up · Hold" to circle; letters at the top of graded columns; kept gray; "—"; the make-up band and label in black and white; **never** DOB, email, payments or grades already entered |

### 14.3 Results tab (C2) — `src/blackBelt/staff/results/`
R01–R06 exactly: Dan switch with counts and the summary line (R 3), Print results and Download CSV (admins) at its right (R 2); rows in roster order (R 4) with Total + "pass 275" (R 5), one tag + reason (R 6, R 10), the gray "Make-up from Spring 2027" line (R 7), Email result only on Passed and on Make-up rows that can say what to work on (R 8 — **with Q-G6 B also on an incomplete Make-up · D**), the ⋯ menu (Open grades → the Grading address on that Dan and day, Mark as sent, Undo Mark as sent; R 17); layouts per size (R 9); Choose subjects 44 px tap area (R 11). Email result (R 12–14, R 19–20) through `bb_result_email` + `resultEmail.js`; Mark as sent + toast Undo (R 15), admins' later undo confirm (R 18), "Not sent yet · an earlier Passed result was sent Jun 7" (R 16). Edge states R 30–37 (Worcester device, empty Dan, no grades yet, **no email on file — "No email on file — deleted after the keeping time."**, staff view, offline bar, Hide payments, loading / couldn't load). `ResultsSheet.jsx` R 38–44 (whole cycle, both schools, Dan bands with pass marks, "Needs: …" / "Still to grade: …" / "Still to hand in: …", black-and-white borders, never emails / DOB / payments / extra details / sent / staff names). CSV R 45–49 (toast with the privacy sentence, no Undo; "Only an admin can download the CSV.").

### 14.4 Result emails block and dialog (C2) — Rubric and prices
`rubric/ResultEmailsBlock.jsx` between the Keeping block and the Default rubric card (R 21): a row per email with the start of its text, Edit icon for admins; staff read-only under "View only. Ask an admin to make changes."; the fixed subject line (R 28). `rubric/ResultTextDialog.jsx` (copied from Star's `ResultTextDialog.jsx`, R 27): insert-a-blank buttons (44 px on touch), live preview with a real candidate of that kind from the newest cycle, Reset to the starting text (§2.4's texts, kept in `resultEmail.js`), R 25's checks blocking Save, version check, toast "Result email saved" with Undo, "Last changed by …"; phones full screen; Discard is a plain link (v0.932).

### 14.5 Candidates and cycle changes (C3)
- **Add candidate** becomes a menu: "New candidate" (`ti-user-plus`) and "Make-up from an earlier cycle…" (`ti-history`); phones a bottom sheet with Cancel (G 24). `candidates/MakeupPickerDialog.jsx` (copied in pattern from Star's): search by name, grouped by earlier cycle newest first, name / Dan / school / age group, what is retested, the match preview lines ("+ Breaking class, new in Fall 2027"; dropped items named), Add, "Already added", Choose subjects (admins, 44 px) / "An admin chooses the subjects first" (staff) on `choice_needed` (G 25, G 26). Toast "Mia Chen added · make-up from Spring 2027 · Undo" — Undo for admins only (G 27, v0.913).
- **The make-up row** in the roster and detail: Plan "No fee", gray "Make-up" tag in Payments, Balance "—", second line "Make-up from Spring 2027 · retests Free sparring", its earlier BB reference; no Change plan, no Record payment, no refund, **no Dan field in Edit details** (G 27, DC 4).
- **Dan-change dialog** `candidates/DanChangeDialog.jsx` (v0.955, DC 1–5): shown only when `updateCandidate` answers `has_grades`; title "Change Alex Kim to 2nd Dan?"; body "The 9 grades entered for 1st Dan subjects will be cleared. 2nd Dan has different subjects. This can't be undone." (with counts: "The 9 grades and 4 extra-point counts entered for 1st Dan will be cleared."; chosen subjects named the same way); Cancel and the red "Change Dan and clear 9 grades" (", 4 counts"); centred on PC / tablet (44 px on touch), full screen on phones with the red button on top; `has_grades` from `updateCandidateClear` → "Alex Kim's grades changed. Check the number and try again." and the question reopens with the new counts.
- **Has grades refusals:** Delete permanently grayed with "[Name] has grades, so they can't be deleted. Withdraw them instead." (v0.950; from `hasGrades`, and on a `has_grades` answer); Delete cycle the same for the cycle (new wording, marked); Edit cycle uses `bb_cycle_grading_state` to gray the first day, earlier-day adds and protected past days with a gray reason (new wording, marked), and maps `has_grades`.
- **Rubric tab of a cycle** (`cycle/CycleRubricTab.jsx`): with grading started, the locked view with `ti-lock` and "Grading has started, so this rubric is locked." (Q-G1 / v0.948; new wording, marked); a `has_grades` answer reloads into it.
Wording not in the mockups goes into the screens' `text.js` marked `// new wording, not in the mockups`.

### 14.6 Checks before a builder is done
`npm run build` and `npm run build:preview-mode` pass; `node src/lib/blackBelt/checks.mjs` and every other lib checks file pass; Function tests pass unchanged; PGlite `node run.mjs` all green (A); the live build contains no preview store, no `mockGrading` and no helper names (v0.917's check).

---

## 15. Build phases and checkpoints (0025's own CP numbers)

| Phase | Builder | Starts when | Output |
|---|---|---|---|
| **P1 Database** | A | CP0 | §2–§12: migration, tests, fingerprints, fixture (**written first**, so B can use it), run.mjs steps, SETUP, undo script |
| **P2 Data layer** | B (parallel to P1, from the fixture) | CP0 + the fixture file | §13, §14.1 |
| **P3 Grading screens** | C1 | P2's `gradingApi.js` + preview store | §14.2 |
| **P4 Results and texts** | C2 (parallel to P3) | same | §14.3, §14.4 |
| **P5 Candidates and cycle** | C3 (parallel to P3 / P4) | same | §14.5 |
| **Reviews** | separate agents | each phase done | security review (P1 SQL line by line: grants, RLS, definer checks, guards and tags, lock order, privacy keys, purge, undo script, the 0016 / 0024 test edits; P2 / P5 for privacy keys in the store and screens); design review (P3–P5 against the rulebook and the approved mockups, screenshots at **1280×800, 820×1180 touch, 390×844 touch, 320 wide**, incl. the printed sheets) |

| CP | What | Done when |
|---|---|---|
| **CP0** | This contract → security review of the contract → Jeffrey's OK | OK recorded in the rulebook (next free number in 0.900–0.999: **0.956**; re-read the rulebook and `git merge main` first) |
| **CP1** | P1 + P2's `checks.mjs` fixture green → security review of the SQL → fixes → Jeffrey's OK **for the paste** (plan §9 step 3) with the run sheet `TKD-BlackBelt-0025-RunSheet.md` (shape of the 0024 run sheet: 0 already checked · 1 just before (no `bb_grades`, counts, baselines: every fingerprint file, whole-database snapshot outside Black Belt, advisor) · 2 paste · 3 right after (`0025_fingerprints` = PGlite; three texts) · 4 nothing else moved (§12.3's rows only) · 5 advisor (+15 / +1) · 6 tests (0025, 0024, 0016, then 0006, 0011, 0018) · 7 wrap-up · if something goes wrong (0025g)) | Jeffrey's OK |
| **CP2** | **Paste on production** (Jeffrey, SQL Editor; Claude's read-only checks) | all run-sheet steps pass, status file updated |
| **CP3** | P3–P5 → design review + security review → fixes → **preview walkthrough** with Jeffrey (`npm run dev:preview-mode`, `loadBlackBeltGradingSample()`): every Grading day and Dan, measured entry and two ways, Late, Extra points, Choose subjects, the make-up band, phone card, print sheets; Results, Email result, Mark as sent / Undo / changed since sent, texts dialog, CSV; Add make-up and its Undo; Dan-change dialog; has-grades refusals; Rubric locked by grading | Jeffrey's OK |
| **CP4** | **Deploy**: the Main session merges `black-belt` into `main`; Jeffrey OKs the push; check the live build (v0.917) and, read-only, the live Grading and Results tabs | live |
Between CP2 and CP4 the live (old) app keeps working: every replaced read only **adds** keys; the old roster still lists every row (no make-ups or grades exist until the new screens create them); the old Edit details, Delete and Edit cycle get `has_grades` only when grading rows exist, which only the new screens write. Builder C3 confirms this in the preview with the old build's Candidates screens before CP2. Jeffrey may also choose to hold the paste until after CP3 (then CP2 and CP3 swap; nothing else changes).

---

## 16. Open items (each with the working default the builders use)

| # | Item | Working default |
|---|---|---|
| **OI-1** | Q-G4's confirm needs an "expected counts" argument (DC 5), but adding it to `bb_update_candidate` changes its signature and breaks the live app between paste and deploy | **Keep `bb_update_candidate`'s 8 arguments** (it answers `has_grades` + counts and writes nothing), and add **`bb_update_candidate_clear`** with the three expected counts (§7.1). Both call one internal core (`bb_update_candidate_core`, no grant) so the checks can't drift. The app calls the first, shows the dialog, then the second |
| **OI-2** | v0.948 says the first grading row locks the copy "for good"; a stored "grading started" stamp would need the grade writes to update the cycle row (a lock upgrade from `for share`, deadlock risk) | **Live check** (`bb_cycle_has_grading`): the copy is locked while any grading row exists; if every row is cleared again, the copy is editable again — harmless, since nothing is then scored against it. Flag to Jeffrey once at CP0 |
| **OI-3** | Plan §7 says Add make-up reads the earlier candidate without locks (Star); then Choose subjects on the earlier row can change the chosen set while a make-up is being copied from it (the unique index doesn't cover that race) | Add make-up takes the earlier candidate row **`for share`** after locking its own cycle. Order is safe: a later cycle → an earlier candidate, never the reverse (an earlier cycle can't add a make-up from a later one) |
| **OI-4** | A Dan change on an earlier candidate whose make-up is already on a later cycle (the make-up then has the wrong Dan) | **Refused** (`already_added`): Undo the make-up first, then fix the earlier row (Q-G4's note). Same in `bb_update_candidate_clear` |
| **OI-5** | Plan §5.2 says `bb_result_email` returns "the blank values" | It returns the **raw values** (names, cycle, Dan, total, pass mark, reasons, needs and D names); the app fills the wording with `resultEmail.js` copied from Star (no English sentences in SQL; Star does the same). The below-pass-mark sentence is Star's |
| **OI-6** | Does Add make-up run the purge as its last step? | **Yes**, as `bb_add_candidate` (a desk action, not mat-side; S22's "no purge" is about reads) |
| **OI-7** | Number formats for a measured unit the admin typed that isn't one of G 4's (count, reps, kicks, inches, seconds, minutes) | By the unit's first word: `minute…` → m:ss; `second…` → one decimal; `inch…` → whole or .5; `count`, `rep…`, `kick…` → whole; anything else → up to 2 decimals. The server accepts any 0–999 with ≤ 4 decimals regardless |
| **OI-8** | Can a hand fix change `age_kept`? | **No** (Q-G2 safeguard 2: never changed); only the undo script's "refuse while any `age_kept` exists" path. A wrong kept age is fixed by Jeffrey disabling the trigger in the SQL Editor, deliberately |
| **OI-9** | A paper waiver or receipt on a make-up row | **Unchanged** 0016 functions: the parent-signature warning never shows on a make-up row (no waiver row → `needs_parent_signature` false), and its receipt shows "No fee". Nothing new is built |
| **OI-10** | An Edit cycle save that deletes the first day and adds a new day on the **same** date in one save is refused by the row-by-row first-day freeze | Accepted (`has_grades` with the gray reason); edit the existing day instead |
| **OI-11** | `bb_set_grade` / `bb_set_measured` as one function or two (plan §11 "left for the contract") | **Two** functions: clearer arguments and refusals; the save engine routes by subject scoring |

---

## 17. Function list (for G17 and the fingerprints)

**New staff writes (9, `authenticated`):** `bb_set_grade(uuid, integer, text, text)`, `bb_set_measured(uuid, integer, text, numeric, integer)`, `bb_set_extra_count(uuid, integer, text, integer)`, `bb_set_makeup_subjects(uuid, text[], text[])` (A), `bb_add_makeup(uuid, uuid)`, `bb_mark_result_sent(uuid, text)`, `bb_undo_result_sent(uuid)`, `bb_set_result_text(text, integer, text)` (A), `bb_update_candidate_clear(uuid, integer, text, text, date, text, text, integer, integer, integer, integer)`.
**New staff reads (6, `authenticated`):** `bb_grading_grid(uuid, integer)`, `bb_cycle_results(uuid, integer)`, `bb_makeup_list(uuid)`, `bb_result_email(uuid)`, `bb_results_csv(uuid)` (A, volatile), `bb_cycle_grading_state(uuid)`.
**Replaced (same signatures and grants):** 0016 `bb_purge_due_on(uuid)`, `bb_purge_due()`, `bb_update_cycle(uuid, integer, jsonb)`, `bb_delete_cycle(uuid, integer, integer)`, `bb_update_candidate(uuid, integer, text, text, date, text, text, integer)`, `bb_change_plan(uuid, integer, uuid, boolean)`, `bb_restore_candidate(uuid, integer)`, `bb_delete_candidate(uuid, integer)`, `bb_cycle_roster(uuid)`, `bb_candidate_detail(uuid)`; trigger functions `bb_candidates_rules()`, `bb_candidates_log()`; 0024 `bb_save_cycle_dan(uuid, integer, integer, jsonb)`, `bb_undo_cycle_dan(uuid, integer, integer)`, trigger function `bb_cycles_rules()`; the trigger `bb_candidates_before_write` (arguments).
**New internal (no grants):** `bb_grade_result(jsonb, integer, jsonb, jsonb, text[], text[], date, date)`, `bb_age_groups(jsonb)`, `bb_measured_letter(jsonb, integer, numeric)`, `bb_extra_points(jsonb, jsonb)`, `bb_kept_match(jsonb, jsonb, jsonb, jsonb, integer)`, `bb_result_text_problem(text, text)`, `bb_candidate_age(uuid)`, `bb_candidate_grading_input(uuid, integer)`, `bb_candidate_result(uuid)`, `bb_candidate_result_with(public.bb_candidates, jsonb, date, date, date)`, `bb_cycle_has_grading(uuid)`, `bb_candidate_has_grades(uuid)`, `bb_sent_state(uuid, jsonb)`, `bb_lock_candidate_shared(uuid)`, `bb_update_candidate_core(uuid, integer, text, text, date, text, text, integer, integer, integer, integer)` (OI-1: the clear function's 11 arguments; the three expected counts null = the 8-argument behaviour, never clearing); trigger functions `bb_grades_rules()`, `bb_extra_counts_rules()`, `bb_makeup_subjects_rules()`, `bb_result_sends_guard()`, `bb_downloads_guard()`, `bb_payments_makeup_guard()`, `bb_cycle_days_grading()`, `bb_cycle_day_parts_grading()`.
The builder's G17 list is exactly these names; anything else needed is reported first.
