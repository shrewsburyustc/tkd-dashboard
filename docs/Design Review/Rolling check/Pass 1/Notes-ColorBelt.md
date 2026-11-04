# Color Belt — notes from the design review's rolling check (pass 1): check before your merge

**Paste into:** the Color Belt session.

This file reaches your worktree when `design-review` is merged into main; until then the Design Review session sends its text by message.

**Starter to paste:**

> `git merge main` first. Then read and do `docs/Design Review/Rolling check/Pass 1/Notes-ColorBelt.md`: what the design review's rolling check found in code you share with the merged sections. Check each point before you ask for your merge. Plan first. Mockups first for anything that changes how a screen looks. Nothing is built before I OK it.

---

## Why this note

The design review's rolling check (phase 1d) looks at each section's design-review work after it merges. Pass 1 covered `main` up to 5f1db41 (2026-11-03). Your design-review work (Part 1 and Part 2, branch `color-belt`) isn't merged yet, so pass 1 didn't review it; a later pass does, after your merge.

But pass 1 found problems in code you share with the merged sections, or that you and they copied from each other. Checking them now keeps the same gaps from arriving with your merge. Pass 1's checkers looked at your branch for a few points (R2-02, R2-03, R2-10, R3-08). Where a read-only look at your branch (9dbb1ce, checked again at 5ae845c) adds something, it says so.

- Each point keeps its finding id (R2-02, R2-10 …) so Jeffrey can trace it. Use the id in your plan, status file and commits.
- **Line numbers** are main 5f1db41's unless marked "on your branch"; they may have moved.
- **Paths:** a path starting with `event/`, `events/` or `private/` is in `src/screens/testing/`; `testing/text.js` is `src/screens/testing/text.js`; `components/…` is `src/components/…`.

### Rules (from your prompt)

