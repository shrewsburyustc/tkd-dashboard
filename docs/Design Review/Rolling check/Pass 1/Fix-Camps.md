# Camps — fixes from the design review's rolling check (pass 1)

**Paste into:** the Camps session.

This file reaches your worktree when `design-review` is merged into main; until then the Design Review session sends its text by message.

**Starter to paste:**

> `git merge main` first. Then read and do `docs/Design Review/Rolling check/Pass 1/Fix-Camps.md`: the fixes the design review's rolling check found in your merged work. Plan first. Mockups first for anything that changes how a screen looks. Nothing is built before I OK it.

---

## The brief

The design review's rolling check (phase 1d) looks at each section's design-review work after it merges: against the rulebook, the approved mockups, and the other sections that do the same job. Pass 1 covered `main` up to 5f1db41 (2026-11-03), in preview mode at the four sizes. Four reviewers looked (R1 money · R2 changes, mistakes and safety nets · R3 lists, menus and pickers · R4 item-by-item conformance and privacy). Two separate checkers then verified every finding. This file is what they confirmed in your merged work (C1, C2, C3, C4b, C6, C7, C11, C14, C17, C18, C20). Your C10 (the four count cards) merged after the cut (main e7fd75b); pass 2 checks it.

Your own straight fixes from pass 1: R1-05, R5-04 and R2-03 (Jeffrey's answers to questions 5, 4 and 8: v1.039, v1.038 and v1.043), and R3-02, R3-09, R3-10, R4-06 and S-8 (his answers to question 10: v1.046–v1.048; R3-09's words: question 11, v1.050), and S-2 and R2-07 (the words after an Undo) (the follow-up batch, v1.051). The rest is shared fixes you adopt after Dashboard core or New students builds them, a few small things and unrecorded checks.

- **Fix now:** straight fixes. Plan them, show Jeffrey, then build. An item marked "after [owner]'s [id]" waits until that fix is on main: plan it now, build it after.
- **Waits on Jeffrey:** nothing now: Jeffrey answered every pass 1 question (v1.035–v1.051).
- **Smaller:** fix them while you're in the file, and record the checks.
- Each item keeps its finding id (R2-05, R1-08 …) so Jeffrey can trace it. Use the id in your plan, status file and commits.
- **Line numbers** in Camps' own files (`src/screens/camps/`, `src/screens/Camps.jsx`, `src/lib/camps/`, `src/lib/mockCamps.js`, `src/camp/`, `camps.css`, `camp.css`) are main d7b5ebf's (checked 2026-11-05). Your C10 merge changed `CampRoster.jsx`, `CampPage.jsx`, `camps/text.js`, `campRules.js` and `camps.css` after the cut, and your v0.738 work (Early drop-off and Late pick-up on the roster, main 3a8dc70) changed `CampRoster.jsx`, `camps/text.js`, `campRules.js`, `checks.mjs` and `camps.css` after this file was written. Line numbers in other sections' files and the shared parts are main 5f1db41's; they may have moved. There, items decided in v1.045–v1.049 cite main 84a6e7d's, and items decided in v1.050–v1.051 main 392bc9e's.
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

- **What's wrong:** your card rightly counts removed campers' payments (v0.737), but says nothing about it, right above "Removed · Not in the counts" (`campRules.js:568`, `CampRoster.jsx:333`, `:596`).
- **Rule:** v1.038 (Jeffrey, 2026-11-04: "Money received should be counted reguardless of removed status. If we refunded and undid the payment then it should go down. Clear cut and dry."): all money received, removed people included; undone payments and refunds come off. When part of it belongs to removed campers, the gray line "includes $X from removed campers" sits under the number.
- **Change:** `campRules.js` `campCardCounts` (`:552–569`) also returns the removed rows' `paidCents`, tested in `src/lib/camps/checks.mjs`; `CampRoster.jsx:333` gives the Payments recorded card a `note` when that is above $0; `camps/text.js` adds "includes $X from removed campers". Hide private details: unchanged (the card isn't drawn).
- **Check (preview mode):** April Vacation Camp → withdraw a paid camper → Payments recorded keeps the total, with "includes $… from removed campers" under it, at 1280, 820, 390 and 320. Restore → the line goes. Finance's Daily report for the payment's day still lists the payment, at the school whose desk took it (v1.035).

