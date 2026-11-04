# Black Belt testing — fixes from the design review's rolling check (pass 1)

**Paste into:** the Black Belt testing session.

This file reaches your worktree when `design-review` is merged into main; until then the Design Review session sends its text by message.

**Starter to paste:**

> `git merge main` first. Then read and do `docs/Design Review/Rolling check/Pass 1/Fix-BlackBelt.md`: the fixes the design review's rolling check found in your merged work. Plan first. Mockups first for anything that changes how a screen looks. Nothing is built before I OK it.

---

## The brief

The design review's rolling check (phase 1d) looks at each section's design-review work after it merges: against the rulebook, the approved mockups, and the other sections that do the same job. Pass 1 covered `main` up to 5f1db41 (2026-11-03), in preview mode at the four sizes. Four reviewers looked (R1 money · R2 changes, mistakes and safety nets · R3 lists, menus and pickers · R4 item-by-item conformance and privacy). Two separate checkers then verified every finding. This file is what they confirmed in your merged work (BB3–BB6, BB9, BB11, BB12, BB17; BB8's and BB13's database half; Edit cycle's one-step Undo). Your Part 2 (BB1, BB2, BB7, BB10, BB13–BB15, BB19) wasn't in this pass: nothing below asks you to build it early, but some items name the Part 2 step they go with.

- **Fix now:** straight fixes. Plan them, show Jeffrey, then build. An item marked "after [owner]'s [id]" waits until that fix is on main: plan it now, build it after.
- **Waits on Jeffrey:** a rule must be picked first. Don't build these yet.
- **Smaller:** fix them while you're in the file. A few are checks or questions your prompt already asked for.
- Each item keeps its finding id (R1-04, R4-03 …) so Jeffrey can trace it. Use the id in your plan, status file and commits.
- **Line numbers** are main 5f1db41's; they may have moved. Items decided in v1.045–v1.049 cite main 84a6e7d's.
- **Paths:** `CandidatesTab.jsx`, `CandidateDialog.jsx`, `RosterRows.jsx`, `useCandidateActions.js`, `useMakeupPicker.js`, `icons.js`, `CompareDialog.jsx`, `ChangePlanDialog.jsx` and `SummaryCards.jsx` are in `src/blackBelt/staff/candidates/`. `candidates/…`, `cycle/…` and `results/…` are under `src/blackBelt/staff/`. A bare `text.js` is `src/blackBelt/staff/text.js`, and `blackBelt.css` is `src/blackBelt/staff/blackBelt.css`. `components/…` is `src/components/…`; `app.css` and `testing-events.css` are in `src/styles/`.

### Rules

- Follow CLAUDE.md.
- **Plan first:** a short plan (each item, its files, its mockup, any migration) in your docs folder; show it to Jeffrey. Add these items to your plan, `docs/Testing/Black Belt Testing/TKD-BlackBelt-DesignReview-Plan.md`.
- **Preview mode for building and trying changes:** `npm run dev:preview-mode`. `npm run dev`, `npm run preview` and `Start dashboard.bat` use the live database (`.worktreeinclude` copies `.env.local` into every worktree): run them only for a check Jeffrey OKs, never to try a change. `npm run build` is fine: it only builds.
- **Mockups before code** for every visual change, at PC 1280×800, tablet 820×1180 touch, phone 390×844 touch and 320 wide: a self-contained HTML file plus one PNG per screen with what changes outlined in amber (Jeffrey reviews the PNGs). He OKs them one screen at a time, before any code.
- **One decision at a time,** with pictures and a recommendation.
- **Reviews:** a separate design reviewer (the rulebook, the approved mockups, screenshots at the four sizes, and §4's six WCAG 2.2 checks, v1.033); a separate code reviewer; a separate security reviewer for anything touching the database (handoff §6).
- **Order (a push to main deploys):** the migration is live before the push that brings the app that uses it. A step whose app calls a new or changed database function is merged only after Jeffrey has applied its migration and the checks passed (fingerprints, security advisor, tests file — CLAUDE.md). Screen-only steps can go first.
- R1-01 needs a database change (and S-1 does, if you change the order in the database): ask the Main session for a migration number; Jeffrey applies it; the migration is live before the push that brings the app that uses it. Add a SETUP section "## Migration 00NN: …", a `step00NN` in `supabase/tests/pglite/run.mjs`, a tests file and a fingerprints file. Run the PGlite tests with `cd supabase/tests/pglite && npm ci && node run.mjs` (`npm ci` once per worktree).
- **Don't change a shared part on your own** (`src/components/…`, the shared helpers in `src/lib/`, `src/styles/shared.css`): every section uses them. If you need something a part can't do, ask Jeffrey first. He decides whether you change it in your branch (then list it as a shared file) or the Dashboard core session does.
- List every CLAUDE.md shared file you touch (`src/styles/shared.css` and `src/components/text.js` are on that list).
- Keep `docs/Testing/Black Belt Testing/TKD-BlackBelt-Status.md` current, with a short "Rolling check, pass 1" section.
- Commit on `black-belt` after each reviewed step. **Never push.**
- When a step is done, send the Main session a short report: Done (with the commit) · Needs Jeffrey (one question, options, your recommendation) · Next.

**Rulebook:** new rows only for what Jeffrey decides in your mockups, from your block **0.900–0.999**: the next unused number (check the rulebook first).
- Run `git merge main` first, and re-read the rulebook right before editing.
- The 10b row goes just above `| Approved 2026-10-16 (v0.26) |`; the changelog line goes at the end of §11; bump the header's Version / Last updated. Keep CRLF.
- A row that changes an older one adds a "(See v0.9xx …)" note at the start of that row. R4-15 below adds four that were missed.

---

## Fix now

Most severe first.

### R1-04 = R4-01 (the ⋯ part) — With Hide private details on, the ⋯ menus still tell paid from unpaid · High

Picture (today, with amber outlines): `docs/Design Review/Rolling check/Pass 1/pictures/H1-blackbelt-menu-tells-who-paid.png`.

- **What's wrong:** with the switch on, the row ⋯ and the detail ⋯ still change with paid status. An admin's Delete permanently is grayed "[Name] has payment records, so they can't be deleted. Withdraw them instead." only on paid rows; on unpaid rows it is red and usable. Staff's Change plan says "A payment is recorded. Ask an admin." only on paid rows. So a parent beside the mat tablet can tell which families have paid. A named child's payment status on the mat tablet makes this High, even though it takes a ⋯ tap.
- **Rule:** v0.249 hides paid / not-paid tags on that device; v0.506 / v1.000 (3): every payment detail, on every screen; your OP-B7 says "no payment items in any ⋯"; Star and Camps word such lines so they don't tell ("any recorded payment").
- **Change:** while `hidden`, give both items one look on every row: grayed with a desk line that names no payment (e.g. "Delete candidates at the desk." / "Change the plan at the desk.", in the pattern of Star's "Add new candidates at the desk.") — `CandidatesTab.jsx:243–251` (withdrawn rows), `:272–273`, `:317–320`, and in the detail ⋯ `CandidateDialog.jsx:434–436` (staff's Change plan) and `:455–457`; the database still refuses as today. The words live in `text.js:574, 954–955`. These are new words on screen: show Jeffrey first. R4-01's Plan part (v1.036, below) makes Change plan desk-only while hidden: build the two together.
- **Check (preview mode):** `__tkdPreview.bbSampleEdge()` + `__tkdPreview.setToday('2027-04-26')`, switch on, 820×1180 touch, Worcester: Mia Chen's and Rina Patel's ⋯ read the same as admin and as staff (`__tkdPreview.setRole('staff')`, then reload), in the row and in the detail.

### R4-01 (the Plan part) — Hide the plan while private details are hidden · High · decided 2026-11-04 (v1.036)

Picture: `docs/Design Review/Rolling check/Pass 1/pictures/Q2-blackbelt-plan-hidden.png`.

- **What's wrong:** with the switch on, the roster's Plan column and the phone line still say how each family pays ("3 payments", "In full", "· Kukkiwon"), and Change plan or Kukkiwon still opens. Your approved v0.900 mockup kept the plan; v1.036 changes that.
- **Rule:** v1.036 (Jeffrey, 2026-11-04): a family's payment plan is a payment detail (v0.249), as Camps hides Paying by (v0.722). While the switch is on, the Plan column and the phone line's plan words read the gray "Hidden on this tablet", and Change plan or Kukkiwon is desk-only: grayed in the row ⋯ and the detail ⋯, the same on every row for admins and staff, with a desk line that names no payment.
- **Change:** `RosterRows.jsx:79, 170` and `text.js:533–534` (the plan words); its own Compare box's Plan row (`CompareDialog.jsx:34`; it reads "Hidden on this tablet" and is never marked different while hidden, as Camps' v0.722); the Change plan items (`CandidatesTab.jsx:272–283`, `CandidateDialog.jsx:434–444`): R1-04's fix grays staff's on every row, and while the switch is on admins' grays too, with the same desk line; `ChangePlanDialog.jsx` can't be opened while the switch is on, and closes if the switch turns on while it is open (add `'changePlan'` to `MONEY_CHILDREN`, `useCandidateActions.js:268`). Not settled: the History's plan and Kukkiwon lines, which v0.972 keeps while hidden; ask Jeffrey with your BB8 mockup (recommended: hidden too). Draw the gray text with the shared hidden-value style (as R4-03's gray). Mockup first: Jeffrey OKs the desk line's words.
- **Check (preview mode):** `__tkdPreview.bbSampleEdge()`, switch on, 820 × 1180 touch and 390 phone: no plan words anywhere on the roster; every row's Change plan is grayed with the same desk line, as admin and as staff (`__tkdPreview.setRole('staff')`, then reload). Switch off: the plan and Change plan come back.

