# Star testing — Design Review changes (S1–S12): plan

**Started:** 2026-10-28 · **Branch:** `star-testing` · **Source:** Design Review change list §2.3 (`docs/Design Review/End review/TKD-DesignReview-ChangeList.md`), rulebook rows v1.000–v1.034 / v1.100–v1.111, and the Design Review session's brief (`docs/Design Review/End review/Prompts/4-Star.md`, part 1 received 2026-10-28).

Why this file exists: it lists every Star item from the design review, the files each one touches, its mockup and any migration, so Jeffrey can see the whole job and trace each item by its ID.

## Part 1 — ready now (no shared part needed)

| ID | What | Files | Mockup | Database |
|---|---|---|---|---|
| S3 | Edit payment ends with "Payment changed" + Undo (admins; Undo calls `editPayment` on the new payment id with the old method, amount and date; no money toast while Hide private details is on) | `candidates/CandidatesTab.jsx` (~603–614), `src/lib/star/candidatesText.js` | `TKD-StarTesting-DR-Gap-Mockups.html` G2 | none (existing function); check Finance's Daily report after Edit + Undo |
| S4 | Undo for 5 seconds after Restore (withdraws again) and after Change how they'll pay (puts the old choice back) | `CandidatesTab.jsx` (~559–567, ~750–762) | G3 (+ the Duplicate-copy panel) | none |
| S7 | ⋯ order: Edit details first · money group · Withdraw / Delete permanently last; "Edit candidate" → "Edit details" | `CandidatesTab.jsx` (~959–1014), `candidates/text.js:124`, `src/lib/star/resultsText.js:97`, `src/lib/star/resultsChecks.mjs:244` | G1 (+ choices 1 and 2) | none |
| S9 | Icons: Not paid card `ti-circle-x`; Change how they'll pay `ti-switch-horizontal`; `ti-repeat` then means only Make-up | `CandidatesTab.jsx` (~992, ~1285) | G4 (and G1) | none |
| S5 (Star's part) | Grading leave warning: "Stay on this page" left and focused, "Leave anyway" right and red (D1c) — may move onto the shared confirm box in part 2 | `event/StarEventPage.jsx` (~942–958), `src/lib/star/gradingText.js` (keep every export Black Belt imports) | G5 | none |
| S12 (database) | Migration **0028**: start times 6:00 AM–10:00 PM every 5 minutes; replaces only `star_start_time_is_valid` | `supabase/migrations/0028_star_start_times.sql`, tests, fingerprints, pre-apply check, undo file, SETUP "Migration 0028", `run.mjs` step0028, `0006_tests.sql`, `src/lib/star/starEventRules.js` (rule only; the dropdown list is unchanged until part 2) | none (no screen) | **yes** — Jeffrey pastes it; it must be live before part 2's time list |

Order: 0028 can be applied any time (it only widens the rule). The screen steps need no migration.

## Questions for Jeffrey (one at a time, each with a picture)

From the mockups:
1. What "Edit details" opens — **decided: A, the edit form straight away** (v0.517).
2. "Review possible duplicate" in a flagged row's ⋯ menu — **decided: A, add it** (v0.517).
3. Undo after restoring a "Duplicate copy" — **decided: A, no Undo** (v0.517).
4. Undo after Edit payment — **decided: as long as the toast, no other limit** (G2 OK, v0.517).
5. "Back to the testing day" shares `ti-arrow-back-up` with Undo and Restore — OK under one-icon-per-meaning?

From the brief (they feed part 2):
6. Undo Mark as sent box's "Keep …" words (today "Cancel"; e.g. "Keep send record"; Black Belt's twin box uses the same words).
7. The failure words in the delete and undo boxes (today "Couldn't save. Check the connection, then try again.").
8. History's result-email rows say only "Changed" — what should they say?
9. With Hide private details on, History also hides "Registered on the family form" / "Added at the desk" — keep that line?
10. The Candidates card on Both: one line "Worcester 12 · Shrewsbury 11", or a two-line note in the shared card?

A check (not a question): the Dan-change box takes the candidate dialog's place (one Back step) — confirm at phone size in the preview.

## Part 2 — waits for Dashboard core's step 1 (shared parts M1–M11)

S1 (Mark paid box), S2 (Print receipt), S5 (the other confirm boxes), S6 (History line), S8 (Registration link box + QR), S10 (money helper), S11 (switch to the shared parts), S12's screen (shared time list 6:00 AM–10:00 PM). The brief's part 2 arrives after that merge.
