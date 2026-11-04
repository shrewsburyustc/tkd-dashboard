# Color Belt — fixes from the design review's rolling check (pass 1), now on your merged work

**Paste into:** the Color Belt session.

This file reaches your worktree when `design-review` is merged into main; until then the Design Review session sends its text by message.

**Starter to paste:**

> `git merge main` first. Then read and do `docs/Design Review/Rolling check/Pass 1/Notes-ColorBelt.md`: what the design review's rolling check found in code you share with the merged sections. Your Part 1 and Part 2 are merged (main 84a6e7d), so each point is a fix on main, made on your branch. Plan first. Mockups first for anything that changes how a screen looks. Nothing is built before I OK it.

---

## Why this note

The design review's rolling check (phase 1d) looks at each section's design-review work after it merges. Pass 1 covered `main` up to 5f1db41 (2026-11-03). Your design-review work (Part 1 and Part 2) merged into main after the cut (84a6e7d, 2026-11-04), so pass 1 didn't review it; pass 2 does.

But pass 1 found problems in code you share with the merged sections, or that you and they copied from each other. They arrived on main with your merge, so they are fixes now. Pass 1's checkers looked at your branch for a few points (R2-02, R2-03, R2-10, R3-08). Where a read-only look at your branch (9dbb1ce, checked again at 5ae845c) adds something, it says so.

- Each point keeps its finding id (R2-02, R2-10 …) so Jeffrey can trace it. Use the id in your plan, status file and commits.
- **Line numbers** are main 5f1db41's unless marked "on your branch"; they may have moved. Points decided in v1.045–v1.049 cite main 84a6e7d's (your merged work), and points decided in v1.050–v1.051 main 392bc9e's.
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

## Fix now

### R2-02 — Edit event's Undo is two steps, so it can stop halfway · High

Picture (today, with amber outlines): `docs/Design Review/Rolling check/Pass 1/pictures/H3-star-event-undo-half-done.png` (it shows Star; your Edit event works the same way).

