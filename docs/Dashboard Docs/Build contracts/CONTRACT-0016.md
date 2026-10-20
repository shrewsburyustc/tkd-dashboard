# Contract 0016 — Black Belt testing database (migration `0016_black_belt.sql`)

**Status: DRAFT 2026-10-19, for security review, then Jeffrey's OK.** Build and test locally only; nothing is applied to Supabase without his OK for that paste. **The number 0016 must be reserved with the Main session before any SQL is written** (0011 Finance, 0012 Prospects, 0013 Camps, 0014 Color Belt phase 4 and 0015 family history are claimed).

The single source of truth for **Builder A — database**, who turns it into `supabase/migrations/0016_black_belt.sql`, `supabase/tests/0016_tests.sql`, `supabase/tests/0016_fingerprints.sql`, a new PGlite step and a new `supabase/SETUP.md` section. It also fixes the interface the later builders use (the public Pages Function, the data layer, the preview mock, the screens; §9–§10). If something here is impossible or contradicts the sources below, **stop and report it** — do not improvise. The few undecided technical points are in §14 with a working default; the builder uses the default and changes nothing else about it.

| Source (in this order of authority) | |
|---|---|
| This contract | wins for 0016 |
| Rulebook `docs/Dashboard Docs/TKD-Dashboard-Design-Guidelines.md`: every Black Belt row v0.204–v0.224 and **v0.900–v0.908** (the newest row wins: v0.902 replaces v0.217's template prices and the "Offer this plan" ticks), §5 privacy | v0.908 |
| Database plan `docs/Testing/Black Belt Testing/TKD-BlackBelt-DB-Plan.md` (Q-B1–Q-B7 answered v0.901–v0.907; §8 S1–S20 OK'd v0.908, S16 removed by v0.902) | final |
| Approved mockups `TKD-BlackBelt-Cycles-Mockups.html` (incl. the v0.902 redraw of screens 4 and 6), `TKD-BlackBelt-Form-Mockups.html`, `TKD-BlackBelt-Candidates-Mockups.html`; status file §3b | wording and layout |
| `Inventory/Old-Spreadsheet.md` §1.5–§1.10, §3.1–§3.5 and `Inventory/Old-RegistrationPage.md` | seed values only |
| Handoff `docs/Dashboard Docs/TKD-Dashboard-Handoff.md` §6 (security rules, non-negotiable) | |
| Existing code: migrations 0001–0006 and 0010 (**live in production — never edit**), `CONTRACT-0005.md`, `CONTRACT-0006.md`, `CONTRACT-0010.md`; Finance's `0011_finance.sql` (finance worktree, read-only) for the money fit | patterns copied from here |

**Working copy:** the Black Belt worktree, branch `black-belt`. Do not touch Supabase (no connector calls), Cloudflare, git remotes, other worktrees or the main folder. Do not commit; the orchestrator commits. Before writing SQL: `git merge main` so 0016 is written against what `main` really has.
**Audience:** Jeffrey is learning IT — every new file starts with a header comment (what + why, like 0006's); short plain-English comments on non-obvious lines; readable over clever. **CRLF line endings**, like the neighbouring files (check before and after).
**Production facts:** Supabase project `tkd-dashboard` (ref `eozkfbdfxqlcbpewhach`), PostgreSQL 17, Free plan. Live: 0001–0006 and 0010 (`testing_registrar`, `star_registrar`, two Hyperdrive configs). Staff: Main Admin (admin), Staff (shared desk, role `staff`). A push to `main` deploys `tkd-dashboard.pages.dev`.

**Words used in this contract (one line each):**
- *RLS* (row-level security): a rule on a table saying which rows a signed-in role may see; here always "only while `has_data_access()` is true".
- *Column grant*: permission to read named columns only; a column that is never granted can't be read by the app at all.
- *Security definer function*: runs with its owner's rights, so it can write tables the app can't touch; it checks access itself first.
- *Guard trigger*: a database rule that runs before every insert / update / delete on a table and can refuse it.
- *Cascade*: removing a parent row removes its child rows in the same step. *Restrict*: the parent can't be removed while a child row points at it.
- *Idempotent*: sending the same request twice has the same effect as once.
- *Lock*: `for update` / `for no key update` / `for share` make other writes to the same row wait; a fixed lock order stops two saves waiting on each other forever (a *deadlock*).
- *Purge*: the automatic removal of personal data whose keeping time has ended (§6.6).
- *Fingerprint*: an md5 of each function's code plus its rights, printed in PGlite and on production so the two can be compared line by line.

---

## 0. Scope

- **In:** Rubric and prices (the waiver text versions and the two keep-years settings only, v0.902), cycles (testing days with parts and an optional second part, deadlines, each cycle's own plans, amounts, Kukkiwon fees and due dates, two link codes, the registration switch, the requirements sheet, v0.901), candidates (form and desk), waivers (drawn or on paper), the append-only payment ledger (payment, refund, reversal, returned check), the purge, the reads behind the roster, detail, receipt and family form, and the restricted login `bb_registrar`.
- **Out (not in 0016, nothing for them now):** grading, rubric tables, results, make-ups, fee credits, Kukkiwon tracking, student links, emails. §12 says what 0016 leaves ready for the grading migration.
- **0016 changes none of the objects, grants, rules or tests of 0001–0006 / 0010.** It runs **no** `revoke`, `grant`, `alter` or `comment` on them (`locations`, `change_log`, `testing_public_attempts`, `testing_registrar`, `star_registrar`, `staff` …) — a `revoke all` on a shared table would reset what an earlier migration granted. It only *calls* their helpers (§1.2). It neither reads nor writes any `star_` or `finance_` object.
- All new objects are named `bb_…`. No Black Belt name starts with `testing_`, `star_`, `finance_` or `change_log_` (earlier tests scan those prefixes).
- **One transaction** (`begin;` … `commit;`), **re-run safe** (`create table if not exists`, `create or replace function`, `drop trigger/policy/constraint if exists` + create, seeds that never overwrite, the role created only if missing). If a function's arguments change during the build, the file also `drop function if exists`s the old signature.
- Header comment like 0006's: what / why / what it adds / how to run ("Supabase will warn about destructive operations — the words *delete* and *drop* appear inside rules, functions that run later and `… if exists` lines; nothing is removed now") / words used.
- **File layout** (sections in this order): 1 helpers · 2 Rubric and prices tables + seed · 3 starting point + seed · 4 cycles · 5 cycle days and parts · 6 cycle prices · 7 candidates (+ reference counter) · 8 waivers · 9 payments · 10 derived rules (state, items, money, ages, purge date) · 11 triggers · 12 RLS + grants · 13 internal helpers (locks, duplicates, purge, answers) · 14 role `bb_registrar` · 15 staff write functions · 16 staff read functions · 17 public functions.
- **Size:** 13 tables, 1 sequence, no views, 19 staff write functions, 6 staff read functions, 2 public functions, internal helpers and trigger functions (exact list in §15).

---

## 1. General rules

### 1.1 Copied from 0006 §1.1 (non-negotiable)
- Owner `postgres` for every table, sequence and function.
- Every function: `set search_path = ''`, fully qualified names (`public.x`, `auth.uid()`), explicit `revoke execute … from public, anon, authenticated, service_role`, then **only** the grants of §4.3. Helpers and trigger functions get no grant.
- Every table and the sequence: `revoke all … from public, anon, authenticated, service_role`, then only the column grants of §4.1. **Nothing to `anon` or `service_role`, ever.** No write grants or write policies for any client role: all writes go through §6 functions.
- Staff functions: `language plpgsql`, `security definer`, `returns jsonb`, JSON keys snake_case, every non-ok answer is exactly `{"status": …}` unless this contract lists extra keys for that status.
- **Check order** (every staff function): 1 `has_data_access() is not true` → `no_access` · 2 role (`is_admin() is not true` → `not_allowed` for A functions) · 3 argument shape → `invalid` (nothing looked up before 1–2) · 4 look up + lock in the §1.5 order → `not_found` · 5 version / expected state → `stale` · 6 rules that depend on the data (per function; a mixed role rule such as "admins, or the same staff member within 10 s" sits here) · 7 duplicate name → `duplicate_name` · 8 tag, write, untag, purge where listed, return `ok`.
- **Tagging:** right before writing `set_config('tkd.action', '<action>', true)` + `set_config('tkd.batch_id', gen_random_uuid()::text, true)`; afterwards both reset to `''`. Every action tag starts with `bb_` (§6.8). Reads tag nothing (except the purge they call).
- `is_admin()` is never a gate on its own: A functions check `has_data_access()` first.
- No argument defaults (`pronargdefaults = 0` for every 0016 function). Whole-number arguments are `integer` (Postgres.js sends `int4`); columns may be `smallint`.
- **Money is summed as `bigint`** everywhere (sums, nets, balances), never `integer`.

### 1.2 Shared from 0001–0006 (called, never changed)
`public.has_data_access()`, `public.is_admin()`, `public.current_session_id()`, `public.change_log` (insert only, through triggers), `public.change_log_write()` (generic log trigger), `public.change_log_actor_name()`, `public.testing_refuse_truncate()`, `public.testing_normalize_name()` / `testing_name_is_valid()` (1–60 characters), `public.testing_normalize_note()` / `testing_note_is_valid()` (≤ 600), `public.testing_signature_is_valid()` (PNG data URL ≤ 70 000), `public.testing_today()`, **`public.testing_school_date(timestamptz)`**, `public.testing_new_public_code()` (8 characters `[a-hjkmnp-z2-9]`), `public.testing_location_address()`, `public.locations` (read), `public.testing_public_attempts` (insert / count / clean-up from Black Belt's public wrapper only, §8). **Not used:** `testing_cents_is_valid` (stops at $1,000) and every `star_` helper — Black Belt has its own email and money checks (§1.7).

### 1.3 Statuses
The 0003 set `ok, no_access, not_allowed, not_found, stale, duplicate_name, invalid, not_empty`, from 0005 `rate_limited, not_open, closed, finished, withdrawn`, plus **new in 0016**:

| Status | Meaning | Extra keys |
|---|---|---|
| `part_without_day` | a cycle save where Physical, Technical or Curriculum is graded on no day (v0.900 detail 1) | `parts` (the missing part codes) |
| `has_payments` | Delete cycle / Delete permanently when any payment row exists, even an undone one (v0.904) | — |
| `has_waivers` | Delete cycle when any candidate signed a waiver on the form (S15) | — |
| `confirm_needed` | the keep-years setting's first step: nothing was saved (§6.1) | `remove_count` |
| `waiver_changed` | the form sent a waiver version that stopped being current more than 24 hours ago (v0.905); the page says "Please reload the page" | — |
| `waiver_needed` | Open registration while the current waiver is the seeded placeholder (§14 OI-1) | — |
| `refund_too_large` | a refund larger than the net paid (S2) | `paid_cents` |

### 1.4 Error mapping (whole body inside `begin … exception … end`, as 0006 §1.4)
| Caught | Returns |
|---|---|
| `unique_violation` on `bb_cycles_lower_name_idx` | `duplicate_name` |
| any other `unique_violation` (double insert, reversed twice, code race) | `stale` |
| `foreign_key_violation`, `check_violation`, `not_null_violation` | `invalid` |
| `deadlock_detected`, `serialization_failure`, `lock_not_available` | `stale` |
| anything else | not caught (the client shows "didn't save") |

Exception: Delete cycle / Delete permanently map a `foreign_key_violation` from `bb_payments` (`restrict`) to **`has_payments`** — defence in depth behind the explicit check.

### 1.5 Lock order (every Black Belt write — plan §2.4)
**`bb_settings` → cycle → candidate(s) → payment.** `for no key update` on parents, `for update` on the row changed or removed. Exact orders:
- **Rubric and prices** (save waiver, set keep years): `bb_settings` `for no key update` (the one "template lock" row), then the current waiver row `for no key update` (it only gets `superseded_at`; no key changes).
- **Add cycle:** `bb_settings` `for share`, then `pg_advisory_xact_lock(hashtext('bb_public_code'))` (a transaction-long lock on a fixed number, so two Add cycle calls draw link codes one after the other), then the source cycle (the one Add cycle was filled from, for the requirements sheet) `for share`.
- **Update cycle, set registration:** the cycle `for update`, then its days / due-date rows `for update` in id order.
- **Delete cycle:** the cycle `for update`, then its candidates in id order `for update`.
- **Candidate writes, waivers, every payment action (record, undo, edit, refund, returned):** the cycle `for no key update` → the candidate `for update` (helper `bb_lock_candidate`) → the payment row `for update` (helper `bb_lock_payment`, which finds the candidate and cycle first).
- **Resolve duplicate:** the cycle, then **both candidates in id order**.
- **Public register:** the cycle `for no key update` (§8.3 step 3).
- **Purge:** `for update … skip locked` on candidates and waivers (never waits on anyone; a locked row is simply done next time).
- **Side effects outside the order (known, for the reviewer):** inserting a candidate, waiver or payment takes PostgreSQL's implicit `for key share` on the rows it points at (cycle, plan, waiver version, the reversed payment) through the foreign-key check; these only block a delete of those rows, which itself locks the cycle first.
- **Every function's header comment states its lock order** (e.g. `-- locks: settings (share) -> cycle (no key update) -> candidate (update)`), so the reviewer checks each function against this section line by line. PGlite runs on one connection and can't prove the order (§11.5).

### 1.6 Time
"Today" is always `public.testing_today()`. **A school date from a timestamp is always `public.testing_school_date(<timestamptz>)`**; `::date` on a `timestamptz` is forbidden anywhere in 0016 (it would use UTC and be a day off in the evening; C10 greps the function sources for it). Registration closes at the end (11:59 PM Massachusetts time) of the Application due date when the automatic close is on (v0.212), and at the end of the cycle's **last** testing day in any case. Ages are counted with `bb_age_on(dob, date)` = `extract(year from age(date, dob))::integer`.

### 1.7 Money, names and limits
- Integer **cents**. **Prices** (plan amounts, Kukkiwon fees): `bb_price_is_valid(cents)` = whole dollars, **$1–$5,000** (100–500 000, `cents % 100 = 0`) (S3). **One payment row:** 1–500 000 cents, any cents (staff may type any amount, v0.900). Refunds and returned checks are entered positive and stored negative.
- Names (cycle, day, plan, candidate, signer): `testing_name_is_valid` / stored normalized. Notes and reasons: `testing_note_is_valid` (≤ 600), stored normalized.
- Email: `bb_email_is_valid(text)` — a copy of Star's rule (≤ 254 characters, `^[^@\s]+@[^@\s]+\.[^@\s]+$`, trimmed, stored as typed).
- DOB: not null on every write, not after today, not before 1900-01-01 (S5: required at the desk too). Null only after the purge.
- Waiver text: 1–20 000 characters after trimming.
- Time of day: `bb_time_is_valid(time)` = 06:00–22:00 on a 15-minute step, seconds 0 (v0.51 dropdown); an end time is after its start time.
- Dans: 1–4 (`smallint`, `check (dan between 1 and 4)`); parts: `physical`, `technical`, `curriculum`.

### 1.8 House columns and triggers
Tables edited after insert carry: `id uuid not null default gen_random_uuid()` (pk; `change_log.record_id` is a uuid), `version integer not null default 1` (check ≥ 1), `created_at`, `updated_at timestamptz not null default now()`, `created_by`, `updated_by uuid null` (no FK, **never granted**), `created_by_name`, `updated_by_name text not null`. Each gets `<table>_before_write` (generic `bb_before_write(immutable_cols, no_bump_cols)`, a copy of 0006's `star_before_write`: insert stamps everything and ignores supplied values; update refuses a change to an immutable column (`errcode '23514'`, constraint `<table>_immutable`), keeps `created_*`, bumps `version` and `updated_*` when anything other than the no-bump and bookkeeping columns changed **or** the function wrote `version + 1` on purpose), `<table>_no_truncate` (`testing_refuse_truncate()`) and `<table>_log` (`change_log_write()`, except candidates and waivers, §2.11). Written-once tables have `created_at`, `created_by`, `created_by_name` only and are guarded.

---

## 2. Tables

Constraint names are exact. Every table: RLS enabled, policies and grants in §4.

### 2.1 `public.bb_settings` — one row: the keep-years settings and the template lock (v0.213, v0.900, v0.906, S12)
| Column | Type | Constraint |
|---|---|---|
| `id` | uuid pk `bb_settings_pkey` | |
| `singleton` | `boolean not null default true` | `bb_settings_singleton_key unique`, `check (singleton)`; immutable; not granted |
| `keep_years_after_last_day` | `smallint null` | N1: "keep signed waivers N1 years after the last testing day" |
| `keep_years_after_18` | `smallint null` | N2: "and for under-18s until N2 years after they turn 18, if later" |
| house columns | | |
`bb_settings_keep_years_check check ((keep_years_after_last_day is null and keep_years_after_18 is null) or (keep_years_after_last_day between 3 and 20 and keep_years_after_18 between 3 and 20))` — both empty (nothing is ever purged) or both set, 3–20 each (S12). Seed: one row, both null.

### 2.2 `public.bb_waiver_versions` — every waiver text ever saved (v0.213, v0.900, v0.905)
| Column | Type | Constraint |
|---|---|---|
| `id` | uuid pk | |
| `version_name` | `text not null` | `bb_waiver_versions_version_name_key unique`; `check (version_name ~ '^[0-9]{4}-[1-9][0-9]*$')` ("2027-1" = the year of `testing_today()` + the count that year) |
| `body` | `text not null` | `check (char_length(btrim(body)) between 1 and 20000)` |
| `is_placeholder` | `boolean not null default false` | true only on the seeded row |
| `superseded_at` | `timestamptz null` | set once, when the next version is saved |
| `created_at`, `created_by`, `created_by_name` | written once | |
Partial unique index `bb_waiver_versions_one_current_idx unique ((true)) where superseded_at is null` (exactly one current version). Guard `bb_waiver_versions_guard`: update may only set `superseded_at` from null to a value; **delete always refused** (signed waivers point at the version for good). Logged.

### 2.3 `public.bb_starting_point` — one row: what the very first Add cycle starts from (S9, v0.901, v0.902)
`id` pk · `singleton boolean` (as §2.1) · `schedule jsonb not null` (an Add cycle payload without the name, §6.2 shape: days, deadlines, plans with amounts and due dates, Kukkiwon fees — the Fall 2026 values, §3) · `requirements jsonb not null` (`bb_requirements_is_valid`, §2.5) · `created_at`, `created_by_name`. **Never granted to any role; RLS on, no policy.** Read only by `bb_cycle_defaults` (§7). Guard: update and delete refused **except** when `session_user = 'postgres'` and `coalesce(current_setting('tkd.action', true), '') = ''` — i.e. Jeffrey's own SQL Editor session fixing a seeded number (v0.901). (`current_user` would not do: inside every security-definer function it is also `postgres`; `session_user` is the login that connected — `authenticator` for the app, `bb_registrar` for the form. Every 0016 function sets `tkd.action` before writing, so none passes.) **This is a convenience, not a security wall:** Supabase Studio's SQL Editor sessions, the Supabase connector and Studio's role switcher all connect as `postgres` and pass it, and `postgres` can disable triggers anyway. CP3 confirms read-only that the SQL Editor's `session_user` is `postgres`; if it isn't, the builder reports it. Logged.

### 2.4 `public.bb_cycles` (v0.209, v0.212, v0.900, v0.901, v0.902)
| Column | Type | Constraint |
|---|---|---|
| `id` | uuid pk `bb_cycles_pkey` | |
| `name` | `text not null` | name rule, stored normalized; index `bb_cycles_lower_name_idx unique (lower(public.testing_normalize_name(name)))` |
| `application_due` | `date not null` | also the day the form closes when `auto_close` is on |
| `submissions_due` | `date not null` | hand-in date |
| `auto_close` | `boolean not null default true` | "Close automatically at the end of Application due"; an admin reopening after that date sets it false (v0.85) |
| `registration_open` | `boolean not null default false` | new cycles start Closed |
| `first_opened_at` | `timestamptz null` | `bb_cycles_opened_check check (not registration_open or first_opened_at is not null)` |
| `public_code_worcester`, `public_code_shrewsbury` | `text not null` | each unique (`bb_cycles_code_worcester_key`, `bb_cycles_code_shrewsbury_key`), pattern `^[a-hjkmnp-z2-9]{8}$` and different from each other (`bb_cycles_codes_check`); immutable. A rule trigger `bb_cycles_rules` refuses a code used by another cycle in either column (`unique_violation`, constraint `bb_cycles_public_code_cross_key`) |
| `requirements` | `jsonb not null` | the requirements sheet (v0.901), `check (public.bb_requirements_is_valid(requirements))`; copied at Add cycle, **no function changes it**; immutable for the app (the `bb_cycles_rules` trigger refuses a change unless `session_user = 'postgres'` and `coalesce(current_setting('tkd.action', true), '') = ''`, i.e. Jeffrey's SQL Editor update — same rule and same caveat as §2.3) |
| `prices_from` | `text null` | the name of the cycle (or "Fall 2026 starting point") Add cycle was filled from, shown as "Filled in from …"; immutable |
| house columns | | `created_at` = "prices set on" |
Indexes: `bb_cycles_lower_name_idx`; the two code keys.

### 2.5 The requirements sheet (v0.901) — `bb_requirements_is_valid(jsonb) returns boolean` (immutable)
A structured document the form's requirements panel draws (v0.216, Form 3). The database checks only its outer shape, so the grading migration can drop it cleanly: an object with `schema_version = 1`, `dans` an array of exactly 4 objects with `dan` 1, 2, 3, 4 (in order), each with `pass_rule` (object), `parts` (array, 1–6 objects, each with `code` in `physical`/`technical`/`curriculum`/`other`, `name`, `max_points`, `subjects` array), `extra_points` (object) and optional `hand_in` (array); `pg_column_size` ≤ 200 000 bytes. Testing days and places are **not** in the sheet — the panel takes them from the cycle's days (§2.6), so they can't disagree. Inner shape (subjects: `name`, `credits`, `scoring` = `{kind:'grades', points:{…}}` or `{kind:'table', groups:[{ages, cutoffs:[…]}]}`) is fixed by the seed (§3) and the page, not by the database.

### 2.6 `public.bb_cycle_days` and `public.bb_cycle_day_parts` (v0.209, v0.900 details 1–4)
**`bb_cycle_days`**
| Column | Type | Constraint |
|---|---|---|
| `id` | uuid pk | stable across Edit cycle (days are matched by id), so grading can point at it later |
| `cycle_id` | `uuid not null` | FK → `bb_cycles` **cascade**; immutable |
| `name` | `text not null` | name rule ("Physical", "Technical", "Curriculum", "Rain date" …) |
| `day_date` | `date not null` | |
| `start_time`, `end_time` | `time not null` | `bb_time_is_valid` both; `end_time > start_time` |
| `place_code` | `text null` | FK → `locations(code)` |
| `place_other` | `text null` | `testing_note_is_valid(place_other) and char_length(place_other) <= 100`, stored normalized (e.g. "Horgan Arena, 403 Oxford St N, Auburn MA 01501") |
| `second_start`, `second_end` | `time null` | the optional second part (v0.900 detail 3) |
| `second_place_code`, `second_place_other` | `text null` | as `place_*` |
| house columns | | |
Checks: `bb_cycle_days_place_check check (num_nonnulls(place_code, place_other) = 1)`; `bb_cycle_days_second_check check ((second_start is null and second_end is null and second_place_code is null and second_place_other is null) or (second_start is not null and second_end is not null and second_end > second_start and second_start >= end_time and num_nonnulls(second_place_code, second_place_other) = 1))`; both times `bb_time_is_valid`. Index `(cycle_id, day_date)`. A place column is deliberately **not** named `location_code` (a day is joint; `change_log` must not file it under one school).

**`bb_cycle_day_parts`** — `id` pk · `day_id uuid not null` FK → `bb_cycle_days` cascade · `part text not null` `check (part in ('physical','technical','curriculum'))` · `created_at`, `created_by`, `created_by_name` · `bb_cycle_day_parts_day_part_key unique (day_id, part)`. Inserted and deleted only (update refused by its guard). A part may be on two days (detail 2); "every part on at least one day" is checked by `bb_add_cycle` / `bb_update_cycle` at the end of the save (`part_without_day`). Logged.

### 2.7 A cycle's prices (v0.902: set when the cycle is saved, never changed afterwards)
No version columns; **update always refused** by `bb_cycle_prices_guard` (constraint `<table>_immutable`); **insert only inside `bb_add_cycle`** (`tkd.action = 'bb_add_cycle'`, else `check_violation`); delete only in a cascade (`pg_trigger_depth() > 1`, i.e. Delete cycle). Logged with `change_log_write`.
- **`bb_cycle_plans`**: `id` pk · `cycle_id` FK → `bb_cycles` cascade · `name` (name rule) · `payments_count smallint` `check (payments_count between 1 and 12)` · `position smallint` `check (position >= 0)` (the order on the form) · `created_at`, `created_by_name` · `bb_cycle_plans_cycle_position_key unique (cycle_id, position)` · unique index `(cycle_id, lower(name))` · `bb_cycle_plans_cycle_id_id_key unique (cycle_id, id)` (target of the candidates' composite key).
- **`bb_cycle_plan_amounts`**: `id` pk · `cycle_plan_id` FK cascade · `dan smallint` (1–4) · `payment_no smallint` (≥ 1) · `amount_cents integer` `check (public.bb_price_is_valid(amount_cents))` · `unique (cycle_plan_id, dan, payment_no)`. `bb_add_cycle` writes exactly payments_count × 4 rows per plan (T4a).
- **`bb_cycle_kukkiwon_fees`**: `id` pk · `cycle_id` FK cascade · `dan smallint` (1–4) · `amount_cents integer` (`bb_price_is_valid`) · `unique (cycle_id, dan)`; exactly 4 rows per cycle.

**`bb_cycle_plan_payments`** — due dates **stay editable** in Edit cycle (v0.902): `id` pk · `cycle_plan_id` FK cascade · `payment_no smallint` · `due_on date not null` · `follows_application_due boolean not null default false` (`check (not follows_application_due or payment_no = 1)`) · house columns (`cycle_plan_id`, `payment_no` immutable) · `unique (cycle_plan_id, payment_no)`. Insert only inside `bb_add_cycle`; delete only in a cascade (its guard); update through `bb_update_cycle`. When `follows_application_due` is true, `bb_update_cycle` keeps `due_on = application_due`; typing another date clears the flag (v0.900).

### 2.8 `public.bb_candidates` — one person in one cycle (v0.211, v0.212, v0.900, v0.907)
Sequence `public.bb_candidate_ref_seq as bigint start with 5001` (references `BB-5001` …, form **and** desk, S14). No rights for anyone.
| Column | Type | Rule |
|---|---|---|
| `id` | uuid pk | |
| `cycle_id` | `uuid not null` | FK → `bb_cycles` **cascade** (Delete cycle is refused first when payments or form waivers exist; payments themselves are `restrict`); immutable |
| `first_name`, `last_name` | `text not null` | name rule, stored normalized (belt spelling) |
| `date_of_birth` | `date null` | `check (date_of_birth is null or date_of_birth >= date '1900-01-01')`. **Never granted.** Null **only** after the purge |
| `email_for_results` | `text null` | `check (email_for_results is null or public.bb_email_is_valid(email_for_results))`. **Never granted.** Null only after the purge |
| `personal_removed_at` | `timestamptz null` | when the purge removed DOB and email (v0.907); `bb_candidates_personal_check check ((personal_removed_at is null) = (date_of_birth is not null and email_for_results is not null))` |
| `location_code` | `text not null` | FK → `locations(code)`; the candidate's school (from the link, or chosen at the desk); may change (Edit details). The name makes `change_log` fill `location_code` |
| `dan` | `smallint not null` | `check (dan between 1 and 4)` |
| `cycle_plan_id` | `uuid not null` | `bb_candidates_plan_fk foreign key (cycle_id, cycle_plan_id) references bb_cycle_plans (cycle_id, id)` (no action — a plan of another cycle is impossible) |
| `kukkiwon` | `boolean not null` | |
| `kukkiwon_added_on` | `date null` | the school day the certificate was chosen; `check (kukkiwon = (kukkiwon_added_on is not null))` |
| `source` | `text not null` | `in ('form','desk')`; immutable |
| `reference` | `text not null` | `unique`; `check (reference ~ '^BB-[0-9]{4,}$')`; immutable |
| `registered_at` | `timestamptz not null default now()` | immutable; its school date (`testing_school_date`) is the floor for due dates (S4) |
| `status`, `withdrawn_reason`, `withdrawn_at`, `withdrawn_by_name`, `withdrawn_by` | as 0006 | `bb_candidates_status_check` exactly as 0006's (`withdrawn_reason in ('withdrawn','duplicate_copy')`); `withdrawn_by` never granted |
| `duplicate_state`, `duplicate_of` | as 0006 | `duplicate_of` FK self **on delete set null**; `in ('none','possible','kept_both')`; not self |
| house columns | | |
Indexes: `(cycle_id)`; `(cycle_id, lower(last_name), lower(first_name))`; `(duplicate_of) where duplicate_of is not null`; `(cycle_plan_id)`.
Before-write arguments: immutable `id,cycle_id,source,reference,registered_at`; no-bump `date_of_birth,email_for_results,personal_removed_at` (so the purge never bumps a version; Edit details bumps on purpose by writing `version + 1`).
Rule trigger `bb_candidates_rules`: `duplicate_of` in the same cycle; DOB/email can't come back once `personal_removed_at` is set (`check_violation`, constraint `bb_candidates_personal_removed`).
Every candidate has at least one `bb_candidate_waivers` row, written in the same call (T5b, T6a).

### 2.9 `public.bb_candidate_waivers` — the signed waiver (v0.213, v0.900, v0.905, v0.906)
| Column | Type | Rule |
|---|---|---|
| `id` | uuid pk | |
| `candidate_id` | `uuid not null` | FK → `bb_candidates` **cascade**; immutable. A candidate may have several rows (a later paper re-sign, §14 OI-2); the **newest `signed_at`** is the one shown |
| `waiver_version_id` | `uuid not null` | FK → `bb_waiver_versions` (no action; versions are never deleted); immutable |
| `how` | `text not null` | `in ('drawn','paper')`; immutable |
| `submission_id` | `uuid null` | **unique**; the family browser's id (idempotency); `check ((how = 'drawn') = (submission_id is not null))`; immutable |
| `acknowledged` | `boolean not null` | `check (acknowledged)` ("I have read and agree", or the desk's paper tick) |
| `signed_as_minor` | `boolean not null` | the candidate was under 18 on the cycle's first testing day **when this waiver was signed** (worked out by the function, never sent by a client); immutable |
| `signer_name` | `text null` | drawn rows: the name typed in "Name of the person signing" (name rule); paper rows: null |
| `signature` | `text null` | drawn rows: `testing_signature_is_valid`; paper rows: null |
| `ticked_by_name` | `text null` | paper rows: who ticked "Waiver signed on paper"; `check ((how = 'paper') = (ticked_by_name is not null))`; immutable |
| `signed_at` | `timestamptz not null` | immutable |
| `removed_at` | `timestamptz null` | when the purge removed the signature and signer's name (v0.906) |
| house columns | | |
`bb_candidate_waivers_drawn_check check (how <> 'drawn' or ((signature is not null and signer_name is not null and removed_at is null) or (signature is null and signer_name is null and removed_at is not null)))`; `bb_candidate_waivers_paper_check check (how <> 'paper' or (signature is null and signer_name is null))`. Index `(candidate_id, signed_at)`.
- **Never granted to any role. RLS on, no policy.** Read only through `bb_candidate_detail` (state, signer's name, version), `bb_view_signature` (admins) and the purge.
- `bb_candidate_waivers_rules` (before update): only `signature`, `signer_name` and `removed_at` may change, and only to null / once (the purge); delete only in a cascade (`pg_trigger_depth() > 1`: Delete permanently or Delete cycle).
- **Its own log trigger** `bb_candidate_waivers_log()` (security definer, as 0006's `star_candidate_signatures_log`), on **insert, update and delete** (after, for each row): the same `change_log` row as `change_log_write` but **`signature` and `signer_name` written as `"on file"` (or `null` when already removed) in every `before` and `after`**, and `submission_id` left out — so Delete permanently and a cycle cascade log the deleted row masked too. On update, a changed signature / signer name shows before `"on file"`, after `null` (the purge); an update that changes nothing visible after masking writes no row. **No `change_log_write` trigger on this table.**

### 2.10 `public.bb_payments` — append-only, never deleted (v0.210, v0.218–v0.220, v0.900, v0.903, v0.904, S1–S3)
| Column | Type | Rule |
|---|---|---|
| `id` | uuid pk | |
| `candidate_id` | `uuid not null` | FK → `bb_candidates` **on delete restrict** |
| `cycle_id` | `uuid not null` | FK → `bb_cycles` **on delete restrict**; equals the candidate's cycle (guard) |
| `kind` | `text not null` | `payment`, `refund`, `reversal`, `returned` |
| `amount_cents` | `integer not null` | see the kind check |
| `method` | `text not null` | `in ('cash','check','card')` |
| `paid_on` | `date not null` | school date: a payment, refund, reversal and returned row = `testing_today()`; an edit's new payment = the edited row's `paid_on` (v0.900: "the date stays") |
| `for_items` | `text[] null` | payments only: the items it pays, e.g. `{p1,kukkiwon}`; each element `^(p([1-9]|1[0-2])|kukkiwon)$`, no duplicates, 1–13 elements |
| `note` | `text null` | optional (`testing_note_is_valid`), e.g. "post-dated Apr 24" |
| `reason` | `text null` | required on both rows written by Edit payment; null otherwise |
| `location_code` | `text not null` | FK → `locations(code)`: **the school at recording time** (v0.903); a reversal / returned row copies the row it corrects; a refund copies the candidate's latest live payment (§14 OI-4). The name makes `change_log` file the row under that school |
| `cycle_name` | `text not null` | the cycle's name at recording time (v0.903), copied the same way |
| `recorded_at` | `timestamptz not null default now()` | `now()` = the transaction's start time, so an edit's two rows match exactly; **never `clock_timestamp()`** |
| `recorded_by` | `uuid null` | the login (`auth.uid()`); **never granted** |
| `recorded_by_name` | `text not null` | `change_log_actor_name()` |
| `reverses_payment_id` | `uuid null` | FK self **on delete restrict**; two **partial unique indexes**: `bb_payments_one_reversal_idx unique (reverses_payment_id) where kind = 'reversal'` (a row is undone at most once) and `bb_payments_one_returned_idx unique (reverses_payment_id) where kind = 'returned'` (a check is marked returned at most once). So a check payment can carry one `returned` row **and** later one `reversal`; the guard decides which is allowed when |
`bb_payments_kind_check`:
- `(kind = 'payment' and amount_cents between 1 and 500000 and reverses_payment_id is null and for_items is not null and cardinality(for_items) >= 1)`
- or `(kind = 'refund' and amount_cents between -500000 and -1 and reverses_payment_id is null and for_items is null)`
- or `(kind = 'reversal' and amount_cents between -500000 and 500000 and amount_cents <> 0 and reverses_payment_id is not null and for_items is null)`
- or `(kind = 'returned' and amount_cents between -500000 and -1 and method = 'check' and reverses_payment_id is not null and for_items is null)`
Indexes: `(candidate_id)`, `(cycle_id)`, `(paid_on)`.
Guard `bb_payments_guard` (before insert / update / delete):
- insert of a `reversal`: the row it reverses is a `payment`, `refund` or `returned` of the **same candidate**, amount exactly minus its amount, same `location_code` and `cycle_name` (constraint `bb_payments_reversal_check`); a reversal can't be reversed; **a `payment` that has a live `returned` row can't be reversed** (undo the returned mark first; constraint `bb_payments_reversal_returned_check`).
- insert of a `returned`: the row is a **live** (not reversed) `payment` with method `check` of the same candidate, exactly minus its amount, same school and cycle name (constraint `bb_payments_returned_check`); a reversed payment can't be marked returned.
- `cycle_id` = the candidate's `cycle_id` (constraint `bb_payments_cycle_check`).
- **net floor** (constraint `bb_payments_net_check`): refused only when the new row **lowers the net below zero**: `new.amount_cents < 0 and v_net + new.amount_cents < 0 and new.kind <> 'returned'` (`v_net` = the sum of the candidate's existing rows, `bigint`). So a row that raises the net is always allowed, even while the net is below zero (a family paying back a bounced check in parts), and a `returned` row may take it below zero (a check bouncing after a refund, S2). It locks nothing extra (the calling function holds the candidate lock).
- **update: always refused.** **delete: always refused, with no exception** — no `pg_trigger_depth()` and no action-tag escape (v0.904). Truncate refused. Logged with `change_log_write` (rows filed under the stored school).

### 2.11 Triggers (exact)
| Table | before insert/update | rules / guard | after (log) | truncate |
|---|---|---|---|---|
| `bb_settings` | `bb_before_write('id,singleton', '')` | — | `change_log_write` | `testing_refuse_truncate` |
| `bb_waiver_versions` | — | `bb_waiver_versions_guard` | `change_log_write` | ✓ |
| `bb_starting_point` | — | `bb_starting_point_guard` | `change_log_write` | ✓ |
| `bb_cycles` | `bb_before_write('id,public_code_worcester,public_code_shrewsbury,prices_from', '')` | `bb_cycles_rules` | `change_log_write` | ✓ |
| `bb_cycle_days` | `bb_before_write('id,cycle_id', '')` | — | `change_log_write` | ✓ |
| `bb_cycle_day_parts` | — | `bb_cycle_day_parts_guard` (update refused) | `change_log_write` | ✓ |
| `bb_cycle_plans`, `bb_cycle_plan_amounts`, `bb_cycle_kukkiwon_fees` | — | `bb_cycle_prices_guard` | `change_log_write` | ✓ |
| `bb_cycle_plan_payments` | `bb_before_write('id,cycle_plan_id,payment_no', '')` | `bb_cycle_plan_payments_guard` (insert only in Add cycle, delete only in a cascade) | `change_log_write` | ✓ |
| `bb_candidates` | `bb_before_write('id,cycle_id,source,reference,registered_at', 'date_of_birth,email_for_results,personal_removed_at')` | `bb_candidates_rules` | **`bb_candidates_log`** | ✓ |
| `bb_candidate_waivers` | `bb_before_write('id,candidate_id,waiver_version_id,how,submission_id,acknowledged,signed_as_minor,ticked_by_name,signed_at', 'signature,signer_name,removed_at')` | `bb_candidate_waivers_rules` | **`bb_candidate_waivers_log`** | ✓ |
| `bb_payments` | — | `bb_payments_guard` (insert, update, delete) | `change_log_write` | ✓ |

**`bb_candidates_log()`** (security definer, as 0005's `testing_registrations_log`), on **insert, update and delete**: the `change_log_write` row with **`date_of_birth` and `email_for_results` masked** (v0.907): **insert** → after `"on file"` (or `null`); **delete** (Delete permanently, a cycle cascade) → before `"on file"` (or `null` if already purged); **update**, when the real value changed → before `"on file"`, after `"changed"`, or after `null` when the purge removed it; unchanged → the keys are left out. Every other column is logged in full. **No `change_log_write` trigger on `bb_candidates`**, so no operation ever writes a DOB, email, signature or signer's name to `change_log` in plain text.

---

## 3. Seed data (in the migration, tagged `tkd.action = 'bb_seed'`, actor "Database admin"; never overwrites)

- **`bb_settings`** (`on conflict (singleton) do nothing`): one row, both keep-years null (nothing is purged until Jeffrey enters the insurer's numbers, S12).
- **`bb_waiver_versions`**: only when the table is empty — `version_name '2026-1'`, `is_placeholder true`, body: the old page's waiver points (every subject must pass, failed subjects made up later; fees non-refundable, applied to the next test if not passed; physical-risk acknowledgement and release of the school, owners, instructors and staff — `Inventory/Old-RegistrationPage.md` line 74), beginning with the line **"PLACEHOLDER — replace with the school's waiver before opening registration."** Opening registration is refused while it is current (§14 OI-1). Jeffrey saves the real text on Rubric and prices, which makes version `2027-1` (or `2026-2` if saved this year).
- **`bb_starting_point`** (`on conflict (singleton) do nothing`), the Fall 2026 values from `Inventory/Old-Spreadsheet.md` §3.1 (S9, v0.902):
  - **Days:** "Physical" 2026-09-26 12:30–14:30, Worcester school, second part 14:30–15:30 "Horgan Arena, 403 Oxford St N, Auburn MA 01501", parts `physical` · "Technical" 2026-10-24 12:30–15:30, Shrewsbury school, `technical` · "Curriculum" 2026-11-21 14:00–17:00, Shrewsbury school, `curriculum`.
  - **Deadlines:** Application due 2026-09-19 · Submissions due 2026-11-14 · auto close on.
  - **Plans** (in this order): "In full", 1 payment, due 2026-09-19 (follows Application due), amounts 870 / 990 / 1,500 / 2,700 · "3 payments", 3 payments, due 2026-09-19 (follows) · 2026-10-17 · 2026-11-14, amounts per payment 1st 290 ×3 · 2nd 330 ×3 · 3rd 500 ×3 · 4th 900 ×3 (dollars; stored in cents).
  - **Kukkiwon fees:** 100 / 110 / 140 / 170.
  - **Requirements sheet:** every Fall 2026 number of `Old-Spreadsheet.md` §1.5–§1.10 (subjects, credits, physical cut-offs per age group, technical and curriculum subjects per Dan, other requirements and their hand-in), §3.2 (thresholds), §3.3 (grade-point scales), §3.4 (pass marks: 1st 275 child / 293 adult, 2nd 261, 3rd 293, 4th 453; maxima per part), §3.5 (age groups) — the same numbers the approved Form 3 panel shows. The builder writes the JSON from those sections (no numbers invented; anything the panel shows as "to confirm with Master Jeong", e.g. the extra-point numbers, is stored with `"to_confirm": true`). A plain-English **review table** of the seed (`supabase/tests/0016_seed_review.txt`) is produced for Jeffrey's CP1 check.
  - The starting point's dates are in the past on purpose: Add cycle shows them and refuses Save until the admin types this season's dates ("usually only the dates change").
- No cycles, candidates or payments. **Fall 2026 is not a cycle** (Past starts empty, v0.900).

---

## 4. RLS, grants and revokes (exact intent — Builder A writes the SQL)

### 4.1 Column SELECT grants to `authenticated` (everything else: nothing)
| Object | Granted columns |
|---|---|
| `bb_settings` | `id, keep_years_after_last_day, keep_years_after_18, version, created_at, updated_at, created_by_name, updated_by_name` |
| `bb_waiver_versions` | `id, version_name, body, is_placeholder, superseded_at, created_at, created_by_name` |
| `bb_cycles` | `id, name, application_due, submissions_due, auto_close, registration_open, first_opened_at, public_code_worcester, public_code_shrewsbury, requirements, prices_from, version, created_at, updated_at, created_by_name, updated_by_name` (staff see and copy both links and download the QR codes, v0.900) |
| `bb_cycle_days` | `id, cycle_id, name, day_date, start_time, end_time, place_code, place_other, second_start, second_end, second_place_code, second_place_other, version, created_at, updated_at, created_by_name, updated_by_name` |
| `bb_cycle_day_parts` | `id, day_id, part` |
| `bb_cycle_plans` | `id, cycle_id, name, payments_count, position, created_at, created_by_name` |
| `bb_cycle_plan_amounts` | `id, cycle_plan_id, dan, payment_no, amount_cents` |
| `bb_cycle_kukkiwon_fees` | `id, cycle_id, dan, amount_cents` |
| `bb_cycle_plan_payments` | `id, cycle_plan_id, payment_no, due_on, follows_application_due, version, updated_at, updated_by_name` |
| `bb_candidates` | `id, cycle_id, first_name, last_name, personal_removed_at, location_code, dan, cycle_plan_id, kukkiwon, kukkiwon_added_on, source, reference, registered_at, status, withdrawn_reason, withdrawn_at, withdrawn_by_name, duplicate_state, duplicate_of, version, created_at, updated_at, created_by_name, updated_by_name` |
| `bb_payments` | `id, candidate_id, cycle_id, kind, amount_cents, method, paid_on, for_items, note, reason, location_code, cycle_name, recorded_at, recorded_by_name, reverses_payment_id` |

### 4.2 Never granted to any role (not `authenticated`, `anon`, `service_role`, PUBLIC, `bb_registrar`, `star_registrar` or `testing_registrar`)
- `bb_candidates.date_of_birth`, `bb_candidates.email_for_results` — read only through `bb_candidate_detail` (v0.210). Not granting them is what protects them.
- The whole of `bb_candidate_waivers` and of `bb_starting_point`.
- Every login id: `created_by`, `updated_by` (all tables), `bb_candidates.withdrawn_by`, `bb_payments.recorded_by`; `bb_settings.singleton`, `bb_starting_point.singleton`.
- The sequence `bb_candidate_ref_seq`.
- `change_log` keeps its 0003 state (no grants, no policy). Black Belt has no History read (v0.900).

### 4.3 RLS and execute rights
- RLS on all 13 tables. One policy per readable table: `<table>_select_with_access for select to authenticated using ((select public.has_data_access()))` (the 11 tables of §4.1). `bb_candidate_waivers`, `bb_starting_point`: RLS on, **no policy**.
- Execute: the staff functions of §6–§7 → `authenticated` only; `bb_public_cycle` and `bb_public_register` → `bb_registrar` only; every helper and trigger function → nobody. Nothing to PUBLIC, `anon`, `service_role`, `testing_registrar` or `star_registrar`.

### 4.4 What Finance's later function may read (S17 — for the Finance session; 0016 grants Finance nothing)
Finance's own security-definer function (its own migration) may read **from `bb_payments`**: `id, candidate_id, kind, amount_cents, method, paid_on, for_items, location_code, cycle_name, recorded_at, recorded_by, recorded_by_name, reverses_payment_id` (it needs `recorded_by` only for its "same person" edit and undo checks, as it does for Star, and never returns it) and **from `bb_candidates`**: `first_name, last_name`. **Never** DOB, email, notes, reasons, the waiver table or anything else. An edit is exactly Finance's pair (0011 §3a): a reversal of the old row and a new `payment` with the same `recorded_at` and `recorded_by`. `returned` is a fourth kind for Finance to learn (a correction like a reversal, shown on the original check's day per Finance v0.199).

---

## 5. Derived rules (worked out, never stored — v0.158 pattern)

**Every date-dependent helper takes the date or time as an argument** (`p_today date` / `p_now timestamptz`); the functions pass `testing_today()` / `now()`, and the tests call the helpers as `postgres` with made-up values. There is no fake clock.

### 5.1 Cycle state — `bb_cycle_state(p_cycle_id uuid, p_today date) returns jsonb` (internal)
From the cycle and its days, in this order: `first_day` = min `day_date`, `last_day` = max · **`past`** (today > last_day) · **`testing_today`** (a day's date = today) · registration: **`open`** (switch on, and (`auto_close` off or today ≤ `application_due`)) · `closed_by_date` (switch on, `auto_close` on, today > `application_due`) · `not_open_yet` (never opened) · `closed`. Also `next_day` = the first day with `day_date` ≥ today. Tags (client, v0.900): Not open yet · Open until [Application due] · Registration closed · Next day [date] (after the application date, between days) · Testing today · Past. `testing_today` and `next_day` are **day tags only**; they never decide whether families can register. **Public status = the registration state alone**, in this order: `past → finished` first; then `open → open`, `closed_by_date → closed + closed_on = application_due`, `not_open_yet → not_open`, `closed → closed + null`. So on a testing day after Application due with `auto_close` on, the form stays closed; it is open on a testing day only when an admin reopened it (which turned `auto_close` off).

### 5.2 A candidate's items — `bb_candidate_items(p_candidate_id uuid) returns table` (internal; the only place the schedule rule lives)
For the candidate's plan and Dan, one item per plan payment `p1 … pN` and, if `kukkiwon`, one `kukkiwon` item:
- `amount_cents` from `bb_cycle_plan_amounts` / `bb_cycle_kukkiwon_fees`.
- **due date** (S4): `pN` → `greatest(due_on, testing_school_date(registered_at))` (a late family's passed dates count from the day they registered); `kukkiwon` → `greatest(p1's due date, kukkiwon_added_on)` (due with payment 1; added late = due that day, "due at once", v0.900).
- **item order**: by due date, then `p1, kukkiwon, p2, p3 …`.

### 5.3 Money — `bb_candidate_money(p_candidate_id uuid, p_today date) returns jsonb` (internal; used by the roster, detail, receipt, every payment answer)
- **Live rows:** a `payment`, `refund` or `returned` row that no `reversal` points at. A `payment` with a live `returned` row pointing at it is "returned" (shown crossed out, not counted).
- **Allocation (S1):** take the live `payment` rows that aren't returned, oldest `recorded_at` first (ties by id). Each row's amount goes **first to its `for_items`** (in item order, each up to what that item still owes; an item the current plan no longer has is skipped), **then to the earliest unpaid items** in item order; anything left over is **overpaid**. Then live **refunds** (positive amounts) come off the overpaid amount first, then off items from the **latest** item backwards. A **returned** check simply doesn't count (its row is not a live payment).
- `total_due` = Σ items; `paid` = net of every row (Σ `amount_cents`, `bigint`); `balance` = `total_due − paid` (negative = overpaid, or the family owes after a bounced refund); `overpaid_cents` = `greatest(paid − total_due, 0)`.
- **Tag** (v0.219, v0.224, v0.900), on `p_today`:
  - every item fully paid → **`paid_in_full`** (+ `overpaid_cents` when > 0: "Paid in full · ⚠ $X overpaid");
  - else, any item with remaining > 0 and due date **< today**: no live `payment` row at all → **`not_paid`** (red, first due date has passed); otherwise **`late`** with `late_cents` = Σ remaining of those items, `late_since` = the earliest such due date, `late_kukkiwon_only` = true when the only late item is `kukkiwon` ("Late · $110 Kukkiwon since Mar 27");
  - else → **`next`** with `next_on` = the earliest due date with something unpaid and `next_cents` = Σ remaining of the items due that day (gray "Next $390 by Mar 27"; on the due date itself still gray).
- Output: `{items:[{item, label, due_on, amount_cents, paid_cents, remaining_cents}], total_due_cents, paid_cents, balance_cents, overpaid_cents, tag, next_on, next_cents, late_since, late_cents, late_kukkiwon_only}`.

### 5.4 Ages and the parent's signature
`bb_age_on(dob, date)` (immutable). **Under 18 on the first testing day** = `bb_age_on(dob, first_day) < 18` (v0.213) — worked out on every read. `needs_parent_signature` (candidate detail, plan §3.3) = the candidate is under 18 on the cycle's **current** first day **and** the newest waiver row has `signed_as_minor = false` (a DOB fix or a moved first day turned an adult-signed waiver into a minor's). After the purge (no DOB) it is false.

### 5.5 Purge date — `bb_purge_due_on(p_candidate_id uuid) returns date` and `bb_purge_is_due(p_candidate_id uuid, p_today date) returns boolean` (internal)
Null when either setting is null. Otherwise **`greatest(last_day + N1 years, date_of_birth + 18 years + N2 years)`** (v0.906, v0.907), using the cycle's current last testing day. Purged **on or after** that date (`bb_purge_is_due` = due date ≤ `p_today`).

### 5.5b Waiver version accepted — `bb_waiver_version_ok(p_version_id uuid, p_now timestamptz) returns boolean` (internal)
True when the version is **not a placeholder** and (it is current, or `superseded_at > p_now − interval '24 hours'`) (v0.905, §8.3 step 7).

### 5.6 Possible duplicate (S7)
Another **active** candidate in the **same cycle** with the same normalized first + last name (case-insensitive) **and** the same DOB, **any Dan**. A pair marked `kept_both` doesn't count. Recomputed on insert, on a name / DOB edit and on Restore; when the row a candidate points at is deleted or withdrawn, the other goes back to `none` (twins of 0006's `star_find_duplicate`, `star_recheck_duplicate`, `star_recheck_pointing_at`). The public form accepts duplicates silently (§8). Possible duplicates are left out of the summary cards until resolved (v0.900; client).

---

## 6. Staff write functions (authenticated; the only way to write)

Roles: **A** = admin only; **S** = staff (incl. the shared desk account) and admins. Steps refer to §1.1; "lock" = the §1.5 order; errors map as §1.4. "Unchanged → no write" means the same values write nothing, bump nothing and log nothing (still `ok`). **"Has a payment"** = the candidate has at least one live `payment` row (§5.3) — used for the staff/admin split on Change plan and Dan (v0.210, S8).

### 6.1 Rubric and prices — all **A** (v0.213, v0.900, v0.905, S12)
| Function (action tag = name) | Ordered checks | Ok |
|---|---|---|
| `bb_save_waiver(p_expected_current_id uuid, p_body text)` | 3: id null; body outside 1–20 000 after trim → `invalid` · 4: `bb_settings` `for no key update`, then the current version `for update` · 5: current id ≠ expected → `stale` · 6: same text as current (after trim) → no write, `ok` with the current version · 8: current `superseded_at = now()`; insert the new row (`version_name` = year of `testing_today()` + '-' + (count of that year's versions + 1), `is_placeholder` false) | `{status, id, version_name}` |
| `bb_set_keep_years(p_expected_version integer, p_after_last_day integer, p_after_18 integer, p_confirm_count integer)` | 3: exactly one of the two years null; a year outside 3–20; `p_confirm_count` < 0 → `invalid` · 4: `bb_settings` `for no key update` · 5: version → `stale` · 6: n = candidates (active or withdrawn, not yet purged) whose purge date (§5.5) under the **new** numbers is ≤ today; `p_confirm_count` null → **`{status:'confirm_needed', remove_count:n}`, nothing saved** · `p_confirm_count` ≠ n → `stale` (the count changed since the screen asked) · 8: update (unchanged → no write); then run the purge (§6.6) in the same call. Logged (the setting row's `change_log` row shows old → new numbers) | `{status, version, removed_count}` |

Staff read Rubric and prices through the column grants ("View only. Ask an admin to make changes.").

### 6.2 Cycles (v0.209, v0.212, v0.900, v0.902)
**Payload shape** (`jsonb`, checked key by key; unknown keys → `invalid`):
`{name, application_due, submissions_due, auto_close, days:[{id?, name, day_date, start_time, end_time, place:{code}|{other}, second:{start, end, place:{code}|{other}}|null, parts:[…]}], plans:[{name, payments:[{due_on, follows_application_due}], amounts:{"1":[c…], "2":[…], "3":[…], "4":[…]}}], kukkiwon:{"1":c, "2":c, "3":c, "4":c}, prices_from}` — `plans`, `kukkiwon` and `prices_from` only in Add cycle; Update cycle takes `due_dates:[{cycle_plan_id, payment_no, due_on, follows_application_due}]` instead.

| Function | Role | Ordered checks | Ok |
|---|---|---|---|
| `bb_cycle_defaults()` (read, `stable`) | A | 1–2 · source = the most recently **created** cycle, or `bb_starting_point` when there is none · returns its schedule as an Add cycle payload (days without ids, deadlines, plans in position order with amounts and due dates, Kukkiwon fees) and `prices_from` (its name, or "Fall 2026 starting point") | `{status, source_cycle_id\|null, payload}` |
| `bb_add_cycle(p_payload jsonb, p_source_cycle_id uuid)` — `bb_add_cycle` | A | 3: name rule; dates null; `auto_close` null; 1–20 days, each: name rule, date **not before today**, times `bb_time_is_valid` and end > start, exactly one place (a `locations` code or other text ≤ 100), a second part complete or absent and starting at or after the first part's end, parts a non-empty subset of the 3 codes without repeats; 1–10 plans, names unique (normalized), each 1–12 payments, each due date not before today, `follows_application_due` only on payment 1 and only when its date = `application_due`, amounts for all 4 Dans × every payment `bb_price_is_valid`; Kukkiwon 4 × `bb_price_is_valid`; `application_due` and `submissions_due` not after the last day; `p_source_cycle_id` null or an existing cycle → else `invalid` · 4: §1.5 Add cycle · 6: a part on no day → `{status:'part_without_day', parts}` · 7: name exists → `duplicate_name` · 8: insert the cycle (closed; two codes from `testing_new_public_code()`, re-drawn until unused in either column; `requirements` copied from the source cycle, or `bb_starting_point.requirements` when null; `prices_from`), days, parts, plans (position = payload order), amounts, Kukkiwon fees, due dates; purge | `{status, id, version:1, public_code_worcester, public_code_shrewsbury}` |
| `bb_update_cycle(p_cycle_id uuid, p_expected_version integer, p_payload jsonb)` — `bb_update_cycle` | A | 3: as add without plans / Kukkiwon (present → `invalid`); a day `id` given must be a day of this cycle; `due_dates` must name every `(cycle_plan_id, payment_no)` of this cycle exactly once · 4: the cycle `for update`, then its days and due-date rows in id order · 5: version → `stale` · 6: a **changed** day date or due date before today → `invalid` (unchanged past dates are kept); a part on no day → `part_without_day` · 7: duplicate name · 8: update the cycle; days matched by id (changed → update; missing → delete with its parts; new → insert); parts per day replaced by difference; due dates updated (`follows_application_due` keeps `due_on = application_due`); **write `version + 1` on the cycle** when anything changed (unchanged → no write). **Prices are never touched** (v0.902). The grading migration adds "a day or part with grades can't be removed" here (v0.900 detail 4) | `{status, version}` |
| `bb_set_registration(p_cycle_id uuid, p_expected_version integer, p_open boolean)` — `bb_set_registration` | S / A | as 0006 `star_set_registration` (v0.85, v0.86, v0.210): 3 nulls · 4 cycle `for update` · 5 version · 6: `past` → `finished`; opening while the current waiver `is_placeholder` → `waiver_needed`; opening when `auto_close` is on and today > `application_due` → admins only (staff `not_allowed`), and it sets `auto_close` false · 8 set the switch (first opening sets `first_opened_at`; same value → no write) | `{status, version, state}` |
| `bb_delete_cycle(p_cycle_id uuid, p_expected_version integer, p_expected_candidate_count integer)` — `bb_delete_cycle` | A | 3 nulls · 4: cycle `for update`, its candidates in id order `for update` · 5: version; count of **all** candidates (withdrawn too) ≠ expected → `stale` · 6: any `bb_payments` row of the cycle → **`has_payments`** (v0.900, v0.904); any `drawn` waiver of its candidates → **`has_waivers`** (S15) · 8: delete the cycle (cascades days, parts, prices, due dates, candidates and their paper waivers; every row logged, one batch) | `{status}` |

### 6.3 Candidates (v0.210, v0.212, v0.900, v0.904, S5, S7, S8)
| Function | Role | Ordered checks | Ok |
|---|---|---|---|
| `bb_add_candidate(p_cycle_id uuid, p_first text, p_last text, p_date_of_birth date, p_email text, p_location_code text, p_dan integer, p_cycle_plan_id uuid, p_kukkiwon boolean, p_paper_waiver boolean)` — `bb_add_candidate` (desk, walk-ins and late families) | S | 3: names; DOB null, after today or before 1900; email null or not `bb_email_is_valid`; school not a `locations` code; Dan not 1–4; plan id null; Kukkiwon null; **`p_paper_waiver` not true** → `invalid` (v0.900: Add is refused until the tick) · 4: lock the cycle · 6: `past` → `finished` (works while registration is closed, v0.212); plan not of this cycle → `invalid` · 8: insert (`source 'desk'`, reference `'BB-' || nextval`, `kukkiwon_added_on` = today when chosen), a `paper` waiver row (current version, `signed_as_minor` from §5.4, `ticked_by_name` = the caller), duplicate flag (§5.6), purge | `{status, id, reference, version:1}` |
| `bb_update_candidate(p_candidate_id uuid, p_expected_version integer, p_first text, p_last text, p_date_of_birth date, p_email text, p_location_code text, p_dan integer)` — `bb_update_candidate` (Edit details) | S; **Dan change when the candidate has a payment: A** (S8) | 3: as add (DOB and email required — except both null **only** when the candidate was already purged; then they must stay null) · 4: `bb_lock_candidate` · 5: version · 6: purged and DOB/email given → `invalid`; Dan changed and has a payment and not admin → `not_allowed` · 8: update and write `version + 1` (unchanged → no write); names / DOB changed → recheck duplicates (both sides). A school change moves the candidate only — **recorded payments keep their stored school** (v0.903). Allowed for withdrawn candidates (as Star) | `{status, version, needs_parent_signature}` |
| `bb_change_plan(p_candidate_id uuid, p_expected_version integer, p_cycle_plan_id uuid, p_kukkiwon boolean)` — `bb_change_plan` (Change plan or Kukkiwon) | S before a payment; **A** after (v0.210) | 3 nulls · 4–5 · 6: withdrawn → `withdrawn`; purged → `invalid`; plan not of this cycle → `invalid`; has a payment and not admin → `not_allowed` · 8: update (`kukkiwon_added_on` = today when newly chosen, null when removed; unchanged → no write). Recorded payments never change (v0.217); money is worked out again (§5.3) | `{status, version, money}` |
| `bb_resolve_duplicate(p_keep_id uuid, p_keep_version integer, p_other_id uuid, p_other_version integer, p_keep_both boolean)` — `bb_resolve_duplicate` | S | exactly 0006 `star_resolve_duplicate` with the cycle in place of the event (lock the cycle, then both candidates in id order); either purged → `invalid` | `{status, keep_version, other_version}` |
| `bb_withdraw_candidate(p_candidate_id uuid, p_expected_version integer)` — `bb_withdraw_candidate` | A | 4–5 · 6: already withdrawn → `withdrawn` · 8: withdrawn, reason `withdrawn`; recheck whoever pointed at it. Payments stay | `{status, version}` |
| `bb_restore_candidate(p_candidate_id uuid, p_expected_version integer)` — `bb_restore_candidate` | A, or S for a `duplicate_copy` the same staff member withdrew less than 10 s ago | as 0006 | `{status, version}` |
| `bb_delete_candidate(p_candidate_id uuid, p_expected_version integer)` — `bb_delete_candidate` (Delete permanently; e.g. a fake form registration, v0.212) | A | 3 nulls · 4: `bb_lock_candidate` · 5: version · 6: **any `bb_payments` row** (even undone) → **`has_payments`** (v0.904: "[Name] has payment records, so they can't be deleted. Withdraw them instead.") · 8: delete (cascades its waivers, drawn or paper; recheck whoever pointed at it) | `{status}` |
| `bb_record_paper_waiver(p_candidate_id uuid, p_expected_version integer)` — `bb_record_paper_waiver` (§14 OI-2) | S | 4–5 · 6: candidate already purged (no DOB, so `signed_as_minor` can't be worked out) → `invalid`; `past` → `finished` · 8: insert a new `paper` waiver row (current version, `signed_as_minor` now, ticked by the caller); bump the candidate | `{status, version, needs_parent_signature}` |

### 6.4 Payments (v0.210, v0.218, v0.900, v0.903, v0.904, S1–S3)
**Purged candidates** (§6.6): every write in §6.3 that needs the DOB or email (paper waiver, change plan, resolve duplicate, an Edit details that gives DOB / email) answers `invalid`; withdraw, restore, delete and all payment functions still work (they don't need them).

Every payment function: lock §1.5; after writing, **bump the candidate's version** (so a double click with the old version gets `stale`) and answer the new money (§5.3).
| Function | Role | Ordered checks | Ok |
|---|---|---|---|
| `bb_record_payment(p_candidate_id uuid, p_expected_version integer, p_amount_cents integer, p_method text, p_for_items text[], p_note text)` — `bb_record_payment` | S | 3: amount not 1–500 000; method not cash/check/card; items null, empty, a repeat or a bad code; note set and not `testing_note_is_valid` → `invalid` · 4–5 · 6: withdrawn → `withdrawn` (S2); an item not in the candidate's current plan (or `kukkiwon` not chosen) → `invalid` · 8: insert `payment`, `paid_on = testing_today()`, `location_code` = the candidate's school now, `cycle_name` = the cycle's name now, `recorded_by = auth.uid()`; purge | `{status, payment_id, version, money}` |
| `bb_undo_payment(p_payment_id uuid)` — `bb_undo_payment` | S if `recorded_by = auth.uid()` and `recorded_at > now() − 10 s` (the server allows 10 s for the 5-second toast); otherwise A | 3 null · 4: `bb_lock_payment` → `not_found` · 6: role rule → `not_allowed`; a `reversal` → `invalid`; already reversed → `stale`; a `payment` with a live `returned` row → `invalid` (undo the returned mark first); the net floor refuses (e.g. undoing a payment under an active refund) → `invalid` · 8: insert the reversal (copies school and cycle name; `paid_on` today). Works on `payment`, `refund` and `returned` rows (the toast Undo of Record refund / Mark check returned). Allowed on withdrawn candidates | `{status, version, money}` |
| `bb_edit_payment(p_payment_id uuid, p_amount_cents integer, p_method text, p_for_items text[], p_note text, p_reason text)` — `bb_edit_payment` | A | 3: as record; reason null or not `testing_note_is_valid` → `invalid` · 4 · 6: not a `payment` → `invalid`; already reversed or returned → `stale`; withdrawn → `withdrawn`; the candidate has an **active (unreversed) refund** → `invalid` (S2, as 0006); an item not in the current plan → `invalid` · 8: insert the **reversal** of the old row and the **new `payment`** in this one transaction, **both with `recorded_at = now()` and `recorded_by = auth.uid()`** (the editing admin), both carrying `reason`; the new row copies the old row's `paid_on`, `location_code` and `cycle_name` (v0.900: "the date stays"; the original row keeps its first recorder in the history) | `{status, payment_id, version, money}` |
| `bb_record_refund(p_candidate_id uuid, p_expected_version integer, p_amount_cents integer, p_method text, p_note text)` — `bb_record_refund` | A | 3: amount not 1–500 000; method not cash/check/card (as drawn); note → `invalid` · 4–5 · 6: amount > net paid → `{status:'refund_too_large', paid_cents}` (v0.900: "can't be more than what's been paid"). Allowed on withdrawn candidates (S2) · 8: insert `refund` (−amount, today; school and cycle name of the candidate's latest live payment, §14 OI-4) | `{status, payment_id, version, money}` |
| `bb_mark_check_returned(p_payment_id uuid, p_note text)` — `bb_mark_check_returned` | A | 3: id null; note → `invalid` · 4 · 6: not a `payment` with method `check` → `invalid`; reversed (undone or edited away) → `stale`; already marked returned (even if that mark was undone) → `stale` · 8: insert `returned` (−amount, today, copies school and cycle name, the note). The net may go below zero (S2). **After its Undo, the same check row can't be marked returned again** (`bb_payments_one_returned_idx`); to start over, an admin undoes the payment and records it again, and the new row can be marked returned (S2) | `{status, payment_id, version, money}` |

### 6.5 Logging
Every write is logged by the table triggers (§2.11) with the function's action tag and one batch id per call; actor = `change_log_actor_name()` (desk = "Staff"; the public form = "Family form" via `tkd.actor_label`). Masked: DOB, email (`bb_candidates_log`), signature, signer's name (`bb_candidate_waivers_log`).

### 6.6 The purge — `bb_purge_due() returns integer` (internal; v0.906, v0.907, S13)
Does nothing when either keep-years setting is null. Otherwise, for every candidate (active or withdrawn) not yet purged that `bb_purge_is_due(id, testing_today())`, locked `for update … skip locked` (a candidate another call holds is done next time): set `date_of_birth`, `email_for_results` to null and `personal_removed_at = now()`; then, **after that candidate lock, its `drawn` waiver rows with `removed_at is null`, locked with plain `for update`** (they are only ever written under the candidate lock, so this never waits long and never skips one), get `signature`, `signer_name` set to null and `removed_at = now()`. Kept: names, Dan, school, plan, reference, payments, the waiver's version and date ("Signed on Mar 10, 2027 · version 2027-1 · signature and signer's name deleted on … after the keeping time"). Tagged `bb_purge_due` with its own batch id, then the caller's tags are put back. No version bump (no-bump columns). Its log rows show only the masked values going to null. **Runs as the last step** (after the call's own write, same transaction) of `bb_add_cycle`, `bb_add_candidate`, `bb_record_payment`, `bb_set_keep_years`, and of the reads `bb_cycles_list` and `bb_cycle_roster` (so they are `volatile`, called as normal POST RPCs, never `rpc(…, { get: true })`). **Never** from the public path (the registrar's 5-second limit). Nothing runs overnight.

### 6.7 Internal helpers (no grants)
`bb_lock_candidate(p_candidate_id) returns public.bb_candidates` (cycle `for no key update`, candidate `for update`), `bb_lock_payment(p_payment_id) returns public.bb_payments` (candidate lock, then the payment `for update`), `bb_find_duplicate`, `bb_recheck_duplicate`, `bb_recheck_pointing_at`, `bb_cycle_state`, `bb_candidate_items`, `bb_candidate_money`, `bb_age_on`, `bb_purge_due_on`, `bb_purge_due`, `bb_public_answer`, `bb_requirements_is_valid`, `bb_price_is_valid`, `bb_email_is_valid`, `bb_time_is_valid`, the trigger functions.

### 6.8 Every action tag
`bb_seed`, `bb_save_waiver`, `bb_set_keep_years`, `bb_add_cycle`, `bb_update_cycle`, `bb_set_registration`, `bb_delete_cycle`, `bb_add_candidate`, `bb_update_candidate`, `bb_change_plan`, `bb_resolve_duplicate`, `bb_withdraw_candidate`, `bb_restore_candidate`, `bb_delete_candidate`, `bb_record_paper_waiver`, `bb_record_payment`, `bb_undo_payment`, `bb_edit_payment`, `bb_record_refund`, `bb_mark_check_returned`, `bb_public_register`, `bb_purge_due`. A requirements-sheet or starting-point fix pasted by Jeffrey logs with the action `''` → recorded as 0003's default (`manual`) and actor "Database admin".

---

## 7. Staff read functions (S; `has_data_access()` first → `no_access`; missing → `not_found`)

The database takes **no device argument**: the mat-side tablet setting hides money and DOB in the app only (Star v0.161, v0.900).

| Function | Returns (ok) |
|---|---|
| `bb_cycles_list()` — `volatile`, purges | `{status, today, cycles:[{id, name, state (§5.1), first_day, last_day, next_day, day_count, application_due, registration_open, auto_close, candidate_count (active, both schools), has_payments, has_form_waivers, version}]}` newest first day first; the client splits Upcoming / Past and draws the tags |
| `bb_cycle_roster(p_cycle_id uuid)` — `volatile`, purges | `{status, state, rows:[{id, first_name, last_name, location_code, dan, plan_id, plan_name, kukkiwon, source, reference, registered_at, status, withdrawn_reason, duplicate_state, duplicate_of, version, has_payment_rows, money (§5.3 without the item list)}]}` in the v0.900 order (Dan, school Shrewsbury then Worcester, last name, first name). **No DOB, email, waiver data or login id.** Cards and pills are counted by the client from these rows |
| `bb_candidate_detail(p_candidate_id uuid)` | `{status, candidate:{granted columns, **date_of_birth, email_for_results**, personal_removed_at, age_on_first_day, under_18_on_first_day, plan:{name, payments_count}}, waiver:{how, version_name, signed_at, signer_name\|null, signed_as_minor, ticked_by_name, signature_on_file, removed_at}, needs_parent_signature, payments:[shown rows: live payments (with `returned` flag and the returned row), live refunds, live returned rows; **undone and edited-away rows and reversals are left out**, oldest first, each with kind, amount, method, paid_on, for_items, note, recorded_at, recorded_by_name], money (§5.3 with items)}` — one candidate by id; no list or bulk version. **If `bb_purge_is_due(candidate, today)`, DOB, email, age and signer name are returned as null even when the purge hasn't run yet.** The duplicate compare dialog calls it once per side |
| `bb_view_signature(p_candidate_id uuid)` | **A**. `{status, signature: data URL \| null, signer_name, signed_at, removed_at}` of the newest drawn waiver (paper → `{status:'ok', signature:null, …}`). **If `bb_purge_is_due(candidate, today)` is true, `signature` and `signer_name` are returned as null even when the purge hasn't run yet.** Not logged |
| `bb_receipt(p_candidate_id uuid)` | `{status, candidate:{first_name, last_name, dan, reference, location_code}, cycle:{name}, plan:{name}, kukkiwon, lines:[{paid_on, for_items, kind, method, amount_cents, returned}], money:{total_due_cents, paid_cents, balance_cents, next_on, next_cents}, schools:[{code, name, address}] (both, from `locations`), printed_on, printed_by_name}`. **No DOB, email, notes, reasons or "recorded by"** (v0.900); lines as the detail view (undone rows don't appear; an edited payment shows its new amount; refunds and returned checks are their own lines). Phones: §14 OI-3 |
| `bb_cycle_defaults()` | A; §6.2 |
| (Rubric and prices, cycle page, days, prices, due dates) | column grants (§4.1) |

---

## 8. The public path (family form; v0.204 own login, v0.211–v0.213, v0.216, v0.905)

### 8.1 The login `bb_registrar`
Created only if missing, with **the same settings as `testing_registrar` and `star_registrar`**: `create role bb_registrar login noinherit nocreatedb nocreaterole nobypassrls noreplication connection limit 5`; `alter role bb_registrar set statement_timeout = '5s'`, `set idle_in_transaction_session_timeout = '10s'`, `set search_path = ''`. **No password in the file.** `grant usage on schema public to bb_registrar`; execute on `bb_public_cycle` and `bb_public_register` only; **nothing else granted by us** — no rights on any table, view or sequence (including `testing_public_attempts`), not a member of any role, no member roles except the creating owner. `authenticator` must not be able to become it. `testing_registrar`, `star_registrar` and their tests are untouched; none of the three logins can run another form's functions.
**What a separate login protects:** inside the database, each login runs only its own two functions. Pages Function bindings (Hyperdrive configs, secrets) are shared by the whole Pages project, so it is **not** a wall between the Functions themselves.

### 8.2 `bb_public_cycle(p_code text) returns jsonb` — `stable security definer`
Code null or not `^[a-hjkmnp-z2-9]{8}$`, matching neither code column, or matching more than one row → `{status:'not_found'}`. Else `{status:'ok', state:'open'|'not_open'|'closed'|'finished', closed_on, school:{code, name, address|null} (from the column that matched), cycle:{name, application_due, submissions_due, days:[{name, day_date, start_time "HH:MM", end_time, place:{name, address|null}, second:{start_time, end_time, place}|null, parts}], plans:[{id, name, position, payments:[{payment_no, due_on}], amounts:{"1":[…], …}}], kukkiwon:{"1":c, …}, requirements}, waiver:{version_name, body}}` (the current version). Place names: a school → its `locations` name + `testing_location_address`; other → the text. **Nothing else:** no counts, no candidates, no ids except the plan ids the form sends back.

### 8.3 `bb_public_register(p_code text, p_client_key text, p_submission_id uuid, p_first text, p_last text, p_date_of_birth date, p_email text, p_dan integer, p_cycle_plan_id uuid, p_kukkiwon boolean, p_acknowledged boolean, p_waiver_version text, p_signer_name text, p_signature text) returns jsonb` — wrapper, `volatile security definer`
**Wrapper, exactly as 0006 §8.3:** first clears `request.jwt.claims` and `request.jwt.claim.sub` (`set_config(…, '', true)`), so nothing from the session can make `auth.uid()` or `has_data_access()` true; removes `testing_public_attempts` rows older than 2 days; runs `bb_public_register_core(…)` (same arguments, internal, no grant) inside a block where `unique_violation`, `foreign_key_violation`, `check_violation`, `not_null_violation`, deadlock, serialization and lock errors become `invalid` (everything the core did is undone); **then** inserts this call's attempts row — `client_key` (≤ 200), `event_id` = the matched cycle id or null, `outcome = 'bb:' || status` — outside the part that can roll back, so every call counts; resets the tags; returns the answer. **No purge.**
**Core, in Star's exact order (0006 `star_public_register_core`):**
1. the cycle by code → `not_found`;
2. **this `submission_id` already saved** (in `bb_candidate_waivers`)? same cycle → the **same ok answer** again (idempotent); another cycle → `invalid`;
3. lock the cycle `for no key update` and read it again;
4. **step 2 again, under the lock** (a retry that waited for the first call's lock gets the same ok answer, not `closed` or `rate_limited`);
5. **only then** open / closed: `not_open` / `closed` (+ `closed_on`) / `finished` (§5.1);
6. input → `invalid`: client key 1–200 characters; submission id; names; DOB not null, not after today, not before 1900-01-01; email `bb_email_is_valid`; Dan 1–4; plan id of this cycle; Kukkiwon not null; acknowledged true; signer name (name rule); `testing_signature_is_valid(signature)`; waiver version name of the right shape and existing;
7. **waiver version (v0.905):** `bb_waiver_version_ok(version, now())`: not a placeholder, and current **or** superseded less than 24 hours ago → accepted and stored exactly; otherwise (including **any `is_placeholder` version**, current or not) → **`waiver_changed`** (the page shows "Please reload the page");
8. **rate limit:** ≥ 20 attempts rows for this client key in the last hour (**all forms' rows count**, when every Function uses the same `CLIENT_KEY_SECRET`, §9.2) → `rate_limited`. The cycle's own count (≥ 200 in the last hour) is **logged only, never a refusal** (the attempts row already records it);
9. write, tagged `bb_public_register`, `tkd.actor_label = 'Family form'`: the candidate (`source 'form'`, reference, school from the code, `kukkiwon_added_on` = today when chosen), the `drawn` waiver row (`signed_as_minor` from §5.4), the duplicate flag (silent).
**Ok answer** (`bb_public_answer(candidate_id)`): `{status:'ok', reference, first_name, last_name, dan, kukkiwon, plan_name, items:[{item, due_on, amount_cents}] (§5.2, so a late registrant's passed dates show as today), total_cents, cycle_name, school:{code, name}}` — **identical whether or not the person looks like a duplicate**; **never** the DOB, email, signer's name or signature.

---

## 9. The public Function and shared code (interface for the later public-path builder; not built in the DB step)

### 9.1 Route, page and Function
- Page route **`/black-belt/<code>`** (a third Vite entry `black-belt.html` + `src/blackBelt/form/main.jsx`, no supabase-js, no dashboard imports beyond pure helpers); `public/_redirects`: `/black-belt/*  /black-belt  200`; Vite dev rewrite as for `/register/*`. `?dan=1…4` preselects the Dan (v0.211).
- Function **`functions/api/black-belt/[code].js`** — the same checks as Color Belt's (CONTRACT-0005 §4.2): GET → kill switch → `bb_public_cycle`; POST → kill switch, `Origin` = `PUBLIC_ORIGIN`, JSON, ≤ 100 KB, honeypot, too fast (`started_at` ≥ 4 s), Turnstile siteverify with **action `bb_register`** and the production hostname, HMAC client key, typed parameters (`prepare: false`), status mapping (§8 statuses + `verify_failed`, `bad_request`, `unavailable`), no error text leaked, only status + timing logged.
- **Bindings / variables (Production only, Cloudflare dashboard):** kill switch **`BB_PUBLIC_REGISTRATION`** (`on`/`off`, default off; missing → `not_open`), Hyperdrive **`HYPERDRIVE_BB`** (config `tkd-bb-registrar`, user `bb_registrar`, **caching disabled**, origin connection limit ≤ 5), and the existing `TURNSTILE_SECRET`, `TURNSTILE_SITE_KEY`, `CLIENT_KEY_SECRET`, `PUBLIC_ORIGIN`.
- `public/_headers`: the Color Belt CSP block repeated for `/black-belt`, `/black-belt.html`, `/black-belt/*`; `/api/*` already `no-store`.

### 9.2 Shared files the public builder changes (listed in every summary)
- **`functions/_lib/turnstile.js`** — the action is hard-coded `'register'`; it becomes a parameter (`verifyTurnstile({…, expectedAction})`), Color Belt passing `'register'` unchanged. Star will need the same change: coordinate (§14 OI-5).
- **`functions/_lib/db.js`** — **not changed**: Black Belt gets its own `functions/_lib/bbDb.js` (two typed calls, `HYPERDRIVE_BB`), so Color Belt's file and its test stay untouched.
- **`functions/_lib/register.js`** — not changed; Black Belt's handlers live in a new `functions/_lib/bbRegister.js` reusing `http.js`, `clientKey.js`, `rateLimit.js`, `turnstile.js`.
- **Shared rate limit:** the 20-per-hour database limit counts across forms **only if every Function makes its client key with the same `CLIENT_KEY_SECRET`** (true today; SETUP says so). A separate secret would make the limit per form.
- `public/_redirects`, `public/_headers`, `vite.config.js` (entry + dev rewrite), `src/lib/mockClient.js` (preview), `src/screens/Testing.jsx` (the chooser row), `src/App.jsx`.

---

## 10. Files

| File | Who | What |
|---|---|---|
| `supabase/migrations/0016_black_belt.sql` | A (new) | §0–§8 |
| `supabase/tests/0016_tests.sql` | A (new) | §11.1 |
| `supabase/tests/0016_fingerprints.sql` | A (new) | §11.3 |
| `supabase/tests/0016_seed_review.txt` | A (new) | §3, for CP1 |
| `supabase/tests/pglite/run.mjs` | A (one new step + `bb_registrar` live checks; nothing else changes) | §11.4 |
| `supabase/SETUP.md` | A (one new section, the next free number at build time) | paste, checks, `bb_registrar` password, Hyperdrive, off switch, revert (§13) |
| `functions/api/black-belt/[code].js`, `functions/_lib/bbRegister.js`, `functions/_lib/bbDb.js`, `functions/tests/bbRegister.test.mjs` | public builder (later, B1) | §9 |
| `functions/_lib/turnstile.js`, `public/_redirects`, `public/_headers`, `vite.config.js` | public builder (shared) | §9.2 |
| `black-belt.html`, `src/blackBelt/**`, `src/lib/blackBelt/**` (data layer, preview store), `src/lib/mockClient.js`, `src/screens/Testing.jsx`, `src/App.jsx` | screens / data builders (B1, B2; own contract sections at that time) | the approved screens |
Not touched by anyone in 0016: 0001–0006 / 0010 files, their tests and fingerprints.

---

## 11. Tests

### 11.1 `supabase/tests/0016_tests.sql` (copy 0006's shape)
One transaction, one `do $$ … $$` block, `rollback;` at the end ("NEVER change the final rollback to commit"), placeholders `<paste-admin-UID-here>` / `<paste-desk-UID-here>`, `raise exception 'TEST FAILED: <id> …'`, final row **`ALL 0016 TESTS PASSED`**. Its own `'zz test ' || left(gen_random_uuid()::text, 8)` cycles and candidates, so it passes before and after real Black Belt data exists. Sessions as 0006: **A1** admin unlocked · **A2** locked · **A3** 5 wrong PINs · **A4** signed out · **A5** password 8 days old · **A6** magic link · **A7** idle-expired · **A8** inactive admin · **D1** desk unlocked · **D2** desk locked · **D3** desk magic link · anon. **No fake clock:** date rules are tested by calling the internal helpers (§5: `bb_cycle_state`, `bb_candidate_money`, `bb_purge_is_due`, `bb_waiver_version_ok`) as `postgres` with made-up `p_today` / `p_now` values, and by building test rows with past dates directly as `postgres` (e.g. a cycle whose last day was 3 years ago, a version with `superseded_at = now() − 23h59m`).

| Id | Test |
|---|---|
| **T1 Who may call what** | |
| T1a | anon: every staff and public function → 42501; `select` on every 0016 table → 42501 |
| T1b | A1 and D1 can't execute the 2 public functions or any helper (42501) |
| T1c | A2–A8 and D2–D3 → `no_access` from **every** staff function, three calls each (sensible arguments; broken input; ids that exist nowhere) — access is checked before input |
| T1d | D1 → `not_allowed` from every A function (save waiver, keep years, defaults, add / update / delete cycle, withdraw, restore of a normal withdrawal, delete candidate, undo after 10 s, edit, refund, returned, view signature); nothing written |
| T1e | A2–A8 read 0 rows from every readable table; A1 and D1 read the same counts as `postgres` |
| T1f | A1: direct insert / update / delete / truncate on every table → 42501; `select *` and every never-granted column (§4.2) → 42501 |
| **T2 `bb_registrar`** (catalog) | |
| T2a | it may execute **exactly** `bb_public_cycle` and `bb_public_register`; `testing_registrar` and `star_registrar` still exactly their two (their tests unchanged); none can execute another form's functions |
| T2b | no 0016 function executable by PUBLIC |
| T2c | no right on any table / column / sequence — explicitly none on `testing_public_attempts`, `change_log`, any `bb_` table |
| T2d | can't CREATE in any schema or the database |
| T2e | `authenticator`, `anon`, `authenticated`, `service_role` can't become it; member of no role |
| T2f | attributes and settings exactly §8.1 |
| T2g | one owner for every 0016 function, table and the sequence |
| **T3 Rubric and prices** | |
| T3a | seed after a fresh install **and** a second run: one settings row (both null), one placeholder waiver, one starting point; no duplicates |
| T3b | save waiver: new version "YYYY-n" with the right count; the old one `superseded_at` set; unchanged text → no write; stale current id → `stale`; a version can't be deleted or edited (as postgres → `check_violation` / refused) |
| T3c | keep years: one null → `invalid`; 2 or 21 → `invalid`; first call → `confirm_needed` with the right `remove_count` and **nothing saved or purged**; a wrong confirm count → `stale`; the right one saves, purges in the same call and logs old → new numbers |
| **T4 Cycles** | |
| T4a | defaults: no cycle → the starting point (Fall 2026 values exactly); after a cycle → that cycle's schedule and prices. Add: two different codes, closed, `requirements` copied from the source, every plan has payments_count × 4 amounts, 4 Kukkiwon fees |
| T4b | add input rules (past day, end before start, 07:45 / 22:15 / 10:10 times, two places, half a second part, unknown part, 0 or 11 plans, 13 payments, a $0 / $5,001 / $290.50 price, `follows` on payment 2, deadline after the last day) → `invalid`; a part on no day → `part_without_day` with the parts; duplicate name (case and spaces) → `duplicate_name` |
| T4c | prices are set: any update of a plan, amount or fee row as postgres → `check_violation`; an insert outside Add cycle → `check_violation`; `bb_update_cycle` with `plans` → `invalid` |
| T4d | update: days matched by id (ids kept), removed and added days, parts by difference, due dates editable, `follows` keeps payment 1 = Application due, a changed date in the past → `invalid`, an unchanged past date kept; version bumps once; unchanged → no write |
| T4e | registration: staff close any time; staff open after the closing date → `not_allowed`; admin opens and `auto_close` becomes false; opening with the placeholder waiver current → `waiver_needed`; `past` → `finished`; `bb_cycle_state` with `p_today` on Application due, the day after, a testing day and the day after the last day; **a testing day after Application due with `auto_close` on and the switch on → public status `closed`, not `open`** |
| T4f | delete cycle: wrong version or count → `stale`; with a payment row (also an undone one) → `has_payments`; with a drawn waiver → `has_waivers`; with desk candidates only → ok, everything cascaded and logged in one batch |
| **T5 Family form** | |
| T5a | `bb_public_cycle`: ok shape for each link (school from the code); `not_found` for unknown / malformed codes; no counts, candidates or ids except plan ids |
| T5b | register ok: candidate (`source form`, `BB-` reference, school from the link), a drawn waiver row with `signed_as_minor` right for a 17-year-old and an 18-year-old on the first day, `change_log` rows by "Family form"; **called with an admin's JWT claims set in the session, it still logs as "Family form"** and the claims are empty inside the core |
| T5c | idempotency: the same `submission_id` again → the same answer, no second row; the same id on another cycle → `invalid`; **a retry after the cycle was closed in between still gets the ok answer** (the lookup comes before the state check, steps 2 and 4); **a retry from a client key already over the 20-per-hour limit still gets the ok answer** (the lookup comes before the rate limit) |
| T5d | every input rule → `invalid`, nothing written (future DOB, bad email, plan of another cycle, Dan 5, unticked, bad / non-PNG / too long signature, blank signer name) |
| T5e | states: `not_open`, `closed` + `closed_on`, `closed` + null, `finished`; on a testing day after Application due with `auto_close` on → `closed` + `closed_on` (the day tag never opens the form) |
| T5f | **24-hour waiver rule:** the current version → ok; a version superseded 23 h 59 min ago → ok and stored exactly; superseded 24 h 1 min ago → `waiver_changed`, nothing written; **the placeholder version (current, or superseded a minute ago) → `waiver_changed`**; `bb_waiver_version_ok` with made-up `p_now` on both sides of 24 h |
| T5g | rate limit: the 21st call within an hour for one key → `rate_limited`, **counting Color Belt and Star rows for that key too**; 200+ attempts for the cycle from different keys are **not** refused; every call writes one `bb:` attempts row; rows older than 2 days cleaned up |
| T5h | a same-name + same-DOB registration is flagged `possible` on both rows and gets an answer identical in shape to a non-duplicate; the answer never holds DOB, email, signer name or signature |
| **T6 Candidates** | |
| T6a | desk add: paper tick false → `invalid`; DOB or email missing → `invalid` (S5); works with registration closed; `past` → `finished`; reference from the same counter as the form; a paper waiver row with `ticked_by_name` |
| T6b | update: version; school change moves the candidate but **not** recorded payments' `location_code`; Dan change with a live payment by D1 → `not_allowed`, by A1 ok; a DOB fix that makes the candidate a minor on the first day → `needs_parent_signature` true; a paper re-sign clears it |
| T6c | change plan: D1 before any payment ok, after a live payment `not_allowed`, A1 ok; `kukkiwon_added_on` set / cleared; money recomputed |
| T6d | resolve duplicate (keep both / keep one), restore window (D1 own within 10 s only), withdraw, restore |
| T6f | purged candidate (built as postgres): paper re-sign, change plan, resolve duplicate and an Edit details giving DOB → `invalid`; withdraw and payments still work; `bb_candidate_detail` / `bb_view_signature` return null personal values **as soon as the purge date has passed, before the purge runs** |
| T6e | delete permanently: with any payment row (also undone) → `has_payments` and nothing removed; without → candidate and waivers gone; as postgres, a direct delete of a candidate with payments → `foreign_key_violation` (restrict) |
| **T7 Payments** | |
| T7a | record: amounts 1 and 500 000 ok, 0 and 500 001 `invalid`; items checked against the plan; withdrawn → `withdrawn`; double click with the old version → `stale`; `paid_on` = today; stored school and cycle name = the candidate's and cycle's at that moment; a later school fix or cycle rename doesn't change them |
| T7b | allocation (S1) and tags (v0.219, v0.224, v0.900): the mockup cases — nothing paid before / on / after the first due date (gray Next / gray Next / red Not paid); three post-dated checks → Paid in full; Omar (p1–p3 paid, Kukkiwon not) → `late`, `late_kukkiwon_only`, since the p1 date; an amount smaller than its ticked items; an extra payment → overpaid; a late desk family (passed dates count from the registration day); Kukkiwon added after payment 1's date → gray Next that day, Late the next day; a plan change leaving an item that no longer exists |
| T7c | undo window: D1's own payment within 10 s ok; another's or after 10 s → `not_allowed`; A1 any time; undo of a reversal → `invalid`; twice → `stale` |
| T7d | edit (A): exactly two new rows, **same `recorded_at` and `recorded_by` (the admin)**, both with the reason; the new row has the old `paid_on`, school and cycle name; edit under an active refund → `invalid`; edit of a returned check → `stale` |
| T7e | refund: up to the net paid ok (also on a withdrawn candidate), one cent more → `refund_too_large` + `paid_cents`; school and cycle name from the latest live payment; its undo restores the balance |
| T7f | returned: only a live check payment; the net may go below zero after a refund; the balance and Late tag come back; **while the net is below zero, a payment of part of it is accepted** (the net floor only refuses rows that lower it); undo of the returned mark → the check counts again; **marking the same row returned again → `stale`**; undoing a payment that has a live returned row → `invalid`; marking a reversed payment returned → `stale`; **the full sequence: mark returned → Undo (the returned mark) → undo the payment → record it again → mark the new row returned → ok** |
| T7g | **append-only, never deleted:** as postgres, update of any row refused; delete of any row refused **even with `pg_trigger_depth() > 1` inside a cascade and with any action tag** (including `bb_delete_candidate`, `bb_delete_cycle`, `star_delete_event`, `delete_student`); truncate refused; a reversal of another candidate's row / a wrong amount / a reversal of a reversal → `check_violation` |
| T7h | money sums: 400 rows of $5,000 on one candidate (as postgres, test only) sum without overflow (`bigint`) |
| **T8 Purge (v0.906, v0.907)** | |
| T8a | both settings null → nothing purged ever, even for a cycle 30 years ago |
| T8b | N1 = 3, N2 = 3: an adult whose cycle's last day was 3 years + 1 day ago → DOB, email, signature and signer name removed, `personal_removed_at` / `removed_at` set, names / Dan / payments / waiver version and date kept, no version bump; 3 years − 1 day → kept; a 10-year-old in the same cycle → kept until 18th birthday + 3 years; a withdrawn candidate purged too; paper waivers untouched |
| T8c | the purge runs from each listed call (§6.6) and **not** from `bb_public_register`; a second purge right after the first changes nothing and logs nothing (`skip locked` itself needs two sessions: review only, §11.5) |
| T8d | after the purge, `bb_update_candidate` can't put DOB or email back (`invalid`); `bb_candidate_detail` shows "removed" |
| **T9 Privacy proofs** | |
| T9a | `has_column_privilege` false for `date_of_birth` and `email_for_results` for authenticated, anon, service_role, PUBLIC and all three registrars; no column of `bb_candidate_waivers` or `bb_starting_point` readable by any of them |
| T9b | no `change_log_write` trigger on `bb_candidates` or `bb_candidate_waivers`; their own log triggers exist **for insert, update and delete**; **`change_log` never contains `data:image`**, the test DOB (in any text form the log uses), the test email, or the **signer's name** after register, desk add, edit, paper re-sign, purge, **Delete permanently and Delete cycle (the cascade's delete rows show `"on file"` / null)** — the signer is a parent whose name differs from the candidate's (e.g. candidate "Alex Testkid", signer "Jordan Testparent"), so a match can't come from the candidate row |
| T9c | `bb_cycle_roster`, `bb_receipt`, `bb_cycles_list` and both public answers never contain a DOB, email, signer name, signature, login id or note (receipt) |
| **T10 Logging** | every write function: one row per changed row with the right action tag (§6.8), `op`, `table_name`, `record_id`, `actor_name` (desk = "Staff", form = "Family form"), `session_id`; candidates' and payments' rows carry `location_code` (payments: the stored school); cycle and day rows don't; unchanged saves write nothing |
| **T11 School dates** | `testing_school_date('2027-03-28 04:30:00+00')` = 2027-03-27 (11:30 PM Massachusetts time); a test candidate whose `registered_at` is that instant (built as postgres) gets its due-date floor 2027-03-27 from `bb_candidate_items`; C10 finds no `::date` cast on a `timestamptz` in any 0016 function source |
| **T12 Races** (what one session can prove — §11.5) | (a) two registrations with the same `submission_id` in one transaction → one candidate, same answer; (b) two Add cycle calls → four different codes; (c) a second reversal, or a second returned row, of the same row as postgres → `unique_violation` (`bb_payments_one_reversal_idx` / `bb_payments_one_returned_idx`); (d) a refund that would take the net below zero, inserted as postgres after a concurrent-style undo → `check_violation` (net floor); (e) the reference counter never repeats |
| **T13 Catalog** | |
| C1 | RLS on all 13 tables; `bb_candidate_waivers` and `bb_starting_point` have no policy; every other table exactly one SELECT policy to authenticated using `has_data_access()`; no write policies |
| C2 | table-wide rights false for anon, authenticated, service_role, PUBLIC; column SELECT for authenticated **exactly** §4.1 |
| C3 | the sequence: no rights for anyone |
| C4 | every 0016 function (by name list): exactly one version, `search_path=""`, `prosecdef` exactly as designed, `pronargdefaults = 0`, identity arguments exactly §6–§8, execute rights exactly §4.3 |
| C5 | foreign-key delete rules as §2: **every key from `bb_payments` is `restrict`**; candidates → cycle cascade; waivers → candidate cascade; duplicate_of set null |
| C6 | every trigger of §2.11 exists, runs the right function, is enabled |
| C7 | every named constraint and index of §2 exists (incl. the one-current-waiver partial unique index and the two partial unique indexes on `reverses_payment_id`) |
| C8 | the 0003 / 0005 helpers 0016 calls (§1.2) have the fingerprints they had before 0016 |
| C9 | no 0016 function source contains `clock_timestamp` |
| C10 | no 0016 function source casts a `timestamptz` with `::date` (text search for `::date` next to `now()`, `_at` columns) |

### 11.2 Lock-order review checklist (for the security reviewer, not a test)
One line per function: the header's `-- locks:` comment, compared with §1.5. Any function that locks a candidate before its cycle, or two candidates out of id order, fails review.

### 11.3 `supabase/tests/0016_fingerprints.sql`
Read-only, one SELECT, **connector-safe** (the words the connector refuses are spelled in pieces, e.g. `'bb_del' || 'ete_cycle'`, as 0005 / 0006). Rows by kind and name: **function** (every 0016 function: name, identity arguments, md5 of the comment-free, space-free source, `prosecdef`, `proconfig`, owner, sorted `aclexplode` rights) · **role** (`bb_registrar`: attributes, settings, memberships) · **table** (each 0016 table and the sequence: RLS flag, exact table and column rights) · **trigger** (name, table, function, enabled) · **policy**.

### 11.4 PGlite step (`supabase/tests/pglite/run.mjs`)
After the last existing step, on the main database: print the fingerprints of every migration already on `main` → apply `0016_black_belt.sql` → **those fingerprints are identical to before** (0016 changed none of them) → run `0016_tests.sql`, then **every earlier test file again** — all print their PASSED row unchanged → re-apply 0016 (re-run safe) and run `0016_tests.sql` again → print the 0016 fingerprints. Then **`bb_registrar` live checks** (`set role bb_registrar`): reading every `bb_` table, `testing_public_attempts`, `change_log`, `staff`, `locations`, `auth.users`; using the sequence; writing a `bb_` table; calling a staff function, a helper, `bb_public_register_core`, the Color Belt and Star public functions; creating a table or schema — all refused. **No impersonation:** as `bb_registrar`, after `select set_config('request.jwt.claims', '<an admin''s claims with sub and a fresh password amr>', false)`, every `bb_` staff function and `public.has_data_access()` are still refused (no execute right), and `bb_public_register` still logs as "Family form" with `auth.uid()` null inside the core. And with `set role testing_registrar` / `star_registrar`: the two Black Belt public functions refused.

### 11.5 What PGlite can't prove
PGlite runs on one connection, so two calls never run at the same time. Races are covered by (a) constraints that make the bad outcome impossible in any order — unique `submission_id`, unique `reverses_payment_id`, unique codes + the advisory lock, unique references, the net floor checked inside the guard under the candidate lock — each proved by T12 forcing the second write; and (b) the reviewer's §11.2 line-by-line check.

---

## 12. Room left for grading (the next migration; nothing built now)

- **Parts per day** exist (`bb_cycle_day_parts`); grading adds "a day or ticked part with grades can't be removed" to `bb_update_cycle` (it replaces the function, as 0010 replaced 0005's) and its own tables pointing at `bb_cycles`, `bb_cycle_days` and the part codes.
- **The requirements sheet** (`bb_cycles.requirements`, `bb_starting_point.requirements`) is dropped once the rubric tables exist (v0.901); the panel switches to them.
- **Ages** come from `bb_age_on`; grading adds a read that returns only the bracket for each candidate, never the DOB (plan §4). After the purge there is no DOB — old cycles are graded long before.
- **Payment kinds** can gain `credit` (the waiver's "applied to the next test") with one check-rule change; make-ups add their own columns.

---

## 13. Checkpoints (Color Belt's CP0–CP6, adapted for a third public form — plan §8 step 6)

| CP | What | Done when |
|---|---|---|
| **CP0** | This contract → security review → Jeffrey's OK; **0016 reserved with the Main session**; `git merge main` | OK recorded in the rulebook (0.9xx block) |
| **CP1** | Seed review: `0016_seed_review.txt` (Fall 2026 days, places, deadlines, prices, due dates, the requirements sheet in plain English, the placeholder waiver) | Jeffrey checks it against the Sheet |
| **CP2** | Preview walkthrough of B1 (cycles, Rubric and prices, the family form) and B2 (candidates, payments) with the fake database, after the security and design reviews | Jeffrey's OK per phase |
| **CP3** | **Database:** Claude checks read-only that no `bb_` object exists → Jeffrey pastes `0016_black_belt.sql` in the SQL Editor (confirms the destructive-operations warning) → Claude runs `0016_fingerprints.sql` (must equal PGlite), the earlier fingerprints (unchanged) and the security advisor (no new warnings) → Jeffrey runs `0016_tests.sql` (`ALL 0016 TESTS PASSED`), then `0005_tests.sql` and `0006_tests.sql` again; UIDs put back to placeholders. **Size check** (read-only): database size now vs the Free plan's 500 MB; a drawn signature is ≤ 70 KB, so 200 registrations a season ≈ 14 MB, kept for years; the expected total goes in the status file | all pass |
| **CP3b** | **`bb_registrar` password:** clipboard history off; SETUP's own script `make-scram-bb.mjs` makes a password and its SCRAM verifier on Jeffrey's PC; he checks the printed line names `bb_registrar`, pastes only that `alter role bb_registrar password 'SCRAM-SHA-256$…';` line; password into a **separate** password-manager entry ("Supabase bb_registrar"); then removes the snippet from the editor history and deletes the script file | done, nothing in chat |
| **CP4** | **Real waiver and settings:** an admin saves the school's waiver text on Rubric and prices (replacing the placeholder); the keep-years numbers once the insurer answers (registration can open before that — nothing is purged while they are empty) | waiver version 2027-1 (or later) current |
| **CP5** | **Real-database local check + Cloudflare setup:** admin and desk on this PC against the real database (`Start dashboard.bat`): add a test cycle, a desk candidate, a payment, its undo. Cloudflare (with Jeffrey's OK): third Hyperdrive config `tkd-bb-registrar` (caching **disabled**, limit ≤ 5) bound to **Production only** as `HYPERDRIVE_BB`; `BB_PUBLIC_REGISTRATION=off`; Turnstile accepts action `bb_register` on the production hostname; the size check is repeated once a season while registration is open (§14 OI-7) | checks pass; config screenshots without secrets |
| **CP6** | **Deploy with the form off** (Jeffrey's OK for the push) → switch the form on for a **TEST** registration through the real page on a test cycle → check it on the roster → **Delete permanently** the TEST candidate (no payment, so allowed; its waiver goes with it) → Delete the test cycle (now allowed: no payment, no drawn waiver) → switch on for real when the Spring 2027 cycle exists | live |
| **Off switch (any time)** | `revoke execute on function public.bb_public_register(…), public.bb_public_cycle(text) from bb_registrar;` (instant) → `BB_PUBLIC_REGISTRATION=off` + redeploy → `alter role bb_registrar nologin` | |
| **Revert** (only before real data; removes every Black Belt record) | a SETUP snippet in one transaction: revoke the two public functions, drop the 0016 functions, the 13 tables and the sequence, revoke usage from `bb_registrar`, drop the role. `change_log` rows written by Black Belt stay (append-only, DOB / email / signer masked); its attempts rows age out in 2 days. **The payment guard refuses deletes, so the revert drops `bb_payments` as a whole (a drop is not a row delete); this is why it is only for before real money exists** | |

---

## 14. Open items (technical; each has a working default the builder uses)

| # | Item | Working default |
|---|---|---|
| **OI-1** | The seeded waiver is a placeholder. Should the database stop anyone opening registration until the real text is saved? | **Yes**: `bb_set_registration` answers `waiver_needed` while the current version `is_placeholder` (one new status; the screens show "Save the school's waiver on Rubric and prices first."). |
| **OI-2** | The "Needs a parent's or guardian's signature" warning (plan §3.3) needs a way to record the new paper waiver; no approved screen shows that button | `bb_record_paper_waiver` (S) as §6.3, called from a "Waiver signed on paper" tick inside the warning on the candidate detail; drawn and shown to Jeffrey at CP2 |
| **OI-3** | The receipt shows both schools' phone numbers (v0.220), but `locations` has no phone column and 0016 must not alter a 0005 table | The phones are constants in the Black Belt data layer (`(508) 767-1717` Worcester, `(508) 792-5534` Shrewsbury, from `Old-Spreadsheet.md` §3.1); a phone column on Settings → Schools is a later Color Belt change |
| **OI-4** | A refund corrects no single row, but v0.903 says corrections copy the school and cycle name "from the payment it corrects" | The refund copies them from the candidate's **latest live payment** (the money it gives back) |
| **OI-5** | Star's Function (not built yet) will need the same `turnstile.js` change | Whichever form is built first makes the action a parameter (§9.2); the other uses it as is |
| **OI-6** | The approved Rubric and prices screen shows one editable number ("Keep … for [3] years … and for under-18s until 3 years after they turn 18"), but v0.906 / S12 make two settings | Two number fields in the same sentence; the screens builder shows the change at CP2 |
| **OI-7** (for Jeffrey) | A **hard daily cap of online registrations per cycle** (e.g. 200 a day): yes or no? Today only the 20-per-hour-per-connection limit refuses; the per-cycle count is logged only (§8.3 step 8) | **Decided by Jeffrey 2026-10-19: no hard cap** (log only); the database size is watched by the CP3 / CP5 size check |
| **OI-8** (for Jeffrey) | **Delete permanently on a candidate with no payments also deletes their online-signed waiver** (signature, signer, version). Meant for fake and test registrations (v0.212, CP6). Confirm, or keep the waiver row (signature removed) as a record? | **Delete it** (fake registrations aren't records; a real family is withdrawn, which keeps everything) |

---

## 15. Function list (for C4 and the fingerprints)

**Staff writes (19, `authenticated`):** `bb_save_waiver`, `bb_set_keep_years`, `bb_add_cycle`, `bb_update_cycle`, `bb_set_registration`, `bb_delete_cycle`, `bb_add_candidate`, `bb_update_candidate`, `bb_change_plan`, `bb_resolve_duplicate`, `bb_withdraw_candidate`, `bb_restore_candidate`, `bb_delete_candidate`, `bb_record_paper_waiver`, `bb_record_payment`, `bb_undo_payment`, `bb_edit_payment`, `bb_record_refund`, `bb_mark_check_returned`.
**Staff reads (6, `authenticated`):** `bb_cycle_defaults`, `bb_cycles_list` (volatile, purges), `bb_cycle_roster` (volatile, purges), `bb_candidate_detail`, `bb_view_signature`, `bb_receipt`.
**Public (2, `bb_registrar` only):** `bb_public_cycle`, `bb_public_register`.
**Internal (no grants):** `bb_public_register_core` and the helpers and trigger functions of §6.7 and §2.11.
The builder's C4 list is exactly these names.