### R2-03 — No Undo after restoring a Duplicate copy · Medium · decided 2026-11-04 (v1.043)

Picture: `docs/Design Review/Rolling check/Pass 1/pictures/Q8-undo-restored-duplicate.png`.

- **What's wrong:** after a "Duplicate copy" is restored, its Undo withdraws it again as a plain "Removed", and the history says Withdrawn (`CampPage.jsx:455–473` on main (448–466 at the cut) → `0013_camps.sql:4331–4337`).
- **Rule:** v1.043 (Jeffrey, 2026-11-04: "A: as Star"), Star's v0.517 G3 for every section: restoring a row set aside as a "Duplicate copy" shows "[Name] restored" with no Undo, because an Undo would put the row back as a plain "Removed" with a history that says Withdrawn. To change it back, an admin uses Review → Keep this one again. Every other restore keeps its 5-second Undo (v1.006).
- **Change:** in `CampPage.jsx:455–473` on main (448–466 at the cut), when the restored row was a Duplicate copy, the toast says "[Name] restored" with no Undo, as Star's `star/candidates/CandidatesTab.jsx:900–910` does. Other restores keep their Undo. No database change.
- **Check (preview mode):** April Vacation Camp → Review → Keep this one: First sign-up → the copy sits in Removed as "Duplicate copy" → ⋯ Restore → the toast "Ava Thompson restored" has no Undo. Withdraw and restore an ordinary camper → Undo is still there.

### R2-05 (your part) — An Undo pressed during another save is dropped without a word · Medium · after Dashboard core's R2-05

- **What's wrong:** found in Camps. With `setTestingDelay(2500)`: Withdraw Zoe Park → toast; Withdraw Sofia Nguyen; press Zoe's Undo while Sofia's save runs → the toast goes, no bar, nothing said, and both stay withdrawn. The shared Toast removes itself before it runs Undo (`components/Toast.jsx:73–77`), and your Undos return early while another save runs (`CampPage.jsx:357`, and the camp list's `Camps.jsx:137`). Staff believe it was undone.
- **Rule:** rule 1.4 / v1.006; §3.5 (never silent).
- **Change:** after Dashboard core's R2-05 (an Undo pressed while a save runs is *queued*: it waits its turn and runs as soon as that save ends, and its toast stays as "Undoing…"), your `runUndo` uses Dashboard core's helper.
- **Check (preview mode):** `__tkdPreview.setTestingDelay(2500)`; withdraw camper A, withdraw camper B, press A's Undo during B's save → A comes back with "Undone".

### R3-02 (your part) — Possible duplicates stay out of To collect until resolved · Low · decided 2026-11-04 (v1.046)

