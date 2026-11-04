# Camps — fixes from the design review's rolling check (pass 1)

**Paste into:** the Camps session.

This file reaches your worktree when `design-review` is merged into main; until then the Design Review session sends its text by message.

**Starter to paste:**

> `git merge main` first. Then read and do `docs/Design Review/Rolling check/Pass 1/Fix-Camps.md`: the fixes the design review's rolling check found in your merged work. Plan first. Mockups first for anything that changes how a screen looks. Nothing is built before I OK it.

---

## The brief

The design review's rolling check (phase 1d) looks at each section's design-review work after it merges: against the rulebook, the approved mockups, and the other sections that do the same job. Pass 1 covered `main` up to 5f1db41 (2026-11-03), in preview mode at the four sizes. Four reviewers looked (R1 money · R2 changes, mistakes and safety nets · R3 lists, menus and pickers · R4 item-by-item conformance and privacy). Two separate checkers then verified every finding. This file is what they confirmed in your merged work (C1, C2, C3, C4b, C6, C7, C11, C14, C17, C18, C20). Your C10 (the four count cards) merged after the cut (main e7fd75b); pass 2 checks it.

Your own straight fixes from pass 1: R1-05, R5-04 and R2-03 (Jeffrey's answers to questions 5, 4 and 8: v1.039, v1.038 and v1.043), and R3-02, R3-09, R3-10, R4-06 and S-8 (his answers to question 10: v1.046–v1.048). The rest is shared fixes you adopt after Dashboard core or New students builds them, a few small things and unrecorded checks.

- **Fix now:** straight fixes. Plan them, show Jeffrey, then build. An item marked "after [owner]'s [id]" waits until that fix is on main: plan it now, build it after.
- **Waits on Jeffrey:** a rule must be picked first. Don't build these yet.
- **Smaller:** fix them while you're in the file, and record the checks.
- Each item keeps its finding id (R2-05, R1-08 …) so Jeffrey can trace it. Use the id in your plan, status file and commits.
- **Line numbers** are main 5f1db41's; they may have moved. Your C10 merge changed `CampRoster.jsx`, `CampPage.jsx`, `camps/text.js`, `campRules.js` and `camps.css` after the cut. Items decided in v1.045–v1.049 cite main 84a6e7d's.
- **Paths:** `CampRoster.jsx`, `CampPage.jsx`, `PaymentDialogs.jsx` and `CampRowMenu.jsx` are in `src/screens/camps/`; `camps/text.js` is `src/screens/camps/text.js`; `campRules.js` is `src/lib/camps/campRules.js`; `camps.css` and `camp.css` are in `src/styles/`; `components/…` is `src/components/…`.

### Rules

- Follow CLAUDE.md.
- **Plan first:** a short plan (each item, its files, its mockup, any migration) in your docs folder; show it to Jeffrey.
- **Preview mode for building and trying changes:** `npm run dev:preview-mode`. `npm run dev`, `npm run preview` and `Start dashboard.bat` use the live database (`.worktreeinclude` copies `.env.local` into every worktree): run them only for a check Jeffrey OKs, never to try a change. `npm run build` is fine: it only builds.
- **Mockups before code** for every visual change, at PC 1280×800, tablet 820×1180 touch, phone 390×844 touch and 320 wide: a self-contained HTML file plus one PNG per screen with what changes outlined in amber (Jeffrey reviews the PNGs). He OKs them one screen at a time, before any code.
- **One decision at a time,** with pictures: each option drawn, its pros and cons, and a recommendation.
- **Reviews:** a separate design reviewer (the rulebook, the approved mockups, screenshots at the four sizes, and §4's six WCAG 2.2 checks, v1.033); a separate code reviewer; a separate security reviewer for anything touching the database (handoff §6).
- **Order (a push to main deploys):** the migration is live before the push that brings the app that uses it. A step whose app calls a new or changed database function is merged only after Jeffrey has applied its migration and the checks passed (fingerprints, security advisor, tests file — CLAUDE.md). Screen-only steps can go first. R1-05 needs a database change: ask the Main session for a migration number; Jeffrey applies it. Follow handoff §6 (`docs/Dashboard Docs/TKD-Dashboard-Handoff.md`), with a SETUP section "## Migration 00NN: …", a `step00NN` in `supabase/tests/pglite/run.mjs`, a tests file and a fingerprints file. Run the PGlite tests with `cd supabase/tests/pglite && npm ci && node run.mjs` (`npm ci` once per worktree).
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

Most severe first. Items with no "after" can be built now (R1-05's refund stores the desk's school, v1.040). The rest wait for Dashboard core's or New students' fix.

### R1-05 — Hand money back with Record refund · Medium · decided 2026-11-04 (v1.039)

Picture: `docs/Design Review/Rolling check/Pass 1/pictures/Q5-camp-refund.png`.

- **What's wrong:** today an admin hands money back by editing the payment (v0.700 (6)). Finance then shows the change on the payment's original day (v0.199; picture Q5, "Edited · Was $166.00"): the hand-back day shows nothing while its drawer is short, and a day already counted changes.
- **Rule:** v1.039 (Jeffrey, 2026-11-04: "A: Record refund"). When a camper shows "Paid $X more than the total" and money is handed back, an admin uses ⋯ → Record refund: the amount (no more than what was overpaid), the way it went back and the date. It is saved as its own negative refund row, as Star's database does (kind `refund`, `0006:698–699, 729–730`; v0.166, v0.172), never as a reversal of the payment. Finance shows it on that day in its Refunds group (v0.209). Edit payment stays for fixing how a payment was recorded. The refund stores the school of the desk that hands the money back (This device, v1.040).
- **Change:**
  - One Camps migration: a refund function (admins only; amount no more than the overpaid amount; a new kind `refund` in `camp_payments`: its own negative row with the date, the way, the desk's school (This device, as Mark paid already passes; v1.040) and no `reverses_payment_id`, as `star_record_refund` (0006:4994), so `camp_payments_kind_check` (0013:1019–1021) widens; the database refuses anything that takes the camper's net below zero, as for `star_payments`; logged) and its Undo (a reversal of the refund row). Ask the Main session for a migration number. Jeffrey applies it. The migration is live before the push that brings the app that uses it.
  - The preview's fake Camps store gets the same refund, or the check below can't pass.
  - In the app: "Record refund" in the camper's ⋯ (and touch "More") only while the camper is overpaid; the toast "Refund recorded" with Undo; a history line. Copy Star's words and box (`src/lib/star/candidatesText.js:29, 41–44, 81`; the box's words `src/screens/testing/star/candidates/text.js:165–167`): Cash or Check (v0.166); while a refund stands, Edit payment and Undo payment are grayed with "Undo the refund first." (Star's v0.508 (1)). The receipt shows the refund as its own minus line, as Star's does (`src/lib/star/candidatesReceipt.js:9–10, 23`); today `campReceipt.js:13–15` says "Camps has no refunds, so there are no minus lines". Mockup first.
  - Finance then lists camp refunds (Finance's R1-05, after yours). Tell the Main session when your migration is live. The app push that offers Record refund waits until Finance's R1-05 is done (its test passed, or its migration is live).
- **Check (preview mode):** remove a day from a paid camper → "Paid $X more than the total" → ⋯ → Record refund, $X cash, today → the amber line goes and the history lists the refund. A larger amount is refused with "Can't be more than the $X overpaid." Undo puts it back.

### R5-04 — Payments recorded doesn't say it includes removed campers' money · Medium · decided 2026-11-04 (v1.038)

Picture: `docs/Design Review/Rolling check/Pass 1/pictures/Q4-payments-recorded-card.png`.

- **What's wrong:** your card rightly counts removed campers' payments (v0.737), but says nothing about it, right above "Removed · Not in the counts" (on main after your C10 merge, not 5f1db41: `campRules.js:511`, `CampRoster.jsx:275`, `:522`).
- **Rule:** v1.038 (Jeffrey, 2026-11-04: "Money received should be counted reguardless of removed status. If we refunded and undid the payment then it should go down. Clear cut and dry."): all money received, removed people included; undone payments and refunds come off. When part of it belongs to removed campers, the gray line "includes $X from removed campers" sits under the number.
- **Change:** `campRules.js` `campCardCounts` (`:495–512`) also returns the removed rows' `paidCents`, tested in `src/lib/camps/checks.mjs`; `CampRoster.jsx:275` gives the Payments recorded card a `note` when that is above $0; `camps/text.js` adds "includes $X from removed campers". Hide private details: unchanged (the card isn't drawn).
- **Check (preview mode):** April Vacation Camp → withdraw a paid camper → Payments recorded keeps the total, with "includes $… from removed campers" under it, at 1280, 820, 390 and 320. Restore → the line goes. Finance's Daily report for the payment's day still lists the payment, at the school whose desk took it (v1.035).

### R2-03 — No Undo after restoring a Duplicate copy · Medium · decided 2026-11-04 (v1.043)

Picture: `docs/Design Review/Rolling check/Pass 1/pictures/Q8-undo-restored-duplicate.png`.

- **What's wrong:** after a "Duplicate copy" is restored, its Undo withdraws it again as a plain "Removed", and the history says Withdrawn (`CampPage.jsx:455–473` on main (448–466 at the cut) → `0013_camps.sql:4331–4337`).
- **Rule:** v1.043 (Jeffrey, 2026-11-04: "A: as Star"), Star's v0.517 G3 for every section: restoring a row set aside as a "Duplicate copy" shows "[Name] restored" with no Undo, because an Undo would put the row back as a plain "Removed" with a history that says Withdrawn. To change it back, an admin uses Review → Keep this one again. Every other restore keeps its 5-second Undo (v1.006).
- **Change:** in `CampPage.jsx:455–473` on main (448–466 at the cut), when the restored row was a Duplicate copy, the toast says "[Name] restored" with no Undo, as Star's `star/candidates/CandidatesTab.jsx:900–910` does. Other restores keep their Undo. No database change.
- **Check (preview mode):** April Vacation Camp → Review → Keep this one: First sign-up → the copy sits in Removed as "Duplicate copy" → ⋯ Restore → the toast "Ava Thompson restored" has no Undo. Withdraw and restore an ordinary camper → Undo is still there.

### R2-05 (your part) — An Undo pressed during another save is dropped without a word · Medium · after Dashboard core's R2-05

- **What's wrong:** found in Camps. With `setTestingDelay(2500)`: Withdraw Zoe Park → toast; Withdraw Sofia Nguyen; press Zoe's Undo while Sofia's save runs → the toast goes, no bar, nothing said, and both stay withdrawn. The shared Toast removes itself before it runs Undo (`components/Toast.jsx:73–77`), and your Undos return early while another save runs (`CampPage.jsx:351`, and the camp list's `Camps.jsx:137`). Staff believe it was undone.
- **Rule:** rule 1.4 / v1.006; §3.5 (never silent).
- **Change:** after Dashboard core's R2-05 (an Undo pressed while a save runs is *queued*: it waits its turn and runs as soon as that save ends, and its toast stays as "Undoing…"), your `runUndo` uses Dashboard core's helper.
- **Check (preview mode):** `__tkdPreview.setTestingDelay(2500)`; withdraw camper A, withdraw camper B, press A's Undo during B's save → A comes back with "Undone".

### R3-02 (your part) — Possible duplicates stay out of the counts until resolved · Low · decided 2026-11-04 (v1.046)

- **What's wrong:** your cards count rows marked "Possible duplicate". Ava Thompson's two rows are both in Campers and Coming, and the unpaid copy's $315 is in To collect, though the tag on its row replaces "$315 due" (`src/lib/camps/campRules.js:495–515`; `toCollectCents`, `:445–449`, says "Possible duplicates count"). So the To collect amounts on screen don't add up to the card.
- **Rule:** v1.046 (8) (Jeffrey, 2026-11-04: "Approve all"): a row marked "Possible duplicate" stays out of the people counts and To collect until the pair is resolved, with one gray line under the cards saying so, as Black Belt does; Payments recorded still counts any money received (v1.038).
- **Change:**
  - `campCardCounts` (`campRules.js:495`): Campers, Coming (and its "here") and To collect (count and amount) leave out rows with `duplicateState === 'possible'`; `recordedCents` keeps their money. The To collect filter (`matchesCardFilter`, `:517`) lists exactly the rows the card counts, as Black Belt's does (`src/lib/blackBelt/rules.js:1062`). Test it in `src/lib/camps/checks.mjs`.
  - The gray line, in Black Belt's words ("The possible duplicate row isn't counted in the cards until it's resolved.", `src/blackBelt/staff/text.js:511–513`), written in your own `camps/text.js`. `CountCards` takes one line under the row (`note`), and your pizza line already uses it on camp days (`CampRoster.jsx:281, 552`): plan both lines in the mockup, and ask before changing the shared part.
  - Mark paid: nothing to change; the duplicate tag already replaces the pay tag (`payTag`, `:436–443`).
  - Mockup first.
- **Check (preview mode):** `__tkdPreview.resetCamps()`, April Vacation Camp: Ava Thompson's possible duplicate isn't in Campers, Coming or To collect, the gray line says so, and tapping To collect doesn't list it. Review → Keep this one: the counts are whole again and the line goes. Payments recorded is the same before and after.

### R3-09 (your part) — "Find a camper" becomes "Search campers" · Low · decided 2026-11-04 (v1.047)

- **What's wrong:** your box reads "Find a camper" (`camps/text.js:551`), says "No camper with that name." when nothing matches (`:530`), and has no Clear search. Black Belt says "Search candidates" and Prospects "Search name or phone", each with its own no-match line.
- **Rule:** v1.047 (14) (Jeffrey, 2026-11-04: "Approve all"): the three in-list search boxes (Black Belt, Camps, Prospects) share one look: "Search candidates / campers / prospects", on the left above the table, with one no-match line and Clear search.
- **Change:** `camps/text.js:551` → "Search campers" (the placeholder and the name, `CampRoster.jsx:562–563`); the box sits on the left above the table, in R3-10's order; add Clear search as Black Belt and Prospects have it (the shared `IconButton` with `IconX`); and the one no-match line (`:530`). The row gives no words for that line: draw it in your mockup and ask Jeffrey once, unless the Main session has already passed on his answer from Black Belt or New students. (R3's proposal: 'No one matches "[text]".' with a Clear search link.)
- **Check (preview mode):** April Vacation Camp, type "zz": the approved no-match line shows; Clear search empties the box and brings everyone back; at 820 / 390 / 320 touch it has a 44 px tap area.

