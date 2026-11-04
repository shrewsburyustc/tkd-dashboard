# Star testing — fixes from the design review's rolling check (pass 1)

**Paste into:** the Star testing session.

This file reaches your worktree when `design-review` is merged into main; until then the Design Review session sends its text by message.

**Starter to paste:**

> `git merge main` first. Then read and do `docs/Design Review/Rolling check/Pass 1/Fix-Star.md`: the fixes the design review's rolling check found in your merged work. Plan first. Mockups first for anything that changes how a screen looks. Nothing is built before I OK it.

---

## The brief

The design review's rolling check (phase 1d) looks at each section's design-review work after it merges: against the rulebook, the approved mockups, and the other sections that do the same job. Pass 1 covered `main` up to 5f1db41 (2026-11-03), in preview mode at the four sizes. Four reviewers looked (R1 money · R2 changes, mistakes and safety nets · R3 lists, menus and pickers · R4 item-by-item conformance and privacy). Two separate checkers then verified every finding. This file is what they confirmed in Star's merged work (Part 1 and Part 2, S1–S12).

- **Fix now:** straight fixes. Plan them, show Jeffrey, then build. An item marked "after [owner]'s [id]" waits until that fix is on main: plan it now, build it after.
- **Waits on Jeffrey:** a rule must be picked first. Don't build these yet.
- **Smaller:** fix them while you're in the file.
- Each item keeps its finding id (R1-02, R2-02 …) so Jeffrey can trace it. Use the id in your plan, status file and commits.
- **Line numbers** are main 5f1db41's; they may have moved.
- **Paths:** `CandidatesTab.jsx`, `CandidateDialog.jsx`, `CandidateHistory.jsx`, `CandidateRows.jsx`, `StarPaymentDialogs.jsx` and `candidates/text.js` are in `src/screens/testing/star/candidates/`. `star/…` is under `src/screens/testing/star/`: `ResultRows.jsx` and `results.css` are in its `results/` folder, `StarEventsTab.jsx` in `events/`, `RubricsTab.jsx` and `star.css` at its top. `lib/star/…` is `src/lib/star/…`, `components/…` is `src/components/…`, and `testing/text.js` is Color Belt's `src/screens/testing/text.js`. Camps' files named for comparison are in `src/screens/camps/` and `src/lib/camps/`.

### Rules

- Follow CLAUDE.md.
- **Preview mode for building and trying changes:** `npm run dev:preview-mode`. `npm run dev`, `npm run preview` and `Start dashboard.bat` use the live database (`.worktreeinclude` copies `.env.local` into every worktree): run them only for a check Jeffrey OKs, never to try a change. `npm run build` is fine: it only builds.
- **Plan first:** a short plan (each item, its files, its mockup, any migration) in your docs folder; show it to Jeffrey.
- **Mockups before code** for every visual change, at PC 1280×800, tablet 820×1180 touch, phone 390×844 touch and 320 wide: a self-contained HTML file plus one PNG per screen with what changes outlined in amber (Jeffrey reviews the PNGs). He OKs them one screen at a time, before any code.
- **One decision at a time,** with pictures: each option drawn, its pros and cons, and a recommendation.
- **Reviews:** a separate design reviewer (the rulebook, the approved mockups, screenshots at the four sizes, and §4's six WCAG 2.2 checks, v1.033); a separate code reviewer; a separate security reviewer for anything touching the database (handoff §6).
- **Order (a push to main deploys):** the migration is live before the push that brings the app that uses it. A step whose app calls a new or changed database function is merged only after Jeffrey has applied its migration and the checks passed (fingerprints, security advisor, tests file — CLAUDE.md). Screen-only steps can go first.
- **Migrations:** R1-02 and R2-02 each need a database change (one migration can hold both if you plan them together). Ask the Main session for a migration number. Follow handoff §6 (`docs/Dashboard Docs/TKD-Dashboard-Handoff.md`). Add a SETUP section "## Migration 00NN: …" with steps `### 00NNa.` …, a `step00NN` in `supabase/tests/pglite/run.mjs`, a tests file and a fingerprints file. Run the PGlite tests with `cd supabase/tests/pglite && npm ci && node run.mjs` (`npm ci` once per worktree).
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

### R2-05 (your part) — An Undo pressed during another save is dropped without a word · Medium · after Dashboard core's R2-05

- **What's wrong:** the shared Toast removes itself before it runs Undo (`components/Toast.jsx:73–77`), and Star's Undo returns early while another save runs (`star/candidates/CandidatesTab.jsx:560`, `StarEventsTab.jsx:552`, `RubricsTab.jsx:592`). So the toast vanishes, nothing happens and nothing is said. Staff believe it was undone.
- **Rule:** rule 1.4 / v1.006; §3.5 (never silent).
- **Change:** after Dashboard core's R2-05 (an Undo pressed while a save runs is *queued*: it waits its turn and runs as soon as that save ends, and its toast stays as "Undoing…"), Star's `runUndo`s use Dashboard core's helper.
- **Check (preview mode):** `__tkdPreview.setTestingDelay(2500)`; withdraw candidate A, withdraw candidate B, press A's Undo during B's save → A comes back with "Undone".

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
  - Not part of this fix: "Kept both" (no Undo in any section; the design review settles it), and Forms' Duplicate (the new students session's part of R2-08).
- **Check (preview mode):** each action → toast with Undo → Undo → "Undone", and the row is back as before.

### R2-10 — The Compare box's Keep buttons have the old hidden names · Low

