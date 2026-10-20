# Contract 0018 — Finance: Color Belt PRIVATE testing payments in the Daily report

**Status:** DRAFT 2026-10-19 (Builder A — database), for the orchestrator's review. Migration number **0018** reserved by the Main session (camps holds 0017). Nothing applied anywhere.
**Depends on:** 0011 (Finance, live), **camps' 0013 + 0017** (camp payments in the Daily report — not written yet), **0014** (Color Belt private testing, live). Production order: 0011 → 0013 + 0017 → 0014 → **0018**.
**Sources (in this order of authority):** this contract · CONTRACT-0011 (Finance rules; unchanged unless said here) · CONTRACT-0014 §2.2, §2.5.1, §2.5.2, §10 point 11 · the live `0014_testing_private.sql` · handoff §6.

> In plain words: Color Belt can now test a student **privately** (0014). Their money lives in a new table, `testing_private_payments`, and a student can be **moved** from an event to a private testing, taking their payments with them. Finance must count that money everywhere — and a move must not make the Daily report look as if money was refunded and taken again.

---

## 1. What 0014 writes (checked in the live file)

| Action (0014 function) | Rows written |
|---|---|
| Add + Mark paid (`testing_private_add`, `testing_private_mark_paid`) | private payment: `paid_on` = today, `recorded_by` = the login |
| Undo payment (`testing_private_undo_payment`; staff own < 10 s — never on a moved-in row; admins) | private reversal, `paid_on` = today |
| Edit payment (`testing_private_edit_payment`, admins) | private reversal + private payment, same `recorded_at` and `recorded_by` (as 0005) |
| **Move** (`testing_move_to_private`, §2.5.1 step 9) for each live event payment P | event **reversal R** of P: `paid_on` = **P's**, `recorded_at` = the move time, `recorded_by` = the mover · private **copy C**: same amount / method / `paid_on`, **`recorded_at` = P's original `recorded_at`**, `recorded_by` = the mover, `moved_from_payment_id` = P.id (unique) |
| **Undo move** (`testing_private_undo_move`, the mover < 10 s) | for each private payment: event **payment N**: same amount / method / `paid_on`, **`recorded_at` = the private row's = P's original**, `recorded_by` **null**, `recorded_by_name` = the caller; then the private testing and its payments are **deleted** (cascade) |
| Cancel | the private testing's `status` = cancelled; payments stay |
| Delete permanently (admins) | the private testing and its payments are deleted (cascade) |

- School: `testing_private.location_code` = the event's school at the move, and **neither ever changes** (0014's immutable rule; events' schools never change). So a move never changes a payment's school.
- Kinds: `payment` and `reversal` only (no refunds).

## 2. Rules (as built)

### 2.1 The private source
- Private rows are a **Color Belt** source: items keep `source = 'color_belt'`, `what = 'color_belt'` (codes only — no new code for the screens). `is_private = true`, `event_date` = `private_date`, `school` = the private testing's `location_code`, names from `testing_private`. The payment detail's `event_name` and `event_id` are **null** for a private item (no event).
- **Owner group:** a private testing that was moved belongs to the **same owner** as its event registration (`moved_from_registration_id`); one that was added directly is its own owner. Chains are built per owner (0011 §1.3), so a moved student's event rows and private rows form one chain set.
- Everything else in 0011 §1.3 applies unchanged to private rows: chains from whole histories; **edit** = reversal + new payment of the same private testing, same `recorded_at` and same (non-null) `recorded_by`; **undone**; **10-second mis-click hide** (same login, no other step); **moved_out** on other dates. A **cancelled** private testing still counts (money taken is money taken). A **deleted** private testing's payments vanish (cascade) → a closed day shows **Changed after closing** (as a deleted event student).

