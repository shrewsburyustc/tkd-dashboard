# Finance build plan — Daily report (DRAFT for review)

**Written:** 2026-10-18 · **Status:** draft, security-reviewed 2026-10-18 (fixes in the contract), waiting for Jeffrey's OK (CP0). Nothing is built until he says so.
**Design (approved 2026-10-18):** `TKD-Finance-DailyReport-Mockups.html` (D1–D14, images in `Mockup images/`), questions Q1–Q11 in `TKD-Finance-DailyReport-Questions.html`; decisions in rulebook 10b v0.193–v0.203, v0.207, v0.208 and `TKD-Finance-Status.md`.
**Contract:** `docs/Dashboard Docs/Build contracts/CONTRACT-0011.md` (draft, written with this plan; finalised after the CP0 answers).
**Rules:** CLAUDE.md; handoff §6 (security, non-negotiable).

> In plain words: Finance is a **read-mostly** section. It reads the payments Color Belt testing (0005) and Star testing (0006) already store, adds them up per school and day, and lets staff **close the day** (type what's in the drawer, record who checked it). Admins can look at any day, see a month's history, reopen a day, export a date range as a spreadsheet file, and set the reminder times. It never changes a payment — payments are still recorded on the Testing pages.

---

## 0. Scope

**In (this build):** Finance rail item (`ti-report-money`, last; phones under More) · Daily report (D1–D4, D11–D13) · History (D5) · Both summary (D6) · Export… + CSV (D7) · Print (D8) · Settings tab with reminder times (D9) · Home reminder lines (D10) · payment detail (D12) · phone ⋯ menu (D14).

**Out (later, separate steps):**
- **Hide-payments switch — Testing roster part** (v0.215). The switch itself (account menu, chip, hiding Finance + the Home link) is **in** this build (proposed, §6 Q2); hiding payment parts on the **Testing rosters** touches the Color Belt and Star sessions' files and is done with them right after.
- Card payments online (Square), memberships / tuition, bank deposits (Q1 option C), daily email of the report.

---

## 1. Where the money comes from (read only)

| Source | Rows | School of a row | "For" line |
|---|---|---|---|
| Color Belt — `testing_payments` (0005, live) | `payment`, `reversal` | the event's school (`testing_events.location_code`) | "Color belt testing · <testing date>" |
| Star — `star_payments` (0006, live) | `payment`, **`refund`**, `reversal` | the **candidate's** school (`star_candidates.location_code`, v0.58) | "Star testing · <testing date>" (private: "Star testing · private <date>") |

Both tables are append-only. Corrections are `reversal` rows. Facts the report relies on (checked in 0005 / 0006):
- An **undo** writes a reversal dated **today** (`testing_today()`), not on the payment's day.
- An **edit** writes, in one transaction, a reversal of the old row **and** a new payment with the admin's chosen date. Both rows share the same `recorded_at` (`now()` is the transaction time) and the same registration / candidate. That is how the report recognises an edit, and it is tested.
- **Star refunds** are their own negative rows (cash or check, own date, v0.166).

**How a row shows (v0.199, v0.207):** each original payment is followed through its corrections:
- Edited (one or more times) → shown **once**, on the final row's date, with **Edited** and "Was <original amount, method>". If the final date differs from the original date, the original day shows "Moved to <date>" struck through, and the new day shows the row.
- Undone (the chain ends in a reversal) → struck through on its original day with **Undone** and "Undone by <name> · <date> · not counted".
- Undone by the **same person within 10 seconds** of recording it → not shown at all.
- Recorded after the day was closed → **Added after closing**.
- **Refunds (decided v0.209):** shown on their own date. Two layouts with a per-device switch on the report: **Own group** (Refunds group, cards show money in) or **In groups** (inside Cash / Check with a Refund tag, cards net). Close the day expects cash in − cash refunded; check refunds don't touch the drawer; a refund-only day asks “Cash taken out of the drawer”.

**Totals** count only what is true now. **School date** is always `America/New_York` (as 0005).

---

## 2. Database — migration `0011_finance.sql`

(0005 Color Belt phase 2, 0006 Star, 0007–0010 Schedule / Calendar / Forms / Prospects. **0010 is on `main`** (Color Belt phase 3); the Prospects branch's own 0010 must be renumbered by the Main session. Finance takes **0011**; re-check before building.)

Same rules as 0003 / 0005 (handoff §6): RLS on every table; `revoke all … from public, anon, authenticated, service_role`; **no table grants to the app at all** — every read and write goes through `security definer` functions (`set search_path = ''`, fully qualified names, `has_data_access()` first, `{status: …}` jsonb); every change logged in `change_log`; re-run safe; nothing to `anon`.

Why functions for reads (not views): the **staff-today-only** rule (v0.195), the correction rules above, and keeping DOB / email out are all easier to enforce and test in one place. Honest limit: staff can already read payments per event on the Testing rosters (v0.108), so "today only" limits the Finance report, not every way to see a payment.

### 2.1 New tables
| Table | Holds | Notes |
|---|---|---|
| `finance_day_closing_items` | the exact payments counted by each close (a snapshot), so any later change — even a deleted student or a Star school change — shows Changed after closing | append-only |
| `finance_day_closings` | one row per **close**, **undo** (10 s) or **reopen** of a school's day: counted cash, number + total of checks, card machine total, the **expected** values at that moment, the note, who and when | append-only (like payments); a day is closed when its latest row is a `close` |
| `finance_settings` | one row: reminder On / Off, version | admins only |
| `finance_reminder_times` | per school × weekday: a time or Off | 14 rows, seeded **Off** (admins set them after launch, §6 Q3) |
| `finance_exports` | log of every CSV download: who, when, school, from, to, row count | no app grants; also in change_log |

### 2.2 Functions
Reads (staff see **today only**; admins any day up to today):
`finance_day(p_location_code, p_day)` (D1–D4, D11–D13) · `finance_day_both(p_day)` (D6) · `finance_history(p_location_code | null, p_month)` admins (D5) · `finance_payment_detail(p_source, p_payment_id)` (D12) · `finance_home()` (D10: which schools need a reminder now; for admins, unclosed days in the last 30) · `finance_settings_get()` admins (D9).
Writes:
`finance_close_day(p_location_code, p_day, p_expected_count, p_expected_total_cents, counts…, p_note)` — staff (today) / admins (any open day with payments); server recomputes everything; a short / over without a note → `note_required`; no payments → `nothing_to_close`; the day changed since the screen loaded → `stale`.
`finance_undo_close(p_closing_id)` — the person who closed it, within 10 seconds (v0.207).
`finance_reopen_day(p_location_code, p_day, p_expected_closing_id)` — admins.
`finance_export(p_location_code, p_from, p_to)` — admins; returns the rows and writes the log row in the same call (like Star's CSV log, v0.172 S1).
`finance_set_reminder_on`, `finance_set_reminder_time`, `finance_copy_monday` — admins, logged.

---

## 3. Front end

**New files:** `src/screens/Finance.jsx` · `src/screens/finance/*` (DayReport, CloseDayBox, PaymentsList, PaymentDetailDialog, HistoryList, BothSummary, ExportDialog, PrintPage, SettingsTab, PhoneActionsSheet, `text.js`) · `src/lib/finance/financeApi.js` · `src/lib/finance/financeRules.js` (pure: money compare, Matches / Short / Over, CSV building, school-time helpers — node-checkable) · `src/lib/mockFinance.js` · `src/styles/finance.css`.
**Shared files touched (listed in every summary):** `src/components/navItems.js` (Finance item), `src/App.jsx` (`#finance`, `#finance/history`, `#finance/settings`), `src/screens/Home.jsx` (reminder lines), `src/lib/mockClient.js` (route `finance_*` calls to the mock), `README.md`, the rulebook (icon map rows from v0.207 when built).
**No new libraries.** CSV is built in the browser; Print uses a print stylesheet. CSV cells starting with `=`, `+`, `-` or `@` get a leading `'` so Excel never runs them as formulas.
**Preview mode:** the Finance mock reads the Color Belt preview payments that already exist (`tkd.preview.testing`) and adds a few sample Star payments of its own, so every screen can be tried. Console helpers: `setToday`, `setNow` (for the reminder), `failNextSave`, `setRole`.

---

## 4. Tests
- **Database** (`supabase/tests/0011_tests.sql` + PGlite, before and after sample payments): role gates (anon nothing; staff today only → `not_allowed` for another day; admin any day; future day → `invalid`); locked / signed-out / stale sessions → `no_access`; correction rules (edit, edit twice, moved, undo, 10-second hide, undo of a refund) on **both** sources; totals by method; school of a Star row = candidate's school; close: Matches / Short / Over, `note_required`, `nothing_to_close`, `stale`, double close; undo window (closer < 10 s yes, others / later no); reopen admins only; Changed after closing + Added after closing; reminder at minute boundaries in America/New_York incl. weekday Off; History tags and order; export range rules + log row; **no output ever contains a date of birth or email** (tested); catalog (RLS on all, search_path, security definer only where listed, owners, fingerprints file).
- **Rules** (`node src/lib/finance/checks.mjs`): Matches / Short / Over, CSV escaping, the mock's correction rules = the database's (same table of cases).
- **Screens:** design review at 1280×800, 820×1180 touch, 390×844 touch, 320 wide against D1–D14.

---

## 5. Order and checkpoints (Jeffrey's OK where marked)
0. ~~**Merge `main` into `finance`**~~ **done 2026-10-18 (8a5ada5)** (main now has 0006 and rulebook v0.175+). The rulebook will conflict where both added 10b rows and changelog lines: keep both; Finance's own numbers stay as they are until the Main session merges Finance (then renumbered per CLAUDE.md). I explain the conflict before resolving. **Needs Jeffrey's OK.**
1. **CP0 — this plan + contract OK**, and the §6 questions answered one at a time.
2. Build by separate builders, no shared files between them: **A** database (0011 + tests + PGlite) · **B** data layer + mock · **C** screens. Then a **security review** (A + B) and a **design review** (C); fix; re-review.
3. **CP1 — preview walkthrough** by Jeffrey.
4. **CP2 — database:** Jeffrey pastes 0011 into the SQL Editor (after 0006 is confirmed live); fingerprints; security advisor; `0011_tests.sql`. Then an admin sets the reminder times in Settings.
5. **CP3 — local check** against the real database (`Start dashboard.bat`).
6. **CP4 — OK to merge into `main` and push** (= deploy).
7. Next step: the hide-payments switch on the Testing rosters, with the Color Belt and Star sessions (§0).

Rollback: Finance only reads payments, so turning it off is a code rollback (previous deployment in Cloudflare Pages). Its tables can stay; nothing else depends on them.

---

## 6. Questions for Jeffrey — **all answered 2026-10-18** (Q2–Q4 defaults approved as listed)
1. ~~**Star refunds on the Daily report.**~~ **Decided v0.209: both layouts, switch on the report, remembered per device.** Not in the approved screens. Money handed back is real money out of the drawer, and on a day with more refunds than cash payments the drawer would be *expected* to hold less than nothing, which no count can match. Proposed: Close the day shows **Cash in** and **Cash paid out** separately; a refund shows on **its own date** in its method's group with a **Refund** tag and a minus amount, lowers that group's total and what Close the day expects. A check refund (a check the school writes) doesn't change the number of checks in the drawer. *(Picture to come.)*
2. **Hide-payments switch (v0.215):** the switch, chip and Finance / Home hiding in this build; the Testing roster part right after with those sessions (proposed).
3. **Reminder times start Off** until an admin sets them after launch (proposed). The alternative is guessed defaults.
4. **Small defaults** to OK as a batch: export range at most one year · History goes back to the first payment ever recorded · the card machine total is compared with card payments recorded by hand (no Square yet) · CSV formula guard · a day with only undone payments counts as "no payments".

## 7. Risks
| Risk | What the plan does |
|---|---|
| Correction rules read wrong (an edit shown as undo + new) | Edits recognised by same transaction time + same student; tested on both sources; the mock shares the case table |
| Finance and Testing disagree on totals | One set of database functions does the adding; Testing's own cards stay as they are |
| Staff see past days another way | Accepted and documented (Testing rosters, v0.108); "today only" is about the report |
| Merge with other branches (rulebook numbers, migration 0010 clash, shared files) | Step 0 merge; Finance takes 0011; shared files listed |
| Money with names on a tablet parents can see | Hide-payments switch (v0.215), anyone can flip it; it's a screen guard and relies on staff using it |
