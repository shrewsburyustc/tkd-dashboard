# Contract 0018 — Finance: Color Belt PRIVATE testing payments in the Daily report

**Status:** DRAFT 2026-10-19 (Builder A — database), after the first security review's fix round; **built over camps' final 0017** (`0017_finance_camps.sql` at git `fb4ec24`) with `supabase/tools/build_0018.py`. For the orchestrator's review and a fresh security review. Migration number **0018** reserved by the Main session (camps holds 0017). Nothing applied anywhere.
**Depends on:** 0011 (Finance, live), **camps' 0013 + 0017** (camp payments in the Daily report), **0014** (Color Belt private testing, live). Production order: 0011 → 0013 + 0017 → 0014 → **0018**. Undo order: 0018, then 0017, then 0013.
**Sources (in this order of authority):** this contract · CONTRACT-0011 (Finance rules; unchanged unless said here) · camps' CONTRACT for 0017 · CONTRACT-0014 §2.2, §2.5.1, §2.5.2, §10 point 11 · the live `0014_testing_private.sql` · handoff §6.

> In plain words: Color Belt can now test a student **privately** (0014). Their money lives in a new table, `testing_private_payments`, and a student can be **moved** from an event to a private testing, taking their payments with them. Finance must count that money everywhere — and a move must not make the Daily report look as if money was refunded and taken again.

---

## 1. What 0014 writes (checked in the live file)

| Action (0014 function) | Rows written |
|---|---|
| Add + Mark paid (`testing_private_add`, `testing_private_mark_paid`) | private payment: `paid_on` = today, `recorded_by` = the login |
| Undo payment (`testing_private_undo_payment`; staff own < 10 s — never on a moved-in row; admins) | private reversal, `paid_on` = today |
| Edit payment (`testing_private_edit_payment`, admins) | private reversal + private payment, same `recorded_at` and `recorded_by` (as 0005) |
| **Move** (`testing_move_to_private`, §2.5.1 step 9) for each live event payment P | event **reversal R** of P: `paid_on` = **P's**, `recorded_at` = the move time, `recorded_by` = the mover · private **copy C**: same amount / method / `paid_on`, **`recorded_at` = P's original `recorded_at`**, `recorded_by` = the mover, `moved_from_payment_id` = P.id (unique) |
| **Undo move** (`testing_private_undo_move`, only the mover, < 10 s) | for each private payment: event **payment N**: same amount / method / `paid_on`, **`recorded_at` = the private row's = P's original**, `recorded_by` **null**, `recorded_by_name` = the caller (= the mover); then the private testing and its payments are **deleted** (cascade) |
| Cancel | the private testing's `status` = cancelled; payments stay |
| Delete permanently (admins) | the private testing and its payments are deleted (cascade) |

- School: `testing_private.location_code` = the event's school at the move, and **neither ever changes** (0014's immutable rule; events' schools never change). So a move never changes a payment's school.
- Kinds: `payment` and `reversal` only (no refunds).

## 2. Rules (as built)

### 2.1 The private source
- Private rows are a **Color Belt** source: items keep `source = 'color_belt'`, `what = 'color_belt'` (codes only — no new code for the screens). `is_private = true`, `event_date` = `private_date`, `school` = the private testing's `location_code`, names from `testing_private`. The payment detail's `event_name` and `event_id` are **null** for a private item (no event).
- **Owner group:** a private testing that was moved belongs to the **same owner** as its event registration (`moved_from_registration_id`); one that was added directly is its own owner. Chains are built per owner (0011 §1.3), so a moved student's event rows and private rows form one chain set.
- Everything else in 0011 §1.3 applies unchanged to private rows: chains from whole histories; **edit** = reversal + new payment of the **same table and private testing**, same `recorded_at` and same (non-null) `recorded_by`; **undone**; **10-second mis-click hide** (same login, no other step); **moved_out** on other dates. A **cancelled** private testing still counts (money taken is money taken). A **deleted** private testing's payments vanish (cascade) → a closed day shows **Changed after closing** (as a deleted event student).
- **Who took the money:** an item's `recorded_by_name` and `time` are those of the chain's last **first-or-edit** row — the person who took (or last corrected) the money, never the mover or the person who undid a move. (Desk records, admin moves → the line still says the desk.)
- Camps (0017) and Star rows are untouched: the move and undo-move links are looked for **only among Color Belt rows**.

