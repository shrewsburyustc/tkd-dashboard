# Dashboard core, step 1 — the shared parts: plan

**Written:** 2026-10-27 (Dashboard core session, branch `dashboard-core`) · **Status:** draft for Jeffrey — nothing is built.
**Brief:** `docs/Design Review/End review/Prompts/1-DashboardCore-step1-shared-parts.md` · **Rulebook rows:** v1.000–v1.034 (v1.030 = this step) · **Change list:** §2.1, items M1–M11.

**In one line:** build each shared part once (screen parts in `src/components/`, helpers in `src/lib/`), prove it on a preview-only parts page, and change **nothing** anyone sees. Each section switches to the parts later, in its own prompt.

The code was re-surveyed on 2026-10-27, after Black Belt's grading and results merge. The brief's counts were from 2026-10-23/25. Five read-only search agents surveyed it; their key findings are below, with file and line references in the status file's log.

---

## 0. Two things for Jeffrey (one at a time) — both decided

1. ~~**Question — which "copies not on this list" join this step?**~~ **Decided 2026-10-27 (rulebook v1.100):** copies 1–3 join step 1 — a dialog on top of a dialog, one dropdown, the drag handle (§2b); 4–6 later (§8).
2. ~~**To confirm — how a minus is written.**~~ **Decided 2026-10-27 (rulebook v1.101), option A:** a real minus sign (−) before the dollar sign — "−$190" on screens, "−$190.00" where Finance shows cents — as Black Belt and Finance write it today. Camps' "$-335" (from Color Belt's helper) becomes "−$335" when Camps switches. The CSV file keeps plain numbers ("-190.00").

---

## 1. Ground rules for this step

- **Nothing on screen changes** (v1.030). No section's screen switches to a shared part here. A helper or a word may move to its shared place only when what shows stays exactly the same.
- **Main's own screens are this session's** — Staff accounts, Settings, the account dialogs, Home, `App.jsx`. They switch to the shared words, and `App.jsx` switches its `usePaymentsHidden` import, in this step. The values are the same, so nothing on screen changes.
- **Moves keep a re-export at the old path**, with a header comment (what + why), as `src/screens/finance/usePaymentsHidden.js` does. No other branch's imports break; each section switches its imports in its own prompt.
- **Preview mode only.** Use `npm run dev:preview-mode`. Never use `npm run dev`, `npm run preview` or `Start dashboard.bat` here: `.env.local` is in this worktree. `npm run build` only builds, so it is fine.
- **No database changes.** Where a part needs one later (history readers, time checks, a method in Mark paid), the plan says which section's prompt owns it. If one turns out to be needed here, stop and ask; migration numbers are reserved through the Main session.
- **Finance is being built at the same time** (F8, migration 0026): `src/styles/finance.css` and `src/screens/finance/format.js` are left alone. Every Finance file touched is listed (§6).
- **Words come from the sections.** A shared part draws; the section passes its own words (its noun, its questions, its error texts). The shared part holds only the shared words (§3, M11).

---

## 2. The parts with a look (M1–M8): one mockup each, Jeffrey OKs each

Every part is drawn at 1280×800, 820×1180 touch, 390×844 touch and 320×640 touch. The mockup HTML files and the review PNGs are in `docs/Dashboard Core/Mockups/`.

### M1 — Compare dialog and possible-duplicate box (v1.030; picture 19)

**Approved 2026-10-27 (rulebook v1.102):** both details as drawn — the visible "⚠ different" and "Keeping…".

**Today: four copies, one design.** Color Belt `screens/testing/event/CompareDialog.jsx`, Star `screens/testing/star/candidates/StarCompareDialog.jsx`, Camps `screens/camps/CompareDialog.jsx`, Black Belt `blackBelt/staff/candidates/CompareDialog.jsx`. They share the frame (Dialog `wide`, full screen on phones), the table (PC/tablet) and the phone cards, and the CSS (`.ev-cmp*`, `.ev-sum*`, testing-events.css). They differ in:
- words — the noun ("registered twice" / "signed up twice"), sub-line, rows;
- which rows are never highlighted;
- who may keep one (`canKeepOne`, Color Belt and Camps);
- how a difference is marked: hidden " (different)" text in three, a visible "⚠ different" in Black Belt;
- privacy — Camps has none; Black Belt says "Hidden on this device";
- Star's own loading of the two records;
- Black Belt's blocking note.

The box: `div.ev-dupbox` — inline in Color Belt (`EventPage.jsx:1686`) and Star (`CandidatesTab.jsx:1264`); `DuplicateBox.jsx` in Camps and Black Belt.