### R1-01 — Store the desk's school on each payment · High · decided 2026-11-04 (v1.035)

- **What's wrong:** `bb_record_payment` stores the candidate's school (`0016_black_belt.sql:4827`), so a Worcester family's payment taken at the Shrewsbury desk counts in Worcester's report and drawer.
- **Rule:** v1.035 (Jeffrey, 2026-11-04): every payment counts at the school of the desk that took it, the school set under This device in the account menu, as Camps does (v0.708). The school is stored on the payment when it is recorded, and an undo, edit or returned check copies it from the payment it corrects (v0.903's chain rule). A refund counts at the desk that hands the money back (v1.040). Money booked to the wrong school is moved by undoing it and recording it again on a device set to the right school. Your v0.903 chain rule stays; only where the first school comes from changes. `bb_record_refund` takes the device's school too, instead of the candidate's latest live payment's (v1.040); its new input also has a default (blank = today's rule, the latest live payment's school), so the live app keeps working until the push.
- **Change:**
  - One Black Belt migration: `bb_record_payment` takes the device's school and stores it instead of the candidate's. The new input has a default (blank = the candidate's school), so the live app keeps working until the push. Ask the Main session for a migration number. Jeffrey applies it. The migration is live before the push that brings the app that uses it.
  - The app passes This device's school. `src/App.jsx` already hands it to Camps (`deviceLocation`, `App.jsx:1102–1103`); passing it to your screens touches `src/App.jsx` and `src/screens/Testing.jsx` (it renders your screens), both CLAUDE.md shared files: list them.
  - Finance needs no change for you: it already reads your stored school (v0.808).
  - The preview's fake Black Belt store (`src/lib/blackBelt/mockBlackBelt.js`) changes too, or the check below can't pass.
- **Check (preview mode):** `__tkdPreview.bbSampleEdge()` + `__tkdPreview.setToday('2027-04-26')`; This device = Shrewsbury, top bar Worcester; record Sam Lee's payment (a Worcester candidate) → Finance's Shrewsbury Daily report for that day lists it, Worcester's doesn't.

### R4-03 (the gray) — "Hidden on this device" is drawn in the normal black · Medium

- **What's wrong:** your hidden birthday and email ("Hidden on this device") are drawn in the normal text color, rgb(31, 31, 31) (measured at 820), so on the mat they read like data. Star's read gray, rgb(107, 107, 107).
- **Rule:** v0.507 Q2: hidden values keep their row and read gray.
- **Change:** draw them with the shared gray hidden-value style (`.ev-hidden-value`, `testing-events.css:1315`, #6B6B6B) in `CandidateDialog.jsx:610–611` (and in your own `CompareDialog.jsx:30–35` until BB15 swaps in the shared one). The words are decided: R4-03 (the words), the next item.
- **Check (preview mode):** after `__tkdPreview.bbSampleEdge()`, switch on, open Mia Chen at 820: the two values measure rgb(107, 107, 107).

### R4-03 (the words) — "Hidden on this device" becomes "Hidden on this tablet" · Medium · decided 2026-11-04 (v1.045)

- **What's wrong:** your hidden values read "Hidden on this device" and your payment part "Payments are hidden on this device." (`text.js:619–620`; drawn at `CandidateDialog.jsx:613–614, 709` and in your Compare box, `CompareDialog.jsx:30–31, 35`); the receipt says the same (`src/blackBelt/staff/receipt/text.js:30`), and the Results line reads "Email result is off on this device. Email results at the desk." (`results/text.js:104`, `results/ResultsTab.jsx:695`). Every other section, and your own v1.036 and v1.037 items, say "tablet", so until this is built your screens show both words.
- **Rule:** v1.045 (1) (Jeffrey, 2026-11-04: "Approve all"): hidden values read "Hidden on this tablet" and payment parts "Payment details are hidden on this tablet." (v0.507 Q2), so Black Belt's "on this device" goes.
- **Change:** use `HIDDEN_ON_THIS_TABLET` and `PAYMENT_DETAILS_HIDDEN` from `src/lib/privateDetails.js:47–48` (they already live there once) instead of `text.js:619–620` and `receipt/text.js:30` (unless BB2 has moved you to the shared receipt by then), and word the Results line as Star's: "Email result is off while private details are hidden. Email results at the desk." (`src/lib/star/resultsText.js:93`). Build it with R4-01, R4-04 and R4-03 (the gray), so no screen shows both words.
- **Check (preview mode):** `__tkdPreview.bbSampleEdge()`, switch on, 820 × 1180 touch: Mia Chen's detail reads "Hidden on this tablet" (gray) and "Payment details are hidden on this tablet."; Review on the Noah Silva pair reads "Hidden on this tablet"; the Results tab reads Star's line. "Device" shows nowhere.

### R4-04 — At the mat, work like Star while private details are hidden · Medium · decided 2026-11-04 (v1.037)

Picture: `docs/Design Review/Rolling check/Pass 1/pictures/Q3-blackbelt-desk-only-like-star.png`.

- **What's wrong:** with the switch on, the whole Add candidate button grays (`cycle/CyclePage.jsx:213–217`), so "Make-up from an earlier cycle…" can't be used at the mat. Edit details is grayed "Edit details at the desk." (`text.js:569–571`), which no rulebook row asked for.
- **Rule:** v1.037 (Jeffrey, 2026-11-04), Star's v0.507 Q1 for Black Belt. Add candidate opens its menu. New candidate grays inside it with Star's reason ("Add new candidates at the desk. Date of birth, email and payments are hidden on this tablet."). Make-up keeps working. Edit details opens, with the date of birth and email shown as the gray "Hidden on this tablet" and Star's hint "Change the date of birth or email at the desk." under them, and nothing that tells who has paid: for staff the Dan is grayed on every row with "Change the Dan at the desk." (Star's v0.508 (3)), and the admin's "already paid" line is left out. The grayed button and its line under the page title stay only for a finished cycle (v0.966 (3)).
- **Change:** `cycle/CyclePage.jsx:213–217` (Add candidate stays usable while hidden; the finished-cycle case is unchanged); the New candidate item in the menu grays with Star's reason and stays focusable; `candidates/CandidatesTab.jsx:172–176, 478–480` (the Add candidate menu: New candidate grays inside it, Make-up stays); `CandidatesTab.jsx:260–266` (row ⋯), `CandidateDialog.jsx:425–431` (detail ⋯) and `text.js:569–571` (Edit details opens; "Edit details at the desk." goes); the hidden view is built in `EditFields` (`CandidateDialog.jsx:208–306`); `useCandidateActions.js:283–285` today leaves Edit details when the switch turns on: keep it open with the two fields turning gray, as Star's does. In `EditFields`, while hidden: the staff Dan lock and its line (`:217, 295–297`, `text.js:722`) become one look on every row, "Change the Dan at the desk." (as Star's `CandidateDialog.jsx:345`), and the admin's "$X is already paid" line (`:298–303`) is left out (as Star's `:349`); Edit details' birthday and email read the gray "Hidden on this tablet" and can't be changed while hidden, as Star's `CandidateDialog.jsx:415, 456` does. Mockup first.
- **Check (preview mode):** `__tkdPreview.loadBlackBeltGradingSample()` (Fall 2027 is the later cycle; Spring 2027 has a below-the-mark candidate), switch on, 820 × 1180 touch: Add candidate opens; New candidate is grayed with the reason; Make-up from an earlier cycle opens its picker and adds; Edit details opens, the birthday and email read "Hidden on this tablet", and a name change saves; switch off: the birthday and email are unchanged; as staff (`__tkdPreview.setRole('staff')`, reload), the Dan reads the same on a paid and an unpaid row. On a finished cycle, Add candidate is still grayed with "This cycle is finished, so candidates can't be added."

### R2-03 — No Undo after restoring a Duplicate copy · Medium · decided 2026-11-04 (v1.043)

Picture: `docs/Design Review/Rolling check/Pass 1/pictures/Q8-undo-restored-duplicate.png`.

- **What's wrong:** after a "Duplicate copy" is restored, its Undo withdraws it again as a plain "Removed" (`useCandidateActions.js:1069–1090` → `0016_black_belt.sql:4428–4436`).
- **Rule:** v1.043 (Jeffrey, 2026-11-04: "A: as Star"), Star's v0.517 G3 for every section: restoring a row set aside as a "Duplicate copy" shows "[Name] restored" with no Undo, because an Undo would put the row back as a plain "Removed" with a history that says Withdrawn. To change it back, an admin uses Review → Keep this one again. Every other restore keeps its 5-second Undo (v1.006).
- **Change:** in `useCandidateActions.js:1069–1090`, when the restored row was a Duplicate copy, the toast says "[Name] restored" with no Undo, as Star's `star/candidates/CandidatesTab.jsx:900–910` does. Other restores keep their Undo. No database change.
- **Check (preview mode):** `__tkdPreview.bbSampleEdge()` → Review the Noah Silva pair → Keep this one: the copy sits in Removed as "Duplicate copy" → ⋯ Restore → no Undo in the toast. Withdraw and restore an ordinary candidate → Undo is still there.

### R3-01 — Past-due "Not paid" turns amber · Medium · decided 2026-11-04 (v1.044)

Picture: `docs/Design Review/Rolling check/Pass 1/pictures/Q9-blackbelt-red-not-paid.png`.

- **What's wrong:** once a due date has passed, the roster's "Not paid" tag is drawn in the Delete red (measured rgb(163, 45, 45) on rgb(252, 235, 235); `text.js:558–559`, `RosterRows.jsx:61`, `blackBelt.css:1024–1029`). §7 (v1.007) keeps red for "gone for good".
- **Rule:** v1.044 (Jeffrey, 2026-11-04: "A: amber"): amber, like your own "Late · $X since [date]". The timing (v0.224) and the Not paid card and filter stay as they are.
- **Change:** in `text.js:559`, change the past-due Not paid's `kind: 'red'` to `'warn'` (Late's amber), then remove the red kind and `.bb-tag--red` (`blackBelt.css:1024–1029`) if nothing else uses them. Don't just recolor the red class. The tag is drawn only through `MoneyTag`: the roster row (phones included) and the candidate detail's title (`CandidateDialog.jsx:626`). Show Jeffrey a small picture first.
- **Check (preview mode):** `__tkdPreview.bbSampleEdge()` + `__tkdPreview.setToday('2027-04-26')`: Rina Patel's "Not paid" is amber, the same as Sam Lee's "Late", at 1280, 820, 390 and 320. Nothing on the roster is red except Delete permanently.

### R2-05 (your part) — An Undo pressed during another save is dropped without a word · Medium · after Dashboard core's R2-05

- **What's wrong:** the shared Toast removes itself before it runs Undo (`components/Toast.jsx:73–77`), and your Undo returns early while another save runs (`useCandidateActions.js:342`). So the toast vanishes, nothing happens and nothing is said. Staff believe it was undone.
- **Rule:** rule 1.4 / v1.006; §3.5 (never silent).
- **Change:** after Dashboard core's R2-05 (an Undo pressed while a save runs is *queued*: it waits its turn and runs as soon as that save ends, and its toast stays as "Undoing…"), your Undos use Dashboard core's helper: `runQuick` (`useCandidateActions.js:341–343`), the make-up picker's `undoAdd` and Edit cycle's Undo (`cycle/useCycleEditor.jsx`).
- **Check (preview mode):** `__tkdPreview.setTestingDelay(2500)`; withdraw candidate A, withdraw candidate B, press A's Undo during B's save → A comes back with "Undone".

### R3-02 (your part) — A possible duplicate still offers Record payment · Low–Medium · decided 2026-11-04 (v1.046)

- **What's wrong:** your cards already leave possible duplicates out, with a gray line: that is now every section's rule. But both Noah Silva rows still offer Record payment: the PC row button (`RosterRows.jsx:78`), the row ⋯ on tablets and phones (`CandidatesTab.jsx:286`) and the detail's button (`CandidateDialog.jsx:628`). A payment can land on the copy that is later withdrawn (the checker rated this Low–Medium). Color Belt and Camps offer none.
- **Rule:** v1.046 (8) (Jeffrey, 2026-11-04: "Approve all"): a row marked "Possible duplicate" stays out of the counts until the pair is resolved, with one gray line under the cards, as Black Belt does; until then it offers no Mark paid or Record payment.
- **Change:** in those three places, leave Record payment out while `duplicateState === 'possible'`. Your cards and their gray line stay; with BB15 the line becomes the shared cards' `note`.
- **Check (preview mode):** `__tkdPreview.bbSampleEdge()`: neither Noah Silva row offers Record payment, at 1280 (the row button), at 820 touch (the ⋯) or in the detail. Review → Keep this one: the kept row offers it again.

### R3-05 — "Show both schools" turns into a 44 px box on touch · Low

- **What's wrong:** on touch, the one-school line is a 44 px plain link button, with the link 12 px after the dot (`candidates/CandidatesTab.jsx:417–424`, `app.css:1151–1154`). Star's same line is 20 px with the link 4 px after the dot, and your own Grading and Results tabs already use inline links. The same sentence looks gappy in one tab and tidy in the next.
- **Rule:** v1.117 (an inline link with an invisible 44 px tap box, and room for it).
- **Change:**
  - Draw the school line as the shared "Showing … only" line: `<p className="ev-filter-line cards-showing">` with a `link-button inline-link`. The shared touch rules (no 44 px box, the invisible tap box, the room around the line, `shared.css:2098–2133`) work only inside `.cards-showing`. A bare `.inline-link` keeps app.css's 44 px box (`app.css:1151–1154`), and the check below fails. If the line can't take `.cards-showing`, ask Jeffrey; don't widen the shared rule yourself (it is Dashboard core's file).
  - The "Showing not paid only · Show all" line is replaced when BB15 switches to the shared count cards. If BB15 slips, give that line the same classes.
- **Check (preview mode):** with the Black Belt sample loaded, at 820 touch on Worcester, tap Not paid: both lines are 20 px tall, the link sits 4 px after the dot, and no tap box overlaps a card or the search.

### R3-07 — The make-up item uses the History icon · Low

- **What's wrong:** "Make-up from an earlier cycle…" uses `ti-history` (`blackBelt/staff/candidates/icons.js:19, 54`), which already means Past schedules / History. Star's same item uses `ti-repeat`.
- **Rule:** the §2.4 map (v1.025, newer than your grading mockups, v0.941): Make-up = `ti-repeat`, as Star.
- **Change:** `ICONS.makeup` → `IconRepeat`.
- **Check (preview mode):** the Add candidate menu shows the repeat arrows.

### R4-11 — A failed read behind the admin row ⋯ has no Retry · Low

- **What's wrong:** when the read behind an admin's row ⋯ (or the detail) fails, the bar says "Couldn't load. Check the connection, then try again." with no Retry, and the ⋯ shows nothing while it reads. A bar says "try again" with no button to do it, after a tap that seemed to do nothing.
- **Rule:** v0.966 (1): a connection failure always has Retry in the same bar.
- **Change:** in `useCandidateActions.js:150–158` pass a `retry` that repeats the same read (as `runQuick` does, `:357–358`), and show the ⋯ as busy while it reads (`RosterRows.jsx:100–113`). The preview's `failNextSave` fails writes only, so add a failed-read helper (or a `checks.mjs` case) to check it. A new `__tkdPreview` helper is registered in `src/lib/mockClient.js`, a CLAUDE.md shared file: list it, and keep the helper itself in your own fake store (`src/lib/blackBelt/mockBlackBelt.js`).
- **Check (preview mode):** with the failed read armed, open an admin row's ⋯: the bar shows Retry, and Retry opens the menu.

### R4-14 — Two sentences for one refused Undo · Low

- **What's wrong:** the Undo of Change plan, Add candidate, Withdraw and a make-up says "Couldn't undo. Someone else changed this candidate just now." (`text.js:970`), while v0.966 (2) / v0.967 set one sentence for this refusal: "Someone else changed [Name] just now, so nothing was done. Their change is shown." (`text.js:587`). The same event reads two ways depending on which Undo was pressed.
- **Rule:** v0.966 (2), v0.967.
- **Change:** use `T.candidateStale(name)` at `useCandidateActions.js:691, 761, 1004` and `useMakeupPicker.js:168`, and retire `UNDO_STALE_CANDIDATE`. Jeffrey picked this set for every section (v1.045 (4)); your R2-07 item, below, takes it from the shared file once Dashboard core's R2-07 is on main.
- **Check (preview mode):** Withdraw, then `__tkdPreview.simulateOtherAdminEdit()`, then Undo within 5 s (`__tkdPreview.setTestingDelay` to slow it): the bar says the new sentence.

### R4-15 — Four older rows changed by later ones have no "(See …)" note · Low (docs)

- **What's wrong:** v0.900 (rulebook line 744) was changed by v0.963; v0.912 (756) by v0.964; v0.964 (910) by v0.965; v0.968 (914) by v0.970, which retires its "Undo stopped halfway". A reader of v0.968 is told about a bar that no longer exists.
- **Rule:** the change list §3 and prompt 5: a row that changes an older one adds the usual "(See v0.9xx …)" note at the start of that row.
- **Change:** add the four notes at your next rulebook edit: `git merge main` first, re-read the rulebook, keep CRLF. (Line numbers move; find the rows by their numbers.)
- **Check:** no preview needed: each of the four rows starts with its "(See …)" note.

### R3-09 (your part) — One no-match line and Clear search for the in-list search · Low · decided 2026-11-04 (v1.047)

- **What's wrong:** the three in-list search boxes each read and sit differently (yours "Search candidates", Camps' "Find a camper", Prospects' "Search name or phone"), with three no-match lines ('No candidates match "x".', "No camper with that name.", "No one matches that search.").
- **Rule:** v1.047 (14) (Jeffrey, 2026-11-04: "Approve all"): the three in-list search boxes (Black Belt, Camps, Prospects) share one look: "Search candidates / campers / prospects", on the left above the table, with one no-match line and Clear search.
- **Change:** your words and place already fit (`text.js:523`; `CandidatesTab.jsx:428–440`). Left to do: the one no-match line (`text.js:536`, used at `CandidatesTab.jsx:410`), and Clear search (`:433–437`) as the shared `IconButton` (the Smaller line about its tooltip). The row gives no words for the no-match line: draw it in your mockup and ask Jeffrey once, unless the Main session has already passed on his answer from Camps or New students. (R3's proposal: 'No one matches "[text]".' with a Clear search link.)
- **Check (preview mode):** `__tkdPreview.bbSampleEdge()`, type "zz" in Search candidates: the approved no-match line shows, and Clear search, with its tooltip on PC, empties the box.

### R3-10 (your part) — The one-school line moves under the cards · Low · decided 2026-11-04 (v1.047) · with BB15, in your Part 2

- **What's wrong:** above your roster come the one-school line, then the duplicate box, the cards, then the search and caption; on phones the cards come after the search (`CandidatesTab.jsx:417–442`). Every section has its own order.
- **Rule:** v1.047 (15) (Jeffrey, 2026-11-04: "Approve all"): one order above every roster: the duplicate box, the count cards, their "Showing … only" line, the one-school line, the search, the switches (Dan, class, week), then the table.
- **Change:** with BB15's switch to the shared count cards: the duplicate box (`:425`), then the cards and their "Showing … only" line, then the one-school line (`:417–424`, drawn as R3-05's shared line), then the search and caption (`:428–440`), then the table, on every size (the phone cards at `:442` move up too). Mockup first, with BB15's.
- **Check (preview mode):** `__tkdPreview.bbSampleEdge()` on Worcester, at 1280, 820 touch, 390 and 320, after tapping a card: the duplicate box, the cards, "Showing … only", "Showing Worcester candidates only · Show both schools", then Search candidates.

### R4-06 (your part) — Screen text drops from weight 600 to 500 · Low · decided 2026-11-04 (v1.048)

- **What's wrong:** 20 screen rules still use weight 600, which §7 doesn't allow (400 and 500 only): the family form (`src/blackBelt/form/form.css:443, 993`), `blackBelt.css:1706, 1881, 2022, 2093, 2155, 2526`, the grading screen (`src/blackBelt/staff/grading/grading.css:296, 308, 400, 490, 602, 607, 910, 951, 1133`), the receipt (`src/blackBelt/staff/receipt/receipt.css:57, 126`) and Results (`results/results.css:226`).
- **Rule:** v1.048 (23) (Jeffrey, 2026-11-04: "Approve all"): screen text uses weights 400 and 500 only (§7): Black Belt's, Camps' and New students' 600s go to 500; printed sheets keep their heavier weights (v0.142, v0.143).
- **Change:** those 20 → 500. The printed grading sheet's four (`grading.css:1219, 1268, 1296, 1324`, inside `@media print`) keep 600. (The receipt's two may go anyway when BB2 moves you to the shared receipt.)
- **Check (preview mode):** the family form, the candidate detail, the grading screen, the receipt and Results at 1280 and 820: no text computes weight 600; the printed grading sheet (print preview) is unchanged.

### R4-13 (your part) — "Ask an admin to reopen" becomes "Ask an admin to open it." · Low · decided 2026-11-04 (v1.045)

- **What's wrong:** staff read "The application date has passed. Ask an admin to reopen." (`text.js:90`, in the bar: `cycles/useCycleActions.js:56, 120`) and "Registration closed on [date]. Ask an admin to reopen it." (`text.js:495`, under the tabs: `cycle/CyclePage.jsx:289`). Camps says "… Ask an admin to open it." (v0.725), which matches the Close / Open pair.
- **Rule:** v1.045 (5) (Jeffrey, 2026-11-04: "Approve all"): staff after a closing date read "Ask an admin to open it.", as Camps' v0.725.
- **Change:** `text.js:90`: "… Ask an admin to open it."; `:495`: "Registration closed on [date]. Ask an admin to open it."; and the comment at `cycle/CyclePage.jsx:29`.
- **Check (preview mode):** `__tkdPreview.setRole('staff')` and reload, then `__tkdPreview.setToday()` to a day after a cycle's application date: the line under its tabs ends "Ask an admin to open it."

### After Edit details (R2's smaller line) — Edit details closes back to the roster · Low · decided 2026-11-04 (v1.047)

- **What's wrong:** after Edit details saves, Black Belt goes back to the candidate's detail (`useCandidateActions.js:870–871`), while Star and Camps close to the roster (`src/screens/camps/CampPage.jsx:919–923`). So the Undo toast shows over a different screen in each section.
- **Rule:** v1.047 (21) (Jeffrey, 2026-11-04: "Approve all"): after Edit details saves, the detail closes back to the roster, as Star and Camps do; Black Belt changes.
- **Change:** in `saveEdit` (`useCandidateActions.js:802`), after a save that works, close the detail instead of `patchDetail({ mode: 'view', … })` (`:870–871`), and return focus to the candidate's row. The toast and its Undo (`:842–868`) stay. A refused save keeps the detail open, as today.
- **Check (preview mode):** `__tkdPreview.bbSampleEdge()`, open Sam Lee → ⋯ Edit details → change the first name → Save: the detail closes, the roster shows the new name, focus is on Sam Lee's row, and the toast has Undo; Undo brings the old name back.

### S-1 (your part) — On Both, the roster lists Shrewsbury before Worcester · Low · decided 2026-11-04 (v1.047)

- **What's wrong:** on Both your roster sorts by Dan, then school with Shrewsbury first, then last name. The order comes from the database: `bb_cycle_roster` (live in `0025_black_belt_grading.sql:5058`, its order at `:5115`). The grading grid, Results, the make-up list and the results CSV sort the same way (`0025:3549, 3637, 3777, 3980`), and so do the preview's fake stores (`src/lib/blackBelt/mockBlackBelt.js:1999`, `src/lib/blackBelt/mockGrading.js:246`). The location switcher puts Worcester first.
- **Rule:** v1.047 (19) (Jeffrey, 2026-11-04: "Approve all"): Worcester comes first wherever both schools are listed, as in the location switcher. Your "Dan, then school, then last name" line stays (v1.047 (17)).
- **Change:** plan it, and show Jeffrey the plan: either the screens sort what they get (Dan, then Worcester before Shrewsbury, then last and first name), or one migration replaces those functions with Worcester first (ask the Main session for a number; handoff §6; the steps in Rules; a security review). Either way the fake stores change too, and so do the comments that say "Shrewsbury then Worcester" (`src/lib/blackBelt/api.js:696`, `src/lib/blackBelt/rules.js:1055`).
- **Check (preview mode):** `__tkdPreview.bbSampleEdge()` on Both: within each Dan, Worcester's candidates come before Shrewsbury's on the roster; with `__tkdPreview.loadBlackBeltGradingSample()`, on the Grading and Results tabs too.

### Pass 1b ⋯ names (your part) — Three rubric ⋯ say "More for …" · Low · decided 2026-11-04 (v1.045)

- **What's wrong:** on the Rubric tab, a bracket's, a subject's and an item's ⋯ are named "More for [name]" (`text.js:1077, 1094, 1112`; used at `src/blackBelt/staff/rubric/RubricEditor.jsx:245, 429, 589`). Screen readers hear it and the tooltip shows it. Every other row ⋯ says "More actions for [name]", your own included (`text.js:175, 544`).
- **Rule:** v1.045 (6) (Jeffrey, 2026-11-04: "Approve all"): a row's ⋯ is labelled "More actions for [name]".
- **Change:** `text.js:1077, 1094, 1112`: "More for …" → "More actions for …" (keep the fallbacks "subject" and "item").
- **Check (preview mode):** `__tkdPreview.bbSample()`, a cycle's Rubric tab: hover or Tab to a subject's ⋯: its tooltip reads "More actions for [subject]".

### R4-08 (your copy) — The grayed Email result doesn't tell screen readers why · Low · after Star's R4-08, in your Part 2

- **What's wrong:** your grayed Email result on the Results tab uses the same tokens as Star's (the hairline border and a plain cursor) and has no `aria-describedby` either (R4: `src/blackBelt/staff/results/ResultRows.jsx:145–151`). (`aria-describedby` points a control at the text explaining it; a screen reader reads that text after the button's name.)
- **Rule:** v1.000 (2) ("the approved unavailable look, still focusable"); v1.103.
- **Change:** after Star's R4-08, copy it in your Part 2: v1.103's tokens (`--color-border-strong`, `not-allowed`) and `aria-describedby` pointing at the "Email result is off …" line.
- **Check (preview mode):** Results tab, switch on, 820 touch: border rgb(207, 207, 202), cursor `not-allowed`, and the button's description is the line.

### R2-04 (your part) — Your own toast rules go · Low · after Dashboard core's R2-04

- **Change:** once the shared toast has its own room (v1.042), remove your ⋯ sheet rule for it (`blackBelt.css:1593–1598`, inside the phones block that starts at `:1559`). Keep the full-screen detail's lift (`:1600–1606`, v0.967 (3)) until Jeffrey answers v1.042's open point.
- **Check (preview mode):** at 390 touch, a toast over your full-screen candidate detail leaves its bottom buttons clear, the same as before.

### R3-13 (your part) — The date hint says "dates" · Low · after Dashboard core's R3-13

- **What's wrong:** your staff calendars say "Past dates can't be chosen." (`blackBelt/staff/text.js:332`), while the newest rows say "days".
- **Rule:** the newest rows (v0.623 N6, v0.817 / v0.818) say "days" and show the hint.
- **Change:** after Dashboard core's R3-13 puts the words in `src/components/text.js`, use "Past days can't be chosen.". Leave the family-page date-of-birth hint unless Jeffrey wants it changed too.
- **Check (preview mode):** open each staff calendar with gray days: each has exactly that one line.

### R4-07 (your part) — The gray "Payment history is hidden" line · Low · after Dashboard core's R4-07, in your Part 2

- **Change:** build BB8's history on the shared `HistoryLine`. After Dashboard core's R4-07, the gray line shows in every history while hidden, paid or not.
- **Check (preview mode):** switch on; Mia Chen and Rina Patel both show the line.

### R1-06 (your part) — Your Undo payment words, from the shared file · Low · decided 2026-11-04 (v1.045) · after Dashboard core's R1-06

- **What's wrong:** nothing on your screen: every section now takes your Undo payment box's words (v0.964, v0.965). Once Dashboard core puts them in `src/components/text.js`, a second copy in `text.js:795, 814–815` would drift.
- **Rule:** v1.045 (2) (Jeffrey, 2026-11-04: "Approve all"): the Undo payment box uses Black Belt's words: "Undo [Name]'s $X [way] payment?", "Paid on [date] …" and the section's own consequence; shared words are kept once in `src/components/text.js`.
- **Change:** after Dashboard core's R1-06, take the title and "Paid on [date]" from `src/components/text.js`; keep your "for [what]" and "It comes off the balance; the history keeps it."
- **Check (preview mode):** `__tkdPreview.bbSampleEdge()` + `__tkdPreview.setToday('2027-04-26')`, record Sam Lee's payment, then ⋯ Undo payment: the box reads as before.

### R1-07 (your part) — Your payment toasts take Camps' and Color Belt's words · Low · decided 2026-11-04 (v1.045) · after Dashboard core's R1-07

- **What's wrong:** after Record payment your toast says "Payment recorded · $X · [Name]" (`text.js:774`, `useCandidateActions.js:421`), and after Undo payment "Payment undone · $X [way] · [Name]" (`text.js:818`, `useCandidateActions.js:550`). Camps and Color Belt say "[Name] marked paid · $X [way]" and "Payment undone for [Name]".
- **Rule:** v1.045 (3) (Jeffrey, 2026-11-04: "Approve all"): the toasts after Mark paid and Undo payment read "[Name] marked paid · $X [way]" (while hidden, "[Name] marked paid", v0.722) and "Payment undone for [Name]"; the person's payment line and the history's payment words become one set too, drawn in Dashboard core's mockup.
- **Change:** after Dashboard core's R1-07, use its toast words at `useCandidateActions.js:421, 550`. Then your payment lines (`CandidateDialog.jsx:134, 174`) and history words (`text.js:1370–1373`) follow the set in Dashboard core's approved mockup.
- **Check (preview mode):** `__tkdPreview.bbSampleEdge()` + `__tkdPreview.setToday('2027-04-26')`, record Sam Lee's $330 cash payment: the toast reads "Sam Lee marked paid · $330 cash"; ⋯ Undo payment → "Payment undone for Sam Lee".

### R2-07 (your part) — Your older refusal words go · Low · decided 2026-11-04 (v1.045) · after Dashboard core's R2-07

- **What's wrong:** your v0.966 words are now every section's, but older ones remain: "Couldn't undo. Someone else changed this cycle just now." (`text.js:89`), "Couldn't change registration. …" and "Couldn't delete. …" (`:76, 87`), "Someone else changed this just now." (`:1194`), and on the Results tab "Couldn't undo. Someone else changed this email text just now." and "Couldn't undo Mark as sent. Check the connection, then try again." (`results/text.js:245, 149`). R4-14 retires `:970`.
- **Rule:** v1.045 (4) (Jeffrey, 2026-11-04: "Approve all"): a refused change or Undo says "Someone else changed [Name] just now, so nothing was done. Their change is shown." or "Couldn't undo: [reason].", and a failed Undo says "Undo didn't save. Check the connection, then retry." (your v0.966 set).
- **Change:** after Dashboard core's R2-07, take the three sentences from `src/components/text.js` (your copies at `text.js:587` and `:88` then go) and use them at those lines: a refused change or Undo names what changed; a refusal with its own reason reads "Couldn't undo: [reason]." (as `:1226` already does); a failed Undo says the failed-Undo sentence.
- **Check (preview mode):** as R4-14's: withdraw, then `__tkdPreview.simulateOtherAdminEdit()`, then Undo within 5 s: "Someone else changed [Name] just now, so nothing was done. Their change is shown."

### R3-06 (your part) — Your back link switches to the shared one · Low · decided 2026-11-04 (v1.048) · after Dashboard core's R3-06

- **What's wrong:** your back link (`.bb-back`, `blackBelt.css:18`; on `src/blackBelt/staff/BlackBeltTesting.jsx:68` and `cycle/CyclePage.jsx:227`) is 28 px, and its plain 44 px touch box pushes the title down (146 px at 820 touch, where Star's sits at 124).
- **Rule:** v1.048 (12) (Jeffrey, 2026-11-04: "Approve all"): Dashboard core builds one shared back link in `.tc-back`'s look (24 px, a 16 px arrow, a 44 px touch box pulled back so the title doesn't move), and every section switches to it.
- **Change:** after Dashboard core's R3-06, both links use it (keep their words), and `.bb-back` goes.
- **Check (preview mode):** the Black Belt page and a cycle page at 1280, 820 touch, 390 and 320: the link is 24 px with a mouse and 44 px to tap on touch, and the title sits at the same height at 1280 and 820.