### R3-10 (your part) — The duplicate box moves above the cards · Low · decided 2026-11-04 (v1.047)

- **What's wrong:** above your roster come "Updated …", the cards (with the pizza line on camp days), their "Showing … only" line, Find a camper, the duplicate box, then the week switch (`CampRoster.jsx:549–580`). Star puts the duplicate box first, and each section has its own order.
- **Rule:** v1.047 (15) (Jeffrey, 2026-11-04: "Approve all"): one order above every roster: the duplicate box, the count cards, their "Showing … only" line, the one-school line, the search, the switches (Dan, class, week), then the table.
- **Change:** move the `DuplicateBox` (`CampRoster.jsx:572–579`) above the cards (`:552`). The search, the week switch and the roster follow, as today. The row doesn't place "Updated …" or the pizza line: keep them with the cards, where v0.737 put them, and show it in the mockup.
- **Check (preview mode):** `__tkdPreview.resetCamps()`, April Vacation Camp, at 1280, 820 touch, 390 and 320: the duplicate box, then the cards, then (after tapping To collect) "Showing to collect only · Show all", then the search, then the roster.

### R4-06 (your part) — The camp family page's week title drops to weight 500 · Low · decided 2026-11-04 (v1.048)

- **What's wrong:** the camp family page's week title uses weight 600 (`src/styles/camp.css:186`, `.camp-week__title`); §7 allows 400 and 500 on screen.
- **Rule:** v1.048 (23) (Jeffrey, 2026-11-04: "Approve all"): screen text uses weights 400 and 500 only (§7): Black Belt's, Camps' and New students' 600s go to 500; printed sheets keep their heavier weights (v0.142, v0.143).
- **Change:** `camp.css:186` → 500. The other line the question named (`camps.css:1141` then, `:1127` now) belongs to the printed roster (`@media print`), so it keeps 600.
- **Check (preview mode):** the camp's family page (its Registration link, e.g. `/camp/thx9kv3m` in the preview) at 1280 and 390: the week title computes weight 500. Print roster: unchanged.