- **What's wrong:** your To collect card counts rows marked "Possible duplicate": the unpaid copy of Ava Thompson's pair adds its $315 to To collect, though the tag on its row replaces "$315 due" (`src/lib/camps/campRules.js:552–572`; `toCollectCents`, `:502–506`, says "Possible duplicates count"). So the To collect amounts on screen don't add up to the card. (Both rows also count in Campers and Coming. That stays: the people counts don't change.)
- **Rule:** v1.046 (8) (Jeffrey, 2026-11-04: "Approve all"): a row marked "Possible duplicate" stays out of Paid and Not paid (Camps: To collect) until the pair is resolved, with one gray line under the cards saying so, as Black Belt does; the people counts (Campers, Coming) don't change, so the line's words name To collect and are drawn in your mockup; Payments recorded still counts any money received (v1.038).
- **Change:**
  - `campCardCounts` (`campRules.js:552`): To collect (count and amount) leaves out rows with `duplicateState === 'possible'` (Campers, Coming and its "here" don't change: a flagged camper may be a child who is here); `recordedCents` keeps their money. The To collect filter (`matchesCardFilter`, `:574`) lists exactly the rows the card counts, as Black Belt's does (`src/lib/blackBelt/rules.js:1062`). Test it in `src/lib/camps/checks.mjs`.
  - The gray line, in words that name To collect (drawn in your mockup for Jeffrey; Black Belt's "… isn't counted in the cards …" would be wrong here, because Campers and Coming still count the row), written in your own `camps/text.js`. `CountCards` takes one line under the row (`note`), and your count line already uses it (v0.738: "Mon, Apr 19 · Early drop-off: 5 · Late pick-up: 6", on a camp day "Today · Early drop-off: 4 · Late pick-up: 6 · Pizza party: 11"; `CampRoster.jsx:340–341, 626`). It shows from before the camp to its last day whenever the camp has an extra offered every day, not only on pizza days, so a camp with a possible duplicate will nearly always need both lines: plan both lines in the mockup, and ask before changing the shared part. With Hide private details on, To collect is hidden but the count line stays (v0.738), so the mockup also shows what the duplicate line says then.
  - Mark paid: nothing to change; the duplicate tag already replaces the pay tag (`payTag`, `:493–500`).
  - Mockup first.
- **Check (preview mode):** `__tkdPreview.resetCamps()`, April Vacation Camp: Ava Thompson's possible duplicate isn't in To collect (Campers and Coming unchanged), the gray line about it says so (next to your count line, as planned in the mockup), and tapping To collect doesn't list it. Review → Keep this one: the counts are whole again and that line goes; the count line stays. Payments recorded is the same before and after.

### R3-09 (your part) — "Find a camper" stays, with one no-match line and Clear search · Low · decided 2026-11-04 (v1.047, v1.050)

- **What's wrong:** your box reads "Find a camper" (`camps/text.js:550`), says "No camper with that name." when nothing matches (`:529`, used at `CampRoster.jsx:362`), and has no Clear search. Black Belt says "Search candidates" and Prospects "Search name or phone", each with its own no-match line.
- **Rule:** v1.050 (Jeffrey, 2026-11-04: "A: Find a …"; settles v1.047 (14)): the three in-list search boxes read "Find a candidate" (Black Belt), "Find a camper" (Camps, as v0.715) and "Find a prospect" (Prospects), and sit on the left, above the list; Prospects' box moves out of the chip row. When nothing is found, one line: 'No candidates / campers / prospects match "[text]".' followed by a Clear search link, as "Showing … only · Show all"; the box's own ✕ stays the shared icon button (v0.631). Prospects' box still finds by phone, and its screen-reader name keeps saying so. Picture: `docs/Design Review/Rolling check/Pass 1/pictures/Q11-list-search-words.png`.
- **Change:** keep "Find a camper" (`camps/text.js:550`; the placeholder and the name, `CampRoster.jsx:636–637`) and the box's place on the left, above the roster (`CampRoster.jsx:630–642`; after R3-10 moves the duplicate box above the cards, the box sits under the cards and their "Showing … only" line, above the week switch). The no-match line (`camps/text.js:529`) reads 'No campers match "[text]".' (also when a card filter is on, as Black Belt's `CandidatesTab.jsx:410`: search text wins), and ends with "· Clear search", a link that empties the box, drawn like the shared "Showing … only · Show all" line. Add the box's own ✕ while it has text: the shared `IconButton` with `IconX` and the "Clear search" tooltip, as Prospects' (`src/screens/prospects/PipelineBar.jsx:53–65`, v0.631). Mockup first.
- **Check (preview mode):** April Vacation Camp, type "zz": 'No campers match "zz". · Clear search' shows, with To collect tapped too; the Clear search link empties the box and brings everyone back; the box's ✕ does the same, with its tooltip on PC and a 44 px tap area at 820 / 390 / 320 touch.

### R3-10 (your part) — The duplicate box moves above the cards · Low · decided 2026-11-04 (v1.047)

- **What's wrong:** above your roster come "Updated …", the cards (with your count line under them until the camp ends, whenever there is an extra to count, as R3-02 says; v0.738: "Mon, Apr 19 · Early drop-off: 5 · Late pick-up: 6"), their "Showing … only" line, Find a camper, the duplicate box, then the week switch (`CampRoster.jsx:623–654`). Star puts the duplicate box first, and each section has its own order.
- **Rule:** v1.047 (15) (Jeffrey, 2026-11-04: "Approve all"): one order above every roster: the duplicate box, the count cards, their "Showing … only" line, the one-school line, the search, the switches (Dan, class, week), then the table.
- **Change:** move the `DuplicateBox` (`CampRoster.jsx:646–653`) above the cards (`:626`). The search, the week switch and the roster follow, as today. The row doesn't place "Updated …" or the count line under the cards: keep them with the cards, where v0.737 and v0.738 put them, and show it in the mockup.
- **Check (preview mode):** `__tkdPreview.resetCamps()`, April Vacation Camp, at 1280, 820 touch, 390 and 320: the duplicate box, then the cards and their count line, then (after tapping To collect) "Showing to collect only · Show all", then the search, then the roster.

### R4-06 (your part) — The camp family page's week title drops to weight 500 · Low · decided 2026-11-04 (v1.048)

- **What's wrong:** the camp family page's week title uses weight 600 (`src/styles/camp.css:186`, `.camp-week__title`); §7 allows 400 and 500 on screen.
- **Rule:** v1.048 (23) (Jeffrey, 2026-11-04: "Approve all"): screen text uses weights 400 and 500 only (§7): Black Belt's, Camps' and New students' 600s go to 500; printed sheets keep their heavier weights (v0.142, v0.143).
- **Change:** `camp.css:186` → 500. The other line the question named (`camps.css:1141` then, `:1155` now) belongs to the printed roster (`@media print`), so it keeps 600. The family total on the same page (`.reg-total b`, drawn at `src/camp/StepCheck.jsx:103` and `src/camp/SignedUp.jsx:90`) comes from Color Belt's `src/styles/register.css:659`: it goes to 500 with Color Belt's R4-06 (v1.051 (4)), so don't change it here.
- **Check (preview mode):** the camp's family page (its Registration link, e.g. `/camp/thx9kv3m` in the preview) at 1280 and 390: the week title computes weight 500. Print roster: unchanged.

### S-8 — The camp list's ⋯ order · Low · decided 2026-11-04 (v1.047)

- **What's wrong:** where it shows Edit camp (phones, and the camp page's header), your ⋯ starts with it, then Close / Open sign-up (`CampRowMenu.jsx:218–250`). Star, Black Belt and Color Belt start with Copy link(s), then Close / Open, then Edit.
- **Rule:** v1.047 (18) (Jeffrey, 2026-11-04: "Approve all"): every event list's ⋯ uses one order: Copy link(s), Close / Open, Edit, then the rest.
- **Change:** in `items()` (`CampRowMenu.jsx:218`), move the Edit camp line (`:221`) to just after the Close / Open sign-up block (`:222–240`). Save as template, Print roster and Delete camp follow, as today. Your ⋯ has no Copy link, and the row adds none.
- **Check (preview mode):** at 390 touch, the camp list's ⋯ reads Close sign-up (or Open sign-up), Edit camp, Save as template, Print roster, then Delete camp; the camp page's header ⋯ the same.

