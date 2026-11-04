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
- **Line numbers** are main 5f1db41's; they may have moved.
- **Paths:** `CandidatesTab.jsx`, `CandidateDialog.jsx`, `RosterRows.jsx`, `useCandidateActions.js`, `useMakeupPicker.js`, `icons.js`, `CompareDialog.jsx`, `ChangePlanDialog.jsx` and `SummaryCards.jsx` are in `src/blackBelt/staff/candidates/`. `candidates/…`, `cycle/…` and `results/…` are under `src/blackBelt/staff/`. A bare `text.js` is `src/blackBelt/staff/text.js`, and `blackBelt.css` is `src/blackBelt/staff/blackBelt.css`. `components/…` is `src/components/…`; `app.css` and `testing-events.css` are in `src/styles/`.

### Rules

- Follow CLAUDE.md.
- **Plan first:** a short plan (each item, its files, its mockup, any migration) in your docs folder; show it to Jeffrey. Add these items to your plan, `docs/Testing/Black Belt Testing/TKD-BlackBelt-DesignReview-Plan.md`.
- **Preview mode for building and trying changes:** `npm run dev:preview-mode`. `npm run dev`, `npm run preview` and `Start dashboard.bat` use the live database (`.worktreeinclude` copies `.env.local` into every worktree): run them only for a check Jeffrey OKs, never to try a change. `npm run build` is fine: it only builds.
- **Mockups before code** for every visual change, at PC 1280×800, tablet 820×1180 touch, phone 390×844 touch and 320 wide: a self-contained HTML file plus one PNG per screen with what changes outlined in amber (Jeffrey reviews the PNGs). He OKs them one screen at a time, before any code.
- **One decision at a time,** with pictures and a recommendation.
- **Reviews:** a separate design reviewer (the rulebook, the approved mockups, screenshots at the four sizes, and §4's six WCAG 2.2 checks, v1.033); a separate code reviewer; a separate security reviewer for anything touching the database (handoff §6).
- **Order (a push to main deploys):** the migration is live before the push that brings the app that uses it. A step whose app calls a new or changed database function is merged only after Jeffrey has applied its migration and the checks passed (fingerprints, security advisor, tests file — CLAUDE.md). Screen-only steps can go first.
- R1-01 needs a database change: ask the Main session for a migration number; Jeffrey applies it; the migration is live before the push that brings the app that uses it. Add a SETUP section "## Migration 00NN: …", a `step00NN` in `supabase/tests/pglite/run.mjs`, a tests file and a fingerprints file. Run the PGlite tests with `cd supabase/tests/pglite && npm ci && node run.mjs` (`npm ci` once per worktree).
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
- **Change:** draw them with the shared gray hidden-value style (`.ev-hidden-value`, `testing-events.css:1315`, #6B6B6B) in `CandidateDialog.jsx:610–611` (and in your own `CompareDialog.jsx:30–35` until BB15 swaps in the shared one). The words wait for Jeffrey (R4-03, the words, below).
- **Check (preview mode):** after `__tkdPreview.bbSampleEdge()`, switch on, open Mia Chen at 820: the two values measure rgb(107, 107, 107).

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
- **Change:** use `T.candidateStale(name)` at `useCandidateActions.js:691, 761, 1004` and `useMakeupPicker.js:168`, and retire `UNDO_STALE_CANDIDATE`. If Jeffrey picks one shared set of these words (R2-07, below), use that instead.
- **Check (preview mode):** Withdraw, then `__tkdPreview.simulateOtherAdminEdit()`, then Undo within 5 s (`__tkdPreview.setTestingDelay` to slow it): the bar says the new sentence.

### R4-15 — Four older rows changed by later ones have no "(See …)" note · Low (docs)

- **What's wrong:** v0.900 (rulebook line 744) was changed by v0.963; v0.912 (756) by v0.964; v0.964 (910) by v0.965; v0.968 (914) by v0.970, which retires its "Undo stopped halfway". A reader of v0.968 is told about a bar that no longer exists.
- **Rule:** the change list §3 and prompt 5: a row that changes an older one adds the usual "(See v0.9xx …)" note at the start of that row.
- **Change:** add the four notes at your next rulebook edit: `git merge main` first, re-read the rulebook, keep CRLF. (Line numbers move; find the rows by their numbers.)
- **Check:** no preview needed: each of the four rows starts with its "(See …)" note.

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

---

## Waits on Jeffrey (don't build yet)

- **R4-03, the words** (Medium) — "Hidden on this tablet" and "Payment details are hidden on this tablet." from `src/lib/privateDetails.js` instead of "… on this device" (`text.js:494, 619–620`), and the Results line worded as Star's (`results/text.js:103`). v1.036 and v1.037 already use "Hidden on this tablet" (`HIDDEN_ON_THIS_TABLET`, `src/lib/privateDetails.js:47`) for the plan and Edit details, and v1.037 settled the desk line. Until this is answered your screens would show both words, so it is asked before R4-01 and R4-04 are built (recommended: the shared words everywhere, v0.507 Q2 "the same words on every screen"). Your prompt's question, never asked. The design review asks Jeffrey; the answer reaches you through the Main session.
- **R1-06** (Low) — one Undo payment box for every section: yours (v0.964 / v0.965, recommended) or Star's with "recorded on" → "paid on" (then your title changes back). The design review asks Jeffrey; the answer reaches you through the Main session.
- **R1-07** (Low) — one toast after Mark paid and after Undo payment: Camps' and Color Belt's words (recommended; yours change: `text.js:774, 818`) or yours. The design review asks Jeffrey; the answer reaches you through the Main session.
- **R2-07** (Low) — one set of words for "someone else changed it" and "Undo failed": your v0.966 shape for everyone (recommended) or the older shape. The design review asks Jeffrey; the answer reaches you through the Main session.
- **R3-02** (Low) — should a "Possible duplicate" row count in the cards: your rule, left out with a gray note (recommended), or counted (then yours changes). The design review asks Jeffrey; the answer reaches you through the Main session. The same answer settles whether a possible-duplicate row offers its payment button (you offer it on both Noah Silva rows; Color Belt hides it).
- **R3-06** (Low) — one shared back link made by Dashboard core (your `.bb-back`, 28 px with a plain 44 px touch box that pushes the title down, would switch to it). The design review asks Jeffrey; the answer reaches you through the Main session.
- **R3-09** (Low) — in-list search: one wording and place for every box ("Search candidates", `text.js:523`, and its no-match line, `:536`, may change). The design review asks Jeffrey; the answer reaches you through the Main session.
- **R3-10** (Low) — one order for what sits above a roster (recommended: Star's; you'd move the one-school line under the cards with BB15). The design review asks Jeffrey; the answer reaches you through the Main session.
- **R4-02** (Low) — what an open desk-only form (your Add candidate) does when Hide private details turns on in another tab. The design review asks Jeffrey; the answer reaches you through the Main session.
- **R4-06** (Low) — should your 24 weight-600 lines go to 500 (the printed sheet keeps 700–900)? Don't change weights unless Jeffrey decides. The design review asks Jeffrey; the answer reaches you through the Main session.
- **R4-13** (Low) — "Ask an admin to open it." (Camps, recommended) or "… to reopen." (yours, `text.js:90, 495`). The design review asks Jeffrey; the answer reaches you through the Main session.
- **Where Edit details returns** (Low): after Edit details, Black Belt goes back to the candidate's detail (`useCandidateActions.js:870`), while Star and Camps close to the roster (`CampPage.jsx:913–917`), so the Undo toast shows in different places. Is one rule wanted? The design review asks Jeffrey; the answer reaches you through the Main session.
- **The roster-order line** (R3's S-9, Low): only Black Belt says how its roster is sorted ("Dan, then school, then last name", `text.js:525`). Keep it, drop it, or add it to the other rosters? The design review asks Jeffrey; the answer reaches you through the Main session.

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

---

## Done when

- Every Fix now item is built, reviewed and approved by Jeffrey in the preview: a design reviewer at the four sizes for visual changes, a code reviewer, and a security reviewer for anything touching the database or privacy (R1-01's migration; R1-04, R4-01 and R4-04 are privacy fixes).
- These pass: `npm run build` and `npm run build:preview-mode`; `src/lib/blackBelt/checks.mjs` and `src/lib/shared/checks.mjs`; the Function tests (`node --test functions/tests/`).
- Jeffrey's decisions are rows from your block.
- The status file is current, and the work is committed on `black-belt`. **No push.**
- The report is sent to the Main session.

- R1-01's PGlite tests pass, Jeffrey has applied it, and the after-apply checks passed (fingerprints, security advisor, tests file).
