# Phase 1 — Checker report

**What was checked:** `TKD-DesignReview-Inventory.md` §3 (G1–G19) and §4 (early warnings 1–7), against the code at **1c42e8b** (the stated scope). The completeness sweep used Part A of all seven area files. **Results:** the 7 early warnings: **6 confirmed, 1 wrong in part** (#6), plus 1 unsure side-claim (#3, "receipt book"). In §3: **93 claim rows, 82 confirmed, 11 wrong, 0 unsure**. Many confirmed rows are incomplete; the tables note what is missing.

**Corrections that change a conclusion:**
- **#1 is real today.** Black Belt payments are live on the deployed site and Finance reads no Black Belt table.
- **#6 overstates the problem.** Color Belt grading does warn when saves fail. What is silent everywhere is the 15-second background refresh.
- **Black Belt "Remove candidate" is not red, but its approved mockup draws it red.** That makes it a code bug, not only a rule question. Color Belt, Star and Camps really did approve a plain Withdraw.
- **G4's busy word is wrong.** "Deleting…" appears only in Prospects and Calendar. Most confirms show no busy word at all.
- **The copy counts are off:** 5 QR makers (not 3), 4 duplicate boxes (not 2), 5 public `parts.jsx` (not 6), 4 browser `turnstile.js` (not 6), and one logo file (not 5 images).
- **Star's done page** says "<Name> is registered", the same as Color Belt and Black Belt.

**Two things moved while this check ran:**
1. `Area-1-Core.md` was missing when the check started. It was written at 06:56 and is included below.
2. Local `main` **and `origin/main` moved to 45a8b79 and were pushed** (44 commits after 1c42e8b): Star phase 6 Results, Black Belt rulebook rows v0.921–v0.935, Camps weekly pricing (0022) and a camp-roster refresh warning. The summary's "main at 1c42e8b" and its §6 table are now out of date (see the end of this file).

---

## Early warnings

| # | Claim | Verdict | Evidence (file:line) | Corrected wording |
|---|---|---|---|---|
| 1 | Black Belt payments are not in Finance; staff can record them; the drawer would look over | **CONFIRMED** — real today | **Reachable on the live build, no switch:** `src/screens/Testing.jsx:83-85` (lazy import, "every build", v0.917), `:287-313` (link + page); `src/lib/features.js` has only `STAR_TESTING_ON`; `git cat-file` shows `origin/main` contains `src/blackBelt/staff/BlackBeltTesting.jsx` and `RecordPaymentDialog.jsx`. **Live DB:** `docs/Testing/Black Belt Testing/TKD-BlackBelt-Status.md:144` ("0016 is LIVE on production"). **Staff can record:** `supabase/migrations/0016_black_belt.sql:4749-4757` ("S", paid_on = today), `:4783-4785` (only `has_data_access()`), `:4822-4827` (insert with `v_today`), `:4855-4856` (granted to `authenticated`); table `bb_payments` `:741`. **Finance reads only 4 tables:** final `finance_chain_steps_core` / `finance_money_rows_core` / `finance_closing_changes_from` read `testing_payments`, `testing_private_payments`, `star_payments`, `camp_payments` (`0018_finance_private.sql:230-279, 722-735, 978-998`). The strings `bb_`, `black_belt` and "black belt" appear nowhere in `0011`, `0017`, `0018`, `src/lib/finance/`, `src/screens/finance/` or `src/lib/mockFinance.js`. Fallback label: `src/screens/finance/PaymentsList.jsx:33-37`. Plan: rulebook lines 696-697 (v0.808 / v0.809); `docs/Finance/TKD-Finance-Status.md:156`. | Keep it. Add: **Yes — on the live site today, any Black Belt payment staff record (cash, check or card, dated today) is left out of the Daily report, Close the day, History and the CSV export.** Whether a real one has been recorded yet can't be told from the code. The family form is off, but staff can add candidates and take payments at the desk. Small fix: the comment at `src/screens/Testing.jsx:305` says "preview-only way in", but it is in every build. |
| 2 | Camps ignores "Hide private details" | **CONFIRMED** | No file in `src/screens/camps`, `src/screens/Camps.jsx` or `src/lib/camps` imports `privateDetails.js` or `usePaymentsHidden`. Every section that follows the switch reads the hook itself: `src/screens/testing/event/EventPage.jsx:193`, `src/screens/testing/events/EventsTab.jsx:102`, `src/screens/testing/private/PrivateTestingTab.jsx:128`, `src/screens/testing/star/event/StarEventPage.jsx:130`, `src/blackBelt/staff/candidates/CandidatesTab.jsx:81`, `src/blackBelt/staff/cycle/CyclePage.jsx:114`. The `hidden` in Camps is the lock screen (`src/screens/camps/CampPage.jsx:606`). Camps shows "$X due" / "Owes $X" and Mark paid regardless (`src/screens/camps/CampRoster.jsx:56, 75-153`). Rule: rulebook line 673 (v0.506), 597 (v0.249). | Keep. Note: Area-5's "App.jsx passes Camps no hidden flag" isn't the proof. App.jsx passes no flag to Testing either (`src/App.jsx:1013-1040`; Camps `:1041-1065`); each section reads the switch itself, and Camps never does. |
| 3 | Only Black Belt prints a receipt | **CONFIRMED** (code) · **UNSURE** ("receipt-book job") | The only receipt is `src/blackBelt/staff/receipt/ReceiptDialog.jsx:93`. Of the 10 `window.print` callers, the rest are flyers, grading sheets, the camp roster, the Daily report, a form sign and the Black Belt family printout. "Receipt book" appears in no file under `docs/` except this summary. | "**Only Black Belt prints a receipt.** Color Belt, Star and Camps payments have no receipt. No doc says whether the desk hands out paper receipts today — ask Jeffrey before calling it the receipt-book job." |
| 4 | Four ways to take a payment, four ways to fix one | **CONFIRMED** | See G1 and G2 below. | — |
| 5 | Errors that disappear after 5 seconds (Black Belt, Prospects) | **CONFIRMED** — incomplete | Toasts last 5 s (`src/components/Toast.jsx:25`). Black Belt: `useCandidateActions.js:109-116` (deleted candidate). Its `runQuick` (`:279-303`) sends **every** refusal of a one-click action or toast Undo to a toast: "Too late to undo here. Ask an admin." (`:359, 920`), "Only an admin can do that…", "This payment was already undone or changed.", "These registrations changed just now…", "That didn't save. Check the fields…" (`src/blackBelt/staff/text.js:73, 83, 584, 777, 915`). `CyclePage.jsx:76-81` (cycle deleted) and `:117-121` (why Add candidate is grayed) are toasts too. Prospects: `src/screens/Prospects.jsx:204`, shown with the default **✓ check icon**. Rules: rulebook 231, 377. | See "Exact corrections" (#5). |
| 6 | No offline warning outside Star grading — "a Wi-Fi drop at the mat looks like nothing happened" | **WRONG in part** | **True:** only Star grading says "You're offline" (`src/screens/testing/star/grading/useStarGradingSaves.js:341-353, 407`; `src/lib/star/gradingText.js:77-81`); no other `offline` listener exists in `src`. **Wrong:** at the Color Belt mat, a failed tap shows a "Not saved" tag and the banner "Couldn't save N results (Group A). Check the connection, then try again.", then retries every 10 s and on the browser's `online` event (`src/screens/testing/event/useGradingSaves.js:295-304, 312`; `src/screens/testing/text.js:826-830`). **What is really silent:** the shared 15-second refresh keeps old data with no sign when it fails (`src/screens/testing/events/useLiveLoad.js:84-89`). It is used by Color Belt, Star (outside grading), Black Belt, Camps and Finance — 16 files. | See "Exact corrections" (#6). |
| 7 | Withdraw is never red although §7 says it must be | **CONFIRMED** (but see G3: one mockup claim is wrong) | Red = `danger: true` (`src/components/RowMenu.jsx:20, 123`). No `danger` on: Color Belt `src/screens/testing/event/EventPage.jsx:1327`, Star `src/screens/testing/star/candidates/CandidatesTab.jsx:978`, Camps `src/screens/camps/CamperRowMenu.jsx:33`, Black Belt "Remove candidate" `src/blackBelt/staff/candidates/CandidatesTab.jsx:217` and `CandidateDialog.jsx:324`, and the Withdraw button `RemoveDialog.jsx:38` (plain `btn`). Rule: rulebook 325, 333 ("even to reversible removals that offer Undo"). | Keep. G3's "(the approved mockups drew them plain)" is wrong for Black Belt — see G3. |

---

## Claims in §3

C = confirmed, W = wrong. "Incomplete" means true as far as it goes, but something worth adding is missing (said in the Correction column).

| # | Group | Claim (short) | Verdict | Evidence | Correction |
|---|---|---|---|---|---|
| 1 | G1 | Color Belt (event + private): "Mark paid" with `ti-check` on the row, 1 click, full price with the method chosen earlier, dated today, no receipt | C | `src/screens/testing/event/RosterRows.jsx:100-116`; `src/screens/testing/private/PrivateRows.jsx:93-107`; `supabase/migrations/0005_testing_events.sql:2528` (paid_on = today) | Private testing charges what is still owed, not the full price. |
| 2 | G1 | Camps: tap the "$X due" tag → small box → Mark paid; 2 taps; school = this device | C | `src/screens/camps/CampRoster.jsx:56, 75-153`; `src/screens/camps/CampPage.jsx:286-291`; `0013_camps.sql` comment for `camp_mark_paid` (paid_on today) | — |
| 3 | G1 | Star: "Record payment" with no icon; dialog Paid by (preset) · Amount (pre-filled) · Date paid (shared DatePicker) | C | `src/screens/testing/star/candidates/CandidateRows.jsx:120-133`; `StarPaymentDialogs.jsx:18, 155-202` | — |
| 4 | G1 | Black Belt: "Record payment" `ti-cash-plus`, inside ⋯ on tablet/phone; For checklist, Amount + Method (none chosen), Note, "Save and record another"; no date ("counts as paid today"); Print receipt | C | `src/blackBelt/staff/candidates/icons.js:13, 31`; `CandidatesTab.jsx:189`; `RecordPaymentDialog.jsx:1-15, 46-90`; `src/blackBelt/staff/text.js:573, 747, 750` | — |
| 5 | G1 | Method word: "Paying by" / "Paid by" / "Method" | C | `src/screens/testing/text.js:629, 706`; `src/blackBelt/staff/text.js:747` | — |
| 6 | G1 | The four toasts | C | `src/screens/testing/text.js:599` (Camps reuses it); `src/screens/testing/star/candidates/text.js:139`; `src/blackBelt/staff/text.js:762` | — |
| 7 | G1 | Source line references | C | All four ranges point at the right code | — |
| 8 | G2 | Color Belt: Edit payment = Paid by · Amount · Date paid (browser date); "Payment saved" with no Undo; Undo payment at once with no question and no Undo; no refund | C | `src/screens/testing/event/PaymentDialogs.jsx:146-221` (`type="date"` at 204); `EventPage.jsx:923, 1100-1113` | — |
| 9 | G2 | Camps: same + Paid at, whole dollars ≤ $2,000; "Payment saved" no Undo; Undo at once; money back through Edit payment | C | `src/screens/camps/PaymentDialogs.jsx:41-50, 157-281`; `CampPage.jsx:337-348, 709`; `src/screens/camps/text.js:667` | — |
| 10 | G2 | Star: same 3 fields with the picker; "Payment saved" no Undo; Undo asks "Keep payment / Undo payment"; Record refund cash/check | C | `StarPaymentDialogs.jsx:26-27, 205-302`; `CandidatesTab.jsx:583, 1105-1118` | — |
| 11 | G2 | Black Belt: For · Amount + Method · Note · Reason (required), date stays; "Payment changed" + Undo; Undo asks "Cancel / Undo payment"; refund cash/check/card + Mark check returned | C | `src/blackBelt/staff/candidates/EditPaymentDialog.jsx:30-53`; `useCandidateActions.js:427-433`; `UndoPaymentDialog.jsx:38-50`; `dialogParts.jsx:61` | — |
| 12 | G3 | Color Belt event: Withdraw not red, no question, Undo, admin; Restore with no icon + Undo | C | `EventPage.jsx:1325-1330, 1076-1098` | — |
| 13 | G3 | Color Belt private: "Cancel private testing" (blue), asks ("Keep it"), no Undo, staff + admin; Restore `ti-arrow-back-up`, no Undo | C | `PrivateTestingTab.jsx:775, 785, 705-716`; `CancelPrivateDialog.jsx:20-25`; `src/lib/testing/privateRules.js:150-166` | — |
| 14 | G3 | Star: Withdraw not red, no question, Undo, admin; Restore `ti-arrow-back-up`, no Undo | C | `CandidatesTab.jsx:932, 978, 701-728` | — |
| 15 | G3 | Black Belt: Remove candidate → choice dialog; not red; Withdraw has Undo; admin; Restore, no Undo | C | `src/blackBelt/staff/candidates/CandidatesTab.jsx:217`; `RemoveDialog.jsx:27-70`; `useCandidateActions.js:806-830, 872-873` | — |
| 16 | G3 | Camps: Withdraw not red, no question, Undo, **staff + admin**; Restore with no icon + Undo | C | `src/screens/camps/CamperRowMenu.jsx:33, 44`; `CampPage.jsx:316-334` | — |
| 17 | G3 | Prospects: Delete prospect in red text, asks "Cancel / Delete", no Undo, admin | C | `src/screens/prospects/ProspectPanel.jsx:430-435`; `src/styles/schedule.css:347-351`; `src/screens/prospects/Dialogs.jsx:182-199` | — |
| 18 | G3 | §7 says remove buttons are red even when reversible; none of the Withdraws are | C | Rulebook 325, 333; row 7 above | — |
| 19 | G3 | "(the approved mockups drew them plain)" | **W** | Plain in Color Belt `TKD-ColorBelt-Roster-Mockups.html:555`, Star `TKD-StarTesting-Candidates-Mockups.html:555` and `…Phase3-Gap-Mockups.html:934`, Camps `TKD-Camps-Mockups.html:777`. **Red** in the approved Black Belt Candidates mockup (v0.900): "Remove candidate" is `it red` at `TKD-BlackBelt-Candidates-Mockups.html:679` (screen 1), `:686` (screen 3), `:731` (screen 9). | See Exact corrections. |
| 20 | G4 | Safe-button words: "Cancel" / "Keep event · Keep student · Keep candidate · Keep camper · Keep payment · Keep template" / "Keep it" | C — incomplete | `src/screens/testing/DeleteDialog.jsx:25-27`; `EventsTab.jsx:914`; `EventPage.jsx:1524`; `CandidatesTab.jsx:1110, 1124, 1139, 1197`; `CampPage.jsx:743`; `DeleteCampDialog.jsx:41`; `TemplatesTab.jsx:216`; `PrivateTestingTab.jsx:972`; `CancelPrivateDialog.jsx:21` | Also "Keep camp", "Keep refund", "Keep 1st Dan" (Star's Dan change), and the leave guards' "Leave anyway / Stay on this page". |
| 21 | G4 | Busy word: "Deleting…" everywhere except Forms ("Saving…") | **W** | "Deleting…" only in `src/screens/prospects/Dialogs.jsx:194`, `StatusesDialog.jsx:142` and `src/screens/calendar/EventTypesDialog.jsx:170`. "Saving…" in `src/screens/Forms.jsx:323`, `CancelPrivateDialog.jsx:24`, `src/blackBelt/staff/candidates/RemoveDialog.jsx:40, 88` and `UndoPaymentDialog.jsx:47`. **No busy word** (the label stays and the button just grays): `testing/DeleteDialog.jsx:28-38`, `testing/events/ConfirmDeleteDialog.jsx:30-40`, `StarDeleteEventDialog.jsx:34-44`, Star `dialogParts.jsx:83-95`, `src/blackBelt/staff/parts/ConfirmDialog.jsx:29-39`, `src/screens/schedule/ScheduleSchool.jsx:676-678`. | See Exact corrections. |
| 22 | G4 | "7 different confirm components" on top of `Dialog variant="confirm"` | **W** (count) | `variant="confirm"` is drawn in **17 places**: 10 confirm components in 9 files (`testing/DeleteDialog`, `testing/events/ConfirmDeleteDialog`, `testing/private/CancelPrivateDialog`, `star/events/StarDeleteEventDialog`, `star/candidates/dialogParts.jsx` ConfirmBox, `blackBelt/staff/parts/ConfirmDialog`, `blackBelt/staff/candidates/RemoveDialog.jsx` (RemoveDialog + DeleteConfirm), `UndoPaymentDialog`, `prospects/Dialogs.jsx` DeleteDialog), 4 inline (`Forms.jsx:312`, `ScheduleSchool.jsx:665`, `EventTypesDialog.jsx:146`, `StatusesDialog.jsx:119`) and 3 leave guards (`EventPage.jsx:1557`, `private/PrivateGradingPage.jsx:361`, `StarEventPage.jsx:802`). | See Exact corrections. |
| 23 | G4 | There is no shared ConfirmDialog | C | Nothing in `src/components/` except `Dialog.jsx` | — |
| 24 | G5 | Color Belt student ⋯ order | C | `EventPage.jsx:1288-1331` | — |
| 25 | G5 | Star: order changes between unpaid and paid rows; "Edit candidate"; private items first on unpaid rows | C | `CandidatesTab.jsx:936-981` | — |
| 26 | G5 | Black Belt candidate ⋯ order | C | `src/blackBelt/staff/candidates/CandidatesTab.jsx:189-218` | — |
| 27 | G5 | Camps camper ⋯ with an "Admin" heading; mouse only (touch gets the items in the detail) | C | `CamperRowMenu.jsx:16-41`; `CampRoster.jsx:247`; `CampPage.jsx:621-625` | — |
| 28 | G6 | Color Belt event, Star, Black Belt, Camps: row → read-only summary → "Edit details" turns the same dialog into fields | C | `src/screens/testing/event/StudentDialog.jsx`; `src/screens/testing/star/candidates/CandidateDialog.jsx`; `src/screens/camps/CamperDialog.jsx:172-179` | Black Belt differs: its "Edit details" is inside the detail's ⋯. The detail's buttons are Close / Print receipt / Record payment (`src/blackBelt/staff/candidates/CandidateDialog.jsx:299-310, 590-600`). |
| 29 | G6 | Camps opens only from the name; Star's ⋯ says "Edit candidate" | C | `CampRoster.jsx:307-319`; `CandidatesTab.jsx:944` | — |
| 30 | G6 | Color Belt private rows don't open, so "Paid on" can't be seen on a tablet | C | `PrivateRows.jsx:122-185` (no row onClick; Paid on only when wide; phones show it in the pay line) | — |
| 31 | G6 | Prospects uses a side panel, not a dialog (§6 / v0.46 says centered dialog) | C | Rulebook 303 | Add: the side panel was **approved for Prospects in v0.236** (rulebook 619), like the Staff exception named next. |
| 32 | G6 | Staff accounts opens the ⋯ menu (recorded exception v0.76) | C | Rulebook 475 | — |
| 33 | G6 | Forms opens only from the name | C | `src/screens/forms/FormsList.jsx:78-83` | — |
| 34 | G6 | History: Star (newest 5 + Show all), Prospects, Finance detail; none in Color Belt, Black Belt, Camps | C | `CandidateHistory.jsx:5, 123, 139`; `ProspectPanel.jsx:381-396`; `PaymentDetailDialog.jsx:95`; no history in `StudentDialog.jsx`, Black Belt `CandidateDialog.jsx` or `CamperDialog.jsx` | — |
| 35 | G7 | One shared design (amber box + tag + Compare, "Keep this one" / "Not the same person — keep both") | C | `src/screens/testing/text.js:688, 693`; `src/blackBelt/staff/text.js:909-911`; all four use the `ev-dupbox` classes | — |
| 36 | G7 | 4 separate copies of the Compare dialog | C | The 4 files exist as listed | — |
| 37 | G7 | "and 2 of the box" | **W** | The box is written **4 times**: inline in `EventPage.jsx:1688-1703` and Star `CandidatesTab.jsx:1232-1247`, plus `src/screens/camps/DuplicateBox.jsx:31-40` and `src/blackBelt/staff/candidates/DuplicateBox.jsx:20-35` | See Exact corrections. |
| 38 | G7 | "registered twice" vs "signed up twice"; Prospects has no duplicate check | C | `src/screens/camps/text.js:524, 546`; Prospects checks only duplicate *status names* (`src/screens/prospects/text.js:261`) | — |
| 39 | G8 | Color Belt / Star / Black Belt / Camps / Forms rows (opens from, inside, QR download, flyer) | C | `EventPage.jsx:1403-1406` (outline); `StarEventPage.jsx:689-692` (outline); `CyclePage.jsx:196` (⋯ "Registration links"); `CampPage.jsx:772-781` (primary, icon-only on phones); `LinksDialog.jsx:11` and `CampLinkDialog.jsx:10-11` (no flyer); download only in Black Belt, Camps and Forms | — |
| 40 | G8 | Three copies of the QR maker | **W** | **Five** files call `qrcode-generator` themselves: `src/lib/testing/qr.js:11`, `src/lib/camps/qr.js:13`, `src/lib/blackBelt/qr.js:17`, `src/lib/star/links.js:27, 52-58`, `src/lib/forms/share.js:12, 30-45` | See Exact corrections. |
| 41 | G9 | Color Belt and Star: Close / Open registration with no icon | C | `EventsTab.jsx:698`; `StarEventsTab.jsx:736` | — |
| 42 | G9 | Black Belt `ti-lock` / `ti-lock-open` (the map gives them to Lock now / Reopen day) | C | `CyclePage.jsx:198-205`; rulebook 158, 169 | — |
| 43 | G9 | Camps "Close sign-up / Reopen sign-up", no icon | C | `CampRowMenu.jsx:31, 197` | — |
| 44 | G9 | Forms "Close form / Open form again" with `ti-door-exit` / `ti-door-enter` | C | `src/screens/Forms.jsx:214-220`; `src/screens/forms/text.js:41-42` | — |
| 45 | G10 | Color Belt `/register/` row | C | `src/register/text.js:52, 70, 87`; `src/register/StepDetails.jsx:183` (Cash/Check only) | — |
| 46 | G10 | Star `/star/` row: done page "Registered" | **W** | The heading is "<Name> is registered": `src/star-register/Registered.jsx:28-29` → `src/star-register/text.js:108`. Steps, Send and Cash/Check are right (`text.js:55, 71, 90`). | Done page: "<Name> is registered" (same as Color Belt and Black Belt). |
| 47 | G10 | Black Belt row | C | `src/blackBelt/form/text.js:70, 100, 173` | — |
| 48 | G10 | Camps row ("Check and sign", "Sign up", "You're signed up", Cash/Check/Card) | C | `src/camp/text.js:65, 88, 105, 122` | — |
| 49 | G10 | Forms row (one step per page, no check page, Submit, "Thanks, <first>!") | C | `src/forms/text.js:19, 49-51` | — |
| 50 | G10 | `public/star-closed.html` is worded differently from the form's own not-open page | C | `public/star-closed.html:45-46` vs `src/star-register/text.js:128-129` | — |
| 51 | G10 | 4× StepDetails / StepCheck | C | `src/register`, `src/star-register`, `src/camp`, `src/blackBelt/form` | — |
| 52 | G10 | 6× `turnstile.js` | **W** | **4 browser copies** (`src/register`, `src/star-register`, `src/blackBelt/form`, `src/forms`; Camps borrows `src/register`'s). The other 2 are server code (`functions/_lib/turnstile.js`, `functions/_lib/forms/turnstile.js`), not page parts. | See Exact corrections. |
| 53 | G10 | 3× SignaturePad | C | `src/register/`, `src/blackBelt/form/`, `src/screens/forms/` | — |
| 54 | G10 | 6× `parts.jsx` | **W** | **5 public** ones (`src/register`, `src/star-register`, `src/camp`, `src/forms`, `src/blackBelt/form`). The 6th is Star's staff grading `src/screens/testing/star/grading/parts.jsx`. | See Exact corrections. |
| 55 | G10 | 5 separate logo images | **W** | **One** image file (`public/logo.png`), drawn by 5 hand-written `<img>` tags (`src/forms/parts.jsx:14`, `src/register/parts.jsx:14`, `src/camp/parts.jsx:17`, `src/star-register/Header.jsx:13`, `src/blackBelt/form/parts.jsx:19`) plus the kiosk (`src/screens/kiosk/KioskApp.jsx:153`). None uses `src/components/Logo.jsx`. | See Exact corrections. |
| 56 | G11 | Color Belt event: Students · Paid · Not paid · Payments recorded; the first 3 are clickable | C | `EventPage.jsx:1643-1676` (Students clears the filter; the money card is a plain box) | — |
| 57 | G11 | Color Belt private: 4 cards that do nothing | C | `PrivateTestingTab.jsx:863-876` (plain `div`s) | — |
| 58 | G11 | Star: 4 cards that filter | C | `CandidatesTab.jsx:1034-1062, 1248-1255` | Worth adding: Star's "Payments recorded" card also filters (`star/candidates/text.js:100`), where Color Belt's is a plain box. |
| 59 | G11 | Black Belt: Paid in full · Paying on schedule · Late · Not paid; filters; `ti-circle-x` / `ti-clock` | C | `SummaryCards.jsx:18-21, 65`; `icons.js:16, 48-51` | — |
| 60 | G11 | Camps: no cards, one summary line | C | No `ev-card` anywhere in `src/screens/camps` | — |
| 61 | G11 | Finance: Total · Cash · Check · Card; clicking scrolls, doesn't filter | C | `src/screens/finance/DayReport.jsx:108-157, 435-441` | — |
| 62 | G12 | The shared date picker is used only by Star | C | Importers: Star's 4 staff dialogs and `src/star-register/DobField.jsx` | — |
| 63 | G12 | Every other date is the browser's date box; Camps adds its own month calendar | C | `type="date"` in Color Belt, Camps, Black Belt (2 wrappers), Finance, Prospects, Schedule, Calendar, Forms; `src/screens/camps/sections/DayCalendar.jsx` | — |
| 64 | G12 | 6 different time lists | C | `src/screens/testing/events/EventDialog.jsx:25-30`; `StarEventDialog.jsx:5, 39`; `src/lib/blackBelt/checks.mjs:107-108` (65 choices from 06:00); `src/screens/camps/sections/campForm.js:44`; `src/screens/schedule/SlotDialog.jsx:234, 251`, `src/screens/calendar/EventDialog.jsx:203, 231`; `src/screens/finance/format.js:137-141` | — |
| 65 | G13 | Edits saved with no Undo (the list) | C — incomplete | `src/screens/Camps.jsx:122, 124`; `CampPage.jsx:631, 650, 709`; `CampRowMenu.jsx:235`; `useCycleEditor.jsx:211`; `useCandidateActions.js:759`; `PrivateTestingTab.jsx:460`; `EventPage.jsx:923`; Star `CandidatesTab.jsx:583`; `Prospects.jsx:244` vs `:399-404`; `Forms.jsx:176`; `Builder.jsx:337`; `Builder.jsx:222-236` (no toast at all) | Add: Star's "Changes saved" after **Change how they'll pay** has no Undo (`CandidatesTab.jsx:541`), while Color Belt's (`EventPage.jsx:886`) and Camps' (`CampPage.jsx:684`) do. Also no Undo: Star "Private testing set" (`:678`), Black Belt "Cycle added" (`useCycleEditor.jsx:211`), Finance "Day reopened" (`DayReport.jsx:428`). |
| 66 | G13 | Restore: Undo in Color Belt and Camps, none in Star and Black Belt | **W** (in part) | Color Belt **event**: Undo (`EventPage.jsx:1090`). Color Belt **private**: no Undo (`PrivateTestingTab.jsx:716`). Camps: Undo (`CampPage.jsx:329-332`). Star: none (`CandidatesTab.jsx:727`). Black Belt: none (`useCandidateActions.js:873`). | See Exact corrections. |
| 67 | G13 | Check icon on toasts: shown in Finance, Prospects, Forms and the account screens; hidden elsewhere | C — mixed inside two places | The default is `icon: true` (`src/App.jsx:233-236`). **Finance:** only Close the day (`DayReport.jsx:372`, with Undo) and "CSV downloaded" (`:679`). "Close undone", "Day reopened" (`:412, 428`) and the Settings toasts (`SettingsTab.jsx:64-67`) have none. **Account area:** PIN and password toasts (`App.jsx:417, 576, 581`) have it; "School saved" (`Settings.jsx:122`) and the staff resets (`StaffAccounts.jsx:248, 261`) don't. **Prospects:** only toasts without Undo (`Prospects.jsx:204, 217, 441`). Forms: all (`Forms.jsx:165, 176, 191`; `Builder.jsx:287, 315, 337`). | Say "most Finance and account toasts". Note that Prospects' **error** "That prospect no longer exists." shows the ✓. |
| 68 | G13 | The list of errors that vanish after 5 s | C — incomplete | See early warning 5 | — |
| 69 | G13 | Error banner endings: ", then retry." / ", then try again." / " and try again." | C | 32 / 27 / 18 occurrences in `src` | Also a bare "Check the connection." (`src/screens/staff/text.js:9`, `src/screens/forms/text.js:244`). |
| 70 | G13 | No Retry on the Prospects and Forms save banners | C | `Prospects.jsx:731`; `Forms.jsx:351`; `src/screens/forms/Builder.jsx:574` | — |
| 71 | G13 | Error in a dialog: top banner (Black Belt) · note under the buttons (Color Belt, Star, Camps) · above the button (Finance) | C | `src/blackBelt/staff/candidates/dialogParts.jsx:97-100` (connection failures; other Black Belt notes sit under the buttons, `:101-112`); `src/screens/finance/CloseDayBox.jsx:315-322` | — |
| 72 | G13 | Offline bar only in Star grading; background refresh failures silent (Camps, Color Belt) | C — incomplete | See early warning 6 | Silent in Star (outside grading), Black Belt and Finance too: they share `useLiveLoad.js`. (Current `main` adds a warning for the camp page only.) |
| 73 | G14 | Rule §8: one line + one action; almost every section shows the line only | C | Rulebook 371-373 | — |
| 74 | G14 | Color Belt Private testing shows a second "Add private testing" button, against §1.1 | C | `PrivateTestingTab.jsx:799-805, 845-855, 987`; rulebook 29, 31 | — |
| 75 | G15 | Back-link list | C — incomplete | `src/screens/testing/chooser/BackToTesting.jsx`; `src/blackBelt/staff/BlackBeltTesting.jsx:59`; `StarEventPage.jsx:615-618`; `EventPage.jsx:1354-1359`; `CampPage.jsx:567`; `PrivateGradingPage.jsx:274`; `Builder.jsx:350`; `HistoryView.jsx:96-102` | Star's home has **its own** "← Testing" copy (`src/screens/testing/star/StarTesting.jsx:122-125`), so there are 3 copies. Black Belt's cycle page adds "← Black Belt testing" (`CyclePage.jsx:137`). |
| 76 | G15 | "← Color belt testing" shows even when the page is titled "Testing" | C | `EventPage.jsx:1359` vs `src/screens/Testing.jsx:81`; `src/screens/testing/text.js:12, 510` | — |
| 77 | G15 | "View only" line: 4 wordings | C | `src/screens/testing/text.js`, Star, Black Belt, Schedule ("View only. Ask an admin…"); Calendar; Forms; Camps (`src/screens/camps/text.js:106`) | A fifth inside Calendar dialogs: "View only — ask an admin to change this." |
| 78 | G15 | Both: Color Belt blocks it; Camps adds a School column; Prospects and Schedule split into two; Calendar W/S; Finance one box each; Settings and Staff ignore it; "Both schools" vs "Worcester and Shrewsbury" | C | `src/screens/testing/BlockedOnBoth.jsx`; `src/lib/dates.js:20`; `src/screens/schedule/text.js:15`; `src/screens/camps/text.js:107, 120`; Staff exception at rulebook 475 | Forms on Both: a W/S letter (Area-7). |
| 79 | G15 | Star and Black Belt "show both with 'Showing Worcester candidates only · Show both schools'" | **W** | That line shows only when **one** school is picked (`CandidatesTab.jsx:1264-1271`, `oneSchool &&`; Black Belt `CandidatesTab.jsx:267-290`). On Both they list both schools. | See Exact corrections. |
| 80 | G15 | 8 homes for a section's settings | C | Area files + `src/lib/pageAddress.js:21-24` | — |
| 81 | G16 | Follows it: Color Belt (money), Star (date of birth, email, money), Black Belt ("this **device**"), Finance (leaves the rail) | C | Readers listed under early warning 2; `src/blackBelt/staff/text.js:607-608` vs `src/lib/privateDetails.js:47-48`; `src/App.jsx:918-928, 957` | — |
| 82 | G16 | Ignores it: Camps, Prospects, Calendar, Forms, Schedule | C — incomplete | No imports of the switch in those folders | Add Staff accounts and Settings (Area-1). Schedule shows nothing v0.506 covers, and Calendar and Forms show no date of birth, email or payments. In practice only Camps and Prospects matter. v0.506 names email, not phone. |
| 83 | G16 | Rule v0.506 says "on every screen" | C | Rulebook 673 | — |
| 84 | G17 | Same meaning, different icon (Edit/pencil; Restore; Not paid card; came/didn't come) | C | `Forms.jsx:211`; `EventPage.jsx:1329`; `CamperRowMenu.jsx:44`; `CandidatesTab.jsx:932`; `PrivateTestingTab.jsx:775`; Black Belt `icons.js:38`; `CampRoster.jsx:201, 219`; rulebook 150-151, 185, 189 | — |
| 85 | G17 | Same icon, different meaning (`ti-repeat`, `ti-clock`, `ti-calendar-event`, `ti-check`) | C | `CandidatesTab.jsx:919, 959`; rulebook 105, 189; Black Belt `icons.js:16`; rulebook 135, 139; `DayReport.jsx:469`; `ResultButtons.jsx:27`; `AccountMenu.jsx:314`; `ShowMenu.jsx:158` | Note: the map itself makes Event and the planned-schedule note one meaning (rulebook 139). Only Finance's "Today" is a new meaning. |
| 86 | G17 | 13 icons in use that aren't in the §2.4 map | C — **exactly 13** | A scan of every `@tabler/icons-react` import in `src` (102 icons) against rulebook lines 93-193 finds exactly these 13. First use of each: `ti-arrow-right` `EventPage.jsx:46`; `ti-arrows-horizontal` `Board.jsx:18`; `ti-award` `Testing.jsx:62`; `ti-calendar-x` `PrivateTestingTab.jsx:26`; `ti-camera` `src/forms/ThankYou.jsx:12`; `ti-circle-check` `FillInDialog.jsx:10`; `ti-currency-dollar-off` `AccountMenu.jsx:19`, `TopBar.jsx:10`; `ti-door-enter` / `ti-door-exit` / `ti-pencil` `Forms.jsx:15`; `ti-note` `GradingTab.jsx:28`; `ti-repeat` `CandidatesTab.jsx:28`; `ti-user-off` `ResultButtons.jsx:23`. | — |
| 87 | G17 | Header ⋯ in Calendar, Schedule and Prospects plus ~12 more new-students buttons use a plain `.icon-button` with no tooltip | C | 14 places: `Calendar.jsx:627, 663, 666`; `EventTypesDialog.jsx:83`; `Prospects.jsx:723`; `ProspectPanel.jsx:107`; `StatusesDialog.jsx:63`; `Schedule.jsx:106`; `ScheduleSchool.jsx:489, 547`; `Builder.jsx:350, 538`; `FieldEditor.jsx:81`; `FormFields.jsx:150` | Also Finance's phone-only "Back to the day" (`HistoryView.jsx:96`). |
| 88 | G18 | "$65" vs "$65.00" | C | `src/screens/finance/format.js:14-21` | Black Belt shows cents when there are any ("$290.50", `src/blackBelt/staff/text.js:435`). |
| 89 | G18 | Paying by / Paid by / Method | C | as row 5 | — |
| 90 | G18 | Color Belt sorts by last name, Camps by first; Prospects and Calendar show "Ava R." | C | `EventPage.jsx:135-141`; `CampRoster.jsx:30`; `src/screens/prospects/text.js:44`; `src/screens/calendar/text.js:81` | — |
| 91 | G18 | Unsaved-changes exceptions | C — incomplete | `Forms.jsx:299-303`; `src/screens/forms/useFillIn.js:104-110`; `Prospects.jsx:702-707`; `src/screens/camps/SaveTemplateDialog.jsx:58`; Area-1 J24 for the account dialogs | Also Black Belt's Add plan (closes without asking) and Finance's Export dialog. |
| 92 | G19 | Section copies (Black Belt parts, Calendar ShowMenu, Star PickerSheet, Camps popover, public logos) | C | `src/blackBelt/staff/parts/` (6 files); `InnerDialog.jsx:1-9`; `ShowMenu.jsx:8-11`; `PickerSheet.jsx`; `CampRoster.jsx:119-123` | — |
| 93 | G19 | Shared parts living in section folders (ConfirmDeleteDialog, DeleteDialog, usePaymentsHidden; components take words from `testing/text.js`; shared styles) | C — incomplete | `src/components/Dialog.jsx:41`, `RowMenu.jsx:24`, `ErrorBanner.jsx:16` | Missing the biggest ones: `testing/events/useLiveLoad.js` (Star, Black Belt ×4, Camps ×3, Finance ×3), `testing/events/ChoiceGroup.jsx` (Star, Camps, Finance) and the grip from `testing/RankRows.jsx` (Prospects, Calendar, Forms builder). Prospects' red Delete borrows `schedule.css`'s `.sdialog-remove`. |

**Count:** 93 rows. 82 confirmed (rows marked "incomplete" or with a note still need the addition in the Correction column). 11 wrong: rows 19, 21, 22, 37, 40, 46, 52, 54, 55, 66, 79.

**Outside the requested scope, but wrong:** §1 says the shared building blocks "including IconButton… are used by every section". **IconButton** is not imported in Prospects, Calendar or Schedule — that is G17's point. **Finance** writes its own `.notice` markup instead of `Notice` (`src/screens/finance/CloseDayBox.jsx:190`, `ExportDialog.jsx:151`). `Toast` is mounted once, in `src/App.jsx`.

---

## Missing from the inventory

Every one of the following has a Part A row in some area file:
- the 77 `*Dialog*.jsx` files;
- the 17 `variant="confirm"` sites;
- the 6 `role="dialog"` / `role="alertdialog"` elements (`src/blackBelt/form/Panel.jsx:78`, `AccountDialog.jsx:117/136`, `DatePicker.jsx:458`, `CampRoster.jsx:123`, `KioskApp.jsx:208`, plus `Dialog.jsx` / `InnerDialog.jsx` themselves);
- the 27 `<RowMenu>` sites;
- the 10 `window.print` callers;
- the other own-built menus and listboxes (AccountMenu, RailMenu, ShowMenu, PickerSheet, GradeCell, StarSelect, SelectField, FinalAwardSelect, DatePicker);
- the 5 server endpoints (Star's is named only in Part B).

Gaps:
- **`star.html`** (repo root): the Star family form's HTML entry. Area-3 Part A rows 49–53 name only `src/star-register/*` and `/star/<code>`; `public/star-closed.html` is row 54.
- **`index.html`** (repo root): the staff dashboard's entry page. No area file names it. Its screens are all in Area-1, so this is only a missing file name.
- **`Area-1-Core.md` was missing when the summary was written.** It now exists (written 06:56) and its Part A covers the core items.
- **Added on `main` after 1c42e8b, so not in any area file:** Star's Results tab (`src/screens/testing/star/results/ResultsTab.jsx`, with its own RowMenu at `:631`; `ResultRows.jsx`; the print sheet `StarResultsSheet.jsx`), the result-email texts (`ResultEmailsBlock.jsx`, `ResultTextDialog.jsx`), and the camp page's refresh warning (`useLiveLoad` `refreshFailing`; `src/screens/camps/CampPage.jsx:824` on `main`).

---

## Exact corrections for the summary

Paste these in place of the wrong text.

- **§4 #6:** "6. **No offline warning outside Star grading.** Only Star's Grading tab says 'You're offline'. Color Belt grading still marks a failed tap 'Not saved', shows a 'Couldn't save N results' banner and retries. But every list's 15-second background refresh (Color Belt, Star outside grading, Black Belt, Camps, Finance) fails silently, so a dropped connection shows only when someone tries to save."
- **§4 #5** (incomplete; suggested): "5. **Errors that disappear after 5 seconds.** Black Belt shows every refusal of a quick action or a toast Undo as a toast ('Too late to undo here. Ask an admin.', 'Only an admin can do that…', 'This payment was already undone or changed.', 'This candidate was deleted.', 'This cycle was deleted.', and why Add candidate is grayed). Prospects shows 'That prospect no longer exists.' as a toast with a ✓. He will miss them."
- **§4 #3** (the unsure part): "3. **Only Black Belt prints a receipt.** Color Belt, Star and Camps payments have no receipt. Whether the desk gives paper receipts today isn't written down — ask Jeffrey."
- **§4 #1** (add a sentence): "This is live now: staff can record Black Belt payments on the deployed site today, and Finance reads no Black Belt table."
- **G3, the sentence under the table:** "Rule §7 says remove-from-roster buttons are **red even when reversible**; none of the Withdraws are. Color Belt, Star and Camps match their approved mockups (Withdraw drawn plain). **Black Belt doesn't: its approved Candidates mockup draws 'Remove candidate' red** (screens 1, 3 and 9), but the code draws it plain."
- **G4, busy word:** "**Busy word:** 'Deleting…' only in Prospects (delete prospect, delete status) and Calendar (delete event type). 'Saving…' in Forms, Color Belt's Cancel private testing, and Black Belt's Withdraw, Delete permanently and Undo dialogs. Every other confirm (Color Belt, Star, Camps, Schedule, Black Belt's Delete cycle) keeps its label and just goes gray."
- **G4, components:** "**17 confirm boxes** are drawn on top of the shared `Dialog variant="confirm"`. They come from 10 confirm components in 9 files:
  - `src/screens/testing/DeleteDialog.jsx` (Color Belt + Star)
  - `src/screens/testing/events/ConfirmDeleteDialog.jsx` (Color Belt + Camps)
  - `src/screens/testing/private/CancelPrivateDialog.jsx`
  - Star's `StarDeleteEventDialog` and the `dialogParts` ConfirmBox
  - Black Belt's `parts/ConfirmDialog`, `RemoveDialog` (+ `DeleteConfirm`) and `UndoPaymentDialog`
  - Prospects' `Dialogs.jsx` DeleteDialog

  The rest are inline confirms (Forms, Schedule, Calendar event types, Prospects statuses) and the three leave guards (Color Belt event page, Color Belt private grading, Star event page). There is **no shared ConfirmDialog**."
- **G7:** "…but it is **4 separate copies** of the Compare dialog (`src/screens/testing/event/CompareDialog.jsx`, `src/screens/testing/star/candidates/StarCompareDialog.jsx`, `src/screens/camps/CompareDialog.jsx`, `src/blackBelt/staff/candidates/CompareDialog.jsx`). The box is written 4 times too: inline in Color Belt's EventPage and Star's CandidatesTab, plus Camps' and Black Belt's own `DuplicateBox.jsx`. All four use the same `ev-dupbox` styles."
- **G8:** "Five copies of the QR maker (`src/lib/testing/qr.js`, `src/lib/camps/qr.js`, `src/lib/blackBelt/qr.js`, `src/lib/star/links.js`, `src/lib/forms/share.js`). Each calls `qrcode-generator` itself."
- **G10, Star row:** "| Star `/star/` | Details → Check and send | yes | Send registration | "<Name> is registered" | Cash, Check |"
- **G10, sentence under the table:** "Each page is its own small app with copied parts:
  - 4× StepDetails / StepCheck
  - 4× browser `turnstile.js` (Camps borrows Color Belt's; the server has 2 more)
  - 3× SignaturePad
  - 5× public `parts.jsx`
  - 5 hand-written logo `<img>` tags for the same `logo.png` (none uses the shared `Logo` component)"
- **G13, Restore:** "**Restore:** Undo on Color Belt's event roster and in Camps. None on Color Belt's Private testing, in Star or in Black Belt."
- **G15, Both:** "Star and Black Belt list both schools on Both. On one school they add 'Showing Worcester candidates only · Show both schools' (the link switches the top bar to Both)."

**Worth adding (not wrong, but incomplete enough to mislead):**
- **G6:** "(the Prospects side panel was approved in v0.236)"; "Black Belt's Edit details is inside the detail's ⋯, not a button".
- **G13:** Star's "Change how they'll pay" has no Undo, while Color Belt's and Camps' do. Black Belt "Cycle added" and Finance "Day reopened" have no Undo either.
- **G16:** add Staff accounts and Settings to "Ignores it". Only Camps and Prospects show anything v0.506 covers.
- **G19:** add `useLiveLoad`, `ChoiceGroup` and the Testing grip to the "shared parts living in a section folder" list. `useLiveLoad` alone is used by 4 sections outside Testing.
- **§1:** IconButton isn't used by Prospects, Calendar or Schedule; Finance doesn't use Notice.

---

## Since the scope commit (read before phase 3)

- **`main` = `origin/main` = 45a8b79**, pushed during this check: 44 commits after 1c42e8b. The `design-review` branch is still at 1c42e8b, so it is no longer equal to `main`.
- **§6 is stale:**
  - `camps`: 0 ahead (merged; migration 0022 live).
  - `star-testing`: 1 ahead (cefab7f, phase 7 Home "Today" mockups, v0.515). Phase 6 Results and the hide-switch fix (1469327) are on `main`.
  - `black-belt`: 2 ahead (8bd365f rubric editor build with migration 0024, plus a merge). The rulebook rows v0.921–v0.935 are on `main`.
  - `claude/prospect-form-system-cd893d`: 2 ahead, 45 behind.
  - `color-belt`, `finance`: 0 ahead, 45 behind.
- **Claims that may read differently on current `main`:** G13 / early warning 6 (the camp page now warns when its refresh keeps failing); G11 and G12 for Camps (weekly roster, camps up to 60 days); G16 for Star (row-banner fix). Re-check these before phase 3, or move the review branch to 45a8b79.