### S-8 — The camp list's ⋯ order · Low · decided 2026-11-04 (v1.047)

- **What's wrong:** where it shows Edit camp (phones, and the camp page's header), your ⋯ starts with it, then Close / Open sign-up (`CampRowMenu.jsx:218–250`). Star, Black Belt and Color Belt start with Copy link(s), then Close / Open, then Edit.
- **Rule:** v1.047 (18) (Jeffrey, 2026-11-04: "Approve all"): every event list's ⋯ uses one order: Copy link(s), Close / Open, Edit, then the rest.
- **Change:** in `items()` (`CampRowMenu.jsx:218`), add Close / Open sign-up before Edit camp (`:221`). Save as template, Print roster and Delete camp follow, as today. Your ⋯ has no Copy link, and the row adds none.
- **Check (preview mode):** at 390 touch, the camp list's ⋯ reads Close sign-up (or Open sign-up), Edit camp, Save as template, Print roster, then Delete camp; the camp page's header ⋯ the same.

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

### R1-06 (your part) — The Undo payment box takes Black Belt's words · Low · decided 2026-11-04 (v1.045) · after Dashboard core's R1-06

- **What's wrong:** your box asks "Undo [Name]'s payment?" and says "The $X [way] payment recorded on [date] is reversed …" (`camps/text.js:596–602`, drawn at `CampPage.jsx:1100, 1111`), though the date is the day the family paid.
- **Rule:** v1.045 (2) (Jeffrey, 2026-11-04: "Approve all"): the Undo payment box uses Black Belt's words: "Undo [Name]'s $X [way] payment?", "Paid on [date] …" and the section's own consequence; shared words are kept once in `src/components/text.js`.
- **Change:** after Dashboard core's R1-06, take the title and "Paid on [date]" from `src/components/text.js` (not from Color Belt's file), pass the amount and the way (`CampPage.jsx:1100`), and keep your consequence (what is owed again after the Undo; both stay in the history).
- **Check (preview mode):** April Vacation Camp, a paid camper → ⋯ Undo payment: the box asks "Undo [Name]'s $X [way] payment?", and its line starts "Paid on" with the payment's date.

