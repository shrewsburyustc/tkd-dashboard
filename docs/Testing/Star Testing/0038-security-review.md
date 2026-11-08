# Security review of migration 0038 (Star design-review database fixes), 2026-11-07, independent reviewer

Scope: `supabase/migrations/0038_star_design_review.sql` (1,336 lines), `supabase/tests/0038_tests.sql`, `0038_fingerprints.sql`, `0038_preapply_check.sql`, `supabase/manual/0038u_undo_star_design_review.sql`, SETUP.md "Migration 0038", the changed `0006_tests.sql` / `0023_tests.sql`, and `run.mjs` step0038. Nothing was applied, committed or pushed. Handoff section 6 and CLAUDE.md "Database rules" were the standard.

## Verdict

**MUST-FIX: none.** Safe to paste after Jeffrey's OK, with the SHOULD items below worth doing first (two are one-line SETUP edits).

## What I ran

- `node run.mjs --only-step0038` (PGlite, production migration order): **104 passed, 0 failed.** That covers the fingerprint comparison against every other file, the backfill, `0038_tests.sql`, the 0006/0023/0028/0041/0011/0018/0026 tests after 0038, a second run, and the undo (refused twice, then clean undo, second undo, redo).
- A comment-stripped diff of every replaced function against its source. This is the check that nothing slipped in beside the intended changes.
  - `star_record_payment`, `star_record_refund`, `star_undo_payment`, `star_edit_payment` and `star_payments_guard` differ from 0006 only in the lines marked 0038.
  - `star_event_results` (0006) and `star_results_csv` (0023) differ in the one `loc_order` line only.

## OK, checked against the builder's six points

1. **Privileges and search_path.**
   - All 9 functions have `set search_path = ''`. Every `revoke` names `public, anon, authenticated, service_role` (migration lines 339, 435, 577, 679, 820, 935, 1176, 1301, 1431).
   - The 7 callable ones get `grant ... to authenticated` only. The two trigger functions (`star_payments_guard`, `star_candidates_keep_form_choice`) get no grant at all.
   - `has_data_access()` is the first statement in every function. `is_admin()` is only ever a second check, after it: refund 867, edit payment 737, undo event edit 1375, CSV 1219.
   - Column rights are `grant select (school)` and `grant select (paying_by_on_form)` to authenticated (lines 231 and 305). `paying_by_before` gets no grant. `0038_tests.sql` P1a asserts SELECT is the only right, that anon and service_role have none, and that anon gets "insufficient privilege". The 0006 test C-list of readable columns was extended by exactly two names.
   - `star_roster` is `security_invoker = true` with `revoke all ... ; grant select ... to authenticated` (lines 1090-1091), the same as 0006 section 15. The new column is last, so `create or replace view` is legal.
   - No new tables, so no new RLS is needed. Existing RLS and policies are untouched.
2. **Backfill trigger switching.**
   - Guard and payments log are off for one UPDATE (lines 205-213). The candidate before-write, rules and log triggers are off for one UPDATE (269-288). Each is switched back on in the same DO block.
   - The whole file is one `begin; ... commit;`, so any error rolls everything back, including the trigger states (DDL is transactional in Postgres).
   - `DISABLE TRIGGER <name>` needs table ownership only, not superuser. The SQL Editor role `postgres` owns the tables (fingerprint owner=postgres). No `DISABLE TRIGGER ALL` is used, so internal FK triggers are not touched.
   - Concurrency: `ALTER TABLE ADD COLUMN` takes ACCESS EXCLUSIVE on `star_payments` and `star_candidates` until commit, so nothing else can write in between.
   - Proof the triggers end enabled: `0038_tests.sql` P1b checks five by name plus `star_candidates_before_form_choice`. run.mjs also checks it. The 0006 fingerprints include `enabled=` and compare byte-identical.
