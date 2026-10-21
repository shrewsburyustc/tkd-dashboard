# Design Review — Phase 1: Inventory

**Scope:** `main` at commit 1c42e8b (2026-10-21), plus the 44 commits that reached `main` during the review (to 45a8b79: Star Results, Camps weekly pricing) — see `Area-8-Delta-45a8b79.md`. Branch `design-review`. Review only — nothing in the app was changed.
**Method:** 7 inventory agents (one per area, read-only), an icon scan across all of `src/`, then a separate checker agent that re-verified every claim below against the code (its report: `Checker-report.md` in this folder: 6 of 7 early warnings and 82 of 93 claims confirmed as first written; the 11 wrong details are corrected below), then a delta agent for the new commits.
**Per-area detail** (every screen, dialog, menu and public page, with file, owner, rulebook rows, mockup and paper task): `Area-1-Core.md` … `Area-7-NewStudents.md`, and `Area-8-Delta-45a8b79.md`, in this folder.

---

## 1. Summary

- **About 290 items** across 7 areas: staff screens and tabs, dialogs, menus and sheets, print views, banners, and **5 public sign-up apps** (Color Belt, Star, Black Belt, Camps, Forms) plus the kiosk.
- The shared building blocks (`Dialog`, `RowMenu`, `Toast`, `ErrorBanner`, `Notice`, `IconButton`) are used by almost every section — that part is already nearly one system. Gaps: Prospects, Calendar and Schedule don't use `IconButton` (so their icon buttons have no tooltip), and Finance doesn't use `Notice`.
- On top of them, each section built its own version of the same jobs. The biggest splits: **taking a payment (4 different flows), fixing a payment, removing a person, confirm-dialog wording, registration links, the 5 public forms, date entry, count cards, and which changes get an Undo.**
- **Early warnings for the Grandmaster** (to be confirmed in phases 3–5; see §4).

## 2. Sections and owners

| Area | Owner session | What it holds | Public page | Status file | Area file |
|---|---|---|---|---|---|
| Shell, sign-in, lock, Home, account menu, Staff accounts, Settings, shared components | **Main** | 31 items | none | (handoff) | `Area-1-Core.md` |
| Testing frame + **Color Belt** (Events, event page with roster + grading, Private testing, Classes and ranks) | **Color Belt** (Testing choice page: **Star**) | 44 items | `/register/<code>` | `docs/Testing/Color Belt Testing/TKD-ColorBelt-Status.md` | `Area-2-ColorBelt.md` |
| **Star testing** (Events, event page with Candidates + Grading, Rubrics and prices) | **Star** | 55 items | `/star/<code>` + `public/star-closed.html` | `docs/Testing/Star Testing/TKD-StarTesting-Status.md` | `Area-3-Star.md` |
| **Black Belt testing** (Cycles, cycle page with Candidates, Rubric and prices, receipts) | **Black Belt** | 45 items | `/black-belt/<code>` (switched off) | `docs/Testing/Black Belt Testing/TKD-BlackBelt-Status.md` | `Area-4-BlackBelt.md` |
| **Camps** (Camps, Templates, camp page with roster) | **Camps** | 31 items | `/camp/<code>` | `docs/Camps/TKD-Camps-Status.md` | `Area-5-Camps.md` |
| **Finance** (Daily report, Close the day, History, Export, Settings, Home reminders) | **Finance** | 19 items | none | `docs/Finance/TKD-Finance-Status.md` | `Area-6-Finance.md` |
| **Prospects, Forms + kiosk, Schedule, Calendar** | **New students** | 70 items | `/f/<slug>` + kiosk | `docs/Prospects/STATUS-*.md` | `Area-7-NewStudents.md` |

**Paper task each screen replaces:** the area files record it per row. In short — Color Belt: the old Color Belt system + paper grading sheet; Star: paper applications, paper rubric tables and grading sheet; Black Belt: the Google Sheet + Apps Script + old registration page (receipt *email*); Camps: paper camp sign-up forms; Finance: the end-of-day drawer count (the Finance docs never describe the old paper method); Prospects/Forms/Schedule/Calendar: **no doc says what they replace** (marked "not found" — worth asking Jeffrey, because it decides which words the Grandmaster expects).

---

## 3. Same job, different design

Each group lists where the job happens and how each section does it. **Bold** marks the differences that matter. The last line of each group is the question it becomes in phase 7 (one at a time, with pictures).