### 2.2 Transfer (Move) — a step, not a correction
- An event reversal **R** of event payment **P**, where a private payment **C** with `moved_from_payment_id = P.id` exists → the chain continues **P → C** (step kind `move`). R is not an undo.
- A `move` step is **not an edit**: the item is still `counted` (or keeps the state its edits give it), `was_*` / `changed_*` come from **edit** steps only, the 10-second hide doesn't apply (the chain has a step). The item shown is the chain's final live row — after a move, the private row (school, names and `is_private` from the private testing).
- The chain id (`payment_id`) stays **P** — stable across the move.
- **Totals, counts, cash / check / card, expected figures** are unchanged by a move (C has P's amount, method and day).
- **Fingerprint:** from 0018 it is md5 of the sorted shown items' **`payment_id`**`|amount_cents|method|state` (0011 used `row_id`), so a move doesn't change it. Content changes still change it: amount, method, state, an added or removed chain. (One effect: an edit to exactly the same amount, method and day changes only the state — `counted` → `edited` — as before.)
- **Changed after closing:** compares the snapshot with the day now **by chain id + amount + method + kind** (0011 also compared `row_id`). So a move alone is **not** a difference; any money difference still is. The snapshot table is unchanged (it still stores `row_id`, now for information only).
- An **undone** chain shows, on each of its days, its **first row of that day** (0011's rule, unchanged): for a moved payment later undone on the private side that is the original **event** payment (`is_private` false, the event's details), struck through with "undone by" the person who undid the copy. A live chain shows its final row (the private copy).
- After C, all normal rules apply on the private side: C can be undone or edited by the private functions (admins; the mover can't own-undo a moved-in row), moved through further edits, etc.

### 2.3 Undo move — the chain carries on as if nothing happened
- An event reversal **R** of event payment **P**, where **no** private copy of P exists any more, and an event payment **N** of the same registration exists with **N.recorded_at = P.recorded_at, N.recorded_by is null, the same amount, method and paid_on**, N ≠ P, N not already the new row of an edit or move → the chain continues **P → N** (step kind `move_undone`). R is not an undo.
- Like `move`, it is not an edit: P's day shows the item `counted` as before, totals unchanged, no `undone` line.
- **Edge cases (documented, accepted):**
  1. Move → undo move → move → undo move again for the same student: the recreated rows all carry P's original `recorded_at`, so two candidates can match; the first free one (smallest id) is taken. Totals are always right; in a rare case an extra `undone` line can appear for the student on that day. (The real Undo is only possible within 10 seconds of a move.)
  2. A moved private testing **deleted by an admin** later: its copies vanish, R now looks like an undo → P shows **undone** on its day (true: the money is gone from both sides) → Changed after closing on a closed day.
  3. The **event** (or the event registration) deleted after a move: P and R vanish (cascade); C stays and becomes a chain on its own (its own id as `payment_id`) → a closed day sees one chain removed and one added → Changed after closing (2), money unchanged.
- Matching never uses text order: ids, timestamps, amounts and dates only (production sorts text with ICU en_US).

### 2.4 Security, privacy, speed (as 0011, unchanged)
- `has_data_access()` first; staff today only (incl. the payment detail of a private payment); security definer only on the 14 app functions; helpers executable by nobody; `search_path = ''`; revokes incl. `service_role`; nothing to `anon`.
- No answer holds a login id (`recorded_by`, `created_by`, `updated_by`, `cancelled_by`) or anything from 0014 not listed in §2.1. `testing_private` has no date of birth or email. Login ids are still read only inside `finance_chain_steps_core` and `finance_closing_is_mine`.
- New index `finance_testing_private_payments_paid_on_idx` on `testing_private_payments (paid_on)`. Speed bounds of 0011's step 14g (each app function < 2 s on the big seed) hold with private rows added.

## 3. What 0018 replaces (create or replace; re-run safe; one transaction)

| Function | Change (marked `-- ===== source: color belt private (0018) =====` … `-- ===== end color belt private =====`) |
|---|---|
| `finance_chain_steps_core` | **dropped + recreated** (two new output columns `private_id`, `step_kind` and `link_at`, `link_by_name`): the private rows (owner group §2.1), the move and undo-move links (§2.2, §2.3), edits only within the same table |
| `finance_chain_items` | **dropped + recreated** (new output column `private_id`): state / `was_*` / `changed_*` from edit steps only |
| `finance_money_rows_core` | the private join (school, names, `is_private`, `event_date`; `event_name` / `event_id` null) |
| `finance_figures_from` | fingerprint by `payment_id` (§2.2) |
| `finance_closing_changes_from` | compare by chain id + amount + method + kind (§2.2) |
| `finance_payment_detail` | find a private payment's owner group; history lines for `move` (`what: 'moved'`) and `move_undone` (`what: 'move_undone'`) |

Unchanged: every table, row, setting, reminder time, closing, right and every other function. Every answer keeps 0011's keys; the only new **values** are the two history `what` codes above.

## 4. UI follow-up (not in 0018; screens unchanged)
1. Payment detail history: label `moved` ("Moved to private testing") and `move_undone` ("Move undone") in `text.js` — until then the screen shows its generic fallback.
2. A private item's "For" line: "Color belt testing · private <date>" from `is_private` + `event_date` (already in the item) — check the screen uses `is_private` for Color Belt too (it did only for Star).
3. Payment detail of a private item: no event, so no "Open in Testing" link (`event_id` null) — a link to the Private testing tab could come later.

## 5. Tests (`supabase/tests/0018_tests.sql`, prints `ALL 0018 TESTS PASSED`) + `0018_fingerprints.sql` + `run.mjs`
Made with the REAL 0014 functions wherever possible (dates other than today are written directly, as 0011's tests do). Cases: a plain private payment counted on its day for the private testing's school; private undo / edit / 10-second hide; **move** with one and with two live event payments plus an earlier undone pair that stays on the event side → the day's totals, counts, expected figures and fingerprint identical before / after; items show the private row; a closed day is NOT Changed after closing; **move then undo move** → totals identical, no undone line; move then a private-side undo / edit; cancelled still counts; deleted → Changed after closing; export, preview, history, Home, Both, payment detail include private rows; staff today-only on a private payment's detail; privacy (keys, no login ids). `run.mjs`: on a fresh database 0011 → (camps 0013 + 0017 when they exist) → 0014 (fixture until the real file is on this branch) → 0018; `0011_tests.sql` and `0018_tests.sql`; re-run safety; old-vs-new (0011 vs 0018 on data without private rows: identical items and figures except the fingerprint value); speed with private rows; the ICU run.
