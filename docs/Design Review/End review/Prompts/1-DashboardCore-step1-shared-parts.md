# Prompt 1 — Dashboard core, step 1: the shared parts (design review M1–M11)

**Paste into:** a new worktree session, after the Main session has done prompt 0. The short starter is below; the full brief follows it. The session reads the brief from this file.

**Starter to paste:**

> You are the Dashboard core session (branch `dashboard-core`). Read CLAUDE.md first and follow it exactly. Then read and do `docs/Design Review/End review/Prompts/1-DashboardCore-step1-shared-parts.md` — step 1, the shared parts. Mockups first; nothing is built before I OK them.

---

## The brief

You build the dashboard's **shared parts**: one of each, in one place. Each section then switches to them in its own later prompt. This is the design review's "Main, step 1" (items M1–M11). Jeffrey set the order in the walkthrough (item 19, rulebook v1.030): **Main builds the shared parts first, then each section's prompt says "use the shared part"**.

**"Main" means two things here.** In the rulebook rows and the change list, "Main" as an owner means the dashboard's own work, and that is you. "The Main session" is the session in the main folder that merges branches and reserves migration numbers.

**Nothing on screen changes in this step** (v1.030). You build the parts and prove them. You don't switch any section's screens to them; each section does that in its own prompt. Moving a helper or a word to its shared place is fine when what shows stays exactly the same.

**Main's own screens are yours.** No section prompt switches Staff accounts, Settings, the account dialogs, Home or `src/App.jsx` to the shared words and parts, so you do that yourself in this step:
- their own copies of the shared words (e.g. `src/screens/staff/text.js`, `src/screens/settings/text.js`);
- `App.jsx`'s import of `usePaymentsHidden`, which still comes from Finance's folder.

Nothing on screen changes.

### Read first

