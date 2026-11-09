# Calendar: every section's events — plan

**Asked by Jeffrey** (2026-11-05, relayed by Main): "Everything lol. Any EVENT that gets added even in the future, new prospects, etc. We need to see everything that is going on". He had made events in the sections and saw an empty Calendar.

He started this plan on 2026-11-06 ("Yes, start it"). Branch `claude/prospect-form-system-cd893d` (main 596c297 merged in). **Nothing is built before Jeffrey OKs it. No push.** Questions come one at a time, each with a picture.

## Today

- **The Calendar shows:**
  - classes (Schedule);
  - closures;
  - events added by hand;
  - free classes (Forms);
  - follow-ups (Prospects).
- **Each kind has its line** in the Show menu (v0.613, v0.615).
- **Testing:** v0.239 (1) approved "Testing events show on the Calendar automatically … clicking one opens it in Testing", but it was never built.
  - Month, Week and the day panel can already draw a Testing item (`days.js` `testing`, `MonthGrid.jsx`, `WeekView.jsx`, `DayPanel.jsx`).
  - The loader `loadTestingEvents()` (`src/lib/calendar/api.js:129`) is still a stub that returns nothing.
  - The rows can't be clicked.
  - If this loader fails, the whole Calendar fails (`useCalendar.js:45-50`).

## What the other sections store with a date

Checked 2026-11-06, read-only.
- **Who can read them:** every table below is readable by signed-in staff and admins, with the row rule `has_data_access()`.
- **No date-range reader exists** for any of them.

