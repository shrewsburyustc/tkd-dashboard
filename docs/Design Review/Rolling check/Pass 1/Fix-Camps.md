# Camps — fixes from the design review's rolling check (pass 1)

**Paste into:** the Camps session.

This file reaches your worktree when `design-review` is merged into main; until then the Design Review session sends its text by message.

**Starter to paste:**

> `git merge main` first. Then read and do `docs/Design Review/Rolling check/Pass 1/Fix-Camps.md`: the fixes the design review's rolling check found in your merged work. Plan first. Mockups first for anything that changes how a screen looks. Nothing is built before I OK it.

---

## The brief

The design review's rolling check (phase 1d) looks at each section's design-review work after it merges: against the rulebook, the approved mockups, and the other sections that do the same job. Pass 1 covered `main` up to 5f1db41 (2026-11-03), in preview mode at the four sizes. Four reviewers looked (R1 money · R2 changes, mistakes and safety nets · R3 lists, menus and pickers · R4 item-by-item conformance and privacy). Two separate checkers then verified every finding. This file is what they confirmed in your merged work (C1, C2, C3, C4b, C6, C7, C11, C14, C17, C18, C20). Your C10 (the four count cards) merged after the cut (main e7fd75b); pass 2 checks it.

No straight fix of your own came out of pass 1. What touches Camps is three shared fixes you adopt after Dashboard core builds them, a few small things, unrecorded checks, and questions for Jeffrey.

- **Fix now:** straight fixes. Plan them, show Jeffrey, then build. An item marked "after [owner]'s [id]" waits until that fix is on main: plan it now, build it after.
- **Waits on Jeffrey:** a rule must be picked first. Don't build these yet.
- **Smaller:** fix them while you're in the file, and record the checks.
- Each item keeps its finding id (R2-05, R1-08 …) so Jeffrey can trace it. Use the id in your plan, status file and commits.
- **Line numbers** are main 5f1db41's; they may have moved. Your C10 merge changed `CampRoster.jsx`, `CampPage.jsx`, `camps/text.js`, `campRules.js` and `camps.css` after the cut.
- **Paths:** `CampRoster.jsx`, `CampPage.jsx`, `PaymentDialogs.jsx` and `CampRowMenu.jsx` are in `src/screens/camps/`; `camps/text.js` is `src/screens/camps/text.js`; `campRules.js` is `src/lib/camps/campRules.js`; `camps.css` and `camp.css` are in `src/styles/`; `components/…` is `src/components/…`.

### Rules

- Follow CLAUDE.md.
- **Plan first:** a short plan (each item, its files, its mockup, any migration) in your docs folder; show it to Jeffrey.
- **Preview mode for building and trying changes:** `npm run dev:preview-mode`. `npm run dev`, `npm run preview` and `Start dashboard.bat` use the live database (`.worktreeinclude` copies `.env.local` into every worktree): run them only for a check Jeffrey OKs, never to try a change. `npm run build` is fine: it only builds.
- **Mockups before code** for every visual change, at PC 1280×800, tablet 820×1180 touch, phone 390×844 touch and 320 wide: a self-contained HTML file plus one PNG per screen with what changes outlined in amber (Jeffrey reviews the PNGs). He OKs them one screen at a time, before any code.
- **One decision at a time,** with pictures: each option drawn, its pros and cons, and a recommendation.
- **Reviews:** a separate design reviewer (the rulebook, the approved mockups, screenshots at the four sizes, and §4's six WCAG 2.2 checks, v1.033); a separate code reviewer; a separate security reviewer for anything touching the database (handoff §6).
- **Order (a push to main deploys):** the migration is live before the push that brings the app that uses it. A step whose app calls a new or changed database function is merged only after Jeffrey has applied its migration and the checks passed (fingerprints, security advisor, tests file — CLAUDE.md). Screen-only steps can go first. (No item here needs a migration.)
- **Don't change a shared part on your own** (`src/components/…`, the shared helpers in `src/lib/`, `src/styles/shared.css`): every section uses them. If you need something a part can't do, ask Jeffrey first. He decides whether you change it in your branch (then list it as a shared file) or the Dashboard core session does.
- **Don't edit Color Belt's files.** Camps' `text.js` re-exports about 75 words from Color Belt's `src/screens/testing/text.js` (`camps/text.js:23–102`). Color Belt changes that file at the same time, so write any word you change in Camps' own `text.js`.
- List every CLAUDE.md shared file you touch (`src/styles/shared.css` and `src/components/text.js` are on that list).
- Keep `docs/Camps/TKD-Camps-Status.md` current, with a short "Rolling check, pass 1" section. Update it in the same turn a step finishes or a decision is made.
- Commit on `camps` after each reviewed step. Never push.
- When a step is done, send the Main session a short report: Done (with the commit) · Needs Jeffrey (one question, options, your recommendation) · Next.

### Rulebook

- New rows only for what Jeffrey decides in your mockups, from your block **0.700–0.799**: the next unused number (check the rulebook first).
- `git merge main` first, re-read the rulebook right before editing, and keep its CRLF line endings. The 10b row goes just above `| Approved 2026-10-16 (v0.26) |`, the changelog line at the end of §11; bump the header's Version and Last updated.
- A row that changes an older one adds a "(See v0.7xx …)" note at the start of that row.

---

## Fix now

Most severe first. All three wait for Dashboard core.

### R2-05 (your part) — An Undo pressed during another save is dropped without a word · Medium · after Dashboard core's R2-05

- **What's wrong:** found in Camps. With `setTestingDelay(2500)`: Withdraw Zoe Park → toast; Withdraw Sofia Nguyen; press Zoe's Undo while Sofia's save runs → the toast goes, no bar, nothing said, and both stay withdrawn. The shared Toast removes itself before it runs Undo (`components/Toast.jsx:73–77`), and your Undos return early while another save runs (`CampPage.jsx:351`, and the camp list's `Camps.jsx:137`). Staff believe it was undone.
- **Rule:** rule 1.4 / v1.006; §3.5 (never silent).
- **Change:** after Dashboard core's R2-05 (an Undo pressed while a save runs is *queued*: it waits its turn and runs as soon as that save ends, and its toast stays as "Undoing…"), your `runUndo` uses Dashboard core's helper.
- **Check (preview mode):** `__tkdPreview.setTestingDelay(2500)`; withdraw camper A, withdraw camper B, press A's Undo during B's save → A comes back with "Undone".

