# Contract 0013 — Camps: camps, templates, family sign-up form, check-in, payments

The single source of truth for the four parallel builders: **A database**, **B public path**, **C data layer + preview mock**, **D staff screens**. Follow it exactly so the parts fit. It implements the approved build plan; it does not re-decide it. If something here is impossible or contradicts the sources below, **stop and report it** — do not improvise.

| Source (in this order of authority) | |
|---|---|
| This contract | wins for Camps |
| Build plan `docs/Camps/TKD-Camps-Build-Plan.md` (§10 answers, §12 review fixes, §13 answers applied) | OK'd by Jeffrey 2026-10-19 (CP0) |
| Status file `docs/Camps/TKD-Camps-Status.md` — decisions 1–7, screen approvals, "Build plan questions" 1–13, the precedent line, "Additions approved", "Check-in and roster layout" | |
| Approved mockups (wording and layout source): `docs/Camps/TKD-Camps-Mockups.html` (C1, C2, C2b, C3, C4, **C4b**, C5, C6, C7a–d, incl. every "New (2026-10-19)" note), images `docs/Camps/Mockup images/`, and **`docs/Camps/Decision images/Camps-roster-layout-options.html` option A** (the camp page's three tabs — **replaces the C4 roster layout**: day filter row, four summary cards and the single list), `Camps-attendance-roster.html` (the week-grid symbols and "Came X of Y") | approved 2026-10-18 / 2026-10-19 |
| Rulebook `docs/Dashboard Docs/TKD-Dashboard-Design-Guidelines.md` — 10b rows v0.229–v0.237 and **v0.700–v0.704** (newest wins), §2.4 icons, §5 privacy | |
| Handoff `docs/Dashboard Docs/TKD-Dashboard-Handoff.md` §6 (security rules, non-negotiable) | |
| Existing code: migrations 0001–0006 and 0010 (**live in production — never edit**), CONTRACT-0005 (pattern for everything public), CONTRACT-0006 (Star: own registrar, shared attempts ledger, no purge in the public function), CONTRACT-0010, `src/` | |

**Working copy:** the Camps worktree `.claude/worktrees/camp-event-creator-templates-83eafe`, branch `camps`. Do not touch Supabase (no connector calls), Cloudflare, git remotes, other worktrees or the main folder. Do not commit; the orchestrator commits.
**Audience:** Jeffrey is learning IT — every new file starts with a header comment (what + why); short plain-English comments on non-obvious lines; readable over clever. Files keep the line endings of their neighbours (CRLF in this repo — check before and after).
**Production facts:** Supabase project `tkd-dashboard` (ref `eozkfbdfxqlcbpewhach`), PostgreSQL 17, Free plan. Live: 0001–0006, 0010. Claimed elsewhere: 0007 Schedule, 0008 Calendar, 0009 Forms, 0011 Finance, 0012 Prospects → this one is **0013**. Staff: Main Admin (admin), Staff (shared desk, role staff). A push to `main` deploys `tkd-dashboard.pages.dev`.

**Words used below.** *Admin* = `public.is_admin()` (always after `has_data_access()`). *Staff* = any signed-in user with data access (incl. admins). *Today* = `public.testing_today()` (America/New_York). *First day / last day* = the earliest / latest `camp_days.day` of the camp. *Camp week* = first day ≤ today ≤ last day. *Active* = camper `status = 'active'`. *All days* = the camper has every day of the camp.

---

## 0. File ownership (no two builders edit the same file)

| Builder | Owns (creates / edits) | Must not edit |
|---|---|---|
| **A — database** | new `supabase/migrations/0013_camps.sql` · new `supabase/tests/0013_tests.sql` · new `supabase/tests/0013_fingerprints.sql` · `supabase/tests/pglite/run.mjs` (new step function **`stepCamps`** only, §2.2) · `supabase/SETUP.md` (new section "Migration 0013: Camps" only, §3) | every other migration and test file, `src/`, `functions/`, `docs/` |
| **B — public path** | new `functions/api/camp/[code].js` · new `functions/_lib/camp.js` · new `functions/_lib/campDb.js` · `functions/_lib/turnstile.js` (**optional `expectedAction` argument only**, §4.4) · new `functions/tests/camp.test.mjs` · `functions/tests/index.js` (**one line**: `import './camp.test.mjs';`) · new `camp.html` · new `src/camp/**` · `src/register/turnstile.js` (**optional `action` argument only**) · new `src/styles/camp.css` · `public/_redirects` · `public/_headers` · `vite.config.js` (third entry + `/camp/*` rewrite) | `functions/_lib/register.js`, `db.js`, `http.js`, `clientKey.js`, `rateLimit.js` (reuse unchanged), `src/register/**` except `turnstile.js`, `src/screens/**`, `src/lib/**` (imports C's modules) |
| **C — data layer + mock** | new `src/lib/camps/campRules.js` · `campsApi.js` · `qr.js` · `checks.mjs` · `publicApi.preview.js` · new `src/lib/mockCamps.js` · `src/lib/mockClient.js` (**shared** — plug in the camps backend, its table reads and console helpers only) | UI, styles, `supabase/`, `functions/`, `src/camp/**` |
| **D — staff screens** | new `src/screens/Camps.jsx` · new `src/screens/camps/**` · new `src/styles/camps.css` · `src/App.jsx` (**shared** — routes and the Camps dialog flag only, §6.1) · `src/components/navItems.js` (**shared** — one line) · `src/lib/pageAddress.js` (**shared** — the `camps` hash) · `README.md` (Camps paragraph) | files of A–C, `src/screens/Testing.jsx`, `src/screens/testing/**`, `src/components/**` except `navItems.js`, `src/styles/tokens.css` (if a token seems missing, stop and report), Settings |
| Orchestrator | this contract, rulebook, status file, handoff, `docs/*`, commits | |

C returns codes, never words; B (family page) and D (staff) own all wording. B and D import C's modules by the exact names in §5.
**Shared files touched:** `src/App.jsx`, `src/components/navItems.js`, `src/lib/pageAddress.js`, `src/lib/mockClient.js`, `vite.config.js`, `public/_headers`, `public/_redirects`, `functions/_lib/turnstile.js`, `src/register/turnstile.js`, `functions/tests/index.js`, `supabase/tests/pglite/run.mjs`, `supabase/SETUP.md`, `README.md`. Not touched: `src/styles/tokens.css`, `src/screens/Testing.jsx`, `public/_routes.json`, `package.json` (no new dependency).

---

## 1. Database — `0013_camps.sql` (Builder A)

### 1.1 General rules (same as CONTRACT-0005 §1.1 — repeated because they are non-negotiable)
- Schema `public`; owner `postgres` (the same owner as the 0005 tables — tested). **One transaction**. Header comment in 0005's style (what / why / what it adds / how to run / "Supabase will warn about destructive operations…" / words used / statuses).
- **Re-runnable:** `create table if not exists`, `create or replace function / view`, `drop trigger if exists` + create, `drop policy if exists` + create, `revoke all` then grants, the role created only if missing. Applying twice changes no row and no fingerprint (tested).
- Changes **nothing** made by 0001–0012. Depends only on 0003 + 0005.
- Every function: `set search_path = ''`, fully qualified names, no argument defaults, `revoke execute … from public, anon, authenticated, service_role`, then only the grants of §1.17.
- Staff write functions: `security definer`, `volatile`, `returns jsonb`, check order **has_data_access → role → argument shape → lock + look up (`not_found`) → stale → data rules → write**; the body inside 0005's `begin … exception … end` with 0005's mapping (`unique_violation` → `stale` except where `duplicate_name` is named; `foreign_key_violation`, `check_violation`, `not_null_violation`, **`data_exception`** → `invalid`; `deadlock_detected`, `serialization_failure`, `lock_not_available` → `stale`). Tag writes with `tkd.action` (always starting `camp_`, = the function name) + `tkd.batch_id`, clear both before returning.
- **Lock order:** camp (`for no key update` for camper writes, `for update` for camp writes) → sign-up → camper (`for update`) → payments / day rows. No `locations` lock (Camps has no per-school rule).
- **Time:** only `public.testing_today()` and `public.testing_school_date(ts)`.
- **Reused live helpers** (called from definer functions, never granted): `testing_today`, `testing_school_date`, `testing_normalize_name`, `testing_name_is_valid`, `testing_line_is_valid`, `testing_normalize_note`, `testing_cents_is_valid`, `testing_signature_is_valid`, `testing_new_public_code`, `testing_location_address`, `change_log_write`, `change_log_actor_name`, `testing_refuse_truncate`, `has_data_access`, `is_admin`.
- **`uuid[]` arguments** (`p_day_ids`, `p_expected_payment_ids`) are checked with 0003's `testing_ids_are_valid` (one dimension, no nulls, no repeats); `date[]` (`p_days`) with the same rules in `camp_days_arg_is_valid`.
- **New helpers** (granted to nobody): `camp_text_is_valid(p_text text, p_max integer)` (0005's `testing_note_is_valid` rule with its own cap), `camp_days_arg_is_valid(p_days date[])` (1–10, no nulls, no repeats), `camp_uuid_text_is_valid(p_text text)` (for uuid **strings inside jsonb**) (`^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$`, case-insensitive), `camp_int_text_is_valid(p_json jsonb, p_min, p_max)` (`jsonb_typeof = 'number'`, text matches `^-?\d{1,6}$`, then range), `camp_prices_arg_is_valid(p_prices jsonb, p_day_count integer)`, `camp_extras_arg_is_valid(p_extras jsonb, p_with_ids boolean)`, `camp_children_arg_is_valid(p_children jsonb)`, `camp_camper_extras_arg_is_valid(p_extras jsonb)`, `camp_template_setup_is_valid(p_day_count, p_prices, p_extras)`. **Every jsonb argument is checked with `jsonb_typeof` and patterns before any cast** — bad input gives `false`, never an error.
- **Connector words:** `0013_fingerprints.sql` must not contain the words the Supabase connector refuses (spell names in pieces as `0005_fingerprints.sql` does).
- **Statuses:** `ok, no_access, not_allowed, not_found, stale, duplicate_name, invalid, not_empty, finished, already_paid, withdrawn, checked_in, future_day, rate_limited, not_open, closed, price_changed, camp_changed`.

### 1.2 `public.camps`
| Column | Rule |
|---|---|
| `id uuid pk default gen_random_uuid()` | |
| `location_code text not null` | FK → `locations(code)`; the **held-at** school (v0.234); an admin may change it later in Edit camp (a correction) |
| `both_schools boolean not null default false` | changeable by an admin in Edit camp |
| `name text not null` | `testing_name_is_valid(name)` and `name = testing_normalize_name(name)`; names may repeat |
| `start_time time not null`, `end_time time not null` | `end_time > start_time`; both on a 5-minute step, seconds 0 |
| `signup_opens_on date not null`, `signup_closes_on date not null`, `early_until date not null` | check `signup_opens_on <= signup_closes_on` and `early_until <= signup_closes_on`; `signup_closes_on <= last day` checked in the functions |
| `closed_by_hand boolean not null default false` | |
| `min_age smallint not null default 3`, `max_age smallint not null default 17` | each 1–99; `min_age <= max_age` (v0.703) |
| `description text null` | `camp_text_is_valid(description, 2000)` |
| `waiver_text text not null` | `camp_text_is_valid(waiver_text, 8000)` |
| `public_code text not null unique` | `^[a-hjkmnp-z2-9]{8}$`, from `testing_new_public_code()`, never changes (trigger) |
| `version integer not null default 1`, `created_at`, `created_by uuid null`, `created_by_name text not null`, `updated_at`, `updated_by uuid null`, `updated_by_name text not null` | kept by `camps_before_write` (0003 pattern). **Every change bumps the version, including `closed_by_hand`; the signature purge never does** (it doesn't touch `camps`). `public_code` and `id` can never change (the trigger refuses). |

### 1.3 `public.camp_days`
`id uuid pk` · `camp_id uuid not null` FK → camps **on delete cascade** · `day date not null` · unique `(camp_id, day)`. 1–10 rows per camp (functions).

### 1.4 `public.camp_prices`
`id uuid pk` · `camp_id` FK cascade · `day_count smallint not null` (1–10) · `member_early_cents`, `member_regular_cents`, `nonmember_early_cents`, `nonmember_regular_cents integer not null` (each `testing_cents_is_valid`) · unique `(camp_id, day_count)`. Exactly one row per day count 1…N (N = number of camp days) — functions.

### 1.5 `public.camp_extras`
`id uuid pk` · `camp_id` FK cascade · `name text not null` (`testing_line_is_valid(name, 60)`, normalized) · `price_cents integer not null` (`testing_cents_is_valid`) · `per text not null` (`once` | `day`) · `not_for_all_days boolean not null default false` · `sort smallint not null` · unique index `(camp_id, lower(name))`. 0–10 per camp.

### 1.6 `public.camp_templates`
| Column | Rule |
|---|---|
| `id uuid pk`, common columns as camps | |
| `name text not null` | name rule; unique index on `lower(testing_normalize_name(name))` → `duplicate_name` |
| `location_code text not null` FK, `both_schools boolean not null` | |
| `day_count smallint not null` | 1–10 |
| `start_time`, `end_time` | as camps |
| `opens_days_before`, `closes_days_before`, `early_days_before smallint not null` | each −365…365 (negative = after the first day); `opens_days_before >= closes_days_before`, `early_days_before >= closes_days_before` — named check `camp_templates_offsets_check`; the functions test the same rule first and answer `{status:'invalid', field:'offsets'}` |
| `min_age`, `max_age smallint not null` | as camps |
| `description`, `waiver_text` | as camps |
| `prices jsonb not null`, `extras jsonb not null` | check `camp_template_setup_is_valid(day_count, prices, extras)` |

**jsonb shapes (also the shapes of the `p_prices` / `p_extras` arguments in §1.14):**
```
prices = [ { "day_count": 1, "member_early_cents": 7500, "member_regular_cents": 8000,
             "nonmember_early_cents": 8500, "nonmember_regular_cents": 9000 }, … ]
         exactly one object per day_count 1…N (any order), only these 5 keys, whole numbers, each price testing_cents_is_valid
extras = [ { "name": "Early drop-off, 7:30–9:00 AM", "price_cents": 1500, "per": "day", "not_for_all_days": false }, … ]
         0–10 objects, only these 4 keys (+ "id": "<uuid>"|null in p_extras of camp_update_camp), names unique ignoring case;
         the array position is the extra's `sort` (0, 1, 2 …) — there is no sort key
```

### 1.7 `public.camp_signups`
| Column | Rule |
|---|---|
| `id uuid pk` · `camp_id uuid not null` FK cascade | |
| `reference text not null unique` | default `'CP-' \|\| nextval('public.camp_signup_ref_seq')`, sequence starts at 4001 |
| `submission_id uuid not null unique` | |
| `parent_name`, `emergency_name text not null` | name rule (≤ 60), normalized |
| `parent_relation`, `emergency_relation text not null` | `testing_line_is_valid(…, 40)`, normalized |
| `parent_phone`, `emergency_phone text not null` | `^\d{10}$` |
| `price_kind text not null` | `early` \| `regular` — fixed at sign-up, never changed |
| `signed_up_on date not null` | `testing_school_date(created_at)` at insert |
| `signature text null` | null or `testing_signature_is_valid(signature)` — **never granted to any client role** |
| `signed_at timestamptz not null`, `signature_deleted_at timestamptz null` | |
| `waiver_text_signed text not null` | copy of `camps.waiver_text` at sign-up — not granted |
| `ack_version text not null` | `camp-2026-10-18` |
| common columns | the before-write trigger **does not bump `version` / `updated_*` for a signature-only change** (the purge) |

### 1.8 `public.camp_campers`
| Column | Rule |
|---|---|
| `id uuid pk` · `signup_id uuid not null` FK cascade · `camp_id uuid not null` FK cascade | trigger: `camp_id` = the sign-up's camp; neither changes |
| `position smallint not null` | 1–3, unique `(signup_id, position)` |
| `first_name`, `last_name text not null` | name rule, normalized |
| `age smallint not null` | 1–99 (the camp's range is checked by the public function only) |
| `member boolean not null` | |
| `paying_by text not null` | `cash` \| `check` \| `card` |
| `base_cents integer not null` | 0–200 000 |
| `status text not null default 'active'` | `active` \| `withdrawn` |
| `withdrawn_reason text null` | `withdrawn` \| `duplicate_copy`; null exactly when active (check) |
| `withdrawn_at timestamptz null`, `withdrawn_by uuid null` (never granted), `withdrawn_by_name text null` | |
| `duplicate_state text not null default 'none'` | `none` \| `possible` \| `kept_both` |
| `duplicate_of uuid null` | FK → `camp_campers(id)` **on delete set null** |
| common columns | |
Index `(camp_id, lower(last_name), lower(first_name))`.

### 1.9 `public.camp_camper_days` (one row per camper per day; check-in, v0.704)
`id uuid pk default gen_random_uuid()` · `camper_id uuid not null` FK → camp_campers **on delete cascade** · `day_id uuid not null` FK → camp_days (**default `no action`**) · `checked_in_at timestamptz null` · `checked_in_by uuid null` (never granted) · `checked_in_by_name text null` · check `(checked_in_at is null) = (checked_in_by_name is null)` · unique `(camper_id, day_id)`. The day belongs to the camper's camp (trigger).

### 1.10 `public.camp_camper_extras`
`id uuid pk default gen_random_uuid()` · `camper_id` FK cascade · `extra_id uuid not null` FK → camp_extras (**no action**) · `day_id uuid null` FK → camp_days (**no action**) · `price_cents integer not null` (`testing_cents_is_valid`) · `unique nulls not distinct (camper_id, extra_id, day_id)`. Rules (functions + trigger where it can): `once` extra → exactly one row with `day_id` null; `day` extra → 1+ rows, each `day_id` one of the camper's days; extra and day belong to the camper's camp; a `not_for_all_days` extra is not allowed for an all-days camper.

### 1.11 `public.camp_payments` (append-only, copy of 0005 §6)
`id uuid pk` · `camper_id uuid not null` FK cascade · `kind` (`payment` \| `reversal`) · `amount_cents` (payment 1…200 000 and no `reverses_payment_id`; reversal −200 000…−1 with one) · `method` (`cash` \| `check` \| `card`) · `paid_on date not null` · `recorded_at timestamptz not null default now()` · `recorded_by uuid null` (never granted) · `recorded_by_name text not null` · `reverses_payment_id uuid null unique` FK → camp_payments. Trigger `camp_payments_guard`: UPDATE refused; DELETE refused unless `current_setting('tkd.action', true) in ('camp_delete_camper', 'camp_delete_camp')`.

### 1.12 Rate-limit ledger — Camps' own `public.camp_public_attempts`
Same columns as 0005's `testing_public_attempts`: `id bigint generated always as identity` pk · `client_key text not null` (the Function's HMAC — never a raw IP) · `camp_id uuid null` (no FK: the attempt outlives a deleted camp) · `at timestamptz not null default now()` · `outcome text not null` (the status answered). Indexes `(client_key, at)`, `(camp_id, at)`, `(at)`. **RLS on, no policy, no grant to any role** (not authenticated, not `camps_registrar`); not logged (bigint id); no truncate guard (as 0005). **Camps never writes into `testing_public_attempts`.** Limit: ≥ 30 rows for this client key in the last hour → `rate_limited` (v0.700; failed tries count). ≥ 200 rows for this camp in the last hour → `raise log` only. Rows older than 2 days are deleted by the `camp_public_signup` wrapper (as 0005).

### 1.13 Derived rules (one SQL function each, mirrored exactly by `campRules.js`, tested on the same case table)
- `camp_first_day(camp_id)`, `camp_last_day(camp_id)`, `camp_day_count(camp_id)`.
- **`camp_signup_state(p_camp_id uuid, p_today date)`**, in this order: `finished` (today > last day) → `closed` (closed_by_hand or today > signup_closes_on) → `not_open_yet` (today < signup_opens_on) → `open`.
- **Price kind** at sign-up: `early` when `signed_up_on <= early_until`, else `regular`.
- **`camp_base_cents(camp_id, day_count, member, price_kind)`** = the grid cell.
- **`camp_camper_total_cents(camper_id)`** = `base_cents` + sum of the camper's extra rows; **`camp_camper_paid_cents(camper_id)`** = sum of payment rows; owes = total − paid.
- **List tag** (screens, `campRules.campTag`), first match wins: today > last day → **Done** · today is one of the camp's days → **Camp today** (a day between camp days, e.g. Thu between Wed and Fri, falls through to the next lines) · state `open` → **Open until <signup_closes_on>** · `not_open_yet` → **Not open yet** · `closed` → **Closed**.
- **Pay tag** (screens): `possible` duplicate → Possible duplicate · paid > 0 and owes > 0 → Owes $X · owes ≤ 0 → Paid · else Not paid (v0.702 priority).
- **Re-price rule** (v0.700, literally): a camper's prices are written at sign-up and **never changed by a price edit on the camp**. **Any** change to that camper's own days, member box or extras in Edit details re-prices the **whole camper** at the camp's **current** prices (base from the current grid for the new day count and member box, every extra row at the extra's current price), using the sign-up's fixed `price_kind`. A change to only names, age or family fields re-prices nothing.
- **Possible duplicate** (`camp_find_duplicate(camp_id, exclude_id, first, last)`): another **active** camper at the same camp with the same normalized first + last name (case-insensitive), oldest wins, not a pair already `kept_both`. Recomputed on public insert, on a name change in Edit details and on Restore; the newer one gets `possible` + `duplicate_of`; when the pointed-at camper is withdrawn or deleted, the remaining one goes back to `none` (0005 rules).
- **Check-in day rule**: day > today → `future_day`; day = today → staff; day < today → admin (`not_allowed` for staff).

### 1.14 Staff functions (authenticated; `has_data_access()` first)
**A** = admin only, **S** = staff and admins. Every answer is jsonb `{status, …}`; besides the listed ones, every function can answer `no_access`, `invalid`, `stale` (and `not_found` where it takes an id).

| Function | Role | Rules | Ok answer |
|---|---|---|---|
| `camp_add_camp(p_location_code text, p_both_schools boolean, p_name text, p_days date[], p_start_time time, p_end_time time, p_signup_opens_on date, p_signup_closes_on date, p_early_until date, p_min_age integer, p_max_age integer, p_prices jsonb, p_extras jsonb, p_description text, p_waiver_text text)` | A (`not_allowed`) | 1–10 distinct days, all ≥ today; grid exactly 1…N; `signup_closes_on <= last day`; makes `public_code`; last step `camp_purge_old_signatures()` | `{status, id, public_code, version}` |
| `camp_update_camp(p_camp_id uuid, p_expected_version integer, p_location_code text, p_both_schools boolean, p_name text, p_days date[], p_start_time time, p_end_time time, p_signup_opens_on date, p_signup_closes_on date, p_early_until date, p_min_age integer, p_max_age integer, p_prices jsonb, p_extras jsonb, p_description text, p_waiver_text text)` (`p_extras` objects may carry `"id"`) | A | held at / both schools may change (a correction); `public_code` never changes; added days ≥ today (kept past days are fine); `signup_closes_on <= last day`. **Removing a day:** if any **active** camper picked it → `{status:'not_empty', kind:'day', day, first_name, last_name, more}` (v0.701; `more` = other active campers); otherwise the day's rows of **withdrawn** campers (their `camp_camper_days` row and their per-day extra rows for that day) are deleted first (logged, action `camp_update_camp`), then the day. **Removing an extra:** any active camper chose it → `{status:'not_empty', kind:'extra', extra_name, count}`; otherwise withdrawn campers' rows for it are deleted, then the extra. Extras with `id` are updated in place (name, price, per, not_for_all_days, sort = array position), new ones inserted. Grid replaced. Existing campers' prices untouched. | `{status, version}` |
| `camp_set_signup(p_camp_id uuid, p_expected_version integer, p_open boolean)` | S / A (rule) | `finished` → `finished`. Close (`false`): sets `closed_by_hand`. Reopen (`true`): clears `closed_by_hand`; if today > `signup_closes_on`: staff → `not_allowed`, admin → also sets `signup_closes_on = last day` (Star v0.86: admins can reopen any time before the end) | `{status, version, state}` |
| `camp_delete_camp(p_camp_id uuid, p_expected_version integer, p_expected_camper_count integer, p_expected_payment_total_cents integer)` | A | count = **all** campers incl. withdrawn; total = net of reversals; either differs → `stale`; action `camp_delete_camp` | `{status}` |
| `camp_save_template(p_camp_id uuid, p_name text)` | A | copies everything except dates and campers; offsets = first day − date; `duplicate_name` | `{status, id, version}` |
| `camp_update_template(p_template_id uuid, p_expected_version integer, p_name text, p_location_code text, p_both_schools boolean, p_day_count integer, p_start_time time, p_end_time time, p_opens_days_before integer, p_closes_days_before integer, p_early_days_before integer, p_min_age integer, p_max_age integer, p_prices jsonb, p_extras jsonb, p_description text, p_waiver_text text)` | A | `duplicate_name` | `{status, version}` |
| `camp_delete_template(p_template_id uuid, p_expected_version integer)` | A | never touches camps | `{status}` |
| `camp_update_details(p_camper_id uuid, p_camper_version integer, p_signup_version integer, p_first text, p_last text, p_age integer, p_member boolean, p_day_ids uuid[], p_extras jsonb, p_parent_name text, p_parent_phone text, p_parent_relation text, p_emergency_name text, p_emergency_phone text, p_emergency_relation text)` — `p_extras = [{"extra_id": "<uuid>", "day_ids": ["<uuid>", …]}]` (`[]` for a once extra) | S | `withdrawn`; day rows **diffed** (kept rows keep their check-in); removing a day that has `checked_in_at` → `{status:'checked_in', day}`; re-price rule §1.13; a not-for-all-days extra sent for an all-days camper → `invalid` (the screen removes it before sending); total > 200 000 → `invalid`; duplicate recheck on a name change; allowed in every state incl. `finished` | `{status, camper_version, signup_version, total_cents, owes_cents}` |
| `camp_change_paying_by(p_camper_id uuid, p_expected_version integer, p_paying_by text)` | S | `withdrawn`; owes ≤ 0 → `already_paid` | `{status, version}` |
| `camp_mark_paid(p_camper_id uuid, p_expected_version integer)` | S | locks camper `for update`; `withdrawn`; owes ≤ 0 → `already_paid`; amount = owes, method = `paying_by`, `paid_on` = today; bumps the camper's version; last step `camp_purge_old_signatures()` | `{status, payment_id, amount_cents, method, version}` |
| `camp_undo_payment(p_payment_id uuid)` | A (the ⋯ → Undo payment item). The only staff case is the Mark paid toast's Undo: `recorded_by = auth.uid()` and `recorded_at > now() - interval '10 seconds'` (0005 rule); otherwise staff → `not_allowed` | reversal row; already reversed / is a reversal → `stale`; bumps the camper's version | `{status, version}` |
| `camp_edit_payment(p_payment_id uuid, p_method text, p_amount_cents integer, p_paid_on date)` | A | reversal + new payment (1…200 000, `paid_on <= today`); already reversed → `stale` | `{status, payment_id, version}` |
| `camp_resolve_duplicate(p_keep_id uuid, p_keep_version integer, p_other_id uuid, p_other_version integer, p_keep_both boolean)` | S; keep-one after the last day → A (`not_allowed`, Color Belt v0.194) | same camp, the pair is flagged; keep both → both `kept_both`; keep one → other `withdrawn` / `duplicate_copy` with `withdrawn_by = auth.uid()` (payments stay on it), kept one → `none` | `{status, keep_version, other_version}` |
| `camp_withdraw_camper(p_camper_id uuid, p_expected_version integer)` | **S** (v0.700: staff Withdraw) | reason `withdrawn`; payments kept; duplicate pointers fixed | `{status, version}` |
| `camp_restore_camper(p_camper_id uuid, p_expected_version integer)` | **S** for an ordinary withdrawal (reversible); for a `duplicate_copy`: A, or S only if `withdrawn_by = auth.uid()` and `withdrawn_at > now() - 10 s` (C4b "admins can Restore", CONTRACT-0005 §10) | duplicate recheck | `{status, version}` |
| `camp_delete_camper(p_camper_id uuid, p_expected_version integer, p_expected_payment_ids uuid[])` | A | payment ids differ → `stale`; payments cascade; the sign-up's last camper also removes the sign-up; action `camp_delete_camper` | `{status}` |
| `camp_check_in(p_camper_id uuid, p_day_id uuid)` | S today / A earlier days | `withdrawn`; the day isn't one of the camper's → `not_found`; day rule §1.13; already checked in → ok with the stored values and `already: true`; does **not** bump the camper's version | `{status, checked_in_at, checked_in_by_name, already}` |
| `camp_undo_check_in(p_camper_id uuid, p_day_id uuid)` | same day rule as check-in | clears the three columns; not checked in → `ok` (nothing to do) | `{status}` |

### 1.15 Reads
- **Column `select`** to authenticated (RLS `has_data_access()`): `camps` (all but `created_by`, `updated_by`), `camp_days`, `camp_prices`, `camp_extras`, `camp_templates` (all but `created_by`, `updated_by`).
- **View `public.camp_roster`** (`with (security_invoker = true)`), one row per camper: `id, camp_id, signup_id, position, first_name, last_name, age, member, paying_by, status, withdrawn_reason, withdrawn_at, withdrawn_by_name, duplicate_state, duplicate_of, version, created_at, signup_version, reference, price_kind, signed_up_on, signed` (`= signed_at is not null` — the view never names `signature`), `signature_deleted_at, base_cents, days` (jsonb `[{day_id, day, checked_in_at, checked_in_by_name}]` ordered by day), `extras` (jsonb `[{extra_id, name, per, day_id, day, price_cents}]` ordered by the extra's `sort`, then day), `total_cents, paid_cents, owes_cents`, and the last-payment columns **exactly as 0005's `testing_roster`** (same names and the same lateral "latest payment row" query): `paid_on, paid_method, last_payment_id, last_payment_recorded_at`. Authenticated gets column grants on exactly the columns the view reads: `camp_campers` (all but `withdrawn_by`, `created_by`, `updated_by`), `camp_signups` (`id, camp_id, reference, price_kind, signed_up_on, signed_at, signature_deleted_at, version`), `camp_camper_days` (`id, camper_id, day_id, checked_in_at, checked_in_by_name`), `camp_camper_extras` (all), `camp_payments` (all but `recorded_by`), `camp_days`, `camp_extras`. **No grant on phones, relationships, names of the parent / contact, `signature`, `waiver_text_signed`, `submission_id`.**
- **`camp_camper_detail(p_camper_id uuid) returns jsonb`** — security definer, `stable`, S: `{status:'ok', camper:{…the roster row…}, family:{parent_name, parent_phone, parent_relation, emergency_name, emergency_phone, emergency_relation}, breakdown:{day_count, price_kind, member, base_cents, extras:[{name, per, days:[date], cents}], total_cents, paid_cents, owes_cents}, payments:[{id, kind, amount_cents, method, paid_on, recorded_at, recorded_by_name, reverses_payment_id}], checkins:[{day, checked_in_at, checked_in_by_name}]}` or `no_access` / `not_found`. The **only** way the app sees phones (v0.700: staff and admins).

### 1.16 Public functions (role `camps_registrar` only)
**`camp_public_camp(p_code text) returns jsonb`** (`stable security definer`):
```
{ "status": "ok", "state": "open" | "not_open_yet" | "closed" | "finished",
  "opens_on": "2027-03-01", "closed_on": "2027-04-18" | null,   -- null when closed by hand
  "price_kind_today": "early" | "regular", "ack_version": "camp-2026-10-18",
  "waiver_version": "<md5(waiver_text), 32 hex characters>",
  "camp": { "name", "days": [{"day_id", "day"}], "start_time": "09:00", "end_time": "15:00",
            "both_schools", "school_name", "address": {street, city, state, zip} | null,
            "description", "waiver_text", "early_until", "signup_closes_on",
            "min_age", "max_age",
            "prices": [ …the grid, 4 prices per day_count… ],
            "extras": [ {"extra_id", "name", "price_cents", "per", "not_for_all_days"} ] } }
or { "status": "not_found" }
```
Nothing else: no counts, no campers, no other camps. A code not matching `^[a-hjkmnp-z2-9]{8}$` → `not_found` without a query.

**`camp_public_signup(p_code text, p_client_key text, p_submission_id uuid, p_children jsonb, p_parent_name text, p_parent_phone text, p_parent_relation text, p_emergency_name text, p_emergency_phone text, p_emergency_relation text, p_paying_by text, p_acknowledged boolean, p_signature text, p_ack_version text, p_waiver_version text, p_expected_total_cents integer) returns jsonb`** — wrapper (`volatile security definer`) + internal core `camp_public_signup_core(…same…)` (no grant):
```
p_children = [ { "first_name": "Mia", "last_name": "Rossi", "age": 9, "member": false,
                 "day_ids": ["<uuid>", "<uuid>"],
                 "extras": [ {"extra_id": "<uuid>", "day_ids": ["<uuid>", "<uuid>"]},      -- per-day extra
                             {"extra_id": "<uuid>", "day_ids": []} ] } ]                   -- once extra
1–3 objects; only these keys; strings are strings; age a whole number; member a boolean;
day_ids 1–10 uuid strings, no repeats; extras 0–10, extra_id uuid string, day_ids 0–10 uuid strings, no repeats
```
**Wrapper:** clear `request.jwt.claims` / `request.jwt.claim.sub`; delete `camp_public_attempts` rows older than 2 days; run the core in a block where `unique_violation, foreign_key_violation, check_violation, not_null_violation, data_exception, deadlock_detected, serialization_failure, lock_not_available` → `{status:'invalid'}` (everything the core did is undone); **then** insert this call's row into **`camp_public_attempts`** (`coalesce(left(p_client_key, 200), '')`, the camp id matched by code or null, the status) outside that block; return. **No signature purge.**
**Core, in this order:** 1 code → `not_found` · 2 `camp_children_arg_is_valid(p_children)` false → `invalid` (before any cast) · 3 same `submission_id` exists: same camp → the stored sign-up's ok answer; other camp → `invalid` · 4 lock the camp `for no key update`, read again · 5 state: `not_open_yet` → `{status:'not_open', opens_on}`; `closed` → `{status:'closed', closed_on}` (null when by hand); `finished` → `finished` · 6 other inputs → `invalid`: client key 1–200 characters; names, phones (`^\d{10}$`), relations (≤ 40); `p_paying_by` in cash/check/card; `p_acknowledged` true; `testing_signature_is_valid(p_signature)`; `p_ack_version = 'camp-2026-10-18'`; `p_waiver_version` 32 hex characters; `p_expected_total_cents` not null · 7 rate limit §1.12 → `rate_limited` · 8 **the camp changed while the family filled the form** → `{status:'camp_changed', camp: <the camp_public_camp answer>}` when: a day or extra id no longer belongs to this camp, a child's age is outside the camp's **current** `min_age`–`max_age`, or `p_waiver_version ≠ md5(waiver_text)` · 9 extra rules of §1.10 (per-day days ⊆ the child's days, once extras without days, not-for-all-days) → `invalid` · 10 price every child with `price_kind` of today; any child > 200 000 → `invalid`; family total ≠ `p_expected_total_cents` → `{status:'price_changed', new_total_cents, old_total_cents, camp: <the camp_public_camp answer>}` · 11 write (actor label `Family form`, action `camp_public_signup`): sign-up (with `waiver_text_signed`), campers (`paying_by` from the sign-up), day rows, extra rows with price snapshots, duplicate flags (silent); a concurrent duplicate `submission_id` caught on `camp_signups_submission_id_key` is re-selected and answered as step 3 · 12 ok answer:
```
{ "status": "ok", "reference": "CP-4821", "paying_by": "cash", "family_total_cents": 16600,
  "children": [ { "first_name", "last_name", "day_count", "days": ["2026-11-25", …], "price_kind",
                  "base_cents", "extras": [{"name", "per", "count", "cents"}], "total_cents" } ],
  "camp": { "name", "days": [...], "start_time", "end_time", "school_name", "both_schools",
            "address", "description" } }
```

### 1.17 Grants
RLS on every new table. `revoke all … from public, anon, authenticated, service_role` on every new table, the view and the sequence. Policies `for select to authenticated using ((select public.has_data_access()))` on every table the app or the view reads (all new tables except `camp_public_attempts`, which has RLS on, no policy and no grant — the security advisor's "RLS enabled, no policy" INFO for it is expected). Column `select` grants exactly as §1.15; `select` on `camp_roster` to authenticated. Execute: each §1.14 function and `camp_camper_detail` → authenticated only; the two §1.16 functions → `camps_registrar` only; every helper, trigger function and `camp_public_signup_core` → nobody.

### 1.18 The restricted login `camps_registrar`
As 0005 §13 / 0006 §17: `create role camps_registrar login noinherit nocreatedb nocreaterole nobypassrls noreplication connection limit 5` (only if missing; **no password in the file**); `alter role camps_registrar set statement_timeout = '5s'`, `set idle_in_transaction_session_timeout = '10s'`, `set search_path = ''`; `grant usage on schema public to camps_registrar`; execute on the two public functions; **nothing else**. Not a member of any role; `authenticator` can't become it. `testing_registrar`, `star_registrar` (and `forms_registrar` if present) can't run camp functions and `camps_registrar` can't run theirs.

### 1.19 Logging, purge, triggers
- `change_log_write` (0003) AFTER INSERT/UPDATE/DELETE on `camps`, `camp_days`, `camp_prices`, `camp_extras`, `camp_templates`, `camp_campers`, `camp_camper_days`, `camp_camper_extras`, `camp_payments`.
- `camp_signups_log` (own trigger, copy of 0005's `testing_registrations_log`): writes the same change_log row with `signature` replaced by `"on file"` / null and **without** `submission_id` and `waiver_text_signed`. Phones are logged as they are (v0.700). A test proves `change_log` never contains `data:image`.
- `testing_refuse_truncate` on every new table.
- **`camp_purge_old_signatures()`**: `signature = null, signature_deleted_at = now()` for sign-ups whose camp's last day `< testing_today() - interval '3 years'`, `for update skip locked`, action `camp_purge_old_signatures`, no version bump; called last in `camp_add_camp` and `camp_mark_paid` only.

### 1.20 The shared price case table (A tests it in SQL, C in `checks.mjs` — the same rows)
Camp "April Vacation Camp": 5 days Mon Apr 19 – Fri Apr 23 2027, early until Mon Apr 12 2027. Grid (member early / member regular / non-member early / non-member regular): 1 day $75 / $80 / $85 / $90 · 2 days $140 / $150 / $150 / $160 · 3 days $195 / $210 / $205 / $220 · 4 days $260 / $280 / $270 / $290 · 5 days $275 / $325 / $285 / $335. Extras: Early drop-off $15 per day · Late pick-up $8 per day · Pizza party (Fri) $5 once, not for all-days campers.

| # | Child | Days | Member | Kind | Extras | Expected total (cents) |
|---|---|---|---|---|---|---|
| P1 | Mia | Mon, Wed | no | early | pick-up Mon, Wed | 16600 ($150 + $16) |
| P2 | Ava | all 5 | yes | early | drop-off ×5, pick-up ×5 | 39000 ($275 + $75 + $40) |
| P3 | Ethan | Mon, Thu, Fri | yes | early | drop-off ×3, pizza | 24500 ($195 + $45 + $5) |
| P4 | Leo | all 5 | yes | early | drop-off ×5 | 35000 ($275 + $75); paid 33500 → owes 1500 (Owes $15) |
| P5 | Noah | Mon, Tue, Wed | yes | early | pick-up ×3 | 21900 ($195 + $24) |
| P6 | Liam | all 5 | yes | regular | none | 32500 |
| P7 | Sofia | Mon, Tue | no | regular | none | 16000 |
| P8 | Ava | all 5 | yes | early | pizza | **refused** (`invalid`: not for all-days campers) |
| P9 | Ava (paid 39000) | all 5 → pick-up only | yes | early | pick-up ×5 | 31500; paid 39000 → owes −7500 → Paid, "Paid $75 more than the total" |
| P10 | sign-up on Mon Apr 12 11:59:59 PM vs Tue Apr 13 12:00:00 AM (New York) | 1 day | yes | early vs regular | none | 7500 vs 8000 |

---

## 2. Database tests — `0013_tests.sql` + PGlite (Builder A; prints `ALL 0013 TESTS PASSED`)

### 2.1 What is tested
1. **Role gates** for every function: anon none; authenticated only §1.14 + `camp_camper_detail`; `camps_registrar` only §1.16; locked / PIN-locked / signed-out / magic-link / 8-day sessions → `no_access`; every A / S line, incl. the 10-second own-payment Undo, staff Restore of their own duplicate copy, staff Reopen after the closing date refused, keep-one after the last day.
2. **Registrar catalog proofs** (0005 T2a style): in `public`, `camps_registrar` executes exactly the two public functions; no table / view / sequence privilege anywhere except pg_catalog / information_schema; no CREATE on any schema; member of nothing; `pg_has_role('authenticator', 'camps_registrar', 'member')` false; attributes as §1.18; cross-checks with `testing_registrar` / `star_registrar`; function owner = table owner.
3. **Prices:** every row of the §1.20 case table; every day count × member × early / regular; grid with a missing / extra / duplicate row → `invalid`.
4. **Extras:** once, per day (days ⊆ camper days), not-for-all-days (P8); extras sort = array position.
5. **Re-price / Owes / overpaid:** grid or extra price edited after sign-ups → totals unchanged; then Edit details changing that camper's days, member box or extras → the **whole camper** at current prices with the sign-up's `price_kind`; name / age / family-only edit → no change; removed after paying → owes < 0 (P9); Mark paid = owes (P4); `already_paid`; double click → `stale`; total > $2,000 → `invalid` (sign-up and edit).
6. **Dates in America/New_York:** 11:59:59 PM vs 12:00:00 AM on `early_until`, `signup_opens_on`, `signup_closes_on`, the last day; `closed_by_hand`; `camp_set_signup` reopen rules; walk-in on a camp day.
7. **Check-in:** staff today ok / yesterday `not_allowed` / tomorrow `future_day`; admin yesterday ok, tomorrow `future_day`; withdrawn → `withdrawn`; a day the camper didn't pick → `not_found`; twice → `already`; undo; logged; camper version unchanged; Edit details removing a checked-in day → `checked_in`; the midnight boundary.
8. **Both-schools visibility (the location rule):** with camps held at Worcester, at Shrewsbury and a Both camp held at Worcester, the two queries C sends (§5.2: `location_code = X` and `both_schools = true`, merged) return exactly Worcester + Both for Worcester, Shrewsbury + Both for Shrewsbury; no filter returns all. Changing held at / both schools in `camp_update_camp` moves the camp between the lists.
9. **Payments append-only:** UPDATE refused; DELETE refused outside the two delete actions; reversal rules; edit = reversal + new; wrong expected ids / counts / totals → `stale`.
10. **Delete cascade:** delete a camp whose campers have days (some checked in), per-day and once extras, payments and a reversal → `ok`, zero camp rows, every removal logged; `camp_update_camp` removing a day an **active** camper picked → `not_empty` (kind day, name, more); a day picked **only by withdrawn** campers → removed, their day rows and per-day extra rows for it deleted and logged, the withdrawn campers still listed under Removed; the same two cases for an extra (kind extra).
11. **Public sign-up:** idempotent `submission_id`; every refusal status; **`camp_changed`** for a day / extra id of another camp or one removed meanwhile, an age outside the camp's current range, and a stale `waiver_version`; 4 children → `invalid`; `price_changed` with both totals (admin price edit, and the early → regular midnight switch); the 30-per-hour limit counts only `camp_public_attempts` (rows in `testing_public_attempts` don't count, and Camps writes none there); **bad jsonb — malformed uuid, age 9.5, age 1e9, age "9", member "yes", `day_ids` as a string / object, `extras` as an object, unknown keys, 11 day ids, repeated ids — each `invalid` AND one `camp_public_attempts` row**; a row also when the core fails a table rule; rows older than 2 days removed; authenticated and `camps_registrar` can't read the ledger.
12. **Possible duplicate:** second sign-up with the same child name → `possible` + `duplicate_of`; keep both; keep one (other → `duplicate_copy`, its payment stays); restore → recheck; withdrawing the original clears the flag.
13. **Signatures:** prefix / alphabet / 70 000 cap; purge at 3 years (no version bump) only from `camp_add_camp` / `camp_mark_paid`; `signature` and `waiver_text_signed` not readable by authenticated; `camp_roster.signed` from `signed_at`; `change_log` never contains `data:image`.
14. **Templates:** save (offsets, ages), `duplicate_name`, offsets outside −365…365 or in the wrong order → `invalid` (`field: 'offsets'`), bad jsonb shapes refused by the check, edit / delete never touch camps.
14a. **Roles of the roster actions:** staff can Withdraw and Restore an ordinary withdrawal; staff Restore of a duplicate copy only within 10 s of their own Keep this one; Delete permanently, Edit payment and ⋯ Undo payment admin only.
15. **change_log:** right `camp_…` action and actor ("Family form") per write; one batch id per call.
16. **Catalog:** RLS on all new tables; `search_path = ''` on all new functions; security definer only where listed; every logged table has a uuid `id`; no PUBLIC execute on any function of 0001–0013.

### 2.2 PGlite (`run.mjs`, step `stepCamps`)
After the existing steps: apply `0013_camps.sql` → run `0013_tests.sql` (it creates and cleans up its own camps) → apply 0013 again (re-run safety: no row or fingerprint changes) → `0013_tests.sql` again → `0005_tests.sql`, `0006_tests.sql`, `0010_tests.sql` again → print the `0013_fingerprints.sql` output → apply the "Undo 0013" script from SETUP and check no `camp_` object or `camps_registrar` is left and the earlier tests still pass. Counts printed as `N passed, 0 failed`.

---

## 3. SETUP.md — new section "Migration 0013: Camps" (Builder A)
Sub-steps, each "with Jeffrey's OK", nothing secret in chat, git or screenshots:
a. **CP2** Cloudflare: Production variable `CAMPS_REGISTRATION=off`.
b. **CP3** before applying: run the tests already live; Claude's read-only check that no `camp_` object / `camps_registrar` exists.
c. Apply 0013 in the SQL Editor (the destructive-operations warning is expected; why).
d. `camps_registrar` password as a SCRAM verifier made on Jeffrey's PC (copy of 13e with the role name `camps_registrar`, new password-manager entry "Supabase camps_registrar (Hyperdrive)", check the printed line names `camps_registrar`).
e. Read-only checks (fingerprints, earlier fingerprints unchanged, security advisor — expected notices listed).
f. Run `0013_tests.sql`, then the earlier tests (copy as UTF-8).
g. **CP4** Hyperdrive `tkd-camps-registrar` (session pooler, user `camps_registrar.eozkfbdfxqlcbpewhach`, caching **disabled**, verify-full with the existing Supabase CA, origin connection limit ≤ 5), binding `HYPERDRIVE_CAMPS`, Production only.
h. **CP5 test sign-up snippet** (SQL Editor, against the TEST camp; it calls the real function, never inserts directly):
```sql
-- 1. the TEST camp's days (copy the ids)
select d.id, d.day from public.camp_days d
  join public.camps c on c.id = d.camp_id
 where c.public_code = '<TEST camp code>' order by d.day;
-- 2. sign up two test children. Run once with 0 as the last value: the answer is
--    {"status":"price_changed","new_total_cents":…}. Run again with that number.
select public.camp_public_signup(
  '<TEST camp code>', 'cp5-test', gen_random_uuid(),
  '[{"first_name":"Test","last_name":"One","age":8,"member":true,"day_ids":["<day id>"],"extras":[]},
    {"first_name":"Test","last_name":"Two","age":10,"member":false,"day_ids":["<day id>"],"extras":[]}]'::jsonb,
  'Test Parent', '5085550100', 'Parent', 'Test Contact', '5085550101', 'Friend',
  'cash', true, 'data:image/png;base64,iVBORw0KGgo=', 'camp-2026-10-18',
  (select md5(c.waiver_text) from public.camps c where c.public_code = '<TEST camp code>'),
  0);
```
   A second run with `"Test","One"` again makes a possible duplicate. The attempt rows (in `camp_public_attempts`) count toward the `cp5-test` key only.
i. **CP6** after the deploy: live checks, `CAMPS_REGISTRATION=on` + Retry deployment, phone test, delete the TEST camp, read-only zero-rows check.
j. **Off switch** (fastest first): revoke execute on the two public functions from `camps_registrar` (exact lines) → `CAMPS_REGISTRATION=off` + redeploy → `alter role camps_registrar nologin`. Color Belt, Star and Forms are not affected.
k. **Undo 0013** (only before real camp data; tested in PGlite): revoke, drop view, functions, tables (incl. `camp_public_attempts`), sequence, role; `change_log` rows stay.

---

## 4. Public path (Builder B)

### 4.1 Route and page
`camp.html` (third Vite entry) + `src/camp/main.jsx`, `CampApp.jsx` (states), `StepDetails.jsx` (C7a: camp card, `ChildCard.jsx` ×1–3, `FamilyFields.jsx`, paying by), `StepCheck.jsx` (C7b: summary, waiver, tick, signature), `SignedUp.jsx` (C7c), `parts.jsx` (header "Camp sign-up", camp card, state message), `api.js`, `text.js`, `format.js` (camp-specific bits; dates / dollars / address from `src/register/format.js`). Imports from `src/register/`: `SignaturePad.jsx`, `turnstile.js`, `format.js`; styles `src/styles/register.css` + `src/styles/camp.css`. **No supabase-js, no dashboard code** except `src/lib/camps/campRules.js`, `src/lib/money.js`, `src/lib/testing/names.js`. Day chips use the dark outline (v0.237). `public/_redirects`: `/camp/*  /camp  200`. `vite.config.js`: `build.rollupOptions.input.camp = camp.html`; `optimizeDeps.entries` gains `'camp.html'`; the dev / preview rewrite also maps `/camp` and `/camp/*` to `/camp.html`. The code is read from `location.pathname`. **First thing after every answer, the page converts it to camelCase with the same mechanical rule as `campsApi.js` (§5.2)**, so `campRules.js` gets the shapes of §5.1.
**Page rules (from C7):** up to 3 children ("Add another child · Up to 3 children"); each child: first + last name, age (hint "Age on the first day of camp"; outside the range → "This camp is for ages 5 to 12."), member Yes / No ("Is Mia a U.S.T.C. member?"), days (chips), extras (per-day extras ask which days, starting with the child's days; a not-for-all-days extra is hidden when every day is chosen and dropped if it was ticked), running price per child; parent + emergency contact (name, phone, relationship); paying by Cash / Check / Card; Continue validates (amber messages under fields); step 2 shows each child's price (early / regular by today's Massachusetts date), extras, family total, waiver, tick "I am <first child>'s parent or guardian. I have read the waiver and agree to it.", signature; **Sign up** (full width on phones only); the page sends `expected_total_cents` = the total it showed and `waiver_version` from the GET answer. `price_changed` → back to step 2 with the new prices and the approved message. `camp_changed` → the page takes the fresh camp answer, drops choices that no longer exist, goes back to step 1 and shows "This camp was updated while you were filling in the form. Check your choices and sign again." Phones are typed freely and sent as 10 digits (a leading 1 dropped); fewer / more → field error.

### 4.2 `functions/api/camp/[code].js` + `functions/_lib/camp.js` + `functions/_lib/campDb.js`
Modelled line by line on `register.js` / `db.js` / `[code].js`:
Steps in **exactly `register.js`'s order**:
- `GET` → 1 kill switch / missing setting → `{status:'not_open'}` (no `opens_on`) · 2 bad code → `not_found` (no limiter, no database) · 3 per-client limiter → `rate_limited` · 4 `camp_public_camp(code)` · 5 answer reduced by the allowlist §4.6 + `turnstile_site_key`. `Cache-Control: no-store`.
- `POST` → 1 kill switch · 2 `Origin` = `PUBLIC_ORIGIN` · 3 `Content-Type: application/json` · 3a bad code → `not_found` · 4 limiter (also makes the client key) · 5 body ≤ 100 KB (before and while reading) · 5a field limits §4.3 → `bad_request` (HTTP 400) · 6 honeypot `website` empty · 7 `sent_at − started_at ≥ 4000` · 8 Turnstile siteverify with `expectedAction: 'camp_signup'` → `verify_failed` · 9 `camp_public_signup` with typed parameters — children as `${JSON.stringify(children)}::jsonb`, then `::uuid`, `::boolean`, `::integer`, `::text` · answer reduced by the allowlist §4.6.
- **Limiter key:** `allowRequest` is called with `method: 'camp:GET'` / `'camp:POST'`, so Camps' memory counters are separate from Color Belt's. Note: the optional `RATE_LIMITER` binding, if set, is shared by both forms (one Cloudflare counter per key) — accepted.
- Settings (Production only): `HYPERDRIVE_CAMPS`, `CAMPS_REGISTRATION` (`on` / anything else = off), `TURNSTILE_SECRET`, `TURNSTILE_SITE_KEY`, `CLIENT_KEY_SECRET`, `PUBLIC_ORIGIN`, optional `RATE_LIMITER`. Missing → fail closed (`not_open`). Never log or return database errors, names, phones or signatures; log only `{fn:'camp', method, status, ms}`. Permission denied (the off switch) and any unexpected error → `unavailable`.
- `campDb.js`: Postgres.js, `prepare: false`, `max: 1`, `fetch_types: false`, `connect_timeout: 5`, `onnotice: () => {}`, closed with `context.waitUntil`. Exactly two SQL statements.

### 4.3 Field limits in the Function (POST body)
Only these keys: `submission_id` (uuid pattern), `children` (array 1–3 of objects with only `first_name`, `last_name`, `age`, `member`, `day_ids`, `extras`), `parent` and `emergency` (objects with only `name`, `phone`, `relation`), `paying_by`, `acknowledged`, `signature`, `ack_version`, `waiver_version`, `expected_total_cents`, `website`, `started_at`, `sent_at`, `turnstile_token`. Strings: names ≤ 200, phone ≤ 20, relation ≤ 80, paying by ≤ 20, signature ≤ 70 000, ack version ≤ 40, waiver version ≤ 64, token ≤ 2048. `age` `Number.isInteger` 0–150; `member`, `acknowledged` booleans; `day_ids` ≤ 10 uuid-pattern strings, no repeats; `extras` ≤ 10 objects with only `extra_id` (uuid pattern) and `day_ids` (≤ 10, uuid pattern, no repeats); `expected_total_cents` integer 0–600 000; `started_at`, `sent_at` integers. Anything else → `bad_request`. The database repeats every check.

### 4.4 Turnstile
`functions/_lib/turnstile.js`: `verifyTurnstile({ …, expectedAction = TURNSTILE_ACTION })` — the default keeps `'register'`; Color Belt's call is unchanged. `src/register/turnstile.js`: `getTurnstileToken(siteKey, container, action = 'register')`. The camp page passes `'camp_signup'`. Same widget, site key and secret as Color Belt. (The Star session will use the same argument later.)

### 4.5 Headers (`public/_headers`)
Add `/camp`, `/camp.html`, `/camp/*` blocks with exactly the `/register` Content-Security-Policy line, with a comment. `/api/*` no-store already exists.

### 4.6 Answer allowlist — the exact fields the Function passes to the page (everything else is dropped), and what the page does
| Call | Status (source) | Fields passed | Page does (wording §7) |
|---|---|---|---|
| GET | `ok`, `state: open` (DB) | `status, state, opens_on, closed_on, price_kind_today, ack_version, waiver_version, camp` (exactly the keys of §1.16) + `turnstile_site_key` | C7a |
| GET | `ok`, `state: not_open_yet` | same | C7d not open yet with `opens_on` |
| GET | `ok`, `state: closed` | same | C7d closed — with the date when `closed_on` is set, without when it is null (closed by hand) |
| GET | `ok`, `state: finished` | same | "This camp is over" |
| GET | `not_open` (Function: kill switch / missing setting) | `status` only (**no `opens_on`**) | "Sign-up hasn't opened yet" with the general line "Please check back later, or ask at the front desk." (no date) |
| GET | `not_found` | `status` | "This link isn't working" |
| GET | `rate_limited`, `unavailable`, network | `status` | "This page didn't load" + Try again |
| POST | `ok` (DB) | `status, reference, paying_by, family_total_cents, children, camp` (keys of §1.16) | C7c |
| POST | `not_open` (DB, + `opens_on`) / (kill switch, no `opens_on`) | `status`, `opens_on` when present | C7d not open yet |
| POST | `closed` (DB) | `status, closed_on` | "Sign-up closed while you were filling this in…" |
| POST | `finished` | `status` | "This camp is over" |
| POST | `price_changed` | `status, new_total_cents, old_total_cents, camp` | back to C7b with the new prices + the approved message |
| POST | `camp_changed` | `status, camp` | back to C7a with the fresh camp + the camp-changed message |
| POST | `verify_failed` (Function) | `status` | Color Belt's approved message |
| POST | `rate_limited` (Function or DB) | `status` | Color Belt's approved message |
| POST | `not_found` | `status` | "This link isn't working" |
| POST | `invalid` (DB), `bad_request` (Function, HTTP 400), `unavailable`, network | `status` | "Your sign-up wasn't sent…" |
Any other status or shape → `unavailable` (fail closed).

### 4.7 Preview mode
`import.meta.env.MODE === 'preview'` → `src/lib/camps/publicApi.preview.js` instead of `fetch` (`getCamp(code)`, `signUp(code, body)`), same answers as §4.2 against the `tkd.preview.camps` store; Turnstile not loaded. The production bundle contains no preview code (grep `dist/`).

### 4.8 Function tests (`functions/tests/camp.test.mjs`, `node --test functions/tests/`)
Fake database + fake Turnstile: kill switch, missing binding / setting, wrong origin / type / method, oversized body, every §4.3 limit (4 children, 11 day ids, repeated ids, bad uuid, age 9.5, age "9", member "yes", phone 21 characters, unknown key) → `bad_request` without a database call, honeypot, too fast, Turnstile fail / wrong host / **`register` action refused**, unknown / malformed code, every database status mapped **and reduced to exactly the §4.6 allowlist** (extra fields from a fake database are dropped), `JSON.stringify` children sent as `::jsonb`, the `camp:` limiter key, permission denied → `unavailable`, no error text / names / phones in answers or logs. **Color Belt's existing tests pass unchanged.**

---

## 5. Data layer + preview mock (Builder C)

### 5.1 `src/lib/camps/campRules.js` (pure, node-importable)
Constants: `CAMP_ACK_VERSION = 'camp-2026-10-18'`, `DEFAULT_AGES = {min: 3, max: 17}`, `AGE_LIMITS = {min: 1, max: 99}`, `MAX_DAYS = 10`, `MAX_EXTRAS = 10`, `MAX_CHILDREN = 3`, `MAX_CAMPER_CENTS = 200000`, `SIGNATURE_KEEP_YEARS = 3`, `CAMP_TRIES_PER_HOUR = 30`, `UNDO_WINDOW_MS = 10000`, `PAYING_BY = ['cash','check','card']`, `DEFAULT_EARLY_DAYS_BEFORE = 7`, `DEFAULT_CLOSES_DAYS_BEFORE = 1`.
**One shape per object — camelCase, exactly these keys** (what `campsApi.js` returns and what B's page builds after converting the public answer):
```
Camp     { id, locationCode, bothSchools, name, startTime: 'HH:MM', endTime, signupOpensOn: 'YYYY-MM-DD',
           signupClosesOn, earlyUntil, closedByHand, minAge, maxAge, description, waiverText, publicCode, version }
           (public answer: no id / version / publicCode; adds schoolName, address, waiverVersion)
Day      { dayId, day: 'YYYY-MM-DD' }                       -- sorted by day
PriceRow { dayCount, memberEarlyCents, memberRegularCents, nonmemberEarlyCents, nonmemberRegularCents }
Extra    { extraId, name, priceCents, per: 'once'|'day', notForAllDays, sort }
Child    { firstName, lastName, age, member, dayIds: [uuid], extras: [{ extraId, dayIds: [uuid] }] }  -- form input
RosterRow { id, campId, signupId, position, firstName, lastName, age, member, payingBy, status, withdrawnReason,
            withdrawnAt, withdrawnByName, duplicateState, duplicateOf, version, createdAt, signupVersion, reference,
            priceKind, signedUpOn, signed, signatureDeletedAt, baseCents,
            days: [{ dayId, day, checkedInAt, checkedInByName }],
            extras: [{ extraId, name, per, dayId, day, priceCents }],
            totalCents, paidCents, owesCents, paidOn, paidMethod, lastPaymentId, lastPaymentRecordedAt }
Template { id, name, locationCode, bothSchools, dayCount, startTime, endTime, opensDaysBefore, closesDaysBefore,
           earlyDaysBefore, minAge, maxAge, description, waiverText, prices: [PriceRow], extras: [Extra without extraId], version }
```
Functions (arguments are these shapes; `today` = 'YYYY-MM-DD'):
`signupState(camp: Camp, days: Day[], today)` → `'finished' | 'closed' | 'not_open_yet' | 'open'` · `campTag(camp, days, today)` → `{kind: 'done' | 'camp_today' | 'open' | 'not_open_yet' | 'closed', closesOn}` (rule §1.13) · `isCampWeek(days, today)` · `defaultCampTab(days, today)` → `'checkin'` in camp week, else `'payments'` · `defaultCheckInDay(days, today)` → today if a camp day, else the next camp day, else the last · `campsForLocation(camps: Camp[], location: 'worcester'|'shrewsbury'|'both')` · `campCounts(rows: {campId, status}[])` → `{[campId]: activeCount}` · `priceKind(signedUpOn, earlyUntil)` · `baseCents(prices: PriceRow[], dayCount, member, kind)` · `priceChild(child: Child, prices: PriceRow[], extras: Extra[], days: Day[], kind)` → `{dayCount, baseCents, extras: [{extraId, name, per, count, cents}], totalCents}` · `familyTotal(priced: {totalCents}[])` · `isAllDays(dayIds, days: Day[])` · `payTag(row: RosterRow)` → `'duplicate' | 'owes' | 'paid' | 'not_paid'` · `toCollectCents(rows: RosterRow[])` → sum of **positive** `owesCents` of active rows (possible duplicates count — they are campers and Not paid until resolved, C4b) — the Payments line's amount · `checkInRule(day, today, isAdmin)` → `'allowed' | 'admin_only' | 'future'` · `checkInNote(row: RosterRow, dayId)` → at most one of `{kind:'duplicate'}`, `{kind:'not_paid'}`, `{kind:'owes', cents}`, `{kind:'extra', name}` (that order; per-day extras on that day by `sort`) · `attendanceCell(row, day: Day, today)` → `'came' | 'missed' | 'upcoming' | 'not_signed_up'` · `cameCount(row, days, today)` → `{came, soFar}` · `validateAges(minAge, maxAge)` → null or `'blank' | 'order' | 'range'` · `ageAllowed(age, camp)` · `phoneDigits(text)` → 10 digits or null, `formatPhone(digits)` · `templateFromCamp(camp, days)` → offsets · `campDatesFromTemplate(template, firstDay)` → `{signupOpensOn, signupClosesOn, earlyUntil}` · `gridRowsFor(dayCount, rows: PriceRow[])` · `campLink(code)` (the one definition; `qr.js` re-exports it). The SQL twins agree — `checks.mjs` tests the §1.20 case table, the same rows as `0013_tests.sql`.

### 5.2 `src/lib/camps/campsApi.js`
Every function resolves `{status, …camelCase}` and never throws (a network failure → `{status: 'error'}`). **Every column and every nested jsonb key is converted snake_case → camelCase mechanically** (one helper, `toCamel`, recursive; `id` columns of child tables become `dayId` / `extraId` as in §5.1 — the only renames), and camelCase input is converted back the same way before the RPC call.
`loadCamps(location)` — **query rule:** `'both'` → one select of all camps; `'worcester'` / `'shrewsbury'` → two selects, `.eq('location_code', location)` and `.eq('both_schools', true)`, merged by id (A tests exactly this rule, §2.1 item 8); then the camps' days (`.in('camp_id', ids)`) and `camperCount` from `camp_roster` (`camp_id, status` only, counted by `campCounts`) · `loadTemplates()` · `loadCamp(campId)` (camp, days, prices, extras, roster rows) · `loadCamperDetail(camperId)` · `addCamp(input)` · `updateCamp(campId, expectedVersion, input)` · `setSignup(campId, expectedVersion, open)` · `deleteCamp(campId, expectedVersion, expectedCamperCount, expectedPaymentTotalCents)` · `saveTemplate(campId, name)` · `updateTemplate(templateId, expectedVersion, input)` · `deleteTemplate(templateId, expectedVersion)` · `updateDetails(camperId, camperVersion, signupVersion, input)` · `changePayingBy(camperId, expectedVersion, payingBy)` · `markPaid(camperId, expectedVersion)` · `undoPayment(paymentId)` · `editPayment(paymentId, {method, amountCents, paidOn})` · `resolveDuplicate({keepId, keepVersion, otherId, otherVersion, keepBoth})` · `withdrawCamper(camperId, expectedVersion)` · `restoreCamper(camperId, expectedVersion)` · `deleteCamper(camperId, expectedVersion, expectedPaymentIds)` · `checkIn(camperId, dayId)` · `undoCheckIn(camperId, dayId)`.

### 5.3 `src/lib/camps/qr.js`
re-exports `campLink` from `campRules.js` (→ `https://tkd-dashboard.pages.dev/camp/<code>`, fixed production origin; '' for a code not matching the 8-character pattern) · `campQrSvgDataUrl(code)` (`qrcode-generator`, error correction M, margin 4) · `campQrPngBlob(code, size = 1024)` (SVG drawn on a canvas, no network) for **Download QR code** · `qrFileName(campName)` → the name lower-cased, every run of characters other than a–z and 0–9 replaced by one `-`, `-` trimmed from both ends, cut to 40 characters, then `-qr.png` (empty → `camp-qr.png`); e.g. "April Vacation Camp" → `april-vacation-camp-qr.png`.

### 5.4 `src/lib/mockCamps.js` + `mockClient.js` + `publicApi.preview.js`
- `createCampsBackend()`, `CAMP_RPC_NAMES` (the staff functions + `camp_camper_detail`), **`CAMP_RESTRICTED_RPC_NAMES`** (`camp_public_camp`, `camp_public_signup` — `rpc()` from the app answers like a permission error, exactly as `EVENT_RESTRICTED_RPC_NAMES`; only `publicApi.preview.js` reaches them), `CAMP_TABLES` (incl. `camp_roster`; never `camp_public_attempts`) — plugged into `mockClient.js` like `mockTestingEvents.js`; honours `failNextSave`, `failSavesUntilRetry`, `reconnect`, `setTestingDelay`, `setRole`, `simulateOtherAdminEdit`.
- **The mock re-reads `localStorage` on every call** (no copy kept in memory), so the staff tab and the family page in another tab see each other's changes.
- Every §1.14–§1.16 function, the view, states, money rules (through `campRules.js`), statuses, Undo windows, check-in day rules, duplicate rules, the re-price rule, `camp_changed` / `price_changed`, the 30-per-hour limit — **exactly as the database**. Phones only from `camp_camper_detail`.
- Store: localStorage `tkd.preview.camps` (own key, schema version 1); today from the shared `tkd.preview.today` key.
- **Default data** = the mockups: Columbus Day Camp (Worcester, past, 9 campers, checked in), Veterans Day Camp (Worcester, closed by hand, 16), Thanksgiving Camp (Worcester, Wed Nov 25 & Fri Nov 27 2026, open until Nov 24, early until Nov 18, 12 campers incl. Mia Rossi, extras early drop-off $15/day + late pick-up $8/day), Winter Break Camp (Shrewsbury, Dec 28–30 2026, not open yet), April Vacation Camp (Both schools, held at Worcester, Apr 19–23 2027, ages 5–12, grid and extras of C3, 19 campers: Ava Thompson twice (possible duplicate), Leo Kim owing $15, Owen Walsh removed; **check-ins are seeded only on camp days ≤ the preview's today** — with `campWeek()` (today = Wed Apr 21 2027): Apr 19 and 20 as in the attendance picture (incl. Noah missing Tue), Apr 21 partly (9 of 15 here); with the real date (before the camp) none); templates One-day holiday camp, Thanksgiving Camp, Vacation week, Summer week (prices of C2).
- **Console helpers** on `window.__tkdPreview` (listed in `mockClient.js`'s header): `resetCamps()`, `campWeek()` (= `setToday('2027-04-21')` + reload — to see Check in), `setCampsRegistration(on)`, `simulateFamilySignup(code, { duplicateOf: 'Ava Thompson' } | undefined)` (a sign-up as if from a phone, to watch the 15-second refresh), `forcePriceChanged(on)` (next camp Send answers `price_changed` with +$5), `forceCampChanged(on)` (next camp Send answers `camp_changed`), and the existing `setToday`, `forceVerifyFailed`, `forceRateLimited`, `setRole`, `failNextSave`, `simulateOtherAdminEdit` working for Camps and the camp page.

### 5.5 `src/lib/camps/checks.mjs` (`node src/lib/camps/checks.mjs`)
Groups: states and tags at the date boundaries (incl. a non-camp day inside camp week); the §1.20 price case table (shared with SQL); `toCamel` on a sample roster row; `qrFileName`; totals / owes / overpaid; pay tag priority; check-in rule and notes; attendance cells and "Came X of Y"; Both-school filtering; template offsets both ways; ages; phone digits; the mock answers like §1 for a scripted run (add camp → sign up → check in → mark paid → edit → duplicate → delete).

---

## 6. Staff screens (Builder D) — layout and wording exactly as the approved mockups, with these settled details

### 6.1 Section, routes, nav
- `navItems.js`: `{ id: 'camps', label: 'Camps', Icon: IconTent }` after Testing. `pageAddress.js`: `camps: '#camps'`. `App.jsx`: `#camps` (Camps tab), `#camps/templates`, `#camps/camp/<id>` (Payments / default tab), `#camps/camp/<id>/checkin`, `#camps/camp/<id>/attendance`; browser Back works (v0.83 pattern, like `#testing/event/<id>`); a Camps dialog-open flag like `testingModalOpen`; the page title "Camps · U.S. Taekwondo Center".
- Files: `src/screens/Camps.jsx`; `src/screens/camps/` — `CampsTab.jsx`, `CampRowMenu.jsx`, `TemplatesTab.jsx`, `TemplateRowMenu.jsx`, `SaveTemplateDialog.jsx`, `CampDialog.jsx` + `sections/` (`CampSection`, `DayCalendar`, `TimesSection`, `PricesSection`, `ExtrasSection`, `FamilyFormSection`), `CampPage.jsx`, `CheckInTab.jsx`, `PaymentsTab.jsx`, `AttendanceTab.jsx`, `CamperRows.jsx`, `CamperRowMenu.jsx`, `DuplicateBox.jsx`, `CompareDialog.jsx`, `RemovedGroup.jsx`, `DeleteCampDialog.jsx`, `PrintRoster.jsx`, `CampLinkDialog.jsx`, `CamperDialog.jsx`, `PaymentDialogs.jsx`, `text.js`; `src/styles/camps.css` (incl. `@media print`).
- **Reuse by import:** `Dialog`, `RowMenu`, `Toast`, `ErrorBanner`, `Notice`, `IconButton`, `src/screens/testing/events/ConfirmDeleteDialog.jsx`, `ChoiceGroup.jsx`, `useLiveLoad.js` (`LIVE_REFRESH_MS` = 15 s on the Camps list and the camp page), `useShortcutN`, `useRowArrowNav`, `useMediaQuery`, `money.js`. **Copy and adapt** (Color Belt-specific): `EventPage`, `RosterRows`, `CompareDialog`, `RegistrationLinkDialog`, `StudentDialog`, `PaymentDialogs`. Do not edit any Color Belt file.

### 6.2 C1 Camps list and C2 / C2b Templates
As approved incl. the 2026-10-19 notes: Upcoming / Past with counts; School column on Both; "Both schools · held at Worcester" line; tags (Open until … green; Not open yet, Closed, Camp today, Done neutral). **Admin:** + Add camp (`N`), Edit icon, row ⋯ = Close / Reopen sign-up (no icon), Save as template, Print roster, Delete camp; phone sheet adds Edit camp first. **Staff:** no + Add camp, no Edit icon, no Templates tab, gray line "Ask an admin to add or change camps.", row ⋯ = Close / Reopen sign-up, Print roster. Close is hidden on Not open yet camps. Close / Reopen are instant with a 5-second Undo toast; staff Reopen after the closing date → the message, no change. Templates: Use opens Add camp filled in; ⋯ Edit template / Delete template (asks first); empty state line.

### 6.3 C3 Add / Edit camp, Edit template
Folded sections exactly as C3 (Start from; 1 Camp open; 2 Times, 3 Prices, 4 Extras, 5 Family form with **Ages accepted from / to**, blank 3–17, template's own); amber section + summary on a problem, Save opens it; Save from anywhere; Edit template without days. Removing a picked day → the approved refusal message under Days (from `not_empty`), section 1 amber. Times: hours in 5-minute steps; from a template the dates are prefilled from its offsets and changeable.

### 6.4 Camp page (v0.704 — option A)
Header as C4 (back link "Camps", name, tag, days · hours · school line · camper count; **Registration link** primary; ⋯ Edit camp (admin) · Close / Reopen sign-up · Save as template (admin) · Print roster · Delete camp (admin)). Tabs **Check in · Payments · <to-collect count> · Attendance**; opens on Check in during camp week, else Payments. Every name opens Camper detail. 15-second quiet refresh.
- **Check in:** a day switch with the camp's days (Color Belt's segmented style; 3-column grid on phones), starting on `defaultCheckInDay`; line "9 of 15 here · 6 not here yet"; **Find a camper** (filters both groups by name); **Not here yet · N** rows: name · age, at most one amber note (`checkInNote`: Possible duplicate / Not paid / Owes $X / that day's per-day extra name), **Check in** button; **Here · N** rows: name · age · ✓ time. Check in → instant, toast "<Name> checked in · 9:10 AM" with Undo (5 s); ⋯ on a Here row → Undo check-in. Future day: no buttons. Earlier day: buttons for admins only. Withdrawn campers are not listed. Tapping the **Not paid / Owes** note opens a small popover with the amount and the **Mark paid** / **Mark paid $X** button (the same call and toast as Payments).
- **Payments:** line "13 paid · 5 to collect · $1,040" (paid = active rows tagged Paid; to collect = active rows tagged Not paid, Owes or Possible duplicate; the amount = `toCollectCents`, positive owes only — an overpaid camper never lowers it); possible-duplicate box "1 possible duplicate · Ava Thompson is signed up twice" + Review → compare dialog (C4b); **To collect · N** (name · age, one gray line days · paying by, total, tag, Mark paid / Mark paid $X — none on a possible duplicate) then **Paid · N**; row ⋯ as C4: staff and admins — Change how they'll pay, Edit details, **Withdraw**; admins only (under "Admin") — Edit payment, Undo payment, **Delete permanently**. Withdraw is instant with a 5-second Undo toast. **Removed · N** "Not in the counts" with **Restore** for staff and admins on an ordinary withdrawal; a "Duplicate copy" row shows Restore to admins only (staff get the 5-second toast Undo after Keep this one).
- **Attendance:** grid as `Camps-attendance-roster.html` / option A — one row per active camper, one column per camp day, cells ✓ time / didn't come / still to come (dashed) / — not signed up, last column "Came X of Y"; PC and tablet show ✓ with the time, phones show 5 small day boxes per card (times in Camper detail). **Print roster** (header ⋯ and list ⋯) prints this grid (camp name, dates, one row per camper, check-in times; no phones, no prices).

### 6.5 C5, C6
- **C5 Registration link:** as approved — camp name, "Family sign-up is open until …", school line, QR (`campQrSvgDataUrl` as `<img>`), short link, Copy link (toast "Link copied"), **Download QR code** (`ti-download`), Close; full screen on phones.
- **C6 Camper detail:** as approved incl. the payments area "Total now $315 · paid $390 · Paid $75 more than the total" (amber part) + the admin line, phones (staff and admins), check-in times per day, the sign-up line ("Signed up on the family form, Mar 3, 2027 · waiver signed on the form · reference CP-4821"; after the purge "signature deleted after 3 years"). Edit details: child fields (age 1–99), days, extras, parent / emergency fields; when every camp day is ticked, not-for-all-days extras are removed from the form (with their price) before saving; the price shown while editing uses the camp's current prices (§1.13 re-price rule) as soon as days / member / extras change; save → toast; Owes appears when the total grows.

### 6.6 Behaviour (as Color Belt, CONTRACT-0005 §6 / CONTRACT-0003 §8)
44 px targets on touch, focus handling, stale → amber "Someone else changed this just now…" + reload, save failed banner, Undo toasts, locked-screen behaviour, phone full-screen dialogs, rulebook icons (`ti-tent`, `ti-template`, `ti-qrcode`, `ti-download`, `ti-printer`, `ti-check` for Mark paid / Paid, `ti-user-minus` Withdraw).

---

## 7. Wording

### 7.1 Copied from the approved mockups / rulebook (exact)
"Ask an admin to add or change camps." · "The closing date has passed. Ask an admin to reopen." · "Close sign-up" / "Reopen sign-up" · "Can't remove Wed, Dec 30: Mia Rossi and 2 more picked it. Change their days or withdraw them first." · "Ages accepted" · "A blank camp starts at 3 to 17; a template brings its own range. The family form only accepts children in this range." · "The first age must be lower than the second." · "Enter an age" · "Ages 5–12 · description and waiver from the template" · "Everything can be changed later with Edit camp." · "Fills in everything except the name and days. Choose Blank camp to start empty." · "Tap a day to add or remove it. Days don't have to be next to each other (Thanksgiving: Wed & Fri)." · "One row for each number of days, made from the chosen days. A camper's price is the row for how many days they come. Early prices apply to sign-ups up to the end of <date>." · "1 row needs prices" · "1 extra has no price" · "Keeps everything except the dates and campers: school, camp hours, sign-up and early-price timing, prices, extras, description and waiver." · "A template with this name exists. Choose another name." · "Template saved · <name>" · "No templates yet. Open a camp's ⋯ menu and choose Save as template." · "Templates are made from a camp: open the camp's ⋯ menu and choose Save as template. Templates are shared by both schools." · "Family sign-up is open until <date>. Families choose their child's days and extras on the form." · "Copy link" · "Link copied" · "Download QR code" · "1 possible duplicate · <Name> is signed up twice" · "Review" · "Same name at the same camp. Differences are highlighted." · "First sign-up" / "Second sign-up" · "Keep this one" · "Keeping one moves the other sign-up to Removed as "Duplicate copy", together with its payment record (Undo for 5 seconds; admins can Restore both). Both are logged." · "Not the same person — keep both" · "<Name> marked paid · $166 cash" + "Undo" · "Mark paid" / "Mark paid $15" · "Owes $15" · "Total now $315 · paid $390 · Paid $75 more than the total" · "An admin can change the payment from the roster's ⋯ → Edit payment if money is handed back." · "Signed up on the family form, <date> · waiver signed on the form · reference <CP-####>" · "9 of 15 here" · "6 not here yet" · "Find a camper" · "Not here yet · 6" · "Here · 9" · "Check in" · "<Name> checked in · 9:10 AM" · "Undo check-in" · "13 paid" · "5 to collect · $1,040" · "To collect · 5" · "Paid · 13" · "Came" · "3 of 3" · "Removed · 1" · "Not in the counts".
Family page: "Camp sign-up" · "Step 1 of 2 · Details" · "Step 2 of 2 · Check and sign" · "Is <Name> a U.S.T.C. member?" · "Which days?" · "Extras" · "$15 a day" · "which days?" · "<Name>'s total" · "Add another child" · "Up to 3 children" · "Parent or guardian" · "Emergency contact" · "Relationship to the child" · "Someone we can call if we can't reach you." · "How you'll pay at the school" · "Pay at the front desk before camp starts." · "Please check everything before signing." · "Family total" · "Pay at the school before camp" · "Waiver" · "I am <Name>'s parent or guardian. I have read the waiver and agree to it." · "Sign with your finger or mouse. Can't sign here? Please sign at the front desk." · "Sign up" · "← Back to edit" · "The school uses these details only to run the camp. They are not shared or sold." · "You're signed up" · "What happens next" · "Mention it at the front desk if anything needs changing." · "Total to pay" · "Age on the first day of camp" · "Ages 5–12" · "This camp is for ages 5 to 12." · "The price changed while you were filling in the form. New total $X (was $Y). Check it and sign again." · "Sign-up hasn't opened yet" / "It opens on <weekday, date>. Please check back then, or ask at the front desk." · "Sign-up is closed" / "Sign-up closed on <weekday, date>. Please call or visit the school to ask about a place." · school line for Both "U.S.T.C. Worcester & Shrewsbury · held at Worcester".

### 7.2 Reused from Color Belt (`src/screens/testing/text.js`, `src/register/text.js`) with "registration" → "sign-up", "student" → "camper"
Stale (row and dialog), save failed, undo failed / too late ("Too late to undo here. Ask an admin to undo the payment." / "…to restore the copy from Removed."), already paid, withdrawn, withdrawn / restored / payment undone toasts, Delete permanently warnings (naming the payment), Edit payment / Change how they'll pay dialogs, verify failed ("We couldn't check this browser. Try again, or ask at the front desk."), rate limited ("Too many tries from this connection. Please wait a few minutes, or ask at the front desk."), signature errors, loading / load failed.

### 7.3 New wording not in the mockups — B / D mark each one `// (not in the mockups)` and the orchestrator shows the list to Jeffrey at CP1
"Your sign-up wasn't sent. Check your internet connection and try again. Nothing you entered is lost." · **"This camp was updated while you were filling in the form. Check your choices and sign again."** (`camp_changed`) · kill switch on GET: "Sign-up hasn't opened yet" / "Please check back later, or ask at the front desk." (no date) · "This page didn't load" / "Check your internet connection and try again." · "Sign-up closed while you were filling this in, so it wasn't sent. Please ask at the front desk." · closed by hand on the form: "Sign-up is closed" / "Please call or visit the school to ask about a place." · finished: "This camp is over" / "For the next camp, please ask at the front desk." · not found: "This link isn't working" / "Please ask at the front desk for the current sign-up link." · field errors ("Enter the child's first name." / "…last name." / "Enter the child's age." / "Choose Yes or No." / "Choose at least one day." / "Choose which days." / "Enter a name." / "Enter a 10-digit phone number." / "Enter the relationship." / "Choose Cash, Check or Card." / "Tick the box to confirm.") · staff: "<Name> was checked in on <day>. Undo that check-in first." · "Can't remove <extra>: <N> campers picked it. Change their extras first." · "No campers on <day>." · "No campers yet. Families sign up with the Registration link." · Delete camp warning ("<Camp> and its <N> campers and <$X> in payments are deleted. This can't be undone.") · "signature deleted after 3 years".

---

## 8. Done means
- `npm run build` and `npm run build:preview-mode` pass.
- PGlite: `cd supabase/tests/pglite && node run.mjs` → all steps incl. `stepCamps` pass (`… passed, 0 failed`), both runs of `0013_tests.sql`, the earlier test files, the undo script.
- `node --test functions/tests/` passes (camp tests and Color Belt's unchanged).
- `node src/lib/camps/checks.mjs` and `node src/lib/testing/checks.mjs` pass.
- grep `dist/`: no preview code (`publicApi.preview`, `mockCamps`), no supabase-js in the `camp` bundle, no `service_role`, no secrets.
- Line endings unchanged; every new file has its header comment; no file outside the builder's row of §0 changed.

## 9. Reviews (orchestrator)
1. **Security review** of A + B together (separate agent): registrar proofs, grants and column grants (phones, signature, waiver copy), jsonb shape-before-cast and `data_exception`, attempt rows always written to Camps' own `camp_public_attempts` (no grants, never `testing_public_attempts`), the 30-per-hour limit, the §4.6 answer allowlist, `camp_changed` / `waiver_version`, check-in day rules, staff vs admin roster roles, the Function's field limits and fail-closed paths, CSP, secrets grep.
2. **Design review** of D + B (separate agent) against the approved mockups, option A and the rulebook, with screenshots at **1280×800, 820×1180 touch, 390×844 touch and 320 wide**, staff and admin views, the camp page in camp week (`campWeek()`) and before it, the family page in every state.
3. Fix rounds by the builders; re-review until no Critical / High; checks of §8 green; the orchestrator commits on `camps` (no push).

## 10. Settled by this contract (no new decision needed — shown to Jeffrey at CP1)
Decided by the coordinator on the contract review (2026-10-19):
- Admins can change **held at / both schools** in Edit camp (a correction); the link (`public_code`) never changes.
- **Withdraw and Restore (ordinary withdrawal): staff and admins**; Delete permanently, Edit payment and ⋯ Undo payment: admins only (v0.700 wins over the older Color Belt rule).
- Camps has its **own ledger `camp_public_attempts`**; 30 tries per hour per connection count only that table.
- Removing a day / extra is refused only when an **active** camper picked it; withdrawn campers' rows for it are deleted (logged).
- **Re-price rule** literally as v0.700: any change to a camper's days, member box or extras re-prices the whole camper at current prices (sign-up's early / regular kept).
- **Camp changed mid-form** → `camp_changed` + "This camp was updated while you were filling in the form. Check your choices and sign again." (new wording).
Settled by the contract itself:
- Admin Reopen after the closing date moves `signup_closes_on` to the camp's last day (Star v0.86 clears its closing date; Camps always has one).
- The Check in tab keeps a day switch (default today) so admins can fix an earlier day; staff see earlier days read-only.
- The Not paid / Owes note on Check in opens a small popover with the Mark paid button.
- The Payments tab's one-line summary replaces Color Belt's four summary cards (option A); its amount counts positive owes only, incl. possible duplicates.
- Staff Edit details accepts ages 1–99 (the camp's range binds only the family form).
- Ages "from" may equal "to" (e.g. 8–8); the error shows only when from > to.
- Edit details can't remove a day the camper was checked in on.
- Possible duplicates appear on Check in with their note and can be checked in.
- The family page's kill-switch "not open" has no date ("Please check back later…").
- The optional Cloudflare `RATE_LIMITER` binding, if ever set, is shared by the Color Belt and Camps forms.
