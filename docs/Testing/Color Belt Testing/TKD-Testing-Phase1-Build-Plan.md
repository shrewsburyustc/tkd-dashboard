# Phase 1 build plan — Testing → Classes and ranks (DRAFT for review)

Sources: code `$HOME/mnt/tkd-dashboard` (React 19 + Vite, plain JS/CSS, Supabase), rulebook `docs/TKD-Dashboard-Design-Guidelines.md` v0.49, approved mockup `docs/TKD-Testing-Classes-Ranks-Mockups.html` (md5 d1f96821…, 9 screens), handoff `docs/TKD-Dashboard-Handoff.md` §6 security rules + §7 workflow.

## 1. Database — migration `0003_testing_classes_ranks.sql`

Files: `supabase/migrations/0003_testing_classes_ranks.sql`; `supabase/tests/0003_tests.sql` (one transaction, ROLLBACK, UID placeholders, prints `ALL 0003 TESTS PASSED`); `supabase/tests/pglite/run.mjs` + own package.json (pins @electric-sql/pglite; app deps unchanged); `supabase/manual/0003s_seed_classes_and_ranks.sql`; `docs/CONTRACT-0003.md`; `supabase/SETUP.md` §10.

Applying: the Supabase connector cancels SQL containing `delete`/`drop` → nearly every part of 0003 contains them (FK on delete, delete RPCs, audit trigger TG_OP='DELETE', append-only guard). Plan: Jeffrey pastes the whole file in SQL Editor (one transaction). Connector only for read-only checks: list_tables, `select version()` (must be ≥15), function fingerprints (md5 of normalized prosrc vs PGlite-tested copy), get_advisors.

Schema: `public` with `testing_` prefix (0001 §11 locks default privileges in schema public only; a new schema needs its own lockdown + API exposure).

Locations: new lookup `public.locations(code text pk check in ('worcester','shrewsbury'), name text unique)`. App maps via `LOCATION_CODE` in `src/lib/device.js`. Location is a filter, not a permission (both roles see both schools).

### Tables
`public.testing_classes`: id uuid pk; location_code text not null fk→locations (immutable via trigger); name text check trimmed 1–60; position int ≥0; final_award_rank_id uuid null; version int default 1; created_at/updated_at; created_by/updated_by uuid null (NO FK); created_by_name/updated_by_name text (snapshot).
Constraints: unique(location_code, position) deferrable initially deferred; unique index (location_code, lower(name)); unique(id, location_code); FK (final_award_rank_id, location_code) → testing_ranks(id, location_code) ON DELETE SET NULL (final_award_rank_id) [PG15+]; trigger: final award may not be one of this class's own ranks.

`public.testing_ranks`: id uuid pk; class_id uuid not null (immutable); location_code text not null; name (same check); position int ≥0; early_cents/day_cents/private_cents int not null check 0..100000 and %100=0; sparring_gear bool default false; version, timestamps, *_by, *_by_name.
Constraints: FK (class_id, location_code) → testing_classes(id, location_code) ON DELETE CASCADE; unique(class_id, position) deferrable; unique index (class_id, lower(name)); unique(id, location_code); index(location_code).

*_by has no FK (would block deleting auth users; `on delete set null` contains blocked word). Name snapshot set by trigger from staff.full_name, fallback `current_setting('tkd.actor_label', true)`, then 'Database admin'. Needed because 0002 lets staff read only their own staff row.

Ordering: dense 0..n-1 renumbered server-side; deferrable unique allows one UPDATE … FROM unnest(ids) WITH ORDINALITY.
"Testing for" never stored — derived from position + class final award.

