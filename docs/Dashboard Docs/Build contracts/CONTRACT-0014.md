# Contract 0014 — Color Belt testing phase 4: the Private testing tab

The single source of truth for the three parallel builders: **A database**, **B data layer + preview mock**, **C staff screens**. They work at the same time without talking to each other, so everything they share is pinned here: tables, columns, grants, function names and arguments, statuses, answer shapes, the money / date / grading rules, JS names and shapes, the route, every string and file ownership. It implements the rewritten build plan; it does not re-decide it. If something here is impossible or contradicts the sources, **stop and report it** — do not improvise.

> **Rewritten 2026-10-19** for the redirect (rulebook v0.401): private testing is its own tab, not connected to any event. The event-linked version of this contract and its build (commit dae8d00) are superseded. §11 says exactly what each builder deletes or reverts first.

| Source (in this order of authority) | |
|---|---|
| This contract | wins for phase 4 |
| Build plan `docs/Testing/Color Belt Testing/TKD-Testing-Phase4-Build-Plan.md` (rewritten 2026-10-19) | CP0 pending |
| Rulebook `docs/Dashboard Docs/TKD-Dashboard-Design-Guidelines.md` — **v0.401, v0.402, v0.403, v0.404** (binding; v0.404 = Move uses today's private price, and staff may Move any time); the parts of v0.225–v0.228 / v0.254 that v0.402 keeps (private price never typed, one-click Mark paid, day from today + weekday, 6 AM–10 PM / 5 minutes, only a result counts as graded, re-price on a pricier belt, Change how they'll pay while owed, “they / their”); v0.136, v0.157, v0.183, v0.186–v0.194; §2.4, §2.5, §3.5, §5 | |
| Approved mockups (wording and layout): `docs/Testing/Color Belt Testing/TKD-ColorBelt-Private-Mockups.html` **P1–P8**, images `Phase 4 images/` — **every proposed item approved as drawn** (v0.403) | approved 2026-10-19 |
| Handoff `docs/Dashboard Docs/TKD-Dashboard-Handoff.md` §6 (security rules, non-negotiable) | |
| Live code: migrations 0001–0006 and 0010 (**live — never edit their SQL**), CONTRACT-0005, CONTRACT-0010, `src/` at commit `dae8d00^` for the phase 3 versions | |

**Working copy:** worktree `.claude/worktrees/color-belt-session-01afc8`, branch `color-belt`. No Supabase connector calls, no Cloudflare, no git remotes, no other worktrees. Do not commit; the orchestrator commits.
**Audience:** Jeffrey is learning IT — every new file starts with a header comment (what + why); plain-English comments on non-obvious lines. Files keep CRLF line endings (check with `file` before and after).
**Production facts:** Supabase `tkd-dashboard` (ref `eozkfbdfxqlcbpewhach`), PostgreSQL 17, Free plan. Live: 0001–0006, 0010, 0011 (Finance). Claimed elsewhere: 0007 Schedule · 0008 Calendar · 0009 Forms · 0011 Finance · 0012 Prospects · 0013 Camps → this is **0014**. Staff: Main Admin (admin), Staff (shared desk). A push to `main` deploys.
**Out:** mat-side hiding (Star v0.249 / v0.250 — a later Color Belt follow-up), a Home card, private on the family form, Realtime, refunds.

---

## 0. File ownership (no file has two owners)

| Builder | Owns (creates / edits / deletes) | Must not edit |
|---|---|---|
| **A — database** (`supabase/**`) | `supabase/migrations/0014_testing_private.sql` (rewrite) · `supabase/tests/0014_tests.sql` (rewrite) · `supabase/tests/0014_fingerprints.sql` (rewrite) · `supabase/tests/0005_tests.sql` (**revert only**, §11) · `supabase/tests/pglite/run.mjs` (step 15 rewritten, §3.3) · `supabase/SETUP.md` (§16 rewritten; the one-line warning at the top of §14e stays) | `src/`, `docs/`, migrations 0001–0010, other test files |
| **B — data layer + mock** (`src/lib/**`) | new `src/lib/testing/privateRules.js` · new `src/lib/testing/privateApi.js` · `src/lib/testing/eventsApi.js` · `src/lib/testing/eventRules.js` (revert only) · `src/lib/mockTestingEvents.js` · `src/lib/testing/checks.mjs` | `src/screens/**`, `src/components/**`, `src/styles/**`, `src/App.jsx`, `src/lib/mockClient.js` (no change needed: new tables / functions are routed through `EVENT_TABLES` / `EVENT_RPC_NAMES`), `supabase/` |
| **C — screens** | `src/screens/Testing.jsx` (**shared**) · `src/App.jsx` (**shared** — the route only) · everything under `src/screens/testing/event/`, `src/screens/testing/events/`, new `src/screens/testing/private/` · `src/screens/testing/text.js` · `src/styles/testing-events.css` · new `src/styles/testing-private.css` · `src/styles/testing.css` (**only** the `.ttabs` sideways scroll) | files of A and B; `src/components/**`, `src/styles/tokens.css`, `navItems.js` |
| Orchestrator | this contract, plan, rulebook (icon-map rows, CP1 wording), status file, handoff, `docs/*`, commits | |

B returns codes, never words; C owns all wording. **Shared files touched:** `src/App.jsx`, `src/screens/Testing.jsx` (C). Not touched: `mockClient.js`, `tokens.css`, `navItems.js`, `README.md`, `docs/README.md`. Merge watch: `run.mjs`, `SETUP.md` (other branches add sections / steps — renumber at merge).

---

## 1. Shared rules (A, B and C must agree exactly)

