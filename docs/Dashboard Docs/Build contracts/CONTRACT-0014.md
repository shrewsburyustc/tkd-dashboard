# Contract 0014 — Color Belt testing phase 4: private testing

The single source of truth for the three parallel builders: **A database**, **B data layer + preview mock**, **C staff screens**. They work at the same time and do not talk to each other, so everything they share is pinned here: names, arguments, columns, statuses, answer shapes, rules, wording and file ownership. It implements the approved build plan; it does not re-decide it. If something here is impossible or contradicts the sources below, **stop and report it** — do not improvise.

> **Migration number: 0014** (decided 2026-10-19 after scanning every branch and worktree: 0011 = finance, 0012 = prospects, 0013 = camps). The plan and rulebook v0.254 said 0012; they are corrected.

| Source (in this order of authority) | |
|---|---|
| This contract | wins for phase 4 |
| Build plan `docs/Testing/Color Belt Testing/TKD-Testing-Phase4-Build-Plan.md` — **§6 answers and §8 review changes override §0–5** | §6 answered 2026-10-18/19 (rulebook v0.254) |
| Approved mockups (wording and layout source): `docs/Testing/Color Belt Testing/TKD-ColorBelt-Private-Mockups.html` (P1–P9 + P3b), images `Phase 4 images/` — **every proposal drawn there was approved** (v0.228) | approved 2026-10-18 |
| Rulebook `docs/Dashboard Docs/TKD-Dashboard-Design-Guidelines.md` — 10b rows **v0.225–v0.228** and **v0.254** (v0.254 corrects v0.228 on the price after Back and adds the review rules), plus the Color Belt rows they lean on: v0.132, v0.136, v0.157, v0.183, v0.186–v0.195; §2.4, §2.5, §3.5, §4, §5, §7 | |
| Handoff `docs/Dashboard Docs/TKD-Dashboard-Handoff.md` §6 (security rules, non-negotiable) | |
| Existing code: migrations 0001–0006 and 0010 (**live in production — never edit their SQL**), CONTRACT-0005, CONTRACT-0010, `src/` | |

**Working copy:** the Color Belt worktree `.claude/worktrees/color-belt-session-01afc8`, branch `color-belt`. Do not touch Supabase (no connector calls), Cloudflare, git remotes, other worktrees or the main folder. Do not commit; the orchestrator commits.
**Audience:** Jeffrey is learning IT — every new file starts with a header comment (what + why); short plain-English comments on non-obvious lines; readable over clever. Files keep the line endings of their neighbours (CRLF in this repo — check before and after with `file`).
**Production facts:** Supabase project `tkd-dashboard` (ref `eozkfbdfxqlcbpewhach`), PostgreSQL 17, Free plan. Live: 0001–0006 and 0010 (Color Belt phases 2 and 3 live and in use). Staff: Main Admin (admin), Staff (shared desk, role staff). A push to `main` deploys.
**Out of this build:** mat-side hiding (Star v0.249 / v0.250) — a later Color Belt follow-up once Star's switch reaches `main` (plan §6 Q6, v0.254 (6)); a Home card; private on the family form (never); Realtime; refunds / overpaid.

---

## 0. File ownership (no two builders edit the same file)

