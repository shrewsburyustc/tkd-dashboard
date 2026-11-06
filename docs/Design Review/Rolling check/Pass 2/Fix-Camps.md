# Camps — fixes from the design review's rolling check (pass 2)

**Paste into:** the Camps session.

This file reaches your worktree when `design-review` is merged into main; until then the Design Review session sends its text by message.

**Starter to paste:**

> `git merge main` first. Then read and do `docs/Design Review/Rolling check/Pass 2/Fix-Camps.md`: what the design review's rolling check (pass 2) found in your merged work and in shared problems that reach your roster. Plan first. Mockups first for anything that changes how a screen looks. Nothing is built before I OK it.

---

## The brief

The design review's rolling check (phase 1d) looks at each section's design-review work after it merges: against the rulebook, the approved mockups, and the other sections that do the same job. Pass 2 covered what merged into `main` after pass 1's cut (e7fd75b), up to 6b27cdd (2026-11-05), in preview mode at the four sizes. Five reviewers looked (M money, records and privacy · U undo, safety nets, confirms and dialogs · L lists, pickers, forms and layout · P New students' visitor profile and printed sheet · C Color Belt). Two separate checkers then verified every finding. This file is what they confirmed in your merged work after the cut (v0.738, Early drop-off and Late pick-up on the roster, 3a8dc70), and in shared problems that reach your screens.

Reviewer L found v0.738 built as picture 19, option A, at 1280, 820 touch, 390 and 320: the words in the day boxes, the legend, and the count line before and during the camp. The one Medium below comes from the shared side panel, not from your work. Jeffrey has decided it (v1.053), and it waits for Dashboard core's part. Your pass 1 items go on as planned.

- **Fix now:** straight fixes. Plan them, show Jeffrey, then build. An item marked "after [owner]'s [id]" waits until that fix is on main: plan it now, build it after.
- **Waits on Jeffrey:** nothing now. Questions 1–3 of the pass 2 report (`docs/Design Review/Rolling check/Pass 2/Pass 2 report.md`) are answered (v1.053, v1.052, v1.055), so their items are under Fix now.
- **Smaller:** fix them while you're in the file, or check them.
- Each item keeps its finding id (L-02, M-03 …) so Jeffrey can trace it. Use the id in your plan, status file and commits.
- **Line numbers** are main 6b27cdd's (checked 2026-11-05); they may move.
- **Paths:** `CampRoster.jsx`, `CampPage.jsx` and `CamperRowMenu.jsx` are in `src/screens/camps/`; `camps/text.js` is `src/screens/camps/text.js`; `campRules.js` and `campReceipt.js` are in `src/lib/camps/`; `camps.css` is `src/styles/camps.css`. Other sections' files are written in full.

### Rules

