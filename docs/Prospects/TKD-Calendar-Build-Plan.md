# Calendar — build plan (approved 2026-10-17)

Branch `claude/prospect-form-system-cd893d` · 2026-10-17 · implements the Calendar decisions (rulebook v0.138) · approved mockup `docs/Prospects/TKD-Calendar-Mockups.html` rev 1 (all 12 details) · builds on the Schedule (`TKD-Schedule-Build-Plan.md`, migration 0007) · **nothing is built until Jeffrey says OK.**

## 0. What gets built

A new **Calendar** section (rail icon `ti-calendar-month`, after Schedule, address `#calendar`). It shows, for each date:
- the **regular classes**, worked out from the Schedule. For any date, the schedule in effect is the one with the latest start date on or before that date. Nothing is copied;
- **closures**, either a whole day (or several days), or only some classes on one day;
- **school events** (testing days, tournaments, …), colored by their **event type**.

Free-class bookings are **not** in this step. They arrive with Forms (step 3), and nothing is left in their place (decided v0.138).

Views:
- **Month view** (the default) shows summary day boxes. Clicking a day opens the **side panel** on PC.
- **Week view** (PC and tablet) reuses the Schedule's time grid with real dates and an "All day" row.
- On a **tablet held upright**, the month sits above the chosen day.
- On a **phone**, a small month with colored dots, and the chosen day listed underneath.

Admins add and edit; staff view only. On Both, chips start with W or S (W S for both schools), and class counts add the two schools together.

Not in this step: bookings, Forms, Prospects.

## 1. Before any code