### S-2 (your part) — A Retry wherever a read fails · Low · decided 2026-11-04 (v1.051)

- **What's wrong:** your load lines already end word for word "Check the connection, then retry." (`camps/text.js:135, 302, 488, 624, 728`), and the page's own bars have Retry. Five places show them with nothing to press: Edit camp when the camp can't be read (`CampDialog.jsx:424`, Close only), the reads before Undo payment, Edit payment and Delete permanently (`CampPage.jsx:497, 618, 635`) and the read before Delete camp (`CampRowMenu.jsx:132`).
- **Rule:** v1.051 (2) (Jeffrey, 2026-11-04: "Yes approved go ahead"): when a page can't load, it says "Couldn't load. Check the connection, then retry." with Retry, everywhere. A line may still name what didn't load ("Couldn't load the calendar. Check the connection, then retry."), so only the endings change. Your words already match, so only the Retry is missing. A read that fails behind a menu or inside a dialog is a connection failure too: v1.004 and §8 ("always include Retry where it applies") already ask for its Retry.
- **Change:** give the five a Retry that repeats the same read, as Camper detail (`CamperDialog.jsx:197–202`) and Print roster (`CampRowMenu.jsx:164`) already do. The words stay.
- **Check (preview mode):** the preview's `failNextSave()` skips reads (`src/lib/mockCamps.js:1999`), so add a failed-read helper in your own fake store, registered in `src/lib/mockClient.js` (a CLAUDE.md shared file: list it), or a check case, as Black Belt's R4-11 does. With it armed: Edit camp, and ⋯ Undo payment on a paid camper, each show "… Check the connection, then retry." with Retry, and Retry opens the box.

