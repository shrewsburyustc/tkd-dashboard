# CONTRACT-0052 — Finance reads Board breaking payments (Daily report, Close the day, History, Export, payment detail)

Status: **DRAFT, 2026-11-13.** Migration number 0052 reserved by Main 2026-11-12. Runs **after 0051 is live** (applied and tested
2026-11-13). Decisions already made: rulebook v1.300–v1.304 (a Square payment counts at the **event's school**, recorded as
"Square"; refunds are admin-only, cash or check only; Board breaking payments are never "private"). Jeffrey pastes the migration only
after an independent security review and his OK. Model: Finance 0017 (camps), 0026 (Black Belt), 0047 (stored school), 0037
(Export). **0052 replaces only Finance functions; it does not touch a `brk_` object, and 0051 is not changed.**

## 1. What changes for staff

Board breaking money shows up everywhere the other sections' money already shows, as **"Board breaking"** (a new "For" label next to
Color belt testing, Star testing, Camp, Black Belt):
- **Daily report** for the school picked in the top bar: each payment / refund row, counted in Cash / Check / Card totals at the
  **school stored on the payment** (the desk's school; for a Square payment, the event's school).
- **Close the day**: the same rows and totals; a Square card payment is a card payment of that school and day (it is money taken
  that day; it was never in the drawer, same as any card payment).
- **History**, **Export** (CSV; the For cell says "Board breaking"), and **payment detail** (the dialog behind a row: name, event,
  way to pay, who recorded it — "Square" for a webhook payment — and its edits / undo / refund trail).
- Open-in link: a row opens the Board breaking event page (`#testing/breaking/event/<event id>`).

## 2. The database (migration `0052_finance_board_breaking.sql`)

Start from the **live** text of each function (0047's `finance_money_rows_core`, `finance_day`, `finance_payment_detail`,
`finance_export`; 0026's `finance_chain_steps_core` and the others that mention the source list) and replace **only** these,
keeping signatures, rules, grants and everything else byte-for-byte:
1. The chain-steps function (`finance_chain_steps_core`, or whatever currently holds the per-source `union all` branches): a new
   branch `'board_breaking'` over `public.brk_payments` (owner = `registration_id`; kind `payment` / `refund` / `reversal`;
   `method`, `paid_on`, `recorded_at`, `recorded_by`, `recorded_by_name`, `reverses_payment_id`). Edits are reversal + new payment
   with the same `recorded_at` and login — confirm `brk_edit_payment` writes them that way and says so in the report; a Square
   payment has `recorded_by` null and `recorded_by_name` 'Square'.
2. `finance_money_rows_core` (the four places it needs a source: school, was_school, filters, names / event): school =
   `brk_payments.school`; `what` = `'board_breaking'`; names from `brk_registrations` (first / last); `event_date` and
   `event_name` / `event_id` from `brk_events`; `is_private` false; `was_school` as for the other sections (school of the chain's
   first payment when different).
3. `finance_payment_detail`: add `'board_breaking'` to the source whitelist and its owner / date-range lookup.
4. `finance_day` and `finance_export` (and any other function with a per-source `jsonb_build_object` that carries event names): add
   the Board breaking key exactly as camp / black belt have theirs.
5. The check constraint `finance_day_closing_items_source_check` (0026): add `'board_breaking'` to its list (existing rows stay valid).
6. Anything else in the current Finance functions that lists the four sources (grep for `'black_belt'`).

## 3. The app (Finance screens, preview data, labels)

`src/lib/finance/csv.js` and `src/lib/shared/checks.mjs` labels (`board_breaking: 'Board breaking'`), the "Open in …" routing in
`src/App.jsx` (around the Finance branch), the Finance screens' source lists / filters / icons wherever the other four sources are
listed, `src/lib/mockFinance.js` (the preview's fake Finance: Board breaking payments from `src/lib/mockBreaking.js`'s
`brk_payments`, including a Square payment recorded by "Square" and a refund), and the checks that exist for Finance.

## 4. Safety and tests

- Read-only functions; same grants as today; nothing for `anon`; no new table, no new function name if it can be avoided.
- Tests `0052_tests.sql`, `0052_fingerprints.sql` (the replaced functions + the constraint), `0052_preapply_check.sql`
  (0051 present, 0052 not yet), SETUP section "Migration 0052: Finance reads Board breaking", `step0052` in
  `supabase/tests/pglite/run.mjs`. The tests must show: a Board breaking payment appears in Daily report / History / Export /
  payment detail at its **stored school** (also when the other school is picked: not shown); a Square payment (null login) appears
  with the event's school and "Square"; refund rows count at the refund's school; an edit chain (reversal + new payment) shows once
  with "Edited"; a reversed payment disappears from the totals; Close the day accepts Board breaking items; **every other section's
  rows and totals are unchanged** (compare with a fixed set of existing camp / Black Belt / Star / Color belt rows before and after
  the migration); locked / PIN-locked / signed-out sessions read nothing.
- Order: 0051 live (done) → security review → Jeffrey's OK and paste → fingerprints + advisor + tests → the app (Finance labels,
  routing) merges later with the rest of the section, behind its switch.
