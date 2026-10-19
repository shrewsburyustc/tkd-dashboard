# Camps — status

**Branch:** `camps` (worktree `camp-event-creator-templates-83eafe`) · **Started:** 2026-10-18
**Goal (Jeffrey, 2026-10-18):** a Camp event creator — create camps (one day or several days), save them as templates to reuse, see each camp's roster. Prices fully under our control and easy to change; room to add other services later. **Keep it simple — don't make it more than it is.**

## What the old paper forms show (Columbus Day 2025, Thanksgiving 2025, April vacation + summer 2026)

- Every camp: name, date(s), camp hours 9:00–3:00, short description, daily schedule, waiver text, early-registration cut-off.
- Per child: name, age, member / non-member. Up to 3 children per form. Parent name, phone, relationship. Emergency contact name, phone, relationship. Signature + date.
- Prices seen:
  - Columbus (1 day): member $70 early / $80 regular; non-member +$10.
  - Thanksgiving (2 days): 1 day $75 / 2 days $140 early; $80 / $150 regular; non-member +$10.
  - April (1 week): full week member $275 / non-member $285 early, $325 / $335 regular; single days 1 day $75, 2 days $70/day, 3 days $65/day early (+$5 regular); pizza day +$5 for single-day campers (included in full week).
  - Summer: 8 separate weeks, same prices as April; pool days need bathing suit + towel.
  - Extras on every camp: early drop-off 7:30–9:00 $15/day, late pick-up 3:00–4:00 $8/day.

## Found in the code / accounts

- The dashboard already has a full **event + roster** pattern in Color Belt testing (events, roster, Mark paid with Undo, registration link + family form, 15-second refresh). Camps should reuse it rather than invent a new one.
- An older stand-alone camp app exists: Cloudflare Worker **`tkd-camps`** + D1 database `tkd-camps` (last changed 2026-08-06). Structure only was read (no rows): camps, days, price tiers (days × early/regular × member/non-member), add-ons (per day / per registration), credits, charges, payments incl. Square, waivers, medical questions, daily check-in. Counts: 1 camp, 11 registrations, 6 payments, last registration 2026-08-06.

## Decisions

