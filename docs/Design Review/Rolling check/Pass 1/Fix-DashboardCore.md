# Dashboard core — fixes from the design review's rolling check (pass 1)

**Paste into:** the Dashboard core session.

This file reaches your worktree when `design-review` is merged into main; until then the Design Review session sends its text by message.

**Starter to paste:**

> `git merge main` first. Then read and do `docs/Design Review/Rolling check/Pass 1/Fix-DashboardCore.md`: the fixes the design review's rolling check found in your merged work. Plan first. Mockups first for anything that changes how a screen looks. Nothing is built before I OK it.

---

## The brief

The design review's rolling check (phase 1d) looks at each section's design-review work after it merges: against the rulebook, the approved mockups, and the other sections that do the same job. Pass 1 covered `main` up to 5f1db41 (2026-11-03), in preview mode at the four sizes. Four reviewers looked (R1 money · R2 changes, mistakes and safety nets · R3 lists, menus and pickers · R4 item-by-item conformance and privacy). Two separate checkers then verified every finding. This file is what they confirmed in the shared parts (step 1 and v1.114–v1.117), and in shared problems that showed up in several sections at once. Your work not yet on main (e.g. v1.118, panel size, and step 2) is checked in a later pass.

- **Fix now:** straight fixes. Plan them, show Jeffrey, then build. Several have a matching item in a section's own fix file ("after Dashboard core's [id]"): Star, Camps, Black Belt and the new students session adopt your change once it is on main. Say in your report when each is merged, so the Main session can tell them.
- **Waits on Jeffrey:** a rule must be picked first. Don't build these yet. Most are one set of words or one look for every section, kept once in your shared files.
- **Smaller:** fix them while you're in the file.
- Each item keeps its finding id (R2-05, R1-08 …) so Jeffrey can trace it. Use the id in your plan, status file and commits.
- **Step 2:** R1-08 and R3-12 lean on step 2's planned page-wide `.btn.is-unavailable` (`docs/Dashboard Core/TKD-DashboardCore-Plan.md:487, 625`), and Star's R4-08 can use it too. Plan them with it.
- **Line numbers** are main 5f1db41's; they may have moved. The new students' N13 merge changed `shared.css` after the cut. Items decided in v1.045–v1.049 cite main 84a6e7d's.
- **Paths:** `components/…` is `src/components/…`, and so are the bare names `Toast.jsx`, `HistoryLine.jsx`, `Select.jsx` and `MarkPaidBox.jsx`; `shared.css`, `app.css` and `testing-events.css` are in `src/styles/`. The sections' own files are named as the checkers wrote them; each section's fix file gives their full paths.

### Rules

