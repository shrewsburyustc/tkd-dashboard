# Color Belt testing — Phase 4 build plan: private testing

**Written:** 2026-10-18 (branch `color-belt`, worktree `color-belt-session-01afc8`) · **Status:** independently reviewed (§8, all findings applied); questions for Jeffrey in §6; waiting for his OK (CP0). Nothing is built, applied or pushed.
**Built from:** rulebook rows v0.225–v0.228 (Q1–Q7 + approved mockups with all their proposals) · mockups `TKD-ColorBelt-Private-Mockups.html` (P1–P9 + P3b) · the live phase 2 / 3 code and migrations `0005_testing_events.sql`, `0010_testing_results.sql` · Star's v0.230 / v0.231 (mat-side mode, on the star-testing branch, not merged yet).
**Deadline:** none set. Until phase 4 is live, a student who can't make the day is handled by hand and an admin enters the result after the day (v0.186 / v0.191 allow that).

---

## 0. Scope

**In:**
- A student in an event can be **private**: their own day and time (any day from today on, before or after the testing day, Q6) at the rank's **private price** (Q2).
- Two ways in: **⋯ → Set private testing** (P2/P3) and **Tests privately** in **Add student** (P3b, Q7).
- ⋯ on a private student: **Change private day or time**, **Back to the testing day**, **Grade private testing** (P5).
- Money (Q4): Mark paid charges the private price; already paid then private at a higher price → "Paid $65 · $20 more to collect", Mark paid records just the difference; back to the testing day after paying → nothing owed; "1 owes more" under the Paid card; Mark paid next to a Paid tag while owed (P4).
- Grading: private students left off the testing-day Grading tab and printed sheet (P6); graded on **their own page** with the phase 3 rules counted from **their private day** (P7/P9); **Print** a one-student sheet.
- The **Private testings** list on the Events tab (P8).
- Approved proposals (v0.228): set private after the testing day on a student with no result, and a testing-day **No show is cleared**; Back only until graded; a **private No show** → a new day can be set; the result tag on the Students row; the list hidden when empty and keeping ungraded past ones.
- **Mat-side mode** (Star v0.230 / v0.231, once merged): every new payment detail hides on a mat-side device — the price in the Private line, the "more to collect" line, "1 owes more", Mark paid, the price in the Private / Tests privately dialogs. The gray "Not paid" fact on Grading and the private page stays (v0.231 exception). Who builds the general Color Belt mat-side audit is Jeffrey's call (§6).

**Out (later):** a Home card (Q5) · private on the online form (never) · the instant Realtime ping (v0.157 B) · refunds / overpaid (Q4) · Star's own private build.

## 1. Database — migration `0012_testing_private.sql`

Number: next free after checking **every branch and worktree** at build time. Claimed today: 0005 · 0006 Star · 0007 Schedule · 0008 Calendar · 0009 Forms · 0010 Color Belt phase 3 (live) · 0011 Finance → **0012**. (The prospect branch also uses 0010 — the Main session must renumber it.)

**Rule: no existing function changes its arguments.** The live phase 3 site keeps working between "0012 applied" and "phase 4 deployed": until someone sets a private day (only possible with the new screens), every replaced function behaves exactly as today.

### 1.1 New columns on `public.testing_registrations`

| Column | Notes |
|---|---|
| `private_date date null` | The private testing day. |
| `private_time time null` | Start time: 6:00 AM–10:00 PM, 5-minute steps, seconds 0 (v0.157). |

- Checks: both null or both set; time range and step; date ≤ testing date + 1 year (catches typos like 2062).
- On the registration (not a new table): setting it is a registration change — bumps `version`, logged by the existing `testing_registrations_log` with its own `tkd.action`, a stale screen reloads.
- Column-level select to `authenticated`; nothing to `anon` or `testing_registrar`.
- **`testing_roster` view is NOT changed** (review M1: `create or replace view` can't drop columns, so a changed view would make re-running 0005 error and break the 0010 removal path). The app reads `private_date, private_time` from `testing_registrations` (granted columns) in the existing chunked roster read.

### 1.2 Money rules — one internal helper `testing_amount_due(registration_id)`

- Internal only: `revoke all … from public, anon, authenticated, service_role`, **no grant** (review M2).
- **Price:** private → the event rank copy's `private_cents`; otherwise the live rule (`testing_fee_cents`: early before the testing day, testing-day price on or after — by **today's** date, as live; see §6 Q1).
- `net` = sum of the student's payments (reversal rows included, append-only as 0005).
- Not private: any net > 0 = Paid; nothing more is ever owed (v0.136 unchanged).
- Private: net = 0 → Not paid (Mark paid charges the full private price); 0 < net < private price → owes the difference; net ≥ price → Paid.
- **Due ≤ 0 is "nothing to collect"** (review L1: a $0 private price must not insert a $0 payment).
- Back to the testing day after paying → not private → Paid, nothing owed (Q4). A partial net then counts as Paid — accepted edge case; `eventRules.isPaid`'s "no partial payments" comment is updated (review L2).

