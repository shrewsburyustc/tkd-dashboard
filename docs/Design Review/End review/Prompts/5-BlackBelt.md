# Prompt 5 — Black Belt testing: the design review's changes (BB1–BB20)

**Paste into:** the Black Belt testing session (branch `black-belt`, worktree `black-belt-testing-section-b90531`).
- **Part 1 now** (Jeffrey asked sections to start what's ready).
- **Part 2 after Dashboard core's step 1 (branch `dashboard-core`) is merged into main.**

This file reaches your worktree when `design-review` is merged into main; until then the Design Review session sends its text by message.

**Starter to paste (Part 2):**

> `git merge main` first (the shared parts are on main now). Check that `src/components/ConfirmBox.jsx` exists; if not, stop and tell Jeffrey. Then read and do Part 2 of `docs/Design Review/End review/Prompts/5-BlackBelt.md`. Mockups first; nothing is built before I OK them.

---

## The brief (both parts)

These are the design review's decided changes for Black Belt testing. The decisions are already rulebook rows: **v1.000–v1.034** (the walkthrough) and **v1.100–v1.111** (the shared parts, built by the Dashboard core session). Part 1 needs no shared part; Part 2 uses them. Each item keeps its change-list ID (BB1 …) so Jeffrey can trace it.

Line numbers were checked on main on 2026-10-28. Where paths start:
- `staff/…` and `form/…` are under `src/blackBelt/`;
- `candidates/…`, `cycle/…`, `cycles/…`, `rubric/…`, `results/…`, `receipt/…` and `grading/…` are under `src/blackBelt/staff/`.

### Rules

- Follow CLAUDE.md.
- **Plan first:** a short plan (each item, its files, its mockup, any migration) in your docs folder; show it to Jeffrey.
  - Part 1's plan is `docs/Testing/Black Belt Testing/TKD-BlackBelt-DesignReview-Plan.md` (70e2612). Add Part 2 to it.
- **Preview mode for building and trying changes:** `npm run dev:preview-mode`. `npm run dev`, `npm run preview` and `Start dashboard.bat` use the live database (`.worktreeinclude` copies `.env.local` into every worktree): run them only for a check Jeffrey OKs, never to try a change. `npm run build` is fine: it only builds.
- **Mockups before code** for every visual change, at PC 1280×800, tablet 820×1180 touch, phone 390×844 touch and 320 wide: a self-contained HTML file plus one PNG per screen with what changes outlined in amber (Jeffrey reviews the PNGs). He OKs them one screen at a time, before any code.
- **One decision at a time**, with pictures and a recommendation.
- **Reviews:** a separate design reviewer (the rulebook, the approved mockups, screenshots at the four sizes, and §4's six WCAG 2.2 checks, v1.033); a separate code reviewer; a separate security reviewer for anything touching the database (handoff §6).
- **Order (a push to main deploys):** the migration is live before the push that brings the app that uses it. A step whose app calls a new or changed database function is merged only after Jeffrey has applied its migration and the checks passed (fingerprints, security advisor, tests file — CLAUDE.md). Screen-only steps can go first.
- Run the PGlite tests with `cd supabase/tests/pglite && npm ci && node run.mjs` (`npm ci` once per worktree).
- **Don't change a shared part on your own** (`src/components/…`, the shared helpers in `src/lib/`, `src/styles/shared.css`): every section uses them. If you need something a part can't do, ask Jeffrey first. He decides whether you change it in your branch (then list it as a shared file) or the Dashboard core session does.
- List every CLAUDE.md shared file you touch. Dashboard core's merge adds `src/styles/shared.css` and `src/components/text.js` to that list; treat them as shared either way.
- Keep `docs/Testing/Black Belt Testing/TKD-BlackBelt-Status.md` current.
- Commit on `black-belt` after each reviewed step. **Never push.**

**Rulebook:** new rows only for what Jeffrey decides in your mockups, from your block **0.900–0.999** (next free 0.963).
- Run `git merge main` first, and re-read the rulebook right before editing.
- The 10b row goes just above `| Approved 2026-10-16 (v0.26) |`; the changelog line goes at the end of §11; bump the header's Version / Last updated. Keep CRLF.
- A row that changes an older one adds a "(See v0.9xx …)" note at the start of that row.
- **Merging main for Part 2:** expect a rulebook conflict if your v0.961 / v0.962 (or newer rows) aren't on main yet. Main's v1.100–v1.111 sit at the same places: the 10b rows, the changelog and the Version line. Keep both sides, and explain each conflict to Jeffrey before resolving it (CLAUDE.md).

### Read first

1. The rulebook, `docs/Dashboard Docs/TKD-Dashboard-Design-Guidelines.md`:
   - §4 (the six WCAG 2.2 checks), §7, and §8's "Are you sure?" boxes, Metric cards, Toasts and errors;
   - the 10b rows **v1.001–v1.008, v1.010, v1.011, v1.013–v1.016, v1.018, v1.019, v1.022, v1.023, v1.026, v1.030** and **v1.100–v1.111**;
   - the Black Belt rows they change: v0.218, v0.219, v0.220, v0.900, v0.902, v0.904, v0.911, v0.912, v0.914, v0.921, v0.928, v0.932, v0.937, v0.955;
   - also v0.507 (the words for hidden values) and your own v0.961.
2. `docs/Dashboard Docs/TKD-Dashboard-Handoff.md` §6 (the rules for every database change).
3. The change list `docs/Design Review/End review/TKD-DesignReview-ChangeList.md`: §1, §2.4 (BB1–BB20), §4, and §6 (D1a–D1c, D4, D10a).
4. Jeffrey's own words, `docs/Design Review/Walkthrough/Decisions.md`: items 3, 3b, 4–8, 9b, 10a, 11, 11b, 12a, 12b, 14a, 14b, 15c, 15d, 17a and 19.
5. **The pictures:**
   - `docs/Design Review/Walkthrough/`: 03, 03b, 04, 05, 06, 07, 08, 09b, 10, 11, 12, 12b, 14, 14b, 15c, 15d, 17a, 19;
   - `docs/Design Review/End review/`: d1a, d1b, d1c, d4, d10a.

   Each picture shows today in amber and the drawn options in green. Copy only the option the rulebook row names as chosen. These also draw rejected options in green: 07 picture 6; 08 picture 10; 11 picture 5; 15c picture 6; 17a picture 4; d1b picture 4; d4 pictures 4–5; d10a picture 4.
6. **For Part 2,** `docs/Dashboard Core/TKD-DashboardCore-Plan.md`:
   - §2 (M1–M8);
   - §2b (dialogs on top, `Select`, `Grip`: mostly for you);
   - §3 (M9–M11) and §6 (file names);
   - §8, §9 rows 17–27 (your confirm boxes today) and §10.

   Check each shared part in three places before you use it: its own header comment (the built version; it wins where the plan differs), the plan `docs/Dashboard Core/TKD-DashboardCore-Plan.md`, and the parts page `/parts.html` (preview mode only; each state has its own address, e.g. `parts.html#M2/busy`).
7. Your status file and plan, and the checkpoints in `docs/Dashboard Docs/Build contracts/CONTRACT-0016.md` §13.

No privacy gap was found in today's Black Belt code. The privacy work here is BB8's history reader and the "this device" question (Part 1).

---

## Part 1 — ready now (no shared part needed)

Build the items in the order Jeffrey chooses. Your own confirm boxes stay until Part 2 (BB7, BB19).

**BB18 — CP6: done; keep it.**
- **Finance's F8 is live.** Migration 0026 was applied on 2026-10-28 (tests passed on production), `finance` is merged into main (56308ff), and it is deployed (origin/main 6d140e4). So D7's limit is lifted: Black Belt payments reach the Daily report. Your status file's CP6 checklist records F8 as met (70e2612).
- **No cycle's registration is opened before CP6** (v0.961: the waiver text and the test registration come first).

**BB3 — Edit payment and Undo payment in the row ⋯** (v1.003; picture 04 #4 and #6, picture 10 #10).
- **Today:** the row ⋯ (`candidates/CandidatesTab.jsx:196–255`) has neither. Both are on each payment line's ⋯ in the detail (`candidates/CandidateDialog.jsx:372–396`, admins only). That stays for older payments.
- **The change:** add both to the row ⋯ for admins, acting on the **latest** payment.
  - They are grayed with the detail's reasons (a returned check, a recorded refund).
  - The roster row carries no payment lines, so load the candidate first, as the detail does.
- **The confirmation must name the payment.** Today one card payment that covered three installments gets the title "Undo payment 1 + Payment 2 + Payment 3?" (`staff/text.js:782`, `undoPaymentTitle`). Show Jeffrey a clearer title (amount, how, when). The box's buttons change in Part 2 (BB7).
- After Edit payment and its Undo, check that Finance's Daily report for that day still shows the right payments (Finance reads them through 0026).

**BB9 — one ⋯ order** (v1.011; picture 10, #3 → #10).
- **The row ⋯:** Edit details · Change plan or Kukkiwon — Edit payment · Undo payment · refunds · Print receipt — Withdraw · Delete permanently. Items that don't apply are left out.
- **To settle in your mockup:**
  - where Record payment goes on tablets and phones (it sits in the ⋯ there, v0.900) — first in the money group fits;
  - the detail's ⋯: Edit details · Change plan or Kukkiwon — Withdraw · Delete permanently. Money stays on each payment line's ⋯ and on the Print receipt button.

**BB6 — Withdraw · Delete permanently** (v1.007; picture 07, #4–5 → #7–8).
- "Remove candidate" (`CandidatesTab.jsx:253`, `CandidateDialog.jsx:352`) and its choice box (`candidates/RemoveDialog.jsx`) become two items in the row ⋯ and the detail's ⋯ (admins):
  - **Withdraw** — plain, happens at once, with its Undo toast as today;
  - **Delete permanently** — red, asks first (your own box until Part 2). It is grayed with its reason while there are payment records (v0.904) or grades (v0.950), in the words withdrawn rows already use.

**BB4 — refusals stay on screen** (v1.004; picture 05, #1–2 → #4–5).
- **These refusal toasts move to the amber bar:**
  - `candidates/useCandidateActions.js:308` — every quick action's refusals, e.g. "Too late to undo here. Ask an admin.";
  - `:120` — "This candidate was deleted.";
  - `candidates/useMakeupPicker.js:164`;
  - `cycle/CycleRubricTab.jsx:106` — the rubric was locked by grading;
  - `cycle/CyclePage.jsx:142` — "This cycle was deleted.".

  v1.004 moved Prospects' "That prospect no longer exists." to the bar, and the two "deleted" toasts are the same kind.
- **The grayed Add candidate** says why only in a toast when pressed (`cycle/CyclePage.jsx:182`; plus a hidden line for screen readers). It gets a visible gray line next to it. Settle where that line goes, on the PC and on phones, in your mockup.
- **Not this item:** the Results tab's own offline bar (`results/text.js:103`). It is M12's open question for the Dashboard core session (step 2). Leave it until Jeffrey decides there.

**BB5 — Undo for 5 seconds** (v1.006; picture 06).
- **No Undo today after:**
  - Edit details (`useCandidateActions.js:766`, `:844`);
  - Restore (`:955`);
  - Add / Edit cycle (`cycle/useCycleEditor.jsx:246`).
- **Undo only what can be reversed:** a Dan change that cleared grades can't be undone (it asked first). Undoing Add cycle means deleting the cycle.
- **Found, not decided:** the Rubric tab's waiver and keeping-time saves (`rubric/RubricTab.jsx:68`) have no Undo either, and v1.006 names only Edit details and cycle saves. Ask Jeffrey with this mockup.

**BB11 — no lock icons** (v1.016; picture 12b, #2 → #5). Close registration / Open registration keep their words and lose `IconLock` / `IconLockOpen`: `cycle/CyclePage.jsx:30, 261, 269` and `cycles/CyclesTab.jsx:23, 326, 334`.

**BB12 — Star's date picker** (v1.018; picture 14).
- `src/components/DatePicker.jsx` (on main already) replaces both copies, as your approved mockups drew it (v0.911):
  - `staff/parts/DateField.jsx` (5 users: AddCandidateDialog, CandidateDialog, CycleDialog, DayDialog, PricesSection);
  - `form/DateField.jsx` (the family form's date of birth).
- The date-of-birth fields copy Star's birthday set-up:
  - `src/screens/testing/star/candidates/CandidateDialog.jsx` (staff);
  - `src/star-register/DobField.jsx` (the family page).
- The family page is a live public page: try it in the preview (`__tkdPreview.bbLinks()` prints local links). The CP6 test registration then checks it on the real page.

**BB17 — "Rubric and waiver"** (v1.023, D4; picture d4 #3).
- Change the tab name (`TAB_RUBRIC`, `staff/text.js:124`) and every mention:
  - `WAIVER_NEEDED` (`:78`) and `LOADING_RUBRIC` (`:365`);
  - `results/text.js:241`, "Only an admin can change Rubric and prices…";
  - the preview's placeholder waiver (`src/lib/blackBelt/startingPoint.js:24`);
  - the comments: 16 files under `src/` mention it (`git grep -n "Rubric and prices" -- src`).
- The tab's first line keeps "Same for both schools. Prices are set on each cycle."
- The applied migrations (0016, 0024) keep their comments and the seeded placeholder waiver. The school's waiver replaces that placeholder at CP4.

**Questions for Jeffrey** (one at a time, each with a picture):
- **BB20 — "Worcester and Shrewsbury":**
  - The printed results sheet says "Testing days … · Worcester and Shrewsbury" (`results/text.js:168–173`, approved in R05, v0.947).
  - Your screens already say "both schools", and v1.022's "Both schools" is about the top bar's Both and the page lines.
  - Change the print, or keep it? The result emails' sign-off ("… Taekwondo Center / Worcester and Shrewsbury") is the school's signature: leave it.
- **"On this device":**
  - v0.507 asks for "… on this tablet" on every screen.
  - Part 2's shared parts change two of your strings (the Compare dialog, v1.102; the receipt, v1.105). Two more would then differ:
    - `staff/text.js:608–609`: "Hidden on this device", "Payments are hidden on this device.";
    - `results/text.js:104`: "Email result is off on this device. Email results at the desk." (Star's says "… off while private details are hidden …").
  - Switch them?

**Check (no build unless it fails):** opening Black Belt from "Color belt testing" kept showing Black Belt until a reload (walkthrough, 2026-10-22; `Testing.jsx`'s `blackBeltOpen`).
- C2 (102742a) removed that state; try it in the preview with the Star switch on.
- If it's still there, the fix is in `src/screens/Testing.jsx` / `src/App.jsx` (shared files).

### The database half: one migration for BB8 and BB13

- **Steps:**
  - ask the **Main session for the migration number** (0030 is the next free today);
  - SETUP "## Migration 00NN: …" (v0.302) and run.mjs step `step00NN` (v0.304);
  - a tests file and a fingerprints file;
  - the security review;
  - Jeffrey applies it, then the after-checks: fingerprints, the security advisor, the tests on production.
- **Its screens come in Part 2** and merge only once it is live (the Order rule).
- **BB8 — a history reader** (v1.010). No Black Belt function reads `change_log` (RLS on, no grants). The model is Star's `star_candidate_history` and `star_history_strip` (`supabase/migrations/0006_star_testing.sql:5755`, `:2558`).
  - **What Black Belt writes there:**
    - candidates, with date of birth, email and `age_kept` masked as "on file" / "changed" (0016's `bb_candidates_log`, replaced in 0025:1762);
    - waivers, with the signature and signer masked;
    - payments, as full rows;
    - cycles and their parts, and 0024's rubric tables;
    - 0025's grades, extra-point counts, make-up subjects, result texts and sends.
  - **Rules for the reader:** it never returns what the masks hide, checks `has_data_access()` first, and returns `{status: …}` (handoff §6).
  - **With it:** its loader in your data layer, and its twin in the preview store (`src/lib/blackBelt/mockBlackBelt.js` keeps no change log yet).
  - The reader's `load()` must throw when the answer's status isn't ok; otherwise `HistoryLine.jsx` shows "History · no changes yet" for a failure. Strip login ids, as `star_history_strip` (0006) does.
- **BB13 — 5-minute times** (v1.019). `bb_time_is_valid` (`supabase/migrations/0016_black_belt.sql:122–137`) accepts only 15-minute steps. `bb_cycle_days`' table checks (`:393`, `:410`) and the cycle functions of 0016, 0024 and 0025 use it. Widen it to 5-minute steps; the range stays 6:00 AM–10:00 PM.
  - Change `0016_tests.sql:1237`'s '10:10' to a time both rules refuse (e.g. '10:07'), so the tests pass before and after the migration. Let your `run.mjs` step allow 0016's `bb_time_is_valid` fingerprint line to move, as `step0023` does for 0006.
  - The preview store's copy of the rule changes with the migration (`src/lib/blackBelt/mockBlackBelt.js:327–328`, checked at `src/lib/blackBelt/checks.mjs:662`). The app's own rule changes with the screen (Part 2, BB13).
- **BB3, BB5 and BB6** should need no database change: the existing functions undo, withdraw and delete. If the plan finds otherwise, add it to this migration.

---

## Part 2 — after Dashboard core's step 1 is merged

### The switch to the shared parts (BB15, with BB1, BB2, BB10, BB13, BB14)

"Users" means the files that import it on main today. Delete each old copy once nothing uses it.

| Black Belt today (users) | Shared part | What visibly changes |
|---|---|---|
| `staff/parts/InnerDialog.jsx` (8: AddPlanDialog, DayDialog, ConfirmDialog, ReceiptDialog, CopyDanDialog, DiscardDialog, SplitBracketDialog, SubjectDialog) | `Dialog.jsx` with `onTop` (and `returnFocusTo`) | nothing; Back closes the top dialog first |
| `staff/parts/ConfirmDialog.jsx` (3: Delete cycle, Undo Mark as sent, "Delete personal details now?"), plus the hand-written boxes: UndoPaymentDialog, RemoveDialog's delete box, DanChangeDialog, DiscardDialog, the grading leave warning (`cycle/CyclePage.jsx:432–443`) | `ConfirmBox.jsx` (`ConfirmButtons` for a button row inside another dialog) | see BB7 and BB19 |
| `candidates/CompareDialog.jsx` + `DuplicateBox.jsx` | `CompareDialog.jsx` + `DuplicateBox.jsx` | "Hidden on this device" → "Hidden on this tablet"; "Keeping…" while it works; the failure note is no longer hidden under the buttons (v1.102) |
| `candidates/SummaryCards.jsx` | `CountCards.jsx` | phones get the 2×2 cards instead of the Late / Not paid pills (v1.107, changes v0.219); your duplicates line becomes the row's `note` |
| `receipt/` (ReceiptDialog, ReceiptPage, receipt.css, text.js) | `Receipt.jsx` | see BB2 |
| `cycle/LinksDialog.jsx` + `src/lib/blackBelt/qr.js` (keep its `blackBeltLink`) | `RegistrationLinkBox.jsx` + `src/lib/qr.js` | see BB10 |
| `staff/parts/SelectField.jsx` (3: DayDialog's times and Place, GradingTab's day switch, SubjectDialog) | `Select.jsx`; the times use `TimeList.jsx` (BB13) | the list opens with the choice in the middle; the row the arrow keys are on gets the 2 px focus ring (v1.109) |
| `staff/parts/Choice.jsx` (9) | `ChoiceGroup.jsx` | `ChoiceGroup` takes no `className`, but you pass one for `bb-segmented--fill` / `--compact`, `is-invalid`, `is-locked` and `bbr-gray`: ask Jeffrey (rule above). Show any look that changes. |
| `candidates/dialogParts.jsx`'s `MethodField` | `PaidByField` (exported by `MarkPaidBox.jsx`) | see BB1 |
| `staff/parts/Grip.jsx` (2: PricesSection, RubricEditor) | `Grip.jsx` | nothing |
| `usePaymentsHidden` (4: CandidatesTab, CyclePage, ReceiptDialog, ResultsTab) | `usePrivateDetailsHidden` from `src/lib/privateDetails.js` | nothing |
| `useLiveLoad` (9 imports) and `ChoiceGroup` (2) from `src/screens/testing/events/` | `src/lib/useLiveLoad.js`, `src/components/ChoiceGroup.jsx` | nothing |
| `formatCents` (one line that calls `formatMoney` since step 1) and `formatDollars` in `cycle/PricesSection.jsx` | `formatMoney` in `src/lib/money.js` | see BB14 |

**Not in this round** (v1.100, "later"): `grading/PickerSheet.jsx` and `rubric/ResultEmailsBlock.jsx` (copies shared with Star), and the family page's header strip.

### Black Belt's own changes

**BB1 — "Paid by", not "Method"** (v1.001, v1.104; picture 03, #4 → #8).
- Record payment, Edit payment and Record refund say "Method" (`staff/text.js:748`, `MethodField` in `candidates/dialogParts.jsx:54`). Switch them to `PaidByField`.
- Your form records no way to pay, so there is no preset and no hint (as today, OP-B5).
- **To settle in your mockup:**
  - `PaidByField` has no error state. Keep your amber "Choose cash, check or card." under it.
  - Record refund: "Paid by" reads oddly for money going back, and v1.001 names only taking a payment. Ask Jeffrey.

**BB2 — the shared receipt** (v1.002, v1.105; picture 03b).
- Print receipt stays in the ⋯ menu and the detail; with Hide private details on, the receipt shows v1.105's one gray line, "Payment details are hidden on this tablet.", and no Print (as the approved M4 mockup). Black Belt hides the item today (`CandidatesTab.jsx:252`); it follows v1.105 when it switches.
- Print also grays while the receipt loads or can't load (v1.105). Everything else is your receipt, made shared.

**BB7 — the confirm boxes** (v1.008, v1.103; pictures 08 #2 → #7, d1a #4, d1b #3, d1c #3). Plan §9 rows 17–27 list today's words, first focus and busy behaviour. Every box gets:
- the button that changes nothing on the left;
- the action on the right, red when it loses something for good;
- while it works, the pressed button says what it is doing ("Deleting…", "Undoing…"), and both buttons gray until it's done.

The boxes:
- **Delete cycle** (`cycles/CyclesTab.jsx:555`): "Cancel" → **"Keep cycle"** · "Delete cycle" (red).
- **Undo payment / refund / returned mark** (`candidates/UndoPaymentDialog.jsx`):
  - "Cancel" → **"Keep payment"** / "Keep refund" / a "Keep …" for the mark;
  - the action repeats the menu's words: "Undo returned mark" (today "Undo the mark");
  - they stop closing while they work (plan §10).
- **"Delete personal details now?"** (`rubric/KeepYearsDialog.jsx`, `staff/text.js:402–403`): "Cancel" · "Save and delete" (red). The "Keep …" words are to settle in your mockup.
- **Undo Mark as sent** (Results; §9 row 19): "Cancel" → a "Keep …". Agree one "Keep …" with Jeffrey for both Black Belt and Star (Star's S5 has the twin box).
- **The grading leave warning** (`cycle/CyclePage.jsx:432–443`; §9 row 27): **"Stay on this page" on the left and focused, "Leave anyway" on the right and red.** v1.008 lists three leave warnings; its one-order rule covers this fourth one too.
- **Delete permanently** (§9 row 25) already says "Keep candidate". It stops closing while it works.

**BB8 — the history line** (v1.010, v1.108; picture 09b #6).
- "History · N changes" goes at the end of the candidate summary, after the totals: `HistoryLine.jsx`, with Part 1's loader.
  - Dates only, e.g. "Oct 22 · Jeffrey Berg".
  - With Hide private details on, money changes are left out, and one line says "Payment history is hidden on this tablet." (v1.108).
  - Date of birth and email can only show as "changed": the log masks them (v0.907).
- **To settle in your mockup:** which changes show, and their words (Star's history includes grades).

**BB10 — "Registration link" in the page header** (v1.015, v1.106, v1.111; picture 12, #3 → #6).
- **Today:** "Registration links" is an item in the cycle page's ⋯ (`cycle/CyclePage.jsx:258`).
- **The change:**
  - It becomes an outline **"Registration link"** button in the header, for staff and admins: Star's button word; the box keeps the title "Registration links".
  - The box is `RegistrationLinkBox.jsx` with both schools, no flyer, and your `?dan=` line as its `footnote`.
  - Download QR code saves a 1024-px PNG named "[cycle] - [school] QR code.png" (today about 450 px).
  - A failed copy or download shows its note inside the box.
- **To settle in your mockup:** the header on phones (Add candidate, Registration link, ⋯).
- **The Cycles list:** its row ⋯ keeps "Copy Worcester link" / "Copy Shrewsbury link" (v1.015 doesn't name them). But their failure words name the old ⋯ item: "… Open Registration links on the cycle page …" (`staff/text.js:93`). Update them and show Jeffrey the new sentence.
- `src/lib/blackBelt/checks.mjs:34` and `:461–470` test the old QR helpers; update that check when they go.

**BB13 — the shared time list** (v1.019, v1.109; picture 14b).
- The testing day dialog's Start and End times (and the second part's) become `TimeList.jsx`: every 5 minutes, 6:00 AM–10:00 PM.
- Until the migration is live, the testing day dialog's `TimeList` passes `step={15}`.
- Then change the app's own rule: `src/lib/blackBelt/rules.js:51–53` and `:84–94`, and its checks at `src/lib/blackBelt/checks.mjs:121–126`, `:237`, `:276`.

**BB14 — one money helper** (v1.026, v1.101; picture 17a).
- Leave `formatDollars` on the public family pages (`src/register/`, the camp and Black Belt forms) in this round; switch the staff screens.
- So `form/format.js` keeps it. `cycle/PricesSection.jsx` and the `formatCents` callers move to `formatMoney`.
- Nothing changes on screen for your whole-dollar prices. Only the Add cycle grid's preview of a typed "12.5" says "$12.50" instead of "$13".

**BB19 — Discard and the Dan change** (v1.008, D10a; picture d10a #3).
- **"Discard changes to 1st Dan?"** (`rubric/DiscardDialog.jsx`): **Keep editing on the left and focused first, Discard on the right and red** (changes v0.928 / v0.932). Phones keep v0.56's note with "Discard changes".
- **The Dan-change box** (`candidates/DanChangeDialog.jsx`): it keeps its place: like Star's, it replaces the candidate dialog while open (`CandidatesTab.jsx:415`, `:441`). Opening it on top instead isn't decided; ask Jeffrey with the mockup if you think it should.
  - "Cancel" → **"Keep 1st Dan"** (the current Dan), as Star's; the red "Change Dan and clear 9 grades" stays.
  - On phones it becomes the shared small box, instead of v0.955's full-screen page with the red button on top. Show it.

---

## Waits for another session

- **Font weight 600:** your CSS uses it 24 times (grading.css 13, blackBelt.css 6, form.css 2, receipt.css 2, results.css 1), but rulebook §7 allows 400 and 500 only.
  - Not decided: Dashboard core's D6 (the receipt's font weights) was asked on 2026-10-28; the rest is a later question.
  - **Don't change weights unless Jeffrey decides.**
- **Later:**
  - the top-bar people search (v1.031; the Dashboard core session) will read your candidates;
  - emailed receipts (the change list's D9).

## Found by the Dashboard core session (not decided)

Plan §9 rows 17–27 and §10's Black Belt lines are all covered by Part 2's switch (the table and BB7).
- Confirm each in the preview.
- Where a fix would change the screen in a way no row decided, ask Jeffrey first (one question, with a picture).

## Done when (both parts)

- Every item is built, reviewed (design, code, and security for the migration) and approved by Jeffrey in the preview. The questions are answered.
- Jeffrey's decisions are recorded as rows from your block.
- These pass:
  - `npm run build` and `npm run build:preview-mode`;
  - `src/lib/blackBelt/checks.mjs`, plus `src/lib/shared/checks.mjs` in Part 2;
  - the Function tests (`node --test functions/tests/`);
  - after the migration, the PGlite tests.
- The status file is current.
- The work is committed on `black-belt`. **No push.** The Main session merges when Jeffrey asks, following the Order rule. Jeffrey applies the migration only with his OK.
