# Decision — family records get their own history table (the Prospects 2-year clean-up)

**Decided:** 2026-10-19 by Jeffrey · rulebook **v0.400** (Color Belt block) · **Written by:** the Color Belt session (owner of migration 0003) · **Replaces:** `docs/Prospects/PROPOSAL-0003-history-cleanup.md` on the new-students branch (its option "own log table", not its main proposal).
**Status:** design only. No SQL is written or applied. The new-students session writes migration **0015**; the Color Belt session reviews it against this note; a separate security review checks it; Jeffrey applies it.

## 1. The problem

Rulebook v0.244 answer 1 (Jeffrey, new-students branch): every family that isn't Joined is deleted **2 years after its last activity**, "and the history copies go too" (the records are about children). Migrations 0009 (Forms) and 0012 (Prospects) log the family tables into `public.change_log`, and 0003's `change_log_refuse_change()` refuses every UPDATE, DELETE and TRUNCATE there. So the copies (child's first name and age, parent's name, phone, email, answers, note text) would stay forever.

## 2. The decision

- **Question 1 — B:** the family records log into **their own history table, `public.family_history`**. The clean-up (and an admin's "delete family / child") deletes that family's rows from it in the same transaction. **`change_log` stays strictly append-only with no exception; migration 0003 is not changed.**
  - Rejected: **A** (a guarded delete exception inside `change_log`, the proposal's main shape) — it ends "history can never be deleted or edited" and needs a subtle unlock rule to stay safe forever. **C** (store less) and **D** (leave the copies) don't meet v0.244.
  - Why now: on 2026-10-19 the live `change_log` holds **no family data** (read-only check: only 14 `prospect_statuses` insert rows, which are staff settings). Nothing has to be moved.
- **Question 2 — A:** the **new-students session** writes migration **0015** (0011 Finance · 0012 Prospects · 0013 Camps · 0014 Color Belt phase 4, checked on every branch and worktree on 2026-10-19 — re-check before writing). The Color Belt session reviews it against this note; a separate security review follows; Jeffrey applies it. **Prospects doesn't go live until 0015 is applied and tested.**

## 3. Rules migration 0015 must follow

**R1 — the table.** `public.family_history` has **exactly `change_log`'s columns, types, constraints and indexes** (0003 §6: `id` identity, `occurred_at`, `actor_id`, `actor_name`, `session_id`, `batch_id`, `action`, `table_name`, `record_id`, `location_code`, `op` in insert/update/delete, `before`, `after`; indexes on (table_name, record_id), occurred_at, batch_id). RLS on, **no policy**, `revoke all … from public, anon, authenticated, service_role` — nobody in the app reads or writes it (same as `change_log`). Nothing granted to `testing_registrar` or the forms' public role.

**R2 — protection.** A `before update` row trigger and a `before truncate` statement trigger refuse (`family_history can't be edited`). **DELETE** is allowed only when `current_setting('tkd.action', true)` is `prospects_purge_old` or `prospects_delete` (a guard against a mistaken manual delete in the SQL Editor; the real protection is that only the table owner — the security-definer functions — can delete at all). The guard is a `before delete` row trigger.

**R3 — which tables log where.**
| Table | Logs into | Function |
|---|---|---|
| `form_submissions` | **family_history** | `forms_submissions_log()` retargeted (signature still "on file" / null, never the picture) |
| `class_bookings` | **family_history** | new `family_history_write()` (same body as 0003's `change_log_write()`, other target table) |
| `prospects` | **family_history** | `family_history_write()` |
| `prospect_notes` | **family_history** | `family_history_write()` |
| `forms`, `form_booking_offers`, `form_booking_limits`, `prospect_statuses` | `change_log` (unchanged) | staff settings, no family data |

`family_history_write()` and the retargeted `forms_submissions_log()`: security definer, `set search_path = ''`, fully qualified, `revoke execute … from public, anon, authenticated, service_role`, same actor / session / batch / action rules as 0003. 0003's `change_log_write()` is **not** edited. Any future table that holds family data logs into `family_history`, not `change_log` (write this rule into the 0015 header and SETUP).

**R4 — the clean-up and the delete.** Inside `prospects_purge_old()` and `prospects_delete()`, in the same transaction, after the family rows are deleted (whose delete triggers have just written "delete" rows into `family_history`):
1. delete **every** `family_history` row whose `(table_name, record_id)` belongs to a record removed in this transaction — the submission(s), the prospect(s), their notes and bookings (ids collected **before** the deletes; the "delete" rows just written are removed too);
2. write **one** `change_log` row with counts only: `action` = `prospects_purge_old` / `prospects_delete`, `table_name` = `family_history`, `record_id` = a fresh random uuid, `op` = `delete`, `before` null, `after` = `{"families": n, "children": m}` — **no names, phone, email, answers, notes or record ids of the family**;
3. keep 0012's advisory lock and id order (no deadlock between the two).
A **sibling delete** (one child removed while siblings stay) removes that child's prospect, notes and bookings from `family_history`; the sign-up's own rows (which list every child) stay until the last child goes — accepted, as in the proposal.

**R5 — no leftovers.** 0015 **refuses to apply** if `change_log` already holds any row with `table_name` in (`form_submissions`, `class_bookings`, `prospects`, `prospect_notes`) — so a family copy can never silently stay in the append-only table. (Today: none.)

**R6 — what isn't covered.** Supabase's own backups keep deleted rows until those backups expire; accepted (state it in SETUP). `prospect_activity` and `prospect_opens` aren't logged and go by cascade (unchanged). The actor named on the counts row is whoever's screen ran the clean-up; the action column identifies it (as the proposal noted).

**R7 — reading later.** No screen reads either history today. A future history screen reads both tables (admins only), e.g. through one view; that's its own decision.

## 4. Functions that change in 0015

New: `family_history_write()`, `family_history_refuse_change()` (update / truncate), the delete guard. Replaced (same arguments): `forms_submissions_log()` (0009), `prospects_purge_old()` and `prospects_delete()` (0012). Re-pointed triggers: the `_log` triggers of the four family tables. **Untouched: everything in 0003** (`change_log`, `change_log_write`, `change_log_refuse_change`, their triggers) — its fingerprints must not change.

## 5. Tests that must exist (`0015_tests.sql`, rolled back, plus `run.mjs`)

1. `change_log` still refuses UPDATE, DELETE and TRUNCATE, from every role, with and without any `tkd.action` set (0003 unchanged; its fingerprints identical before and after 0015).
2. `family_history`: RLS on, no policy, no grants; `anon`, `authenticated`, `service_role` and the public form roles can't select, insert, update, delete or truncate it.
3. UPDATE and TRUNCATE on `family_history` refused; DELETE refused unless `tkd.action` is one of the two clean-up actions.
4. Inserting / updating / deleting a sign-up, booking, prospect or note writes to `family_history`, **not** `change_log`; the sign-up row never contains the signature picture.
5. Staff-setting tables (`forms`, `form_booking_offers`, `form_booking_limits`, `prospect_statuses`) still log to `change_log`.
6. The purge removes **exactly** its own families' rows: two old families + one recent family + one Joined family → only the two old families' `family_history` rows are gone, the others are untouched.
7. After a purge: no `family_history` or `change_log` row holds the removed family's record ids, child name, parent name, phone, email, answers or note text (search the jsonb text); `change_log` gains exactly one counts row with the right counts.
8. `prospects_delete` of one sibling: that child's prospect / notes / bookings rows gone; the sign-up rows stay; deleting the last child removes the rest.
9. Every other table's history (Testing, Schedule, Calendar, Forms settings, staff accounts) is still in `change_log` and still append-only.
10. 0015 refuses to apply when a family row exists in `change_log` (R5), tested on a scratch database.
11. `run.mjs`: 0015 on top of everything applied so far (fresh and upgrade), the earlier test files still pass, 0015 applied twice is harmless, fingerprints fresh = upgrade.