### 1.3 New staff functions

All: security definer, `set search_path = ''`, fully qualified; **revoke from public, anon, authenticated, service_role first, then grant execute to `authenticated` only** (review M2). Check order (0005 pattern): `has_data_access()` → `no_access` · input → `invalid` · `testing_lock_registration()` → `not_found` · version → `stale` · withdrawn → `withdrawn` · the rules below. Same exception block as 0005. Every write sets `tkd.action` + one `tkd.batch_id`.

**`testing_set_private(p_registration_id, p_expected_version, p_private_date date, p_private_time time)`** — set or change.
- Past day (`< testing_today()`, school time) → `past_day` ("The private day can't be in the past.").
- **Not private yet, testing-day result exists:** `no_show` → allowed for **all staff**, the result row (No show **and its note**) is deleted in the same transaction, logged `clear_result`, same batch (v0.228; review L6 — the dialog says "the No show and its note"). Pass / Not passed / a note only → `has_result`.
- **Already private, private result exists:** `no_show` → allowed for all staff, result deleted (logged `clear_result`) — a private No show can get a new day (v0.228; review H2). Pass / Not passed / a note → `graded`.
- After the testing day with no result: allowed for all staff (Q3 + v0.228). *(Review L14 — Jeffrey is told once: after any testing day the desk can set any ungraded student private for today and grade them.)*
- Actions: `set_private` (first time) / `change_private`. Returns `{status:'ok', version, private_date, private_time, amount_due_cents}`.

**`testing_clear_private(p_registration_id, p_expected_version)`** — Back to the testing day.
- Any private result (incl. No show) → `graded` (Back only until graded; a private No show counts as graded here — the desk uses Change instead).
- **After the testing day, staff → `not_allowed`; admins allowed** (review H1: otherwise staff could erase a testing-day No show in two clicks — Set private clears it, Back returns the student ungraded). The screen hides Back for staff then.
- Action `clear_private`.

**`testing_add_private_student(p_event_id, p_first, p_last, p_event_rank_id, p_stripes, p_paying_by, p_private_date, p_private_time)`** — Add student with Tests privately.
- Same rules as the live `testing_add_student` (0010: staff `finished` after the testing day, admins allowed, v0.191) **plus** the day/time rules above.
- The private columns go **into the INSERT itself**: one log row, version 1, action `add_student` (review L3). A bad day/time inserts nothing.

### 1.4 Replaced function bodies (same arguments)

- **`testing_mark_paid`**: amount = `testing_amount_due()`: not paid → the full price (private price when private); private and owed → **just the difference**; due ≤ 0 or paid → `already_paid`.
- **`testing_set_result`, `testing_set_result_note`** (0010): the date rule uses **`coalesce(private_date, testing_date)`** — before it `not_open`; after it staff `finished`, admins always.
- **`testing_update_student`** (0010): the graded-and-after-the-day lock uses the student's own day. A belt / class change on a **paid** private student re-prices — see §6 Q2.
- **`testing_resolve_duplicate`, `testing_restore_student`** (0010): the "graded + after the day → staff refused" lock becomes "after the testing day, **or after the student's own private day** when private" (review H3: a private day can be before the testing day, which reopened the v0.190 / v0.194 keep-one loophole).
- **`testing_update_event`** (0010): `has_results` counts only results of **non-private** students, so one private graded before the testing day doesn't freeze a snow-day date move (review M3; safe because a graded private can never go Back).
- **`testing_purge_old_signatures`**: 90 days after **the later of** the testing day and the private day (a new rulebook line for this v0.136 wording change, review L10).
- `testing_change_paying_by`: see §6 Q3 (only changed if Jeffrey says so).
- Untouched: `testing_delete_student`, `testing_delete_event`, `testing_withdraw_student`, `testing_undo_payment`, `testing_edit_payment` (they already act on the most recent payment), both public functions, the view.
- **Re-run / removal order:** headers + SETUP §15: re-running 0005 or 0010 after 0012 puts back old bodies → re-run 0012 right after. Removal: **0012 down first, then 0010 down** (review M1). The down-script restores the 0010 bodies.
- `0012_fingerprints.sql`: new and replaced functions, new columns' grants; connector-safe spelling.

