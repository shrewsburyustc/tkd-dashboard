# CONTRACT-0026 — Finance: Black Belt payments in the Daily report

**Status:** FINAL 2026-10-27 (Finance session, branch `finance`). Mockups B1–B9 and every proposal in them approved as drawn by Jeffrey on 2026-10-27 (rulebook **v0.815**); card refunds in Close the day decided in question 20 (**v0.814**). Migration **0026** (`supabase/migrations/0026_finance_black_belt.sql`), reserved through Main on 2026-10-25.

**Decisions it carries out:** v0.808 (Black Belt money in the Daily report), v0.809 (bounced checks on the day returned), v0.815 (the screens, mockups B1–B9), v0.814 (card refunds come off the expected card total in Close the day, question 20 B), v1.034 / design review D7 (built next; live before Black Belt's family form is switched on, Black Belt CP6). Existing Finance rules that apply unchanged: v0.199 (corrections show on the original day), v0.209 (refunds), v0.810 (only real money changes flag a closed day), v0.195 (staff see today only).

**Builds on (production order):** 0011 (speed fix) → camps' 0013 + 0017 → 0014 → 0018 → 0016 → 0024 → 0025 → **0026**. It replaces Finance functions **as 0018 leaves them** (and `finance_day` / `finance_export` as 0017 leaves them; 0018 didn't replace those two). No migration after 0018 touches a Finance function (checked 2026-10-25: 0019–0025 contain no `function public.finance_`). A guard refuses to run unless the live bodies are exactly those (md5 without comments and white space, as 0018's guard does), so 0026 can never silently undo another file.

---

## 1. What Black Belt writes (0016, unchanged by 0024 / 0025)

One append-only table, `public.bb_payments` (0016). Columns Finance reads: `id, candidate_id, cycle_id, kind, amount_cents, method, paid_on, for_items, location_code, cycle_name, recorded_at, recorded_by, recorded_by_name, reverses_payment_id`. Never returned by Finance: `recorded_by` (read only to compare logins, as today), `note`, `reason`.

| Kind | Amount | `reverses_payment_id` | Written by |
|---|---|---|---|
| `payment` | +1 … +$5,000 | null | `bb_record_payment` (staff; `paid_on` = today), `bb_edit_payment` (new row, **old row's `paid_on`**) |
| `refund` | −1 … −$5,000, cash / check / **card** | null | `bb_record_refund` (admins; today) |
| `reversal` | ± the target | the row it cancels (a payment, a refund, or a **returned** row) | `bb_undo_payment` (staff own < 10 s, else admins; today), `bb_edit_payment` (old row; same `recorded_at` and `recorded_by` as the new row) |
| `returned` | −the check, method `check` | the check payment | `bb_mark_check_returned` (admins; today; once per check, ever) |

- **School:** `location_code` is stored on every row when it's recorded and copied by corrections — Finance uses it as is (v0.808 "school as recorded").
- **Cycle:** `cycle_name` is stored on every row (a later rename of the cycle doesn't change old rows) — Finance uses the stored name.
- **What it's for:** `for_items` on payment rows only (`p1`…`p12`, `kukkiwon`). A returned row takes the items of the check it marks.
- **Rules that hold (0016's guard):** a payment with a live returned mark can't be undone or edited; a returned mark can be undone (a reversal of the returned row), after which the check can be corrected normally; nothing is ever updated or deleted; a candidate or cycle with any payment row can't be deleted.
- **Same as Color Belt / Star:** an edit is a reversal + a new payment with the same `recorded_at` and the same (non-null) `recorded_by`; an undo is a reversal alone; the staff-own-10-seconds undo is a mis-click (hidden). So 0011's chain rules apply unchanged.
- **Different:** a fourth kind (`returned`); a reversal may point at a returned row; an edit never changes the day (so a Black Belt chain never has "Moved to / Moved from"); card refunds exist.

## 2. Rules

### 2.1 The Black Belt source
- New source **`black_belt`** (next to `color_belt`, `star`, `camp`); `what = 'black_belt'`. Owner = `candidate_id`. School = the row's `location_code`. Names = `bb_candidates.first_name / last_name` only.
- Item fields added for Black Belt (null for the other sources, which keep their keys exactly): `cycle_name` (from the shown row), `for_items` (the shown row's, or for a returned row the check's), `one_payment_plan` (the candidate's current plan name when that plan has one payment, else null — the Black Belt screens show "In full" instead of "Payment 1" for such a plan; the screen copies that rule).
- "For" text is built by the screens (words in `text.js`): **“Black Belt · <cycle> · <items>”**, items as Black Belt's own screens write them ("Payment 2", "Payment 1 + Kukkiwon", the one-payment plan's name). A refund: “Black Belt · <cycle>” (+ the method note in the Refunds group, as Star refunds). No testing date (a cycle has several testing days): `event_date` is null; the detail's For row has no date (mockup B3).
- Same day rule as the others: every row counts on its `paid_on` (post-dated checks counted the day they're handed in — v0.218 on Black Belt's side).

### 2.2 Returned checks (v0.809)
- A `returned` row is **its own chain**, never a step of the check's chain: the check P keeps its line on its own day, counted, unchanged (v0.809: "the day the check was handed in stays exactly as counted"). Chain building must therefore not treat a returned row's `reverses_payment_id` as a reversal of P.
- Its item: `kind = 'returned'`, amount negative, method `check`, shown on the returned row's `paid_on`, state `counted`, plus `handed_in_on` = P's `paid_on` and `recorded_by_name` = who marked it. On screen: group “Returned checks”, last; sub-line “Returned by the bank · handed in <day>” (the recorder only in Recorded by — v0.815).
- **Undo of a returned mark** (a reversal of the returned row): the returned chain is **undone** — v0.199: on the returned day the line shows struck through, "Undone by <name> · <day> · not counted" (approved, mockup B5). It is a correction of a recording mistake, so v0.199 applies (v0.809's exception is only for the bounce itself).
- After the mark is undone, P can be undone or edited as usual (normal chain rules).
- **Card refunds (v0.814):** Close the day's expected card figure = card money in − card refunds, written like cash (“Expected $X ($Y in − $Z refunded)”); the `In groups` Card card shows the same. This changes `finance_figures_from` (card refunds are subtracted from the expected card figure, as cash refunds already are) and `CloseDayBox.jsx` / `text.js` (the card Expected line). Only Black Belt can refund to a card today, so other sources' answers don't change.
- **Totals:** the day's Total includes returned rows (net: "after a $900.00 returned check", v0.809). Cash / Check / Card cards count money **in** (kind `payment`) as today — a returned check doesn't change them.
- **Close the day is not affected** (v0.809), read as (approved, mockup B2): returned rows are left out of everything Close the day uses —
  - expected count / cash / checks / card, and the closing snapshot (`finance_day_closing_items`);
  - "Changed after closing" (a returned mark recorded after the day was closed doesn't flag it; nor does its undo);
  - whether a day needs closing: a day whose only items are returned checks (or undone ones) has nothing to close — "Close the day…" isn't offered, it isn't "Not closed" in History, and the Home reminder doesn't count it.
- **Export:** the returned check is its own row (v0.809): Kind "Returned check", Amount and Counted negative, For as above, Testing date empty (mockup B6).

### 2.3 Everything else as today
- Edits (always the same day for Black Belt), undos, the hidden mis-click, refunds and their undos, fingerprints, v0.810's "only real money changes flag a closed day", staff-today-only, the Both summary, History, the Home reminders, the Hide-payments switch — all unchanged, now including Black Belt rows.
- **Payment detail** accepts source `black_belt`: the item, `event_name` = the cycle name, `event_id` = the cycle id (the screen's "Open in Testing" opens that cycle's Candidates tab — the event pattern), and a history built from the chain: recorded / edited / undone / refunded as today, and for a returned row: "marked it returned by the bank" (`returned`) and "undid the returned mark" (`returned_undone`) (approved wording, mockups B4–B5). No note, reason, login id, date of birth or email.
- **Amounts:** Black Belt rows go to $5,000: `finance_day_closing_items_amount_check` widens to ±$5,000 (500000); the source check adds `black_belt`.

### 2.4 Security, privacy, speed (as 0011 / 0018)
- `has_data_access()` first; staff today only (incl. a Black Belt payment's detail); security definer only on the existing app functions, helpers executable by nobody; `search_path = ''`; fully qualified names; revokes incl. `service_role`; nothing to `anon`. No new table, no new grant. Finance reads `bb_payments`, `bb_candidates` (names, current plan id), `bb_cycle_plans` (name, payments count) only inside its functions.
- No answer holds a login id, note, reason, date of birth, email or waiver data.
- Speed: `bb_payments` already has a `paid_on` index (0016). Every app function answers in < 2 s on the big seed plus a Black Belt seed (thousands of rows, with returned checks and undone marks) — measured in PGlite.
- Matching never uses text order (production sorts with ICU en_US).

## 3. What 0026 replaces (one transaction; re-run safe; forward-only)
- Constraints on `finance_day_closing_items`: source (+ `black_belt`), amount (±$5,000).
- Functions as 0018 leaves them: `finance_chain_steps_core`, `finance_chain_items`, `finance_money_rows_core`, `finance_figures_from`, `finance_closing_changes_from`, `finance_payment_detail`; and as 0017 leaves them: `finance_day`, `finance_export`; plus any of `finance_close_day` / `finance_home` / `finance_history` / `finance_day_both` that has to leave returned rows out of "needs closing" (exact list fixed while building — the guard covers every replaced body).
- Built the 0018 way: a generator (`supabase/tools/build_0026.py`) applies exact text replacements to the live bodies, every change inside `-- ===== source: black belt (0026) =====` … `-- ===== end black belt =====` or on a line ending `-- 0026`; every camp and private block kept byte for byte (self-checked on each build).
- Re-running an earlier Finance file after 0026 is not supported (forward-only, as 0018); SETUP says what happens and to re-run 0026 straight after.

## 4. Screens (finance branch, after the mockups are approved)
`text.js` words; `PaymentsList.jsx` (For line, Returned checks group, tags); `PaymentDetailDialog.jsx` (Black Belt For row without a date, returned-check rows, history lines, hint "Payments are changed on the candidate's page in Black Belt testing, not here.", Open in Testing → the cycle); the Total card's note ("after $150.00 refunds and a $900.00 returned check"); `csv.js` labels (`black_belt`, `returned`); `financeRules.js` + `mockFinance.js` (preview: a Black Belt store with payments, an edit, a refund, a returned check and an undone mark); `App.jsx` `openTestingFor` (source `black_belt` → `navigate('testing', { testingPage: 'blackBelt', eventId: cycleId })`).

## 5. Tests
- `supabase/tests/0026_tests.sql` (prints `ALL 0026 TESTS PASSED`), using the REAL Black Belt functions (`bb_record_payment`, `bb_edit_payment`, `bb_undo_payment`, `bb_record_refund`, `bb_mark_check_returned`) wherever possible: the For fields; school as recorded after a school change; a $2,700 payment; edit; mis-click hidden; refund by card; a returned check on its own day with the check's day unchanged and still matching its close; the undo of a returned mark; a returned-only day not needing a close; a returned mark after a close not flagging it; staff today only; no forbidden keys; Color Belt, Star, camp and private answers unchanged (old-vs-new comparison on the big seeds).
- `0026_fingerprints.sql`, `0026_preapply_check.sql` (read-only: the live bodies match the guard; Black Belt rows on closed days, if any), PGlite step `step0026` in `run.mjs` (live order incl. 0016 / 0024 / 0025, an ICU run, speed), and the SETUP section **“## Migration 0026: …”** with sub-steps 0026a–0026d.
- Reviews: security review of 0026; the Black Belt session reviews the reading of `bb_payments`; design review of the screens at the four sizes.