### 1.1 Words
- *Today* = `public.testing_today()` (America/New_York) / `eventsApi.schoolToday()` (the preview's `setToday` changes both).
- *Private testing* = a `testing_private` row. *Active* / *cancelled* = its `status`.
- *Net paid* = sum of its `testing_private_payments.amount_cents` (reversals negative). *Paid* = net > 0. *Owed* = §1.3. *Owes more* = paid and owed > 0.
- *Has a result* = a `testing_private_results` row with `result is not null`. *Graded (lock meaning)* = a results row exists (result or note) — used only by the Edit-details belt lock, as phase 3.
- *Admin* = `is_admin()` after `has_data_access()`.
- *Upcoming* = active and `private_date >= today`. *Past* = `private_date < today` **or** cancelled.

### 1.2 Date and time rules
| Rule | Exactly |
|---|---|
| Day | `today <= private_date <= today + interval '1 year'`; earlier → **`past_day`**; later → **`invalid`** (§10 point 1). Applies to Add, Change day or time and Move. |
| Time | `06:00`–`22:00` inclusive, minutes a multiple of 5, seconds 0 → else **`invalid`**. 193 choices. |
| Grading window | from the private day: `today < private_date` → `not_open` (admins too); `today > private_date` and not admin → `finished`; else allowed. |
| Edit details belt lock | rank changes **and** a results row exists **and** `today > private_date` **and** not admin → `not_allowed`. |
| Restore (un-cancel) | admins only; `private_date >= today` else **`past_day`** (§10 point 2). |
| Move | all staff, any event state (also after the testing day — v0.404); the registration's own testing-day result decides (§2.5.1). |

### 1.3 Money (one rule, three copies: `testing_private_amount_due` in SQL, `privateRules.amountDue` in JS, the mock)
```
owed = greatest(private_cents − greatest(net, 0), 0)
```
- **Mark paid** records `owed` by the current `paying_by`, `paid_on` = today. `owed = 0` → **`already_paid`**, nothing inserted.
- **Change how they'll pay** allowed when `net <= 0 or owed > 0`; else `already_paid`.
- **Belt correction** re-copies the rank with its **current** private price from Classes and ranks; `owed` follows the formula (pricier → owed; cheaper → 0, no refund).
- **Cancel** keeps all payments. **Delete permanently** removes them with the row.

Worked examples (Group A Yellow → Orange private $85; Group B Blue → High Blue $95):

| # | Situation | Result |
|---|---|---|
| E1 | Added, not paid | Not paid · Mark paid records **$85** → Paid; then `already_paid` |
| E2 | Moved from an event with $65 cash paid Nov 2 | Paid · “Paid $65 · $20 more to collect” · Mark paid records **$20** (paying by) |
| E3 | E2, the desk's own Undo of the $20 within 10 s | owed $20 again |
| E4 | Moved, not paid | Not paid · Mark paid $85 |
| E5 | Moved with $85 paid | Paid, owed 0, no amber line |
| E6 | Paid $85, belt corrected to Group B Blue | price $95 · “Price $85 → $95 · $10 more to collect” (warned in Edit details) · Mark paid $10 |
| E7 | Paid $95, corrected to a $85 rank | owed 0, nothing refunded |
| E8 | Paid $65 + $20, admin Undo payment | reverses the **$20** (most recent live) → owed $20 |
| E9 | Paid $65 + $20, admin Edit payment of the $20 to $10 | net 75 → owed $10 |
| E10 | Private price $0 | owed 0 → no Mark paid button; the database answers `already_paid` |
| E11 | Paid $85, then cancelled | stays Paid; Past card “Payments recorded” includes it: “includes $85 from cancelled” |
| E12 | Owes $20, paying by changed cash → card, Mark paid | records $20 card; the $65 stays cash |
| E13 | Moved with $95 paid, private price $85 (overpaid) | the whole $95 moves; Paid, owed 0, no amber line, nothing refunded |

### 1.4 Statuses (all functions in §2)
`ok`, `no_access`, `not_allowed`, `not_found`, `stale`, `invalid`, `withdrawn` (Move: the registration is withdrawn), `past_day`, `has_result` (Move: Passed / Not passed on the testing day), `graded` (Change day / Cancel after Pass / Not passed), `cancelled` (any write on a cancelled private testing except Restore / Delete), `already_paid`, `not_open`, `finished`, `final_award_not_set` (+ `class_name`), `moved` (Restore of a moved event registration).

---

## 2. Database — `0014_testing_private.sql` (Builder A)

### 2.1 General rules (as 0005 §1.1 / 0010 §1.1)
- Schema `public`, owner `postgres`, **one transaction**, header comment in 0010's style (§2.8). Re-runnable: `create table if not exists`, `create or replace`, `drop trigger / policy if exists` + create, `revoke all` then grants. A second run changes no row and no fingerprint.
- Every function: `set search_path = ''`, fully qualified names, no argument defaults, `revoke execute … from public, anon, authenticated, service_role` **first**, then only §2.7's grants.
- Staff functions: `security definer`, `volatile`, `returns jsonb` `{status: …}`, body inside 0005's `begin … exception … end` block with 0005's mapping (`unique_violation` → `stale`; FK / check / not-null → `invalid`; deadlock / serialization / lock not available → `stale`). Every write sets `tkd.action` + **one** `tkd.batch_id` and clears both before returning.
- **Lock order:** school (`locations` `for no key update`) → event → registration → its result row (Move only) → the private testing (`for update`) → its result row. `public.testing_private_lock(uuid)` does school → private testing.
- Answers: dates `to_char(…, 'YYYY-MM-DD')`, times `to_char(…, 'HH24:MI')`.
- Connector words: `0014_fingerprints.sql` contains neither `delete` nor `drop` (spell names in pieces). The migration and tests are pasted in the SQL Editor.
- **Live objects:** only `testing_restore_student` is replaced (§2.6). No live table, view, trigger or other function changes.

### 2.2 Tables

**`public.testing_private`**
| Column | Type | Rule |
|---|---|---|
| `id` | `uuid not null default gen_random_uuid()` | pk `testing_private_pkey` |
| `location_code` | `text not null` | FK `testing_private_location_fk` → `locations(code)`; never changes |
| `first_name`, `last_name` | `text not null` | `testing_name_is_valid` and `= testing_normalize_name(…)` (as registrations) |
| `class_id` | `uuid null` | the Classes and ranks class at copy time; **no FK** (a history pointer — the class may be removed later) |
| `class_name` | `text not null` | copied |
| `rank_id` | `uuid null` | the Classes and ranks rank at copy time; no FK |
| `rank_name` | `text not null` | copied |
| `belt_pattern`, `belt_color`, `belt_color_2`, `belt_end_stripes`, `belt_end_stripe_color` | as `testing_event_ranks` | copied; check `testing_belt_is_valid(…)` |
| `to_kind` | `text not null` | `'rank'` or `'none'` (No new rank) |
| `to_name`, `to_belt_pattern`, `to_belt_color`, `to_belt_color_2`, `to_belt_end_stripes`, `to_belt_end_stripe_color` | nullable | check `testing_private_to_check`: `to_kind = 'none'` ⇒ all null; `'rank'` ⇒ `to_name` valid name and belt valid |
| `private_cents` | `integer not null` | copied; `testing_cents_is_valid` |
| `paying_by` | `text not null` | `cash`/`check`/`card` |
| `stripes_confirmed` | `boolean not null` | check true |
| `private_date` | `date not null` | |
| `private_time` | `time not null` | check `testing_private_time_is_valid(private_time)` |
| `status` | `text not null default 'active'` | `active` / `cancelled` |
| `cancelled_at`, `cancelled_by_name` | `timestamptz null`, `text null` | check `testing_private_status_check`: active ⇒ `num_nonnulls(cancelled_at, cancelled_by_name, cancelled_by) = 0`; cancelled ⇒ `cancelled_at` and `cancelled_by_name` set |
| `cancelled_by` | `uuid null` | login id, **never granted** |
| `moved_from_event_id`, `moved_from_registration_id` | `uuid null` | no FK (history pointers: the event side may be deleted later); `moved_from_registration_id` **unique** (`testing_private_moved_from_key`) |
| `moved_from_event_name` | `text null` | copied event name; check `testing_private_moved_check`: all three null or all three set |
| `moved_cleared_no_show` | `boolean not null default false` | true when the move removed a testing-day No show (Undo move is then refused, L1); check: true only when moved; never changes after insert |
| `moved_registration_version` | `integer null` | the event registration's version right after the move (set at insert by the move, §2.5.1 step 9; never changes; null when not moved; part of `testing_private_moved_check`: set exactly when the other `moved_from_*` columns are) |
| `version` | `integer not null default 1` | ≥ 1 |
| `created_at`, `updated_at` | `timestamptz not null default now()` | |
| `created_by`, `updated_by` | `uuid null` | never granted |
| `created_by_name`, `updated_by_name` | `text not null` | |
Indexes: `(location_code, private_date)`, `(moved_from_event_id) where not null`.

**`public.testing_private_payments`** — exactly `testing_payments`' shape and checks with `private_id uuid not null` (FK `testing_private_payments_private_fk` → `testing_private(id)` **on delete cascade**) instead of `registration_id`, plus `moved_from_payment_id uuid null` (no FK; **unique** `testing_private_payments_moved_from_key` — an event payment is moved at most once). Constraint names prefixed `testing_private_payments_…`. `recorded_by` never granted.

**`public.testing_private_results`** — exactly `testing_results`' shape and checks with `private_id uuid not null` (pk, FK → `testing_private(id)` on delete cascade). Constraint names `testing_private_results_…`. `updated_by` never granted.

**View `public.testing_private_list`** `with (security_invoker = true)`: every granted column of `testing_private` + `paid_cents` (net), `paid` (net > 0), `paid_on`, `paid_method`, `last_payment_id`, `last_payment_recorded_at` (the latest non-reversed payment, as `testing_roster`), `amount_due_cents` = `greatest(p.private_cents - greatest(coalesce(t.net, 0), 0), 0)` computed **inline** from the lateral sum (as `testing_roster` computes `paid_cents`) — the view **never calls** `testing_private_amount_due` (it runs with the caller's rights, and the helper is granted to nobody). Never login ids.

### 2.3 Triggers (each with `drop trigger if exists` + create)
- `testing_private_before_write()` (before insert / update, plain): insert stamps (version 1, who / when via `auth.uid()` and `change_log_actor_name()`); update: `id`, `location_code`, `moved_from_*`, `moved_cleared_no_show`, `moved_registration_version`, `created_*` never change (errcode 23514, constraint `testing_private_immutable`); any other change or a deliberate `version + 1` bumps version and stamps (0005 §9c's pattern).
- `testing_private_results_before_write()`: as 0010's `testing_results_before_write` (immutable `private_id`, constraint `testing_private_results_immutable`).
- `testing_private_payments_guard()`: as 0005's `testing_payments_guard` for this table; deletes allowed only when `pg_trigger_depth() > 1` (cascade) or `tkd.action` in `('private_delete', 'undo_move_to_private', 'undo_0014')`.
- `testing_private_log()` (after insert / update / delete, **security definer**) on all three tables: `testing_registrations_log`'s diff logic; `record_id` = `id` (or `private_id` for results); `location_code` = the row's `location_code` for `testing_private`, null for the other two; `table_name = tg_table_name`; action from `tkd.action` (default `manual`); batch from `tkd.batch_id`.
- Truncate refused on all three (`testing_refuse_truncate`).

### 2.4 Rights
RLS on all three tables; policies `testing_private_select_with_access`, `testing_private_payments_select_with_access`, `testing_private_results_select_with_access`: `for select to authenticated using ((select public.has_data_access()))`. `revoke all` on the tables and the view from `public, anon, authenticated, service_role`; then `grant select (<every column except created_by, updated_by, cancelled_by>)` on `testing_private`, `grant select (<every column except recorded_by>)` on payments, `grant select (private_id, result, note, updated_at, updated_by_name)` on results, `grant select on testing_private_list` — all to `authenticated` only. Nothing to `anon`, `service_role`, `testing_registrar`. No insert / update / delete grants.

### 2.5 Functions

**Internal (granted to nobody):**
- `testing_private_time_is_valid(p_time time) returns boolean` — sql, immutable, `as $$ … $$`: `p_time between '06:00' and '22:00' and extract(minute from p_time)::integer % 5 = 0 and extract(second from p_time) = 0`.
- `testing_private_amount_due(p_private_id uuid) returns integer` — sql, stable: §1.3; null if missing.
- `testing_private_lock(p_private_id uuid) returns public.testing_private` — school then the row `for update`; all-null when missing.
- `testing_private_lock_payment(p_payment_id uuid) returns public.testing_private_payments` — as 0005's `testing_lock_payment`.
- `testing_private_rank_copy(p_location_code text, p_rank_id uuid) returns jsonb` — from **live** Classes and ranks (school already locked): `{status:'ok', class_id, class_name, rank_id, rank_name, belt_pattern…, to_kind, to_name, to_belt_…, private_cents}`; testing-for = the next rank by `position` in the class, else the class's final award rank (`final_award_rank_id`), else `'none'` when `final_award_none`; rank missing → `{status:'stale'}`; other school → `{status:'invalid'}`; the student's rank is the class's **last** and its final award is Not set → `{status:'final_award_not_set', class_name}`.

**Staff functions** (S = staff and admins, A = admins). Common start for those on an existing private testing: 1 `has_data_access()` → `no_access` · (A only: `is_admin()` → `not_allowed`) · 2 arguments → `invalid` · 3 `testing_private_lock` → `not_found` · 4 version → `stale` (when it takes one) · 5 `status = 'cancelled'` → `cancelled` (except restore / delete).

| Function | Who | Then | `tkd.action` | Ok answer |
|---|---|---|---|---|
| `testing_private_add(p_location_code text, p_first text, p_last text, p_rank_id uuid, p_stripes boolean, p_paying_by text, p_private_date date, p_private_time time)` | S | input (school `worcester`/`shrewsbury`, names, rank not null, stripes true, paying by, date / time not null, time valid) → `invalid`; lock school; `testing_private_rank_copy` (stale / invalid / final_award_not_set); day rule (§1.2); insert | `private_add` | `{status, id, version:1, amount_due_cents}` |
| `testing_private_update(p_private_id uuid, p_expected_version integer, p_first text, p_last text, p_rank_id uuid)` | S | **rank changed = `p_rank_id is distinct from` the stored `rank_id`**; the stored id sent back unchanged means “belt not changed” and is never looked up (it may no longer exist in Classes and ranks, M4); rank changed → copy from live (same school as the private testing, else `invalid`; missing → `stale`); lock result row; belt lock (§1.2) → `not_allowed`; write names (+ the copy when the rank changed); rank changed and a results row exists → delete it (`clear_result`, same batch); nothing changed → write nothing | `private_update` | `{status, version, amount_due_cents, result_cleared}` |
| `testing_private_change_day(p_private_id uuid, p_expected_version integer, p_private_date date, p_private_time time)` | S | time valid else `invalid`; day rule; lock result row: Pass / Not passed → `graded`; No show → the row (result + note) is deleted (`clear_result`); **day and time both unchanged → write nothing, remove nothing** | `private_change_day` | `{status, version, private_date, private_time, result_cleared}` |
| `testing_private_change_paying_by(p_private_id uuid, p_expected_version integer, p_paying_by text)` | S | §1.3 rule → `already_paid` | `private_change_paying_by` | `{status, version}` |
| `testing_private_mark_paid(p_private_id uuid, p_expected_version integer)` | S | owed ≤ 0 → `already_paid`; insert payment (owed, paying by, today); version + 1 | `private_mark_paid` | `{status, payment_id, amount_cents, method, version}` |
| `testing_private_undo_payment(p_payment_id uuid)` | S own < 10 s / A | 0005's `testing_undo_payment` rules on this table (`not_found`, `not_allowed`, `invalid`, `stale`), **plus: the staff own-undo also requires `moved_from_payment_id is null`** (a payment that arrived with a move can't be undone by the mover — admins unchanged); cancelled → `cancelled`; reversal dated today; version + 1 | `private_undo_payment` | `{status, version}` |
| `testing_private_edit_payment(p_payment_id uuid, p_method text, p_amount_cents integer, p_paid_on date)` | A | 0005's `testing_edit_payment` rules; cancelled → `cancelled` | `private_edit_payment` | `{status, payment_id, version}` |
| `testing_private_cancel(p_private_id uuid, p_expected_version integer)` | S | Pass / Not passed → `graded`; set cancelled + who / when | `private_cancel` | `{status, version}` |
| `testing_private_restore(p_private_id uuid, p_expected_version integer)` | A | active → `invalid`; `private_date < today` → `past_day`; back to active, cancel fields null | `private_restore` | `{status, version}` |
| `testing_private_delete(p_private_id uuid, p_expected_version integer, p_expected_payment_ids uuid[])` | A | `p_expected_payment_ids` null, with a null element or a duplicate → `invalid` (`testing_ids_are_valid`, as 0005's delete); version or the set of all its payment-row ids differs → `stale`; delete (cascade, logged) | `private_delete` | `{status}` |
| `testing_private_set_result(p_private_id uuid, p_result text)` · `testing_private_set_result_note(p_private_id uuid, p_note text)` | S | 0010's `testing_set_result` / `_note` bodies on these tables (no version, last change wins; note tidied, 1–200 chars, > 2000 sent → `invalid`), with the grading window from **`private_date`**; cancelled → `cancelled` | `private_set_result` / `private_set_result_note` | `{status, result, note, updated_at, updated_by_name}` |
| `testing_move_to_private(p_registration_id uuid, p_expected_version integer, p_private_date date, p_private_time time)` | S | §2.5.1 | `move_to_private` (+ `clear_result`) | `{status, private_id, version:1, registration_version, amount_due_cents, result_cleared}` |
| `testing_private_undo_move(p_private_id uuid, p_expected_version integer)` | S (the mover, < 10 s) | §2.5.2 | `undo_move_to_private` | `{status, registration_id, registration_version}` |

#### 2.5.1 `testing_move_to_private` — exactly
1. `no_access` · 2. arguments null / time invalid → `invalid` · 3. `testing_lock_registration(p_registration_id)` → `not_found` · 4. version → `stale` · 5. withdrawn → `withdrawn` · 6. day rule (§1.2) → `past_day` / `invalid`.
7. Lock the registration's `testing_results` row: `result in ('pass','not_passed')` → **`has_result`**; `no_show` → will be removed; a note only → **stays** with the registration.
8. Copy from the **event copy**: `class_id` = the event class's `class_id`, `class_name`, `rank_id` = the event rank's `rank_id`, `rank_name`, belt, testing-for = `testing_rank_testing_for(event_rank_id)` (null → `to_kind 'none'`); **`private_cents` = the CURRENT Classes and ranks private price of `rank_id` (`testing_ranks.private_cents`, school locked), or the event rank copy's `private_cents` when that rank no longer exists** — **decided v0.404** (§10 point 13; same source as Add); `location_code` = the event's; `paying_by` = the registration's; `stripes_confirmed` true; `moved_from_event_id`, `moved_from_registration_id`, `moved_from_event_name`, `moved_cleared_no_show` = (step 7 found a No show).
9. One batch, action `move_to_private`, in this order: (a) for every **live** event payment of the registration (kind `payment`, not reversed), oldest first, insert an event **reversal** (`-amount`, same method, **`paid_on` = the original's**, `reverses_payment_id`); (b) update the registration: `status 'withdrawn'`, `withdrawn_reason 'withdrawn'`, `withdrawn_at now()`, `withdrawn_by_name`, `withdrawn_by`, `duplicate_state 'none'`, `duplicate_of null`, then `testing_recheck_pointing_at(p_registration_id)`; read its new version; (c) insert the private testing with `moved_registration_version` = that version (so the private row stays at version 1); (d) insert one private **payment** per moved payment (same amount, method, original `paid_on`, `moved_from_payment_id` = the original id); (e) when step 7 said so, `clear_result` + delete the result row.
   Only **live** payments move: a payment already reversed (an earlier Undo / Edit pair) stays on the event side as it is (its pair already nets 0). An overpaid student moves all of it (e.g. $95 paid, $85 price → owed 0; nothing is refunded).
10. Answer as the table above (`registration_version` = the registration's new version).

#### 2.5.2 `testing_private_undo_move` — exactly
`no_access` · `invalid` · lock (school → the registration via `testing_lock_registration(moved_from_registration_id)` → the private row) → `not_found` (also when it wasn't moved, or the registration is gone — e.g. its event was deleted) · version → `stale` · **who and when are read from the registration** (backdatable in tests, §3.1): `registration.withdrawn_by is distinct from auth.uid()` or `registration.withdrawn_at <= now() - interval '10 seconds'` → `not_allowed` (admins too) · `moved_cleared_no_show` true → `not_allowed` (L1: the No show can't come back) · registration not withdrawn, `registration.version <> moved_registration_version` (edited since), a results row exists, any private payment row without `moved_from_payment_id`, or any reversal row → `stale`.
Then one batch, action `undo_move_to_private`: for each private payment, insert an event **payment** (same amount, method, original `paid_on`, **`recorded_by` null**, `recorded_by_name` = the caller's name — so the live 10-second own-undo rule of 0005 can never reverse these recreated rows); registration back to active (withdrawn fields null); then the **three duplicate re-check lines of `testing_restore_student`** (`testing_recheck_duplicate(id)`, the partner's `testing_recheck_duplicate(duplicate_of)` when set, `testing_recheck_pointing_at(id)`); delete the private testing (cascade). Answer `{status, registration_id, registration_version}`.

### 2.6 Replaced live function (one)
**`testing_restore_student(p_registration_id, p_expected_version)`** — 0010's body copied exactly + right after the `not_found` check: `if exists (select 1 from public.testing_private p where p.moved_from_registration_id = p_registration_id) then return jsonb_build_object('status', 'moved'); end if;` (`-- 0014:` comment). Same revoke / grant lines. Everything else live is untouched.

### 2.7 Grants
All functions in the S / A table + `testing_move_to_private` + `testing_private_undo_move`: revoke from `public, anon, authenticated, service_role`, then `grant execute … to authenticated`. The five internal helpers and the four trigger functions: revoke from everyone, no grant. `testing_restore_student`: its live lines.

### 2.8 Header facts
What it adds (3 tables, 1 view, 4 trigger functions, 5 helpers, 14 staff functions, 1 replaced live function), the statuses, the actions, “private testings are logged in change_log like all testing data — v0.400's family_history is for Prospects only”, the re-run order (**re-running 0005 → re-run 0010, then 0014, straight after; re-running 0010 → re-run 0014 straight after** — 0005 / 0010 put back a Restore that ignores moves), and that the down-script is SETUP §16e.

### 2.9 Down-script (SETUP §16e, Jeffrey's OK only; before real private testings exist — removing 0014 deletes every private testing **and the money moved into it**)
1. Put the app back to a version without the Private testing tab.
2. Re-run the whole **0010** file (puts back its `testing_restore_student`).
3. SQL block, one transaction: `tkd.action 'undo_0014'` + a batch id; `delete from public.testing_private;` (cascade, logged row by row); clear the tags; `drop view if exists public.testing_private_list;` then `drop table if exists` results, payments, `testing_private`; then `drop function if exists` every 0014 function (exact argument lists). Afterwards `0005_fingerprints.sql` and `0010_fingerprints.sql` equal a database that never had 0014.

---

## 3. Database tests (Builder A)

### 3.1 `supabase/tests/0014_tests.sql`
0010_tests style: one `do` block in `begin; … rollback;`, the sessions A1–A6, D1–D3, anon with `<paste-admin-UID-here>` / `<paste-desk-UID-here>`, its own `zz test …` classes (two ranks with private $85 / $95, a last rank with final award Not set, a rank with private $0) and one `zz test` event with registrations, made-up names, `TEST FAILED: Vn …`, last line `select 'ALL 0014 TESTS PASSED' as result;`. Past days are made as `postgres`. **The 10-second Undo-move window is tested by backdating the registration's `withdrawn_at` as `postgres` inside the rolled-back block with its stamping trigger switched off around that one statement** (`alter table public.testing_registrations disable trigger testing_registrations_before_write;` → `update … set withdrawn_at = now() - interval '11 seconds'` → `enable trigger …`), so the registration's version stays what the move left; everything is undone by the final `rollback`.

| # | Proves |
|---|---|
| V1 | Catalog: 3 tables RLS on, the one select policy each with `has_data_access()`, exact column rights (no login ids; nothing for public / anon / service_role / registrar), the view `security_invoker`, every function definer + `search_path=""` + no defaults + owner, staff functions executable by `authenticated` only, helpers / trigger functions by nobody, triggers attached, every check / FK / unique present; **D1 (staff) reads `testing_private_list` incl. `amount_due_cents`** (no permission error — the view doesn't call the helper) |
| V2 | Locked sessions (A2–A6, D2, D3) read 0 rows of the tables and the view and get `no_access` from every function; anon permission denied |
| V3 | Add: ok copy (names tidied, class / rank / belt / testing-for / price copied, version 1, one `private_add` log row); each input refusal; other-school rank → `invalid`; missing rank → `stale`; last rank with award Not set → `final_award_not_set`; yesterday → `past_day`; today ok; + 1 year ok; + 1 year + 1 day `invalid`; times 05:55 / 22:05 / 16:03 / 16:00:30 `invalid`, 06:00 / 22:00 ok; a Classes and ranks price change afterwards doesn't change the copy |
| V4 | Edit details: names; another school's rank → `invalid`; a removed rank (as postgres, after the copy) with the stored `rank_id` sent back → ok, names saved, copy and price unchanged, no lookup; picking another live rank then re-copies; rank change re-copies (incl. current private price); paid $85 → $95 rank → `amount_due_cents 1000`; → cheaper → 0; graded + rank change → `result_cleared true` (same batch); after the private day D1 rank change of a graded one → `not_allowed`, A1 ok; nothing changed → no log row |
| V5 | Change day: past / cap / time; Pass and Not passed → `graded`; No show (+ note) → removed, `result_cleared true`, `private_change_day` + `clear_result` same batch; note only kept; **unchanged day and time → nothing written** (version, log count, a No show row all unchanged) |
| V6 | Money: D1's own 10-second Undo of a **moved-in** payment (`moved_from_payment_id` set) → `not_allowed`, A1 → ok; Mark paid full → then `already_paid`; difference after a move; $0 price → `already_paid`, no row; D1 Undo own < 10 s ok, after 10 s / other user `not_allowed`, A1 any time; Edit payment D1 `not_allowed`, A1 ok on the most recent; Change paying-by while owed ok, paid in full `already_paid`; double Mark paid with the old version → `stale` |
| V7 | Cancel: D1 ok, payments kept; again → `cancelled`; Pass → `graded`; No show → ok; every write on a cancelled one → `cancelled`; Restore D1 `not_allowed`, A1 ok while the day is ahead, `past_day` after it; Delete D1 `not_allowed`, A1 with a null array / a null element / a duplicate id → `invalid`, with wrong payment ids `stale`, ok → rows, payments and result gone and logged `private_delete` |
| V8 | Grading: before the private day `not_open` (D1, A1); on it ok (both); after it D1 `finished`, A1 ok; both functions; same value → no log row; the version of `testing_private` never changes because of grading |
| V9 | **Move:** paid $65 → event net 0 (reversal dated the original day), private net 65 (same method, original `paid_on`, `moved_from_payment_id`), `amount_due_cents 2000`; registration withdrawn (who / when), counts of the event drop; all rows under one batch `move_to_private`; not paid → nothing moved; two payments → both moved; testing-day No show → removed (`clear_result`); note only → stays on the registration; Pass / Not passed → `has_result`; withdrawn → `withdrawn`; old version → `stale`; past day → `past_day`; moving the same registration again → `withdrawn`; **an already-reversed event payment pair** (payment + its Undo) is not moved and stays as it is, only the live one moves; **overpaid** ($95 paid, $85 price) → private net 95, `amount_due_cents 0`, nothing refunded |
| V9b | **The moved registration afterwards (regression on live functions):** `testing_mark_paid` / `testing_change_paying_by` → `withdrawn`; `testing_undo_payment` / `testing_edit_payment` on the reversed original → `stale`, on the move's reversal row → `invalid`; `testing_set_result` → `withdrawn`; `testing_delete_event` of its event with the expected net **excluding** the moved money → ok, the private testing and its payments intact (the `moved_from_*` pointers stay), then Undo move → `not_found`; A1 `testing_delete_student` of the moved registration → ok, the private money intact |
| V10 | Restore of the moved registration: A1 → `moved` **and D1 → `moved`** (the check comes before the staff rule), nothing changed; an ordinary withdrawn registration still restores (0010 rules unchanged) |
| V11 | Undo move: D1 within 10 s → registration active, event net back to 65 (payment dated the original day), private row gone, one `undo_move_to_private` batch; the recreated event payments have `recorded_by` null, so D1's live own-undo of them → `not_allowed`; after a Mark paid on the private side → `stale`; after the registration was edited (e.g. A1 renames it) → `stale`; a move that cleared a No show → `not_allowed`; A1 (not the mover) → `not_allowed`; after 10 s (backdated, see above) → `not_allowed` |
| V11b | **Guards and hygiene (as postgres):** update or delete of a `testing_private_payments` row → refused; a reversal with the wrong amount or of another private testing's payment → refused; changing `id`, `location_code` or any `moved_from_*` / `moved_cleared_no_show` / `moved_registration_version` / `created_*` → refused (`testing_private_immutable`); `truncate` refused on all three tables |
| V12 | History: every action above present with batch ids and the session's actor name; no `data:image` in `change_log` |

### 3.2 `supabase/tests/0005_tests.sql`
Back to the live version (`git checkout dae8d00^ -- supabase/tests/0005_tests.sql`): no registration column is added any more.

### 3.3 `run.mjs` — step 15 (after Finance's step 14 = 0011, before 13g)
(Renumbered at the 2026-10-19 merge of `main`: Finance's 0011 is live, so its step 14 runs first and 0014 is applied on top of it as step 15; the 0011 fingerprints must also be unchanged by 0014 and `0011_tests.sql` must still pass; 13g runs only if step 14 and 15i both passed. Below, "14x" means "15x".)
Start from `git checkout dae8d00^ -- supabase/tests/pglite/run.mjs`, then: `step13()` loses 13g; `main()` runs step 13 (a–f) → **step 14 — only if 13a–f all passed** (else a recorded failure “skipped: step 13 failed”) → **13g** last, and **13g runs only if 14i passed** (else a recorded failure “skipped: the 0014 down-script failed”). The step-13 header line “0005 itself is never applied again” is updated (14i re-runs 0010; 13g re-runs 0005).
- a. take the 0003, 0004, 0005, 0006, 0010 fingerprints; apply 0014; `0014_tests.sql` → `ALL 0014 TESTS PASSED`.
- b. 0004 and 0006 identical; **0003 identical except the rows of the new `testing_*` functions and `testing_restore_student`** (0003's file lists every `testing_*` function — expected); 0005 and 0010 differ only in `testing_restore_student`.
- c. test files again: 0010, 0005, 0006, 0003, 0004, 0002, PIN — all pass.
- d. registrar live checks (11b) + refusals: read each new table and the view, call `testing_private_add`, `testing_move_to_private`, `testing_private_amount_due`.
- e. seed (as postgres, labelled): one private testing with a payment and a result, so re-run and down have data.
- f. fingerprints + an md5 of the three tables and the `change_log` count; apply 0014 again; identical; 0014 / 0005 tests pass.
- g. upgrade database: 0014 on its 0010; fingerprints equal (fresh = upgrade); 0014 / 0010 / 0005 tests pass.
- h. `0014_fingerprints.sql` contains neither `delete` nor `drop`; print the 0014 fingerprints.
- i. the down-script (SETUP §16e exactly, the SQL block read from SETUP.md): tables, view and 0014 functions gone; 0005 / 0010 **and 0003** fingerprints equal 14a's; one `undo_0014` delete row in `change_log` per removed `testing_private` row (its payments and result are logged too); 0010 / 0005 tests pass.

### 3.4 `supabase/tests/0014_fingerprints.sql`
Read-only single SELECT, `kind, item, detail`: `function` rows (every 0014 function + `testing_restore_student`), `table` rows (3: RLS, rights, columns, policies), `view` row, `trigger` rows, `constraint` rows (name + `pg_get_constraintdef`). Connector-safe.

### 3.5 SETUP §16 (rewritten; after Finance's §15 since the 2026-10-19 merge)
**16. Migration 0014: Color Belt private testing** — what it does; CP2 → CP3 → CP4; 16a apply; 16b read-only checks (§3.3b expectations; security advisor: only “security definer function executable by authenticated” for the new staff functions); 16c tests (0014, 0011, then 0010 / 0005 / 0006 / 0004 / 0003 / 0002 / PIN); 16d CP3 real check (plan §5 step 5); 16e re-run warnings (§2.8 wording) + §2.9 verbatim. Keep the existing one-line warning at the top of §14e.

---

## 4. Data layer and mock (Builder B)

### 4.1 `src/lib/testing/privateRules.js` (new, pure, node-importable)
| Export | Does |
|---|---|
| `PRIVATE_TIME_CHOICES` | `'06:00' … '22:00'`, 193 strings |
| `privateTimeIsValid(text)` | `'HH:MM'` / `'HH:MM:00'` in the list |
| `privateDayLimit(today)` | today + 1 year (Feb 29 → Feb 28) |
| `privateDayProblem(day, today)` | `null` · `'missing'` · `'past'` · `'tooFar'` |
| `amountDue({ privateCents, paidCents })` | §1.3 |
| `owesMore(row)` · `showMarkPaid(row)` · `canChangePayingBy(row)` | `paid && due > 0` · `active && due > 0` · `active && (!paid \|\| due > 0)` |
| `privateSide(row, today)` | `'upcoming'` \| `'past'` (§1.1) |
| `splitPrivate(rows, today)` | `{ upcoming, past }` — upcoming soonest first (day, time, last, first name); past latest first |
| `privateCards(rows)` | over one side: `{ count, paid, notPaid, owesMore, paymentsCents, cancelledCents }` — count / paid / notPaid / owesMore over **active** rows only; `paymentsCents` = net of all rows incl. cancelled; `cancelledCents` = the cancelled rows' part |
| `privateMenu(row, { today, isAdmin })` | `{ editDetails, changePayingBy, changeDay, grade, editPayment, undoPayment, cancel, restore, delete }` booleans: active → `grade` always; `editDetails`, `changeDay`, `cancel` when `result` is null or `'no_show'`; `changePayingBy` = `canChangePayingBy` **and** `result` is null or `'no_show'` (L5); admin + paid → `editPayment`, `undoPayment`; admin → `delete`. Cancelled → only admin `restore` (when `privateDate >= today`) and `delete` |
| `canMoveToPrivate(regRow)` | `status 'active' && (result === null \|\| result === 'no_show')` |
| `moveMoney({ paidCents, privateCents })` | `{ kind: 'notPaid' \| 'owes' \| 'enough', dueCents }` |

### 4.2 `src/lib/testing/privateApi.js` (new; same `callRpc` / `selectIn` / access-check pattern as eventsApi — never throws)
- `PRIVATE_STATUSES` = §1.4 + `'error'`.
- **`loadPrivateTestings(locationCode)`** → `{ status:'ok', today, rows, payments }`: the view `testing_private_list` (`eq location_code`), `testing_private_results` (`private_id, result, note, updated_at, updated_by_name`) and `testing_private_payments` (all granted columns) for those ids, + the access check. **Row** (camelCase): `id, locationCode, firstName, lastName, classId, className, rankId, rankName, belt {beltPattern, beltColor, beltColor2, beltEndStripes, beltEndStripeColor}, testingFor { kind:'rank'|'none', name, belt }, privateCents, payingBy, stripesConfirmed, privateDate ('YYYY-MM-DD'), privateTime ('HH:MM'), status, cancelledAt, cancelledByName, movedFromEventId, movedFromRegistrationId, movedFromEventName, version, createdAt, createdByName, updatedAt, updatedByName, paid, paidCents, paidOn, paidMethod, lastPaymentId, lastPaymentRecordedAt, amountDueCents, owesMore, result, note, resultAt, resultByName, graded` (results row exists), `side` (`privateSide`). **Payment**: as eventsApi's `toPayment` with `privateId`, `movedFromPaymentId`.
- **`loadPrivateTesting(privateId)`** → `{ status:'ok', today, startedAt, row, payments }` · `'not_found'` (`startedAt` as eventsApi.loadEvent, for the grading engine).
- One function per database function, arguments camelCase, answers camelCase: `addPrivate({ locationCode, firstName, lastName, rankId, stripes, payingBy, privateDate, privateTime })` · `updatePrivate({ privateId, expectedVersion, firstName, lastName, rankId })` · `changePrivateDay({ privateId, expectedVersion, privateDate, privateTime })` · `changePrivatePayingBy({ privateId, expectedVersion, payingBy })` · `markPrivatePaid({ privateId, expectedVersion })` · `undoPrivatePayment({ paymentId })` · `editPrivatePayment({ paymentId, method, amountCents, paidOn })` · `cancelPrivate({ privateId, expectedVersion })` · `restorePrivate({ privateId, expectedVersion })` · `deletePrivate({ privateId, expectedVersion, expectedPaymentIds })` · `setPrivateResult({ privateId, result })` · `setPrivateResultNote({ privateId, note })` · `moveToPrivate({ registrationId, expectedVersion, privateDate, privateTime })` · `undoMoveToPrivate({ privateId, expectedVersion })`. Ok fields: `id`, `version`, `amountDueCents`, `resultCleared`, `privateDate`, `privateTime`, `paymentId`, `amountCents`, `method`, `privateId`, `registrationId`, `registrationVersion`, `result`, `note`, `resultAt`, `resultByName` as each function returns them; `final_award_not_set` carries `className`.

### 4.3 `src/lib/testing/eventsApi.js` / `eventRules.js`
Both back to phase 3 (`git checkout dae8d00^ -- …`). Then eventsApi only: `EVENT_STATUSES` adds `'moved'`; **`loadEvent`** adds one read `supabase.from('testing_private').select('id, moved_from_registration_id, private_date, private_time, status').eq('moved_from_event_id', eventId)`; every roster row gains `movedTo: { privateId, privateDate, privateTime, status } | null` (`status` = the private testing's `'active'` / `'cancelled'`; the Removed tag shows the same wording either way).

### 4.4 `src/lib/mockTestingEvents.js`
Back to phase 3, then: store lists `private`, `private_payments`, `private_results` (a store without them gets empty lists, not “damaged”); `GRANTED` / `HIDDEN` for the three tables and the view `testing_private_list` (so `EVENT_TABLES` routes them); `RPC_ARGS` for all 14 functions (types `uuid`, `int`, `text`, `bool`, `date`, `uuid[]`, and a new `'time'`: `'HH:MM'` / `'HH:MM:SS'` → `'HH:MM:SS'`, anything else throws like Postgres 22007); `ADMIN_ONLY` += `testing_private_edit_payment`, `testing_private_restore`, `testing_private_delete`; the five helpers in `EVENT_RESTRICTED_RPC_NAMES`; handlers with §2's order and statuses, live Classes and ranks read from the shared store (`classes`, `ranks`), `testing_restore_student` → `moved`; the same action names and one batch id per call.

### 4.5 `src/lib/testing/checks.mjs`
Back to phase 3, then groups: the Edit-details rank rule (the stored `rankId` of a rank no longer in Classes and ranks sent back → mock ok, copy unchanged; another school's rank → `invalid`), `privateRules` (time list, day rules incl. Feb 29, `amountDue` = E1–E12, `privateMenu` truth table, `splitPrivate` order incl. cancelled → past, `privateCards` incl. cancelled money, `canMoveToPrivate`, `moveMoney`); mock replays of V3–V11 (no session cases), the mock's due = `amountDue` after every step, a store without the new lists keeps its events. Ends with `ALL TESTING LIB CHECKS PASSED`.

---

## 5. Screens (Builder C) — layout and wording exactly as P1–P8

### 5.1 Route and tab
- **`src/App.jsx`:** start from `git checkout dae8d00^ -- src/App.jsx` (removes the event `/private/` route). Add `PRIVATE_HASH = /^#testing\/private\/([A-Za-z0-9-]{1,64})$/` → route `{ section:'testing', eventId:null, eventTab:'students', privateId }` (`privateId` null elsewhere); `addressForRoute` writes `#testing/private/<id>`; `routeIsUnknown` (the `addressIsUnknown` tidy-up) **accepts `PRIVATE_HASH`** as it accepts the event and settings addresses; `navigate` compares `privateId`; `openPrivate(id)` = a normal step; `closePrivate(options)` = like `closeEvent`: `options?.replace` → `navigate('testing', null, options)` unguarded (the page closing itself after a guarded school change), else `guarded(() => navigate('testing'))`; Testing receives `privateId`, `onOpenPrivate`, `onClosePrivate` (they reach the tabs and EventPage through `...tabProps`). The grading page registers the leave guard exactly as EventPage does (`onLeaveGuardChange`).
- **`src/screens/Testing.jsx`:** `TABS` gets `{ key:'private', label: TAB_PRIVATE }` **last** (far right); renders `PrivateTestingTab` for it (same `renderHeader` pattern, header action = Add private testing for all staff); when `privateId` is set → `<PrivateGradingPage key={privateId} …>` (before the `eventId` branch) **and the module-level `lastTab` is set to `'private'`**, so closing the grading page lands on the Private testing tab. Arrow keys / Home / End cycle the three tabs as today. **`.ttabs` scrolls sideways** at narrow widths (`overflow-x: auto`, no wrapping, the current tab scrolled into view) — `testing.css`.

### 5.2 Private testing tab (P1, P7) — `private/PrivateTestingTab.jsx`, `private/PrivateRows.jsx`
- Loads with `useLiveLoad({ key: locationCode, load: loadPrivateTestings, refreshMs: LIVE_REFRESH_MS })` (15 s, v0.157). Live Classes and ranks (`api.loadClassesAndRanks` + `rankOrder.withTestingFor`) are loaded when Add / Edit details opens.
- Side switch Upcoming / Past (`ChoiceGroup`, labels `${T.UPCOMING} ${n}` / `${T.PAST} ${n}`), opens on **Upcoming**, kept per school while the page is open.
- Cards over the side shown (`privateCards`): `CARD_PRIVATE` count · `CARD_PAID` paid + amber `owesMoreCount(n)` when > 0 · `CARD_NOT_PAID` · `CARD_PAYMENTS` `dollars(paymentsCents)` + gray `includesCancelled(cents)` when > 0.
- Columns (PC): `COL_DAY_TIME` (`weekdayMonthDay` / `timeLabel`) · `COL_STUDENT` (name 500; class 12 px gray; on Past the result tag `TAG_PASSED` / `TAG_NOT_PASSED` / `TAG_NO_SHOW`, or gray `cancelledTag(cancelledAt)`) · `COL_TESTING_FOR_PRICE` (belts “Yellow → Orange · $85”) · `COL_PAYING_BY` · `COL_PAYMENT` (`TAG_PAID` / `TAG_NOT_PAID`) · `COL_PAID_ON` · Mark paid (`showMarkPaid`) · ⋯. Under the name: amber `ti-alert-triangle` `owedLine(paidCents, amountDueCents)` when `owesMore`; gray `ti-arrow-right` `movedFromLine(movedFromEventName)` when moved. Tablet: day · time under the name (`privateDayTime`), Paid on dropped, the lines full width. Phone / 320: stacked rows as P1. A cancelled row is grayed entirely; staff see no ⋯ on it.
- Mark paid: `markPrivatePaid`; toast `markedPaidToast(name, amountCents, method)` + Undo (`undoPrivatePayment`), as the event roster.
- Empty: no private testings at all → `NO_PRIVATE_TESTINGS` + the Add button (P1 tablet); one side empty → `NO_UPCOMING_PRIVATE` / `NO_PAST_PRIVATE` (CP1).

### 5.3 ⋯ menu (P3, P7)
Items from `privateMenu`, in this order, dividers between groups: [Edit details (`ti-edit`) · Change how they'll pay (no icon) · Change day or time (`ti-calendar`) · Grade (`ti-school`)] | [Edit payment (`ti-cash`) · Undo payment (`ti-arrow-back-up`)] | [Cancel private testing (`ti-calendar-x`) · Delete permanently (`ti-trash`, red)]. Cancelled row (admin): Restore (`ti-arrow-back-up`) · Delete permanently. Phone: bottom sheet, title name, subtitle `${className} · ${from} → ${to}` (cancelled: `${className} · ${cancelledTag}`), Cancel at the end. Grade → `onOpenPrivate(row.id)`.

### 5.4 Dialogs (`Dialog.jsx`; phone full screen, back arrow, Save pinned at the bottom, `UNSAVED` / `DISCARD_CHANGES`)
- **`private/DayTimeFields.jsx`** (salvaged from dae8d00's `event/PrivateDialog.jsx`): Day date field (`min` today, `max` `privateDayLimit(today)`), `longDate` under it once valid; Time select of `PRIVATE_TIME_CHOICES` (`timeLabel`, placeholder `NO_TIME`) with hint `TIME_HINT`; problems `PICK_PRIVATE_DAY` / `PRIVATE_DAY_PAST` (amber field) / `PRIVATE_DAY_TOO_FAR` / `PICK_PRIVATE_TIME`; Save gray until fixed.
- **`private/PrivateDialog.jsx`** — Add (P2) and Edit details. Add: title `ADD_PRIVATE_TITLE`, subtitle `schoolName(school)`; First / Last name, Class buttons, Current belt buttons + `privateTestingForLine(from, to, className)`, `THREE_STRIPES` tick, Paying by, DayTimeFields, `privatePriceLine(cents)` (bold) + `privatePriceHint(rankName, cents)`, hint `ADD_PRIVATE_HINT`; Save → `addPrivate`. Edit details: title `EDIT_DETAILS_TITLE`, names + class + belt only; when the copied class / rank **no longer exists** in Classes and ranks, the dialog shows the copied class and belt as the current choice, followed by `notInClassesRanks` “(no longer in Classes and ranks)” (CP1), and sends the stored `rankId` unchanged (= belt not changed) unless another belt is picked; a paid row moving to a pricier price → amber `repriceLine(oldCents, newCents, dueCents)`; a cheaper one → `PAYMENT_STAYS`; a graded row changing belt → `beltChangeClearsPrivate(first, resultText)` / `beltChangeClearsNotePrivate(first)`; after the private day staff see class / belt disabled with `STUDENT_LOCKED` when graded. No toast after Add (the row appears); Edit → `TOAST_CHANGES_SAVED`.
- **`private/ChangeDayDialog.jsx`** (P4): title `CHANGE_DAY_TIME_TITLE`, subtitle `privateDialogSub(name, className, from, to)`, DayTimeFields filled with the current values, `priceStays(cents)`; a No show → amber `clearsPrivateNoShow(first, privateDate)`; **Save gray until the day or the time differs**; no toast.
- **`private/CancelPrivateDialog.jsx`** (P7): `variant="confirm"`, title `cancelTitle(name)`, body `cancelBody(dateIso, hhmm, payment)`, buttons `KEEP_IT` (outline) / `CANCEL_PRIVATE` (blue primary, not red). Ok → toast `cancelledToast(name)` (no Undo).
- Delete permanently: `ConfirmDeleteDialog`-style red confirm, `deletePrivateTitle(name)`, `deletePrivateBody(payments, result)` naming every live payment and the result, `KEEP_IT`; sends all payment-row ids.
- Edit payment (admins): the existing `PaymentDialogs` edit dialog pattern on the most recent live payment; with two or more live payments the subtitle `editPaymentSubTopUp(name, parts, editingCents)`.
- Change how they'll pay: the existing pattern; subtitle `changePayingBySub(name)` when not paid, `changePayingBySubOwed(name, dueCents)` when owing.

### 5.5 Move to private testing (event page, P5) — `event/MoveToPrivateDialog.jsx`
- EventPage ⋯ item **Move to private testing** (`ti-arrow-right`) right **after Edit details**, all staff, when `canMoveToPrivate(row)`.
- Dialog: title `MOVE_TO_PRIVATE`, subtitle `privateDialogSub(name, className, from, to)`, `moveIntro(first, eventName)`, DayTimeFields, the money line from `moveMoney` — `moveMoneyOwes(paid, price, due)` / `moveMoneyNotPaid(price)` / `moveMoneyEnough(paid)` — then `movePaymentHint(…)`; a testing-day No show → amber `moveClearsNoShow(first, testingDate)`. Button `MOVE_TO_PRIVATE` (`ti-arrow-right`; phone pinned footer as drawn).
- Ok → reload; toast `movedToast(name)` with **Undo** (`undoMoveToPrivate` with the answer's `privateId` and version 1) **only when `resultCleared` is false**.
- **Removed row** when `row.movedTo`: gray tag `movedTag(privateDate)`, line `movedBy(withdrawnAt, withdrawnByName)`; staff: no ⋯; admins: ⋯ = Open private testing (`ti-arrow-right`, `onOpenPrivate(movedTo.privateId)`) and Restore shown **disabled** with `restoreMovedReason(first)`; no Delete permanently.
- EventPage, RosterRows: back to phase 3 first (§11); nothing else changes on the event page (the Grading tab is phase 3 exactly, P8).

### 5.6 Grading page (P6) — `private/PrivateGradingPage.jsx`, `private/PrivateSheet.jsx` (moved from `event/`)
- Loads `loadPrivateTesting(privateId)` (15 s refresh). Not found / deleted → `PRIVATE_PAGE_GONE` + back link. **Other school:** when the private testing's `locationCode` isn't the school on the switcher, the page closes itself exactly as EventPage does for an event of the other school (`onClosePrivate({ replace: true })`, not guarded — the school change was).
- Back link `BACK_TO_PRIVATE` (`onClosePrivate`), title `privatePageTitle(name)` + gray `TAG_NOT_PAID` while `amountDueCents > 0` (never an amount), subtitle `privatePageSub(privateDate, privateTime, school)`, outline Print (`ti-printer`).
- Lock line from `gradingWindow(today, privateDate)`: before `privateGradingOpensLine(privateDate)`; after staff `PRIVATE_OVER_STAFF`; after admin `PRIVATE_OVER_ADMIN`. A cancelled testing: read-only with `PRIVATE_CANCELLED_LINE` (CP1).
- Card: `DETAIL_DAY` `longDate` · `DETAIL_TIME` · `DETAIL_CLASS` · `DETAIL_TESTING_FOR` (belts); `COL_RESULT`: `ResultButtons` + note button (`event/NoteDialog.jsx` — **dae8d00's optional `hint` prop is kept**, the grading page passes its own hint; nothing else of dae8d00's NoteDialog change is needed) as G1/G2; staff after the day: the result tag + `resultNoteLine(note)`. Saves through **`useGradingSaves`** (back to phase 3, plus optional props `saveResult` / `saveNote` defaulting to eventsApi's; here `setPrivateResult` / `setPrivateResultNote`, `roster: [row]`, `isReadOnly` from the window) — Not saved tag, banner, 10-second and `online` retry, the leave guard and `beforeunload`.
- Print → `PrivateSheet` (portal, class `grading-print`): `PRIVATE_SHEET_TITLE`, `privateSheetHeader(privateDate, privateTime, school, className, printedAt)`, columns `SHEET_COL_STUDENT` · `COL_TESTING_FOR` · `SHEET_COL_RESULT` · `SHEET_COL_NOTE`, one row with blank ticks and a note line, footer `PRIVATE_SHEET_FOOTER`. Never payments, results or notes.

### 5.7 Status → message
| Call | ok | Refusals |
|---|---|---|
| Dialog saves (add, update, change day, change paying-by, move) | close, reload (toasts as §5.4 / §5.5) | `past_day` → field `PRIVATE_DAY_PAST` · `invalid` → `INVALID_DIALOG` · `stale` / `not_found` → `STALE_DIALOG` (blocking) + reload · `final_award_not_set` → `finalAwardNotSet(className)` · `not_allowed` → `STUDENT_LOCKED` (update) / `ROSTER_NOT_ALLOWED` · `graded` → blocking `PRIVATE_GRADED` · `has_result` → blocking `MOVE_HAS_RESULT` · `withdrawn` → close, banner `isWithdrawn(name)` · `cancelled` → close, banner `PRIVATE_IS_CANCELLED` · `already_paid` → `ALREADY_PAID_DIALOG` · `no_access` → `onNoAccess()` · `error` → `SAVE_FAILED`, stays open |
| Row actions (Mark paid, Undo / Edit payment, Cancel, Restore, Delete) | toast / reload | `already_paid` → `alreadyPaid(name)` · `not_allowed` → `ROSTER_NOT_ALLOWED` (Undo payment: `UNDO_PAYMENT_TOO_LATE`) · `past_day` (Restore) → `RESTORE_TOO_LATE` · `graded` (Cancel) → `PRIVATE_GRADED` · `cancelled` → `PRIVATE_IS_CANCELLED` · `stale` / `not_found` / `invalid` → `ROSTER_STALE` + reload · `error` → row Not saved banner with Retry (`markPaidFailed(name)` / `actionFailed`) |
| Undo move (toast) | reload, `TOAST_UNDONE` | `not_allowed` → `UNDO_MOVE_TOO_LATE` · `stale` / `not_found` → `UNDO_STALE` · `error` → `UNDO_FAILED` + Retry |
| Restore on the event (moved row) | — | `moved` → `RESTORE_MOVED` |
| Grading saves | as CONTRACT-0010 §4.3 / §4.5 | `finished` → `TOO_LATE_RESULTS` · `not_open` → `GRADING_NOT_OPEN` · `cancelled` → `PRIVATE_IS_CANCELLED` |

### 5.8 Wording (`text.js`) — exactly these strings
From P1–P8:
| Constant | Wording |
|---|---|
| `TAB_PRIVATE` | Private testing |
| `ADD_PRIVATE` / `ADD_PRIVATE_TITLE` | Add private testing |
| `CARD_PRIVATE` | Private testings |
| `owesMoreCount(n)` | 1 owes more |
| `includesCancelled(cents)` | includes $85 from cancelled |
| `COL_DAY_TIME` / `COL_TESTING_FOR_PRICE` | Day · time / Testing for · price |
| `privateDayTime(dateIso, hhmm)` | Tue, Dec 1 · 4:00 PM |
| `owedLine(paidCents, dueCents)` | Paid $65 · $20 more to collect |
| `movedFromLine(eventName)` | Moved from November Children Testing |
| `cancelledTag(stamp)` | Cancelled Nov 28 |
| `NO_PRIVATE_TESTINGS` | No private testings yet. Add one when a family asks to test privately. |
| `privateTestingForLine(from, to, className)` | Testing for Blue → High Blue · Group B |
| `PRIVATE_DAY` / `PRIVATE_TIME` | Day / Time |
| `TIME_HINT` | 6:00 AM – 10:00 PM, every 5 minutes |
| `privatePriceLine(cents)` | $95 private price |
| `privatePriceHint(rankName, cents)` | The private price for Blue in Classes and ranks. Mark paid charges $95. |
| `ADD_PRIVATE_HINT` | For a family who asks to test privately, on their own day and time. Not part of a testing event. |
| `PRIVATE_DAY_PAST` | The private day can’t be in the past. |
| `CHANGE_DAY_TIME` / `CHANGE_DAY_TIME_TITLE` | Change day or time |
| `GRADE` | Grade |
| `CANCEL_PRIVATE` | Cancel private testing |
| `privateDialogSub(name, className, from, to)` | Liam Park · Group B · Blue → High Blue |
| `priceStays(cents)` | The price stays $95. |
| `MOVE_TO_PRIVATE` | Move to private testing |
| `moveIntro(first, eventName)` | Ava leaves November Children Testing (listed under Removed there) and is listed on the Private testing tab, with their name, class and belt filled in. |
| `moveMoneyOwes(paid, price, due)` | $65 paid → $85 private price · $20 more to collect |
| `moveMoneyNotPaid(price)` | $85 private price · not paid yet |
| `moveMoneyEnough(paid)` | Already paid $85. Nothing more to collect. |
| `movePaymentHint(paid, method, first, rankName)` | The $65 cash payment moves with Ava. The private price for Yellow in Classes and ranks. (not paid: only the second sentence) |
| `moveClearsNoShow(first, dateIso)` | Ava was marked No show on Fri, Nov 20. Moving clears that result. |
| `movedToast(name)` | Ava Chen moved to private testing |
| `movedTag(dateIso)` | Moved to private testing, Tue, Dec 1 |
| `movedBy(stamp, name)` | moved Nov 10 by Staff |
| `OPEN_PRIVATE` | Open private testing |
| `restoreMovedReason(first)` | Not available: Ava is on the Private testing tab with their payment. |
| `BACK_TO_PRIVATE` | Private testing |
| `privatePageTitle(name)` | Private testing · Ava Chen |
| `privatePageSub(dateIso, hhmm, school)` | Tue, Dec 1, 2026 · 4:00 PM · Worcester school |
| `DETAIL_DAY` / `DETAIL_TIME` / `DETAIL_CLASS` / `PRINT` | Day / Time / Class / Print |
| `privateGradingOpensLine(dateIso)` | Grading opens on the private testing day, Tuesday, December 1. |
| `PRIVATE_OVER_STAFF` | The private testing day is over. Only an admin can change the result or note now. |
| `PRIVATE_OVER_ADMIN` | The private testing day is over. Staff can’t change the result now; as an admin, you can. |
| `PRIVATE_SHEET_TITLE` | Private testing — grading sheet |
| `privateSheetHeader(dateIso, hhmm, school, className, printedAt)` | Tue, Dec 1, 2026 · 4:00 PM · Worcester school · Group A · printed Mon, Nov 30, 3:05 PM |
| `PRIVATE_SHEET_FOOTER` | Type the result into the private testing page the same day. |
| `cancelTitle(name)` | Cancel Emma Ross’s private testing? |
| `cancelBody(dateIso, hhmm, payment)` | Mon, Nov 30, 4:30 PM. It moves to Past as Cancelled. The $85 cash payment stays recorded; it isn’t refunded. |
| `KEEP_IT` | Keep it |
| `repriceLine(from, to, due)` | Price $85 → $95 · $10 more to collect (v0.254) |
| existing, reused | `UPCOMING`, `PAST`, `CARD_PAID`, `CARD_NOT_PAID`, `CARD_PAYMENTS`, `COL_STUDENT`, `COL_PAYING_BY`, `COL_PAYMENT`, `COL_PAID_ON`, `TAG_PAID`, `TAG_NOT_PAID`, `MARK_PAID`, `markedPaidToast`, `paidOnPhone`, `TAG_PASSED` / `TAG_NOT_PASSED` / `TAG_NO_SHOW`, `EDIT_DETAILS`, `EDIT_DETAILS_TITLE`, `CHANGE_PAYING_BY`, `EDIT_PAYMENT`, `UNDO_PAYMENT`, `DELETE_PERMANENTLY`, `RESTORE`, `FIRST_NAME`, `LAST_NAME`, `CLASS`, `CURRENT_BELT`, `THREE_STRIPES`, `PAYING_BY_LABEL`, `schoolName`, `longDate`, `timeLabel`, `NO_TIME`, `COL_RESULT`, `DETAIL_TESTING_FOR`, `resultNoteLine`, `SHEET_COL_*`, `COL_TESTING_FOR`, `PAYMENT_STAYS`, `STUDENT_LOCKED`, `UNSAVED`, `DISCARD_CHANGES`, `STALE_DIALOG`, `ROSTER_STALE`, `ROSTER_NOT_ALLOWED`, `INVALID_DIALOG`, `SAVE_FAILED`, `ALREADY_PAID_DIALOG`, `alreadyPaid`, `isWithdrawn`, `finalAwardNotSet`, `markPaidFailed`, `actionFailed`, `UNDO_PAYMENT_TOO_LATE`, `UNDO_STALE`, `UNDO_FAILED`, `TOAST_UNDONE`, `TOAST_CHANGES_SAVED`, `TOO_LATE_RESULTS`, `GRADING_NOT_OPEN`, `changePayingBySub` |

**Not in the mockups — `// CP1` in text.js, shown at CP1:** `owesMoreCount` plural “2 owe more” · `NO_UPCOMING_PRIVATE` “No upcoming private testings.” · `NO_PAST_PRIVATE` “No past private testings.” · `PICK_PRIVATE_DAY` “Enter the day.” · `PICK_PRIVATE_TIME` “Choose a time.” · `PRIVATE_DAY_TOO_FAR` “Pick a day within a year from today.” · `clearsPrivateNoShow(first, dateIso)` “Liam was marked No show on Thu, Dec 3. Saving a new day clears that result.” · `beltChangeClearsPrivate(first, resultText)` “Changing the belt clears Sam’s result (Not passed). Record it again on the private testing page.” · `beltChangeClearsNotePrivate(first)` “Changing the belt clears Sam’s grading note. Record it again on the private testing page.” · `cancelBody` not paid: “Mon, Nov 30, 4:30 PM. It moves to Past as Cancelled.” · `cancelledToast(name)` “Emma Ross’s private testing cancelled” · `deletePrivateTitle(name)` “Delete Emma Ross’s private testing permanently?” · `deletePrivateBody(…)` “The private testing, the $85 cash payment recorded on Nov 25 and the result (Passed, Dec 5) are deleted. This can’t be undone.” (parts left out when absent; for a **moved** one add: “November Children Testing will no longer show Ava as moved, so an admin could restore them there.” — accepted, L8) · `PRIVATE_GRADED` “This private testing is already graded, so it can’t change now.” · `MOVE_HAS_RESULT` “Ava already has a result for this testing day, so they can’t be moved.” · `PRIVATE_IS_CANCELLED` “This private testing was cancelled. An admin can restore it while its day is ahead.” · `RESTORE_TOO_LATE` “Its day has passed, so it can’t be restored. Add a new private testing instead.” · `UNDO_MOVE_TOO_LATE` “Too late to undo here. The private testing stays on the Private testing tab.” · `RESTORE_MOVED` same as `restoreMovedReason` · `PRIVATE_PAGE_GONE` “This private testing was deleted, or the link is wrong.” · `PRIVATE_CANCELLED_LINE` “This private testing was cancelled.” · `changePayingBySubOwed(name, due)` “Liam Park · $20 more to collect” · `editPaymentSubTopUp(name, parts, editing)` “Ava Chen · $65 cash Nov 2 + $20 card Dec 1 — editing the $20” · `movePaymentHint` with two payments “The $85 in payments moves with Ava.”.
**Apostrophes:** typographic ’ in every new string.

### 5.9 Styles and icons
New `src/styles/testing-private.css` (imported by `PrivateTestingTab.jsx` and `PrivateGradingPage.jsx`); dae8d00's additions to `testing-events.css` removed (§11). No purple tag any more. Icons: `IconCalendar`, `IconSchool`, `IconCalendarX`, `IconArrowRight`, `IconArrowBackUp`, `IconTrash`, `IconCash`, `IconEdit`, `IconPrinter`, `IconLock`, `IconAlertTriangle`, `IconArrowLeft`. Touch targets ≥ 44 px; no horizontal page scroll at 320 px (only the tab bar scrolls).

---

## 6. Checks before a builder is done
`npm run build` and `npm run build:preview-mode` pass · `node src/lib/testing/checks.mjs` → `ALL TESTING LIB CHECKS PASSED` · PGlite `node run.mjs` 0 failed (step 15 and 13g) · `dist/` has no `__tkdPreview`, `mockTestingEvents`, `setToday`, `service_role` · `git status` never lists `.env.local`, `node_modules`, `dist*` · CRLF unchanged · every new file has its header · each summary lists every file touched (shared ones called out).

## 7. Reviews (orchestrator)
- **Security (A + B):** RLS / grants / no anon / registrar / no login ids; definer + search_path; check orders; the move (net preserved, dates kept, one batch, append-only on both sides), Undo move limits, Restore `moved`; only `testing_restore_student` differs from live (diff it); logging; mock = database statuses.
- **Design (C)** against P1–P8 at 1280×800, 820×1180 touch, 390×844 touch, 320 wide, with `setToday` and `setRole`: the tab (Upcoming / Past, cards, empty), Add (past day), ⋯ staff / admin, Change day, Mark paid + Undo, the owed line, Edit payment after a top-up, Cancel / Restore / Delete, the grading page before / on / after, Print, Move (paid / not paid / No show) + Undo, the event Removed row, the tab bar scrolling at 320; keyboard and screen reader on the tabs, menu, dialogs and grading page.

## 8. Before building starts
1. Independent review of this contract and the plan; Jeffrey's OK (CP0) incl. §10.
2. Re-check that 0014 is free on every branch and worktree.
3. Rulebook icon-map rows (`ti-calendar`, `ti-school`, `ti-calendar-x`, `ti-arrow-right`) by the orchestrator.

## 9. Changes after the first draft
- **Independent review of the rewrite (2026-10-19, no critical / high):** M1 view computes the owed amount inline (+ V1 staff read); M2 a moved-in payment can't be own-undone by staff, Undo move recreates event payments with `recorded_by` null; M3 the Undo-move window counts from the registration's `withdrawn_at` (tests backdate it with the stamping trigger off); M4 Edit details keeps a removed rank (“(no longer in Classes and ranks)”); M5 / M6 decided by Jeffrey (v0.404, §10 points 13 / 14); M7 the extra negative tests (V4, V6, V7, V9, V9b, V10, V11, V11b); M8 `lastTab`, `routeIsUnknown`, other school, NoteDialog `hint` kept; L1 `moved_cleared_no_show` refuses Undo move; L2 three duplicate re-check lines; L3 payment-id array validated; L4 `moved_from_payment_id` unique; L5 Change how they'll pay only without Pass / Not passed; L6 0003 fingerprints after the down-script; L7 step 14 only after 13a–f; L8 delete-body note for moved ones; L9 E13; L10 Finance net / pairing note; L11 `movedTo.status`.

## 10. Open points (each with a proposed default)
1. **The 1-year cap on the day** used to count from the event's testing day; with no event it counts from **today** (Add, Change, Move). Default: today + 1 year (a typo guard only).
2. **Restore “while its day is still ahead”** — on the private day itself? Default: allowed on the day (`private_date >= today`), refused from the next day.
3. **“Open private testing”** on a moved Removed row opens the **grading page** of that private testing (the only per-testing page). Alternative: open the Private testing tab.
4. **Delete permanently of a moved event registration** is hidden on the screen (v0.403) but not refused by the database (that would mean replacing a second live function). Default: screen-only; it is admin-only and logged, and the event payments are already net 0.
5. **Undo after a move that cleared a No show:** no Undo on the toast (the No show can't come back — phase 3's “no Undo when a result was cleared”). Default: as written.
6. **A testing-day note alone** stays with the moved (withdrawn) event registration; it is not copied to the private testing. Default: as written.
7. **Where Move takes the private price from** → decided, see point 13.
8. **A last rank whose final award is Not set** is refused at Add / Edit details (`final_award_not_set`, like Add event). Default: as written.
9. **No possible-duplicate check** on the Private testing tab (not drawn). Default: none.
10. **Grading page “Not paid” tag** shows while anything is owed — also for a paid student who owes a top-up (as drawn in P6), while the roster says Paid. Default: as drawn.
11. **For the Finance session (information):** private money lives in `testing_private_payments`; a move writes event-side **reversals dated on the original day — a transfer, not a refund**: sum **net** amounts per table (payments + reversals), never count reversals as refunds; a moved pair is matched by `testing_private_payments.moved_from_payment_id` = the event reversal's `reverses_payment_id`; `0011_finance.sql` must stop hard-coding “not private” for Color Belt.
12. **Down-script** deletes every private testing and the money moved into it; use only before real private testings exist. Information.
13. **Move's private price (review M5) — decided v0.404 (Jeffrey):** Move uses **today's** private price from Classes and ranks for the student's rank (`testing_ranks.private_cents` of the event rank's `rank_id`) — the same source as Add and as the approved hint “The private price for Yellow in Classes and ranks”; only when that rank no longer exists there, the event's copied `private_cents`. The other copied fields (class / rank names, belts, testing-for) still come from the event copy. Built as §2.5.1 step 8.
14. **Staff powers through Move (review M6) — decided v0.404 (Jeffrey):** the front desk (all staff) may Move **any time**, including after the event's testing day; a testing-day No show is then cleared and logged — although Withdraw is admin-only and changing results after the day is admin-only (v0.186). As approved in v0.402 / v0.403; no admin-only rule is added to Move.

## 11. What each builder deletes or reverts first (from dae8d00)
`git checkout dae8d00^ -- <file>` puts back the live phase 3 version.
- **A:** rewrite `supabase/migrations/0014_testing_private.sql`, `supabase/tests/0014_tests.sql`, `supabase/tests/0014_fingerprints.sql` from scratch (delete their content — the registration columns, the event-linked functions and all nine replaced bodies go); revert `supabase/tests/0005_tests.sql`; revert `supabase/tests/pglite/run.mjs` and write the new step 14 — now step 15 after the merge — (the dae8d00 step-14 skeleton — fresh / upgrade / re-run / down before 13g — may be reused); replace SETUP §15 — now §16 — entirely (keep the §14e warning line).
- **B:** revert `src/lib/testing/eventRules.js`, `src/lib/testing/eventsApi.js`, `src/lib/mockTestingEvents.js`, `src/lib/testing/checks.mjs`, then add §4. Salvage into `privateRules.js`: dae8d00's `PRIVATE_TIME_CHOICES`, `privateTimeIsValid`, `privateDayProblem` (now from today), `privateDayLimit` (now from today). Everything else event-linked (`isPrivate`, `gradingDay`, `priceFor`, `amountDue` with fee rules, `privateMenu` for events, `livePayments`, `privateTestingsList`, `setPrivate`, `clearPrivate`, `addPrivateStudent`, the roster private fields) is dropped.
- **C:** revert `src/App.jsx`, `event/EventPage.jsx`, `event/RosterRows.jsx`, `event/StudentDialog.jsx`, `event/PaymentDialogs.jsx`, `event/GradingTab.jsx`, `event/GradingSheet.jsx`, `event/NoteDialog.jsx`, `event/useGradingSaves.js`, `events/EventsTab.jsx`, `text.js`, `src/styles/testing-events.css`, then add §5. **Delete** `events/PrivateTestingsList.jsx`. **Move** `event/PrivateGradingPage.jsx` and `event/PrivateSheet.jsx` to `private/` and re-point them to `privateApi` (drop the event header / event props); turn `event/PrivateDialog.jsx` into `private/DayTimeFields.jsx` (keep the Day / Time fields and their checks; drop Set / Change private, the event price lines and the No show notice wording) and delete it from `event/`. Re-add to `text.js` only the strings §5.8 lists.
