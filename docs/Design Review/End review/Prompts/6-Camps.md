# Prompt 6 — Camps: the design review's changes (C1–C20)

**Paste into:** the Camps session (branch `camps`, worktree `camp-event-creator-templates-83eafe`). Part 1 now (Jeffrey asked sections to start what's ready); Part 2 after Dashboard core's step 1 (branch `dashboard-core`) is merged into main. This file reaches your worktree when `design-review` is merged into main; until then the Design Review session sends its text by message.

**Starter to paste (for Part 2):**

> Camps, Part 2. `git merge main` first (the shared parts are on main now). Check that `src/components/ConfirmBox.jsx` exists; if not, stop and tell Jeffrey. Then read and do Part 2 of `docs/Design Review/End review/Prompts/6-Camps.md`. Mockups first; nothing is built before I OK them.

---

## The brief

The design review decided 20 changes for Camps (C1–C20). They are already rulebook rows **v1.000–v1.034**.
- **Part 1** needs no shared part.
- **Part 2** switches to the shared parts the Dashboard core session built and Jeffrey approved (rows **v1.100–v1.111**).

Each item keeps its change-list ID, so Jeffrey can trace it. Line numbers are main's on 2026-10-28; they may have moved.

### Rules
- Follow CLAUDE.md.
- **Plan first:** a short plan (each item, its files, its mockup, any migration) in your docs folder; show it to Jeffrey.
- **Preview mode for building and trying changes:** `npm run dev:preview-mode`. `npm run dev`, `npm run preview` and `Start dashboard.bat` use the live database (`.worktreeinclude` copies `.env.local` into every worktree): run them only for a check Jeffrey OKs, never to try a change. `npm run build` is fine: it only builds.
- **Mockups before code** for every visual change, at PC 1280×800, tablet 820×1180 touch, phone 390×844 touch and 320 wide: a self-contained HTML file plus one PNG per screen with what changes outlined in amber (Jeffrey reviews the PNGs). He OKs them one screen at a time, before any code.
- **One decision at a time,** with pictures: each option drawn, its pros and cons, and a recommendation.
- **Reviews:** a separate design reviewer (the rulebook, the approved mockups, screenshots at the four sizes, and §4's six WCAG 2.2 checks, v1.033); a separate code reviewer; a separate security reviewer for anything touching the database (handoff §6).
- **Don't change a shared part on your own** (`src/components/…`, the shared helpers in `src/lib/`, `src/styles/shared.css`): every section uses them. If you need something a part can't do, ask Jeffrey first. He decides whether you change it in your branch (then list it as a shared file) or the Dashboard core session does.
- **Don't edit Color Belt's files.** Camps' `text.js` re-exports about 80 words from Color Belt's `src/screens/testing/text.js` (`camps/text.js:13`, `:16–99`). Color Belt changes that file at the same time, so write any word you change in Camps' own `text.js`.
- Keep `docs/Camps/TKD-Camps-Status.md` current, with a "Design review C1–C20" section. Update it in the same turn a step finishes or a decision is made.
- Commit on `camps` after each reviewed step. Never push.
- List every CLAUDE.md shared file you touch. Dashboard core's merge adds `src/styles/shared.css` and `src/components/text.js` to that list; treat them as shared either way. (`src/App.jsx` too, if C3 passes the name as a prop.)

### Rulebook
- New rows only for what Jeffrey decides in your mockups, from your block **0.700–0.799**. **Next free: 0.722** (v0.721 is on your branch, not yet on main).
- `git merge main` first, re-read the rulebook right before editing, and keep its CRLF line endings. The 10b row goes just above `| Approved 2026-10-16 (v0.26) |`, the changelog line at the end of §11; bump the header's Version and Last updated.

### Read first
- **Docs:** your status file, `docs/Camps/TKD-Camps-Status.md`; the change list `docs/Design Review/End review/TKD-DesignReview-ChangeList.md` (§1, §2.5, §4, §6); `docs/Design Review/Walkthrough/Decisions.md` (§2.5's Item column points to each decision); and handoff §6, before the migration.
- **The rulebook:** the rows each item names, plus **v1.004** (problems stay on screen), **v1.033** (WCAG 2.2 AA), Color Belt's **v0.412** (the built model for hiding money) and, before Part 2, Dashboard core's **v1.100–v1.111**.
- **The pictures each item names**, in `docs/Design Review/Walkthrough/` (e.g. `02-camps-hide-private-details.png`) and `docs/Design Review/End review/` (`d1a`–`d1c`). Each picture shows today in amber and the drawn options in green. Copy only the option the rulebook row names as chosen. These also draw rejected options in green: 08 picture 10; 10b picture 6; 11 picture 5; 11b picture 3; 15c picture 6; 17a picture 4; d1b picture 4.

## Part 1 — ready now (no shared part needed)

### C1 first — Hide private details hides money (live today)

**Rows and picture:** v1.000 (1), applying v0.249 / v0.506 / v0.507; picture 02, pictures 4–5. C1 is its own reviewed step and commit, so it can be merged first.

- **Today** no Camps file reads the switch (`src/lib/privateDetails.js`).
- **Copy Color Belt's built behaviour** (v0.412) in `src/screens/testing/event/EventPage.jsx`: the hook (`:193`), `hiddenNowRef` and `hiddenMoneyProblem` (`:329–347`), and the effect that closes payment dialogs, the ⋯ menu, the filter, the toast and every banner when the switch turns on (`:352–376`).
- **What goes while the switch is on:**
  - the roster's Paid column (`CampRoster.jsx:404`, `:435`; phone cards `:379`), "N to collect · $X" (`:511–519`), and the Mark paid box;
  - in Camper detail (`CamperDialog.jsx:217–254`): Price and Paying by read gray "Hidden on this tablet", and Payments becomes one gray line, "Payment details are hidden on this tablet." (words from `privateDetails.js`);
  - Change how they'll pay, Edit payment and Undo payment, from the ⋯ menu and the touch "More";
  - the Compare dialog's Paying by, Total and Payment (`CompareDialog.jsx:38–40`): they read "Hidden on this tablet" and are never marked different (v1.102). Do it in Camps' copy now; C20 moves it to the shared part;
  - Edit details' extra prices (`CamperDialog.jsx:565`) and "Total now $X" (`:588–592`);
  - amounts in the Delete camp and Delete camper sentences (`text.js:256–260`, `:535–540`) and in toasts.
- **What stays:** attendance, check-in and Find a camper; the possible-duplicate box and tag (the tag moves next to the name, picture 02 #4); "Came X of Y days" and "Updated …"; phones (v1.000 (3)); camp and template prices (they are settings, as v0.412 kept Classes and ranks prices).
- **Careful:** in Camps' code, `hidden` already means *the screen is locked* (`CampPage.jsx:610`, and the `hidden` prop of `CamperDialog` and `CampDialog`). Name the new flag differently, e.g. `detailsHidden`.
- **To settle in your mockup:**
  - Print roster's Paid column while the switch is on (`PrintRoster.jsx:70`, `:83`). Paper isn't a screen, but a printout can lie on the mat;
  - picture 02 #5 still draws Change how they'll pay and the "Admin" label under More while the switch is on. But v0.412 hides that item, and v1.012 removes the label.

### The rest of Part 1

**C4, first half — Edit payment ends with "Payment changed" + Undo** (v1.003; picture 04 #8).
- Today the toast says "Payment saved", with no Undo (`CampPage.jsx:713`).
- Undo calls `camp_edit_payment` again on the new payment with the old values, as Black Belt does (`blackBelt/staff/candidates/useCandidateActions.js:435–441`). The function returns the new payment's id, so no database change is needed.
- After Edit payment and its Undo, check that Finance's Daily report for that day still shows the right payments (Finance reads them through 0017).
- The ask-first half waits for Part 2's ConfirmBox.

**C5 — Undo for 5 seconds** (v1.006; picture 06 #7).
- **Missing today:** "Camp saved" (`Camps.jsx:122`, `CampPage.jsx:654`), "Template saved" (`Camps.jsx:124`), a camper's "Changes saved" (`CampPage.jsx:635`), and Save as template's "Template saved · …" (`CampRowMenu.jsx:235`; its Undo deletes the new template, as "Camp added" does).
- **Already done:** Restore (`CampPage.jsx:334–337`), Change how they'll pay, Close / Reopen sign-up, and check-ins.
- An Undo saves the old values again. **Plan for two problems:**
  - Edit camp's Undo can be refused: a family picked a new day (v0.701), or 0027's guards stop it (v0.720). Show the refusal in the amber bar;
  - a camper's Undo that puts back days, member or extras re-prices the camper at the camp's *current* prices (v0.700 (4); `0022_camps_weekly_pricing.sql:1419–1423`). The old total may not come back. Settle it in the plan, and ask Jeffrey if it needs a choice.

**C8 — ⋯ order** (v1.011; picture 10 #9).
- **Today** (`CamperRowMenu.jsx:27–47`): Change how they'll pay (first, while they owe) · Edit details · Review · Withdraw. Then, under "Admin": Edit payment · Undo payment · Delete permanently.
- **New:** Edit details · Change how they'll pay · Review possible duplicate — Edit payment · Undo payment (Print receipt joins this group with C3) — Withdraw · Delete permanently.
- A withdrawn camper's menu stays Restore · Delete permanently (`CamperRowMenu.jsx:42–45`). The touch "More" uses the same list, so it follows.

**C9 — no "Admin" heading** (v1.012; picture 10b #5).
- **Remove** `adminHeading` (`CamperRowMenu.jsx:16–24`, `.cp-menu-heading`), the touch label (`CamperDialog.jsx:282–287`, `.cp-detail-sublabel`) and `ADMIN_GROUP` (`text.js:525`).
- Staff still don't see admin-only items. The account menu's "Admin" group stays (v0.70).

**C12 — "Reopen sign-up" → "Open sign-up"** (v1.016; picture 12b #6).
- The word is at `text.js:237`; the menu item is at `CampRowMenu.jsx:203–207`.
- **Settle the related words in your mockup:** the toasts "Sign-up reopened" / "… until …" (`text.js:244–245`; Color Belt's says "Registration open"), "…wasn't reopened" (`:247`), and the link box's "Reopen it from the ⋯ menu" (`:575`).
- The reason line (`:238`) is Camps' own constant, with the same words as Color Belt's and Star's.

**C13 — the shared date picker** (v1.018; picture 14 #4).
- The picker is Star's `src/components/DatePicker.jsx`. It is already on main; it isn't one of Dashboard core's new parts.
- It replaces the three sign-up dates (`sections/TimesSection.jsx:39–54`) and Edit payment's Date paid (`PaymentDialogs.jsx:244–258`). v1.018 covers every date. Model: `screens/testing/star/candidates/StarPaymentDialogs.jsx:106`.
- The camp-days calendar stays.

**C15 — "Both schools"** (v1.022; picture 15c #3).
- On Both, `Camps.jsx:211` shows "Worcester and Shrewsbury" (`BOTH_SCHOOLS_SUB`, `text.js:107`). `BOTH_SCHOOLS` ("Both schools") already exists (`:120`).
- The family page says "U.S.T.C. Worcester & Shrewsbury · held at …" (`src/camp/text.js:18`). v1.022 doesn't name it: leave it, and mention it to Jeffrey.

**C16 — icons** (v1.024; picture 16a).
- **Restore** gets `ti-arrow-back-up` (`CamperRowMenu.jsx:44`; no icon today). **The day grid:** came gets `ti-user-check`, didn't come `ti-user-x` (`CampRoster.jsx:205`, `:223`; ✓ and ✗ today). The To collect card's `ti-circle-x` comes with C10.
- **The legend** (`text.js:504`) names ✓ and ✗, so it changes with them. Settle it in the mockup, together with the printed roster (`PrintRoster.jsx:27–35`, `text.js:548`).
- **Not decided:** Change how they'll pay has no icon (`CamperRowMenu.jsx:30`). The map gives that meaning `ti-switch-horizontal` (v1.024), but doesn't name Camps. Ask Jeffrey; recommend following the map.

**C18 — Save as template keeps the typing** (v1.027; picture 17b #4–6).
- Today Esc, a click outside or Back close it at once (`SaveTemplateDialog.jsx:58`).
- With a changed name, show "Unsaved changes. Save or cancel first." (`T.UNSAVED`). Phones add "Discard changes", as in `PaymentDialogs.jsx:119–123`.

### The database half of C2 and C7 (one migration)

Ask the Main session for one number (0030 was the next free one on 2026-10-28).

**C2 — `camp_mark_paid` takes the way to pay.**
- **Today** (`0013_camps.sql:3909–3996`) it always records the camper's Paying by.
- **One way,** to settle in the plan and the security review: keep one function. Drop `camp_mark_paid(uuid, integer, text)` and create it again with a fourth argument, `p_method text default null` (null = the camper's Paying by, as today), with revoke / grant on the new signature. Today's three-argument call keeps working. Two versions side by side make the server refuse the call as ambiguous (`0003_testing_classes_ranks.sql:936–948` explains this). Check that 0013's tests still pass; `mockCamps.js:524` gets `p_method` as optional.

**C7 — a reader for Camps' history** (v1.010).
- `change_log` can only be read through a database function (RLS on, no grants). Camps logs every camp table (`0013_camps.sql:1609–1659`), and the sign-ups without the signature (`:1488–1556`).
- **The model:** Star's `star_candidate_history` (`0006_star_testing.sql:5742–5813`). Settle in the plan which changes it returns: check-ins? the family's sign-up rows, which siblings share?
- The reader's `load()` must throw when the answer's status isn't ok; otherwise `HistoryLine.jsx` shows "History · no changes yet" for a failure. Strip login ids, as `star_history_strip` (0006) does.
- **In the preview:** `src/lib/mockCamps.js` has no history yet, so it needs a fake one. Add the function to that file's `RPC_ARGS` and `CAMP_READ_RPC_NAMES`; `src/lib/mockClient.js` needs no change.

**For the migration:** follow handoff §6; add a SETUP section "Migration 00NN" and a `step00NN` in `run.mjs`; get a separate security review. Jeffrey pastes it into the SQL Editor (his OK); then run the fingerprints, the advisor and the tests.

Run the PGlite tests with `cd supabase/tests/pglite && npm ci && node run.mjs` (`npm ci` once per worktree).

- **Order (a push to main deploys):** the migration is live before the push that brings the app that uses it. A step whose app calls a new or changed database function is merged only after Jeffrey has applied its migration and the checks passed (fingerprints, security advisor, tests file — CLAUDE.md). Screen-only steps can go first.
- The screens that use the migration (C2's box, C7's line) are in Part 2.

## Part 2 — after Dashboard core's step 1 is merged

### Before you use a shared part

The parts' looks are approved (v1.102–v1.109, v1.111). Switching to one needs no new mockup of the part itself. Draw your screens with the parts where your own layout changes.

Check each shared part in three places before you use it: its own header comment (the built version; it wins where the plan differs), the plan `docs/Dashboard Core/TKD-DashboardCore-Plan.md`, and the parts page `/parts.html` (preview mode only; each state has its own address, e.g. `parts.html#M2/busy`).

**The plan is out of date for two parts Camps uses:**
- `HistoryLine`'s `describe` returns `{ text, at, who }` (`HistoryLine.jsx:22–29`), not `{ text }`;
- `RegistrationLinkBox`'s `links` takes `heading` (Camps' "Both schools · held at …") and has no `copyLabel` (`RegistrationLinkBox.jsx:26–33`).

**The plan's sections for you:** §2, §2b, §3, §6 (file names), §9 rows 28–30, §10.

### C20 — switch to the shared parts

| Camps today | Shared part | What visibly changes |
|---|---|---|
| `camps/CompareDialog.jsx` | `components/CompareDialog.jsx` (v1.102) | Each difference says "⚠ different". While it works: "Keeping…", every button gray. The failure note sits in the bottom area; today it can slide under the pinned buttons (plan §10). C1's hidden rows. |
| `camps/DuplicateBox.jsx` | `components/DuplicateBox.jsx` (v1.102) | Hardly anything. Keep `findPairs` in a Camps file. |
| Three boxes on Color Belt's `ConfirmDeleteDialog`: Delete camp (`DeleteCampDialog.jsx:38`), Delete template (`TemplatesTab.jsx:213`), Delete camper (`CampPage.jsx:742`) | `components/ConfirmBox.jsx` (v1.103), with `loses: 'forGood'` | "Deleting…" while it works. "Keep …" grays. Esc and Back wait. The buttons stack when they don't fit, measured from their usual words (v1.103 (b)). Never the pinned row (plan §9 rows 28–30). |
| `useLiveLoad` (3 files) and `ChoiceGroup` (6 files), from `screens/testing/events/` | `lib/useLiveLoad.js`, `components/ChoiceGroup.jsx` | Nothing. |

The other parts come with their items: `MarkPaidBox.jsx` (C2), `Receipt.jsx` (C3), `HistoryLine.jsx` (C7), `CountCards.jsx` (C10), `RegistrationLinkBox.jsx` with `lib/qr.js` (C11), `TimeList.jsx` (C14), and `formatMoney` in `lib/money.js` (C17).

Then remove the Camps copies the parts replace, with their CSS, and the words in Camps' `text.js` that the parts now carry (`src/components/text.js`).

### The other Part 2 items

**C6 — confirm boxes** (v1.008, v1.103; pictures 08, d1a–d1c). The words are already as decided: "Keep camp" · "Delete camp", "Keep template" · "Delete template", "Keep camper" · "Delete permanently". Only the switch changes these boxes.

**C2 — the Mark paid box** (v1.001, v1.104; picture 03 #6).
- It opens from the "$X due" / "Owes $X" tag, as today. It shows the amount, then **Paid by** (preset to the camper's Paying by, with "They chose … on the form."), then **Mark paid $X**.
- The school still comes from This device (v0.708). The box calls Part 1's `camp_mark_paid` with the chosen way (see the Order rule).
- **Settle in the plan:**
  - Camps doesn't record where the choice was made. After Change how they'll pay, "on the form" may be wrong; the part can say "at the desk";
  - whether a different way picked in the box also changes the camper's Paying by.

**C3 — Print receipt** (v1.002, v1.105; picture 03b).
- **The model** is Black Belt's: `blackBelt/staff/candidates/CandidatesTab.jsx:206`, `:252` and `CandidateDialog.jsx:534`.
- Print receipt stays in the ⋯ menu and the detail; with Hide private details on, the receipt shows v1.105's one gray line, "Payment details are hidden on this tablet.", and no Print (as the approved M4 mockup).
- **Data:** `camp_camper_detail` has the payments and totals. The schools' street and phone come from `locations`, read the way `src/lib/settings/schoolsApi.js` does.
- **"Printed … by [name]":** no migration needed. Either call the existing `get_my_profile` (returns `full_name`; `App.jsx` calls it at sign-in and the preview answers it) when the receipt opens, or pass a `profileName` prop from `App.jsx` to `<Camps>` (`App.jsx:1093–1115`; Finance already gets one at `:1182`), which touches one shared file. Ask Jeffrey once; the same answer serves Color Belt, Star and Camps.
- On touch screens, Camper detail lists the ⋯ items under "More": don't show Print receipt twice there (rule 1.1). If the receipt opens on top of Camper detail, use the parts' `onTop` (v1.100).

**C4, second half — Undo payment asks first** (v1.003; picture 04 #7).
- Today it acts at once (`CampPage.jsx:341–352`).
- New: a ConfirmBox with `loses: 'something'`, naming the payment. The action is blue, and "Keep payment" has the first focus. Star's words are the model (`screens/testing/star/candidates/text.js:163–167`).

**C7 — the history line** (v1.010, v1.108; picture 09b #4–5).
- "History · N changes" goes at the end of Camper detail, and reads from Part 1's reader.
- Settle in the mockup the words for each change, and where the line sits next to the touch "More".

**C10 — four count cards** (v1.013, v1.014, v1.107; pictures 11, 11b #4).
- They replace the summary line (`CampRoster.jsx:260–288`, `:503–527`): **Campers** (`ti-users`, shows everyone) · **Coming** that day (filters) · **To collect** (`ti-circle-x`, filters, with "$1,355" under the number) · **Payments recorded** (`ti-sum`, a total, never a button). "Updated …" stays.
- **To settle in your mockup,** one question at a time:
  - the line's other numbers have no card: "9 of 15 here today", the pizza count, and after the camp "Came 142 of 150 days" and "All paid";
  - which day "Coming" means before, during and after the camp; its label; how it works with the week switch and Find a camper;
  - with Hide private details on, To collect and Payments recorded go, and Campers and Coming stay;
  - where "Updated …" sits (picture 11b: on the right, above the cards).

**C11 — Registration link** (v1.015, v1.106; picture 12 #7).
- **Phones:** today the button is an icon-only blue square (`CampPage.jsx:776–785`). It gets its words and keeps its blue, on its own line under the title, as Color Belt's does.
- **The shared box:** a copy or download failure shows inside the box, in the shared words; today it is a bar on the page (`CampPage.jsx:520`, `:669`).
- **The QR file:** the PNG becomes "April Vacation Camp QR code.png" (today "april-vacation-camp-qr.png"). If Camps passes the school, a one-school camp's file gets "… - Worcester QR code.png": settle which in the plan. Keep `campLink`; update `src/lib/camps/checks.mjs:291–298`.

**C14 — the shared time list** (v1.019, v1.109; picture 14b).
- Starts and Ends (`TimesSection.jsx:18–38`) offer 6:00 AM–9:00 PM today (`sections/campForm.js:45–52`). New: 6:00 AM–10:00 PM, every 5 minutes.
- **No migration is needed:** `camp_time_is_valid` (`0013_camps.sql:190–198`) checks only the 5-minute step, and 0022 and 0027 keep it; the camp Function only reads times; the preview checks only the step (`mockCamps.js:639`).

**C17 — money through the shared helper** (v1.026, v1.101; picture 17a).
- **Today** Camps writes money with Color Belt's `dollars`, re-exported at `camps/text.js:88` and used across Camps' `text.js`, `CampRoster.jsx:517` and `CompareDialog.jsx:39`, and with Color Belt's `markedPaidToast` (`testing/text.js:599`, used at `CampPage.jsx:312`).
- **Switch** Camps' `text.js` to `formatMoney` (`src/lib/money.js`), and give Camps its own `markedPaidToast`.
- **What shows:** "$-335 cash (reversed)" (`text.js:644–645`) becomes "−$335 cash (reversed)". Nothing else changes: Camps' amounts are whole dollars.
- Leave `formatDollars` on the public family pages (`src/register/`, the camp and Black Belt forms) in this round; switch the staff screens.

Dashboard core's plan §9 rows 28–30 and §10's two Camps lines are covered by C1, C6, C17 and C20.

## Waits for another session

**C19 — the refresh warning folds into the shared offline bar** (v1.005; picture 05b).
- The bar is Dashboard core's step 2 (M12).
- **Until Jeffrey says the bar is on main,** keep Camps' bar (`CampPage.jsx:822–835`; `REFRESH_FAILED`, `text.js:698`; v0.718).
- **Then:** `git merge main`, remove Camps' bar, and check the shared bar on the camp page (offline, and after two failed refreshes). "Updated …" stays (v1.014).

## Found by the Dashboard core session (not decided)

Confirm each point in the preview. Where the shared part already fixes it, fix it with the switch. Where a fix would change the screen in a way no row decided, ask Jeffrey first (one question, with a picture).

- **A failure note can slide under the pinned buttons,** in Camps' Compare dialog (`CompareDialog.jsx:111–126`) and in confirm boxes on screens under 700 px tall. Part 2's switch fixes both.
- **The ⋯ menu sometimes opens in the top-left corner on PC** (`RowMenu.jsx`, Dashboard core's file). Tell Jeffrey if you see it; don't fix it here.
- **Weight 600 breaks §7** (400 and 500 only): `src/styles/camps.css:1141` (the printed roster's headers) and `src/styles/camp.css:186` (the family page's week heading). Ask Jeffrey after Dashboard core's D6 (the receipt's font weights).

## Also found (not decided)

- **Target size** (v1.033: 24 px). The Paid column's tags open the Mark paid box and the Compare dialog. Decisions item 20c spotted Camps' 22 px "Possible duplicate" tag. Check them.
- **Not in this prompt:** Camps' other browser lists (Start from, Days per week, the calendar's Month / Year). No row moves them to the shared dropdown.

## Done when

- **Part 1:** C1, C4's first half, C5, C8, C9, C12, C13, C15, C16 (all but the card's icon) and C18 are built, reviewed and approved in the preview by Jeffrey. The migration is reviewed, applied by Jeffrey, and checked.
- **Part 2:** C2, C3, C4's second half, C6, C7, C10, C11, C14, C17 and C20, the same way.
- **C19** is done, or waits for M12; the status file says which.
- Jeffrey's new decisions are rows from your block.
- **These pass:** `npm run build` and `npm run build:preview-mode`; `node src/lib/camps/checks.mjs` and `node --test functions/tests/`; and, after the migration, the PGlite tests.
- The status file is current, and each step is committed on `camps`.
- No push: the Main session merges when Jeffrey asks, and a step with database work only after its migration is live.
