# Dashboard core — fixes from the design review's rolling check (pass 2)

**Paste into:** the Dashboard core session.

This file reaches your worktree when `design-review` is merged into main; until then the Design Review session sends its text by message.

**Starter to paste:**

> `git merge main` first. Then read and do `docs/Design Review/Rolling check/Pass 2/Fix-DashboardCore.md`: the fixes the design review's rolling check (pass 2) found in your merged work and in the shared parts, and three corrections to your pass 1 file. Plan first. Mockups first for anything that changes how a screen looks. Nothing is built before I OK it.

---

## The brief

The design review's rolling check (phase 1d) looks at each section's design-review work after it merges: against the rulebook, the approved mockups, and the other sections that do the same job. Pass 2 covered what merged into `main` after pass 1's cut (e7fd75b), up to 6b27cdd (2026-11-05), in preview mode at the four sizes. Five reviewers looked (M money, records and privacy · U undo, safety nets, confirms and dialogs · L lists, pickers, forms and layout, with Panel size on every screen · P New students' visitor profile and printed sheet · C Color Belt). Two separate checkers then verified every finding. This file is what they confirmed in your merged work (Panel size, v1.118, 942cfdd; the cleanup, v1.119–v1.121, 801b757; R4-07, v1.122, 7511656) and in shared problems that showed up in several sections at once.

Panel size works: reviewer L found all 16 main screens fine at Large and Largest at 1280 and 820 touch, the panel buttons and account menu rows big enough, the failed-save bar on every page, and short windows scrolling as v1.118 says. The problems below come at window sizes between the review's four, and in shared rules.

- **Fix now:** straight fixes. Plan them, show Jeffrey, then build. Several have a matching item in a section's own fix file ("after Dashboard core's [id]"): say in your report when each is merged, so the Main session can tell them.
- **Waits on Jeffrey:** nothing now. Questions 1–3 of the pass 2 report (`docs/Design Review/Rolling check/Pass 2/Pass 2 report.md`) are answered (v1.053, v1.052, v1.055), so their items are under Fix now.
- **Smaller:** fix them while you're in the file.
- Each item keeps its finding id (L-03, L-06 …) so Jeffrey can trace it. Use the id in your plan, status file and commits.
- **Line numbers** are main 6b27cdd's (checked 2026-11-05); they may move.
- **Paths:** `components/…` is `src/components/…`; `app.css`, `shared.css`, `testing-events.css`, `calendar.css`, `camps.css`, `forms-public.css` and `finance.css` are in `src/styles/`. The sections' own files are written in full.

### Rules