- Follow CLAUDE.md.
- **Preview mode for building and trying changes:** `npm run dev:preview-mode`. `npm run dev`, `npm run preview` and `Start dashboard.bat` use the live database (`.worktreeinclude` copies `.env.local` into every worktree): run them only for a check Jeffrey OKs, never to try a change. `npm run build` is fine: it only builds.
- **Plan first:** a short plan (each item, its files, its mockup, any migration) in your docs folder; show it to Jeffrey.
- **Mockups before code** for every visual change, at PC 1280×800, tablet 820×1180 touch, phone 390×844 touch and 320 wide: a self-contained HTML file plus one PNG per screen with what changes outlined in amber (Jeffrey reviews the PNGs). He OKs them one screen at a time, before any code.
- **One decision at a time,** with pictures: each option drawn, its pros and cons, and a recommendation.
- **Reviews:** a separate design reviewer (the rulebook, the approved mockups, screenshots at the four sizes, and §4's six WCAG 2.2 checks, v1.033); a separate code reviewer; a separate security reviewer for anything touching the database (handoff §6).
- **Order (a push to main deploys):** the migration is live before the push that brings the app that uses it. A step whose app calls a new or changed database function is merged only after Jeffrey has applied its migration and the checks passed (fingerprints, security advisor, tests file — CLAUDE.md). Screen-only steps can go first. (No item here needs a migration.)
- **The shared parts are yours, and every section uses them** (`src/components/…`, the shared helpers in `src/lib/`, `src/styles/shared.css`). A change to one changes every section's screens. So a new state or look of a shared part is shown to Jeffrey first (one small picture), and your report names the sections that must adopt or check it. `src/styles/testing-events.css` isn't on CLAUDE.md's list, but Color Belt, Star, Camps and Black Belt use its tag style: treat it the same way.
- List every CLAUDE.md shared file you touch (`src/styles/shared.css` and `src/components/text.js` are on that list).
- Keep `docs/Dashboard Core/TKD-DashboardCore-Status.md` current, with a short "Rolling check, pass 1" section.
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

---

## Fix now

Most severe first.

### R2-04 — The toast gets its own room · Medium · decided 2026-11-04 (v1.042)

Picture: `docs/Design Review/Rolling check/Pass 1/pictures/Q7-toast-covers-buttons.png`.

- **What's wrong:** the 5-second toast is drawn on top of the page (`styles/app.css:999–1005, 1228–1235` at the cut; `:1078` and `:1308` on main now), so its Undo covers whatever sits under it: "Delete permanently" in Star's phone ⋯ sheet, a row's ⋯ on the mat tablet, Camps' Check in buttons on phones (at 54 of 95 scroll positions at 390 wide), and the ⋯ column on the PC. Only Black Belt moves its toast (phones only, `blackBelt/staff/blackBelt.css:1559, 1592–1606`).
- **Rule:** v1.042 (Jeffrey, 2026-11-04: "A: own room"): while a toast shows, the page's scrolling area and any open ⋯ sheet end above it, so nothing can sit under it, on every page and size; when it goes, the room goes too. The toast's place stays as v0.29. §4 check 3 (v1.033): keyboard focus is never hidden.
- **Change:** build it once, in the shared toast (`src/components/Toast.jsx`) and the shared styles: while a toast is up, reserve its height at the bottom of the scrolling area and of any open ⋯ sheet (for example a CSS variable the toast sets, used as bottom room). These are your own shared files. Section files don't change, except that Black Belt removes its own ⋯ sheet rule afterwards (its R2-04 item). Not settled: a full-screen detail with its own bottom buttons (Black Belt's candidate detail keeps v0.967 (3)'s lift). Draw it both ways in the mockup, room or the toast lifted above the buttons, for Jeffrey. Mockup first: a picture of the short jump at each size.
- **Check (preview mode):** at 390 touch, open a Star row's ⋯ sheet while a toast shows: Delete permanently sits above the toast. Camps' roster at 390 and 320: scroll through while a toast shows, and measure with the design review's `node "docs/Design Review/tools/cdp.mjs" rects …` (it reaches your worktree when `design-review` is merged), or check by eye on the screenshots, that no Check in or ⋯ is ever under the Undo. 820 touch: a Star row's ⋯ is never under the toast. 1280: the ⋯ column is clear. With the keyboard, Tab to the last control on the page: it is never hidden behind the toast.

### R2-05 — An Undo pressed while another save runs is dropped without a word · Medium

- **What's wrong:** the shared Toast removes itself before it runs Undo (`components/Toast.jsx:73–77`), and every section's Undo returns early while another save runs (`CampPage.jsx:351`, `star/.../CandidatesTab.jsx:560`, `StarEventsTab.jsx:552`, `useCandidateActions.js:342`, `Calendar.jsx:594`, `Prospects.jsx:250`, `Forms.jsx:194`). So the toast vanishes and nothing happens. In the checker's run (Camps, `setTestingDelay(2500)`): Withdraw Zoe Park, Withdraw Sofia Nguyen, press Zoe's Undo during Sofia's save → the toast went, no bar, and both stayed withdrawn. Staff believe it was undone.
- **Rule:** rule 1.4 / v1.006; §3.5 (never silent).
- **Change:** one shared rule: an Undo pressed while a save runs is *queued* (it waits its turn) and runs as soon as that save ends. Its toast stays meanwhile, as "Undoing…" in the busy look. You build the Toast side and one small helper; each section's `runUndo` uses it (Star, Camps, Black Belt and new students have a matching item; Color Belt's note too). This is a shared part (`src/components/Toast.jsx`) with a new state: show Jeffrey one small picture of the "Undoing…" toast first.
- **Check (preview mode):** `__tkdPreview.setTestingDelay(2500)`; On the parts page: an Undo pressed while a fake save runs shows "Undoing…" and runs when the save ends. (Each section's matching item checks its own screen.)

### R4-07 — The gray "Payment history is hidden" line tells paid from unpaid · Low

- **What's wrong:** the history's gray line "Payment history is hidden on this tablet." appears only for people who had money changes (`HistoryLine.jsx:106`, `hidden && hiddenPayments > 0`). So seeing it or not tells paid from unpaid — the thing v0.249 hides. In Camps, with the switch on, Ella Grant (unpaid) shows no gray line and Chloe Nguyen (paid) shows it.
- **Rule:** v1.108 / v1.010 (money changes are left out and one gray line says so); v0.249 (paid / not-paid hidden on that device).
- **Change:** show the line in every history while the switch is on (drop `hiddenPayments > 0`; the "nothing to open" branch just below then shows "History" plus the line). Star and Camps use `HistoryLine` today; Black Belt and Color Belt get the fix with their Part 2.
- **Check (preview mode):** Camps, switch on: Ella Grant (unpaid) and Chloe Nguyen (paid) both show the gray line; Star the same.

### R1-08 — Buttons and tags that wait for a Mark paid save don't look unavailable · Low

- **What's wrong:** while a Mark paid save runs, Camps' "$X due" tags and Star's (and Color Belt's) Mark paid buttons are `aria-disabled` (marked "off" for screen readers, but still reachable with Tab) yet look exactly as before. Camps' own comment (`CampRoster.jsx:54`) says they are grayed. No rule grays an `aria-disabled` `.btn` or `.ev-tag-button` on the dashboard (`forms-public.css:120` only sets the kiosk's and family pages' cursor; `finance.css:811` is Finance's own) (the shared gray is scoped to the shared parts, `shared.css:1546–1566`). On slow mat-side Wi-Fi, taps do nothing and nothing says why.
- **Rule:** v1.103 / detail 8: a control that can't be used right now shows the approved unavailable look and stays focusable.
- **Change:** with step 2's page-wide `.btn.is-unavailable` (planned, plan :487, :625), add the same gray for `.btn[aria-disabled='true']` and `.ev-tag-button[aria-disabled='true']` in `shared.css` (or have the sections add `is-unavailable` while busy). Check every other `aria-disabled` plain button in the app for an unwanted change first. Say in your report which way you chose: Star and Camps have a matching item, and Color Belt's note too.
- **Check (preview mode):** `__tkdPreview.setTestingDelay(3000)`, Mark paid one camper: the other tags gray at once and come back after the save; Star the same.