### Audit — `public.change_log` (whole dashboard)
id bigint identity; occurred_at; actor_id uuid (no FK); actor_name text; session_id; batch_id uuid; action text; table_name; record_id; location_code; op in (insert/update/delete); before jsonb; after jsonb.
Row triggers AFTER INSERT/UPDATE/DELETE (security definer) on both tables → logs RPCs, cascades, FK set-null, seed, SQL Editor edits. Update rows store changed columns only. RPCs tag `tkd.action` / `tkd.batch_id` via set_config(..., true).
Append-only: BEFORE UPDATE/DELETE trigger raises; TRUNCATE revoked. No client access in phase 1 (RLS on, no policies, revoke all incl. identity sequence).

### RLS + grants
locations, testing_classes, testing_ranks: `revoke all … from public, anon, authenticated; grant select to authenticated`; policy `for select to authenticated using ((select public.has_data_access()))`. No write grants, no write policies.
change_log: nothing.
8 RPCs: revoke execute from public, anon; grant to authenticated. Trigger functions: revoke from public, anon, authenticated.

### Writes — 8 security-definer RPCs (no direct table writes)
All: plpgsql, security definer, `set search_path = ''`, qualified names, return jsonb {status,…}. Order: has_data_access() → 'no_access'; is_admin() → 'not_allowed'; validate (location exists, ids belong to class/school); lock parent row FOR UPDATE.
Statuses: ok, no_access, not_allowed, not_found, stale, duplicate_name, invalid, not_empty.
- testing_add_class(p_location_code, p_name, p_final_award_rank_id)
- testing_update_class(p_class_id, p_expected_version, p_name, p_final_award_rank_id)
- testing_reorder_classes(p_location_code, p_expected_ids uuid[], p_new_ids uuid[]) — stale if current≠expected; invalid unless permutation of same school's ids
- testing_delete_class(p_class_id, p_expected_version, p_only_if_empty bool default false) — cascades, renumbers, returns removed_rank_count + classes_lost_award
- testing_add_rank(p_class_id, p_name, cents x3, p_sparring_gear) — appends; copying prices is a client-side dialog default
- testing_update_rank(p_rank_id, p_expected_version, name, cents x3, sparring)
- testing_reorder_ranks(p_class_id, p_expected_ids, p_new_ids)
- testing_delete_rank(p_rank_id, p_expected_version) — renumbers; returns classes_lost_award, class_final_award_now_on
Version bump trigger only on content columns (not position). Stale → amber "Someone else changed this just now. Your change wasn't saved." + reload. No realtime.

"Testing for" computed client-side in `src/lib/testing/rankOrder.js` (needed for optimistic reorder). Optional column `final_award_cleared_at` to distinguish "removed" vs "not set" wording after reload.

Reads: supabase-js selects filtered by location_code, plus parallel `rpc('has_data_access')` — RLS returns [] to locked sessions, so if false → lock screen (avoid showing a fake "No classes yet").

Later phases: events copy names/prices; any link back is nullable with no FK or ON DELETE SET NULL; never RESTRICT.

## 2. Tests (0003_tests.sql; PGlite first, then production)
Sessions: admin fresh/unlocked, server-locked, PIN-locked, signed out, 8-day password, magic link, idle-expired, inactive; desk staff unlocked; anon.
1 unlocked admin+desk read all 3 tables · 2a–g locked variants read → 0 rows · 3 anon select/execute → permission denied · 4 direct insert/update/delete as authenticated → denied · 5 desk calls 8 RPCs → not_allowed, no change · 6 locked admins call RPCs → no_access · 7 full admin flow ok, positions dense, version rules · 8 duplicate names (case/trim) → duplicate_name; 8b same name other class/school ok · 9 name length, price range/whole dollars → invalid · 10 cross-school final award → invalid / FK error · 10b own-rank final award → invalid · 11 reorder not a permutation / foreign ids → invalid · 12 stale order → stale · 13 wrong version → stale; 13b reorder doesn't bump version · 14 class_id/location_code immutable · 15 delete middle rank renumbers · 16 delete rank that is another class's award → set null + reported · 17 delete class cascade + award cleared · 18 only_if_empty → not_empty · 19 change_log rows correct incl. batch, before-image after delete, cascades, FK set-null · 20 change_log append-only; 20b authenticated can't read it · 21–22 updated_by_name snapshot, readable by desk · 23 consecutive add_rank positions · 24 re-run 0002 + verify_pin tests.