**Shared parts:** `src/components/CompareDialog.jsx` and `src/components/DuplicateBox.jsx`.
- **CompareDialog props:**
  - `title`, `sub`, `heads` (two column names), `rows` `[{ label, first, second, plain?, hidden? }]` (the section builds the rows, in its order);
  - `canKeepOne`, `note` (the gray line), `keepLabel(which)` (screen-reader name);
  - `loading` / `loadError` + `onRetry` (Star's records);
  - `busy` ('keep-first' | 'keep-second' | 'keep-both' | null), `failed` (amber text), `blockingNote` (Black Belt's "changed just now"), `hiddenText`;
  - `onKeep(index)`, `onKeepBoth()`, `onClose()`, `isPhone`.
- **DuplicateBox props:** `countText` ("1 possible duplicate"), `pairs` `[{ key, text, onReview(opener), reviewLabel, canReview }]`.

**States to draw:**
- the box with one pair and with two pairs (count on the first line only);
- the compare dialog on PC/tablet and the phone page;
- a difference highlighted;
- staff after the testing day (no Keep buttons, admin-only note);
- Hide private details on;
- while it works;
- a failure;
- Star's loading.

**Two details for Jeffrey's OK in the mockup:**
- (a) **Differences shown with words, not color alone** — Black Belt's small amber "⚠ different" next to each differing value, for everyone (rule §4: meaning never by color alone; three copies show amber only, with the word for screen readers only).
- (b) **While it works**, the pressed button grays and says "Keeping…" ("Keeping both…"), and the others gray too — the confirm boxes' rule (D1a). Esc, a click outside and Back wait, so the phone's back arrow grays too. Today the buttons don't change.

**The buttons and any note under them share the dialog's bottom area** (`.dialog-footer`, v0.81). Today the four copies put the note after a pinned button row, whose −24 px bottom margin hides the top of a failure note (§10).

**Later, in each section's prompt:** use the part with its own words. Camps gains Hide private details; Star's count line stops repeating on every line. Prospects has no duplicate check, by decision (v0.244).

### M2 — the shared "are you sure?" box (v1.008, D1a–D1d, D10a; §2.1 exception; §7; §8)

**Approved 2026-10-27 (rulebook v1.103):** all three details as drawn — "Keep …" grays too while it works, stacking measured from the usual words, never the pinned button row.

**Today:** 39 asks drawn in 20 files, on four frames:
- `screens/testing/DeleteDialog.jsx` (2 users);
- `testing/events/ConfirmDeleteDialog.jsx` (6 users, incl. Camps);
- Black Belt `parts/ConfirmDialog.jsx` (3);
- Star's `ConfirmBox` in `candidates/dialogParts.jsx` (2);
- plus hand-written boxes: Color Belt's Cancel private testing and leave warnings, Star's delete event and leave warning, Black Belt's Discard / Undo payment / Remove / Dan change, Prospects' delete / delete status / Came, Forms' delete form and kiosk asks, Calendar's delete type, Schedule's delete schedule.

The full list, with the words, focus and busy behaviour of each, is in §9.

**What the survey found:**
- In most boxes nothing visible changes while they work. The button is only marked for screen readers, because the gray look keys on a class.
- Nine boxes close on Esc / Back while they work.
- Color Belt's Cancel private testing uses native `disabled` (keyboard focus falls out).
- Prospects' Delete status gets no first focus.
- Confirm boxes under 700 px tall pick up the form dialogs' pinned button row (testing.css:823 overrides :810).
- Two boxes open on top of another dialog with `Dialog.jsx` (Star's Dan change, Prospects' delete on phones). One Back press then reaches both (see §8, InnerDialog).

**Shared part:** `src/components/ConfirmBox.jsx`, plus `ConfirmButtons` (the button row alone, for an ask drawn inside another dialog, like Forms' kiosk asks in its Share dialog).

**Props:**
- `title`, `children` (the sentence and any gray hint);
- `keepLabel` ("Keep …" / "Stay …") and `actionLabel` (the pressed words);
- `actionIcon` (optional, e.g. trash);
- `busyLabel` (verb + "ing…");
- `loses`: 'forGood' | 'something' | 'nothing'. forGood → red action and first focus on Keep; something → blue, focus on Keep; nothing → blue, focus on the action;
- `failed` (amber text under the buttons);
- `onKeep()`, `onConfirm()` (may return a promise; the box shows the busy state until it settles), `onTop` (see §8).

**Behaviour:**
- The button that changes nothing is on the left; the action is on the right.
- **While it works:**
  - the pressed button grays with its busy words, and "Keep …" grays too (a new unavailable look for a plain `.btn`, the same gray as `.btn-primary.is-unavailable`);
  - both stay focusable (`aria-disabled`, never `disabled`);
  - Esc, a click outside and Back wait.
- The buttons stack full width, in order, when they don't fit side by side (measured, not by screen size). The decision is made from the buttons' usual words, so the shorter busy words ("Deleting…") never move a stacked pair back into a row.
- **Never the pinned button row,** at any height (fixes the accidental one under 700 px; a detail for the mockup OK).
- **Always a first focus** (fixes Prospects' Delete status when it switches).
- `role="alertdialog"`; never full screen (Dialog.jsx already keeps confirmations off full screen).

**DeleteDialog** moves as it is (M10): its two users keep "Cancel" / "Delete" until each switches to ConfirmBox in its own prompt, and then `DeleteDialog` goes.

**States to draw:**
- loses something for good;
- while it works;
- failed;
- loses something (Undo payment);
- loses nothing (Came);
- a leave warning;
- Black Belt's Discard;
- the small-phone stack (shown at 320 for the long pairs).

Mockup drafted: `Mockups/M2-confirm-box.html`.

### M3 — the Mark paid box (v1.001; picture 03)

**Approved 2026-10-27 (rulebook v1.104):** both details as drawn — "Mark paid $X" has the first focus; with no choice on record nothing is preset and the button waits for one.

**Today:**
- **Color Belt:** one click; it records the row's "Paying by"; no method is sent (`testing_mark_paid`).
- **Camps:** a small box under the "$X due" tag (`PaymentPopover`, `CampRoster.jsx:80`, `.cp-popover`, camps.css:447). The same box on phones.
- **Star:** a Record payment dialog with Paid by, Amount and Date paid.
- **Black Belt:** its own dialog with "For", Amount and "Method". It keeps it (v1.001), with the word "Paid by".

**Shared part:** `src/components/MarkPaidBox.jsx`. It is Camps' small box under the button, everywhere, with `PaidByField` (label + Cash/Check/Card choice + hint) exported for Black Belt's dialog.

**Props:**
- `anchor` (the button it opens from), `name`, `amountCents` (shown, never typed);
- `familyChoice` ('cash' | 'check' | 'card' | null) and `choiceWhere` ('form' | 'desk' → "They chose Check on the form." / "… at the desk.");
- `onMarkPaid(method)`, `onClose(restoreFocus)`.

**Behaviour:**
- The box only gives the section the chosen method. The section saves, shows its toast and handles a failure, as today.
- It opens under whatever the section's opener is: Color Belt's and Star's "Mark paid" button, Camps' "$X due" / "Owes $X" tag (as today, v1.001).
- "Mark paid $X" has the first focus: nothing is lost, so Enter does the usual thing. Its screen-reader name includes the method ("Mark paid $50 by check").
- With no choice on record, nothing is preset, the first focus goes on Cash, and the button is gray with "Choose how they paid."
- Esc or a click outside closes the box. It sits under the button and is kept on screen.

**Later:**
- Whether a section's database function takes a method is that section's job: Color Belt records "the family's choice" today, so it needs `p_method` (a migration in Color Belt's prompt), and so do Camps (`camp_mark_paid`) and Star.
- Black Belt keeps its own dialog with "Paid by".

**States to draw:**
- as it opens;
- another method;
- cents and what is still owed;
- no choice on record;
- the phone placement.

Mockup drafted: `Mockups/M3-mark-paid-box.html`.

### M4 — Print receipt (v1.002; pictures 03b)

**Approved 2026-10-27 (rulebook v1.105):** both details as drawn — Print grays while the receipt loads or can't load; with Hide private details on, one gray line "Payment details are hidden on this tablet." and no Print.

**Today:** only Black Belt has one (`blackBelt/staff/receipt/`: ReceiptDialog, ReceiptPage, receipt.css; v0.220).
- It loads through `bb_receipt`.
- The school name is written in the code. The two schools' streets and phones come from the database (`locations`). "Printed … by …" uses the database's actor name.
- It prints by drawing the page into `<body>`, then `window.print()`; letter size.

**Shared part:** `src/components/Receipt.jsx` (`ReceiptDialog` + `ReceiptSheet` + the print page), styles moved from `receipt.css` into a shared stylesheet (renamed from `bbr-` to a neutral prefix; Black Belt's file keeps its own until BB switches).

**Plain data shape** (any section can fill it):

```js
{
  kindLine,              // 'Color belt testing · payment receipt'
  facts: [[label, value], …],   // Student / Event / School …
  lines: [{ date, forText, how, amountCents }],   // negative = refund, returned check
  totalDueCents, paidCents, balanceNote,   // balanceNote e.g. 'next due May 29'
  schools: [{ name, street, phone }],
  printedOn, printedByName,
}
```

**Dialog props:**
- `receipt` (null while loading), `loadError` + `onRetry`, `notFound`;
- `hidden` (Hide private details → "Payment details are hidden on this tablet.", no Print);
- while it loads or after a failed load ("Couldn't load the receipt. Check the connection, then try again." with Retry), Print shows in the gray unavailable look;
- `onClose`, `isPhone`, `onTop` (Black Belt opens it from the candidate detail).

**Words kept from Black Belt:**
- "Receipt"
- "Print or save as PDF"
- "Total due", "Paid to date", "Balance"
- "$0 · paid in full" / "−$50 · overpaid"
- "Printed Oct 22, 2026 by Jeffrey Berg. Fees are non-refundable."

**Later:** each section adds the ⋯ item and the detail button (Color Belt, Star, Camps), and feeds the shape from its data. Where a section has no address reader, its prompt adds one (Black Belt's comes from `bb_receipt`).

**States to draw:**
- paid in full;
- a balance;
- several payments with a refund;
- loading;
- failed;
- hidden;
- the phone page;
- the printed page.

### M5 — the Registration link box (v1.015; picture 12)

**Approved 2026-10-27 (rulebook v1.106):** both details as drawn — a failure shows inside the box; Download QR code saves a 1024-pixel PNG named "[event] - [school] QR code.png".

**Today: four copies** — Color Belt `event/RegistrationLinkDialog.jsx`, Star `event/StarLinksDialog.jsx`, Camps `CampLinkDialog.jsx`, Black Belt `cycle/LinksDialog.jsx`.
- The QR code is made the same way in all four (qrcode-generator), drawn 128 px.
- Copy link → "Link copied" in all four.
- Download QR code exists only in Camps (a 1024 px PNG) and Black Belt (about 450 px), with different file names.
- Print flyer exists only in Color Belt and Star (each prints its own flyer).
- Copy failures show in a bar on the page in three of them, and inside the box in Star.

**Shared part:** `src/components/RegistrationLinkBox.jsx` and one shared QR helper, `src/lib/qr.js` (the four copies' `qrSvgDataUrl` plus the Download PNG). Forms keeps its own Share dialog (it also holds kiosk mode, v1.015).

**Props:**
- `title` ("Registration link" / "Registration links"), `eventName`, `intro` (the section's line);
- `links` `[{ school, url, shortUrl, copyLabel, flyer?: () => element }]` (one or two);
- `fileBase` (for the PNG name), `footnote` (Black Belt's ?dan= line);
- `onCopied` (the section's "Link copied" toast), `onClose`, `isPhone`.

**Behaviour:**
- Copy link has the first focus.
- **A failed copy or download shows its amber note inside the box**, under the cards — a detail for the mockup OK: today three sections use a bar behind the box. The two sentences are shared words: "Couldn't copy the link. Select the link and copy it yourself." (Star's) and "Couldn't make the QR code picture. Try again." (Black Belt's).
- Download QR code saves a 1024 px PNG (big enough to print; Camps' size today), named with a plain hyphen like Black Belt's: "November Children Testing - Worcester QR code.png" — a detail for the mockup OK. With two schools its screen-reader name says the school ("Download Worcester QR code").
- A section's own line under the cards (Black Belt's `?dan=` hint) keeps its code format.
- Close on PC/tablet; full screen with the back arrow on phones.

**States to draw:**
- one link with a flyer;
- two links;
- no flyer (Camps);
- two links without a flyer, with Black Belt's own line;
- a failure.

Mockup drafted: `Mockups/M5-registration-link.html`.

### M6 — count cards (v1.013, v1.014; §8 Metric cards; pictures 11, 11b)

**Approved 2026-10-27 (rulebook v1.107):** as drawn, with Black Belt's phones getting the 2×2 cards instead of the pills (changes v0.219).

**Today:**
- **Color Belt event** (`EventPage.jsx:1641`): Students clears the filter, Paid / Not paid filter with `aria-pressed`, and Payments recorded is a plain total.
- **Color Belt private testing:** the same cards, none tappable (drift — Color Belt's prompt).
- **Star:** all four tappable, including Payments recorded (against v1.013); a dark selected border, not blue; 14 px icons.
- **Black Belt** (`SummaryCards.jsx`): four plan cards that all filter. On phones it shows **two pills, "Late 2" and "Not paid 1"**, not cards (v0.219).
- **Camps:** a summary line (Camps' prompt makes it cards, v1.014).
- **Finance's report cards** stay as they are (v1.013).

**Shared part:** `src/components/CountCards.jsx` (the classes `.ev-cards`, `.ev-card*`, `.ev-filter-line` move to the shared stylesheet).

**Props:**
- `cards` `[{ key, Icon, label, value, note?, kind: 'all' | 'filter' | 'total' }]`;
- `selected`, `onSelect(key | null)`;
- `showingText` (the section's "Showing not paid only"), `showAllLabel`;
- `note` — one optional gray line under the row (Black Belt's "The possible duplicate row isn't counted in the cards until it's resolved.").

**Behaviour:**
- A filter card is a button with `aria-pressed`; 'all' shows everyone; a total is never a button.
- The selected card has the blue edge.
- Two by two on phones.
- One card alone with Hide private details on, when the section passes only the first; no row at all when it passes none (Black Belt hides its row today).

**A detail for Jeffrey's OK (drawn in the mockup, state 6):** Black Belt's phone pills, "Late 2 · Not paid 1" (v0.219). With the shared row, Black Belt's phones get the same 2×2 cards as every roster ("the same look and tap behaviour", v1.013), and the row records that it changes v0.219. The alternative is a pill mode in the shared part — a second look to keep.

**States to draw:**
- as it opens;
- a card tapped;
- Camps' four with a small line;
- Black Belt's four;
- Hide private details.

Mockup drafted: `Mockups/M6-count-cards.html`.

### M7 — the history line and list (v1.010; picture 09b)

**Approved 2026-10-27 (rulebook v1.108):** both details as drawn, dates only ("Oct 22 · Jeffrey Berg") — the arrow points right while closed and down while open; "Loading…", the amber bar with Retry, and "History · no changes yet".

**Today:**
- **Prospects** (`ProspectPanel.jsx:379`): a "History · N changes" button opens the list in place.
  - It reads `prospect_activity` through `prospects_get`, not `change_log`.
  - It shows the date only ("Oct 20 · Dana Ross"), taken in UTC — a small Prospects bug.
- **Star** (`CandidateHistory.jsx`): the newest 5 + "Show all (n)".
  - It reads `star_candidate_history` (0006), date and time in Massachusetts time.
  - With Hide private details on it leaves out payment rows and adds "Payment history is hidden on this tablet.".
  - It says only "Changed" for result-email rows, and also hides the Registered row while hidden.
  - A failed load shows "No changes recorded yet." (Star's prompt).

**Shared part:** `src/components/HistoryLine.jsx`, copying the approved drawing (09j / 09k).
- A row at the end of the summary: "History · 3 changes ›".
- A tap opens the list in place, newest first: what changed, then "Oct 22 · Jeffrey Berg" (Massachusetts time).

**Props:**
- `load()` — the section's reader; it returns rows;
- `describe(row, { hidden })` — the section's words; returns `{ text }`, `{ hiddenPayment: true }` or null to skip;
- `hidden`;
- the words for the hidden line come from the shared privacy words.

**States:**
- loading — "History" with a gray line while it reads;
- closed with the count;
- open;
- empty — the line stays as plain text, "History · no changes yet", with nothing to open;
- couldn't load — the shared amber bar with Retry, "Couldn't load the history. Check the connection, then try again." (problems stay on screen, v1.004);
- hidden — payment rows left out, one gray line says so.

**For the row when it's OK'd:** the line's chevron is › when closed and ⌄ when open (v1.010's "History · N changes ›"). The icon map gives › to "go to a page" and ⌄ / ⌃ to expand / collapse, so the row records this one use.

**Later:**
- Color Belt, Camps and Black Belt each need a database function that reads their `change_log` rows (RLS on, no grants), with a security review — **their prompts**.
- Star switches its block to the line.
- Prospects keeps its own (v1.010).

### M8 — the time list (v1.019; picture 14b)

**Approved 2026-10-27 (rulebook v1.109):** both details as drawn — the blue focus ring on the row the arrow keys are on; typing a number jumps to that hour.

**Today:**
- **Star:** `StarSelect.jsx` — a custom list, 8 AM–8 PM, 15 minutes; it opens with the chosen time in the middle.
- **Black Belt:** `SelectField.jsx` — custom, 6 AM–10 PM, 15 minutes; it opens at the nearest edge.
- **Color Belt** (classes and private testing): the browser's own lists, 6 AM–10 PM, 5 minutes.
- **Camps:** the browser's own list, 6 AM–9 PM, 5 minutes.
- **Finance:** the browser's own list, Off + 11 AM–11 PM, 15 minutes.
- **Schedule and Calendar:** the browser's time box.

**Shared parts:**
- `src/components/Select.jsx` — Star's `StarSelect` made shared, the accessible "select-only combobox" pattern: one Tab stop, ↑ ↓ Home End Page keys, type a letter to jump, Esc closes the list only.
- `src/components/TimeList.jsx` — that Select with times.

**TimeList props:**
- `value` ('HH:MM' or null), `onChange`;
- `from` / `to` / `step` (default 06:00–22:00, 5 min);
- `offLabel` (Finance's "Off");
- `placeholder`, `labelId`, `describedBy`, `invalid`, `readOnly`, `autoFocus`.

**Behaviour:**
- Every label has AM/PM ("4:40 PM").
- The list opens with the chosen time in the middle.
- A saved time that isn't on the list is still shown (added in its place), as Color Belt does.
- **Every 5 minutes everywhere, Finance included** (v1.019; the v0.207 row: "5-minute steps, 11 AM–11 PM and Off kept"). Finance's prompt widens its database check, which accepts 15-minute steps today.
- **The row the arrow keys are on gets the 2 px blue focus ring** (rule §4). Today's dropdowns mark it with a faint gray only, so this is new — for the shared list only, and today's dropdowns keep their look until they switch (a detail for the mockup OK).
- Typing a number jumps to that hour ("6" → 6:00 AM; "6" again → 6:00 PM).

**The database checks differ** — each section's prompt handles its own switch, with a migration where needed:
- `star_start_time_is_valid` (0006): 8–20, 15 minutes;
- `bb_time_is_valid` (0016): 6–22, 15 minutes;
- `finance_reminder_time_is_valid` (0011): 11–23, 15 minutes;
- `testing_private_time_is_valid` (0014): 6–22, 5 minutes;
- schedule / calendar: 5 minutes;
- Color Belt class times and camps: no range.

Black Belt's `SelectField` then has a shared part to switch to (see §8).

**States to draw:**
- closed;
- open at the chosen time;
- keyboard;
- empty;
- Finance's Off;
- read-only;
- with an error;
- phone.

## 2b. The three parts added by Q1 (rulebook v1.100)

None of them changes a look, so they have no mockup of their own. The dropdown is drawn in M8, and the other two are moved or extended as they are.

### A dialog on top of a dialog — `Dialog.jsx` gets an "on top" mode

**Today:**
- Every `Dialog.jsx` adds its own browser-history step and its own Back listener.
- With two open at once, the second replaces the first's step, and one Back press reaches both. This already happens with Star's Dan-change box and Prospects' Delete on phones.
- Black Belt avoids it with its own copy, `InnerDialog` (8 dialogs), which has no history code.

**Shared:**
- The prop `onTop` on `Dialog.jsx`, and so on ConfirmBox, the receipt and the others.
- An "on top" dialog adds no history step. It registers as the top layer in `src/lib/backButton.js`, and the bottom dialog's Back listener gives Back to the top layer first.
- Esc and a click outside reach only the top one.
- A z-index class for the top layer goes in shared.css (Black Belt's `.bb-inner` uses 42).
- Focus returns to the dialog underneath when the top one closes.

**Nothing changes for today's dialogs:** the mode is off unless a screen asks for it. Black Belt's 8 `InnerDialog` users, Star's Dan-change box and Prospects' phone Delete switch in their own prompts.

### One dropdown — `src/components/Select.jsx`

- Star's `StarSelect` (the more complete copy: the chosen option in the middle when it opens, a list that stays in the page for screen readers) made shared, with the same props: `id`, `labelId`, `describedBy`, `value`, `options [{ value, label }]`, `placeholder`, `onChange`, `invalid`, `readOnly`, `autoFocus`.
- The `.fa-*` look stays, plus M8's new 2 px ring on the row the arrow keys are on. That ring is scoped to the shared Select, so today's three dropdowns keep their look until they switch.
- M8's `TimeList` is this Select with time options.
- **Not changed now:** Star's `StarSelect` and Color Belt's `FinalAwardSelect` stay as they are (re-exporting them would change their look). Black Belt's `SelectField` switches in its prompt (BB15).

### The drag handle — `src/components/Grip.jsx`

- Color Belt's `Grip` (`screens/testing/RankRows.jsx:79`) moves as it is, gaining Black Belt's grayed form (`disabled`).
- `RankRows.jsx` keeps `export { Grip }` as a one-line re-export. Calendar, Forms and Prospects import it from there today, and their imports keep working.
- The tooltip word "Drag to reorder" goes into the shared words; testing/text.js re-exports it.
- **Later:** Star's private copy (`star/DanBlock.jsx`) and Black Belt's `parts/Grip.jsx` switch in their prompts.

---

## 3. The parts with no look (M9–M11): no mockup — nothing on screen

### M9 — one money helper (v1.026; picture 17a)

**The rule:** on screens "$65", with cents only when there are some ("$290.50", "$1,120"); in Finance's report, print and export always cents ("$65.00"); a minus is "−$190" / "−$190.00", a real minus sign (U+2212) before the dollar sign (v1.101). Finance's CSV keeps plain numbers ("-190.00", `src/lib/finance/csv.js`); it is not screen text and is not touched.

**Shared:** `src/lib/money.js` (already the shared money file) gains `formatMoney(cents)` and `formatMoneyWithCents(cents)`. Whole cents only; anything else gives ''.

Checks go in a new `src/lib/shared/checks.mjs`, in the repo's pattern (`src/lib/<area>/checks.mjs`, run with `node`). For money they use the brief's examples:

| Cents | `formatMoney` | `formatMoneyWithCents` |
|---|---|---|
| 6500 | "$65" | — |
| 29050 | "$290.50" | — |
| 112000 | "$1,120" | — |
| −19000 | "−$190" | "−$190.00" |
| 3250 | "$32.50" | — |
| 0 | "$0" | — |
| null | '' | — |

The same file also checks the time list's choices (M8: 6:00 AM–10:00 PM every 5 minutes = 193; Finance's Off + 11 AM–11 PM every 5 minutes = 146; labels with AM/PM; a saved time not on the list kept) and the QR helper (M5).

**The five old helpers, compared with it** (outputs checked by running their code):

| Helper | File | Gets | Same as the shared one? | Step 1 |
|---|---|---|---|---|
| `formatCents` (Black Belt) | `src/lib/blackBelt/money.js:91` | any whole cents, negatives | **yes, for every whole number** ("−$290", "$290.50", "$2,700"; '' for non-whole) | **thin wrapper** (only its body changes) |
| `money` (Finance) | `src/screens/finance/format.js:17` | any cents, negatives | yes (the always-cents form) | **left alone** — Finance is being built now; Finance's prompt makes it a wrapper |
| `dollars` (Star) | `src/lib/star/candidatesText.js:15` | fees and payments the desk types in whole dollars; the database allows cents, and the code's comment expects them | no — 14050 → "$140.5" | stays; Star's switch fixes it |
| `dollars` (Color Belt) | `src/screens/testing/text.js:341` | whole dollars, and **negatives from Camps' reversed payments** | no — −33500 → "$-335" | stays; Camps' switch fixes it |
| `formatDollars` | `src/lib/money.js:14` | whole-dollar prices; one preview reads typed text (Black Belt's prices, "12.5" → "$13") | no — it rounds | stays |

### M10 — move the misplaced helpers (v1.030)

| Helper | Importers (today) | New home | Old path keeps |
|---|---|---|---|
| `screens/testing/events/useLiveLoad.js` (the 15-second refresh; needs only React) | 21 — Color Belt 4, Star 2, Black Belt 9, Camps 3, Finance 3 | `src/lib/useLiveLoad.js` | a one-line re-export |
| `screens/testing/events/ChoiceGroup.jsx` | 25 — Color Belt 8, Star 6, Black Belt 2, Camps 7, Finance 2 | `src/components/ChoiceGroup.jsx` | a one-line re-export |
| `screens/testing/DeleteDialog.jsx` (as it is, see M2) | 2 — Color Belt classes and ranks, Star categories | `src/components/DeleteDialog.jsx` | a one-line re-export |
| `screens/finance/usePaymentsHidden.js` | already a re-export of `lib/privateDetails.js` | — | `App.jsx` imports `usePrivateDetailsHidden` directly; Black Belt's four imports switch in its prompt |

ChoiceGroup's own styles (`.ev-segmented`, `.ev-chips`, `.ev-chip`) live in testing-events.css. Only Testing and Camps load that file, so they move to the shared stylesheet (M11).

### M11 — shared words and styles (v1.030)

**Words:** a new `src/components/text.js` ("the shared parts' words").
- **From testing/text.js:** `BACK` 'Back' (Dialog), `CANCEL` 'Cancel' (RowMenu), `RETRY` 'Retry' and `DISMISS` 'Dismiss' (ErrorBanner). testing/text.js re-exports them, so its many importers (and Camps' `CB.*` re-exports) keep working.
- **Also the new parts' own words:** "Keep this one", "Not the same person — keep both", "Close", "Copy link", "Download QR code", "Print flyer", "Paid by", "Mark paid", "Show all", "History", "Print or save as PDF", "Fees are non-refundable."
- **Main's screens switch** (same values, nothing on screen changes):
  - `screens/staff/text.js` (Back, Cancel) and `screens/settings/text.js` (Cancel) re-export the shared words;
  - `components/AccountDialog.jsx` ("Back"), `screens/ChangePinDialog.jsx` ("Back", "Cancel"), `screens/ChangePasswordDialog.jsx` ("Cancel") and `screens/SetPinScreen.jsx` ("Back") use them instead of typing them;
  - Home, App and AccountMenu have none.
- **Not touched:** the public pages' "Try again" (separate pages); each section's own STALE / UNDO_FAILED sentences (they differ; each section's prompt).

**Styles:** a new `src/styles/shared.css`, loaded from `src/main.jsx` in testing.css's slot, right after `app.css`. CSS has no re-exports, so the class names stay.

What the CSS survey found:
- The shared components take most of their look from **testing.css** (Dialog, RowMenu, IconButton, ErrorBanner, Grip, ChoiceGroup's segments, the `.fa-*` dropdown). testing.css loads third (`main.jsx:9`), so nothing breaks today; the risk is only order.
- Load order in dev: tokens, app, testing, staff, schedule, calendar, forms, prospects (main.jsx), then rail-menu, testing-private, chooser, testing-events, camps, finance, settings (through App's imports), then the lazy Black Belt, Star and kiosk sheets.
- **The real build orders them differently:** `forms.css` goes into a chunk shared with the public forms page and loads **before** app.css. That already makes two Forms fields look different on the live site than in the preview (§10).

What moves (whole blocks, in their order; combined selectors split first):

| From | What | Why shared |
|---|---|---|
| testing.css | page head (`.phead`, `.ptitle`, `.psub`, `.viewonly`), tabs (`.ttabs`), the amber bar (`.errbar*`), the icon button and its tooltip (`.tib*`), the grip (`.grip*`), `.btn-sm`, `.btn-primary.is-unavailable`, `.btn-delete`, `.note-action`, tags (`.ttag*`), list rows (`.clist`, `.acts`, `.rrow`, `.prow`, `.l1`, `.l2`), empty and loading (`.tempty`, `.tskeleton*`), the ⋯ menu and phone sheet (`.tmenu*`, `.tsheet*`), the dialog family (`.tdialog*`, pinned footer, `.tdialog-sub`, `.tdialog-note`), `.field-label`, `.money*`, `.cbrow` / `.cb`, `.tmeta`, `.segmented` / `.segment`, the dropdown (`.fa-*`) | used by every section and by `src/components/` |
| testing-events.css | `.ttag--ok`, ChoiceGroup's `.ev-segmented` / `.ev-chips`, the tab button reset, the menu's two-line items (`.ev-noicon`, `.ev-menu-two`, `.ev-menu-reason`), and the classes the new parts use (`.ev-cards*`, `.ev-filter-line`, `.ev-dupbox*`, `.ev-cmp*`, `.ev-sum*`, `.ev-link-*`) | Camps, Star and Black Belt use them; only Testing and Camps load the file |
| calendar.css | `.btn-delete.is-unavailable` | the red button's gray look, used by Black Belt, Forms, Prospects (M2 needs it) |
| staff.css | `.menu-group-label` | the account menu's "Admin" label (Main) |
| prospects.css | `.rail-icon, .bottombar-icon`, `.nav-badge` | the rail's and bottom bar's badge (Main) |
| **new** | `.btn.is-unavailable` (M2), and the new parts' own few classes | — |

What stays:
- the section-only styles;
- the classes one owner shares between its own screens (Calendar ↔ Schedule ↔ Forms ↔ Prospects, all the new-students session's);
- **finance.css untouched** — the three Main blocks in it (`.fin-menu-switch` in the account menu, `.fin-hidden-chip` in the top bar, `.fin-home-lines` on Home) move in step 2, which changes those screens anyway (M12, M17), after Finance's F8 merge.

The checks:
- shared.css is imported **only** from `main.jsx` (an import from another page's code would let the build move it ahead of app.css, as happened to forms.css).
- Every moved rule is checked against the rules that load between its old and new place. Where a later sheet overrides it with the same specificity (12 cases listed by the survey, e.g. `.ttag--ok` over `.ttag`, Black Belt's tooltip blue over `.tib:hover`), the order inside shared.css keeps that override.
- The before / after shots are compared in the preview dev server **and** in a preview-mode build served as plain files (it orders CSS like the live site). `npm run preview` is never used.

---

## 4. The parts page (proof)

- A root page, **`parts.html`**, with `src/parts/PartsPage.jsx`. It is **not** in `vite.config.js`'s build inputs, so the build never includes it. The dev server still serves it, as it serves `star.html` while that switch is off. Not in `public/`.
- It shows every part in every state with sample data and makes **no database calls**. It also refuses to draw outside preview mode ("Open this page with npm run dev:preview-mode").
- After `npm run build`, `dist/` is searched for the page's words: nothing may be found.
- The design reviewer checks the built parts here against the approved mockups at the four sizes.

## 5. Proving nothing changed

- **Before any app file changes:**
  - shots at the four sizes of a roster (Color Belt event, Students), a confirm box (Delete permanently), Finance's Daily report, Staff accounts, Camps' roster and the Calendar (whose styles M11 may touch);
  - all 18 check files, recorded on 2026-10-27: all pass (Forms' after `npm run build`).
- **After:** the same shots, compared; the check files again, plus the new `src/lib/shared/checks.mjs`; `npm run build` and `npm run build:preview-mode` pass.

## 6. Files touched

**New:**
- `src/components/` — `CompareDialog.jsx`, `DuplicateBox.jsx`, `ConfirmBox.jsx`, `MarkPaidBox.jsx`, `Receipt.jsx`, `RegistrationLinkBox.jsx`, `CountCards.jsx`, `HistoryLine.jsx`, `Select.jsx`, `TimeList.jsx`, `Grip.jsx` (moved, v1.100), `ChoiceGroup.jsx` (moved), `DeleteDialog.jsx` (moved), `text.js`;
- `src/lib/` — `useLiveLoad.js` (moved), `qr.js`, `times.js`, `shared/checks.mjs`;
- `src/styles/shared.css`, `parts.html`, `src/parts/`.

**Changed:**
- `src/lib/money.js` (two new functions);
- `src/lib/blackBelt/money.js` (`formatCents`'s body only — a Black Belt file);
- the three old helper paths (now re-exports): `screens/testing/events/useLiveLoad.js`, `screens/testing/events/ChoiceGroup.jsx`, `screens/testing/DeleteDialog.jsx`;
- `screens/testing/text.js` (re-exports the shared words);
- `components/Dialog.jsx`, `RowMenu.jsx`, `ErrorBanner.jsx` (words from the shared file; `Dialog.jsx` also gets the "on top" mode, v1.100, with `src/lib/backButton.js`);
- `screens/testing/RankRows.jsx` (its `Grip` becomes a re-export of the shared one — a Color Belt file);
- Main's screens: `screens/staff/text.js`, `screens/settings/text.js`, `components/AccountDialog.jsx`, `screens/ChangePinDialog.jsx`, `screens/ChangePasswordDialog.jsx`, `screens/SetPinScreen.jsx`;
- `src/main.jsx` (loads shared.css);
- the section stylesheets the moved rules come from;
- **no Finance file** — `finance.css` and `format.js` are left alone.

**Shared files (CLAUDE.md's list) touched:** `src/App.jsx` (the `usePaymentsHidden` import), the rulebook (rows from block 1.100–1.199). Not touched: `README.md`, `docs/README.md`, `navItems.js`, `mockClient.js`, `tokens.css`, `Testing.jsx`.

## 7. Reviews and commits

- **Mockups:** a separate design reviewer checks them against the rulebook rows and the pictures before Jeffrey sees them. Jeffrey OKs them **one part at a time**. Each OK becomes a 10b row and a changelog line from block 1.100–1.199 (`git merge main` first, CRLF kept).
- **Built parts:** a separate design reviewer, at the four sizes against the approved mockups, and a separate code reviewer (the parts and the moves). No security review is needed: no database change.
- **Commits** on `dashboard-core` after each reviewed step, with the commands explained. Never pushed. The Main session merges when Jeffrey asks.

## 8. Copies not on this list — the question for Jeffrey

**Answered 2026-10-27 (v1.100):** 1–3 join step 1 (§2b), as recommended; Calendar's Show menu, the family-page headers and the Star ↔ Black Belt grading copies wait.

| Copy | Today | What a shared part needs | Size | Recommendation |
|---|---|---|---|---|
| **InnerDialog** — a dialog on top of a dialog (Black Belt, 8 users) | `Dialog.jsx` owns one browser-history step per dialog. Two at once confuse Back: Star's Dan-change box and Prospects' delete on phones already open that way, and one Back reaches both. | `Dialog.jsx` gains an "on top" mode: only the bottom dialog owns the Back step; Back closes the top one first. Plus a z-index class in the shared stylesheet. | M | **Yes** — M2's box and M4's receipt open on top of other dialogs (Black Belt, Star, Prospects), and it fixes that Back bug when they switch. |
| **SelectField (Black Belt) / StarSelect (Star)** | Two copies of one custom dropdown (+ cousins: FinalAwardSelect, the date picker's month list) | One `Select` in `src/components/` | M | **Yes — it is M8's base** (the time list is that dropdown with times), so Black Belt's SelectField gets something to switch to at no extra cost. |
| **Grip** (drag handle) | Color Belt's `Grip` (`RankRows.jsx:79`) is already imported by Calendar, Forms and Prospects; Black Belt and Star have their own copies; "Drag to reorder" is written 3 times | Move it to `src/components/Grip.jsx` (with Black Belt's `disabled`), a re-export at the old path, one shared tooltip word | S | **Yes** — small, and it's already a misplaced helper (like M10). |
| **Calendar's ShowMenu** | A copy of RowMenu with tick boxes that don't close the menu | RowMenu gains a second kind of item (tick and stay open), a width, an optional heading and a "Done" end on phones; its 30 users unchanged | M | **Later** — only Calendar uses it; it can come with the new-students prompt (N16) as a step 1b. |
| **The five public-page headers** | The same look written five times; three pages are live | One header in a small file each public page imports, with no dashboard code, the output exactly the same | M | **Later** — touches live public pages for no visible gain; do it with the phase 3 "help in the same place" check (WCAG 3.2.6). |
| **Star ↔ Black Belt copies** | PickerSheet ×2, ResultEmailsBlock ×2, and most of grading and results (GradeGrid, GradeCard, sheets, saves — thousands of lines) | A shared grading kit | L | **Later** — a project of its own, after both sections settle. |

Already covered without a new part: Black Belt's `DateField` copies (the shared `DatePicker` exists), its `Choice` (→ ChoiceGroup, M10) and its `ConfirmDialog` (→ M2).

## 9. The 39 confirm boxes today (from the survey, for the sections' prompts)

| # | Section · where | Frame | Buttons left → right today | First focus | While it works today |
|---|---|---|---|---|---|
| 1–2 | Color Belt · delete rank / class (`ClassesRanksTab.jsx:957`) | DeleteDialog | Cancel · Delete (red) | Cancel | no visible change; Esc waits |
| 3 | Color Belt · delete event (`events/EventsTab.jsx:910`) | ConfirmDeleteDialog | Keep event · Delete event (red) | Keep | no visible change; waits |
| 4 | Color Belt · delete student (`event/EventPage.jsx:1519`) | ConfirmDeleteDialog | Keep student · Delete permanently (red) | Keep | no visible change; waits |
| 5, 8 | Color Belt · leave warnings (event, private grading) | own | Leave anyway · Stay on this page (blue) | Stay | — |
| 6 | Color Belt · cancel private testing (`private/CancelPrivateDialog.jsx`) | own | Keep it · Cancel private testing (blue) | Keep it | "Saving…", native disabled (focus drops) |
| 7 | Color Belt · delete private testing | ConfirmDeleteDialog | Keep it · Delete permanently (red) | Keep it | no visible change |
| 9 | Star · delete category (`RubricsTab.jsx:953`) | DeleteDialog | Cancel · Delete (red) | Cancel | no visible change |
| 10 | Star · delete event (`StarDeleteEventDialog.jsx`) | own copy | Keep event · Delete event (red) | Keep | no visible change |
| 11–12 | Star · undo payment / refund | Star ConfirmBox | Keep payment · Undo payment (blue) | Keep | no visible change |
| 13 | Star · delete candidate | Star ConfirmBox | Keep candidate · Delete permanently (red) | Keep | no visible change |
| 14 | Star · Dan change (on top of the candidate dialog) | Star ConfirmBox | Keep 1st Dan · Change Dan and clear 4 grades (red) | Keep | **closes while it works** |
| 15 | Star · undo Mark as sent | Star ConfirmBox | Cancel · Undo Mark as sent (blue) | Cancel | **closes while it works** |
| 16 | Star · leave warning | own | Leave anyway · Stay on this page (blue) | Stay | — |
| 17 | Black Belt · delete cycle | BB ConfirmDialog | Cancel · Delete cycle (red) | Cancel | no visible change |
| 18 | Black Belt · delete personal details now (on top) | BB ConfirmDialog | Cancel · Save and delete (red) | Cancel | no visible change |
| 19 | Black Belt · undo Mark as sent | BB ConfirmDialog | Cancel · Undo Mark as sent (blue) | Cancel | no visible change |
| 20 | Black Belt · discard changes (`rubric/DiscardDialog.jsx`) | own | Discard · Keep editing (blue) | Keep editing | — |
| 21–23 | Black Belt · undo payment / refund / returned mark | own | Cancel · Undo … (blue) | Cancel | "Saving…" gray; **closes while it works** |
| 24 | Black Belt · Remove (choice box; goes, v1.007) | own | Withdraw · Delete permanently (red) · Cancel | Withdraw | **closes** |
| 25 | Black Belt · delete permanently | own | Keep candidate · Delete permanently (red) | Keep | "Saving…" gray; **closes** |
| 26 | Black Belt · Dan change (a form on phones) | own | Cancel · Change Dan and clear 9 grades (red) | Cancel | "Saving…" gray |
| 27 | Black Belt · leave warning | own | Leave anyway · Stay on this page (blue) | Stay | — |
| 28–30 | Camps · delete camp / camper / template | ConfirmDeleteDialog | Keep … · Delete … (red) | Keep | no visible change |
| 31 | Prospects · delete prospect (on top on phones) | own | Cancel · Delete (red) | Cancel | "Deleting…" gray |
| 32 | Prospects · delete status | own step | Cancel · Delete (red) | **none** | "Deleting…"; **closes** |
| 33–34 | Prospects · Came / still ahead | a form dialog (full screen on phones) | Cancel · Came (blue) / Cancel | Came | "Saving…" |
| 35 | Forms · delete form | own | Cancel · Delete (red) | Cancel | "Saving…" gray |
| 36–37 | Forms · open / end kiosk mode (inside the Share dialog) | inline | Cancel · Open kiosk mode / End kiosk mode (blue) | the action | **closes the whole Share dialog** |
| 38 | Calendar · delete type | own step | Cancel · Delete (red) | Cancel | "Deleting…" gray |
| 39 | Schedule · delete schedule | own | Cancel · Delete (red) | Cancel | no visible change |

## 10. Found on the way (not fixed here — nothing on screen changes; for the owning sessions' prompts)

- **Star:**
  - history says only "Changed" for result-email rows;
  - Hide private details also hides the "Registered" entry;
  - a failed history load reads "No changes recorded yet.";
  - the duplicate count repeats on every line;
  - its Review button doesn't pass the opener;
  - the selected count card is dark, not blue;
  - Payments recorded filters (v1.013 says a total);
  - `dollars` writes "$140.5".
- **Camps:**
  - the compare dialog ignores Hide private details;
  - reversed payments read "$-335 cash (reversed)".
- **Black Belt:** the compare dialog says "Hidden on this device" (everyone else "… on this tablet").
- **Prospects:**
  - history dates are taken in UTC (after 8 PM a change shows the next day);
  - Delete status gets no first focus.
- **Several confirm boxes close on Esc / Back while they work** (§9: Star 14–15, Black Belt 21–25, Prospects 32, Forms 36–37).
- **Two dialogs open at once without InnerDialog** (Star 14, Prospects 31 on phones): one Back press reaches both.
- **A failure note hidden under the pinned buttons** (found by the mockups' design review). The pinned button row has a −24 px bottom margin, so a note placed right after it slides under it. This hits:
  - the four Compare dialogs (Color Belt, Star, Camps, Black Belt) at every size;
  - DeleteDialog-based confirm boxes on screens under 700 px tall, where they pick up the pinned row by accident.

  The shared parts put the note in the bottom area with the buttons (v0.81's `.dialog-footer`).
- **Color Belt:** EventDialog's comment says "15-minute list" for a 5-minute list.
- **Forms, live site only** (the real build loads forms.css before app.css; the preview doesn't):
  - the free-class spots field is full width instead of 64 px (`.fslot-spots`);
  - the waiver text box is 88 px tall instead of 160 px (`.fwaiver-edit`).
- **The kiosk's stylesheet** (`forms-public.css`) re-declares `.btn`, `.input`, `.field` and other base classes for the whole page while kiosk mode is open (the page reloads when it ends).
