# CONTRACT-0051 — Board breaking: the section's database, the public form and the Square payment

Status: **DRAFT for Jeffrey's OK (2026-11-12).** Migration numbers reserved by Main 2026-11-12: **0051** = this section,
**0052** = Finance reads Board breaking payments (after 0051 is live; builds on 0047's `finance_money_rows_core`).
Decisions: rulebook v1.300 (Jeffrey's answers Q1–Q8). Nothing below is built until he approves the pictures and this contract.
Pattern copied from Camps (0013 / 0043 / 0050): tables, `security definer` functions, a `*_registrar` login for the public
Function, `camp_public_attempts`-style rate limit, append-only payments with reversal rows, change log through triggers.

## 1. What it does

A monthly board-breaking night, one school per event. Families register through a link / QR (name, **age**, rank, class time,
boards, Paying by). Staff run the roster by class time: Mark paid, Mark broken, Add student (walk-ins), Edit. Families who
choose Card get a **Square payment link** with the exact amount; Square's "payment completed" message marks them paid.
Payments reach Finance's Daily report through 0052. Admins own events, prices, the age line, the board chart, price
overrides and refunds.

**Names:** every table / function uses the prefix `brk_` (`bb_` is Black Belt's). Section label in the app: **Board breaking**.

## 2. Tables (all RLS on; `to authenticated using ((select public.has_data_access()))`; writes only through the functions; nothing for `anon`)

- **`brk_settings`** — one row (`id = 1`, check). `tech_cents` 300, `adult_cents` 400 (cash / check price per board),
  `card_extra_cents` 25 (added per board when Paying by is Card), `same_day_extra_cents` 100 (added per board from the event
  date on), `child_max_age` 12 (age 12 and under → Child chart; 13 and up → Teen / Adult chart), `tiger_max_age` 6 (see §4).
  One price setting for all events (Q5). Admin-only write, logged.
- **`brk_chart`** — the board chart: `id`, `band` (`tiger` · `child` · `teen` · `black`), `rank_name`, `sort`, `technique`
  (text, may be empty), `tech_boards`, `adult_boards` (0–12). Unique `(band, rank_name)`. Seeded from the live page's numbers
  (docs `Chart-live-page-vs-PDF.md`) + the PDF's techniques. Admin-editable; one `version` column on the settings row guards
  the whole chart against two admins saving over each other.
- **`brk_events`** — `id`, `name`, `location_code` (FK `public.locations`; one school, Q2), `event_date`,
  `registration_open boolean`, `public_code` (8 chars, same generator and pattern as Camps, unique, never changes), `version`.
- **`brk_event_classes`** — `id`, `event_id` (FK, cascade), `name` ("Group D"), `start_time`, `end_time`, `sort`. A new event
  starts with a copy of the school's last event's classes.
- **`brk_registrations`** — `id`, `event_id`, `class_id`, `first_name`, `last_name`, `age` (1–99, whole number; **not a date of
  birth**), `rank_name`, `band_used`, `tech_boards`, `adult_boards`, `paying_by` (`cash`·`check`·`card`), `paying_by_on_form`
  (set by a trigger, never changes; Camps 0033 pattern), `same_day boolean` (was the price the event-day price),
  `amount_cents` (**stored when the family signs up / staff edit; worked out by the database**), `override_cents null`
  (admin-only price override), `square_order_id null`, `square_link_url null`, `source` (`form`·`desk`), `broke boolean`,
  `broke_on date null`, `submission_id uuid unique` (the family form's retry key), `entered_by`, `version`, `created_at`.
  Lists show name, age, rank, class, boards, Paying by, amount, paid state — **no date of birth, address, contact or
  signature exist in this section at all**.
- **`brk_payments`** — copy of `camp_payments`: `kind` (`payment`·`refund`·`reversal`), `amount_cents`, `method`
  (`cash`·`check`·`card`; refunds cash / check only, like Camps), `paid_on`, `school` (FK `locations`; the desk that took it, or
  the event's school for a Square payment), `recorded_at`, `recorded_by`, `recorded_by_name` (**"Square"** for a webhook
  payment), `reverses_payment_id unique`, `paying_by_before`, `square_payment_id text unique null`. Append-only guard trigger:
  a reversal is exactly minus its payment; a registration's net never goes below $0; no delete except through the delete
  functions (as `camp_payments_guard`).
- **`brk_public_attempts`** — `client_key`, `event_id`, `at`, `outcome` (as `camp_public_attempts`; RLS on, no grants; rows
  older than 2 days removed on each call).
- **`brk_square_events`** — one row per Square message ever received: `square_event_id text primary key`, `received_at`,
  `type`, `payment_id`, `order_id`, `amount_cents`, `outcome` (`paid`·`duplicate`·`unknown_order`·`amount_mismatch`·`not_card`·
  `not_completed`·`already_paid`), `registration_id null`. **The primary key is the replay guard.** Mismatches stay visible
  to admins (a count on the event page: "N Square payments need a look").

Every table logs through `public.change_log_write()` triggers; functions set `tkd.action` / `tkd.batch_id` first and write
`recorded_by_name = public.change_log_actor_name()`; the public form logs as "Family form", the webhook as "Square".

## 3. Functions (all `security definer`, `set search_path = ''`, fully qualified names, `has_data_access()` first except the two public groups, return `{status: …}`; revoke from `public, anon, authenticated, service_role`; execute to `authenticated` unless noted)

**Staff** (staff + admin unless marked **admin**):
`brk_events_list()`, `brk_event_roster(event_id)` (the roster view: rows + counts + "Square payments needing a look"),
`brk_add_event` / `brk_update_event` / `brk_delete_event` (**admin**; delete refused when any payment exists),
`brk_set_registration_open` (**admin**), `brk_save_class` / `brk_delete_class` (**admin**; delete refused when students are in it),
`brk_add_student` (walk-in; the database prices it, **same-day price from the event date on**),
`brk_edit_registration` (boards, class, Paying by, name, age, rank → amount recomputed; Paying by moving away from Card, or an
amount change on a card registration with an unpaid link, **clears the Square link** so it can't mark them paid later),
`brk_set_override` (**admin**), `brk_set_broke(registration_id, value, version)` (toggle, with Undo),
`brk_mark_paid(registration_id, version, school, method)` (Camps `camp_mark_paid` rules; amount = owed), `brk_undo_payment`
(staff: own payment within 10 s; else **admin**), `brk_edit_payment` (**admin**), `brk_record_refund` / `brk_undo_refund`
(**admin**), `brk_delete_registration` (**admin**; refused when it has payments),
`brk_settings_get()`, `brk_save_settings(...)` (**admin**), `brk_chart_list()`, `brk_save_chart(rows, version)` (**admin**),
`brk_registration_history(uuid)` (staff + admin; no login ids).

**Public** (a new login **`brk_registrar`**, `nologin`-style like `camps_registrar`: `login noinherit … connection limit 5`,
`statement_timeout 5s`, no table grants, execute on exactly these):
`brk_public_event(code)` — name, school, date, classes, chart (rank, band, technique, boards), prices, registration state
(never an id of a student; nothing private), and `brk_public_signup(code, client_key, submission_id, first_name, last_name,
age, rank_name, class_id, tech, adult, paying_by, expected_total_cents)` — returns `ok {registration_id, amount_cents,
paying_by}` or `not_found` · `invalid` · `closed` · `not_open` · `rate_limited` · `price_changed` · `duplicate` (idempotent on
`submission_id`: a retry returns the same row). The rate limit is Camps' (30 attempts per client key per hour);
`brk_public_set_link(registration_id, submission_id, order_id, link_url)` stores the Square link once (refused if one exists or the
registration is paid).

**Square webhook** (a second login **`brk_square`** that may execute only this one function):
`brk_square_payment(square_event_id, payment_id, order_id, amount_cents, currency, status)`.

## 4. How the database works out boards and the amount (never trusted from the browser)

- **Boards:** the family's counts are checked (0–12 each, at least 1 in total). The recommended counts come from `brk_chart`:
  a "Little Tiger …" rank uses the `tiger` row; a Black Belt rank uses the `black` row (age ignored, as today); any other rank
  uses `child` when age ≤ `child_max_age`, else `teen`. (So the "6 and under" line only matters for the rank list's wording:
  a young child who picks a regular belt gets the Child chart; a Little Tiger belt always gets 3 Technical. `tiger_max_age`
  is kept as a setting but moves no board counts — **to confirm with Jeffrey**, see the questions.)
- **Amount:** `tech × (tech_cents + card? card_extra_cents + same_day? same_day_extra_cents) + adult × (adult_cents + …)`.
  Same day = New York's today ≥ the event date at the moment of sign-up (`public.testing_today()`). If `expected_total_cents`
  differs from the database's number the answer is `price_changed` with the new number, as in Camps.
- Edit recomputes with the **same** function (the old page's Edit forgot card and same-day prices).

## 5. The public Function and page

- **`functions/api/breaking/[code].js`** (+ `functions/_lib/breaking.js`, `brkDb.js`): GET → `brk_public_event`; POST → the Camps
  order: switched-on check (`BREAKING_REGISTRATION === 'on'`, a `HYPERDRIVE_BREAKING` binding, `TURNSTILE_SECRET`,
  `CLIENT_KEY_SECRET`, `PUBLIC_ORIGIN`, `TURNSTILE_SITE_KEY`), **Origin check through Domain's `functions/_lib/origins.js`**,
  JSON content type, code pattern, rate limit, ≤ 256 KB body, field allow-list, honeypot, ≥ 4 s fill time, Turnstile (action
  `breaking_signup`), then `brk_public_signup`. Answers are an allow-list; anything unknown becomes `unavailable`.
- **Card:** after `ok` with `paying_by = card`, **the Function** (not the browser) asks Square for a payment link with
  **the database's `amount_cents`**, `idempotency_key` = the registration id (a retry gets the same link), a note with the
  student's name, and a return address; it stores it with `brk_public_set_link` and answers with the link. If Square fails:
  "You're registered. Pay at the front desk", and the page offers **Try again** (same call, same idempotency key). Cash /
  Check → "Registered. Pay the school before event day."
- **Family link / QR address:** `src/lib/publicOrigin.js` (Domain's constant) — never a hard-coded address. The page:
  `breaking.html`, `src/breaking/main.jsx`; `/breaking/*` line in `public/_redirects` and header lines in `public/_headers`
  are **sent to Main for the Domain session**, not edited here. Built last.
- **Square secrets** — set by Jeffrey in Cloudflare (Settings → Variables and Secrets), never in the app, git, chat or a screenshot:
  `SQUARE_ACCESS_TOKEN`, `SQUARE_LOCATION_ID`, `SQUARE_WEBHOOK_SIGNATURE_KEY`, `SQUARE_WEBHOOK_URL` (the exact address
  registered in Square), `SQUARE_ENVIRONMENT` (`sandbox` / `production`), and the `HYPERDRIVE_BREAKING` binding for `brk_registrar`.
  If any is missing the card path answers "pay at the desk" and the webhook answers 503 (fail closed).

## 6. The Square webhook — `functions/api/square/breaking.js` (no Origin check; the signature is the gate)

1. Read the **raw body** once. Compute `base64(HMAC-SHA256(signature key, SQUARE_WEBHOOK_URL + raw body))` and compare with the
   `x-square-hmacsha256-signature` header in **constant time**. No / wrong signature → 403, nothing parsed, no database call.
2. Parse; accept only `payment.updated` with `status = COMPLETED`; anything else answers 200 "ignored" (so Square stops retrying).
3. Call `brk_square_payment(event_id, payment.id, payment.order_id, amount_money.amount, currency, status)` as `brk_square`.
4. Inside the database, one transaction: insert the `brk_square_events` row (**duplicate event id → `duplicate`, nothing else
   changes**); find the registration by `square_order_id`; unknown → `unknown_order`; not Card / link was cleared →
   `not_card`; currency not USD or amount ≠ what is still owed → `amount_mismatch` (**no payment is written; an admin sees it**);
   already paid → `already_paid`; else insert the payment (`kind payment`, `method card`, `school` = the event's school,
   `recorded_by_name` "Square", `square_payment_id` unique) → `paid`. Every outcome answers 200 except a database error (500, so
   Square retries; the unique keys make a retry safe).
5. Logs hold only the outcome word and timing — never the body, the token or a signature.
6. **Test with Square's sandbox first** (sandbox token and signature key in Cloudflare, `SQUARE_ENVIRONMENT = sandbox`), then switch.

## 7. Finance (migration 0052, separate, after 0051 is live)

A new source `brk` ("Board breaking") in `finance_chain_steps_core` and `finance_money_rows_core` (school from
`brk_payments.school`, `what` label "Board breaking", event name = the event, refunds count at the desk that handed the
money back), the `source` whitelist in `finance_payment_detail`, the `finance_day_closing_items_source_check` constraint, the
labels in `src/lib/finance/csv.js` / `checks.mjs`, and the Open-in route. Contract for it is written when 0051 is approved.
**A Square payment counts at the event's school** (no desk took it) — to confirm with Jeffrey.

## 8. Not in 0051 (later, each needs its own number through Main; they replace other sections' readers)

Home "today" card, Calendar items (`calendar_items`, 0045), top-bar people search (`people_search`, 0049). Board breaking
does not touch any other section's tables or functions in 0051.

## 9. Compatibility, tests, order

- Tests: `0051_tests.sql` (locked / PIN-locked / signed-out / stale sessions read nothing; staff vs admin; stale versions;
  price maths incl. card and same-day; duplicate submission; Square: wrong amount, unknown order, replay of the same event id,
  second payment id, cleared link; append-only payments), `0051_fingerprints.sql`, SETUP section "Migration 0051: Board
  breaking", `step0051` in `supabase/tests/pglite/run.mjs`, the preview's fake database (`src/lib/mockBreaking.js`),
  Function tests (`functions/tests/breaking.test.mjs`) including signature accept / reject, constant-time compare, replay.
- Order: 0051 pasted by Jeffrey after an **independent security review** and his OK → check fingerprints + advisor → tests →
  staff screens → Finance 0052 → public Function + page + Square (sandbox, then live), always last.
- Shared files this section touches (minimal): rulebook, `src/components/navItems.js` (one TESTING_PAGES line), `src/screens/Testing.jsx`,
  `src/App.jsx`, `src/lib/pageAddress.js`, `src/screens/testing/chooser/TestingChooser.jsx`, `src/lib/mockClient.js`,
  `src/styles/*` only if a shared part is missing, `supabase/SETUP.md`, `supabase/tests/pglite/run.mjs`, `vite.config.js`
  (second public page, as Camps did). Never `functions/_lib/origins.js`, `public/_headers`, `public/_redirects`.

## 10. Open points for Jeffrey (asked together with the pictures)

1. **Little Tiger age line.** With one long rank list, the rank (not the age) says "Little Tiger"; so age only separates Child
   (≤ 12) from Teen / Adult (13+). Keep a 6 / 7 line anyway (no effect on boards), or **drop it (recommended)**?
2. **Square account:** the Square account/location the links use, and when you can set the Cloudflare secrets (sandbox first).
3. **Where a Square payment counts in Finance:** the event's school (**recommended**) or something else?
4. **A card student whose boards change after the link was made:** the old link is cancelled and staff take the card on the Square
   terminal (**recommended**), or the app makes a new link for the new amount?
5. Two boxes (first / last name) instead of today's one name box, for search and duplicates (**recommended**)?
