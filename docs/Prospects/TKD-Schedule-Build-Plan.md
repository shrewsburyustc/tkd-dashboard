# Schedule — build plan (DRAFT for review)

Branch `claude/prospect-form-system-cd893d` · 2026-10-17 · implements the Schedule decisions (rulebook v0.233; numbered v0.60, then v0.84, before main was brought in again) · approved mockup `docs/Prospects/TKD-Class-Schedule-Mockups.html` rev 2 · **nothing is built until Jeffrey says OK.**

## 0. What gets built

A new **Schedule** section (rail icon `ti-clock`, after Testing, address `#schedule`). It shows each school's weekly classes in a calendar-style week grid: times down the side, box height equal to the class length. On a phone it shows one day at a time.

A time slot is one class group from Testing → Classes and ranks, on one weekday, with a start and end time. Admins pick a color for each class.

The schedule repeats every week. Admins can plan any number of future schedules, each with a start date. Each one starts as a copy of the schedule before it, or blank. Editing the current schedule takes effect right away. Past schedules are kept read-only.

Staff can view only. On Both, the two schools are shown one above the other.

Not in this step: Calendar, Forms, Prospects. Their designs are approved, and each gets its own plan later.

## 1. Before any code: catch up with main

This branch started from an old main. Main now has:
- Classes and ranks (migration 0003)
- Staff accounts (migration 0004)
- Back / Forward addresses
- new dialog rules
- rulebook v0.83

So the first step is to **bring main into this branch**. On this branch only, the four new-students rulebook rows (first numbered v0.60–v0.63) are renumbered after main's highest version (now v0.84–v0.87), and their "decided" notes in the icon map are updated to match. Main itself is not touched.

## 2. Database — migration `0007_schedule.sql`

0005 was the next free number when this plan was written; at the second main merge it turned out 0005 is Color Belt phase 2 and 0006 is Star testing, so the Schedule migration is now **0007**.

### 2a. Tables

**`schedule_versions`** holds one row per schedule ("Current", "Winter", …) per school.
- Columns:
  - `id uuid pk`
  - `location_code text fk→locations`
  - `name text null` (optional, 1–40 characters)
  - `starts_on date not null`
  - `version int`, `created_*`, `updated_*`, `*_by_name` (same bookkeeping as Testing)
- Rules:
  - unique `(location_code, starts_on)`
  - unique `(id, location_code)`
- Which schedule is **current** is worked out, not stored: the version with the latest `starts_on` that is on or before today in Massachusetts time (`America/New_York`). Later dates are planned; earlier ones are past.

**`schedule_slots`** holds one row per class at one time on one weekday.
- Columns:
  - `id uuid pk`
  - `version_id uuid`
  - `location_code text`
  - `class_id uuid`
  - `weekday smallint` (1 = Mon … 7 = Sun)
  - `starts_at time`, `ends_at time`
  - bookkeeping columns as above
