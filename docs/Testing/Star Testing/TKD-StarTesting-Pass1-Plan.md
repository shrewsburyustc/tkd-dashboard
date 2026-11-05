# Star testing — Rolling check pass 1: the plan

**What this is:** how Star builds the fixes in `docs/Design Review/Rolling check/Pass 1/Fix-Star.md`, in which order, which files each touches, which need a mockup, and what goes in the one database migration. Nothing is built before Jeffrey OKs it. Written 2026-11-05 on `star-testing` at main 6b27cdd.

## The order (a push to main deploys)

| Step | Items | Needs | Can merge |
|---|---|---|---|
| **A. Screen fixes** | R2-02 (stop-gap Retry), R1-03, R2-10, R4-10, R4-13, R4-08, R2-08, R2-07 (Undone words), Smaller | mockups for R4-10, R4-08, R2-08 | any time after review |
| **B. Count cards** | R5-05, R3-02, S-1 (the card's school order) | one mockup of the cards (all three changes on it) | any time after review |
| **C. Migration 0038 + its app** | R2-02 (one-step Undo), R1-01, R1-02, S-1 (belt order, if the database does it) | migration number from Main; security review; Jeffrey applies it | only after 0038 is live **and** Finance's R1-01 migration is live |
| **D. After Dashboard core** | R2-05, R1-08, R3-12, R3-13, R1-06, R1-07, R2-07 (shared words), R3-06, S-2 | each waits for Dashboard core's item to be on main | as each lands |

A and B are screen-only, so they can go live first. C waits on the database. D waits on another session.

## Step A — screen fixes

| Item | What changes | Files | Mockup |
|---|---|---|---|
| **R2-02 stop-gap** | Edit event's Undo: if the details step worked and the registration step failed, Retry re-sends **only** the registration step, with the version the first step returned. Never says "someone else". (Replaced by the one-step function in Step C.) | `star/events/StarEventsTab.jsx` (`runUndo`, the Edit Undo) | none (words already approved) |
| **R1-03** | History shows "Paying by: Cash → Check". The column skip and `linesFor` move to `src/lib/star/candidateHistoryLines.js`; skip by name (`created_by`, `updated_by`, `withdrawn_by`, `*_by_name`) instead of "ends in `_by`". New check in `candidatesChecks.mjs`. Hide private details still leaves it out. | `CandidateHistory.jsx`, new `lib/star/candidateHistoryLines.js`, `lib/star/candidatesChecks.mjs` | none |
| **R2-10** | Compare box: drop `keepLabel`, so the shared default "Keep this one: First registration" is used. | `CandidatesTab.jsx` | none |
| **R4-10** | ⋯ menu icons: Change private day or time → `ti-calendar`; Back to the testing day → `ti-calendar-event`. | `CandidatesTab.jsx` | **yes** (menu at 1280 and the 390 sheet) |
| **R4-13** | "Ask an admin to reopen." → "Ask an admin to open it." | `lib/star/eventsText.js`, `lib/star/eventsChecks.mjs` | none (words only) |
| **R4-08** | Grayed Email result: `--color-border-strong`, `cursor: not-allowed`, `aria-describedby` → the "Email result is off …" line. | `star/results/results.css`, `ResultRows.jsx` | **yes** (Results row, switch on) |
| **R2-08** | 5-second Undo on "Private testing set" (puts the old day/time back, or clears a new one) and on "Make-up … added" (admin: deletes the new row, resets the picker's "added" mark). | `CandidatesTab.jsx` (+ mock if a fake function is missing) | **yes** (the two toasts) |
| **R2-07 (Undone)** | New text "Undone. Registration is open again." after every Undo that reopens registration (Edit kept-closed Undo, ⋯ Close registration's Undo, Edit Undo that reopened); Results' Mark as sent Undo says "Undone". | `lib/star/eventsText.js`, `StarEventsTab.jsx`, `star/results/ResultsTab.jsx` | none (words approved, v1.051) |
| **Smaller** | One class for the grayed-reason line: `.st-menu-why` → `.ev-menu-reason` (`RubricsTab.jsx`, `star.css`). Fix the status file's stale line 12. | `RubricsTab.jsx`, `star.css`, status file | none |

## Step B — count cards (one mockup)

- **R5-05:** Payments recorded adds the removed candidates' money too (same school filter); gray line "includes $X from removed candidates" when some of it is theirs.
- **R3-02:** a "Possible duplicate" row is left out of Paid and Not paid (and their filters) until it's resolved; it offers no Mark paid; one gray line under the cards names it. **Words to approve in the mockup**, for example: "1 possible duplicate isn't counted in Paid or Not paid until it's reviewed."
- **S-1 (cards):** on Both, the Candidates card lists Worcester, then Shrewsbury.
- Files: `CandidatesTab.jsx`, `CandidateRows.jsx`, `candidates/text.js`. No shared file changes (the shared `CountCards` already draws a note).

## Step C — migration 0038 (reserved by Main 2026-11-05, main c769a66)

One migration, built on the live functions: **`star_add_event`, `star_update_event`, `star_public_answer`, `star_home_today` and `star_public_event` from 0041** (the end time, v0.520, goes live first: never copy 0006's or 0023's versions, and never bring back their 7- / 8-input signatures), `star_start_time_is_valid` from 0028, everything else from 0006. `star_undo_event_edit` saves and restores `end_time` too. Handoff §6 rules. SETUP section "## Migration 0038: …", `step0038` in `run.mjs`, tests and fingerprints files, security review.

1. **R2-02:** new `star_undo_event_edit(...)`: puts the old details **and** the old registration switch back in one transaction, or nothing. Model: `bb_undo_cycle_edit` (0032). The toast's Undo calls it once. Fake twin in `src/lib/mockStarEvents.js`.
2. **R1-01:** `star_payments.school` (set from the candidate's current school for existing rows; then not null). `star_record_payment` and `star_record_refund` take the device's school (new input, default blank = candidate's school, so the live app keeps working). Undo, Edit payment (both its rows) copy the school from the payment they correct. The app passes This device's school: touches **`src/App.jsx`** and **`src/screens/Testing.jsx`** (shared files). Fake twin in `mockStarCandidates.js`. Then tell Main, so Finance's R1-01 can read it.
3. **R1-02:** `star_candidates.paying_by_on_form` (the form's own choice, never changed; filled for existing form rows). `star_record_payment` with a different way changes Paying by (logged); Undo payment puts the old one back (`star_payments.paying_by_before`), as Camps' 0033. App: the hint says "on the form" / "at the desk" from Paying by vs the form's choice.
4. **S-1 (belt order):** decided v0.519 (Jeffrey, 2026-11-05: "Database (in 0038)"): `star_event_results` and `star_results_csv` (same signatures, same access) sort stars, then Worcester before Shrewsbury, then last and first name. `sortBeltOrder`, the fake grading and results stores and `resultsChecks.mjs` match.

Order: 0038 applied → checks pass → Finance's R1-01 migration live → then the Step C app merges.

## Step D — after Dashboard core

Each is planned in the fix list and built when Main says Dashboard core's item is on main: R2-05 (queued Undo helper), R1-08 (grayed Mark paid while saving), R3-12 (Dan/Stars "unavailable" Select; show Jeffrey Stars' reason line first), R3-13 ("Past days…" hints), R1-06 (Undo payment box words), R1-07 (payment toast/line/history words), R2-07 (shared "someone else" words), R3-06 (shared back link), S-2 ("then retry" + Retry on the summary and signature box; a failed-read helper in Star's fake store, registered in `src/lib/mockClient.js`, a shared file).

## Reviews

Each step: a design reviewer (four sizes, WCAG 2.2 checks), a code reviewer, and for Step C (and R1-03's privacy) a security reviewer. Both builds, Star's eight check files and `src/lib/shared/checks.mjs` pass before a commit.

## Shared files this plan touches

`src/App.jsx`, `src/screens/Testing.jsx` (Step C); `src/lib/mockClient.js` (Step D, S-2 helper); the rulebook only for new decisions (block 0.500–0.599, next v0.519).

## Decisions

- **S-1 → database** (v0.519, 2026-11-05). The screen-side sort was not chosen: two places would decide the order.
- **Plan OK:** waiting for Jeffrey.