### R1-08 (your part) — The "$X due" tags don't gray while a Mark paid save runs · Low · after Dashboard core's R1-08

- **What's wrong:** while a Mark paid save runs, every "$X due" tag is `aria-disabled` (marked "off" for screen readers, but still reachable with Tab) yet looks exactly as before. Your own comment says "the tag is grayed" (`CampRoster.jsx:54` vs `:87–92`); `camps.css:747–749` sets only the cursor. On slow mat-side Wi-Fi, taps do nothing and nothing says why.
- **Rule:** v1.103 / detail 8: a control that can't be used right now shows the approved unavailable look and stays focusable.
- **Change:** after Dashboard core's R1-08. If it grays `.ev-tag-button[aria-disabled='true']` in `shared.css`, there is nothing to build here: check it. If it asks sections to add `is-unavailable` while busy, add it to the tags while a save runs.
- **Check (preview mode):** `__tkdPreview.setTestingDelay(3000)`, Mark paid one camper: the other tags gray at once and come back after the save.

### R3-13 (your part) — Edit payment's Date paid grays days with no hint · Low · after Dashboard core's R3-13

- **What's wrong:** Edit payment's "Date paid" grays the days after today but shows no hint (`camps/PaymentDialogs.jsx:252–263`), while Finance's calendars say "Days after today can't be chosen.". A gray day sometimes has a reason under it and sometimes doesn't.
- **Rule:** the newest rows (v0.623 N6, v0.817 / v0.818) say "days" and show the hint.
- **Change:** after Dashboard core's R3-13 puts the words in `src/components/text.js`, pass "Days after today can't be chosen." as the Date paid hint (import it from the shared words, not from Color Belt's `text.js`).
- **Check (preview mode):** open Edit payment's Date paid: the calendar has exactly that one line.

---

## Waits on Jeffrey (don't build yet)

