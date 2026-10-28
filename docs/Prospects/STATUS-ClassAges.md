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
| Migration number | Requested from Main 2026-10-28 (next free 0031) |
| Mockups: the Schedule dialog and the form's time list at PC, tablet, phone and 320 wide | Next |
| Build: migration and pglite tests, then the screens | Waits for the number and the mockup OK |
| Reviews: security (database) and design | — |
| Apply to the live database (Jeffrey pastes it) | — |
