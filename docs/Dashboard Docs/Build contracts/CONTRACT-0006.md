# Contract 0006 — Star testing database (migration `0006_star_testing.sql`)

**Status: APPROVED by Jeffrey 2026-10-18 (rulebook v0.174).** Build and test locally only; nothing is applied to Supabase without his OK for that paste.

The single source of truth for **Builder A — database**, who turns it into `supabase/migrations/0006_star_testing.sql`, `supabase/tests/0006_tests.sql`, `supabase/tests/0006_fingerprints.sql`, the PGlite step 12 and `supabase/SETUP.md` §13. Follow it exactly so the later parts (Star's Pages Function, data layer, preview mock, screens) fit. If something here is impossible or contradicts the sources below, **stop and report it** — do not improvise. Items marked **OPEN — ask Jeffrey** (§12) are not decided; the builder uses the working assumption written next to each one and changes nothing else about it.

| Source (in this order of authority) | |
|---|---|
| This contract | wins for 0006 |
| Database plan `docs/Testing/Star Testing/TKD-StarTesting-DB-Plan.md` (all 15 questions answered; §8 small items OK'd) | final, rulebook v0.156, v0.158–v0.173 |
| Rulebook `docs/Dashboard Docs/TKD-Dashboard-Design-Guidelines.md`: every Star row v0.58–v0.173 (v0.147 and v0.157 are Color Belt rows — ignored here), §5 privacy. The newest row wins. | v0.172 |
| Approved Star mockups (`TKD-StarTesting-*-Mockups.html`: Rubrics, Events, Form, Candidates, Grading, Results, Private, Home) | wording and layout |
| Old prototype `docs/Testing/Star Testing/Old prototype/STAR-TESTING-HANDOFF.md` §2–§5, Appendix A and B | seed values and scoring test cases only |
| Handoff `docs/Dashboard Docs/TKD-Dashboard-Handoff.md` §6 (security rules, non-negotiable) | |
| Existing code: migrations 0001–0005 (**all live in production — never edit**), CONTRACT-0003, CONTRACT-0005 | patterns copied from here |

**Working copy:** the Star testing worktree, branch `star-testing`. Do not touch Supabase (no connector calls), Cloudflare, git remotes, other worktrees or the main folder. Do not commit; the orchestrator commits.
**Audience:** Jeffrey is learning IT — every new file starts with a header comment (what + why, like 0005's); short plain-English comments on non-obvious lines; readable over clever. CRLF line endings, like the neighbouring files (check before and after).
**Production facts:** Supabase project `tkd-dashboard` (ref `eozkfbdfxqlcbpewhach`), PostgreSQL 17, Free plan. Live: 0001–0005 (0005 = Color Belt phase 2, with `testing_registrar` and its Hyperdrive config). Staff: Main Admin (admin), Staff (shared desk, role `staff`). A push to `main` deploys `tkd-dashboard.pages.dev`.

**Words used in this contract (one line each):**
- *RLS* (row-level security): a rule on a table saying which rows a signed-in role may see; here always "only while `has_data_access()` is true".
- *Column grant*: permission to read named columns only; a column that is never granted can't be read by the app at all, even with `select *` (which then fails).
- *Security definer function*: runs with its owner's rights, so it can write tables the app can't touch; it must check access itself first.
- *Cascade*: removing a parent row removes its child rows in the same step.
- *Idempotent*: sending the same request twice has the same effect as once.
- *Lock*: `for update` / `for no key update` / `for share` make other writes to the same row wait until this one finishes; a fixed lock order stops two saves from waiting on each other forever (a *deadlock*).
- *Fingerprint*: an md5 of each function's code plus its rights, printed in PGlite and on production so the two can be compared line by line.

---

## 0. Scope

- **0006 builds on live 0001–0005 and changes none of their objects, grants, rules or tests.** It runs **no** `revoke`, `grant`, `alter` or `comment` on any 0001–0005 object (`locations`, `change_log`, `testing_public_attempts`, `testing_registrar`, `staff` …) — a `revoke all` on a shared table would reset what 0005 granted. It only *calls* 0003/0005 helpers from its own security-definer functions (§1.2).
- All new objects are named `star_…` (v0.156). Star helper names never start with `testing_` or `change_log_` (0003/0005 tests scan those prefixes).
- **One transaction** (`begin;` … `commit;`), **re-run safe** (`create table if not exists`, `create or replace function/view`, `drop trigger/policy/constraint if exists` + create, `add column if not exists`, seeds that never overwrite, the role created only if missing). If a function's arguments change during the build, the file also `drop function if exists`s the old signature so no old version stays callable.
- Header comment like 0005's: what / why / what it adds / how to run (SQL Editor, whole file, "Supabase will warn about destructive operations — the words *delete* and *drop* appear inside rules, functions that run later and `… if exists` lines; nothing is removed now") / words used.
- Builder A owns only: `supabase/migrations/0006_star_testing.sql` · `supabase/tests/0006_tests.sql` · `supabase/tests/0006_fingerprints.sql` · `supabase/tests/pglite/run.mjs` (step 12 + Star registrar live checks; nothing else in it changes) · `supabase/SETUP.md` (new §13 only). Not 0001–0005 files, their tests or fingerprints, `src/`, `functions/`, `docs/`.
- 16 tables, 1 view, 1 sequence, 37 staff functions, 2 public functions and their internal helpers. File layout (sections in this order, as 0005): 1 helpers · 2 Rubrics-and-prices tables + seed · 3 events · 4 event copies · 5 candidates (+ reference counter) · 6 signatures · 7 make-up subjects · 8 payments · 9 grades · 10 result emails · 11 downloads · 12 derived rules (state, fee, age, result) · 13 triggers · 14 view `star_roster` · 15 RLS + grants · 16 internal helpers · 17 role `star_registrar` · 18 staff write functions · 19 staff read functions · 20 public functions.

---

## 1. General rules

### 1.1 Copied from 0003 §2.1 / 0005 §1.1 (non-negotiable)
- Owner `postgres` for every table, view, sequence and function (one owner — 0003 C3h lesson).
- Every function: `set search_path = ''`, fully qualified names (`public.x`, `auth.uid()`), explicit `revoke execute … from public, anon, authenticated, service_role`, then **only** the grants in §4.3. Helpers and trigger functions get no grant.
- Every table, the view and the sequence: `revoke all … from public, anon, authenticated, service_role`, then only the column grants of §4. **Nothing to `anon` or `service_role`, ever.** No write grants or write policies for any client role: all writes go through §6 functions.
- Staff functions: `language plpgsql volatile security definer`, `returns jsonb`, JSON keys snake_case, every non-ok answer is exactly `{"status": …}` unless this contract lists extra keys for that status.
- **Check order** (every staff function): 1 `has_data_access() is not true` → `no_access` · 2 role (`is_admin() is not true` → `not_allowed` for A functions) · 3 argument shape → `invalid` (nothing looked up and nothing computed from the arguments before 1–2) · 4 look up + lock in the §1.5 order → `not_found` · 5 version / expected state → `stale` · 6 rules that depend on the data (listed per function; a mixed role rule such as "admins, or the same staff member within 10 s" sits here) · 7 duplicate name → `duplicate_name` · 8 tag, write, untag, (purge where listed), return `ok`.
- **Tagging:** right before writing `set_config('tkd.action', '<action>', true)` + `set_config('tkd.batch_id', gen_random_uuid()::text, true)`; after writing both reset to `''`. Every Star action tag starts with `star_` (they are listed per function; §6.8 has the full list). Reads tag nothing (except the purge they call, §5.7).
- `is_admin()` is never a gate on its own: A functions check `has_data_access()` first.
- No argument defaults anywhere (`pronargdefaults = 0` for every 0006 function). Whole-number arguments are `integer` (not `smallint`: Postgres.js sends `int4`, and `int4 → int2` is not an implicit cast, so a `smallint` argument would make the call fail to find the function); columns may be `smallint`.

### 1.2 Shared from 0001–0005 (called, never changed)
`public.has_data_access()`, `public.is_admin()`, `public.current_session_id()`, `public.change_log` (insert only, through triggers), `public.change_log_write()` (generic log trigger), `public.change_log_actor_name()`, `public.testing_refuse_truncate()`, `public.testing_normalize_name()` / `testing_name_is_valid()` (names 1–60 characters), `public.testing_normalize_note()` / `testing_note_is_valid()` (≤ 600), `public.testing_signature_is_valid()` (PNG data URL ≤ 70 000), `public.testing_cents_is_valid()` (whole dollars 0–1000), `public.testing_today()` / `testing_school_date()`, `public.testing_new_public_code()` (8 characters `[a-hjkmnp-z2-9]`), `public.testing_location_address()`, `public.locations` (read), `public.testing_public_attempts` (insert/count/clean-up from Star's public wrapper only, §8). Star functions run as `postgres`, so 0005's revoked execute rights on these helpers don't matter. A test (T13) records their fingerprints: if a later migration changes one, Star's behaviour changes too — that later migration must re-run 0006's tests.

### 1.3 Statuses
The 0003 set `ok, no_access, not_allowed, not_found, stale, duplicate_name, invalid, not_empty`, plus from 0005 `rate_limited, not_open, closed, finished, already_paid, withdrawn`, plus **new in 0006**:

| Status | Meaning | Extra keys |
|---|---|---|
| `already_added` | this earlier candidate is already a make-up candidate (in this event or another) | — |
| `choice_needed` | the earlier result is "below the pass mark" and no admin has chosen the make-up subjects yet (§5.5) | — |
| `grades_exist` | a Dan change would clear grades and the call didn't confirm it | `grade_count` |
| `kept` | the grade cell is a kept make-up grade and can't be changed on this event (v0.129) | — |
| `no_fee` | a payment action on a make-up candidate (no fee, v0.96, v0.116) | — |
| `refund_too_large` | a refund larger than the overpaid amount, or nothing overpaid (v0.172 S7) | `overpaid_cents` |
| `not_finished` | Mark as sent on a result that isn't Passed or Make-up | — |

`final_award_not_set` (0005) is not used by Star.

### 1.4 Error mapping (whole body inside `begin … exception … end`, as 0003 §2.1)
| Caught | Returns |
|---|---|
| `unique_violation` on `star_events_lower_name_idx` or `star_categories_dan_lower_name_idx` | `duplicate_name` |
| any other `unique_violation` (position race, code race, double insert) | `stale` |
| `foreign_key_violation`, `check_violation`, `not_null_violation` | `invalid` |
| `deadlock_detected`, `serialization_failure`, `lock_not_available` | `stale` |
| anything else | not caught (the client sees an error → "didn't save" handling) |

### 1.5 Lock order (plan §2.5 and §8 S5 — every Star write)
Star events cover both schools, so **the event row replaces the school row** as the first lock: **event → candidate → payment or grade** (`for no key update` on parents, `for update` on the row changed or removed). Every candidate-level write in one event therefore takes turns, and no two Star writes can deadlock. Exact orders:
- Candidate writes, grades, counts, payments, Mark as sent: event `for no key update` → candidate `for update` (helper `star_lock_candidate`, §5.9) → the payment / grade / result-email row `for update`.
- **Rubric edits:** the `star_dan_settings` rows involved, **in Dan order**, `for no key update` (a category edit locks its Dan's row; grade values and the assistant table lock all Dan rows in Dan order), then the row(s) changed `for update`.
- **Add event:** `for share` on every `star_dan_settings` row in Dan order, then the grade-value rows (by position), the assistant row and the categories (by Dan, position) `for share` — so it can never copy a half-saved template.
- **Make-up add:** the later event (`for no key update`), then the earlier candidate and its grades are **read without locks** (read-only).
- **Resolve duplicate:** the event, then both candidates `for update` **in id order**.
- **Delete event:** the event `for update`, then its candidates in id order `for update`, then their payments in id order `for update`.
- **Public register:** the event `for no key update` (as 0005 locked school → event).
- **Signature purge:** `for update … skip locked` (never waits on anyone).
- **Side effects outside the order (known, checked by the reviewer):** (a) deleting a candidate or an event makes the foreign key **set `makeup_of_candidate_id` to null** on make-up rows in *other, later* events — PostgreSQL updates (and so locks) those rows without the function locking their events first. It can only wait on a write to that one make-up row, never the other way round in a cycle with the same event, and a deadlock would be answered `stale` (§1.4). (b) `star_add_makeup` inserts a row pointing at the earlier candidate, so PostgreSQL takes an implicit **`for key share`** lock on the earlier candidate (the foreign-key check); it blocks only a delete of that candidate, which itself locks the earlier event first. (c) The same implicit key-share locks happen on `star_event_dans` / `star_event_categories` when candidates and grades are written; those copy rows are never updated, so they never wait.
- **Every function's header comment states its lock order** (e.g. `-- locks: event (no key update) -> candidate (update) -> payment (update)`), so the SQL reviewer can check each function against this section line by line.
- **PGlite can't prove the lock order:** it runs on one connection, so no two calls ever run at the same time there. The order is proved by review only (and by the side-effect list above).

### 1.6 Time
"Today" is always `public.testing_today()` = `(now() at time zone 'America/New_York')::date`; no other time zone anywhere. The one place that can't call it (the security-invoker view, §2.12) writes the same expression inline. Registration closes at the end of the closing date and at the end of the testing day (v0.85, v0.88). Age is counted on the **event's testing date** (v0.66, v0.168).

### 1.7 Money and scores
- Integer **cents** everywhere. Fees (template and copies): `testing_cents_is_valid` (whole dollars $0–$1,000). Payment amounts: 1–100 000 cents, any cents (staff may type a discount, v0.110). Refunds are entered positive and stored negative.
- Scores: credits are integers; grade values `numeric(3,1)`; points = credits × value; totals `numeric` with one decimal, returned as JSON numbers. Max score = Σ credits × the A+ value of the event copy. Pass mark `numeric(6,1)`.

### 1.8 House columns and triggers (plan §3)
Tables that are edited after insert carry: `id uuid not null default gen_random_uuid()` (primary key; `change_log.record_id` is a uuid), `version integer not null default 1` (check ≥ 1), `created_at`, `updated_at timestamptz not null default now()`, `created_by`, `updated_by uuid null` (no FK, **never granted**), `created_by_name`, `updated_by_name text not null` (set by the trigger from `change_log_actor_name()`). Each such table gets `<table>_before_write` (generic `star_before_write()`, §2.11), `<table>_no_truncate` (`testing_refuse_truncate()`) and `<table>_log` (`change_log_write()`, except signatures, §2.5). Written-once tables (event copies, payments, result emails, downloads) have no version/updated_* columns (as 0005's copies and payments) and are guarded instead.

---

## 2. Tables

Constraint names are exact. Every table: RLS enabled, policies and grants in §4.

### 2.1 Rubrics and prices (the template new events copy — v0.58, v0.61, v0.66, v0.171)

**`public.star_dan_settings`** — the Dan list (v0.171: seeded, no add/remove function) and each Dan's pass mark, star limit and fees.
| Column | Type | Constraint |
|---|---|---|
| `id` | uuid pk `star_dan_settings_pkey` | |
| `dan` | `smallint not null` | `star_dan_settings_dan_key unique (dan)`; `star_dan_settings_dan_check check (dan between 1 and 9)`; immutable |
| `label` | `text not null` | `star_dan_settings_label_check` (name rule, as 0003) — "1st Dan" |
| `pass_mark` | `numeric(6,1) not null` | `star_dan_settings_pass_mark_check check (pass_mark > 0 and pass_mark <= 9999.9)` |
| `star_limit` | `smallint not null` | `star_dan_settings_star_limit_check check (star_limit between 1 and 20)` ("Highest star") |
| `standard_cents`, `same_day_cents`, `private_cents` | `integer not null` | `star_dan_settings_cents_check` (`testing_cents_is_valid` on all three) |
| house columns | | §1.8 |

**`public.star_categories`** — the subjects per Dan.
| Column | Type | Constraint |
|---|---|---|
| `id` | uuid pk `star_categories_pkey` | |
| `dan` | `smallint not null` | `star_categories_dan_fk` → `star_dan_settings(dan)` (no action); immutable |
| `name` | `text not null` | `star_categories_name_check` (name rule, stored normalized) |
| `credits` | `integer not null` | `star_categories_credits_check check (credits between 1 and 100)` |
| `position` | `integer not null` | `star_categories_position_check check (position >= 0)` |
| `from_class_count` | `boolean not null default false` | immutable (Assistant Instructor = true) |
| house columns | | |
Indexes: `star_categories_dan_position_key unique (dan, position) deferrable initially immediate`; `star_categories_dan_lower_name_idx unique (dan, lower(name))` (v0.66 "names different inside one Dan"); `star_categories_one_from_class_count_idx unique (dan) where from_class_count`. **No check on the credit total** (70 is shown, not required, v0.61). Exactly one `from_class_count` per Dan is kept by the functions (it is seeded, can't be added, can't be changed, can't be deleted).

**`public.star_grade_values`** — the 7 letters (fixed) and their values (editable).
| Column | Type | Constraint |
|---|---|---|
| `id` | uuid pk | |
| `grade` | `text not null` | `star_grade_values_grade_key unique`; `star_grade_values_grade_check check (grade in ('A+','A','B+','B','C+','C','D'))`; immutable |
| `position` | `smallint not null` | `star_grade_values_position_key unique`; `check (position between 1 and 7)`; immutable (A+ = 1 … D = 7) |
| `value` | `numeric(3,1) not null` | `star_grade_values_value_check check (value between 0 and 9.9)` |
| house columns | | |
"Values go down in order" (v0.66) is checked by `star_update_grade_values` (it spans rows). D is not forced to 0. What makes a make-up is the **letter** D, never the value.

**`public.star_assistant_table`** — one row: the age split and the minimum assistant classes per grade.
| Column | Type | Constraint |
|---|---|---|
| `id` | uuid pk | |
| `singleton` | `boolean not null default true` | `star_assistant_table_singleton_key unique`, `check (singleton)`; immutable; not granted |
| `child_max_age` | `smallint not null` | `check (child_max_age between 1 and 30)` ("12 and under") |
| `child_a_plus`, `child_a`, `child_b_plus`, `child_b`, `child_c_plus`, `child_c` | `integer not null` | `star_assistant_table_child_check check (child_a_plus > child_a and child_a > child_b_plus and … and child_c >= 1 and child_a_plus <= 999)` |
| `adult_a_plus` … `adult_c` (the "13 and up" column) | `integer not null` | `star_assistant_table_adult_check` (same) |
| house columns | | |
D = below the C value and is not stored (v0.66).

### 2.2 `public.star_events` (v0.85–v0.92, v0.98, v0.99)
| Column | Type | Constraint |
|---|---|---|
| `id` | uuid pk `star_events_pkey` | |
| `name` | `text not null` | `star_events_name_check` (name rule) |
| `testing_date` | `date not null` | |
| `start_time` | `time not null` | `star_events_start_time_check check (star_start_time_is_valid(start_time))` — 08:00–20:00 on a 15-minute step, seconds 0 (v0.92) |
| `where_code` | `text not null` | `star_events_where_fk` → `locations(code)`. **Information only** (v0.87). Deliberately *not* named `location_code`, so `change_log` never files an event under one school |
| `registration_open` | `boolean not null default false` | new events start Closed (v0.85) |
| `auto_close_on` | `date null` | `star_events_auto_close_check check (auto_close_on is null or auto_close_on <= testing_date)` |
| `first_opened_at` | `timestamptz null` | `star_events_opened_check check (not registration_open or first_opened_at is not null)` |
| `public_code_worcester`, `public_code_shrewsbury` | `text not null` | each `unique` (`star_events_code_worcester_key`, `star_events_code_shrewsbury_key`), pattern `^[a-hjkmnp-z2-9]{8}$` (`star_events_codes_check`, also `public_code_worcester <> public_code_shrewsbury`); immutable. The link sets the candidate's school (v0.98) |
| `note` | `text null` | `star_events_note_check` (`testing_note_is_valid`, stored normalized) |
| house columns | | "Rubrics and prices were copied when this event was created (date)" = `created_at` (v0.92) |
Index `star_events_lower_name_idx unique (lower(public.testing_normalize_name(name)))` — **names unique across all Star events** (v0.92); `star_events_testing_date_idx (testing_date)`. A rule trigger (`star_events_rules`, §2.11) refuses a code already used by another event in **either** column (raised as `unique_violation`, constraint `star_events_public_code_cross_key`). The two per-column unique indexes can't see across columns, so `star_add_event` takes **`pg_advisory_xact_lock(hashtext('star_public_code'))`** (a transaction-long lock on a fixed number, held until commit) before drawing codes: two Add event calls draw codes one after the other. Star codes live in their own table and route, so they never need to differ from Color Belt's codes.

### 2.3 The event's own copy (v0.61: taken when the event is created, never changed later)
No house columns; update refused by `star_event_copies_before_write` (constraint `<table>_immutable`); removed only with the event (`on delete cascade`); logged with `change_log_write`.
- **`star_event_dans`**: `id` pk · `event_id` FK → events cascade · `dan smallint` · `label` · `pass_mark` · `star_limit` · `standard_cents`, `same_day_cents`, `private_cents` (same checks as §2.1) · `star_event_dans_event_dan_key unique (event_id, dan)`.
- **`star_event_categories`**: `id` pk · `event_id` · `dan smallint` · `template_category_id uuid not null` (no FK on purpose, as 0005's `class_id`) · `name` · `credits` · `position` · `from_class_count` · FK `star_event_categories_dan_fk (event_id, dan)` → `star_event_dans (event_id, dan)` cascade · `unique (event_id, dan, position)` · unique index `(event_id, dan, lower(name))` · unique index `(event_id, dan) where from_class_count`.
- **`star_event_grades`**: `id` pk · `event_id` FK cascade · `grade` · `position` · `value` · `unique (event_id, grade)`, `unique (event_id, position)`.
- **`star_event_assistant`**: `id` pk · `event_id` FK cascade, `unique (event_id)` · `child_max_age` + the 12 minimums (same checks as §2.1).

### 2.4 `public.star_candidates` — one person in one event (v0.98–v0.117, v0.148–v0.152)
Sequence `public.star_candidate_ref_seq as bigint start with 4001` (form references `ST-4001`, `ST-4002` …; sequential, so there is never a public lookup by reference).
| Column | Type | Rule |
|---|---|---|
| `id` | uuid pk `star_candidates_pkey` | |
| `event_id` | `uuid not null` | `star_candidates_event_fk` → events **cascade**; immutable |
| `first_name`, `last_name` | `text not null` | name rule, stored normalized |
| `date_of_birth` | `date null` | `star_candidates_dob_check check (date_of_birth is null or date_of_birth >= date '1900-01-01')`; "not in the future" is checked by the functions. **Never granted.** Null only on desk rows (v0.172 S3) |
| `email_for_results` | `text null` | `star_candidates_email_check check (email_for_results is null or star_email_is_valid(email_for_results))`. **Never granted** |
| `location_code` | `text not null` | `star_candidates_location_fk` → `locations(code)`; the candidate's school; **may change** (Edit details, v0.112). The column name makes `change_log` fill `location_code` |
| `dan` | `smallint not null` | `star_candidates_dan_fk (event_id, dan)` → `star_event_dans (event_id, dan)` (no action) |
| `stars_from` | `smallint not null` | `check (stars_from >= 0)`; `< star_limit` of the event copy (rule trigger, constraint `star_candidates_stars_event`). Stars to = from + 1 (never stored) |
| `paying_by` | `text null` | `star_candidates_paying_by_check check ((is_makeup and paying_by is null) or (not is_makeup and paying_by in ('cash','check','card')))` |
| `source` | `text not null` | `in ('form','desk')`; immutable |
| `reference` | `text null` | `unique`; `check ((source = 'form') = (reference is not null))`; `check (reference is null or reference ~ '^ST-[0-9]{4,}$')`; immutable |
| `registered_at` | `timestamptz not null default now()` | immutable ("Registered Oct 17", make-ups "Added …") |
| `status`, `withdrawn_reason`, `withdrawn_at`, `withdrawn_by_name`, `withdrawn_by` | as 0005 | `star_candidates_status_check` exactly as 0005's (`withdrawn_reason in ('withdrawn','duplicate_copy')`); `withdrawn_by` **never granted** |
| `duplicate_state`, `duplicate_of` | as 0005 | `duplicate_of` FK self **on delete set null**; `in ('none','possible','kept_both')`; not self |
| `is_makeup` | `boolean not null default false` | immutable |
| `makeup_of_candidate_id` | `uuid null` | FK self **on delete set null** (the earlier candidate, in an earlier event) |
| `makeup_of_event_name` | `text null` | snapshot of the earlier event's name; `check (is_makeup or (makeup_of_candidate_id is null and makeup_of_event_name is null))`; immutable |
| `private_on`, `private_time` | `date null`, `time null` | `check ((private_on is null) = (private_time is null))`; private day may be before or after the testing day (v0.168) |
| `classes_attended`, `assistant_classes` | `integer null` | `check (… is null or … between 0 and 999)`; **null = not entered, 0 is a real value** |
| house columns | | |
Indexes: `(event_id)`; `(event_id, lower(last_name), lower(first_name))`; `(duplicate_of) where duplicate_of is not null`; `(makeup_of_candidate_id) where … is not null`; `(private_on) where private_on is not null`; **`star_candidates_one_active_makeup_idx unique (makeup_of_candidate_id) where is_makeup and status = 'active'`** (an earlier candidate can have at most one active make-up row, in any event — closes the race between two events adding the same make-up at once, which the event locks alone can't stop).
Rule trigger `star_candidates_rules` (both insert and update): stars below the event copy's limit; `duplicate_of` in the same event; a Dan change is refused while grade rows of the old Dan exist (defence in depth — the function deletes them first; constraint `star_candidates_dan_grades`).
A form row must have a `star_candidate_signatures` row — written in the same call by `star_public_register` (proved by T5).

### 2.5 `public.star_candidate_signatures` — form-only data (v0.102, v0.107, v0.162)
`id` pk · `candidate_id uuid not null` FK → candidates **cascade**, `unique` · `submission_id uuid not null unique` (the family browser's id for idempotency) · `acknowledged boolean not null` (`check (acknowledged)`) · `ack_version text not null` · `signature text null` (`check (signature is null or testing_signature_is_valid(signature))`) · `signed_at timestamptz not null` · `signature_deleted_at timestamptz null` · `check ((signature is null) = (signature_deleted_at is not null))` · house columns.
- **Never granted to any role. RLS on, no policy.** Read only through `star_candidate_detail` (state only) and `star_view_signature` (§7).
- `star_candidate_signatures_rules` (before update): everything except `signature` and `signature_deleted_at` is immutable; the signature can only go to null and `signature_deleted_at` is set once. The generic `star_before_write` gets `signature,signature_deleted_at` as no-bump columns (the purge doesn't bump the version).
- **Its own log trigger** `star_candidate_signatures_log()` (security definer, as 0005's `testing_registrations_log`): the same change_log row as `change_log_write` but `signature` written as `"on file"` or `null` and `submission_id` left out; an update that changed nothing visible after that writes no row. **No `change_log_write` trigger on this table** (T11 proves it).

### 2.6 `public.star_makeup_subjects` (v0.96, v0.111, v0.129, v0.130, v0.163)
`id` pk · `candidate_id` FK → candidates cascade · `event_category_id` FK → `star_event_categories` (no action) · `kind text not null` `check (kind in ('retest','chosen'))` · house columns · `unique (candidate_id, event_category_id, kind)`. `retest` = on a make-up candidate, a subject retested at this event (written by `star_add_makeup`); `chosen` = an admin's choice for a result below the pass mark with no D (v0.130). Rule trigger `star_makeup_subjects_rules`: the subject belongs to the candidate's event and current Dan. Rows are inserted and deleted only.

### 2.7 `public.star_payments` — append-only (v0.109, v0.110, v0.152, v0.166, v0.167)
`id` pk · `candidate_id` FK → candidates **cascade** · `kind text not null` · `amount_cents integer not null` · `method text not null` · `paid_on date not null` · `recorded_at timestamptz not null default now()` · `recorded_by uuid null` (**never granted**) · `recorded_by_name text not null` · `reverses_payment_id uuid null` FK self (no action), `unique`.
`star_payments_kind_check`: `(kind = 'payment' and amount_cents between 1 and 100000 and reverses_payment_id is null and method in ('cash','check','card'))` or `(kind = 'refund' and amount_cents between -100000 and -1 and reverses_payment_id is null and method in ('cash','check'))` or `(kind = 'reversal' and amount_cents between -100000 and 100000 and amount_cents <> 0 and reverses_payment_id is not null)`.
**A refund is its own negative row with its own method and date** (v0.166); an Undo / Edit is a `reversal` of exactly one payment or refund.
Guard `star_payments_guard` (before insert/update/delete): insert of a reversal must undo a `payment` or `refund` of the **same candidate** for exactly minus its amount (a reversal can't be reversed; constraint `star_payments_reversal_check`); **update always refused**; **delete refused** except inside a cascade (`pg_trigger_depth() > 1`) or when `tkd.action` is `star_delete_candidate` or `star_delete_event`; **any insert that would leave the candidate's net total (sum of all its rows, the new one included) below zero is refused** (constraint `star_payments_net_check`; it locks nothing extra — the calling function already holds the candidate lock). Index `(candidate_id)`. Logged.

### 2.8 `public.star_grades` (v0.124, v0.125, v0.129, v0.139, v0.163–v0.165)
`id` pk · `candidate_id` FK → candidates cascade · `event_category_id` FK → `star_event_categories` (no action) · `grade text not null` `check (grade in ('A+','A','B+','B','C+','C','D'))` · `kept boolean not null default false` · `kept_from_event_id uuid null` (no FK) · `kept_from_event_name text null` · `check (kept = (kept_from_event_name is not null))` · house columns (version bumps but is **never checked**, v0.165) · `star_grades_candidate_category_key unique (candidate_id, event_category_id)` · index `(event_category_id)`.
A row = one judged grade; **no row = not graded** (clearing deletes the row). Assistant Instructor (`from_class_count`) is **never stored as a grade**. Rule trigger `star_grades_rules`: the subject belongs to the candidate's event **and current Dan**, is not `from_class_count`, and its letter is in the event's grade copy; a `kept` row can't be updated (constraint `star_grades_kept`). `kept`, `kept_from_*`, `candidate_id`, `event_category_id` immutable. Logged with `change_log_write` (who and when, before and after — the last save wins and the log keeps both).

### 2.9 `public.star_result_emails` — Mark as sent (v0.141, v0.170)
`id` pk · `candidate_id` FK → candidates cascade · `marked_at timestamptz not null default now()` · `marked_by uuid null` (**never granted**) · `marked_by_name text not null` · `result_status text not null` (`in ('passed','makeup')`) · `result_total numeric(6,1) not null` · `result_needs jsonb not null` (array of subject names) · `result_key text not null` (§5.5) · `sent_via text not null default 'manual'` (`in ('manual')` now; a sending service adds `'service'` later, v0.140) · `undone_at timestamptz null` · `undone_by uuid null` (**never granted**) · `undone_by_name text null` · `check ((undone_at is null) = (undone_by_name is null))` · index `(candidate_id)`.
Guard `star_result_emails_guard`: update may only set `undone_at`, `undone_by`, `undone_by_name` once (from null); delete only inside a cascade or with a `star_delete_*` action tag. Logged.

### 2.10 `public.star_downloads` — CSV download log (v0.144, v0.172 S1)
`id` pk · `event_id uuid not null` (no FK: the log outlives a removed event) · `event_name text not null` · `dan smallint null` (null = whole event) · `row_count integer not null` · `downloaded_at timestamptz not null default now()` · `downloaded_by uuid null` · `downloaded_by_name text not null`.
**The whole table is never granted to any role** (RLS on, no policy). Written only by `star_results_csv`; no 0006 function reads it (SQL Editor only — see OPEN-22). Guard `star_downloads_guard`: update and delete always refused; `star_downloads_no_truncate`. **Not logged in `change_log`** (a download isn't a data change, S1).

### 2.11 Triggers (exact)
| Table | before insert/update | rules / guard | after (log) | truncate |
|---|---|---|---|---|
| `star_dan_settings` | `star_before_write('id,dan', '')` | — | `change_log_write` | `testing_refuse_truncate` |
| `star_categories` | `star_before_write('id,dan,from_class_count', 'position')` | — | `change_log_write` | ✓ |
| `star_grade_values` | `star_before_write('id,grade,position', '')` | — | `change_log_write` | ✓ |
| `star_assistant_table` | `star_before_write('id,singleton', '')` | — | `change_log_write` | ✓ |
| `star_events` | `star_before_write('id,public_code_worcester,public_code_shrewsbury', '')` | `star_events_rules` | `change_log_write` | ✓ |
| 4 copy tables | — | `star_event_copies_before_write` (before update: refuse) | `change_log_write` | ✓ |
| `star_candidates` | `star_before_write('id,event_id,source,reference,registered_at,is_makeup,makeup_of_event_name', 'classes_attended,assistant_classes')` | `star_candidates_rules` | `change_log_write` | ✓ |
| `star_candidate_signatures` | `star_before_write('id,candidate_id,submission_id,acknowledged,ack_version,signed_at', 'signature,signature_deleted_at')` | `star_candidate_signatures_rules` | **`star_candidate_signatures_log`** | ✓ |
| `star_makeup_subjects` | `star_before_write('id,candidate_id,event_category_id,kind', '')` | `star_makeup_subjects_rules` | `change_log_write` | ✓ |
| `star_payments` | — | `star_payments_guard` (insert, update, delete) | `change_log_write` | ✓ |
| `star_grades` | `star_before_write('id,candidate_id,event_category_id,kept,kept_from_event_id,kept_from_event_name', '')` | `star_grades_rules` | `change_log_write` | ✓ |
| `star_result_emails` | — | `star_result_emails_guard` | `change_log_write` | ✓ |
| `star_downloads` | — | `star_downloads_guard` | **none** | ✓ |
`star_before_write()` (invoker, generic, as 0005 9a/9c): insert → `version = 1`, both stamps `now()`, both `*_by = auth.uid()`, both names = `change_log_actor_name()` (supplied values ignored). Update → a change to any column in `TG_ARGV[0]` raises `errcode '23514'`, `constraint '<table>_immutable'`; `created_*` keep their old values; if anything other than the `TG_ARGV[1]` columns and the bookkeeping columns changed, **or** a function wrote `version + 1` on purpose, then `version + 1` and fresh `updated_*`; otherwise version and `updated_*` stay exactly as before. So reordering categories, saving class counts and the signature purge never bump a version (an open Edit details dialog doesn't go stale because a count was typed in). Trigger names: `<table>_before_write`, `<table>_rules` / `<table>_guard`, `<table>_log`, `<table>_no_truncate`.

### 2.12 View `public.star_roster` (`security_invoker = true`) — the Candidates tab
One row per candidate: every **granted** `star_candidates` column (§4.1 — no DOB, email, login ids), plus `e.testing_date`, `d.label as dan_label`, `d.star_limit`, `d.standard_cents`, `d.same_day_cents`, `d.private_cents`, and the payment state:
`paid_cents` (sum of all rows; reversals and refunds included) · `paid` (`paid_cents > 0`, v0.167) · `last_payment_id`, `paid_on`, `paid_method`, `last_payment_recorded_at`, `last_payment_recorded_by_name` (latest **unreversed** `payment` row) · `refunded_cents` (unreversed refunds, positive) · `expected_fee_cents` and `fee_kind` (§5.2, written inline with the §1.6 expression — a security-invoker view can't call the revoked helpers) · `overpaid_cents` (`greatest(paid_cents − expected_fee_cents, 0)` when paid, else 0).
`authenticated` reads it only through the column grants on every column it uses (§4.1) and the RLS rules; a locked session sees no rows. **Never** DOB, email, signature, submission id or a login id. T9 checks the view's fee equals `star_expected_fee_cents` for the same cases.

---

## 3. Seed data (in the migration, tagged `tkd.action = 'star_seed'`, actor "Database admin"; never overwrites)

- **`star_dan_settings`** (`on conflict (dan) do nothing`): (1, '1st Dan', 245, **4**, 14000, 15000, 16000) · (2, '2nd Dan', 245, **3**, 15000, 16000, 17000) · (3, '3rd Dan', 245, **5**, 16000, 17000, 18000) — pass mark 245 for all (handoff §2); star limits 4 / 3 / 5 (v0.171); fees standard / same day / private (handoff §5, v0.61).
- **`star_categories`**, inserted for a Dan **only when that Dan has no categories yet** (`where not exists`, so a re-run never re-adds a category an admin renamed or deleted), positions 0… in this order, `from_class_count` true only for Assistant Instructor; credits from handoff Appendix A (each Dan totals 70):
  - 1st Dan (11): White–Deputy Curriculum 15 · Go-Ryo Poomse 10 · Advanced Motion 5 · Advance Sa-Bang Chuck 5 · Step Sa-Bang Chuck 5 · Two Step Sparring 5 · Breaking 5 · Appreciation Letters 5 · **Assistant Instructor 5** · Knowledge 5 · Korean Terminology 5.
  - 2nd Dan (13): White–Deputy Curriculum 10 · Geum-Kang Poomse 5 · Instructor Sa-Bang-Chuk 5 · Go-Ryo Poomse 5 · Advanced Motion 5 · Advance Sa-Bang Chuck 5 · Step Sa-Bang Chuck 5 · Two Step Sparring 5 · Breaking 5 · Appreciation Letters 5 · **Assistant Instructor 5** · Knowledge 5 · Korean Terminology 5.
  - 3rd Dan (10): White–Deputy Curriculum 20 · 1st & 2nd Dan Curriculum 10 · Tae Baek Poomsae 5 · 3rd Dan Sa-Bang Chuck 5 · Creative Poomsae 5 · Breaking 5 · Appreciation Letters 5 · **Assistant Instructor 5** · Knowledge 5 · Korean Terminology 5.
  - Names exactly as written (the en dash in "White–Deputy" is U+2013; `&` as is). The 3rd Dan paper typo (18.5) is ignored — only credits are stored.
- **`star_grade_values`** (`on conflict (grade) do nothing`): A+ 4.5 (1) · A 4.0 (2) · B+ 3.5 (3) · B 3.0 (4) · C+ 2.5 (5) · C 2.0 (6) · D 0.0 (7).
- **`star_assistant_table`** (`on conflict (singleton) do nothing`): `child_max_age` 12 · child 15 / 14 / 13 / 12 / 11 / 10 · adult (13 and up) 20 / 18 / 16 / 14 / 12 / 10 (handoff §4 and Appendix A: A = 19 or 18 → minimum 18, etc.).
- No events, candidates or anything else.

---

## 4. RLS, grants and revokes (exact intent — Builder A writes the SQL)

### 4.1 Column SELECT grants to `authenticated` (everything else: nothing)
| Object | Granted columns |
|---|---|
| `star_dan_settings` | `id, dan, label, pass_mark, star_limit, standard_cents, same_day_cents, private_cents, version, created_at, updated_at, created_by_name, updated_by_name` |
| `star_categories` | `id, dan, name, credits, position, from_class_count, version, created_at, updated_at, created_by_name, updated_by_name` |
| `star_grade_values` | `id, grade, position, value, version, created_at, updated_at, created_by_name, updated_by_name` |
| `star_assistant_table` | `id, child_max_age, child_a_plus, child_a, child_b_plus, child_b, child_c_plus, child_c, adult_a_plus, adult_a, adult_b_plus, adult_b, adult_c_plus, adult_c, version, created_at, updated_at, created_by_name, updated_by_name` |
| `star_events` | `id, name, testing_date, start_time, where_code, registration_open, auto_close_on, first_opened_at, public_code_worcester, public_code_shrewsbury, note, version, created_at, updated_at, created_by_name, updated_by_name` (staff see and copy both links, v0.92, v0.99) |
| `star_event_dans` | `id, event_id, dan, label, pass_mark, star_limit, standard_cents, same_day_cents, private_cents` |
| `star_event_categories` | `id, event_id, dan, template_category_id, name, credits, position, from_class_count` |
| `star_event_grades` | `id, event_id, grade, position, value` |
| `star_event_assistant` | `id, event_id, child_max_age, child_a_plus, child_a, child_b_plus, child_b, child_c_plus, child_c, adult_a_plus, adult_a, adult_b_plus, adult_b, adult_c_plus, adult_c` |
| `star_candidates` | `id, event_id, first_name, last_name, location_code, dan, stars_from, paying_by, source, reference, registered_at, status, withdrawn_reason, withdrawn_at, withdrawn_by_name, duplicate_state, duplicate_of, is_makeup, makeup_of_candidate_id, makeup_of_event_name, private_on, private_time, classes_attended, assistant_classes, version, created_at, updated_at, created_by_name, updated_by_name` |
| `star_makeup_subjects` | `id, candidate_id, event_category_id, kind, version, created_at, updated_at, created_by_name, updated_by_name` |
| `star_payments` | `id, candidate_id, kind, amount_cents, method, paid_on, recorded_at, recorded_by_name, reverses_payment_id` |
| `star_grades` | `id, candidate_id, event_category_id, grade, kept, kept_from_event_id, kept_from_event_name, version, created_at, updated_at, created_by_name, updated_by_name` |
| `star_result_emails` | `id, candidate_id, marked_at, marked_by_name, result_status, result_total, result_needs, result_key, sent_via, undone_at, undone_by_name` |
| `star_roster` (view) | `select` on the view |

### 4.2 Never granted to any role (not `authenticated`, `anon`, `service_role`, PUBLIC, `star_registrar` or `testing_registrar`)
- `star_candidates.date_of_birth`, `star_candidates.email_for_results` — read only through `star_candidate_detail` and the admin CSV (v0.160, v0.144). Leaving them out of a view would not protect them; not granting them does.
- The whole of `star_candidate_signatures` (`signature`, `submission_id`, `ack_version` …) and the whole of `star_downloads`.
- Every login id: `created_by`, `updated_by` (all tables), `star_candidates.withdrawn_by`, `star_payments.recorded_by`, `star_result_emails.marked_by` / `undone_by`, `star_downloads.downloaded_by`, `star_assistant_table.singleton` (no use).
- The sequence `star_candidate_ref_seq` (no rights for anyone).
- `change_log` keeps its 0003 state (no grants, no policy); History reads it only through `star_candidate_history`.

### 4.3 RLS and execute rights
- RLS enabled on all 16 tables. One policy per readable table: `<table>_select_with_access for select to authenticated using ((select public.has_data_access()))` (14 tables: every table of §4.1). `star_candidate_signatures` and `star_downloads`: RLS on, **no policy**.
- Execute: the 37 staff functions of §6–§7 → `authenticated` only; `star_public_event` and `star_public_register` → `star_registrar` only; every helper and trigger function → nobody. Nothing to PUBLIC, `anon`, `service_role` or `testing_registrar`.

---

## 5. Derived rules (worked out, never stored — v0.158)

### 5.1 Event state — `star_event_state(p_event public.star_events, p_today date) returns text`
Exactly 0005's rule, in this order: `finished` (today > testing_date) · `open` (switch on and (no closing date or today ≤ it); includes the testing day) · `closed_by_date` · `not_open_yet` (never opened) · `closed`. Tag (client): Finished · **Testing today** (whatever the state) · "Open until <date>" / "Registration open" · Registration closed · Not open yet (v0.88). Upcoming / Past from the dates (v0.89). Public answers map `not_open_yet → not_open`, `closed_by_date → closed + closed_on`, `closed → closed + null`.

### 5.2 Expected fee — `star_expected_fee_cents(p_candidate_id uuid) returns integer` (and inline in `star_roster`)
In this order, from the event copy of the candidate's Dan: make-up → **0** (`fee_kind 'none'`) · `private_on` set → `private_cents` (`'private'`) · paid (net > 0) → `standard_cents` if the latest unreversed payment's `paid_on` < testing_date, else `same_day_cents` · not paid → `standard_cents` if today < testing_date, else `same_day_cents` (the testing-day price on and **after** the testing day, v0.167). The Record payment dialog fills this in; staff may change the amount (v0.110). (See OPEN-17, OPEN-18.)

### 5.3 Paid, overpaid
`paid_cents` = sum of all the candidate's payment rows. **Paid = `paid_cents > 0`** — any recorded amount counts, no underpaid state (v0.167). **Overpaid** = `paid_cents − expected_fee_cents` when paid and positive (v0.152), e.g. "Paid $160 · ⚠ $20 overpaid" after Back to the testing day.

### 5.4 Age group — `star_age_group_of(p_dob date, p_testing_date date, p_child_max_age integer) returns text` (immutable)
`'child'` when DOB is known and the age **on the event's testing date** (`extract(year from age(testing_date, dob))`) ≤ `child_max_age`; otherwise `'adult'` (13 and up), **including no DOB** (v0.66, v0.168, S3). The private day never changes it.
**Assistant Instructor letter**: `assistant_classes` null → not graded; else the first of A+, A, B+, B, C+, C whose minimum (event copy, the age group's column) ≤ the count; else **D**. Handoff Appendix B test cases must hold (`(12, 14) → A`, `(13, 19) → A`, `(13, 18) → A`, `(13, 17) → B+`, `(12, 9) → D`, `(no DOB, 14) → B`).

### 5.5 The result — `star_candidate_result(p_candidate_id uuid) returns jsonb` (internal; the **only** place the pass rules live)
Used by `star_event_results`, `star_candidate_detail`, `star_set_grade` / `star_set_count` / `star_set_makeup_subjects` answers, `star_mark_result_sent`, `star_makeup_list`, `star_add_makeup` and the CSV, so they always agree (v0.158). Inputs: the event copy for the candidate's current Dan, `star_grades`, the counts, `star_makeup_subjects`, the age group.
- **Subjects** = the event copy's categories of that Dan, by position. Judged subject: its grade row (kept or not). `from_class_count` subject: the Assistant Instructor letter (§5.4). Points = credits × the event copy's value of the letter.
- `total` = sum of points of graded subjects (a running total "so far" while incomplete); `max_score`; `pass_mark`; `complete` = every subject graded; `d_subjects` = subjects graded D.
- **Status**, in this order: candidate withdrawn → `'withdrawn'` · not complete and `private_on` set → `'testing_privately'` (v0.150; OPEN-13) · not complete → `'not_finished'` · complete, no D, total ≥ pass mark → `'passed'` · otherwise `'makeup'`.
- `makeup_reasons` ⊆ `['d','below']` (both may show, Results mockups: "D in Breaking · below 245 · retests Breaking"). **`needs`**: if any D → the D subjects (OPEN-12); else if below → the admin's `chosen` subjects (v0.130); `choice_needed` = below, no D, no `chosen` rows.
- Ok shape: `{candidate_id, event_id, dan, stars_from, stars_to, status, total, max_score, pass_mark, complete, graded_count, subject_count, subjects:[{event_category_id, name, credits, position, from_class_count, grade|null, points|null, kept, kept_from_event_name|null, retest}], ai:{age_group, count|null, grade|null}, d_subjects:[names], makeup_reasons:[…], needs:[names], needs_ids:[uuids], choice_needed, missing:[names], private:{on, time}|null, result_key}` — `result_key` = `md5(status || '|' || total::text || '|' || needs_ids in position order joined by ',')`. It never contains DOB, email, age or payments (`age_group` only).
- **Sent state** — `star_sent_state(p_candidate_id uuid, p_result jsonb) returns jsonb`: the latest `star_result_emails` row with `undone_at is null` → `{sent:{id, marked_at, marked_by_name, result_status}|null, matches: (its result_key = current result_key)}`. A changed result shows "Not sent yet" again with the earlier send noted (v0.170; OPEN-15 on what "changed" means).

### 5.6 Possible duplicate (v0.97, v0.114, S3)
Another **active** candidate in the same event with the same normalized first + last name (case-insensitive) **and** the same DOB; when either row has no DOB, the names alone (S3). Not counted: a pair marked `kept_both`. Recomputed on insert, on a name/DOB edit and on Restore; when the row a candidate points at is deleted or withdrawn, the other goes back to `none` (as 0005 `testing_recheck_duplicate` / `testing_recheck_pointing_at`; Star twins `star_find_duplicate(p_event_id, p_exclude_id, p_first, p_last, p_dob)`, `star_recheck_duplicate`, `star_recheck_pointing_at`). The public form accepts duplicates silently (§8).

### 5.7 Signature purge — `star_purge_old_signatures() returns integer` (v0.162, S9)
Sets `signature = null, signature_deleted_at = now()` for every signature whose **event's testing date** < today − 90 (also for private testers, S9), `for update … skip locked`, tagged `star_purge_old_signatures` with its own batch id, then puts back the caller's tags. No version bump; its log row shows only `"signature": "on file" → null` plus the time. Runs as the **last step** (after the call's own write, same transaction) of `star_add_event`, `star_add_candidate`, `star_record_payment`, and of the reads `star_home_today` and `star_makeup_list` (they are `volatile`; they purge only after the access check passed). Nothing runs overnight.

### 5.8 Make-up list (v0.111, v0.139)
For event X: active candidates of **other events with an earlier testing date** whose result status is `makeup`, newest earlier event first; **left out** when an active make-up candidate already points at them in another event; `already_added` = one already points at them in X. A make-up done on the same event (v0.139) drops out by itself when the result turns Passed.

### 5.9 Internal lock helpers
`star_lock_candidate(p_candidate_id uuid) returns public.star_candidates` (find the event, lock it `for no key update`, lock the candidate `for update`, null fields if gone) and `star_lock_payment(p_payment_id uuid) returns public.star_payments` (candidate lock, then the payment `for update`), as 0005 14g/14j.

---

## 6. Staff write functions (authenticated; the only way to write)

Roles: **A** = admin only (`has_data_access()` then `is_admin()`); **S** = staff and admins. Steps refer to §1.1's order; "lock" means the §1.5 order; every function maps errors as §1.4. "Unchanged → no write" means the same values write nothing, bump nothing and log nothing (still `ok`).

### 6.1 Rubrics and prices — all **A** (v0.61, v0.66)
| Function (action tag = name) | Ordered checks | Ok |
|---|---|---|
| `star_update_dan_settings(p_dan integer, p_expected_version integer, p_pass_mark numeric, p_star_limit integer, p_standard_cents integer, p_same_day_cents integer, p_private_cents integer)` | 3: any null; pass mark ≤ 0, > 9999.9 or more than one decimal; star limit not 1–20; a fee not `testing_cents_is_valid` → `invalid` · 4: lock the Dan row (`not_found`) · 5: version → `stale` · 8: update (unchanged → no write) | `{status, version}` |
| `star_add_category(p_dan integer, p_name text, p_credits integer)` | 3: dan null; name rule; credits not 1–100 → `invalid` · 4: lock the Dan row · 7: same `lower(normalized name)` in the Dan → `duplicate_name` · 8: insert at `max(position)+1`, `from_class_count` false (new categories are always judged) | `{status, id, version:1, position}` |
| `star_update_category(p_category_id uuid, p_expected_version integer, p_name text, p_credits integer)` | 3 as add · 4: find its Dan, lock the Dan row, lock the category `for update` · 5: version · 7: duplicate name (another category of the Dan) · 8: update (Assistant Instructor may be renamed and re-credited) | `{status, id, version}` |
| `star_reorder_categories(p_dan integer, p_expected_ids uuid[], p_new_ids uuid[])` | exactly 0003 §2.4 with the Dan instead of the school (`invalid` / `stale` rules identical); no version changes | `{status}` |
| `star_delete_category(p_category_id uuid, p_expected_version integer)` | 4: lock Dan row, category `for update` · 5: version · 6: `from_class_count` → `invalid` (Assistant Instructor can't be deleted, v0.61) · 8: delete; shift later positions −1. Events keep their copy (v0.61) | `{status}` |
| `star_update_grade_values(p_expected_versions integer[], p_values numeric[])` | 3: either array null or not exactly 7 elements (A+ … D order); a null element; a value outside 0–9.9 or with more than one decimal; values not **strictly** decreasing → `invalid` · 4: all Dan rows in Dan order, then the 7 rows by position `for update` · 5: any version differs → `stale` · 8: update the changed rows | `{status, versions:[7 integers]}` |
| `star_update_assistant_table(p_expected_version integer, p_child_max_age integer, p_child_mins integer[], p_adult_mins integer[])` | 3: nulls; age not 1–30; an array not exactly 6 (A+ … C); a minimum not 1–999; a column not strictly decreasing → `invalid` · 4: all Dan rows in Dan order, then the row `for update` · 5: version · 8: update | `{status, version}` |

### 6.2 Events (v0.85–v0.92)
| Function | Role | Ordered checks | Ok |
|---|---|---|---|
| `star_add_event(p_name text, p_testing_date date, p_start_time time, p_where_code text, p_registration_open boolean, p_auto_close_on date, p_note text)` — action `star_add_event` | A | 3: name rule; date null or before today; start time null or not `star_start_time_is_valid`; where null or not a `locations` code; open null; closing date set and (before today or after the testing date); note set and not `testing_note_is_valid` → `invalid` · 4: share-lock the template (§1.5) · 6: the template has a Dan with no subjects or not exactly one `from_class_count` → `invalid` · 7: name exists (normalized, any case) → `duplicate_name` · 8: take `pg_advisory_xact_lock(hashtext('star_public_code'))`, then insert (two codes from `testing_new_public_code()`, re-drawn until neither is used in either column; open → `first_opened_at = now()`), then `star_copy_template_into_event` (copies every Dan, category, grade value and the assistant row as they are **at that moment**), then the purge | `{status, id, public_code_worcester, public_code_shrewsbury, version:1}` |
| `star_update_event(p_event_id uuid, p_expected_version integer, p_name text, p_testing_date date, p_start_time time, p_where_code text, p_auto_close_on date, p_note text)` — `star_update_event` | A | 3: as add, except the date (checked in 6) · 4: lock the event `for update` · 5: version · 6: a **changed** date before today → `invalid` (a past event may keep its date; moving it into the future returns it to Upcoming, v0.92); a **changed** closing date before today, or any closing date after the (new) testing date → `invalid` · 7: another event with that name → `duplicate_name` · 8: update (unchanged → no write). The copy is never touched. The Registration switch is **not** an argument: the dialog calls `star_set_registration` with the new version when the switch changed (as Color Belt) | `{status, version}` |
| `star_set_registration(p_event_id uuid, p_expected_version integer, p_open boolean)` — `star_set_registration` | S / A | exactly 0005 `testing_set_registration` (v0.85, v0.86): 3 nulls · 4 lock event `for update` · 5 version · 6 `finished` → `finished`; opening when the closing date has passed → admins only (staff `not_allowed`) and the date is cleared · 8 set the switch (first opening sets `first_opened_at`; same value → no write) | `{status, version, state}` |
| `star_delete_event(p_event_id uuid, p_expected_version integer, p_expected_candidate_count integer, p_expected_payment_total_cents integer)` — `star_delete_event` | A | 3 nulls · 4: event `for update`, its candidates (id order), their payments (id order) · 5: version; count of **all** candidates (withdrawn too) or **net** payment total differ from the dialog → `stale` · 8: delete (cascades copies, candidates, signatures, grades, make-up subjects, payments, result emails; every row logged) | `{status}` |

### 6.3 Candidates (v0.110–v0.117, v0.148–v0.152, v0.164, S2, S3, S8)
| Function | Role | Ordered checks | Ok |
|---|---|---|---|
| `star_add_candidate(p_event_id uuid, p_first text, p_last text, p_date_of_birth date, p_email text, p_location_code text, p_dan integer, p_stars_from integer, p_paying_by text)` — `star_add_candidate` (New candidate) | S | 3: names; DOB set and (after today or before 1900-01-01); email null or not `star_email_is_valid` (OPEN-20); school not `worcester`/`shrewsbury`; Dan or stars null; stars < 0; paying by not cash/check/card → `invalid` · 4: lock the event · 6: `finished` → `finished` (works when registration is closed and on the testing day, v0.111); Dan not in the event copy or stars ≥ its limit → `invalid` · 8: insert (`source 'desk'`, no reference, no signature), duplicate flag (§5.6), purge | `{status, id, version:1}` |
| `star_add_makeup(p_event_id uuid, p_earlier_candidate_id uuid)` — `star_add_makeup` (Make-up from an earlier testing) | S | 3 nulls · 4: lock this event; read the earlier candidate and event (no lock) → `not_found` · 6: `finished`; earlier event's date not before this event's, or earlier candidate withdrawn → `invalid`; an **active** make-up candidate already points at it (here or elsewhere) → `already_added` (a concurrent add in another event that hits `star_candidates_one_active_makeup_idx` is also answered `already_added`, not the generic `stale`); its result (§5.5) not `makeup` → `stale`; `choice_needed` → `choice_needed` (OPEN-11); its Dan not in this event's copy or stars ≥ limit → `invalid` · 8: insert (`is_makeup` true, `paying_by` null, `source 'desk'`, names, DOB, email, school, Dan, stars copied, `makeup_of_*` set); **kept grades** (v0.163): for each judged subject of this event's copy whose normalized name matches an earlier subject that is **not** in `needs` and has a grade → a `kept` grade row with that letter and `kept_from_event_*` (OPEN-8); every other subject of the Dan (unmatched or in `needs`) → a `retest` row; class counts copied unless Assistant Instructor is in `needs` (OPEN-10) | `{status, id, version:1, kept_count, retest_count}` |
| `star_update_candidate(p_candidate_id uuid, p_expected_version integer, p_first text, p_last text, p_date_of_birth date, p_email text, p_location_code text, p_dan integer, p_stars_from integer, p_clear_grade_count integer)` — `star_update_candidate` (Edit details) | S; **Dan change on a paid row: A** (S8) | 3: as add (DOB may be null only on a desk row — a form row → `invalid`; email null only on a desk row); `p_clear_grade_count` < 0 → `invalid` · 4: `star_lock_candidate` · 5: version · 6: Dan changed: paid and not admin → `not_allowed`; Dan not in copy / stars ≥ limit → `invalid`; n = grade rows of the old Dan (kept included); n > 0 and `p_clear_grade_count` null → `{status:'grades_exist', grade_count:n}`; `p_clear_grade_count` ≠ n → `stale`. Stars change in the same Dan keeps grades (v0.164) · 8: delete those grades and the old Dan's make-up-subject rows (logged), update (unchanged → no write); names/DOB changed → recheck duplicates (both sides). Allowed for withdrawn candidates too (as Color Belt) | `{status, version, cleared_grade_count}` |
| `star_change_paying_by(p_candidate_id uuid, p_expected_version integer, p_paying_by text)` — `star_change_paying_by` | S | 3: not cash/check/card · 4–5 · 6: withdrawn → `withdrawn`; make-up → `no_fee`; paid → `already_paid` · 8 | `{status, version}` |
| `star_resolve_duplicate(p_keep_id uuid, p_keep_version integer, p_other_id uuid, p_other_version integer, p_keep_both boolean)` — `star_resolve_duplicate` | S | 3: nulls; same id → `invalid` · 4: both found (`not_found`); different events → `invalid`; lock the event, then both candidates in **id order** · 5: either version → `stale` · 6: either withdrawn → `withdrawn`; not each other's pair or not `possible` → `stale` · 8: keep both → both `kept_both`, pointing at each other; keep one → the other `withdrawn` with reason `duplicate_copy` (`withdrawn_by` = caller; staff may do this one withdrawal, v0.110, S2) and the kept one rechecked | `{status, keep_version, other_version}` |
| `star_set_private(p_candidate_id uuid, p_expected_version integer, p_private_on date, p_private_time time)` — `star_set_private`, or `star_clear_private` when both are null (Back to the testing day) | S | 3: exactly one null; time not `star_start_time_is_valid` (OPEN-14) → `invalid` · 4–5 · 6: withdrawn → `withdrawn` · 8: update (payments untouched, even after paying, v0.152; unchanged → no write) | `{status, version, expected_fee_cents}` |
| `star_withdraw_candidate(p_candidate_id uuid, p_expected_version integer)` — `star_withdraw_candidate` | A | 4–5 · 6: already withdrawn → `withdrawn` · 8: withdrawn, reason `withdrawn`; recheck whoever pointed at it | `{status, version}` |
| `star_restore_candidate(p_candidate_id uuid, p_expected_version integer)` — `star_restore_candidate` | A, or S for a `duplicate_copy` the same staff member withdrew less than 10 s ago (the toast's Undo, as 0005 §10) | 4–5 · 6: role rule → `not_allowed`; not withdrawn → `stale` · 8: active; duplicate recheck. Restoring a make-up row while another active make-up of the same earlier candidate exists hits `star_candidates_one_active_makeup_idx` → `stale` | `{status, version}` |
| `star_delete_candidate(p_candidate_id uuid, p_expected_version integer, p_expected_payment_ids uuid[])` — `star_delete_candidate` | A | 3: array null, null or duplicate element · 4: `star_lock_candidate`, then its payments (id order) · 5: version; payment id set ≠ the warning's → `stale` · 8: delete (cascades signature, grades, make-up subjects, payments, result emails; a later make-up row's `makeup_of_candidate_id` becomes null; recheck whoever pointed at it). DOB and email stay in `change_log` (S10) | `{status}` |

### 6.4 Payments (v0.109, v0.110, v0.152, v0.166, v0.167, S7)
| Function | Role | Ordered checks | Ok |
|---|---|---|---|
| `star_record_payment(p_candidate_id uuid, p_expected_version integer, p_method text, p_amount_cents integer, p_paid_on date)` — `star_record_payment` | S | 3: method not cash/check/card; amount not 1–100 000; date null or after today → `invalid` · 4–5 · 6: withdrawn → `withdrawn`; make-up → `no_fee`; already paid (net > 0) → `already_paid` · 8: insert `payment` (`recorded_by` = caller); **bump the candidate's version** (a double click gets `stale`); purge. Allowed in every event state | `{status, payment_id, version}` |
| `star_undo_payment(p_payment_id uuid)` — `star_undo_payment` | S if `recorded_by = auth.uid()` and `recorded_at > now() − 10 s`; otherwise A | 3 null · 4: `star_lock_payment` → `not_found` · 6: role rule → `not_allowed`; a `reversal` → `invalid`; already reversed → `stale`; a `payment` while the candidate has an **unreversed refund** → `invalid` (undo the refund first, so the total can't go negative) · 8: insert the reversal (works for a `payment` or a `refund`); bump version | `{status, version}` |
| `star_edit_payment(p_payment_id uuid, p_method text, p_amount_cents integer, p_paid_on date)` — `star_edit_payment` | A | 3 as record · 4 · 6: not a `payment` → `invalid`; already reversed → `stale`; the candidate has an **unreversed refund** → `invalid` (undo the refund first) · 8: reversal + new payment; bump | `{status, payment_id, version}` |
| `star_record_refund(p_candidate_id uuid, p_expected_version integer, p_method text, p_amount_cents integer, p_refunded_on date)` — `star_record_refund` | **A** (S7) | 3: method not cash/check; amount not 1–100 000; date null or after today → `invalid` · 4–5 · 6: withdrawn → `withdrawn`; overpaid (§5.3) = 0, or amount > overpaid → `{status:'refund_too_large', overpaid_cents}` · 8: insert `refund` with `−amount`; bump | `{status, payment_id, version}` |

### 6.5 Grading (v0.124–v0.130, v0.139, v0.151, v0.163–v0.165, S6)
| Function | Role | Ordered checks | Ok |
|---|---|---|---|
| `star_set_grade(p_candidate_id uuid, p_event_category_id uuid, p_grade text)` — `star_set_grade`; `p_grade` null = clear. **No version check: the last save wins, silently** (v0.165) | S | 3: ids null; grade set and not one of the 7 letters → `invalid` · 4: `star_lock_candidate` → `not_found` · 6, in this order: withdrawn → `withdrawn`; the subject is not in the candidate's event → `invalid`; it is, but of another Dan than the candidate's **current** Dan → `stale` (a stale tablet can't bring back grades a Dan change cleared, v0.164); the letter is not in the event's own grade copy → `invalid`; the subject is `from_class_count` → `invalid`; the cell holds a `kept` grade → `kept` · 8: insert / update / delete (same grade → no write). Every save logs before and after. Private students use the same function (their own page, v0.151) | `{status, grade, result}` (result = §5.5) |
| `star_set_count(p_candidate_id uuid, p_field text, p_value integer)` — `star_set_count`; no version check (S6) | S | 3: field not `classes_attended` / `assistant_classes`; value set and not 0–999 → `invalid` · 4 · 6: withdrawn → `withdrawn` · 8: update (no version bump, §2.11; logged) | `{status, result}` |
| `star_set_makeup_subjects(p_candidate_id uuid, p_expected_category_ids uuid[], p_category_ids uuid[])` — `star_set_makeup_subjects` (below the pass mark, v0.130) | **A** | 3: an array null; null or duplicate element; `p_category_ids` empty → `invalid` · 4 · 5: the current `chosen` set ≠ `p_expected_category_ids` → `stale` · 6: withdrawn → `withdrawn`; result not complete, has a D, or not below the pass mark → `invalid`; an id not a subject of the candidate's event and Dan → `invalid` · 8: replace the `chosen` rows | `{status, result}` |

### 6.6 Results (v0.141, v0.144, v0.170)
| Function | Role | Ordered checks | Ok |
|---|---|---|---|
| `star_mark_result_sent(p_candidate_id uuid, p_expected_result_key text)` — `star_mark_result_sent` | S | 3 nulls · 4 · 6: withdrawn → `withdrawn`; result not `passed`/`makeup` → `not_finished`; `result_key` ≠ the expected one → `stale` · 8: insert a `star_result_emails` row with the **result snapshot** (`result_status`, `result_total`, `result_needs`, `result_key`) | `{status, sent_id, marked_at}` |
| `star_undo_result_sent(p_sent_id uuid)` — `star_undo_result_sent` | S if the same staff member marked it less than 10 s ago; otherwise A (OPEN-16) | 3 null · 4: find its candidate; lock event → candidate → the row `for update` · 6: role rule → `not_allowed`; already undone → `stale` · 8: set `undone_*` | `{status}` |
| `star_results_csv(p_event_id uuid, p_dan integer)` — **`volatile`** (it writes the download row); no action tag (it writes `star_downloads`, not `change_log`); `p_dan` null = whole event (OPEN-21) | **A** | 1 access · 2 admin · 3 event null; Dan < 1 → `invalid` · 4: the event (no lock) → `not_found` · 6: Dan set and not in the copy → `invalid` · 8: count the rows, **insert the `star_downloads` row first**, then build the rows in the same call (a refused call writes nothing; if anything fails afterwards the whole call — log row included — rolls back and nothing is returned) | `{status, rows:[…]}` |
CSV rows: active candidates, in belt order (Dan, stars from, school Shrewsbury then Worcester, last name, first name — v0.117), with exactly the v0.144 columns as raw values: `dan, first_name, last_name, location_code, stars_from, stars_to, date_of_birth, email_for_results, paying_by, is_makeup, paid, paid_cents, classes_attended, assistant_classes, total, result_status, needs (names), sent (marked_at, marked_by_name, matches) | null`. Words and the file name are the client's. Never past values from `change_log`.

### 6.7 Every action tag
`star_seed`, `star_update_dan_settings`, `star_add_category`, `star_update_category`, `star_reorder_categories`, `star_delete_category`, `star_update_grade_values`, `star_update_assistant_table`, `star_add_event`, `star_update_event`, `star_set_registration`, `star_delete_event`, `star_add_candidate`, `star_add_makeup`, `star_update_candidate`, `star_change_paying_by`, `star_resolve_duplicate`, `star_set_private`, `star_clear_private`, `star_withdraw_candidate`, `star_restore_candidate`, `star_delete_candidate`, `star_record_payment`, `star_undo_payment`, `star_edit_payment`, `star_record_refund`, `star_set_grade`, `star_set_count`, `star_set_makeup_subjects`, `star_mark_result_sent`, `star_undo_result_sent`, `star_public_register`, `star_purge_old_signatures`. Undo calls use the function they call (Undo of Withdraw logs `star_restore_candidate`; Undo of Set private logs `star_clear_private` or `star_set_private`).

---

## 7. Staff read functions (S; `stable` unless they purge; `has_data_access()` first → `no_access`; missing → `not_found`)

`star_home_today` and `star_makeup_list` **write** (they run the signature purge), so they are `volatile`, and the data layer must call them as normal **POST** RPCs — **never** `rpc(…, { get: true })`, which runs in a read-only transaction and would fail. (The same holds for `star_results_csv`.)

The database takes **no device argument**: the mat-side tablet setting is **not a security boundary** (v0.161); the app hides DOB, email, payments and History values there.

| Function | Returns (ok) |
|---|---|
| `star_candidate_detail(p_candidate_id uuid)` (v0.112, v0.160) | `{status, candidate:{every star_candidates column except the login ids, **date_of_birth, email_for_results**, age_on_testing_day (null without DOB), dan_label, stars_to, testing_date}, signature:{state:'on_file'|'removed'|'none', signed_at, signature_deleted_at, ack_version}, payments:[granted payment columns, oldest first], paid_cents, expected_fee_cents, fee_kind, overpaid_cents, makeup_subjects:[{event_category_id, name, kind}], result, sent}` — one candidate by id; no list or bulk version exists. The duplicate compare dialog calls it once per column |
| `star_candidate_history(p_candidate_id uuid)` (v0.112, v0.169) | `{status, rows:[{occurred_at, actor_name, action, table_name, op, before, after}]}` newest first, at most 500: the `change_log` rows of this candidate (`table_name = 'star_candidates'` and `record_id` = id) and of its child rows, matched by the pair **`(table_name, record_id)`**: the child pairs are taken from `op = 'insert'` rows whose `table_name` is **one of the five child tables** (`star_payments`, `star_grades`, `star_makeup_subjects`, `star_result_emails`, `star_candidate_signatures`) and whose `after ->> 'candidate_id'` is this id (update rows hold only changed columns, so the child ids come from the insert rows). `candidate_id` is never read from any other table's rows, and a `record_id` is never matched without its `table_name` (another table's row with the same id, or another candidate's `duplicate_of` / `makeup_of_candidate_id` pointing here, never appears). DOB and email before → after in full (v0.169); the signature only as "on file"; every login-id key (`created_by`, `updated_by`, `withdrawn_by`, `recorded_by`, `marked_by`, `undone_by`) removed by `star_history_strip(jsonb)`; no `actor_id`, `session_id`, `batch_id`. Never used by the CSV |
| `star_view_signature(p_candidate_id uuid)` | `{status, signature: data URL | null, signed_at, signature_deleted_at}` (desk rows: `{status:'ok', signature:null, signed_at:null, …}`). Not logged |
| `star_age_groups(p_event_id uuid)` (v0.66, v0.168) | `{status, rows:[{candidate_id, age_group:'child'|'adult'}]}` for the event's active candidates — the group only, never a DOB or an age |
| `star_event_results(p_event_id uuid, p_dan integer)` (v0.138–v0.150, v0.158) | `{status, dan, pass_mark, max_score, counts:{candidates, passed, makeup, not_finished, testing_privately}, rows:[result (§5.5) + {first_name, last_name, location_code, sent}]}` in belt order; also feeds the Grading grid's Total / Result and the printed sheets. Dan not in the copy → `invalid` |
| `star_makeup_list(p_event_id uuid)` (v0.111) — `volatile`, purges | `{status, rows:[{candidate_id, first_name, last_name, location_code, dan, stars_from, stars_to, earlier_event_id, earlier_event_name, earlier_testing_date, needs, choice_needed, already_added}]}` per §5.8, newest earlier event first (the name search is the client's) |
| `star_home_today()` (v0.154, v0.155) — `volatile`, purges | `{status, today, events:[{id, name, start_time, where_code, where_name, counts:{worcester, shrewsbury}}], private:[{candidate_id, event_id, event_name, private_time, first_name, last_name, location_code, dan, stars_from, stars_to}]}`: events whose testing date is today (counts = active candidates **without** a private day, per school); private testings whose day is today (active), by time. No payment, DOB or email. The location switcher filters in the client |

Everything else the screens show is read with the column grants of §4.1 (Events list and counts, Rubrics and prices, the event copy, `star_roster`, `star_grades`, `star_makeup_subjects`, `star_result_emails`).

---

## 8. The public path (family form, v0.33, v0.105, v0.159)

### 8.1 The login `star_registrar`
Created only if missing, with **the same settings as `testing_registrar`**: `create role star_registrar login noinherit nocreatedb nocreaterole nobypassrls noreplication connection limit 5`; `alter role star_registrar set statement_timeout = '5s'`, `set idle_in_transaction_session_timeout = '10s'`, `set search_path = ''`. **No password in the file.** `grant usage on schema public to star_registrar`; execute on `star_public_event` and `star_public_register` only; **nothing else granted by us** — no rights on any table, view or sequence (including `testing_public_attempts`), not a member of any role, no member roles except the creating owner (PostgreSQL 16+ adds that link). `authenticator` must not be able to become it. `testing_registrar` and 0005's tests (incl. T2a) are untouched: `testing_registrar` can't run Star's functions and `star_registrar` can't run Color Belt's.

### 8.2 `star_public_event(p_code text) returns jsonb` — `stable security definer`
Code null or not `^[a-hjkmnp-z2-9]{8}$`, matching neither code column, **or matching more than one row** (should never happen; refused rather than guessing a school) → `{status:'not_found'}`. Else `{status:'ok', state:'open'|'not_open'|'closed'|'finished', closed_on, school:{code, name} (from the column that matched — the link sets the school), event:{name, testing_date, start_time "HH:MM", note, auto_close_on, where:{name, address|null}} (address from `testing_location_address(where_code)`, for "Location: <school>, <street address>", v0.107), dans:[{dan, label, star_limit, standard_cents, same_day_cents, pass_mark, max_score, categories:[{name, credits}]}]}` from the event copy. Nothing else: no counts, no candidates, no ids, no private fee.

### 8.3 `star_public_register(p_code text, p_client_key text, p_submission_id uuid, p_first text, p_last text, p_date_of_birth date, p_email text, p_dan integer, p_stars_from integer, p_paying_by text, p_acknowledged boolean, p_signature text, p_ack_version text) returns jsonb` — wrapper, `volatile security definer`
As 0005 15c: clears `request.jwt.claims` / `request.jwt.claim.sub`; removes `testing_public_attempts` rows older than 2 days; runs `star_public_register_core(…)` (same arguments, internal, no grant) inside a block where `unique_violation`, `foreign_key_violation`, `check_violation`, `not_null_violation`, deadlock, serialization and lock errors become `invalid` (everything the core did is undone); **then** inserts this call's `testing_public_attempts` row — `client_key` (≤ 200), `event_id` (the Star event matched, or null), `outcome = 'star:' || status` — outside the part that can roll back, so every call counts; then returns the answer. **It does not run the signature purge** (unlike 0005): the registrar has a 5-second statement timeout, and a large purge should never make a family's registration fail (see §11b).
**Core, in this order:** 1 the event by code → `not_found` (also when the code matches more than one row, as §8.2) · 2 this `submission_id` already in `star_candidate_signatures`: same event → the same ok answer again (idempotent); another event → `invalid` (never its details) · 3 lock the event `for no key update` and read it again · 4 state: `not_open` / `closed` (+ `closed_on`) / `finished` · 5 input → `invalid`: client key 1–200 characters; submission id; names (name rule); DOB not null, not after today, not before 1900-01-01; email `star_email_is_valid`; Dan and stars not null; paying by `cash`/`check` only; acknowledged true; `testing_signature_is_valid(signature)`; `ack_version` = the current constant (OPEN-3) · 6 Dan in the event copy and 0 ≤ stars < its limit → else `invalid` · 7 rate limit: ≥ 20 rows for this client key in the last hour (**both forms' rows count** — one shared limit per visitor key, documented) → `rate_limited`; ≥ 200 rows for this event in the last hour → `raise log` only (never refused) · 8 actor label "Family form", action `star_public_register`: insert the candidate (`source 'form'`, `reference 'ST-' || nextval`, school = the link's, the possible-duplicate flag by name + DOB, accepted silently) and its signatures row (`signed_at = now()`); a concurrent duplicate `submission_id` caught on `star_candidate_signatures_submission_id_key` is re-selected and answered as step 2 · 9 the ok answer.
**Ok answer** (`star_public_answer(candidate_id)`): `{status:'ok', reference, first_name, last_name, dan, dan_label, stars_from, stars_to, standard_cents, same_day_cents, paying_by, event_name, testing_date, start_time, school_name, where:{name, address|null}}` — **identical whether or not the person looks like a duplicate** (v0.97); no DOB, email or signature echoed.

### 8.4 Route and Function (interface for the later public-path builder; not built in this step)
Star gets **its own page route and Pages Function** (`/star/<code>` and `functions/api/star/[code].js` — OPEN-2), the same checks as Color Belt's (CONTRACT-0005 §4.2: kill switch `STAR_PUBLIC_REGISTRATION` default off, Origin, JSON, ≤ 100 KB, honeypot, too-fast, Turnstile with action `star_register`, HMAC client key, typed parameters, `prepare: false`, no error text leaked), connecting through a **second Hyperdrive config** (caching **disabled**, origin connection limit ≤ 5) bound as `HYPERDRIVE_STAR` with the `star_registrar` login.

### 8.5 Jeffrey's one-time setup (SETUP §13, step by step, after the 0006 paste)
1. Clipboard history off (as SETUP §12a step 0).
2. SETUP §13 ships its **own complete script `make-scram-star.mjs`** (the §12d script with `star_registrar` written in, not a note to edit §12d's). On his PC it makes a random password and its SCRAM verifier and prints one line. **Check the printed line names `star_registrar`** (not `testing_registrar`) before pressing Run; only that `alter role star_registrar password 'SCRAM-SHA-256$…';` line is pasted into the SQL Editor. The password goes into a **separate password-manager entry** ("Supabase star_registrar", not the Color Belt one). Afterwards: remove the SQL snippet from the editor history and **delete the script file**.
3. Cloudflare → Hyperdrive → a second config `tkd-star-registrar` (user `star_registrar`, caching disabled, origin connection limit ≤ 5), bound to **Production only** as `HYPERDRIVE_STAR` — done when the Star Function is built, with his OK.
4. **Off switch** (any time): `revoke execute on function public.star_public_register(…), public.star_public_event(text) from star_registrar;` (instant), then `STAR_PUBLIC_REGISTRATION=off` + redeploy, then `alter role star_registrar nologin`.

---

## 9. Tests

### 9.1 `supabase/tests/0006_tests.sql` (copy 0005_tests' shape)
One transaction, one `do $$ … $$` block, `rollback;` at the end ("NEVER change the final rollback to commit"), placeholders `<paste-admin-UID-here>` / `<paste-desk-UID-here>`, `raise exception 'TEST FAILED: <id> …'` / `'TEST SETUP: …'`, final row **`ALL 0006 TESTS PASSED`**. Its own test events and candidates with names like `'zz test ' || left(gen_random_uuid()::text, 8)`, so it passes before and after real Star events exist. Sessions as 0005: **A1** admin unlocked · **A2** locked · **A3** 5 wrong PINs · **A4** signed out · **A5** password 8 days old · **A6** magic link · **A7** idle-expired · **A8** inactive admin · **D1** desk unlocked · **D2** desk locked · **D3** desk magic link · anon. Public functions are called as the SQL Editor's role (same answers; they run as their owner); `star_registrar` is proved from the catalog (T2) and live in PGlite (§9.3). Tests that change the template restore nothing by hand — the rollback does. Checks are **by name**, so 0003–0005 tests keep passing unchanged.

| Id | Test |
|---|---|
| **T1 Who may call what** | |
| T1a | anon: every one of the 37 staff functions and the 2 public functions → 42501; `select` on every 0006 table and `star_roster` → 42501 |
| T1b | A1 and D1 can't execute the 2 public functions or any helper (42501) |
| T1c | A2–A8 and D2–D3 → `no_access` from **every** staff function, each called three times (sensible arguments; broken input — nulls, `''`, −1, null arrays; ids that exist nowhere): all 3 answers are `no_access` (access is checked before input and lookups); table snapshot (md5 of every 0006 table) and `change_log` count unchanged; no purge happened |
| T1d | D1 → `not_allowed` from every A function (rubric 7, `star_add_event`, `star_update_event`, `star_delete_event`, withdraw, restore of a normal withdrawal, delete candidate, edit payment, refund, make-up subjects, CSV), three calls each; nothing written |
| T1e | A2–A8 read 0 rows from every readable 0006 table and the view; A1 and D1 read the same counts as `postgres` |
| T1f | A1: direct insert / update / delete / truncate on every 0006 table → 42501; `select *` and every never-granted column (§4.2) → 42501 |
| **T2 `star_registrar`** (catalog, as 0005 T2a–T2g) | |
| T2a | in schema public it may execute **exactly** `star_public_event` and `star_public_register` (one version each); `testing_registrar` still exactly its two (0005's T2a unchanged and passing); neither login can execute the other's |
| T2b | no 0006 function is executable by PUBLIC |
| T2c | no right on any table / column / sequence in any reachable schema — **explicitly none on `testing_public_attempts`** (as 0005 T2c) |
| T2d | can't CREATE in any schema or the database |
| T2e | `authenticator`, `anon`, `authenticated`, `service_role` can't become it; it is a member of no role; its only member is the tables' owner |
| T2f | attributes and settings exactly §8.1 |
| T2g | one owner for every 0006 function, table, view and sequence |
| **T3 Rubrics and prices** | |
| T3a | seed: 3 Dans (limits 4/3/5, pass 245, fees), 11/13/10 categories totalling 70 each, one `from_class_count` per Dan, 7 grade values, the assistant row — after a fresh install **and** after a second run (no duplicates even when a seeded category was renamed or deleted first) |
| T3b | every §6.1 function: ok path, version bumps, unchanged → no bump and no log row, `stale` on a wrong version, `duplicate_name` (case and spaces), positions dense after add / delete / reorder, reorder bumps no version |
| T3c | Assistant Instructor: rename and re-credit ok; delete → `invalid`; `from_class_count` can't change (as postgres → `check_violation`); a second one can't exist (unique index) |
| T3d | a Dan at 75 credits saves ok (70 not required) |
| T3e | grade values not strictly decreasing / out of range / wrong length → `invalid`; D may be non-zero; assistant table not decreasing per column → `invalid` (and `check_violation` as postgres) |
| **T4 Events** | |
| T4a | add: two different valid codes, closed, copy equals the template at that moment; later template changes (fee, credits, rename, delete a subject, grade value, assistant minimum) leave the event's copy unchanged; a new event copies the new values |
| T4b | input rules (past date, bad start time 07:45 / 20:15 / 10:10, unknown Where, closing date after the testing date or in the past, note > 600) → `invalid`; duplicate name across events → `duplicate_name` |
| T4c | update: past event keeps its date; moving it into the future ok; changing it to another past date → `invalid`; copy untouched; as postgres a code change → `check_violation`; any update of a copy row → `check_violation` |
| T4d | state at the minute boundaries in America/New_York (11:59:59 PM vs 12:00:00 AM on the closing date and the testing date), using the same case table as the client's checks; switch rules per role (staff reopen after the date → `not_allowed`; admin reopen clears the date; `finished` refuses) |
| T4e | delete event: wrong count / total / version → `stale`, nothing removed; ok removes copies, candidates, signatures, grades, payments, make-up subjects, result emails, every row logged with `star_delete_event` and one batch id |
| **T5 Family form** | |
| T5a | `star_public_event`: ok shape for each link (school from the code), `not_found` for unknown / malformed codes; no counts, ids or private fee anywhere in the answer |
| T5b | register ok: stored candidate (`source form`, `ST-` reference, school from the link, paying by), signatures row, change_log rows by "Family form" with action `star_public_register`; **called with an admin's JWT claims set in the session, it still logs actor "Family form" with a null `actor_id`** (the wrapper clears the claims first) |
| T5c | the same `submission_id` again → the same answer, no second row; the same id on another event → `invalid` |
| T5d | every input rule → `invalid`, nothing written (future DOB, bad email, card, unticked acknowledgement, bad / too long / non-PNG signature, wrong ack version, Dan not in the copy, stars at the limit) |
| T5e | refusals by state: `not_open`, `closed` + `closed_on`, `closed` + null, `finished` |
| T5f | rate limit: the 21st call within an hour for one client key → `rate_limited`, **counting Color Belt rows for that key too**; every call writes one attempts row with a `star:` outcome; rows older than 2 days are cleaned up |
| T5g | a same-name + same-DOB registration is flagged `possible` on both rows **and gets an answer identical in shape and values (except reference / names) to a non-duplicate** |
| **T6 Candidates** | |
| T6a | add (desk): no DOB allowed (S3); duplicate by name alone when a DOB is missing; `finished` refused; stars ≥ limit → `invalid` |
| T6b | update: version; school change moves `location_code` (logged); stars change keeps grades; Dan change with grades → `grades_exist` + count, wrong count → `stale`, right count clears them (log rows hold the cleared grades); Dan change on a paid row by D1 → `not_allowed`, by A1 ok; DOB/email edit rechecks duplicates |
| T6c | resolve duplicate: keep both; keep one (other withdrawn `duplicate_copy`, restorable); D1 restores its own keep-one within 10 s, not later, not someone else's; A1 any time; A1 restoring a withdrawn make-up row while another active make-up of the same earlier candidate exists → `stale`, nothing changed |
| T6d | withdraw / restore / delete (payment ids must match); delete sets a later make-up row's link to null |
| T6e | private: set / change / clear; one null → `invalid`; private day before and after the testing day both ok; fee becomes private and back (via `star_roster` and `star_expected_fee_cents`) |
| T6f | make-up add: kept grades copied by name, `retest` rows for the needs and unmatched subjects, counts per OPEN-10, `already_added` (here and in another event; and, as postgres, a second active make-up row for the same earlier candidate → `unique_violation` on `star_candidates_one_active_makeup_idx`; a withdrawn make-up row doesn't block a new one), `stale` when the earlier result is no longer make-up, `choice_needed`, an earlier event not earlier → `invalid`; a later correction on the earlier event doesn't change the copy (v0.163) |
| **T7 Payments** | |
| T7a | expected fee by date: day before the testing day → standard; on it and after → same day; private → private; make-up → 0 (view and function agree) |
| T7b | record: any amount counts as Paid; `already_paid`; `no_fee`; `withdrawn`; double click with the old version → `stale`; allowed when `finished` |
| T7c | undo window: D1's own payment just now → ok; another staff member's or after 10 s → `not_allowed`; A1 always; reversal of a reversal → `invalid`; already reversed → `stale` |
| T7d | edit (A) = reversal + new payment |
| T7e | refund: overpaid after Back to the testing day ($160 paid, $140 due → $20); refund $20 ok → not overpaid; $21 or any refund when not overpaid → `refund_too_large` with `overpaid_cents`; D1 → `not_allowed`; undo of a refund (A) restores the overpaid amount |
| T7f | append-only: update and delete as postgres refused; delete allowed only in a cascade or with the two `star_delete_*` tags; **Color Belt's `delete_student` / `delete_event` tags don't unlock a Star payment delete, and Star's `star_delete_*` tags don't unlock a `testing_payments` delete** |
| T7g | the net total never goes below zero: undo of a payment while an unreversed refund exists → `invalid`; edit of that payment → `invalid`; after undoing the refund both work; as postgres, a refund or reversal insert that would make the net negative → `check_violation` `star_payments_net_check` |
| **T8 Grading** | |
| T8a | set / change / clear a grade; same grade again → no row change, no log row; two saves from different sessions: the later one stays, both are in `change_log` (no version argument exists) |
| T8b | refusals in order: withdrawn → `withdrawn`; subject of another event → `invalid`; subject of the candidate's old Dan after a Dan change → `stale`; letter not in the copy → `invalid`; Assistant Instructor subject → `invalid`; kept cell → `kept` |
| T8c | counts: null vs 0 kept apart; 1000 / −1 → `invalid`; a count save bumps no version and is logged |
| T8d | make-up subjects (A): only when complete, no D, below the pass mark; expected set mismatch → `stale` |
| **T9 Results** | |
| T9a | handoff Appendix B cases through `star_event_results`: all A+ → 315.0 passed; all B+ → exactly 245.0 passed; all A+ with one D on a 5-credit subject → 292.5 `makeup` with that subject in `needs`; nothing graded with assist = 20 → `not_finished`; the assistant letters of §5.4 (12/14 → A, 13/19 → A, 13/18 → A, 13/17 → B+, 12/9 → D, no DOB/14 → B) |
| T9b | worked out every time: a late grade changes the result on the next read; a changed grade value in the template does **not** change an existing event's result; the testing date change moves the age group |
| T9c | private before grading → `testing_privately`; after complete → normal status |
| T9d | below the pass mark, no D → `makeup`, `choice_needed` true until chosen, then `needs` = the chosen subjects; D and below → needs = D only, both reasons |
| T9e | Mark as sent: ok with snapshot; `not_finished` for not finished / testing privately; stale key → `stale`; a later grade that changes the result → `matches` false ("Not sent yet" again) with the earlier send returned; undo window as T7c |
| **T10 CSV and downloads** | |
| T10a | D1 → `not_allowed` and **no** `star_downloads` row; A2 → `no_access`, no row; A1 ok → exactly one row (who, when, event, Dan, row count) written in the same call, rows include DOB and email, active candidates only, belt order; whole event and one Dan |
| T10b | `star_downloads`: update / delete / truncate refused even for postgres; no `change_log` row for a download |
| **T11 Privacy proofs** | |
| T11a | `has_column_privilege` false for `date_of_birth` and `email_for_results` for authenticated, anon, service_role, PUBLIC, `star_registrar`, `testing_registrar`; no column of `star_candidate_signatures` or `star_downloads` is readable by any of them; `star_roster`'s columns contain no DOB, email, signature, submission id or login id (exact column list) |
| T11b | no `change_log_write` trigger on `star_candidate_signatures`; its log trigger exists; **`change_log` never contains `data:image`** after register, purge, edit, delete candidate and delete event (as 0005 C8); no `change_log` row contains a `submission_id` key from Star tables |
| T11c | purge: a signature of an event 91 days ago is removed by the next purging call, version and `updated_*` unchanged, log shows `"on file" → null`; 90 days ago kept; a private tester's uses the event's testing date (S9); `star_public_register` removes nothing (§11b) |
| T11d | DOB and email **are** in `change_log` in full on insert and on change (v0.169 — proves the decided behaviour), and stay after Delete permanently (S10) |
| T11e | `star_candidate_history`: only this candidate's rows — a **second candidate in the same event** with its own payments (incl. an undo), grades, a signature and a duplicate link to the first (`duplicate_of` pointing at it) must have **none** of its rows in the first one's history, and vice versa; child rows found through their insert rows, matched by `(table_name, record_id)`, no login-id keys, no `actor_id` / `session_id` / `batch_id`; `star_candidate_detail` and `star_view_signature` → `no_access` for A2–A8 |
| T11f | `star_public_event` / `star_public_register` answers never contain another candidate's data, a count, a DOB or an email |
| **T12 Logging** | |
| T12a | every write function: one row per changed row with the right `action` tag (§6.7), `op`, `table_name`, `record_id`, `actor_id`, `actor_name` (`staff.full_name`; desk = "Staff"), `session_id`; candidates' rows carry `location_code`, events' rows don't; one non-null `batch_id` per call; `tkd.action` and `tkd.batch_id` are `''` after each call |
| **T13 Catalog** | |
| C1 | RLS on all 16 tables; `star_candidate_signatures` and `star_downloads` have no policy; every other table exactly one SELECT policy to authenticated using `has_data_access()`; no write policies |
| C2 | table-wide rights false for anon, authenticated, service_role, PUBLIC (SELECT … MAINTAIN); column SELECT for authenticated **exactly** §4.1 (and every listed column exists) |
| C3 | the sequence: no rights for anyone |
| C4 | every 0006 function (by name list): exactly one version, `search_path=""`, `prosecdef` exactly as designed (staff, read and public functions, `star_candidate_signatures_log`; helpers not), `pronargdefaults = 0`, identity arguments exactly §6–§8, execute exactly §4.3, no PUBLIC in `proacl`; the total count equals the list |
| C5 | `star_roster` has `security_invoker=true` |
| C6 | foreign-key delete rules as §2 (cascade / set null / no action) |
| C7 | every trigger of §2.11 exists, runs the right function and is enabled (`tgenabled = 'O'`) |
| C8 | every named constraint and index of §2 exists (including the partial unique `star_candidates_one_active_makeup_idx` with its exact `where` clause); the deferrable position unique is `condeferrable`, not deferred |
| C9 | the 0003/0005 helpers Star calls (§1.2) have the fingerprints they had before 0006 (proves 0006 didn't replace them) |

### 9.2 `supabase/tests/0006_fingerprints.sql`
Read-only, one SELECT, **connector-safe**: none of its text contains the words the Supabase connection refuses (function names containing them are spelled in pieces, e.g. `'star_del' || 'ete_event'`, as 0005 does). Rows, ordered by kind and name: **function** (every 0006 function from a `fns(name)` CTE: name, identity arguments, `md5(regexp_replace(regexp_replace(prosrc, '--[^\n]*', '', 'g'), '\s+', '', 'g'))`, `prosecdef`, `array_to_string(proconfig, ',')`, `proowner::regrole`, sorted `grantee:privilege_type` from `aclexplode(coalesce(proacl, acldefault('f', proowner)))` — the generic `aclexplode` output as it comes, **no privilege names written in the query**) · **role** (`star_registrar`: attributes, settings, memberships) · **view** (`star_roster`: md5 of its definition, options) · **table** (each 0006 table and the sequence: RLS flag, exact table and column rights) · **trigger** (every trigger on those tables). Rights on tables and columns are read the same generic way (`aclexplode` of `relacl` / `attacl`), and column names are never spelled out in the query (no `signature_deleted_at` or similar — columns are listed from `pg_attribute`). Every line must match the PGlite run.

### 9.3 PGlite step 12 (`supabase/tests/pglite/run.mjs`)
After step 11 (0005), on the main database: print the 0003, 0004 and 0005 fingerprints → apply `0006_star_testing.sql` → **the 0003/0004/0005 fingerprints are identical to before** (proves 0006 changed none of them) → run `0006_tests.sql`, then **every earlier test file again** (`verify_pin_tests.sql`, `0002_tests.sql`, `0003_tests.sql`, `0004_tests.sql`, `0005_tests.sql`) — all must print their PASSED row **unchanged** → Star registrar live checks (as `registrarLiveChecks`, with `set role star_registrar`): reading every `star_*` table and the view, `testing_public_attempts`, `change_log`, `staff`, `locations`, `auth.users`; using the sequence; writing a Star table; calling a staff function, `has_data_access()`, a helper, `star_public_register_core`, and `testing_public_register` / `testing_public_event`; creating a table or schema — all refused; and with `set role testing_registrar`, calling `star_public_event` / `star_public_register` refused → seed a Star test event with candidates, grades and a payment, run 0006 and 0005 tests again → apply 0006 a **second time**: data snapshot of every 0006 table + `change_log` count and the 0006 fingerprints unchanged, tests pass again → on the upgrade database, 0006 on top: fingerprints equal a fresh install, tests pass. Step 12 also **fails if the text of `0006_fingerprints.sql` matches `/delete|drop/i`** (so it stays runnable through the connector). `stubs.sql` and earlier steps are not changed. Exit code 0 = pass.
**0003–0005 tests must still pass unchanged**; none of their files is edited.

---

## 10. Paste and verify (SETUP §13, for Jeffrey) and revert

1. **Before:** Jeffrey's OK for this paste; the PGlite run passed; security review done. Claude checks read-only that no `star_` object exists yet.
2. **Apply** (you): Supabase → SQL Editor → New query → paste the whole `0006_star_testing.sql` → Run → confirm the destructive-operations warning (expected, §0). It is one transaction: if anything fails, nothing is kept.
3. **Read-only checks** (Claude, through the connector): `select version()`; list the new tables; run `0006_fingerprints.sql` (every line must equal the PGlite output) and `0005_fingerprints.sql` (unchanged from its production record); the security advisor (no new warnings for `star_` objects).
4. **Tests** (you): paste `0006_tests.sql` with the two UIDs filled in → Run → last row `ALL 0006 TESTS PASSED`; then `0005_tests.sql` again → `ALL 0005 TESTS PASSED`. Replace the UIDs with the placeholders again afterwards.
5. **`star_registrar` password** (you): §8.5 steps 1–2. Hyperdrive (step 3) waits for the Star Function build.
6. **Revert** (only if something is badly wrong, before real Star data exists — it removes every Star record): a SETUP §13 snippet, pasted by Jeffrey, in one transaction: revoke the two public functions from `star_registrar`, drop the 0006 functions, the view, the 16 tables and the sequence, revoke usage on schema public from `star_registrar`, drop the role. `change_log` rows written by Star stay (append-only — including any DOB and email, S10); Star's `testing_public_attempts` rows age out within 2 days. No 0001–0005 object is touched.

---

## 11. Resolutions made in this contract (technical; for Jeffrey to check)

1. **The event row is the first lock** for every Star write (not a school row) — plan §2.5 / S5; the reviewer checks it.
2. **Form-only data lives in `star_candidate_signatures`** (signature, `submission_id`, acknowledgement, ack version), so the candidate table can use the normal log trigger while the signature and submission id never reach `change_log`.
3. **Events name their place `where_code`**, not `location_code`, so the change log never files a joint event under one school.
4. **Two code columns** on `star_events` (one per school), unique in each column and across both (rule trigger).
5. **Written-once tables** (event copies, payments, result emails, downloads) have no version / `updated_*` columns (as 0005's copies and payments); they are guarded instead.
6. **Class-count saves and category reorders bump no version** (they are logged), so a count typed at the mat never makes an open Edit details dialog go stale.
7. **Edit event doesn't take the Registration switch**; the dialog calls `star_set_registration` afterwards (as Color Belt).
8. **Refunds:** kind `refund`, method cash or check, undone by an admin with `star_undo_payment` (a reversal of the refund).
9. **New statuses:** `already_added`, `choice_needed`, `grades_exist`, `kept`, `no_fee`, `refund_too_large`, `not_finished`.
10. **Limits not set by the rulebook:** credits 1–100, highest star 1–20, pass mark up to 9999.9 with one decimal, age split 1–30, assistant minimums 1–999, class counts 0–999, DOB from 1900-01-01, email ≤ 254 characters matching `^[^@\s]+@[^@\s]+\.[^@\s]+$` (trimmed, stored as typed, no invisible characters). Reference counter starts at `ST-4001`.
11. **Whole-number arguments are `integer`** (Postgres.js sends `int4`).
12. **Attempts rows from Star** carry the outcome `star:<status>`, so the two forms can be told apart in the shared ledger; the shared 20-per-hour limit counts both forms.
13. **The public ok answer** echoes no DOB, email or signature (a retry with the same submission id returns it again).
14. **Make-up list** leaves out anyone already added as an active make-up in another event; only events with an earlier testing date are searched.
15. **History** finds payments, grades and other child rows through their insert rows, and strips every login id.
16. **The purge** also runs from two reads (`star_home_today`, `star_makeup_list`) so it happens on ordinary days without a write.
17. **Mark as sent** is refused (`stale`) when the result changed since the screen showed it (`p_expected_result_key`).

---

## 11b. Known, accepted

- **`ST-####` references are sequential**, so a reference shows roughly how many Star registrations there have been. Same as Color Belt's `CB-####` (0005); there is no public lookup by reference.
- **The signature purge and the registrar's 5-second timeout:** 0005 purges at the end of every family registration. **Star chose not to purge from the public register path at all**, so a long purge can never time out a family's Send. The purge runs from staff calls only (`star_add_event`, `star_add_candidate`, `star_record_payment`, `star_home_today`, `star_makeup_list`), where staff use on any normal day is enough for the 90-day rule.
- **`star_candidate_detail` reads aren't logged.** Staff and admins may see DOB and email in the detail view (v0.160); who opened which detail is not recorded (the same for `star_view_signature` and `star_candidate_history`).

## 12. Former OPEN items — all decided by Jeffrey 2026-10-18 (rulebook v0.173): every working assumption below is now the rule; OPEN-23 he answered himself (No)

| # | Question (source) | Decision (v0.173) |
|---|---|---|
| OPEN-1 | v0.85 / v0.88 say the automatic close is "recorded in the change log" ("Closed automatically at the end of Feb 6"), but the state is worked out, never stored, and nothing runs overnight (0005 doesn't log it either) | **Not logged**; the History / Edit event screens can show a worked-out line instead |
| OPEN-2 | The Star form's web address and Pages Function route (v0.159 "still to confirm") | `/star/<code>` and `functions/api/star/[code].js` (no database effect) |
| OPEN-3 | The school's acknowledgement wording (v0.102, v0.107) and so the `ack_version` value | Placeholder constant `'st-2026-10-18'`; it changes with the wording |
| OPEN-4 | May staff edit other details (name, school, DOB, email, stars) on a **paid** row? (v0.110 "Edit candidate on unpaid rows", v0.160 "still to confirm"; only the Dan change is decided, S8) | Allowed for staff; only the Dan change on a paid row is admin-only |
| OPEN-5 | The fee owed after a Dan change on a paid row (v0.164) | Worked out from the new Dan; the payment is untouched (Paid stays Paid, any overpaid shows) |
| OPEN-6 | Are class counts kept on a Dan change? (v0.164) | Kept |
| OPEN-7 | A make-up candidate's kept grades on a Dan change (v0.164) | Cleared with the other grades (counted in `grade_count`) |
| OPEN-8 | Matching a kept grade when a subject was renamed or removed between events (v0.163) | Exact normalized name match; anything unmatched is retested |
| OPEN-9 | Correcting a kept grade on the later event (v0.163) | Refused (`kept`); corrected on the earlier event before the make-up is added, or by deleting and re-adding the make-up |
| OPEN-10 | Make-up class counts: kept or entered again? (v0.129) | Copied, unless Assistant Instructor is one of the subjects to retest (then left empty) |
| OPEN-11 | A below-pass-mark result before an admin chose subjects: does it show in the make-up list, can it be added? (v0.130) | Listed with `choice_needed`; Add refused with `choice_needed` |
| OPEN-12 | D **and** below the pass mark together: retest only the D subjects? (Results mockups show "D in Breaking · below 245 · retests Breaking") | Needs = the D subjects only; the admin choice is not offered |
| OPEN-13 | A private student partly graded (v0.150) | "Testing privately" until every subject is graded |
| OPEN-14 | Limits on the private day and time (v0.168) | Any day; time on a 15-minute step from 8:00 AM to 8:00 PM, like Start time |
| OPEN-15 | What counts as a "different" result after Mark as sent (v0.170) | Status, total or subjects to retest |
| OPEN-16 | Correcting a mistaken Mark as sent after the Undo toast (v0.141) | The same staff member within 10 s; admins any time |
| OPEN-17 | Back to the testing day **on** the testing day: standard or same-day fee? (v0.152) | Decided by the payment's date (paid before the testing day → standard) |
| OPEN-18 | A private student paying after their private day (v0.167) | Always the private fee |
| OPEN-19 | "Paid now" tick in New candidate (v0.111) | Not built; payment is a second step |
| OPEN-20 | Is email required for a desk entry? (only DOB was exempted, S3) | Required (as the form); the table allows null so this can change without a migration |
| OPEN-21 | CSV: whole event or the selected Dan; the file name (v0.144) | The function does both (`p_dan` null = whole event); the screen decides |
| OPEN-22 | Should admins see the download log anywhere? (v0.144 "Downloads are logged") | No screen or read function; SQL Editor only |
| OPEN-23 | Is too few **classes attended** a make-up reason? (v0.139) | No — classes attended is recorded only (v0.126) |