3. **Backfill rules.**
   - `paying_by_on_form` comes from the candidate's own change_log insert row, `order by l.id limit 1`, only when it is cash/check/card and `source = 'form'`. No insert row means NULL, never today's Paying by. Desk candidates and make-ups stay NULL.
   - The `star_candidates_keep_form_choice` trigger is created after the fill (line 341), so it cannot undo it. A re-run finds no rows to fill.
   - The PGlite data shows both cases: Formone card/cash, Formtwo check/empty.
4. **`star_undo_event_edit`.**
   - Order: `has_data_access`, then `is_admin`, then null-argument check, then `select ... for update` on the event (the same lock both inner functions take), then not_found, then stale.
   - The inner block calls 0041's `star_update_event` (9 inputs) and then `star_set_registration`. A non-ok answer is stored in `v_kept` and `STU38` is raised. Only `when sqlstate 'STU38'` is caught, and it returns `v_kept` unchanged. That is the inner functions' own `{status}` answer, so no internals leak.
   - The subtransaction rollback also reverts the inner `set_config(..., true)` values.
   - Any other error goes to the outer handler: unique/FK/check, numeric range, bad text, deadlock. Nothing swallows `STU38` before the inner handler sees it.
   - Two inner calls write two history batches. P9d asserts exactly 2 history rows, and P9c asserts a refusal in step 2 undoes step 1 (finished event).
   - Admin-only. A deleted event gives not_found. A finished event is refused by `star_set_registration` as `finished`.
   - v0.504 holds: the details step still applies the "an edit never reopens by itself" keep-closed rule. Only an explicit `p_open = true` reopens, and that goes through `star_set_registration`'s own rules (admin clears an expired auto-close, exactly as the Open switch does).
5. **Payment chain.**
   - `star_record_payment` writes the payment and updates `version` and `paying_by` in one UPDATE under the candidate lock. The batch id covers both rows.
   - `star_edit_payment`'s `v_choice` / `v_after` / `v_before` are Camps 0033's rule. I compared the expressions: the new payment carries the family's choice only when Paying by equals the new method after the edit and the choice differs.
   - `paying_by_before` is constrained to `kind = 'payment' and in (cash, check, card) and <> method`, so a refund or reversal can never carry it (the refund and reversal inserts omit it anyway).
   - The guard, for reversals:
     - fills `school` from the original when null;
     - refuses a different school (`23514 star_payments_reversal_check`, which the callers map to `invalid`);
     - keeps the net-never-below-zero check unchanged.
     - For non-reversal inserts with no school, it fills the candidate's school.
   - `p_school` is checked with a static `exists (select 1 from public.locations ...)`. There is no dynamic SQL, so no injection. Empty string and whitespace are `invalid` with `field: school`.
6. **Undo file.**
   - It takes `share` locks on both tables, then refuses (raises, so nothing changes) if any payment's school differs from its candidate's current school or any `paying_by_before` is set. The check reads `to_jsonb(p)`, so it is safe on a second paste.
   - It restores the 0006/0023 functions word for word. Grants match: revoke from the same four roles, grant to authenticated. The roster view is dropped and recreated with 0006's rights (nothing depends on it), and it all runs in one `begin/commit`, so there is no half state.
   - run.mjs proves every fingerprint file equals the pre-0038 one after the undo, and the baseline tests pass.

**Live app compatibility.** The live app calls `star_record_payment` and `star_record_refund` with named arguments and no `p_school`.
- There is exactly one overload, because the 5-input ones are dropped in the same transaction (lines 447-448).
- A 5-argument call, named or positional, resolves to the 6-input function through `p_school default null`. Tests P3a and P6d cover the named call.
- The answers keep the same keys.
- PostgREST's schema cache reloads on DDL. Even if it lags for a moment, its cached 5-argument call still resolves.
- `star_roster` only gains a trailing column. `star_payments` still has explicit column grants, so `select=*` was never available to the app.

