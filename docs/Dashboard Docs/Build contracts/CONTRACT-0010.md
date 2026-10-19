# Contract 0010 — Color Belt testing phase 3: the Grading tab

The single source of truth for the three parallel builders: **A database**, **B data layer + preview mock**, **C staff screens**. Follow it exactly so the parts fit. It implements the approved build plan; it does not re-decide it. If something here is impossible or contradicts the sources below, **stop and report it** — do not improvise.

| Source (in this order of authority) | |
|---|---|
| This contract | wins for phase 3 |
| Build plan `docs/Testing/Color Belt Testing/TKD-Testing-Phase3-Build-Plan.md` — **§6 answers and §8 review changes override §0–5** | OK'd by Jeffrey 2026-10-18 (CP0) |
| Approved mockups (wording and layout source): `docs/Testing/Color Belt Testing/TKD-ColorBelt-Grading-Mockups.html` (G1–G8), images `Phase 3 images/ColorBelt-grading-G1…G8.png`, `ColorBelt-plan-Q1-add-after-day.png` option A, `ColorBelt-contract-P1-add-button.png` option A and `ColorBelt-contract-P3-leave-unsaved.png` option B | approved 2026-10-18 (v0.190, v0.191, v0.192) |
| Rulebook `docs/Dashboard Docs/TKD-Dashboard-Design-Guidelines.md` — 10b rows v0.180–v0.192 ("Color Belt phase 3 …"; **v0.192** = Jeffrey's answers to this contract's open points: staff don't see Add student on a finished event, unsaved results retry by themselves, leaving with unsaved results asks first), §2.4, §2.5, §3.5, §4, §5, §8 | |
| Handoff `docs/Dashboard Docs/TKD-Dashboard-Handoff.md` §6 (security rules, non-negotiable) | |
| Existing code: migrations 0001–0005 (**live in production — never edit their SQL**; the only allowed 0005 change is the header comment in §1.9), CONTRACT-0005, `src/` | |

**Working copy:** the Color Belt phase 3 worktree `.claude/worktrees/zen-allen-e41a06`, branch `color-belt-phase3`. Do not touch Supabase (no connector calls), Cloudflare, git remotes, other worktrees or the main folder. Do not commit; the orchestrator commits.
**Audience:** Jeffrey is learning IT — every new file starts with a header comment (what + why); short plain-English comments on non-obvious lines; readable over clever. Files keep the line endings of their neighbours (CRLF in this repo — check before and after with `file`).
**Production facts:** Supabase project `tkd-dashboard` (ref `eozkfbdfxqlcbpewhach`), PostgreSQL 17, Free plan. Live: 0001–0005 (Color Belt phase 2 is live and in use). Migration numbers claimed on other branches: 0006 Star · 0007 Schedule · 0008 Calendar · 0009 Forms → this one is **0010**. Staff: Main Admin (admin), Staff (shared desk, role staff). A push to `main` deploys.

**Words used below.** *Graded* = a `testing_results` row exists for the registration (a result **or** a note). *Before / on / after the testing day* = `testing_today()` (America/New_York) `<` / `=` / `>` the event's `testing_date`. *Admin* = `is_admin()` (always after `has_data_access()` was checked). *Active* = registration `status = 'active'`.

---

## 0. File ownership (no two builders edit the same file)

| Builder | Owns (creates / edits) | Must not edit |
|---|---|---|
| **A — database** | new `supabase/migrations/0010_testing_results.sql` · new `supabase/tests/0010_tests.sql` · new `supabase/tests/0010_fingerprints.sql` · `supabase/tests/pglite/run.mjs` (new step 12 only, §2.2) · `supabase/SETUP.md` (new §13 only) · `supabase/migrations/0005_testing_events.sql` (**header comment only**, §1.9 — no SQL statement changes) · `supabase/tests/0005_tests.sql` **only if** a 0005 test fails after 0010 because it tests replaced behaviour (each change listed in A's summary). None is expected: e.g. 0005_tests.sql T7 expects `testing_update_student` to answer exactly `{status:'ok', version:2}`, which is why `result_cleared` is only added when it is true (§1.6) | `src/`, `docs/`, migrations 0001–0004, every other test file |
| **B — data layer + mock** | `src/lib/testing/eventsApi.js` · new `src/lib/testing/gradingRules.js` · `src/lib/mockTestingEvents.js` · `src/lib/mockClient.js` (**shared file** — only the two helpers of §3.4) · `src/lib/testing/checks.mjs` (add groups) | `src/screens/**`, `src/components/**`, `src/styles/**`, `src/App.jsx`, `supabase/` |
| **C — staff screens** | `src/screens/testing/event/EventPage.jsx` · new `src/screens/testing/event/GradingTab.jsx` · new `ResultButtons.jsx` · new `useGradingSaves.js` · new `NoteDialog.jsx` · new `GradingSheet.jsx` (all in `src/screens/testing/event/`) · `src/screens/testing/event/StudentDialog.jsx` · `src/screens/testing/event/RosterRows.jsx` (the "Added … (admin)" line) · `src/screens/testing/events/EventsTab.jsx` + `EventDialog.jsx` (Delete event wording, `has_results`) · `src/screens/testing/text.js` · `src/styles/testing-events.css` (the event page's styles live here, incl. the existing `@media print` block) · `src/App.jsx` (**shared file** — the event route and the leave guard only, §4.1 and §4.9) | files owned by A and B; `src/screens/Testing.jsx`, `src/components/**`, `src/styles/tokens.css`, `src/styles/testing.css`, `navItems.js` (none needs a change — if one seems to, stop and report) |
| Orchestrator | this contract, rulebook, status file, handoff, `docs/*`, commits | |

B returns codes, never words; C owns all wording. C imports B's modules by the exact names in §3.
**Shared files touched** (CLAUDE.md list): `src/App.jsx` (C), `src/lib/mockClient.js` (B). Not touched: `src/screens/Testing.jsx`, `src/styles/tokens.css`, `navItems.js`, `README.md`, `docs/README.md`. Merge watch: `run.mjs` and `SETUP.md` are also edited by other branches' migrations — if `main` already has a SETUP §13 at merge time, ours is renumbered then.

---

## 1. Database — `0010_testing_results.sql` (Builder A)

### 1.1 General rules (same as 0005 §1.1 — repeated because they are non-negotiable)
- Schema `public`; owner `postgres` (same owner as the 0005 tables — tested). **One transaction** (`begin; … commit;`), header comment in 0005's style (what / why / what it adds / how to run / "Supabase will warn about destructive operations…" / words used / statuses).
- **Re-runnable:** `create table if not exists`, `create or replace function`, `drop trigger if exists` + `create trigger`, `drop policy if exists` + `create policy`, `revoke all` then grants. Applying 0010 twice changes no row and no fingerprint (tested, §2.2).
- **No existing function changes its arguments or its name** (the live phase 2 site keeps working between "0010 applied" and "phase 3 deployed"). Replaced functions are `create or replace` of 0005's body **copied exactly**, with only the lines this contract adds; their revoke/grant lines are repeated unchanged.
- Every function: `set search_path = ''`, fully qualified names, no argument defaults, explicit `revoke execute … from public, anon, authenticated, service_role`, then grants only as listed in §1.7.
- Staff write functions: `security definer`, `volatile`, `returns jsonb` `{status: …}`, the whole body inside 0005's `begin … exception … end` block with 0005's mapping (`unique_violation` → `stale`; `foreign_key_violation`, `check_violation`, `not_null_violation` → `invalid`; `deadlock_detected`, `serialization_failure`, `lock_not_available` → `stale`). Tag writes with `tkd.action` + `tkd.batch_id` and clear both before returning.
- **Lock order** as 0005: school (`locations`) → event → registration → its result row. The new functions use 0005's `public.testing_lock_registration(uuid)` (school and event `for no key update`, registration `for update`) and then read the event's `testing_date` **after** that call (so it lines up with `testing_update_event`, which locks the same event row `for update`).
- **"Today"** is only ever `public.testing_today()`.
- **Connector words:** `0010_fingerprints.sql` (and any read-only check Claude runs through the Supabase connector) must not contain the words the connector refuses; spell names in pieces as `0005_fingerprints.sql` does. The migration and `0010_tests.sql` are pasted by Jeffrey in the SQL Editor (as 0005 and 0005_tests are), so they may contain them (see §9 point 2).

### 1.2 New table `public.testing_results`

| Column | Type | Rule |
|---|---|---|
| `registration_id` | `uuid not null` | primary key (`testing_results_pkey`); FK `testing_results_registration_fk` → `testing_registrations(id)` **on delete cascade**; never changes (trigger, §1.3) |
| `result` | `text null` | check `testing_results_result_check`: `result is null or result in ('pass', 'not_passed', 'no_show')` |
| `note` | `text null` | check `testing_results_note_check`: `note is null or (public.testing_line_is_valid(note, 200) and note = public.testing_normalize_name(note))` |
| `updated_at` | `timestamptz not null default now()` | stamped by trigger |
| `updated_by` | `uuid null` | login id, no FK (as 0003/0005); stamped by trigger; **never granted to any client role** |
| `updated_by_name` | `text not null` | stamped by trigger (`public.change_log_actor_name()`) |

- Check `testing_results_not_empty_check`: `num_nonnulls(result, note) > 0` — a row exists only while a result or a note is set; clearing both **deletes** the row (done by the functions).
- **The note is one line.** It reuses 0005's existing helpers: tidied with `testing_normalize_name` (runs of spaces, tabs and line breaks become one space, ends trimmed) and checked with `testing_line_is_valid(…, 200)` (1–200 characters, no invisible control or format characters). Blank after tidying = no note. (0005's multi-line note helpers can't be reused: `testing_note_is_valid` is fixed at 600.)
- Why a separate table: a grader's tap never changes `testing_registrations.version`, so the desk's Mark paid / Edit details never go `stale` because of grading (v0.187 needs no version).
- `comment on table` / `comment on column updated_by` in 0005's style.

### 1.3 Its triggers (written like 0005 §9)
- **`testing_results_before_write()`** — `before insert or update`, plain (not security definer), `set search_path = ''`:
  - insert: `updated_at := now()`, `updated_by := auth.uid()`, `updated_by_name := public.change_log_actor_name()`.
  - update: if `new.registration_id is distinct from old.registration_id` → raise `errcode '23514'`, `constraint 'testing_results_immutable'`, message "the registration of a result can't change". Then, if `result` or `note` changed → stamp as on insert; else keep the old stamps (an update that changes nothing leaves the row as it was).
  - Trigger name `testing_results_before_write`.
- **`testing_results_log()`** — `after insert or update or delete`, **security definer**, written like 0005's `testing_registrations_log` (same diff-of-changed-keys logic, "nothing visible changed → no row") but: `record_id := registration_id` (so a student's history joins straight to their result), `location_code := null`, `table_name = tg_table_name` (`testing_results`), `action = coalesce(nullif(current_setting('tkd.action', true), ''), 'manual')`, `batch_id` from `tkd.batch_id`, `actor_id = auth.uid()`, `actor_name = public.change_log_actor_name()`, `session_id = public.current_session_id()`. Nothing is left out of `before` / `after` (the table holds nothing sensitive besides the login id, which is the log's own `actor_id` anyway — keep `updated_by` in the JSON exactly as `testing_registrations_log` keeps `updated_by`). Trigger name `testing_results_log`.
- **`testing_results_no_truncate`** — `before truncate … for each statement execute function public.testing_refuse_truncate()` (0003's).
- Cascades (a registration or event removed) delete result rows and log them under the caller's `tkd.action` (`delete_student` / `delete_event`) — no extra code.

### 1.4 Security rules
- `alter table public.testing_results enable row level security;`
- `revoke all on table public.testing_results from public, anon, authenticated, service_role;`
- `grant select (registration_id, result, note, updated_at, updated_by_name) on public.testing_results to authenticated;` — **not** `updated_by`. No insert / update / delete / truncate / references / trigger for anyone. Nothing to `anon`, nothing to `testing_registrar`.
- Policy `testing_results_select_with_access` `on public.testing_results for select to authenticated using ((select public.has_data_access()));`
- The trigger functions: execute revoked from everyone, granted to nobody.

### 1.5 New staff functions (S = staff and admins)

**`testing_set_result(p_registration_id uuid, p_result text) returns jsonb`** — S. `p_result` null = clear the result.
**`testing_set_result_note(p_registration_id uuid, p_note text) returns jsonb`** — S. `p_note` null or blank after tidying = clear the note.

Check order (exactly):
1. `has_data_access()` not true → `{status:'no_access'}`
2. input: `p_registration_id` null → `invalid`; set_result: `p_result` not null and not in the three values → `invalid`; set_result_note: `v_note := nullif(public.testing_normalize_name(p_note), '')` (null or blank = clear); `v_note` not null and not `public.testing_line_is_valid(v_note, 200)` → `invalid`; `v_note` is the value stored
3. `v_r := public.testing_lock_registration(p_registration_id)`; `v_r.id is null` → `not_found`
4. `v_r.status = 'withdrawn'` → `withdrawn`
5. date rule — read `testing_date` from `public.testing_events` where `id = v_r.event_id` (after step 3's lock): `testing_today() < testing_date` → `not_open` (admins too); `testing_today() > testing_date` and `is_admin()` not true → `finished`; otherwise allowed (staff and admins on the day, admins after it)
6. lock the result row: `select … from public.testing_results where registration_id = … for update`
7. write with `tkd.action` = `set_result` / `set_result_note` and a new `tkd.batch_id`:
   - the wanted pair = (new result, current note) or (current result, new note)
   - wanted pair equals the current one (or both null and no row) → write nothing
   - both null → `delete` the row
   - row exists → `update` only the changed column
   - no row → `insert` (no `on conflict`: the registration lock already serialises writers)
8. clear `tkd.action` / `tkd.batch_id`; return
   `{status:'ok', result, note, updated_at, updated_by_name}` — the values now stored (all four `null` when no row remains).

No expected-version argument: **last change wins** (v0.187). Statuses: `ok, no_access, invalid, not_found, withdrawn, not_open, finished, stale`.

### 1.6 Replaced functions (same arguments, same body + exactly these changes)

| Function | Change |
|---|---|
| `testing_update_student(p_registration_id, p_expected_version, p_first, p_last, p_event_rank_id)` | After the existing "rank belongs to this event" check and before the write: `v_rank_changed := p_event_rank_id is distinct from v_r.event_rank_id`; lock the result row `for update` and set `v_graded` (row exists); read the event's `testing_date`. If `v_rank_changed and v_graded and testing_today() > testing_date and is_admin() is not true` → `{status:'not_allowed'}` (nothing written). Write as today (`tkd.action = 'update_student'`); then, if `v_rank_changed and v_graded`: `set_config('tkd.action', 'clear_result', true)` (same `tkd.batch_id`) and delete the result row. Ok answer: unchanged `{status:'ok', version}` **unless** a result was cleared, then `{status:'ok', version, result_cleared: true}` — the key is **only present when true** (0005_tests.sql T7 compares the whole answer with `{status:'ok', version:2}`). Name-only edits never touch the result. (The class follows the belt, so "belt or class changes" = `event_rank_id` changes.) |
| `testing_resolve_duplicate(p_keep_id, p_keep_version, p_other_id, p_other_version, p_keep_both)` | 0005 only does `perform 1 … for no key update` on the event, so add, right after that lock: `select e.testing_date into v_testing_date from public.testing_events e where e.id = v_event_id;` (new variable). After the existing stale / still-a-pair checks, before the write: if `p_keep_both` is false **and** a `testing_results` row exists for `p_other_id` (its registration is already locked by this function) **and** `testing_today() > v_testing_date` **and** `is_admin()` is not true → `not_allowed`. Keep both is unchanged. (Closes "rename a graded student → possible duplicate → keep one".) |
| `testing_restore_student(p_registration_id, p_expected_version)` | The staff branch (own "keep one" < 10 s) additionally requires **not** (graded **and** `testing_today() > testing_date`); otherwise staff → `not_allowed`. `testing_date` is read after `testing_lock_registration`. Admins unchanged. Restore brings the kept result back (the row was never removed). |
| `testing_add_student(p_event_id, p_first, p_last, p_event_rank_id, p_stripes, p_paying_by)` | `if testing_event_state(v_e, testing_today()) = 'finished' then return finished` becomes `… = 'finished' and public.is_admin() is not true then return finished` (v0.191: admins may add after the testing day; staff still get `finished`). Everything else unchanged (`source 'staff'`, `tkd.action 'add_student'`, duplicate check, `created_by_name` = the admin). |
| `testing_update_event(p_event_id, p_expected_version, p_name, p_testing_date, p_classes, p_auto_close_on, p_note)` | Right after the existing `stale` check (step 5) and before the other date rules: if `p_testing_date is distinct from v_e.testing_date` and any `testing_results` row belongs to a registration of this event (active or withdrawn) → `{status:'has_results'}`. New status. |

**Untouched** (same body, same fingerprints as 0005): `testing_withdraw_student` (already admin-only), `testing_delete_student`, `testing_delete_event`, `testing_mark_paid`, all payment functions, `testing_set_registration`, `testing_add_event`, the public functions, all helpers, the roster view. Accepted small risk (plan §1.3): a result recorded in the seconds between opening a delete warning and confirming it is deleted without being named.

### 1.7 Grants
`testing_set_result(uuid, text)` and `testing_set_result_note(uuid, text)`: revoke from `public, anon, authenticated, service_role`, grant execute to `authenticated` only. Replaced functions: the same revoke + grant lines as 0005. `testing_results_before_write()` and `testing_results_log()`: revoke from everyone, no grant.

### 1.8 Header facts the migration must state
- What it adds (table, 2 functions, 2 trigger functions, 3 triggers, 5 replaced functions, new status `has_results`, and the `result_cleared: true` key that update_student adds only when it cleared a result).
- Statuses: 0005's set plus `has_results`.
- **Re-running 0005 after 0010 puts back the phase 2 versions of the five replaced functions (without the grading locks).** After 0010 exists, re-run 0005 only together with 0010 right after it.
- The down-script lives in SETUP §13e (not in this file).

### 1.9 The warning added to 0005's header (comment only)
In 0005's header, after the existing "NOTE: re-running 0003 AFTER this file…" paragraph, add (CRLF, same style):
`--   NOTE: migration 0010 (Color Belt grading) REPLACES five functions of this file (testing_update_student, testing_resolve_duplicate, testing_restore_student, testing_add_student, testing_update_event). Re-running THIS file after 0010 would put back the versions without the grading locks: if you ever re-run it, run 0010 again straight after it (supabase/SETUP.md section 13).` (wrapped to the file's line width). No other byte of 0005 changes; its function fingerprints stay the same.

### 1.10 Down-script (SETUP §13e, used only with Jeffrey's OK)
One transaction: put the app back to a version without Grading first; then `drop table public.testing_results` (its triggers go with it), `drop function` the two new functions and the two trigger functions, `commit`; then re-run the **whole 0005 file** to put back the phase 2 versions of the five replaced functions (and repeat 0005 §12i step 1 if the family-form off switch is in force, since re-running 0005 grants it back). `change_log` keeps every result row's history. Tested in PGlite by A: afterwards `0005_fingerprints.sql` equals a database that never had 0010, and `0005_tests.sql` passes.

---

## 2. Database tests (Builder A)

### 2.1 `supabase/tests/0010_tests.sql`
0005_tests style: one `do` block inside `begin; … rollback;`, the same pretend sessions (A1 admin unlocked · A2 locked · A3 5 wrong PINs · A4 signed out · A5 password 8 days old · A6 magic link · D1 desk unlocked · D2 desk locked · D3 desk magic link · anon) with `<paste-admin-UID-here>` / `<paste-desk-UID-here>`, its own `zz test …` class + events (so it runs before and after real events exist), `TEST FAILED: Rn …` messages, last line `select 'ALL 0010 TESTS PASSED' as result;`. Events for the date rule are made with `testing_add_event` and then moved as `postgres` (`update testing_events set testing_date = …`, as 0005 T6g does): **E_before** = today + 1, **E_day** = today, **E_after** = today − 1.

| # | Proves |
|---|---|
| R1 | **Catalog:** table exists, RLS on, the one select policy with `has_data_access()`; column rights exactly the 5 columns to `authenticated`, nothing on `updated_by`; no table right for `public, anon, authenticated, service_role, testing_registrar`; the two functions `security definer`, `search_path=""`, no defaults, owner = owner of `testing_events`, executable by `authenticated` only (not anon, not service_role, not registrar, not PUBLIC); the two trigger functions executable by nobody; the five replaced functions keep 0005's grants, `security definer`, `search_path`; triggers `testing_results_before_write`, `testing_results_log`, `testing_results_no_truncate` attached; the three checks + FK with `on delete cascade` present |
| R2 | **Locked sessions (0002 style):** A2, A3, A4, A5, A6, D2, D3 see **0 rows** of `testing_results` (a row exists) and get `no_access` from both functions; `anon` gets permission denied on the table and both functions; registrar refused (catalog, as 0005 T2) |
| R3 | **Date rule**, staff (D1) and admin (A1), both functions: E_before → `not_open` (both); E_day → `ok` (both); E_after → `finished` (D1), `ok` (A1) |
| R4 | **Values:** each of `pass`, `not_passed`, `no_show` stored and returned; same value again → `ok`, no new change_log row; `null` clears (row deleted when no note); result + note, then clear result → row stays with the note; then clear note → row deleted; `'passed'` → `invalid`; null id → `invalid`; unknown id → `not_found`; withdrawn registration → `withdrawn` |
| R5 | **Note:** 200 characters ok; 201 → `invalid`; `'   '` → cleared; `'a\n\n b'` stored as `'a b'`; a zero-width character → `invalid`; `'é'` counts as 1 |
| R6 | **Last change wins:** D1 sets pass, A1 sets no_show → no_show stored; `testing_registrations.version` and `testing_events.version` unchanged by any result write |
| R7 | **History:** change_log rows with `table_name 'testing_results'`, `record_id` = registration id, actions `set_result` / `set_result_note`, ops insert / update / delete, `actor_name` = the session's name; `updated_by_name` stamped; `has_column_privilege('authenticated', 'public.testing_results', 'updated_by', 'SELECT')` false |
| R8 | **Table hygiene** (as postgres): insert with both null → check violation; bad result → check violation; 201-char note → check violation; update `registration_id` → refused (`testing_results_immutable`); truncate → refused |
| R9 | **update_student:** on E_day, D1 changes a graded student's belt → `ok` with `result_cleared: true`, row gone, change_log has `update_student` + `clear_result` rows with the same `batch_id`; name-only change of a graded student → exactly `{status:'ok', version}` (**no** `result_cleared` key), result kept; E_after: D1 belt change of a graded student → `not_allowed`, nothing changed; D1 name-only → `ok`; D1 belt change of an ungraded student → `ok`; A1 belt change of a graded student → `ok`, cleared |
| R10 | **resolve_duplicate (rename path):** E_after, graded student renamed to match another → possible duplicate; D1 keep-one withdrawing the graded one → `not_allowed`; D1 keep-one withdrawing the ungraded one → `ok`; D1 keep-both → `ok`; A1 keep-one withdrawing a graded one → `ok`, the result row stays on the withdrawn student. On E_day D1 keep-one of a graded copy → `ok` |
| R11 | **restore_student:** staff 10-second Undo of their own keep-one: graded + E_after → `not_allowed`; ungraded → `ok`; A1 restore of a graded withdrawn student → `ok` and the result reads again |
| R12 | **withdraw** (A1) keeps the result row; set_result on it → `withdrawn` |
| R13 | **add_student:** E_after, D1 → `finished`; A1 → `ok` (`source 'staff'`, `created_by_name` = the admin's name); A1 then set_result on that student → `ok` |
| R14 | **update_event:** E_day with one result: date change → `has_results`, event unchanged; same date + new name → `ok`; after the result is cleared, date change → `ok` |
| R15 | **Cascades:** A1 delete_student of a graded student → result row gone, change_log delete row with action `delete_student`; A1 delete_event of an event with results → no result rows left, logged `delete_event` |
| R16 | change_log never contains `data:image` (unchanged 0005 rule, re-checked after R1–R15) |

### 2.2 `run.mjs` — new step 12 (after step 11, on the main AND the upgrade database)
Header list gets a step 12 paragraph. Steps:
a. apply `0010_testing_results.sql` on the main database (which already has 0005 and the seeded test event) → `0010_tests.sql` must print `ALL 0010 TESTS PASSED`.
b. re-run the **test files only** — never the 0005 SQL itself: `0005_tests.sql`, `0003_tests.sql`, `0004_tests.sql`, `0002_tests.sql`, `verify_pin_tests.sql` — all must pass after 0010.
c. registrar live checks (11b) again, plus two more refusals: `read testing_results`, `call testing_set_result`.
d. write one result + note for the seeded desk student (as postgres with `tkd.actor_label`, like 11c), so the re-run below has data.
e. fingerprints (`0010_fingerprints.sql`) + an md5 snapshot of `testing_results` and `change_log` count; apply 0010 a **second time**; snapshot and fingerprints identical; `0010_tests.sql` and `0005_tests.sql` pass again.
f. upgrade database: apply 0010 on top of its 0005; its `0010_fingerprints.sql` must equal the main database's (fresh = upgrade); `0010_tests.sql` and `0005_tests.sql` pass there.
g. (A's own check, not in the runner) the down-script of §1.10 on a throwaway copy.
Print the 0010 fingerprints like the others.

### 2.3 `supabase/tests/0010_fingerprints.sql`
Read-only single SELECT in 0005_fingerprints' format (`kind, item, detail`): `function` rows for `testing_set_result`, `testing_set_result_note`, `testing_results_before_write`, `testing_results_log` and the five replaced functions; `table` row for `testing_results` (RLS + exact rights, table-wide and per column); `trigger` rows for its three triggers; a `constraint` row per check / FK (name + `pg_get_constraintdef`). Connector-safe (§1.1).

### 2.4 SETUP §13 (Builder A, in §12's style)
Inserted **right after §12i** (before the "Admin: change the front-desk PIN or password" section).
**13. Migration 0010: Color Belt grading** — what it does (plain English); the order: CP2 database → CP3 real check → CP4 deploy; 13a apply (SQL Editor, the destructive-operations warning explained); 13b read-only checks (Claude: `0010_fingerprints.sql` = PGlite; `0005_fingerprints.sql` now differs **only** in the five replaced functions — expected; security advisor: the only new expected notice is "security definer function executable by authenticated" for the two new functions); 13c tests (`0010_tests.sql`, then 0005/0004/0003/0002/PIN again); 13d CP3 real check (plan §5 step 5: TEST event dated today, two students, grade, note, clear, print; a second TEST event moved to yesterday by edit for the admin after-day rule — note that its date can't move once it has results, so move it **before** grading; delete both; Claude checks the history read-only); 13e the down-script (§1.10) and the 0005 re-run warning.

---

## 3. Data layer and preview mock (Builder B)

### 3.1 `src/lib/testing/gradingRules.js` (new, pure, node-importable — no supabase import)
| Export | Does |
|---|---|
| `RESULTS = ['pass', 'not_passed', 'no_show']` | |
| `GRADING_NOTE_MAX = 200` | |
| `normalizeGradingNote(text)` | `normalizeName(text)` from `names.js`; `''` → `null` |
| `gradingNoteProblem(text)` | `null` (fine, including blank = clear) · `'badCharacter'` · `'tooLong'` (> 200 code points after tidying) — same rule as the DB check |
| `gradingWindow(today, testingDate)` | `'before'` · `'day'` · `'after'` (ISO date strings) |
| `canChangeResults(window, isAdmin)` | `window === 'day' \|\| (window === 'after' && isAdmin)` |
| `isGraded(row)` | `row.result !== null \|\| row.note !== null` |
| `resultCounts(rows)` | `{ total, pass, notPassed, noShow, notRecorded }` over the rows given (C passes active rows with on-screen values); this object is what `allClassesLine(c)` / `resultCountLine(c)` take |
| `schoolMinutesNow(now = new Date())` | minutes since midnight in America/New_York |
| `defaultGradingClassId(classes, minutes)` | `startTime` / `endTime` are `'HH:MM'` text — convert with `eventRules.timeToMinutes` before comparing with `minutes`. Classes in switch order (`position`): the first whose `start ≤ minutes < end`; else the one with the smallest `startTime > now` (ties → switch order); else the first class; `null` when no classes |
| `addedAfterDay(row, testingDate)` | `{ date, byName }` when `row.source === 'staff'` and the school date of `row.registeredAt` is after `testingDate` (only admins can do that, v0.191), else `null`. `date` = that school date, `byName` = `row.createdByName` |

### 3.2 `src/lib/testing/eventsApi.js`
- `EVENT_STATUSES` adds `'has_results'` (so `callRpc` accepts it).
- `RESULT_COLUMNS = 'registration_id, result, note, updated_at, updated_by_name'` (never `updated_by`, never `*`).
- **`loadEvent(eventId)`**: one more chunked read, `selectIn('testing_results', RESULT_COLUMNS, 'registration_id', regIds)`, together with ranks and payments. Every roster row gains:
  `result` (`'pass' | 'not_passed' | 'no_show' | null`), `note` (string | null), `resultAt` (timestamp | null), `resultByName` (string | null), `graded` (boolean), `addedAfterDay` (`{date, byName} | null`, from `gradingRules.addedAfterDay(row, event.testingDate)`).
  `event` gains `resultCount` = roster rows (any status) with `graded` true. The answer gains **`startedAt: Date.now()`, taken when the call starts** (before any request), so C can tell whether a load began after a save answered (§4.3). Same 15-second refresh (nothing changes in `useLiveLoad`).
- **`setResult({ registrationId, result })`** → `testing_set_result({ p_registration_id, p_result })`.
- **`setResultNote({ registrationId, note })`** → `testing_set_result_note({ p_registration_id, p_note })` (B sends the text as typed; the DB tidies).
  Both ok answers → `{ status:'ok', result, note, resultAt, resultByName }` (shape checked: result null or in `RESULTS`; note / timestamps / name null or string; else `'error'`). Other statuses passed through as codes: `no_access, invalid, not_found, withdrawn, not_open, finished, stale, error`.
- **`loadResult(registrationId)`** → `{ status:'ok', graded, result, note, resultAt, resultByName }` (one `eq` read of `testing_results` + the access check, as `loadEvent`) — used by Edit details right before saving (plan §7 race).
- **`updateStudent(…)`** ok answer → `{ status:'ok', version, resultCleared }` (`resultCleared = d.result_cleared === true`; the key is absent from the database's answer unless a result was cleared, and a database without 0010 never sends it). New refusal `not_allowed` passes through as today.
- **`updateEvent(…)`** may now return `{ status:'has_results' }`.
- Header comment lists the new statuses and functions.

### 3.3 `src/lib/mockTestingEvents.js` — same rules, same order, same statuses as §1
- Store: new list `results` (snake_case rows: `registration_id, result, note, updated_at, updated_by, updated_by_name`). A saved store **without** `results` gets `results: []` added — it does **not** count as "damaged" (so existing preview data isn't reset). `defaultEventsData` and `reset()` start with `results: []`.
- `GRANTED.testing_results = ['registration_id', 'result', 'note', 'updated_at', 'updated_by_name']`, `HIDDEN.testing_results = ['updated_by']` (so `EVENT_TABLES` includes it and `mockClient.from()` routes it automatically); `rowsOf` returns `db.results`.
- `RPC_ARGS`: `testing_set_result: [ID('p_registration_id'), ['p_result', 'text']]`, `testing_set_result_note: [ID('p_registration_id'), ['p_note', 'text']]`. Neither is in `ADMIN_ONLY`.
- Handlers: the two new ones (§1.5 order; the date rule uses the backend's `today()`, so `__tkdPreview.setToday` rehearses before / on / after); and the five changes of §1.6 (`update_student` clears + adds `result_cleared: true` only then, `resolve_duplicate`, `restore_student`, `add_student` admin after the day, `update_event` → `has_results`). `delete_student` / `delete_event` also remove the results of the removed registrations (the cascade).
- A result write never changes a registration's or event's `version`.

### 3.4 `src/lib/mockClient.js` (shared file — only this)
- `__tkdPreview.failSavesUntilRetry()` — from now on **every** Events save (any `EVENT_RPC_NAMES` call) fails like a dropped connection and changes nothing; reads keep working. Message: "Every Testing save now fails like a dropped Wi-Fi connection. Run __tkdPreview.reconnect() to bring it back."
- `__tkdPreview.reconnect()` — ends that and fires `window.dispatchEvent(new Event('online'))`, so the page's automatic retry (§4.3) runs at once. Message: "Saves work again. Unsaved results save by themselves now (or press Retry)." (The fake database can't see the page's Retry button, so the "connection" comes back by hand — see §9 point 5.)
- Both listed in the file's header comment list. `setToday` / `failNextSave` exist and cover grading unchanged.

### 3.5 `src/lib/testing/checks.mjs` — new groups (mock = database rules)
- `gradingRules`: window boundaries; `canChangeResults` table; note tidy / 200 / 201 / zero-width / blank; `resultCounts` with zeros; `defaultGradingClassId` (inside a class, between classes → next, before the first, after the last → first, two classes with the same start → switch order, no classes → null); `addedAfterDay` (form row; staff row on the day; staff row the day after); `isGraded`.
- Mock replays of R3–R6, R9–R15 (no session cases): date rule × staff/admin × both functions; same value twice; clear deletes; withdrawn; `update_student` clear / `not_allowed` / `result_cleared` present only when true; rename → keep-one path; restore staff branch; admin add after the day; `has_results`; delete cascades; versions untouched by results; `select` of `updated_by` or `*` on `testing_results` refused; an old store without `results` keeps its events.
- Ends with the existing `ALL TESTING LIB CHECKS PASSED`.

---

## 4. Staff screens (Builder C) — layout and wording exactly as G1–G8

### 4.1 Route and tabs
- `src/App.jsx`: `EVENT_HASH` becomes `/^#testing\/event\/([A-Za-z0-9-]{1,64})(\/grading)?$/`; the route is `{ section, eventId, eventTab: 'students' | 'grading' }`; `addressForRoute` writes `#testing/event/<id>` or `#testing/event/<id>/grading`; the popstate comparison includes `eventTab`. App passes `eventTab` and `onEventTab(tab)` to `<Testing>`; they reach `EventPage` through Testing's existing `...tabProps` (Testing.jsx unchanged; EventsTab / ClassesRanksTab ignore them — C checks neither spreads unknown props onto DOM elements). **Switching tabs uses `history.replaceState`** (no new history step: browser Back still leaves the event page, refresh keeps the tab). Opening an event from the list lands on Students.
- `EventPage`: real tabs **Students | Grading** — `role="tablist"` (`aria-label` = event name), two `<button role="tab">` with `aria-selected`, `aria-controls`, **roving tabindex** (current 0, other −1), ArrowLeft / ArrowRight (and Home / End) move focus **and** switch, as `TestingHeader` in Testing.jsx; each panel `role="tabpanel"` + `aria-labelledby`. Phone: two equal-width tabs (G1).
- The header (Add student, Registration link) and the page-level `ErrorBanner` show on **both** tabs; `N` opens Add student on both (PC). Summary cards, the duplicate box and the Removed group are Students only.
- **Add student on a finished event (v0.191, v0.192):** the header button and `N` are shown for **admins only**; **staff don't see it** (as the live page does today). `addShown` becomes `live ready && event && (event.state !== 'finished' || isAdmin)`, and `openAdd`'s early return allows admins. The dialog works as today; a `finished` answer (e.g. the account stopped being an admin) keeps today's `EVENT_FINISHED_ADD` handling.

### 4.2 Component tree and props
```
EventPage                       owns: tab, classSel (shared by both tabs), dialogs, page banner, grading = useGradingSaves(…)
├─ Students panel               as today + RosterRows "Added … (admin)" line + StudentDialog G8 changes
└─ GradingTab                   props: event, classes, rows (active roster rows), today, isAdmin, layout,
   │                                   classSel, onClassSel, grading, onOpenNote(row, opener), onPrint(opener)
   ├─ grading save banner       ErrorBanner (Retry + X) — page level, under the tabs, on both tabs
   ├─ All classes line · class switch (ChoiceGroup, amber mark) · class line + Print · lock line · count line
   ├─ GradingRow × n            name, Not paid / Not saved tags, note, Testing for, ResultButtons | read-only tag, note button
   │   └─ ResultButtons         props: name, value, disabled, onChoose(next), layout
   ├─ live region               role="status" aria-live="polite", visually hidden
   └─ GradingSheet              portal into document.body while printing (props: event, school, classes, rows, printedAt)
NoteDialog                      an EventPage dialog (type 'note'), so the lock / unsaved rules work as for the other dialogs
Leave dialog                    an EventPage dialog (type 'leave', §4.9), on Dialog.jsx variant 'confirm' (no red: nothing is deleted)
```
- Grading saves **do not** use EventPage's one-change-at-a-time `beginWrite` lock and are never blocked by it.
- Rows on Grading: active students of the class only (withdrawn hidden, not counted, not printed), in the Students tab's order (`rosterOrder`: belt order, then last / first name).

### 4.3 `useGradingSaves.js` (the save engine)
`const grading = useGradingSaves({ roster, loadedAt, reload, onNoAccess, showPageBanner, isReadOnly, screenLocked })` (`loadedAt` = the current data's `startedAt`)
- **Overlay per row** `{ result, state: 'saving' | 'unsaved' | 'retrying' | 'saved', sentResult, wanted, answeredAt }`. On screen, a row's result = overlay `result` if present, else the loaded one. A tap shows the pressed button **at once** (optimistic); the screen never looks "not recorded" after a tap.
- `chooseResult(row, value)`: `value` = the tapped button, or `null` when the tapped button was already chosen (tap again clears). **At most one save in flight per row**: if one is out, only remember `wanted`; when it answers, if `wanted` differs from what was sent, send `wanted` next (only the latest choice). Every call sends the absolute value (Retry is safe to repeat).
- Answers: `ok` → `state 'saved'`, `answeredAt = Date.now()`. **Only `error` and `stale` are retried:** → `state 'unsaved'` (Not saved tag + banner). `invalid` → drop the row's overlay, page banner `ROSTER_STALE`, reload. `finished` / `not_open` → drop **all** overlay entries and reload, so the screen shows §4.4's read-only / before-the-day view; page banner `TOO_LATE_RESULTS` / `GRADING_NOT_OPEN`. `withdrawn` → drop the row, page banner `isWithdrawn(name)`, reload. `not_found` → drop the row, page banner `ROSTER_STALE`, reload. `no_access` → the row stays `unsaved`, **all automatic retries stop** until the screen is unlocked again (`screenLocked` false), `onNoAccess()`.
- **Refresh merge:** the 15-second refresh and every reload never overwrite rows whose overlay is `saving` or `unsaved`. A `saved` entry is dropped once loaded data arrives whose `startedAt` (§3.2) is **later than** the entry's `answeredAt` (so the screen shows the database's own value, never an older read). After saves: one quiet `reload()` 500 ms after the last save of a burst answered.
- **Automatic retry (v0.192):** while the event page is open, not locked and `unsavedCount > 0`, every `unsaved` row is re-sent **every 10 seconds** (`GRADING_RETRY_MS = 10000`, one timer for the page) and **at once** when the browser fires `online` (`window.addEventListener('online', …)`). One save per row at a time, as for taps (a row with a save in flight just keeps `wanted`). While a previously unsaved row is being re-sent its state is `'retrying'` and its tag reads **Saving…** (`TAG_SAVING`, gray `.ttag`, no icon); on `ok` the tag disappears ("Not saved" → "Saving…" → gone); on `error` / `stale` it goes back to Not saved. A first tap shows no tag (the pressed button is the feedback). Timer and listener are removed when nothing is unsaved and on unmount. Nothing is stored on the device.
- `retryAll()` (the banner's **Retry**, kept as a shortcut): the same re-send right now. `dismissBanner()`: hides the banner; rows stay Not saved and keep retrying by themselves. A new failure shows the banner again.
- `unsavedCount`, `unsavedClassIds` (for the banner's class names and the amber mark, in switch order), `unsavedRows()` → `[{ id, name, classId, className }]` in switch order, then row order (for the leave dialog, §4.9). `unsavedCount` counts rows in `'unsaved'` **or** `'retrying'`.
- `saveNote(row, text) → Promise<status>`: calls `setResultNote`; on `ok` updates the row's note on screen at once (and reloads). The note dialog waits for it (no overlay queue for notes).
- **Announcements:** after each result save answers, the polite live region says `ANNOUNCE_SAVED` or `ANNOUNCE_NOT_SAVED` (cleared first so a repeat is announced).
- Overlay entries for rows that disappear from the active roster are dropped. When the screen becomes read-only (staff after the day), all overlay entries are dropped. Nothing is kept in browser storage (v0.188).
- Counts (all-classes line, count line, class switch numbers) use on-screen values (unsaved taps count as tapped, G5).

### 4.4 GradingTab — what shows when (`window = gradingWindow(today, event.testingDate)`)
| | before | on the day | after, staff | after, admin |
|---|---|---|---|---|
| Result | 3 buttons, **disabled** (grayed) | 3 buttons | read-only tag | 3 buttons |
| Note button | hidden | shown | hidden | shown |
| Lock line (`ti-lock`) | `gradingOpensLine(date)` | none | `GRADING_OVER_STAFF` | `GRADING_OVER_ADMIN` |
| Print grading sheet | shown | shown | shown | shown |
- **Default class:** shared with Students (`classSel`). On the testing day, the **first time** the Grading tab is shown for this event since the page was opened (a module-level `Set`, like `classByEvent`), `classSel` becomes `defaultGradingClassId(classes, schoolMinutesNow())`; after that the person's choice is kept. Other days: the class chosen on Students.
- Top to bottom (G1): grading save banner (if any) · All classes line (`allClassesLine`) · class switch (`ChoiceGroup`, the same as Students; a class with unsaved rows shows `ti-alert-triangle` amber after its count, with `classUnsavedLabel` in its accessible name) · class line `classLineTitle` + `studentsCount` + gear tag (as Students) and, right-aligned, outline **Print grading sheet** (`ti-printer`; on phones on its own line below) · lock line · count line (`resultCountLine`) · the rows (PC / tablet: table with headers Student · Testing for · Result; phone: stacked rows — line 1 name + tags + note button right, line 2 Testing for, note in gray, then the three buttons full width in one row).
- **Row:** name (500 weight); gray `.ttag` **Not paid** when `!row.paid` (v0.183 exception — the fact only, never amounts, method, dates or payment history; paid students show nothing; payment never blocks grading); amber **Not saved** tag (`ti-alert-triangle`, `TAG_NOT_SAVED`) when unsaved — a row may show Not paid plus one result / Not saved tag (v0.190); the note in 12px gray under the name; the "Added … (admin)" line (`addedAfterDayLine`) in 12px gray under the name when `row.addedAfterDay`; Testing for = `TestingForCell` (belt pictures); then ResultButtons or the read-only tag; then the note button (`IconButton`, `ti-note`; outline when no note, blue when the row has a note; tooltip `ADD_NOTE_TIP` / `EDIT_NOTE_TIP`; `aria-label` `addNoteLabel(name)` / `editNoteLabel(name)`; `data-note-btn=<id>`).
- **ResultButtons:** `<div role="group" aria-label={resultGroupLabel(name)}>` with three `<button type="button" aria-pressed>`: Pass / Not passed / No show (`RESULT_PASS`, `RESULT_NOT_PASSED`, `RESULT_NO_SHOW`). The chosen button shows its icon + 500 weight: Pass `ti-check` on `#eaf3de` / `--color-success-text`; Not passed `ti-x` on `--color-warning-bg` / `--color-warning-text`; No show `ti-user-off` solid gray `--color-border` with an inset 1px `--color-text-secondary` border. Unchosen: text only, white. Meaning never by color alone (icon + bold word). `ti-check` / `ti-x` here are the recorded exception to §2.4 (v0.190). Height 28 px with a mouse, **44 px on touch**; one segmented control, 1px `--color-border-control` outline and dividers. Tab moves through the three buttons; Enter / Space chooses; visible focus ring.
- **Read-only tags** (staff after the day): `TAG_PASSED` (green, `ti-check`), `TAG_NOT_PASSED` (amber, `ti-x`), `TAG_NO_SHOW` (gray, `ti-user-off`), `NOT_RECORDED` (gray 12px text, no pill).
- **Empty states (G7):** event with no active students → only `NO_STUDENTS_AT_EVENT` (no All classes line, no class switch, no Print). A class with none → class line (`studentsCount(0)`) then `noStudentsInClass(className)`; no Print, no count line. Event without classes → the Students tab's `NO_CLASSES_IN_EVENT`.
- Loading / load error / Both schools: the event page's existing skeleton, banner with Retry, and Testing's Both screen.
- **Touch (§2.5, v0.181):** rows ≥ 44 px; every tap target ≥ 44×44; touch rows show 3 result buttons + the note button (recorded exception to "2 + ⋯").
- Focus: after the note dialog closes → that row's note button; after printing → the Print button.

### 4.5 NoteDialog (G2) — on `Dialog.jsx`
- Title `noteTitle(name)`; subtitle `noteSub(className, fromName, toName, resultText)` where `resultText` = the on-screen result's button label, or `NOT_RECORDED_YET`. A `<textarea>` (about 4 lines, `maxLength={400}` only as a paste guard — the limit itself is `gradingNoteProblem` + the counter, 200 code points after tidying; `aria-label` `NOTE_FIELD_LABEL`, `data-autofocus`), hint `NOTE_HINT`, counter `noteCounter(n)` right-aligned (n = code points after `normalizeGradingNote`; shown from the start). Line breaks become spaces when saved (one-line note, §1.2).
- Cancel / Save (`ti-check`). Save gray until the tidied text differs from the saved note; clearing the text and saving removes the note. Field problems (`gradingNoteProblem`): `badCharacter` → `NOTE_BAD_CHARACTER`, `tooLong` → `NOTE_TOO_LONG_200` (amber, under the field, Save gray).
- Unsaved typing: Esc, backdrop or back arrow keep it open with `UNSAVED` (phone: with `DISCARD_CHANGES`, v0.56) — EventPage's existing `requestClose` pattern. Phone: full screen, back arrow, Save at the top right (like the Students dialogs).
- Save answers: `ok` → close, focus the note button; `error` / `stale` → stays open with `NOTE_SAVE_FAILED`; `invalid` → `NOTE_BAD_CHARACTER`; `finished` → close, page banner `TOO_LATE_RESULTS`, reload; `not_open` → close, `GRADING_NOT_OPEN`, reload; `withdrawn` / `not_found` → `STALE_DIALOG` (blocked), reload; `no_access` → `onNoAccess()`.

### 4.6 GradingSheet + print (G6)
- **Print grading sheet** draws `GradingSheet` (portal to `document.body`, class `grading-print`), waits one frame, calls `window.print()`, removes it on `afterprint` — the flyer's pattern (RegistrationLinkDialog). Same on PC, tablet and phone.
- `testing-events.css`: `.grading-print { display: none; }` on screen; in the existing `@media print` block change `body > *:not(.flyer-print)` to `body > *:not(.flyer-print):not(.grading-print)` and add the sheet's print rules. Letter size, black on white, no colors, no belt pictures.
- Content: the **whole event**, only classes with active students, in class switch order; **each class starts a new page** (`break-before: page`). Rows in belt order; withdrawn left out. Per page: header `sheetTitle(eventName)` and `sheetHeaderLine(dateIso, school, printedAt, className, page)` (`printedAt` = now, school time); the class line `sheetClassLine(className, timeText, count)`; a table with headers `SHEET_COL_STUDENT`, `COL_TESTING_FOR`, `SHEET_COL_RESULT`, `SHEET_COL_NOTE` (repeated on every page); per student: name · "White → Yellow" as text (`NO_NEW_RANK` for none) · three empty tick boxes labelled Pass / Not passed / No show · an empty note line. After the class's students: **two** rows `SHEET_ADDED_ON_DAY` + `________` · `____ → ____` · tick boxes · note line. Footer `SHEET_FOOTER` on every page.
- **Pages are split in JavaScript** so "page 2" can be printed: `SHEET_ROWS_PER_PAGE = 16` rows per page (the two "Added on the day" rows count); a longer class continues on a new page with the same header (`…, page 2`), class line and table header. C checks in the browser's print preview at the design review and may adjust the constant (reported).
- **Never printed:** payments, the Not paid tag, notes, recorded results (tick boxes stay blank), any Grader line.

### 4.7 Students tab and the other dialogs (G8, v0.191)
- **Detail view (StudentDialog view mode):** when `row.graded`, a **Result** section (`DETAIL_RESULT` label): the result tag (as §4.4's read-only tags; `NOT_RECORDED_YET` gray text when only a note exists) + `resultStamp(resultAt, resultByName)` ("· Nov 20, 5:41 PM by Staff"), then `resultNoteLine(note)` when there is a note. When `row.addedAfterDay`, the Registered line is followed by `addedAfterDayLine(date, byName)`. The Students list itself doesn't change except the RosterRows line below.
- **RosterRows:** the "Added … (admin)" line (12px gray) under the name when `row.addedAfterDay` (v0.191: "on Grading and Students").
- **Edit details (StudentDialog edit mode):**
  - Graded student, belt / class changed from the saved one → amber line (`Notice`) under the belt choices: `beltChangeClears(firstName, resultText)` (note-only: `beltChangeClearsNote(firstName)`).
  - **Staff, after the testing day, graded student:** class and belt choices shown but disabled, with the amber line `STUDENT_LOCKED`; names stay editable.
  - **Before saving a belt / class change:** call `loadResult(registrationId)`. If that read fails (any status but `ok`) → dialog note `SAVE_FAILED` and **don't save**. If its `graded` differs from what the dialog showed, update the dialog (show / hide the warning, or lock the choices) and **don't save** — the person reads it and presses Save again. Otherwise save.
  - `updateStudent` answers: `not_allowed` → dialog note `STUDENT_LOCKED` (blocked) + reload — add the key `STUDENT_LOCKED` to StudentDialog's `NOTES` and `PHONE_DISCARD_NOTES` and to EventPage's `BLOCKING_NOTES` (EventPage.jsx line 74); others as today. Ok with `resultCleared: true` → toast `TOAST_CHANGES_SAVED` **without Undo** (Undo couldn't bring the result back); otherwise as today (with Undo).
- **Possible duplicate "Keep this one"** answered `not_allowed` → page banner `STUDENT_LOCKED`, reload.
- **Delete permanently (admins):** `deleteStudentBody(eventName, payment, graded)` with `graded = { result, resultAt, hasNote } | null` (null when not graded) — wording below; built from the loaded row.
- **Delete event (EventsTab):** `deleteEventBody({ activeCount, removedCount, paymentCents, resultCount })` with `resultCount` from the fresh `loadEvent` roster (`graded` rows, any status).
- **Edit event (EventDialog/EventsTab):** `has_results` → dialog note `HAS_RESULTS` = `EVENT_HAS_RESULTS` (not blocking: the person can put the date back); EventsTab's Undo-refusal list (`['stale', 'not_found', …]`) adds `'has_results'`.

### 4.8 Wording (`src/screens/testing/text.js`) — exactly these strings
From the approved mockups (G1–G8, plan Q1):

| Constant | Wording |
|---|---|
| `TAB_GRADING` | Grading |
| `allClassesLine(c)` | All classes: 14 students · 6 passed · 1 not passed · 1 no show · 6 not recorded yet |
| `resultCountLine(c)` | 4 students · 1 passed · 1 not passed · 1 no show · 1 not recorded yet |
| | (both: parts that are 0 are left out — "4 students · 4 not recorded yet", "14 students · 11 passed · 1 not passed · 2 no show"; "1 student") |
| `PRINT_GRADING_SHEET` | Print grading sheet |
| `COL_RESULT` | Result |
| `RESULT_PASS` / `RESULT_NOT_PASSED` / `RESULT_NO_SHOW` | Pass / Not passed / No show |
| `TAG_PASSED` / `TAG_NOT_PASSED` / `TAG_NO_SHOW` / `NOT_RECORDED` | Passed / Not passed / No show / Not recorded |
| `resultGroupLabel(name)` | Result for Mia Lopez |
| `addNoteLabel(name)` / `editNoteLabel(name)` | Add note for Mia Lopez / Edit note for Mia Lopez |
| `ADD_NOTE_TIP` / `EDIT_NOTE_TIP` | Add note / Edit note |
| `gradingOpensLine(dateIso)` | Grading opens on the testing day, Friday, November 20. (uses `longWeekdayMonthDay`) |
| `GRADING_OVER_STAFF` | The testing day is over. Only an admin can change results or notes now. |
| `GRADING_OVER_ADMIN` | The testing day is over. Staff can’t change results now; as an admin, you can. |
| `TOO_LATE_RESULTS` | Too late to change. Only an admin can change results now. |
| `gradingSaveFailed(n, classNames)` | Couldn’t save 2 results (Group A). Check the connection, then try again. ("1 result"; several classes "(Group A, Group B)") |
| `ANNOUNCE_SAVED` / `ANNOUNCE_NOT_SAVED` | Saved / Not saved |
| `noStudentsInClass(className)` | No students in White. Students added on the Students tab show here. |
| `NO_STUDENTS_AT_EVENT` | No students at this event yet. Add students on the Students tab. |
| `noteTitle(name)` | Note for Sam Diaz |
| `noteSub(className, from, to, resultText)` | Group A · Orange → Green · Not passed |
| `NOTE_HINT` | Shows on the Grading tab, also on the mat. Write only what a parent could read. |
| `noteCounter(n)` | 40 / 200 |
| `NOTE_SAVE_FAILED` | Couldn’t save the note. Check the connection, then try again. |
| `sheetTitle(eventName)` | November Children Testing — grading sheet |
| `sheetHeaderLine(…)` | Fri, Nov 20, 2026 · Worcester school · printed Thu, Nov 19, 4:12 PM · Little Tiger, page 1 |
| `sheetClassLine(…)` | Little Tiger · 4:00 – 4:45 PM · 3 students |
| `SHEET_COL_RESULT` / `SHEET_COL_NOTE` / `SHEET_COL_STUDENT` | Result (tick one) / Note / Student |
| `SHEET_ADDED_ON_DAY` | Added on the day: |
| `SHEET_FOOTER` | Type the results into the Grading tab the same day. |
| `DETAIL_RESULT` | Result |
| `resultStamp(stamp, name)` | · Nov 20, 5:41 PM by Staff (uses `stampDayTime`) |
| `resultNoteLine(note)` | Note: Retest the jumping front kick next time. |
| `beltChangeClears(first, resultText)` | Changing the belt clears Sam’s result (Not passed). Record it again on the Grading tab. |
| `STUDENT_LOCKED` | Only an admin can change this student now. Their result is locked. |
| `deleteStudentBody` — paid + graded | Sam’s registration, the $65 cash payment recorded on Nov 3 and the testing result (Not passed, Nov 20) are deleted. They won’t show in Payments recorded or on the Grading tab any more. This can’t be undone. |
| `deleteEventBody` — with results | Its 14 students (plus 1 removed), their registrations, their 8 testing results and $410 of payments are deleted too. This can't be undone. |
| `EVENT_HAS_RESULTS` | This event already has testing results, so its date can’t change. |
| `addedAfterDayLine(dateIso, name)` | Added Nov 21 by Jeffrey Berg (admin) |
| `TAG_SAVING` | Saving… (rulebook v0.192) |
| `leaveTitle(n)` | 2 results aren’t saved (one: "1 result isn’t saved") |
| `leaveBody(groups)` | Zoe Park and Sam Diaz (Group A) weren’t saved because the connection dropped. If you leave now, they’re lost. Stay, and they’ll save when the Wi-Fi is back. |
| `STAY_ON_PAGE` / `LEAVE_ANYWAY` | Stay on this page / Leave anyway |
| existing, reused | `COL_STUDENT` (text.js line 529), `COL_TESTING_FOR`, `TAG_NOT_PAID` (line 536), `TAG_NOT_SAVED`, `RETRY`, `DISMISS`, `UNSAVED`, `DISCARD_CHANGES`, `STALE_DIALOG`, `ROSTER_STALE`, `isWithdrawn`, `EVENT_FINISHED_ADD`, `TOAST_CHANGES_SAVED`, `classLineTitle`, `studentsCount`, `NO_SPARRING_GEAR` … |

**Not in the mockups — written by C to the same pattern, marked `// CP1` in text.js, shown to Jeffrey at the CP1 walkthrough** (no decision needed before building):
`GRADING_NOT_OPEN` "Grading hasn’t opened yet. Your change wasn’t saved." · `NOT_RECORDED_YET` "Not recorded yet" · `NOTE_FIELD_LABEL` "Note" · `NOTE_BAD_CHARACTER` "That note has a character that can’t be used. Remove it." · `NOTE_TOO_LONG_200` "Use 200 characters or fewer." · `classUnsavedLabel` "has results not saved" (screen readers only) · `beltChangeClearsNote(first)` "Changing the belt clears Sam’s grading note. Record it again on the Grading tab." · the other `deleteStudentBody` variants: graded, not paid — "Sam’s registration and the testing result (Not passed, Nov 20) are deleted. They won’t show on the Grading tab any more. This can’t be undone."; a note only — "the grading note" instead of "the testing result (…)"; not graded — today's wording unchanged · `deleteEventBody` with results but no payments — "Its 14 students, their registrations and their 8 testing results are deleted too. This can’t be undone."; one result — "their 1 testing result"; no results — today's wording unchanged.

**Apostrophes:** every **new** string uses the typographic ’ (as the mockups and the existing `deleteStudentBody` do). Existing strings are not changed (e.g. `deleteEventBody`'s existing tail "This can't be undone." stays as it is).

### 4.9 Leaving the event page with unsaved results (v0.192) — the leave guard
**Rule:** only while `grading.unsavedCount > 0` (rows Not saved or Saving…). Otherwise nothing changes anywhere.

**`src/App.jsx` (C owns this piece of the shared file):**
- `const leaveGuardRef = useRef(null);` and `const setLeaveGuard = useCallback((fn) => { leaveGuardRef.current = fn; }, []);`
- **Guard contract:** `fn(proceed) → boolean`. `fn` returns `false` when nothing is unsaved (App then does the action itself), or returns `true` after it has opened its "Leave?" dialog — it then calls `proceed()` itself if the person chooses **Leave anyway**, and nothing if they **Stay**.
- `const guarded = (action) => { const fn = leaveGuardRef.current; if (fn && fn(action)) return; action(); };`
- Wrapped with `guarded(…)` (user-started only): Shell `onNavigate` (when the section or event changes), `onStaffAccounts`, `onSettings`, `onLocationChange` → `changeLocation`, `onDeviceLocationChange` (only when it changes the current school), Shell `onSignOut` (the menu's Sign out), and `closeEvent` **unless** called with `{ replace: true }` (the event page closing itself because the event belongs to the other school — that follows a guarded school change).
- **Browser Back / Forward / a typed hash** (`handlePopState`, phase `'home'`, the route differs): if `guarded` would block, first put the current address back (`window.history.pushState({ tkdPage: true }, '', here)`, as the locked case does), then call the guard with `proceed = () => navigate(target.section, target.eventId, { tab: target.eventTab })` (navigate gains an optional tab; the step it adds is a normal one).
- **Not guarded** (nothing can be asked): automatic sign-outs (idle without PIN, 7-day password, access lost), the screen lock (the page stays open underneath and retries resume after unlock), and tab switches Students ↔ Grading (same page).
- App passes `onLeaveGuardChange={setLeaveGuard}` to `<Testing>`; it reaches EventPage through `...tabProps` (Testing.jsx unchanged). EventPage calls `onLeaveGuardChange(guardFn)` on mount and whenever its guard changes, and `onLeaveGuardChange(null)` on unmount.
- EventPage's own **← Color belt testing** link calls `onBack()` = App's guarded `closeEvent`.

**EventPage:**
- `guardFn(proceed)`: if `grading.unsavedCount === 0` → `return false`. If a leave dialog is already open → `return true` (ignore the second attempt). Else open dialog `{ type: 'leave', proceed, opener: document.activeElement }` → `return true`.
- **Leave dialog** (Dialog.jsx `variant="confirm"`, `role="alertdialog"`): title `leaveTitle(n)`, body `leaveBody(groups)` built from `grading.unsavedRows()` — names joined "A and B" / "A, B and C" per class, each group followed by its class in brackets, groups in switch order joined with ", " (e.g. "Zoe Park and Sam Diaz (Group A), Ava Chen (Little Tiger) weren’t saved …"); one name: "Zoe Park (Group A) wasn’t saved …". Buttons: **Leave anyway** (outline, left) and **Stay on this page** (blue primary, right, `data-autofocus` — the default; Enter chooses it). Esc, backdrop and the phone back arrow = Stay. Stay → close; focus back to `opener` if it is still on the page, else the first Not saved row's pressed result button. Leave anyway → close, then `proceed()`; the unsaved results are dropped with the page.
- If the last unsaved row saves while the dialog is open, the dialog stays (the person decides); Leave anyway then loses nothing.
- **Closing or reloading the browser tab:** while `unsavedCount > 0`, EventPage has a `beforeunload` listener that calls `event.preventDefault()` and sets `event.returnValue = ''` (the browser shows its own "Leave site?" question — its wording can't be changed); the listener is removed as soon as nothing is unsaved and on unmount.
- Screens: same small confirm box on every device (phone included), as the approved image `ColorBelt-contract-P3-leave-unsaved.png` option B; the body wording is the image's, adapted to auto-retry ("Stay, and they’ll save when the Wi-Fi is back.").

---

## 5. Checks before calling a builder done
- `npm run build` and `npm run build:preview-mode` pass.
- `node src/lib/testing/checks.mjs` prints `ALL TESTING LIB CHECKS PASSED` (B, and C after its changes).
- PGlite: `cd supabase/tests/pglite && npm ci && node run.mjs` — every step passes, **0 failed**, step 12 included (A).
- Grep `dist/`: no `failSavesUntilRetry`, `reconnect()`, `__tkdPreview`, `mockTestingEvents`, `setToday`; no `service_role`, no secrets.
- `git status` never lists `.env.local`, `node_modules`, `dist`, `dist-preview`. Line endings unchanged (CRLF), checked with `file` before and after. Every new file has its header comment.
- Each builder's summary lists every file touched (shared files called out).

## 6. Reviews (orchestrator)
- **Security review of A + B together:** grants / RLS / no anon / registrar; `updated_by` never readable; the check order and the date rule read after the lock; the five replaced functions differ from 0005 **only** by the lines in §1.6 (diff them); `update_student`'s answer unchanged unless a result was cleared; the rename → keep-one bypass closed; `has_results`; cascade + logging; the 0005 re-run warning; mock = database statuses; no preview code in production.
- **Design review of C** against G1–G8, plan Q1 option A, the v0.192 images (P1 option A, P3 option B) and the rulebook, with screenshots at **1280×800, 820×1180 touch, 390×844 touch, 320 wide**, in preview with `setToday` before / on / after the testing day, staff and admin (`setRole`), `failSavesUntilRetry` → Not saved → `reconnect()` → Saving… → gone (G5, v0.192), the leave dialog from the Back link, the side menu, the school switcher, Sign out and browser Back, and `beforeunload` on reload; the note dialog, print preview of the sheet (G6), empty states (G7), Students detail + delete warnings (G8), the Add student button on a finished event as staff (hidden) and admin (shown); keyboard-only and a screen reader pass on the result group, the tabs and the leave dialog.
- Fix round, then re-review. Then CP1 (plan §5).

## 7. Before building starts
1. Jeffrey OKs this contract. (§9 points 1 and 3 were answered on 2026-10-18 — rulebook v0.192.)
2. Check the migration number is still free on **every** branch and worktree (`git ls-tree --name-only <branch> supabase/migrations/` for each branch in `git branch`); today 0006–0009 are claimed, **0010** is free.
3. Rulebook: phase 3 rows exist (v0.180–v0.192). Changes made during the build are recorded afterwards (orchestrator), renumbered at merge if needed.

## 8. Changes made after the first draft

### 8a. Jeffrey's answers to §9 (rulebook v0.192, 2026-10-18)
- Point 1 → staff don't see Add student on a finished event; admins do (§4.1).
- Point 3 → unsaved results **retry by themselves** every 10 seconds and on the browser's `online` event ("Not saved" → "Saving…" → gone; Retry stays as a shortcut; nothing stored on the device) (§4.3), and **leaving the event page asks first** while anything is unsaved, with `beforeunload` for closing / reloading the tab (§4.9 — App.jsx's leave guard, owned by C).

### 8b. Changes from the contract review (independent review, 2026-10-18)
| # | Severity | Change |
|---|---|---|
| 1 | High | `testing_update_student` adds `result_cleared: true` **only when** a result was cleared; otherwise its answer is exactly 0005's `{status:'ok', version}` (0005_tests.sql T7 compares the whole answer). R9 checks the key is absent on a name-only edit; §0 note fixed (§1.6, §2.1, §3.2). |
| 2 | Medium | `loadEvent` returns `startedAt` (taken at call start); the refresh-merge rule compares it with each save's answer time (§3.2, §4.3). |
| 3 | Medium | Save answers: only `error` and `stale` are retried; `invalid` → drop the row, `ROSTER_STALE`, reload; `no_access` stops all retries until unlock; `finished` / `not_open` → reload into the read-only / before view (§4.3). |
| 4 | Medium | `testing_resolve_duplicate` explicitly selects `testing_date` after its event lock (0005 only does `perform 1`); "graded" = a `testing_results` row for `p_other_id` (§1.6). |
| 5 | Low | Note tidying spelled out: `nullif(public.testing_normalize_name(p_note), '')` (§1.5). |
| 6 | Low | `COL_STUDENT` and `TAG_NOT_PAID` already exist in text.js — listed as reused (§4.8). |
| 7 | Low | NoteDialog: no 200 `maxLength` (a 400 paste guard only); the limit is `gradingNoteProblem` + the counter, 200 code points after tidying (§4.5). |
| 8 | Low | `deleteStudentBody`'s `graded` parameter = `{ result, resultAt, hasNote } \| null`; every new string uses ’ (§4.7, §4.8). |
| 9 | Low | `STUDENT_LOCKED` added to StudentDialog's `NOTES` / `PHONE_DISCARD_NOTES` and EventPage's `BLOCKING_NOTES`; a failed `loadResult` before saving → `SAVE_FAILED`, nothing saved (§4.7). |
| 10 | Low | `defaultGradingClassId` converts `'HH:MM'` with `timeToMinutes`; `allClassesLine` / `resultCountLine` take the `resultCounts` object (§3.1). |
| 11 | Low | SETUP §13 goes right after §12i (§2.4). |

### 8c. During the build
(none yet — the orchestrator records them here, with the review rounds)
- **CP1 (rulebook v0.194 point 3), Builder A:** `testing_resolve_duplicate` — after the testing day, keep one (`p_keep_both` false) is **admin-only for every student**, graded or not (staff → `not_allowed`); this replaces §1.6's "graded copy" condition (which becomes a special case). Same arguments, same check order, date still read after the event lock. Keep both stays allowed for staff after the day (it withdraws nobody). Tests R10 / R11 updated.

## 9. Open points

1. ~~**Add student on a finished event, for staff.**~~ **Decided 2026-10-18 (v0.192):** staff don't see the button on a finished event; admins do (§4.1).
2. **"Test SQL must not contain the connector words"** (plan §1.3) can't hold for `0010_tests.sql`: it must call the delete functions to test the cascade (R15), and `0005_tests.sql` already contains those words (33 times). It is pasted by Jeffrey in the SQL Editor, never sent through the connector. **Resolution in this contract (§1.1):** the rule applies to `0010_fingerprints.sql` and any query Claude runs through the connector.
3. ~~**Leaving the page with results still "Not saved."**~~ **Decided 2026-10-18 (v0.192):** unsaved results retry by themselves (§4.3), and leaving the event page while anything is unsaved asks first — "N results aren’t saved", Stay on this page (default) / Leave anyway; closing or reloading the tab uses the browser's own question (§4.9).
4. **Not in the mockups, shown at CP1** (no decision needed before building): the `// CP1` wordings in §4.8; no Undo on "Changes saved" when a belt change cleared a result (§4.7); one class choice shared by both tabs (§4.4); the note becomes one line (§1.2 — 0005's multi-line note rule is fixed at 600 characters, so the plan's "reuse 0005's helpers" means the one-line rule); the leave dialog's names list for several classes (§4.9).
5. **`failSavesUntilRetry()`** (plan §2): the fake database can't see the page's Retry button, so it can't stop failing "at Retry" by itself. **Resolution:** saves fail until `__tkdPreview.reconnect()` is run (which also fires the browser's `online` event, so the automatic retry can be rehearsed), then they save (§3.4). Preview only.