1. **CLAUDE.md**, every rule. In particular: plan before building, mockups at PC, tablet and phone before code, one decision at a time, a separate reviewer agent, no push, header comments written for a learner.
2. **The rulebook** `docs/Dashboard Docs/TKD-Dashboard-Design-Guidelines.md`:
   - §1–§8;
   - §10b rows **v1.000–v1.034** (the design review's decisions);
   - the §2.4 icon map;
   - §4: WCAG 2.2 AA and the six checks it added (v1.033). Every part must pass them.
   - §5 (privacy).
3. **The change list** `docs/Design Review/End review/TKD-DesignReview-ChangeList.md`:
   - §1 (order of work);
   - §2.1 (your items M1–M17);
   - §4 (open notes, two of them about confirm boxes);
   - §6 (the open-detail decisions D1a–D10b).
4. **The decisions in Jeffrey's own words**, `docs/Design Review/Walkthrough/Decisions.md`, and the pictures named below (in `docs/Design Review/Walkthrough/` and `docs/Design Review/End review/`).
   - Each picture shows today in amber and the drawn options in green.
   - **Some also draw rejected options in green**: 08 picture 10, 11 picture 5, 11b picture 3, 17a picture 4 (its only green drawing: the chosen option B changes nothing on screen), d1b picture 4, d10a picture 4, d2b pictures 5–7. Read each caption.
   - Copy only the option the rulebook row names as chosen.

### Setup (CLAUDE.md, "First thing in a new worktree session")

- Run `git branch -m dashboard-core`. `git log -1` must show main's latest commit, which contains the design review's rows and these prompts. If it doesn't, run `git merge --ff-only main`. Then run `npm ci`.
- **Preview mode only.** Work and test only with `npm run dev:preview-mode`, which uses the fake database.
  - Never run `npm run dev`, `npm run preview` or `Start dashboard.bat` in this worktree. They would use the live database: `.worktreeinclude` copies `.env.local` into every new worktree. (`npm run build` is fine: it only builds.)
- Rulebook block **1.100–1.199**, in order. Run `git merge main` before every rulebook edit.
- Status file: create `docs/Dashboard Core/TKD-DashboardCore-Status.md` and keep it current every turn.

### The parts (build each once: UI in `src/components/`, helpers in `src/lib/`)

Each part follows the rulebook rows named.

**Re-survey the code before you plan.** The copies listed here were counted on 2026-10-23 and checked again on 2026-10-25. Black Belt has merged grading and results since the walkthrough. For example, its `grading/PickerSheet.jsx` and `rubric/ResultEmailsBlock.jsx` were copied from Star.

**M1 — Compare dialog and possible-duplicate box** (v1.030).
- One design, four copies today:
  - `src/screens/testing/event/CompareDialog.jsx` (Color Belt)
  - `src/screens/testing/star/candidates/StarCompareDialog.jsx`
  - `src/screens/camps/CompareDialog.jsx`
  - `src/blackBelt/staff/candidates/CompareDialog.jsx`
- The box: `src/screens/camps/DuplicateBox.jsx`, `src/blackBelt/staff/candidates/DuplicateBox.jsx`, and inline in Color Belt's event page and Star's Candidates tab.
- Each section keeps its own noun ("registered twice" / "signed up twice").
- Prospects has no duplicate check, by decision (v0.244).

**M2 — the confirm box ("are you sure?")**
- Rows and pictures: v1.008 with D1a–D1d and D10a; §2.1's exception; §7; §8 "Are you sure?" boxes. Pictures `Walkthrough/08-are-you-sure-boxes.png`, `End review/d1a-busy-box.png`, `d1b-narrow-buttons.png`, `d1c-button-order.png`, `d1d-safe-words.png`, `d10a-bb-discard.png`.
- **Words.**
  - The button that changes nothing says what stays: "Keep …" for a thing ("Keep payment", "Keep student"; "Keep it" where there's no short name), "Stay …" for a place ("Stay on this page", "Stay in the dashboard").
  - The action repeats the words pressed ("Delete class", not "Delete").
  - "Cancel" is never a confirm-box button; it stays in form dialogs.
- **Order and colour.** The button that changes nothing goes on the **left**. The action goes on the **right**: **red when it loses something for good**, blue otherwise.
- **First focus** goes on the button that changes nothing when the action loses something; otherwise on the action.
- **While it works.**
  - The pressed button grays and says what it is doing: its verb + "ing…" ("Deleting…", "Undoing…"), in the approved unavailable look.
  - "Keep …" grays too, and Esc, a click outside and Back wait until it's done. So nothing can be pressed twice.
  - The unavailable look exists for `.btn-primary` (`src/styles/testing.css`) and `.btn-delete` (`src/styles/calendar.css`). It doesn't exist yet for a plain `.btn`, which "Keep …" uses, so draw it in the mockup.
- **Small phones.** When the two buttons don't fit on one line, they stack, each the full width of the box, in the row's order. Never full screen: `src/components/Dialog.jsx` already keeps confirmations off full screen.
- **The same box serves** the leave warnings ("… isn't saved": "Stay on this page" / red "Leave anyway") and Black Belt's "Discard changes?" box.
- **Two notes from the walkthrough** (change list §4); the shared box must get both right:
  - on screens under 700 px tall, confirm boxes pick up the form dialogs' pinned button row;
  - Prospects' Delete status box may give no first focus.
- About 18 files have a confirm box today. Examples: `src/screens/testing/DeleteDialog.jsx`, `src/screens/testing/events/ConfirmDeleteDialog.jsx`, `src/screens/testing/star/events/StarDeleteEventDialog.jsx`, `src/blackBelt/staff/parts/ConfirmDialog.jsx`, and the Prospects / Forms / Calendar / Schedule delete boxes. List them all in your plan.
- **`DeleteDialog` is in M10 too.** It moves as it is (M10). Its users keep "Cancel" / "Delete" until each one switches to M2's box in its own prompt; then `DeleteDialog` goes. Say so in the plan.

**M3 — the Mark paid box** (v1.001; picture `Walkthrough/03-taking-a-payment.png`).
- The box shows the amount, then **Paid by** Cash / Check / Card, then the button **"Mark paid $X"**.
- Paid by is preset to the family's choice, with the hint "They chose … on the form."
- The amount is shown, not typed. A different amount or date is fixed afterwards with Edit payment (admins).
- Black Belt keeps its own dialog (it needs "For"), with the same words.
- The box only gives the caller the chosen method. Whether a section's database function takes a method is that section's job (Color Belt records "the family's choice" today).

**M4 — Print receipt** (v1.002; picture `Walkthrough/03b-receipts.png`).
- Black Belt's receipt is the model: `src/blackBelt/staff/receipt/ReceiptDialog.jsx`, `ReceiptPage.jsx` (v0.220).
- One preview, as Black Belt's has it:
  - the school's name;
  - what was paid and how;
  - total due, paid to date, balance;
  - both schools' street and phone;
  - "Printed [date] by [name]. Fees are non-refundable."

  Then Print or save as PDF.
- It takes a plain data shape, so every section can feed it.
- The sections add the ⋯ menu item and the button in the person's detail. It is printed when a family asks.

**M5 — the Registration link box** (v1.015; picture `Walkthrough/12-registration-link.png`).
- **Copy link** and **Download QR code** everywhere.
- **Print flyer** only where a section has one today (Color Belt, Star). Camps and Black Belt stay without a flyer.
- It must hold **one or two school links** (Star's two-school view, v0.99; Black Belt's `cycle/LinksDialog.jsx`).
- Today's copies:
  - `src/screens/testing/event/RegistrationLinkDialog.jsx`
  - `src/screens/testing/star/event/StarLinksDialog.jsx`
  - `src/screens/camps/CampLinkDialog.jsx`
  - `src/blackBelt/staff/cycle/LinksDialog.jsx`
- Forms keeps its own Share dialog (it holds kiosk mode).

**M6 — count cards** (v1.013, v1.014; §8 Metric cards; pictures `Walkthrough/11-count-cards.png`, `11b-camps-cards.png`).
- The cards sit in a row above a roster.
- Tapping a card filters the list ("Showing … only · Show all").
- A money total ("Payments recorded") stays a total and isn't tappable.
- It must also draw Black Belt's four plan cards, in the same look and tap behaviour (v1.013; BB15).
- Finance's Daily report keeps its own cards, which jump to their group (v1.013: a report, not a roster). No Finance item switches them.
- Today the cards are drawn separately in Color Belt (twice), Star, and Black Belt (`candidates/SummaryCards.jsx`).

**M7 — the history line and list** (v1.010; picture `Walkthrough/09b-change-history.png`).
- "History · N changes ›" sits at the end of a person's summary.
- A tap opens the list, newest first: what changed, then when · who.
- With Hide private details on, amounts and paid status are left out (as Star's, v0.506).
- The models: Prospects' line (`src/screens/prospects/ProspectPanel.jsx`) and Star's `CandidateHistory.jsx`.
- **It takes a loader and the wording from the section.**
  - `change_log` can only be read through a database function (RLS on, no grants).
  - Only Star has one today: `star_candidate_history`, migration 0006. It returns raw rows, and Star's own code turns them into words.
  - Color Belt, Camps and Black Belt each need such a function, with a security review. That work belongs to the sections' prompts, not yours.

**M8 — the time list** (v1.019; picture `Walkthrough/14b-times.png`).
- Star's list made shared:
  - **5-minute steps**;
  - **AM/PM on every time**;
  - **opens at the chosen time**.
- **The range and step are settings:** 6:00 AM–10:00 PM for classes, testing and camps. Finance's reminder keeps 11 AM–11 PM and Off.
- Careful: some databases check times.
  - Star's `star_start_time_is_valid` (migration 0006; mirrored in `src/lib/star/starEventRules.js`) accepts only 15-minute steps from 8 AM to 8 PM.
  - Black Belt's `bb_time_is_valid` (0016) and Finance's `finance_reminder_time_is_valid` (0011) check times too. Read what each accepts.
  - Each section's prompt handles its own switch, with a migration where needed.

**M9 — one money helper** (v1.026; picture `Walkthrough/17a-money-names.png`).
- **The rule:**
  - On screens: "$65", with cents only when there are some ("$290.50", "$1,120").
  - Finance's report, print and export always show cents ("$65.00").
  - A minus is a real minus sign before the dollar sign ("−$190", "−$190.00"), as Black Belt's and Finance's helpers write it. v1.026 doesn't say this; it's today's practice where a minus shows. Confirm it with Jeffrey when you show the plan.
- **The five helpers write money differently today:**

  | Helper | File | 3250 cents | −19000 cents |
  |---|---|---|---|
  | `dollars` (Star) | `src/lib/star/candidatesText.js` | "$32.5" | "$-190" |
  | `formatDollars` | `src/lib/money.js` | "$33" (rounds to whole dollars) | "$-190" |
  | `dollars` (Color Belt) | `src/screens/testing/text.js` | "$32.50" | "$-190" |
  | `formatCents` (Black Belt) | `src/lib/blackBelt/money.js` | "$32.50" | "−$190" |
  | `money` (Finance) | `src/screens/finance/format.js` | "$32.50" | "−$190.00" |

- **Build the shared helper to the rule only**, with checks for the examples above. Then compare each old helper with it:
  - **Same output:** an old helper that writes the same as the shared one for every amount it gets becomes a **thin wrapper**. Only its own body changes; none of its callers do.
  - **Different output:** an old helper that differs stays as it is. Its section switches when its own prompt runs, and that is when the fix shows (v1.030: nothing on screen changes in this step).
  - List each difference in the plan.

**M10 — move the misplaced helpers** (v1.030).
- `src/screens/testing/events/useLiveLoad.js`, the 15-second refresh (about 21 files import it).
- `src/screens/testing/events/ChoiceGroup.jsx` (about 25).
- `src/screens/testing/DeleteDialog.jsx`. It moves as it is; see M2.
- `src/screens/finance/usePaymentsHidden.js` is **already moved**. The hook lives in `src/lib/privateDetails.js`, and the Finance file is a one-line re-export.
  - You switch `App.jsx`'s import.
  - Black Belt switches its four imports in its own prompt.

**Moving the first three:**
- Move each to its shared place.
- **Leave a re-export at the old path**, so no other branch's imports break. Sections switch their imports later.
- Each re-export file keeps a header comment (what + why), as `usePaymentsHidden.js` does.

This avoids merge conflicts with the other active branches.

**M11 — shared words and styles** (v1.030).
- **Words.**
  - "Back", "Cancel", "Retry" … move out of `src/screens/testing/text.js` into a shared words file.
  - `Dialog`, `RowMenu` and `ErrorBanner` then take their words from there, and so do Main's own screens (see above).
  - `testing/text.js` keeps re-exporting them, so the sections' imports still work.
- **Styles.** Shared styles move out of the testing, finance, prospects and staff CSS into a shared stylesheet.
  - **CSS has no re-exports.** Keep the class names. Load the shared stylesheet from `src/main.jsx`, with the others.
  - Why it matters: of two equal CSS rules, the one loaded later wins. `Finance.jsx`, `Camps.jsx` and `Testing.jsx` load their own stylesheets later than `main.jsx`. So a rule that used to load later (e.g. from `finance.css`) now loads earlier: check that nothing loaded in between overrides it.
  - Compare before / after shots of every screen whose CSS you touch.
- **Finance is being built at the same time** (its Black Belt payments, F8, migration 0026).
  - Leave `src/styles/finance.css` and `src/screens/finance/format.js` alone where you can.
  - List any Finance file you change.

### Copies not on this list

v1.030 says Black Belt drops its own copies (BB15) and Calendar drops its menu copy (N16). Some of those copies have no shared part to switch to yet:

| Copy | Why there's no shared part yet |
|---|---|
| `InnerDialog` (Black Belt) | `Dialog.jsx` can't open one dialog on top of another. |
| `SelectField` (Black Belt) and Star's `StarSelect.jsx` | There is no shared dropdown. M8's time list could be built on one. |
| `Grip` (Black Belt) | It copies the `.grip` style in `testing.css`. |
| Calendar's `ShowMenu.jsx` | It ticks boxes without closing; `RowMenu` has no tick-box mode. |
| The five public-page header strips (Color Belt, Star, Black Belt, Camps, Forms) | Same look (v0.106) but drawn five times; listed in Decisions.md item 19. |
| Star ↔ Black Belt copies | e.g. the two `PickerSheet.jsx`, the two `ResultEmailsBlock.jsx`. |

These aren't in M1–M11, so don't add them on your own. List them in the plan, with what each needs, and ask Jeffrey one question: which of them join this step. Without them, BB15 and N16 have nothing to switch to.

### How to work

1. **Plan first.** Write `docs/Dashboard Core/TKD-DashboardCore-Plan.md`, covering:
   - every part, with its props and states;
   - which copies it replaces;
   - the files you will touch;
   - which shared files are involved (CLAUDE.md lists them).

   Show Jeffrey the plan.
2. **Mockups before code.** For M1–M8, draw each part with all its states, in one self-contained HTML file per part (or one sheet of parts).
   - Sizes: **1280×800, 820×1180 touch, 390×844 touch and 320 wide**, with PNGs.
   - Where the design review already drew the chosen look, copy it; don't redesign.
   - A separate **design reviewer agent** checks the mockups against the rulebook rows above and the pictures before Jeffrey sees them.
   - Jeffrey OKs them **one part at a time**.
   - Each approval becomes a 10b row and a changelog line from your block:
     - re-read the rulebook first, and keep its CRLF line endings;
     - the row goes just above "| Approved 2026-10-16 (v0.26) |";
     - the changelog line goes at the end of §11;
     - the header's **Version:** shows the number you just used, and **Last updated:** shows today's date.
3. **Before you change any file,** record the "before" state:
   - Take shots of a few existing screens at the four sizes: a roster, a confirm box, a Finance report and Staff accounts.
   - Run every existing check file and note the results: `src/lib/*/checks.mjs`, `src/lib/star/*Checks.mjs`, `src/forms/checks.mjs`, `src/screens/prospects/progress.checks.mjs`.
4. **Build** after the OK.
   - **The parts page must never reach the live build.** Use one of the two patterns the build already has:
     - a root page file that isn't listed in `vite.config.js`'s build inputs; or
     - a page behind `import.meta.env.MODE === 'preview'`, with its `import()` in the same file, as `src/lib/features.js` does.
   - Not in `public/`. After `npm run build`, search `dist/` for the page's words: nothing should be found.
   - If you touch `App.jsx`, list it as a shared file.
   - Add check files for the money helper and the time list, in the repo's pattern (`src/lib/<area>/checks.mjs`).
   - Header comments and plain-English comments, as CLAUDE.md asks.
5. **Prove that nothing changed.**
   - Take the same shots after and compare them with the "before" ones.
   - Every check file still passes.
   - `npm run build` and `npm run build:preview-mode` pass.
6. **Reviews.**
   - A separate design reviewer checks the built parts against the approved mockups at 1280×800, 820×1180 touch, 390×844 touch and 320 wide.
   - A separate code reviewer checks the parts and the moves.
   - There are no database changes in this step. If you find you need one, stop and ask. Migration numbers are reserved through the Main session.
7. **Commit** on `dashboard-core` when a reviewed step is done, with clear messages, and explain the commands.
   - **Never push.**
   - List every shared file you touched.
   - The Main session merges `dashboard-core` into main when Jeffrey asks.

### Done when

- M1–M11, and any copies Jeffrey adds, are built and reviewed.
- The approved mockups are recorded as rows from your block.
- Nothing on screen has changed: the before / after shots and the check files prove it.
- Both builds pass, the status file is current, and the work is committed.

**After this step:**
- Step 2 (`2-DashboardCore-step2-main-screens.md`) starts after this step is merged into main.
- The other sections' prompts (Color Belt, Star, Black Belt, Camps, Finance, new students: "use the shared part") also wait for this merge.
- The one exception is Finance's Black Belt payments (F8, v1.034), which go first on their own.