**Other checks.**
- Idempotency: the second run passes. Every `add column`, `add constraint` and trigger step is guarded or `if exists`.
- Finance reads `star_payments` by column name (0011/0017/0018/0026), so it is unaffected. Finance's own R1-01 reads `school` later.
- The migration's only `drop`/`delete` words are the two real `drop function if exists` lines, `drop trigger if exists`, and `tg_op = 'DELETE'` in the guard (carried from 0006). The undo file has more `drop` lines. SETUP 0038b has Jeffrey paste it in the SQL Editor and explains the Supabase warning.
- `0038_preapply_check.sql` and `0038_fingerprints.sql` contain neither `delete` nor `drop`, so they are connector-safe. They are single SELECTs with `collate "C"` ordering.
- The expected answers `0/2/0/7/7/0/0/0` before and `3/0/3/7/0/9/0/0` after are what run.mjs printed.
- Production vs PGlite:
  - The tests file creates no helper functions, so the grant-to-public problem does not arise in it.
  - It uses the same placeholder-UID setup as 0041_tests (`auth.sessions` plus `session_unlock`) and ends `select ...; rollback;`.
  - The roles it probes are guarded with `pg_roles`.
  - The changed 0006_tests helpers now `grant execute ... to public` on `pg_temp` functions, which is harmless.
  - The belt order is an explicit numeric rank. Only the last name / first name tie-break is text, and then `x.id`. Trigger firing order (`..._form_choice` before `..._write`) uses byte comparison, so ICU does not matter. The test checks it with `collate "C"`.

## SHOULD (not blocking)

1. **School for old payments is frozen at the candidate's CURRENT school (migration 133-136, 205-211).**
   - If any candidate's school was edited after they paid (`star_update_candidate` takes `p_location_code`), the stored school is the new one. That is what Finance already shows today, so no report changes. But the header and SETUP present it only as "the school as it is now". It is not flagged as a known limit for Jeffrey.
   - Fix: add one sentence to SETUP "0038a". Optionally add a read-only count to the pre-apply step: candidates with a payment whose change_log `update` rows show `before.location_code <> after.location_code`. Then Jeffrey sees if the case exists.
2. **Lock-order deadlock window (low).**
   - The migration takes ACCESS EXCLUSIVE on `star_payments` and then `star_candidates`. App functions lock the candidate row first and then insert payments.
   - A payment recorded in the same second could deadlock. The app maps that to `stale`, and Postgres may instead abort the migration. That would be a clean rollback and a re-run.
   - Fix: one line in SETUP 0038b: "paste when nobody is recording payments".
3. **SETUP 0038b says "Supabase will warn" but never says the connector would cancel the file.**
   - CLAUDE.md says the connector cancels SQL containing `drop`/`delete`. Add "paste in the SQL Editor only; do not run it through the connector".
4. **Behaviour change the old app gets immediately.** Once 0038 is live, Record payment by a way other than Paying by also changes Paying by (logged) for the live app, which does not know it. This is intended (R1-02, v1.047), but say so in the SETUP "The old app" bullet so it is not a surprise at the desk.
5. **`p_school` is client-asserted.** Any staff member can book a payment to either school. This is the intended design (This device's school) and is not an escalation, since staff could already record payments. It is worth a line in the rulebook's trust notes, nothing more.

## INFO

- `star_undo_event_edit` restoring a first-ever Open to Closed leaves `first_opened_at` set (the event shows Closed rather than "not open yet"). This is the same as today's two-save Undo, so it is not a regression.
- The re-run note (re-running 0006 or 0023 after 0038 breaks Record payment as "ambiguous") is correct and well documented. The undo is the right way back.
- Backfill hazard on a re-run only: if a form candidate somehow had a NULL `paying_by_on_form` and an insert row, the live form-choice trigger would revert the fill silently. It cannot happen after a clean first run.

Safe to paste after Jeffrey's OK: yes (no MUST-FIX; ideally add SHOULD 1-4 as one-line SETUP edits first).