- **What pass 1 found:** Star's Edit event Undo is two saves, the details and then the registration switch. If only the second fails, registration stays as edited, and Retry sends both again with the old version and falsely says "Couldn't undo. Someone else changed this just now." Your `testing/events/EventsTab.jsx:497–508` has the same two steps, on main and on your branch (9dbb1ce: `updateEvent`, then `setRegistration`, in one Undo, and `runUndo`'s Retry reruns both). Families could keep registering against what the Undo meant.
- **Rule:** v0.970 (Black Belt's Edit cycle Undo is one database step; "Undo stopped halfway" retired), v1.006, §3.5.
- **What to do:** the same fix as Star's R2-02. One database function puts the old details and the old switch back together or not at all, like `bb_undo_cycle_edit` in 0032; the toast's Undo calls it once. Ask the Main session for a migration number. Jeffrey applies it. The migration is live before the push that brings the app that uses it. Until it is live, Retry re-sends only the step that failed, with the version the first step returned, and never says "someone else". Your merged code still has the two steps (`events/EventsTab.jsx:458–506` on main 84a6e7d).
- **Check (preview mode):** Edit event (rename it and switch registration) → Save. Then:
  - **Before the migration is live (two steps):** `__tkdPreview.setTestingDelay(1500)` → Undo → `__tkdPreview.failNextSave()` about 2 s later (it fails the second step) → "Undo didn't save…" with Retry, never "someone else". Retry → "Undone", both back.
  - **With the one-step function:** `__tkdPreview.failNextSave()` → Undo → "Undo didn't save…" with Retry, and nothing changed. Retry → "Undone", both back.

### R2-10 — The Compare box's Keep buttons must keep "Keep this one" in their names · Low

- **What pass 1 found:** Star passes your old helper `keepThisOneLabel` (`testing/text.js:689` on main) to the shared Compare box, so its buttons are named "Keep the first registration" for screen readers and voice control, without the visible "Keep this one" (WCAG 2.5.3, "label in name"). The checker also found your own dialog (`event/CompareDialog.jsx:48`) had the same names.
- **What to check:** your 9dbb1ce switched the event roster to the shared `CompareDialog` (`event/EventPage.jsx:1787` on main 392bc9e) and doesn't seem to pass `keepLabel`, so the shared default applies ("Keep this one: First registration"). Keep it that way. Your old helper (`testing/text.js:761` on your branch at 5ae845c) stays only while Star uses it; Star drops it with its own R2-10.
- **Check (preview mode):** open Review on a flagged pair and read the two buttons' accessible names.

### R1-02 — The Paying by hint · Medium (Star's), nothing to change here

- **What pass 1 found:** Star's Mark paid box says "They chose Check on the form" after the desk changed Paying by. Your branch already does it right (v0.418: "If they change how they pay the dashboard should reflect that"), as Camps does (v0.735). Star now copies Camps' pattern.
- **What to do:** nothing. Keep it (v0.418 is on main since your merge).

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

- **R4-07:** the history's gray "Payment history is hidden on this tablet." line shows only for people who had money changes (`HistoryLine.jsx:106`), so it tells paid from unpaid. Dashboard core shows it in every history while hidden; your CB7 line gets it. Check it once Dashboard core's R4-07 is on main.
- **R4-09:** clickable tags (`.ev-tag-button`) are 22 px tall with a mouse. Dashboard core gives them a 24 px target in `testing-events.css`. Check your tags after.
- **R3-13:** Dashboard core puts "Past days can't be chosen." and "Days after today can't be chosen." in `src/components/text.js`. If your CB11 date fields gray days, use those words and show the hint.

### R1-01 — Count each payment at the desk that took it · High · decided 2026-11-04 (v1.035)

- **Today:** Finance books your payments to the event's school (a private testing's payments to the private testing's school), so a family that pays at the other school's desk is counted in the wrong drawer.
- **Rule:** v1.035 (Jeffrey, 2026-11-04): every payment counts at the school of the desk that took it, the school set under This device in the account menu, as Camps does (v0.708). The school is stored on the payment when it is recorded, and an undo, edit or returned check copies it from the payment it corrects (v0.903's chain rule). A refund counts at the desk that hands the money back (v1.040). Money booked to the wrong school is moved by undoing it and recording it again on a device set to the right school.
- **What to do:** as a step after your merged Part 2, `testing_payments` and `testing_private_payments` get a school column. Existing rows take the school Finance shows for them today: the event's, or the private testing's (`0026:602`). The old 2-argument functions the live site still calls store that same school. `testing_mark_paid_by` / `testing_private_mark_paid_by` (your 0030 functions) take the device's school and store it. Undo, Edit payment, `testing_move_to_private` and `testing_private_undo_move` (0030) copy it from the payment they correct or move, so a Move stays a transfer (v0.407) and never changes a counted day. That needs a migration: ask the Main session for a number; Jeffrey applies it. Finance then reads your stored school in a step of its own, so say in your report when yours is live. Order: your migration, then Finance's reader migration, then your app push. The app passes This device's school through `src/App.jsx` and `src/screens/Testing.jsx`, both CLAUDE.md shared files: list them.

### R2-03 — No Undo after restoring a Duplicate copy · Medium · decided 2026-11-04 (v1.043)

- **Today:** your event page's Restore of a "Duplicate copy" has an Undo that puts the row back as a plain "Removed" (`event/EventPage.jsx:1291–1312` on main 84a6e7d).
- **Rule:** v1.043 (Jeffrey, 2026-11-04: "A: as Star"), Star's v0.517 G3 for every section: restoring a row set aside as a "Duplicate copy" shows "[Name] restored" with no Undo, because an Undo would put the row back as a plain "Removed" with a history that says Withdrawn. To change it back, an admin uses Review → Keep this one again. Every other restore keeps its 5-second Undo (v1.006).
- **What to do:** give that restore no Undo, as Star's `star/candidates/CandidatesTab.jsx:900–910` does. Other restores keep their Undo. No database change.

### R3-02 — Possible duplicates stay out of the counts until resolved · Low · decided 2026-11-04 (v1.046)

- **Today:** your event page's cards count a possible-duplicate row in Students, Paid and Not paid, and the Paid / Not paid filters list it (`event/EventPage.jsx:435–437, 463–464, 1668–1680` on main 84a6e7d). Mark paid is already hidden on it (`event/RosterRows.jsx:79`, `EventPage.jsx:426`).
- **Rule:** v1.046 (8) (Jeffrey, 2026-11-04: "Approve all"): a row marked "Possible duplicate" stays out of Paid and Not paid until the pair is resolved, with one gray line under the cards saying so, as Black Belt does; Payments recorded still counts any money received (v1.038). Until then it offers no Mark paid or Record payment, as Color Belt and Camps already don't.
- **What to do:** leave rows with `duplicateState === 'possible'` out of Paid and Not paid, and out of the two filters (Students doesn't change), as Black Belt's `rosterFilter` does (`src/lib/blackBelt/rules.js:1062`). Payments recorded and its "includes $X from removed students" line stay. Add the gray line as the shared cards' `note` (`EventPage.jsx:1998`), in words that name Paid and Not paid, drawn in your mockup. Keep Mark paid hidden. Mockup first.
- **Check (preview mode):** on an event with a possible-duplicate pair: Paid and Not paid leave the pair out (Students still counts it), the gray line says so, and tapping Not paid doesn't list them. Review → Keep this one: the counts are whole again and the line goes.

### R3-10 — The duplicate box goes above the cards · Low · decided 2026-11-04 (v1.047)

- **Today:** your event page draws the cards first, then the duplicate box, then the class switch (`event/EventPage.jsx:1998–2016` on main 84a6e7d).
- **Rule:** v1.047 (15) (Jeffrey, 2026-11-04: "Approve all"): one order above every roster: the duplicate box, the count cards, their "Showing … only" line, the one-school line, the search, the switches (Dan, class, week), then the table.
- **What to do:** move the `DuplicateBox` (`:2009`) above the `CountCards` (`:1998`). The class switch and the roster follow, as today.
- **Check (preview mode):** on an event with a possible-duplicate pair, at 1280 and 390: the duplicate box, then the cards, then (after tapping Not paid) "Showing not paid only · Show all", then the class switch.

### R4-13 — "Ask an admin to reopen." becomes "Ask an admin to open it." · Low · decided 2026-11-04 (v1.045)

- **Today:** staff after a closing date read "The closing date has passed. Ask an admin to reopen." (`testing/text.js:433, 446` on main 84a6e7d).
- **Rule:** v1.045 (5) (Jeffrey, 2026-11-04: "Approve all"): staff after a closing date read "Ask an admin to open it.", as Camps' v0.725.
- **What to do:** "… Ask an admin to reopen." → "… Ask an admin to open it." in both lines (the second keeps "Registration wasn't opened."). Camps doesn't re-export these two.
- **Check (preview mode):** `__tkdPreview.setRole('staff')` and reload, then `__tkdPreview.setToday()` to a day after an event's closing date: the event's ⋯ reason reads "The closing date has passed. Ask an admin to open it."

### R4-06 — Your family-page text drops from weight 600 to 500 · Low · decided 2026-11-04 (v1.051)

- **Today:** three screen rules in your family-page stylesheet use weight 600, which §7 doesn't allow on screen (400 and 500 only): the fee amount (`src/styles/register.css:375`, `.reg-fee__amount b`), the bold start of the late-price warning (`:394`, `.reg-fwarn b`) and the total (`:659`, `.reg-total b`). None sits in a print block. Star's and Camps' family pages load this stylesheet too (`src/star-register/main.jsx:14`, `src/camp/main.jsx:10`): Camps' page draws the total (`src/camp/StepCheck.jsx:103`, `src/camp/SignedUp.jsx:90`); Star's draws none of the three today.
- **Rule:** v1.051 (4) (Jeffrey, 2026-11-04: "Yes approved go ahead"): Color Belt's family-page text (`register.css`, which Star's and Camps' family pages load too) goes from weight 600 to 500, like all other screen text (§7; v1.048 (23)).
- **What to do:** those three → 500. Three family pages load this stylesheet, so before you build it, show Jeffrey a picture of the three family pages (yours, Star's and Camps'), before and after, at 1280 and 390. Camps changes nothing for it (its own R4-06 changes only `camp.css:186`).
- **Check (preview mode):** your family page (the fee, the late-price warning and, after sending, the total), Camps' family page (the family total) and Star's family page, at 1280 and 390: no text computes weight 600.

### R2-07 (the words after an Undo) — Reopening registration says so · Low · decided 2026-11-04 (v1.051)

- **Today:** the Undo of ⋯ Close registration opens registration again but says only "Undone" (`events/EventsTab.jsx:550–551`, `switchRegistration`'s `isUndo` branch), and so does Edit event's Undo when the edit had closed registration (`:504–506`, its toast at `:524`). Your other Undos say "Undone", as v1.051 asks.
- **Rule:** v1.051 (1) (Jeffrey, 2026-11-04: "Yes approved go ahead"): after an Undo the toast says "Undone" everywhere; when the Undo reopens something people depend on, it adds one short sentence: Finance "Undone. The day is open again.", Star "Undone. Registration is open again."; the same rule covers every Undo that opens registration, sign-up or a form again, in the same pattern: Color Belt and Black Belt "Undone. Registration is open again." (R2-07's open part).
- **What to do:** when the Undo opened registration, show "Undone. Registration is open again." (Star's words). An Undo that closes it stays "Undone".
- **Check (preview mode):** ⋯ Close registration on an open event → Undo → "Undone. Registration is open again."; ⋯ Open registration → Undo → "Undone".

### R1-06 — The Undo payment box takes Black Belt's words · Low · decided 2026-11-04 (v1.045) · after Dashboard core's R1-06

- **Today:** your CB3 box uses Star's words, "Undo [Name]'s payment?" and "The $X [way] payment recorded on [date] is reversed …" (`testing/text.js:662–664`, and the private testing's at `:1078–1083`, on main 84a6e7d).
- **Rule:** v1.045 (2) (Jeffrey, 2026-11-04: "Approve all"): the Undo payment box uses Black Belt's words: "Undo [Name]'s $X [way] payment?", "Paid on [date] …" and the section's own consequence; v1.045: "Built by Dashboard core (the shared words) and by each section switching to them."
- **What to do:** after Dashboard core's R1-06, take the title and "Paid on [date]" from `src/components/text.js`, and keep your consequence (what the row goes back to; both stay in the history).
- **Check (preview mode):** mark a student paid, then ⋯ Undo payment: the box asks "Undo [Name]'s $X [way] payment?", and its line starts "Paid on".

### R1-07 — The payment line and history words follow one set · Low · decided 2026-11-04 (v1.045) · after Dashboard core's R1-07

- **Today:** your toasts already read the decided words ("[Name] marked paid · $X [way]" and "Payment undone for [Name]", `testing/text.js:633, 641` on main 84a6e7d). Your payment line (`:605, 734`) and history words (`:1259, 1261`) are Star's shape, not Camps'.
- **Rule:** v1.045 (3) (Jeffrey, 2026-11-04: "Approve all"): the toasts after Mark paid and Undo payment read "[Name] marked paid · $X [way]" (while hidden, "[Name] marked paid", v0.722) and "Payment undone for [Name]"; the person's payment line and the history's payment words become one set too, drawn in Dashboard core's mockup.
- **What to do:** after Dashboard core's R1-07, take the toast words from `src/components/text.js`, and switch the payment line and history words to the set in its approved mockup. Camps re-exports `paymentUndoneToast` from your file (`src/screens/camps/text.js:23–102`): keep an export of that name until Camps has switched, and list it in your report.
- **Check (preview mode):** Mark paid a student: the toast reads as today; the payment line and History read as the approved mockup.

### R2-07 — One set of words for "someone else changed it" and a failed Undo · Low · decided 2026-11-04 (v1.045) · after Dashboard core's R2-07

- **Today:** "Someone else changed this just now. Your change wasn't saved." and "Couldn't undo. Someone else changed this just now." (`testing/text.js:271, 284, 646` on main 84a6e7d). "Undo didn't save. Check the connection, then retry." (`:288`) already reads the decided words.
- **Rule:** v1.045 (4) (Jeffrey, 2026-11-04: "Approve all"): a refused change or Undo says "Someone else changed [Name] just now, so nothing was done. Their change is shown." or "Couldn't undo: [reason].", and a failed Undo says "Undo didn't save. Check the connection, then retry."
- **What to do:** after Dashboard core's R2-07, use its three sentences from `src/components/text.js` at those lines; a refused change or Undo names the student. Camps re-exports `STALE`, `UNDO_STALE`, `UNDO_FAILED` and `ROSTER_STALE` from your file: keep those names working until Camps has switched (its own R2-07), and list them in your report.
- **Check (preview mode):** withdraw a student, then `__tkdPreview.simulateOtherAdminEdit()`, then Undo within 5 s: "Someone else changed [Name] just now, so nothing was done. Their change is shown."

### R3-06 — Your back links switch to the shared one · Low · decided 2026-11-04 (v1.048) · after Dashboard core's R3-06

- **Today:** your event page and private grading page use `.ev-back` (`event/EventPage.jsx:1611`, `private/PrivateGradingPage.jsx:270`; style `src/styles/testing-events.css:274, 1085`; on main 84a6e7d): 28 px, with a plain 44 px touch box that pushes the title down. The chooser's "← Testing" uses `.tc-back` (`src/screens/testing/chooser/BackToTesting.jsx:12`, `chooser.css:90–104`), the model for the shared one.
- **Rule:** v1.048 (12) (Jeffrey, 2026-11-04: "Approve all"): Dashboard core builds one shared back link in `.tc-back`'s look (24 px, a 16 px arrow, a 44 px touch box pulled back so the title doesn't move), and every section switches to it.
- **What to do:** after Dashboard core's R3-06, all three use the shared link (keep their words), and `.tc-back` goes. `.ev-back` stays while Camps' camp page and Black Belt still use it (their R3-06 items), and Testing's Black Belt link borrows its look (`src/screens/Testing.jsx:330` on main): keep that link working when `.ev-back` goes.
- **Check (preview mode):** the event page, the private grading page and the Testing chooser at 1280, 820 touch, 390 and 320: the link is 24 px with a mouse and 44 px to tap on touch, and the title sits at the same height at 1280 and 820.

### Smaller lines for you

- **Add student while hidden** (out of pass 1, for your own review): on main, Add student stays usable while Hide private details is on and shows "Paying by Cash · Check · Card". It asks no birthday or email, so it isn't desk-only, but Paying by is a payment detail that Camps hides. Check how your branch handles it, and ask Jeffrey if it needs a rule.
- **The shared `DeleteDialog`:** the checker found it used only by your Classes and ranks (`ClassesRanksTab.jsx:63` on main), planned to go with CB5. A read-only look at 9dbb1ce shows your Classes and ranks now uses the shared ConfirmBox, so on main nothing imports `src/components/DeleteDialog.jsx` or its old address `src/screens/testing/DeleteDialog.jsx` now (checked on 2881413). Removing a shared part is Dashboard core's call (the shared-part rule): say so in your report.
- **Camps re-exports your words:** Camps re-exports about 75 words from your `testing/text.js` (allowed), so your word changes reach Camps' screens without a Camps review. In each report, list which re-exported words you changed, so Camps can check them.
- Your count cards still draw Not paid with the clock (`EventPage.jsx:1413`, `PrivateTestingTab.jsx:841`), where Star and Camps use `ti-circle-x`. That's your planned CB15. Pass 1b.
- **R5-04 is decided** (2026-11-04, v1.038): Payments recorded counts all money received, removed people included, with your own line "includes $X from removed students". Nothing changes for you.
- **R3-08 is decided** (2026-11-04, v1.048 (13)): Star takes your `ti-calendar` for "Change private day or time". Nothing to do.
- **R3-09 is decided** (2026-11-04, v1.047 (14)): your roster gets no search box; it relies on the planned top-bar people search (v1.031). Nothing to build.
- **S-9 is decided** (2026-11-04, v1.047 (17)): a roster says its sort order only when it isn't by name. Black Belt's line stays, and no other roster adds one. Nothing to build.
- **v1.051 (2) is decided** (2026-11-04): your load lines already end "Check the connection, then retry." with Retry. Nothing to build.

---

## Waits on Jeffrey (follow the answer later)

Nothing now. Jeffrey answered R4-06 on 2026-11-04 (v1.051 (4)): it is a Fix now point above.

---

## When you're done

- Each point is checked, and fixed where needed: reviewed (a design reviewer at the four sizes for visual changes, a code reviewer, and a security reviewer for the R2-02 migration or anything about privacy) and approved by Jeffrey in the preview.
- `npm run build` and `npm run build:preview-mode` pass, and so do `src/lib/testing/checks.mjs` and `src/lib/shared/checks.mjs`.
- The status file says what you checked and what you changed.
- The work is committed on `color-belt`. **No push.**
- The report is sent to the Main session (with the Camps words and the `DeleteDialog` note).