### 2.2 Transfer (Move) — a step, not a correction
- An event reversal **R** of event payment **P**, where a private payment **C** with `moved_from_payment_id = P.id` exists → the chain continues **P → C** (step kind `move`). R is not an undo.
- A `move` step is **not an edit**: the item is still `counted` (or keeps the state its edits give it), `was_*` / `changed_*` come from **edit** steps only, the 10-second hide doesn't apply (the chain has a step). The item shown is the chain's final live row — after a move, the private row (school, names and `is_private` from the private testing).
- The chain id (`payment_id`) stays **P** — stable across the move.
- **Totals, counts, cash / check / card, expected figures** are unchanged by a move (C has P's amount, method and day).
- **Fingerprint:** from 0018 it is md5 of the sorted shown items' **`payment_id`**`|amount_cents|method|state` (0011 used `row_id`), so a move doesn't change it. Content changes still change it: amount, method, state, an added or removed chain.
- **Changed after closing:** a snapshot item and an item now are **the same chain when EITHER the chain id OR the row id agrees** (a row belongs to one chain, so nothing pairs twice). A difference is: an item only now, an item only in the snapshot, or a pair with another amount / method / kind. (0011 also compared `row_id` inside a pair; 0018 doesn't.) The snapshot table is unchanged.
  - **Decision:** a no-op edit (same amount, method and day) after closing is **no longer** flagged — no money changed.
  - **Days closed before 0018** (0011 / 0017 didn't count private money): a day with a **private payment**, or with a payment **moved before the close** (that close saw it as undone and left it out), correctly shows **Changed after closing** after 0018. A move **after** the close (paired by chain id) and a move + undo move **before** the close (the recreated row was counted then; paired by row id) do **not**. `supabase/tests/0018_preapply_check.sql` (read-only) lists the closed days with private payments, moves before the close or undone moves **before** 0018 is pasted (SETUP §18).
- An **undone** chain shows, on each of its days, its **first row of that day** (0011's rule, unchanged): for a moved payment later undone on the private side that is the original **event** payment (`is_private` false, the event's details), struck through with "undone by" the person who undid the copy. A live chain shows its final row (the private copy).
- After C, all normal rules apply on the private side: C can be undone or edited by the private functions (admins; the mover can't own-undo a moved-in row), moved through further edits, etc.

### 2.3 Undo move — the chain carries on as if nothing happened
- A Color Belt **event** reversal **R** of event payment **P**, that is neither an edit nor a move, **dated on P's day** and **written by a login** (`recorded_by` not null — 0014's Move writes it so), where **no** private copy of P exists any more, and an event payment **N** of the same registration exists with **N.recorded_at = P.recorded_at, N.recorded_by null, N.recorded_by_name = R.recorded_by_name** (only the mover can undo a move), **the same amount, method and paid_on**, N ≠ P, N not already the new row of an edit or move → the chain continues **P → N** (step kind `move_undone`). R is not an undo.
- Like `move`, it is not an edit: P's day shows the item `counted` as before, totals unchanged, no `undone` line. The line still names the person who took the money (§2.1).
- Near misses stay what they are (tested): an admin Undo dated today followed by an SQL-Editor payment with the old time, or a reversal written without a login, are an undo + a payment.
- **Edge cases (documented, accepted):**
  1. Move → undo move → move → undo move again for the same student: the recreated rows all carry P's original `recorded_at`, so two candidates can match; the **smallest id** is taken. Ids are random, so this tie-break is **arbitrary but stable** (the same rows always pair the same way). Totals are always right; in a rare case an extra `undone` line can appear for the student on that day (tested: one counted line, at most one extra undone line). The real Undo is only possible within 10 seconds of a move.
  2. A moved private testing **deleted by an admin** later: its copies vanish, R now looks like an undo → P shows **undone** on its day (true: the money is gone from both sides) → Changed after closing on a closed day.
  3. The **event** (or the event registration) deleted after a move: P and R vanish (cascade); C stays and becomes a chain on its own (its own id as `payment_id`). On a day closed after the move, the snapshot item is paired with it **by its row id** → **not** Changed after closing; money unchanged (tested).
- Matching never uses text order: ids, timestamps, amounts, dates and equality of names only (production sorts text with ICU en_US).

### 2.4 Security, privacy, speed (as 0011, unchanged)
- `has_data_access()` first; staff today only (incl. the payment detail of a private payment); security definer only on the 14 app functions; helpers executable by nobody; `search_path = ''`; revokes incl. `service_role`; nothing to `anon`.
- No answer holds a login id (`recorded_by`, `created_by`, `updated_by`, `cancelled_by`) or anything from 0014 not listed in §2.1. `testing_private` has no date of birth or email. Login ids are still read only inside `finance_chain_steps_core` and `finance_closing_is_mine`.
- New index `finance_testing_private_payments_paid_on_idx` on `testing_private_payments (paid_on)`. Each app function answers in < 2 s on the big seed with Color Belt, Star, camp and private rows (measured: at most 156 ms).
- Closing-items rows stay within 0017's widened checks (private rows use source `'color_belt'`, amounts ≤ $1,000).

## 3. What 0018 replaces (one transaction; re-run safe)

| Function | Base text | Change (marked `-- ===== source: color belt private (0018) =====` … `-- ===== end color belt private =====`, or a line with a `-- 0018` comment) |
|---|---|---|
| `finance_chain_steps_core` | camps' 0017 (its camp block kept byte for byte) | **dropped + created** (new output columns `private_id`, `step_kind`, `link_at`, `link_by_name`): an owners CTE incl. private testings, the private branch, the private columns by a left join after the union (no other branch changed), the move / undo-move links (Color Belt only), edits only within the same table |
| `finance_chain_items` | 0011 (0017 doesn't replace it) | **dropped + recreated** (new output column `private_id`): state / `was_*` / `changed_*` from edit steps only; name and time of the last first-or-edit row |
| `finance_money_rows_core` | camps' 0017 (its 9 camp blocks kept) | the private join (school, names, `is_private`, `event_date`; `event_name` / `event_id` null) |
| `finance_figures_from` | 0011 | fingerprint by `payment_id` |
| `finance_closing_changes_from` | 0011 | pairs by chain id OR row id; compares amount, method, kind |
| `finance_payment_detail` | camps' 0017 (its 4 camp blocks kept) | find a private payment's owner group; history lines `moved` / `move_undone` |

- `finance_day` and `finance_export` stay as camps' 0017 has them (0018's rules don't need them changed).
- `build_0018.py` checks every build: every line that differs from the base text is marked, no base line disappears, and every camp block of 0017 is in the output byte for byte; `run.mjs` checks the camp blocks too.
- A **guard** at the top: 0018 stops (and changes nothing) unless 0014's private payments table exists and camps' 0017 is applied (its `source: camp (0017)` mark in `finance_chain_steps_core`).
- **Later migrations** that replace `finance_chain_steps_core` or `finance_chain_items` must `drop function if exists` first (the output columns differ) and **keep 0018's output columns** (and its private block), or Finance breaks.
- **Re-running earlier files after 0018:** 0011 stops with "cannot change return type" and is rolled back (nothing changes). Camps' 0017 **runs** and puts back a chain helper without the private columns — Finance then fails until 0018 is run again, in the same sitting.

Unchanged: every table, row, setting, reminder time, closing, right and every other function. Every answer keeps its keys; the only new **values** are the two history `what` codes above.

## 4. UI follow-up (not in 0018; screens unchanged)
1. Payment detail history: label `moved` ("Moved to private testing") and `move_undone` ("Move undone") in `text.js` — until then the screen shows its generic fallback.
2. A private item's "For" line: "Color belt testing · private <date>" from `is_private` + `event_date` (already in the item) — check the screen uses `is_private` for Color Belt too (it did only for Star).
3. Payment detail of a private item: no event, so no "Open in Testing" link (`event_id` null) — a link to the Private testing tab could come later.

## 5. Tests
- **`supabase/tests/0018_tests.sql`** (prints `ALL 0018 TESTS PASSED`), made with the REAL 0014 functions wherever possible (dates other than today are written directly, as 0011's tests do): P1 a plain private payment for the private testing's school (+ Both) · P2 private undo / hide / edit, cancelled still counts · P3 move on a closed day: totals, refunds, fingerprint identical, private row shown, not changed after closing · P4 two payments + an earlier undone pair; the line still names the desk after an admin's move · P5 move + undo move · P6 private-side undo / edit after a move · P7 deleted private testing → changed after closing · P8 payment detail (`moved`, `move_undone`, staff today only) · P9 export, preview, history, Home · P10 privacy and catalog · P11 near misses · P12 move → undo → move → undo · P13 event deleted after a move (closed under 0018) → not changed.
- **`0018_fingerprints.sql`** (6 functions + 1 index; connector-safe) · **`0018_preapply_check.sql`** (read-only, connector-safe).
- **`run.mjs` step 18** (production order with camps' 0013 + 0017 from `fb4ec24` fixtures and 0014 from the live fixture): the guard refuses 0018 before 0017; camps' `0017_tests.sql`, `0011_tests.sql` and `0018_tests.sql` pass; re-run safety; camp blocks byte-identical; **0017 vs 0018** on the big seed + chain seed + camps' big seed without private rows: 474 days (3,471 items, 1,478 of them camp) and 64 payment details identical (figures without the fingerprint); speed with private rows; **days closed before 0018** (move before the close → changed; move + undo move before → not; private payment → changed; event deleted after a move under 0018 → not), and the pre-apply check lists exactly those days; the ICU run (0018_tests, 0011_tests, camps' 0017_tests).