### R1-07 (your part) — The payment line and history words follow one set · Low · decided 2026-11-04 (v1.045) · after Dashboard core's R1-07

- **What's wrong:** your toasts already read the decided words ("[Name] marked paid · $X [way]", `camps/text.js:576, 578`; "Payment undone for [Name]", re-exported from Color Belt's file, `:54`). Your payment line ("$140 check · Worcester · Nov 3 · Jeffrey Berg", `:708`, `CamperDialog.jsx:281`) and history words ("Marked paid $140 check", `:815–816`) differ from Star's.
- **Rule:** v1.045 (3) (Jeffrey, 2026-11-04: "Approve all"): the toasts after Mark paid and Undo payment read "[Name] marked paid · $X [way]" (while hidden, "[Name] marked paid", v0.722) and "Payment undone for [Name]"; the person's payment line and the history's payment words become one set too, drawn in Dashboard core's mockup.
- **Change:** after Dashboard core's R1-07, take the toast words from `src/components/text.js` (nothing changes on screen, and `paymentUndoneToast` stops coming from Color Belt's file), and switch the payment line and the history words to the set in Dashboard core's approved mockup.
- **Check (preview mode):** April Vacation Camp, Mark paid a camper: the toast reads as today; Camper detail's payment line and History read as the approved mockup.

