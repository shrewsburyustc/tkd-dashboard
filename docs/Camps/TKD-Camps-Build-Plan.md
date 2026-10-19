# Camps build plan — camps, templates, family sign-up form, roster with payments (DRAFT for review)

**Written:** 2026-10-19 · **Revised:** 2026-10-19 after the independent review (§12) · **Status:** draft, waiting for Jeffrey's OK (CP0). Nothing is built, applied or deployed until he says so.
**Branch:** `camps` (worktree `camp-event-creator-templates-83eafe`).
**Design (approved 2026-10-18):** `TKD-Camps-Mockups.html` (C1–C7d), images in `Mockup images/`, decisions in `TKD-Camps-Status.md`; rulebook **v0.229–v0.237** (10b rows "Camps …").
**Rules:** CLAUDE.md; handoff §6 (security, non-negotiable); rulebook §5 (privacy). The newest 10b row wins.
**Model copied:** Color Belt phase 2 (`TKD-Testing-Phase2-Build-Plan.md`, `CONTRACT-0005.md`, migration `0005_testing_events.sql`, `functions/**`, `src/register/**`) and Star testing's later choices (`0006_star_testing.sql`, CONTRACT-0006).

> In plain words: admins create a camp (one or more days, for Worcester, Shrewsbury or both schools), set its prices in a small grid plus a list of extras, and can save it as a template to reuse. The camp gets one link + QR code. Families sign up on their phone (up to 3 children, days, extras, parent, emergency contact, signature) and pay at the school. Staff see the roster per day and click **Mark paid**. It is the same machine as Color Belt phase 2 with a different price rule — so most of this plan is "reuse X", and the new risk is again the public page.

> **Migration number: `0013`** (`0013_camps.sql`, `0013_tests.sql`, `0013_fingerprints.sql`). The brief said 0012, but checking every branch and worktree on 2026-10-19 showed: `0010` = Color Belt grading (live), `0011` = Finance (`0011_finance.sql`, Finance worktree, not committed yet), `0012` = Prospects (`0012_prospects.sql`, committed on its branch). 0013 is the next free number. Re-check right before Builder A starts and again at merge.

---

## 0. Scope

**Ships:**
- Rail section **Camps** (`ti-tent`, after Testing) with tabs **Camps | Templates** (C1, C2).
- Add / Edit camp in folded sections (C3), Save as template (C2b), Use / Edit / Delete template (C2).
- Camp page with roster: 4 summary cards, day filter with per-day counts and per-day extras counts, Mark paid / Mark paid $X with 5-second Undo, Owes $X, row ⋯ menu, Removed group + Restore, Print roster (C4).
- Close sign-up by hand / reopen (decided in C1; where the control sits is Question 9).
- Registration link dialog: QR, link, Copy link, **Download QR code** (C5).
- Camper detail + Edit details (C6).
- Public family sign-up page `/camp/<code>`, all states (C7a–d), with its Cloudflare Function, restricted login, Turnstile and kill switch.
- Preview mode (fake database) for all of it, including the family page.

**Deliberately NOT built** (decided v0.229–v0.237, or never asked for):
online card payment (Card is only a label for "pays by card at the desk") · paper entry / staff **Add camper** (v0.232) · flyer in the app (v0.232) · camper limit (closing by hand covers "full") · a "weeks" concept (each summer week is its own camp, v0.231) · medical questionnaire · credits / refunds as records · part payments or deposits (v0.233) · daily check-in / attendance marking · a Home tile · emails to families · the central Calendar link · a rule against two camps with the same name (never decided) · moving anything from the old `tkd-camps` Worker (it was only a test; deleting it later needs its own OK).

**Already decided — not asked again:** Card = label only, no processing (v0.233). Delete camp with campers = admin only, warning names them, same rule as Color Belt's Delete event (v0.237). Price fixed at sign-up by the sign-up date in Massachusetts time (v0.230). Both-schools camps: member prices for members of either school (v0.234).

---

## 1. Database — migration `0013_camps.sql`

