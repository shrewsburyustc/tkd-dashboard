# Black Belt testing — fixes from the design review's rolling check (pass 2)

**Paste into:** the Black Belt testing session.

This file reaches your worktree when `design-review` is merged into main; until then the Design Review session sends its text by message.

**Starter to paste:**

> `git merge main` first. Then read and do `docs/Design Review/Rolling check/Pass 2/Fix-BlackBelt.md`: the fixes the design review's rolling check (pass 2) found in your merged work, and what it adds to two lines of your pass 1 file. Plan first. Mockups first for anything that changes how a screen looks. Nothing is built before I OK it.

---

## The brief

The design review's rolling check (phase 1d) looks at each section's design-review work after it merges: against the rulebook, the approved mockups, and the other sections that do the same job. Pass 2 covered what merged into `main` after pass 1's cut (e7fd75b), up to 6b27cdd (2026-11-05), in preview mode at the four sizes. Five reviewers looked (M money, records and privacy · U undo, safety nets, confirms and dialogs · L lists, pickers, forms and layout · P New students' visitor profile and printed sheet · C Color Belt). Two separate checkers then verified every finding. This file is what they confirmed in your merged work after the cut (BB13's time list, 2e806e7; BB8's History, b428666; v0.974–v0.975, 392bc9e), and in shared problems that reach your screens.

The reviewers found BB13's time list built as its picture (the same list as Star's and Camps', opening at the chosen time), BB8's History showing the shared Retry bar when it can't load, and your "on this tablet" words matching the screen. The problems below are small. Your pass 1 items are still open on main (planned on `black-belt`); nothing here changes them, except two lines that pass 2 adds to.

- **Fix now:** straight fixes. Plan them, show Jeffrey, then build. An item marked "after [owner]'s [id]" waits until that fix is on main: plan it now, build it after.
- **Waits on Jeffrey:** questions in the pass 2 report (`docs/Design Review/Rolling check/Pass 2/Pass 2 report.md`): the results sheet is question 2, the rest are in question 3. Don't build them until his answer comes through the Main session.
- **Smaller:** fix them while you're in the file.
- Each item keeps its finding id (L-01, M-04 …) so Jeffrey can trace it. Use the id in your plan, status file and commits.
- **Line numbers** are main 6b27cdd's (checked 2026-11-05); they may move.
- **Paths:** `CandidatesTab.jsx` and `CandidateDialog.jsx` are in `src/blackBelt/staff/candidates/`; `candidates/…`, `cycle/…`, `rubric/…`, `results/…` and `parts/…` are under `src/blackBelt/staff/`; `blackBelt.css` is `src/blackBelt/staff/blackBelt.css`; `components/…` is `src/components/…`. Other sections' files are written in full.

### Rules