### R2-07 (the words after an Undo) — Reopening sign-up says so · Low · decided 2026-11-04 (v1.051)

- **What's wrong:** the Undo of ⋯ Close sign-up opens sign-up again but says only "Undone" (`CampRowMenu.jsx:87–88`, `switchSignup`'s `isUndo` branch). Your other Undos say "Undone", as v1.051 asks.
- **Rule:** v1.051 (1) (Jeffrey, 2026-11-04: "Yes approved go ahead"): after an Undo the toast says "Undone" everywhere; when the Undo reopens something people depend on, it adds one short sentence: Finance "Undone. The day is open again.", Star "Undone. Registration is open again."; the same rule covers every Undo that opens registration, sign-up or a form again, in the same pattern: Camps "Undone. Sign-up is open again." (R2-07's open part).
- **Change:** when that Undo opened sign-up, show "Undone. Sign-up is open again." (in your own `camps/text.js`, next to `TOAST_SIGNUP_OPEN`, `:253`). An Undo that closes it stays "Undone".
- **Check (preview mode):** a camp's ⋯ Close sign-up → Undo → "Undone. Sign-up is open again."; ⋯ Open sign-up → Undo → "Undone".

### R1-08 (your part) — The "$X due" tags don't gray while a Mark paid save runs · Low · after Dashboard core's R1-08

- **What's wrong:** while a Mark paid save runs, every "$X due" tag is `aria-disabled` (marked "off" for screen readers, but still reachable with Tab) yet looks exactly as before. Your own comment says "the tag is grayed" (`CampRoster.jsx:80` vs `:113–118`); `camps.css:733–735` sets only the cursor. On slow mat-side Wi-Fi, taps do nothing and nothing says why.
- **Rule:** v1.103 / detail 8: a control that can't be used right now shows the approved unavailable look and stays focusable.
- **Change:** after Dashboard core's R1-08. If it grays `.ev-tag-button[aria-disabled='true']` in `shared.css`, there is nothing to build here: check it. If it asks sections to add `is-unavailable` while busy, add it to the tags while a save runs.
- **Check (preview mode):** `__tkdPreview.setTestingDelay(3000)`, Mark paid one camper: the other tags gray at once and come back after the save.

### R3-13 (your part) — Edit payment's Date paid grays days with no hint · Low · after Dashboard core's R3-13

- **What's wrong:** Edit payment's "Date paid" grays the days after today but shows no hint (`camps/PaymentDialogs.jsx:252–263`), while Finance's calendars say "Days after today can't be chosen.". A gray day sometimes has a reason under it and sometimes doesn't.
- **Rule:** the newest rows (v0.623 N6, v0.817 / v0.818) say "days" and show the hint.
- **Change:** after Dashboard core's R3-13 puts the words in `src/components/text.js`, pass "Days after today can't be chosen." as the Date paid hint (import it from the shared words, not from Color Belt's `text.js`).
- **Check (preview mode):** open Edit payment's Date paid: the calendar has exactly that one line.

### R1-06 (your part) — The Undo payment box takes Black Belt's words · Low · decided 2026-11-04 (v1.045) · after Dashboard core's R1-06

- **What's wrong:** your box asks "Undo [Name]'s payment?" and says "The $X [way] payment recorded on [date] is reversed …" (`camps/text.js:602–608`, drawn at `CampPage.jsx:1100, 1111`), though the date is the day the family paid.
- **Rule:** v1.045 (2) (Jeffrey, 2026-11-04: "Approve all"): the Undo payment box uses Black Belt's words: "Undo [Name]'s $X [way] payment?", "Paid on [date] …" and the section's own consequence; v1.045: "Built by Dashboard core (the shared words) and by each section switching to them."
- **Change:** after Dashboard core's R1-06, take the title and "Paid on [date]" from `src/components/text.js` (not from Color Belt's file), pass the amount and the way (`CampPage.jsx:1100`), and keep your consequence (what is owed again after the Undo; both stay in the history).
- **Check (preview mode):** April Vacation Camp, a paid camper → ⋯ Undo payment: the box asks "Undo [Name]'s $X [way] payment?", and its line starts "Paid on" with the payment's date.