| Builder | Owns (creates / edits) | Must not edit |
|---|---|---|
| **A — database** | new `supabase/migrations/0014_testing_private.sql` · new `supabase/tests/0014_tests.sql` · new `supabase/tests/0014_fingerprints.sql` · `supabase/tests/0005_tests.sql` (**only the C3 list**, §3.2) · `supabase/tests/pglite/run.mjs` (new step 14 + moving 13g, §3.3) · `supabase/SETUP.md` (new **§15** incl. the down-script in §15e, plus **one warning line** at the top of §14e, §3.5) | `src/`, `docs/`, migrations 0001–0010, every other test file |
| **B — data layer + mock** | `src/lib/testing/eventRules.js` · `src/lib/testing/eventsApi.js` · `src/lib/mockTestingEvents.js` · `src/lib/testing/checks.mjs` (add groups) | `src/screens/**`, `src/components/**`, `src/styles/**`, `src/App.jsx`, `src/lib/mockClient.js` (needs no change — `setToday` / `failSavesUntilRetry` already cover phase 4), `supabase/` |
| **C — staff screens** | `src/screens/testing/event/EventPage.jsx` · `RosterRows.jsx` · `StudentDialog.jsx` · `PaymentDialogs.jsx` · `GradingTab.jsx` · `GradingSheet.jsx` · `useGradingSaves.js` · new `PrivateDialog.jsx` · new `PrivateGradingPage.jsx` · new `PrivateSheet.jsx` (all in `src/screens/testing/event/`) · `src/screens/testing/events/EventsTab.jsx` · new `src/screens/testing/events/PrivateTestingsList.jsx` · `src/screens/testing/text.js` · `src/styles/testing-events.css` · `src/App.jsx` (**shared file** — the route and the private page's ways in and out only, §5.1) | files owned by A and B; `src/screens/Testing.jsx`, `src/components/**`, `src/styles/tokens.css`, `src/styles/testing.css`, `navItems.js` (none needs a change — if one seems to, stop and report) |
| Orchestrator | this contract, rulebook (incl. the §7 purple colour row and any CP1 wording changes), status file, handoff, `docs/*`, commits | |

B returns codes, never words; C owns all wording. C imports B's modules by the exact names in §4.
**Shared files touched** (CLAUDE.md list): `src/App.jsx` (C). Not touched: `src/screens/Testing.jsx`, `src/styles/tokens.css`, `src/lib/mockClient.js`, `navItems.js`, `README.md`, `docs/README.md`. **Merge watch:** `run.mjs` and `SETUP.md` are also edited by other branches (the prospect branch adds sections for 0007–0009 and 0014) — if `main` already has a SETUP §15 or a run.mjs step 14 at merge time, ours is renumbered then.

---

## 1. Shared rules (A, B and C — the database, the mock and the screens must agree exactly)

### 1.1 Words used below
- *Today* = `public.testing_today()` (school time, America/New_York) in the database; `eventsApi.schoolToday()` in the app (the preview's `setToday` changes both).
- *Private* = the registration's `private_date` is not null (then `private_time` is not null too).
- *Own day* = `coalesce(private_date, testing_date)` — the day the student is graded.
- *Graded (phase 3 meaning)* = a `testing_results` row exists (a result **or** a note). Used by every phase 3 lock, unchanged.
- *Has a result* = the row exists **and** `result is not null`. **For the private paths (Change, Back, the Private testings list) only this counts as graded** (Q5, v0.254 (5)): a note alone never blocks Change / Back, is never cleared by them, and keeps the student on the list.
- *Net paid* = the sum of the student's `testing_payments.amount_cents` (reversal rows are negative) — the roster's `paid_cents`.
- *Due* = what Mark paid would record now (§1.3). *Owes more* = paid (`net > 0`) and due > 0.
- *Admin* = `is_admin()` (always after `has_data_access()` was checked). *Active* = `status = 'active'`.

### 1.2 Date and time rules
| Rule | Exactly |
|---|---|
| Private day, lower bound | `private_date >= today` — else **`past_day`**. The same day as today is allowed at any time of day (only the day is checked). |
| Private day, upper bound | `private_date <= testing_date + interval '1 year'` (Postgres date arithmetic: Feb 29 + 1 year = Feb 28) — else **`invalid`**. JS mirror: `eventRules.privateDayLimit(testingDate)`. |
| Private day vs testing day | **Any** day in that range: before, on (Q4 — same day, another time) or after the testing day. |
| Private time | `06:00` to `22:00` **inclusive**, minutes a multiple of 5, seconds 0 (v0.157, same list as Add event) — else **`invalid`**. 193 choices. |
| Grading (set result / note) | Against the student's **own day**: today < own day → `not_open` (admins too); today > own day and not admin → `finished`; otherwise allowed. |
| Back to the testing day (H1) | After the **testing day** (`today > testing_date`) only admins; staff → `not_allowed`. On / before the testing day: all staff. |
| Set private after the testing day | Allowed for **all staff** when the student has no result row, or only a **No show** (Q3, v0.228, v0.254 (7)). |
| Add student already private | Same as live Add student: staff refused when the event is finished (`today > testing_date` → `finished`), admins allowed (v0.191). |
| Phase 3 belt lock (Edit details) | Graded (phase 3 meaning) **and** `today > own day` **and** not admin → `not_allowed`. |
| Keep one / Restore lock (H3) | “After the testing day” becomes “`today > testing_date` **or** (private **and** `today > private_date`)” — for the student being withdrawn (keep one) / restored. |
| Event date lock (M3) | `has_results` counts only results of students that are **not private**. |
| Signatures (v0.254) | Deleted when `greatest(testing_date, private_date) < today - 90` (`greatest` ignores a null private date). |
| Private testings list | No date filter: active, private, **no result** — past ungraded ones stay until graded (v0.228). |

### 1.3 The money rule (one rule, three copies: `testing_amount_due` in SQL, `eventRules.amountDue` in JS, the mock)

```
price = private          → the event rank copy's private_cents
        not private      → testing_fee_cents(early_cents, day_cents, today, testing_date)
                           (early price before the testing day, testing-day price on or after it —
                            by TODAY's date, the day they pay: Q1, v0.254 (1))
due   = private          → greatest(price − greatest(net, 0), 0)
        not private      → 0 when net > 0 (v0.136: a regular student is never re-priced after paying),
                           else price
```
- **Mark paid records `due`**, by the registration's current `paying_by`, `paid_on` = today. **due = 0 → nothing is inserted, answer `already_paid`** (review L1: a $0 price never makes a $0 payment).
- The roster's **Paid** tag stays `net > 0` (the view's `paid`, unchanged). A paid student who owes more stays **Paid** and shows the amber owed line + Mark paid (P4).
- Back to the testing day after paying → not private → net > 0 → due 0, nothing owed (Q4). A partial net then also counts as Paid — accepted (review L2).
- Belt / class correction re-prices automatically through the same rule (Q2): private + paid + pricier rank → due > 0; cheaper → due 0, no refund; regular paid → due 0.

**Worked examples** — Group A Yellow: early $65, testing day $75, private $85. Group B Blue: $70 / $80 / $95. Testing day Fri, Nov 20.

| # | Situation | Due → what happens |
|---|---|---|
| M1 | Regular, not paid, Mark paid on Nov 10 / Nov 20 / Nov 21 | $65 / $75 / $75 |
| M2 | Private (set Nov 10), not paid, Mark paid any day | $85 |
| M3 | Paid $65 cash Nov 2, set private Nov 10 | due $20 → row **Paid** + “Paid $65 · $20 more to collect”; Mark paid records **$20** (paying_by), then `already_paid` |
| M4 | M3, then the desk's own toast Undo of the $20 within 10 s | due $20 again |
| M5 | Private, paid $85, then Back to the testing day | net 85 > 0, not private → due 0, Paid, nothing owed |
| M6 | Paid $65, private (owes $20), then Back | due 0 — Paid (partial accepted, L2) |
| M7 | Private, not paid, Back on Nov 21, Mark paid | regular again → **$75** (price by the day they pay) |
| M8 | Private, paid $85, belt corrected to Group B Blue | price $95 → due **$10**; Edit details warns “Price $85 → $95 · $10 more to collect”; Mark paid records $10 |
| M9 | Private, paid $85, corrected to a rank with private $80 | due 0, payment stays, no refund |
| M10 | Regular, paid $65, corrected to a pricier rank | due 0 (v0.136 unchanged) |
| M11 | Private price $0, not paid | due 0 → Mark paid hidden; the database answers `already_paid`, inserts nothing (see §10 point 3) |
| M12 | M3 topped up ($65 + $20), admin Edit payment changes the **$20** to $10 | net 75 → due $10 → the owed line shows again |
| M13 | M3 topped up, admin Undo payment | reverses the most recent live payment ($20) → due $20 |
| M14 | Private, owes $20, desk changes paying by cash → card, Mark paid | records $20 card; the $65 stays cash (Q3) |

### 1.4 Statuses
Existing codes keep their meaning. **New codes:** `past_day` (private day before today), `has_result` (Set private on a student who already has a testing-day Pass / Not passed or a note-only row), `graded` (Change / Back on a private student who has a result; Back also on a private No show). Reused for the new rules: `not_allowed` (H1, the phase 3 locks), `already_paid` (due = 0), `not_open` / `finished` (grading against the own day), `invalid`, `stale`, `withdrawn`, `not_found`, `no_access`, `finished` (add private after the day, staff).

---

## 2. Database — `0014_testing_private.sql` (Builder A)

### 2.1 General rules (as 0005 §1.1 / 0010 §1.1 — non-negotiable)
- Schema `public`; owner `postgres`. **One transaction** (`begin; … commit;`), header comment in 0010's style (§2.8).
- **Re-runnable:** `add column if not exists`, `drop constraint if exists` + `add constraint`, `create or replace function`, column rights revoked then granted. Applying 0014 twice changes no row and no fingerprint (run.mjs, §3.3).
- **No existing function changes its arguments or its name.** Replaced functions are `create or replace` of the **live body copied exactly** (0005's for `testing_mark_paid`, `testing_change_paying_by`, `testing_purge_old_signatures`; 0010's for the other six), with only the lines this contract adds, each marked `-- 0014:`; their revoke / grant lines repeated unchanged. Until someone sets a private day (only possible with the new screens) every replaced function behaves exactly as today.
- Every function: `set search_path = ''`, fully qualified names, no argument defaults, `revoke execute … from public, anon, authenticated, service_role` **first**, then only the grants of §2.6.
- Staff write functions: `security definer`, `volatile`, `returns jsonb` `{status: …}`, the whole body inside 0005's `begin … exception … end` block with 0005's mapping (`unique_violation` → `stale`; `foreign_key_violation`, `check_violation`, `not_null_violation` → `invalid`; `deadlock_detected`, `serialization_failure`, `lock_not_available` → `stale`). Every write sets `tkd.action` + **one** `tkd.batch_id` (`gen_random_uuid()`) and clears both before returning.
- **Lock order** as 0005/0010: school → event → registration (via `public.testing_lock_registration(uuid)`) → its result row `for update`. The event's `testing_date` is read **after** that call.
- **“Today”** is only ever `public.testing_today()`.
- Dates and times in answers are text: `to_char(private_date, 'YYYY-MM-DD')`, `to_char(private_time, 'HH24:MI')` (e.g. `"16:00"`), or JSON `null`.
- **Connector words:** `0014_fingerprints.sql` must not contain the words the Supabase connector refuses (spell names in pieces as `0005_fingerprints.sql` does). The migration and `0014_tests.sql` are pasted by Jeffrey in the SQL Editor and may contain them.
- **The `testing_roster` view is NOT changed** (review M1). The app reads `private_date, private_time` from `testing_registrations`.

### 2.2 New columns on `public.testing_registrations`

| Column | Type | Rule |
|---|---|---|
| `private_date` | `date null` | the private testing day |
| `private_time` | `time null` | its start time |

- `alter table public.testing_registrations add column if not exists private_date date null;` (same for `private_time time null`).
- Constraint **`testing_registrations_private_pair_check`**: `check ((private_date is null) = (private_time is null))`.
- Constraint **`testing_registrations_private_time_check`**: `check (private_time is null or public.testing_private_time_is_valid(private_time))`.
- Both added with `drop constraint if exists` + `add constraint` (0005's pattern). The date cap (1 year) and “not in the past” are **function rules**, not table checks (they depend on today / the event).
- `comment on column` for both (“Private testing day / start time (phase 4). Null = tests on the event's testing day. Set only by testing_set_private / testing_clear_private / testing_add_private_student.”).
- Setting them is an ordinary registration change: the existing `testing_registrations_before_write` bumps `version` and stamps who/when; the existing `testing_registrations_log` logs them (no trigger change).
- **Rights:** `revoke select (private_date, private_time) on public.testing_registrations from public, anon, authenticated, service_role;` then `grant select (private_date, private_time) on public.testing_registrations to authenticated;`. Nothing to `anon`, `service_role` or `testing_registrar`. (The existing RLS policy `testing_registrations_select_with_access` already covers the rows.)

### 2.3 Internal helpers (granted to nobody)

**`public.testing_private_time_is_valid(p_time time) returns boolean`** — `language sql immutable`, `set search_path = ''`, not security definer. True only for `p_time between time '06:00' and time '22:00' and extract(minute from p_time)::integer % 5 = 0 and extract(second from p_time) = 0`; null → false. Used by the table check and by the functions.

**`public.testing_amount_due(p_registration_id uuid) returns integer`** — `language sql stable`, `set search_path = ''`, not security definer. §1.3's rule, ≥ 0; null when the registration doesn't exist:
```sql
select greatest(
         case when r.private_date is not null
                then k.private_cents - greatest(coalesce(t.net, 0), 0)
              when coalesce(t.net, 0) > 0 then 0
              else public.testing_fee_cents(k.early_cents, k.day_cents, public.testing_today(), e.testing_date)
         end, 0)
  from public.testing_registrations r
  join public.testing_event_ranks k on k.id = r.event_rank_id
  join public.testing_events e on e.id = r.event_id
  left join lateral (select sum(p.amount_cents)::integer as net
                       from public.testing_payments p where p.registration_id = r.id) t on true
 where r.id = p_registration_id;
```
Both: `revoke execute … from public, anon, authenticated, service_role;` and **no grant** (review M2).

### 2.4 New staff functions (S = staff and admins)

**`testing_set_private(p_registration_id uuid, p_expected_version integer, p_private_date date, p_private_time time) returns jsonb`** — S. Set private (first time) **or** change the day / time.
1. `has_data_access()` not true → `no_access`
2. any argument null, or `not testing_private_time_is_valid(p_private_time)` → `invalid`
3. `v_r := testing_lock_registration(p_registration_id)`; `v_r.id is null` → `not_found`
4. `v_r.version <> p_expected_version` → `stale`
5. `v_r.status = 'withdrawn'` → `withdrawn`
6. read the event's `testing_date`; `p_private_date < testing_today()` → `past_day`; `p_private_date > testing_date + interval '1 year'` → `invalid`
7. lock the result row (`select … for update`; may be absent) → `v_res`
8. result rule:
   - **not private yet** (`v_r.private_date is null`): no row → allowed; `v_res.result = 'no_show'` → allowed, **the row (No show and its note) will be removed**; any other row (Pass, Not passed, or a note only) → **`has_result`**.
   - **already private**: no row, or `v_res.result is null` (note only) → allowed, the note is **kept**; `v_res.result = 'no_show'` → allowed, the row (result and note) will be removed (H2); `pass` / `not_passed` → **`graded`**.
9. write with `tkd.action` = `set_private` (was not private) / `change_private` (was private) and one new batch id: `update testing_registrations set private_date = p_private_date, private_time = p_private_time where id = … and (private_date, private_time) is distinct from (p_private_date, p_private_time)`; then, when step 8 said “removed”: `set_config('tkd.action', 'clear_result', true)` (same batch) and `delete` the result row.
   Same day and time and nothing to remove → writes nothing.
10. clear the tags; answer
   `{"status":"ok","version":n,"private_date":"2026-12-01","private_time":"16:00","amount_due_cents":8500,"result_cleared":true|false}` (`amount_due_cents` = `testing_amount_due()` after the write; `result_cleared` always present, true only when a row was removed).

Statuses: `ok, no_access, invalid, not_found, stale, withdrawn, past_day, has_result, graded`.

**`testing_clear_private(p_registration_id uuid, p_expected_version integer) returns jsonb`** — S (admins only after the testing day). Back to the testing day.
1. `no_access` · 2. any argument null → `invalid` · 3. lock → `not_found` · 4. `stale` · 5. `withdrawn`
6. not private → write nothing, answer ok (as step 9)
7. lock the result row; `result is not null` (Pass, Not passed **or No show**) → **`graded`** (a note alone does not count, Q5)
8. read `testing_date`; `testing_today() > testing_date` and not admin → **`not_allowed`** (H1)
9. write: `tkd.action` `clear_private`, one batch id, `set private_date = null, private_time = null`. The note row (if any) stays. Answer `{"status":"ok","version":n,"amount_due_cents":n}`.

Statuses: `ok, no_access, invalid, not_found, stale, withdrawn, graded, not_allowed`.

**`testing_add_private_student(p_event_id uuid, p_first text, p_last text, p_event_rank_id uuid, p_stripes boolean, p_paying_by text, p_private_date date, p_private_time time) returns jsonb`** — S. Add student with **Tests privately** ticked (P3b, Q7).
- The live `testing_add_student` body (0010 version) **copied exactly**, plus: step 2 also refuses a null `p_private_date` / `p_private_time` or an invalid time (`invalid`); after the existing `finished` (staff only) and rank checks, and before the write: `p_private_date < testing_today()` → `past_day`; `> testing_date + interval '1 year'` → `invalid`.
- The private columns go **into the INSERT itself** (one row, version 1, **one** change_log row, `tkd.action` `add_student` — review L3). A refused call inserts nothing.
- Answer `{"status":"ok","id":…,"reference":"CB-3120","version":1,"private_date":"…","private_time":"…","amount_due_cents":n}`.

Statuses: `ok, no_access, invalid, not_found, finished, past_day, stale`.

### 2.5 Replaced functions (same arguments; the live body + exactly these lines)

| Function (live body from) | Change |
|---|---|
| `testing_mark_paid(p_registration_id, p_expected_version)` (0005) | The `already_paid` check (`sum > 0`) becomes `v_amount := public.testing_amount_due(p_registration_id); if coalesce(v_amount, 0) <= 0 then return already_paid`; the old fee lookup is removed (the amount is `v_amount`). Same check order (version → withdrawn → already_paid), same insert, version bump, purge call and answer `{status, payment_id, amount_cents, method, version}`. |
| `testing_change_paying_by(p_registration_id, p_expected_version, p_paying_by)` (0005) | `already_paid` only when **net > 0 and `testing_amount_due()` = 0** (Q3: allowed while a private student owes more). Earlier payments keep their method. Answer unchanged. |
| `testing_purge_old_signatures()` (0005) | `e.testing_date < testing_today() - 90` becomes `greatest(e.testing_date, x.private_date) < testing_today() - 90`. Nothing else. |
| `testing_set_result(p_registration_id, p_result)` and `testing_set_result_note(p_registration_id, p_note)` (0010) | Step 5 compares with `coalesce(v_r.private_date, v_testing_date)` instead of `v_testing_date` (both the `not_open` and the `finished` line). |
| `testing_update_student(…)` (0010) | (a) the lock line uses `public.testing_today() > coalesce(v_r.private_date, v_testing_date)`; (b) after the write, if the registration **is private** add `amount_due_cents` = `testing_amount_due()` to the ok answer. The answer is otherwise unchanged: `{status:'ok', version}` + `result_cleared: true` only when a result was cleared + `amount_due_cents` **only when private** (0005_tests T7 compares a regular student's whole answer with `{status:'ok', version:2}`). |
| `testing_resolve_duplicate(…)` (0010) | The keep-one condition `testing_today() > v_testing_date` becomes `(testing_today() > v_testing_date or (v_other.private_date is not null and testing_today() > v_other.private_date))` (H3; `v_other` = the one being withdrawn, already locked). Keep both unchanged. |
| `testing_restore_student(…)` (0010) | The staff refusal `testing_today() > v_testing_date and exists (result row)` becomes `(testing_today() > v_testing_date or (v_r.private_date is not null and testing_today() > v_r.private_date)) and exists (result row)` (H3). |
| `testing_update_event(…)` (0010) | The `has_results` subquery adds `and r.private_date is null` (M3). |

**Untouched:** `testing_add_student`, `testing_delete_student`, `testing_delete_event`, `testing_withdraw_student`, `testing_undo_payment`, `testing_edit_payment` (they already act on the most recent live payment), `testing_lock_registration`, `testing_fee_cents`, the triggers, both public functions, the view.

### 2.6 Grants
- `testing_set_private(uuid, integer, date, time)`, `testing_clear_private(uuid, integer)`, `testing_add_private_student(uuid, text, text, uuid, boolean, text, date, time)`: revoke from `public, anon, authenticated, service_role`, then `grant execute … to authenticated` only.
- `testing_private_time_is_valid(time)`, `testing_amount_due(uuid)`: revoke from everyone, **no grant**.
- Replaced functions: the same revoke + grant lines as their live version (`testing_purge_old_signatures` stays granted to nobody).

### 2.7 Removal order (review M1)
Re-running **0005** or **0010** after 0014 puts back older bodies (without the private rules) → re-run **0014** right after. Removal: **0014 down first (§2.9), then 0010 down (SETUP §14e)**.

### 2.8 Header facts the migration must state
What it adds (2 columns + 2 checks + column rights, 2 internal helpers, 3 staff functions, 9 replaced functions with one line each on what changed), the new statuses (`past_day`, `has_result`, `graded`), the new `tkd.action` names (`set_private`, `change_private`, `clear_private`; reused `add_student`, `clear_result`, `mark_paid`), §2.7's re-run / removal warning, “the testing_roster view is unchanged on purpose”, and that the down-script lives in SETUP §15e.

### 2.9 Down-script (SETUP §15e, used only with Jeffrey's OK)
First put the app back to a version without private testing. Then three steps in this order:
1. Re-run the whole **0005** file (puts back 0005's `testing_mark_paid`, `testing_change_paying_by`, `testing_purge_old_signatures`; repeat 12i step 1 if the family-form off switch is in force).
2. Re-run the whole **0010** file straight after (puts back 0010's six bodies).
3. The SQL block (one transaction):
```sql
begin;
select set_config('tkd.action', 'undo_0014', true);
select set_config('tkd.batch_id', gen_random_uuid()::text, true);
update public.testing_registrations set private_date = null, private_time = null where private_date is not null;
select set_config('tkd.action', '', true);
select set_config('tkd.batch_id', '', true);
alter table public.testing_registrations
  drop constraint if exists testing_registrations_private_pair_check,
  drop constraint if exists testing_registrations_private_time_check;
alter table public.testing_registrations drop column if exists private_date, drop column if exists private_time;
drop function if exists public.testing_set_private(uuid, integer, date, time);
drop function if exists public.testing_clear_private(uuid, integer);
drop function if exists public.testing_add_private_student(uuid, text, text, uuid, boolean, text, date, time);
drop function if exists public.testing_amount_due(uuid);
drop function if exists public.testing_private_time_is_valid(time);
commit;
```
(`change_log` keeps every row; each cleared private day gets one `undo_0014` row.) Afterwards `0010_fingerprints.sql` and `0005_fingerprints.sql` equal a database that never had 0014.

---

## 3. Database tests (Builder A)

### 3.1 `supabase/tests/0014_tests.sql`
0010_tests style: one `do` block inside `begin; … rollback;`, the same pretend sessions (A1 admin unlocked · A2 locked · A3 5 wrong PINs · A4 signed out · A5 password 8 days old · A6 magic link · D1 desk unlocked · D2 desk locked · D3 desk magic link · anon) with `<paste-admin-UID-here>` / `<paste-desk-UID-here>`, its own `zz test …` class (two ranks with different prices, one rank with private price $0) and events (made with `testing_add_event`, then moved as `postgres` like 0010_tests: **E_before** = today + 2, **E_day** = today, **E_after** = today − 1), made-up names, `TEST FAILED: Vn …` messages, last line `select 'ALL 0014 TESTS PASSED' as result;`. A private day in the past is made as `postgres` (`update … set private_date = …`), never through the functions.

| # | Proves |
|---|---|
| V1 | **Catalog:** both columns exist (`date`, `time`, nullable); both checks with the expected definitions; column SELECT on them for `authenticated` only (not anon, service_role, registrar, PUBLIC); `testing_roster` has no `private_*` column; the 3 functions `security definer`, `search_path=""`, no defaults, owner = owner of `testing_events`, executable by `authenticated` only; the 2 helpers executable by nobody, not security definer, `search_path=""`; the 9 replaced functions keep their grants / definer / search_path |
| V2 | **Locked sessions:** A2–A6, D2, D3 get `no_access` from the 3 functions and read 0 rows of `testing_registrations`; `anon` permission denied on the functions and the two columns; registrar has no right (catalog) |
| V3 | **Day / time input** (D1 and A1): nulls → `invalid`; times 05:55, 22:05, 16:03, 16:00:30 → `invalid`; 06:00 and 22:00 → ok; yesterday → `past_day`; today → ok; = the testing day → ok (Q4); before / after the testing day → ok; testing day + 1 year → ok; + 1 year + 1 day → `invalid` |
| V4 | `stale` (old version), `withdrawn`, `not_found` for set / clear; a same-day-same-time Change writes nothing (version and change_log count unchanged) |
| V5 | **add_private_student:** ok → one registration with both columns, `version 1`, exactly **one** change_log row (`add_student`); bad time / yesterday / too far → nothing inserted, no log row; D1 on E_after → `finished`; A1 on E_after → ok; `amount_due_cents` = the private price |
| V6 | **Price:** private not paid → `testing_mark_paid` records `private_cents`, then `already_paid`; regular unchanged (early before the testing day, testing-day price on / after) |
| V7 | **Top-up:** D1 marks a regular student paid ($65), sets private ($85) → `amount_due_cents 2000`; Mark paid records exactly 2000, then `already_paid`; D1 undoes its own $20 within 10 s → due 2000 again → Mark paid → `already_paid`; A1 Edit payment of the most recent payment to $10 → due 1000 |
| V8 | **$0 private price:** set private → `amount_due_cents 0`; Mark paid → `already_paid` and **no** payment row inserted |
| V9 | **Back after paying:** paid $85 private → clear → `amount_due_cents 0`, Mark paid `already_paid`; owes $20 then clear → due 0 |
| V10 | **change_paying_by:** private owing → ok (later Mark paid uses the new method, the $65 row keeps cash); fully paid → `already_paid`; regular paid → `already_paid` (unchanged) |
| V11 | **Testing-day No show cleared:** E_after, No show + note → D1 `set_private` ok with `result_cleared true`, result row gone, change_log has a `testing_registrations` update (`set_private`) and a `testing_results` delete (`clear_result`) with the **same** batch_id; Pass → `has_result`; Not passed → `has_result`; note only → `has_result` |
| V12 | **Private No show (H2):** private day = today, `set_result no_show`; `clear_private` → `graded`; `set_private` to a new day → ok, `result_cleared true`, actions `change_private` + `clear_result`, same batch |
| V13 | **Graded private:** Pass → Change `graded`, Back `graded`; **note only** → Change ok (note kept), Back ok (note kept) (Q5) |
| V14 | **H1:** E_after, ungraded private: D1 `clear_private` → `not_allowed`, nothing changed; A1 → ok. E_day and E_before: D1 → ok |
| V15 | **Grading from the own day:** on E_day with private day = today + 1 → `not_open` (D1 and A1, both functions); private day = today → ok (both); private day = yesterday (as postgres) → `finished` (D1), ok (A1); a regular E_day student unchanged |
| V16 | **update_student re-price (Q2):** private paid $85 → belt to a rank with private $95 → ok with `amount_due_cents 1000`, Mark paid records 1000; to a rank with private $80 → `amount_due_cents 0`, no payment; a **regular** paid student's belt change → answer exactly `{status:'ok', version:n}` (no `amount_due_cents`, no `result_cleared`); D1 belt change of a graded private student after the **private** day but before the testing day → `not_allowed`; A1 → ok |
| V17 | **H3:** E_before; a graded private student whose private day is yesterday, renamed into a possible duplicate: D1 keep-one withdrawing her → `not_allowed`; A1 → ok; D1's own 10-second Restore of a graded private past day → `not_allowed`; control: private day tomorrow → D1 keep-one ok |
| V18 | **M3:** E_before with only a private student's result → `testing_update_event` date change → ok; after a non-private result exists → `has_results` |
| V19 | **Signature purge:** a form registration (inserted as postgres with the form fields) on an event 100 days ago: private day 10 days ago → kept; no private day → removed (call the internal purge as postgres) |
| V20 | **History:** actions `set_private`, `change_private`, `clear_private`, `add_student`, `clear_result`, `mark_paid` present with non-null batch ids and the session's actor name; every set / change / clear bumps the registration version by exactly 1 |
| V21 | change_log never contains `data:image` (re-checked after V1–V20) |

### 3.2 `supabase/tests/0005_tests.sql` — C3 only
Add `'testing_registrations.private_date', 'testing_registrations.private_time'` to C3's `v_list` (after `'testing_registrations.updated_by_name'`), with a one-line comment “(0014: present only once 0014 is applied; C3 loops over existing columns, so the list works before and after)”. **No other byte changes.** The orchestrator tells Jeffrey before CP2 that the production copy of `0005_tests.sql` is this updated one (review H5).

### 3.3 `run.mjs` — new step 14, and 13g moves to the very end
- `step13()` loses its last line (13g). `main()` order becomes: step 13 (a–f) → **step 14** (below, only if 0010 applied) → **13g** `downScriptCheck(db, after5)` last, unchanged code. The header comment lists step 14 and says 13g now runs after 14i.
- **Step 14** (0014), on the main database:
  a. take the 0003, 0004, 0005, 0006 and 0010 fingerprints; apply `0014_testing_private.sql`; `0014_tests.sql` must print `ALL 0014 TESTS PASSED`.
  b. 0003, 0004 and **0006** fingerprints **identical** to before (review M9); 0005 differs **only** in the rows of `testing_mark_paid`, `testing_change_paying_by`, `testing_purge_old_signatures`, the four 0010-replaced 0005 functions and the `testing_registrations` table row; 0010 differs only in its six replaced functions' rows.
  c. test files again: `0010_tests.sql`, `0005_tests.sql` (with the new C3), `0006_tests.sql`, `0003_tests.sql`, `0004_tests.sql`, `0002_tests.sql`, `verify_pin_tests.sql` — all pass.
  d. registrar live checks (11b) again plus: read `private_date` of `testing_registrations`; call `testing_set_private`, `testing_clear_private`, `testing_add_private_student`, `testing_amount_due` — all refused.
  e. one private day for a seeded family registration of the test event (as postgres, labelled like 11c), so the re-run and the down-script have data.
  f. fingerprints (`0014_fingerprints.sql`) + an md5 snapshot of (`id, private_date, private_time, version` of every registration) and the change_log count; apply 0014 a **second time**; snapshot and fingerprints identical; `0014_tests.sql` and `0005_tests.sql` pass again.
  g. upgrade database: apply 0014 on top of its 0010; its 0014 fingerprints equal the main database's (fresh = upgrade); `0014_tests.sql`, `0010_tests.sql`, `0005_tests.sql` pass there.
  h. print the 0014 fingerprints like the others.
  i. **the 0014 down-script** (SETUP §15e, all three steps exactly as written there, the SQL block read from SETUP.md like 13g): afterwards both columns and the five 0014-only functions are gone, `0010_fingerprints.sql` equals step 13e's and `0005_fingerprints.sql` equals the 0005 fingerprints taken in 14a, one `undo_0014` change_log row per cleared private day, `0010_tests.sql` and `0005_tests.sql` pass. **Then 13g runs** (0014 down → 0010 down, the real removal order).

### 3.4 `supabase/tests/0014_fingerprints.sql`
Read-only single SELECT in 0010_fingerprints' format (`kind, item, detail`): `function` rows for the 2 helpers, the 3 new and the 9 replaced functions (14); `column` rows `testing_registrations.private_date` / `.private_time` (type, nullable, per-column rights); `constraint` rows for the two checks (name + `pg_get_constraintdef`). 18 rows. Connector-safe (§2.1).

### 3.5 SETUP §15 (in §14's style; inserted right after §14e, before “Admin: change the front-desk PIN or password”)
**15. Migration 0014: Color Belt private testing** — what it does (plain English); the order CP2 → CP3 → CP4; 15a apply (SQL Editor, the destructive-operations warning explained); 15b read-only checks (`0014_fingerprints.sql` = PGlite; `0005_fingerprints.sql` / `0010_fingerprints.sql` differ only in the rows listed in §3.3b — expected; 0003 / 0004 / 0006 unchanged; security advisor: the only new expected notice is “security definer function executable by authenticated” for the 3 new functions); 15c tests (`0014_tests.sql`, then the **updated** `0005_tests.sql`, `0010`, `0006`, `0004`, `0003`, `0002`, PIN); 15d CP3 real check (plan §5 step 5: a **Closed** TEST event — review L13 — one student set private from ⋯ and one added with Tests privately, a top-up, grading on a private day = today, delete; Claude checks the history read-only); 15e undo and re-run warnings + §2.9 verbatim.
At the top of **§14e** add one line: “If migration 0014 exists, remove it first (§15e) — 0010 can only be removed after 0014.”

---

## 4. Data layer and preview mock (Builder B)

### 4.1 `src/lib/testing/eventRules.js` (pure, node-importable)

| Export | Does |
|---|---|
| `PRIVATE_TIME_CHOICES` | `['06:00', '06:05', …, '22:00']` (193 strings) |
| `privateTimeIsValid(text)` | true for `'HH:MM'` / `'HH:MM:SS'` with seconds 00 that is in `PRIVATE_TIME_CHOICES` |
| `privateDayLimit(testingDate)` | `'YYYY-MM-DD'` = testingDate + 1 year, Feb 29 → Feb 28 (as Postgres) |
| `privateDayProblem(day, today, testingDate)` | `null` · `'missing'` (not an ISO date) · `'past'` (`day < today`) · `'tooFar'` (`day > privateDayLimit(testingDate)`) |
| `isPrivate(row)` | `isIsoDate(row.privateDate ?? row.private_date)` |
| `gradingDay(row, testingDate)` | the row's private date, else `testingDate` (use with `gradingRules.gradingWindow`) |
| `priceFor({ rank, privateDate, today, testingDate })` | `rank.privateCents` when `privateDate`, else `feeFor(rank, today, testingDate)` |
| `amountDue({ rank, privateDate, paidCents, today, testingDate })` | §1.3 exactly, integer ≥ 0 |
| `owesMore(row)` | `row.paid && row.amountDueCents > 0` |
| `showMarkPaid(row)` | `row.status === 'active' && row.amountDueCents > 0` |
| `canChangePayingBy(row)` | `row.status === 'active' && (!row.paid \|\| row.amountDueCents > 0)` (Q3) |
| `privateMenu(row, { today, testingDate, isAdmin })` | `{ canSet, canChange, canBack, canGrade }` — `active` = status active; `canSet = active && !row.isPrivate && (!row.graded \|\| row.result === 'no_show')`; `canChange = active && row.isPrivate && (row.result === null \|\| row.result === 'no_show')`; `canBack = active && row.isPrivate && row.result === null && (isAdmin \|\| today <= testingDate)`; `canGrade = active && row.isPrivate` |
| `livePayments(payments, registrationId)` | that student's `kind 'payment'` rows not reversed, oldest first (`recordedAt`) — for the top-up wording (Edit payment, details, delete) |
| `privateTestingsList(rows)` | rows `{ status, privateDate, privateTime, result, firstName, lastName, … }` → only active, private, `result === null`; sorted by `privateDate`, `privateTime`, `lastName`, `firstName` (locale compare, case-insensitive) |
- `feeFor`'s comment loses “Private price isn't used in phase 2”; `isPaid`'s comment “No partial payments exist” is replaced by the L2 note (a private top-up and the accepted partial-after-Back case).

### 4.2 `src/lib/testing/eventsApi.js`
- `EVENT_STATUSES` adds `'past_day'`, `'has_result'`, `'graded'`. Header comment lists the new functions and statuses.
- `PRIVATE_COLUMNS = 'id, private_date, private_time'` (never `*`).
- **`loadEvent(eventId)`**: one more chunked read with the ranks / payments / results: `selectIn('testing_registrations', PRIVATE_COLUMNS, 'id', regIds)`. Every roster row gains:
  `privateDate` (`'YYYY-MM-DD'` | null), `privateTime` (`'HH:MM'` via `shortTime` | null), `isPrivate` (boolean), `priceCents` (`priceFor`, with the row's rank copy, `today`, `event.testingDate`), `amountDueCents` (`amountDue`), `owesMore` (boolean).
  `event` gains `owesMoreCount` = active rows with `owesMore`.
- **`loadEvents(locationCode)`**: the roster read becomes `selectIn('testing_roster', 'id, event_id, status, paid_cents, first_name, last_name, class_name', …)`, plus `selectIn('testing_registrations', 'id, event_id, private_date, private_time', 'event_id', ids)` and, for the private ids only, `selectIn('testing_results', 'registration_id, result', 'registration_id', privateIds)`. (The plan's L11 “add it to the existing roster read” is impossible because the view isn't changed — M1.) The answer gains **`privateTestings`**: `privateTestingsList(…)` of `{ registrationId, eventId, eventName, firstName, lastName, className, privateDate, privateTime, result }`.
- New calls (all through `callRpc`; ok shapes checked, else `'error'`):

| Function | Calls | Ok answer |
|---|---|---|
| `setPrivate({ registrationId, expectedVersion, privateDate, privateTime })` | `testing_set_private { p_registration_id, p_expected_version, p_private_date, p_private_time }` (time sent as `'HH:MM'`) | `{ status:'ok', version, privateDate, privateTime, amountDueCents, resultCleared }` |
| `clearPrivate({ registrationId, expectedVersion })` | `testing_clear_private { p_registration_id, p_expected_version }` | `{ status:'ok', version, amountDueCents }` |
| `addPrivateStudent({ eventId, firstName, lastName, eventRankId, stripes, payingBy, privateDate, privateTime })` | `testing_add_private_student { p_event_id, p_first, p_last, p_event_rank_id, p_stripes, p_paying_by, p_private_date, p_private_time }` | `{ status:'ok', id, reference, version, privateDate, privateTime, amountDueCents }` |
- `updateStudent` ok answer gains `amountDueCents` (`Number.isInteger(d.amount_due_cents) ? d.amount_due_cents : null`).
- `markPaid`, `changePayingBy`, `undoPayment`, `editPayment` unchanged (the database decides the amount).

### 4.3 `src/lib/mockTestingEvents.js` — same rules, same order, same statuses as §2
- Registrations get `private_date` / `private_time` (null). A saved store whose registrations lack them reads them as null and is **not** “damaged” (existing preview data is kept); new rows always carry both keys.
- `GRANTED.testing_registrations = [...REG_COLS, 'private_date', 'private_time']`; **`ROSTER_COLS` stays as it is** (a select of `private_date` from `testing_roster` fails like the database's “column does not exist”).
- `RPC_ARGS`: `testing_set_private: [ID('p_registration_id'), ['p_expected_version', 'int'], ['p_private_date', 'date'], ['p_private_time', 'time']]`, `testing_clear_private: [ID('p_registration_id'), ['p_expected_version', 'int']]`, `testing_add_private_student: [ID('p_event_id'), ['p_first', 'text'], ['p_last', 'text'], ID('p_event_rank_id'), ['p_stripes', 'bool'], ['p_paying_by', 'text'], ['p_private_date', 'date'], ['p_private_time', 'time']]`; `toDbType` learns `'time'` (`'HH:MM'` / `'HH:MM:SS'` → `'HH:MM:SS'`; anything else throws like a Postgres 22007). None is in `ADMIN_ONLY`. `testing_amount_due` and `testing_private_time_is_valid` go into `EVENT_RESTRICTED_RPC_NAMES`.
- Handlers: the three new ones (§2.4 order) and the nine changes of §2.5, with the mock's `today()` (so `__tkdPreview.setToday` rehearses before / on / after the testing day and the private day). Change log entries with the same action names and one batch id per call.

### 4.4 `src/lib/testing/checks.mjs` — new groups
- `eventRules`: `PRIVATE_TIME_CHOICES` (193, first / last), `privateTimeIsValid`, `privateDayLimit` (incl. Feb 29), `privateDayProblem`, `priceFor`, `amountDue` = **every row of §1.3's table M1–M14**, `privateMenu` truth table (incl. H1 staff / admin, note-only, private No show), `privateTestingsList` (withdrawn out, result out, note-only in, sort order, past day in).
- Mock replays of V3–V18 (no session cases), and: the mock's `amount_due_cents` equals `eventRules.amountDue` for every roster row after every step; a store without the new keys keeps its events.
- Ends with the existing `ALL TESTING LIB CHECKS PASSED`.

---

## 5. Staff screens (Builder C) — layout and wording exactly as P1–P9 + P3b

### 5.1 Route (`src/App.jsx`, C's piece of the shared file)
- `EVENT_HASH` becomes `/^#testing\/event\/([A-Za-z0-9-]{1,64})(?:\/(grading)|\/private\/([A-Za-z0-9-]{1,64}))?$/`.
- The route is `{ section, eventId, eventTab: 'students' | 'grading' | 'private', privateId }` (`privateId` = the registration id on the private page, else null). `addressForRoute(section, eventId, eventTab, privateId)` writes `#testing/event/<id>`, `…/grading` or **`#testing/event/<id>/private/<registrationId>`**. `routeIsUnknown` uses the new pattern.
- `navigate` options gain `privateId` (the `changed` test compares it too). New state + ref `privateId`, passed to `<Testing privateId=… onOpenPrivate=… onClosePrivate=…>`; they reach `EventPage` **and** `EventsTab` through Testing's `...tabProps` (Testing.jsx unchanged).
- `openPrivate(eventId, registrationId)` = `navigate('testing', eventId, { tab: 'private', privateId })` — a normal history step, **not** guarded (from the Events tab nothing is unsaved; from the event page the same EventPage stays mounted).
- `closePrivate()` = `guarded(() => navigate('testing', eventIdRef.current, { tab: 'students' }))` — the back link (always to the event, v0.228).
- `handlePopState`, same event: when the current tab is `'private'` and the route's tab or privateId differs, call the leave guard like a page change (put the current address back first, `proceed` applies the route); other same-event tab changes stay silent as today.

### 5.2 Component tree
```
EventPage                  owns: data (loadEvent), dialogs, banners, grading = useGradingSaves(testing-day rows),
│                                privateGrading = useGradingSaves(private page row), the leave guard
├─ (privateId set) PrivateGradingPage   props: event, school, classes, row, today, isAdmin, layout,
│                                       grading: privateGrading, onBack, onOpenNote, onPrint
│   └─ PrivateSheet (portal, class "grading-print") while printing
├─ Students panel          RosterRows (Private line, owed line, result tag), cards ("1 owes more")
└─ GradingTab              rows = active AND NOT private (counts, class switch, print too)
PrivateDialog              an EventPage dialog (type 'private', mode 'set' | 'change')
StudentDialog              Add (Tests privately) · Edit details (re-price warning) · view (private + payments)
```
- `gradingRows = active.filter((r) => !r.isPrivate)` sorted as today; `GradingSheet` gets the same rows.
- **`privateGrading`** = a second `useGradingSaves({ roster: privateRow ? [privateRow] : [], …, isReadOnly: !canChangeResults(gradingWindow(today, privateRow.privateDate), isAdmin) })` (same props otherwise). The leave guard and the `beforeunload` listener count **`grading.unsavedCount + privateGrading.unsavedCount`**; the leave dialog lists both engines' rows.
- **L8:** when a testing-day row that had a save in flight / unsaved comes back private (its save answered `not_open`, or it vanished from `gradingRows` because it is now private), the page banner says `movedToPrivate(name)` instead of `GRADING_NOT_OPEN`.
- On the private page the event header (Add student, Registration link, tabs, cards) is not shown and `N` does nothing.

### 5.3 Students tab (P1, P4, P9)
- **Private line** under the name (purple `Private` tag + `privateLine(privateDate, privateTime, rank.privateCents)` in 12px gray). PC: under the name. Tablet: full row width under the name (like the mockup's `.xrow`). Phone: right under the name and Registered line, before the belts.
- **Owed line** when `row.owesMore`: amber `ti-alert-triangle` + `owedLine(row.paidCents, row.amountDueCents)`, one line, never wraps mid-phrase (tablet full width; fits at 320).
- **Mark paid** shows when `showMarkPaid(row)` — also next to the **Paid** tag while owed (P4). Its toast is the existing `markedPaidToast(name, amountCents, method)` with Undo (the answer's amount: “Ava Chen marked paid · $20 cash”).
- **Result tag** next to the Private line once `row.result` is set (read-only tags `TAG_PASSED` / `TAG_NOT_PASSED` / `TAG_NO_SHOW`, P9). Note-only: no tag.
- **Cards:** private students count everywhere on this tab (Students, Paid / Not paid, class switch numbers). Under the Paid card, amber `owesMoreCount(event.owesMoreCount)` when > 0 (P4).
- Purple: `.ttag--private { background: #EEEDFE; color: #3C3489; border-color: #CECBF6; }` in `testing-events.css` (the mockup's values; not a token — tokens.css stays untouched; the orchestrator adds the §7 colour row).

### 5.4 The ⋯ menu (P2, P5)
Fixed order, dividers between groups (a divider never starts the menu):
1. Edit details · Change how they'll pay (when `canChangePayingBy(row)` — Q3) · Review possible duplicate
2. **private group** (`privateMenu`): `canSet` → **Set private testing** (`ti-calendar`); else `canChange` → **Change private day or time** (`ti-calendar`), `canBack` → **Back to the testing day (Fri, Nov 20)** (`ti-calendar-event`), `canGrade` → **Grade private testing** (`ti-school`)
3. admins, paid: Edit payment · Undo payment (both act on the most recent live payment — unchanged code path)
4. admins: Withdraw / Restore · Delete permanently
Phone: the same items in the bottom sheet. All staff see group 2 (Q3); Back is hidden for staff after the testing day (H1) and once a result exists.
- **Set / Change** open `PrivateDialog`. **Grade private testing** → `onOpenPrivate(eventId, row.id)`.
- **Back** (no dialog, one write): `clearPrivate`; ok → toast `backToTestingDayToast(name)` with **Undo** that calls `setPrivate` with the old day / time and **the version clearPrivate just returned** (review L12); reload.

### 5.5 `PrivateDialog.jsx` (P3) — on `Dialog.jsx`
- Title `SET_PRIVATE_TITLE` / `CHANGE_PRIVATE_TITLE`; subtitle `privateDialogSub(name, className, fromName, toName)`.
- **Day**: the browser's date field (`min` = today, `max` = `privateDayLimit`), `longDate(day)` written out under it once valid (v0.157). **Time**: a select of `PRIVATE_TIME_CHOICES` shown with `timeLabel`, placeholder `NO_TIME`. Change opens with the current day and time filled in.
- **Set only** (not Change): the price line `privatePriceChange(currentPriceCents, rank.privateCents)` (bold, current = `priceFor` without the private day) and the hint `privatePriceHint(rankName, privateCents)`; when already paid: `privatePaidMore(paidCents, due)` if due > 0, else `privatePaidEnough(paidCents)` instead of the hint's second sentence; then `privateStaysLine(firstName)`.
- **Clearing notice** (amber `Notice`, before Save): Set on a testing-day No show → `clearsNoShow(firstName, testingDate, hasNote)`; Change on a private No show → `clearsPrivateNoShow(firstName, privateDate, hasNote)`.
- Field problems (`privateDayProblem` / time): `missing` → `PICK_PRIVATE_DAY`, `past` → `PRIVATE_DAY_PAST` (amber field, as the P3 tablet frame), `tooFar` → `PRIVATE_DAY_TOO_FAR`; no time → `PICK_PRIVATE_TIME`. Save does nothing until fixed.
- No toast after Save (approved P3 proposal); the row's Private line is the confirmation; focus returns to the row's ⋯.
- Phone: full screen, back arrow, Save pinned at the bottom (v0.194). Unsaved typing: `UNSAVED` / `DISCARD_CHANGES` (v0.56), EventPage's `requestClose` pattern.

### 5.6 Add student with Tests privately (P3b)
- Under **Paying by**: a tick box (styled like the 3-stripes tick) `TESTS_PRIVATELY` with the gray hint `testsPrivatelyHint(testingDate)`. Off by default — the dialog is exactly today's.
- Ticked: Day, Time, price line + hint (as §5.5, indented under the tick, current price = the live “Testing for” fee by today) appear; then the existing `ADD_STUDENT_HINT`. Save → `addPrivateStudent` (unticked → `addStudent` as today). Ok → the same toast and behaviour as today's Add student.
- Phone: full screen, the section scrolls with the form, Save pinned at the bottom.

### 5.7 Edit details and the detail view
- Edit details of a **private** student whose belt changes: the fee sentence uses the private price (`feeNow(dollars(newPrivateCents))` / `feeStays(…)` when not paid). **Paid** private student moving to a pricier private price (new due > 0) → amber `Notice` `repriceLine(oldPrivateCents, newPrivateCents, newDue)` before saving (Q2); cheaper or equal → the existing `PAYMENT_STAYS`. Regular students: unchanged.
- View mode: a `DETAIL_PRIVATE` row with `privateLine(…)` for private students; the Payment row: owing → `paidDetailOwed(paidCents, method, paidOn, dueCents)`; two or more live payments → `paidDetailParts(totalCents, parts)`.

### 5.8 Payment dialogs (M7)
- **Edit payment** edits the most recent live payment (as today). With two or more live payments the subtitle is `editPaymentSubTopUp(name, parts, editingCents)` (“Ava Chen · $65 cash Nov 2 + $20 card Nov 12 — editing the $20”), so an admin can't turn the $20 into $85 by mistake.
- **Change how they'll pay** while owing: subtitle `changePayingBySubOwed(name, dueCents)`.
- **Delete permanently** with two or more live payments: `deleteStudentBody` names all of them (`paymentsList(parts)` in place of the single payment phrase).

### 5.9 `PrivateGradingPage.jsx` (P7, P9) and `PrivateSheet.jsx`
- Shown when `privateId` is set. Row missing or withdrawn → `PRIVATE_PAGE_GONE` + the back link; row not private any more → `notPrivateAnyMore(name)` + the back link.
- Top: back link `← <event name>` (`IconArrowLeft`, calls `onClosePrivate`), title `privatePageTitle(name)` (+ gray `TAG_NOT_PAID` when `!row.paid` — the v0.183 fact only, never amounts or “more to collect”), subtitle `privatePageSub(privateDate, privateTime, school)`, outline **Print** (`ti-printer`) right-aligned (own line on phones).
- Lock line (`ti-lock`), from `gradingWindow(today, row.privateDate)`: before → `privateGradingOpensLine(privateDate)`; after, staff → `PRIVATE_OVER_STAFF`; after, admin → `PRIVATE_OVER_ADMIN`; on the day none.
- Card: `DETAIL_EVENT` `eventOnDate(eventName, testingDate)` · `DETAIL_PRIVATE_DAY` `longDate(privateDate)` · `DETAIL_TIME` `timeLabel(privateTime)` · `DETAIL_CLASS` class name · `DETAIL_TESTING_FOR` (TestingForCell) · then `COL_RESULT`: `ResultButtons` + the note button (as G1/G2; 44 px on touch; phone: one column, buttons full width, note button on the Result line) — before the day: buttons disabled, note button hidden; staff after: the read-only tag + `resultNoteLine(note)`, no note button. The note shows in 12px gray under the buttons.
- Saves: `privateGrading.chooseResult` / `saveNote`, Not saved tag + page banner + 10-second auto-retry + `online` retry (v0.188, v0.192, review L9), exactly as the Grading tab. Answers `finished` → `TOO_LATE_RESULTS`, `not_open` → `GRADING_NOT_OPEN`, others as CONTRACT-0010 §4.3.
- **Print**: `PrivateSheet` (portal, class `grading-print`, so the existing `@media print` rule applies; letter size, black on white): `privateSheetTitle(eventName)`, `privateSheetHeader(privateDate, privateTime, school, printedAt)`, the table `SHEET_COL_STUDENT` · `COL_TESTING_FOR` · `SHEET_COL_RESULT` · `SHEET_COL_NOTE` with one row (name · “Yellow → Orange” as text · three empty tick boxes · a note line), footer `privateSheetFooter(firstName)`. **Never** payments, Not paid, the recorded result or the note.

### 5.10 Events tab — `PrivateTestingsList.jsx` (P8)
- Above the Upcoming / Past switch, for staff and admins (staff line stays above it, as P8 tablet). **Not shown** when `privateTestings` is empty, while loading, or on a load error.
- Heading `privateTestingsHeading(n)`. PC / tablet: table `COL_DAY` · `COL_TIME` · `COL_STUDENT` · `COL_CLASS` · `COL_EVENT` · an outline small **Open** button (`aria-label` `openPrivateLabel(name)`): `weekdayMonthDay(day)`, `timeLabel(time)`, name, class, event name. Phone: stacked rows — name (500) / `privateListPhoneLine(day, time, className)` / event name, Open on the right. No Private tag on these rows. Open → `onOpenPrivate(eventId, registrationId)`.
- Same 15-second refresh as the list (v0.157).

### 5.11 Status → message
| Call (where) | ok | Refusals |
|---|---|---|
| `setPrivate` (PrivateDialog, Set / Change) | close, reload, no toast | `past_day` → field `PRIVATE_DAY_PAST` · `invalid` → dialog note `INVALID_DIALOG` · `has_result` → blocking note `PRIVATE_HAS_RESULT` + reload · `graded` → blocking note `PRIVATE_GRADED` + reload · `stale` / `not_found` → `STALE_DIALOG` (blocking) + reload · `withdrawn` → close, banner `isWithdrawn(name)`, reload · `no_access` → `onNoAccess()` · `error` → note `SAVE_FAILED`, stays open |
| `clearPrivate` (⋯ Back) | toast `backToTestingDayToast(name)` + Undo, reload | `graded` → banner `PRIVATE_BACK_GRADED` + reload · `not_allowed` → banner `PRIVATE_BACK_ADMIN_ONLY`, `onRefreshProfile()`, reload · `stale` / `not_found` → `ROSTER_STALE` + reload · `withdrawn` → `isWithdrawn(name)` · `no_access` → `onNoAccess()` · `error` → row Not saved banner `backFailed(name)` with Retry |
| Back toast **Undo** (`setPrivate`) | — (runUndo as today) | `past_day` → banner `UNDO_PRIVATE_PAST` · `stale` / `has_result` / `graded` → `UNDO_STALE` + reload · `error` → `UNDO_FAILED` with Retry |
| `addPrivateStudent` (Add student) | as `addStudent` today | `past_day` → field `PRIVATE_DAY_PAST` · `finished` → `EVENT_FINISHED_ADD` (as today) · others as `addStudent` today |
| `markPaid` (top-up) | toast with the answer's amount | as today (`already_paid` → `alreadyPaid(name)` + reload) |
| `updateStudent` | as today | as today |
| `setResult` / `setResultNote` (private page) | as Grading | `finished` → `TOO_LATE_RESULTS` · `not_open` → `GRADING_NOT_OPEN` · others as CONTRACT-0010 §4.3 / §4.5 |
`PRIVATE_HAS_RESULT` and `PRIVATE_GRADED` join EventPage's `BLOCKING_NOTES`.

### 5.12 Wording (`src/screens/testing/text.js`) — exactly these strings
From the approved mockups (P1–P9, P3b) and rulebook v0.254:

| Constant | Wording |
|---|---|
| `TAG_PRIVATE` | Private |
| `privateLine(dateIso, hhmm, cents)` | Tue, Dec 1 · 4:00 PM · $85 (`weekdayMonthDay` · `timeLabel` · `dollars`) |
| `owedLine(paidCents, dueCents)` | Paid $65 · $20 more to collect |
| `owesMoreCount(n)` | 1 owes more |
| `SET_PRIVATE` / `SET_PRIVATE_TITLE` | Set private testing |
| `CHANGE_PRIVATE` / `CHANGE_PRIVATE_TITLE` | Change private day or time |
| `backToTestingDay(dateIso)` | Back to the testing day (Fri, Nov 20) |
| `GRADE_PRIVATE` | Grade private testing |
| `privateDialogSub(name, className, from, to)` | Ava Chen · Group A · Yellow → Orange |
| `PRIVATE_DAY` / `PRIVATE_TIME` | Day / Time |
| `privatePriceChange(fromCents, toCents)` | $65 → $85 private price |
| `privatePriceHint(rankName, cents)` | The private price for Yellow in Classes and ranks. Mark paid charges $85. |
| `privatePaidMore(paidCents, dueCents)` | Paid $65 · $20 more to collect after saving |
| `clearsNoShow(first, dateIso, false)` | Ava was marked No show on the testing day (Fri, Nov 20). Setting a private testing clears that result. The change is logged. |
| `PRIVATE_DAY_PAST` | The private day can’t be in the past. |
| `TESTS_PRIVATELY` | Tests privately |
| `testsPrivatelyHint(dateIso)` | Can’t make the testing day, Fri, Nov 20. |
| `backToTestingDayToast(name)` | Ava Chen back to the testing day |
| `privatePageTitle(name)` | Private testing · Ava Chen |
| `privatePageSub(dateIso, hhmm, school)` | Tue, Dec 1, 2026 · 4:00 PM · Worcester school |
| `PRINT` | Print |
| `DETAIL_EVENT` / `DETAIL_PRIVATE_DAY` / `DETAIL_TIME` / `DETAIL_CLASS` | Event / Private day / Time / Class |
| `eventOnDate(name, dateIso)` | November Children Testing · Fri, Nov 20, 2026 |
| `privateGradingOpensLine(dateIso)` | Grading opens on the private testing day, Tuesday, December 1. (`longWeekdayMonthDay`) |
| `PRIVATE_OVER_STAFF` | The private testing day is over. Only an admin can change the result or note now. |
| `PRIVATE_OVER_ADMIN` | The private testing day is over. Staff can’t change the result now; as an admin, you can. |
| `privateSheetTitle(eventName)` | November Children Testing — private testing |
| `privateSheetHeader(dateIso, hhmm, school, printedAt)` | Tue, Dec 1, 2026 · 4:00 PM · Worcester school · printed Mon, Nov 30, 3:05 PM |
| `privateSheetFooter(first)` | Type the result into Ava’s private testing page the same day. |
| `privateTestingsHeading(n)` | Private testings · 2 |
| `COL_DAY` / `COL_TIME` / `COL_CLASS` / `OPEN` | Day / Time / Class / Open |
| `privateListPhoneLine(dateIso, hhmm, className)` | Tue, Dec 1 · 4:00 PM · Group A |
| `repriceLine(fromCents, toCents, dueCents)` | Price $85 → $95 · $10 more to collect (v0.254) |
| `editPaymentSubTopUp(name, parts, editingCents)` | Ava Chen · $65 cash Nov 2 + $20 card Nov 12 — editing the $20 (plan M7) |
| existing, reused | `markedPaidToast`, `TAG_PAID`, `TAG_NOT_PAID`, `MARK_PAID`, `TAG_PASSED` / `TAG_NOT_PASSED` / `TAG_NO_SHOW`, `resultNoteLine`, `longDate`, `timeLabel`, `NO_TIME`, `SHEET_COL_*`, `COL_TESTING_FOR`, `COL_STUDENT`, `COL_EVENT`, `COL_RESULT`, `DETAIL_TESTING_FOR`, `UNSAVED`, `DISCARD_CHANGES`, `STALE_DIALOG`, `ROSTER_STALE`, `INVALID_DIALOG`, `SAVE_FAILED`, `isWithdrawn`, `alreadyPaid`, `EVENT_FINISHED_ADD`, `TOO_LATE_RESULTS`, `GRADING_NOT_OPEN`, `UNDO_STALE`, `UNDO_FAILED`, `ADD_STUDENT_HINT`, `feeNow`, `feeStays`, `PAYMENT_STAYS` |

**Adapted from the mockup** (the app never assumes a student's gender — the mockup's “On her day she is graded on her own page”): `privateStaysLine(first)` “Ava stays in this event. On their day they’re graded on their own page, not on the Grading tab.” (§10 point 2).

**Not in the mockups — written by C to the same pattern, marked `// CP1` in text.js, shown to Jeffrey at the CP1 walkthrough** (no decision needed before building):
`owesMoreCount` plural “2 owe more” · `PICK_PRIVATE_DAY` “Enter the private day.” · `PICK_PRIVATE_TIME` “Choose a time.” · `PRIVATE_DAY_TOO_FAR` “Pick a day within a year of the testing day.” · `privatePaidEnough(paidCents)` “Already paid $85. Nothing more to collect.” · `clearsNoShow(…, true)` “… Setting a private testing clears the No show and its note. The change is logged.” (review L6) · `clearsPrivateNoShow(first, dateIso, hasNote)` “Ava was marked No show at the private testing (Tue, Dec 1). Saving a new day clears that result. The change is logged.” (with a note: “… clears the No show and its note. …”) · `PRIVATE_HAS_RESULT` “This student already has a result or note from the testing day, so they can’t be set private. An admin can clear it on the Grading tab first.” · `PRIVATE_GRADED` “This private testing is already graded, so the day can’t change. An admin can clear the result on the private testing page first.” · `PRIVATE_BACK_GRADED` “This private testing is already graded, so they can’t go back to the testing day.” · `PRIVATE_BACK_ADMIN_ONLY` “The testing day is over. Only an admin can send a student back to the testing day now.” · `backFailed(name)` “Ava Chen wasn’t moved back to the testing day. Check the connection and try again.” · `UNDO_PRIVATE_PAST` “Couldn’t undo: that private day has passed. Use ⋯ → Set private testing to pick a new day.” · `movedToPrivate(name)` “Ava Chen now tests privately, so this result wasn’t saved here. Grade them on their private testing page.” · `PRIVATE_PAGE_GONE` “This private testing isn’t in this event any more.” · `notPrivateAnyMore(name)` “Ava Chen tests on the testing day again. Grade them on the Grading tab.” · `openPrivateLabel(name)` “Open Ava Chen’s private testing” (screen readers) · `DETAIL_PRIVATE` “Private testing” · `paidDetailOwed(…)` “$65 cash · paid Nov 2 · $20 more to collect” · `paidDetailParts(total, parts)` “$85 · $65 cash Nov 2 + $20 cash Nov 12” · `changePayingBySubOwed(name, due)` “Ava Chen · $20 more to collect” · `paymentsList(parts)` (Delete permanently) “the 2 payments ($65 cash Nov 2, $20 cash Nov 12)” · `privatePriceChange` when the two prices are equal: “$85 private price”.
**Apostrophes:** every new string uses the typographic ’ (existing strings are not changed).

### 5.13 Icons and CSS
- Icons (`@tabler/icons-react`): `IconCalendar` (Set / Change), `IconCalendarEvent` (Back), `IconSchool` (Grade private testing), `IconPrinter`, `IconLock`, `IconAlertTriangle` (owed line), `IconArrowLeft` (back link). The rulebook's icon map rows came with v0.254.
- All new styles in `src/styles/testing-events.css` (`.ttag--private`, the private / owed lines, the private page, the list). Touch targets ≥ 44 px; no horizontal scroll at 320 px.

---

## 6. Checks before calling a builder done
- `npm run build` and `npm run build:preview-mode` pass.
- `node src/lib/testing/checks.mjs` prints `ALL TESTING LIB CHECKS PASSED` (B, and C after its changes).
- PGlite: `cd supabase/tests/pglite && npm ci && node run.mjs` — every step passes, **0 failed**, step 14 and the moved 13g included (A).
- Grep `dist/`: no `__tkdPreview`, `mockTestingEvents`, `setToday`, `failSavesUntilRetry`; no `service_role`, no secrets.
- `git status` never lists `.env.local`, `node_modules`, `dist`, `dist-preview`. Line endings unchanged (CRLF), checked with `file` before and after. Every new file has its header comment.
- Each builder's summary lists every file touched (shared files called out).

## 7. Reviews (orchestrator)
- **Security review of A + B together:** grants (the two columns, the three functions, the helpers granted to nobody), nothing to `anon` / `testing_registrar`; the check order of §2.4; every replaced function differs from its live body **only** by the `-- 0014:` lines (diff them); H1 / H2 / H3 / M3; `update_student`'s answer unchanged for regular students; the money rule = mock = `eventRules.amountDue` (M1–M14); no $0 payment; the down-script order; the view untouched; no preview code in production.
- **Design review of C** against P1–P9 + P3b and the rulebook, screenshots at **1280×800, 820×1180 touch, 390×844 touch, 320 wide**, in preview with `setToday` (before / on / after the testing day and the private day) and `setRole` staff / admin: both ways in (⋯ and Tests privately), the past-day error, the top-up (owed line, Mark paid next to Paid, “1 owes more”, Undo), Change how they'll pay while owed, Edit payment subtitle after a top-up, Back + its Undo (staff after the testing day: Back hidden), a testing-day No show set private, a private No show changed, Grading tab without private students (counts, print), the private page before / on / after (staff and admin), Not saved → auto-retry → gone, the leave question from the private page, its Print preview, the Events list (empty → hidden; past ungraded stays; Open → back link to the event); keyboard-only and a screen reader pass on the menu, the dialog and the private page.
- Fix round, then re-review. Then CP1 (plan §5).

## 8. Before building starts
1. Jeffrey OKs this contract and **§10 point 1 (the migration number)**.
2. Re-check the number on **every** branch and worktree (`git ls-tree --name-only <branch> supabase/migrations/` for each branch in `git branch`, plus `ls .claude/worktrees/*/supabase/migrations/` for uncommitted files).
3. Rulebook: phase 4 rows exist (v0.225–v0.228, v0.254). The prospect branch already used **v0.255** — the next rulebook row is numbered after scanning all branches. The §7 purple colour row and any CP1 wording are recorded afterwards by the orchestrator.

## 9. Changes made after the first draft
(none yet — the orchestrator records them here, with the review rounds)

## 10. Open points

1. ~~**Migration number (blocking).**~~ **Resolved 2026-10-19: 0014** — 0012 is the prospect branch’s (`0012_prospects.sql`, commit ea0600f), 0013 the camps branch’s. Every phase 4 name in this contract uses 0014.
2. **Mockup wording that assumes gender.** P3's “Ava stays in this event. On her day she is graded on her own page, not on the Grading tab.” — the app can't know a student's gender. **Default:** “Ava stays in this event. On their day they’re graded on their own page, not on the Grading tab.” (the app already uses “they / their”, e.g. “Change how they’ll pay”).
3. **A $0 price** (private price $0, or a regular rank priced $0). The money rule says due 0 = nothing to collect, so the database answers `already_paid` and inserts nothing (live 0005 answered `invalid` for a $0 regular price — a small behaviour change). **Default:** the row keeps the gray **Not paid** tag (net is 0), **Mark paid is hidden** (`showMarkPaid` needs due > 0), counts unchanged. Alternative: show it as Paid / “No fee” (a new UI state, not drawn).
4. **First Set private on a student with a testing-day note only.** Plan §1.3 says `has_result`; this contract follows it. Edge it creates: a private student with a note only can go Back (Q5), and then can't be set private again until someone clears the note — which before the testing day nobody can (grading not open). **Default:** keep the plan (rare; an admin clears the note on the testing day). Alternative: allow it and keep the note, like Change.
5. **A private No show that has a note.** Change clears the **whole row** (result and note), the same as the testing-day case (L6), and the dialog says so. **Default:** as written. Alternative: clear only the No show and keep the note.
6. **Where the down-script lives.** Written as SETUP §15e (three steps: re-run 0005, re-run 0010, the SQL block) like 0010's §14e, not as a separate `.sql` file — a down file next to the migrations could be pasted by mistake, and run.mjs tests the documented text. Between step 1 and step 2 the grading locks are briefly the phase 2 ones (seconds, with the app already rolled back). **Default:** as written.
7. **`testing_clear_private` on a student who is not private** answers ok and writes nothing (no new status invented). **Default:** as written.
8. **The plan's review L11** (“add the private columns to the existing roster read on the Events tab”) can't work with the view unchanged (M1); `loadEvents` makes one extra `testing_registrations` read and a results read for private students only (§4.2). Information only.
9. **A edits one line outside SETUP §15** (the warning at the top of §14e, §3.5) so nobody removes 0010 while 0014 exists. Information only.
10. **Not in the mockups, shown at CP1** (no decision needed before building): the `// CP1` wordings in §5.12; no toast after Set / Change (approved) but a toast with Undo after Back; the Change dialog without the price and “stays” lines; the private page's “gone” / “not private any more” states; the leave question also covering the private page.
