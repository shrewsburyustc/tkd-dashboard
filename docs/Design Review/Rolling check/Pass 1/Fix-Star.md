# Star testing — fixes from the design review's rolling check (pass 1)

**Paste into:** the Star testing session.

This file reaches your worktree when `design-review` is merged into main; until then the Design Review session sends its text by message.

**Starter to paste:**

> `git merge main` first. Then read and do `docs/Design Review/Rolling check/Pass 1/Fix-Star.md`: the fixes the design review's rolling check found in your merged work. Plan first. Mockups first for anything that changes how a screen looks. Nothing is built before I OK it.

---

## The brief

The design review's rolling check (phase 1d) looks at each section's design-review work after it merges: against the rulebook, the approved mockups, and the other sections that do the same job. Pass 1 covered `main` up to 5f1db41 (2026-11-03), in preview mode at the four sizes. Four reviewers looked (R1 money · R2 changes, mistakes and safety nets · R3 lists, menus and pickers · R4 item-by-item conformance and privacy). Two separate checkers then verified every finding. This file is what they confirmed in Star's merged work (Part 1 and Part 2, S1–S12).

- **Fix now:** straight fixes. Plan them, show Jeffrey, then build. An item marked "after [owner]'s [id]" waits until that fix is on main: plan it now, build it after.
- **Waits on Jeffrey:** nothing now: Jeffrey answered every pass 1 question (v1.035–v1.051).
- **Smaller:** fix them while you're in the file.
- Each item keeps its finding id (R1-02, R2-02 …) so Jeffrey can trace it. Use the id in your plan, status file and commits.
- **Line numbers** are main 5f1db41's; they may have moved. Items decided in v1.045–v1.049 cite main 84a6e7d's, and items decided in v1.050–v1.051 main 392bc9e's.
- **Paths:** `CandidatesTab.jsx`, `CandidateDialog.jsx`, `CandidateHistory.jsx`, `CandidateRows.jsx`, `StarPaymentDialogs.jsx` and `candidates/text.js` are in `src/screens/testing/star/candidates/`. `star/…` is under `src/screens/testing/star/`: `ResultRows.jsx` and `results.css` are in its `results/` folder, `StarEventsTab.jsx` in `events/`, `RubricsTab.jsx` and `star.css` at its top. `lib/star/…` is `src/lib/star/…`, `components/…` is `src/components/…`, and `testing/text.js` is Color Belt's `src/screens/testing/text.js`. Camps' files named for comparison are in `src/screens/camps/` and `src/lib/camps/`.

### Rules

