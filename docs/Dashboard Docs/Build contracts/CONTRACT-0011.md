# Contract 0011 — Finance: Daily report, close the day, History, Export, reminder settings

**Status:** **OK'd by Jeffrey 2026-10-18 (CP0, rulebook v0.216).** Written with the build plan; **security review applied** the same day (4 must-fix + 5 should-fix: closing-items snapshot for Changed after closing, every middle day of a moved chain, chains built from whole histories, refunds vs the drawer [Q1], fingerprint stale check, closings guard + lock mode, CSV quoting and formula guard, stronger privacy tests, payment-detail rules). **all plan questions answered 2026-10-18** (Q1 refunds v0.209; Q2 hide-payments switch v0.215 — switch, chip, Finance + Home hiding in this build, Testing rosters right after; Q3 reminder times seeded Off; Q4 defaults approved). The **[Qn]** marks below are kept only as pointers.

The single source of truth for three builders: **A database**, **B data layer + preview mock**, **C screens**. Follow it exactly so the parts fit. If something here is impossible or contradicts the sources below, **stop and report it** — do not improvise.

| Source (in this order of authority) | |
|---|---|
| This contract | wins for this build |
| Build plan `docs/Finance/TKD-Finance-Build-Plan.md` (its §6 answers override §0–5) | draft |
| Status file `docs/Finance/TKD-Finance-Status.md` (Q1–Q11, screen pass D1–D14) | |
| Approved mockups `docs/Finance/TKD-Finance-DailyReport-Mockups.html` (D1–D14) — wording and layout source | approved 2026-10-18 (v0.207) |
| Rulebook 10b v0.193–v0.203, v0.207, v0.208 | |
| Handoff §6 (security rules, non-negotiable) | |
| Existing code: migrations 0001–0006 (live — **never edit**), CONTRACT-0005, `src/` | |

**Working copy:** the Finance worktree, branch `finance` (after step 0: `main` merged in). Do not touch Supabase, Cloudflare, git remotes, other worktrees or the main folder. Do not commit; the orchestrator commits.
**Audience:** Jeffrey is learning IT. Every new file starts with a header comment (what + why); plain-English comments on non-obvious lines; readable over clever. Keep each file's line endings (CRLF in this repo).

---

## 0. File ownership (no two builders edit the same file)

| Builder | Owns | Must not edit |
|---|---|---|
| **A — database** | `supabase/migrations/0011_finance.sql` · `supabase/tests/0011_tests.sql` · `supabase/tests/0011_fingerprints.sql` · `supabase/tests/pglite/*` (**shared with other branches** — add 0006 if missing + 0011, sample payments on both sources; change only what Finance needs) · `supabase/SETUP.md` (new section only) | 0001–0006, `src/`, `docs/` |
| **B — data layer + mock** | `src/lib/finance/financeApi.js` · `src/lib/finance/financeRules.js` · `src/lib/finance/csv.js` · `src/lib/finance/deviceFinance.js` (the two per-device browser settings, §4) · `src/lib/finance/checks.mjs` · `src/lib/mockFinance.js` · `src/lib/mockClient.js` (route `finance_*` only — **shared file**, add only what Finance needs) | screens, styles, `supabase/` |
| **C — screens** | `src/screens/Finance.jsx` · `src/screens/finance/*` (incl. `text.js`) · `src/styles/finance.css` · **shared files, only what Finance needs:** `src/components/navItems.js` (Finance item) · `src/App.jsx` (routes) · `src/screens/Home.jsx` (reminder lines) · `src/components/AccountMenu.jsx` (Hide payments switch) · `src/components/TopBar.jsx` (Payments hidden chip) · `src/components/BottomBar.jsx` only if Finance must go under More · `README.md` | files owned by A and B |
| Orchestrator | this contract, rulebook, status, docs, commits | |

B returns **codes, never words**; C owns all wording (from the mockups).

---

## 1. Database — `0011_finance.sql`