### R2-07 (your part) — One set of words for "someone else changed it" and a failed Undo · Low · decided 2026-11-04 (v1.045) · after Dashboard core's R2-07

- **What's wrong:** your refusals say "Someone else changed this just now. Your change wasn't saved." and "Couldn't undo. Someone else changed this just now." (re-exported from Color Belt's file: `STALE`, `UNDO_STALE`, `ROSTER_STALE`, `camps/text.js:36–46`), and "Couldn't undo. [reason]" (`:283`); Undo payment's failure says "Couldn't undo. Check the connection, then try again." (`:605`).
- **Rule:** v1.045 (4) (Jeffrey, 2026-11-04: "Approve all"): a refused change or Undo says "Someone else changed [Name] just now, so nothing was done. Their change is shown." or "Couldn't undo: [reason].", and a failed Undo says "Undo didn't save. Check the connection, then retry."
- **Change:** after Dashboard core's R2-07, import its three sentences from `src/components/text.js` in your own `camps/text.js` (not through Color Belt's file, which changes at the same time): a refused change or Undo names the camper; `undoRefused` (`:283`) reads "Couldn't undo: [reason]."; `UNDO_PAYMENT_FAILED` (`:605`) says the failed-Undo sentence. `UNDO_FAILED` already reads it. The sentences inside an open dialog (`STALE_DIALOG`, `STALE_DIALOG_PHONE`) aren't part of this set.
- **Check (preview mode):** withdraw a camper, then `__tkdPreview.simulateOtherAdminEdit()`, then Undo within 5 s: the bar says "Someone else changed [Name] just now, so nothing was done. Their change is shown."

