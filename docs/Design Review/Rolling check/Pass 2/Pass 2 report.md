# Rolling check — pass 2 report

**Date:** 2026-11-05 · **Branch:** `design-review` (not pushed) · **Phase:** 1d, the rolling check (Jeffrey, 2026-11-03: "B")

**What pass 2 covers:** the 15 merges into `main` after pass 1's cut (e7fd75b), up to 6b27cdd:
- **New students (7):** N15 and the Calendar Event types fix (e640af5); "(now)" 1–4 (c5e38f8, 7456636, 9b562b3); "(now)" 5–7 and its Part 2 start (2881413); the N3 confirm boxes (v0.633) and the visitor profile, migration 0036 and v0.634–v0.640 (a5d0e1d); v0.641 (d7b5ebf).
- **Black Belt (3):** BB13's time list (2e806e7, v0.971–v0.972); BB8's History (b428666, migration 0034, v0.973); "on this tablet" and BB20 (392bc9e, v0.974–v0.975).
- **Dashboard core (3):** Panel size (942cfdd, v1.118); the cleanup (801b757, v1.119–v1.121); R4-07, the gray line in every history while hidden (7511656, v1.122).
- **Color Belt (1):** Part 1 and Part 2 (84a6e7d; v0.413–v0.426; migration 0030).
- **Camps (1):** Early drop-off and Late pick-up on the roster (3a8dc70, v0.738).
- **Star:** nothing merged after the cut. Pass 2's findings still reach Star's screens through the shared panel and Color Belt's twin code.

