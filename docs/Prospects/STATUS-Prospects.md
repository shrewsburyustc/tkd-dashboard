# Prospects — status

Branch `claude/prospect-form-system-cd893d`. Plan: `TKD-Prospects-Build-Plan.md` (approved 2026-10-18). Rulebook v0.140 (design) and v0.191 (plan answers). Mockup: `TKD-Prospects-Mockups.html` rev 3.

**Nothing is live.** Migration 0010 has not been applied to Supabase, and nothing has been pushed. 0010 goes live after 0007 → 0008 → 0009, and Prospects goes live together with the Forms public page (v0.145 answer 1).

| Step | State |
|---|---|
| P0 Plan + questions Q1–Q7 | Done 2026-10-18 (v0.191) |
| P1 Merge main (with Forms F1) | Waiting — the Main session merges when Jeffrey asks |
| P2 Migration 0010 + tests + security review | Done 2026-10-18; PGlite 93/93 |
| P3 Screens + preview database + design review | Next |
| P4 Jeffrey tries the preview | Waiting |
| P5 Live setup (0007–0010, then Forms F3) | Waiting |
| P6 Go live with Forms | Needs a separate OK |
| — 0003 history exception | **Proposal only** (`PROPOSAL-0003-history-cleanup.md`), for the Color Belt session; Prospects must not go live before it's decided |

## What P2 added

`supabase/migrations/0010_prospects.sql` (0009 unchanged):
- **Tables:** `prospect_statuses` (per school; 6 built-in + Contacted, colors without red), `prospects` (one per child), `prospect_notes` and `prospect_activity` (never changed), `prospect_opens` (badge per person). Nothing granted except the status columns; everything else read through functions.
- **Automatic prospects:** a trigger on `form_submissions` (one per child, New) and on `class_bookings` (New ↔ Booked, never over a status staff chose). Backfill for sign-ups saved before 0010.
- **Functions (staff and admins):** list (list columns only), search (names, or 4+ phone digits — ids only), panel, badge, prospects for Calendar bookings, status (Joined needs a date), note + follow-up, follow-up, opened, check in / "did they come?" (not for a cancelled class, not for Joined / Not interested) with Undo, open times / book / change / cancel a free class (0009's shared limit and slot locks), statuses add / rename / reorder.
- **Admins only:** delete a prospect (the family's sign-up goes with its last child), delete a custom status (moves its people).
- **2-year clean-up:** every family with no Joined child and no activity for 2 years; runs inside the list, one at a time. Its history copies stay until the 0003 exception is decided.

`supabase/tests/0010_tests.sql`, `0010_fingerprints.sql`; `pglite/run.mjs` runs 0010 before and after seed, after re-runs (0009 re-run doesn't undo it; rows, history and fingerprints unchanged; statuses seeded once) and on the upgrade path (a sign-up saved before 0010 gets its prospects).

## Security review (2026-10-18)

No High. Fixed: **M2** check-in on a Joined / Not interested child refused, Undo can't restore Joined; **L3** the clean-up takes turns and deletes in id order, and never breaks the list; **L5** two first sign-ups at once can't fail on seeding; **L8** booking only on forms that still have a booking field; **L9** opening a just-deleted prospect answers not_found; **L10** fingerprints header. **M1** (deleting writes fresh full copies into the history), L4, L6, L7 are written into the 0003 proposal. Test gaps noted for P3/P5: a two-form shared limit from the panel, TKD01 undo with prospects, history rows.
