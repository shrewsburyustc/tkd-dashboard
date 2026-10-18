# Contract 0005 — Color Belt testing phase 2: Events, family form, roster with payments, Settings → Schools

The single source of truth for the four parallel builders: **A database**, **B public path**, **C data layer + preview mock**, **D staff screens**. Follow it exactly so the parts fit. If something here is impossible or contradicts the sources below, **stop and report it** — do not improvise.

| Source (in this order of authority) | |
|---|---|
| This contract | wins for phase 2 |
| Build plan `docs/Testing/Color Belt Testing/TKD-Testing-Phase2-Build-Plan.md` — **§6 answers and §8 review changes override §0–5** | OK'd by Jeffrey 2026-10-17 (CP0) |
| Status file `docs/Testing/Color Belt Testing/TKD-ColorBelt-Status.md` — phase 2 decisions Q1–Q9 + plan answers 1–9 | |
| Approved mockups (wording and layout source): `TKD-ColorBelt-Events-Mockups.html` (E1–E14), `TKD-ColorBelt-Roster-Mockups.html` (R1–R8), `TKD-ColorBelt-Form-Mockups.html` (F1–F15), `docs/Dashboard Docs/TKD-Settings-Schools-Mockups.html` (S1–S3), and the later images `Phase 2 images/ColorBelt-mark-paid.png` (replaces R5) and `ColorBelt-Q-add-student.png` option B (moves Add student) | approved 2026-10-17 |
| Rulebook `docs/Dashboard Docs/TKD-Dashboard-Design-Guidelines.md` (phase 2 rows are added before building — see §9) | |
| Handoff `docs/Dashboard Docs/TKD-Dashboard-Handoff.md` §6 (security rules, non-negotiable) | |
| Existing code: migrations 0001–0004 (live in production — **never edit**), CONTRACT-0003, `src/` | |

**Working copy:** the Color Belt worktree, branch `color-belt`. Do not touch Supabase (no connector calls), Cloudflare, git remotes, other worktrees or the main folder. Do not commit; the orchestrator commits.
**Audience:** Jeffrey is learning IT — every new file starts with a header comment (what + why); short plain-English comments on non-obvious lines; readable over clever. Files use the line endings of their neighbours (CRLF in this repo — check before and after).
**Production facts:** Supabase project `tkd-dashboard` (ref `eozkfbdfxqlcbpewhach`), PostgreSQL 17.11, Free plan. Live: 0001, 0002, 0003 (+ seed), 0004. Staff: Main Admin (admin), Staff (shared desk, role staff). The site is Cloudflare Pages `tkd-dashboard.pages.dev`; a push to `main` deploys.

---

## 0. File ownership (no two builders edit the same file)