## 3. Front end
Change: navItems.js (+Testing, IconCertificate), App.jsx (section 'testing', per-section titles, showToast(text, action), modalOpen inert, props: location, onLocationChange, isAdmin (UI only), screenLocked, onNoAccess → setLockedFlag(true), onPasswordRequired), Toast.jsx (Undo action, pause on hover/focus), AccountDialog → generic Dialog.jsx (portal, returnFocusTo, dirty guard per v0.46, same 640px phone breakpoint), device.js (LOCATION_CODE), mockClient.js, tokens.css (delete colors, dialog radius, tag colors), main.jsx (testing.css), README, SETUP.md.
New: screens/Testing.jsx (header + Add class + tabs + Both-blocked + view-only line), testing/BlockedOnBoth.jsx, ClassesRanksTab.jsx, ClassBlock.jsx, RankRows.jsx, RankDialog.jsx (edit/add/view), ClassDialog.jsx, FinalAwardSelect.jsx, DeleteDialog.jsx; components/RowMenu.jsx (dropdown PC/tablet, bottom sheet + Cancel on phone), ErrorBanner.jsx; lib/testing/api.js, rankOrder.js, useClassesRanks.js, useReorderDrag.js (pointer events, mouse only, ~120 lines, no new dependency); lib/money.js; lib/useShortcutN.js; lib/mockTesting.js; styles/testing.css.
Behavior: skeleton <1s; reload on location change, unlock, visibility, after writes, after stale. Optimistic only for reorder (failed → amber "Not saved" tag + ErrorBanner with Retry). Dialog saves wait for ok; failure keeps dialog open. Undo: edits → update back; add rank → delete_rank v1; add class → delete_class only_if_empty; reorder → reorder back. Delete has no Undo; confirmation text built from loaded data. Staff: no edit controls, View button on touch, read-only dialog with Close. Both: no tabs, no data requests. Lock with a dialog open: dialog state kept, re-shown after unlock; toasts dropped on lock.
Preview mock: thenable from().select().eq().order(); all 8 RPCs with same rules via shared rankOrder/money; data = mockup's Worcester list (Group C/D/Teen-Adult placeholders), same for Shrewsbury; localStorage `tkd.preview.testing`; helpers setRole, failNextSave, simulateOtherAdminEdit, resetTesting.
CSS: tokens only; rows 40px mouse/48 touch; icon 28 visual/44 tap; tablet hides private/sparring cols; breakpoints from app.css; no h-scroll at 320.

## 4. Seed (7 classes / 42 ranks × 2 schools)
Read-only export query on old project (belt.classes/ranks, non-archived: names, positions, cents, sparring, next_rank) → `0003s_export_from_old_system.json` → `make_seed.mjs` validates (7/42, no null prices, whole dollars ≤$1000, unique names, next_rank consistent with order) → final award = old last rank's next_rank matched by name in same school (first later class with that name, else first overall; none → Not set) → prints review table → seed SQL DO block per school, skips a school that already has classes, sets tkd.actor_label 'Initial copy from the old system', no delete/drop substrings. Applied once after 0003 is live, with OK; check counts.

## 5. Order + checkpoints
CP0 plan OK + open questions → contract doc → parallel: A DB (migration+tests+PGlite), B seed generator, C data layer + mock, D UI → security review (DB, handoff §6 checklist) → design review (vs approved mockup + rulebook, Playwright 1280×800, 820×1180 touch, 390×844 touch, 320) → fix round → CP1 export/seed review → CP2 preview walkthrough → CP3 run 0002/verify_pin tests in prod, OK apply 0003 (SQL Editor), connector checks, run 0003_tests → CP4 seed → CP5 real-DB local check → CP6 OK push to main (= deploy; migration must be live first) → rulebook/handoff/docs housekeeping.
Builds/Playwright run on a Linux copy of the repo (node_modules has Windows binaries).