- **Migration number: `0008`.** Checked on 2026-10-17 across main, color-belt, star-testing and every worktree: 0005 is Color Belt phase 2, 0006 is Star testing, 0007 is Schedule (this branch), and nothing claims 0008. Check again right before C1.
- **Claim the numbers on main (recommended):** main doesn't know that 0007 and 0008 are taken, because this branch hasn't merged yet. A one-line note in main (the Main session, with Jeffrey's OK) stops another branch from taking them.
- Nothing from main needs bringing in first. The last merge was ce48d55.

## 2. Database — migration `0008_calendar.sql`

0008 comes after 0007 (it reads `schedule_slots`), so it can only go live after 0007.

### 2a. Tables

**`calendar_event_types`** holds the event types. They are shared by both schools (v0.138).
- Columns:
  - `id uuid pk`
  - `name text` (1–40 characters, unique ignoring case, using the Testing name rules)
  - `color text` (one of the 8 class colors, never red)
  - `position smallint` (list order)
  - bookkeeping as in Testing: `version`, `created_*`, `updated_*`, `*_by_name`

**`calendar_events`** holds one row per event.
- Columns:
  - `id uuid pk`
  - `location_code text null` → `locations`, where **null means both schools**
  - `type_id uuid` → `calendar_event_types` **on delete restrict** (a type in use is only removed by `calendar_delete_type`, which moves its events first)
  - `title text` (1–80 characters)
  - `starts_on date`, `ends_on date` (same day or later; at most 31 days long)
  - `all_day boolean`
  - `starts_at time null`, `ends_at time null` (both set when not all day, both empty when all day; on a one-day event the end must be after the start)
  - `notes text null` (up to 1,000 characters, under "More details")
  - bookkeeping as above

**`calendar_closures`** holds one row per closure.
- Columns:
  - `id uuid pk`
  - `location_code text null` (null = both schools)
  - `starts_on date`, `ends_on date` (at most 31 days)
  - `reason text` (1–80 characters, shown on the calendar)
  - `whole_day boolean`
  - bookkeeping as above
- Rule: **some classes only** (`whole_day = false`) is allowed only when `starts_on = ends_on` (single day, v0.138).

**`calendar_closure_classes`** lists which classes a "some classes" closure cancels. The exact shape depends on **Q2**; this is the recommended one.
- Columns:
  - `id uuid pk` (the change log needs an `id` on every logged table, as in 0007)
  - `closure_id` → `calendar_closures` (on delete cascade)
  - `location_code text not null` (the class's own school, even when the closure is for Both)
  - `weekday`, `starts_at`, `ends_at`
  - `class_ids uuid[]`: a **snapshot** of the time slot as it was on that date
  - `slot_id uuid null`: a hint only
  - bookkeeping
- Unique `(closure_id, location_code, starts_at, class_ids)`.
- **Why a snapshot:** schedules can change after a closure is saved. A planned schedule can start earlier, a slot can move to another day, and Undo can re-add a slot with a new id. A bare link to a slot id would then point at the wrong class, and the cancelled class would silently show as running. With a snapshot, the screen matches each cancelled class against the classes actually in effect that day. Anything that no longer matches shows as an amber line: "Cancelled class no longer on the schedule: Group A 4:30".
- When the slot list changes, the closure's `version` goes up, so an open dialog becomes stale.

### 2b. Safety (Handoff §6, same as 0003 and 0007)

- RLS is on for all four tables.
- `revoke all` from public, anon, authenticated and service_role.
- Column grants: `select` only, to authenticated.
- Read policy: `using ((select public.has_data_access()))`. Staff and admins both read; nothing goes to anon.
- No write grants: every change goes through the functions in 2c.
- Bookkeeping trigger `calendar_before_write` (same idea as `schedule_before_write`), `change_log_write()` and the truncate guard are on every table. `change_log.location_code` accepts null, so Both rows are logged with no school.
- **Function rights:** `revoke execute` from public, anon, authenticated and service_role on every function, including the trigger functions. Then `grant execute` to authenticated on the write functions only, as 0007 does.
- **Text checks:** title, reason, type name and notes get the same control-character and invisible-character checks as the Testing names (CONTRACT-0003 #4), not only length limits.
- **Index:** one per table on `(starts_on, ends_on)`, for the date-range reads.
- **Privacy:** events and closures hold no student data. The notes field gets a hint ("Don't put student details here").

### 2c. Write functions (admin only)

Same pattern as 0007:
- `security definer`, `search_path = ''`, returns jsonb.
- Order: `has_data_access` → `is_admin` → input → lock the school row(s) (both, in a fixed order, for Both) → version check → write.
- Change-log action and batch tags are set.

| Function | Does |
|---|---|
| `calendar_add_event(p_location_code, p_type_id, p_title, p_starts_on, p_ends_on, p_all_day, p_starts_at, p_ends_at, p_notes)` | New event. |
| `calendar_update_event(p_event_id, p_expected_version, …same fields)` | Edit. |
| `calendar_remove_event(p_event_id, p_expected_version)` | Remove. Returns the old values so Undo can add it back. |
| `calendar_add_closure(p_location_code, p_starts_on, p_ends_on, p_reason, p_whole_day, p_slot_ids uuid[])` | New closure. Each ticked slot must be in the schedule in effect on that date for **its own** school, on that weekday. The closure's school must be that school, or Both. The function saves the snapshot. |
| `calendar_update_closure(p_closure_id, p_expected_version, …same fields)` | Edit. A new date, or a switch to "whole day", **replaces** the class list. |
| `calendar_remove_closure(p_closure_id, p_expected_version)` | Remove; returns the old values for Undo. |
| `calendar_add_type(p_name, p_color)` / `calendar_update_type(p_type_id, p_expected_version, p_name, p_color)` | Event types. Recoloring a type recolors all its events, because the color is read from the type. |
| `calendar_reorder_types(p_expected_ids, p_new_ids)` | List order. |
| `calendar_delete_type(p_type_id, p_expected_version, p_expected_event_count, p_move_to_type_id)` | If the type is in use: the confirmation shows how many events, and they move to the chosen type first. A count that doesn't match returns `stale`. A type in use with nowhere to move its events returns `not_allowed`. |

**Locking for shared things:** event types belong to no school, and Both events and closures belong to two. These functions lock **both** `locations` rows, always in the same order (shrewsbury, then worcester), so two admins can't deadlock.

**Status codes:** `ok`, `no_access`, `not_allowed`, `invalid`, `not_found`, `stale`, `duplicate_name`.

**Multi-day events with times:** for example, from Fri 7:30 pm to Sun 12:00 pm.
- The day boxes say "Fri 7:30 pm → Sun".
- Week view shows the event in the All day row with its times written in, like other multi-day events.
- The rule lives in `days.js` and is tested in `checks.mjs`.

**Dates:** events and closures can be in the past or the future. Past ones can still be edited, for example to fix a typo; every change is logged.

### 2d. Reading

- The app reads the tables directly through RLS, only for the dates on screen (a month plus the grayed edge days, or a week). It uses overlap queries: `starts_on <= last day and ends_on >= first day`.
- Classes come from the Schedule data (`loadSchedule`). On Both it loads each school.
- `schedule_today()` (0007) gives "today" in Massachusetts time.

## 3. Tests

**`supabase/tests/0008_tests.sql`** (style of 0007; one transaction ending in ROLLBACK). It checks:
- every shut-out session type (A2–A7) and anon can't read or write the four tables;
- staff (D1) can read but can't write;
- admin writes work, including `stale`;
- input rules:
  - dates, the 31-day limit and times;
  - "some classes" only on one day;
  - slots from the wrong school, weekday or schedule;
  - the name, text and color rules, and no red;
- a Both closure with classes from each school;
- Both and event-type writes lock both school rows (checked with `pg_locks` inside a test, or else covered by code review);
- a type in use moves its events on delete, and a type with nowhere to move returns `not_allowed`;
- **schedule changes after a closure:**
  - a planned schedule that now starts earlier;
  - a slot moved to another day;
  - a slot removed, and its Undo;
  - a class deleted in Testing;
  
  The snapshot keeps the cancellation, and the screen helper flags anything that no longer matches;
- every write lands in the change log with the right action and batch;
- anon and staff can't execute any function;
- catalog checks on every object 0008 creates.

**Also:**
- `0008_fingerprints.sql`;
- `pglite/run.mjs` applies 0008 after 0007, twice, with identical fingerprints, plus the upgrade path;
- `src/lib/calendar/checks.mjs` for the date maths ("which schedule is in effect on this date", which classes are cancelled, month grid edges, multi-day events) and the preview database.

**All must pass:** both builds, the PGlite suite, and the Schedule, Testing and Calendar checks.

## 4. Front end

**New files** (each with a plain-English header):
- `src/screens/Calendar.jsx`;
- under `src/screens/calendar/`:
  - `MonthGrid.jsx`
  - `DayPanel.jsx` (side panel, or stacked under the month)
  - `PhoneMonth.jsx` (dots plus the day list)
  - `WeekView.jsx` (wraps the Schedule's `TimeGrid` with dates, the All day row and striped closed hours)
  - `EventDialog.jsx`
  - `ClosureDialog.jsx`
  - `EventTypesDialog.jsx`
  - `CalendarSkeleton.jsx`
  - `text.js`
- under `src/lib/calendar/`: `api.js`, `useCalendar.js`, `days.js` (builds each date: classes in effect, cancelled ones, events, closures, the "new schedule starts" chip), `checks.mjs`;
- `src/styles/calendar.css`;
- preview mode: `src/lib/mockCalendar.js`, with sample events (a testing day, a tournament), one whole-day closure, one "some classes" closure, three event types, and `__tkdPreview` helpers.

**Reused:**
- Schedule's `TimeGrid`, `colors.js`, `time.js` and `versions.js`. Small changes only, such as letting TimeGrid show dates and stripes; the Schedule screens keep working;
- `Dialog`, `RowMenu`, `Toast`, `Notice`, `ErrorBanner`, `useShortcutN` (N = Add), `useMediaQuery`, `backButton`.

**Shared files touched** (listed for the merge):
- `navItems.js` (Calendar after Schedule). For now the phone bar shows Home, Testing, Schedule, Calendar (checked at 320 px wide). The final bar (v0.140: Home, Calendar, Prospects, More) comes with step 4.
- `pageAddress.js` (`#calendar`)
- `App.jsx`
- `main.jsx` (CSS)
- `mockClient.js`
- the rulebook and both READMEs

**Mockup details to keep** (easy to miss):
- Staff can click an event to see it read-only, with the note "View only — ask an admin to change this" (screen 7).
- On Both, the side panel lists classes under a heading for each school (screen 8).
- A dashed chip marks the day a planned schedule starts.
- Removing an event or closure is instant with Undo.

**New status file:** `docs/Prospects/STATUS-Calendar.md`.

## 5. Order and checkpoints

| Step | What | Gate |
|---|---|---|
| C0 | This plan | **Jeffrey's OK** |
| C1 | Migration 0008 + tests + fingerprints; independent security review | Tests green |
| C2 | Front end + preview data; design review at 1280×800, 820×1180 touch, 390×844 touch, 320 | Builds green, review fixes done |
| C3 | **Jeffrey tries it in preview** (fake data, nothing live) | Jeffrey's OK |
| C4 | Jeffrey pastes 0008 into the SQL Editor, **after 0005, 0006 and 0007 are live**; read-only checks | Jeffrey's OK |
| C5 | Real check: one real closure and one real event | Jeffrey's OK |
| C6 | Commit; the Main session merges | — |
| C7 | Push (goes live) | **Separate OK from Jeffrey** |

## 6. Questions for Jeffrey (one at a time, with visuals)

- **Q1 — Testing events on the Calendar:** Color Belt and Star testing events are built in their own sections. The Color Belt status file says this is "open, decide with the Calendar session". Should they show on the Calendar **automatically** (read from Testing, with no double entry), or should admins add a separate Calendar event? This changes the database, so it is asked first.
- **Q2 — Cancelled classes when the schedule changes later** (see `calendar_closure_classes`): recommended is the snapshot plus an amber "no longer on the schedule" line. The other options are to block schedule changes that would affect a closure, or to drop the cancellation without a word.
- **Q3 — Starting event types:** start with the mockup's types (Testing, Tournament, Camp, Meeting, Party), which admins can rename, recolor or delete, or start with an empty list? Deleting the last type is allowed. With no types, Add event first asks the admin to add a type.
- **Q4 — Event and closure length:** a limit of **31 days**, which keeps the month view readable and catches typos like 2027 instead of 2026. Is that OK?

**New rulebook rows after the answers:** the testing-events answer, the cancelled-class rule, the starting types, the 31-day limit, and the type-deletion rules.

## 7. Risks

- **Order of going live:** 0008 needs 0007, and 0007 waits for 0005 and 0006. Building in preview is not blocked.
- **Schedule changes after a closure:** handled by Q2. Every change is logged.
- **Busy days:** day boxes show a summary and "+N more", so a busy day doesn't stretch the month.
- **Time zone:** all dates are Massachusetts dates, the same as the Schedule.

## 8. Progress log

- 2026-10-17 — Draft written.
- 2026-10-17 — Independent review: 3 High, 6 Medium, 6 Low. All folded in: an `id` on the class list for the change log, a snapshot of cancelled classes (Q2), Both closures, locking for shared rows, function rights, text checks, timed multi-day events, more tests, two mockup details, and a new Q1 (testing events on the Calendar).
- 2026-10-17 — **Plan approved by Jeffrey (C0).** Questions Q1–Q4 are asked one at a time next.
- 2026-10-17 — **Q1 → A (automatic):** Color Belt and Star testing events show on the Calendar by themselves. The app reads Testing's own event tables (read-only, no copy, nothing extra in 0008). They are shown with `ti-certificate` and the school letter on Both, and clicking one opens it in Testing. They appear once 0005 and 0006 exist; before that the Calendar works without them. Admins can still add other events by hand.
- 2026-10-17 — **Q2 → A (keep and flag):** a "some classes" closure keeps a snapshot of each cancelled class. If the schedule later moves or removes it, the day shows an amber line ("Cancelled class no longer on the schedule: Group A 4:30") and the schedule change saves normally. Jeffrey: only one person edits schedules, so blocking was also workable; A was chosen as the simpler one.
- 2026-10-17 — **Q3 → A (five ready-made types):** 0008 adds Testing (purple), Tournament (sky), Camp (teal), Meeting (orange) and Party (pink), the mockup's types and colors. Admins can rename, recolor or delete them. The seed only runs when the table is empty, so it is safe to re-run. Testing events shown automatically (Q1) use purple.
- 2026-10-17 — **Q4 → A (31 days):** an event or closure can run at most 31 days. The dialog says "A closure can be at most 31 days. Check the end date." (same wording for events), and the database refuses longer ones. All four answers are recorded in the rulebook as v0.143.
- 2026-10-18 — **C1 done:** `0008_calendar.sql` with its tests and fingerprints, plus the runner steps. PGlite 67/67. Independent security review: no High or Medium; all five Low items fixed (own error code for the closure undo, `\u` escapes, seed only once, more tests, C9 by name). See `STATUS-Calendar.md`.