### R3-06 (your part) — The camp page's back link switches to the shared one · Low · decided 2026-11-04 (v1.048) · after Dashboard core's R3-06

- **What's wrong:** the camp page's back link (`CampPage.jsx:843`) uses Color Belt's `.ev-back` (`src/styles/testing-events.css:274, 1085` on main 84a6e7d): 28 px, with a plain 44 px touch box that pushes the title down (146 px at 820 touch, where Star's sits at 124).
- **Rule:** v1.048 (12) (Jeffrey, 2026-11-04: "Approve all"): Dashboard core builds one shared back link in `.tc-back`'s look (24 px, a 16 px arrow, a 44 px touch box pulled back so the title doesn't move), and every section switches to it.
- **Change:** after Dashboard core's R3-06, use it at `CampPage.jsx:843` (keep its words), and point the two focus calls that look for `.ev-back` (`:316, 769`) at it.
- **Check (preview mode):** a camp page at 1280, 820 touch, 390 and 320: the link is 24 px with a mouse and 44 px to tap on touch, and the camp's title sits at the same height at 1280 and 820.

### R5-03 (your part) — The family page removes a child with the trash icon · Low · decided 2026-11-04 (v1.048) · after New students' R5-03

- **What's wrong:** on the camp family page, "Child 2 … Remove" is a blue underlined word (`src/camp/ChildCard.jsx:92–96`, `src/camp/text.js:28`, never in a mockup). Forms' family page, the kiosk and Fill in use the trash icon button (v0.626).
- **Rule:** v1.048 (22) (Jeffrey, 2026-11-04: "Approve all"): every family page removes a child with the trash icon button (v0.626's look), so Camps' "Remove" link changes, and the public icon-button look lives in one small stylesheet that both family pages load.
- **Change:** after New students' R5-03 puts that look in its own small stylesheet, load it in `src/camp/main.jsx` (next to `:9–11`), and make Remove the shared `IconButton` with `IconTrash` and the label `T.removeChildLabel(n)` (`src/camp/text.js:29`); `REMOVE_CHILD` (`:28`) goes. Mockup first.
- **Check (preview mode):** the camp's family page → Add another child: "Child 2" shows the 28 px gray trash with the "Remove child 2" tooltip on PC, and a 44 px tap area at 820 / 390 / 320 touch; removing works.

---

## Waits on Jeffrey (don't build yet)

- Nothing waits on Jeffrey now. He answered these on 2026-11-04 (v1.045–v1.049); each answer is a Fix now or Smaller item in this file.

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
- **R1-01 is decided** (2026-11-04, v1.035): every section now counts a payment at the desk that took it (This device), as you already do (v0.708). Nothing to build; keep Edit payment → Paid at.
- **R3-04 is decided** (2026-11-04, v1.048 (11)): your touch roster stays as approved (no row ⋯; the actions sit in Camper detail's "More"; the name opens the camper, v0.715), as a named exception to the row ⋯. Nothing to build.
- **R4-13 is decided** (2026-11-04, v1.045 (5)): your "Ask an admin to open it." (`camps/text.js:244`, v0.725) is now every section's line. Nothing to build.
- **S-9 is decided** (2026-11-04, v1.047 (17)): a roster says its sort order only when it isn't by name. Black Belt's line stays, and no other roster adds one. Nothing to build.
- **S-10 is decided** (2026-11-04, v1.048 (20)): the browser dropdowns in `camps/CampDialog.jsx:446`, `camps/sections/CampSection.jsx:72` and `camps/sections/DayCalendar.jsx:103, 110` become the shared Select (v1.100) when you next work on that screen. No sweep, so nothing to build until then.

---

## Done when

- Every Fix now item is built, reviewed and approved by Jeffrey in the preview: a design reviewer at the four sizes for visual changes, a code reviewer, and a security reviewer for anything touching the database or privacy.
- These pass: `npm run build` and `npm run build:preview-mode`; `node src/lib/camps/checks.mjs` and `node --test functions/tests/`.
- Jeffrey's decisions are rows from your block.
- The status file is current (with the four checks recorded), and each step is committed on `camps`. No push.
- The report is sent to the Main session.

- R1-05's PGlite tests pass, Jeffrey has applied it, and the after-apply checks passed (fingerprints, security advisor, tests file).
