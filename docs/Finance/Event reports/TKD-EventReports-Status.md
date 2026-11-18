# Event money reports + paid dates on rosters — status and questions

**Branch:** `claude/event-reports-dfd86c` (worktree `event-reports-dfd86c`) · **Rulebook block:** Finance 0.800–0.899 (nothing written yet: no decision made)
**Started:** 2026-11-17 · **Stage:** mockups drawn, waiting on Jeffrey's answers. Nothing built, no migration number reserved yet.

Jeffrey's request (2026-11-17): the boss wants each event to have its own report like the Daily report, and every roster should show the paid date next to Paid. Finance stays as it is.

## What the code already does (found 2026-11-17)

- **Paid date already shown:** Color belt testing, Star testing, Private testing. PC/tablet have a "Paid on" column, phones show "Cash · paid Nov 14".
- **Data already there, just not shown:** Camps (`camp_roster` view has `paid_on`, the last payment's date) and Board Breaking (`brk_event_roster` returns every payment with `paid_on`).
- **Data missing:** Black Belt's roster (`bb_cycle_roster`, 0025) has no payment date; the date is only in the candidate detail. Needs a small additive change to that live function = a migration.
- **Event report data:** `finance_money_rows_core` already returns every section's payments with `event_id`, `event_name` and the stored school, but it is internal (no one can call it), and the live readers (`finance_day`, `finance_export`) are by school and day (export is admin-only, logs every call, at most 366 days). No reader gives one event's payments. So the report needs ONE new read-only function (`event_money_report(source, event_id)` or similar), built on the same rows, changing no live Finance function. Private testing rows have no event id (each private test is one student), so it needs a month-based variant.

## Pictures (this folder: `TKD-EventReports-Mockups.html`, PNGs in `images/`)

ER1 where the report lives · ER2 a camp's report at PC / tablet / phone / 320 + the other layout · ER3 a Star event on Both schools, Private testing by month, phones · PD1 the paid date on Camps, Board Breaking, Black Belt (PC, tablet, phone, 320). Source: `tools/er-mockups.src.html`, built with `tools/build.mjs`, shot with `tools/shoot.mjs`.

## Questions for Jeffrey (asked together)

1. **Where does the report live?** A: Money report button on every event page (recommended) · B: Money tab · C: Events tab inside Finance · D shows who sees it.
2. **Layout of the report:** B: one row per day, tap to open (recommended) · A: every day a full block.
3. **Who sees it:** admins only (recommended; same as Finance, hidden by Hide private details) · staff too.
4. **Both schools:** follow the school switcher; boxes per school on Both (recommended).
5. **Private testing:** a month report (recommended) · none.
6. **Print / export:** Print only (recommended) · Print + CSV (the CSV needs a download log, so more database work).
7. **Database:** OK to ask Main for a migration number for the new read-only function (0054 is next free)?
8. **Paid date on rosters:** Color Belt's pattern; date = day the payment was paid, for several payments the one that made them paid in full, dash while a balance is left (recommended) · or the last payment's date even when a balance is left. Hides with Hide private details. Black Belt needs one small migration (a second number).

## Next (after answers)

Rulebook rows in Finance's block, contract + migration + tests + security review for the database parts, then build, review, Main merges. Files likely touched when building: new `src/screens/finance/EventReport*.jsx` + `src/lib/finance/`; one button in each event page header (Camps `CampPage.jsx`, Board Breaking `EventPage.jsx` — tell Main before touching); roster files for the paid date (Camps `CampRoster.jsx`, Board Breaking `roster/Roster.jsx`, Black Belt `RosterRows.jsx`).