- Follow CLAUDE.md.
- **Preview mode for building and trying changes:** `npm run dev:preview-mode`. `npm run dev`, `npm run preview` and `Start dashboard.bat` use the live database (`.worktreeinclude` copies `.env.local` into every worktree): run them only for a check Jeffrey OKs, never to try a change. `npm run build` is fine: it only builds.
- **Plan first:** a short plan (each item, its files, its mockup, any migration) in your docs folder; show it to Jeffrey.
- **Mockups before code** for every visual change, at PC 1280×800, tablet 820×1180 touch, phone 390×844 touch and 320 wide: a self-contained HTML file plus one PNG per screen with what changes outlined in amber (Jeffrey reviews the PNGs). He OKs them one screen at a time, before any code.
- **One decision at a time,** with pictures: each option drawn, its pros and cons, and a recommendation.
- **Reviews:** a separate design reviewer (the rulebook, the approved mockups, screenshots at the four sizes, and §4's six WCAG 2.2 checks, v1.033); a separate code reviewer; a separate security reviewer for anything touching the database (handoff §6).
- **Order (a push to main deploys):** the migration is live before the push that brings the app that uses it. A step whose app calls a new or changed database function is merged only after Jeffrey has applied its migration and the checks passed (fingerprints, security advisor, tests file — CLAUDE.md). Screen-only steps can go first.
- **Migrations:** R1-01, R1-02 and R2-02 each need a database change (and S-1 does, if you change the order in the database) (one migration can hold several if you plan them together). Ask the Main session for a migration number. Follow handoff §6 (`docs/Dashboard Docs/TKD-Dashboard-Handoff.md`). Add a SETUP section "## Migration 00NN: …" with steps `### 00NNa.` …, a `step00NN` in `supabase/tests/pglite/run.mjs`, a tests file and a fingerprints file. Run the PGlite tests with `cd supabase/tests/pglite && npm ci && node run.mjs` (`npm ci` once per worktree).
- **Don't change a shared part on your own** (`src/components/…`, the shared helpers in `src/lib/`, `src/styles/shared.css`): every section uses them. If you need something a part can't do, ask Jeffrey first. He decides whether you change it in your branch (then list it as a shared file) or the Dashboard core session does.
- List every CLAUDE.md shared file you touch (`src/styles/shared.css` and `src/components/text.js` are on that list).
  - Star's fake database is in `src/lib/mockStar*.js`.
  - `src/lib/mockClient.js` picks up a new fake function from their `RPC_ARGS` lists by itself, so it changes only for a new `__tkdPreview` helper.
- **Status file:** keep `docs/Testing/Star Testing/TKD-StarTesting-Status.md` current. Add a short "Rolling check, pass 1" section, and update it in the same turn a step finishes or a decision is made.
- Commit on `star-testing` after each reviewed step. **Never push.**
- When a step is done, send the Main session a short report: Done (with the commit) · Needs Jeffrey (one question, options, your recommendation) · Next.

### Rulebook

- New rows only for what Jeffrey decides in your mockups and questions, from your block **0.500–0.599**: the next unused number (check the rulebook first).
- `git merge main` first, and re-read the rulebook right before editing: other sessions edit it too.
- The 10b row goes just above `| Approved 2026-10-16 (v0.26) |`, the changelog line at the end of §11. Bump the header's **Version** and **Last updated**, and keep CRLF.
- A row that changes an older one adds a "(See v0.5xx …)" note at the start of that row.

---

## Fix now

Most severe first.

### R2-02 — Edit event's Undo can stop halfway, then blames "someone else" · High

Picture (today, with amber outlines): `docs/Design Review/Rolling check/Pass 1/pictures/H3-star-event-undo-half-done.png`.

High, though rare: it needs the connection to drop between two quick calls.

- **What's wrong:** Edit event's Undo is two saves: the details, then the registration switch (`star/events/StarEventsTab.jsx:487–512`). If only the second save fails, the old name comes back but registration stays as edited (in the checker's run it stayed Open), and the bar says "Undo didn't save". Retry then sends both calls again with the old version (`:552–572`) and says "Couldn't undo. Someone else changed this just now." That is false: the Undo's own first step changed the version. (A *version* is the number each saved row carries; a save sends the version it read, and the database refuses the save if the row changed since.) Families can still register, against what the Undo was meant to do.
- **Rule:** v0.970 (Black Belt's Edit cycle Undo became one database step; "Undo stopped halfway" retired), v1.006, §3.5.
- **Change:** Build it on the live rules: `star_update_event` as 0023 left it (it keeps registration closed in the same transaction, v0.504 case 2), not 0006's; and 0028's `star_start_time_is_valid`.
  - Add one Star database function that puts the old details and the old registration switch back together or not at all, like `bb_undo_cycle_edit` in 0032 (the model: `src/blackBelt/staff/cycle/useCycleEditor.jsx:381–428` and `supabase/migrations/0032_black_belt_review.sql:321–406`). The toast's Undo calls it once.
  - Ask the Main session for a migration number. Jeffrey applies it. The migration is live before the push that brings the app that uses it.
  - Until it is live, Retry must re-send only the step that failed, with the version the first step returned, and must never say "someone else".
  - Its fake twin goes in Star's preview store (`src/lib/mockStar*.js`). Color Belt has the same two steps; its own note covers it.
- **Check (preview mode):** in Edit event, rename the event and switch registration Open → Save. Then:
  - **Before the migration is live (two steps):** `__tkdPreview.setTestingDelay(1500)` → Undo → `__tkdPreview.failNextSave('star')` about 2 s later (it fails the second step) → the bar says "Undo didn't save…" with Retry, never "someone else". Retry → "Undone", with the name and the switch both back.
  - **With the one-step function:** `__tkdPreview.failNextSave('star')` → Undo (its one call fails) → the bar says "Undo didn't save…" with Retry, and nothing changed: the new name and Open both stay. Retry → "Undone", with the name and the switch both back.

### R1-01 — Count each payment at the desk that took it · High · decided 2026-11-04 (v1.035)

- **What's wrong:** Finance counts a Star payment for the candidate's *current* school (`0026_finance_black_belt.sql:597–602`), and `star_payments` has no school column (`0006:708–718`). So a Worcester family's cash taken at the Shrewsbury desk counts in Worcester's report and drawer, and editing a candidate's school later moves money already counted, even on closed days.
- **Rule:** v1.035 (Jeffrey, 2026-11-04): every payment counts at the school of the desk that took it, the school set under This device in the account menu, as Camps does (v0.708). The school is stored on the payment when it is recorded, and an undo, edit or returned check copies it from the payment it corrects (v0.903's chain rule). A refund counts at the desk that hands the money back (v1.040). Money booked to the wrong school is moved by undoing it and recording it again on a device set to the right school.
- **Change:**
  - One Star migration: `star_payments` gets a school column. Existing rows take the candidate's school as it is when the migration runs (the school Finance shows for them today). `star_record_payment` takes the device's school and stores it. Undo and Edit payment (its reversal *and* its new payment row, `star_edit_payment`) copy it from the payment they correct. `star_record_refund` takes the device's school too (v1.040: a refund counts at the desk that hands the money back); its new input also has a default (blank = the candidate's school), so the live app keeps working until the push. Ask the Main session for a migration number. Jeffrey applies it. The new input has a default (blank = the candidate's school, as 0033 did for `camp_mark_paid`), so the live app keeps working. The migration is live before the push that brings the app that uses it, and that push also waits until Finance's R1-01 migration is live. Otherwise a payment taken at the other desk shows at the candidate's school, then moves when Finance switches, and a closed day reads "Changed after closing".
  - If R1-02's migration isn't written yet, plan the two together: both replace `star_record_payment`.
  - The app passes This device's school. `src/App.jsx` already hands it to Camps (`deviceLocation`, `App.jsx:1102–1103`); passing it to your screens touches `src/App.jsx` and `src/screens/Testing.jsx` (it renders your screens), both CLAUDE.md shared files: list them.
  - The fake twin (`src/lib/mockStarCandidates.js`) changes too, or the check below can't pass.
  - Finance then reads the stored school (Finance's R1-01, after yours). Tell the Main session when your migration is live.
- **Check (preview mode):** This device = Shrewsbury (account menu), top bar on Worcester: mark a Worcester candidate paid → the fake payment row stores Shrewsbury. Edit that candidate's school → the payment's school doesn't change. Undo the payment → the reversal row has Shrewsbury too.

### R1-02 — The Mark paid box says "They chose Check on the form" after the desk changed it · Medium

- **What's wrong:** Lily Brooks registered on the family form with Cash. ⋯ Change how they'll pay → Check. The Mark paid box then says "They chose Check on the form." She paid by Card: the roster says "Card", but her summary keeps "Paying by: Check (chosen on the form)". The box puts words in the family's mouth. The hint is worked out from where the candidate came from (`row.source === 'form'`), not from where Paying by was chosen. Camps (v0.735) and Color Belt (v0.418, on its branch) already do it right.
- **Rule:** v1.104 and v0.518: the hint says "… on the form." or "… at the desk.". Jeffrey's rule for Color Belt and Camps: "If they change how they pay the dashboard should reflect that" (v0.418 on `color-belt`, v0.735).
- **Change:** copy Camps' 0033 pattern.
  - A Star migration keeps the form's own choice on the candidate (`paying_by_on_form`, never changed).
  - `star_record_payment` with another way changes Paying by (logged), and Undo payment puts the old one back. (Today it never touches `paying_by`: `0006_star_testing.sql:4759–4765`.)
  - Then `CandidatesTab.jsx:1457` and `candidates/text.js:257` / `CandidateDialog.jsx:188` work out form / desk from Paying by vs the form's choice (like `campRules.js:466–469`).
  - Ask the Main session for a migration number. Jeffrey applies it. The migration is live before the push that brings the app that uses it.
- **Check (preview mode):** Lily Brooks → Change how they'll pay → Check → the box says "They chose Check at the desk."; pay by Card → the summary says "Card (chosen at the desk)" and History lists both changes (needs R1-03 too); Undo payment → back to Check.

### R1-03 — History never lists a Paying by change · Medium

- **What's wrong:** `CandidateHistory.jsx:87` skips every column whose name ends in `_by` (meant for `updated_by`). `paying_by` ends in `_by` too, so the `paying_by` label (`:32`) is never reached and a Paying by change never shows. Lily's history read "3 changes" (payment, signed, registered) with no Cash → Check, although the preview's change log holds the `star_change_paying_by` row. (Star's Edit details has no Paying by, so only Change how they'll pay is affected.)
- **Rule:** v0.518 (S6), v1.108: the history lists what changed.
- **Change:** skip the bookkeeping columns by name instead (`created_by`, `updated_by`, `withdrawn_by`, and anything ending in `_by_name`), move the column skip and `linesFor` from `CandidateHistory.jsx` into a plain `.js` file under `src/lib/star/`, then add a Star check (e.g. in `src/lib/star/candidatesChecks.mjs`) that a `star_change_paying_by` row gives "Paying by: Cash → Check". While Hide private details is on it must stay out: `historyPrivacy` in `src/lib/star/candidatesCore.js:117–123` already treats it as a payment row.
- **Check (preview mode):** Change how they'll pay on a fresh candidate → History shows the line; turn Hide private details on → the line is left out and the gray line shows.

### R5-05 — Payments recorded drops a withdrawn candidate's payment · Medium · decided 2026-11-04 (v1.038)

Picture: `docs/Design Review/Rolling check/Pass 1/pictures/Q4-payments-recorded-card.png`.

- **What's wrong:** your Payments recorded card adds up only the candidates still on the roster (`CandidatesTab.jsx:261`, `active` only). After a paid candidate withdraws it drops (Noah Chen's $140 → $0), though the payment is still on record.
- **Rule:** v1.038 (Jeffrey, 2026-11-04: "Money received should be counted reguardless of removed status. If we refunded and undid the payment then it should go down. Clear cut and dry."): the card adds up all money received for the event, withdrawn candidates included; undone payments and refunds come off. When part of it belongs to removed candidates, the gray line "includes $X from removed candidates" sits under the number (Color Belt's line).
- **Change:** `CandidatesTab.jsx:256–262`: `payments` adds the removed rows' `paidCents` (with the same school filter as the roster), and a removed-payments figure feeds the Payments recorded card's `note` (`:1489–1500`); the shared `CountCards` already draws a note. Hide private details: unchanged (the card isn't drawn).
- **Check (preview mode):** Fall Star Testing → withdraw Noah Chen (paid $140) → Payments recorded stays $140 with "includes $140 from removed candidates". Restore → the line goes. Undo a payment → the total goes down. On Both the total covers both schools.

### R2-05 (your part) — An Undo pressed during another save is dropped without a word · Medium · after Dashboard core's R2-05

- **What's wrong:** the shared Toast removes itself before it runs Undo (`components/Toast.jsx:73–77`), and Star's Undo returns early while another save runs (`star/candidates/CandidatesTab.jsx:560`, `StarEventsTab.jsx:552`, `RubricsTab.jsx:592`). So the toast vanishes, nothing happens and nothing is said. Staff believe it was undone.
- **Rule:** rule 1.4 / v1.006; §3.5 (never silent).
- **Change:** after Dashboard core's R2-05 (an Undo pressed while a save runs is *queued*: it waits its turn and runs as soon as that save ends, and its toast stays as "Undoing…"), Star's `runUndo`s use Dashboard core's helper.
- **Check (preview mode):** `__tkdPreview.setTestingDelay(2500)`; withdraw candidate A, withdraw candidate B, press A's Undo during B's save → A comes back with "Undone".

### R3-02 — A possible duplicate is counted twice, and offers Mark paid · Low–Medium · decided 2026-11-04 (v1.046)

- **What's wrong:** both rows of a possible-duplicate pair count in your cards (`CandidatesTab.jsx:256–260`): Not paid lists both Ava Reeds, so one child is counted twice. Both rows also offer Mark paid (`CandidateRows.jsx:114`), so a payment can land on the copy that is later withdrawn. (The checkers rated the counts Low, and Mark paid on a duplicate Low–Medium.) Black Belt leaves these rows out of its cards, with a gray line; Color Belt and Camps offer no payment on them.
- **Rule:** v1.046 (8) (Jeffrey, 2026-11-04: "Approve all"): a row marked "Possible duplicate" stays out of Paid and Not paid until the pair is resolved, with one gray line under the cards saying so, as Black Belt does; Payments recorded still counts any money received (v1.038). Until then such a row offers no Mark paid or Record payment.
- **Change:**
  - Counts: leave the flagged rows (the `pairs`, `CandidatesTab.jsx:279–288`, as the ⋯ menu's `flagged` does, `:1128`) out of Paid and Not paid (`:259–260`; Candidates and its school counts don't change), and out of the Paid / Not paid filters (`:271–272`), so a card lists exactly what it counts, as Black Belt's `rosterFilter` does (`src/lib/blackBelt/rules.js:1062`). Payments recorded (`:261`, and R5-05's change) keeps any money they hold.
  - The gray line: the shared `CountCards`' `note` (`:1490`), in words that name Paid and Not paid, drawn in your mockup for Jeffrey (Black Belt's "… isn't counted in the cards …", `src/blackBelt/staff/text.js:511–513`, would be wrong here, because Candidates still counts the row).
  - Mark paid: `showRecord` (`CandidateRows.jsx:114`) leaves out a flagged row, as Color Belt's roster does.
  - Mockup first.
- **Check (preview mode):** `__tkdPreview.resetTesting()`, Fall Star Testing: neither Ava Reed row offers Mark paid; Paid and Not paid leave them out (Candidates still counts them), and the gray line says so; tap Not paid: neither Ava Reed is listed. Review → Keep this one: the kept row counts again and offers Mark paid, and the line goes.

### R4-08 — The grayed Email result has the wrong gray and doesn't tell screen readers why · Low

- **What's wrong:** with Hide private details on, Star's grayed Email result uses the hairline border (`--color-border`) and a plain cursor, and screen readers aren't told why it's off. Prospects' grayed Email uses v1.103's unavailable look (`--color-border-strong`, `not-allowed`) with `aria-describedby` (an attribute that points a control at the text explaining it; a screen reader reads that text after the button's name).
- **Rule:** v1.000 (2) ("the approved unavailable look, still focusable, as Star's Email result"); v1.103.
- **Change:** in `star/results/results.css:182–187` use v1.103's tokens (or step 2's page-wide `.btn.is-unavailable` once it exists), and in `ResultRows.jsx:139–159` point `aria-describedby` at the "Email result is off …" line (give it an id). Black Belt copies it in its Part 2.
- **Check (preview mode):** Results tab, switch on, 820 touch: border rgb(207, 207, 202), cursor `not-allowed`, and the button's description is the line.

### R2-08 (Star's part) — Two changes with no 5-second Undo · Low

- **What's wrong:** "Private testing set" (`CandidatesTab.jsx:852`) and "Make-up … added" (`:1056`) have no Undo. Star's own Back to the testing day (`:865–871`) and Add candidate (`:488–491`) do, and so does Black Belt's make-up add (`blackBelt/staff/candidates/useMakeupPicker.js:96–98`). In one place a slip can be undone, in the next it can't.
- **Rule:** v1.006 / rule 1.4: every change that can be reversed gets Undo for 5 seconds.
- **Change:**
  - Private testing: Undo puts the old private day and time back, or clears a newly set one.
  - Make-up: an admin's Undo deletes the new row, as Add candidate's does, and resets the open picker's "added" mark.
  - Not part of this fix: "Kept both" (no Undo in any section, recorded as an exception: v1.049 (b)), and Forms' Duplicate (the new students session's part of R2-08).
- **Check (preview mode):** each action → toast with Undo → Undo → "Undone", and the row is back as before.

### R2-10 — The Compare box's Keep buttons have the old hidden names · Low

- **What's wrong:** Star passes `keepLabel={T.keepThisOneLabel}` (`CandidatesTab.jsx:1345` → `testing/text.js:689`), so screen readers and voice control hear "Keep the first registration". That doesn't contain the visible "Keep this one", so a voice-control user who says "Keep this one" gets nothing.
- **Rule:** WCAG 2.5.3, "label in name" (the name a screen reader or voice control uses must contain the words shown on the button), written into the shared part's header at `components/CompareDialog.jsx:31–35`.
- **Change:** drop the prop; the shared default is "Keep this one: First registration".
- **Check (preview mode):** open Review on Ava Reed and read the two buttons' accessible names.

### R4-10 = R3-08 — Two private-testing items have the wrong icons · Low · decided 2026-11-04 (v1.048)

- **What's wrong:** in a candidate's ⋯, "Change private day or time" uses the Edit pencil and "Back to the testing day" uses Undo's arrow (`CandidatesTab.jsx:1146–1147`). Undo's arrow means Undo and Restore (§2.4), and Color Belt's "Change day or time" uses `ti-calendar`. It was your DR plan question 5, never answered.
- **Rule:** v1.048 (13) (Jeffrey, 2026-11-04: "Approve all"): in Star, "Back to the testing day" uses `ti-calendar-event` instead of Undo's `ti-arrow-back-up`, and "Change private day or time" uses `ti-calendar`, as Color Belt's.
- **Change:** `CandidatesTab.jsx:1146`: `IconEdit` → `IconCalendar`; `:1147`: `IconArrowBackUp` → `IconCalendarEvent`. §2.4's map already lists both uses (the design review added them with v1.048).
- **Check (preview mode):** Fall Star Testing, ⋯ → Set private testing on a candidate and save, then open the same ⋯: Change private day or time shows the calendar, and Back to the testing day shows `ti-calendar-event`, at 1280 and in the 390 sheet.

### R4-13 (your part) — "Ask an admin to reopen." becomes "Ask an admin to open it." · Low · decided 2026-11-04 (v1.045)

- **What's wrong:** after a closing date has passed, staff read "The closing date has passed. Ask an admin to reopen." (`lib/star/eventsText.js:98`, shown in the event ⋯, `star/events/StarEventsTab.jsx:748`; and `:99`). Camps says "… Ask an admin to open it." (v0.725), which matches the Close / Open pair.
- **Rule:** v1.045 (5) (Jeffrey, 2026-11-04: "Approve all"): staff after a closing date read "Ask an admin to open it.", as Camps' v0.725.
- **Change:** `lib/star/eventsText.js:98–99`: "Ask an admin to reopen." → "Ask an admin to open it." (the second line keeps "Registration wasn't opened."), and update the check that asserts the old words (`src/lib/star/eventsChecks.mjs:879`).
- **Check (preview mode):** `__tkdPreview.setRole('staff')` and reload, then `__tkdPreview.setToday()` to a day after an event's closing date: that event's ⋯ shows Open registration grayed with "The closing date has passed. Ask an admin to open it."

### S-1 (your part) — On Both, Star lists Shrewsbury first: the Candidates card, the belt order, Grading, Results and the results CSV · Low · decided 2026-11-04 (v1.047)

- **What's wrong:** on Both, the Candidates card's two school counts put Shrewsbury above Worcester (`CandidatesTab.jsx:258`, "as drawn"), while the location switcher and your link cards put Worcester first. Your belt order does the same within each star level (v0.117): `sortBeltOrder` (`src/lib/star/candidatesCore.js:99–106`, used for the roster at `:402`), the Results list and the results CSV from the database (`star_event_results`, `0006_star_testing.sql:5920`, order at `:5948–5951`; `star_results_csv`, live in `0023_star_result_texts.sql:614`, order at `:656–659`), and the fake grading and results stores (`src/lib/mockStarGrading.js:143`, `src/lib/mockStarResults.js:113`).
- **Rule:** v1.047 (19) (Jeffrey, 2026-11-04: "Approve all"): Worcester comes first wherever both schools are listed, as in the location switcher.
- **Change:** `CandidatesTab.jsx:258`: `['worcester', 'shrewsbury']`, and its comment. The belt order: plan it and show Jeffrey, as Black Belt's S-1 does. Either the screens sort what they get (stars, then Worcester before Shrewsbury, then last and first name; the CSV rows sorted before the file is written), or one migration replaces `star_event_results` and `star_results_csv` with Worcester first (ask the Main session for a number; handoff §6; a security review). Either way `sortBeltOrder` and its comment, the two fake stores and the check at `src/lib/star/resultsChecks.mjs:154–156` change too.
- **Check (preview mode):** Fall Star Testing on Both, at 1280 and 390: the Candidates card lists Worcester, then Shrewsbury; within a star level the roster, the Grading and Results tabs and the downloaded results CSV list Worcester's candidates first.

### R2-07 (the words after an Undo) — "Undone" after every Undo · Low · decided 2026-11-04 (v1.051)

- **What's wrong:** two of your Undos don't say "Undone" when they work. The Undo of an edit that kept registration closed (v0.504) opens it again and says "Registration open" (`lib/star/eventsText.js:79`, passed as `doneText` at `star/events/StarEventsTab.jsx:466`). On the Results tab, the Undo in Mark as sent's toast says nothing at all (`star/results/ResultsTab.jsx:334–348`: it only reloads). Your other Undos say "Undone". Two of them should name the reopening too: the Undo of ⋯ Close registration opens registration again but says only "Undone" (`StarEventsTab.jsx:586–587`), and so does Edit event's Undo when the edit had closed registration (`:505–507`).
- **Rule:** v1.051 (1) (Jeffrey, 2026-11-04: "Yes approved go ahead"): after an Undo the toast says "Undone" everywhere; when the Undo reopens something people depend on, it adds one short sentence: Star "Undone. Registration is open again."; the same rule covers every Undo that opens registration, sign-up or a form again (R2-07's open part).
- **Change:** add "Undone. Registration is open again." to `lib/star/eventsText.js`, and show it after every Undo that opens registration again: the `doneText` at `StarEventsTab.jsx:466`, `switchRegistration`'s Undo (`:586–587`, when the Undo opened registration) and Edit event's Undo (`:505–507`) when it put registration back to open. An Undo that closes registration stays "Undone". Keep `TOAST_REGISTRATION_OPEN` (`:79`): Open registration's own toast still uses it (`StarEventsTab.jsx:592`). In the Results tab's `undoFromToast`, show "Undone" when the Undo worked.
- **Check (preview mode):** `__tkdPreview.setToday()` to a day after an open event's closing date → Edit event → untick the closing date → Save: "Changes saved. Registration stays closed …" → Undo → "Undone. Registration is open again.", and the event is open again. Results tab → a finished row's Email result → Mark as sent → Undo in its toast → "Undone", and the row reads "Not sent yet" again. ⋯ Close registration on an open event → Undo → "Undone. Registration is open again."; ⋯ Open registration on a closed one → Undo → "Undone".

### R1-08 (your part) — Mark paid buttons don't gray while a save runs · Low · after Dashboard core's R1-08

- **What's wrong:** while a Mark paid save runs, every row's Mark paid is `aria-disabled` (marked "off" for screen readers, but still reachable with Tab) yet looks exactly as before (`CandidateRows.jsx:124–128`). On slow mat-side Wi-Fi, taps do nothing and nothing says why.
- **Rule:** v1.103 / detail 8: a control that can't be used right now shows the approved unavailable look and stays focusable.
- **Change:** after Dashboard core's R1-08. If it grays `aria-disabled` buttons in `shared.css`, there is nothing to build here: check it. If it asks sections to add `is-unavailable` while busy, add it to the rows' Mark paid while a save runs.
- **Check (preview mode):** `__tkdPreview.setTestingDelay(3000)`, Mark paid one candidate: the other Mark paid buttons gray at once and come back after the save.

### R3-12 (your part) — The locked Dan shows the busy cursor · Low · after Dashboard core's R3-12

- **What's wrong:** Star locks the Dan for staff on a paid row with the Select's `readOnly` (`CandidateDialog.jsx:477`). The Stars field (:501) uses the same `readOnly` for another reason: it waits until a Dan is chosen, and it has no reason line. That is the "saving" look, with the busy cursor (`styles/shared.css:823–826`), although Star's approved words say "a grayed Dan" with its reason. On the PC the pointer turns into the busy spinner over a field that is simply locked, so staff wait.
- **Rule:** rulebook l.699 ("staff on a paid row get a grayed Dan"); v1.109 (read-only is the "saving" look); v1.103's unavailable look.
- **Change:** after Dashboard core's R3-12 gives the shared `Select` an "unavailable" state, Star's Dan and Stars fields use it. If Stars uses the new state too, show Jeffrey its reason line first.
- **Check (preview mode):** `__tkdPreview.setRole('staff')` and reload, then Edit details on a paid candidate: no busy cursor, and the reason is read on focus.

### R3-13 (your part) — Date hints say "dates", and Edit payment's Date paid has none · Low · after Dashboard core's R3-13

- **What's wrong:** Star says "Past dates can't be chosen." (`star/events/text.js:64`, `star/candidates/text.js:207`), while the newest rows say "days". Edit payment's "Date paid" grays the days after today with no hint at all (`StarPaymentDialogs.jsx:172–185`; the refund passes one at :231).
- **Rule:** the newest rows (v0.623 N6, v0.817 / v0.818) say "days" and show the hint.
- **Change:** after Dashboard core's R3-13 puts the words in `src/components/text.js`, use "Past days can't be chosen." and give Edit payment's Date paid "Days after today can't be chosen.". Leave the family-page date-of-birth hint unless Jeffrey wants it changed too.
- **Check (preview mode):** open each staff calendar: every calendar with gray days has exactly that one line.

### R1-06 (your part) — The Undo payment box takes Black Belt's words · Low · decided 2026-11-04 (v1.045) · after Dashboard core's R1-06

- **What's wrong:** your box asks "Undo [Name]'s payment?" and says "The $140 card payment recorded on [date] is reversed …" (`candidates/text.js:172–174`, drawn at `CandidatesTab.jsx:1264–1280`), though the date it shows is the day the family paid. Black Belt corrected the same words (v0.964, v0.965).
- **Rule:** v1.045 (2) (Jeffrey, 2026-11-04: "Approve all"): the Undo payment box uses Black Belt's words: "Undo [Name]'s $X [way] payment?", "Paid on [date] …" and the section's own consequence. v1.045: "Built by Dashboard core (the shared words) and by each section switching to them."
- **Change:** after Dashboard core's R1-06, take the title and "Paid on [date]" from `src/components/text.js`, pass the amount and the way (`CandidatesTab.jsx:1267`), and keep your own consequence (the row goes back to Not paid; both stay in the history). Your Undo refund box (`candidates/text.js:176`) isn't part of this.
- **Check (preview mode):** mark Lily Brooks paid $140 by card → ⋯ Undo payment: the box asks "Undo Lily Brooks's $140 card payment?", and its line starts "Paid on" with the payment's date.

### R1-07 (your part) — One set of payment words: toasts, payment line and history · Low · decided 2026-11-04 (v1.045) · after Dashboard core's R1-07

- **What's wrong:** after Mark paid your toast says just "Payment recorded" (`candidates/text.js:141`, `CandidatesTab.jsx:617`): no name, no amount. Camps and Color Belt say "[Name] marked paid · $X [way]". Your payment line ("$140 card · paid Nov 3", `candidates/text.js:262`; phones `:93`) and history words ("Payment recorded: $140 card, paid Nov 3", `:311, 313`) differ from Camps' too.
- **Rule:** v1.045 (3) (Jeffrey, 2026-11-04: "Approve all"): the toasts after Mark paid and Undo payment read "[Name] marked paid · $X [way]" (while hidden, "[Name] marked paid", v0.722) and "Payment undone for [Name]"; the person's payment line and the history's payment words become one set too, drawn in Dashboard core's mockup.
- **Change:** after Dashboard core's R1-07, take the toast words from `src/components/text.js`: Mark paid's (`CandidatesTab.jsx:617`) and Undo payment's (`:813`; `lib/star/candidatesText.js:82` already has the same words). Then the payment line (`CandidateDialog.jsx:150`, `CandidateRows.jsx:169`) and the history (`CandidateHistory.jsx:61, 63`, or the `.js` file R1-03 moves them to) use the set in Dashboard core's approved mockup.
- **Check (preview mode):** mark Lily Brooks paid $140 by card: the toast reads "Lily Brooks marked paid · $140 card"; ⋯ Undo payment → Undo payment: "Payment undone for Lily Brooks". Her summary's payment line and History read as the approved mockup.

### R2-07 (your part) — One set of words for "someone else changed it" and a failed Undo · Low · decided 2026-11-04 (v1.045) · after Dashboard core's R2-07

- **What's wrong:** your refusals say "Someone else changed this just now. Your change wasn't saved." and "Couldn't undo. Someone else changed this just now." (`star/text.js:231, 241`; `lib/star/candidatesText.js:22`; `lib/star/eventsText.js:92`), and two failed Undos say "Couldn't undo. Check the connection, then try again." (`candidates/text.js:151`, the Undo payment and Undo refund boxes; `lib/star/resultsText.js:123`). Black Belt's newer words name who changed and say what the screen now shows.
- **Rule:** v1.045 (4) (Jeffrey, 2026-11-04: "Approve all"): a refused change or Undo says "Someone else changed [Name] just now, so nothing was done. Their change is shown." or "Couldn't undo: [reason].", and a failed Undo says "Undo didn't save. Check the connection, then retry." (Black Belt's words: v0.966 (2) and its own Undo lines); item (4)'s sentences are kept once in the shared words file (`src/components/text.js`).
- **Change:** after Dashboard core's R2-07, use its three sentences from `src/components/text.js` at those lines ([Name] is the candidate's or the event's name). `star/text.js:242` already says the failed-Undo sentence: take it from the shared file too.
- **Check (preview mode):** withdraw a candidate, then `__tkdPreview.simulateOtherAdminEdit()`, then Undo within 5 s: the bar says "Someone else changed [Name] just now, so nothing was done. Their change is shown." Then, on a paid candidate, `__tkdPreview.failNextSave('star')` and ⋯ Undo payment → Undo payment: the box says "Undo didn't save. Check the connection, then retry."

### R3-06 (your part) — Your back link switches to the shared one · Low · decided 2026-11-04 (v1.048) · after Dashboard core's R3-06

- **What's wrong:** each section draws its own back link. Yours (`.st-back`, `star/star.css:19–25, 589–592`) has the approved look, but six copies drift: Camps' and Black Belt's are 28 px and push the title down on touch.
- **Rule:** v1.048 (12) (Jeffrey, 2026-11-04: "Approve all"): Dashboard core builds one shared back link in `.tc-back`'s look (24 px, a 16 px arrow, a 44 px touch box pulled back so the title doesn't move), and every section switches to it.
- **Change:** after Dashboard core's R3-06, your three back links use it (`star/event/StarEventPage.jsx:722`, `star/grading/PrivateGradingPage.jsx:98`, `star/StarTesting.jsx:122`), with their words and screen-reader names, and `.st-back` goes from `star.css` (`:19–25, 589–592, 779`). Your focus code looks for `.st-back` (`StarEventPage.jsx:614`): point it at the shared link.
- **Check (preview mode):** the Star testing page, an event page and a private grading page at 1280, 820 touch, 390 and 320: the back link looks as today, the title doesn't move between 1280 and 820, and focus lands on the link where it did before.

### S-2 (your part) — One line when a page can't load · Low · decided 2026-11-04 (v1.051) · after Dashboard core's S-2

- **What's wrong:** most of your load failures already end "Check the connection, then retry." with Retry. Three end "then try again": the Results tab (`lib/star/resultsText.js:152`), the private grading page (`star/grading/text.js:88`) and the Grading tab (`:102`; both v0.513's words). Two show the "then retry" line with nothing to press: a candidate's summary that couldn't load (`CandidateDialog.jsx:247`, Cancel only) and the signature box (`star/candidates/SignatureDialog.jsx:19`).
- **Rule:** v1.051 (2) (Jeffrey, 2026-11-04: "Yes approved go ahead"): when a page can't load, it says "Couldn't load. Check the connection, then retry." with Retry, everywhere. A line may still name what didn't load ("Couldn't load the calendar. Check the connection, then retry."), so only the endings change. v1.051 (2) names these three lines of yours too (two of them v0.513's). A read that fails behind a menu or inside a dialog is a connection failure too: v1.004 and §8 ("always include Retry where it applies") already ask for its Retry.
- **Change:** after Dashboard core's S-2 puts the sentence in `src/components/text.js`, the three lines end "Check the connection, then retry." (they keep naming what didn't load, as your other lines do), and the summary and the signature box get a Retry that reads again.
- **Check (preview mode):** `failNextSave('star')` fails only writes, so add a failed-read helper in your own fake store (`src/lib/mockStar*.js`, registered in `src/lib/mockClient.js`, a CLAUDE.md shared file: list it), or a check case, as Black Belt's R4-11 does. With it armed, open a candidate: "Couldn't load this candidate. Check the connection, then retry." with Retry, and Retry opens the summary. The Results and Grading lines end "then retry".

---

## Waits on Jeffrey (don't build yet)

Nothing now. Jeffrey answered every pass 1 question on 2026-11-04 (v1.035–v1.051); each answer is a Fix now or Smaller item in this file.

---

## Smaller (fix while you're in the file)

- Two classes for the same grayed-reason line: Star's own `.st-menu-why` is used only in `RubricsTab.jsx:792` (styled in `star.css:567–572`); everywhere else uses `.ev-menu-reason`. Use one. Low.
- Stale status line: your status file's line 12 still says "being built … one merge into main" (`docs/Testing/Star Testing/TKD-StarTesting-Status.md`). Low.
- **R2-03 is decided** (2026-11-04, v1.043): every section now follows your no-Undo rule for a restored Duplicate copy (v0.517 G3). Nothing to change.
- **R3-09 is decided** (2026-11-04, v1.047 (14)): your roster gets no search box. Star and Color Belt rely on the planned top-bar people search (v1.031). Nothing to build.
- **R4-02 is decided** (2026-11-04, v1.049 (a)): an open New candidate form keeps what was typed when Hide private details is turned on from another browser tab (`CandidateDialog.jsx:415, 456`). It is recorded as a known gap in v0.249's "every screen". Nothing to build.
- **S-9 is decided** (2026-11-04, v1.047 (17)): a roster says its sort order only when it isn't by name. Black Belt's line stays, and no other roster adds one. Nothing to build.
- **S-10 is decided** (2026-11-04, v1.048 (20)): the browser dropdown in your result-text preview (`star/ResultTextDialog.jsx:293`) becomes the shared Select (v1.100) when you next work on that screen. No sweep, so nothing to build until then.

---

## Done when

- Every Fix now item is built, reviewed and approved by Jeffrey in the preview: a design reviewer at the four sizes for visual changes, a code reviewer, and a security reviewer for anything touching the database or privacy (R1-01's, R1-02's and R2-02's migrations; R1-03's history while Hide private details is on).
- Each migration's PGlite tests pass, Jeffrey has applied it, and the after-apply checks passed (fingerprints, security advisor, tests file).
- Both builds pass (`npm run build` and `npm run build:preview-mode`), and so do Star's eight check files (`node src/lib/star/<name>Checks.mjs`) and `node src/lib/shared/checks.mjs`.
- Jeffrey's decisions are rows from your block.
- The status file is current, and the work is committed on `star-testing`. **No push.**
- The report is sent to the Main session.
