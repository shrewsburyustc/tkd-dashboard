# CONTRACT-0039 — Camps Record refund (database ↔ app)

What the migration `supabase/migrations/0039_camps_record_refund.sql` provides and the app (`src/lib/camps/campsApi.js`, `campsArgs.js`, fake store `src/lib/mockCamps.js`) calls. Rulebook v1.039 (refund as its own row), v1.040 (the desk that hands the money back), v0.743 (screens and words, picture 22). Plan: `TKD-Camps-Pass1-Plan.md` step 3. Model: Star's `star_record_refund` (0006 §18x) and Star's Undo refund. Both sides follow this file; a change to it is made here first.

## Facts this builds on (checked 2026-11-06)
- `camp_payments` (0013 §11): append-only; `kind` 'payment' (1…1000000 since 0022, R5) or 'reversal' (−1000000…−1, `reverses_payment_id` set); method cash / check / card; `school` = the desk's school. `camp_payments_kind_check` was last set in **0022** (≈line 2083).
- `camp_payments_guard()` (0013 §13h): a reversal must undo a **payment** of the same camper, for exactly minus its amount, at its school.
- Paid = the sum of all the camper's rows (`camp_camper_paid_cents`, 0013; the roster view's `paid_cents`), so a refund row (negative) and its reversal (positive) count by themselves.
- `camp_roster` (0033): `last_payment_id` / `paid_on` / `paid_method` come only from `kind = 'payment'` rows not reversed — a refund never becomes "the last payment".
- `camp_camper_detail` (0043, current): `payments` lists **every** row with `kind` and `reverses_payment_id`, so refunds and their reversals reach the app with no change to it. **0039 does not replace `camp_camper_detail` or `camp_public_signup_core`.**
- `camp_undo_payment` / `camp_edit_payment` (0033, current): replaced here only to add the refund check below.

## Table
- `camp_payments_kind_check` widens (drop + add, same name):
  `(kind = 'payment' and amount_cents between 1 and 1000000 and reverses_payment_id is null)`
  `or (kind = 'refund' and amount_cents between -1000000 and -1 and reverses_payment_id is null)`
  `or (kind = 'reversal' and amount_cents between -1000000 and 1000000 and amount_cents <> 0 and reverses_payment_id is not null)` — 0022's limits ($10,000), so nothing narrows.
  Existing rows all pass (nothing is rewritten).
- Refunds use method cash or check only (checked in the function; the column check stays cash / check / card).
- `camp_payments_guard()` replaced: a reversal undoes a **payment or a refund** (never a reversal) of the same camper, for exactly minus its amount, at its school. Everything else as 0013.

## Functions (all `security definer`, `set search_path = ''`, fully qualified, `public.has_data_access()` first → `{status:'no_access'}`; `revoke all … from public, anon, authenticated, service_role`; `grant execute … to authenticated`; nothing to anon; logged through the existing `camp_payments` / `camp_campers` history with `tkd.action` and a fresh `tkd.batch_id`; the usual exception block: unique / check / FK / not-null → stale or invalid, deadlock / serialization / lock → stale)

### `public.camp_record_refund(p_camper_id uuid, p_expected_version integer, p_method text, p_amount_cents integer, p_refunded_on date, p_school text) returns jsonb` — admins
- Not an admin (`public.is_admin()` not true) → `{status:'not_allowed'}`.
- Missing input; method not cash / check; amount not 1…1000000 (the same limit as a payment; the real cap is the overpaid amount); date null or after `public.testing_today()` → `{status:'invalid'}`; school null or not in `public.locations` → `{status:'invalid', field:'school'}` (as `camp_mark_paid`).
- Locks the camper (`camp_lock_camper`); none → `not_found`; version ≠ expected → `stale`; withdrawn → `withdrawn`.
- Date before the sign-up's `signed_up_on` → `{status:'invalid', field:'date'}`.
- Overpaid = paid − total (never below 0). Nothing overpaid, or amount > overpaid → `{status:'refund_too_large', overpaid_cents:n}`.
- Inserts `kind 'refund'`, `amount_cents = −amount`, method, `paid_on = p_refunded_on`, `school = p_school` (This device, v1.040), `recorded_by = auth.uid()`, `recorded_by_name = public.change_log_actor_name()`; bumps the camper's version. `tkd.action = 'camp_record_refund'`.
- Ok: `{status:'ok', payment_id, version}`.

### `public.camp_undo_refund(p_payment_id uuid) returns jsonb` — admins
- Not an admin → `not_allowed`; null → `invalid`; row missing → `not_found`; not a refund → `invalid`; already reversed → `stale`; camper withdrawn → `withdrawn`.
- Locks the camper, then writes a reversal: `kind 'reversal'`, `amount_cents = +refund`, same method, `paid_on = testing_today()`, **school = the refund's school** (v1.040), `reverses_payment_id` = the refund; bumps the version. `tkd.action = 'camp_undo_refund'`.
- Ok: `{status:'ok', version}`.

### `camp_undo_payment(p_payment_id)` and `camp_edit_payment(…)` — 0033's code plus one check
- While the camper has a refund that stands (a `refund` row not reversed) → `{status:'refund_stands'}`, checked after the existing rights / not-found / stale checks and before writing. Same signatures, rules, answers and grants otherwise (so the live app keeps working).

### `camp_roster` view — 0033's view plus one last column
- `refunded_cents` (integer ≥ 0): the camper's refunds that stand, as a positive number. Added at the end (create or replace view keeps the grants).

## App
- `recordRefund({ camperId, expectedVersion, method, amountCents, refundedOn, school })` → the answer above (`payment_id` → `paymentId`, `overpaid_cents` → `overpaidCents`).
- `undoRefund({ paymentId })`.
- Roster rows gain `refundedCents`; a refund stands when it is > 0.
- Menu (v0.743): admins, money group, after Undo payment and before Print receipt — **Undo refund** while `refundedCents > 0`, else **Record refund** while `owesCents < 0`; Edit payment and Undo payment grayed with "Undo the refund first." while a refund stands. Hidden while Hide private details is on (money items).
- Undo refund reads Camper detail first and undoes the newest refund that stands.
- `refund_stands` (a race) → "Undo the refund first."; `refund_too_large` → under Amount "Can’t be more than the $Y overpaid." (or, at 0, "Nothing is overpaid any more." as Star).
- The fake store does exactly the same, including `refund_stands` and the guard rule.

## Not in 0039
No change to Finance (its R1-05 lists camp refunds in its Refunds group; the app push that offers Record refund waits for it). No change to `camp_camper_detail`, `camp_public_signup_core`, `camp_mark_paid`, the history reader or anything for anon / `camps_registrar`.

## Order
Pre-apply check (read-only) → Jeffrey pastes 0039 in the SQL Editor (it has a `drop constraint` for the kind check, replaced in the same transaction, so Supabase warns; no data is removed) → fingerprints, advisor, tests → Finance's R1-05 → the app push. Pasting 0039 alone changes nothing on screen: the live app never calls the new functions, and no refund row exists until the new app is live.