### 1.1 General rules (as 0005 §1.1)
- Schema `public`, tables `finance_*`, owner `postgres`. **One transaction**, **safe to re-run**, header comment like 0005's.
- Every function: `set search_path = ''`, fully qualified names, `revoke execute … from public, anon, authenticated, service_role`, then grants only as §1.6. All app-called functions `security definer`, `returns jsonb`, check order: `has_data_access()` → role → argument shape → lock + look up → stale → write. `tkd.action` / `tkd.batch_id` set around writes and reset.
- **No table, view or sequence grants to `authenticated`** (reads go through functions).
- **Today** = `public.testing_today()` (America/New_York). **Now in school time** = `(now() at time zone 'America/New_York')`.
- Logging: the 0003 `change_log_write` trigger on every new table (each has `id uuid` and `location_code`; `finance_settings.location_code` is null). `testing_refuse_truncate` on every new table.
- **Lock order** for writes: the school's `locations` row **`for no key update`** (same mode as 0005's `testing_lock_registration`, so Color Belt payment writes for that school wait for a close) → closings of that (school, day). Payments are only read; Finance never takes 0005 / 0006 row locks, so no deadlock is possible. Star writes don't lock `locations`, so a Star payment can commit during a close — the closing-items snapshot (§1.2) catches that afterwards.
- Statuses: `ok, no_access, not_allowed, not_found, stale, invalid` plus `note_required, nothing_to_close, already_closed, not_closed, too_late`.
- Outputs **never** contain a date of birth, email, signature, login id (`recorded_by`), or any 0005 / 0006 column not named in §1.4.

### 1.2 Tables
**`finance_day_closings`** (append-only — UPDATE / DELETE refused by trigger)
| Column | Rule |
|---|---|
| `id uuid pk default gen_random_uuid()` | |
| `location_code text not null` | FK → locations(code) |
| `day date not null` | ≤ today when written |
| `kind text not null` | `close` · `undo` (the closer within 10 s) · `reopen` (admin) |
| `reverses_closing_id uuid null unique` | FK → this table; required for `undo` / `reopen` (the `close` it ends), null for `close` |
| `cash_counted_cents, checks_counted, checks_counted_cents, card_counted_cents integer null` | required for `close`, null otherwise; ≥ 0 (cash may be negative down to −10 000 000 only when expected cash < 0, v0.209); ≤ 10 000 000; checks ≤ 500 |
| `expected_count, expected_cash_cents, expected_checks, expected_checks_cents, expected_card_cents integer null` | the server's figures at closing time (snapshot), `close` only |
| `note text null` | ≤ 500, trimmed; required on `close` when any of the three parts is short or over |
| `recorded_at timestamptz not null default now()` · `recorded_by uuid null` (never returned) · `recorded_by_name text not null` | |
A (school, day) is **closed** when it has a `close` row with no `undo` / `reopen` pointing at it (at most one such row — the guard below makes sure).
**Guard trigger on insert:** `undo` / `reopen` must point at a `close` of the **same school and day** that isn't already ended, and carry null counts / expected / note; a `close` is refused while the day is already closed (backstop behind the function's own check).

