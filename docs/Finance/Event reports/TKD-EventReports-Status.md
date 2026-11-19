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

## Built 2026-11-19 (nothing committed to main, nothing pushed, nothing applied)

- **Numbers:** 0054 = event report reader + admin CSV + download log; 0055 = Black Belt roster `paid_on` (reserved by Main). Rulebook rows v0.827, v0.828 (header 0.828). Contract: `CONTRACT-0054-0055.md`.
- **Database (written, PGlite tests green: 3994 passed; independent security review in progress):** `supabase/migrations/0054_finance_event_report.sql`, `0055_black_belt_roster_paid_on.sql`, tests, fingerprints, pre-apply checks, SETUP sections. Deviations from the contract: NULL dates find no payments in `finance_money_rows_core`, so the helpers pass 2020-01-01 → today; four owner-only helpers (`finance_event_check/items/figures/extras`); `finance_exports`-style table access (RLS on, no policy, no grants). 0054 contains the word "delete" (append-only trigger), so Jeffrey pastes it in the SQL Editor.
- **App:** `src/screens/finance/EventReport*.jsx`, `MoneyReportButton.jsx`, `src/styles/finance-event-report.css`, `src/lib/finance/eventReport*.js`, preview data `mockEventReport.js`; shared files touched: `src/App.jsx`, `src/lib/pageAddress.js`; the button inserted in the headers of the five event pages (`testing/event/EventPage.jsx`, `testing/star/event/StarEventPage.jsx`, `blackBelt/staff/cycle/CyclePage.jsx`, `camps/CampPage.jsx`, `breaking/EventPage.jsx`). Paid date on Camps, Board breaking and Black Belt rosters.
- **Design review:** no High; Medium/Low fixed (focus on arrival, tab title, no Print/CSV when empty, ⋯ focus). Left: headers wrap taller at 820 / phones.
- **Order to go live:** paste 0054, run its tests, paste 0055, run its tests, then the app merges (the Black Belt roster would show no dates before 0055; the report page fails before 0054).

## Next

Security review result → fixes → commit on the branch → Main merges, Jeffrey pastes 0054 and 0055 after his OK.