### 1.5 Read path

- `loadEvent`: the roster read adds `private_date, private_time` from `testing_registrations`; rows gain `privateDate`, `privateTime`, `amountDueCents` (same rule as §1.2, compared with the DB in `checks.mjs`).
- `loadEvents` (Events tab): the existing roster-count read adds `private_date, private_time, first_name, last_name` + class name; only the results read is extra (review L11). The **Private testings** list = `status = 'active'` (review M4: a withdrawn private would stay forever), private, **no result** (a note alone doesn't remove them — see §6 Q5), sorted by day and time; ungraded past ones stay.
- Same 15-second refresh (v0.157).

## 2. Data layer and preview mock

- `eventsApi.js`: `setPrivate`, `clearPrivate`, `addPrivateStudent`; statuses `past_day`, `graded`, `has_result`, `not_allowed`, `stale`, `withdrawn` → wording from the mockups.
- `eventRules.js`: `amountDue`, `isPrivate`, `gradingDay`, `privateTestingsList` (active only).
- `mockTestingEvents.js` + `checks.mjs`: mock = DB for every rule above (price, owed, top-up, $0 price, clear No show both cases, H1 staff Back refused, past day, graded lock, grading day, keep-one lock from the private day, update_event counting).
- Preview: `__tkdPreview.setToday()` to rehearse.

## 3. Front end (staff screens)

| File | Change |
|---|---|
| `RosterRows.jsx` | Purple Private line "Tue, Dec 1 · 4:00 PM · $85" (P1); amber "Paid $65 · $20 more to collect" from **net** paid (review M7) (P4); Mark paid next to a Paid tag while owed; the result tag next to the Private line once graded (P9). |
| `EventPage.jsx` | ⋯ (P2/P5): Set private testing (own group after Change how they'll pay, all staff); on a private student Change private day or time · Back to the testing day (`ti-calendar-event`; hidden once graded, and for staff after the testing day — H1) · Grade private testing (`ti-school`). Undo / Edit payment act on the most recent payment. "1 owes more". Toasts; **Undo on the Back toast** calls `set_private` with the version just returned and handles `past_day` / `stale` (review L12). |
| `PaymentDialogs.jsx` | Edit payment after a top-up: the subtitle names both payments ("$65 cash Nov 2 + $20 card Nov 12 — editing the $20") so an admin can't turn the $20 into $85 by mistake (review M7). "Paid on / method" shows the most recent payment with "+1 earlier". |
| `PrivateDialog.jsx` (new) | P3: Day (+ weekday line) · Time (6 AM–10 PM, 5-minute list) · "$65 → $85 private price" · the "No show and its note are cleared" note · past-day error. Same dialog for Change (no price line). Phone full screen, Save pinned. |
| `StudentDialog.jsx` | P3b: Tests privately tick; ticked → Day, Time, price indented; Save → `addPrivateStudent`. Edit details warns before a re-price of a paid private student (§6 Q2). |
| `GradingTab.jsx`, `GradingSheet.jsx`, `useGradingSaves.js` | P6: private students left out of rows, counts, the class switch counts and the print. A Not saved retry that comes back `not_open` because the student was just set private → the row leaves Grading with a polite message (review L8). |
| `PrivateGradingPage.jsx` (new) | P7/P9: route `#testing/event/<id>/private/<registrationId>` (**`src/App.jsx`** — shared file); back link to the event; details card; `ResultButtons`, `NoteDialog`, `useGradingSaves` with the **leave-while-unsaved guard (v0.192(3)) and the 10-second auto-retry** (review L9); the gray **Not paid** fact only, never "$20 more" (v0.183); lock lines from the private day; Print one-student sheet (no payments). |
| `EventsTab.jsx` | P8: Private testings · <n> above Upcoming / Past; hidden when empty; Open → the private page. |
| `text.js`, `testing.css` | All new wording; the purple tag (new §7 color row) and icon-map rows for `ti-calendar` / `ti-calendar-event` / `ti-school` (review L10). Mat-side hiding of the new payment details (§0). |

Shared files: `src/App.jsx` (route), the rulebook. Not touched: `navItems.js`, `Testing.jsx`; `tokens.css` only if the purple goes there (contract decides).

## 4. Tests

- **`supabase/tests/0012_tests.sql`** (one block, rollback, `ALL 0012 TESTS PASSED`, made-up names / cities): grants (columns visible to staff only; the four functions not runnable by anon or `testing_registrar`; the helper by nobody); each function for staff and admin; past day; time range / step / date cap; stale / withdrawn; add-private writes one row and nothing on a bad day; price; Mark paid full private price; **top-up = just the difference, then `already_paid`**; top-up → own Undo within 10 s → owed again → Mark paid → `already_paid`; Edit of the most recent payment; $0 private price → nothing inserted; back after paying → nothing owed; Change / Back refused once graded; **testing-day No show cleared** (logged, same batch, note gone); **private No show → Change clears it, Back refused**; pass / not passed → `has_result` / `graded`; **H1: staff Back after the testing day refused, admin allowed**; set-result date rule from the private day (before / on / after, staff / admin); **H3: keep-one / restore lock from the private day**; **M3: update_event date change allowed with only private results**; private day = testing day (§6 Q4); signature purge uses the later day; change_log actions and batch ids; catalog checks.
- **Update `0005_tests.sql` C3 (exact staff-readable columns of `testing_registrations`) in the same commit** — the two new columns break it (review H5; T7 / the view is untouched now). Jeffrey is told before CP2 that the production copy of `0005_tests.sql` is the updated one.
- `run.mjs`: a step applies 0012 on top of 0010 on its own database (fresh and upgrade), **before / apart from step 13g** (the 0010 down-script step, review M1); re-runs the 0010, 0005, 0006, 0003, 0004, 0002 and PIN test files; applies 0012 twice; fresh = upgrade fingerprints; **0006's fingerprints unchanged** (review M9); runs 0012-down then 0010-down cleanly.
- App: `checks.mjs`, both builds, no preview code in production.

## 5. Order and checkpoints

1. **CP0 — Jeffrey OKs this plan** and answers §6. Then `docs/Dashboard Docs/Build contracts/CONTRACT-0012.md`.
2. **Build:** **A** database + tests (`0012_*`, `0005_tests.sql` C3, `run.mjs`, SETUP §15) · **B** data layer + mock + checks · **C** screens. Then **security review** (A, B), **design review** of C against P1–P9 + P3b at 1280×800, 820×1180 touch, 390×844 touch and 320 wide; fix; re-review.
3. **CP1 — preview walkthrough** (both ways in, top-up, Back, grading on a private day with `setToday`, print, the Events list).
4. **CP2 — production database** (Jeffrey's OK): paste 0012; fingerprints = PGlite, security advisor, `0012_tests.sql` + the updated `0005_tests.sql` + the other test files pass. The live site keeps working.
5. **CP3 — real-database check** from the local app on a **Closed** TEST event (review L13: until CP4 its students show on the live phase 3 Grading tab and sheet), one private student both ways, top-up, grade on a private TEST day; delete; read-only check that all is logged and gone.
6. **CP4 — deploy** (Jeffrey's OK): Main merges `color-belt` → `main`, push; live smoke check.
7. **Rollback:** push the previous `main`; 0012 can stay (unused columns, bodies equal to 0010's until a private day is set). Down-script only with Jeffrey's OK.
8. **Housekeeping:** status, rulebook, `docs/README.md`, handoff §9, claude.ai copies; tell the **Star** session (its private build can reuse the rules) and the **Finance** session (Color Belt can now have two payments per student — a top-up — and its hide-payments switch, v0.215, must also hide the owed line and "1 owes more"; review M8).

## 6. Questions for Jeffrey (one at a time, at CP0)

1. **Price after Back to the testing day** (review H4). The approved P5 note says the price goes back to early or testing-day "by her registration date"; the live Mark paid prices by **today's** date for everyone. Recommended: keep the live rule (the price depends on when they pay, as today) and correct the wording in the v0.228 row.
2. **A paid private student's belt or class is corrected** to a rank with a higher private price (e.g. $85 → $95) (review M5). Regular students never re-price after paying (v0.136). Recommended: same as regular — the payment stays, nothing more owed; or: Edit details warns "price $85 → $95 · $10 more to collect".
3. **Change how they'll pay while a top-up is owed** (review M6) — the live menu hides it once paid. Recommended: show it while money is still owed, so the $20 can be paid another way.
4. **Private day = the testing day** (review L5): allow (e.g. a later time that day), or refuse with "Pick a day other than the testing day"? Recommended: allow.
5. **A note alone on a private testing** (review L7): does it count as graded (drops off the list, locks Back)? Recommended: only a result does.
6. **Who builds the Color Belt mat-side hiding** for the live screens (Star v0.230): the Star session or this one? Phase 4's own new payment details follow it either way.
7. Information (review L14): after any testing day the desk can set any ungraded student private for today and grade them (follows from v0.228). OK?

## 7. Risks

| Risk | What we do |
|---|---|
| Replaced `mark_paid` charges the wrong amount | One helper; the app mirrors it, `checks.mjs` compares; 0012 tests cover every case. |
| A private student graded on the testing day by habit | DB refuses (`not_open`); the Grading tab doesn't list her. |
| The shared desk account erasing results through private paths | H1 / H2 / H3 rules + tests; every change logged. |
| Many 0010 bodies replaced → fingerprints change; re-run hazards | Listed in 0012's notes and SETUP §15; CP2 compares with a fresh PGlite run; down order 0012 → 0010. |
| `0005_tests.sql` C3 fails at CP2 | Updated in the same commit; Jeffrey told before CP2. |
| Two branches share migration 0010 | Flagged to Main; 0012 re-checked at build time. |

## 8. Changes from the independent review (2026-10-18)

| # | Severity | Change |
|---|---|---|
| H1 | High | Staff could erase a testing-day No show after the day (Set private clears it → Back) → `clear_private` refuses staff after the testing day; Back hidden for them (§1.3). |
| H2 | High | A private No show couldn't get a new day (contradicted v0.228) → `set_private` clears a private No show; Back still refused (§1.3). |
| H3 | High | Keep-one / restore lock reopened for privates graded before the testing day → lock from the private day (§1.4). |
| H4 | High | Price after Back contradicted the approved wording → CP0 question 1 (§6). |
| H5 | High | `0005_tests.sql` C3 would fail → updated in the same commit; view untouched (§1.1, §4). |
| M1 | Medium | Changing the view breaks re-running 0005 and the 0010 removal path → view untouched; down order 0012 → 0010; run.mjs order (§1.1, §1.4, §4). |
| M2 | Medium | Revoke-first grants for all new functions; the helper granted to nobody (§1.2, §1.3). |
| M3 | Medium | A graded private froze the event date → `has_results` counts non-private only (§1.4). |
| M4 | Medium | Withdrawn privates stuck on the list → active only (§1.5). |
| M5 | Medium | Re-pricing a paid private on a belt change → CP0 question 2 (§6). |
| M6 | Medium | Change paying-by while owed → CP0 question 3 (§6). |
| M7 | Medium | Edit payment after a top-up names both payments; owed line from net; tests (§3, §4). |
| M8 | Medium | Tell the Finance session (two payments per student; its hide switch) (§5). |
| M9 | Medium | run.mjs: 0006 fingerprints unchanged; 0012 step order vs 13g (§4). |
| L1–L14 | Low | $0 price (§1.2) · partial net accepted (§1.2) · add-private single INSERT (§1.3) · time range + date cap (§1.1) · private day = testing day → Q4 · "No show and its note" (§1.3) · note-only → Q5 · retry race (§3) · private page guard + Not paid fact (§3) · rulebook icon rows + purge line (§1.4, §3) · fewer reads (§1.5) · Back-toast Undo (§3) · Closed TEST event at CP3 (§5) · L14 told at CP0 (§6). |