- Follow CLAUDE.md.
- **Plan first:** a short plan (each item, its files, its mockup, any migration) in your docs folder; show it to Jeffrey. Add these items to your plan, `docs/Testing/Black Belt Testing/TKD-BlackBelt-DesignReview-Plan.md`.
- **Preview mode for building and trying changes:** `npm run dev:preview-mode`. `npm run dev`, `npm run preview` and `Start dashboard.bat` use the live database (`.worktreeinclude` copies `.env.local` into every worktree): run them only for a check Jeffrey OKs, never to try a change. `npm run build` is fine: it only builds.
- **Mockups before code** for every visual change, at PC 1280×800, tablet 820×1180 touch, phone 390×844 touch and 320 wide: a self-contained HTML file plus one PNG per screen with what changes outlined in amber (Jeffrey reviews the PNGs). He OKs them one screen at a time, before any code.
- **One decision at a time,** with pictures and a recommendation.
- **Reviews:** a separate design reviewer (the rulebook, the approved mockups, screenshots at the four sizes, and §4's six WCAG 2.2 checks, v1.033); a separate code reviewer; a separate security reviewer for anything touching the database (handoff §6).
- **Order (a push to main deploys):** the migration is live before the push that brings the app that uses it. Screen-only steps can go first. (No item here needs a migration.)
- **Don't change a shared part on your own** (`src/components/…`, the shared helpers in `src/lib/`, `src/styles/shared.css`): every section uses them. If you need something a part can't do, ask Jeffrey first. He decides whether you change it in your branch (then list it as a shared file) or the Dashboard core session does.
- List every CLAUDE.md shared file you touch (`src/styles/shared.css` and `src/components/text.js` are on that list).
- Keep `docs/Testing/Black Belt Testing/TKD-BlackBelt-Status.md` current, with a short "Rolling check, pass 2" section.
- Commit on `black-belt` after each reviewed step. **Never push.**
- When a step is done, send the Main session a short report: Done (with the commit) · Needs Jeffrey (one question, options, your recommendation) · Next.

**Rulebook:** new rows only for what Jeffrey decides in your mockups, from your block **0.900–0.999**: the next unused number (check the rulebook first).
- Run `git merge main` first, and re-read the rulebook right before editing.
- The 10b row goes just above `| Approved 2026-10-16 (v0.26) |`; the changelog line goes at the end of §11; bump the header's Version / Last updated. Keep CRLF.
- A row that changes an older one adds a "(See v0.9xx …)" note at the start of that row.

---

## Fix now

### L-01 — The grayed Delete day fades its tooltip, keyboard ring and icon · Low

- **What's wrong** (drift):
  - Your own rule `.bb-day-acts .tib[aria-disabled='true'] { color: var(--color-disabled-text); opacity: 0.5; cursor: default; }` (`blackBelt.css:3057–3061`) puts half strength on the whole button, the shared tooltip and keyboard ring included.
  - Checker 1 measured it (Spring 2027 → Edit cycle, "Delete Physical"):
    - the tooltip is white on #8E8E8E, 3.28 : 1 (the shared tooltip is #1F1F1F, 16.5 : 1);
    - the keyboard ring is #7E99C9, about 2.9 : 1 (school blue #003595 is 10.8 : 1);
    - the icon is #C4C4C2, 1.75 : 1 (v1.120's gray, #8A8A85, is 3.47 : 1).
  - It isn't a WCAG AA failure, because the button is `aria-disabled` and WCAG leaves unavailable controls out (1.4.3, 1.4.11). So it is Low: polish on one admin dialog.
  - Dashboard core found it (`docs/Dashboard Core/TKD-DashboardCore-Status.md:805`, `:817`) and queued it to pass on through Main (`:937`), then Jeffrey's pause stopped it. Your files don't have it.
- **Rule:** §4 (a 2 px school-blue focus ring); v1.120 (an unavailable icon button is the icon in `--color-disabled-text`, and its tooltip still shows its name).
- **Change:** delete the rule (`blackBelt.css:3057–3061`). The shared look (v1.120) already draws the gray, and the tooltip and ring stay at full strength.
- **Check (preview mode):** `__tkdPreview.loadBlackBeltGradingSample()`, `__tkdPreview.setToday('2027-06-09')`, reload → Testing → Black Belt testing → Past → Spring 2027 → ⋯ → Edit cycle → point at "Physical"'s trash, then Tab onto it: the tooltip is the dark shared one, the ring is school blue, and the icon is v1.120's gray.

### L-06 (your grips) — Your drag handles look ready while a save runs · Low · after Dashboard core's L-06

- **What's wrong** (unclear for the look: no row covers a turned-off grip):
  - Your own `Grip` (`parts/Grip.jsx`, used at `rubric/RubricEditor.jsx:451, 465, 541` and `cycle/PricesSection.jsx:140`) marks `aria-disabled` while a save runs, but looks the same as an enabled one.
  - Checker 1 tested it with your stylesheet loaded: a grayed grip computes #6B6B6B, opacity 1 and the grab cursor, like an enabled one. (A reviewer thought you grayed them; you don't, and neither does anyone else.)
- **Rule:** the shared Grip's own header (`disabled`: "true: shown, but can't drag (e.g. while saving)", `components/Grip.jsx:16`); v1.116 / v1.120 (a turned-off control looks turned off).
- **Change:** after Dashboard core's L-06 gives the shared `Grip` its gray, switch to the shared one (its header already plans it: `components/Grip.jsx:9–10`), and your `parts/Grip.jsx` goes.
- **Check (preview mode):** `__tkdPreview.bbSample()`, `__tkdPreview.setToday('2027-02-15')`, reload, then `__tkdPreview.setTestingDelay(4000)`; a cycle's Rubric tab → ⋯ on a subject → Move down → Save the Dan: while it says "Saving…", every grip is gray. Afterwards `__tkdPreview.setTestingDelay(200)`.

---

## Waits on Jeffrey (don't build yet)

Each is a question in the pass 2 report: M-06 is question 2, and the rest are in question 3, the small ones. The Main session passes on his answer.

### M-04 — View signature hides while private details are hidden · Low · question 3 (c)

- **What's wrong** (unclear: built in B2 and walked through at CP2, v0.915, but no row says it):
  - Your candidate detail shows View signature only for `isAdmin && !hidden` (`CandidateDialog.jsx:690`), and its header says so (`:22–24`). So with the switch on, the waiver reads "… · on file" and can't be opened.
  - On the same tablet Star keeps "Ticked and signed · View signature" (`src/screens/testing/star/candidates/CandidateDialog.jsx:126–135`), and New students keep Show signature.
  - v0.508 (3) ends "View signature stays"; v1.000 (2) says "the questions and Show signature stay, as Star's View signature"; and v1.037's header says it "applies … v0.508 (3) to Black Belt" (its text names Add candidate, Edit details and the Dan). v1.000 (3), the list of what the switch hides, has no signature.
  - It is stricter than the rule, not a leak.
- **If A (recommended):** View signature shows to admins while hidden too, as Star's: drop `!hidden` at `:690`, and update the header. No new words.
- **If B:** record your rule (the signature stays at the desk) in a row from your block.

### M-03 (your part) — Print receipt with nothing paid, and on a withdrawn row with money · Low · question 3 (b)

- **What's wrong:**
  - Pass 1 already gives you the first half: Print receipt is offered with nothing paid (`docs/Design Review/Rolling check/Pass 1/Fix-BlackBelt.md:298`; `CandidatesTab.jsx:246, 313`, "do it with BB2").
  - Pass 2 found the other half. In Color Belt, Star and Camps a removed person with money gets no receipt (each section approved that: v0.424 (6), v0.518, v0.734), while yours does (`CandidatesTab.jsx:246`). v1.038 still counts that money.
- **Before BB2 builds pass 1's line, wait for Jeffrey's answer:**
  - If A (recommended): Print receipt on any row with a payment or refund that still stands, active or withdrawn; never with nothing paid; never while hidden. So keep it on a withdrawn row that has money, and drop it on rows with nothing paid. Your v0.220 ("at any time") gets a "(See …)" note.
  - If B: also drop it on withdrawn rows.
  - Don't copy Star's rule (`src/lib/star/candidateMenu.js:25–27`) exactly before he answers: it also drops the receipt on withdrawn rows that have money.

### C-04 (your part) — No line between Restore and the red Delete permanently · Low · question 3 (f)

- **What's wrong** (unclear: v1.011 doesn't place Restore):
  - On a withdrawn row, Restore and Delete permanently sit in one group (`CandidatesTab.jsx:247–253`), so the red item sits right under Restore.
  - Star (`src/lib/star/candidateMenu.js:34–35`) and Camps (`src/screens/camps/CamperRowMenu.jsx:59–60`) draw a line there; Color Belt doesn't either.
