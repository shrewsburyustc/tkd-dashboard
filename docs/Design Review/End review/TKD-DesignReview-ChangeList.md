# Design Review — the end-of-walkthrough change list

**Started:** 2026-10-23 (Design Review session, branch `design-review`) · **Source:** every decision in `../Walkthrough/Decisions.md` (items 1–20c, all decided 2026-10-22 / 23) · **Checked** 2026-10-23 by a separate reviewer agent against the decision log; its 24 findings were verified in the code and rulebook and fixed (missing lines, two misstated lines, database work for 9b and 18, Main split into two prompts, rows 11 / 11b split). **Nothing here is built yet.** Nothing in the app, the database or the rulebook has changed; no prompt has been sent.

This file is what we go over before anything changes (Jeffrey's walkthrough rule, 2026-10-22). It has five parts:

1. **The order of work** — who goes first and why.
2. **Changes by owner** — every decided change, grouped by the session that will make it.
3. **Rulebook rows to write** — one row per decision, from this session's block 1.000–1.099.
4. **Open details and questions** — things the walkthrough parked; each needs a short answer before its prompt is written.
5. **Next steps** — what happens after this list is checked.

Sizes: **S** = words, icons or a small fix · **M** = a new small view or behaviour · **L** = a new feature or a move between sections. "Item" points to the row in `Decisions.md` and its picture in `../Walkthrough/`.

---

## 1. The order of work

1. **Main builds the shared parts first** (item 19). Nothing on screen changes in this step: the parts are built once in `src/components/` (or `src/lib/` for helpers) and tested, so each pattern exists exactly once. Main's own screen changes (the offline bar, Home's line, the PIN / password guard, Staff accounts while private details are hidden) are a second, separate Main prompt.
2. **Then each section switches to the shared parts and makes its own changes**, in its own session and worktree, one prompt per section. Sections can work at the same time once Main's step is merged.
3. **Mockups first, as always** (CLAUDE.md): every visual change is shown at PC, tablet and phone size and OK'd by Jeffrey before code. The walkthrough pictures are PC-only "what it means" pictures, not the mockups.
4. **Database changes** keep the usual rules (handoff §6; migration numbers reserved through Main). Decisions that need database work: **the history line (9b)** — the app can't read `change_log` directly ("RLS on, no policy, no grants", 0003), and only Star and Finance have functions that read it, so Color Belt, Camps and Black Belt each need one; **Color Belt's results CSV (18)** — Star's is a database function (`star_results_csv`); **the top-bar search (20a)**; possibly **Classes and ranks in Settings (15d)** ("same tables", maybe no migration).
5. **Reviews before merge**, as always: a design review against the rulebook and the approved mockups; a security review for anything touching the database or sign-in (9b, 18, 20a, 15d, and 17b's PIN / password dialogs).

---

## 2. Changes by owner

### 2.1 Main (goes first)

**Main, step 1 — the shared parts (nothing on screen changes):**

| # | Change | Item | Size |
|---|---|---|---|
| M1 | **Shared Compare dialog and possible-duplicate box** (one design today, four copies: Color Belt, Star, Camps, Black Belt). | 19 | M |
| M2 | **Shared confirm box** ("are you sure?"): the safe button says **"Keep …"** (Keep payment, Keep student, Keep class … "Keep it" where there's no short name); the other button **repeats the words pressed** ("Delete class", not "Delete"). Settled in D1 (§6): while it works, the pressed button grays and says what it is doing ("Deleting…") and "Keep …" grays too (D1a); the two buttons stack full width when they don't fit (D1b); the button that changes nothing on the left, focused first when the action loses something, the action on the right, red when it loses something for good (D1c); asks that lose nothing say what stays too, "Stay …" for a place (D1d). | 8, 19 | M |
| M3 | **Shared Mark paid box**: the amount + **Paid by** Cash / Check / Card, preset to the family's choice with the hint "They chose … on the form." → "Mark paid $X". A different amount or date is fixed afterwards with Edit payment (admins). | 3, 19 | M |
| M4 | **Shared Print receipt** (Black Belt's receipt, built once by Main following item 19's rule — the receipt isn't in item 19's list): school name, what was paid and how, total due, paid to date, balance, both schools' addresses, "Fees are non-refundable." → Print or save as PDF. | 3b | M |
| M5 | **Shared Registration link dialog**: Copy link and Download QR code everywhere; Print flyer where a section has one today (Color Belt, Star; Forms' Print a sign). | 12a, 19 | M |
| M6 | **Shared count cards** (the row above a roster; tapping a card filters, "Showing … only · Show all"; "Payments recorded" stays a total). | 11, 11b, 19 | M |
| M7 | **Shared history line and list**: "History · N changes ›" at the end of a person's summary → the list, newest first (what changed, when · who); with Hide private details on, amounts and paid status are left out. | 9b, 19 | M |
| M8 | **Shared time list** (Star's list made shared): 5-minute steps, AM/PM on every time, opens at the chosen time; **6:00 AM–10:00 PM** for classes, testing and camps; Finance's reminder keeps 11 AM–11 PM and Off. | 14b, 19 | M |
| M9 | **One shared money helper** instead of five: "$65" on screens (cents only when there are some, "$290.50"); "$65.00" in Finance's report, print and export. | 17a, 19 | S |
| M10 | **Move the misplaced helpers** out of section folders: `useLiveLoad` (the 15-second refresh), `ChoiceGroup`, `DeleteDialog` (Testing's folder), `usePaymentsHidden` (Finance's folder). | 19 | S |
| M11 | **Shared words and styles**: "Back", "Cancel", "Retry" … out of `screens/testing/text.js`; shared styles out of testing / finance / prospects / staff CSS. | 19 | S |

**Main, step 2 — its own screen changes (after step 1):**

| # | Change | Item | Size |
|---|---|---|---|
| M12 | **One offline bar** for the whole dashboard: amber, under the top bar, on every page while offline or after two failed refreshes in a row; goes away by itself. Words adapted from Star's approved offline message, as drawn in picture 05b ("You're offline. Changes won't save until the connection is back. Keep this page open — this bar goes away by itself."). Star grading keeps its own grade-by-grade line; Camps' refresh warning folds into the bar (C19). | 5b | M |
| M13 | **Home's date line says "Both schools"** on Both (`src/lib/dates.js`, today "Worcester and Shrewsbury"). | 15c | S |
| M14 | **Change PIN / Change password join the unsaved-changes guard** (your OK for the v0.56 alignment). | 17b | S |
| M15 | **Settings → Classes and ranks** (with Color Belt, CB14): a second part on the Settings page; the Schedule's and Forms' hints point to it (N11). Open details D6. | 15d | L |
| M16 | **Top-bar people search** — "Search people" on every page, across Color Belt, Star, Black Belt, Camps and Prospects; results grouped by section with name, event and school only — nothing private, Prospects keep "Ava R."; a tap opens the person's summary; the in-list boxes stay; the "/" key then works (§3.6). **After** the walkthrough's fixes; needs its own design + security review. | 20a | L |
| M17 | **Staff accounts is desk-only while Hide private details is on** (D2b): the account menu's "Staff accounts" grays (the approved unavailable look, still focusable) with one gray line "Off while private details are hidden.", like Star's desk-only New candidate (v0.507); your own email in the account menu and on Set PIN stays. Detail for Main's mockup: the page itself, if it is open when the switch goes on (or is opened by its address), shows the same line instead of the list. | 2 (D2b) | S |

### 2.2 Color Belt

| # | Change | Item | Size |
|---|---|---|---|
| CB1 | Use the shared **Mark paid box** (M3). | 3 | S |
| CB2 | **Print receipt** in the person's ⋯ and detail (M4). | 3b | S |
| CB3 | **Undo payment asks first** and names what comes off; **Edit payment ends with "Payment changed" + Undo** (event roster and private testing). | 4 | S |
| CB4 | **Undo for 5 seconds** after Restore (event roster and private testing) and after private testing's "Changes saved". | 6 | S |
| CB5 | **Confirm boxes**: Classes and ranks' "Cancel" → "Keep …"; action buttons repeat the words pressed; "Keep event / Keep student" stay as built; the event and private grading leave warnings swap — "Stay on this page" left and focused, "Leave anyway" right and red (D1c, changes v0.192) (M2). | 8 | S |
| CB6 | **Private testing rows open the summary** (as the event roster): class, testing for, price, when added, paying by, the payment and its date; Close · Edit details. Mark paid and ⋯ stay on the row. | 9a | M |
| CB7 | **History line** in the event and private-testing summaries (M7) — needs a database function that reads Color Belt's change-log rows. | 9b | M |
| CB8 | **⋯ order**: private testing moves "Change how they'll pay" below its own items (Color Belt's order is the model). | 10a | S |
| CB9 | **Private testing's cards filter** like the event's (M6). | 11 | S |
| CB10 | Registration link box gains **Download QR code** (M5). | 12a | S |
| CB11 | **Shared date picker** for every date box (Star's picker). | 14a | S |
| CB12 | **Shared time list** (M8; 6:00 AM–10:00 PM, as today). | 14b | S |
| CB13 | **On Both: one box per school** (Finance's v0.198 pattern) with its upcoming testing and "Open Worcester" / "Open Shrewsbury"; nothing can be changed on Both (v0.34 / v0.35 stay). Open details D5. | 15c | M |
| CB14 | **Classes and ranks move to Settings** (with Main, M15); Color Belt keeps its testing prices, sparring gear and final award in a **"Prices"** tab (name to settle in the mockups). | 15d | L |
| CB15 | **Icons**: Not paid card `ti-circle-x`; Change how they'll pay `ti-switch-horizontal`; Restore `ti-arrow-back-up` (event roster); No-show result `ti-user-x`. | 16a | S |
| CB16 | Money through the **shared helper** (M9). | 17a | S |
| CB17 | **Private testing's empty list**: the box loses its second "Add private testing" button (the line, like every list). | 17c | S |
| CB18 | **After the testing day**: Star's **Print results** (who passed to which belt, a page per class) and an **admin-only Download CSV**, next to the class switch; the result button says **"Passed"**. Star's CSV is a database function, so Color Belt's likely needs one too. | 18 | M |
| CB19 | Switch to the **shared parts** (Compare dialog, duplicate box, count cards, confirm box, delete dialog). | 19 | M |

### 2.3 Star testing

| # | Change | Item | Size |
|---|---|---|---|
| S1 | Its payment dialog becomes the shared **Mark paid box** (M3). | 3 | S |
| S2 | **Print receipt** in the ⋯ and detail (M4). | 3b | S |
| S3 | **Edit payment ends with "Payment changed" + Undo** (today Star's Edit payment toast has no Undo — approved by copying Color Belt's); Undo payment already asks first. | 4 | S |
| S4 | **Undo for 5 seconds** after Restore and after "Change how they'll pay". | 6 | S |
| S5 | **Confirm boxes**: categories' "Cancel" → "Keep …"; Results' "Undo Mark as sent" box reworded; the grading leave warning swaps — "Stay on this page" left and focused, "Leave anyway" right and red (D1c, changes v0.192) (M2). | 8 | S |
| S6 | **History**: the five-row block becomes the one line (M7). | 9b | S |
| S7 | **⋯ order**: "Edit candidate" → **"Edit details"**, always first; money items in their own group. | 10a | S |
| S8 | Registration link box gains **Download QR code** (M5). | 12a | S |
| S9 | **Icons**: Not paid card `ti-circle-x`; Change how they'll pay `ti-switch-horizontal` (`ti-repeat` then means only Make-up). | 16a | S |
| S10 | Money through the **shared helper** (M9). | 17a | S |
| S11 | Switch to the **shared parts** (Compare dialog, duplicate box, count cards, time list, confirm box, delete dialog). | 19 | M |
| S12 | Its time list takes the shared range, **6:00 AM–10:00 PM** (today 8 AM–8 PM) (M8). | 14b | S |

### 2.4 Black Belt testing

| # | Change | Item | Size |
|---|---|---|---|
| BB1 | **Keeps its payment dialog** (payment plans need "For"), with the same words: **"Paid by"**, not "Method". | 3 | S |
| BB2 | Its **receipt becomes the shared one** (M4). | 3b | S |
| BB3 | The row ⋯ **gains Edit payment and Undo payment** (today it has neither), acting on the **latest** payment, the confirmation naming it; older payments stay on the payment line's ⋯ in the detail. Undo payment asks first (as today in the detail). | 4 | M |
| BB4 | **Refusal toasts move to the amber bar** (problems stay on screen). | 5 | S |
| BB5 | **Undo for 5 seconds** after Edit details, cycle saves and Restore. | 6 | S |
| BB6 | **"Remove candidate" and its choice box become two items**: Withdraw (plain) · Delete permanently (red, asks first; grayed with its v0.904 reason while there are payment records). Row ⋯ and the detail's ⋯. | 7 | S |
| BB7 | **Confirm boxes**: Delete cycle and Undo payment "Cancel" → "Keep …"; "Delete personal details now?", Undo refund and Undo returned mark reworded (M2). | 8 | S |
| BB8 | **History line** in the candidate summary (left out on purpose in v0.900 — now added) (M7) — needs a database function that reads Black Belt's change-log rows. | 9b | M |
| BB9 | **⋯ order** with a money group (Edit payment, Undo payment, refunds, Print receipt). | 10a | S |
| BB10 | **Registration link moves out of ⋯** to the page header button (M5); no flyer. | 12a | S |
| BB11 | **Close / Open registration without lock icons**. | 12b | S |
| BB12 | **Shared date picker** (its own planned switch, v0.911), on the staff screens and its family form's date of birth. | 14a | S |
| BB13 | **Shared time list** (M8; 6:00 AM–10:00 PM, as today). | 14b | S |
| BB14 | Money through the **shared helper** (M9). | 17a | S |
| BB15 | **Drop its copies** of shared parts (`InnerDialog`, `DateField` ×2, `SelectField`, `Choice`, `Grip`, `ConfirmDialog`), its Compare dialog / duplicate box, and draws its plan cards with the shared count cards. | 19 | M |
| BB16 | Its planned Results tab (contract 0025, its branch) **already fits the one results pattern**; Email result stays (its form collects an email). Nothing new. | 18 | — |
| BB17 | **"Rubric and prices" → "Rubric and waiver"** (the tab, `TAB_RUBRIC`, and every mention of it — e.g. the Result emails block's comments on its branch); the first line keeps "Same for both schools. Prices are set on each cycle." The seeded placeholder waiver (0016) names the old tab; it is replaced by the school's waiver before registration opens. | 15d (D4) | S |

### 2.5 Camps

| # | Change | Item | Size |
|---|---|---|---|
| C1 | **Hide private details hides money**: no Paid column or "to collect" on the roster; "Hidden on this tablet" / "Payment details are hidden on this tablet." in the camper detail; attendance, check-in and the duplicate warning stay. | 2 | M |
| C2 | Use the shared **Mark paid box** (M3). | 3 | S |
| C3 | **Print receipt** in the ⋯ and detail (M4). | 3b | S |
| C4 | **Undo payment asks first**; **Edit payment ends with "Payment changed" + Undo**. | 4 | S |
| C5 | **Undo for 5 seconds** after Camps' saves and after Restore. | 6 | S |
| C6 | **Confirm boxes**: "Keep camp / template / camper" confirmed; action buttons repeat the words pressed (M2). | 8 | S |
| C7 | **History line** in the camper summary (M7) — needs a database function that reads Camps' change-log rows. | 9b | M |
| C8 | **⋯ order**: "Change how they'll pay" no longer first on unpaid rows; Withdraw after the money items. | 10a | S |
| C9 | **No "Admin" heading** in its menus. | 10b | S |
| C10 | **Four cards** replace the summary line: Campers · Coming (that day) · To collect · Payments recorded; Coming and To collect filter (M6). "Updated …" stays. | 11b | M |
| C11 | Registration link: the **phone button gets its words** (keeps its blue) (M5). | 12a | S |
| C12 | **"Reopen sign-up" → "Open sign-up"**. | 12b | S |
| C13 | **Shared date picker** for sign-up dates; the camp-days calendar stays. | 14a | S |
| C14 | **Shared time list** (M8; 6:00 AM–10:00 PM — today 6 AM–9 PM). | 14b | S |
| C15 | Page line on Both says **"Both schools"** (today "Worcester and Shrewsbury"). | 15c | S |
| C16 | **Icons**: Restore `ti-arrow-back-up`; day grid ✓ / ✗ → `ti-user-check` / `ti-user-x`; the To collect card `ti-circle-x`. | 16a | S |
| C17 | Money through the **shared helper** (M9). | 17a | S |
| C18 | **Save as template** gets the unsaved-changes note. | 17b | S |
| C19 | Its own **refresh warning folds into the shared offline bar** (M12). | 5b | S |
| C20 | Switch to the **shared parts** (Compare dialog, duplicate box, confirm box, delete dialog, live refresh). | 19 | M |

### 2.6 Finance

| # | Change | Item | Size |
|---|---|---|---|
| F1 | **Shared date picker** for the day box. | 14a | S |
| F2 | **Shared time list** for the close-the-day reminder, keeping 11 AM–11 PM and Off (M8). | 14b | S |
| F3 | History: **"← Back to the day"** as a text link above the heading (the outline button goes). | 15a | S |
| F4 | The ⋯ **"Today" item loses its icon** (the Event icon). | 16a | S |
| F5 | Money through the **shared helper**, which keeps "$65.00" for Finance (M9). | 17a | S |
| F6 | Uses `usePaymentsHidden`, `useLiveLoad` and `ChoiceGroup` from their **new shared places** (M10). | 19 | S |
| F7 | **Both: refunds are named.** A school's box with refunds says "after $X refunds" next to its total, the Total card's words (v0.209) — "$675.00 8 payments · after $445.00 refunds"; "Both schools together" says it too. Worked out from the box's own numbers (cash + check + card − total), so no database change; a box with no refunds stays as it is. | 15c (D3) | S |
| — | Black Belt payments in Finance: **already planned** (v0.808 / v0.809) — item 1, nothing new. See D7. | 1 | — |

### 2.7 New students (Prospects, Forms, Schedule, Calendar)

| # | Change | Item | Size |
|---|---|---|---|
| N1 | Prospects: **"That prospect no longer exists." moves from a toast to the amber bar**; its ✓ goes. | 5 | S |
| N2 | **Undo for 5 seconds** after Prospects' panel status change and after Forms' Close / Open. | 6 | S |
| N3 | **Confirm boxes**: Prospects, Forms and Calendar "Cancel" → "Keep …"; Schedule's too; action buttons repeat the words pressed; the asks that lose nothing say what stays (D1d) — Forms' kiosk asks "Stay in the dashboard" / "Keep kiosk mode on", Prospects' two Came boxes "Keep in <the card's column>" (M2). | 8 | S |
| N4 | Forms: **"Open form again" → "Open form"**; the door icons go. | 12b | S |
| N5 | Forms' family page: **"Next" → "Continue"**, **"Submit" → "Send"**. | 13 | S |
| N6 | **Shared date picker** in Prospects, Schedule, Calendar and Forms, including date questions on Forms' family page (Black Belt's family date of birth is BB12; Star's already uses the picker). | 14a | M |
| N7 | **Shared time list**: Schedule and Calendar drop the browser's time box (M8). | 14b | S |
| N8 | Forms' builder: **"← Forms"** above the title (the bare arrow goes). | 15a | S |
| N9 | Staff line: Calendar **"View only. Ask an admin to make changes."**; Forms **"Staff can fill in and share forms. Ask an admin to create or change forms."** | 15b | S |
| N10 | Schedule's page line on Both says **"Both schools"**. | 15c | S |
| N11 | Schedule's and Forms' hints point to **Settings → Classes and ranks** (after M15 / CB14); whether they become links is D6. | 15d | S |
| N12 | Forms: **Edit uses `ti-edit`** (the pencil goes). | 16a | S |
| N13 | **The 13 icon-only buttons become the shared `IconButton`** (tooltip, 16 px icon): Calendar ⋯ and previous / next month (Finance's bordered look), the Event types rows' ⋯; Schedule's three ⋯; Prospects ⋯, the panel's ✕, the Edit statuses rows' ⋯; Forms' field ⋯ and two remove ✕. | 16b | S |
| N14 | Forms' Sent screen uses the **family page's tick** (24 px in the pale-green circle). | 16b | S |
| N15 | **Unsaved-changes guard**: Forms' Fill in and New form keep their note until Send / Save or Cancel (a second Esc does nothing), with Fill in's note under its buttons (v0.81); Prospects' Edit statuses gets the note. | 17b | S |
| N16 | Calendar's `ShowMenu` becomes the **shared menu**; Prospects uses `DeleteDialog` from its new place (M10). | 19 | S |
| N17 | **Hide private details in Prospects** (v0.249 / v0.506): the panel's **Email** grays (the approved unavailable look, still focusable, as Star's Email result) with one gray line "Email is off while private details are hidden. Email the family at the desk." (the top bar's icon); **every form answer reads "Hidden on this tablet"** — the questions and Show signature stay (as Star's View signature); Call, Text and the phone stay. | 2 (D2a) | S |

---

## 3. Rulebook rows to write (block 1.000–1.099)

Written by this session after `git merge main` (CLAUDE.md), each as a 10b row just above `| Approved 2026-10-16 (v0.26) |` with a changelog line, CRLF kept, the header version showing the last number used. Proposed numbers, in item order — one row per decision (items 11 and 11b are two rows):

| No. | Row | Item | Also changes |
|---|---|---|---|
| 1.000 | Hide private details: Camps hides money; Prospects hides the email (Email grays) and the form answers; phones stay (D2a); staff emails aren't covered — Staff accounts is desk-only while the switch is on (D2b) | 2 | applies v0.249 / v0.506 to Camps and Prospects; form answers join the list; "email" means a family's |
| 1.001 | One Mark paid box with "Paid by" (Black Belt keeps its dialog, same words) | 3 | v0.109, v0.136, v0.709, v0.218 |
| 1.002 | Print receipt in every section (Black Belt's receipt) | 3b | v0.220 |
| 1.003 | Fixing a payment: Edit and Undo together; Undo asks first; Edit ends with Undo; Black Belt's latest payment | 4 | v0.508, v0.912 |
| 1.004 | Problems stay on screen (amber bar; gray reason lines; toasts only for done) | 5 | §3.5, §8; v0.615 |
| 1.005 | One offline bar on every page | 5b | §3.5 wording; v0.513, v0.718 |
| 1.006 | Undo for 5 seconds after every reversible change | 6 | rule 1.4 |
| 1.007 | Red means gone for good: Withdraw plain; Delete permanently red and asks; Black Belt's two items | 7 | **§7 reworded**; v0.904 |
| 1.008 | "Are you sure?" boxes: "Keep …" and the pressed words; the busy look, stacking on small phones, one button order, "Stay …" / "Keep …" in asks that lose nothing (D1a–D1d) | 8 | §2.1 exception; v0.49, v0.66, v0.192, v0.233, v0.911, v0.912 |
| 1.009 | Color Belt private testing rows open the summary | 9a | v0.403 |
| 1.010 | The history line in every person's summary | 9b | v0.112, v0.900 (Black Belt) |
| 1.011 | One ⋯ menu order; "Edit details" everywhere | 10a | v0.121, v0.713, v0.900 |
| 1.012 | Admin-only items: no "Admin" heading; hidden or grayed with a reason | 10b | v0.713 |
| 1.013 | Count cards on every roster; tapping a card filters | 11 | §8; v0.402 |
| 1.014 | Camps' four cards (Campers · Coming · To collect · Payments recorded); Black Belt's plan cards and Finance's report cards confirmed | 11b | v0.715 |
| 1.015 | One Registration link button and box | 12a | v0.90, v0.134, v0.232, v0.900 |
| 1.016 | Close / Open: one verb pair, each section's noun, no icons | 12b | v0.85, v0.700, v0.900, v0.235 |
| 1.017 | Family pages: the same words do the same jobs (Continue · Back · the last button says what it does) | 13 | v0.235, v0.604 |
| 1.018 | Star's date picker for every date (Camps' camp-days calendar stays) | 14a | v0.502, v0.147, v0.911 |
| 1.019 | One time list (5-minute steps, AM/PM, opens at the chosen time; 6:00 AM–10:00 PM) | 14b | v0.157, v0.92, v0.600, v0.713, v0.900 |
| 1.020 | The v0.59 back link everywhere (Forms' builder, Finance's History) | 15a | v0.59, v0.235, v0.197 |
| 1.021 | The staff line: one pattern in two forms | 15b | v0.40, v0.234, v0.235 |
| 1.022 | Both: Color Belt shows one box per school; "Both schools" everywhere; Finance's boxes say "after $X refunds" (D3) | 15c | v0.35's blank "Choose a school" page becomes the boxes; the separation (v0.34, and nothing changeable on Both) stays; v0.198's Both boxes gain the refunds words |
| 1.023 | Where settings live; Classes and ranks move to Settings; Color Belt's Prices tab; Black Belt's tab becomes "Rubric and waiver" (D4) | 15d | v0.38, v0.40, v0.50, v0.135; v0.902 / v0.921's tab name |
| 1.024 | One icon per meaning (map rows for Not paid, Change how they'll pay, Restore, Came / Didn't come, Edit, Today, ✓ / ✗) | 16a | **§2.4 map**; v0.229, v0.914, v0.181 |
| 1.025 | Tooltips on every icon-only button; Forms' Sent tick; 8 new map rows | 16b | **§2.4 map**; §1.4 |
| 1.026 | How money is written; how names are listed; one money helper | 17a | — |
| 1.027 | The unsaved-changes guard everywhere; Change PIN / password join it | 17b | v0.46, **v0.56 alignment done** |
| 1.028 | Empty lists: one line; the header button is the one action | 17c | **§8 and §1.1 reworded**; v0.403 |
| 1.029 | One results pattern for the testing sections (Color Belt print results, CSV, "Passed") | 18 | **v0.189 settled**; v0.181 (the result words) |
| 1.030 | Shared parts live in one place and are built first | 19 | — |
| 1.031 | The top-bar people search | 20a | **§3.2**; v0.12 |
| 1.032 | Check-ins need the connection | 20b | **§3.5 queue line dropped**; v0.188 |
| 1.033 | Accessibility target: WCAG 2.2 AA, with the six added checks in plain words | 20c | **§4** |

Item 1 needs no row (already planned, v0.808 / v0.809). Changed older rows get the usual "(See v1.0xx …)" note at their start, not a rewrite.

---

## 4. Open details and questions

Each gets one short question (with a picture where it helps) before the prompt that needs it.

| # | Open point | From | Needed before |
|---|---|---|---|
| D1 | **The shared confirm box**: (a) what it shows while it saves (today mostly nothing; "Deleting…" / "Saving…" / "Opening…" in some); (b) at 320 px wide, stack the two buttons full width when they don't fit; (c) the three "… isn't saved" leave warnings put the safe "Stay on this page" on the right and select it first — the reverse of every other box — and the kiosk asks and "Came?" select the action first; (d) safe words for the asks that lose nothing (Forms' Open / End kiosk mode, Prospects' "Did … come to the free class?"). **All four decided — see §6 (D1a–D1d).** | 8 | Main's M2 |
| D2 | **Hide private details in Prospects**: the parent's email in the panel is covered by the rule (v0.506 names email) but not hidden — fix it (same as Camps, item 2)? And the open question: should it also hide parents' phone numbers and form answers in Prospects, and staff emails in Staff accounts? **Asked in two parts, both decided (§6): D2a Prospects, D2b Staff accounts.** | 2 | New students' prompt (Prospects); Main (Staff accounts) |
| D3 | **Finance on Both**: a school's box shows the total after refunds, but Cash · Check · Card count money in and there's no "after $X refunds" note (the one-school Total card has it, v0.209). Add the note? **Decided (§6).** | 15c (side finding) | Finance's prompt |
| D4 | **Black Belt's tab name** "Rubric and prices": its prices moved to each cycle (v0.902). Rename (e.g. "Rubric and waiver")? **Decided (§6): "Rubric and waiver".** | 15d (side finding) | Black Belt's prompt |
| D5 | **Color Belt's Both boxes**: list upcoming private testings too? Words when a school has none? Phone layout (Finance stacks its boxes). | 15c | Color Belt's mockups |
| D6 | **Classes and ranks in Settings**: staff today can view Classes and ranks (v0.40) but Settings is admins only — keep a staff view? Settings ignores the top bar — show both schools' classes, one under the other? The Prices tab's name. | 15d | Main + Color Belt mockups |
| D7 | **Black Belt payments before Finance reads them** (item 1): Black Belt's payment screens went live on Oct 21; until Finance's planned step, a Black Belt payment isn't in that day's report or Close the day. Anything needed meanwhile? | 1 | Finance / Black Belt |
| D8 | **What paper process did Prospects, Forms, Schedule and Calendar replace?** (the inventory's "paper task" column is blank for them) — needed for the Grandmaster walkthroughs in phase 3. | phase 1 | Phase 3 |
| D9 | **Later, no decision now:** emailed receipts once the dashboard can send email (as for Black Belt); Forms opens only from the form's name (a form isn't a person). | 3b, 9a | — |

**Seen during the walkthrough, to check in phase 3** (not decisions): Black Belt opening from "Color belt testing" until a reload (`Testing.jsx` `blackBeltOpen`; may be gone since Black Belt joined the chooser); Black Belt's Undo payment title "Undo payment 1 + Payment 2 + Payment 3?"; confirm boxes on screens under 700 px tall pick up the form dialogs' pinned button row; Prospects' Delete status may give no first focus; Star's failure note says "Couldn't save…" on a delete; mixed apostrophes (' and ’); the WCAG 2.2 checks from item 20c (focus behind pinned bars and the offline bar, the touch-screen PIN, the public pages' contact line, small tag buttons).

---

## 5. Next steps

1. **Jeffrey checks this list** — anything missing, wrong or in the wrong place.
2. **The open details, one question at a time** — D1 first (it shapes Main's confirm box), then D2–D4; D5–D6 go into the owning sessions' mockups; D7–D8 are questions.
3. **The rulebook rows** (section 3): `git merge main`, write rows 1.000–1.033 and the reworded sections, show them, commit on `design-review` after Jeffrey's OK; the Main session merges.
4. **The prompts**, ready to paste: **Main first, in two prompts** — step 1 the shared parts (M1–M11, nothing on screen changes), step 2 its own screen changes (M12–M14 and M17; M15 with Color Belt; M16 later) — then one per section (Color Belt, Star, Black Belt, Camps, Finance, new students), each asking for mockups of its visual changes before code.
5. Then the review carries on: phase 2 (other systems, on hold), phases 3–9.

---

## 6. Open-detail decisions

One question at a time, each with a picture in this folder; answers are recorded here (and go into the rulebook rows and the prompts).

| # | Question | Decision | Date | Picture |
|---|---|---|---|---|
| D1a | The shared confirm box while it works (today most boxes show no change; Calendar / Prospects "Deleting…", Forms / Color Belt private / Black Belt "Saving…", kiosk "Opening…"; form dialogs' Save grays with "Saving…", approved detail 8) | **Decided: B.** While a confirm box works, **the pressed button grays and says what it is doing** — the button's verb + "ing…": "Deleting…", "Undoing…", "Withdrawing…" — in the approved gray "unavailable" look (detail 8), **and "Keep …" grays too until it's done**, so nothing can be pressed twice and "Keep" can't seem to stop an action already on its way. (Jeffrey: "The pressed button grays and says what it is doing (Deleting…, Undoing…, Withdrawing…), and Keep … grays too until it's done.") Goes into Main's shared confirm box (M2) and row 1.008. | 2026-10-23 | `d1a-busy-box.png` (picture 4 drawn with `tools/mock-d1a-busy.js`) |
| D1b | The box's two buttons on a small phone (at 320 px Color Belt's "Keep student" · "Delete permanently" squeeze onto two lines each; item 8's "Keep …" pairs are longer; rule §2.1 allows a full-width phone button only for a form's single submit) | **Decided: B.** **When a confirm box's two buttons don't fit on one line, they stack**, one above the other, **each the full width of the box, in the row's order**; everywhere else the box looks as today. **Rule §2.1 gets that small exception** (a full-width button on a phone is otherwise only a form's single submit button). (Jeffrey: "When a confirm box's two buttons don't fit on one line, they stack, each the full width of the box, in the row's order; rule 2.1 gets that small exception.") Goes into Main's shared confirm box (M2) and rows 1.008 / §2.1. | 2026-10-23 | `d1b-narrow-buttons.png` (pictures 3–4 drawn with `tools/mock-d1b-stack.js`) |
| D1c | Which button goes where (every box: "Keep …" left and focused first, the action right — red when it deletes; the three "… isn't saved" leave warnings — Color Belt event and private grading, Star grading, v0.192 — put blue "Stay on this page" right and focused, "Leave anyway" left; kiosk Open / End and Prospects' "Came?" focus the action, losing nothing) | **Decided: B.** **The same order in every box:** the button that changes nothing **on the left**, **focused first when the action loses something** (otherwise the action is focused, as kiosk and "Came?" today); **the action on the right**, **red when it loses something for good**, blue otherwise. **The three leave warnings swap:** "Stay on this page" left and focused, **"Leave anyway" right and red** (changes v0.192). (Jeffrey: "The same order everywhere: the button that changes nothing on the left, focused first when the action loses something; the action on the right, red when it loses something for good. The leave warnings swap, Leave anyway red.") Owners: Main (shared confirm box, M2); Color Belt (event and private grading) and Star (grading) for the leave warnings. | 2026-10-23 | `d1c-button-order.png` (picture 3 drawn with `tools/mock-d1c-order.js`; the leave warning was made real in the preview — today set to the testing day, one result set to fail — then the date and the testing data were reset) |
| D1d | What the button that changes nothing says in the asks that lose nothing (item 8's "Keep …" didn't settle them): Forms' "Open kiosk mode on this device?" and "End kiosk mode on all tablets?", Prospects' Board card dropped on Came ("Did … come to the free class?", or "… 's free class is still ahead" with one button) — all say "Cancel"; next to "End kiosk mode" it can read as "cancel kiosk mode", and the lone "Cancel" under a class date as "cancel her class" (Prospects also has "Cancel booking") | **Decided: B.** In the asks that lose nothing, **the button that changes nothing says what stays**, as item 8: Forms' "Open kiosk mode on this device?" → **"Stay in the dashboard"** (a place, like the leave warnings' "Stay on this page"); "End kiosk mode on all tablets?" → **"Keep kiosk mode on"**; Prospects' two Came boxes ("Did … come to the free class?" and "… 's free class is still ahead", on every device) → **"Keep in Booked"**, named after the Board column the card came from ("Keep in New" for a card from New). First focus unchanged (D1c: on the action, since nothing is lost). The rule as drawn: every "are you sure?" box names what stays — "Keep …" for a thing, "Stay …" for a place — so **"Cancel" is no longer a confirm-box button**; it stays in form dialogs, where it throws away the typing (Cancel · Save). (Jeffrey: "In the asks that lose nothing, the button that changes nothing says what stays: 'Stay in the dashboard' (Open kiosk), 'Keep kiosk mode on' (End kiosk), 'Keep in Booked' (the card's column) in both Came boxes.") Owners: Main (shared confirm box, M2); new students (Forms, Prospects — N3). | 2026-10-24 | `d1d-safe-words.png` (pictures 5–8 drawn with `tools/mock-d1d-words.js`; the still-ahead box needs a class after today, the Came box a card with no class to check in to — Prospects uses the real date, not setToday) |
| D2a | What "Hide private details" hides in Prospects (rule v0.249 / v0.506: date of birth, email and every payment detail on every screen, "Hidden on this tablet" v0.507; Prospects follows none of it and no Prospects doc or row plans it — missing, not planned): the panel's **Email** button opens the family's address; **Form answers and waiver** lists every answer (a form can add date and email questions; the event template asks "Anything we should know?", where families write health notes; every sign-up becomes a prospect); the **phone** shows (not named in the rule) | **Decided: B.** With Hide private details on, **Prospects' Email button grays** (the approved unavailable look, still focusable, as Star's Email result, v0.514) with one gray line **"Email is off while private details are hidden. Email the family at the desk."** (the top bar's icon), and **every form answer reads "Hidden on this tablet"** — the questions and Show signature stay, as Star's View signature. **Call, Text and the phone stay.** The rule's list becomes: date of birth, email, every payment detail **and form answers** (a form can ask a birthday or an email, and the dashboard can't tell which answers are private), on every screen; phone numbers stay. (Jeffrey: "With Hide private details on, Prospects' Email button grays with the line 'Email is off while private details are hidden. Email the family at the desk.', and every form answer reads 'Hidden on this tablet' (the questions and Show signature stay, as in Star). Call, Text and the phone s…" — his message was cut by the button's length limit; the button he chose goes on "…stay. Record it and show me D2b.") Owner: new students (Prospects, N17); rule row 1.000 and the v0.249 / v0.506 wording. | 2026-10-24 | `d2a-prospects-hidden.png` (pictures 3–4 drawn with `tools/mock-d2-prospects.js`; picture 2, the model, is Star's candidate detail with the switch on; picture 5 is item 2's camper-detail shot) |
| D2b | The staff side while "Hide private details" is on (the rule says "email … on every screen", written for families): staff emails show in the account menu (your own; anyone who opens it on that device), on the first-time Set PIN screen, in Staff accounts (every account's; admins only) and in its Reset password / Reset PIN boxes, where the email is there "so nobody resets the wrong account" (approved mockup, screen 4); those boxes then show the new password in plain text and the new PIN in four boxes | **Decided: C.** While Hide private details is on, **Staff accounts is desk-only**: the account menu's "Staff accounts" grays (the approved unavailable look) with one gray line **"Off while private details are hidden."**, like Star's desk-only New candidate (v0.507); one tap on the top-bar chip turns the switch off again. **Your own email stays** (the account menu, Set PIN): the rule's "email" means a family's. (Jeffrey: "While Hide private details is on, Staff accounts is desk-only: it grays in the account menu with 'Off while private details are hidden.' Your own email stays.") Owner: Main (M17); rule row 1.000. | 2026-10-24 | `d2b-staff-emails.png` (pictures 5–8 drawn with `tools/mock-d2b-staff.js`; picture 4 is the approved mockup's screen 7, `TKD-Staff-Accounts-Mockups.html`) |
| D3 | Finance on Both: each school's box shows its total **after refunds**, but "Cash · Check · Card" are the money that came **in**, so on a refund day they add up to more than the total and nothing says why (Oct 17 in the preview: Shrewsbury $675.00, yet $560 + $280 + $280 = $1,120); a refunds-only day reads "−$190.00 · 0 payments" over three zeros; "Both schools together" has the same gap. The one-school report's Total card says "after $445.00 refunds" (v0.209). The real `finance_day_both` (0011) returns the same fields as the fake one, so the boxes can work the refunds out (cash + check + card − total) with no database change | **Decided: B.** On Both, **a school's box with refunds says "after $X refunds" next to its total** — the one-school Total card's words (v0.209): "$675.00 8 payments · after $445.00 refunds", and on a refunds-only day "−$190.00 0 payments · after $190.00 refunds" — and **"Both schools together" says it too** ("$35.00 · 2 payments · after $190.00 refunds"). A box with no refunds stays as it is; Cash · Check · Card stay the money in. The refunds are worked out from the box's own numbers (cash + check + card − total): no database change. (Jeffrey: "On Both, a school's box with refunds says 'after $X refunds' next to its total (as the one-school Total card), and 'Both schools together' says it too.") Owner: Finance (F7); rule row 1.022. | 2026-10-24 | `d3-both-refunds.png` (pictures 5–8 drawn with `tools/mock-d3-both.js`; Finance's fake data, Oct 17 and Oct 22) |
| D4 | Black Belt's "Rubric and prices" tab has no prices: item 15d's rule says a section's own tab is named for what's in it; the prices moved to each cycle (v0.902), so it holds the waiver, how long signed waivers are kept and the default rubric, and its first line says "Prices are set on each cycle."; the Black Belt branch adds a Result emails block (0025, not merged) and keeps the name. Star's "Rubrics and prices" really holds its prices (Fees) | **Decided: B.** Black Belt's **"Rubric and prices" tab becomes "Rubric and waiver"** — its two biggest things, rubric first like Star's "Rubrics and prices"; the result emails (0025) sit in it without being in the name, as Star's do. **Its first line keeps "Prices are set on each cycle."** (Jeffrey: "Black Belt's 'Rubric and prices' tab becomes 'Rubric and waiver'; its first line keeps 'Prices are set on each cycle.'") Owner: Black Belt (BB17); rule row 1.023. | 2026-10-24 | `d4-bb-tab-name.png` (pictures 3–5 drawn with `tools/mock-d4-tab.js`) |
| D7 | Black Belt payments before Finance reads them: Finance adds them to the Daily report and Close the day "when Black Belt payments exist" (v0.808; returned checks v0.809; its own migration) — they exist (Record payment live since Oct 21) and Finance's status still says "when Black Belt payments exist". In the preview (pretend Apr 26, 2027) $870 cash recorded for Rina Patel at Worcester is missing from that day's Worcester report ("No payments recorded today. Nothing to close."). Live: the family form is off until Black Belt's CP6 (Spring 2027); the staff screens are live | **Waiting for Jeffrey.** Options: **A (recommended) Finance's step first, nothing on screen** — built next, live before Black Belt's form is switched on (CP6), written into both plans and the CP6 checklist; B temporary amber notes in Record payment and on the Daily report; C Record payment grayed until Finance's step is live. | — | `d7-bb-payments.png` (pictures 3–5 drawn with `tools/mock-d7-bbpay.js`; the preview's Black Belt sample `bbSampleRoster()` on its pretend date, then the date put back) |