### R4-09 — Clickable tags are 22 px tall with a mouse · Low

- **What's wrong:** with a mouse, every clickable tag is 22 px tall with no tap box (measured at 1280: "$140 due" 67×22, `::after` none). That includes Camps' "$X due", the only way to Mark paid on the PC, and the "Review possible duplicate" tags. It probably passes WCAG 2.5.8 through its spacing exception, but not the rulebook's plain "at least 24 × 24 px". (A *tap box* is an invisible `::after` area around a small control, so a near miss still hits it.)
- **Rule:** §4 check 1, v1.033: anything you tap or click is at least 24 × 24 px.
- **Change:** in `testing-events.css`, give `.ev-tag-button::after` an invisible box outside the touch query too (e.g. `inset: -1px 0`, keeping `-14px -4px` on touch), or `min-height: 24px` (`testing-events.css:412–415, 1101–1105`). Several sections use this style: name them in your report. Camps records its "Check them" check against your fix.
- **Check (preview mode):** at 1280 the pill draws the same, rows don't grow, and a click 1 px above or below the pill still opens the box.

### R3-12 — The shared Select has no "unavailable" state · Low

- **What's wrong:** Star locks the Dan for staff with the Select's `readOnly`, which is the "saving" look, with the busy cursor (`shared.css:823–826`; `components/Select.jsx:35–39, 250, 257`), although Star's approved words say "a grayed Dan" with its reason (rulebook l.699). The Select has no "grayed but still focusable" state: v1.116's `disabled` is skipped by Tab, which would hide the reason from keyboard users.
- **Rule:** v1.109 (read-only means "gray and closed while the dialog saves, the busy cursor"); v1.116 ("turned off" is a different state); v1.012 (what staff can't do right now is grayed with an "Ask an admin" reason); v1.103's unavailable look.
- **Change:** give the shared `Select` an "unavailable" state with v1.103's look (as `.is-unavailable`: gray words, the `not-allowed` cursor; show the plain cursor too if unsure), `aria-disabled`, still a Tab stop, so the linked reason is heard. Show Jeffrey one small picture first, because it is a new state of a shared part. Then Star's Dan and Stars fields use it (Star's matching item).
- **Check (preview mode):** on the parts page (`/parts.html`), the new state: no busy cursor, and the reason is read on focus.

### R3-13 — One hint for gray days, in one place · Low

- **What's wrong:** the same gray-day hint comes in two wordings: "Past dates can't be chosen." (`star/events/text.js:64`, `star/candidates/text.js:207`, `blackBelt/staff/text.js:332`) vs "Past days can't be chosen." (`prospects/text.js:228–229`); "Days after today can't be chosen." in Finance (`finance/text.js:343`). Two Date paid calendars gray the days after today with no hint at all (Star's Edit payment, `StarPaymentDialogs.jsx:172–185`; Camps' `camps/PaymentDialogs.jsx:252–263`). (R4's "Past days / Past dates" smaller line is this same finding.)
- **Rule:** the newest rows (v0.623 N6, v0.817 / v0.818) say "days" and show the hint; v1.030 (shared words live once).
- **Change:** put the staff hint words once in `src/components/text.js`: "Past days can't be chosen." and "Days after today can't be chosen.". Then Star and Black Belt switch from "dates", and both Date paid calendars pass the "Days after today" hint (their matching items). Prospects and Finance already say "days": nothing changes on their screens. Say in your report whether their own copies should switch to the shared words (then the new students and Finance sessions each get a matching item), or record that they keep them. Leave the family-page date-of-birth hint unless Jeffrey wants it changed too.
- **Check (preview mode):** the two lines exist once in `src/components/text.js`, and nothing on screen changes yet.

### R1-07 — One set of payment words: the toasts now, the payment line and history after a mockup · Low · decided 2026-11-04 (v1.045)

- **What's wrong:** the toast after Mark paid comes in four wordings (Star "Payment recorded"; Camps and Color Belt "[Name] marked paid · $X [way]"; Black Belt "Payment recorded · $X · [Name]"), and Undo payment's in two. The person's payment line ("$140 card · paid Nov 3" in Star, "$140 check · Worcester · Nov 3 · Jeffrey Berg" in Camps) and the history's words ("Payment recorded: $140 card, paid Nov 3" in Star, "Marked paid $140 check" in Camps) differ too.
- **Rule:** v1.045 (3) (Jeffrey, 2026-11-04: "Approve all"): the toasts after Mark paid and Undo payment read "[Name] marked paid · $X [way]" (while hidden, "[Name] marked paid", v0.722) and "Payment undone for [Name]"; the person's payment line and the history's payment words become one set too, drawn in your mockup. v1.045 keeps shared words once in `src/components/text.js`.
- **Change:**
  - Put the three toast words in `src/components/text.js` now, as Camps and Color Belt have them (`src/screens/camps/text.js:576, 578`; `src/screens/testing/text.js:633, 641` on main 84a6e7d).
  - Draw one mockup, at the four sizes, of the payment line and the history's payment words (recorded, undone, changed), from the four sections' versions today: Star `src/screens/testing/star/candidates/text.js:93, 262, 311, 313`; Camps `src/screens/camps/text.js:708, 815–816`; Black Belt `src/blackBelt/staff/text.js:1370–1373` and its detail's payment lines (`src/blackBelt/staff/candidates/CandidateDialog.jsx:134, 174`); Color Belt `src/screens/testing/text.js:605, 734, 1259, 1261` on main 84a6e7d. Jeffrey OKs one set, and it goes in `src/components/text.js` too. Draw Black Belt's installment case too (the toast after payment 1 of 3), so Jeffrey sees whether "marked paid" reads as paid in full there.
  - Star, Camps, Black Belt and Color Belt switch after (their R1-07 items). Say in your report when each part is merged.
- **Check (preview mode):** the toast words, and later the approved line and history words, exist once in `src/components/text.js`; nothing on screen changes yet.

### R1-06 — The Undo payment box's shared words · Low · decided 2026-11-04 (v1.045)

- **What's wrong:** the Undo payment box comes in two wordings. Star, Camps and Color Belt ask "Undo [Name]'s payment?" with "… payment recorded on [date] …", though the date is the day the family paid. Black Belt asks "Undo [Name]'s $X [way] payment?" with "Paid on [date] …" (v0.964, v0.965).
- **Rule:** v1.045 (2) (Jeffrey, 2026-11-04: "Approve all"): the Undo payment box uses Black Belt's words: "Undo [Name]'s $X [way] payment?", "Paid on [date] …" and the section's own consequence; shared words are kept once in `src/components/text.js`.
- **Change:** put the title and the second line's opening, "Paid on [date]", in `src/components/text.js`, copied from `src/blackBelt/staff/text.js:795, 814–815` (with its curly apostrophe). Each section adds its own consequence ("the row goes back to Not paid", "… is owed again", "It comes off the balance"). Star, Camps, Black Belt and Color Belt switch after (their R1-06 items).
- **Check (preview mode):** the words exist once in `src/components/text.js`, and nothing on screen changes yet.

### R2-07 — One set of words for "someone else changed it" and a failed Undo · Low · decided 2026-11-04 (v1.045)

- **What's wrong:** "someone else changed it" comes in seven wordings and a failed Undo in four. Color Belt, Star, Schedule and Finance say "Someone else changed this just now. Your change wasn't saved."; Black Belt says "Someone else changed [Name] just now, so nothing was done. Their change is shown."; Prospects, Forms and Calendar each have their own.
- **Rule:** v1.045 (4) (Jeffrey, 2026-11-04: "Approve all"): a refused change or Undo says "Someone else changed [Name] just now, so nothing was done. Their change is shown." or "Couldn't undo: [reason].", and a failed Undo says "Undo didn't save. Check the connection, then retry." (Black Belt's v0.966 set; R2-07, R4-14); shared words are kept once in `src/components/text.js`.
- **Change:** put the three sentences in `src/components/text.js`: the first two copied from Black Belt's (`src/blackBelt/staff/text.js:587, 88`), the third a template the section fills with its reason (the shape of `:1226`). Not in this set: the sentences shown inside an open dialog ("… Cancel, then open it again to see the latest."), which the row doesn't name, and the two parts still open (Waits, below). Every section switches after (its R2-07 item; Color Belt's note too). Update the file's header (`src/components/text.js:6–7`, "A part never holds a section's words …"): it now also holds sentences every section repeats (v1.045 (4); and R1-06's / R1-07's words if you keep them there).
- **Check (preview mode):** the three sentences exist once in `src/components/text.js`, and nothing on screen changes yet.

### R3-06 — One shared back link · Low · decided 2026-11-04 (v1.048)

- **What's wrong:** the back link has six copies in two sizes. `.st-back`, `.tc-back` and `.fb-back` are 24 px and pulled back on touch; `.ev-back`, `.bb-back` and `.fin-back-link` are 28 px with a plain 44 px touch box that pushes the title down (at 820 touch the title sits at 146 px instead of 124). v0.624 left a shared one to your work, but no plan item exists.
- **Rule:** v1.048 (12) (Jeffrey, 2026-11-04: "Approve all"): you build one shared back link in `.tc-back`'s look (24 px, a 16 px arrow, a 44 px touch box pulled back so the title doesn't move), and every section switches to it.
- **Change:** a back-link part in `src/components/` with its style in `shared.css`, copying `.tc-back`'s numbers (`src/screens/testing/chooser/chooser.css:90–104`): 24 px tall with a 16 px `ti-arrow-left`, and on touch a 44 px tap box pulled back with negative margins. The section passes the words and the screen-reader name. It is a new shared part: show Jeffrey one small picture first. Testing's focus helper finds back links by their old classes (`src/screens/Testing.jsx:252` on main 84a6e7d, a CLAUDE.md shared file): add the shared link's class there. Then Star, Camps, Black Belt, Finance, New students (Forms) and Color Belt switch (their R3-06 items).
- **Check (preview mode):** on the parts page (`/parts.html`): 24 px with a mouse, a 44 px tap box on touch, and the title under it at the same height at 1280 and 820 touch.

---

## Waits on Jeffrey (don't build yet)

- **R2-07, the open part** (Low) — v1.045 (4) set the refused and failed sentences (Fix now, above). Still open: the words after an Undo (Finance's "Close undone. The day is open again.", Star's "Registration open"; R2's smaller line) and the load-failure words (R3's S-2). The design review asks Jeffrey; the answer reaches you through the Main session.

---

## Smaller (fix while you're in the file)

- `MarkPaidBox.jsx:91–92` places the box against `window.innerHeight` and ignores the phone's bottom bar, so at 320×800 Star's box opens downward over the bar (its button stays visible). Plausible: the checker didn't re-measure it. Low.
- Five copies of the gray "hidden" style: `.ev-hidden-value`, `.st-hidden-value`, `.cmp-hidden`, `.rcpt-hidden`, `.hist-hidden-line`. Same look today; one shared class would stop them drifting apart. Low.
- Six copies of `NoIcon` (the blank 16 px icon slot): `blackBelt/staff/parts/NoIcon.jsx`, `CampRowMenu.jsx`, `finance/DayReport.jsx`, `Forms.jsx`, `testing/events/EventsTab.jsx`, `star/events/StarEventsTab.jsx`. One shared part would do. Low.
- Stale comment: `shared.css:1687` still names Camps' removed `.cp-popover`. Low.
- Staff accounts still open while Hide private details is on: planned as your M17 (step 2, `TKD-DashboardCore-Status.md:18`). Not a finding; listed so it isn't lost.
- **The turned-off IconButton is done on main** (v1.120): turned off or unavailable, it is gray (the icon in `--color-disabled-text`, no hover square), and its tooltip still shows its name. Nothing to do here.
- The bordered icon-button look exists three times: `shared.css` `.tib--outline`, `finance.css` `.fin-ibtn`, `parts.css` `.parts-ibtn`; only Finance's has a grayed state. v0.626 lets Finance move to the shared one later. Pass 1b, Low.
- **The success colors are done on main** (v1.121): `tokens.css` has `--color-success-bg` and `--color-success-border`, and the shared green tag uses them; each section switches its own copies from its note. Nothing to do here.
- **R2-09 is decided** (2026-11-04, v1.046 (7)): only the account toasts (PIN, password) show the ✓. Nothing to build: the shared Toast leaves it off when a section passes `icon: false` (`Toast.jsx:79–80`, `src/App.jsx:242–247`), and New students and Finance now do (their R2-09 items).
- **R3-09 is decided** (2026-11-04, v1.047 (14)): no shared list search. Black Belt, Camps and New students give their own boxes the same words and place, with one no-match line (the words and the place: one picture for Jeffrey, asked by the design review); Star and Color Belt rely on the top-bar people search (v1.031). Nothing to build.
- **R4-02 is decided** (2026-11-04, v1.049 (a)): a desk-only form that is open while Hide private details is turned on from another browser tab keeps what was typed. It is recorded as a known gap in v0.249's "every screen". Nothing to build.
- **R4-03 (the words) is decided** (2026-11-04, v1.045 (1)): "Hidden on this tablet" and "Payment details are hidden on this tablet." already live once in `src/lib/privateDetails.js:47–48`, as `text.js`'s header says, so nothing moves into `text.js`. Black Belt switches to them. Nothing to build.
- **R4-06 is decided** (2026-11-04, v1.048 (23)): screen text uses weights 400 and 500 only. Black Belt, Camps and New students change their own 600s, and printed sheets keep theirs; your shared styles have none. Nothing to build.
- **S-1 is decided** (2026-11-04, v1.047 (19)): Worcester comes first wherever both schools are listed, as in your location switcher (`src/lib/device.js:10`). Star, Finance and Black Belt change theirs. Nothing to build.
- **S-10 is decided** (2026-11-04, v1.048 (20)): the browser's own dropdowns become your shared Select (v1.100) when a section next works on that screen. No sweep. Nothing to build.

---

## Done when

- Every Fix now item is built, reviewed and approved by Jeffrey in the preview: a design reviewer at the four sizes for visual changes, a code reviewer, and a security reviewer for anything touching the database or privacy (R4-07 is a privacy fix).
- Both builds pass (`npm run build` and `npm run build:preview-mode`), and so does `node src/lib/shared/checks.mjs`.
- Jeffrey's decisions are rows from your block.
- The status file is current, and the work is committed on `dashboard-core`. No push.
- The report is sent to the Main session, naming the sections that adopt each fix.