### R1-07 (your part) — The payment line and history words follow one set · Low · decided 2026-11-04 (v1.045) · after Dashboard core's R1-07

- **What's wrong:** your toasts already read the decided words ("[Name] marked paid · $X [way]", `camps/text.js:582, 584`; "Payment undone for [Name]", re-exported from Color Belt's file, `:54`). Your payment line ("$140 check · Worcester · Nov 3 · Jeffrey Berg", `:714`, `CamperDialog.jsx:281`) and history words ("Marked paid $140 check", `:821–822`) differ from Star's.
- **Rule:** v1.045 (3) (Jeffrey, 2026-11-04: "Approve all"): the toasts after Mark paid and Undo payment read "[Name] marked paid · $X [way]" (while hidden, "[Name] marked paid", v0.722) and "Payment undone for [Name]"; the person's payment line and the history's payment words become one set too, drawn in Dashboard core's mockup.
- **Change:** after Dashboard core's R1-07, take the toast words from `src/components/text.js` (nothing changes on screen, and `paymentUndoneToast` stops coming from Color Belt's file), and switch the payment line and the history words to the set in Dashboard core's approved mockup.
- **Check (preview mode):** April Vacation Camp, Mark paid a camper: the toast reads as today; Camper detail's payment line and History read as the approved mockup.

### R2-07 (your part) — One set of words for "someone else changed it" and a failed Undo · Low · decided 2026-11-04 (v1.045) · after Dashboard core's R2-07

- **What's wrong:** your refusals say "Someone else changed this just now. Your change wasn't saved." and "Couldn't undo. Someone else changed this just now." (re-exported from Color Belt's file: `STALE`, `UNDO_STALE`, `ROSTER_STALE`, `camps/text.js:36–46`), and "Couldn't undo. [reason]" (`:283`); Undo payment's failure says "Couldn't undo. Check the connection, then try again." (`:611`).
- **Rule:** v1.045 (4) (Jeffrey, 2026-11-04: "Approve all"): a refused change or Undo says "Someone else changed [Name] just now, so nothing was done. Their change is shown." or "Couldn't undo: [reason].", and a failed Undo says "Undo didn't save. Check the connection, then retry."
- **Change:** after Dashboard core's R2-07, import its three sentences from `src/components/text.js` in your own `camps/text.js` (not through Color Belt's file, which changes at the same time): a refused change or Undo names the camper; `undoRefused` (`:283`) reads "Couldn't undo: [reason]."; `UNDO_PAYMENT_FAILED` (`:611`) says the failed-Undo sentence. `UNDO_FAILED` already reads it. The sentences inside an open dialog (`STALE_DIALOG`, `STALE_DIALOG_PHONE`) aren't part of this set.
- **Check (preview mode):** withdraw a camper, then `__tkdPreview.simulateOtherAdminEdit()`, then Undo within 5 s: the bar says "Someone else changed [Name] just now, so nothing was done. Their change is shown."

### R3-06 (your part) — The camp page's back link switches to the shared one · Low · decided 2026-11-04 (v1.048) · after Dashboard core's R3-06

