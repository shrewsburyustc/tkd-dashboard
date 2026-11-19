# Event money reports + paid dates on rosters — status and decisions

**Branch:** `claude/event-reports-dfd86c` (worktree `event-reports-dfd86c`) · **Rulebook block:** Finance 0.800–0.899 (rows not written yet)
**Started:** 2026-11-17 · **Stage:** all 8 questions answered by Jeffrey 2026-11-19. Mockups updated for the answers. Next: migration numbers from Main, rulebook rows, contract, migration, tests, security review, build.

Jeffrey's request (2026-11-17): the boss wants each event to have its own report like the Daily report, and every roster should show the paid date next to Paid. Finance stays as it is.

## What the code already does (found 2026-11-17)

- **Paid date already shown:** Color belt testing, Star testing, Private testing. PC/tablet have a "Paid on" column, phones show "Cash · paid Nov 14".
- **Data already there, just not shown:** Camps (`camp_roster` view has `paid_on`, the last payment's date) and Board Breaking (`brk_event_roster` returns every payment with `paid_on`).
- **Data missing:** Black Belt's roster (`bb_cycle_roster`, 0025) has no payment date; it is only in the candidate detail. Needs a small additive change to that live function = a migration.
- **Event report data:** `finance_money_rows_core` already returns every section's payments with `event_id`, `event_name` and the stored school, but it is internal. The live readers (`finance_day`, `finance_export`) are by school and day (export is admin-only, logged, ≤366 days). No reader gives one event's payments, so the report needs new read-only function(s) built on the same rows, changing no live Finance function.

## Pictures (this folder: `TKD-EventReports-Mockups.html`, PNGs in `images/`)

ER1 where the report lives · ER2 a camp's report at PC / tablet / phone / 320 + the other layout · ER3 a Star event on Both schools + phones · PD1 the paid date on Camps, Board Breaking, Black Belt. Source: `tools/er-mockups.src.html`, built with `tools/build.mjs`, shot with `tools/shoot.mjs`. (Updated 2026-11-19: no Private testing report, Download CSV button added.)

## Jeffrey's answers (2026-11-19)

1. **Where:** A — a **Money report** button in the header of every event page.
2. **Layout:** B — one row per day, tap to open (Print opens every day).
3. **Who sees it:** admins only; hidden by Hide private details.
4. **Both schools:** follow the school switcher; boxes per school on Both.
5. **Private testing:** **no report.** Its money stays in Finance's Daily report only.
6. **Print / export:** **Print + CSV.** The CSV is admin only and every download is logged (Finance Export pattern, so a download-log table in the migration).
7. **Database:** standing OK for Main to reserve migration numbers; needs two: (a) event report reader + CSV + download log, (b) Black Belt roster paid date. Nothing applied to the live database without Jeffrey's OK.
8. **Paid date:** the day the student became **paid in full**; a dash while a balance is left. Color belt's pattern (PC/tablet "Paid on" column, phone "Cash · paid Nov 14"); hides with Hide private details; Black Belt via a small migration. (Jeffrey answered the date rule; the placement/rules part was taken as agreed.)

## Next

Ask Main for the two numbers (next free 0054) → rulebook rows (Finance block, after `git merge main`) → contract + migrations + PGlite tests + independent security review → build (event report page + route, buttons, roster paid dates, preview mock data) → design review (1280×800, 820×1180 touch, 390×844 touch, 320; admin and staff; Hide private details) → checks → commit → Main merges, Jeffrey pastes the migrations after his OK. Files likely touched: new `src/screens/finance/EventReport*.jsx` + `src/lib/finance/`; one button in each event page header (Camps `CampPage.jsx`, Board Breaking `EventPage.jsx` — tell Main before touching; Testing, Star, Black Belt cycle pages); roster files for the paid date (Camps `CampRoster.jsx`, Board Breaking `roster/Roster.jsx`, Black Belt `RosterRows.jsx`).