**`finance_day_closing_items`** (append-only, written in the same transaction as each `close`): `id uuid pk`, `closing_id` FK → closings, `location_code`, `source` (`color_belt` | `star`), `chain_id uuid` (the chain's first row), `row_id uuid` (the row shown), `kind`, `method`, `amount_cents`. It is the **snapshot of what was counted**, so later changes of any kind — new payments, undos, edits, **deleted students or events** (cascades leave no rows to compare), a **Star candidate's school changed** (their payments move schools), a payment hidden by a late mis-click undo, or a Star payment that committed during the close — show up as a difference.

**`finance_settings`** — exactly one row (`id uuid` fixed value, check), `location_code text null` (always null, for the log trigger), `reminder_on boolean not null default false`, `version integer not null default 1`, `updated_at`, `updated_by_name`.
**`finance_reminder_times`** — `id uuid pk`, `location_code` FK, `weekday smallint` 1–7 (ISO: 1 = Monday), `remind_at time null` (null = Off; minutes in 15-minute steps, 11:00–23:00), unique (location_code, weekday); seeded **Off** for both schools **[Q3]**. Changes bump `finance_settings.version`.
**`finance_exports`** — `id uuid pk`, `location_code`, `from_day`, `to_day`, `row_count`, `downloaded_at`, `downloaded_by uuid` (never returned), `downloaded_by_name`. Insert-only.

### 1.3 The money rows (helper, no grants): `finance_money_rows(p_location_code text, p_from date, p_to date)`
Internal set-returning helper (**not** security definer — only definer functions call it; execute granted to nobody). **Chains are built from all rows of every registration / candidate that has any row in range or any chain touching the range — never from rows filtered by `paid_on` first** (an undo is dated the day it is made, so an Oct 1 payment undone on Oct 20 must still show as undone on Oct 1 and in an Oct 1–15 export). Filtering by school and shown day happens **after** the chains are built. One output row per **displayed item**:

| Field | Meaning |
|---|---|
| `source` | `color_belt` · `star` |
| `payment_id` | the **first** row of the chain (stable id for the detail view) |
| `school` | Color Belt: event's `location_code`; Star: candidate's `location_code` |
| `day` | the date it shows on (see rules) |
| `time` | `recorded_at` of the row shown, school time |
| `first_name, last_name` | registration / candidate |
| `what, event_date, is_private` | `color_belt` / `star`, the event's testing date; Star private: `star_candidates.private_on` not null |
| `kind` | `payment` · `refund` (Star only) |
| `method, amount_cents` | of the row shown (refunds negative) |
| `state` | `counted` · `undone` · `edited` · `moved_out` · `moved_in` · `hidden` |
| `was_amount_cents, was_method` | for `edited` / `moved_in`: the chain's first row |
| `moved_to, moved_from` | dates, for `moved_out` / `moved_in` |
| `changed_by_name, changed_on` | who / which school date made the last correction |
| `recorded_by_name` | of the row shown |

**Chain rules** (same for both sources, mirrored exactly by `financeRules.js` and tested with one shared case table):
1. A chain starts at a `payment` or `refund` row that is **not** the new row of an edit.
2. **Edit** = a `reversal` R of row X **and** a `payment` N for the same registration / candidate with `N.recorded_at = R.recorded_at` **and** `N.recorded_by = R.recorded_by` (both written in one transaction by `testing_edit_payment` / `star_edit_payment`). The chain continues at N. A method-only edit is an edit like any other.
3. A `reversal` without such an N ends the chain as **undone**. (Reversals never point at reversals — 0005 / 0006 guards. Star refunds can't be edited; a refund's reversal makes the refund **undone**.)
4. Final state: chain ends at a live row F (not reversed) → if F is the first row: `counted` on F.paid_on; else `edited` on F.paid_on (shown as `moved_in` when F.paid_on ≠ first.paid_on). **Every other distinct `paid_on` in the chain** (the first row's and any middle edit's) gets a `moved_out` item ("Moved to <F.paid_on>"), so no day loses an item silently. Chain ends undone → `undone` on first.paid_on, and every other distinct `paid_on` of the chain gets an `undone` item too; **but** the whole chain is `hidden` when it has no edit, R.recorded_by = first.recorded_by and R.recorded_at − first.recorded_at ≤ 10 s (hidden items are dropped from every output).
5. Only `counted`, `edited` and `moved_in` items add to totals. Items of withdrawn or deleted students follow their rows (a deleted student's rows no longer exist; a withdrawn one's still count — money taken is money taken).

### 1.4 Functions (S = staff and admin, A = admin only)

| Function | Role | Does | Ok answer |
|---|---|---|---|
| `finance_day(p_location_code text, p_day date)` | S (staff: `p_day` must be today, else `not_allowed`) | `p_day` > today → `invalid`; unknown school → `not_found` | `{status, day, school, totals:{count, total_cents, cash:{count,cents}, check:{count,cents}, card:{count,cents}}, items:[§1.3 fields minus school], closing: null \| {id, kind, by_name, at, counted…, expected…, note, results:{cash, checks, card} (each 'matches' \| 'short' \| 'over' + diff_cents), changed_after: bool, changed_count}, can_close: bool, can_undo_until: timestamptz \| null}` — `can_undo_until` only for the closer |
| `finance_day_both(p_day date)` | S (same day rule) | | `{status, day, schools:[{code, name, count, total_cents, cash_cents, check_cents, card_cents, closed: bool}], total_cents, count}` (switcher order: Worcester, Shrewsbury) |
| `finance_history(p_location_code text null, p_month date)` | A | every day of the month up to today, newest first; null school = both, with `school` per row | `{status, month, unclosed_count, days:[{day, school, total_cents, count, tag, closed_by_name, closed_at}]}`, `tag` ∈ `today_open, changed_after_closing, short, over, not_closed, closed, no_payments` (priority in that order; short / over carry `diff_cents` of the largest) |
| `finance_payment_detail(p_source text, p_payment_id uuid)` | S (staff: only if some shown, non-hidden item of the chain is on today; else `not_allowed`) | `p_payment_id` must be a chain's first row, else `not_found` | `{status, item:{…§1.3}, event_name, history:[{at, by_name, what: 'recorded' \| 'edited' \| 'undone' \| 'refunded', amount_cents, method, paid_on}]}`. Honest limit (documented): the history can show an earlier day's amount to staff; staff can already read payments on the Testing rosters, so the today-only rule keeps the **report** today-only, it doesn't secure older payments. |
| `finance_home()` | S | reminders for **today**, per school: payments today (counted > 0), not closed, `reminder_on`, today's weekday time not Off and school time ≥ it | `{status, today:[school codes needing a reminder], earlier: null \| {count, first_day}}` — `earlier` for admins only: days in the last 30 (not today) with payments and not closed, both schools |
| `finance_close_day(p_location_code, p_day, p_expected_fingerprint text, p_cash_cents int, p_checks_count int, p_checks_cents int, p_card_cents int, p_note text)` | S (staff: today only) | locks the school row; recompute; fingerprint differs → `stale`; nothing counted → `nothing_to_close`; already closed → `already_closed`; any part short / over and note empty → `note_required` (with `results`); writes `close` with the expected snapshot **and** its `finance_day_closing_items` | `{status, closing_id, results}` |
| `finance_undo_close(p_closing_id uuid)` | S: only `recorded_by = auth.uid()` and `recorded_at > now() − 10 s`, else `too_late`; already ended → `stale` | writes `undo` | `{status}` |
| `finance_reopen_day(p_location_code, p_day, p_expected_closing_id uuid)` | A | not closed → `not_closed`; latest close ≠ expected → `stale` | `{status}` |
| `finance_export(p_location_code text, p_from date, p_to date)` | A | `p_from ≤ p_to ≤ today`, range ≤ 366 days **[Q4]**, else `invalid`; one school only (Both is not exportable — Export is hidden on Both, v0.207); writes one `finance_exports` row | `{status, school, from, to, rows:[{day, school, time, first_name, last_name, what, event_date, kind, method, amount_cents, counted_cents, recorded_by_name, state, note}]}` — `state` ∈ counted / undone / edited / moved_out / moved_in; `counted_cents` = amount when it adds to the total, else 0 (so summing that column is always right); `note` e.g. "was $70.00 check" |
| `finance_settings_get()` | A | | `{status, reminder_on, version, times:[{school, weekday, remind_at \| null}]}` |
| `finance_set_reminder_on(p_on bool, p_expected_version int)` | A | | `{status, version}` |
| `finance_set_reminder_time(p_location_code, p_weekday smallint, p_time time null, p_expected_version int)` | A | 15-minute step, 11:00–23:00, else `invalid` | `{status, version}` |
| `finance_copy_monday(p_expected_version int)` | A | each school's Monday → Tue–Fri | `{status, version}` |

**Expected values** (for `close` and the results): cash = sum of counted cash items; checks = number of counted check **payments** and their sum; card = sum of counted card items. Results: `matches` when equal to the cent, else `short` (counted < expected) or `over`.
**Refunds and the drawer (decided v0.209):** cash expected = counted cash **payments** − counted cash **refunds** (may be negative); checks expected = counted check **payments** only (number and sum — a check refund is the school's own check, never in the drawer); card = counted card payments. When cash expected < 0 the screen asks “Cash taken out of the drawer” (a positive number) and sends it as a negative `p_cash_cents`; the function then accepts a negative cash count (≥ −10 000 000), otherwise counts are ≥ 0. A day with only refunds is closable; `nothing_to_close` only when there is no counted item at all. `finance_day` also returns `refunds:{count, cents, cash_cents, check_cents}` and `totals` gain `in_cents` (payments) and `net_cents` (payments + refunds); card / cash / check card values per layout are computed in `financeRules.js` (`cardsFor(totals, layout)`), never in the database. The layout switch is a browser setting (`tkd.device.refundLayout` = `own` \| `in`, default `own`), no database part.

**Fingerprint:** `finance_day` returns `fingerprint` = md5 of the sorted shown items' `row_id|amount_cents|method|state`. `finance_close_day` takes `p_expected_fingerprint text` (replacing count + total) and answers `stale` when it differs — so a method-only edit between loading and closing is caught.

**Changed after closing** (`closing.changed_after`, History tag): the day is closed and **the counted items now differ from `finance_day_closing_items`** (an item added, removed, or with a different amount / method / school), **or** today's expected values differ from the close's `expected_*`. `changed_count` = number of differing items. The `recorded_at > close` test is used **only** for the `added_after_closing: true` label (counted / moved_in items whose chain has no row before the close).

### 1.5 Hide-payments switch (v0.215) — parts in this build (Q2, approved)
No database part. Stored per device in the browser (`tkd.device.hidePayments` = `true` / absent). In this build: the account-menu switch, the top-bar **Payments hidden** chip, hiding the Finance item and the Home reminder link. Hiding the **Testing roster** payment parts touches the Color Belt and Star sessions' files and is done with them right after (they read the same browser setting).

### 1.6 Grants
RLS on every new table (no policies needed: no app access); `revoke all` on tables / sequences from public, anon, authenticated, service_role. Execute on each §1.4 function to `authenticated` only; `finance_money_rows` (plain, not definer) and other helpers to nobody. Tables: `finance_day_closings`, `finance_day_closing_items`, `finance_settings`, `finance_reminder_times`, `finance_exports` — all logged, all truncate-guarded, the closings / items / exports append-only.

---

## 2. Database tests — `0011_tests.sql` + PGlite (prints `ALL 0011 TESTS PASSED`; runs before and after sample data)
1. Role gates for every function (anon none; authenticated only §1.4; staff vs admin; staff another day → `not_allowed`); locked / PIN-locked / signed-out / magic-link / 8-day sessions → `no_access`.
2. Chain rules on **both** sources: plain, undone, hidden (same person ≤ 10 s; other person or > 10 s → undone), edited once / twice, method-only edit, edited to another date (moved_out + moved_in), **edited across three dates (middle day gets moved_out)**, **moved then undone (both days show undone)**, undo after edit, Star refund and undo of a refund, school of a Star item = candidate's school, private Star line; **range building: payment Oct 1 undone Oct 20 → undone on the Oct 1 report and in an Oct 1–15 export**.
3. Totals and expected values by method; withdrawn students still count.
4. Close: matches / short / over to the cent, `note_required`, `nothing_to_close` (incl. a day with only undone payments **[Q4]**), `stale` (a payment added, and a **method-only edit**, between load and close), `already_closed`, double click; expected snapshot + closing items stored; guard refuses an undo / reopen for another school or day and a second open close.
5. Undo close: closer < 10 s ok; ≥ 10 s or another login → `too_late`; reopen admins only, `not_closed`, `stale`; close again after reopen.
6. Changed after closing on a closed day caused by: a later payment, an undo on a later day, an edit, **a deleted student and a deleted event** (Color Belt and Star), **a Star candidate's school changed**, a late mis-click undo; plus Added after closing labels.
7. Reminder: weekday times, Off, `reminder_on` false, minute boundary (7:29:59 vs 7:30:00 PM New York), no payments → no reminder, closed → none, admin `earlier` count over 30 days.
8. History tags and priority; month boundaries; Both rows.
9. Export: range rules, one log row per call, staff refused, rows match `finance_day`.
10. **Privacy:** (a) seeded DOB and email on paid Star candidates (active and withdrawn) never appear in any function's answer; (b) catalog: no `finance_%` function body (`pg_proc.prosrc`) mentions `date_of_birth`, `email_for_results`, `signature`, or the whole words `recorded_by`, `downloaded_by`, `withdrawn_by`, `created_by`, `updated_by` (the `*_name` columns are fine); (c) every key in every answer is on an allowed list written in the test.
11. Catalog: RLS on all new tables, search_path on all functions, security definer only where listed, no grants to anon / PUBLIC, owners = table owner, append-only guard, fingerprints file.

## 3. Data layer + mock (Builder B)
- `financeRules.js` (pure, node-importable): `compareCount(expected, counted)` → `{result, diffCents}`; `chainItems(rows)` (the §1.3 rules over raw rows — used by the mock; `checks.mjs` runs the same case table as the SQL tests); `toCsv(rows)`: RFC 4180 quoting (cells with a comma, quote or line break are wrapped in quotes, quotes doubled), CRLF line ends, and the formula guard **on text cells only** (names, event names, notes, recorded-by: a leading `=`, `+`, `-`, `@`, tab or carriage return gets a leading `'`); amount cells stay plain numbers like `-35.00` (names come from the public family form, so they are untrusted); `schoolNow(date)`, `isReminderDue(times, now, …)`.
- `financeApi.js`: one function per §1.4 function (camelCase in / out); statuses passed through as codes.
- `mockFinance.js`: every §1.4 function with the same rules and statuses, reading the Color Belt preview store (`tkd.preview.testing`) and its own sample Star rows (incl. a cash refund, a check refund, a refund-only day, one edit, one 10-second undo); its own store key `tkd.preview.finance` for closings / settings / exports. Console helpers on `window.__tkdPreview`: `setToday`, `setNow('HH:MM')`, `failNextSave`, `setRole`, `resetFinance`.

## 4. Screens (Builder C) — exactly D1–D14 and the approved proposals (v0.207)
- `#finance` (Daily report), `#finance/history`, `#finance/settings` (admins only; staff → `#finance`). Rail item last, `ti-report-money`; phones: under More.
- Reload on location change, unlock, tab visible again, and after every write (like the event page, v0.157 pattern); `stale` → amber "Someone else changed this just now" + reload.
- Close the day: gray until all three counts are filled; Expected line under each; results update as staff type (client-side preview with `compareCount`; the server decides on Save); `note_required` → D2; failure → D13 (error inside the box, "Retry close the day"); success → D3 toast "Today's drawer is closed." with Undo until `can_undo_until`.
- Print: print stylesheet producing D8 (portrait letter, header repeated on page 2).
- Export: dialog D7; `toCsv`; file name `<School>-<from>-to-<to>.csv`.
- Home: reminder lines from `finance_home()` (D10), whole line a link ≥ 44px on touch; on Both one line per school.
- **Refund layout switch (v0.209):** “Refunds: Own group | In groups” segmented control next to Print (phones: under ⋯), shown only on days with refunds; stored per device via `deviceFinance.getRefundLayout()` / `setRefundLayout('own' | 'in')`, default `own`. Own group: Refunds group at the end, cards = money in, Total = net “after $X refunds”. In groups: refunds inside Cash / Check with a gray Refund tag, cards net. Print and Export follow the layout on screen. Close the day is the same in both: cash expected = cash in − cash refunded, with the breakdown in the Expected line; when expected cash < 0 the cash field label is “Cash taken out of the drawer”.
- **Hide-payments switch (v0.215):** account menu, under This device: “Hide payments” switch (`ti-currency-dollar-off`), anyone signed in, stored per device via `deviceFinance.getHidePayments()` / `setHidePayments(bool)` (also fires a `tkd:hide-payments` window event so open screens update). While on: no Finance item in the rail / More, `#finance*` addresses go to Home, Home reminder lines show without a link, and the top bar shows a gray “Payments hidden” chip (button; tapping turns it off; 44px tap area on touch). The Testing rosters read the same setting later (not in this build).
- All wording from the mockups; any state they don't show gets wording marked for Jeffrey's CP1 walkthrough.

## 5. Checks before a builder is done
`npm run build` and `npm run build:preview-mode` pass · `node src/lib/finance/checks.mjs` passes · PGlite passes (both runs) · no secrets, no `service_role`, no preview code in `dist/` · line endings unchanged · header comments on every new file.

## 6. Reviews (orchestrator)
Security review of A + B (role gates, staff-today rule, no DOB / email in outputs, append-only, grants) and design review of C against D1–D14 at 1280×800, 820×1180 touch, 390×844 touch, 320 wide; fix; re-review.
