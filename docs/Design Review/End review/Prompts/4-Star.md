# Prompt 4 — Star testing: the design review's changes (S1–S12)

**Paste into:** the Star testing session (branch `star-testing`, worktree `.claude/worktrees/star-testing-08cb3a`). Part 1 now (Jeffrey asked sections to start what's ready); Part 2 after Dashboard core's step 1 (branch `dashboard-core`) is merged into main. This file reaches your worktree when `design-review` is merged into main; until then the Design Review session sends its text by message.

**Starter to paste (for Part 2):**

> `git merge main` first (the shared parts are on main now). Check that `src/components/ConfirmBox.jsx` exists; if not, stop and tell Jeffrey. Then read and do Part 2 of `docs/Design Review/End review/Prompts/4-Star.md`. Mockups first; nothing is built before I OK them.

---

## The brief

The walkthrough decided 12 changes for Star (change list §2.3, S1–S12). They are rulebook rows **v1.000–v1.034**. The shared parts they use are rows **v1.100–v1.111**, built by the Dashboard core session and approved by Jeffrey.
- **Part 1** needs no shared part: S3, S4, S7, S9, S12's migration (0028) and the questions for Jeffrey.
- **Part 2** switches Star to the shared parts: S1, S2, S5, S6, S8, S10, S11 and S12's screen.

### Rules

- Follow CLAUDE.md.
- **Preview mode for building and trying changes:** `npm run dev:preview-mode`. `npm run dev`, `npm run preview` and `Start dashboard.bat` use the live database (`.worktreeinclude` copies `.env.local` into every worktree): run them only for a check Jeffrey OKs, never to try a change. `npm run build` is fine: it only builds.
- **Plan first:** a short plan (each item, its files, its mockup, any migration) in your docs folder; show it to Jeffrey.
- **Mockups before code** for every visual change, at PC 1280×800, tablet 820×1180 touch, phone 390×844 touch and 320 wide: a self-contained HTML file plus one PNG per screen with what changes outlined in amber (Jeffrey reviews the PNGs). He OKs them one screen at a time, before any code.
- **One decision at a time**, each with a picture.
- **Reviews:** a separate design reviewer (the rulebook, the approved mockups, screenshots at the four sizes, and §4's six WCAG 2.2 checks, v1.033); a separate code reviewer; a separate security reviewer for anything touching the database (handoff §6).
- **Order (a push to main deploys):** the migration is live before the push that brings the app that uses it. A step whose app calls a new or changed database function is merged only after Jeffrey has applied its migration and the checks passed (fingerprints, security advisor, tests file — CLAUDE.md). Screen-only steps can go first.
- **Don't change a shared part on your own** (`src/components/…`, the shared helpers in `src/lib/`, `src/styles/shared.css`): every section uses them. If you need something a part can't do, ask Jeffrey first. He decides whether you change it in your branch (then list it as a shared file) or the Dashboard core session does.
- List every CLAUDE.md shared file you touch. Dashboard core's merge adds `src/styles/shared.css` and `src/components/text.js` to that list; treat them as shared either way.
  - Star's fake database is in `src/lib/mockStar*.js`.
  - `src/lib/mockClient.js` picks up a new fake function from their `RPC_ARGS` lists by itself, so it changes only for a new `__tkdPreview` helper.
- **Status file:** keep `docs/Testing/Star Testing/TKD-StarTesting-Status.md` current. Its header still says "next: build phase 7", but phase 7 is on main (dbbacc2). Fix that and add a section for S1–S12.
- Commit on `star-testing` after each reviewed step. **Never push.**

### Rulebook

- New rows only for what Jeffrey decides in your mockups and questions, from your block **0.500–0.599** (next free today: 0.517).
- `git merge main` first, and re-read the rulebook right before editing: other sessions edit it too.
- The 10b row goes just above `| Approved 2026-10-16 (v0.26) |`, the changelog line at the end of §11. Bump the header's **Version** and **Last updated**, and keep CRLF.
- The shared parts' looks are already approved (v1.102–v1.109), so switching to one needs no mockup of the part itself. Draw your screens with them wherever Star's own layout or words change.

### Read first

1. CLAUDE.md, and `docs/Dashboard Docs/TKD-Dashboard-Handoff.md` §6.
2. **The rulebook rows** (`grep -n "decided v1\.[01]"`):
   - the decisions: v1.001 (Mark paid), v1.002 (receipt), v1.003 (Edit payment + Undo), v1.006 (Undo), v1.008 (confirm boxes), v1.010 (history), v1.011 (⋯ order), v1.013 (cards), v1.015 (registration link), v1.019 (time list), v1.024 (icons, §2.4), v1.026 (money), v1.030 (shared parts), v1.033 (WCAG 2.2, §4);
   - the shared parts: v1.100 (dialog on top, one dropdown, Grip), v1.101 (minus sign), v1.102–v1.109 (the eight parts), v1.111;
   - §8's "Are you sure?" boxes and Metric cards;
   - Star's own rows these change: v0.66, v0.92, v0.99, v0.109, v0.110, v0.112, v0.114, v0.115, v0.121, v0.164, v0.192, v0.506–v0.508, v0.512, v0.514.
3. **The change list** `docs/Design Review/End review/TKD-DesignReview-ChangeList.md`: §1, §2.3, §4, and §6 (D1a–D1d; D1c is Star's leave warning).
4. **The decisions** `docs/Design Review/Walkthrough/Decisions.md`: items 3, 3b, 4, 6, 8, 9b, 10a, 11, 12a, 14b, 16a, 17a, 19.
5. **The pictures:**
   - `docs/Design Review/Walkthrough/`: 03, 03b, 04, 06, 08, 09b, 10, 11, 12, 14b, 16a, 17a, 19;
   - `docs/Design Review/End review/`: d1a, d1b, d1c.

   Each picture shows today in amber and the drawn options in green. Copy only the option the rulebook row names as chosen. These also draw rejected options in green: 08 picture 10; 11 picture 5; 17a picture 4; d1b picture 4.
6. **For Part 2:** Dashboard core's plan and its approved mockups.
   - The plan, `docs/Dashboard Core/TKD-DashboardCore-Plan.md`: §2 (M1–M8), §2b, §3, §6 (file names), §9 (rows 9–16 are Star's boxes) and §10.
   - The mockups: `docs/Dashboard Core/Mockups/M1…M8-*.review.png`.

   Check each shared part in three places before you use it: its own header comment (the built version; it wins where the plan differs), the plan `docs/Dashboard Core/TKD-DashboardCore-Plan.md`, and the parts page `/parts.html` (preview mode only; each state has its own address, e.g. `parts.html#M2/busy`).

### Where Star stands (checked 2026-10-28)

- **No Star code has changed since phase 7** (dbbacc2, 2026-10-21), so none of S1–S12 is done.
- **Live for staff, family form off.** `VITE_STAR_TESTING` is on and `STAR_PUBLIC_REGISTRATION` is off. So a push of main changes what real staff use at once, and live candidates come from the desk.
- **Where the files are:** names without a folder are in `src/screens/testing/star/`. Its `candidates/` folder holds `CandidatesTab.jsx`, `CandidateRows.jsx`, `CandidateDialog.jsx`, `CandidateHistory.jsx`, `StarCompareDialog.jsx`, `StarPaymentDialogs.jsx` and `PrivateDialog.jsx`.

---

## Part 1 — ready now (no shared part needed)

**Start:**
- Commit any open work, then `git merge main`.
- Write the plan (the rules above).
- One mockup screen can carry S3, S4, S7 and S9: the Candidates tab's ⋯ menus (unpaid, paid and withdrawn rows, staff and admin), the toasts and the card icon. S12's migration has no screen.

**S3 — Edit payment ends with "Payment changed" + Undo** (v1.003; picture 04, 5 and 8)
- **Today:** "Payment saved", with no Undo (`CandidatesTab.jsx:603–614`; `src/lib/star/candidatesText.js:67`).
- **The Undo** calls `editPayment` on the **new** payment id (it returns it), with the old method, amount and date. Black Belt's does the same (`src/blackBelt/staff/candidates/useCandidateActions.js:406–446`).
  - Admins only, like Edit payment.
  - Keep "no money toast while Hide private details is on" (`hiddenNowRef`).
- After Edit payment and its Undo, check that Finance's Daily report for that day still shows the right payments (Finance reads them).

**S4 — Undo for 5 seconds** (v1.006; picture 06, 4)
- **After Restore:** "… restored" has no Undo (`CandidatesTab.jsx:750–762`). Undo withdraws again (admins; Restore is admins only).
- **After Change how they'll pay:** "Changes saved" has no Undo (`:559–567`). Undo puts the old choice back (`changePayingBy` with the new version).
- S3 and S4 need no database change: the existing functions do it.

**S7 — the ⋯ order** (v1.011, v1.012; picture 10: 4–5 today, 7–8 chosen)
- **Today** (`CandidatesTab.jsx:959–1014`): unpaid rows put "Edit candidate" third; paid rows mix the payment items into the first group.
- **After**, three groups:
  1. Edit details · Set private testing (or Change private day or time · Back to the testing day · Grade private testing) · Change how they'll pay;
  2. Edit payment · Undo payment · Record refund / Undo refund (Print receipt joins in Part 2, S2);
  3. Withdraw · Delete permanently.

  Withdrawn rows: Restore · Delete permanently. Items that don't apply are left out.
- **The word:** "Edit candidate" (`candidates/text.js:124`) becomes **"Edit details"**.
- **To settle in your mockup:**
  - Today "Edit candidate" opens the read-only summary (`openView`). Color Belt's "Edit details" opens the form instead (`src/screens/testing/event/EventPage.jsx:1315`).
  - Color Belt and Camps list "Review possible duplicate" in ⋯ when a row is flagged (v1.011 names it in group 1). Star has only the row's tag.

**S9 — icons** (v1.024; picture 16a)
- **Not paid card:** `ti-clock` → `ti-circle-x` (`CandidatesTab.jsx:1285`).
- **Change how they'll pay:** `ti-repeat` → `ti-switch-horizontal` (`:992`).
- "Make-up from an earlier testing" keeps `ti-repeat` (`:952`); it now means only Make-up.

**S12, the database half — migration 0028** (reserved 2026-10-28; v1.019)
- **The rule today:** `star_start_time_is_valid` (`supabase/migrations/0006_star_testing.sql:84–99`) accepts only 8:00 AM–8:00 PM on 15-minute steps.
- **Where it's used:**
  - the `star_events.start_time` table check (0006:342);
  - `star_add_event` (0006:3281);
  - `star_update_event` (the live version is 0023's, line 496);
  - `star_set_private` (0006:4378).
- **What 0028 does:** it replaces only that function (same signature) with 6:00 AM–10:00 PM, every 5 minutes. It only widens the rule, so existing rows stay valid.
- **Nothing else checks the times:** `functions/_lib/starRegister.js` only passes `start_time` on, and the family pages show any time (`startTimeLabel`).
- **Files:**
  - `supabase/migrations/0028_….sql`;
  - `supabase/tests/0028_tests.sql` and `0028_fingerprints.sql`;
  - `supabase/tests/0006_tests.sql`: it expects 7:45 AM, 8:15 PM and 10:10 AM to be refused (lines 1162–1164, 1822–1823). Make those tests pass before and after 0028, as 0023 did for its CSV keys: use times both rules refuse (5:45 AM, 10:15 PM, 10:03 AM);
  - `supabase/SETUP.md`: "## Migration 0028: …" with steps `### 0028a.` …;
  - `supabase/tests/pglite/run.mjs`: `step0028`. Let only the `star_start_time_is_valid` line of 0006's fingerprints move, as `step0023` does for its two.
- **Testing:** a separate security review. Run the PGlite tests with `cd supabase/tests/pglite && npm ci && node run.mjs` (`npm ci` once per worktree).
- **Applying:** Jeffrey pastes 0028 into the SQL Editor. Then the after-apply checks:
  - the fingerprints: 0006's (only that line moves), and 0028's against the tested copy;
  - the security advisor;
  - `0028_tests.sql` and `0006_tests.sql` on production.
- **Later:** the app's copy of the rule changes in Part 2, with the time list.

**Questions for Jeffrey now** (one at a time, each with a picture; the answers feed Part 2 and your rows):
1. **Box 15's "Keep …" words** (Undo Mark as sent, `results/ResultsTab.jsx:633`; today "Cancel", `src/lib/star/resultsText.js:130`).
   - Its sentence says "This removes the Oct 22 send record", so e.g. "Keep send record".
   - Black Belt's Results has the twin box and its prompt waits for these words: agree one "Keep …" with Jeffrey for both.
2. **The failure words** in the delete and undo boxes.
   - Today: "Couldn't save. Check the connection, then try again." (`DIALOG_FAILED`, `src/lib/star/candidatesText.js:33`). Change list §4 noted it on a delete.
   - Color Belt's "Couldn't delete. …" is in `src/screens/testing/text.js:261`.
3. **History's result-email rows** say only "Changed" (`CandidateHistory.jsx:65`; plan §10). What should they say?
4. **History while Hide private details is on** also hides the "Registered on the family form" / "Added at the desk" line (plan §10).
   - Why: `historyPrivacy` (`src/lib/star/candidatesCore.js:114–120`) counts any candidate row with a `paying_by` key as a payment.
   - The line shows no money, but today's check expects the hiding (`src/lib/star/candidatesChecks.mjs:440`).
   - Keep the line while hidden?
5. **The Candidates card on Both** lists the schools on two lines ("Worcester 12" / "Shrewsbury 11", `CandidatesTab.jsx:1096`). The shared card draws one small line under the number. Which way?
   - one line, "Worcester 12 · Shrewsbury 11";
   - or a two-line note in the shared part (the shared-part rule above).

**A check, not a question.** Plan §2b, §9 row 14 and §10 say Star's Dan-change box opens on top of the candidate dialog, so one Back press reaches both.
- In the code, the box takes the dialog's place instead (`CandidatesTab.jsx:1223–1251`, drawn as `overlayElement ?? dialogElement` at `:1343`): one dialog, one Back step.
- Check it at phone size in the preview. If the code is right, there's nothing to fix.

---

## Part 2 — after Dashboard core's step 1 is merged

**Start:** the starter above. Record the before state (Star's eight check files and both builds pass) and take shots of today's screens for your mockups.

### 1. Safety first: the confirm boxes (S5, S11)

No privacy gap was found in Star. **The one safety gap:** boxes 14 and 15 close while they work.
- An Esc or Back during the save runs `keepSavedDan` (`CandidatesTab.jsx:477`) or `closeConfirm` (`results/ResultsTab.jsx:355`). Neither checks that a save is on its way.
- The shared `ConfirmBox` (v1.008, v1.103) waits.

So all eight boxes switch to it first:

| # | Box | Today | After |
|---|---|---|---|
| 9 | Delete category | `DeleteDialog` (`RubricsTab.jsx:953`): Cancel · Delete | Keep category · **Delete category** (red) |
| 10 | Delete event | own copy `events/StarDeleteEventDialog.jsx`: Keep event · Delete event | same words |
| 11–12 | Undo payment / refund | Star's own `ConfirmBox` (`candidates/dialogParts.jsx:69`; `CandidatesTab.jsx:1140, 1154`): Keep payment / Keep refund · Undo … (blue) | same words, blue |
| 13 | Delete candidate | `CandidatesTab.jsx:1168`: Keep candidate · Delete permanently | same words |
| 14 | Dan change | `CandidatesTab.jsx:1227`: Keep 1st Dan · Change Dan and clear 4 grades (red) | same words; waits while it saves |
| 15 | Undo Mark as sent | `results/ResultsTab.jsx:633`: Cancel · Undo Mark as sent (blue) | Part 1's "Keep …" · Undo Mark as sent; waits |
| 16 | Leave warning (Grading tab and private grading page) | `event/StarEventPage.jsx:945`: Leave anyway · blue **Stay on this page** (right, focused) | **Stay on this page** left and focused · **Leave anyway** right and **red** (D1c; changes v0.192) |

**What every box gains from the approved part:**
- the button that changes nothing on the left;
- while it works, the pressed button says what it's doing ("Deleting…", "Undoing…"), "Keep …" grays too, and Esc, a click outside and Back wait;
- stacking at 320 wide;
- the failure note under the buttons, in Part 1's words;
- never the pinned button row (today the category box picks it up under 700 px tall, plan §10).

**To settle in your mockup:** each box's busy words (verb + "ing…", D1a), e.g. "Changing…" for box 14.

**Then:**
- Delete Star's own copies: `dialogParts.jsx`'s `ConfirmBox` and `StarDeleteEventDialog.jsx`.
- Leave `DeleteDialog` in place: Color Belt's classes and ranks still use it, and removing it is a shared-part change (the rule above).
- Keep every export of `src/lib/star/gradingText.js` and `gradingCore.js` that Black Belt uses. Its leave warning takes `LEAVE_ANYWAY` and `STAY_ON_PAGE` from there (`src/blackBelt/staff/cycle/CyclePage.jsx:440–443`).

### 2. Switch to the shared parts (S11)

| Star's copy today | Shared part | What visibly changes |
|---|---|---|
| `StarCompareDialog.jsx`; the inline duplicate box (`CandidatesTab.jsx:1264–1280`) | `CompareDialog.jsx`, `DuplicateBox.jsx` (v1.102) | "⚠ different" next to each differing value (today for screen readers only, `StarCompareDialog.jsx:44`); "Keeping…" while it works; the failure note no longer hides under the pinned buttons (§10); the count on the first line only (today on every line, `:1271`, §10); Review passes its opener (today `openCompare(row)`, `:808`, §10) |
| the cards (`CandidatesTab.jsx:1067–1094`, `:1282–1287`) | `CountCards.jsx` (v1.107) | the selected card's edge blue, not dark (`star.css:1083`, §10); Payments recorded a plain total, not a filter (`:1286`, §10); 16 px icons (today 14) |
| `CandidateHistory.jsx` | `HistoryLine.jsx` (v1.108) | S6 |
| `event/StarLinksDialog.jsx` | `RegistrationLinkBox.jsx` (v1.106, v1.111) | S8 |
| `events/StarSelect.jsx` in the two time fields | `TimeList.jsx` (v1.109) | S12 |
| `StarSelect` in School, Current Dan and Stars now (`CandidateDialog.jsx:410, 440, 464`) and Where (`events/StarEventDialog.jsx:306`) | `Select.jsx` (v1.100) | only v1.109's 2 px blue ring on the row the arrow keys are on |
| the private `Grip` (`DanBlock.jsx:55`) | `Grip.jsx` | nothing |
| `RecordPaymentDialog` (`StarPaymentDialogs.jsx:155`) | `MarkPaidBox.jsx` (v1.104) | S1 |
| — | `Receipt.jsx` (v1.105) | S2 |
| `dollars`, `formatDollars` | `formatMoney` (`src/lib/money.js`; v1.026, v1.101) | S10 |
| `useLiveLoad` (2 imports) and `ChoiceGroup` (7) at their old paths | `src/lib/useLiveLoad.js`, `src/components/ChoiceGroup.jsx` | nothing |

**The four dropdowns:** v1.100 made `StarSelect` the shared dropdown, so switching Star's other four follows v1.030. Point out the ring when you show those dialogs, then delete `StarSelect.jsx`.

### 3. Star's own changes with the shared parts

**S1 — Mark paid** (v1.001, v1.104; picture 03, 3 and 7)
- **The button and the box:** the row's "Record payment" (`CandidateRows.jsx:121–133`; `candidates/text.js:77–78`) becomes **"Mark paid"**. It opens the box under it:
  - the name and the amount;
  - **Paid by**, preset to `row.payingBy`, with the hint "They chose … on the form." or "… at the desk." (from `row.source`);
  - then **"Mark paid $140"**.
- **Amount and date:** the amount is `row.expectedFeeCents` (the database's fee, as today); the date is today.
- **No migration:** `star_record_payment(uuid, integer, text, integer, date)` already takes the way to pay, the amount and the date (0006 §18u). v1.104 and plan M3 are wrong to say Star's function needs the way to pay.
- **Ask in the S1 mockup (one question):** staff lose v0.110's "type another amount", e.g. a discount, or the early price on the testing day.
  - v1.001 leaves that to an admin's Edit payment afterwards.
  - v1.001's row doesn't name v0.110, so record Jeffrey's answer in your row.
- **To settle in your mockup:** where a failed or refused save shows once the box has closed. Star's row pattern is the amber bar with Retry and the row's "Not saved" tag. The "Payment recorded" toast with Undo stays.

**S2 — Print receipt** (v1.002, v1.105; picture 03b, 4–5)
- **Where:** in the ⋯ money group (S7) and in the summary's Payment part (`CandidateDialog.jsx`, `PaymentPart`), for a row with a payment. Staff and admins, as Black Belt's. Print receipt stays in the ⋯ menu and the summary; with Hide private details on, the receipt shows v1.105's one gray line, "Payment details are hidden on this tablet.", and no Print (as the approved M4 mockup).
- **The data, all read today:**
  - `star_candidate_detail` (0006 §19a): the payments (oldest first), the amount paid and the fee;
  - `loadSchools()` (`src/lib/settings/schoolsApi.js`): both schools' street and phone (Star's flyer uses it, `event/StarEventPage.jsx:627`).
- **"Printed … by [name]":** no migration needed. Either call the existing `get_my_profile` (returns `full_name`; `App.jsx` calls it at sign-in and the preview answers it) when the receipt opens, or pass a `profileName` prop from `App.jsx` through `Testing.jsx` (two shared files, added once by one branch). Ask Jeffrey once; the same answer serves Color Belt, Star and Camps.
- **Opening it from the summary:** it opens on top of the summary (the shared `onTop` mode, v1.100), or takes its place as Star's Dan-change box does.
- **To settle in your mockup:**
  - the kind line, e.g. "Star testing · payment receipt";
  - the facts (never a date of birth or an email);
  - which payment lines show: leave out undone payments and their reversals, as the summary's Payment line does (`CandidateDialog.jsx:134–150`); a refund reads "−$10" (v1.101);
  - the balance line.

**S5:** in step 1. **S11:** in step 2.

**S6 — History: one line** (v1.010, v1.108; picture 09b, 1 and 4–5)
- **The line:** the summary's always-open History part (`CandidateDialog.jsx:247–250`: the newest 5, then "Show all (n)") becomes the line "History · N changes ›" at the end of the summary.
- **Dates only:** "Oct 20, 2026, 10:05 AM · Dana Ross" (`historyHead`, `candidates/text.js:302`) becomes "Oct 20 · Dana Ross".
- **No migration:** `star_candidate_history` (0006 §19b) returns up to 500 rows with when, who, table, before and after.
- The reader's `load()` must throw when the answer's status isn't ok; otherwise `HistoryLine.jsx` shows "History · no changes yet" for a failure. Strip login ids, as `star_history_strip` (0006) does. (Star's reader already calls it. Throwing also ends plan §10's "No changes recorded yet." on a failed load, `CandidatesTab.jsx:376`.)
- **From Part 1:** the words for result-email rows, and the Registered line while hidden.
- **To settle in your mockup:** today an edit of several fields is one entry with several lines, but the shared line takes one text per entry. Join them, or one entry per field?

**S8 — the Registration link box** (v1.015, v1.106, v1.111; picture 12, 1 and 5)
- **The switch:** `event/StarLinksDialog.jsx` becomes `RegistrationLinkBox`, with Star's two schools, its line and its flyers (`StarFlyer`). M5's mockup already draws it with Star's words.
- **New: Download QR code** on each card. It saves a 1024 px PNG named "[event] - Worcester QR code.png"; its hidden name is "Download QR code, Worcester" (v1.111).
- **Copy failures** already show inside the box today.
- **Clean-up:** `starQrSvgDataUrl` (`src/lib/star/links.js`) is then used only by `eventsChecks.mjs` (`:26`, `:138–144`): drop that check with it (the shared `qr.js` is checked in `src/lib/shared/checks.mjs`).

**S10 — money** (v1.026, v1.101; picture 17a, 1)
- **One helper:** `dollars` (`src/lib/star/candidatesText.js:13–15`, about 24 uses in the Candidates screens) and `formatDollars` (Rubrics and prices: `SettingsBlocks.jsx:135–141`, `src/screens/testing/star/text.js:104–106`) both become `formatMoney`.
- **What shows:** a payment with cents reads "$140.50", not "$140.5" (plan §10).
- **Minus amounts:** Star shows none today; refunds and undone payments are written as positive amounts with words ("Refund recorded: $10 cash"). A minus appears only on the receipt.
- Leave `formatDollars` on the public family pages (`src/register/`, the camp and Black Belt forms) in this round; switch the staff screens. (Star's family form, `src/star-register/`, takes it from `src/register/format.js`.)

**S12, the screen — the time list** (v1.019, v1.109; picture 14b)
- **The switch:** both time fields become `TimeList`, with its default range of 6:00 AM–10:00 PM every 5 minutes:
  - an event's Start time (`events/StarEventDialog.jsx:287`);
  - a private testing's Time (`PrivateDialog.jsx:85`).
- **What shows:** 193 times instead of 49; typing a number jumps to that hour; "Choose…" becomes the approved "Choose a time".
- **The app's copy of the rule widens with it:** `src/lib/star/starEventRules.js:27–29` (the fakes use it). Update the two checks that test the old rule: `src/lib/star/eventsChecks.mjs:116–126` and `src/lib/star/candidatesChecks.mjs:707`.
- **Order:** this step merges only after 0028 is live (the order rule). Until then `TimeList` can take Star's old range, through its `from`, `to` and `step` props.

---

### Waits for another session

- **The offline bar** (M12, Dashboard core step 2). Star grading keeps its grade-by-grade line (v1.005).
  - When M12 is built, ask Jeffrey whether Star grading's own offline banner stays beside it.
  - Black Belt reuses that banner, so don't change it on your own.
- **The top-bar people search** (M16) comes later and will search Star's candidates. Nothing to do now.

### Found by the Dashboard core session (not decided)

Plan §9 (boxes 9–16) and §10's Star points are all placed above:
- the ones that need Jeffrey are Part 1's questions and its check;
- the rest are fixed by Part 2's switches, marked "§10" there.

Confirm each in the preview after the switch.

### Done when

- **Part 1:**
  - S3, S4, S7 and S9 are built, reviewed and approved by Jeffrey in the preview;
  - 0028 is reviewed, its PGlite tests pass, and Jeffrey has applied it and the after-apply checks passed;
  - the questions are answered and recorded.
- **Part 2:** S1, S2, S5, S6, S8, S10, S11 and S12's screen are built, reviewed and approved by Jeffrey in the preview.
- **Recorded:** every decision Jeffrey makes is a row from your block.
- **Builds and checks pass:**
  - `npm run build` and `npm run build:preview-mode`;
  - Star's eight check files (`node src/lib/star/<name>Checks.mjs`, for calendar, candidates, events, grading, home, public, results and rubrics);
  - in Part 2, `node src/lib/shared/checks.mjs`;
  - after 0028, the PGlite tests.
- **Wrapped up:** the status file is current, the work is committed on `star-testing`, and nothing is pushed. The Main session merges when Jeffrey asks, in the order above.
