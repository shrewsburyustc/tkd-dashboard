# Rolling check — what is still open after pass 2

**Date:** 2026-11-08 · **Checked against:** `main` 35ccf6ca · **Branch:** `design-review` (not pushed)

Jeffrey, 2026-11-08 (relayed by Main): no pass 3; finish pass 2, then he looks at the system himself. This file is the one list of what pass 1 and pass 2 left open.

**How it was checked:** seven read-only agents, one per section, went through every entry in the 15 pass 1 and pass 2 files (about 300: Fix now, Smaller, Corrections to pass 1, Waits on Jeffrey, L-08 and the old unverified notes). Each was marked done, closed by a later decision, open, or unclear, with evidence from the status files, `main`'s commits and the code. A separate agent then re-checked every open and unclear claim plus 14 done ones: 28 of 31 held as written, and 3 were corrected (included below). Nothing was run in the app; this is bookkeeping against what is recorded and what the code shows.

**Result:** about 250 done, 34 closed by later decisions. **Finance and Star have nothing open.** What is left:

## To build (already decided)

1. **Dashboard core:** the toast's room on full-screen phone pages (R2-04's correction, U-06). Built on `dashboard-core` 953fc931 (rulebook v1.140), not merged. After it merges, New students remove their profile-page patch (`prospects.css:1636–1643`).
2. **Dashboard core:** L-05. Panel size's failed-save bar still says "Check the internet, then Retry." (`src/lib/panelSize.js:49–50`); v1.055 (i) has the words. `docs/Dashboard Core/tools/check-panel.mjs:29` checks the old words and changes with it.
3. **Dashboard core:** R1-07's last part. v1.135's payment line, History and Paying by words go once into `src/components/text.js`. The screens already match; only the one shared copy is missing (each section has its own).
4. **Dashboard core:** pass 1's Smaller lines. One shared gray "hidden" style (five copies today) and one shared `NoIcon` (six copies). Delete the three unused old delete boxes: `src/components/DeleteDialog.jsx`, its re-export `src/screens/testing/DeleteDialog.jsx`, and `src/screens/testing/events/ConfirmDeleteDialog.jsx`. Nothing imports them.
5. **Black Belt:** R4-03's words. "Payments are hidden on this tablet." becomes the shared "Payment details are hidden on this tablet." (`src/blackBelt/staff/text.js:672`; v1.045 (1)).
6. **New students:** L-03. `forms-public.css:471` (family pages and kiosk) and `schedule.css:410` still give a 42 px tap area. S-10: the builder's two "Show only if" boxes are still the browser's dropdown (`FieldEditor.jsx:136, 155`). Both are fixed in New students' worktree, not committed.
7. **Black Belt:** one pass 1 check not done yet. In the preview, look at the Daily report after Edit payment and its Undo (BB3). Nothing to build.

## Needs Jeffrey (one decision each; recommendation in brackets)

8. **History's Paying by line.** "Paying by: Cash → Check" (Star; Camps' approved v0.736) or "Paying by changed: Cash → Check" (Color Belt; the example in v1.055 (a))? The shared R1-07 picture never drew this line. [The first. Color Belt changes one line, and v1.055 gets a note.]
9. **Black Belt's Paying by line** (v1.135 assumed Black Belt's form asks how they'll pay; it asks only for the plan). Add it (a migration and a form question), or leave Black Belt without one? [Leave it: each Black Belt payment keeps its own way to pay.]
10. **Apostrophes in the app's words:** straight ' or curly ’? Both appear in one box today (Undo payment's title ’, its failure line '). [Straight: nearly every line already uses it; the shared file's three curly ones switch.]
11. **Camps' day boxes** are switched off while a save runs but don't look it (`CampRoster.jsx:219–223`). v1.131's gray covers only buttons and clickable tags. Extend it to the day boxes? [Yes.]
12. **Camps' extras count** counts both rows of a possible duplicate (`campRules.js:403–405, 453`). No rule covers it. Keep it? [Keep: Coming counts the same way.]
13. **A line for §4:** WCAG 1.4.3 (text contrast) doesn't apply to the text of a grayed, inactive control; the gray reason line under it is ordinary text and still needs 4.5:1. [Yes: reviews stop flagging the approved gray.]
14. **Star's reason line "Choose a Dan first."** (R3-12) is live. Pass 1 asked that Jeffrey see it first, and nothing records his OK; Star keeps it unless he changes it. [He looks at it in his own review.]

Already with Main, not repeated here: New students' family-page Dropdown question (S-10's last place), Camps' "by Jeffrey Berg" vs v1.135's "by Jeffrey" (v0.751), and Dashboard core's step 2 starter text (it includes Staff accounts opening while Hide private details is on).

## The design review's own

- **Rulebook housekeeping:** an unescaped `|` splits a cell in the rows decided as v0.229, v0.707, v0.716 (two) and v0.523 (`isPhone || narrowRoom`); v1.010 says Star and Finance read `change_log`, but no Finance migration does. One small edit (v1.056), with the answers to 8 and 13 or on its own.

## Not checked

- **Everything merged into `main` after 6b27cdd** (2026-11-05): pass 3 would have checked it. Jeffrey's own look covers it.

## Seen in passing (not pass 1 or pass 2 items)

- Star's and Black Belt's results tap buttons probably have the same 42 px tap area (`star/results/results.css:243`, `blackBelt/staff/results/results.css:375`; not tried in a browser).
- Star's own reviewers left four small points (Star status lines 37 and 39). One goes against v1.045 (4): a refused Edit-event Undo says "Undo didn't save…" instead of "Couldn't undo: [reason]."
- Dialog notes in six sections still say "Someone else changed this just now… Cancel, then open it again…"; R2-07's shared sentence covered the bars, not the dialogs.
- Finance's `.fin-ibtn` could switch to the shared outline button (v0.626 says "later"; optional).
- Out-of-date status files: Color Belt (doesn't record the 0044 app merge), Black Belt, Star, Camps and New students; CLAUDE.md's 0037 and 0047 rows still say the app is "on `finance` until merged".
