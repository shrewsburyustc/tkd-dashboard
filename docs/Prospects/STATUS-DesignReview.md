# Design review changes N1–N17 — status

Branch `claude/prospect-form-system-cd893d`. Source: the Design Review change list §2.7 (`docs/Design Review/End review/TKD-DesignReview-ChangeList.md`), rulebook rows v1.000–v1.034, and the step prompt `8-NewStudents.md` (Design Review session, received 2026-10-28). Part 1 needs no new shared part; Part 2 waits for Dashboard core's step 1 to be merged into main.

Order: **N17 first**, as its own reviewed step and commit. Then N1, N2, N4, N5, N6, N8, N9, N10, N12, N13, N14, N15, then the "(now)" points. Mockups (PC 1280, tablet 820 touch, phone 390 touch, 320 wide) are OK'd by Jeffrey one screen at a time before code.

| # | Change | Part | Status |
|---|---|---|---|
| N17 | Hide private details in Prospects: Email grays (no `mailto:` left), one gray line; answers "Hidden on this tablet" | 1 | **Done 2026-10-28.** Mockup OK'd by Jeffrey; built in `ProspectPanel.jsx`, `prospects/text.js`, `prospects.css`. Design and code reviews: the gray button first used colour names that don't exist (copied from Star's `results.css`); fixed to Black Belt's approved unavailable look. Committed on the branch, not merged or pushed |
| N17-Q | Fill in / + Add prospect while the switch is on: desk-only (like Star's New candidate) or unchanged? | 1 | Asked 2026-10-28 (`DesignReview-Q-fill-in-private-details.png`; A desk-only recommended / B unchanged) — waiting for Jeffrey |
| N1 | "That prospect no longer exists." → the amber bar | 1 | Not started |
| N2 | Undo for 5 s: Prospects' panel status; Forms' Close / Open (to settle: Joined) | 1 | Not started |
| N4 | "Open form again" → "Open form"; door icons go | 1 | Not started |
| N5 | Family page "Next" → "Continue", "Submit" → "Send" (to settle: staff Fill in) | 1 | Not started |
| N6 | Shared date picker in four sections (to settle: Date question years; follow-up needs a DatePicker change → ask) | 1 | Not started |
| N8 | Builder "← Forms" (ask: copy `.tc-back` or share it) | 1 | Not started |
| N9 | Staff lines in Calendar and Forms (to settle: Calendar dialogs) | 1 | Not started |
| N10 | Schedule on Both says "Both schools" (confirm the page line) | 1 | Not started |
| N12 | Forms' Edit uses `ti-edit` | 1 | Not started |
| N13 | 13 icon-only buttons → `IconButton` (ask: Calendar arrows' bordered look; family page's remove child) | 1 | Not started |
| N14 | Forms' Sent screen uses the family page's tick | 1 | Not started |
| N15 | Unsaved-changes guard: Fill in, New form, Edit statuses (phones need "Discard changes") | 1 | Not started |
| N3 | Confirm boxes → shared confirm box | 2 | Waits for Dashboard core step 1 (M2) |
| N7 | Shared time list (no migration) | 2 | Waits for Dashboard core step 1 (M8) |
| N16 | Prospects' delete box → shared confirm box; Show menu later | 2 | Waits for Dashboard core step 1 (M10) |
| N11 | Hints point to Settings → Classes and ranks | 2 | Waits for M15 / CB14 |
| D10b | Calendar / Schedule red Remove stay red | — | No change |

"(now)" points found on the way (not decided; ask Jeffrey where a fix changes the screen): dates taken in UTC; Forms' spots and waiver boxes on the live site; the kiosk's `forms-public.css`; builder "Delete field" without Undo; Prospects' search clear ✕; Edit statuses' grayed "Delete status".