| Kind | Where | Date and time | School | Opens in its section |
|---|---|---|---|---|
| Color belt testing event | `testing_events` (+ `testing_event_classes` for times) | `testing_date`; no event time; its classes have `start_time` / `end_time` | `location_code` (one school) | `#testing/color-belt/event/<id>`; the school must be switched first (the page closes on another school or Both) |
| Color belt private testing | `testing_private` (one student per row) | `private_date`, `private_time` (start only); `status` active / cancelled | `location_code` | `#testing/color-belt/private/<id>`; school switched first |
| Star testing event | `star_events` | `testing_date`, `start_time`, `end_time` (optional, migration 0041) | none: Star is joint for both schools | `#testing/star/event/<id>` |
| Private Star test | `star_candidates` with `private_on` / `private_time` (one candidate) | `private_on`, `private_time`; `status` active / withdrawn | the candidate's `location_code` | no address on purpose: the hand-off Home uses (`handOffPrivate`, then the event's Students tab) |
| Black Belt testing day | `bb_cycle_days` (+ `bb_cycles`) | `day_date`, `start_time`–`end_time`, optional second part | `place_code` (a school) or `place_other` (free text) | `#testing/black-belt/cycle/<id>` |
| Camp day | `camp_days` (+ `camps`) | each `day`; the camp's daily `start_time`–`end_time` | `location_code`, or `both_schools` | `#camps/camp/<id>`; school switched first |
| New sign-up | `form_submissions.created_at` (+ the prospect's names) | the Massachusetts day it came in | `location_code` | the child in Prospects (the in-memory hand-off follow-ups use) |
| Deadlines | `auto_close_on` (Color Belt, Star), `signup_opens_on` / `signup_closes_on` / `early_until` (camps), `application_due` / `submissions_due` (Black Belt) | all day | as above | the section |

**Left off on purpose:**
- payment due dates and payment days (money, per child);
- Finance's close-the-day (money; past days are admin-only);
- check-in times and Joined dates (already on the child's profile).

## The proposal

1. **Read-only, no second copy** (v0.239 (1)).
   - Each item opens in its own section, where it is changed. On a school item, the Calendar first switches to that school, as `openTestingFor` does.
   - Admins still add other events by hand.
2. **How they look:** each kind is drawn like today's events. Month and Week chips, phone dots, a row in the day panel with a chevron (›).
   - Testing keeps the Testing purple (v0.239), with the section's own icon:
     - Color belt `ti-certificate`;
     - Star `ti-star`;
     - Black Belt `ti-award`.
   - Camps use the teal of the starting "Camp" event type, with `ti-tent`.
   - New sign-ups get one count chip per day, as follow-ups do (v0.612): `ti-address-book`, "2 new sign-ups". The day panel lists them.
3. **Children are named as on today's Calendar.** Follow-ups say "Ava N." (v0.615, v0.637), so:
   - a private testing says "Private · Ava N.";
   - a new sign-up says "Ava N.".
   - Never a date of birth, contact details, payments or notes.
4. **Times:**
   - A Color belt event runs from its first class's start to its last class's end; it is all day with no classes.
   - A Star event: start–end, or start only when there is no end.
   - A camp day: the camp's daily times.
   - A Black Belt day: its part(s).
   - Week view places them in their hours.
5. **Show menu:** following v0.613 and v0.615 ("Testing events get their 'Testing' line"), it gains **Testing** (Color belt and Star, events and private tests), **Black Belt**, **Camps** and **New sign-ups**, plus **Deadlines** if question 2 says yes.
   - That makes 9 or 10 lines.
   - Everything is shown at first, and a kind added later starts shown.
6. **A source that fails to load** shows a gray line in the day panel ("Couldn't load testing."), and the rest of the Calendar still shows, as follow-ups do (v0.615).
   - The Testing loader stops breaking the whole Calendar.
7. **A standing rule** (a 10b row, for Jeffrey's OK at the end): anything dated that any section adds later shows on the Calendar, with its own Show line. The section that adds it also adds it to the Calendar's reader.

## Questions for Jeffrey (one at a time)

1. **How the Calendar reads them** (asked 2026-11-06; picture `Calendar-All-Q1.png`). **Jeffrey: "B: one reader"** (2026-11-06). **Migration 0045** reserved by Main (main 22df2eb): `0045_*.sql`, SETUP "## Migration 0045: …", `step0045`.
   - **A, no migration:** the app reads each section's tables itself, like follow-ups (v0.615).
     - About 8 reads per month view.
     - The browser gets full child names (first and last) and drops what it doesn't show.
     - The preview's date filters go into other sections' fake-data files (Testing, Star, Camps), which other sessions own.
   - **B, one database reader (recommended):** `calendar_items(p_from, p_to)`, a read-only database function (security definer, `has_data_access()` first, nothing for anon).
     - One read.
     - Only what the Calendar shows leaves the database ("Ava N." is made inside it).
     - One fake reader in our own `mockCalendar.js`.
     - Costs a migration: the number comes from Main, then PGlite tests, a security review, and Jeffrey pastes it and runs the tests file.
     - Each later dated thing extends it with a small migration.
2. **Deadlines** (registration closes, camp sign-up opens / closes, the early price ends, Black Belt applications / submissions due): show them as small all-day chips with their own Show line, or leave them off. Asked 2026-11-06 (picture `Calendar-All-Q2.png`). A, recommended: dashed gray chips with `ti-flag` (a new icon-map row), a Deadlines part in the day panel and a Show line. B: leave them off. **Jeffrey: "A: show them"** (2026-11-06).
3. Anything his answers or the mockups turn up.

Then come the mockups at the four sizes (PC 1280, tablet 820 touch, phone 390 touch, 320 wide) → his OK → build in preview mode → reviews (design, code, and security for the migration) → he tries it → commit → report to Main.

## Expected files

- **Calendar:** `src/lib/calendar/api.js`, `useCalendar.js`, `days.js`, `showKinds.js`, `checks.mjs`; `src/screens/Calendar.jsx`, `calendar/MonthGrid.jsx`, `WeekView.jsx`, `PhoneMonth.jsx`, `DayPanel.jsx`, `calendar/text.js`, `src/styles/calendar.css`; `src/lib/mockCalendar.js`.
- **Shared:** `src/App.jsx`, so the Calendar gets the open-in-section calls App already has (`openEvent`, `openPrivate`, `openStarEvent`, `handOffPrivate`, `openBlackBelt`, `openCamp`).
- **Migration (B, chosen):** `supabase/migrations/0045_calendar_items.sql`, its tests and fingerprints files, a SETUP section "## Migration 0045: …" and `step0045` in `run.mjs`. Main reserved the number and has the list of tables it reads: Testing, Star, Black Belt, Camps, Forms / Prospects.