- **What's wrong:** the camp page's back link (`CampPage.jsx:843`) uses Color Belt's `.ev-back` (`src/styles/testing-events.css:274, 1085` on main 84a6e7d): 28 px, with a plain 44 px touch box that pushes the title down (146 px at 820 touch, where Star's sits at 124).
- **Rule:** v1.048 (12) (Jeffrey, 2026-11-04: "Approve all"): Dashboard core builds one shared back link in `.tc-back`'s look (24 px, a 16 px arrow, a 44 px touch box pulled back so the title doesn't move), and every section switches to it.
- **Change:** after Dashboard core's R3-06, use it at `CampPage.jsx:843` (keep its words), and point the two focus calls that look for `.ev-back` (`:316, 769`) at it.
- **Check (preview mode):** a camp page at 1280, 820 touch, 390 and 320: the link is 24 px with a mouse and 44 px to tap on touch, and the camp's title sits at the same height at 1280 and 820.

### R5-03 (your part) — The family page removes a child with the trash icon · Low · decided 2026-11-04 (v1.048) · after New students' R5-03

- **What's wrong:** on the camp family page, "Child 2 … Remove" is a blue underlined word (`src/camp/ChildCard.jsx:92–96`, `src/camp/text.js:28`, never in a mockup). Forms' family page, the kiosk and Fill in use the trash icon button (v0.626).
- **Rule:** v1.048 (22) (Jeffrey, 2026-11-04: "Approve all"): every family page removes a child with the trash icon button (v0.626's look), so Camps' "Remove" link changes.
- **Change:** after New students' R5-03 puts that look in its own small stylesheet, load it in `src/camp/main.jsx` (next to `:9–11`), and make Remove the shared `IconButton` with `IconTrash` and the label `T.removeChildLabel(n)` (`src/camp/text.js:29`); `REMOVE_CHILD` (`:28`) goes. Mockup first.
- **Check (preview mode):** the camp's family page → Add another child: "Child 2" shows the 28 px gray trash with the "Remove child 2" tooltip on PC, and a 44 px tap area at 820 / 390 / 320 touch; removing works.

---

## Waits on Jeffrey (don't build yet)

Nothing now. Jeffrey answered every pass 1 question on 2026-11-04 (v1.035–v1.051); each answer is a Fix now or Smaller item in this file.

---

## Smaller (fix while you're in the file)

- Mixed straight and curly apostrophes in the Undo payment box: `camps/text.js:602` (’) vs `:611` ('). Low.
- The staff empty line "No camps yet." has no "An admin adds them." (`camps/text.js:131`): drift from v0.53 (§8 Empty states). Low.
- Camper detail's Paying by row has no "(chosen on the form / at the desk)", while Star's summary has it. After Star's R1-02, add the same "(chosen on the form)" / "(chosen at the desk)" to Camper detail's Paying by row, worked out by `payingByChoiceWhere` (`campRules.js:595–598`); mockup first. Low.
- Your three prompt checks aren't recorded in `docs/Camps/TKD-Camps-Status.md`: the ⋯ menu opening in the top-left corner on PC (`6-Camps.md:220`); Finance's Daily report after Edit payment and its Undo (`6-Camps.md:67`; the checker saw the first half work, the original day showing "Edited · Was $166.00", but didn't try the Undo); focus after a Camps-list dialog on touch (status line 152). Do them and record them.
- The tag target-size check ("Check them", `6-Camps.md:225`) isn't recorded either. R4 measured your "$140 due" tag at 67×22 with a mouse, with no tap box (it is the only way to Mark paid on the PC). The fix is Dashboard core's R4-09 (the shared tag style): record the measurement now, and check again after that fix.
- §2.4's `ti-calendar-event` row doesn't list your Coming card, which v0.737 gives that icon (`CampRoster.jsx:309`). Add "also Camps' Coming card (v0.737)" to that row at your next rulebook edit (`git merge main` first, re-read the rulebook, keep CRLF). Pass 1b, Low.
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