- Follow CLAUDE.md.
- **Preview mode for building and trying changes:** `npm run dev:preview-mode`. `npm run dev`, `npm run preview` and `Start dashboard.bat` use the live database (`.worktreeinclude` copies `.env.local` into every worktree): run them only for a check Jeffrey OKs, never to try a change. `npm run build` is fine: it only builds.
- **Plan first:** a short plan (each item, its files, its mockup, any migration) in your docs folder; show it to Jeffrey.
- **Mockups before code** for every visual change, at PC 1280×800, tablet 820×1180 touch, phone 390×844 touch and 320 wide: a self-contained HTML file plus one PNG per screen with what changes outlined in amber (Jeffrey reviews the PNGs). He OKs them one screen at a time, before any code.
- **One decision at a time,** with pictures: each option drawn, its pros and cons, and a recommendation.
- **Reviews:** a separate design reviewer (the rulebook, the approved mockups, screenshots at the four sizes, and §4's six WCAG 2.2 checks, v1.033); a separate code reviewer; a separate security reviewer for anything touching the database (handoff §6).
- **Order (a push to main deploys):** the migration is live before the push that brings the app that uses it. Screen-only steps can go first. (No item here needs a migration.)
- **The shared parts are yours, and every section uses them** (`src/components/…`, the shared helpers in `src/lib/`, `src/styles/shared.css`). A change to one changes every section's screens. So a new state or look of a shared part is shown to Jeffrey first (one small picture), and your report names the sections that must adopt or check it. `src/styles/app.css` and `src/styles/testing-events.css` are used by several sections too: treat them the same way.
- List every CLAUDE.md shared file you touch (`src/styles/shared.css` and `src/components/text.js` are on that list).
- Keep `docs/Dashboard Core/TKD-DashboardCore-Status.md` current, with a short "Rolling check, pass 2" section.
- Commit on `dashboard-core` after each reviewed step. **No push.**
- When a step is done, send the Main session a short report: Done (with the commit) · Needs Jeffrey (one question, options, your recommendation) · Next.

### Rulebook

Rulebook rows come from your block **1.100–1.199**, continuing after your last one (check the rulebook first):
- `git merge main` first, and re-read the rulebook right before editing;
- the row goes just above "| Approved 2026-10-16 (v0.26) |";
- the changelog line goes at the end of §11;
- the header's Version / Last updated are bumped;
- CRLF is kept;
- a row that changes an older one adds a "(See v1.1xx …)" note at the start of that row.

The answers to the pass 2 report's questions are written as rows from the design review's block (1.052 on), so you don't write those.

---

## Fix now

Most severe first.

### L-02 — Between 640 and 768 px wide, three rosters overlap or scroll sideways, worse with Largest · Medium · Jeffrey's answer to question 1 (v1.053)

Jeffrey chose A on 2026-11-05 ("A: room beside panel"), and rulebook v1.053 changes §1.3: a roster chooses its layout from the room it has beside the left panel, not from the window's width. Build your part first: Color Belt's, Star's and Camps' own L-02 items wait for it.

Picture: `docs/Design Review/Rolling check/Pass 2/pictures/Q1-roster-room.png` (today 1–3, A 4–6, B 7–8, what stays the same 9–12).

- **What's wrong** (drift):
  - Color Belt's (`testing-events.css:1108`), Star's (`src/screens/testing/star/star.css:886`) and Camps' (`camps.css:991`) rosters choose their tablet columns from the window's width.
  - But the side panel takes 72 px (Standard) or 96 px (Largest) of that window, so at the narrow end of the tablet band the columns get less room than they were drawn for.
  - Checker 1 reproduced three of reviewer L's cells:
    - Camps, April Vacation Camp at 768×1024 touch with Largest: the table is 633 px in a 622 px box, and Friday's Check in and "Late" are cut.
    - Star, Fall Star Testing at 700 wide touch with Largest: "Registered Oct 30" runs into "0 stars → 1 star", and the "Candidate" / "Testing for" headers overlap.
    - Color Belt, the event roster at 683 wide with a mouse, Standard: "LT White →" sits over "Cash".
  - Black Belt's roster drops columns and fits at every size tested. Color Belt's part is in your plan (`docs/Dashboard Core/TKD-DashboardCore-Plan.md:826`, `:854`); Star's and Camps' are new.
- **Rule:** §1.3: tablets are 640–1023 px, "Two columns max; tables drop low-priority columns", and "No horizontal scrolling on any screen size"; v1.118 (Panel size); v0.716 (Camps chose its week switch over sideways scrolling).
- **Change (A, v1.053):**
  - The page area becomes a size container: `.shell-content { container-type: inline-size; container-name: page; }` (`app.css:502–506`). A roster can then choose its layout from the room it really has beside the panel, whatever the panel size or window: when that room is too narrow for its tablet columns, it uses the phone layout (stacked rows, or Camps' cards; pictures 4–6); with enough room, nothing changes (pictures 9–12).
  - Color Belt, Star and Camps switch their tablet rules to `@container page (…)` (their own L-02 items). Camps' cards have no ⋯ (phones use Camper detail), so with a mouse they also need a ⋯ button (Camps' own item).
  - **CSS alone can't switch the rosters.** Their phone rows and cards are drawn by React when `useMediaQuery(PHONE_QUERY)` matches, and that reads the window (`src/screens/testing/event/EventPage.jsx:210`, `src/screens/testing/star/candidates/CandidatesTab.jsx:111`, `src/screens/camps/CampPage.jsx:142`). So also build one shared hook that reports the page area's width (a ResizeObserver on `.shell-content`: the browser tells the code when that box changes size), so a roster's code and its `@container` rules use the same limit. Rosters use it only for their own layout: the same `isPhone` also makes dialogs full-screen and ⋯ menus into sheets, and those keep following the window.
  - Check that menus, popups and the toast inside the page area still open in the right place.
  - Before it goes live: container queries need Chrome or Edge 105, Safari 16 or Firefox 110 or newer (on an iPad, iPadOS 16 or newer). Ask Jeffrey to check the school's tablets, and say in your plan what a browser without them shows.
- **Check (preview mode):** Account menu → Panel size → Largest, then Standard. Camps → April Vacation Camp at 768 and 744 touch; Star → Fall Star Testing at 700 touch; Color Belt → November Children Testing at 683 with a mouse and 667×375 touch: no text over text, no sideways scroll; where the room is too narrow, the roster shows the phone layout (pictures 4–6). Where a roster switched in a wider window, its dialogs and ⋯ menus look as today for that window. The four review sizes look as today (pictures 9–12).

### L-03 — Touch buttons' tap area is 42 px tall, not 44 · Low

- **What's wrong** (drift: the rule's own comment says 44):
  - On touch, `app.css:1219–1223` gives `.btn::after { inset: -4px 0 }`. An absolutely placed box is measured from inside the button's 1 px border (`.btn`, `app.css:130`), so 34 + 8 = **42 px**.
  - Checker 1 measured it at 820×1180 touch on Add student, Registration link, Review and the Mark paid buttons: taps register from 3 px above to 3 px below the 36 px button (pixel rows 143–184 for a button on rows 146–181).
  - The same number is copied in three section stylesheets: `forms-public.css:545–549` (New students' family pages and the kiosk); `camps.css:821–825` (`.cp-dc`, with a 1 px transparent border) and `:979–983` (`.cp-daychip`); and `calendar.css:775–779`, where `.cseg { overflow: hidden }` (`calendar.css:58–63`) clips the box altogether, so Calendar's Month / Week tap at only 36 px (that is L-10's Calendar part, which checker 2 moved here).
  - Finance already allows for the border (`finance.css:872`: "+ the box's 1px borders = 44px").
  - **Your pass 1 R4-09 has the same mistake** (see "Corrections to pass 1").
- **Rule:** §2.5: every tap area is at least 44 × 44 px on touch.
- **Change:**
  - `app.css:1222`: `inset: -5px 0` (4 px of room plus the 1 px border), and fix its comment.
  - The three copies take the same number. They are New students' and Camps' stylesheets: change them with yours and name them in your report so their owners check them, or leave them to the owners and say so (then the Main session passes them on; New students' and Camps' files already say what to do).
  - Calendar's switch also needs its `overflow: hidden` moved off the tap box.
  - R4-09 (pass 1): `-2px 0`, not `-1px 0`.
- **Check (preview mode):** 820×1180 touch, a roster's Add student button (nothing right above or below it). In the console: `const b = document.querySelector('.btn'), r = b.getBoundingClientRect(); [document.elementFromPoint(r.left + 20, r.top - 3.5) === b, document.elementFromPoint(r.left + 20, r.bottom + 3.5) === b]` → `[true, true]` (today `[false, false]`). Calendar at 820 touch: a tap 3 px above Month still switches. Buttons look the same at 1280, 820, 390 and 320.

### L-05 — Panel size's failed-save bar says "Check the internet" · Low · Jeffrey approved question 3 (i), v1.055

- **What's wrong** (approved this way: v1.118 quotes these words):
  - The bar says "Couldn't save your panel size, so your other devices keep the old one. Check the internet, then Retry." (`src/lib/panelSize.js:49–50`).
  - It is the only failure message in the app that says "Check the internet". Every other one says "Check the connection", and v1.051 (2)'s line ends "Check the connection, then retry." (lower-case retry).
- **Rule:** v1.045 / v1.051 (one set of failure words). v1.118 quoted today's words; Jeffrey approved the change (v1.055), and the design review wrote the "(See v1.055 …)" note on v1.118.
- **Change (Jeffrey approved A, v1.055):** "Couldn't save your panel size, so your other devices keep the old one. Check the connection, then retry."
- **Check (preview mode):** `__tkdPreview.failNextPanelSave()` → Account menu → Panel size → Large: the bar shows the new words, with Retry and ×.

### L-06 — Drag handles look ready while dragging is switched off · Low

- **What's wrong** (unclear for the look: no row covers a turned-off grip, and v1.120 covers only icon buttons; drift for the unused `disabled`):
  - No section's drag handle looks turned off while dragging is off. The shared `Grip` (`components/Grip.jsx:22–40`) only sets `aria-disabled` when `disabled`, and no CSS grays it.
  - Checker 1 tested Black Belt's copy, which does pass `disabled` (`src/blackBelt/staff/parts/Grip.jsx`, used at `src/blackBelt/staff/rubric/RubricEditor.jsx:451, 465, 541` and `src/blackBelt/staff/cycle/PricesSection.jsx:140`): with its stylesheet loaded, a grayed grip computes the same as an enabled one (#6B6B6B, opacity 1, the grab cursor). "Black Belt grays them" was wrong.
  - Five screens turn dragging off with `useReorderDrag` but never pass `disabled`, so screen readers don't hear "dimmed" during a save either:
    - Edit statuses (`src/screens/prospects/StatusesDialog.jsx:39`; grip `:57`);
    - Event types (`src/screens/calendar/EventTypesDialog.jsx:57–58`; `:83`);
    - the Forms builder (`src/screens/forms/Builder.jsx:294`; `:547`, `:559`);
    - Classes and ranks (`src/screens/testing/ClassesRanksTab.jsx:668–669`; `src/screens/testing/RankRows.jsx:193, 283`, `src/screens/testing/ClassBlock.jsx:46`);
    - Star's Rubrics and prices (`src/screens/testing/star/RubricsTab.jsx:665–666`; `src/screens/testing/star/DanBlock.jsx:185`).
  - You noted it on 2026-10-27 and 2026-11-04 (`docs/Dashboard Core/TKD-DashboardCore-Status.md:167`, `:816`).
- **Rule:** the shared Grip's own header (`disabled`: "true: shown, but can't drag (e.g. while saving) — screen readers hear "dimmed"", `components/Grip.jsx:16`); v1.116 / v1.120 (a turned-off control looks turned off).
- **Change:**
  - `.grip[aria-disabled='true']` gets v1.120's gray (the icon in `--color-disabled-text`, no grab cursor).
  - `useReorderDrag` (`src/lib/useReorderDrag.js:55`; it returns `{ state, gripProps }` at `:209`) passes its `enabled` state on, so every section's grip grays by itself, with no per-screen prop.
  - It is a new state of a shared part: show Jeffrey one small picture first.
  - Name the sections that check it in your report: New students, Color Belt, Star and Black Belt. Black Belt switches to the shared `Grip`, as its header already plans (`components/Grip.jsx:9–10`).
- **Check (preview mode):** on the parts page (`/parts.html`), a turned-off grip is gray. `__tkdPreview.setTestingDelay(4000)`; Classes and ranks → ⋯ on White → Move down: for the 4-second save every grip is gray and `aria-disabled`. Afterwards `__tkdPreview.setTestingDelay(200)`.

---

## Smaller (fix while you're in the file)

- **P-04 — The shared receipt prints with another section's page margins** (missing — not planned; harmless today, still one page):
  - The receipt has only its named page, `@page rcpt-receipt` (0.6 × 0.7 in, `shared.css:2011–2014`, set on html, body and `.rcpt-print`, `:2025–2036`), and `ReceiptPrint` (`components/Receipt.jsx:170–176`) adds no unnamed rule.
  - Finance's and Testing's unnamed `@page` rules inside `@media print` (`finance.css:1119–1123`, 0.6 in; `testing-events.css:872–876`, 0.75 in) beat a named page in Chrome and Edge. So once those styles have loaded, the receipt prints at 0.6 in all round. New students found it and told Main (`docs/Prospects/STATUS-ProspectProfile.md:60`); it is in no fix file yet.
  - Change: give the receipt the unnamed page rule inside its print portal, as the visitor sheet (`src/screens/prospects/PrintSheet.jsx:55–60, 367`) and Black Belt's results sheet (`src/blackBelt/staff/results/ResultsSheet.jsx:45, 169`) do (Color Belt's results sheet did too; it goes with Color Belt's M-06, v1.052) — ideally one small shared `PrintPageRule` part, which those two can switch to later (name them in your report).
  - Check: open Finance, then Testing, then Camps → Thanksgiving Camp → ⋯ for Chloe Nguyen → Print receipt → Print: the print preview (Margins: Default) shows 0.6 in top and bottom and 0.7 in at the sides. Low.
- **L-10 (your part) — Page tabs and sort headers are under 44 px wide on touch** (drift; older work): on touch `.ttab` gets 44 px height but no minimum width (`shared.css:1086–1088`; "Camps" and "Events" are 38–40 px wide), and so does `.ev-sort` (`testing-events.css:1085–1089`; "Event", "Camp" and "Status" are 29–32 px wide). Not a WCAG AA failure (2.5.8's 24 px passes); §2.5's 44 × 44 misses. Give them a 44 px tap width on touch (an invisible box, as L-03's rule, if the look must stay). Calendar's Month / Week is in L-03. Check at 820 touch. Low.
- **C-04 is decided** (question 3 (f), v1.055): Jeffrey approved a line between Restore and the red Delete permanently on a removed person's ⋯. §8's ⋯ menu rule now says it (the design review wrote the "(See v1.055 …)" note on v1.011), and Color Belt and Black Belt build it. Nothing for you to build.
- **C-06 and your R2-07:** your R2-07 has no list of places: it puts the three sentences in `src/components/text.js`, and each section switches. The sections' own R2-07 items gain one more place, the failed Undo of Close / Open registration (Color Belt's and Star's items). Jeffrey approved question 3 (j) (v1.055): the Undo payment box's failure note becomes the failed-Undo sentence, already one of your three; the failed Mark paid line stays Color Belt's own (Camps re-exports it), and only its ending changes. Nothing new for you to build.
- **Shared words New students may ask for:** a "Couldn't copy …" line for a phone number (U-05), "Couldn't delete. Check the connection, then try again." (U-08), and one date-of-birth hint and one ZIP line (L-09). If Jeffrey says they go in `src/components/text.js`, you add them.

---

## Corrections to pass 1

- **R2-04 (the toast gets its own room) also covers full-screen dialog pages** (U-06). On a phone, New students' profile is a full-screen dialog page whose scroller is `.dialog-page-body` (`app.css:1062`, drawn by `components/Dialog.jsx:250`) inside a portal, not the page's scrolling area. At 390 touch, after Ruby M. → status tag → Booked, "Status: Booked · Undo" sits over "Book a free class". Add those pages to R2-04's change (pass 1's `Fix-DashboardCore.md:63`) and the phone profile page to its checks (`:64`): 390 touch, Ruby M. → status tag → Booked: "Book a free class" is never under the Undo. (Black Belt's full-screen detail with its own bottom buttons stays "not settled", as pass 1 said.)
- **R1-07's mockup includes the Paying by line** (C-07 (a)). The history's Paying by words differ: Color Belt "Paying by changed: Cash → Check" (`src/screens/testing/text.js:1271`), Camps "Paying by: Cash → Check" (`src/screens/camps/text.js:808, 820`; v0.736). Both are approved in their own mockups. Pass 1 listed only "recorded, undone, changed" (`Fix-DashboardCore.md:112`): draw the Paying by line in the same set.
- **R4-09's `inset: -1px 0` must be `-2px 0`** (L-03). On a 22 px tag with a 1 px border (`.ttag`, `shared.css:276–290`), `-1px 0` gives 22 px, not 24 (pass 1's `Fix-DashboardCore.md:89`; your plan, `docs/Dashboard Core/TKD-DashboardCore-Plan.md:881`). With `-1px`, R4-09's own check ("a click 1 px above or below the pill still opens the box") would fail.

---

## Done when

- Every Fix now item is built, reviewed and approved by Jeffrey in the preview: a design reviewer at the four sizes for visual changes, a code reviewer, and a security reviewer for anything touching the database or privacy.
- Both builds pass (`npm run build` and `npm run build:preview-mode`), and so does `node src/lib/shared/checks.mjs`.
- Jeffrey's decisions are rows from your block.
- The status file is current, and the work is committed on `dashboard-core`. No push.
- The report is sent to the Main session, naming the sections that adopt or check each fix.
