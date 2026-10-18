# Calendar — status

Branch `claude/prospect-form-system-cd893d`. Plan: `TKD-Calendar-Build-Plan.md` (approved 2026-10-17). Rulebook v0.138 (design) and v0.143 (plan answers). Approved mockup: `TKD-Calendar-Mockups.html` rev 1.

**Nothing is live.** Migration 0008 has not been applied to Supabase, and nothing has been pushed. 0008 can only go live after 0005 (Color Belt phase 2), 0006 (Star testing) and 0007 (Schedule).

| Step | State |
|---|---|
| C0 Plan + questions Q1–Q4 | Done 2026-10-17 (v0.143) |
| C1 Migration 0008 + tests + security review | Done 2026-10-18; PGlite 67/67 |
| C2 Screens + preview data + design review | Next |
| C3 Jeffrey tries the preview | Waiting |
| C4 Jeffrey pastes 0008 (after 0005–0007 are live), then read-only checks | Waiting |
| C5 Real check: one real closure and one real event | Waiting |
| C6 Commit + merge (Main session) | Waiting |
| C7 Push = live | Needs a separate OK |

## What C1 added

- `supabase/migrations/0008_calendar.sql` has four tables: `calendar_event_types` (shared, starting with Testing, Tournament, Camp, Meeting and Party), `calendar_events`, `calendar_closures` and `calendar_closure_classes`. The last one keeps a record of each cancelled class (day, time, classes and names, with the slot id only as a hint).
- It also has 10 admin functions and 11 internal helpers. Every write locks both school rows in a fixed order, and NULL school means Both.
- `supabase/tests/0008_tests.sql`, `supabase/tests/0008_fingerprints.sql`; `pglite/run.mjs` runs 0008 before and after seed, after re-runs (fingerprints, rows and history unchanged, no second set of types) and on the upgrade path.
- A deliberate break of the 31-day rule was caught by the tests.

## Security review (2026-10-18)

No High or Medium findings. Fixed:
- The "undo" signal inside closures now uses its own error code (`TKD01`), so a real fault is never shown as "invalid".
- The invisible-character list is written as `\u` escapes (it had been saved as the actual invisible characters).
- The five starting types are added only the first time (checked against the history), so re-running never brings back types admins deleted.
- New tests:
  - a slot from a schedule not in effect that day;
  - a planned schedule moved earlier;
  - the re-run keeps every calendar row and the history unchanged.
- C9 checks the functions by name.

Accepted as notes, to handle in C2 or later:
- An event moved to another school is logged under its new school. A history screen should also look at the "before" school.
- Notes go into the history in full, so the dialog must show "Don't put student details here".
- The text checks use the same list of blocked characters as Testing.
