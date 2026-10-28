# Prompt 3 — Color Belt: the design review's changes (CB1–CB19)

**Paste into:** the Color Belt session (worktree `color-belt-session-01afc8`, branch `color-belt`). Part 1 now (Jeffrey asked sections to start what's ready); Part 2 after Dashboard core's step 1 (branch `dashboard-core`) is merged into main. This file reaches your worktree when `design-review` is merged into main; until then the Design Review session sends its text by message.

**Starter to paste (Part 2):**

> `git merge main` first (the shared parts are on main now). Check that `src/components/ConfirmBox.jsx` exists; if not, stop and tell Jeffrey. Then read and do Part 2 of `docs/Design Review/End review/Prompts/3-ColorBelt.md`. Mockups first; nothing is built before I OK them.

---

## The brief

The design review decided 19 changes for Color Belt, CB1–CB19: rulebook rows **v1.000–v1.034**. Most of them use Dashboard core's shared parts, whose approved looks are rows **v1.100–v1.111** (on main once step 1 is merged). **Part 1** is what needs no shared part, so it starts now; **Part 2** is the rest. Keep each item's ID (CB3, CB7 …) in your plan, status file and commits, so Jeffrey can trace it.

### Rules

- Follow CLAUDE.md.
- **Preview mode for building and trying changes:** `npm run dev:preview-mode`. `npm run dev`, `npm run preview` and `Start dashboard.bat` use the live database (`.worktreeinclude` copies `.env.local` into every worktree): run them only for a check Jeffrey OKs, never to try a change. `npm run build` is fine: it only builds.
- **Plan first:** a short plan (each item, its files, its mockup, any migration) in your docs folder; show it to Jeffrey.
- **Mockups before code** for every visual change, at PC 1280×800, tablet 820×1180 touch, phone 390×844 touch and 320 wide: a self-contained HTML file plus one PNG per screen with what changes outlined in amber (Jeffrey reviews the PNGs). He OKs them one screen at a time, before any code.
- **One decision at a time,** with pictures. Before asking, check whether another section already does it, and copy that.
- **Reviews:** a separate design reviewer (the rulebook, the approved mockups, screenshots at the four sizes, and §4's six WCAG 2.2 checks, v1.033); a separate code reviewer; a separate security reviewer for anything touching the database (handoff §6).
- **Order (a push to main deploys):** the migration is live before the push that brings the app that uses it. A step whose app calls a new or changed database function is merged only after Jeffrey has applied its migration and the checks passed (fingerprints, security advisor, tests file — CLAUDE.md). Screen-only steps can go first.
- **Don't change a shared part on your own** (`src/components/…`, the shared helpers in `src/lib/`, `src/styles/shared.css`): every section uses them. If you need something a part can't do, ask Jeffrey first. He decides whether you change it in your branch (then list it as a shared file) or the Dashboard core session does.
- List every CLAUDE.md shared file you touch. Dashboard core's merge adds `src/styles/shared.css` and `src/components/text.js` to that list; treat them as shared either way.
- Keep `docs/Testing/Color Belt Testing/TKD-ColorBelt-Status.md` current. Commit on `color-belt` after each reviewed step, and explain the commands. **Never push.**

**Rulebook.** New rows only for what Jeffrey decides in your mockups, from your block **0.400–0.499** (v0.412 is the last one used; check first). Run `git merge main` first, and re-read the rulebook right before editing. The 10b row goes just above `| Approved 2026-10-16 (v0.26) |`, the changelog line at the end of §11. Bump the header's **Version** and **Last updated**; keep CRLF. An older row you change gets a "(See v0.4xx …)" note at its start.

**Paths in this file.** A path starting with `event/`, `events/` or `private/` is in `src/screens/testing/`. A bare file name is one of the shared parts listed under Read first, or one of CLAUDE.md's shared files `App.jsx` (`src/App.jsx`) and `Testing.jsx` (`src/screens/Testing.jsx`). Every other path is written in full. Line numbers were checked on main on 2026-10-28.

### Read first

1. **CLAUDE.md**, and handoff §6 (`docs/Dashboard Docs/TKD-Dashboard-Handoff.md`) before any database work.
2. **The rulebook** `docs/Dashboard Docs/TKD-Dashboard-Design-Guidelines.md`:
   - rows v1.001–v1.003, v1.006, v1.008–v1.011, v1.013, v1.015, v1.018, v1.019, v1.022–v1.024, v1.026, v1.028–v1.030 (v1.004, v1.007 and v1.033 for background);
   - §8: "Are you sure?" boxes, Metric cards, Empty states;
   - for Part 2, Dashboard core's rows v1.100–v1.111.

   Each row names the older Color Belt rows it changes (e.g. v0.35, v0.136, v0.147, v0.181, v0.189, v0.192, v0.402, v0.403).
3. **The change list** `docs/Design Review/End review/TKD-DesignReview-ChangeList.md`: §1, §2.2 (CB1–CB19), §4 (D5, and the change list's D6 (Classes and ranks in Settings)), §6 (D1a–D1d). Jeffrey's own words are in `docs/Design Review/Walkthrough/Decisions.md`, items 3, 3b, 4, 6, 8, 9a, 9b, 10a, 11, 12a, 14a, 14b, 15c, 15d, 16a, 17a, 17c, 18 and 19.
4. **The pictures** named below, in `docs/Design Review/Walkthrough/` and `docs/Design Review/End review/`. Each picture shows today in amber and the drawn options in green. Copy only the option the rulebook row names as chosen. These also draw rejected options in green: 08 picture 10; 11 picture 5; 15c picture 6; 17a picture 4; 17c picture 4; d1b picture 4.
5. **For Part 2: Dashboard core's plan** `docs/Dashboard Core/TKD-DashboardCore-Plan.md`: §2 (M1–M8), §2b (the "on top" dialog, `Select.jsx`, `Grip.jsx`), §3 (M9–M11), §6 (file names) and §9 rows 1–8 (your eight confirm boxes today). Check each shared part in three places before you use it: its own header comment (the built version; it wins where the plan differs), the plan `docs/Dashboard Core/TKD-DashboardCore-Plan.md`, and the parts page `/parts.html` (preview mode only; each state has its own address, e.g. `parts.html#M2/busy`).

**The shared parts** (plan §6):
- in `src/components/`: `ConfirmBox.jsx`, `CompareDialog.jsx`, `DuplicateBox.jsx`, `CountCards.jsx`, `MarkPaidBox.jsx`, `Receipt.jsx`, `RegistrationLinkBox.jsx`, `HistoryLine.jsx`, `TimeList.jsx` (on `Select.jsx`), `ChoiceGroup.jsx`, `Grip.jsx`, `DeleteDialog.jsx`, `text.js`;
- in `src/lib/`: `useLiveLoad.js`, `money.js` (`formatMoney`), `times.js`, `qr.js`;
- Star's `DatePicker.jsx` (`src/components/`) is shared already, so Part 1 can use it.

---

## Part 1 — ready now (no shared part needed)

Screen-only steps can be merged first; the CSV button waits for the migration (Rules: Order).

**CB3, first half — Edit payment ends with "Payment changed" + Undo** (v1.003; picture `04-fixing-a-payment.png`, picture 8). Event roster and private testing.
- Today it ends with "Payment saved" and no Undo (`event/EventPage.jsx:923`, `private/PrivateTestingTab.jsx:551`). New: **"Payment changed" + Undo** (Black Belt's words).
- The Undo edits the new payment (the database returns its id) back to the old way, amount and date. No database change. While Hide private details is on: the general words and no Undo, as Change how they'll pay does today.
- After Edit payment and its Undo, check that Finance's Daily report for that day still shows the right payments (Finance reads them).
- The other half (Undo payment asks first) needs `ConfirmBox`: Part 2.

**CB4 — Undo for 5 seconds** (v1.006; picture `06-undo-after-a-change.png`).
- The event roster's Restore already has it (`event/EventPage.jsx:1090`).
- Private testing gets it after Restore (`private/PrivateTestingTab.jsx:716`; the Undo cancels it again) and after Edit details' "Changes saved" (`:460`; no Undo when the change cleared a result, as on the event roster, `event/EventPage.jsx:838`).
- **Ask Jeffrey:** Change day or time shows no toast at all (P4). Does it get "Changes saved" + Undo too?

**CB8 — the ⋯ order** (v1.011; picture `10-menu-order.png`). Private testing (`private/PrivateTestingTab.jsx:777–781`): Edit details · Change how they'll pay · Change day or time · Grade → **Edit details · Change day or time · Grade · Change how they'll pay**. Fix the file's header comment too (line 13).

**CB15 — icons** (v1.024, §2.4; picture `16a-one-icon.png`, picture 4).
- Not paid card: `ti-clock` → **`ti-circle-x`** (`event/EventPage.jsx:1413`, `private/PrivateTestingTab.jsx:838`).
- Change how they'll pay: no icon → **`ti-switch-horizontal`** (`event/EventPage.jsx:1318`, `private/PrivateTestingTab.jsx:778`).
- The event roster's Restore: no icon → **`ti-arrow-back-up`** (`event/EventPage.jsx:1329`).
- The No show result: `ti-user-off` → **`ti-user-x`** (`event/ResultButtons.jsx:29`, `:53`).

**CB17 — private testing's empty list** (v1.028; picture `17c-empty-lists.png`, picture 3). `private/PrivateTestingTab.jsx:846–853`: the box with a second blue "Add private testing" becomes the one line every list uses, "No private testings yet. Add one when a family asks to test privately." (§8's own example). The header button stays the one way to add. Drop the `.pv-empty` box styles (`src/styles/testing-private.css`).

**CB6 — private testing rows open the summary** (v1.009; picture `09-opening-a-person.png`, picture 3).
- Tap anywhere on a row (`private/PrivateRows.jsx`) → a read-only summary like the event roster's (`event/StudentDialog.jsx`, mode `'view'`): class, testing for, price, when added, paying by, the payment and its date; **Close · Edit details**. Mark paid and ⋯ stay on the row.
- With Hide private details on, the payment lines become "Payment details are hidden on this tablet.", as in StudentDialog.
- CB7's history line and CB2's Print receipt join it in Part 2.

**CB11 — dates** (v1.018; picture `14-dates.png`, picture 4). Star's `DatePicker.jsx` replaces the browser's date box in:
- Add / Edit event's testing date and closing date (`events/EventDialog.jsx:306`, `:386`);
- the private day (`private/DayTimeFields.jsx:57`: Add private testing, Change day or time, Move to private testing);
- Edit payment's date paid (`event/PaymentDialogs.jsx:204`).

**To settle in your mockup:** the weekday lines under the fields (v0.147; "Thursday, December 3, 2026"), now that the picker writes the date in words; each field's first and last allowed day.

**CB13 — "Both": one box per school** (v1.022; picture `15c-both-schools.png`, picture 5).
- Today `Testing.jsx:342` (a shared file) shows `src/screens/testing/BlockedOnBoth.jsx`: one line and two school buttons, and nothing is read.
- New, as Finance's Both page (`src/screens/finance/BothSummary.jsx`, v0.198): "Both schools" under the title; one box per school with its upcoming testing; **Open Worcester / Open Shrewsbury** (today's buttons: they switch the whole dashboard). Nothing can be changed on Both (v0.34 / v0.35 stay).
- Each school is read with `loadEvents(locationCode)` (`src/lib/testing/eventsApi.js`). No database change.
- **To settle in your mockup (change list D5):** upcoming private testings in the boxes too (`loadPrivateTestings`, `src/lib/testing/privateApi.js`)? The words when a school has none. The phone layout (Finance stacks its boxes).

**CB18 — after the testing day: Print results, "Passed", the admin CSV** (v1.029; picture `18-results.png`, picture 3).
- **Print results:** Star's sheet (`src/screens/testing/star/results/StarResultsSheet.jsx`): who passed to which belt, a page per class. It goes next to the class switch on the Grading tab, by Print grading sheet (`event/GradingTab.jsx:175`). v1.029 decided a page per class; ask only because the class switch shows testing groups (v0.193 / v0.195).
- **"Pass" → "Passed"** on the result button; "Not passed" and "No show" stay. The word is `RESULT_PASS` (`src/screens/testing/text.js:795`). It is also the note dialog's subtitle (`event/EventPage.jsx:1540`, `private/PrivateGradingPage.jsx:348`) and the tick label on both printed grading sheets (`event/GradingSheet.jsx:51`, `private/PrivateSheet.jsx:59`): show those in the mockup too.
- **Download CSV, admins only:** the database function is below. The app builds the file with Star's `src/lib/star/csv.js` (quoting, formula injection, privacy); reuse it rather than make a third copy (Finance has its own), and ask if it should move to a shared place. Show Jeffrey your column list. Hide the button while Hide private details is on, as Star does.

### The database halves (planned now, one migration)

**How:**
- Ask the **Main session** for one migration number (CLAUDE.md); give Jeffrey a ready-to-paste message for it. The migration holds the three items below. Get a **separate security review**.
- The usual files: `00NN_tests.sql`, a fingerprints file, a SETUP section "## Migration 00NN: …", and a `step00NN` in `supabase/tests/pglite/run.mjs`. Run the PGlite tests with `cd supabase/tests/pglite && npm ci && node run.mjs` (`npm ci` once per worktree).
- The fake database: `src/lib/mockTestingEvents.js` (functions in its `RPC_ARGS` list are routed automatically). Touch `src/lib/mockClient.js` (a shared file) only for a `__tkdPreview` helper.

**CB18's CSV function.** Star's is `star_results_csv` (0006 §18zd; replaced in 0023 §7). It checks "admin only" in the database, writes a download log row first (`star_downloads`, 0006 §11: who, when, which event, how many rows) and returns raw rows. Copy that for one Color Belt event.

**CB7's history readers** (v1.010, v1.108). The app can't read `change_log` (0003: RLS on, no policy, no grants), so a person's history needs a reader. The model is Star's `star_candidate_history` (0006). Color Belt's rows:
- an event student: `testing_registrations` (record_id = the registration; the signature shows only as "on file"), its payments in `testing_payments` (linked by `registration_id` in the inserted row) and its result in `testing_results` (record_id = the registration);
- a private testing: `testing_private`, its payments in `testing_private_payments` (linked by `private_id`) and its result in `testing_private_results` (record_id = the private testing).
- The reader's `load()` must throw when the answer's status isn't ok; otherwise `HistoryLine.jsx` shows "History · no changes yet" for a failure. Strip login ids, as `star_history_strip` (0006) does.
- With Hide private details on, the app leaves the money rows out (v1.108; the part's `describe`).

**CB1's Mark paid with a way to pay** (v1.001, v1.104). `testing_mark_paid` (0005) and `testing_private_mark_paid` (0014) take no way to pay: they record `paying_by`. The live site keeps calling them until Part 2's app is deployed.
- Both versions must work in between. C5 (0005_tests) and V1 (0014_tests) allow one version per function, list exact signatures and forbid defaults. So don't add a second version under the same name: use a new function name (the old one goes later), or change those tests in the same migration. Settle it in the plan and the security review.
- The box shows the amount before saving. Make sure the amount recorded is the amount shown: today the database works it out itself, and the testing-day price starts at midnight.

---

## Part 2 — after Dashboard core's step 1 is merged

The shared parts' looks are already approved (v1.102–v1.109). Switching to one needs no mockup of the part itself; draw your screens with the parts wherever your own layout changes.

**The imports** (v1.030; picture `19-shared-parts.png`, picture 2).
- `useLiveLoad` (4 files: `event/EventPage.jsx`, `events/EventsTab.jsx`, `private/PrivateGradingPage.jsx`, `private/PrivateTestingTab.jsx`) → `src/lib/useLiveLoad.js`.
- `ChoiceGroup` (8 files) → `src/components/ChoiceGroup.jsx`.
- `src/screens/testing/ClassBlock.jsx`'s `Grip` → `src/components/Grip.jsx`.
- **These old files stay** while anything imports them (a re-export is a one-line file that passes an import on to the new place):
  - `src/screens/testing/events/useLiveLoad.js` and `src/screens/testing/events/ChoiceGroup.jsx` (Star, Black Belt, Camps and Finance);
  - `src/screens/testing/DeleteDialog.jsx` (Star's RubricsTab);
  - the `Grip` re-export in `src/screens/testing/RankRows.jsx` (Calendar, Forms and Prospects).
- **Leave alone:** `src/screens/testing/events/ConfirmDeleteDialog.jsx` (Camps' CampPage, DeleteCampDialog and TemplatesTab use it) and `dollars` in `src/screens/testing/text.js` (CB16).

**CB3, second half — Undo payment asks first** (v1.003; picture `04-fixing-a-payment.png`, picture 7).
- Today ⋯ → Undo payment acts at once, with no question and no Undo (`event/EventPage.jsx:1101`, `private/PrivateTestingTab.jsx:665`).
- New: `ConfirmBox` first, with Star's approved words: "Undo Ava Chen's payment?" / "The $65 cash payment recorded on Nov 3 is reversed and the row goes back to Not paid. Both stay in the history." · **Keep payment** · **Undo payment**. Blue: something is lost, but not for good, so the first focus is on Keep; "Undoing…" while it works.
- Private testing names the **latest** payment (after a top-up) and what the row becomes.
- The toast's Undo right after Mark paid stays one tap (rule 1.4).

**CB5 — every confirm box on `ConfirmBox`** (v1.008, v1.103; pictures `08-are-you-sure-boxes.png` picture 8, `End review/d1a-busy-box.png` picture 4, `End review/d1b-narrow-buttons.png` picture 3, `End review/d1c-button-order.png` picture 3). These are plan §9 rows 1–8.
- **The two leave warnings swap** (D1c; changes v0.192), in event grading (`event/EventPage.jsx:1556`) and private grading (`private/PrivateGradingPage.jsx:361`). Today: "Leave anyway" · blue "Stay on this page", focused. New: **"Stay on this page" on the left and focused, "Leave anyway" on the right and red.** The words stay.
- **Classes and ranks** (`src/screens/testing/ClassesRanksTab.jsx:957`, today `DeleteDialog`): "Cancel · Delete" becomes **"Keep rank · Delete rank"** and **"Keep class · Delete class"**, red.
- **The words don't change in:**
  - delete event, "Keep event · Delete event" (`events/EventsTab.jsx:910`);
  - delete student, "Keep student · Delete permanently" (`event/EventPage.jsx:1519`);
  - delete private testing, "Keep it · Delete permanently" (`private/PrivateTestingTab.jsx:968`);
  - cancel private testing, "Keep it · Cancel private testing", blue (`private/CancelPrivateDialog.jsx`; it can go afterwards, only Color Belt uses it).
- **What changes on screen in all of them:**
  - the pressed button grays with its busy words ("Deleting…", "Cancelling…"; today most show nothing, and Cancel private testing shows "Saving…"), and "Keep …" grays too;
  - at 320 wide a pair that doesn't fit stacks full width (e.g. "Keep student · Delete permanently");
  - a failure note stays under the buttons. Today every Color Belt confirm box picks up the pinned button row on screens under 700 px tall, and the row can hide the note: check at 320 × 640;
  - Cancel private testing stops using native `disabled`, so keyboard focus no longer drops out.

**CB19 — Compare dialog and duplicate box** (v1.102).
- `event/EventPage.jsx:1497` uses `event/CompareDialog.jsx` (only Color Belt uses it) → `CompareDialog`. The inline box (`event/EventPage.jsx:1688`) → `DuplicateBox`.
- What changes on screen:
  - a visible amber **"⚠ different"** next to each value that differs (today only screen readers hear it);
  - **"Keeping…"**, with every button grayed while it works;
  - the failure note sits with the buttons (today it can hide under them).
- These stay: your noun "registered twice", who may keep one (admins only after the testing day, v0.194) and "Hidden on this tablet".

**CB9 — count cards** (v1.013, v1.107; picture `11-count-cards.png`, picture 4).
- The event roster (`event/EventPage.jsx:1410`; it already filters) and private testing (`private/PrivateTestingTab.jsx:835`) switch to `CountCards`.
- **Private testing's cards filter like the event's:** Private testings shows everyone; Paid and Not paid filter ("Showing not paid only · Show all"); Payments recorded stays a total.
- **To settle in your mockup:**
  - the Paid card's "1 owes more" is amber today (`src/styles/testing-private.css:179`); the shared card's note is gray;
  - how a filter works with the Upcoming / Past switch.

**CB10 — registration link** (v1.015, v1.106, v1.111; picture `12-registration-link.png`, picture 5).
- `event/RegistrationLinkDialog.jsx` → `RegistrationLinkBox`, with your flyer.
- What changes on screen:
  - **Download QR code** (a 1024 px PNG named "[event] - [school] QR code.png");
  - a failed copy shows its amber note inside the box (today it's a bar on the page, `event/EventPage.jsx:1266`).
- `src/lib/testing/qr.js` keeps `registrationLink` (the Events tab uses it). Its QR drawing gives way to `src/lib/qr.js`; update `src/lib/testing/checks.mjs`.

**CB12 — times** (v1.019, v1.109; picture `14b-times.png`, picture 4).
- `TimeList` replaces the browser lists in:
  - Add / Edit event's class start and end (`events/EventDialog.jsx:162`; the choices are built at `:25–29`);
  - the private time (`private/DayTimeFields.jsx:80`).
- What changes on screen:
  - the same list on every device (phones lose their own picker);
  - it opens at the chosen time;
  - typing a number jumps to that hour.
- **No migration.** The database accepts any class time (`testing_classes_arg_is_valid`, 0005, checks only that the end is after the start). Private times are checked by `testing_private_time_is_valid` (0014): 6:00 AM–10:00 PM every 5 minutes, exactly the shared list.
- Fix `events/EventDialog.jsx:159`'s comment ("15-minute list") on the way.

**CB16 — money** (v1.026, v1.101; picture `17a-money-names.png`: the chosen option B changes nothing on screen).
- Color Belt's staff screens use `formatMoney` from `src/lib/money.js`:
  - `event/EventPage.jsx:1414`, `private/PrivateRows.jsx:89`, `private/PrivateTestingTab.jsx:839`;
  - the sentences in `src/screens/testing/text.js`;
  - Classes and ranks' `formatDollars` (`src/screens/testing/RankRows.jsx`, `src/screens/testing/RankDialog.jsx`; the prices are whole dollars).

  Nothing changes on screen.
- Leave `formatDollars` on the public family pages (`src/register/`, the camp and Black Belt forms) in this round; switch the staff screens.
- **Leave `export function dollars` (`src/screens/testing/text.js:341`) as it is.** Camps imports it (`src/screens/camps/text.js:88`) and switches in its own prompt.

**CB1 — the Mark paid box** (v1.001, v1.104; picture `03-taking-a-payment.png`, picture 5). Merged only after Part 1's migration is live (Rules: Order).
- `MarkPaidBox` opens under the row's Mark paid (event roster and private testing). It shows:
  - the amount;
  - **Paid by**, preset to the family's choice, with "They chose … on the form." (or "… at the desk.");
  - then **"Mark paid $X"**.
- Today one click records the family's choice.
- Check that Finance's Daily report shows the way chosen.

**CB7 — the history line** (v1.010, v1.108; picture `09b-change-history.png`, pictures 4–5). Merged only after Part 1's migration is live.
- `HistoryLine` goes at the end of both summaries (the event roster's and CB6's): "History · N changes", then the list, newest first, with dates only ("Oct 22 · Jeffrey Berg").

**CB2 — Print receipt** (v1.002, v1.105; picture `03b-receipts.png`, pictures 4–5).
- `Receipt` opens from the ⋯ money group (after Edit / Undo payment) and from a button in the summary (the event roster's and CB6's). Staff and admins can use it, as Black Belt's.
- Print receipt stays in the ⋯ menu and the summary; with Hide private details on, the receipt shows v1.105's one gray line, "Payment details are hidden on this tablet.", and no Print (as the approved M4 mockup).
- No database change for the content: the payments are already loaded, and both schools' street and phone come from `loadSchools()` (`src/lib/settings/schoolsApi.js`).
- **"Printed … by [name]":** no migration needed. Either call the existing `get_my_profile` (returns `full_name`; `App.jsx` calls it at sign-in and the preview answers it) when the receipt opens, or pass a `profileName` prop from `App.jsx` through `Testing.jsx` (two shared files, added once by one branch). Ask Jeffrey once; the same answer serves Color Belt, Star and Camps.
- **To settle in your mockup:**
  - which lines a receipt lists after a payment was edited, undone or moved to private testing (each writes a reversal and a new payment);
  - what Total due and Balance say for an event student, and for a private testing with a top-up.

---

## Waits for another session

**CB14 — Classes and ranks move to Settings; Color Belt keeps a "Prices" tab** (v1.023; picture `15d-settings.png`, pictures 10–11).
- **It is joint with Dashboard core's M15** (`docs/Design Review/End review/Prompts/2-DashboardCore-step2-main-screens.md`).
- **Before any mockup for it,** agree a joint plan with the Dashboard core session **through Jeffrey**: who builds which part, in which branch, and in what order.
- **Your code today:**
  - in `src/screens/testing/`: `ClassesRanksTab.jsx`, `ClassBlock.jsx`, `ClassDialog.jsx`, `RankDialog.jsx`, `RankRows.jsx` (keep its `Grip` export), `BeltPicker.jsx`, `FinalAwardSelect.jsx`;
  - `src/lib/testing/api.js` and `src/lib/testing/useClassesRanks.js`;
  - the tab in `Testing.jsx` (a shared file).
- **To settle in the mockups (the change list's D6 (Classes and ranks in Settings)):**
  - a staff view: staff can view Classes and ranks today (v0.40), but Settings is admins only;
  - the Schedule's and Forms' hints as links to Settings → Classes and ranks (today `src/screens/schedule/text.js:48`, `:60` and `src/screens/forms/text.js:154`; the new students' session's N11 follows);
  - each school's classes, on a page that ignores the top bar;
  - the Prices tab's name.
- "Same tables": check whether any database change is needed.
- **Nothing else in this prompt waits for CB14.** If the joint plan moves the Classes and ranks files soon, do CB5's two Classes and ranks boxes and CB16's prices as part of that move, so those files change once.

## Found by the Dashboard core session (not decided)

Check each in the preview. Where a fix would change the screen in a way no row decided, ask Jeffrey first (one question, with a picture).
- **The ⋯ menu sometimes opens in the top-left corner on PC** right after a page loads (`src/components/RowMenu.jsx`, Dashboard core's part). If you see it, tell Jeffrey; don't fix it here.
- **`src/styles/register.css`** (your family form; Star's and Camps' forms use it too) uses weight 600 three times (lines 375, 394, 659), against §7's 400 / 500. Dashboard core's D6 (the receipt's font weights) asks the same question about the receipt. Don't change it unless Jeffrey asks: it reaches three live public pages.

## Done when

- **Part 1:** CB3's first half, CB4, CB6, CB8, CB11, CB13, CB15, CB17 and CB18 are built, reviewed and approved in the preview by Jeffrey. The migration is planned, security-reviewed and applied by Jeffrey before any app that calls it is merged.
- **Part 2:** the imports and CB1, CB2, CB3's second half, CB5, CB7, CB9, CB10, CB12, CB16 and CB19 are done the same way.
- **CB14:** the joint plan is agreed and its mockups are approved, or it is scheduled.
- **Every step:**
  - Jeffrey's decisions are recorded as rows from your block;
  - `npm run build` and `npm run build:preview-mode` pass;
  - `src/lib/testing/checks.mjs` passes (in Part 2, `src/lib/shared/checks.mjs` too);
  - after any migration change, the PGlite tests pass: `cd supabase/tests/pglite && npm ci && node run.mjs` (`npm ci` once per worktree);
  - the status file is current and the work is committed on `color-belt`.
- No push: the Main session merges when Jeffrey asks.