**Not in pass 2; a later pass picks them up when they're on `main`:** everything merged after 6b27cdd (so far `main` has only gained migration reservations in CLAUDE.md), and the sections' unmerged work (for example Color Belt's CB14, decided as v0.427 on `color-belt`).

## How it was checked

- **Five reviewers**, one per topic:
  - M: money, records and privacy;
  - U: undo, safety nets, confirms and dialogs;
  - L: lists, pickers, forms and layout, with Panel size on every main screen;
  - P: New students' visitor profile and printed sheet, item by item;
  - C: Color Belt's Part 1 and Part 2, item by item, and pass 1's Color Belt note.
- **Two separate checkers** tried to prove each finding wrong. Checker 1 took M, C and five of L's; checker 2 took U, P and the other five of L's. Every Medium was reproduced by a checker in the preview.
  - Confirmed as written: 21. Changed: 11 (facts, scope, label or owner; one lowered, L-01, from Medium to Low). Duplicates of pass 1 items: 2. Rejected: 1.
  - They merged M-01 with C-01, and M-02 with C-07 (b). Checker 2 also saw one more problem while checking (X-1).
- **Preview mode only** (the fake database), at 1280 × 800, 820 × 1180 touch, 390 × 844 touch and 320 wide. For Panel size, reviewer L also tried the windows between those sizes that the side panel reaches: 768 and 744 touch (iPads held upright), 700 touch, 683 with a mouse (a laptop window snapped to half the screen), phones turned sideways, and a short window. Nothing touched the live site or database.

## Result

- **The reviewers found the merged work built as its rows and mockups say**, apart from the findings below. Hide private details holds on every new screen (Color Belt's Part 1 and Part 2, New students' profile and printed sheet), and Panel size works at Large and Largest on all 16 main screens at 1280 and 820.
- **36 findings became 35** after the merges: **no High, 7 Medium, 26 Low** (one of the Lows, C-07 (a), adds to pass 1's R1-07), **1 added to pass 1's R2-04** (U-06), and **1 rejected** (L-04). Plus X-1, a Low a checker saw while checking.
- **Most are straight fixes.** They go to the sections now, in the fix files below.
- **Ten need Jeffrey to pick a rule first:** the results sheet put up at the school (M-06) is question 2, and nine small ones are the batch, question 3. **L-02 changes §1.3:** it is question 1. **Question 2 is answered** (2026-11-05, rulebook v1.052): Color Belt's sheet goes; see question 2 below.

### The seven Mediums

1. **M-01 = C-01 (Color Belt):** the Mark paid box says "They chose … on the form." after the desk changed Paying by, even "Card", which the family form doesn't offer. Pass 1's note said Color Belt was right; it isn't. The fix needs a migration.
2. **C-02 (Color Belt):** Mark paid's hidden name "Mark Ava Chen paid" splits the visible words "Mark paid", so voice control can miss it (WCAG 2.5.3, "label in name").
3. **C-03 (Color Belt):** a private testing paid in two parts shows one made-up payment in its summary: "$85 card · paid Nov 5" for $65 cash on Oct 29 plus $20 by card on Nov 5.
4. **L-02 (Dashboard core, then Color Belt, Star and Camps):** between 640 and 768 px wide, three rosters overlap or scroll sideways, worse with Panel size Largest. Question 1.
5. **U-01 (New students):** Delete prospect, Came, Joined and Book a free class close before the save answers, so a dropped connection loses the box (and the picked date or time) and shows a bar with no Retry.
6. **P-01 (New students):** the printed visitor sheet shows a cancelled free class as if it will still happen.
7. **P-02 (New students):** a child's profile window stays on "Loading…" for good when its read fails.

C-02 is Medium because WCAG 2.5.3 is level A, part of the AA target. Pass 1 rated its own 2.5.3 finding (R2-10) Low; the end review rates the two the same way.

### Rejected

- **L-04** — Forms' gray Fill in on a Draft or Closed form explains itself only in the browser's tooltip. **Rejected:** Jeffrey chose this on purpose a day earlier (v0.628: "No reason line next to it … the row's Draft / Closed tag already says why"), and the tag shows the reason without the tooltip, so §2.5's "no hover-only information" is met. v0.631 and v1.120 are about icon-only buttons, not a button with words.

## Fix files: ready to pass on

Each file starts with a short starter to paste into that session. The file reaches the session's worktree once `design-review` is merged into `main` and the session runs `git merge main`.

| Session | File | Fix now | Waits on Jeffrey | Smaller |
|---|---|---|---|---|
| Color Belt | `Fix-ColorBelt.md` | 5 + 2 after another session's fix (3 Medium; M-06 since question 2) | 6 (1 Medium: L-02) | 1 |
| New students | `Fix-NewStudents.md` | 13 + 1 after another session's fix (3 Medium) | 2 | 4 |
| Dashboard core | `Fix-DashboardCore.md` | 2 | 2 (1 Medium: L-02, question 1) | 5 |
| Black Belt | `Fix-BlackBelt.md` | 1 + 1 after another session's fix | 3 | 1 |
| Star | `Fix-Star.md` | 2 after another session's fix | 3 (1 Medium: L-02) | 0 |
| Camps | `Fix-Camps.md` | 0 | 2 (1 Medium: L-02) | 3 |
| Main | `Notes-Main.md` | L-08 to hand out | — | — |

Color Belt's, New students', Dashboard core's and Star's files also end with "Corrections to pass 1".

## Corrections to pass 1

Each of the four pass 1 files below now has one line under its title that points to the "Corrections to pass 1" part of its pass 2 fix file; the line numbers cited for them count that new line.

- **`Notes-ColorBelt.md` R1-02 ("nothing to change here") was wrong.** Color Belt works out the Paying by hint from where the record came from, as Star does (`src/screens/testing/event/EventPage.jsx:1917`, `src/lib/testing/privateRules.js:89–91`; the same on `color-belt`). The code was already like this when the note was written (ccb42d5, 2026-11-04 00:12, came before pass 1's 8ef447a at 00:32). It is now Color Belt's M-01 = C-01, a Medium fix with a migration.
- **`Fix-Star.md:87` says Camps and Color Belt "already do it right".** That is wrong for Color Belt (as above); the Camps half is right. Star's own R1-02 fix stays as written.
- **`Fix-NewStudents.md` R2-01:**
  - the bar (and its Retry) must be cleared when another child's profile opens (X-1), or Retry inside the next child's window re-runs the first child's save;
  - U-01's four boxes (Delete prospect, Came, Joined, Book a free class) keep their failure note inside the box; R2-01's bar is for saves with no box.
- **`Fix-DashboardCore.md`:**
  - R2-04 (the toast's own room) also covers full-screen dialog pages (`.dialog-page-body`) and New students' phone profile page (U-06);
  - R1-07's mockup also draws the history's Paying by line (C-07 (a));
  - R4-09's `inset: -1px 0` must be `-2px 0` (L-03): on a 22 px tag with a 1 px border, `-1px` gives 22 px, not 24.
- **Added to, not corrected:** pass 1's `Fix-BlackBelt.md:298` (Print receipt with nothing paid) gains M-03's other half, and `:304` (four "0" cards on an empty roster) gains C-05 (a), in Black Belt's pass 2 file; Color Belt's R1-07 point gains its History's Paying by line (C-07 (a)); New students' S-2 gains P-02's load line; pass 1's note on the builder's refused Undo (`Fix-NewStudents.md:186`) is now U-02.

## Questions for Jeffrey, in order (one at a time)

Each answer becomes a 10b row and a changelog line from the design review's block (next: 1.053). The sections it changes hear it through the Main session.

### Question 1 — How should a roster choose its columns when the side panel takes room? (L-02, Medium)

Picture: `docs/Design Review/Rolling check/Pass 2/pictures/Q1-roster-room.png`.

**What happens today:** Color Belt's, Star's and Camps' rosters choose their tablet layout from the window's width (640–1023 px). The side panel takes 72 px of that window, or 96 px with Panel size Largest. Near the narrow end, the columns get less room than they were drawn for, so text runs into other text or the table scrolls sideways:
- a laptop window snapped to half the screen (683 px): Color Belt's "LT White →" sits over "Cash", even with Standard (picture 1); in the same window Camps' roster ends at Thursday, so staff must slide it sideways to reach Friday (picture 2);
- an iPad mini held upright (744 px): Camps' roster slides sideways, even with Standard;
- an iPad held upright (768 px) with Largest: Camps' Friday Check in and "Late" are cut off (picture 3);
- 700 px with Largest: Star's "Registered Oct 30" runs into "0 stars → 1 star", and Color Belt's text overlaps too. Star isn't drawn in the picture; its roster would switch the same way.

The four sizes the review always checks are fine (pictures 9–12), and Black Belt's roster (which drops columns) fits everywhere. §1.3 says "No horizontal scrolling on any screen size".

- **A (recommended): each roster picks its layout from the room it has beside the panel, not from the window's width.**
  - What it does: the page area tells the roster how wide it really is (a CSS "container query": the rule asks the width of the page area instead of the window). When that room is too narrow for the tablet columns, the roster uses the phone layout (stacked rows, or Camps' cards; pictures 4–6). With enough room, nothing changes (pictures 9–12). Dashboard core builds the shared part once; then Color Belt, Star and Camps switch their roster rules.
  - Pros: right at every panel size and every window, now and for future rosters; little new to design, because the phone layout already exists (only Camps' cards add a ⋯ button, see the cons); Standard users keep the columns they have today wherever they fit; the three rosters are fixed the same way.
  - Cons: it changes §1.3's rule that layout follows the screen width, so it needs a rulebook row; four sessions each do a step (Dashboard core first); it needs a browser from late 2022 or newer (on an iPad, iPadOS 16 or newer), so the school's tablets should be checked; menus and popups inside the page area must be re-checked. Camps' cards have no ⋯ (phones use Camper detail), so with a mouse they also need a ⋯ button. On the same iPad, someone on Largest can get cards where others get the grid (pictures 3 and 6).
  - §1.3 today: "Layout is based on **screen width**. Touch behavior is based on **input type**, not width (see 2.5) — an iPad in landscape is desktop-width but still a touchscreen." With A, one sentence is added: "**A roster's columns follow the room beside the side panel, not the window** (v1.0xx): when that room is too narrow for its tablet columns, it uses the phone layout, so nothing overlaps and nothing scrolls sideways."
- **B: keep choosing by window width, but start the rosters' tablet layout at a wider window** (for example 800 px instead of 640; below that, the phone layout with stacked rows).
  - Pros: it fixes every case found (pictures 1–3), as A does; the smallest change; no new CSS technique; works in every browser; each section changes one number.
  - Cons: one window width can't be right for all three panel sizes, so a number that fits Largest takes columns away from Standard users who fit today (a 768 px iPad held upright with the Standard panel would get the phone's stacked rows, where the tablet layout fits today; pictures 7–8); Camps' cards need the same ⋯ button for mouse users; §1.3's table gets an exception for rosters; every new roster must pick its own number again.
- **C: leave it.**
  - Pros: nothing to build.
  - Cons: §1.3's "no horizontal scrolling" stays broken; rows stay unreadable or cut off at real sizes (a half-screen laptop; the iPad mini; an iPad with Largest); the person most likely to pick Largest, the Grandmaster, is the one who meets it.

### Question 2 — What the results sheet on the school wall lists (M-06, Low; Star and Black Belt, or Color Belt) — answered, v1.052

Picture: `docs/Design Review/Rolling check/Pass 2/pictures/Q2-results-sheet.png` (today's three sheets, A, B; drawn on the real printed sheets).

**Answered (Jeffrey, 2026-11-05, in the design review session; rulebook v1.052):** "Childrens testing doesnt need to be printed." and "Childrens testing is color belt testing", then "Yes, remove it" (picture `pictures/Q2-colorbelt-print-results.png`). None of A, B or C: Color Belt testing has no printed results sheet, so its Print results and the sheet go; Download CSV (admins only) and Print grading sheet stay. Star's and Black Belt's full-results sheets stay as they are, and the two left already match. Color Belt's fix file has it under Fix now (M-06); Star's and Black Belt's say nothing changes. Below is the question as it was asked.

- **Today:** Color Belt's sheet lists only who passed ("the sheet is put up at the school", v0.416). Star's and Black Belt's sheets also list MAKE-UP rows (with "Needs: Breaking") and NOT FINISHED rows, and their PASSED rows keep their scores too: every row draws the score cell (Star: `src/screens/testing/star/results/StarResultsSheet.jsx:207`, "268.5 of 315 · PASS" in its header at `:17`; Black Belt: `src/blackBelt/staff/results/ResultsSheet.jsx:208`, "305.75 / pass 275 · PASS" at `:15`). The one-results-pattern row (v1.029) described Star's sheet only as "who passed to which belt", so it didn't see this difference.
- **Jeffrey has already chosen full results twice, while warned about privacy:** for Star, v0.142 (told once that posting minors' scores and make-ups shows them to every family, he chose full results and rejected a passes-only sheet), then v0.145 (Make-up highlighted too); for Black Belt, v0.947 (the sheet "shows full results, as Star (rule 5 flagged once)"). Color Belt's passes-only sheet is the newest of these rows (v0.416, 2026-10-28): it came with its approved screen 4 mockup ("A: per class") and wasn't asked on its own. The question now is only whether the three sheets should match.
- **A: every wall sheet lists only who passed, as Color Belt's does.** Make-ups and unfinished candidates hear it from their result email (Star, Black Belt) or at the desk.
  - Rows it changes: Star's v0.142, v0.143, v0.145 and v0.514, and Black Belt's R05 (v0.947), get "(See …)" notes. Color Belt's v0.416 stays.
  - Pros: privacy: no child's make-up or score is on the wall, and the children are minors (rule 5).
  - Cons: it reverses a choice Jeffrey made twice; Star and Black Belt change an approved sheet (and decide whether a passed row keeps its score); the wall no longer shows who still has work to do.
- **B (recommended): every wall sheet lists everyone, with make-ups and scores, as Star's and Black Belt's do; Color Belt changes.** Color Belt has no scores, so its Not passed and No show students join its sheet (how they show is drawn in its mockup).
  - Rows it changes: Color Belt's v0.416 gets a "(See …)" note, and so does v1.029 (the one-results-pattern row calls the sheet "who passed to which belt"). Star's and Black Belt's stay.
  - Pros: one pattern; it follows what Jeffrey chose twice, knowingly; Star and Black Belt change nothing.
  - Cons: Color Belt changes an approved sheet; Color Belt families see on the wall who didn't pass.
- **C: keep each section's own sheet** (both are approved).
  - Rows it changes: none (v1.029 gets a note that the wall sheets differ).
  - Pros: nothing changes.
  - Cons: the paper on the wall reads differently by section.

### Question 3 — The small ones, as one batch

Jeffrey approves the recommendations together, or pulls any out to see one by one. The letters stay as they were; (e) became question 2.

**(a) One save, one History entry?** (M-02 = C-07 (b); Color Belt, then Star) · picture `pictures/Q3a-one-history-entry.png`
- Today: in Color Belt, one Mark paid by another way is one tap, but its History shows two entries, and "History · N changes" counts both: "Paying by changed: Card → Cash" and "Payment recorded: $20 cash, paid Nov 5", at the same moment, by the same person. Undo payment adds two more. Color Belt's approved P3 picture drew it that way. Camps shows one entry per save ("Marked paid $186 check; Paying by: Cash → Check", v0.736), and Star's own rule makes an edit of several fields one entry (v0.518). Star's R1-02 will make its Mark paid change Paying by too.
- **A (recommended): one save is one entry**, money first, joined with "; ": "Payment recorded: $20 cash, paid Nov 5; Paying by changed: Card → Cash" (the exact payment and Paying by words follow R1-07's one set, which Dashboard core's mockup draws). Color Belt changes; Star builds it this way with its R1-02. Rows: Color Belt's v0.421 (P3) and v0.425 (History words) get notes.
  - Pros: the count matches what staff did; the same as Camps and Star's own rule.
  - Cons: Color Belt changes an approved picture; a little more code to join the two rows.
- **B: two entries, as P3 drew.**
  - Pros: nothing changes in Color Belt; each entry stays short.
  - Cons: one tap reads as two changes; Camps works differently (or changes to match); Star copies Color Belt.

**(b) Print receipt for someone removed after paying?** (M-03; Color Belt, Star, Camps, Black Belt) · picture `pictures/Q3b-receipt-when-money.png`
- Today: Color Belt, Star and Camps offer Print receipt only on an active record with money (each approved: v0.424 (6), v0.518, v0.734). A family whose child was removed or withdrawn after paying can't get a receipt, though v1.038 still counts that money ("includes $65 from removed students"). Black Belt offers it on every row, even with nothing paid (pass 1 already tells Black Belt to stop that, with BB2).
- **A (recommended): Print receipt on any record with a payment (or refund) that still stands, active or removed; never with nothing paid; never while Hide private details is on.** Color Belt, Star and Camps add it to removed records with money; Black Belt keeps it there and drops it where nothing is paid. Rows: v0.424 (6), v0.518, v0.734 and Black Belt's v0.220 ("at any time") get notes.
  - Pros: a family can always get proof of money it paid; one rule in four sections.
  - Cons: four small changes; today staff see no ⋯ on removed rows in Color Belt and Star, so each section draws where it sits.
- **B: active records with money only** (today's rule in three sections); Black Belt also drops it on withdrawn rows.
  - Pros: three sections change nothing.
  - Cons: no receipt for a family that paid and then left; the desk would have to restore, print and remove again.
- **C: Black Belt's "any time", everywhere.**
  - Pros: the simplest rule.
  - Cons: a receipt with nothing paid tells the family nothing; three sections change.
- No words change.

**(c) View signature while private details are hidden, in Black Belt too?** (M-04; Black Belt)
- Today: Star and New students keep View signature / Show signature while Hide private details is on. v0.508 (3) ends "View signature stays"; v1.000 (2) says "the questions and Show signature stay, as Star's View signature"; and v1.037's header says it "applies … v0.508 (3) to Black Belt". Black Belt hides it then; it was shown that way at its CP2 walkthrough, but no row says it.
- **A (recommended): Black Belt shows View signature to admins while hidden too, as Star does** (v0.508 (3), v1.000 (2), v1.037).
  - Pros: one rule for one switch, which the rows already say.
  - Cons: a signature picture can open on the mat tablet in Black Belt too (Star and New students already allow it).
- **B: Black Belt keeps the signature at the desk**, written in a row.
  - Pros: stricter.
  - Cons: two rules for the same switch; it goes against v1.000 (2).
- No words change.

**(d) New words for New students' desk-only lines** (M-05; New students)
- Today (v0.616, word for word): "Add prospects at the desk. Email and form answers are hidden on this tablet." and "Fill in forms at the desk. Email and form answers are hidden on this tablet." Since the 0036 work, the forms ask each child's date of birth, and the switch hides it (v0.634 (1), v0.639). Star's line says "Add new candidates at the desk. Date of birth, email and payments are hidden on this tablet."
- **A (recommended):** "Add prospects at the desk. Dates of birth, email and form answers are hidden on this tablet." and "Fill in forms at the desk. Dates of birth, email and form answers are hidden on this tablet." (The home address is an answer to the form's Address question, so "form answers" covers it.)
  - Pros: says what is hidden now; Star's pattern.
  - Cons: a longer line on phones.
- **B: keep v0.616's words.**
  - Pros: nothing changes.
  - Cons: the line doesn't name the date of birth the switch now hides.

**(f) A line above the red Delete permanently on a removed person's ⋯** (C-04; Color Belt and Black Belt) · picture `pictures/Q3f-line-above-delete.png`
- Today: on a removed, withdrawn or cancelled person, Star and Camps show "Restore", a line, then "Delete permanently". Color Belt and Black Belt show "Restore · Delete permanently" with no line, so the red item sits right under Restore. v1.011 doesn't place Restore.
- **A (recommended): the line everywhere**, as Star and Camps (Color Belt and Black Belt add it). §8's ⋯ menu rule gets one sentence: "On a removed person's ⋯, Restore sits above the line and the red Delete permanently below it."
  - Pros: the item that can't be undone stands apart from the harmless Restore, on the mat tablet too; Restore isn't "taking someone off".
  - Cons: two small changes; a menu of two items with a line.
- **B: no line** (Star and Camps remove theirs).
  - Pros: compact.
  - Cons: the red item sits right under Restore.
- No words on screen change.

**(g) Two empty lines, worded four ways** (C-05 (b) and (c); checker 1)
- **(g1) When a card filter leaves nobody.**
  - Today: Color Belt says "No paid students in this class." / "Everyone in this class has paid." (approved: v0.420, v0.424 (4)); Star "No candidates match."; Camps "No campers match."; Black Belt "No candidates in this group."
  - **A (recommended): say what is true, in Color Belt's pattern.** For example, Star "No paid candidates." / "Every candidate has paid."; Camps' To collect "Every camper has paid."; Black Belt's four plan cards and Camps' Coming card get lines in the same pattern, drawn in their mockups. Color Belt changes nothing.
    - Pros: the Grandmaster learns what the empty list means; Color Belt's lines are already approved.
    - Cons: three sections write new lines (shown in their mockups).
  - **B: one short line everywhere**, "No [candidates / campers / students] match." (Star's and Camps' words); Color Belt and Black Belt change.
    - Pros: one sentence to learn.
    - Cons: says less (match what?); Color Belt changes approved lines.
- **(g2) When the Past side is empty.**
  - Today: Color Belt says "No past events." / "No past private testings."; Star "No past events yet."; Camps "No past camps yet."; Black Belt "No past cycles yet."
  - **A (recommended): Color Belt adds "yet":** "No past events yet." / "No past private testings yet."
    - Pros: one section, two lines; matches the other three.
    - Cons: none worth noting.
  - **B: the other three drop "yet".**
    - Pros: shorter lines.
    - Cons: three sections change.

**(h) A date of birth without the weekday** (P-05; New students) · picture `pictures/Q3h-birth-date.png`
- Today: New students' form (the family page, the kiosk and Fill in) and the profile show "Wed, Apr 19, 2017"; the printed sheet, Star and Black Belt show "Apr 19, 2017". The approved rev 3 mockups (v0.639) drew the weekday on the form and in the profile.
- **A (recommended): "Apr 19, 2017" everywhere**, with no weekday. New students change the form's field and the profile; a New students row records it (it changes rev 3).
  - Pros: one way to write a birthday; a weekday on a birthday tells staff nothing.
  - Cons: changes an approved mockup.
- **B: keep the weekday on the form and in the profile.**
  - Pros: nothing changes.
  - Cons: the same date is written two ways.

**(i) "Check the connection" in Panel size's failed-save bar** (L-05; Dashboard core)
- Today (v1.118 quotes it): "Couldn't save your panel size, so your other devices keep the old one. Check the internet, then Retry." Every other failure message says "Check the connection", and v1.051 (2)'s line ends "Check the connection, then retry."
- **A (recommended):** "Couldn't save your panel size, so your other devices keep the old one. Check the connection, then retry."
  - Pros: the same advice in the same words everywhere.
  - Cons: changes words approved two days ago (v1.118 gets a note).
- **B: keep "Check the internet, then Retry."**
  - Pros: nothing changes.
  - Cons: the only message that says it differently.

**(j) The failed Mark paid line and the Undo payment box's note** (C-06 (a) and (b); checker 1 asks for these two)
- **(j1) A Mark paid that didn't save** (in the bar, with Retry).
  - Today: Color Belt (and Camps, which uses Color Belt's words) says "[Name] wasn't marked paid. Check the connection and try again."; Star says "That didn't save. Check the connection, then retry."
  - **A (recommended):** "[Name] wasn't marked paid. Check the connection, then retry." (Color Belt's line with v1.051 (2)'s ending; Camps gets it through Color Belt's words; Star's line already ends this way.)
    - Pros: the ending v1.051 (2) set for load lines, and Star's line.
    - Cons: none worth noting.
  - **B: keep it.**
    - Pros: nothing changes.
    - Cons: two endings for the same advice.
- **(j2) A failure inside the Undo payment box.**
  - Today (approved: Star's v0.518 Q2 B, Camps' v0.730): "Couldn't undo. Check the connection, then try again." in Color Belt's, Star's and Camps' boxes. The box has no Retry button: pressing Undo payment again tries again. v1.045 (4) says a failed Undo says "Undo didn't save. Check the connection, then retry." Pass 1's Star and Camps R2-07 items already switch their boxes to that sentence; pass 1's Color Belt note didn't list Color Belt's box.
  - **A (recommended):** "Undo didn't save. Check the connection, then retry." in every Undo payment box (Color Belt adds its box to its R2-07 point).
    - Pros: one sentence for every failed Undo; what pass 1 already told Star and Camps.
    - Cons: "retry" in a box with no Retry button (pressing Undo payment again is the retry).
  - **B: keep "Couldn't undo. Check the connection, then try again."** in the boxes (it names the action, and "try again" means pressing Undo payment again). Star's and Camps' pass 1 R2-07 items then leave that line out.
    - Pros: matches the box's own button.
    - Cons: two sentences for a failed Undo.

## Next

- **Jeffrey:** question 1, then the batch (question 3); question 2 is answered (v1.052). Question 1's picture is drawn: `pictures/Q1-roster-room.png` (today, A, B and what stays the same). The pictures for question 2 and for batch items (a), (b), (f) and (h) are drawn too, with amber outlines (`pictures/Q2-results-sheet.png`, `Q3a-one-history-entry.png`, `Q3b-receipt-when-money.png`, `Q3f-line-above-delete.png`, `Q3h-birth-date.png`).
- **A separate reviewer checked these files** before they were handed out, as for pass 1: 9 must-fix points, all applied; its re-check found 1 more, applied. They are committed on `design-review` (no push), and the Main session merges `design-review` when Jeffrey says so.
- **The Main session** then gives each session its pass 2 file (the starter is at the top of each) and handles `Notes-Main.md`: v0.638's "Date signed" (L-08) goes to Color Belt, Star, Black Belt and Camps; and it reserves a migration number for Color Belt's M-01 when asked.
- **Rulebook housekeeping with question 1's rulebook edit** (it changes §1 too; v1.052 kept to its one decision): §1.2's exception list names Camps' Early / Late words in school blue (L-07, approved in v0.738), as it names Star's grading grid (v0.512). Camps changes nothing unless Jeffrey asks to recolor them.
- **The status file's "Noted for pass 2" list:** the profile stuck on "Loading…" is now P-02, and Calendar's "… and try again." is part of U-08. The two Camps lines (the count line counts both rows of a possible duplicate; the day boxes show no gray while a save runs) were seen still open by reviewer L but not checked by a checker, so they stay on the list for the next pass.
- **Pass 3:** what merges into `main` after 6b27cdd.
