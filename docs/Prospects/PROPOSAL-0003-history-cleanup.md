# Proposal — a narrow exception in 0003's history, for the Prospects 2-year clean-up

**From:** the new-students (Prospects) branch `claude/prospect-form-system-cd893d` · **To:** the Color Belt session (owner of migration 0003) · **Date:** 2026-10-18 · **Status:** proposal only — nothing in 0003 is changed. Needs the Color Belt session's agreement, Jeffrey's OK, and its own security review before it is written.

## Why

Rulebook v0.191 answer 1 (Jeffrey): every family that isn't Joined is deleted **2 years after its last activity**, and "the history copies go too", because the records are about children. Migration 0010 deletes the prospect, notes, timeline, the sign-up (answers, contact details, bookings) — but every one of those rows was also copied into `public.change_log` by `change_log_write()` (0003) and `forms_submissions_log()` (0009). Today 0003's trigger `change_log_refuse_change()` refuses **every** UPDATE, DELETE and TRUNCATE on `change_log`, even from the SQL Editor. So the copies — child's first name and age, parent's name, phone, email, answers, notes — stay forever. That breaks answer 1.

## What we propose (the smallest change)

In 0003, `change_log_refuse_change()` allows a **DELETE** (never an UPDATE or TRUNCATE) only when all of these hold:

1. A transaction-local setting, e.g. `tkd.history_purge`, holds a **one-time random token** that the purge itself just set — and the same token is in a private, ungranted table row the purge wrote in the same transaction (so `set_config` alone from any session can't unlock it).
2. The row being deleted belongs to a record being removed in that same transaction: `table_name` in (`prospects`, `prospect_notes`, `form_submissions`, `class_bookings`, `form_signature_views`, `form_email_results`) and `record_id` in the private list of ids the purge collected.
3. Only `prospects_purge_old()` and `prospects_delete()` (0010, security definer, `search_path = ''`) set the token; neither is callable with a token from outside.

The purge's own `change_log` row records **counts only** ("Prospect clean-up: 3 families, 5 children"), never names.

4. **The delete itself must not make new copies** (security review of 0010, Medium 1). Today, deleting a sign-up fires `forms_submissions_log()` / `change_log_write()`, which write a fresh "delete" row holding the whole old row — phone, email, answers, names, note text. While the token is active, those two triggers (one in 0003, one in 0009) write a **redacted** delete row instead (table, record id, op, no before/after), or none. Test: after a purge, `change_log` holds no phone, email or name for those ids.
5. **Also in scope:**
   - deleting **one sibling** (admin delete) can't remove that child's first name and age from the family's sign-up (`form_submissions.children` is never changed) — it goes when the last child goes;
   - the purge cascades away `form_signature_views` and `form_email_results` without a trace beyond the counts row — accepted;
   - who the history names: `change_log_actor_name()` prefers the signed-in person over `tkd.actor_label`, so purge rows (and 0009's signature clean-up rows) name whoever loaded the list; the action column (`prospects_purge_old`) is what identifies them.

## What does NOT change

- Every other table's history stays append-only exactly as today (Testing, Schedule, Calendar, Forms building, staff accounts).
- No UPDATE of history, ever. No TRUNCATE.
- 0003's fingerprints change once (the function body); the 0003 tests get new cases: a delete without the token is refused; a delete with a token but a record id not in the list is refused; the purge removes exactly its own rows.

## Alternatives considered

- **Leave the copies** (what 0010 does today): breaks rulebook v0.191 answer 1. Acceptable only as a temporary state before go-live — Prospects must not go live until this is decided.
- **Store less in the history** for these tables (mask names like the signature): reduces, but doesn't remove, what's kept, and makes the history less useful for "who changed what".
- **Move these tables' history into their own log table** that 0010 owns and can delete from: no change to 0003, but splits "the history" into two places.

## Asks

1. Color Belt session: agree (or propose a better shape) before anyone edits 0003.
2. Jeffrey: OK to change 0003 (a shared, fingerprinted file) for this.
3. A separate security review of the 0003 change and its tests.