- **R1-01** (High) — which school's Daily report counts a payment taken at one school's desk. Recommended: the desk's school for every section, as you do now (v0.708); under option B you would go back to v0.707's first rule (the camper's school). The design review asks Jeffrey; the answer reaches you through the Main session.
- **R1-05** (Medium) — when a camp family is handed money back: a "Record refund" like Star's, for admins, dated the day the money goes out (recommended; a Camps migration and a new ⋯ item), or Edit payment as today (v0.700 (6); "Camps has no refunds", `src/lib/camps/campReceipt.js:15`), which changes the payment's original, already-counted day in Finance. The design review asks Jeffrey; the answer reaches you through the Main session.
- **R2-03** (Medium) — Undo after restoring a "Duplicate copy" withdraws it as a plain "Removed" (`CampPage.jsx:448–466` → `0013_camps.sql:4331–4337`). Recommended: Star's rule everywhere, no Undo there. You own this one; Black Belt and Color Belt follow. The design review asks Jeffrey; the answer reaches you through the Main session.
- **R3-04** (Low, plausible) — touch rows: keep v0.715 (no row ⋯; the actions sit in Camper detail's "More"; the name opens the camper), written into §8 as a named exception (recommended), or add the row ⋯ like Star and Black Belt. The design review asks Jeffrey; the answer reaches you through the Main session.
- **R1-06** (Low) — one Undo payment box for every section: Black Belt's words ("Paid on [date]", recommended; your "recorded on", `camps/text.js:583–585`, changes) or Star's with "paid on". The design review asks Jeffrey; the answer reaches you through the Main session.
- **R1-07** (Low) — one toast after Mark paid and after Undo payment: yours and Color Belt's (recommended) or Black Belt's (then yours change). The design review asks Jeffrey; the answer reaches you through the Main session.
- **R2-07** (Low) — one set of words for "someone else changed it" and "Undo failed" (some of yours come from Color Belt's re-exported words). The design review asks Jeffrey; the answer reaches you through the Main session.
- **R3-02** (Low) — should a "Possible duplicate" camper count in the money cards until resolved (today `campRules.js:445–449` counts it)? Your C10 cards follow the answer. The design review asks Jeffrey; the answer reaches you through the Main session.
- **R3-06** (Low) — one shared back link made by Dashboard core (the camp page's `.ev-back`, 28 px with a plain 44 px touch box that pushes the title down, would switch to it). The design review asks Jeffrey; the answer reaches you through the Main session.
- **R3-09** (Low) — in-list search: one wording and place for every box ("Find a camper", `camps/text.js:541`, and its no-match line, `:516`, may change). The design review asks Jeffrey; the answer reaches you through the Main session.
- **R3-10** (Low) — one order for what sits above a roster (recommended: Star's — duplicate box, count cards, their "Showing … only" line, one-school line, search, switches, table). Your C10 follows. The design review asks Jeffrey; the answer reaches you through the Main session.
- **R4-06** (Low) — should your two weight-600 lines (`camps.css:1141`, `camp.css:186`) go to 500? Don't change weights unless Jeffrey decides. The design review asks Jeffrey; the answer reaches you through the Main session.
- **R4-13** (Low) — "Ask an admin to open it." (yours, v0.725; recommended for everyone) or "… to reopen." (then yours changes). The design review asks Jeffrey; the answer reaches you through the Main session.
- **The camp list's ⋯ order** (R3's S-8, Low): Camps' menu starts with "Edit camp" (`CampRowMenu.jsx:221`) and has no Copy link; Star, Black Belt and Color Belt start with Copy links, with Edit after Close / Open. One order for every event list? The design review asks Jeffrey; the answer reaches you through the Main session.
- **R5-04** (Medium, pass 1b) — what every "Payments recorded" card adds up. Today Camps counts removed campers' payments with no word about it, right above "Removed · Not in the counts" (`campRules.js:511`, `CampRoster.jsx:275`, `:522`). Star leaves a withdrawn candidate's money out; Color Belt counts it and says "includes $X from removed students". Recommended: all recorded money everywhere (as Finance counts it), with that gray line, so you would add "includes $X from removed campers" under your card. The design review asks Jeffrey; the answer reaches you through the Main session.
- **R5-03** (Low, pass 1b) — one way to remove a child on every family page. Recommended: the trash icon button, as on Forms' family page (v0.626). Your "Remove" link (`src/camp/ChildCard.jsx:92–96`, never in a mockup) would become that icon button. The design review asks Jeffrey; the answer reaches you through the Main session.

---

## Smaller (fix while you're in the file)

- Mixed straight and curly apostrophes in the Undo payment box: `camps/text.js:583` (’) vs `:592` ('). Low.
- The staff empty line "No camps yet." has no "An admin adds them." (`camps/text.js:131`): drift from v0.53 (§8 Empty states). Low.
- Camper detail's Paying by row has no "(chosen on the form / at the desk)", while Star's summary has it. After Star's R1-02, add the same "(chosen on the form)" / "(chosen at the desk)" to Camper detail's Paying by row, worked out by `payingByChoiceWhere` (`campRules.js:466–469`); mockup first. Low.
- Your three prompt checks aren't recorded in `docs/Camps/TKD-Camps-Status.md`: the ⋯ menu opening in the top-left corner on PC (`6-Camps.md:220`); Finance's Daily report after Edit payment and its Undo (`6-Camps.md:67`; the checker saw the first half work, the original day showing "Edited · Was $166.00", but didn't try the Undo); focus after a Camps-list dialog on touch (status line 152). Do them and record them.
- The tag target-size check ("Check them", `6-Camps.md:225`) isn't recorded either. R4 measured your "$140 due" tag at 67×22 with a mouse, with no tap box (it is the only way to Mark paid on the PC). The fix is Dashboard core's R4-09 (the shared tag style): record the measurement now, and check again after that fix.
- §2.4's `ti-calendar-event` row doesn't list your Coming card, which v0.737 gives that icon (`CampRoster.jsx:251`). Add "also Camps' Coming card (v0.737)" to that row at your next rulebook edit (`git merge main` first, re-read the rulebook, keep CRLF). Pass 1b, Low.
- "Showing coming Mon, Apr 19 only · Show all" (before or between camp days) wasn't in picture 18; put it in your next picture for Jeffrey. Pass 1b, Low.
- `docs/Camps/TKD-Camps-Status.md:142` still lists C10 under "Waits on Dashboard core", while `:161` says it is built and reviewed. Pass 1b, Low.

---

## Done when

- Every Fix now item is built, reviewed and approved by Jeffrey in the preview: a design reviewer at the four sizes for visual changes, a code reviewer, and a security reviewer for anything touching the database or privacy.
- These pass: `npm run build` and `npm run build:preview-mode`; `node src/lib/camps/checks.mjs` and `node --test functions/tests/`.
- Jeffrey's decisions are rows from your block.
- The status file is current (with the four checks recorded), and each step is committed on `camps`. No push.
- The report is sent to the Main session.