- Foreign keys:
  - `(version_id, location_code) → schedule_versions(id, location_code)` on delete cascade
  - `(class_id, location_code) → testing_classes(id, location_code)` **on delete cascade** (Q1 decided: deleting a class removes its time slots, and Testing's delete dialog says so)
- Checks:
  - `ends_at > starts_at`
  - times on 5-minute steps
  - length between 15 minutes and 4 hours
- Overlaps are allowed (two mats). The screen warns about them; the database doesn't block them.

**`schedule_class_colors`** holds one row per class: `class_id uuid pk`, `location_code`, `color text` (one of 8 names, checked), bookkeeping columns.
- It is kept in its own table so Testing's tables and screens don't change.
- A class with no row shows gray.

### 2b. Safety (Handoff §6, same as 0003)

- RLS is on for all three tables.
- `revoke all` from public, anon, authenticated and service_role.
- Column-level `grant select (…)` to authenticated.
- Read policy: `using ((select public.has_data_access()))`.
- No write grants: every change goes through the functions in 2c.
- Change history: the bookkeeping triggers and the `change_log_write()` AFTER trigger are attached to each table, and truncate is refused.

### 2c. Write functions (admin only)

**Pattern** (same as 0003):
- `security definer`, `search_path = ''`, returns jsonb.
- Checks run in this order: `has_data_access` → `is_admin` → valid input → lock the school row → version check → write.
- Every function sets the change-log action and batch tags.

| Function | Does |
|---|---|
| `schedule_add_slots(p_version_id, p_class_id, p_weekdays smallint[], p_starts_at, p_ends_at)` | One slot per ticked day. Returns the ids and any overlaps. |
| `schedule_update_slot(p_slot_id, p_expected_version, p_class_id, p_weekday, p_starts_at, p_ends_at)` | Edit one slot. |
| `schedule_remove_slot(p_slot_id, p_expected_version)` | Remove; returns the old values so Undo can add it back. |
| `schedule_plan_version(p_location_code, p_name, p_starts_on, p_copy boolean)` | New planned schedule, starting after today. Copies the slots of the schedule running just before that date, or starts blank. |
| `schedule_update_version(p_version_id, p_expected_version, p_name, p_starts_on)` | Rename or change the start date (planned only). |
| `schedule_delete_version(p_version_id, p_expected_version, p_expected_slot_count)` | Planned schedules only; the confirmation shows how many slots will go. |
| `schedule_set_class_color(p_class_id, p_color)` | Set a class's color. |
| ~~`testing_delete_class` (replaced)~~ | **Changed during S1:** Testing's delete function is left exactly as it is. The database removes a deleted class's time slots and color automatically (`on delete cascade`), and each removal is still written to change_log, tagged `delete_class`. In S2, Testing's delete dialog counts the slots first and adds the sentence. Same result for Jeffrey; Testing's live code is untouched. |

**Rules every function enforces:**
- Past schedules are read-only and return `not_allowed`.
- The current schedule's slots can be edited, but its start date can't be changed.
- A slot's class must belong to the same school.

**Status codes:** `ok`, `no_access`, `not_allowed`, `invalid`, `not_found`, `stale`, `duplicate_date`.

**First schedule:** a school with no versions gets its first one automatically when the first slot is added. It has no name (the app shows "Current schedule") and starts today.

### 2d. Read helper

The app reads the tables directly (through RLS). One small function, `schedule_today()`, returns today's date in Massachusetts time, so the app and the database agree on which schedule is current.

## 3. Tests

**`supabase/tests/0007_tests.sql`** follows the style of 0003. It checks:
- locked, stale and signed-out sessions can't read or write;
- staff can read but can't write;
- admin writes work, with version conflicts (`stale`) and school mismatches;
- past schedules can't be edited;
- planning copies the right schedule;
- deleting a planned schedule removes its slots;
- every write lands in the change log.

**Also:**
- `0007_fingerprints.sql` is added.
- `pglite/run.mjs` gets the new steps: apply twice, identical fingerprints.
- `src/lib/schedule/checks.mjs` holds plain checks for the time rules, "which schedule is current", and the preview fake database.

**All must pass:**
- `npm run build`
- `npm run build:preview-mode`
- the PGlite suite
- `checks.mjs`

## 4. Front end

**New files** (each starts with a plain-English header comment):
- Screen: `src/screens/Schedule.jsx`.
- Under `src/screens/schedule/`:
  - `WeekGrid.jsx` (PC and tablet)
  - `DayView.jsx` (phone, Mon–Sun buttons)
  - `VersionPicker.jsx` (Current / planned / Past dropdown + `⋯`)
  - `SlotDialog.jsx` (add and edit, with color swatches, days and times)
  - `PlanDialog.jsx`
  - `DeleteVersionDialog.jsx`
  - `ScheduleSkeleton.jsx`
  - `text.js` (every word on screen)
- Data and rules under `src/lib/schedule/`:
  - `api.js`
  - `useSchedule.js` (cached per school; same status values as Testing)
  - `time.js` (parse and format times, find overlaps)
  - `versions.js` (current / planned / past)
  - `colors.js` (the 8 colors)
- Styles: `src/styles/schedule.css`.
- Preview mode: `src/lib/mockSchedule.js`, with sample Worcester and Shrewsbury weeks and `__tkdPreview` helpers.

**Reused:**
- `Dialog.jsx`, `RowMenu.jsx`, `IconButton.jsx`, `Notice.jsx`, `ErrorBanner.jsx`, `Toast.jsx`
- `backButton.js`, `useShortcutN.js` (N = Add time slot)
- `useMediaQuery.js`, `dates.js`

**Shared files touched** (listed for the merge):
- `navItems.js` (Schedule after Testing)
- `pageAddress.js` (`#schedule`)
- `App.jsx` (title + route)
- `mockClient.js` (sends schedule calls to the fake database)
- the rulebook and both READMEs

**New status file:** `docs/Prospects/STATUS-Schedule.md`.

## 5. Order and checkpoints

| Step | What | Gate |
|---|---|---|
| S0 | Bring main into this branch; renumber rulebook rows | Jeffrey's OK (this plan) |
| S1 | Migration 0007 + tests + fingerprints; independent security review | Tests green |
| S2 | Front end + preview mock; design review at 1280×800, 820×1180, 390×844, 320 | Builds green, review fixes done |
| S3 | **Jeffrey tries it in preview mode** (fake data, nothing live) | Jeffrey's OK |
| S4 | Jeffrey pastes 0007 into the Supabase SQL Editor; read-only checks (fingerprints, security advisor, tests) | Jeffrey's OK |
| S5 | Real check on the live database with Worcester's real times | Jeffrey's OK |
| S6 | Commit; the Main session merges | — |
| S7 | Push (goes live) | **Separate OK from Jeffrey** |

## 6. Decisions on this plan (2026-10-17)

- **Q1 → (a):** deleting a class in Testing also removes its time slots. Testing's delete confirmation says how many, and in which schedules: "It's also removed from the schedule: 2 time slots (Tue 4:30, Thu 4:30) in the current schedule and 1 planned schedule."
- **Q2 → in the app:** no seed file. After launch, an admin enters each school's real times with "+ Add time slot". At S5, Jeffrey enters a few real Worcester slots as the live check.
- **Q3 → after Testing:** the rail reads Home, Testing, Schedule. The phone bottom bar shows Home, Testing, Schedule until a fifth section exists; "More" arrives with the later sections, as already decided.

## 7. Risks

- **Merge size:** main moved a lot (20+ commits). Catching up may hit conflicts in shared files; these are fixed on this branch only.
- **Time zone:** "today" must be Massachusetts time on both the app and the database, or the switch to a new schedule could happen at the wrong hour. `schedule_today()` and tests cover this.
- **Testing changes:** none in the database (see the note in 2c). In S2, Testing's delete dialog gets one extra read (the slot count) and one sentence. If slots are added between that count and the delete, the dialog's number could be low by those slots; they are still removed and logged.

## 8. Progress log

- 2026-10-17 — Draft written. Q1–Q3 answered by Jeffrey.
- 2026-10-17 — S0: main brought into this branch (Jeffrey ran the merge in the terminal); the rulebook conflict was resolved, giving v0.87 = main v0.83 + new students v0.84–v0.87.
- 2026-10-17 — main brought in again (Star testing, Staff accounts, Color Belt). New-students rulebook rows renumbered v0.84–v0.89 → v0.233–v0.238 (main is at v0.130; Color Belt has v0.131–v0.136 waiting). Migration 0005 → **0007** (0005 = Color Belt phase 2, 0006 = Star testing).
- 2026-10-17 — S1: `0005_schedule.sql`, `0005_tests.sql` and `0005_fingerprints.sql` written, and `run.mjs` runs them (before and after seed, after re-runs, on the upgrade path). 54/54 checks pass; a deliberately broken rule was caught. Independent security review: no High findings.
- **Fixed after the review:**
  - The Medium finding (tests for every shut-out session type on all three tables).
  - "Today" now uses the wall clock (the midnight race).
  - The two helpers now run as security invoker, with a note on why `schedule_today()` is open to any signed-in session.
  - The fingerprints now cover constraints, policies and function kinds (62 rows).
  - Tests added: batch-id and tag clearing, and staff reading versions and colors.
- **Accepted as designed:**
  - Deleting a class in Testing also removes its slots from past schedules. The history keeps them (decision Q1).
  - The slot count in Testing's dialog isn't re-checked on the server.
  - Class colors have no "someone else changed it" check (last save wins; both are logged).
- 54/54 checks pass.
