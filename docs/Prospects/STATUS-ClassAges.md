# Class ages on the booking forms — status

Branch `claude/prospect-form-system-cd893d`. Requested by Jeffrey on 2026-10-28, through the "Age group display in prospect class booking" session. Jeffrey asked for it to be done before the rest of the design-review list.

**What it does:** the booking forms' "Pick a class time" list shows each class's age range, for example "Thu, Oct 29 · 6:00 pm · White · Ages 7–12 · 10 spots left". It is display only: a form never hides or blocks a class because of the child's age.

## Decisions (rulebook v0.619)

1. **Where it's set:** an admin sets a class's ages in the Schedule's time slot dialog, under the class's Color ("Ages · White").
   - The ages are kept per school.
   - The ages apply to every time slot of that class, the same way the color does.
2. **How it's typed in:** two boxes, From and To, each a whole number of years from 0 to 99.
   - From can't be higher than To.
   - The forms show "Ages 7–12", or "Ages 7+" when To is empty.
   - Both boxes empty means no ages are shown.

## Steps

| Step | Status |
|---|---|
| Migration number | **0031** reserved by Main 2026-10-28 |
| Mockups (`ClassAges-mockup-1-forms.png`, `ClassAges-mockup-2-schedule.png`) | OK'd by Jeffrey 2026-10-28 |
| Database: `supabase/migrations/0031_class_ages.sql`, tests `0031_tests.sql`, `0031_fingerprints.sql`, `0031_preapply_check.sql`, undo `supabase/manual/0031u_undo_class_ages.sql`, SETUP "## Migration 0031", run.mjs `step0031` | Built 2026-10-28 by a subagent; PGlite step0031: 68 checks pass |
| Screens: Schedule time slot dialog (Ages · class, From / To, "Shows as"), the family form and kiosk, staff Fill in, Prospects' Book a free class; the Cloudflare function passes the ages on; preview fake data | Built 2026-10-28 |
| Reviews | Security: no must-fix or should-fix. Design: fixed the gray typed ages, errors flashing while typing, a chatty live line, and both save failures showing |
| Apply to the live database (Jeffrey pastes it, SETUP §0031) | Waits for Jeffrey's OK, after the merge |

## Classes taught together (rulebook v0.620)

Jeffrey chose B on 2026-10-28: one line on the forms, with the classes' ages joined and its own spot number. Mockup OK'd (`ClassAges-mockup-3-taught-together.png`).

**Built 2026-10-28**, inside migration 0031:

- **Database:**
  - a new table, `form_booking_group_limits`;
  - `forms_set_booking` gains `p_groups`;
  - the time lists and the bookings treat a combined time as one, counted across its classes.
  - PGlite step0031: 69/69.
- **Screens:**
  - the booking settings get a "Taught together" block;
  - the forms show one line ("White + Little Tiger · Ages 4–12 · 10 spots left");
  - a booking is saved as "White + Little Tiger".
- **Checked in the preview:**
  - the settings block;
  - the family form on PC, phone and 320 wide;
  - a staff booking (10 → 9 spots).
- **Reviews:**
  - Security: nothing must be fixed.
  - Design: fixed the 320 line breaking mid-word, the example hint shown when there are several combined times, keeping each class's own number on save, and the "untick the other class" line.

**Notes for Jeffrey:**

- **Spots are counted per form.** A combined time's bookings count against its own number only. If another form offers one of those classes on its own, that form counts its single times separately.
- **Leftover rows after a class is deleted.** Deleting a class in Testing leaves its combined-time rows behind. They do nothing, and the next settings save replaces them.
- **Go-live order.** Apply 0031 first, then deploy the app. An app from before 0031 clears the combined times when it saves booking settings.

**Notes (class ages):**

- The table holds one age range per class, and each class belongs to one school.
- The app reads the ages straight from the table, the same way it reads the colors.
- Staff never open the time slot dialog, so they see neither the color nor the ages in the Schedule. They see the ages only in the booking lists. (The mockup caption said "view only"; that was wrong.)
- When From and To are the same, the forms show "Age 7". Jeffrey OK'd this on 2026-10-28, and it's now in the v0.619 row.
- The undo file drops the table along with every age range entered. The values can still be read in `change_log`.
