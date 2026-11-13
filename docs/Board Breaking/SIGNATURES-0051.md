# SIGNATURES-0051 — exact names, inputs and answers (approved contract: `CONTRACT-0051.md`; decisions v1.300–v1.303)

The contract says WHAT; this sheet fixes the names so the migration, the tests, the app and the Functions agree. Every function is in
schema `public`, `security definer`, `set search_path = ''`, returns `jsonb` `{ "status": "...", ...}`. Staff functions call
`has_data_access()` first (`no_access` otherwise), admin ones also `is_admin()`. Camps (0013 / 0033 / 0039 / 0043 / 0050) is the model
for every pattern: version check (`stale`), `begin … exception` mapping (unique/deadlock/serialization/lock → `stale`; fk/check/not-null/data
→ `invalid`), `tkd.action` / `tkd.batch_id` before writing, `change_log_actor_name()`, append-only payments with reversal rows.
"expected_version" = the row's `version` integer, bumped on every change.

## Tables (names fixed)
`brk_settings`, `brk_chart`, `brk_events`, `brk_event_classes`, `brk_registrations`, `brk_payments`, `brk_public_attempts`,
`brk_square_events` (columns as in the contract §2; `brk_square_events` also has `reviewed boolean default false`).
Ids are `uuid default gen_random_uuid()`. School codes = `public.locations.code` (`worcester`, `shrewsbury`).
`brk_events.public_code`: generated with the Camps generator (`public.testing_new_public_code` or whatever Camps' trigger uses),
pattern `^[a-hjkmnp-z2-9]{8}$`, unique, never changes.

## Staff reads
- `brk_settings_get()` → `{status:'ok', settings:{tech_cents, adult_cents, card_extra_cents, same_day_extra_cents, child_max_age, version}, chart:[{id, band, rank_name, sort, technique, tech_boards, adult_boards}]}`
- `brk_events_list(p_location_code text)` (a school code, or `'both'`) → `{status:'ok', events:[{id, name, location_code, event_date, registration_open, public_code, registered, paid, version}]}` (`registered` = rows; `paid` = rows whose payments' net ≥ amount owed)
- `brk_event_roster(p_event_id uuid)` → `{status:'ok', event:{id, name, location_code, event_date, registration_open, public_code, version, classes:[{id, name, start_time, end_time, sort}]}, registrations:[{id, class_id, first_name, last_name, age, rank_name, band_used, tech_boards, adult_boards, paying_by, paying_by_on_form, same_day, amount_cents, override_cents, owed_cents, paid_cents, broke, broke_on, has_link, source, version, created_at, payments:[{id, kind, amount_cents, method, paid_on, school, recorded_at, recorded_by_name, reverses_payment_id}]}], needs_look:[{square_event_id, received_at, outcome, amount_cents, order_id}]}` (`needs_look` only for admins and only unreviewed `unknown_order`/`amount_mismatch`/`wrong_school` rows for the event's school; a non-admin gets `[]`). `square_link_url` is never returned to staff.
- `brk_registration_history(p_registration_id uuid)` → `{status:'ok', rows:[...]}` from `change_log` (no login ids), like `camp_camper_history`.

## Staff writes (answer `{status:'ok', …}` or `no_access` · `not_found` · `stale` · `invalid {field}` · `closed` where noted)
- `brk_add_event(p_name text, p_location_code text, p_event_date date, p_copy_classes_from uuid default null)` **admin** → `ok {event_id, public_code}`; copies the classes of `p_copy_classes_from`, else of the school's latest earlier event, else none.
- `brk_update_event(p_event_id uuid, p_expected_version int, p_name text, p_event_date date, p_registration_open boolean)` **admin** → `ok {version}`; the school never changes.
- `brk_delete_event(p_event_id uuid, p_expected_version int)` **admin** → `ok` | `has_payments` (refuse when any payment row exists; otherwise cascades registrations/classes).
- `brk_save_classes(p_event_id uuid, p_expected_version int, p_classes jsonb)` **admin**; `p_classes` = `[{id?, name, start_time, end_time}]` in order; keeps ids that are sent, adds new ones, removes the rest → `ok {version}` | `class_in_use {class_id}` (a removed class still has students).
- `brk_add_student(p_event_id uuid, p_first_name text, p_last_name text, p_age int, p_rank_name text, p_class_id uuid, p_tech int, p_adult int, p_paying_by text)` staff (walk-in, `source = 'desk'`; the database prices it, same-day price from the event date on; works while registration is closed) → `ok {registration_id, amount_cents, version}`.
- `brk_edit_registration(p_registration_id uuid, p_expected_version int, p_first_name text, p_last_name text, p_age int, p_rank_name text, p_class_id uuid, p_tech int, p_adult int, p_paying_by text)` staff → `ok {amount_cents, version, link_cleared}`. Editing is allowed after payment and the amount is worked out again; it answers `amount_below_paid {paid_cents}` instead when the new amount would be below what is already paid. Clears `square_order_id` / `square_link_url` when paying_by leaves card or the amount changes on a card registration with an unpaid link (v1.303). A set override stays.
- `brk_set_override(p_registration_id uuid, p_expected_version int, p_override_cents int)` **admin**; null clears; 0–1000000 → `ok {amount_cents, version}`.
- `brk_set_broke(p_registration_id uuid, p_expected_version int, p_broke boolean)` staff → `ok {version, broke_on}`.
- `brk_mark_paid(p_registration_id uuid, p_expected_version int, p_school text, p_method text default null)` → `ok {payment_id, amount_cents, method, school, paying_by, version}` | `already_paid` | `invalid {field}` (method blank = the registration's paying_by; a different way also changes paying_by, logged, undo puts it back — copy 0033).
- `brk_undo_payment(p_payment_id uuid)` staff own payment ≤ 10 s, else admin → `ok {version}` | `not_allowed` | `stale` | `refund_stands`.
- `brk_edit_payment(p_payment_id uuid, p_method text, p_amount_cents int, p_paid_on date, p_school text)` **admin** → `ok {payment_id, version}`.
- `brk_record_refund(p_registration_id uuid, p_expected_version int, p_method text, p_amount_cents int, p_refunded_on date, p_school text)` **admin** (cash/check only) → `ok {payment_id, version}` | `refund_too_large {overpaid_cents}`; `brk_undo_refund(p_payment_id uuid)` **admin**.
- `brk_delete_registration(p_registration_id uuid, p_expected_version int)` **admin** → `ok` | `has_payments`.
- `brk_save_settings(p_expected_version int, p_tech_cents int, p_adult_cents int, p_card_extra_cents int, p_same_day_extra_cents int, p_child_max_age int)` **admin** → `ok {version}`; ranges: cents 0–100000, age 1–99.
- `brk_save_chart(p_expected_version int, p_rows jsonb)` **admin**; replaces the whole chart; rows `[{band, rank_name, sort, technique, tech_boards, adult_boards}]`; bands `tiger|child|teen|black`; boards 0–12; unique (band, rank_name); needs at least one row per band; the version is the settings row's (same `version`, bumped) → `ok {version}`.
- `brk_dismiss_square_event(p_square_event_id text)` **admin** → `ok` (sets `reviewed = true`).

## Public (execute only for `brk_registrar`; nothing for anon/authenticated)
- `brk_public_event(p_code text)` → `{status:'ok', event:{name, location_code, event_date, registration_state:'open'|'closed', classes:[{id,name,start_time,end_time}], prices:{tech_cents, adult_cents, card_extra_cents, same_day_extra_cents, same_day:boolean}, child_max_age, chart:[{band, rank_name, sort, technique, tech_boards, adult_boards}]}}` | `not_found`.
- `brk_public_signup(p_code text, p_client_key text, p_submission_id uuid, p_first_name text, p_last_name text, p_age int, p_rank_name text, p_class_id uuid, p_tech int, p_adult int, p_paying_by text, p_expected_total_cents int)` → `ok {registration_id, amount_cents, paying_by, same_day}` | `not_found` · `invalid {field}` · `closed` (registration off, or the event date has passed) · `rate_limited` · `price_changed {amount_cents}`; idempotent on `p_submission_id` (a retry returns the same registration). Always inserts a `brk_public_attempts` row (outside the part that can roll back); clears `request.jwt.claims`; actor label "Family form".
- `brk_public_registration(p_code text, p_submission_id uuid)` → `{status:'ok', registration_id, amount_cents (owed), paying_by, paid:boolean, has_link:boolean, link_url}` | `not_found` (for "Try again" and the return page).
- `brk_public_set_link(p_registration_id uuid, p_submission_id uuid, p_order_id text, p_link_url text)` → `ok` | `not_found` | `link_exists` | `paid`.

## Square (execute only for `brk_square`)
- `brk_square_payment(p_school text, p_square_event_id text, p_payment_id text, p_order_id text, p_amount_cents int, p_currency text, p_status text)` → `{status:'ok', outcome:'paid'|'duplicate'|'unknown_order'|'amount_mismatch'|'not_card'|'not_completed'|'already_paid'|'wrong_school', registration_id?}`; one transaction; the `brk_square_events` primary key is the replay guard; recorded_by_name `Square`; payment `school` = the event's school.

## Roles and grants
`brk_registrar` (login, noinherit, nocreatedb, nocreaterole, nobypassrls, noreplication, connection limit 5, statement_timeout 5s,
idle_in_transaction_session_timeout 10s, search_path '') and `brk_square` (same limits, connection limit 3). Password set
separately (SETUP.md, as `camps_registrar`), never in the migration. Table grants: `revoke all … from public, anon, authenticated,
service_role`, then column-level `grant select (…)` to `authenticated` only (never `square_order_id`, `square_link_url`,
`recorded_by`, `paying_by_before`, `submission_id`); nothing to anon, nothing on tables to either new role. Functions: `revoke
execute … from public, anon, authenticated, service_role`; staff ones `grant execute … to authenticated`; the public four to
`brk_registrar`; `brk_square_payment` to `brk_square`; every internal helper revoked from everyone.

## Seed (inside 0051)
`brk_settings` row: 300 / 400 / 25 / 100 / 12, version 1. `brk_chart`: rows from `docs/Board Breaking/Board-chart-seed.md` (live-page
numbers). Techniques: Little Tiger White/Yellow Hammer Fist, Green/Blue Elbow Strike, Red/Black Axe Kick; Child and Teen share these
(Yellow Elbow Strike, Orange Flying Side Kick (Teen: Front Snap Kick), Green Axe Kick, High Green Round House Kick, Blue Punch, High
Blue Jumping Front Snap Kick, Purple Back Kick, Red Spinning Round House, High Red Skipping Hook Kick, Brown Back Hook Kick, High
Brown Back Kick (Adult Board), Red / Black Back Kick / Axe (Adult Board), Bo-Dan / Deputy Back Hook + Spinning Round House + 3
Power Breaking; White Hammer Fist); Black Belt: 1st Dan Back Hook + Spinning Round House + Power Breaking, 1 Star Side Kick Punch, 2 Star
Eagle, 3 Star Side Kick / Back Kick, 4 Star and 2nd Dan 7 Station + Power Breaking, 2nd Dan 1–3 Star and 3rd Dan … 3 Kicks in Air,
3rd Dan 5 Star 4 Adult Board Back Kick. (Starting text only; Jeffrey confirms later.) `sort` = list order within a band.
