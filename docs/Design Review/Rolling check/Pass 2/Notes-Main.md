# Main session — notes from the design review's rolling check (pass 2)

**For:** the Main session. Nothing here is built by Main: each point is something to hand out or to reserve.

This file reaches the main folder when `design-review` is merged into main; until then the Design Review session sends its text by message.

---

## The brief

The design review's rolling check (phase 1d) looks at each section's design-review work after it merges. Pass 2 covered what merged into `main` after pass 1's cut (e7fd75b), up to 6b27cdd (2026-11-05). The full result is `docs/Design Review/Rolling check/Pass 2/Pass 2 report.md`; each owning session has its own fix file in the same folder. This note holds what belongs to no single section: one rule nobody has picked up, and the hand-out.

- Each point keeps its finding id (L-08 …) so Jeffrey can trace it.
- **Line numbers** are main 6b27cdd's (checked 2026-11-05).

---

## Hand out

### L-08 — v0.638's "Date signed" on every family form has no owner yet · Low

- **What's wrong** (planned — not built yet; a hand-off gap, not a build error):
  - v0.638 (Jeffrey, 2026-11-04, option B: "for signatures it should require date signed always") puts "Date signed" under the signature on every family form: Color Belt's (`/register/<code>`), Star's (`/star/<code>`), Black Belt's and Camps' (`/camp/<code>`). Wherever staff see a signature, its date signed shows with it.
  - The row says it is "Done after the New students work, by each section's own session, through Main". New students is merged and live, and its status says "told Main" (`docs/Prospects/STATUS-ProspectProfile.md:28`).
  - But "Date signed" is in none of `src/register`, `src/star-register`, `src/camp` or `src/blackBelt/form`. Checker 2 searched `main`, `color-belt`, `star-testing`, `black-belt` and `camps`, and the four status files in every worktree folder (uncommitted work too): none of them mentions v0.638 or "Date signed".
- **Rule:** v0.638 (owners: Color Belt, Star, Black Belt, Camps).
- **What to do:** pass v0.638 on to the four sessions, as one shared look:
  - New students' Date signed box (`src/screens/forms/FormFields.jsx:449–457`, class `.fsigned`; words "Date signed" and "Filled in automatically with today's date.", `src/screens/forms/text.js:289–290`), with its words moved into `src/components/text.js` (Dashboard core's file: Jeffrey says who moves them).
  - Each section first checks that its form saves the day it was sent (v0.638: a database change only if it doesn't), and shows the box in a mockup before building.
- **Ready to paste** (to Color Belt, Star, Black Belt and Camps, each):

  > Rulebook v0.638 (Jeffrey, 2026-11-04) is yours now that New students' work is live: your family form shows "Date signed" under the signature, filled in automatically with the day the form is sent (gray, can't be changed), and wherever staff see the signature, its date signed shows with it. Use New students' box as the one shared look (`src/screens/forms/FormFields.jsx:449–457`, `.fsigned`; its words are in `src/screens/forms/text.js:289–290` and move to `src/components/text.js`: ask Jeffrey who moves them). First check that your form saves the day it was sent; a database change only if it doesn't (then ask Main for a migration number). Plan first; mockup at the four sizes; nothing is built before Jeffrey's OK. Found by the design review's rolling check, pass 2 (L-08).

Port 9351: the processes left by a screenshot run were gone by 2026-11-05. Nothing to pass on.

---

## Reserve

- **Color Belt's M-01 = C-01 needs one migration** (the family form's own Paying by choice kept on the registration and carried by Move to private and its Undo; Camps' 0033 pattern). Reserve the next free number when Color Belt asks, as usual (scan every branch and worktree first). Color Belt plans it with Star's R1-02, which is in Star's 0038 (reserved 2026-11-05).

---

## When `design-review` is merged

- Give each session its pass 2 file (the starter is at the top of each): Color Belt and New students first (three straight Medium fixes each), then Dashboard core (its L-02 first: Color Belt's, Star's and Camps' L-02 wait for it, v1.053), Star, Camps and Black Belt.
- Tell Color Belt, Star, New students and Dashboard core that pass 2 corrects their pass 1 files: a line under each pass 1 title points to the "Corrections to pass 1" part of their pass 2 file. Color Belt's is the important one: its pass 1 note said "nothing to change" about the Paying by hint, and it is now a Medium fix with a migration.
- Jeffrey's questions come first through the Design Review session (the pass 2 report). Pass on each answer, quoting his words.