Same rules as 0005 (handoff §6, CONTRACT-0005 §1.1), repeated because they are non-negotiable:
- Tables in `public`, prefix `camp_` (main table `camps`). Owner `postgres`. One transaction, safe to re-run, header comment like 0005's (including the "destructive operations" warning text).
- RLS on every table. Policies `for select to authenticated using ((select public.has_data_access()))`. `revoke all … from public, anon, authenticated, service_role` on every table, view and sequence; then **column** `select` grants only where the app reads. **Nothing to `anon`.**
- Every write through a `security definer` function: `set search_path = ''`, fully qualified names, `has_data_access()` first, then role, then input, then lock + look up, then stale check, then data rules, then write. Returns `{status: …}` jsonb. Same error mapping as 0003/0005 (unique → `stale` or `duplicate_name`, FK/check/not-null → `invalid`, deadlock/serialization/lock → `stale`).
- Writes tagged with `tkd.action` / `tkd.batch_id` and cleared after. **Every action tag starts with `camp_`** (`camp_add_camp`, `camp_delete_camper`, `camp_delete_camp`, `camp_public_signup`, `camp_purge_old_signatures` …) so camp rows in the history never look like Color Belt's. Every change goes to `public.change_log`.
- **"Today"** = `public.testing_today()` (0005, America/New_York). No other time zone.
- **Money** = integer cents. Prices: whole dollars, $0–$1,000 (same rule as `src/lib/money.js` and 0003's `testing_cents_is_valid`). A camper's total may be at most **$2,000** (200 000 cents) — a sign-up or Edit details that would go over is refused with `invalid` (the payment cap is the same, so one Mark paid always fits).
- Lock order in every write: `locations` row (the held-at school) → camp → sign-up → camper → payments.
- **Reused 0005/0003 helpers** (already live, called from inside our definer functions, never granted to anyone): `testing_today`, `testing_school_date`, `testing_normalize_name`, `testing_name_is_valid`, `testing_line_is_valid`, `testing_normalize_note`, `testing_signature_is_valid`, `testing_new_public_code`, `testing_location_address`, `change_log_write`, `testing_refuse_truncate`. 0013 changes **nothing** that 0001–0012 made.
- **`change_log_write` (0003) needs a uuid column named `id` on every table it is attached to** (it reads `row->>'id'`). Every 0013 table that is logged has one.
- 0013 depends only on 0003 + 0005 (both live). It can be applied before 0011/0012 are live — the numbers just say "written after".

Statuses: the 0005 set (`ok, no_access, not_allowed, not_found, stale, duplicate_name, invalid, not_empty, rate_limited, not_open, closed, finished, already_paid, withdrawn`) plus `price_changed` (family form only, Question 10).

### 1.1 Tables

Common columns on every table that staff edit (as 0003): `version integer not null default 1`, `created_at`, `created_by uuid`, `created_by_name`, `updated_at`, `updated_by uuid`, `updated_by_name` (kept by a before-write trigger; `*_by` uuids are never granted to the app).

**`camps`** — one camp.
| Column | Type / rule | Why |
|---|---|---|
| `id` | uuid pk | |
| `location_code` | text not null, FK → `locations(code)` | **Held at** — the school whose address the family form shows. Named `location_code` so `change_log_write` and the school lock work unchanged. |
| `both_schools` | boolean not null default false | "Both schools" camp (v0.234). Worcester list = `location_code = 'worcester' or both_schools`; Shrewsbury likewise; Both = all. |
| `name` | text, `testing_name_is_valid`, ≤ 60 | Names may repeat (no uniqueness rule was ever decided; "Columbus Day Camp" comes back every year). |
| `start_time`, `end_time` | time not null, end > start, 5-minute steps | camp hours (one set for every day) |
| `signup_opens_on` | date not null | |
| `signup_closes_on` | date not null | opens ≤ closes ≤ last camp day (walk-ins can sign up on a camp day if the camp allows it) |
| `early_until` | date not null | ≤ `signup_closes_on`. Sign-ups on or before this date (Massachusetts) get early prices. |
| `closed_by_hand` | boolean not null default false | "Close sign-up" (e.g. full). No camper limit field. |
| `description` | text null, ≤ 2000 | the form's top card + confirmation ("what to bring") |
| `waiver_text` | text not null, 1–8000 | the waiver the family signs |
| `public_code` | text not null unique, from `testing_new_public_code()` (8 characters) | link `/camp/<code>`. The mockup's 6-character `k7m2qp` was a sample; we reuse 0005's 8-character generator. Never changes. |
| + common columns | | |

(Both long texts use a new helper `camp_text_is_valid(text, max)`: the same tidying and "no invisible characters" rule as 0005's `testing_note_is_valid`, with its own length cap. 0005's helper stays as it is.)

Status is **never stored**. Two derived rules (one SQL function each, mirrored exactly in `campRules.js`):
- `camp_signup_state(camp, today)` in this order: `finished` (today > last day) → `closed` (closed_by_hand, or today > signup_closes_on) → `not_open_yet` (today < signup_opens_on) → `open`.
- List tag (JavaScript only): Done · **Camp today** (today is one of the camp's days) · Open until <closes> · Not open yet · Closed. ("Done" is the approved screen word; the code status is `finished`, as in 0005.)

**`camp_days`** — the days of a camp. `id` uuid pk · `camp_id` FK cascade · `day` date · unique (camp_id, day). 1–10 days per camp. Days don't have to be next to each other (Thanksgiving Wed + Fri).

**`camp_prices`** — the price grid (v0.230). `id` · `camp_id` FK cascade · `day_count` smallint (1 … number of camp days) · `member_early_cents`, `member_regular_cents`, `nonmember_early_cents`, `nonmember_regular_cents` (each whole dollars $0–$1,000) · unique (camp_id, day_count). The functions insist on **exactly one row per day count 1…N** — so "a camper's days have no grid row" can't happen.

**`camp_extras`** — `id` · `camp_id` FK cascade · `name` (line ≤ 60, unique per camp ignoring case) · `price_cents` (whole dollars $0–$1,000) · `per` (`once` | `day`) · `not_for_all_days` boolean (pizza day: not offered / not charged to a child coming every day) · `sort` smallint. 0–10 extras.

**`camp_templates`** — one saved setup, shared by both schools (v0.235).
| Column | Rule |
|---|---|
| `id`, common columns | |
| `name` | name rule, ≤ 60, unique ignoring case and extra spaces → `duplicate_name` (decided in C2b) |
| `location_code`, `both_schools` | prefilled into Add camp, changeable |
| `day_count` | 1–10 (how many grid rows) |
| `start_time`, `end_time` | |
| `opens_days_before`, `closes_days_before`, `early_days_before` | smallint 0–365, counted back from the first camp day (prefilled, changeable — v0.235) |
| `description`, `waiver_text` | same rules as `camps` |
| `prices` | jsonb: `[{day_count, member_early_cents, member_regular_cents, nonmember_early_cents, nonmember_regular_cents}]`, exactly rows 1…day_count |
| `extras` | jsonb: `[{name, price_cents, per, not_for_all_days}]`, 0–10 |

**Why jsonb for templates instead of two more tables:** a template is never used for money directly. "Use" only **fills in the Add camp dialog**; Save then goes through `camp_add_camp`, which checks every price and extra again. So templates need no links to other rows, and one row per template is the simplest thing that is still safe. A `check` constraint calls `camp_template_setup_is_valid(day_count, prices, extras)` (strict shape: only the listed keys, right jsonb types checked before any cast, right ranges), so a bad jsonb can never be stored. Changing or deleting a template never touches camps made from it (nothing links them).

**`camp_signups`** — one family's submission (1–3 children). Always from the family form (no `source` column — there is no other way in; a later staff entry would add one).
| Column | Rule | Why |
|---|---|---|
| `id` | uuid pk | |
| `camp_id` | FK cascade | |
| `reference` | `'CP-' \|\| nextval('camp_signup_ref_seq')`, unique, sequence starts at 4001 | C6/C7c "CP-4821". Sequential, so **never** a public lookup by reference. |
| `submission_id` | uuid unique | made by the page; a double tap or retry returns the first sign-up (0005 pattern) |
| `parent_name`, `emergency_name` | name rule ≤ 60 (whole name in one field, as C7a) | |
| `parent_relation`, `emergency_relation` | line ≤ 40 | |
| `parent_phone`, `emergency_phone` | `^\d{10}$` (US, digits only; the page formats "(508) 555-0142") | **detail view only** (never in lists, never granted to the app — read through `camp_camper_detail`; who may see them: Question 3) |
| `price_kind` | `early` \| `regular`, fixed at sign-up | v0.230: chosen by `signed_up_on ≤ early_until` and never recomputed |
| `signed_up_on` | date (Massachusetts) | |
| `signature` | text null, `testing_signature_is_valid` (PNG data URL ≤ 70 000) | **never granted to any client role** |
| `signed_at`, `signature_deleted_at` | timestamptz | "waiver signed on the form" line stays after the picture is purged |
| `waiver_text_signed` | text not null | a **copy** of the waiver at that moment — if an admin edits the waiver later, we still know what this family signed. Not shown in lists. |
| `ack_version` | text, current `camp-2026-10-18` | which tick-box wording was agreed |
| + common columns | | (staff Edit details bumps `version`) |

**`camp_campers`** — one child on one camp (a roster row).
`id` · `signup_id` FK cascade · `camp_id` FK cascade (copy, for fast queries) · `position` 1–3 (child order on the form) · `first_name`, `last_name` (name rule ≤ 60) · `age` smallint 3–17 (Question 13; **no date of birth**) · `member` boolean (the family's own answer; staff can correct it) · `paying_by` (`cash` \| `check` \| `card`) — per camper, copied from the sign-up, so "Change how they'll pay" and Mark paid work per row · `base_cents` integer ≥ 0 — **the grid price snapshot** · `status` (`active` \| `withdrawn`) · `withdrawn_at`, `withdrawn_by_name` · common columns.

**`camp_camper_days`** — which days a camper comes. `id uuid primary key default gen_random_uuid()` (needed by `change_log_write`) · `camper_id` FK cascade · `day_id` FK → `camp_days` with the **default `no action`** rule · `unique (camper_id, day_id)`.

**`camp_camper_extras`** — `id uuid primary key default gen_random_uuid()` · `camper_id` FK cascade · `extra_id` FK → `camp_extras` (default `no action`) · `day_id` null FK → `camp_days` (default `no action`; null for `once` extras; one row per chosen day for `day` extras) · `price_cents` — **snapshot of that extra's price** · `unique nulls not distinct (camper_id, extra_id, day_id)`. Rules (checked in every function): a per-day extra's days ⊆ the camper's days; a `not_for_all_days` extra is refused (`invalid`) when the camper comes every camp day — the screens drop it automatically.

**Why `no action` and not `restrict`:** `restrict` is checked immediately, so Delete camp could fail halfway when Postgres removes the camp's days before it has removed the campers' day rows. `no action` is checked only at the end of the statement, when the cascade has removed both — so deleting a whole camp always works. The rule "a day or extra that a camper picked can't be removed" is enforced **inside `camp_update_camp`** (`not_empty`), and `no action` still stops any other removal. A PGlite test deletes a camp whose campers have days, per-day extras and payments.

**`camp_payments`** — append-only, a copy of `testing_payments` (0005 §6): `id` · `camper_id` FK cascade · `kind` (`payment` \| `reversal`) · `amount_cents` (payment 1…200 000; reversal = exactly minus the original) · `method` (cash/check/card) · `paid_on` date · `recorded_at` · `recorded_by` (not readable by the app) · `recorded_by_name` · `reverses_payment_id` unique (a reversal can't be reversed). UPDATE refused by trigger; DELETE only inside a camper / camp delete (`tkd.action in ('camp_delete_camper','camp_delete_camp')`).

**Rate-limit ledger:** **reuse 0005's `testing_public_attempts`** (no new table), as Star does: `event_id` = the camp's id (the column has no FK), `outcome = 'camp:' || status`. Old rows (> 2 days) removed inside the public sign-up function. Which rows count toward the Camps limit: Question 12.

### 1.2 The money rules (one SQL helper each, mirrored in `campRules.js`, tested against the same table of cases)

- **Base price** of a camper = the grid row for **how many days** they come × **member / non-member** × the sign-up's **early / regular**. Stored in `base_cents`.
- **Extras** = sum of `camp_camper_extras.price_cents` (once = 1 row; per day = 1 row per chosen day).
- **Total now** = `base_cents + extras` (`camp_camper_total_cents(id)`), at most $2,000.
- **Net paid** = sum of the camper's payment rows (reversals are negative).
- **Owes** = total now − net paid.
- **Tag** (priority as v0.233): net paid > 0 and owes > 0 → **Owes $X** (amber) · owes ≤ 0 → **Paid** (green; overpaid shows "Paid $X more than the total" in the detail only) · otherwise → **Not paid** (gray). A total of $0 counts as Paid.
- **Mark paid** records exactly `owes` (server-side), method = `paying_by`, `paid_on` = today. Button text "Mark paid" when nothing is paid yet, "Mark paid $X" when it owes the difference.

Worked check from the mockups (these become test rows): Mia, non-member, 2 days, early → $150 + late pick-up $8 × 2 = **$166**. Ava, member, all 5 days, early → $275 + drop-off $15 × 5 + pick-up $8 × 5 = **$390**. Ethan, 3 days + drop-off × 3 + pizza once → $195 + $45 + $5 = **$245**. Leo, all days + drop-off × 5 = $350, paid $335 before a drop-off day was added → **Owes $15**.

**How totals stay fixed when prices are edited later (the snapshot rule):** a camper's `base_cents` and each extra row's `price_cents` are written at sign-up and **never recomputed by a price edit**. They change only when staff change **that camper's** days, member box or extras in Edit details:
- day count or member changed → `base_cents` = the camp's **current** grid row, keeping the sign-up's early/regular;
- an extra or extra day **added** → that row takes the extra's **current** price; rows that stay keep their old price; removed rows go.
- a name, age, phone or relationship fix → no price change at all.
So fixing a typo never creates a surprise "Owes". (Question 4 confirms this.)

### 1.3 Staff functions (authenticated; `has_data_access()` first)

Roles: **A** = admin only, **S** = staff and admin. Roles below assume Question 2 = A (camp setup is admin-only, like Color Belt events).

| Function | Role | Does | Ok answer |
|---|---|---|---|
| `camp_add_camp(p_location_code, p_both_schools, p_name, p_days date[], p_start_time, p_end_time, p_signup_opens_on, p_signup_closes_on, p_early_until, p_prices jsonb, p_extras jsonb, p_description, p_waiver_text)` | A | first day today or later; grid rows exactly 1…N; extras valid; makes `public_code`. Last step: signature purge (§1.6). | `{status, id, public_code, version}` |
| `camp_update_camp(p_camp_id, p_expected_version, …same…)` — extras carry their `id` when they already exist | A | days: per Question 5; grid replaced (campers keep their snapshot, §1.2); an extra campers chose can be renamed / re-priced (snapshots stay) but not removed → `not_empty` | `{status, version}` |
| `camp_set_signup(p_camp_id, p_expected_version, p_open boolean)` | S | sets / clears `closed_by_hand`; after the last day → `finished`. Reopening doesn't move dates: past the closing date it stays Closed until an admin edits the date. | `{status, version, state}` |
| `camp_delete_camp(p_camp_id, p_expected_version, p_expected_camper_count, p_expected_payment_total_cents)` | A | cascades campers, their days / extras and payments; `stale` if counts differ from what the warning showed (0005 rule) | `{status}` |
| `camp_save_template(p_camp_id, p_name)` | A | copies everything except dates and campers; dates become days-before-first-day | `{status, id, version}` |
| `camp_update_template(p_template_id, p_expected_version, p_name, …setup…)` | A | | `{status, version}` |
| `camp_delete_template(p_template_id, p_expected_version)` | A | never touches camps | `{status}` |
| `camp_update_details(p_camper_id, p_camper_version, p_signup_version, p_first, p_last, p_age, p_member, p_day_ids uuid[], p_extras jsonb, p_parent_name, p_parent_phone, p_parent_relation, p_emergency_name, p_emergency_phone, p_emergency_relation)` | S (phone fields: per Question 3) | C6 Edit details: child + family fields in one save (family fields are shared by siblings on the same sign-up); re-prices only per §1.2; total over $2,000 → `invalid`; allowed in every state incl. `finished`; not for withdrawn (`withdrawn`) | `{status, camper_version, signup_version, total_cents, owes_cents}` |
| `camp_change_paying_by(p_camper_id, p_expected_version, p_paying_by)` | S | only while it owes something (`already_paid`) | `{status, version}` |
| `camp_mark_paid(p_camper_id, p_expected_version)` | S | locks the camper; `withdrawn` / `already_paid`; amount = owes; bumps camper version (a double click gets `stale`). Last step: signature purge. | `{status, payment_id, amount_cents, method, version}` |
| `camp_undo_payment(p_payment_id)` | S if `recorded_by = auth.uid()` and < 10 s ago, else A (0005 rule) | reversal row; already reversed → `stale` | `{status, version}` |
| `camp_edit_payment(p_payment_id, p_method, p_amount_cents, p_paid_on)` | A | reversal + new row | `{status, payment_id, version}` |
| `camp_withdraw_camper(p_camper_id, p_expected_version)` / `camp_restore_camper(…)` | A | Removed group; payments kept | `{status, version}` |
| `camp_delete_camper(p_camper_id, p_expected_version, p_expected_payment_ids uuid[])` | A | permanent; payments cascade; the last camper of a sign-up deletes the sign-up (and its signature) too | `{status}` |

**Reads:**
- Column `select` grants on `camps`, `camp_days`, `camp_prices`, `camp_extras`, `camp_templates` (all columns except `created_by` / `updated_by`).
- View **`camp_roster`** (`security_invoker = true`): one row per camper — child fields, `paying_by`, status, signup `reference`, `price_kind`, `signed_up_on`, **`signed` = `signed_at is not null`** (the view never reads the `signature` column), `signature_deleted_at`, day ids, extras per day, `total_cents`, `paid_cents`, `owes_cents`, last payment id / time. **No phones, no relationships, no signature, no waiver copy.** Column grants exactly on what the view reads (0005 lesson: an invoker view needs the caller to have rights on its columns).
- **C1 "Campers" count:** the Camps list loader reads only `camp_id, status` from `camp_roster` for the camps it shows and counts the active campers per camp in `campRules.campCounts` (same idea as Color Belt's `eventRules.eventCounts`). No extra view or function.
- **`camp_camper_detail(p_camper_id)`** — security definer read function (`has_data_access()` first, Star's DOB pattern): the C6 summary — price breakdown, payments list, parent + emergency contact with phones, sign-up line. This is the **only** way the app sees phone numbers (who: Question 3).

### 1.4 Public functions (only the restricted login can call them)

- **`camp_public_camp(p_code text) returns jsonb`** → `{status:'ok', state, opens_on, closes_on, price_kind_today, camp:{name, days:[{day_id, day}], start_time, end_time, both_schools, school_name, address|null, description, early_until, waiver_text, ack_version, prices:[…4 prices per day count…], extras:[{extra_id, name, price_cents, per, not_for_all_days}]}}` or `{status:'not_found'}`. Nothing else: no counts, no campers, no other camps.
- **`camp_public_signup(p_code, p_client_key, p_submission_id uuid, p_children jsonb, p_parent_name, p_parent_phone, p_parent_relation, p_emergency_name, p_emergency_phone, p_emergency_relation, p_paying_by, p_acknowledged boolean, p_signature, p_ack_version, p_expected_total_cents integer) returns jsonb`.
  `p_children` = 1–3 of `{first_name, last_name, age, member, day_ids[], extras:[{extra_id, day_ids[]}]}`.
  **Wrapper** (as 0005 15c / Star): clear `request.jwt.*`; delete attempt rows > 2 days; run the core inside a block that turns table-rule errors **and every data error** into `invalid`: `when unique_violation or foreign_key_violation or check_violation or not_null_violation or data_exception then 'invalid'` and `when deadlock_detected or serialization_failure or lock_not_available then 'invalid'`. **Then** write the attempt row (outside the part that can roll back); return. Why `data_exception`: jsonb input can cause "invalid text for uuid", "number out of range" or "not an integer" errors (Postgres error class 22). 0005/0006 never take jsonb from families, so their list doesn't catch these; without it, such an error would skip the attempt row and give unlimited, uncounted tries.
  **Core, in this order:**
  1. code → `not_found`.
  2. **Shape check before any cast** (`camp_children_arg_is_valid`): `p_children` is a jsonb array of 1–3 objects with only the listed keys; `jsonb_typeof` checked for every value (strings are strings, `age` a number that is a whole integer 3–17 checked as text with `^\d{1,2}$` before casting, `member` a boolean, `day_ids` arrays of 1–10 strings each matching the full uuid pattern, no repeats; `extras` an array of ≤ 10 objects, each `extra_id` a uuid-pattern string and its `day_ids` ≤ 10 uuid-pattern strings, no repeats). Anything else → `invalid` without casting.
  3. same `submission_id` already for this camp → the same ok answer (idempotent); another camp → `invalid`.
  4. lock school → camp, read again; state → `not_open` / `closed` (+ `closed_on`) / `finished`.
  5. the other inputs → `invalid` (names, phones, relations, paying by `cash`/`check`/`card`, acknowledged true, signature, ack version, `p_expected_total_cents` not null).
  6. every day / extra id belongs to this camp; per-day extras' days ⊆ the child's days; not-for-all-days rule → `invalid`.
  7. rate limit (Question 12) → `rate_limited`; ≥ 200 per camp per hour → `raise log` only.
  8. price the children with `price_kind` = today ≤ early_until; any child over $2,000 → `invalid`; sum ≠ `p_expected_total_cents` → `price_changed` with the new camp answer (Question 10).
  9. insert sign-up + campers + days + extras (actor label "Family form", action `camp_public_signup`); ok answer `{status:'ok', reference, children:[{first_name, last_name, total_cents, breakdown}], family_total_cents, paying_by, camp:{…what C7c shows…}}`.
  **No signature purge here** (Star's lesson: the registrar has a 5-second statement timeout; a big purge must never fail a family's sign-up).
- Both: `security definer`, `search_path = ''`, owner = the tables' owner (0003 C3h lesson), revoked from public / anon / authenticated / service_role, granted only to the registrar (§1.5).

### 1.5 The restricted login (Question 1)

Recommended: a new **`camps_registrar`**, created exactly like `testing_registrar` / `star_registrar` / `forms_registrar`: `login noinherit nocreatedb nocreaterole nobypassrls noreplication connection limit 5`, `statement_timeout 5s`, `idle_in_transaction_session_timeout 10s`, `search_path ''`, `usage on schema public`, execute on the two camp public functions, **nothing else**. No password in the file — set at CP3 as a SCRAM verifier made on Jeffrey's PC (SETUP 12d / 13e pattern). See §2.

### 1.6 Signatures and logging
- **Purge** (Question 7 for how long): `camp_purge_old_signatures()` sets `signature = null, signature_deleted_at = now()` for sign-ups whose camp's **last day** is more than N days ago; `for update skip locked`; no version bump; called as the last step of `camp_add_camp` and `camp_mark_paid` (no scheduled job — 0005 answer 3). With a long retention (e.g. 3 years) only a few rows ever expire at once, so these two calls are plenty.
- **Logging:** `change_log_write` (0003) on `camps`, `camp_days`, `camp_prices`, `camp_extras`, `camp_templates`, `camp_campers`, `camp_camper_days`, `camp_camper_extras`, `camp_payments` (all have a uuid `id`). **`camp_signups` gets its own log trigger** (copy of 0005's `testing_registrations_log`): `signature` → `"on file"` / null, `submission_id` and `waiver_text_signed` left out. Phones are logged as typed unless Question 8 says otherwise. A test proves `change_log` never contains `data:image`. `testing_refuse_truncate` on every new table.

---

## 2. Registrar and kill switch: copy Star's setup, or reuse Color Belt's? (Question 1)

| | **A. Copy Star's setup: own `camps_registrar` + own `CAMPS_REGISTRATION`** (recommended) | B. Reuse `testing_registrar` + `PUBLIC_REGISTRATION` |
|---|---|---|
| What it means | A fourth login like Star's and Forms'. Its own password, its own Hyperdrive `tkd-camps-registrar` (binding `HYPERDRIVE_CAMPS`), its own Production switch `CAMPS_REGISTRATION` (default off). | Grant the live Color Belt login execute on the 2 camp functions; same Hyperdrive `tkd-registrar`, same password, same switch. |
| Setup | One SCRAM password (≈ 5 min, SETUP pattern exists), one Hyperdrive config + binding (≈ 10 min), one variable. | None for the login. |
| Breaks anything live? | No. Color Belt's files and tests untouched. | **Yes:** `0005_tests.sql` T2a proves the registrar runs *exactly two* functions — it would fail on production until 0005's test is edited (a live Color Belt file). |
| Off switch | Each form can be stopped alone (as Star, SETUP 13g). | One switch and one `nologin` stop both forms; a password leak exposes both. |
| Blast radius of a Camps Function bug | Only camp functions. | The login can also write Color Belt registrations. |
| Database connections | +5 maximum (testing 5 + star 5 + forms 5 + camps 5 = 20 on the Free plan's pooler — checked at CP4; can lower to 3). | No extra. |

**Recommendation: A.** Star and Forms already chose it, it keeps the live Color Belt login and tests untouched, and each public form can be switched off on its own.

---

## 3. The public path

```
Family's phone ──> tkd-dashboard.pages.dev/camp/<code>     (static page camp.html, part of this repo's build)
       │  GET  /api/camp/<code>   ┐
       │  POST /api/camp/<code>   ├─ Pages Function functions/api/camp/[code].js
       ▼                          │    kill switch · origin · JSON type · size ≤ 100 KB · field limits ·
                                  │    honeypot · fill time ≥ 4 s · Turnstile siteverify (action
                                  │    "camp_signup") · client key (HMAC, IP never stored) · per-client limiter
                                  ┘    → ONE database function as camps_registrar
                 Hyperdrive tkd-camps-registrar (caching OFF) ──> Supabase pooler ──> Postgres
```

- **Address:** `/camp/<code>` (C7 mockups). `public/_redirects` gets `/camp/*  /camp  200` (pointing at `/camp`, not `/camp.html` — the pretty-URL loop 0005 found). `_routes.json` already limits Functions to `/api/*`, no change.
- **Function:** new `functions/api/camp/[code].js` + `functions/_lib/camp.js` (modelled line by line on `register.js`) + `functions/_lib/campDb.js` (the only two SQL calls, typed parameters, `prepare: false`, one client per request, closed with `waitUntil`). **Reused unchanged:** `http.js`, `clientKey.js`, `rateLimit.js`. `register.js` and `db.js` (live) are **not** edited.
- **Field limits in the Function** (like `register.js`'s `readFields` — they stop silly input early; the database repeats every check): body is a JSON object with only the listed keys; `children` an array of 1–3 objects with only the listed keys; each `day_ids` and each extra's `day_ids` an array of ≤ 10 strings, every one matching the uuid pattern, no repeats; ≤ 10 extras per child, `extra_id` uuid pattern; `age` a whole number (integer, not 9.5, not 1e9); `member` and `acknowledged` true/false; names ≤ 200 characters, phones ≤ 20, relations ≤ 80, paying by ≤ 20, signature ≤ 70 000, ack version ≤ 40; `expected_total_cents` an integer 0–600 000; `submission_id` uuid pattern; code `^[a-hjkmnp-z2-9]{8}$`. Anything else → `bad_request` (HTTP 400), no database connection opened.
- **Turnstile:** reuse the existing widget "TKD family form" (same hostname, same site key and secret — **no new Cloudflare Turnstile setup**). Tokens are made with action `camp_signup` so a Color Belt token can't be replayed on the camp form: `verifyTurnstile` (Function) and `getTurnstileToken` (page) each get an **optional** action argument, default `'register'` — Color Belt's behaviour and its 32 tests stay identical. These are the only two live public-path files touched (shared-file list, §4). **Note for the Star session:** its family form will need the same optional `action` argument when it is built — it can use this one once Camps is merged.
- **Kill switch:** `CAMPS_REGISTRATION` (Question 1). Missing binding or setting → fail closed (`not_open`).
- **Settings reused:** `TURNSTILE_SECRET`, `TURNSTILE_SITE_KEY`, `CLIENT_KEY_SECRET`, `PUBLIC_ORIGIN`, optional `RATE_LIMITER`. New: `HYPERDRIVE_CAMPS`, `CAMPS_REGISTRATION`. Production only, so branch previews never reach the database.
- **Headers:** `public/_headers` gets the same strict CSP block as `/register` for `/camp`, `/camp.html` and `/camp/*` (self + challenges.cloudflare.com only, `img-src 'self' data:`, `frame-ancestors 'none'`). `/api/*` `no-store` already covers it.
- **Known limit — the desk tablet:** walk-ins signed up on the school's tablet (or on parents' phones on school Wi-Fi) all come from **one school IP**, so they share **one client key**. With the Color Belt / Star rule that is 20 tries per hour **shared with the other forms**, and failed tries count too. A busy first camp morning could hit it. Question 12 asks whether to give Camps its own count; either way it is tested at CP6 (several sign-ups in a row from the desk).
- **The page:** third Vite entry `camp.html` + `src/camp/**`. **Reuses from `src/register/`** by import (not copy): `SignaturePad.jsx`, `turnstile.js`, `format.js` helpers (dates, dollars, address line); the look from `src/styles/register.css` (header strip, 44 px buttons, 16 px fields on phones). **New** in `src/camp/`: `CampApp.jsx` (states C7a–d), `ChildCard.jsx` (name, age, member, day chips, extras with per-day chips, running price), `FamilyFields.jsx` (parent, emergency contact, paying by), `StepCheck.jsx`, `SignedUp.jsx`, `api.js`, `text.js`, plus `src/styles/camp.css`. Day chips use the dark outline (v0.237). No supabase-js, no dashboard code.
- **Preview:** `vite.config.js` rewrites `/camp/*` to `camp.html` in dev / preview mode; in preview mode the page uses `src/lib/camps/publicApi.preview.js` instead of `fetch`, behind `import.meta.env.MODE`, so no preview code reaches `dist/` (grep check).
- **No new dependencies.** QR uses the already-approved `qrcode-generator`; the Function uses the already-approved `postgres`.

---

## 4. Staff screens (mapped to C1–C7)

**New files**
| Screen | Files |
|---|---|
| Section + tabs (C1, C2) | `src/screens/Camps.jsx` (tabs Camps \| Templates, header **+ Add camp**, `N`) |
| C1 Camps list | `src/screens/camps/CampsTab.jsx` (Upcoming / Past, School column on Both, phone cards, Campers count via `campCounts`), `CampRowMenu.jsx` |
| C2 Templates | `TemplatesTab.jsx`, `TemplateRowMenu.jsx` |
| C2b Save as template | `SaveTemplateDialog.jsx` |
| C3 Add / Edit camp / Edit template | `CampDialog.jsx` (Start from + 5 folded sections, amber section on problems, Save from anywhere), `sections/CampSection.jsx`, `DayCalendar.jsx` (month calendar, tap days, dark outline, 44 px cells edge to edge at 320), `TimesSection.jsx`, `PricesSection.jsx`, `ExtrasSection.jsx`, `FamilyFormSection.jsx` |
| C4 Camp page | `CampPage.jsx` (header, Registration link primary, ⋯ Edit camp / Save as template / Close–Reopen sign-up / Print roster / Delete camp), `SummaryCards.jsx`, `DayFilter.jsx` (counts per day + per-day extras line; starts on today during camp week; 3-column grid on phones), `CamperRows.jsx`, `CamperRowMenu.jsx`, `RemovedGroup.jsx`, `DeleteCampDialog.jsx`, `PrintRoster.jsx` (print stylesheet) |
| C5 Registration link | `CampLinkDialog.jsx` (QR, link, Copy link + toast, **Download QR code** = PNG made in the browser from the SVG, no network) |
| C6 Camper detail | `CamperDialog.jsx` (read-only summary ↔ Edit details), `PaymentDialogs.jsx` (admin Edit payment, Change how they'll pay) |
| Wording | `src/screens/camps/text.js` |
| Styles | `src/styles/camps.css` |
| Data layer | `src/lib/camps/campRules.js` (pure: states, tags, price lookup, totals, owes, counts, template offsets, day labels — node-checkable, shared with the mock and the family page), `campsApi.js` (one function per §1.3 function + loaders), `qr.js` (`campLink(code)` → `https://tkd-dashboard.pages.dev/camp/<code>`, fixed production origin; `campQrSvgDataUrl`, `campQrPngBlob`), `checks.mjs`, `publicApi.preview.js` |
| Preview mock | `src/lib/mockCamps.js` |

**Reused as they are (imported, not moved, not copied):** `Dialog`, `RowMenu`, `Toast` + Undo, `ErrorBanner`, `Notice`, `IconButton`, `src/screens/testing/events/ConfirmDeleteDialog.jsx`, `ChoiceGroup.jsx`, `useLiveLoad.js` (15-second refresh, v0.157), `useShortcutN`, `useRowArrowNav`, `useMediaQuery`, `money.js`, `testing/names.js`, `eventRules.todayInSchoolTime` / `addDays`.
**Copied and adapted** (they are Color Belt-specific): `EventPage` → `CampPage`, `RosterRows` → `CamperRows`, `RegistrationLinkDialog` → `CampLinkDialog`, `StudentDialog` → `CamperDialog`, `EventDialog`'s dialog shell.
**Why not extract shared helpers now:** moving files out of `src/screens/testing/` would edit live Color Belt code and collide with the Color Belt session's branch. Importing the stable pieces gives the reuse without touching them. A later clean-up can move them into `src/components/` as its own small step.

**Shared files touched (exact list — conflict points at merge):**
`src/App.jsx` (routes `#camps`, `#camps/templates`, `#camps/camp/<id>`; Camps dialog-open flag like `testingModalOpen`) · `src/components/navItems.js` (Camps + `IconTent`) · `src/lib/pageAddress.js` (the `camps` hash) · `src/lib/mockClient.js` (plug in the camps backend + its helpers) · `vite.config.js` (third entry + `/camp/*` rewrite) · `public/_headers` · `public/_redirects` · `functions/_lib/turnstile.js` and `src/register/turnstile.js` (optional action argument only) · `supabase/tests/pglite/run.mjs` (a new step named `stepCamps`, not a number, to avoid the step-number clashes of earlier merges) · `supabase/SETUP.md` (a new section, number set at merge) · `README.md`, `docs/README.md`, the rulebook. **`src/styles/tokens.css`: no change expected** (if a token is missing, it is listed). `src/screens/Testing.jsx`: not touched.

---

## 5. Preview mode (fake database)

`npm run dev:preview-mode` from this worktree; Jeffrey gets the address (next free port).
- `src/lib/mockCamps.js`: every §1.3/§1.4 function, the view, the states, the money rules (through `campRules.js`, so mock and screens can't disagree), statuses, Undo window and snapshot rule — exactly as the database. Own localStorage key **`tkd.preview.camps`** (so Color Belt's `resetTesting()` never wipes camps, and their schema bumps can't collide). Reads the same `tkd.preview.today` key as Color Belt, so `setToday` moves both.
- **Default data = the mockups:** Columbus Day Camp (past, 9 campers), Veterans Day Camp (closed by hand, 16), Thanksgiving Camp (Worcester, open until Nov 24, 12, extras drop-off / pick-up), Winter Break Camp (Shrewsbury, not open yet), April Vacation Camp (Both schools, held at Worcester, 5 days, 18 campers incl. Leo Kim owing $15 and one removed camper); templates One-day holiday camp, Thanksgiving Camp, Vacation week, Summer week.
- Console helpers (`window.__tkdPreview`): existing `setRole`, `failNextSave`, `simulateOtherAdminEdit`, `setToday('2027-04-19')`, `lockNow`; new `resetCamps()`, `setCampsRegistration(false)`, `simulateFamilySignup('<code>')` (adds a sign-up as if from a phone — to watch the 15-second refresh), and the family-form switches `forceVerifyFailed(true)` / `forceRateLimited(true)` / `forcePriceChanged(true)` working on `/camp/<code>` too.
- The family page runs at `/camp/<code>` in preview with the same answers as the real Function (no Turnstile).

---

## 6. Tests

**Database** (`supabase/tests/0013_tests.sql` + PGlite step `stepCamps`, run before AND after seeded camps; prints `ALL 0013 TESTS PASSED`; also re-runs 0005 / 0006 tests to prove nothing of theirs changed):
1. **Role gates:** anon nothing; authenticated only the staff functions; locked / PIN-locked / signed-out / magic-link / 8-day sessions → `no_access`; every A / S line of §1.3 (staff refused on admin lines, the 10-second own-payment Undo; the phone rule of Question 3).
2. **Registrar catalog proofs** (as 0005 T2a / Star): in schema `public` `camps_registrar` can execute exactly `camp_public_camp` + `camp_public_signup`; no table / view / sequence rights anywhere; no CREATE on any schema; not a member of anything; `authenticator` can't become it; attributes as §1.5; `testing_registrar`, `star_registrar`, `forms_registrar` can't run camp functions and `camps_registrar` can't run theirs; owners of all 0013 functions = the tables' owner.
3. **Price lookup:** every day count × member / non-member × early / regular; grid must be exactly 1…N rows (missing / extra / duplicate row → `invalid`).
4. **Extras:** once, per day (days ⊆ camper days), not-for-all-days refused for an all-days camper and allowed otherwise; the four mockup totals above ($166, $390, $245, Owes $15).
5. **Snapshot + Owes:** edit the camp grid / an extra price after sign-ups → existing totals unchanged; Edit details adding a day / extra → new parts at current prices, Owes = total − net paid; name-only edit → no price change; remove after paying → Paid with overpaid amount; Mark paid records exactly owes; `already_paid`; double click with old version → `stale`; **a sign-up or edit with a total over $2,000 → `invalid`**.
6. **Sign-up date in America/New_York:** 11:59:59 PM vs 12:00:00 AM on `early_until` (early vs regular), on `signup_opens_on` and `signup_closes_on`; `closed_by_hand`; `finished` after the last day; walk-in on a camp day when the closing date allows it.
7. **Both-schools visibility:** a Both camp held at Worcester appears in the Worcester, Shrewsbury and Both queries the app uses; a Worcester-only camp only in Worcester and Both (tested against `campRules.campsForLocation` and the SQL the loader sends).
8. **Payments append-only:** UPDATE refused; DELETE refused outside a camper / camp delete; reversal = minus original, can't be reversed; edit = reversal + new; delete camper with wrong expected payment ids → `stale`; delete camp with wrong count / total → `stale`.
9. **Delete cascade:** delete a camp whose campers have days, per-day extras, once extras and payments (incl. a reversal) → `ok`, zero camp rows left, all removals in `change_log`; removing a picked day through `camp_update_camp` → `not_empty`; removing it any other way is still stopped by the `no action` key.
10. **Public sign-up:** idempotent `submission_id` (same camp → same answer, other camp → `invalid`); every refusal status; day / extra id from another camp → `invalid`; 1–3 children only; phone and age rules; `price_changed`; rate limit (Question 12) with rows marked `camp:`. **Bad jsonb, each answering `invalid` AND writing an attempt row:** a malformed uuid in `day_ids`, a fractional age (9.5), a huge age (1e9), a string age, `day_ids` given as a string or an object, `extras` as an object, unknown keys, 4 children, 11 day ids, repeated day ids.
11. **Signatures:** prefix / alphabet / 70 000 cap; purge after N days (no version bump, only from staff functions); signature column not readable by authenticated; `camp_roster.signed` comes from `signed_at`; **`change_log` never contains `data:image`** (sign-up, edit, purge, delete).
12. **Templates:** save from a camp (dates → days-before), duplicate name → `duplicate_name`, the jsonb check refuses bad shapes (incl. wrong types), edit / delete never touch camps.
13. **change_log:** one row per write with the right `camp_…` action and actor ("Family form" for sign-ups), batch ids shared within one call.
14. **Catalog:** RLS on all new tables, `search_path = ''` on all functions, security definer only where listed, every logged table has a uuid `id`, no PUBLIC execute on any 0001–0013 function; `0013_fingerprints.sql` for the production comparison.

**Function** (`functions/tests/camp.test.mjs`, plain Node, fake database + fake Turnstile): kill switch, missing binding, wrong origin / type, oversized body, every field limit of §3 (4 children, 11 day ids, a bad uuid, age 9.5, age as text, member as text, long phone, unknown key → `bad_request` without a database call), honeypot, too fast, Turnstile fail / wrong host / wrong action (a `register` token refused), unknown or malformed code, every database status mapped, no error text or names leaked, never logs phones or signatures. **Color Belt's 32 tests must still pass unchanged.**

**App checks** (`node src/lib/camps/checks.mjs`): `campRules` states, tags, price table, totals, owes, counts, template offsets, Both-school filtering — the **same case table** the SQL tests use; the mock answers like the database.

**Builds:** `npm run build` and `npm run build:preview-mode` pass; grep `dist/`: no preview code, no supabase-js in the `camp` bundle, no `service_role`, no secrets; line endings unchanged; every new file has its header comment.

---

## 7. Build split (like CONTRACT-0005)

First the orchestrator writes **`docs/Dashboard Docs/Build contracts/CONTRACT-0013.md`** (exact names, arguments, answers, wording sources), has it reviewed by a separate agent, then four builders work in parallel. No two builders edit the same file. Builders don't touch Supabase, Cloudflare, git remotes or other worktrees, and don't commit.

| Builder | Owns | Must not edit |
|---|---|---|
| **A — database** | `supabase/migrations/0013_camps.sql`, `supabase/tests/0013_tests.sql`, `0013_fingerprints.sql`, `supabase/tests/pglite/run.mjs` (step `stepCamps` only), `supabase/SETUP.md` (new Camps section only, incl. the CP5 test snippet) | 0001–0012, `src/`, `functions/` |
| **B — public path** | `functions/api/camp/[code].js`, `functions/_lib/camp.js`, `functions/_lib/campDb.js`, `functions/_lib/turnstile.js` (optional action only), `functions/tests/camp.test.mjs`, `camp.html`, `src/camp/**`, `src/register/turnstile.js` (optional action only), `src/styles/camp.css`, `public/_redirects`, `public/_headers`, `vite.config.js` | `src/screens/**`, `src/lib/**` (imports C's modules) |
| **C — data layer + mock** | `src/lib/camps/**` (`campRules.js`, `campsApi.js`, `qr.js`, `checks.mjs`, `publicApi.preview.js`), `src/lib/mockCamps.js`, `src/lib/mockClient.js` | UI, styles, `supabase/`, `functions/` |
| **D — staff screens** | `src/screens/Camps.jsx`, `src/screens/camps/**`, `src/styles/camps.css`, `src/App.jsx`, `src/components/navItems.js`, `src/lib/pageAddress.js`, `README.md` | files of A–C |
| Orchestrator | contract, rulebook, status file, `docs/README.md`, commits on `camps` | |

Then:
1. **Security review** (separate agent) of A + B together: registrar proofs, grants, the public functions' checks (incl. the jsonb shape check and `data_exception`), the Function's field limits, CSP, secrets grep, phones never in lists or logs beyond the agreed rule.
2. **Design review** (separate agent) of D + B against C1–C7d and the rulebook, with screenshots at **1280×800, 820×1180 touch, 390×844 touch, 320 wide**, the family page in every state.
3. Fix round(s) by the builders; re-review until no Critical / High.
4. Checks of §6 all green; commit on `camps` (no push).

---

## 8. Checkpoints (in the order they happen; each needs Jeffrey's OK)

| CP | What | Who |
|---|---|---|
| **CP0** | This plan OK; the open questions (§10) answered **one at a time**, each recorded in the status file + rulebook; migration number rechecked on every branch; contract written and reviewed. | Jeffrey + Claude |
| — | Build (§7), reviews, fixes, commit. | builders, reviewers |
| **CP1** | **Preview walkthrough** (`npm run dev:preview-mode`): make a camp from blank and from a template, Both schools, change days / prices, Save as template, the family form on a phone-size window (2 children, extras, sign), watch it appear on the roster within 15 s, Mark paid + Undo, Edit details → Owes → Mark paid $X, Withdraw / Restore, Delete, Close sign-up, Print roster, Download QR. Any new wording (e.g. `price_changed`) approved here. | Jeffrey |
| **CP2** | **Cloudflare variable** (he clicks; nothing secret in chat): Production variable `CAMPS_REGISTRATION=off`. Turnstile and the other secrets are reused — nothing new there. Written as SETUP steps first. | Jeffrey, step-by-step |
| **CP3** | **Production database:** run the tests already on production first (PIN, 0002–0006, 0010 and any later ones that are live); Claude checks read-only that no `camp_` object or `camps_registrar` exists; Jeffrey pastes `0013_camps.sql` in the SQL Editor; sets the `camps_registrar` password as a SCRAM verifier made on his PC (new password-manager entry, never in chat or screenshots); read-only checks: `0013_fingerprints.sql` = PGlite, earlier fingerprints unchanged, security advisor only the expected notices; Jeffrey runs `0013_tests.sql`, then the earlier tests again. | Jeffrey pastes, Claude checks read-only |
| **CP4** | **Hyperdrive** `tkd-camps-registrar` (session pooler, user `camps_registrar.<ref>`, caching **disabled**, verify-full TLS, origin connection limit ≤ 5), bound as `HYPERDRIVE_CAMPS` on Production only. Check the pooler's connection budget. (It needs the login from CP3, so it comes after it.) | Jeffrey, step-by-step |
| **CP5** | **Staff side on the real database** (local app from this worktree): a **TEST camp** — Add from blank, Edit, Save as template, Use template, Registration link + QR + Download, Close / Reopen sign-up. Then Jeffrey pastes a **SETUP snippet** in the SQL Editor that calls **`public.camp_public_signup(…)`** — the real function, never a direct insert — for the TEST camp's code with two children "Test One" / "Test Two", a fixed `cp5-test` client key and a tiny test signature (a few-byte PNG data URL). On the local app: the two campers appear; Mark paid + Undo; Edit details add a day → Owes → Mark paid $X; admin Undo / Edit payment; Withdraw / Restore; Delete camper; Delete camp. Read-only check: every step in `change_log` (no `data:image`), the attempt row `camp:ok`, then zero camp rows left. The snippet holds no secret and is blanked afterwards anyway. | Jeffrey + Claude |
| **CP6** | **Deploy.** Main session merges `camps` into `main` (rulebook versions renumbered after the highest on `main`; migration number checked), push **only with Jeffrey's OK**, `CAMPS_REGISTRATION` still off. Live checks: dashboard loads, `/camp/<x>` has the strict CSP, `/api/camp/<x>` answers `not_open`. **Part 2 — the phone path only** (the roster was proved at CP5): TEST camp Open, `CAMPS_REGISTRATION=on` + redeploy, Jeffrey signs up 2 children from his phone, then a few sign-ups in a row from the desk tablet (rate-limit check); they show on the roster within 15 s; read-only check: attempt rows, Hyperdrive cache off; delete the TEST camp and check zero camp rows remain. Then the first real camp is made; its link goes to families after Jeffrey has tried it once. | Main session + Jeffrey |

**Rollback (any time, fastest first):**
1. SQL Editor: `revoke execute` on the two camp public functions from `camps_registrar` — instant, even on open Hyperdrive connections; the page shows "try again".
2. `CAMPS_REGISTRATION=off` (Production) + Retry deployment.
3. `alter role camps_registrar nologin`.
4. Cloudflare Pages → roll back to the previous deployment (staff screens gone; data stays).
5. Only before any real camp data: the "Undo 0013" script in SETUP (tested in PGlite; `change_log` and `testing_public_attempts` rows stay). Color Belt, Star and Forms are not affected by any of these.

---

## 9. Risks

| Risk | What the plan does |
|---|---|
| Second kind of public page into a database about minors — and this one collects **parent and emergency phone numbers** | Restricted login with 2 functions only; both re-validate everything (shape before cast, `data_exception` caught); Turnstile + honeypot + timing + field limits + two rate limits; phones only in one detail read function, never in lists; security review focused here; TEST sign-up before real use. |
| Untracked tries through malformed input | jsonb shape and uuid pattern checked before any cast; wrapper catches `data_exception`; every call writes an attempt row (tested). |
| Delete camp failing on its own cascade | `no action` keys instead of `restrict`; tested with a full camp. |
| Migration number clash | 0013 (0010–0012 taken); re-check before Builder A and at merge. |
| Price edits during an open sign-up confuse families | Snapshot at sign-up; `price_changed` refusal if the total changed while they filled the form; early / regular decided by the database's clock. |
| Owes / overpaid edge cases after staff edits | One money rule in SQL with a JS twin tested against the same case table; snapshot rule written down (§1.2); $2,000 cap per camper. |
| Desk tablet walk-ins hit the rate limit (one school IP) | Known limit; Question 12; tested at CP6. |
| Same child signed up twice (page reloaded = new submission) | Question 11; staff can always Delete permanently. |
| Free-plan pooler connection budget with a 4th registrar | Connection limit 5 (or 3), checked at CP4; Supabase Pro already an open item before daily use. |
| Editing two live public-path files (`turnstile.js` ×2) | Optional argument with the old default; Color Belt's 32 function tests and its live form re-checked at CP6. |
| Merge conflicts in shared files (App.jsx, mockClient.js, run.mjs, SETUP, rulebook) | Exact list in §4; named PGlite step; merge small and early through the Main session. |
| Secrets leaking (registrar password) | SCRAM verifier made locally; only in Hyperdrive + password manager; reviewer greps the diff; never in screenshots (the Color Belt CP2b lesson). |
| Waiver signature deleted too early for an injury claim | Question 7; the sign-up keeps "signed on the form, date" and the exact waiver text it signed. |

---

## 10. Open questions for Jeffrey (one at a time, each with a picture where it helps)

1. **Public-form setup: copy Star's setup?** **A. own login `camps_registrar` + own switch `CAMPS_REGISTRATION`** (recommended, §2) · B. reuse Color Belt's `testing_registrar` + `PUBLIC_REGISTRATION` (one switch stops both; breaks a live 0005 test).
2. **Who sets up camps and templates** (Add / Edit / Delete camp, Save / Edit / Delete template)? **A. admins only, staff run the roster** (recommended; like Color Belt events) · B. staff too.
3. **Can the shared Staff desk login see parent and emergency phone numbers in the camper detail (C6)?** (Handoff §6: each section decides viewing too.) **A. yes, staff and admins, in the detail only** (recommended — the desk is who calls a parent when a child is sick or not picked up during camp) · B. admins only (the desk would have to find an admin to call a parent).
4. **Editing prices after sign-ups exist.** **A. allowed; existing campers keep their price; new prices apply to new sign-ups and to a camper only when staff change that camper's days / member / extras** (recommended) · B. prices lock once a camp has campers · C. re-price everyone (not recommended: surprise "Owes" for families who already paid).
5. **Changing a camp's days when campers exist.** Note: the approved mockups (v0.237) accepted the proposal "changing a camp's days asks first if any price would change" — option B below *is* that accepted proposal; option A would **replace it** and needs a new rulebook row. **A. adding a day is allowed; removing a day somebody picked is refused** — move those campers first with Edit details (recommended: simpler, no automatic price changes for families) · B. warn first, then remove the day from those campers and re-price them (the accepted proposal).
6. **Removing days or extras from a camper who already paid.** **A. allowed; the tag stays Paid, the detail shows "Paid $X more than the total", and an admin uses Edit payment to record any money handed back** (recommended) · B. refused once paid.
7. **How long to keep the drawn waiver signature.** A. 90 days after the camp's last day (same as Color Belt) · **B. 3 years after the camp** (recommended — a waiver may matter if an injury claim comes later; ask the school's insurer, this is not legal advice) · C. keep forever. The "signed on the form, date" line and the waiver text are kept in every option. (With 3 years, running the clean-up from Add camp and Mark paid is enough — no scheduled job.)
8. **Phone numbers in the history (change log).** **A. logged like every other field** (recommended; the history is staff-only; same as Star's date of birth, v0.169) · B. masked in the history.
9. **Where "Close sign-up" lives** (approved in C1, not drawn). **A. camp page ⋯ and Camps list row ⋯: "Close sign-up" / "Reopen sign-up", staff and admins, 5-second Undo** (recommended) · B. a switch inside Edit camp → 2. Times (admins only). A small picture will be shown.
10. **Prices changed while a family was filling the form** (an admin edit, or the early price ending at midnight). **A. the sign-up is refused with "The price for this camp just changed. Please check the new total and sign again."** (recommended — the family never pays more than the total they signed for) · B. accept and show the real total on the confirmation (the simpler build: no extra state, no new wording).
11. **The same child signed up twice** (e.g. the page was reloaded, which makes a new submission). **A. nothing automatic; staff remove the copy with Delete permanently** (recommended; matches the approved mockups, which show no duplicate box) · B. Color Belt's "possible duplicate" flag + compare box (more build, new screens to approve).
12. **Rate limit for the desk tablet** (§3 known limit). A. keep Star's rule: 20 tries per hour per connection, shared with Color Belt and Star, failed tries count · **B. Camps counts only its own `camp:` rows, 30 per hour** (recommended — a busy camp morning at the desk isn't blocked by the other forms; Color Belt and Star stay unchanged) · C. another number (say which).
13. **Ages the form accepts.** **A. 3 to 17** (recommended) · B. a different range (say which).

---

## 11. After the build (housekeeping)

Status file updated at every step; rulebook rows for any decision from §10 (re-read the rulebook first, CRLF kept, rows above `| Approved 2026-10-16 (v0.26) |`, changelog appended); handoff §9 and `docs/README.md`; SETUP section number set at merge; claude.ai reading copies of the changed `.md` files; tell the other sessions that `testing_public_attempts` now also holds `camp:` rows, and tell the Star session about the optional Turnstile `action` argument.

---

## 12. Review fixes (2026-10-19)

Changes made after the independent review of the first draft:

**Must**
- **M1** `camp_public_signup` checks the jsonb shape, types and uuid pattern **before any cast** (`camp_children_arg_is_valid`), and the wrapper also turns `data_exception` (Postgres error class 22) into `invalid`, so every call still writes an attempt row (§1.4). New tests: malformed uuid, fractional age, huge age, string age, wrong-type arrays, unknown keys — each `invalid` with an attempt row (§6 test 10).
- **M2** `camp_camper_days` gets its own `id uuid primary key` + `unique (camper_id, day_id)`; `camp_camper_extras` keeps its `id` + unique key. Noted that `change_log_write` needs a uuid `id` on every logged table; catalog test added (§1, §1.1, §6 test 14).
- **M3** `on delete restrict` replaced by the default `no action` on the camper-day / camper-extra keys, so Delete camp's cascade can't fail; "a picked day or extra can't be removed" stays in `camp_update_camp` (§1.1). New PGlite test deleting a full camp (§6 test 9).
- **M4** The days question (now Q5) says plainly that v0.237 accepted "asks first if any price would change": A (refuse removing a picked day) replaces it and needs a new rulebook row; B (warn, then re-price) is the accepted proposal. Recommendation kept: A.

**Should**
- **S1** Function-side field limits written out (§3); Function tests for them (§6).
- **S2** `camp_roster.signed` = `signed_at is not null`; the view never reads `signature` (§1.3, §6 test 11).
- **S3** New Q11: duplicate sign-ups.
- **S4** Desk-tablet rate-limit limit described (§3, §9) + new Q12; tested at CP6.
- **S5** The real-database staff check (now CP5) uses a SETUP snippet that calls `camp_public_signup(…)` for the TEST camp, so the roster, payments, Owes, Withdraw and Delete are proved locally before deploy; the deploy checkpoint (CP6) only proves the phone path (§8).
- **S6** The "no two upcoming camps with the same name" rule is dropped (§0, §1.1).
- **S7** A camper total over $2,000 → `invalid` on sign-up and Edit details; tested (§1, §1.2, §1.4, §6 test 5).

**Nice**
- **N1** Migration 0013 stated as a fact, no longer a question; the registrar and kill-switch questions merged into Q1 ("copy Star's setup").
- **N2** Q10 notes that B (accept and show the real total) is the simpler build.
- **N3** Status `finished` (0005's name) instead of `done`; "Done" stays the screen word.
- **N4** Checkpoints renumbered in the order they happen: CP0 plan · CP1 preview · CP2 Cloudflare variable · CP3 database · CP4 Hyperdrive · CP5 staff side on the real database · CP6 deploy + phone test.
- **N5** Every action tag starts with `camp_` (e.g. `camp_delete_camper`, `camp_delete_camp`).
- **N6** `source` column and the 31-day spread rule dropped; the C1 Campers count is loaded from `camp_roster` (`camp_id, status`) and counted in `campRules.campCounts` (§1.3).

**Added questions:** Q3 (can the shared Staff desk login see phone numbers in C6); a note in Q7 that with 3-year retention the purge in Add camp / Mark paid is enough.
**Added note:** the Star session will need the same optional Turnstile `action` argument (§3, §11).