| Builder | Owns (creates / edits) | Must not edit |
|---|---|---|
| **A — database** | `supabase/migrations/0005_testing_events.sql` · `supabase/tests/0005_tests.sql` · `supabase/tests/0005_fingerprints.sql` · `supabase/tests/pglite/*` (runner: add 0004 + 0005, the registrar-role checks, a seeded event) · `supabase/SETUP.md` (new §12 only) | 0001–0004, `src/`, `functions/`, `docs/` |
| **B — public path** | `functions/api/register/[code].js` · `functions/_lib/*` (helpers) · `functions/tests/*.mjs` (Node tests, run with `node --test functions/tests/`) · `register.html` · `src/register/**` · `src/styles/register.css` · `public/_redirects` · `public/_routes.json` (Functions only on `/api/*`) · `public/_headers` · `vite.config.js` (second entry + the dev/preview rewrite of `/register/*` to `register.html`) · `package.json` / `package-lock.json` (only the two pinned dependencies of §4.6 — **B adds both first**, C then uses `qrcode-generator`) | `src/screens/**`, `src/components/**`, `src/lib/**` (B only imports C's modules) |
| **C — data layer + mock** | `src/lib/testing/eventsApi.js` · `src/lib/testing/eventRules.js` · `src/lib/testing/qr.js` · `src/lib/settings/schoolsApi.js` · `src/lib/mockTestingEvents.js` · `src/lib/mockTesting.js` (store schema bump only) · `src/lib/mockClient.js` · `src/lib/testing/checks.mjs` (add groups) · `src/lib/testing/publicApi.preview.js` (the preview-mode stand-in for the Function — §4.5 interface; B imports it) | UI, styles, `supabase/`, `functions/`, `src/register/**` |
| **D — staff screens** | `src/screens/Testing.jsx` (add the Events tab) · new `src/screens/testing/events/*` · new `src/screens/testing/event/*` · new `src/screens/Settings.jsx` + `src/screens/settings/*` · `src/App.jsx` (routes `#testing/event/<id>`, `#settings`) · the account menu component (the file that renders "Staff accounts" under Admin after `main` is merged — add Settings below it) · `src/screens/testing/text.js` (+ new `src/screens/settings/text.js`) · `src/styles/testing-events.css`, `src/styles/settings.css` · `README.md` | files owned by A–C |
| Orchestrator | this contract, rulebook, status, handoff, `docs/*`, commits | |

C returns codes, never words; D (staff) and B (family pages) own all wording. B and D import C's modules by the exact names in §5.

---

## 1. Database — `0005_testing_events.sql`

### 1.1 General rules (same as 0003 §1.1 — repeated because they are non-negotiable)
- Schema `public`; tables `testing_*`; owner `postgres`. **One transaction**, **safe to re-run** (`if not exists`, `create or replace`, `drop … if exists` + create for triggers/policies/old signatures), header comment like 0003's (incl. "Supabase will warn about destructive operations…").
- Every function: `set search_path = ''`, fully qualified names, explicit `revoke execute … from public, anon, authenticated, service_role`, then grants only as listed in §1.9.
- Staff write functions: `security definer`, `returns jsonb`, check order exactly as 0003 §2.1 (has_data_access → role → argument shape → lock + look up → stale → relational → write), tag `tkd.action` / `tkd.batch_id` around writes and reset them, same error mapping table.
- **Time:** "today" is always `(now() at time zone 'America/New_York')::date`; no other time zone anywhere.
- Reuse 0003 helpers: `testing_normalize_name`, `testing_name_is_valid`, `testing_cents_is_valid`, `testing_belt_is_valid`. Logging: the 0003 `change_log_write` trigger (it reads `id` as uuid and `location_code` from the row) is attached to `testing_events`, `testing_event_classes`, `testing_event_ranks`, `testing_payments` and `locations`. **`testing_registrations` gets its own 0005 log trigger** that writes the same change_log row but replaces `signature` with `"signature": "on file" | null` and leaves out `submission_id` (handoff §6: no sensitive data in the log; a test proves `change_log` never contains `data:image`). **`testing_public_attempts` is not logged** (bigint id, no value) and gets no truncate guard. `testing_refuse_truncate` guards the other new tables. Actor label for the form: `set_config('tkd.actor_label', 'Family form', true)` inside `testing_public_register`.
- **Lock order** (every write): `locations` row → event → registration → payments (`for no key update` on parents, `for update` on the row changed), as 0003.
- Statuses: the 0003 set (`ok, no_access, not_allowed, not_found, stale, duplicate_name, invalid, not_empty`) plus `final_award_not_set`, `rate_limited`, `not_open`, `closed`, `finished`, `already_paid`, `withdrawn`.
- Random codes use core `gen_random_uuid()` bytes (`uuid_send(gen_random_uuid())`), not `gen_random_bytes` (it lives in `extensions` on Supabase and differs in PGlite).

### 1.2 `public.locations` — school addresses (Settings → Schools)
Add (re-run safe): `id uuid not null default gen_random_uuid()` + unique (`change_log.record_id` is a uuid), `address_street text null` (≤ 100), `address_city text null` (≤ 60), `address_state text null` (2 capital letters), `address_zip text null` (`^\d{5}(-\d{4})?$`), `version integer not null default 1`, `updated_at`, `updated_by`, `updated_by_name` (maintained by a before-update trigger like 0003's `*_before_write`: version bumps only when an address part changes). All four address parts are null together or all set (check). Log trigger added (its `location_code` is null on these rows — the column is `code`; accepted). Grants: `select (code, name, id, address_street, address_city, address_state, address_zip, version)` to authenticated.
`settings_update_school_address(p_code text, p_expected_version integer, p_street text, p_city text, p_state text, p_zip text)` — admin; all four null = clear; trims; action `update_school_address`; returns `{status, version}`.

### 1.3 `public.testing_events`
| Column | Rule |
|---|---|
| `id uuid pk default gen_random_uuid()` | |
| `location_code text not null` | FK → locations(code); immutable (trigger) |
| `name text not null` | `testing_name_is_valid`; unique per school on `lower(testing_normalize_name(name))` → `duplicate_name` |
| `testing_date date not null` | add/edit: must be today or later (edit of a past event may keep its date) |
| `registration_open boolean not null default false` | new events start **Closed** (Star v0.85) |
| `auto_close_on date null` | ≤ testing_date and ≥ today on Add / whenever it is changed (`invalid`); default on Add = testing_date − 7 (client fills, server accepts null) |
| `first_opened_at timestamptz null` | set the first time registration is opened (drives "Not open yet") |
| `public_code text not null unique` | 8 chars from `[a-z2-9]` minus look-alikes, made by the server from `gen_random_uuid()` bytes; never changes |
| `note text null` | ≤ 600, the "Note for families" (Star v0.87 More details) |
| `version`, `created_at/by/by_name`, `updated_at/by/by_name` | as 0003 |

**State (derived — one SQL function `testing_event_state(e)` used by every function, mirrored exactly by `eventRules.eventState`), checked in this order:**
1. `finished` — today > testing_date.
2. `open` — registration_open and (auto_close_on is null or today ≤ auto_close_on). (Includes the testing day itself: families can register on the day if it is still open, Star v0.88 "closes at the end of the testing day".)
3. `closed_by_date` — registration_open and today > auto_close_on.
4. `not_open_yet` — first_opened_at is null (never opened; also when the closing date has passed without ever opening).
5. `closed` — closed by hand.

**Tag** (staff list, Star v0.88): `finished` → Finished · today = testing_date → **Testing today** (whatever the state) · `open` → "Open until <auto_close_on>" or "Registration open" · `closed_by_date` / `closed` → Registration closed · `not_open_yet` → Not open yet.
**Public statuses** (form, §1.8 / §4): `open` → the form · `not_open_yet` → `not_open` (F11) · `closed_by_date` → `closed` with `closed_on` = auto_close_on (F12) · `closed` → `closed` with `closed_on` null (F13) · `finished` → `finished` (F14) · unknown code → `not_found` (F15).
**Registration switch** `testing_set_registration(p_open)`: closing — staff and admins, any time before finished. Opening — when auto_close_on is null or today ≤ auto_close_on: staff and admins. When the closing date has passed (from `closed_by_date`, `closed` or `not_open_yet`): **admins only**, and opening clears `auto_close_on` (Star v0.87, admins can open any time before finished); staff → `not_allowed`. Nothing changes the switch once `finished` (`finished`).

### 1.4 `public.testing_event_classes` and `public.testing_event_ranks` (the event's own copy — Q3, Q5)
`testing_event_classes`: id · event_id (FK on delete cascade) · class_id uuid (no FK) · class_name · position · start_time time · end_time time (end > start) · final_award_kind (`rank` | `none`) · final_award_name null · final_award belt (five `fa_belt_*` columns, null for none) · unique(event_id, class_id).
`testing_event_ranks`: id · event_class_id (FK on delete cascade) · rank_id uuid (no FK) · name · position · five `belt_*` · early_cents · day_cents · private_cents · sparring_gear · unique(event_class_id, position).
**Copy rule:** when a class is added to an event (Add event, or ticking it in Edit event) its current name, ranks, belts, prices, sparring gear and final award are copied from Classes and ranks **at that moment**; nothing ever updates the copy afterwards (no per-event price editing — plan answer 5). A class whose final award is **Not set** can't be added → `final_award_not_set` (with the class name in the answer) — the screen says to set it in Classes and ranks first.
Unticking a class that has registrations (active or withdrawn) → `not_empty`. Changing times is always allowed.
**Testing for** (derived, `eventRules.testingFor`): the next rank in the same event class; for the last rank the class's final award copy (`none` → "No new rank").
**Fee** (`eventRules.feeFor` and the SQL twin): early_cents if the payment date < testing_date, else day_cents. Private price is not used in phase 2.

### 1.5 `public.testing_registrations`
id · event_id (FK cascade) · event_rank_id (FK → testing_event_ranks; must belong to the same event — checked in every function) · first_name, last_name (name rule, ≤ 60 each) · `paying_by` (`cash` | `check` | `card`; the form allows cash/check only) · `stripes_confirmed boolean not null` (must be true) · `source` (`form` | `staff`) · `reference text unique` (`'CB-' || nextval('testing_registration_ref_seq')`, sequence starts at 3101) · `submission_id uuid null unique` (form only) · `signature text null` (form only: must start `data:image/png;base64,`, total length ≤ 70 000) · `signed_at timestamptz null` · `signature_deleted_at timestamptz null` · `ack_version text null` (form only; current value `cb-2026-10-17`) · `registered_at timestamptz` · `status` (`active` | `withdrawn`) · `withdrawn_reason` (`withdrawn` | `duplicate_copy`) null · `withdrawn_at`, `withdrawn_by_name` · `duplicate_state` (`none` | `possible` | `kept_both`) · `duplicate_of uuid null` · version, created/updated.
**Signatures are never granted to any client role** (not even authenticated). Signature text: prefix `data:image/png;base64,` + base64 alphabet only (`^[A-Za-z0-9+/]+={0,2}$` after the prefix), total ≤ 70 000 characters. Clean-up (plan answer 3): `testing_purge_old_signatures()` sets `signature = null, signature_deleted_at = now()` for registrations whose event's testing_date < today − 90; called as the **last step** (after the function's own write, inside the same transaction) of `testing_add_event` and `testing_mark_paid`, and at the end of `testing_public_register`; it uses `for update skip locked` so it never waits on staff locks (no scheduled job). The purge **does not bump `version` or `updated_*`** (the before-write trigger skips signature-only changes) and its log row shows only `"signature": "on file" → null`. Tested.
**Possible duplicate** (Star v0.97/v0.114, by class instead of date of birth): `duplicate_of uuid null` FK → registrations **on delete set null**. Recomputed on insert, on a name/belt edit and on Restore: another **active** registration in the same event with the same normalized first + last name → `possible` + `duplicate_of` (unless the pair was `kept_both`); no match any more → back to `none`, `duplicate_of` null. If the registration it points at is deleted or withdrawn, the remaining one goes back to `none`. Accepted silently on the form.

### 1.6 `public.testing_payments` (append-only)
id · registration_id (FK **on delete cascade** — plan answer 8) · `kind` (`payment` | `reversal`) · amount_cents (payment: > 0 and ≤ 100 000; reversal: exactly minus the reversed payment) · method (`cash` | `check` | `card`) · paid_on date · recorded_at timestamptz · recorded_by uuid · recorded_by_name · `reverses_payment_id uuid null unique` (FK → payments, `on delete no action`; a reversal can't be reversed). UPDATE refused by trigger (append-only). DELETE refused by trigger **unless** it is part of a cascade from a registration / event delete (`pg_trigger_depth() > 1` or `current_setting('tkd.action', true) in ('delete_student','delete_event')`). `event_rank_id` FK on registrations is `on delete no action` (ranks are only deleted with their event). Logged.
**Paid** = sum(amount_cents) > 0 for the registration. No partial payments exist (one click pays in full — plan answer 6).

### 1.7 `public.testing_public_attempts`
id bigint identity · client_key text (HMAC from the Function — never a raw IP) · event_id uuid null · at timestamptz · outcome text. No client grants at all, not logged. Rows older than 2 days are deleted inside `testing_public_register`. **Every** call to `testing_public_register` inserts one row (outcome = the status returned, incl. `ok`); the rate limit counts all rows for that client_key in the last hour.

### 1.8 Functions
Staff (authenticated; `has_data_access()` first). Roles: **A** = admin only, **S** = staff and admin (Star v0.86, v0.110; Q9; plan answers).

| Function | Role | Does | Ok answer |
|---|---|---|---|
| `testing_add_event(p_location_code, p_name, p_testing_date date, p_classes jsonb, p_registration_open boolean, p_auto_close_on date, p_note text)` — `p_classes` = `[{class_id, start_time "HH:MM", end_time}]` | A | creates the event + copies (§1.4); `registration_open` true also sets first_opened_at | `{status, id, public_code, version}` |
| `testing_update_event(p_event_id, p_expected_version, p_name, p_testing_date, p_classes jsonb, p_auto_close_on, p_note)` | A | name/date/note/closing date; class list diff: added → copied, removed → `not_empty` if registrations, times updated | `{status, version}` |
| `testing_set_registration(p_event_id, p_expected_version, p_open boolean)` | S / A — rules in §1.3 "Registration switch" | | `{status, version, state}` |
| `testing_delete_event(p_event_id, p_expected_version, p_expected_registration_count integer, p_expected_payment_total_cents integer)` | A | cascades; count = **all** registrations incl. withdrawn; total = **net** of reversals; `stale` if either differs from what the dialog showed | `{status}` |
| `testing_add_student(p_event_id, p_first, p_last, p_event_rank_id, p_stripes boolean, p_paying_by)` | S | source `staff`, any state except `finished` (`finished`) | `{status, id, reference, version}` |
| `testing_update_student(p_registration_id, p_expected_version, p_first, p_last, p_event_rank_id)` | S | belt/class change allowed (any state); payments untouched; duplicate recheck | `{status, version}` |
| `testing_change_paying_by(p_registration_id, p_expected_version, p_paying_by)` | S | not paid only (`already_paid`); not withdrawn (`withdrawn`) | `{status, version}` |
| `testing_mark_paid(p_registration_id, p_expected_version)` | S | locks the registration `for update`; `withdrawn` / `already_paid`; allowed in every state incl. `finished`; amount = `feeFor(rank, today)`, method = paying_by, paid_on = today; **bumps the registration's version** (so a double click gets `stale`) | `{status, payment_id, amount_cents, method, version}` |
| `testing_undo_payment(p_payment_id)` | S if `recorded_by = auth.uid()` and recorded_at > now() − 10 s; otherwise A (`not_allowed`) | writes the reversal; already reversed → `stale`; bumps the registration's version | `{status, version}` |
| `testing_edit_payment(p_payment_id, p_method, p_amount_cents, p_paid_on)` | A | reversal + new payment; already reversed → `stale` | `{status, payment_id, version}` |
| `testing_resolve_duplicate(p_keep_id, p_keep_version, p_other_id, p_other_version, p_keep_both boolean)` | S | keep one → other withdrawn as `duplicate_copy` (staff may do this one withdrawal, Star v0.110); keep both → both `kept_both` | `{status}` |
| `testing_withdraw_student(p_registration_id, p_expected_version)` / `testing_restore_student(…)` | A | | `{status, version}` |
| `testing_delete_student(p_registration_id, p_expected_version, p_expected_payment_ids uuid[])` | A | `stale` if the payments differ from what the warning named; cascades payments | `{status}` |
| `settings_update_school_address(…)` | A | §1.2 | `{status, version}` |

Reads (authenticated, RLS `has_data_access()`): column-granted selects on `testing_events` (including `public_code` — staff need the link), `testing_event_classes`, `testing_event_ranks`, and a view **`testing_roster`** (`security_invoker = true`) with: registration columns except `signature`, `submission_id`, `created_by`, `updated_by` (plus `signed_at is not null as signed`; `signature_deleted_at` tells "signature deleted after 90 days"); `class` fields from the event copy; `paid boolean`, `paid_cents`, `paid_on` (latest payment date), `paid_method`, `last_payment_id`, `last_payment_recorded_at`. Because the view runs with the caller's rights, authenticated gets **column `select` grants on every column the view reads**: `testing_registrations` (all except `signature`, `submission_id`, `created_by`, `updated_by`), `testing_event_classes`, `testing_event_ranks`, and `testing_payments` (`id, registration_id, kind, amount_cents, method, paid_on, recorded_at, recorded_by_name, reverses_payment_id` — not `recorded_by`). "Was this payment mine and recent?" (for the toast Undo) is answered by the database inside `testing_undo_payment`, not read by the client.

Public (role **`testing_registrar` only**, §1.10):
- `testing_public_event(p_code text) returns jsonb` → `{status:'ok', state, closed_on, event:{name, testing_date, note, school_name, address|null, auto_close_on}, classes:[{class_name, start_time, end_time, ranks:[{event_rank_id, name, belt…, early_cents, day_cents, sparring_gear, testing_for:{name, belt}|null}]}]}` or `{status:'not_found'}`. Nothing else (no counts, no registrations, no ids except event_rank_id).
- `testing_public_register(p_code, p_client_key, p_submission_id uuid, p_first, p_last, p_event_rank_id uuid, p_paying_by, p_stripes boolean, p_signature text, p_ack_version text) returns jsonb` — order: purge old attempts + old signatures · event by code (`not_found`) · same `submission_id` exists **for this event** → return that registration's ok answer (idempotent; a concurrent duplicate that hits the unique index is caught, re-selected and answered `ok` the same way; if the re-selected row belongs to a **different** event → `invalid`, never its details). The `testing_public_attempts` row is written outside the block that can roll back, so every call still counts toward the rate limit · state: `not_open` / `closed` / `finished` (F10–F14) · argument rules (`invalid`) · rank belongs to this event (`invalid`) · rate limit: > 20 attempts per client_key per hour → `rate_limited` (logged); per event > 200 per hour is **logged only** · insert (`actor_name` "Family form", action `public_register`) · duplicate flag · `{status:'ok', reference, first_name, last_name, testing_for, class_name, start_time, end_time, early_cents, day_cents, paying_by, testing_date, school_name, address}`.

### 1.9 Grants (exact intent — A writes the SQL)
RLS enabled on every new table; `revoke all … from public, anon, authenticated, service_role` on tables, view and sequences; column `select` grants to authenticated as above; `select` on `testing_roster` to authenticated; policies `for select to authenticated using ((select public.has_data_access()))` on every table the view reads. Execute on each staff function to authenticated only; on the two public functions to `testing_registrar` only; helpers to nobody.

### 1.10 The restricted login `testing_registrar`
`create role testing_registrar login noinherit nocreatedb nocreaterole nobypassrls noreplication connection limit 5` (only if missing; **no password in the file** — set at CP3 with a SCRAM verifier made on Jeffrey's PC, SETUP §12); `alter role testing_registrar set statement_timeout = '5s'`, `set idle_in_transaction_session_timeout = '10s'`, `set search_path = ''`. `grant usage on schema public`; execute on the two public functions; **nothing else granted by us**. Not a member of `authenticator` or any role; no member roles. (PUBLIC's default grants on Supabase's own schemas still apply to every role — the tests prove what matters, §2.2.) The connection limit (5) must be ≥ Hyperdrive's origin connection limit for this config (SETUP §12 says so).

---

## 2. Database tests — `0005_tests.sql` + PGlite (run before AND after a seeded event; prints `ALL 0005 TESTS PASSED`)
1. Role gates for every function (anon none; authenticated only staff functions; registrar only the two public ones); locked / signed-out / magic-link / 8-day sessions → `no_access`; staff vs admin splits for every A/S line of §1.8.
2. **Registrar catalog proofs** (written so they hold on Supabase, where PUBLIC keeps default rights in Supabase's own schemas): **within schema `public`**, `has_function_privilege('testing_registrar', oid, 'execute')` is true for exactly the two public functions; **no function of 0001–0005 is executable by PUBLIC**; the registrar has no `select/insert/update/delete/truncate/references/trigger` on any table, view or sequence in any schema except pg_catalog / information_schema; `has_schema_privilege(…, 'CREATE')` false everywhere; `pg_has_role('authenticator','testing_registrar','member')` false and the registrar is a member of nothing; role attributes as §1.10; owners of all 0005 functions = owner of the tables (0003 C3h lesson).
3. Copy rule: change Classes and ranks prices/names after creating an event → event copy unchanged; adding a class later copies the then-current values; Not set final award → `final_award_not_set`.
4. State machine at minute boundaries in America/New_York (11:59:59 PM vs 12:00:00 AM on the closing date and the testing date), reopen rules per role, `first_opened_at`.
5. Public register: idempotent submission_id; every refusal status; rank from another event → `invalid`; signature prefix/length; rate limit; duplicates flagged; change_log row with "Family form".
6. Payments: mark_paid amount by date (day before vs on the day); already paid → `already_paid`; a double click with the old version → `stale`; withdrawn → `withdrawn`; mark_paid allowed when `finished`; add_student and the switch refused when `finished`; undo window (own payment < 10 s yes; other staff / later → `not_allowed`; admin always), edit = reversal + new, reversal of reversal refused, UPDATE refused, delete student cascades + `stale` on wrong expected ids.
7. Signature purge at 90 days (no version bump); signature column not readable by authenticated; **`change_log` never contains `data:image`** (insert, edit, purge, delete).
8. Catalog: RLS on all, search_path on all, security definer only where listed, fingerprints file.

---

## 3. (reserved — no seed in phase 2; PGlite adds a test event itself)

---

## 4. Public path (Builder B)

### 4.1 Route and page
`register.html` (second Vite entry) + `src/register/main.jsx`: React, **no supabase-js, no dashboard imports** except `src/lib/testing/eventRules.js`, `belts.js`, `money.js`, `names.js`. `public/_redirects`: `/register/*  /register  200` (pointing at `/register`, not `/register.html`, avoids the known loop with Pages' pretty URLs — test it). `public/_routes.json`: `{"version":1,"include":["/api/*"],"exclude":[]}` so static pages never use the Functions quota. In `npm run dev` / `dev:preview-mode`, Vite rewrites `/register/*` to `register.html` (small middleware in `vite.config.js`). The code is read from `location.pathname`. Signature canvas: at most 600×200 px; the page refuses to send if the PNG data URL is over 70 000 characters (asks to sign smaller / Clear). The page implements F1–F15 exactly (wording from `TKD-ColorBelt-Form-Mockups.html`), Star v0.106 look (header strip, 44px buttons, 16px fields on phones), one student per form + "Register another student" + "Registered on this visit" (sessionStorage only, never sent anywhere), signature pad → PNG data URL (canvas, size capped before sending).

### 4.2 `functions/api/register/[code].js`
- **Hyperdrive config is created with caching disabled** (plan §8 Must 1) — otherwise `select testing_public_register(…)` could be answered from cache without writing; SETUP §12 step + CP5 check of the cache status.
- `GET` → `PUBLIC_REGISTRATION !== 'on'` → `{status:'not_open'}` · else call `testing_public_event(code)` → JSON plus `turnstile_site_key` (public). `Cache-Control: no-store`. A Cloudflare rate-limiting rule on `/api/register/*` (SETUP §12) limits guessing codes.
- `POST` → kill switch · `Origin` must equal `PUBLIC_ORIGIN` · `Content-Type: application/json` · body ≤ 100 KB (checked on `content-length` and while reading) · honeypot field empty · `started_at` ≥ 4 s ago · Turnstile **siteverify** with the secret: `success`, `hostname` = production host, `action` = `register`, `remoteip` · client_key = HMAC-SHA-256(`CLIENT_KEY_SECRET`, today in America/New_York ‖ IP) · call `testing_public_register` with typed parameters · map to JSON. Never return or log database errors, names or signatures; log only status + timing. Uses `context.waitUntil` to close the client; `nodejs_compat` + a compatibility date are set in the Pages project settings (SETUP §12).
- **Statuses the page handles** (one JSON `{status, …}` for every answer; HTTP 200, except `bad_request` → HTTP 400 with the same JSON shape):

| Status (source) | Page shows |
|---|---|
| `ok` (DB) | F7 / F8 |
| `not_found` (DB) | F15 |
| `not_open` (DB, or kill switch / missing binding) | F11 |
| `closed` + `closed_on` (DB) | F12 (date) / F13 (null); on Send: F10 |
| `finished` (DB) | F14 |
| `verify_failed` (Function: Turnstile failed / wrong hostname / wrong action) | F6 message "We couldn't check this browser. Try again, or ask at the front desk." (Star s8) |
| `rate_limited` (DB) | F9-style banner "Too many tries from this connection. Please wait a few minutes, or ask at the front desk." — approved 2026-10-17 |
| `invalid` (DB) / `bad_request` (Function: origin, type, size, honeypot, too fast) / `unavailable` (Function: database unreachable) / network error | F9 "Your registration wasn't sent. Check your internet connection and try again. Nothing you entered is lost." |
- Bindings / variables (Production only): `HYPERDRIVE`, `TURNSTILE_SECRET`, `CLIENT_KEY_SECRET`, `PUBLIC_REGISTRATION` (`on`/`off`, default off), `PUBLIC_ORIGIN`, `TURNSTILE_SITE_KEY` (public). Missing binding → fail closed (`not_open`). Configured in the **Cloudflare dashboard** (no `wrangler.toml` in phase 2).
- Driver: `postgres` (Postgres.js), exact pinned version, `nodejs_compat`; one client per request, `prepare: false` (Hyperdrive transaction pooling), closed with `context.waitUntil`.

### 4.3 Turnstile on the page
Script `https://challenges.cloudflare.com/turnstile/v0/api.js?render=explicit`, invisible/managed, token requested **at Send**; the "Verify you are human" box (F6) only when Cloudflare asks.

### 4.4 Headers (`public/_headers`)
Keep the existing `/*` rules. Add for `/register`, `/register.html` and `/register/*`: `Content-Security-Policy: default-src 'self'; script-src 'self' https://challenges.cloudflare.com; frame-src https://challenges.cloudflare.com; connect-src 'self'; img-src 'self' data:; style-src 'self' 'unsafe-inline'; frame-ancestors 'none'; base-uri 'none'; form-action 'self'` (document that it combines with the `/*` frame-ancestors line). `/api/*`: `Cache-Control: no-store`.

### 4.5 Preview mode
`import.meta.env.MODE === 'preview'` → the page uses C's `src/lib/testing/publicApi.preview.js` instead of `fetch('/api/register/…')`. **Interface (C writes it, B calls it):** `getEvent(code) → Promise<same JSON as GET>` and `register(code, body) → Promise<same JSON as POST>` (body = the POST body, `turnstile_token` ignored), applying the same rules and statuses as §1.8 and §4.2 against the same `localStorage` store as the staff preview (`tkd.preview.testing`, schema bumped by C). Console helpers on `window.__tkdPreview` (C): `setPublicRegistration(on)`, `forceVerifyFailed(on)` (next register answers `verify_failed`), `forceRateLimited(on)`, `setToday('YYYY-MM-DD')`. Turnstile is not loaded in preview. The production build must contain no preview code (grep `dist/` in the checks; the import is behind `import.meta.env.MODE` so Vite drops it).

### 4.6 Dependencies (new — flagged to Jeffrey with the build summary)
`postgres` (Functions only) and `qrcode-generator` (QR in the staff link dialog and flyer; no network). Exact versions pinned; nothing else.

### 4.7 Tests (`functions/tests/*.mjs`, plain Node)
Fake database + fake Turnstile: kill switch, wrong origin, wrong type, oversized body, honeypot, too fast, Turnstile fail / wrong hostname / wrong action, unknown code, every database status mapped, no error text leaked, HMAC changes daily.

---

## 5. Data layer (Builder C)
- `eventRules.js` (pure, node-importable): `eventState(event, today)`, `stateTag(state, event)`, `testingFor(eventClasses, rank)`, `feeFor(rank, dateISO, testingDateISO)`, `classTimeLabel(start, end)` ("5:00 – 6:00 PM"), `validateClassTimes(rows)`, `todayInSchoolTime(now)` (America/New_York), `isPaid(paidCents)`. The SQL twins must agree — `checks.mjs` tests the same table of cases the SQL tests use.
- `eventsApi.js`: one function per §1.8 staff function (camelCase in/out) + loaders `loadEvents(locationCode)`, `loadEvent(eventId)` (event + copy + roster rows + payments). Statuses passed through as codes.
- `schoolsApi.js`: `loadSchools()`, `updateSchoolAddress(...)`.
- `qr.js`: `qrSvgDataUrl(code)` from `qrcode-generator`, always for `https://tkd-dashboard.pages.dev/register/<code>` (fixed production origin, plan §8); D renders it as `<img src={dataUrl}>`, never with `innerHTML`. Also exports `registrationLink(code)`.
- `mockTestingEvents.js` + `mockClient.js`: every function, the view, the state machine, statuses and Undo window exactly as §1 (`failNextSave`, `simulateOtherAdminEdit`, `setRole`, `setToday(YYYY-MM-DD)` for state testing, `resetTesting`). Default preview data: November Children Testing (Worcester, Fri Nov 20, classes Little Tiger + White 4–5 PM, Group A 5–6, Group B 6–7, Group C + D 7–8) with the students of the mockups; one possible duplicate; one withdrawn.

---

## 6. Staff screens (Builder D) — layout and wording exactly as the approved mockups, with these later changes
- **Events tab** (E1–E14): left of Classes and ranks; Add event with **Classes testing** (tick + start/end per class, copied from the last event; first event blank); `final_award_not_set` → amber "Set a final award for <Class> in Classes and ranks first." under the list.
- **Event page** (R1–R8): `#testing/event/<id>`; tab **Students**; summary cards; class switch (only classes in the event, counts); class line with time + sparring gear; rows in belt order.
  - **Add student** = blue primary button in the **page header, left of Registration link**; `N` opens it on PC (Q7).
  - **Mark paid** replaces Record payment (plan answer 6): outline button with `ti-check` "Mark paid" on unpaid active rows; one click → row Paid + toast "<Name> marked paid · $<amount> <method>" with Undo (5 s); the R5 dialog is not built.
  - ⋯ menu: staff — Change how they'll pay (unpaid only), Edit details; admins add — Edit payment, Undo payment (paid rows), Withdraw / Restore, Delete permanently (paid students allowed — warning names the payment, plan answer 8).
  - Duplicate box + compare dialog (R7), Removed group (R8), detail summary + Edit details (R6; belt change shows the new Testing for).
  - Registration link dialog (R2, one link, QR, Copy link, Print flyer) and the flyer (R3, print stylesheet).
- **Settings** (S1–S3): account menu item under Admin (admins only, `ti-settings`); page `#settings` with Schools; Edit dialog; empty address → amber line.
- Phone / tablet / PC behaviour, 44px targets, focus, Undo toasts, stale handling, locked-screen behaviour, "Both" blocked — as phase 1 (CONTRACT-0003 §8).

---

## 7. Checks before calling a builder done
`npm run build` and `npm run build:preview-mode` pass · `node src/lib/testing/checks.mjs` passes · PGlite passes (both runs) · `node --test functions/tests/` passes · grep: no secrets, no `service_role`, no supabase-js in the register bundle, no preview code in `dist/` · line endings unchanged · every new file has its header comment.

## 8. Reviews (orchestrator)
Security review of A + B together (the public path is the focus: registrar proofs, Function checks, CSP, secrets) and design review of D + B against every approved screen at 1280×800, 820×1180 touch, 390×844 touch, 320 wide; fix; re-review.

## 9. Before building starts
1. Main merges `staff-accounts` and `star-testing`; this branch merges `main`.
2. The orchestrator records phase 2 in the rulebook (decisions Q1–Q9, plan answers 1–9, Settings → Schools, v0.36 change) and updates this contract's references if numbers moved.
3. Jeffrey OKs: ~~the two new dependencies~~ **approved by Jeffrey 2026-10-17: `postgres` (Postgres.js) and `qrcode-generator`, exact pinned versions** (§4.6); ~~the `rate_limited` and `verify_failed` wordings~~ **both wordings approved by Jeffrey 2026-10-17** (§4.2); and ~~registering on the testing day~~ **confirmed by Jeffrey 2026-10-17: families can register on the testing day itself until the end of the day, at the testing-day price** (§1.3 state 2).