- **If A (recommended):** Delete permanently gets its own line on a withdrawn row, as Star's.

### M-06 — Your wall sheet lists make-ups and unfinished candidates · Low · question 2

- **What's wrong** (approved this way: R05 in v0.947, where the sheet "shows full results, as Star (rule 5 flagged once)"):
  - Your printed results sheet lists MAKE-UP rows ("Needs: …") and NOT FINISHED rows as well as PASSED ones (`results/ResultsSheet.jsx:11–17` describes it), as Star's does. Every row, PASSED included, keeps its score: each draws the score cell (`results/ResultsSheet.jsx:208`; "305.75 / pass 275 · PASS" at `:15`).
  - Color Belt's sheet lists only who passed, because "the sheet is put up at the school" (v0.416).
- Question 2 recommends B, your way, because Jeffrey has chosen full results twice while warned about privacy (Star's v0.142 and v0.145, and your v0.947).
- **If B (recommended):** nothing changes for you; Color Belt's sheet lists everyone too.
- **If A:** your sheet keeps only "PASSED — CONGRATULATIONS!" (whether a passed row keeps its score is drawn in your mockup); make-ups and unfinished candidates hear it from their result email or at the desk. v0.947's R05 gets a "(See …)" note; v0.975's school line stays.
- **If C:** nothing changes for you.

### Also in question 3

- **(g) C-05 (b):** your card filter's empty line, "No candidates in this group." (`src/blackBelt/staff/text.js:537`), may change to say what is true for each card, in Color Belt's pattern. If Jeffrey picks that, draw your four cards' lines in your BB15 mockup.

---

## Smaller (fix while you're in the file)

- **C-05 (a) adds to pass 1's `Fix-BlackBelt.md:304`** (your empty roster shows four "0" cards, the search box and the table header). Color Belt's event roster does the same (its own C-05 (a)), while Star, Camps and Color Belt's Private testing tab draw no cards until someone is listed (Star's `hasAny`: `src/screens/testing/star/candidates/CandidatesTab.jsx:1224, 1489`; Camps' `hasCampers`: `src/screens/camps/CampRoster.jsx:617, 625`). Yours draws them whenever `!hidden` (`CandidatesTab.jsx:426, 442`). Do the same as Star when BB15 moves you to the shared count cards. Low.

---

## Done when

- Every Fix now item is built, reviewed and approved by Jeffrey in the preview: a design reviewer at the four sizes for visual changes, a code reviewer, and a security reviewer for anything touching the database or privacy.
- These pass: `npm run build` and `npm run build:preview-mode`; `src/lib/blackBelt/checks.mjs` and `src/lib/shared/checks.mjs`; the Function tests (`node --test functions/tests/`).
- Jeffrey's decisions are rows from your block.
- The status file is current, and the work is committed on `black-belt`. **No push.**
- The report is sent to the Main session.
