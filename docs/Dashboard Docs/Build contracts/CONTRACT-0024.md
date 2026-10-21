# Contract 0024 — Black Belt rubric editor (migration `0024_black_belt_rubric.sql`)

**Status: DRAFT for review (2026-10-21).** Not approved. Nothing is built from it until Jeffrey OKs it (0024 CP0, §13), after a security review of this contract. Build and test locally only; nothing is applied to Supabase and nothing is pushed without his OK for that specific step. **Migration number 0024 is reserved** (Main session, 2026-10-21; 0022 = camps, 0023 = Star).

The single source of truth for three builders: **A — database** (the migration, its tests, fingerprints, the PGlite step, the SETUP section, the run sheet), **B — data layer** (`api.js`, the pure rubric module, the preview store, `checks.mjs`) and **C — screens** (the editor R1–R14 and the family form's requirements panel). If something here is impossible or contradicts the sources below, **stop and report it** — do not improvise. Undecided points are in §14 with a working default; builders use the default.

| Source (in this order of authority) | |
|---|---|
| This contract | wins for 0024 |
| Rulebook `docs/Dashboard Docs/TKD-Dashboard-Design-Guidelines.md`: rows **v0.921–v0.933** (rubric editor), v0.902, v0.210, v0.212 (registration), §5 privacy, §7 colours, §8 forms/toasts. The newest row wins (v0.930 changes v0.210; v0.933 changes the approved Add cycle screen) | v0.933 |
| Mockups `docs/Testing/Black Belt Testing/TKD-BlackBelt-Rubric-Mockups.html` R1–R14 (approval pending; their "Proposals" list is what Jeffrey still confirms in the screen-by-screen pass) | wording and layout |
| Live code: `supabase/migrations/0016_black_belt.sql` (**live in production — never edit**), `CONTRACT-0016.md`, `CONTRACT-0016-B1.md`, `CONTRACT-0016-B2.md`, `supabase/tests/0016_seed_review.txt` (the CP1-approved numbers) | patterns and numbers |
| Handoff `docs/Dashboard Docs/TKD-Dashboard-Handoff.md` §6 and `CLAUDE.md` (security rules, non-negotiable) | |
| `0006_star_testing.sql` (`star_update_dan_settings` and friends) | pattern for versions and statuses |

**Working copy:** the Black Belt worktree, branch `black-belt`. Before writing SQL: `git merge main` (so 0022 / 0023 and everything live are present). No Supabase connector calls, no Cloudflare, no remotes, no other worktree. Builders don't commit; the orchestrator commits after reviews.
**Audience:** Jeffrey is learning IT — every new file starts with a header comment (what + why); short plain-English comments on non-obvious lines; readable over clever. **CRLF line endings** like the neighbouring files.

**Words used in this contract (one line each):**
- *Rubric*: what each Dan is tested on — the four parts, their subjects, how each is scored, the points, the pass marks and the extra points.
- *Default rubric*: the copy on Rubric and prices that every new cycle starts from (v0.921).
- *Cycle copy*: a cycle's own rubric, copied from the default when the cycle is added; editable until registration first opens, then locked.
- *Draft*: the admin's unsaved edits of one Dan, kept only in the browser until Save.
- *Rev* (revision): a whole number inside each Dan of a rubric, +1 on every save of that Dan. It is the "version check" for that Dan only.
- *Bracket*: an age range "from–to" (from empty = youngest, to empty = and over).
- *Way*: one of at most two ways to do a measured subject (Pull-up or Hold), each with its own unit, direction, brackets and cut-offs.
- *Worked-out points*: credits × that Dan's grade points for the subject's part. *Own points*: points typed per grade.
- *Validator*: the SQL function that checks every value of a Dan before it is stored (and the JS twin that checks while typing).
- *Undo slot*: a small hidden row that remembers what one save or first opening replaced, so the toast's Undo can put it back.
- *Hand fix*: Jeffrey's own SQL Editor session (`session_user = 'postgres'`, no action tag) — the one way to change a locked rubric (v0.921).

---

## 0. Scope

- **In:** the default rubric store; the rubric document **schema_version 2** (§2) and its full validator (§3); the one-time conversion of every v1 sheet with **no number changing** (§4); save / undo per Dan for the default and for a cycle copy (§6); the lock at first opening, first opening admin-only and its Undo (§6.3); Add cycle copying the default and always closed (§6.4); the family form reading v2 (§7, §10.4).
- **Out:** grading, results, make-ups (they will read the locked cycle copy later; §12). No change to candidates, payments, waivers, prices, the purge, `bb_registrar`'s rights, or any non-Black-Belt object.
- **0024 changes no object of 0001–0023 except these 0016 objects** (each replaced with `create or replace` / `drop … if exists` + create, never by editing `0016_black_belt.sql`):

| 0016 object | What changes |
|---|---|
| `bb_cycles_rules()` (trigger function) | requirements may change through the 0024 action tags while never opened; `first_opened_at` may only go null → set (open) or set → null (Undo of the first opening) (§5.2) |
| trigger `bb_cycles_before_write` | recreated with `requirements` as a **no-bump** column, so a rubric save never makes Edit cycle or the registration switch "stale" (§5.2) |
| constraint `bb_cycles_requirements_check` | dropped and re-added, same name, now `check (public.bb_rubric_is_valid(requirements))` (v2 only) |
| `bb_set_registration(uuid, integer, boolean)` | first opening admin-only (v0.930); writes the first-opening undo slot; answer gains `first_open` (§6.3) |
| `bb_add_cycle(jsonb, uuid)` | copies the **default rubric** instead of the source cycle's / starting point's sheet; lock order gains the default row (§6.4). Still always closed (0016 already inserts closed) |
| `bb_public_cycle(text)` | `cycle.requirements` is the v2 **public view** (no revs, no "saved by" names) (§7) |

  Not changed: `bb_cycle_defaults` (the copy is made at save, R14 "Nothing to fill in"), `bb_update_cycle`, `bb_cycles_list`, every candidate / payment / purge function, `bb_requirements_is_valid` (still guards `bb_starting_point.requirements`, which stays v1 as the record of what CP1 approved).
- All new objects are named `bb_…`. **One transaction**, **re-run safe** (`create table if not exists`, `create or replace`, seeds that never overwrite, conversion only of `schema_version = 1` rows). Header comment like 0016's (what / why / what it adds / "Supabase will warn about destructive operations — the words *delete* and *drop* appear in rules and `… if exists` lines; nothing is removed now").
- **File layout:** 1 number and letter helpers · 2 validator · 3 maxima · 4 v1 → v2 conversion and copies · 5 tables (`bb_default_rubric`, `bb_rubric_undo`) · 6 triggers (new + the replaced `bb_cycles_rules` and `bb_cycles_before_write`) · 7 conversion of existing cycles + the new constraint · 8 seed of the default · 9 RLS + grants · 10 staff write functions · 11 replaced 0016 functions · 12 public function.
- **Size:** 2 tables, 5 new staff write functions, 3 replaced functions, 1 replaced trigger function, 14 internal helpers and trigger functions (exact list §15).

---

## 1. General rules

### 1.1 House rules (copied from CONTRACT-0016 §1.1–§1.8, unchanged)
Owner `postgres`; `set search_path = ''`; fully qualified names; `revoke … from public, anon, authenticated, service_role` then only §8's grants; **nothing to `anon` or `service_role`**; staff functions `language plpgsql security definer returns jsonb`; **check order**: 1 `has_data_access()` → `no_access` · 2 role (`is_admin()` → `not_allowed`) · 3 argument shape and content → `invalid` · 4 look up + lock (§1.3) → `not_found` · 5 expected state / rev → `locked` / `stale` · 6 data rules · 8 tag, write, untag, `ok`. Tags via `set_config('tkd.action', …, true)` + a fresh `tkd.batch_id`, reset to `''` after. No argument defaults. Error mapping as 0016 §1.4 (inside `begin … exception … end`).

### 1.2 Statuses new in 0024
| Status | Meaning | Extra keys |
|---|---|---|
| `locked` | a cycle copy save / undo after the cycle's registration first opened (v0.921) | `first_opened_at` |
| `has_registrations` | Undo of a first opening when a family already registered through the form since it opened (§6.3) | — |
| `invalid` (rubric saves only) | the Dan failed the validator | `problems` (array, §3.3; at most 100) |

`stale` also answers an Undo that is no longer possible (a newer save, another admin, or older than 60 seconds). Every other answer is exactly `{status}` unless listed.

### 1.3 Lock order (extends 0016 §1.5)
**`bb_settings` → `bb_default_rubric` → cycle → candidate(s) → payment.** Undo slots are only touched while their parent (the default row or the cycle) is locked, so they need no place of their own.
- Save / undo default Dan: `bb_default_rubric` `for update`. Nothing else.
- Save / undo cycle Dan: the cycle `for no key update` (requirements is not a key). Nothing else.
- `bb_set_registration`, `bb_undo_first_open`: as 0016 (cycle `for update` → its days in id order → its due-date rows in id order).
- `bb_add_cycle`: `bb_settings` `for share` → advisory lock `hashtext('bb_public_code')` → **`bb_default_rubric` `for share`** → the source cycle `for share`.
- The public register's cycle lock (`for no key update`) conflicts with the cycle locks above, so a family registration and an Undo of the first opening never interleave.
- Every function's header comment states its lock order (`-- locks: …`).

### 1.4 Numbers
JSON numbers only (never strings). "A number 0–999 with up to 2 decimals" = `bb_rubric_num_ok(v, 0, 999)`: `jsonb_typeof = 'number'`, in range, and `v::numeric = round(v::numeric, 2)`. Whole numbers = `bb_rubric_int_ok(v, min, max)`. Worked-out points = `credits × grade point` in `numeric` (exact: credits are whole, grade points have ≤ 2 decimals). The JS twin rounds with `Math.round(x * 100) / 100` before comparing or sending.

---

## 2. Storage decision and the v2 document

### 2.1 Decision: one JSON document shape, in two places
**Recommended and specified:** keep the rubric as **one JSON document per place** — each cycle's copy stays in **`bb_cycles.requirements`** (already granted, already read by the family form and the Function), and the default lives in a new one-row table **`bb_default_rubric.sheet`** — both in the **same v2 shape** (§2.2). Each Dan inside carries its own `rev`, so two admins editing different Dans never block each other, and a save replaces one Dan in one `update` (one history row, v0.923).

Why this and not one table row per subject (or per Dan):
- **Nothing downstream moves.** `bb_public_cycle`, the Pages Function (`bbRegister.js` passes `requirements` through untouched) and the cycle page already read the document; a table-per-subject design would need new reads, new grants and a rewrite of the form for no gain.
- **A Dan is saved and checked as a whole** (v0.923): one value in, one validator, one `update`, one `change_log` row. Rows per subject would need many writes per save and a multi-row validator.
- **The lock is one column on one row:** "editable until first opened" is a trigger rule on `bb_cycles` (§5.2), next to the existing hand-fix rule.
- **Grading later** reads the locked copy; subjects have stable `id`s for that (§2.2).
- Cost, accepted: `change_log` stores the whole document before and after each save (≈ 46 KB raw each side, far less after Postgres compresses it; a few MB over years on a 500 MB plan). Per-Dan rows would be ¼ of that; not worth a second shape.

Rejected: (B) per-Dan rows for both stores, with `bb_cycles.requirements` kept in sync or frozen — two copies of the truth during the change-over, and new reads for the form. (C) a default only, cycles read through it — contradicts v0.921 (a cycle's copy is its own).

### 2.2 The v2 document (exact keys; any other key → problem `shape`)
```
Rubric   { "schema_version": 2, "source": text 1–100, "dans": [Dan, Dan, Dan, Dan] }   dans 1, 2, 3, 4 in order
Dan      { "dan": 1–4, "rev": int ≥ 1, "saved_at": "YYYY-MM-DDTHH:MM:SSZ" | null, "saved_by_name": text ≤ 60 | null,
           "pass": Pass, "parts": [Part × 4], "extra_points": Extra }
Pass     { "brackets": [ {"from": age|null, "to": age|null, "pass_mark": n} ] (1–6),
           "no_d": boolean, "makeup": text 0–300 }
Part     { "code": "physical"|"technical"|"curriculum"|"other" (exactly these four, in this order),
           "name": name, "grade_points": {letter: n} (the part's letters, §2.3), "subjects": [Subject] (1–30) }
Subject  { "id": ^[a-z0-9]{8}$ (unique in the Dan), "name": name, "credits": int 1–20,
           "scoring": "graded"|"measured", "ways": [Way] (graded: [], measured: 1–2),
           "points_mode": "worked"|"own", "points": {letter: n} (the subject's letters, §2.3),
           "limited_to": null | [ {"from": age|null, "to": age|null} ] (1–6, each = one of the Dan's pass brackets),
           "outdoor": boolean, "handed_in": boolean, "note": text 1–200 | null }
Way      { "name": name | null (required and different when there are two ways), "unit": text 1–40,
           "direction": "at_least"|"at_most"|"under",
           "brackets": [ {"from": age|null, "to": age|null, "cutoffs": {"A+": n, "A": n, "B+": n, "B": n, "C": n}} ] (1–6) }
Extra    { "counts_toward_total": boolean, "limit": n|null, "to_confirm": boolean, "note": text 1–200 | null,
           "items": [ {"name": name, "rule": {"kind": "per_count", "points_each": n}
                                         | {"kind": "steps", "steps": [ {"at_least": int, "points": n} ] (1–10)}} ] (0–12) }
```
- `name` = `testing_name_is_valid` and already normalized (`= testing_normalize_name(name)`); the client normalizes before sending. Texts (`unit`, `note`, `makeup`, `source`) = equal to `testing_normalize_note(text)` and within their length.
- `age` = whole number 0–99. `n` = 0–999 with ≤ 2 decimals (pass marks: 1–9999 with ≤ 2 decimals; extra `limit`: 1–999).
- **Server-owned keys:** `rev`, `saved_at`, `saved_by_name` are written only by the save / undo functions. A sheet sent to a save function may carry them; they are ignored and replaced.
- **Worked out, never stored:** a part's maximum, the most points per bracket, the hand-in list (= subjects with `handed_in`), bracket names ("8 and under", "9–12", "13 and over", "All ages").
- **Stored although derivable:** a worked-out subject's `points` are stored too, and the validator requires them to equal `credits × grade_points` exactly. Readers (the form, later grading) never compute points, and "no number changed" is a direct comparison.

### 2.3 Grade letters (fixed per part, v0.922 proposals)
| | Letters |
|---|---|
| Physical `grade_points`; a graded Physical subject's `points` | `A+ A B+ B C D` |
| Technical, Curriculum, Other `grade_points`; a graded subject's `points` there | `A+ A A- B+ B B- C C- D` |
| Any **measured** subject's `points` (any part) | `A+ A B+ B C D` (worked out from the part's values for those six letters) |
| Every way's `cutoffs` | `A+ A B+ B C` (below C is a D) |

### 2.4 Tables
**`public.bb_default_rubric`** — one row.
| Column | Type | Rule |
|---|---|---|
| `id` | uuid pk `bb_default_rubric_pkey` | |
| `singleton` | `boolean not null default true` | `bb_default_rubric_singleton_key unique`, `check (singleton)`; never granted |
| `sheet` | `jsonb not null` | `bb_default_rubric_sheet_check check (public.bb_rubric_is_valid(sheet))` |
| house columns | | as 0016 §1.8 (`version`, `created_*`, `updated_*`); `created_by`, `updated_by` never granted |
Triggers: `bb_default_rubric_before_write` (`bb_before_write('id,singleton', '')`), `bb_default_rubric_guard` (§5.1), `bb_default_rubric_log` (`change_log_write`), `bb_default_rubric_no_truncate`.

**`public.bb_rubric_undo`** — the undo slots (never granted, RLS on, **no policy**).
| Column | Type | Rule |
|---|---|---|
| `id` | uuid pk | |
| `kind` | `text not null` | `in ('default_dan','cycle_dan','first_open')` |
| `cycle_id` | `uuid null` | FK → `bb_cycles` **on delete cascade**; `(kind = 'default_dan') = (cycle_id is null)` |
| `dan` | `smallint null` | 1–4; `(kind = 'first_open') = (dan is null)` |
| `previous` | `jsonb not null` | the Dan object the save replaced, or `{"registration_open": false, "first_opened_at": null, "auto_close": b}` |
| `after_version` | `integer not null` | the Dan `rev` (or the cycle `version`) the save produced; Undo only applies to exactly that |
| `saved_by` | `uuid null` | `auth.uid()` of the saver; never granted |
| `saved_at` | `timestamptz not null default now()` | |
Unique index `bb_rubric_undo_slot_key unique nulls not distinct (kind, cycle_id, dan)` (one slot per Dan or per cycle; a new save replaces it). Triggers: `bb_rubric_undo_guard` (§5.1), `bb_rubric_undo_log` (`change_log_write` — logged like every table), `bb_rubric_undo_no_truncate`.

---

## 3. The validator — `bb_rubric_dan_problems(p_dan jsonb, p_dan_no integer) returns jsonb` (immutable, internal)

Returns `[]` when the Dan is valid, else an array of problems (§3.3) in walk order (pass → parts in order → subjects in order → ways → brackets → extra points), at most 100. **It reads no table.** `bb_rubric_is_valid(p_doc jsonb) returns boolean` (immutable) = the outer shape of §2.2 (exact keys, `schema_version = 2`, 4 Dans numbered 1–4 in order, `octet_length(p_doc::text) ≤ 200000`) **and** `bb_rubric_dan_problems(dan, n) = '[]'` for each Dan, with `rev ≥ 1` and the stamp keys of the right type.

### 3.1 Rules (every rule in mockup R8 and the R4–R7 limits)
| # | Rule | Problem code |
|---|---|---|
| V1 | Exact keys and types everywhere (§2.2); `dan` = `p_dan_no`; exactly the four parts in order | `shape` (+ `path`), `dan_number` |
| V2 | One Dan's `octet_length(p_dan::text)` ≤ 50 000 | `too_big` |
| V3 | Part name: name rule; the four names different (case-insensitive) | `part_name`, `part_name_duplicate` |
| V4 | Grade points: exactly the part's letters, each 0–999 (2 dp), **never going up** from A+ to D, A+ > 0 | `grade_points_range`, `grade_points_order` |
| V5 | 1–30 subjects per part | `subject_count` |
| V6 | Subject id: pattern, unique in the Dan | `subject_id` |
| V7 | Subject name: name rule; not used twice in its part (case-insensitive) | `subject_name`, `subject_name_duplicate` |
| V8 | Credits: whole number 1–20 | `credits` |
| V9 | Points: exactly the subject's letters (§2.3), each 0–999 (2 dp), never going up, A+ > 0 | `points_range`, `points_order` |
| V10 | `points_mode = 'worked'` → every `points[g] = credits × grade_points[g]` | `points_not_worked_out` |
| V11 | Graded → `ways = []`; measured → 1 or 2 ways | `ways_count` |
| V12 | Two ways → both named (name rule) and different; one way → name null or a name | `way_name` |
| V13 | Unit 1–40 (normalized); direction one of three | `unit`, `direction` |
| V14 | A bracket list (each way's, and the pass list): 1–6 brackets; ages 0–99 whole; `from ≤ to`; listed youngest first; the **first starts at the youngest** (`from` null), each next `from` = previous `to` + 1, the **last is open** (`to` null) — no gaps, no overlaps (§14 OI-1) | `brackets_count`, `bracket_ages`, `brackets_order`, `brackets_gap`, `brackets_overlap`, `brackets_ends` |
| V15 | Cut-offs: exactly `A+ A B+ B C`, each 0–999 (2 dp); `at_least`: each **strictly smaller** than the one before; `at_most` / `under`: each **strictly larger** | `cutoffs_range`, `cutoffs_order` |
| V16 | `limited_to`: null, or 1–6 entries, each exactly `{from, to}` of one of the Dan's pass brackets, no repeats | `limited_to` |
| V17 | Note ≤ 200, not empty when present | `note` |
| V18 | Pass: 1–6 brackets (V14 rules); pass mark 1–9999 (2 dp) and **≤ the most points for that bracket** (§3.2); `no_d` boolean; makeup 0–300 | `pass_mark_range`, `pass_mark_too_high`, `makeup` (+ V14 codes with no `part`) |
| V19 | Every pass bracket does at least one subject (most points > 0) | `bracket_empty` |
| V20 | Extra: `limit` null or 1–999 (2 dp); note ≤ 200; 0–12 items; item names (name rule) different | `extra_limit`, `extra_note`, `extra_item_count`, `extra_item_name`, `extra_item_name_duplicate` |
| V21 | `per_count`: `points_each` 0.01–999 (2 dp). `steps`: 1–10 steps; `at_least` whole 1–9999, **strictly going up**; `points` 0.01–999 (2 dp), **strictly going up** | `extra_rule`, `extra_points_each`, `extra_steps_count`, `extra_steps_order`, `extra_step_range` |

Shared bracket logic is one helper: `bb_rubric_brackets_problems(p_list jsonb, p_where jsonb) returns jsonb` (immutable; `p_where` = the keys to put on each problem, e.g. `{"part":"physical","subject":"k3m9x2pa","way":0}`).

### 3.2 Maxima (immutable, internal; the JS twin in `rubric.js` must give identical numbers)
- `bb_rubric_part_max(p_part jsonb, p_from integer, p_to integer) returns numeric` = Σ `points."A+"` of the part's subjects that the bracket `{from, to}` does (`limited_to` null, or contains exactly that bracket; `is not distinct from` on both ends).
- `bb_rubric_most_points(p_dan jsonb, p_from integer, p_to integer) returns numeric` = Σ of the four parts' `bb_rubric_part_max`. Extra points never count.
- Fall 2026 values these must give (tested): 1st Dan 339 (17 and under) / 361.5 (18 and over) · 2nd 343.5 · 3rd 384 · 4th 595; Curriculum 1st Dan 135 / 157.5.

### 3.3 Problem objects
`{"code": text, "part": code?, "subject": id?, "way": 0|1?, "bracket": index?, "item": index?, "step": index?, "path": text?}` — only the keys that apply. The client maps codes to the R8 wording ("Can't save 1st Dan yet. Fix these N things:" …). The client checks the same rules while typing (§10.2), so a server `invalid` with problems is the safety net, not the normal path.

### 3.4 One fixture for both validators
`supabase/tests/0024_rubric_cases.json`: ≥ 1 case per problem code, plus valid cases. Each case: `{name, dan_no, base: "default:<1-4>", ops: [{op:"set"|"remove", path:[…], value?}], expect: [codes, sorted, unique]}`. PGlite runs every case through `bb_rubric_dan_problems` (path → `jsonb_set` / `#-`), `checks.mjs` through the JS `danProblems`; both must give exactly `expect`. This is what keeps the SQL and JS rules identical.

---

## 4. From v1 to v2 without changing a number

### 4.1 `bb_rubric_from_v1(p_v1 jsonb) returns jsonb` (immutable, internal)
Exact mapping (raises an exception on anything the Fall 2026 sheet doesn't contain, so a surprise shape stops the migration instead of guessing):
| v1 | v2 |
|---|---|
| `source` | `source` (same text, "Fall 2026 (old Sheet)") |
| `grade_scales.physical / technical / curriculum` | **each Dan's** `grade_points` of that part (four identical copies, v0.925) |
| (no v1 scale for Other) | Other's `grade_points` = a copy of Technical's (`A+ 4 · A 3.5 · A- 3.25 · B+ 3 · B 2.5 · B- 2.25 · C 2 · C- 1 · D 0`, as drawn in R1) |
| `pass_rule.points`, `points_adult` | Dan has an `adults_only` subject or `points_adult` → `[{null,17,points},{18,null,points_adult ?? points}]`; else `[{null,null,points}]`. So 1st Dan = 17 and under 275 / 18 and over 293; 2nd 261, 3rd 293, 4th 453 (one bracket each) |
| `pass_rule.no_d`, `makeup` | `pass.no_d`, `pass.makeup` |
| part `code`, `name` | same; `max_points` / `max_points_adult` dropped (worked out; equality tested) |
| subject `name`, `credits` | same; `id` = `left(md5(dan || '/' || code || '/' || name), 8)` |
| `scoring.kind = 'grades'` | `scoring: 'graded'`, `ways: []` |
| `scoring.kind = 'table'` without `method` | `measured`, one way: `name` null, `unit`, `direction`, brackets from `groups` (`ages.min/max` → `from/to`, `cutoffs` array → object; `label` dropped) |
| `scoring.kind = 'table'` with `method` (Pull-up or hold) | two ways, in this order: **Pull-up** (`method 'reps'`, unit `reps`, at_least, 12 and under / 13 and over) and **Hold** (`method 'hold'`, unit `seconds`, at_least, all ages); any other method → exception |
| `scoring.points` | `points` (copied exactly) |
| — | `points_mode` = `'worked'` when every grade's point = credits × that Dan's part grade point (§2.3 letters), else `'own'` → exactly the **19** of v0.924 |
| `scoring.note` | `note` |
| `outdoor`, `hand_in` | `outdoor`, `handed_in` (missing → false) |
| `adults_only: true` | `limited_to: [{"from": 18, "to": null}]` (only 1st Dan's One Step Sparring (1-24)) |
| `extra_points` | copied as is, `note` added as null where missing (4th Dan keeps "4th Dan uses the 3rd Dan numbers for now") |
| `hand_in` list | dropped (worked out from `handed_in`; equality tested) |
| — | each Dan `rev: 1`, `saved_at: null`, `saved_by_name: null` |

Unit texts are copied exactly (e.g. "inches (feet x 12 + inches)" keeps its "x"; the screens may draw ×).

### 4.2 Where it runs (in the migration, tag `bb_rubric_upgrade`, actor "Database admin")
1. **Every `bb_cycles` row with `requirements -> 'schema_version' = '1'`** is converted in place — **opened or not** (the trigger allows exactly this tag on a v1 → v2 change, §5.2). No version bump (no-bump column). Production expectation (checked read-only at CP2, §13): **no cycles exist**; the code handles any number.
2. **The default rubric seed:** `bb_rubric_from_v1(bb_starting_point.requirements)` (tag `bb_seed`, `on conflict (singleton) do nothing`). Even if cycles exist, the default comes from the starting point (the CP1-approved numbers); the run sheet reports any cycle found.
3. `bb_starting_point.requirements` itself stays v1 and untouched.

### 4.3 Proof (tests U3 and the PGlite step)
A test-only comparison flattens a v1 sheet and its v2 conversion into rows and requires **both `except` directions to be empty**:
- `(dan, part, subject, grade, points)` — every subject, every grade;
- `(dan, part, subject, way/method, from, to, grade, cut-off)` — every cut-off (Pull-up's `reps`/`hold` mapped to its way);
- `(dan, part, subject, credits, outdoor, handed_in, note)`;
- `(dan, part, from, to, max)`: v1 `max_points` / `max_points_adult` = `bb_rubric_part_max` for the matching bracket;
- `(dan, pass bracket, pass mark)`, `no_d`, `makeup`; `extra_points` equal as JSON (apart from the added null `note`); the v1 `hand_in` names = the `handed_in` subjects.
Plus spot checks: the 19 own-points subjects by name (Dans 1–3: Egg test, Meditation, Assistant instructor course, TKD project; Dan 4: Free sparring, Target kick (30 sec), Korean terminology, TKD knowledge, Egg test, Meditation, Appreciation letter); **Dan 4 Target kick B = 9** and Egg test (Dan 1) B = 11; 1st Dan pass brackets 17 and under 275 / 18 and over 293; One Step Sparring limited to 18 and over; Pull-up or hold = two ways with the CP1 numbers; each Dan's grade points = the v1 scales; most points 339 / 361.5 / 343.5 / 384 / 595.

---

## 5. Triggers

### 5.1 New guards
- **`bb_default_rubric_guard()`** (before insert / update / delete): insert only with tag `bb_seed` (the seed); update only with tag `bb_save_default_dan` or `bb_undo_default_dan`, or a hand fix; **delete always refused** (the revert drops the table). Refusals: `errcode '23514'`, constraint `bb_default_rubric_immutable`.
- **`bb_rubric_undo_guard()`**: insert / update / delete only with one of the tags `bb_save_default_dan`, `bb_undo_default_dan`, `bb_save_cycle_dan`, `bb_undo_cycle_dan`, `bb_set_registration`, `bb_undo_first_open`; delete also in a cascade (`pg_trigger_depth() > 1`, Delete cycle); or a hand fix. Else `23514`, constraint `bb_rubric_undo_immutable`.

### 5.2 Replaced on `bb_cycles`
**`bb_cycles_rules()`** keeps 0016's link-code rule unchanged and replaces the requirements rule with:
- `requirements` changed on update → allowed only if (a) hand fix; or (b) tag `bb_save_cycle_dan` / `bb_undo_cycle_dan` **and `old.first_opened_at is null` and `new.first_opened_at is null`**; or (c) tag `bb_rubric_upgrade` and `old.requirements -> 'schema_version' = '1'`. Else `23514`, constraint `bb_cycles_requirements_immutable` (same name as 0016). This is the lock of v0.921 enforced by the table itself, behind the functions' own `locked` check.
- `first_opened_at` changed on update → allowed only if (a) hand fix; (b) tag `bb_set_registration` and null → a value; (c) tag `bb_undo_first_open` and a value → null. Else `23514`, constraint `bb_cycles_first_opened_immutable`. So "never opened" can only come back through the Undo of §6.3.
- The caveat of CONTRACT-0016 §2.3 still applies: the hand-fix path is a convenience, not a wall (anyone connected as `postgres` can disable triggers).

**`bb_cycles_before_write`** is recreated as `bb_before_write('id,public_code_worcester,public_code_shrewsbury,prices_from', 'requirements')` (0016's immutable list unchanged; `requirements` becomes no-bump), so rubric saves and the upgrade never bump the cycle's `version`.

---

## 6. Staff write functions (all `authenticated`; all role **A** except `bb_set_registration`)

Every save / undo tags its own name, writes one batch, and is logged by the table triggers.

### 6.1 Default rubric
| Function | Ordered checks | Ok |
|---|---|---|
| `bb_save_default_dan(p_dan integer, p_expected_rev integer, p_sheet jsonb)` | 1–2 · 3: `p_dan` not 1–4, `p_expected_rev` null or < 1, `p_sheet` not an object, `p_sheet.dan ≠ p_dan` → `invalid`; strip `rev`, `saved_at`, `saved_by_name`, stamp `rev` = `p_expected_rev + 1` (placeholder for the check), run the validator → problems → `{status:'invalid', problems}` · 4: `bb_default_rubric` `for update` → `not_found` · 5: that Dan's `rev ≠ p_expected_rev` → `stale` · 6: unchanged (stripped `jsonb` equal) → no write, `ok` with `changed:false` and no undo slot · 8: upsert the slot (`default_dan`, dan, `previous` = the old Dan, `after_version` = rev + 1, `saved_by = auth.uid()`, `saved_at = now()`); replace the Dan via `bb_rubric_put_dan` (rev + 1, `saved_at` = now in UTC, `saved_by_name = change_log_actor_name()`) | `{status, rev, saved_at, saved_by_name, changed, previous_rev}` |
| `bb_undo_default_dan(p_dan integer, p_expected_rev integer)` | 1–2 · 3: nulls / range → `invalid` · 4: `bb_default_rubric` `for update` · 5: the Dan's `rev ≠ p_expected_rev`, or no slot, or `after_version ≠ p_expected_rev`, or `saved_by` ≠ `auth.uid()`, or `saved_at < now() − 60 seconds` → `stale` ("Someone else changed this just now." / too late) · 8: put `previous` back with a **new** rev (rev + 1, stamped now — Undo is one more history entry, v0.923, R11); remove the slot | `{status, rev, saved_at, saved_by_name}` |

### 6.2 A cycle's copy
| Function | Ordered checks | Ok |
|---|---|---|
| `bb_save_cycle_dan(p_cycle_id uuid, p_dan integer, p_expected_rev integer, p_sheet jsonb)` | as 6.1 save, plus: 3 `p_cycle_id` null → `invalid` · 4: the cycle `for no key update` → `not_found` · 5: **`first_opened_at` is set → `{status:'locked', first_opened_at}`** (checked before the rev, so the right message wins), then rev → `stale` · slot kind `cycle_dan` | as 6.1 save |
| `bb_undo_cycle_dan(p_cycle_id uuid, p_dan integer, p_expected_rev integer)` | as 6.1 undo, plus the cycle lock and **`locked`** first | as 6.1 undo |

A cycle that is Past but never opened stays editable (harmless; §14 OI-9). Withdrawn / registered candidates don't matter: a never-opened cycle can only have desk candidates.

### 6.3 Opening registration (replaces 0016's `bb_set_registration`; v0.929, v0.930)
Same arguments, locks and checks as 0016, with these changes:
- **Step 6, after `finished`:** `p_open` and `first_opened_at is null` and `is_admin() is not true` → **`not_allowed`** (first opening admin-only). Then 0016's `waiver_needed` and the after-Application-due rule, unchanged.
- **Step 8, when this call is the first opening** (the update sets `first_opened_at` from null): read the new `version`, then upsert slot `first_open` (`previous` = `{registration_open: false, first_opened_at: null, auto_close: <the value before this call>}`, `after_version` = the new version, `saved_by`, `saved_at`).
- Answer: `{status, version, state, first_open}` (`first_open` true only for a first opening).
Closing, and every later reopening, behave exactly as 0016 (staff may close and reopen once an admin opened it; the toast's Undo of those still sends the opposite switch).

**`bb_undo_first_open(p_cycle_id uuid, p_expected_version integer)`** — tag `bb_undo_first_open`, role A:
1–2 · 3: nulls → `invalid` · 4: locks as `bb_set_registration` → `not_found` · 5: `version ≠ p_expected_version`, or no `first_open` slot, or `after_version ≠ version`, or `saved_by ≠ auth.uid()`, or `saved_at < now() − 60 seconds`, or `registration_open` is false → `stale` · 6: any candidate with `source = 'form'` and `registered_at ≥ first_opened_at` → **`has_registrations`** (a family has seen and signed against this rubric; the lock stays) · 8: `registration_open = false`, `first_opened_at = null`, `auto_close` = the slot's value; remove the slot. → `{status, version, state}` (state is `not_open_yet` again, so the rubric is editable: "counts as never opened").

### 6.4 Add cycle (replaces 0016's `bb_add_cycle`)
Byte-for-byte 0016's function except: (1) lock order §1.3 (default rubric `for share` after the advisory lock, before the source cycle); (2) `requirements` = **`bb_rubric_fresh_copy(default.sheet)`** (= the default with `source` "Default rubric", each Dan `rev 1`, `saved_at` / `saved_by_name` null); `p_source_cycle_id` is still checked (null or an existing cycle → else `invalid`) but no longer gives the sheet. It already inserts every cycle closed (v0.933 needs no database change; the app stops sending the follow-up open, §10.3).

### 6.5 Copy from another Dan — decided: client-side
Copy from another Dan (R9) **only fills the draft** with the other Dan's **saved** version (from the loaded document, refreshed by the tab's live load), renumbered `dan`, keeping subject ids; nothing is stored until **Save [Dan]**, which runs the whole validator. A server function would add a second write path for no extra safety. (§14 OI-12.)

### 6.6 Action tags new in 0024
`bb_save_default_dan`, `bb_undo_default_dan`, `bb_save_cycle_dan`, `bb_undo_cycle_dan`, `bb_undo_first_open`, `bb_rubric_upgrade`; `bb_seed` and `bb_set_registration` / `bb_add_cycle` are reused.

---

## 7. Reads

- **Staff and admins read through column grants** (as Rubric and prices and the cycle page already do; no read function): `bb_default_rubric (id, sheet, version, updated_at, updated_by_name)` with policy `bb_default_rubric_select_with_access for select to authenticated using ((select public.has_data_access()))`; a cycle's copy = the already-granted `bb_cycles.requirements`, `first_opened_at`, `registration_open`, `created_at`. "Last changed by" per Dan = its `saved_by_name` / `saved_at` (hidden for staff, R2, and when null).
- **`bb_public_cycle(p_code text)`** (replaced; still `stable security definer`, still `bb_registrar` only): identical to 0016 except `cycle.requirements` = **`bb_rubric_public(requirements)`**: `{schema_version: 2, dans: [{dan, pass, parts, extra_points}]}` — **no `rev`, `saved_at`, `saved_by_name` or `source`** (no staff name ever reaches the public). Decided over a v1-shaped answer because the panel must change anyway to show a subject's own points (§10.4), and the form is off (`BB_PUBLIC_REGISTRATION=off`) between the paste and the deploy, so the old panel never meets the new shape.

---

## 8. RLS, grants

- RLS on both new tables. `bb_default_rubric`: the one SELECT policy above; `bb_rubric_undo`: **no policy**.
- Column SELECT to `authenticated`: exactly `bb_default_rubric (id, sheet, version, updated_at, updated_by_name)`. Nothing else, nothing on `bb_rubric_undo`, nothing to `anon`, `service_role`, PUBLIC or any registrar. No write grants or policies.
- Execute to `authenticated` only: the five new functions and the replaced `bb_set_registration`, `bb_add_cycle` (re-granted exactly as 0016). `bb_public_cycle`: `bb_registrar` only (as 0016). Every helper and trigger function: nobody. **`bb_registrar` still executes exactly its two functions.**

---

## 9. Files

| File | Who | What |
|---|---|---|
| `supabase/migrations/0024_black_belt_rubric.sql` | A (new) | §0–§8 |
| `supabase/tests/0024_tests.sql` | A (new) | §11.1 |
| `supabase/tests/0024_fingerprints.sql` | A (new) | §11.3 |
| `supabase/tests/0024_rubric_cases.json` | A (new) | §3.4 |
| `supabase/tests/0016_tests.sql` | A (edit, version-aware only; §11.2) | passes before **and** after 0024 |
| `supabase/tests/pglite/run.mjs` | A (shared file: new `step0024` + `step0024_production_order`; nothing else) | §11.4 |
| `supabase/SETUP.md` | A (shared file: one new section `## Migration 0024: …`) | §11.5 |
| `docs/Testing/Black Belt Testing/TKD-BlackBelt-0024-RunSheet.md` | A (new, at CP2 prep) | §13 |
| `src/lib/blackBelt/rubric.js` (new), `rubricDefault.js` (new), `api.js`, `mockBlackBelt.js`, `rules.js`, `checks.mjs` | B | §10.1–§10.2 |
| `src/lib/mockClient.js` | B (shared file: comment lines for the new preview behaviours only) | §10.2 |
| `src/blackBelt/staff/rubric/**`, `src/blackBelt/staff/cycle/**`, `src/blackBelt/staff/cycles/**`, `src/blackBelt/staff/text.js`, `src/blackBelt/staff/blackBelt.css`, `src/blackBelt/staff/BlackBeltTesting.jsx` | C | §10.3 |
| `src/blackBelt/form/RequirementsPanel.jsx`, `format.js`, `text.js`, `form.css` | C | §10.4 |
| `src/screens/Testing.jsx` | C (shared file: pass `onLeaveGuardChange` to `BlackBeltTesting`, one prop; coordinate with step C2, which also edits this file) | §10.3 |
Not touched: every migration file, `functions/**` (the Function passes `requirements` through unchanged), `src/App.jsx` (its leave guard is reused as is), `tokens.css` (if no existing token holds `#FFF6DD`, the builder **stops and asks** before adding one).

---

## 10. Front end

### 10.1 Data layer (Builder B) — `src/lib/blackBelt/api.js`
Same rules as CONTRACT-0016-B1 §1.1 (normal POST RPCs, named columns, `{status:'error'}` on a dropped connection, `no_access` → the app's handler). The rubric document stays the stored snake_case JSON inside the app (it is a document; renaming keys would risk losing some); the wrappers' own fields are camelCase.
| Function | Calls | Answers |
|---|---|---|
| `loadDefaultRubric()` | select `bb_default_rubric` (granted columns) | `{status:'ok', rubric, version, updatedAt, updatedByName}` |
| `loadCycleRubric({cycleId})` | select `bb_cycles` `id, name, requirements, first_opened_at, registration_open, created_at` | `{status:'ok', rubric, locked, firstOpenedAt, createdAt, name}` · `not_found` |
| `saveDefaultDan({dan, expectedRev, sheet})` | `bb_save_default_dan` | `{status:'ok', rev, savedAt, savedByName, changed, previousRev}` · `invalid` + `problems` · `stale` · `not_allowed` |
| `undoDefaultDan({dan, expectedRev})` | `bb_undo_default_dan` | `{status:'ok', rev, …}` · `stale` |
| `saveCycleDan({cycleId, dan, expectedRev, sheet})`, `undoCycleDan(…)` | the cycle functions | as above + `locked` (`firstOpenedAt`) |
| `setRegistration(…)` (existing) | unchanged call | + `firstOpen` |
| `undoFirstOpen({cycleId, expectedVersion})` | `bb_undo_first_open` | `{status:'ok', version, state}` · `stale` · `has_registrations` |

**`src/lib/blackBelt/rubric.js`** (new, pure, imported by the editor, the read view, the family form, the preview store and `checks.mjs`; no React, no supabase): the letter lists (§2.3); `workedPoints(part, subject)`; `partMax(part, bracket)`, `mostPoints(dan, bracket)`, `partMaxByBracket(dan, part)` (distinct values for "135 (157.5 for 18 and over)"); `bracketLabel({from,to})`; `handedIn(dan)`; `danProblems(dan, danNo)` — **the JS twin of §3** (same codes; checked against the fixture); `normalizeDan(dan)` (names and texts normalized, worked-out points recomputed); `splitBracket(dan, index, age)` (both halves keep the pass mark and every `limited_to` entry naming it, R6); `removeBracket`; `copyFromDan(source, danNo)`; `rubricFromV1(v1)` (port of §4.1, for old preview data); `danDiff(a, b)` → change lines ("Long jump credits 2 → 3"), used for the change count, the "changes weren't saved" box and the other admin's change line (R11); `newSubjectId()` (8 characters `[a-z0-9]`, unique in the Dan).
**`src/lib/blackBelt/rubricDefault.js`** (new): the v2 default seed as a constant (written from the SQL conversion's output; PGlite and `checks.mjs` both prove it equals the migration's seed and `rubricFromV1(STARTING_POINT_REQUIREMENTS)`).
**`rules.js`**: `canOpenRegistration(cycle, isAdmin)` gains "first opening is admin-only" with the reason text key.

### 10.2 Preview store (Builder B) — `mockBlackBelt.js`
- New table `bb_default_rubric` (seed = `rubricDefault.js`) in `GRANTED`; undo slots kept internal (never selectable). Old preview data whose cycles hold v1 sheets is converted on load with `rubricFromV1`.
- The five new RPCs and the changed `bb_set_registration` / `bb_add_cycle` / `bb_public_cycle` mirror §6–§7: same check order and statuses, `danProblems` as the validator, the 60-second undo window, `locked`, first opening admin-only, `has_registrations`.
- `simulateOtherAdminEdit()` (existing helper, its Black Belt part) also saves 1st Dan of the default rubric and of every never-opened cycle as "Sam P." (Long jump credits 2 → 3, R11). `bbExpireUndo()` (existing) also makes the newest undo slot 61 seconds old. `failNextSave('blackBelt')` covers the new saves. `mockClient.js` gets only the matching comment lines.
- **`checks.mjs`** adds: the fixture (§3.4) through `danProblems`; `rubricFromV1(STARTING_POINT_REQUIREMENTS)` deep-equals `rubricDefault.js`; the §4.3 spot checks in JS; maxima; the store's rules (locked after opening, stale after another save, undo too late, staff first open → `not_allowed`, Undo of a first opening after a form registration → `has_registrations`, Add cycle copies the default and is closed). Prints `ALL BLACK BELT LIB CHECKS PASSED`.

### 10.3 Staff screens (Builder C) — R1–R14 exactly as approved
| Screen | Where | Notes |
|---|---|---|
| R1, R2 | `rubric/RubricTab.jsx` + new `rubric/DefaultRubricCard.jsx`, `rubric/RubricReadView.jsx` | card below Waiver and Keeping; gray Dan switcher; To pass per bracket with most points; parts with grade points, Up to, Cut-offs and Points toggles, "Own points" dashed tag, "Only 18 and over"; extra points; Handed in (worked out); "Last changed by" (admins only, hidden when null); staff: "View only…", no Edit |
| R3, R6, R7 | new `rubric/RubricEditor.jsx` (+ `useRubricDraft.js`) | sticky edit bar "Editing [Dan]" / "default rubric · N changes not saved" (or "Fall 2027 only"), Copy from Dan…, Cancel, Save [Dan]; rows tinted `#FFF6DD` (v0.931); live maxima; grip + ⋯ (Move up / Move down / Remove); pass-bracket rows with ⋯ Split / Remove (`rubric/SplitBracketDialog.jsx`); no-D tick and make-up field; extra points settings, items and steps; phones: full-screen dialog with the bottom footer |
| R4, R5 | new `rubric/SubjectDialog.jsx` | name, credits, Graded / Measured, ways (+ Add another way, at most 2), unit, direction, brackets as rows (cards on phones), Worked out / Own points (showing the worked-out values beside typed ones), Who does it (Everyone / Only some brackets), tags, note; Done / Cancel; v0.46 / v0.56 unsaved behaviour |
| R8 | in `RubricEditor.jsx` | amber list "Can't save [Dan] yet. Fix these N things:", each line jumps to its field; fields checked while typing with `danProblems`; server `problems` shown the same way |
| R9 | new `rubric/CopyDanDialog.jsx` | client-side copy (§6.5) |
| R10 | new `rubric/DiscardDialog.jsx` + the leave guard | PC / tablet "Discard changes to [Dan]?" with **Keep editing** (primary) and a plain **Discard** (v0.932) for every way out (Dan switcher, other tab, ← Testing, rail, account menu, browser Back) through App's existing leave guard (`onLeaveGuardChange`, reached via the one-prop change in `Testing.jsx`); browser close → the browser's own question; phones: v0.56 note + Discard changes link; Cancel discards without asking |
| R11 | `RubricEditor.jsx` | toast "[Dan] rubric saved" + Undo (5 s; server allows 60 s); stale → amber banner "Another admin saved [Dan] just now…" + Reload, Save disabled with the gray reason; the live refresh shows the banner as soon as the loaded rev is newer than the draft's; after Reload: their change line + gray box "Your N changes weren't saved" (`danDiff`) |
| R12, R13 | `cycle/CyclePage.jsx` (tabs Candidates · Rubric) + new `cycle/CycleRubricTab.jsx` | same read view and editor on the cycle copy; "Copied from the default rubric when the cycle was added (date)" (a converted v1 cycle: "Copied from the Fall 2026 starting point …", new wording, marked); locked line with `ti-lock` and "Go to the default rubric"; `locked` answer → reload into the locked view |
| R13 (opening) | `cycles/useCycleActions.js`, `cycles/CyclesTab.jsx`, `cycle/CyclePage.jsx` ⋯ | staff: Open registration grayed "An admin opens it the first time (it locks the rubric)." on a never-opened cycle; after a first opening the toast's Undo calls `undoFirstOpen` (later openings keep 0016's opposite-switch Undo); `has_registrations` → "Can't undo: a family has already registered." (new wording, marked) |
| R14 | `cycle/CycleDialog.jsx`, `cycle/useCycleEditor.jsx` | Add cycle: no Open / Closed switch, no follow-up `setRegistration`; the Rubric line and "New cycles start closed…"; Edit cycle: the Registration switch only for cycles opened once, Rubric line ("… until registration first opens" / "Locked since registration opened on …") |
Wording not in the mockups goes into `staff/text.js` marked `// new wording, not in the mockups`.

### 10.4 Family form panel (Builder C) — `RequirementsPanel.jsx`
Reads v2 with `rubric.js`: subject points from **`points`** for both graded and measured subjects (fixes the live bug: Dan 4 Target kick B shows **9**, not credits × 2.5 = 10); measured subjects draw one table per way ("Pull-up · reps, at least", "Hold · seconds, at least"); "Only 18 and over" (from `limited_to` + `bracketLabel`) replaces "Adults only"; part maxima per bracket ("Curriculum: up to 135 points (157.5 for 18 and over)"); the pass rule per bracket ("17 and under 275 points · 18 and over 293 points"); the hand-in line from `handed_in` subjects; extra points as today plus `limit`; the make-up sentence under the pass rule only if Jeffrey approves that proposal in the screen pass (else as today). The printout (`RequirementsPrint`) uses the same code. Approved Form 3 layout otherwise unchanged.

### 10.5 Checks before a builder is done
`npm run build` and `npm run build:preview-mode` pass; `node src/lib/blackBelt/checks.mjs` and every other lib checks file pass; Function tests pass unchanged; PGlite `node run.mjs` all green (A); the live build contains no preview store, no `bb_rubric_undo` and no helper names (as v0.917's check).

---

## 11. Tests

### 11.1 `supabase/tests/0024_tests.sql` (0016_tests' shape: one transaction, one `do` block, sessions A1–A8, D1–D3 and anon, placeholders `<paste-admin-UID-here>` / `<paste-desk-UID-here>`, `'zz test …'` cycles, **final `rollback;`**, last row `ALL 0024 TESTS PASSED`)
| Id | Test |
|---|---|
| **U1 Who may call** | anon → 42501 on the five functions and both tables; A2–A8, D2–D3 → `no_access` from all five (sensible, broken and unknown-id arguments); D1 → `not_allowed` from all five and from a first opening; nothing written |
| U1b | A1 / D1 read `bb_default_rubric` granted columns (= postgres's row); `singleton`, `created_by`, `updated_by` and all of `bb_rubric_undo` → 42501; direct insert / update / delete / truncate → 42501 |
| U1c | `bb_registrar`: still exactly its two functions; no right on either new table; `bb_public_cycle`'s answer has no `rev`, `saved_at`, `saved_by_name`, `source` anywhere |
| **U2 Validator** | one failing case per §3.1 code (incl. a 2.5 credit, a grade point going up, own points going up, worked-out points ≠ credits × grade points, an at-least cut-off going up, an at-most one going down, a gap, an overlap, a closed last bracket, a pass mark above its bracket's most points, a limited-to bracket that doesn't exist, three ways, two unnamed ways, extra steps going down, 31 subjects, a 61-character name, a not-normalized name, an unknown key, a Dan over 50 000 bytes); the default's four Dans → `[]` |
| **U3 No number changes** | §4.3 on (a) the seeded default vs `bb_starting_point.requirements` and (b) `bb_rubric_from_v1` of the starting point; all spot checks |
| **U4 Default save / undo** | save with the right rev → rev + 1, stamps, one `change_log` row for `bb_default_rubric` + one for the slot, same batch; the other three Dans untouched; same content again → `changed:false`, nothing logged; old rev → `stale`; problems → `invalid` + `problems`, nothing written; undo → previous Dan back with a new rev; undo twice → `stale`; undo after another save → `stale`; undo by another admin → `stale`; undo with the slot made 61 s old (as postgres) → `stale` |
| **U5 Cycle copy** | as U4 on a never-opened cycle; after opening → save and undo `locked` + `first_opened_at`; as postgres with a tag set and the cycle opened, an update of `requirements` → `check_violation` (`bb_cycles_requirements_immutable`); a hand fix (no tag) still works; a rubric save doesn't change the cycle's `version` |
| **U6 Opening** | staff first opening → `not_allowed`, nothing written; admin first opening → ok, `first_open:true`, slot written; staff close → ok; staff reopen → ok, `first_open:false`; **undo first open** within 60 s → `not_open_yet`, `first_opened_at` null, `auto_close` back (incl. a first opening after Application due that had turned it off), rubric editable again; undo by another admin, after another change, after 61 s (as postgres), or after a form registration (test candidate `source 'form'` built as postgres) → `stale` / `has_registrations`; a direct `first_opened_at` change with a wrong tag → `check_violation` (`bb_cycles_first_opened_immutable`) |
| **U7 Add cycle** | copies the default (after a default save: the new numbers), `source` "Default rubric", revs 1, stamps null; closed; a source cycle id that doesn't exist → `invalid`; a later default save doesn't touch existing cycles (v0.921) |
| **U8 Public** | `bb_public_cycle` requirements = `bb_rubric_public(cycle requirements)`; Dan 4 Target kick B = 9 in the answer |
| **U9 Guards** | `bb_default_rubric` insert without `bb_seed`, update without a save tag, delete (any tag) → `check_violation`; slot writes without a listed tag → `check_violation`; Delete cycle cascades its slots |
| **U10 Logging** | every write: action tag (§6.6), one batch, actor; `bb_rubric_upgrade` rows exist for converted cycles (PGlite only) |
| **U11 Catalog** | RLS on both tables; policies exactly §8; column grants exactly §8; every 0024 function: one version, `search_path=""`, `prosecdef` as designed, `pronargdefaults = 0`, identity arguments exactly §15, execute rights exactly §8; triggers of §5 exist and are enabled (incl. `bb_cycles_before_write`'s new arguments); `bb_cycles_requirements_check` uses `bb_rubric_is_valid`; no `clock_timestamp`, no `::date` on a timestamp |
| **U12 Races (one session)** | two saves with the same expected rev in one transaction → the second `stale`; save after an undo with the old rev → `stale`; the slot's unique index refuses a second slot for the same Dan (`unique_violation` as postgres) |

### 11.2 `0016_tests.sql` after 0024 (version-aware, as 0006_tests became for 0020)
At the top: `v_has_0024 := to_regclass('public.bb_default_rubric') is not null`. Only where 0024 changes behaviour, the assertion branches on it; **no pre-0024 assertion is weakened** (the security reviewer checks every changed line against git). Known spots (builder greps for more and lists every change in the summary): C4's "no other bb_ function" list adds §15's names when `v_has_0024`; T4a "Add cycle copies the source's sheet" → after 0024 "copies the default"; the starting-point-equality check at Add cycle; T4e / every first opening done by D1 → after 0024 done by A1 (and D1 → `not_allowed`); T5a's `requirements` equality → `bb_rubric_public(...)`; any test that writes a v1 sheet into `bb_cycles` as postgres.

### 11.3 `supabase/tests/0024_fingerprints.sql`
Read-only, one SELECT, connector-safe (forbidden words spelled in pieces, as 0016's). Rows: every 0024 function (new and replaced) with name, identity arguments, md5 of the comment-free source, `prosecdef`, `proconfig`, owner, sorted rights · both tables (RLS flag, table and column rights) · triggers (name, table, function, **arguments**, enabled) · policies · the constraint `bb_cycles_requirements_check` (its definition).

### 11.4 PGlite (`supabase/tests/pglite/run.mjs`)
- **`step0024`** (main database, after `stepBlackBelt`): (a) print the fingerprints of every migration on `main`; (b) with 0016 only, add two test cycles through `bb_add_cycle` (v1 sheets), open one; snapshot both sheets; (c) apply 0024; (d) every earlier migration's fingerprints identical **except exactly** the 0016 rows of §0's table (listed in the step, compared one by one); (e) both cycles: §4.3 comparison against their snapshots (the opened one too), `version` unchanged; (f) `0024_tests.sql`, then **every earlier test file** (0016's version-aware copy included) passes; (g) re-apply 0024: no second seed, no second conversion, nothing logged, `0024_tests.sql` again; (h) `bb_default_rubric.sheet` deep-equals `src/lib/blackBelt/rubricDefault.js`; (i) every case of `0024_rubric_cases.json`; (j) `bb_registrar` live checks: both new tables and the five functions refused; `bb_public_cycle` answers the public view; (k) the "Undo 0024" script of SETUP §0024f exactly as written: 0016's fingerprints back to step (a), `0016_tests.sql` passes; then 0024 again.
- **`step0024_production_order`**: a fresh database built in the **production order with every migration live at build time** (today: 0001–0006, 0010, 0007, 0008, 0009, 0012, 0015, 0011 as production got it, 0019, 0014, 0020, 0013, 0017, 0018, 0016, 0021 — plus 0022 / 0023 if they are live by then; the builder checks the status files and lists the order), then 0024: every other fingerprint unchanged, every test file passes, 0024's fingerprints equal `step0024`'s.

### 11.5 `supabase/SETUP.md` — `## Migration 0024: Black Belt rubric editor (rulebook v0.921–v0.933)`
`### 0024a. Before you apply` (Claude, read-only: no `bb_default_rubric` yet; the count of `bb_cycles` and how many are v1; 0016's fingerprints = live) · `### 0024b. Apply 0024` (you, SQL Editor; confirm the destructive-operations warning) · `### 0024c. Read-only checks` (Claude: `0024_fingerprints.sql` = PGlite; earlier fingerprint files unchanged except the listed 0016 rows; security advisor: **+5** "security definer executable by authenticated" (the five new functions), **+1** "RLS enabled, no policy" (`bb_rubric_undo`), nothing else) · `### 0024d. Run the tests` (you: `0024_tests.sql`, then `0016_tests.sql`; UIDs back to placeholders) · `### 0024e. What the app needs` (deploy the new front end right after; the form stays off until then) · `### 0024f. Undo 0024` (only while **no Black Belt cycle exists** — the script first refuses if any `bb_cycles` row exists: drop the five functions and the 0024 helpers, the two tables, restore the old `bb_cycles_requirements_check` (`bb_requirements_is_valid`), then paste `0016_black_belt.sql` again (re-run safe; restores its three functions, `bb_cycles_rules` and the trigger exactly); PGlite proves it).

---

## 12. Room left for grading (nothing built now)
Grading will read the **locked cycle copy**: subject `id`s are stable; the examiner's "which way" is a way index (0 / 1) of that subject (v0.927); the candidate's bracket comes from a read that returns only the bracket, never the DOB (0016 §12); `bb_starting_point.requirements` (v1) and `bb_requirements_is_valid` can be dropped then.

---

## 13. Checkpoints (0024's own; not 0016's CP numbers)

| CP | What | Done when |
|---|---|---|
| **CP0** | This contract → security review of the contract → Jeffrey's OK; the mockups' remaining proposals confirmed in the screen-by-screen pass | OK recorded in the rulebook (next free number in 0.900–0.999; re-read the rulebook first) |
| **CP1** | Build A, B, C → **security review** (separate agent: grants, RLS, definer checks, the triggers' tag rules, lock order line by line, the public view, undo windows, `0016_tests` edits) and **design review** (separate agent, against the rulebook and R1–R14, screenshots at 1280×800, 820×1180 touch, 390×844 touch, 320 wide) → fixes → **preview walkthrough** with Jeffrey (`npm run dev:preview-mode`): default rubric, editor, subject dialog, two ways, brackets, errors, copy, leaving, saved/Undo/another admin, cycle tab editable → open → Undo → open → locked, Add cycle closed, the family panel (Dan 4 Target kick B = 9) | Jeffrey's OK |
| **CP2** | **Paste on production**, following a new run sheet `TKD-BlackBelt-0024-RunSheet.md` (shape of `TKD-BlackBelt-CP3-RunSheet.md`: 0 already checked · 1 just before (no `bb_default_rubric`, cycle count, baselines: every fingerprint file, whole-database snapshot outside Black Belt, advisor) · 2 paste · 3 right after (`0024_fingerprints` = PGlite; converted cycles' numbers vs their pre-paste snapshot, if any) · 4 nothing else moved · 5 advisor (+5 / +1) · 6 tests (0024, 0016, then 0006, 0011, 0018) · 7 wrap-up · if something goes wrong (§0024f) · what CP2 doesn't do) | all pass, status file updated |
| **CP3** | **Deploy**: the Main session merges `black-belt` into `main`; Jeffrey OKs the push; check the live build (as v0.917) and, read-only, the live Rubric and prices tab; the form stays off (`BB_PUBLIC_REGISTRATION=off`) as before | live |

Between CP2 and CP3 the live (old) app keeps working: Add cycle still works (now copying the default); an old-screen staff first opening is refused (`not_allowed`) — do CP3 right after CP2.

---

## 14. Open items (each with the working default the builders use)

| # | Item | Working default |
|---|---|---|
| **OI-1** | Must a bracket list cover every age? The mockup says "the last may be open"; v0.926's example starts "3–5" | **Yes**: the first bracket starts at the youngest (empty "from") and the last is open, so no candidate is ever without a cut-off or pass mark. "3–5" is entered as "5 and under". The Fall 2026 data already follows this |
| **OI-2** | How long may an Undo (rubric save, first opening) wait? The toast shows 5 s but pauses on hover (v0.54) | **60 seconds** on the server, same admin only, and only if nothing changed since; plus `has_registrations` for an opening |
| **OI-3** | Points, grade points "going down": strictly, or may two grades be equal? | **Never going up** (equal allowed), A+ above 0; cut-offs and extra steps **strictly** ordered (an equal cut-off would make a grade unreachable). The seed is strictly ordered everywhere |
| **OI-4** | The undo slots are a copy of what `change_log` already holds | **Logged anyway** (house rule: every change logged); a few KB per save |
| **OI-5** | `0016_tests.sql` breaks after 0024 (it lists every `bb_` function and expects Add cycle to copy the source sheet) | **Made version-aware** (§11.2), each change listed and reviewed; the alternative (run it only before 0024) loses the "every earlier test passes after" proof |
| **OI-6** | Size limits | 50 000 bytes per Dan, 200 000 per document; R4's limits (credits 1–20, 30 subjects, 6 brackets, 10 steps, names 60) plus 12 extra items, notes 200, make-up 300, pass marks up to 9999 |
| **OI-7** | Names typed with extra spaces | The client normalizes; the server **refuses** a not-normalized name (`subject_name`) rather than changing it silently, so what is saved is what was shown |
| **OI-8** | Undo of a first opening after a family registered in those seconds | **Refused** (`has_registrations`); the cycle stays locked |
| **OI-9** | A never-opened cycle whose dates have passed | Still editable (no family ever saw it) |
| **OI-10** | Who may Undo a save | Only the admin who saved (the toast is theirs) |
| **OI-11** | Edit cycle on a never-opened cycle | No Registration switch (opening only from ⋯, so it always gets the first-opening toast and Undo); R14's "Edit cycle keeps its Registration switch for cycles already opened once" |
| **OI-12** | Copy from another Dan uses the copy loaded in the browser | It uses the newest loaded version (the tab's live refresh keeps it current); Save's rev check still protects the Dan being saved |
| **OI-13** | "Last changed by" for a Dan never saved since the seed | Hidden (no line) |
| **OI-14** | A cycle found on production at CP2 | Converted (numbers proved unchanged in the run sheet); the default still comes from the starting point; reported to Jeffrey |

---

## 15. Function list (for U11 and the fingerprints)

**New staff writes (5, `authenticated`, role A):** `bb_save_default_dan(integer, integer, jsonb)`, `bb_undo_default_dan(integer, integer)`, `bb_save_cycle_dan(uuid, integer, integer, jsonb)`, `bb_undo_cycle_dan(uuid, integer, integer)`, `bb_undo_first_open(uuid, integer)`.
**Replaced 0016 functions (same signatures and grants):** `bb_set_registration(uuid, integer, boolean)`, `bb_add_cycle(jsonb, uuid)`, `bb_public_cycle(text)` (`bb_registrar`); trigger function `bb_cycles_rules()`.
**New internal (no grants):** `bb_rubric_num_ok(jsonb, numeric, numeric)`, `bb_rubric_int_ok(jsonb, integer, integer)`, `bb_rubric_letters(text, text)`, `bb_rubric_brackets_problems(jsonb, jsonb)`, `bb_rubric_dan_problems(jsonb, integer)`, `bb_rubric_is_valid(jsonb)`, `bb_rubric_part_max(jsonb, integer, integer)`, `bb_rubric_most_points(jsonb, integer, integer)`, `bb_rubric_from_v1(jsonb)`, `bb_rubric_fresh_copy(jsonb)`, `bb_rubric_public(jsonb)`, `bb_rubric_put_dan(jsonb, integer, jsonb, integer)`, trigger functions `bb_default_rubric_guard()`, `bb_rubric_undo_guard()`.
The builder's U11 list is exactly these names; anything else needed is reported first.
