# Calendar — status

**Design review changes (N1–N17):** see `STATUS-DesignReview.md`.

Branch `claude/prospect-form-system-cd893d`. Plan: `TKD-Calendar-Build-Plan.md` (approved 2026-10-17). Rulebook v0.234 (design) and v0.239 (plan answers). Approved mockup: `TKD-Calendar-Mockups.html` rev 1.

**Database live, app not yet.** Migration 0008 is applied to the live Supabase database. Jeffrey pasted it into the Supabase SQL Editor on 2026-10-19 (order 0007 → 0008 → 0009 → 0012, after 0001–0006 and Color Belt's 0010). For each: the live fingerprints equal the PGlite live-order copy exactly (row count + one hash over every row), the security advisor showed only the expected entries (signed-in users may run the checked write functions; internal tables have RLS on and no read rule on purpose), and the tests file passed (run with the real admin and front-desk IDs, rolled back). Nothing has been pushed: the live dashboard has no Calendar screen until this branch is merged into main and pushed.

| Step | State |
|---|---|
| C0 Plan + questions Q1–Q4 | Done 2026-10-17 (v0.239) |
| C1 Migration 0008 + tests + security review | Done 2026-10-18; PGlite 67/67 |
| C2 Screens + preview data + design review | Done 2026-10-18 |
| C3 Jeffrey tries the preview | Done 2026-10-18 — six mockup differences decided (rulebook v0.240) |
| C4 Jeffrey pastes 0008 (after 0005–0007 are live), then read-only checks | Done 2026-10-19: fingerprints match (99 rows), advisor expected-only, ALL 0008 TESTS PASSED |
| C5 Real check: one real closure and one real event | Deferred to go-live (Jeffrey, 2026-10-19): closures and events are entered then |
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

## Deployed 2026-10-20

This branch is on `main` and live (the push included `0ccf776`; live `main` = `cc8b095`). Checked on https://tkd-dashboard.pages.dev: `/f/…` and `/forms` have the strict security policy, the dashboard keeps its own, and `GET /api/forms/<slug>` answers `not_open` (PUBLIC_FORMS=off). Next: Jeffrey looks at the new sections signed in; then PUBLIC_FORMS=on + redeploy, one real test sign-up, the two-connection race test.

## 2026-10-21: follow-ups on the Calendar + one "Show" menu (rulebook v0.612-v0.613) - design only, nothing built

- Decided (Jeffrey): prospects' follow-up dates show as one count chip per day (amber = due today or overdue), with a Follow-ups list in the day panel that opens Prospects (v0.612).
- Rule for every Calendar item, now and later: one compact **Show** menu with a tick box per kind (Classes, Closures, Events, Free classes, Follow-ups). It is remembered per person on that device and everything is on at first (v0.613).
- Mockups (design-reviewed, fixes applied): `Calendar-show-mockup-PC.png`, `Calendar-show-mockup-tablet-phone.png`. Earlier drafts: `Calendar-followups.png`, `Calendar-toggles.png`, `Calendar-show-menu.png`.
- Mockups approved by Jeffrey 2026-10-21 (v0.614). Build plan written and reviewed: `TKD-Calendar-Show-Build-Plan.md`.
- Next: Jeffrey answers Q1 (A = reuse prospects_list, no migration, recommended; B = new function, migration 0025 via Main) and OKs the plan's corrections ("Ruby A." naming, Overdue / Due today tags) -> build B1-B8 in preview -> reviews -> Jeffrey tries it -> commit.

## 2026-10-21: follow-ups + Show menu BUILT in preview (rulebook v0.615) - not committed, nothing live

- Q1 = A (Jeffrey): reads through prospects_list, no migration. Built steps B1-B8 of `TKD-Calendar-Show-Build-Plan.md`.
- New files: `src/lib/prospects/followUps.js` (shared rule, also used by Prospects), `openRequest.js`, `src/lib/calendar/showKinds.js`, `useFollowUps.js`, `src/screens/calendar/ShowMenu.jsx`. Changed: Calendar.jsx, MonthGrid/WeekView/PhoneMonth/DayPanel, calendar text.js + calendar.css, Prospects.jsx, prospects text.js, App.jsx (shared: staff id + hand-over + clear at sign-out), mockProspects.js, SETUP wording.
- Checks: all checks.mjs pass (calendar 15 groups), both builds pass, forms dist check passes after `npm run build`.
- Design review: no must-fix; 3 should-fix applied (quieter blue chip edge, bigger darker ring, menu heading hidden from screen readers). Security review: no must-fix; 3 should-fix applied (hand-over expires after 1 min and clears at sign-out, one shared empty list, loader can't hang).
- Screens: `Calendar-show-built-PC.png`, `Calendar-show-built-tablet-phone.png`.
- Next: Jeffrey tries it in preview -> commit on this branch -> Main merges -> Jeffrey OKs deploy. Later: a Testing line in the menu once Testing events load into the Calendar.
- **Deployed 2026-10-21** (main 09f0b95, live 09:53 UTC). Left for Jeffrey: on the live site, check the Calendar's follow-ups match Prospects' "Follow up today".
- **Live check passed 2026-10-21 (Jeffrey):** the Calendar's follow-ups match Prospects' "Follow up today", and tapping one opens the child. Done.

## Every section's events on the Calendar (Jeffrey, 2026-11-05) — queued behind migration 0042

His words, relayed by Main: "Everything lol. Any EVENT that gets added even in the future, new prospects, etc. We need to see everything that is going on". He made events and saw an empty Calendar.

**Main's findings:**
- `src/lib/calendar/api.js:129` `loadTestingEvents()` is still the stub that returns `[]`. v0.239 (1) ("Testing events show on the Calendar automatically … once those sections are built") was approved but never built.
- Live data (read-only): calendar_events 0, star_events 1, testing_events 1, camps 2, bb_cycles 0.

**To confirm in the plan:**
- read-only, no second copy (v0.239 (1)); clicking an item opens it in its own section;
- the sources:
  - Color Belt testing events and private testings;
  - Star testing events (with 0041's end time) and private stars;
  - each camp's days;
  - Black Belt cycles and testing dates;
  - Prospects follow-ups and free-class bookings already show; does "new prospects" mean more (new sign-ups / visits on their day)?
- a standing 10b rule: anything dated that any section adds shows on the Calendar;
- the Show menu (v0.613) gains a kind per section.

**How:**
- probably one calendar reader, or one per section: a migration, with the number through Main;
- each section's private data stays out (no DOB, address, medical or billing);
- plan, then mockups at the four sizes, then Jeffrey's OK, then reviews (security for the migration);
- tell Main which sections' tables it reads.

**2026-11-06: plan started** (Jeffrey: "Yes, start it"). Plan: `TKD-Calendar-AllEvents-Plan.md`.
- **Inventory** (two read-only explorers):
  - Readable by staff and admins with `has_data_access()`: Color belt events (+ their classes' times) and private testings; Star events (with 0041's end time) and private Stars (`star_candidates.private_on`); camp days; Black Belt testing days; sign-ups (`form_submissions.created_at`); and deadlines (registration close, camp sign-up / early price, Black Belt applications / submissions due).
  - No date-range reader exists for any of them.
  - Left off: payments, money due dates, Finance's close-the-day.
- **Proposal:**
  - read-only, opening in its own section (switching school first where the page needs it);
  - Testing purple with each section's icon; camps teal; new sign-ups one count chip per day, like follow-ups;
  - children only as "Ava N.";
  - Show lines: Testing, Black Belt, Camps, New sign-ups (+ Deadlines);
  - a failed source shows a gray line, not a broken Calendar;
  - a standing 10b rule for later dated things.
- **Question 1 asked 2026-11-06** (picture `Calendar-All-Q1.png` / `.html`): A, the app reads each section's tables (no migration), or B, one database reader `calendar_items(from, to)` (recommended; migration via Main). **Jeffrey: "B: one reader"** (2026-11-06; goes into the plan's 10b row once all answers are in).
- **Migration 0045 reserved by Main 2026-11-06** (main 22df2eb, merged in here by fast-forward): `0045_*.sql`, SETUP "## Migration 0045: …", run.mjs `step0045`; next free 0046. The SQL is written in the build step, after the mockups are OK'd.
- **Question 2 asked 2026-11-06** (picture `Calendar-All-Q2.png` / `.html`): A, show deadlines (registration closes; camp sign-up opens / closes and the early price ends; Black Belt applications / submissions due) as dashed gray chips with `ti-flag` (a new icon-map row), a Deadlines part in the day panel, and their own Show line (recommended); or B, leave them off. **Jeffrey: "A: show them"** (2026-11-06; also goes into the plan's 10b row).
- **Mockups sent 2026-11-06** (real preview Calendar, new items outlined amber): `Calendar-All-1-month-pc-tablet.png`, `-2-month-phone.png` (390 and 320), `-3-week.png` (PC, tablet), `-4-show-menu.png` (PC, phone). Waits on Jeffrey's OK, screen by screen.
- **Noted in the pictures:** on a tablet the Week view's narrow columns shorten long names ("Private …", "Registratio n closes"); a tap opens the full item. The phone month shows a dot per item (three at most); new sign-ups are in the day panel only.
- **Jeffrey: "OK, build it"** (2026-11-06). **Rulebook v0.645** written (10b row + changelog + `ti-flag` icon-map row; header 0.645). **Contract** `CONTRACT-0045.md` (the reader's exact shape) written; **build started 2026-11-06** in two parts at once, as two helpers: the database half (`0045_calendar_items.sql`, tests, fingerprints, SETUP section, `step0045`) and the app half (`api.js`, `useCalendar`, `days.js`, `showKinds.js`, the five Calendar views, text, css, `mockCalendar.js`, opening items in their sections via App.jsx).
- **Built and reviewed 2026-11-06 (nothing committed or applied):**
  - **Database half** (`supabase/`): `0045_calendar_items.sql`, `0045_tests.sql`, `0045_preapply_check.sql`, `0045_fingerprints.sql`, `supabase/manual/0045u_undo.sql`, SETUP "## Migration 0045: Calendar reader (calendar_items)" (status "built, not applied") and `step0045` in `run.mjs`. Full PGlite runner passes (0 failed). Expect `0008_fingerprints.sql`, which lists every `calendar_%` function, to gain two lines for `calendar_items` once it is applied (left unedited, as 0042 did with 0009's).
  - **Security review** (separate reviewer): **no must-fix.** Applied: the guard checks every column the function reads, and an infinite date answers `invalid`, not an error. New exposure noted for Jeffrey: one call lets any unlocked staff session list private-test children as "Ava N.", new sign-ups with the form's name and school, for any 63-day window; every item is something another section's screen already shows staff.
  - **App half** (`src/`): `items.js` (new), `api.js`, `days.js`, `showKinds.js`, `useCalendar.js`, `Calendar.jsx`, the five Calendar views, `text.js`, `calendar.css`, `mockCalendar.js`; shared files touched: `src/App.jsx` (six props passed to Calendar, reusing App's own openers) and `src/lib/mockClient.js` (a `failNextCalendarItems()` preview helper).
  - **Code review: no must-fix.** Applied: Week view shows the gray "couldn't load" line too; the day panel's spoken names include the time; the phone's deadline dot is darker (#858580, 3:1); a comment fixed.
  - **Design review** at the four sizes: **no must-fix**; matches the approved pictures. Applied: a deadline chip has its own white fill (its gray text was 4.45:1 on today's tinted cell). Left as is: focus lands on the page after a row opens another section (how navigation works across the dashboard), the lilac phone dot is 2.3:1 (it repeats what the day's spoken label says), sign-ups can't be opened from Week view (no day panel there).
  - The preview's sample items point at made-up ids, so clicking one lands on that section's not-found page; the real reader returns real ids.
- **Committed f984875e** (2026-11-07, Jeffrey: "Yes, commit"); not pushed, 0045 not applied.
- Next: Main merges and pushes only after Jeffrey pastes 0045 (after his OK) and the tests file passes: **live before the app that uses it merges**.