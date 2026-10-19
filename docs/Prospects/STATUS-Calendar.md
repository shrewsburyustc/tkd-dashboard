# Calendar — status

Branch `claude/prospect-form-system-cd893d`. Plan: `TKD-Calendar-Build-Plan.md` (approved 2026-10-17). Rulebook v0.234 (design) and v0.239 (plan answers). Approved mockup: `TKD-Calendar-Mockups.html` rev 1.

**Nothing is live.** Migration 0008 has not been applied to Supabase, and nothing has been pushed. 0008 can only go live after 0005 (Color Belt phase 2), 0006 (Star testing) and 0007 (Schedule).

| Step | State |
|---|---|
| C0 Plan + questions Q1–Q4 | Done 2026-10-17 (v0.239) |
| C1 Migration 0008 + tests + security review | Done 2026-10-18; PGlite 67/67 |
| C2 Screens + preview data + design review | Done 2026-10-18 |
| C3 Jeffrey tries the preview | Done 2026-10-18 — six mockup differences decided (rulebook v0.240) |
| C4 Jeffrey pastes 0008 (after 0005–0007 are live), then read-only checks | Waiting for 0005, 0006, 0007 live |
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

## What C2 added (2026-10-18)

- **Screens:** `src/screens/Calendar.jsx` plus these files in `src/screens/calendar/`:
  - `MonthGrid`, `PhoneMonth`, `DayPanel`, `WeekView`
  - `EventDialog`, `ClosureDialog`, `EventTypesDialog`
  - `text.js`

  Styles are in `src/styles/calendar.css`.
- **Data:** `src/lib/calendar/` has `rules.js`, `days.js`, `api.js`, `useCalendar.js` and `checks.mjs` (10 groups pass).
- **Preview database:** `src/lib/mockCalendar.js`. It includes sample events, a holiday, an evening storm closure and the 5 types, plus `__tkdPreview.failNextCalendarSave()`, `simulateOtherAdminEditCalendar()`, `clearCalendar()` and `resetCalendar()`.
- **Shared files touched:**
  - `navItems.js` (Calendar after Schedule)
  - `pageAddress.js` (`#calendar`)
  - `App.jsx`, `main.jsx`, `mockClient.js` (adds `lte` / `gte` / `in` reads)
  - `schedule/TimeGrid.jsx` (`layoutDay` exported)
- **Testing events (v0.239 answer 1):** `loadTestingEvents()` returns nothing until 0005 and 0006 exist. Then it reads them, and clicking one should open Testing.

## Design review (2026-10-18)

No High findings. Fixed:
- The Closure icon is now `ti-calendar-off`.
- Day boxes show "4 classes" with "2 cancelled" crossed out below.
- The screen-reader day label now includes cancellations and schedule starts.
- Event types can be reordered with up/down arrows.
- Focus no longer gets lost after backing out of Delete type.
- In the Week view, the closed hours are striped.
- The School switch is now its natural width.
- Edit uses `ti-edit`.
- Fewer screen-reader announcements.
- All-day date fields fill the row at 320.
- Esc steps back inside Event types.
- Staff view dialogs hide the typing hints.
- Week-view chips have 44px tap areas.
- Also fixed in testing:
  - the Week view now opens on the chosen day's week;
  - the Delete button stays gray until a "Move to" type is picked;
  - the notes box uses the page font;
  - a style name no longer clashes with Testing's.

## C3 decisions (Jeffrey, 2026-10-18, rulebook v0.240)

1. Closure dialog: **School moved above "What's cancelled"** (built).
2. The closure reason in the day box: kept as built.
3. The closure chip in the Week view's All day row: kept.
4. No school line under the dialog title: kept.
5. **Event types: drag grip and ⋯ → Edit / Move up / Move down / Delete type**, like Testing (built; replaces the arrows). Delete from the ⋯ menu looks up how many events use the type first.
6. Icons `ti-calendar-event` (Add → Event) and `ti-palette` (Event types) were added to the icon map.