- Follow CLAUDE.md.
- **Preview mode for building and trying changes:** `npm run dev:preview-mode`. `npm run dev`, `npm run preview` and `Start dashboard.bat` use the live database (`.worktreeinclude` copies `.env.local` into every worktree): run them only for a check Jeffrey OKs, never to try a change. `npm run build` is fine: it only builds.
- **Plan first:** a short plan (each item, its files, its mockup, any migration) in your docs folder; show it to Jeffrey.
- **Mockups before code** for every visual change, at PC 1280×800, tablet 820×1180 touch, phone 390×844 touch and 320 wide: a self-contained HTML file plus one PNG per screen with what changes outlined in amber (Jeffrey reviews the PNGs). He OKs them one screen at a time, before any code.
- **One decision at a time,** with pictures. Before asking, check whether another section already does it, and copy that.
- **Reviews:** a separate design reviewer (the rulebook, the approved mockups, screenshots at the four sizes, and §4's six WCAG 2.2 checks, v1.033); a separate code reviewer; a separate security reviewer for anything touching the database (handoff §6).
- **Order (a push to main deploys):** the migration is live before the push that brings the app that uses it. A step whose app calls a new or changed database function is merged only after Jeffrey has applied its migration and the checks passed (fingerprints, security advisor, tests file — CLAUDE.md). Screen-only steps can go first.
- **Don't change a shared part on your own** (`src/components/…`, the shared helpers in `src/lib/`, `src/styles/shared.css`): every section uses them. If you need something a part can't do, ask Jeffrey first. He decides whether you change it in your branch (then list it as a shared file) or the Dashboard core session does.
- List every CLAUDE.md shared file you touch (`src/styles/shared.css` and `src/components/text.js` are on that list).
- **Rulebook:** new rows only for what Jeffrey decides, from your block **0.400–0.499** (check the rulebook first). Run `git merge main` first, and re-read the rulebook right before editing. The 10b row goes just above `| Approved 2026-10-16 (v0.26) |`, the changelog line at the end of §11. Bump the header's **Version** and **Last updated**; keep CRLF. An older row you change gets a "(See v0.4xx …)" note at its start.
- Keep `docs/Testing/Color Belt Testing/TKD-ColorBelt-Status.md` current. Commit on `color-belt` after each reviewed step, and explain the commands. **Never push.**
- When a step is done, send the Main session a short report: Done (with the commit) · Needs Jeffrey (one question, options, your recommendation) · Next.

---

## Check before your merge

### R2-02 — Edit event's Undo is two steps, so it can stop halfway · High

Picture (today, with amber outlines): `docs/Design Review/Rolling check/Pass 1/pictures/H3-star-event-undo-half-done.png` (it shows Star; your Edit event works the same way).

- **What pass 1 found:** Star's Edit event Undo is two saves, the details and then the registration switch. If only the second fails, registration stays as edited, and Retry sends both again with the old version and falsely says "Couldn't undo. Someone else changed this just now." Your `testing/events/EventsTab.jsx:497–508` has the same two steps, on main and on your branch (9dbb1ce: `updateEvent`, then `setRegistration`, in one Undo, and `runUndo`'s Retry reruns both). Families could keep registering against what the Undo meant.
- **Rule:** v0.970 (Black Belt's Edit cycle Undo is one database step; "Undo stopped halfway" retired), v1.006, §3.5.
- **What to do:** the same fix as Star's R2-02. One database function puts the old details and the old switch back together or not at all, like `bb_undo_cycle_edit` in 0032; the toast's Undo calls it once. Ask the Main session for a migration number. Jeffrey applies it. The migration is live before the push that brings the app that uses it. Until it is live, Retry re-sends only the step that failed, with the version the first step returned, and never says "someone else". Main already has the same two steps, so whether this goes in before or after your merge is Jeffrey's call.
- **Check (preview mode):** Edit event (rename it and switch registration) → Save. Then:
  - **Before the migration is live (two steps):** `__tkdPreview.setTestingDelay(1500)` → Undo → `__tkdPreview.failNextSave()` about 2 s later (it fails the second step) → "Undo didn't save…" with Retry, never "someone else". Retry → "Undone", both back.
  - **With the one-step function:** `__tkdPreview.failNextSave()` → Undo → "Undo didn't save…" with Retry, and nothing changed. Retry → "Undone", both back.

### R2-10 — The Compare box's Keep buttons must keep "Keep this one" in their names · Low

- **What pass 1 found:** Star passes your old helper `keepThisOneLabel` (`testing/text.js:689` on main) to the shared Compare box, so its buttons are named "Keep the first registration" for screen readers and voice control, without the visible "Keep this one" (WCAG 2.5.3, "label in name"). The checker also found your own dialog (`event/CompareDialog.jsx:48`) had the same names.
- **What to check:** your 9dbb1ce switched the event roster to the shared `CompareDialog` (`event/EventPage.jsx:1720` on your branch at 5ae845c) and doesn't seem to pass `keepLabel`, so the shared default applies ("Keep this one: First registration"). Keep it that way. Your old helper (`testing/text.js:761` on your branch at 5ae845c) stays only while Star uses it; Star drops it with its own R2-10.
- **Check (preview mode):** open Review on a flagged pair and read the two buttons' accessible names.

### R1-02 — The Paying by hint · Medium (Star's), nothing to change here

- **What pass 1 found:** Star's Mark paid box says "They chose Check on the form" after the desk changed Paying by. Your branch already does it right (v0.418: "If they change how they pay the dashboard should reflect that"), as Camps does (v0.735). Star now copies Camps' pattern.
- **What to do:** nothing. Keep it, and make sure your merge brings v0.418's row with it.

### R1-03 — A history that drops Paying by changes · a check

- **What pass 1 found:** Star's history skipped every column whose name ends in `_by` (`CandidateHistory.jsx:87`, meant for `updated_by`), and `paying_by` ends in `_by`, so a Paying by change never showed.
- **What to check:** your history line (CB7) lists a Paying by change, and leaves it out while Hide private details is on.

### R1-08 — Mark paid doesn't gray while a save runs · Low (Dashboard core's fix)

- **What pass 1 found:** while a Mark paid save runs, the other Mark paid buttons are `aria-disabled` but look the same: in Star, in Camps' tags, and in Color Belt on main (`event/RosterRows.jsx:100–105`). Dashboard core fixes the look (its R1-08).
- **What to do:** after Dashboard core's R1-08, check your Mark paid box's row button grays while a save runs; if Dashboard core asks sections to add `is-unavailable` while busy, add it.

### R2-05 — An Undo pressed during another save is dropped · Medium (Dashboard core's fix)

- **What pass 1 found:** the shared Toast removes itself before it runs Undo, and each section's Undo returns early while another save runs, so the Undo vanishes without a word. Your `runUndo` starts the same way (`events/EventsTab.jsx:518` on your branch: `if (!beginWrite()) return;`): check it, and your other Undos.
- **What to do:** after Dashboard core's R2-05, your `runUndo`s use its helper.

### Shared fixes you get from Dashboard core · Low

- **R4-07:** the history's gray "Payment history is hidden on this tablet." line shows only for people who had money changes (`HistoryLine.jsx:106`), so it tells paid from unpaid. Dashboard core shows it in every history while hidden; your CB7 line gets it. Check it after both merges.
- **R4-09:** clickable tags (`.ev-tag-button`) are 22 px tall with a mouse. Dashboard core gives them a 24 px target in `testing-events.css`. Check your tags after.
- **R3-13:** Dashboard core puts "Past days can't be chosen." and "Days after today can't be chosen." in `src/components/text.js`. If your CB11 date fields gray days, use those words and show the hint.

### R1-01 — Count each payment at the desk that took it · High · decided 2026-11-04 (v1.035)

- **Today:** Finance books your payments to the event's school (a private testing's payments to the private testing's school), so a family that pays at the other school's desk is counted in the wrong drawer.
- **Rule:** v1.035 (Jeffrey, 2026-11-04): every payment counts at the school of the desk that took it, the school set under This device in the account menu, as Camps does (v0.708). The school is stored on the payment when it is recorded, and an undo, edit or returned check copies it from the payment it corrects (v0.903's chain rule). Which school a refund counts at is still open (v1.035). Money booked to the wrong school is moved by undoing it and recording it again on a device set to the right school.
- **What to do:** after your merge, or in your Part 2 if it fits, `testing_payments` and `testing_private_payments` get a school column. Existing rows take the school Finance shows for them today: the event's, or the private testing's (`0026:602`). The old 2-argument functions the live site still calls store that same school. `testing_mark_paid_by` / `testing_private_mark_paid_by` (your 0030 functions) take the device's school and store it. Undo, Edit payment, `testing_move_to_private` and `testing_private_undo_move` (0030) copy it from the payment they correct or move, so a Move stays a transfer (v0.407) and never changes a counted day. That needs a migration: ask the Main session for a number; Jeffrey applies it. Finance then reads your stored school in a step of its own, so say in your report when yours is live. Order: your migration, then Finance's reader migration, then your app push. The app passes This device's school through `src/App.jsx` and `src/screens/Testing.jsx`, both CLAUDE.md shared files: list them.

### Smaller lines for you

- **Add student while hidden** (out of pass 1, for your own review): on main, Add student stays usable while Hide private details is on and shows "Paying by Cash · Check · Card". It asks no birthday or email, so it isn't desk-only, but Paying by is a payment detail that Camps hides. Check how your branch handles it, and ask Jeffrey if it needs a rule.
- **The shared `DeleteDialog`:** the checker found it used only by your Classes and ranks (`ClassesRanksTab.jsx:63` on main), planned to go with CB5. A read-only look at 9dbb1ce shows your Classes and ranks now uses the shared ConfirmBox, so after your merge nothing uses `src/components/DeleteDialog.jsx` or its old address `src/screens/testing/DeleteDialog.jsx`. Removing a shared part is Dashboard core's call (the shared-part rule): say so in your report.
- **Camps re-exports your words:** Camps re-exports about 75 words from your `testing/text.js` (allowed), so your word changes reach Camps' screens at your merge without a Camps review. In your merge report, list which re-exported words you changed, so Camps can check them.
- Your count cards still draw Not paid with the clock (`EventPage.jsx:1413`, `PrivateTestingTab.jsx:841`), where Star and Camps use `ti-circle-x`. That's your planned CB15. Pass 1b.
- **R5-04 is decided** (2026-11-04, v1.038): Payments recorded counts all money received, removed people included, with your own line "includes $X from removed students". Nothing changes for you.

---

## Waits on Jeffrey (follow the answer later)

- **R2-03** (Medium) — Undo after restoring a "Duplicate copy" withdraws it as a plain "Removed" (`event/EventPage.jsx:1087–1096` on main; :1120 on your branch). Recommended: Star's rule everywhere, no Undo there. You follow Camps' answer. The design review asks Jeffrey; the answer reaches you through the Main session.
- **R1-06** (Low) — one Undo payment box for every section. Your CB3 second half uses Star's approved words ("… recorded on Nov 3 …"); the recommended answer, Black Belt's, says "Paid on [date]". The design review asks Jeffrey; the answer reaches you through the Main session.
- **R1-07** (Low) — one toast after Mark paid and after Undo payment. Recommended: yours and Camps' ("[Name] marked paid · $X [way]", `testing/text.js:599`; "Payment undone for [Name]", `:605`). The design review asks Jeffrey; the answer reaches you through the Main session.
- **R2-07** (Low) — one set of words for "someone else changed it" and "Undo failed" (yours: `testing/text.js:252, 269`). The design review asks Jeffrey; the answer reaches you through the Main session.
- **R3-02** (Low) — should a "Possible duplicate" row count in Paid / Not paid until resolved? Yours counts it today (`event/EventPage.jsx:381–383, 1410–1415`); your cards (CB9) and duplicate box (CB19) follow the answer. The same question covers whether a possible-duplicate row offers Mark paid (you hide it today). The design review asks Jeffrey; the answer reaches you through the Main session.
- **R3-06** (Low) — one shared back link made by Dashboard core. Your `.ev-back` (event, private grading) is 28 px with a plain 44 px touch box that pushes the title down (`testing-events.css:272–279, 1086–1090`). The design review asks Jeffrey; the answer reaches you through the Main session.
- **R3-08** (Low) — the icon for "Change private day or time" in Star: the recommended answer is your `ti-calendar` (`private/PrivateTestingTab.jsx:780`), so nothing to do unless Jeffrey picks otherwise. The design review asks Jeffrey; the answer reaches you through the Main session.
- **R3-09** (Low) — in-list search: does your roster get a box (A), or rely on the top-bar people search (B, recommended)? The design review asks Jeffrey; the answer reaches you through the Main session.
- **R3-10** (Low) — one order for what sits above a roster (recommended: Star's — duplicate box, count cards, their "Showing … only" line, one-school line, search, switches, table; today yours puts the cards first). The design review asks Jeffrey; the answer reaches you through the Main session.
- **R4-06** (Low) — should weight 600 go to 500? Yours: `register.css:375, 394, 659` (your family form, which Star's and Camps' forms load too). Don't change it unless Jeffrey says so. The design review asks Jeffrey; the answer reaches you through the Main session.
- **R4-13** (Low) — "Ask an admin to open it." (Camps, recommended) or "… to reopen." (yours, `testing/text.js:406, 419`). The design review asks Jeffrey; the answer reaches you through the Main session.

---

## When you're done

- Each point is checked, and fixed where needed: reviewed (a design reviewer at the four sizes for visual changes, a code reviewer, and a security reviewer for the R2-02 migration or anything about privacy) and approved by Jeffrey in the preview.
- `npm run build` and `npm run build:preview-mode` pass, and so do `src/lib/testing/checks.mjs` and `src/lib/shared/checks.mjs`.
- The status file says what you checked and what you changed.
- The work is committed on `color-belt`. **No push.**
- The report is sent to the Main session (with the Camps words and the `DeleteDialog` note).