| # | Question | Answer |
|---|---|---|
| 1 | Does the new Camps section replace `tkd-camps`? | **It was only a test** (Jeffrey, 2026-10-18). Camps is built fresh in the dashboard; nothing is moved from `tkd-camps`; it can be deleted later (separate OK needed). Its layout stays a feature reference only. *Rulebook entry pending — written with the next batch of decisions.* |
| 2 | How a camp's prices are set up | **B. Price grid + extras** (Jeffrey, 2026-10-18; picture `Decision images/Camps-price-options.png`). Per camp: one "early price until" date; a grid with one row per number of days and four prices (member early / member regular / non-member early / non-member regular) — the base price fills in automatically from the days ticked and the member box; plus a list of extras (name, price, once or per day). Chosen over A (one flat price list, recommended) — trade-off accepted: anything not priced by number of days goes in Extras. *Rulebook entry pending.* |
| 3 | Summer: one camp per week, or one camp with 8 weeks? | **A. One camp per week** (Jeffrey, 2026-10-18; picture `Decision images/Camps-summer-options.png`). Each summer week is its own camp made from a "Summer week" template; no "weeks" idea in the app. A camp is always a short list of days (1–5 in practice), so the price grid stays small. A child coming several weeks is added to each week's camp (parent details copyable from their last entry — to show in the mockups). *Rulebook entry pending.* |
| 4 | How campers get onto the roster | **B. Online signup now** (Jeffrey, 2026-10-18; picture `Decision images/Camps-signup-options.png`). Camp page gets **Registration link** + QR; families fill a phone form (one or more children, days, extras, parent, emergency contact, waiver signed on screen, total shown, pay at the school); they land on the roster as "Not paid". Staff can still **Add camper** from a paper form. Chosen over A (staff-only first, recommended) — trade-off accepted: bigger build with a public page about minors, its own security review, setup steps and deploy checklist; reuse the Color Belt family-form pattern (registrar login with execute on only the public functions, Turnstile, Hyperdrive, strict page security policy, kill switch). *Rulebook entry pending.* |
| 5 | How paying is recorded | **A. Mark paid, full amount** (Jeffrey, 2026-10-18; picture `Decision images/Camps-paying-options.png`). Same as Color Belt: one click records the whole amount owed, method = what the family chose (changeable), 5-second Undo. If days/extras are added after paying, the row shows "Owes $X" and Mark paid records just the difference. Admin ⋯: Change how they'll pay / Edit payment / Undo payment. No part payments or deposits. *Rulebook entry pending.* |
| 4b | Paper forms? | **None** (Jeffrey, 2026-10-18, after seeing the mockups). Families always sign up on the online family form, reached by QR code / link. Flyers are designed by Jeffrey outside the app, using the registration link — **no flyer in the app** (unlike Color Belt's Print flyer). Removes staff **Add camper**, "waiver signed on paper" and "copy parent details". Walk-ins: parent scans the QR, or staff open the link on the desk tablet and hand it over. Staff correct details with ⋯ → Edit details. Registration link dialog: QR, link, Copy link, Download QR code (proposal). Changes decision 4 (staff can still add from paper → no). *Rulebook entry pending.* |
| 6 | Where Camps sits (own rail section + icon) and one school per camp vs joint camps | *to show in the screen mockups* |
| 7 | Templates: what "Save as template" keeps (everything but dates) and where templates are listed | Shown in C2 / C2b — see Screen approvals. |
| — | Open details for B, to settle in the mockups: can an extra be "not charged for a full-week camper" (pizza day); what happens if a camper's days have no grid row | |

## Mockups (2026-10-18)

`TKD-Camps-Mockups.html` + `Mockup images/Camps-C1…C7d.png` (PC 1280 / tablet 820 touch / phone 390 touch). Drawn by a builder agent, design-reviewed by a separate agent (7 must-fix + 10 should-fix, all applied, re-shot). **Waiting for Jeffrey's review.**
- C1 Camps list · C2 Templates tab · C2b Save as template · C3 Add camp (price grid + extras) · C4 Camp page / roster (day filter, Mark paid, Owes $X) · C5 Add camper (paper form) · C6 Camper detail · C7a–d Family sign-up form (details, check and sign, signed up, not open / closed).
- Proposals inside the mockups to accept or change: Card as a third payment method; templates shared by both schools and store sign-up / early-price dates as "days before camp" (early default 7 days, sign-up closes the day before); changing a camp's days asks first if prices change; day filter starts on today during camp week; price fixed at sign-up; Delete camp with campers follows Color Belt's Delete event rule.
- Rulebook rows needed when recorded: Camps section (rail `ti-tent`, after Testing); icon map: `ti-tent`, `ti-template`, `ti-users`, `ti-clock`, `ti-cash`, `ti-user-minus`, Mark paid / Paid → `ti-check` (exception already used by Color Belt); multi-select day chips use the dark outline.
- Known limit: the phone calendar at 320 px wide gives ~41×44 px day cells unless it runs nearly edge to edge.

- **Pre-registration (early price) date — decided 2026-10-18:** set per camp in Add / Edit camp ("Early price until", any date). From a template it is **prefilled** with the template's number of days before camp (e.g. 7) and can be changed before saving (Jeffrey chose prefilled over blank-must-pick).

- **Camps for both schools — Jeffrey, 2026-10-18:** a camp can be for Worcester, Shrewsbury or **Both schools** (changes C1's "one camp belongs to one school"). A Both camp shows on Worcester, Shrewsbury and Both lists with a "Both schools" school line; members of either school pay member prices. Proposal: a Both camp also picks **Held at** (Worcester / Shrewsbury) so the family form shows where to go.
- **C3 is too much at once — Jeffrey, 2026-10-18:** "everything looks fine", but organize it → **A. Folded sections** chosen (picture `Decision images/Camps-addcamp-layout-options.png`): one page, Start from on top, then 5 sections — 1 Camp (name, school, held at, days) open; 2 Times (hours, sign-up opens/closes, early price until), 3 Prices, 4 Extras, 5 Family form folded with a one-line summary each. A section with a problem turns amber and opens on Save. Save works from anywhere. Edit camp / Edit template use the same layout. Chosen over B (Next/Back steps).

### Screen approvals
- **C1 Camps list — approved 2026-10-18** as drawn, incl. proposals: sign-up can be closed by hand (e.g. camp full; no camper limit field); Delete camp with campers = admin only, warning naming them (Color Belt Delete event rule). Rail icon `ti-tent`, after Testing.
- **C2 Templates tab + C2b Save as template — approved 2026-10-18:** templates are made only from a camp (⋯ → Save as template; keeps everything but dates and campers; name kept as typed, duplicate name = amber error); shared by both schools; Use opens Add camp filled in; ⋯ Edit template / Delete template (asks first; never changes camps made from it); dates stored as days-before-camp and prefilled (see pre-registration decision); fewer/more days drops/adds grid rows.
- **C3 Add / Edit camp — approved 2026-10-18** (folded sections; School Worcester | Shrewsbury | Both schools + Held at for Both; days calendar; Times; price grid; extras; family form texts). Proposals accepted: changing days on a camp with campers asks first if any price would change; the school's real waiver text is pasted once and carried by templates. C1 updated for Both-schools camps (approved with C3).
- **C4 Camp page / roster — approved 2026-10-18:** header (Registration link = primary; ⋯ Edit camp, Save as template, Print roster, Delete camp); Color Belt's 4 cards (Owes counts as Not paid); day filter with per-day counts + drop-off/pick-up line (phone: 3-column grid); rows with days, extras, paying by, total, tag Paid / Not paid (gray) / Owes $X (amber); Mark paid (full) / Mark paid $X (difference), 5-s Undo; Color Belt row ⋯ incl. Withdraw → Removed group + Restore. Proposals accepted: day filter starts on today during camp week; price fixed at sign-up date.
- **C5 Registration link — approved 2026-10-18:** camp name, sign-up close date, card with school line, QR code, short link, Copy link (toast), **Download QR code** (`ti-download`, image file for Jeffrey's own flyers), Close. No Print flyer. One link for a Both-schools camp.
- **C6 Camper detail — approved 2026-10-18:** child, days, extras, price breakdown, paying by, tag, payments list, parent + emergency contact (phones only here), "Signed up on the family form, <date> · waiver signed on the form · reference CP-####"; Edit details + Close. Reference code accepted.
- **C7 Family sign-up form — approved 2026-10-18** (C7a details, C7b check and sign, C7c signed up, C7d not open / closed; Color Belt family-form look): up to 3 children per sign-up; per child first + last name, age, member, days, extras, running price; parent + emergency contact; **pay at the school by Cash / Check / Card** (Card accepted — Camps only; Color Belt unchanged); early/regular by sign-up date (Massachusetts time); waiver + signature; reference code; privacy line + emergency-contact hint accepted.

**All Camps screens approved (C1–C7), 2026-10-18.**

**Rulebook numbering (Main session, 2026-10-19, rulebook v0.300):** this branch's block is **0.700–0.799**, used in order from 0.700. Existing rows v0.229–v0.237 are not renumbered now; 0.233–0.237 clash with the new-students branch and move into the 0.7xx block at merge if that branch merges first. Before the next rulebook edit: commit, `git merge main`, re-read.

## Build plan questions (TKD-Camps-Build-Plan.md, asked one at a time from 2026-10-19)

| # | Question | Answer |
|---|---|---|
| 1 | Public-form login + off switch | **A. Own** `camps_registrar` login + own `CAMPS_REGISTRATION` switch (like Star) — Jeffrey 2026-10-19 |
| 2 | Who sets up camps and templates | **A. Admins only** (Add / Edit / Delete camp, prices, Save as template, Edit / Delete template). Staff incl. the desk login: open camps, roster, Mark paid, Edit details, Withdraw, Registration link — 2026-10-19 |
| 3 | Who sees parent / emergency phones | **A. Staff and admins**, in Camper detail (C6) only, never in lists — 2026-10-19 |
| 4 | Editing prices after sign-ups | **A. Allowed; existing campers keep their price**; a camper is re-priced (at current prices) only when staff change that camper's own days, member box or extras — 2026-10-19 |
| 5 | Removing a camp day someone picked | **A. Refused** ("Can't remove Wed, Dec 30: Mia Rossi and 2 more picked it. Change their days or withdraw them first."); adding days is fine. **Replaces the v0.237 accepted proposal "asks first if any price would change" → needs a rulebook row (0.7xx).** — 2026-10-19 |
| 6 | Removing days / extras after paying | **A. Allowed**: tag stays Paid, Camper detail shows "Paid $X more than the total"; an admin uses ⋯ → Edit payment if money is handed back; refund decisions stay outside the app — 2026-10-19 |
| 7 | Signature retention | **B. 3 years after the camp's last day**, then deleted; "Signed on the form, <date>" stays. Jeffrey to confirm the period with the school's insurer (not legal advice). Clean-up runs from Add camp / Mark paid — 2026-10-19 |
| 8 | Phone numbers in the change log | **A. Logged like other fields** (old → new), as Star's date of birth (v0.169) — 2026-10-19 |
| 9 | Close / Reopen sign-up | **A. In the camp page ⋯ and the Camps list row ⋯, staff and admins**, instant with 5-second Undo; tag shows Closed (menu order: Edit camp, Close/Reopen sign-up, Save as template, Print roster, Delete camp) — 2026-10-19 |
| 10 | Price changed while filling the form | **A. Refuse** ("The price changed while you were filling in the form. New total $X (was $Y). Check it and sign again." → back to Check and sign); covers admin price edits and the early → regular switch at midnight — 2026-10-19 |
| 11 | Same child signed up twice | **B. Color Belt's "Possible duplicate" flag** (Jeffrey chose over "staff remove it"): same child name signed up again for the same camp → amber "Possible duplicate" tag on the later row with Keep both / Remove this one, copying Color Belt's built pattern. **Not in the approved C4 mockup → draw it (C4 addition) + rulebook row (0.7xx) + plan/contract update.** — 2026-10-19 |
| 12 | Sign-up tries per hour (one connection) | **B. Camps counts only its own `camp:` rows, 30 per hour** (failed tries count); Color Belt / Star forms don't use it up — 2026-10-19 |
| 13 | Ages the form accepts | **Set per camp** (Jeffrey: "Let us set a range"): Add / Edit camp → 5. Family form gets "Ages accepted: from [ ] to [ ]" (blank camp default 3–17; templates carry their own range); folded summary "Ages 5–12 · …"; family form shows "Ages 5–12" and refuses others with "This camp is for ages 5 to 12." **Not in approved C3 / C7 → draw it (with Q11's duplicate flag) + rulebook row (0.7xx) + plan update.** — 2026-10-19 |

Details settled from precedent while drawing the additions (2026-10-19, design review): staff Close sign-up any time and Reopen only before the closing date, admins any time (Star v0.86); Close is hidden on Not-open-yet camps; Close / Reopen have no icon (Star's menu); phone row ⋯ includes Edit camp (Star v0.92); staff see "Ask an admin to add or change camps." and no Templates tab; duplicate compare follows Color Belt (Keep this one moves the other sign-up and its payment to Removed; Restore brings both back; after the camp's last day only admins Keep this one, Color Belt v0.194) and shows a Total row; age counts on the camp's first day.

**Additions approved (Jeffrey, 2026-10-19: "all of this is good"):** C4b possible duplicate, age range (C3 / C7a), staff view + Close / Reopen sign-up (C1 / C4), overpayment line (C6).

**Check-in and roster layout (Jeffrey, 2026-10-19):** "there's going to be a roster, right? So we can check the kids in" → daily check-in was not in the design; added. Then "too cluttered … I should be able to make decisions quickly" → **option A, three tabs on the camp page, check in only** (pictures `Decision images/Camps-attendance-roster.png`, `Camps-roster-layout-options.png`). Jeffrey: "go with it for now … I need to see it and actually use it" — may change after the preview.
- **Check in** tab (opens here during camp week): only today's campers; "9 of 15 here"; Find a camper search; groups **Not here yet** (name, age, one small amber note only when needed — Not paid / Owes / drop-off / pick-up — and **Check in**) and **Here** (time). One tap records the time, 5-second Undo; ⋯ → Undo check-in later. Check in works on today; fixing an earlier day is admin-only; future days have no button. Tapping the "Not paid" note opens Mark paid.
- **Payments** tab (opens here before camp): "13 paid · 5 to collect · $1,040"; **To collect** first (days · paying by in one gray line, total, Owes tag, Mark paid / Mark paid $X), then **Paid**; Possible duplicate box + compare (C4b) lives here; Withdraw → Removed group at the bottom.
- **Attendance** tab: week grid — one row per camper, one column per camp day: came ✓ (time in Camper detail) / didn't come ✗ (past days) / dashed = still to come / — not signed up; "Came X of Y" (days so far). Print roster prints this grid. One camp = one week (summer weeks are separate camps; a whole-summer report is a later idea).
- No check-out / pick-up record (option B not chosen).
- Tap any name → Camper detail (C6) with everything else, incl. check-in times.

**CONTRACT-0013 written 2026-10-19** (`docs/Dashboard Docs/Build contracts/CONTRACT-0013.md`), plan updated to all answers; contract review running. Items the contract settled on its own (§10), **to confirm at the CP1 walkthrough**: admin Reopen after the closing date moves the close date to the camp's last day; Check in tab keeps a day switch (default today) so admins can fix an earlier day; tapping a Not paid / Owes note opens a small Mark paid popup; Payments uses a one-line summary instead of the four cards; Edit details allows ages 1–99 (range checked only on the form); age range may be equal (8–8); Edit details refuses removing a day already checked in; possible duplicates can be checked in; Save as template note mentions ages; new wording list (contract §7.3).

**CP0 — build plan OK'd by Jeffrey 2026-10-19** ("let's finish it … do a preview so I can see it").

**All 13 build plan questions answered (2026-10-19).** Follow-ups: draw C3 / C4 / C7 additions (age range, possible duplicate) for approval; then update the build plan, write CONTRACT-0013 and record Q5, Q11, Q13 (and the other answers) in the rulebook from the 0.7xx block.

## Next

1. ~~Commit the Camps docs~~ — done 2026-10-18 (`637fb29`, branch `camps`, not pushed).
2. ~~Record in the rulebook~~ — done 2026-10-18: merged `main` (v0.196) into `camps`, added **v0.229–v0.237** (10b rows, changelog, §9 Camps row, §2.4 icons). Numbers start above the highest on any branch (v0.228 on `color-belt`); renumber at merge into `main` if needed.
3. Build plan — **drafted 2026-10-19** (`docs/Camps/TKD-Camps-Build-Plan.md`), independent review running. Migration **0013** (0011 = Finance worktree, 0012 = Prospects branch, both not on `main` yet). + contract (like Color Belt phase 2): database migration (next free number), family-form public path reusing Color Belt's registrar / Turnstile / Hyperdrive pattern, staff screens, preview mock data; independent review of the plan; then build with subagents + security and design review.
- Migration number: **0013** (checked 2026-10-19 across all branches and worktrees: 0010 = Color Belt phase 3 on `main`, 0011 = Finance, 0012 = Prospects).
