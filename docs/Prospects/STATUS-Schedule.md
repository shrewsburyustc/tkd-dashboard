# Schedule — status

Branch `claude/prospect-form-system-cd893d`. Plan: `TKD-Schedule-Build-Plan.md`. Rulebook v0.233. Approved mockup: `TKD-Class-Schedule-Mockups.html` rev 2.

**Migration number (2026-10-17):** the Schedule migration is now **0007** (`0007_schedule.sql`, `0007_tests.sql`, `0007_fingerprints.sql`): 0005 belongs to Color Belt phase 2 and 0006 to Star testing (Jeffrey caught the clash before anything was pasted). New-students rulebook rows renumbered to v0.233–v0.238 after main (v0.130) and Color Belt's waiting v0.131–v0.136. Before S4: bring main in again once 0005 and 0006 are merged, then rerun PGlite with all of them.

**Database live, app not yet.** Migration 0007 is applied to the live Supabase database. Jeffrey pasted it into the Supabase SQL Editor on 2026-10-19 (order 0007 → 0008 → 0009 → 0012, after 0001–0006 and Color Belt's 0010). For each: the live fingerprints equal the PGlite live-order copy exactly (row count + one hash over every row), the security advisor showed only the expected entries (signed-in users may run the checked write functions; internal tables have RLS on and no read rule on purpose), and the tests file passed (run with the real admin and front-desk IDs, rolled back). Nothing has been pushed: the live dashboard has no Schedule screen until this branch is merged into main and pushed.

## Where it stands (2026-10-17)

| Step | State |
|---|---|
| S0 Bring main in, renumber the rulebook | Done (`3cf3cc0`) |
| S1 Migration 0007 + tests + security review | Done (`4482a88`); PGlite 54/54 |
| S2 Screens + preview + design review | Done; independent design review findings fixed |
| S3 Jeffrey tries the preview | Done 2026-10-17 — approved (rulebook v0.238) |
| S4 Jeffrey pastes 0007 into the SQL Editor, then read-only checks | Done 2026-10-19: fingerprints match (82 rows), advisor expected-only, ALL 0007 TESTS PASSED |
| S5 Real check with Worcester's real times | Waiting |
| S6 Commit + merge (Main session) | Waiting |
| S7 Push = live | Needs a separate OK |

## What S2 added

- **Screens:**
  - `src/screens/Schedule.jsx` (frame; Both shows two schools)
  - in `src/screens/schedule/`:
    - `ScheduleSchool.jsx` (one school: loads, shows, saves)
    - `TimeGrid.jsx` (times on the side, box height = length, overlaps side by side)
    - `SlotDialog.jsx`
    - `PlanDialog.jsx`
    - `text.js`
- **Data:**
  - in `src/lib/schedule/`:
    - `api.js`
    - `useSchedule.js`
    - `time.js`
    - `versions.js`
    - `colors.js`
    - `checks.mjs` (run `node src/lib/schedule/checks.mjs`)
  - `src/lib/mockSchedule.js` (the preview database)
- **Styles:** `src/styles/schedule.css`.
- **Testing:** the class-delete confirmation now says "It's also removed from the schedule: N time slots."
  - `screens/testing/text.js`, `ClassesRanksTab.jsx`
- **Dialog frame:** the Tab key trap now includes dropdowns.
  - `components/Dialog.jsx`
- **Shared files touched:**
  - `src/App.jsx` (route, title, modal flag)
  - `src/components/navItems.js` (Schedule after Testing, `ti-clock`)
  - `src/lib/pageAddress.js` (`#schedule`)
  - `src/lib/mockClient.js` (plugs in the preview schedule + console helpers)
  - `src/main.jsx` (schedule.css)
- **Preview helpers** (F12 → Console):
  - `__tkdPreview.failNextScheduleSave()`
  - `simulateOtherAdminEditSchedule()`
  - `clearSchedule('Shrewsbury')`
  - `resetSchedule()`
  - and, as before, `setRole('staff')`.

## Design review (S2)

**High finding fixed:** on a phone, each day opens at its own first class.

**Medium and Low findings fixed:**
- Add-dialog buttons sit on the right.
- Both matches the mockup: one "Plan a change" and one blue "+ Add time slot", which ask "Which school?", plus pin headings.
- Boxes have tooltips with the full name and time.
- On a phone, "Plan a change" is under ⋯.
- Touch sizes: day buttons drawn 36px tall, and all 8 swatches fit one row.
- Days checkboxes stay on one row.
- After Remove, focus returns to the page.
- Remove shows "Removing…".
- "Undone" appears after the slot is back.
- The overlap note names every class.
- The delete text names the schedule that keeps running.
- The color group has an accessible name.
- Testing's sentence says the count covers every schedule.

## Combined classes (rulebook v0.237, added 2026-10-17)

- A time slot can hold one or more classes taught together. For example, Saturday 9:30 in preview is "White + Little Tiger".
- Migration 0007 (not live yet) now has `schedule_slot_classes`, and the PGlite suite still passes 54/54.
- The screens, preview database and checks are updated (13 groups pass).

## Known small compromises (accepted by Jeffrey at S3, 2026-10-17, v0.238)

- **320px phones:** the 7 day buttons are about 38px wide (a 44px width can't fit 7 across); they are 44px tall to tap.
- **Touch:** the color swatches' tap areas are 40px wide so all 8 fit one row.
- **Empty school:** "Add time slot" stays in the page header (the same as Testing) instead of under the message.