### G1. Taking a payment (the receipt-book job)

| Section | Button | Steps | What it asks | Method word | Date | Receipt |
|---|---|---|---|---|---|---|
| Color Belt event + private | **"Mark paid"** (`ti-check`) on the row | **1 click** | nothing — full price, the method chosen earlier | "Paying by" | today | **none** |
| Camps | tap the **"$X due" tag** → small box → **"Mark paid"** | 2 taps | nothing — school = this device's school | "Paying by" | today | **none** |
| Star | **"Record payment"** (no icon) | dialog | Paid by (preset), Amount (pre-filled), Date paid (**shared date picker**) | "Paid by" | picker | **none** |
| Black Belt | **"Record payment"** (`ti-cash-plus`; in ⋯ on tablet/phone) | dialog | **For** (checklist), Amount + Method (none chosen), Note; "Save and record another" | **"Method"** | none ("counts as paid today") | **Print receipt** |

Toasts: "Mia Lopez marked paid · $65 cash" (Color Belt, Camps) · "Payment recorded" (Star) · "Payment recorded · $390 · Alex Kim" (Black Belt).
Sources: `src/screens/testing/event/RosterRows.jsx:100-116`, `src/screens/camps/CampRoster.jsx:76-153`, `src/screens/testing/star/candidates/StarPaymentDialogs.jsx:155-202`, `src/blackBelt/staff/candidates/RecordPaymentDialog.jsx`.
**Phase 7:** one "take a payment" pattern for every roster (one tap when the amount is known, a small dialog only when it isn't), one word for the method, and a receipt everywhere.

### G2. Fixing a payment (edit, undo, refund)

| Section | Edit payment asks | Toast after edit | Undo payment | Money handed back |
|---|---|---|---|---|
| Color Belt | Paid by · Amount · Date paid (browser date) | "Payment saved" — **no Undo** | **at once, no question, no Undo** | **no way** |
| Camps | same + **Paid at** (school), whole dollars ≤ $10,000 (was $2,000 before 0022) | "Payment saved" — **no Undo** | **at once, no question, no Undo** | through Edit payment |
| Star | same 3 fields (date picker) | "Payment saved" — **no Undo** | **asks first**: "Keep payment / Undo payment" | **Record refund** (cash/check) |
| Black Belt | For · Amount + Method · Note · **Reason (required)** · date stays | "Payment changed" **+ Undo** | **asks first**: "Cancel / Undo payment" | **Record refund** (cash/check/card) + **Mark check returned** |

**Phase 7:** one rule for undoing a payment (ask or not), one refund action for all, Undo after every edit.

### G3. Removing a person from a roster

| Section | Action | Red? | Asks first? | Undo? | Who | Restore |
|---|---|---|---|---|---|---|
| Color Belt event | Withdraw | **no** | no | yes | admin | Restore (no icon) + Undo |
| Color Belt private | **Cancel private testing** | **blue** | yes ("Keep it") | **no** | staff + admin | Restore (`ti-arrow-back-up`), no Undo |
| Star | Withdraw | **no** | no | yes | admin | Restore (`ti-arrow-back-up`), no Undo |
| Black Belt | **Remove candidate** → choice: Withdraw / Delete permanently | **no** | **yes (choice dialog)** | Withdraw: yes | admin | Restore, no Undo |
| Camps | Withdraw | **no** | no | yes | **staff + admin** | Restore (no icon) + Undo |
| Prospects | Delete prospect | red text | yes ("Cancel / Delete") | no | admin | — |

Rule §7 says remove-from-roster buttons are **red even when reversible**; none of the Withdraws are. Color Belt, Star and Camps match their approved mockups (Withdraw drawn plain). **Black Belt doesn't: its approved Candidates mockup draws "Remove candidate" red** (screens 1, 3 and 9), but the code draws it plain — a code bug against the mockup.
**Phase 7:** is Withdraw red or not, and one remove/restore pattern.

### G4. Confirm dialogs (delete and other "can't undo" actions)

- **Safe-button words:** "Cancel" (Color Belt ranks/classes, Star category, Black Belt cycle and undo dialogs, Prospects, Forms, Schedule, Calendar) · "Keep event / Keep student / Keep candidate / Keep camper / Keep payment / Keep template" (Color Belt, Star, Camps, Black Belt) · "Keep it" (Color Belt private).
- **Busy word:** "Deleting…" only in Prospects (delete prospect, delete status) and Calendar (delete event type). "Saving…" in Forms, Color Belt's Cancel private testing, and Black Belt's Withdraw, Delete permanently and Undo dialogs. Every other confirm (Color Belt, Star, Camps, Schedule, Black Belt's Delete cycle) keeps its label and just goes gray.
- **17 confirm boxes from 10 confirm components in 9 files**, all on top of the shared `Dialog variant="confirm"`: `src/screens/testing/DeleteDialog.jsx` (Color Belt + Star), `src/screens/testing/events/ConfirmDeleteDialog.jsx` (Color Belt + Camps), `src/screens/testing/private/CancelPrivateDialog.jsx`, Star's `StarDeleteEventDialog` and `dialogParts` ConfirmBox, Black Belt's `parts/ConfirmDialog`, `RemoveDialog` (+ `DeleteConfirm`) and `UndoPaymentDialog`, Prospects' `Dialogs.jsx` DeleteDialog. Plus inline confirms (Forms, Schedule, Calendar event types, Prospects statuses) and three "results not saved" leave warnings (Color Belt event page, Color Belt private grading, Star event page). There is **no shared ConfirmDialog**.
**Phase 7:** one confirm wording ("Keep X" vs "Cancel") and one shared component.

### G5. A person's ⋯ menu

| Section | Items in order |
|---|---|
| Color Belt student | Edit details · Move to private testing · Change how they'll pay · Review possible duplicate — Edit payment · Undo payment — Withdraw · Delete permanently |
| Star candidate | **order changes between unpaid and paid rows**; "**Edit candidate**"; private-testing items first on unpaid rows |
| Black Belt candidate | Record payment (tablet/phone) · Edit details · Change plan or Kukkiwon · Record refund · Print receipt — Remove candidate |
| Camps camper | Change how they'll pay · Edit details · **Review** · Withdraw — **"Admin" heading** — Edit payment · Undo payment · Delete permanently. **Mouse only** (touch gets buttons inside the detail instead) |

**Phase 7:** one fixed order (everyday items → money items → remove items), one way to mark admin-only items.

### G6. Opening a person (the detail view)

- **Color Belt event, Star, Black Belt, Camps:** row click → read-only summary → **"Edit details"** turns the same dialog into fields. **This is already one good pattern.**
- Differences inside it: Camps opens **only from the name**, not the whole row; Star's ⋯ item says "Edit candidate"; Black Belt's Edit details sits inside the detail's ⋯, not as a button; **Color Belt private testing rows don't open at all** (so "Paid on" can't be seen on a tablet); **Prospects uses a side panel** with inline editing, not a dialog (approved in v0.236, but rule §6 / v0.46 says centered dialog); Staff accounts opens the ⋯ menu (recorded exception v0.76); Forms opens only from the name.
- **History in the detail:** Star (newest 5 + Show all), Prospects ("History · n changes"), Finance payment detail. **None** in Color Belt, Black Belt, Camps — rule §5 says every change is "visible in the record's history".
**Phase 7:** every list row opens the same way; one history block for every record.

### G7. Same person twice (duplicates)

Color Belt, Star, Camps and Black Belt already share one design (amber box + amber row tag + side-by-side Compare with "Keep this one" / "Not the same person — keep both") — but it is **4 separate copies** of the Compare dialog (`src/screens/testing/event/CompareDialog.jsx`, `src/screens/testing/star/candidates/StarCompareDialog.jsx`, `src/screens/camps/CompareDialog.jsx`, `src/blackBelt/staff/candidates/CompareDialog.jsx`), and the box is written 4 times too (inline in Color Belt's EventPage and Star's CandidatesTab, plus Camps' and Black Belt's own `DuplicateBox.jsx`; all four use the same `ev-dupbox` styles). Words: "registered twice" vs "signed up twice". Prospects: no duplicate check (v0.244).
**Phase 7:** keep the design, make it one shared component (owner: Main) so it can't drift.

### G8. Registration link and QR code

| Section | Opens from | Inside | Download QR | Flyer / sign |
|---|---|---|---|---|
| Color Belt | outline "Registration link" | 1 link, QR, Copy link | no | Print flyer |
| Star | outline "Registration link" | **2 school cards** | **no** | Print flyer per school |
| Black Belt | ⋯ "Registration links" | **2 school cards** | yes | **no** |
| Camps | **primary** "Registration link" (**icon only on phones**) | 1 link | yes | **no** |
| Forms | "**Share**" (`ti-share`) | link, QR, Print a sign, kiosk | yes | Print a sign |

Five copies of the QR maker (`src/lib/testing/qr.js`, `src/lib/camps/qr.js`, `src/lib/blackBelt/qr.js`, `src/lib/star/links.js`, `src/lib/forms/share.js`); each calls `qrcode-generator` itself.
**Phase 7:** one Registration link dialog (copy, QR download, print a flyer) for every section.

### G9. Opening and closing registration

| Section | Words | Icon |
|---|---|---|
| Color Belt, Star | Close registration / Open registration | none |
| Black Belt | Close registration / Open registration | **`ti-lock` / `ti-lock-open`** (the map gives them to Lock now / Reopen day) |
| Camps | **Close sign-up / Reopen sign-up** | none |
| Forms | **Close form / Open form again** | **`ti-door-exit` / `ti-door-enter`** (not in the map) |

**Phase 7:** one pair of words and one icon rule.

### G10. The five public sign-up pages (what families see)

| Page | Steps | Check page | Send button | Done page | Pay methods |
|---|---|---|---|---|---|
| Color Belt `/register/` | Details → Check and send | yes | Send registration | "<Name> is registered" | Cash, Check |
| Star `/star/` | Details → Check and send | yes | Send registration | "<Name> is registered" | Cash, Check |
| Black Belt `/black-belt/` | Details → Check and send | yes | Send registration | "<Name> is registered" | (at the desk) |
| Camps `/camp/` | Details → **Check and sign** | yes | **Sign up** | **"You're signed up"** | **Cash, Check, Card** |
| Forms `/f/` | **one step per page, Back / Next** | **no** | **Submit** | **"Thanks, <first>!"** | — |

Star also has a second "not open" page (`public/star-closed.html`) worded differently from its own form's. Each page is its own small app with **copied parts**: 4× StepDetails / StepCheck, 4× browser `turnstile.js` (Camps borrows Color Belt's; the server has 2 more), 3× SignaturePad, 5× public `parts.jsx`, and 5 hand-written logo `<img>` tags for the same `logo.png` (none uses the shared `Logo` component).
**Phase 7:** one family-form pattern (steps, words, done page, closed pages).

### G11. Count cards above a roster

| Section | Cards | Clicking a card |
|---|---|---|
| Color Belt event | Students · Paid · Not paid · Payments recorded | filters (first 3) |
| Color Belt private | Private testings · Paid · Not paid · Payments recorded | **does nothing** |
| Star | Candidates · Paid · Not paid · Payments recorded | filters |
| Black Belt | **Paid in full · Paying on schedule · Late · Not paid** | filters; **Not paid = `ti-circle-x`, on schedule = `ti-clock`** |
| Camps | **no cards** — one summary line ("9 of 15 here today · 5 to collect · $1,040") | — |
| Finance | Total · Cash · Check · Card | **scrolls**, doesn't filter |

**Phase 7:** one card set and one click behavior (rule §8 says a card opens the filtered list).

### G12. Dates and times

- **The shared date picker is used only by Star.** Every other date is the browser's own date box (Color Belt, Camps, Black Belt via its own wrapper, Finance, Prospects, Schedule, Calendar, Forms), and Camps adds its own month calendar for camp days. The browser box looks different on the front-desk PC, the iPad and a phone.
- **Times:** 6 different lists — Color Belt 5-min 6 AM–10 PM, Star 15-min 8 AM–8 PM, Black Belt 15-min 6 AM–10 PM, Camps 5-min 6 AM–9 PM, Schedule/Calendar browser time box, Finance 15-min 11 AM–11 PM.
**Phase 7:** one date picker and one time list everywhere.

### G13. Undo, toasts and errors

- **Edits saved with no Undo** (rule 1.4 says reversible changes get a 5-second Undo): Camps "Camp saved" / "Changes saved" / "Template saved", Black Belt "Changes saved", Color Belt private "Changes saved", "Payment saved" in Color Belt / Star / Camps, Prospects status change from the panel (the same change by dragging on the Board *does* have Undo), Forms Close / Open, Builder delete field.
- More with no Undo: Star's "Change how they'll pay" (Color Belt's and Camps' have one), Black Belt "Cycle added", Finance "Day reopened".
- **Restore:** Undo on Color Belt's event roster and in Camps. None on Color Belt's Private testing, in Star or in Black Belt.
- **Undo time limits:** toasts last 5 s and pause while the pointer is on them; the database lets staff undo for 10 s. Only Star's new "Mark as sent" caps its Undo at 9 s, so elsewhere a hovered toast can offer an Undo that then fails with "Too late to undo here…".
- **Check icon on toasts:** shown in Finance, Prospects, Forms and the account screens (the default); hidden in Testing, Star, Black Belt, Camps, Schedule, Calendar.
- **Errors that vanish after 5 seconds** (rule §3.5: errors never auto-close): Black Belt "Too late to undo here. Ask an admin.", "This candidate was deleted.", "This cycle was deleted."; Prospects "That prospect no longer exists."
- **Error banner wording:** three endings — ", then retry." / ", then try again." / " and try again." **No Retry** on Prospects and Forms save banners.
- **Error inside a dialog:** top banner (Black Belt) · note under the buttons (Color Belt, Star, Camps) · above the button (Finance).
- **Offline bar** (rule §3.5): **only Star grading has one.** Background refresh failures are silent (Camps, Color Belt live lists).
**Phase 7:** one Undo list, one error wording, one offline bar.

### G14. Empty lists

Rule §8 says one line + one action. Almost every section shows the line only (the header button stays). Color Belt Private testing shows a box **and a second "Add private testing" button** (two of the same primary button on one screen, against §1.1).

### G15. Page frame and navigation

- **Back links:** "← Testing" (shared), Black Belt's own "← Testing", "← Star testing", "← Color belt testing" (**shown even when the page is titled "Testing"** on the live site), "← Camps", "← Private testing", "← <event name>", Forms builder icon-only "Back to Forms", Finance "Back to the day" outline button.
- **"View only" line:** 4 wordings ("View only. Ask an admin to make changes." · "View only — ask an admin to make changes." · "View only — ask an admin to create or change forms." · "Ask an admin to add or change camps.").
- **"Both" schools:** Color Belt **blocks Both** ("Choose a school"); Star and Black Belt list both schools on Both, and on one school add "Showing Worcester candidates only · Show both schools" (the link switches the top bar to Both); Camps adds a School column; Prospects and Schedule split into two sections; Calendar uses W/S letters; Finance one box per school; Settings and Staff accounts ignore it. "Both schools" vs "Worcester and Shrewsbury".
- **Where a section's own settings live — 8 places:** Color Belt "Classes and ranks" tab, Star "Rubrics and prices" tab, Black Belt "Rubric and prices" tab (prices moved to each cycle), Camps inside Add camp + Templates, Finance "Settings" tab, Prospects ⋯ "Edit statuses", Calendar ⋯ "Event types", and Settings → Schools in the account menu.
**Phase 7:** one back-link rule, one "view only" line, one "Both" rule, one home for settings.

### G16. "Hide private details" (the mat-side switch)

- **Follows it:** Color Belt (money), Star (date of birth, email, money; since fix 1469327 also money banners, "Not saved" marks and money toasts; on Results, Email result is grayed and the CSV hidden), Black Belt (same, but says "Hidden on this **device**" instead of "this **tablet**"), Finance (leaves the rail).
- **Ignores it:** **Camps (amounts owed, Mark paid, payment lines)**, Prospects (parent phone and email), Calendar, Forms, Schedule, Staff accounts, Settings. Of these, only Camps and Prospects show anything v0.506 covers.
Rule v0.506 says it applies "on every screen". Each section reads the switch itself (`src/lib/privateDetails.js`, or Finance's old `usePaymentsHidden` in Black Belt); Camps never does.

### G17. Icons — one meaning, one icon (rule 2.3)

- **Same meaning, different icon:** Edit = `ti-edit`, but `ti-pencil` in Forms · Restore = no icon (Color Belt event, Camps) or `ti-arrow-back-up` (Star, Black Belt, Color Belt private — the Undo icon) · Not paid card = `ti-clock` (Color Belt, Star) or `ti-circle-x` (Black Belt) · came / didn't come = `ti-check`/`ti-x` (Camps roster) vs `ti-user-check`/`ti-user-x` (Prospects).
- **Same icon, different meaning:** `ti-repeat` = "Make-up" *and* "Change how they'll pay" (Star) · `ti-clock` = Schedule rail, Not paid card, and Black Belt's "Paying on schedule" · `ti-calendar-event` = Event, planned schedule, and Finance's "Today" · `ti-check` = Save, Mark paid, Paid card, came, Pass, "chosen" ticks in menus.
- **13 icons in use that aren't in the §2.4 map:** `ti-arrow-right`, `ti-arrows-horizontal`, `ti-award`, `ti-calendar-x`, `ti-camera`, `ti-circle-check`, `ti-currency-dollar-off`, `ti-door-enter`, `ti-door-exit`, `ti-note`, `ti-pencil`, `ti-repeat`, `ti-user-off`.
- **Icon-only buttons with no tooltip:** the page-header ⋯ in Calendar, Schedule and Prospects and about 12 more buttons in the new-students area use a plain `.icon-button` instead of the shared `IconButton` (rules 1.4, §4).

### G18. Money, names and words

- **Money:** "$65" (Testing, Camps, Black Belt) vs "$65.00" (Finance).
- **Method:** "Paying by" (before) / "Paid by" (after) / "Method" (Black Belt).
- **Name order:** Color Belt sorts by last name, Camps by first name; Prospects and Calendar show "Ava R.".
- **Unsaved changes** — the shared rule ("Unsaved changes. Save or cancel first.") holds almost everywhere, except: Change PIN / Change password (Esc loses typing), Forms New form and Fill in (a second Esc throws the typing away), Prospects Edit statuses (drops changes), Camps Save as template (no guard), Prospects small dialogs, Finance Close the day (keeps a draft instead — decided v0.800).

### G19. Shared code living in the wrong place

Not visible to the Grandmaster, but it is why designs drift:
- Section copies of shared parts: Black Belt `InnerDialog` (copy of `Dialog`), `DateField`, `SelectField`, `Choice`, `Grip`, `ConfirmDialog`; Calendar `ShowMenu` (copy of `RowMenu`); Star `PickerSheet`; Camps' Mark-paid popover; 5 public-page logos.
- Shared parts living in a section folder: `testing/events/ConfirmDeleteDialog` (used by Camps), `testing/DeleteDialog` (used by Star), `finance/usePaymentsHidden` (used by Black Belt), `testing/events/useLiveLoad` (the 15-second refresh, used by 4 sections outside Testing), `testing/events/ChoiceGroup` (Finance, Camps), the Testing drag grip; `Dialog`, `RowMenu` and `ErrorBanner` take their words from `src/screens/testing/text.js`; shared styles sit in `testing.css`, `finance.css`, `prospects.css`, `staff.css`.
**Phase 7 / owner Main:** a `src/components/` home for every shared pattern above (confirm, compare, registration link, signature, date field, payment dialogs, public-form parts).

### G20. New with Star Results and Camps weekly pricing (details: `Area-8-Delta-45a8b79.md`, N1–N14)

- **Results:** Star now has its own Results tab (result tag + reason, Email result, Mark as sent, Print results, CSV); Color Belt keeps Pass / Not passed / No show inside Grading, with no printed results, email or CSV; Black Belt results aren't built. Words differ ("Passed / Make-up / Not finished" vs "Pass / Not passed / No show").
- **CSV:** Star's results CSV is one click, no dialog; Finance's is an Export dialog with a date range — two separate CSV helpers.
- **Emailing a family:** Star copies a message, opens the mail app and asks "did you send it?"; Prospects has a plain email link that records nothing.
- **Editing a message text:** Star has a dialog with insert buttons, live checks and a preview; Forms has a plain text box in the builder — and Star's texts live in "Rubrics and prices", one more settings home.
- **Camps:** three different ways to pick a camper's days (family form by week, staff Edit details as one flat list, Add camp on a month calendar) and three ways to write a week ("Week 1 · Jul 6–10", "Week 1 · Oct 26 – 30", "Week of Jul 6").

**After the phase-1 cut-off (45a8b79):** `main` moved on to dbbacc2 — Star phase 7, the Home "Today" card (v0.515). It is inventoried at the start of phase 3.

---

## 4. Early warnings (to confirm in phases 3–5)

Ranked by what could hurt the school first. Each was found by an inventory agent and re-checked by the checker (see `Checker-report.md`).

1. **Black Belt payments are not in Finance — live today.** The Black Belt staff screens are in every build (no switch) and on the deployed site; staff can record a Black Belt payment (cash, check or card, dated today) at the desk. Finance's Daily report, Close the day, History and CSV export read only the Color Belt, private testing, Star and Camps payment tables (`supabase/migrations/0018_finance_private.sql:230-279, 722-735, 978-998`). So any Black Belt payment is missing from the day's totals and the drawer would look over. Whether a real one has been recorded yet can't be told from the code. Planned in v0.808 / v0.809; needs a Finance migration. **Owner: Finance.** (Also: `src/screens/finance/PaymentsList.jsx:33-37` would label an unknown source "Color belt testing"; the comment at `src/screens/Testing.jsx:305` still says "preview-only way in".)
2. **Camps ignores "Hide private details".** Amounts owed, Mark paid and payment lines stay visible on the mat-side tablet (rule §5, v0.506). No Camps file reads the switch. **Owner: Camps.**
3. **Only Black Belt prints a receipt.** Color Belt, Star and Camps payments have no receipt. Whether the desk hands out paper receipts today isn't written down anywhere — **question for Jeffrey** before calling it the receipt-book job.
4. **Four different ways to take a payment** (G1) and four different ways to fix one (G2).
5. **Errors that disappear after 5 seconds.** Black Belt shows every refusal of a quick action or a toast Undo as a toast ("Too late to undo here. Ask an admin.", "Only an admin can do that…", "This payment was already undone or changed.", "This candidate was deleted.", "This cycle was deleted.", and why Add candidate is grayed). Prospects shows "That prospect no longer exists." as a toast with a ✓. He will miss them.
6. **No offline warning outside Star grading.** Only Star's Grading tab says "You're offline". Color Belt grading still marks a failed tap "Not saved", shows a "Couldn't save N results" banner and retries. The shared 15-second background refresh now tracks failures, but **only the camp page shows it** ("Couldn't refresh the roster" bar + Retry + an "Updated 2:41 PM" time, `src/screens/camps/CampPage.jsx:822-835`). Every other live list — Color Belt, Star (including the new Results tab), Black Belt — stays silent, so a dropped connection shows only when someone tries to save.
7. **Withdraw is never red** although §7 says it must be (G3) — and for Black Belt that also breaks its own approved mockup.

## 5. Rulebook gaps found while making the inventory (for phase 7)

- §4 targets **WCAG 2.1 AA**; this review's brief asks for **2.2 AA** (adds: focus not hidden under sticky bars, a non-drag way for every drag, target size, consistent help, no re-typing the same info, sign-in without memory tests).
- §2.4 icon map: 13 icons missing, several meanings drifted (G17).
- §9 sections table is stale (Color Belt, Star, Camps, Finance, Black Belt statuses; no rows for Schedule, Calendar, Forms, Prospects).
- §1.3 says the phone bar is "4 + More"; it is 3 + More (v0.236).
- §3.2 top-bar search, §3.5 offline bar, §3.6 "shortcuts can be turned off in Settings" — none exist; each needs a decision (build, or drop the rule).

## 6. Work not on `main` yet (review after it merges)

Checked against `main` = 45a8b79 (2026-10-21, after the merges that happened during this phase):

| Branch | Ahead of main | What | Review after merge |
|---|---|---|---|
| `black-belt` | 2 commits | rubric editor build (CONTRACT-0024, migration 0024). Its rulebook rows v0.921–v0.935 and mockups are already on `main` | yes |
| `star-testing` | 1 commit | phase 7 Home "Today" mockups (v0.515). Phase 6 Results and the hide-switch fix are now on `main` (covered in Area-8) | yes, when built |
| `camps` | 0 | fully merged (weekly pricing, 60-day camps, migration 0022 live; covered in Area-8) | — |
| `claude/prospect-form-system-cd893d` | 2 commits | status-file updates only | no code |
| `color-belt`, `finance` | 0 | fully merged | — |

Decided but not built anywhere yet: Star's Home "Today" card (v0.154/v0.155, mockups on `star-testing`), Black Belt grading/results (B3–B5), Calendar showing testing events (v0.239), Finance reading Black Belt payments (v0.808/v0.809). Migration 0023 (Star result texts) is on `main` but not applied yet.