## 6. Open questions
1 Events tab before phase 2: (a) only Classes and ranks tab shown (rec) (b) Events tab with placeholder line (c) no tab bar until two tabs.
2 Final award dropdown: (a) native select with optgroups (rec; opens at current choice, not top) (b) custom listbox (~200 lines).
3 (only if export has null prices) require prices vs allow "Not offered".
4 Who runs the export: Jeffrey in SQL Editor vs connector select with OK.

## 7. Risks
PG version for column-list SET NULL; RLS empty-list illusion; PGlite vs real auth; connector word filter; seed final-award name matching; no realtime (stale handling); Undo of add uses delete RPCs (guarded); toast Undo lost on lock; deploy order; free-plan pausing.

## 8. Changes adopted from the independent review (2026-10-16)
Must:
1. Position uniqueness is `DEFERRABLE INITIALLY IMMEDIATE` (not initially deferred); RPCs catch unique_violation; tests add `set constraints all immediate` after writes.
2. Delete confirmations can't go stale: the dialog re-reads the class before showing; delete RPCs take what the dialog stated (`p_expected_rank_ids`, `p_expected_lost_award_class_ids`, and for rank deletes the expected order) and return `stale` if anything differs. Tests for both.
3. Tests prove the rules, not samples: catalog section (has_table/sequence/function_privilege for anon + authenticated on every object 0003 creates; relrowsecurity on all 4 tables; every security-definer function has search_path=''; none executable by public) + locked/magic-link DESK session gets `no_access` from every RPC (proves has_data_access runs before is_admin).
Should:
4–5. Open questions go to Jeffrey one at a time with visuals; any that reverse an approved detail are presented as such and recorded in the rulebook.
6. Seed maps final awards by old rank id (exact), not by name; "Not set" only when the old award points to an archived/missing rank (listed in the review table).
7. Cut `final_award_cleared_at` — v0.42 has one wording for both cases.
8. While locked, Testing dialogs are unmounted (form state kept in the Testing screen, re-shown after unlock); Playwright check: open dialog → lock → no dialog, PIN works → unlock → values still there.
9. AccountDialog is left unchanged; the new Testing Dialog is separate (or opt-in props with account behavior identical). Account dialogs added to regression screenshots.
10. Every RPC validates first and maps foreign_key_violation → invalid, unique_violation → duplicate_name; tests assert exact statuses; UI maps `not_allowed` (e.g. admin with stale password) to a clear message.
11. `N` only when Add class is shown (admin, not Both, loaded), no dialog/menu/sheet open, not locked, focus not in a field, mouse PC; tests for each blocked case.
12. Arrow-key row navigation (rule 3.6) — build or defer is a question for Jeffrey; drag Esc-cancel listed.
13. Tests are written relative to existing rows (work before and after seeding; run both times); reviewers re-check fixes; the generated seed SQL gets its own independent review before it's applied.
Nits adopted: fingerprint query selects `proname like 'testing\_%'`; BEFORE TRUNCATE trigger on change_log; every trigger/helper function gets search_path='' + revokes; reset tkd.action/batch_id at end of each RPC; Undo of add-rank refuses if it would clear another class's final award; reorder rejects null arrays/elements/duplicates; names collapse internal spaces + reject control characters; column-level select grants (hide created_by/updated_by uuids); empty-school and empty-class states mocked up before building (P1); rail order, "nothing on Home from Testing in phase 1", toast pause-on-hover confirmed with Jeffrey + recorded; change_log note that later sections exclude sensitive columns; git hygiene (no Playwright artifacts in repo, `git status` check), export JSON limited to names/positions/prices/sparring, revert snippet in SETUP §10.