- **What's wrong:** Star passes `keepLabel={T.keepThisOneLabel}` (`CandidatesTab.jsx:1345` → `testing/text.js:689`), so screen readers and voice control hear "Keep the first registration". That doesn't contain the visible "Keep this one", so a voice-control user who says "Keep this one" gets nothing.
- **Rule:** WCAG 2.5.3, "label in name" (the name a screen reader or voice control uses must contain the words shown on the button), written into the shared part's header at `components/CompareDialog.jsx:31–35`.
- **Change:** drop the prop; the shared default is "Keep this one: First registration".
- **Check (preview mode):** open Review on Ava Reed and read the two buttons' accessible names.

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

---

## Waits on Jeffrey (don't build yet)

- **R1-01** (High) — which school's Daily report counts a payment taken at one school's desk (today Finance books Star's money to the candidate's *current* school, so editing the school moves money already counted: `star_payments` has no school column, `0006:708–718`). The checkers recommend storing the school with each payment whatever the answer. The design review asks Jeffrey; the answer reaches you through the Main session.
- **R2-03** (Medium) — Undo after restoring a "Duplicate copy": your no-Undo rule (v0.517 G3, `CandidatesTab.jsx:900–910`) everywhere, which is recommended, or a real Undo everywhere (then Star gains one too). The design review asks Jeffrey; the answer reaches you through the Main session.
- **R1-06** (Low) — one Undo payment box for every section: Black Belt's words ("Undo [Name]'s $X [way] payment?" + "Paid on [date]", recommended), or yours with "recorded on" → "paid on" (today `candidates/text.js:172–174` is fed the paid-on date, `CandidatesTab.jsx:1278`). The design review asks Jeffrey; the answer reaches you through the Main session.
- **R1-07** (Low) — one toast after Mark paid and after Undo payment (yours, "Payment recorded", `candidates/text.js:141`, names no one and no amount). The design review asks Jeffrey; the answer reaches you through the Main session.
- **R2-07** (Low) — one set of words for "someone else changed it" and "Undo failed" (yours include "Couldn't undo. Someone else changed this just now."). The design review asks Jeffrey; the answer reaches you through the Main session.
- **R3-02** (Low) — should a "Possible duplicate" row count in Paid / Not paid until it's resolved (today `CandidatesTab.jsx:253–261` counts both Ava Reeds)? You own this one; Camps and Color Belt follow the answer. The design review asks Jeffrey; the answer reaches you through the Main session.
- **Mark paid on a possible duplicate** (a checked smaller line, Low–Medium, same root as R3-02) — should a row flagged "Possible duplicate" offer Mark paid? Star offers it on both Ava Reed rows (`CandidateRows.jsx:114`), and Black Belt on both Noah Silva rows; Color Belt hides it (`src/screens/testing/event/RosterRows.jsx:79`), and Camps' duplicate tag replaces the pay tag (`CampRoster.jsx:62–77`). A payment can land on the copy that is later withdrawn. The design review asks Jeffrey; the answer reaches you through the Main session.
- **R3-06** (Low) — one shared back link made by Dashboard core, with your `.st-back`'s look (24 px; `star/star.css:19–25, 589–592`); you would swap your copy for it. The design review asks Jeffrey; the answer reaches you through the Main session.
- **R3-09** (Low) — in-list search: does Star's roster get a search box (A), or rely on the top-bar people search, v1.031 (B, recommended)? The design review asks Jeffrey; the answer reaches you through the Main session.
- **R4-02** (Low) — what an open New candidate form does when Hide private details turns on in another tab (today it keeps the typed birthday and email: `CandidateDialog.jsx:415, 456`, `hidden && !isNew`; recommended: leave it and record it in a row). The design review asks Jeffrey; the answer reaches you through the Main session.
- **R4-10 = R3-08** (Low) — the icon for "Back to the testing day" (your DR plan question 5, still open; today Undo's arrow, `CandidatesTab.jsx:1147`), and for "Change private day or time": your pencil or Color Belt's calendar (`ti-calendar`, recommended). The design review asks Jeffrey; the answer reaches you through the Main session.
- **R4-13** (Low) — "Ask an admin to open it." (Camps, recommended) or "… to reopen." (yours, `lib/star/eventsText.js:98–99`). The design review asks Jeffrey; the answer reaches you through the Main session.
- **R5-05, with R5-04** (Medium, pass 1b) — what Payments recorded adds up. Today your card leaves out a withdrawn candidate's payment (`CandidatesTab.jsx:261` sums `active` only), so it reads $0 after a paid candidate withdraws, though the payment is still on record. Recommended: all recorded money, with "includes $X from removed candidates" under the card (Color Belt's line; the shared `CountCards` already draws a note). The design review asks Jeffrey; the answer reaches you through the Main session.

---

## Smaller (fix while you're in the file)

- Two classes for the same grayed-reason line: Star's own `.st-menu-why` is used only in `RubricsTab.jsx:792` (styled in `star.css:567–572`); everywhere else uses `.ev-menu-reason`. Use one. Low.
- Stale status line: your status file's line 12 still says "being built … one merge into main" (`docs/Testing/Star Testing/TKD-StarTesting-Status.md`). Low.

---

## Done when

- Every Fix now item is built, reviewed and approved by Jeffrey in the preview: a design reviewer at the four sizes for visual changes, a code reviewer, and a security reviewer for anything touching the database or privacy (R1-02's and R2-02's migrations; R1-03's history while Hide private details is on).
- Each migration's PGlite tests pass, Jeffrey has applied it, and the after-apply checks passed (fingerprints, security advisor, tests file).
- Both builds pass (`npm run build` and `npm run build:preview-mode`), and so do Star's eight check files (`node src/lib/star/<name>Checks.mjs`) and `node src/lib/shared/checks.mjs`.
- Jeffrey's decisions are rows from your block.
- The status file is current, and the work is committed on `star-testing`. **No push.**
- The report is sent to the Main session.