---

## Waits on Jeffrey (don't build yet)

- Nothing waits on Jeffrey now. He answered these on 2026-11-04 (v1.045–v1.049); each answer is a Fix now or Smaller item in this file.

---

## Smaller (fix while you're in the file)

- Print receipt is offered with nothing paid (`CandidatesTab.jsx:246, 313`: it checks only `!hidden`); Star shows it only on a row with a payment (v0.518), and Camps leaves it out (v0.734). Low; do it with BB2.
- Heads-up for BB1 (planned, not a finding): when "Method" becomes "Paid by", Record refund should say "Refunded by", like Star (`src/screens/testing/star/candidates/text.js:165`) and Finance's payment detail.
- Your two prompt checks aren't recorded in the status file. The chooser check (Testing → Black Belt → Testing → Color belt testing opens Color Belt) passed in the checker's preview: record it. BB3's Finance check (the Daily report after Edit payment and its Undo) wasn't tried: do it and record it.
- BB20 ("Worcester and Shrewsbury" on the printed results sheet) still isn't asked. It's planned: ask it as your plan says.
- The grading leave warning still has Leave anyway on the left, plain (`cycle/CyclePage.jsx:477–483`): planned for BB19 (Part 2). Nothing new.
- The phone header's blue "Add candidate" is full width (`blackBelt.css:830–832`). §2.1 names no such exception, and Star keeps its header buttons their own size. A question: show Jeffrey one picture (full width, or its own size). Low.
- The empty roster shows four "0" cards, the search box and the table header, and its line says "or add one here" without naming the button (`text.js:535`; v1.028). Star shows one line that names "Add candidate". Low.
- Your Clear search ✕ (`candidates/CandidatesTab.jsx:434`) is 28 px but has no tooltip (§1.4). Use the shared `IconButton`, as Prospects will (pass 1b, R5-01). Low.
- **R4-02 is decided** (2026-11-04, v1.049 (a)): Add candidate's New candidate form, open while Hide private details is turned on from another browser tab, keeps what was typed. It is recorded as a known gap in v0.249's "every screen". Nothing to build.
- **S-9 is decided** (2026-11-04, v1.047 (17)): your "Dan, then school, then last name" line stays (`text.js:525`), and no other roster adds one. Nothing to build.
- **Cards while hidden are decided** (pass 1b; 2026-11-04, v1.046 (9)): while Hide private details is on, the count cards keep the people counts and drop the money cards. Once BB15 moves you to the shared cards, you show a people count too, instead of no row. The row doesn't say where it sits beside your four plan cards when the switch is off: draw it in your BB15 mockup. Nothing to build before BB15.
- **S-10 is decided** (2026-11-04, v1.048 (20)): the browser dropdown in your result-text box (`src/blackBelt/staff/rubric/ResultTextDialog.jsx:278`) becomes the shared Select (v1.100) when you next work on that screen. No sweep, so nothing to build until then.

---

## Done when

- Every Fix now item is built, reviewed and approved by Jeffrey in the preview: a design reviewer at the four sizes for visual changes, a code reviewer, and a security reviewer for anything touching the database or privacy (R1-01's migration; R1-04, R4-01 and R4-04 are privacy fixes).
- These pass: `npm run build` and `npm run build:preview-mode`; `src/lib/blackBelt/checks.mjs` and `src/lib/shared/checks.mjs`; the Function tests (`node --test functions/tests/`).
- Jeffrey's decisions are rows from your block.
- The status file is current, and the work is committed on `black-belt`. **No push.**
- The report is sent to the Main session.

- R1-01's PGlite tests pass, Jeffrey has applied it, and the after-apply checks passed (fingerprints, security advisor, tests file).