- Follow CLAUDE.md.
- **Plan first:** a short plan (each item, its files, its mockup, any migration) in your docs folder; show it to Jeffrey.
- **Preview mode for building and trying changes:** `npm run dev:preview-mode`. `npm run dev`, `npm run preview` and `Start dashboard.bat` use the live database (`.worktreeinclude` copies `.env.local` into every worktree): run them only for a check Jeffrey OKs, never to try a change. `npm run build` is fine: it only builds.
- **Mockups before code** for every visual change, at PC 1280×800, tablet 820×1180 touch, phone 390×844 touch and 320 wide: a self-contained HTML file plus one PNG per screen with what changes outlined in amber (Jeffrey reviews the PNGs). He OKs them one screen at a time, before any code.
- **One decision at a time,** with pictures: each option drawn, its pros and cons, and a recommendation.
- **Reviews:** a separate design reviewer (the rulebook, the approved mockups, screenshots at the four sizes, and §4's six WCAG 2.2 checks, v1.033); a separate code reviewer; a separate security reviewer for anything touching the database (handoff §6).
- **Order (a push to main deploys):** the migration is live before the push that brings the app that uses it. Screen-only steps can go first. (No item here needs a migration.)
- **Don't change a shared part on your own** (`src/components/…`, the shared helpers in `src/lib/`, `src/styles/shared.css`): every section uses them. If you need something a part can't do, ask Jeffrey first. He decides whether you change it in your branch (then list it as a shared file) or the Dashboard core session does.
- **Don't edit Color Belt's files.** Your `camps/text.js` re-exports about 75 words from Color Belt's `src/screens/testing/text.js`. Color Belt changes that file at the same time, so write any word you change in your own `camps/text.js`.
- List every CLAUDE.md shared file you touch (`src/styles/shared.css` and `src/components/text.js` are on that list).
- Keep `docs/Camps/TKD-Camps-Status.md` current, with a short "Rolling check, pass 2" section. Update it in the same turn a step finishes or a decision is made.
- Commit on `camps` after each reviewed step. Never push.
- When a step is done, send the Main session a short report: Done (with the commit) · Needs Jeffrey (one question, options, your recommendation) · Next.

### Rulebook

- New rows only for what Jeffrey decides in your mockups, from your block **0.700–0.799**: the next unused number (check the rulebook first).
- `git merge main` first, re-read the rulebook right before editing, and keep its CRLF line endings. The 10b row goes just above `| Approved 2026-10-16 (v0.26) |`, the changelog line at the end of §11; bump the header's Version and Last updated.
- A row that changes an older one adds a "(See v0.7xx …)" note at the start of that row.

---

## Fix now

### L-02 (your part) — Between 640 and 768 px wide, the roster table scrolls sideways · Medium · Jeffrey's answer to question 1 (v1.053), after Dashboard core's L-02

Picture: `docs/Design Review/Rolling check/Pass 2/pictures/Q1-roster-room.png` (your roster is pictures 2, 3, 5, 6, 8, 11 and 12).

- **What's wrong** (drift; new in pass 2):
  - Your roster's tablet rule follows the window's width (`camps.css:991`, `@media (max-width: 1023.98px)`: "The roster fits a tablet without scrolling").
  - But the side panel takes 72 px (Standard) or 96 px (Largest, v1.118) of that window, so near the narrow end of the tablet band the table doesn't fit.
  - Checker 1: April Vacation Camp at 768×1024 touch (an iPad held upright) with Largest. The table is 633 px wide in a 622 px box, and Friday's Check in and "Late" are cut off (picture 3).
  - Reviewer L: at 744 touch (an iPad mini upright) it scrolls sideways even with Standard; at 683 wide with a mouse (a laptop window snapped to half the screen) the whole page scrolls sideways (764 px in 683; picture 2).
- **Rule:** §1.3 ("No horizontal scrolling on any screen size"; tablets drop low-priority columns); v0.716 (your week switcher was chosen over sideways scrolling).
- **Change (Jeffrey chose A: "A: room beside panel", v1.053):** after Dashboard core's part:
  - Your tablet rules (`camps.css:991` and the rules that go with it) become `@container page (…)`. When the room beside the panel is too narrow for the grid, the roster uses the phone layout: one card per camper, with all five days and no sliding (pictures 5 and 6). With enough room, nothing changes (pictures 11 and 12).
  - Your cards have no ⋯ today, because phones show those choices in Camper detail (v1.048 (11)). With a mouse, the cards also get a ⋯ button (v1.053).
  - Your roster's `isPhone` (`src/screens/camps/CampPage.jsx:142`, read by `src/screens/camps/CampRoster.jsx:469`) then comes from Dashboard core's hook for the roster only; dialogs and ⋯ menus keep the window's.
  - Mockup first: the cards with a mouse, with their ⋯.
- **Check (preview mode):** Account menu → Panel size → Largest, then Standard. April Vacation Camp at 768 and 744 wide touch, 700 touch and 683 with a mouse: no sideways scroll, and every day is whole; where the cards show with a mouse, each has its ⋯. At 1280, 820 touch, 390 and 320 the roster looks as today.

### M-03 (your part) — No Print receipt for a removed camper who paid · Low · Jeffrey approved question 3 (b), v1.055

- **What's wrong** (approved this way: v0.734, "absent … for a removed camper"):
  - `canPrintReceipt` (`campReceipt.js:28–30`) needs an active camper, so a camper removed after paying gets no receipt. A removed camper's ⋯ holds only Restore and Delete permanently (`CamperRowMenu.jsx:57–61`).
  - Yet your Payments recorded card counts their money (v0.737, v1.038).
  - Color Belt and Star do the same; Black Belt offers it on every row.
- **Change (Jeffrey approved A, v1.055):** Print receipt also on a removed camper with money that still stands; never with nothing paid; never while Hide private details is on. Where it sits on a removed row, and for whom, is drawn in your mockup. v1.055 records it, and the design review wrote the "(See v1.055 …)" note on your v0.734, so you need no row of your own unless Jeffrey decides something new in your mockup.
- **Check (preview mode):** remove a camper who paid → their ⋯ (Camper detail's More on touch) has Print receipt where your mockup puts it, and it prints that payment; a removed camper with nothing paid has none; with Hide private details on, none.

### C-05 (b) — Your card filter's empty line says what is true · Low · Jeffrey approved question 3 (g), v1.055

- **What's wrong** (approved this way; four sections word it four ways): when a count card's filter leaves nobody, you say "No campers match." (`camps/text.js:511`). Color Belt says what is true ("No paid students in this class." / "Everyone in this class has paid.", v0.420, v0.424 (4)); Star says "No candidates match."; Black Belt "No candidates in this group."
- **Change (Jeffrey approved A, v1.055):** say what is true for each card, in Color Belt's pattern, for example "Every camper has paid." for To collect, and a line for your Coming card. Your lines are drawn in your mockup. "No past camps yet." (`:133`) stays.
- **Check (preview mode):** pick each count card on a camp where it leaves nobody: its own line shows. At 1280 and 390.

---

## Smaller (fix while you're in the file)

- **Question 3 answers that need nothing new from you** (Jeffrey approved every A, v1.055): (a) M-02: your History is the model (one save, one entry, v0.736). (f) C-04: you already draw the line between Restore and Delete permanently (`CamperRowMenu.jsx:59–60`), which §8 now asks for. (j) C-06 (b): your Undo payment box's note (`UNDO_PAYMENT_FAILED`, `camps/text.js:611`) stays in your pass 1 R2-07 switch to "Undo didn't save. Check the connection, then retry." (the design review wrote the "(See v1.055 …)" note on your v0.730). **Check, after Color Belt's C-06 (a):** your failed Mark paid line is Color Belt's, re-exported (`camps/text.js:58`, shown at `CampPage.jsx:428`), so its new ending ("… Check the connection, then retry.") reaches your screen; check it there. Nothing to build. Low.
- **L-07 — The blue "Early" / "Late" words** (approved this way: v0.738). You draw them in school blue (`camps.css:765–776`; the legend's word at `:784–788`), as v0.738 approved ("in small blue text"; picture 19 drew blue in both options). §1.2 now names these words as an exception to its limit of five blue things on a screen (v1.054). Nothing to change unless Jeffrey asks to recolor them. Low.
- **L-03, after Dashboard core's:** the touch tap box is 42 px, not 44, because `inset: -4px 0` counts from inside a 1 px border. Your day boxes copy it: `camps.css:821–825` (`.cp-dc`, a 1 px transparent border) and `:979–983` (`.cp-daychip`). Dashboard core fixes the number (`-5px 0`) and names your file in its report; if it leaves them to you, use the same number. Then check at 820 touch: a tap 3 px above or below a day box still opens it. Low.
- **C-07 (a):** your History's "Paying by: Cash → Check" (`camps/text.js:808, 820`) and Color Belt's "Paying by changed: Cash → Check" are both approved. Dashboard core's R1-07 mockup now draws this line too (its pass 2 correction); it follows that set with your pass 1 R1-07 item. Nothing to do now.

---

## Done when

- Every Fix now item is built, reviewed and approved by Jeffrey in the preview: a design reviewer at the four sizes for visual changes, a code reviewer, and a security reviewer for anything touching the database or privacy.
- These pass: `npm run build` and `npm run build:preview-mode`; `node src/lib/camps/checks.mjs` and `node --test functions/tests/`.
- Jeffrey's decisions are rows from your block.
- The status file is current, and each step is committed on `camps`. No push.
- The report is sent to the Main session.
