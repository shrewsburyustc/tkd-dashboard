# Camps migration 0033 — the design review's database half (C2 + C7)

**What this is:** the plan for one migration and the app changes that use it. It carries out two approved screens:

- **C2:** the shared Mark paid box, picture 16, rulebook **v0.735**.
- **C7:** the history line, picture 17, rulebook **v0.736**.

**Status:** number **0033** reserved by Main on 2026-11-03 (main 5edbc19). **Must be tested before Jeffrey pastes:** the live app's 3-input `camp_mark_paid` call (named and positional) resolves to the new version with `p_method` null, and only one `camp_mark_paid` exists. Built and reviewed 2026-11-03 (see the status file). **Applied to production 2026-11-03.** Jeffrey pastes the file into the Supabase SQL Editor after the security review, with his OK.

**Order (a push to `main` deploys):** 0033 must be live **before** the app that calls it is pushed. The app from before 0033 keeps working with 0033 applied, because `camp_mark_paid`'s new 4th input has a default.

---

## 1. What the migration changes

All writes follow handoff §6:
- security definer, `set search_path = ''`, fully qualified names;
- `has_data_access()` checked first, `{status: …}` jsonb answers;
- explicit revoke from `public, anon, authenticated, service_role`, then a grant to `authenticated` only;
- **nothing to anon.**

### 1a. Two new columns

| Column | What it holds | Who sets it |
|---|---|---|
| `camp_campers.paying_by_on_form text not null` (`cash`/`check`/`card`) | The way the family chose on the form. It never changes after sign-up. | A new small **before-insert-or-update trigger**: on insert it copies `new.paying_by`; on update it keeps the old value, so no function can change it. **The public sign-up function is not touched** (the anon path stays exactly as it is). Existing rows: filled from `paying_by` in the migration (a camper's first value; production had no campers on 2026-10-22, and any camper since then started with the form's choice unless staff changed it — the pre-apply check counts campers whose change_log shows a `paying_by` change, so Jeffrey sees if any exist). |
| `camp_payments.paying_by_before text null` | Set **only** when Mark paid (or Edit payment) also changed the camper's Paying by: the old Paying by, so Undo payment can put it back. Check: null, or (`kind = 'payment'` and one of cash/check/card and `<> method`). | `camp_mark_paid`, `camp_edit_payment` |

**Why `paying_by_on_form` and not a plain yes/no:** v0.735 says "one yes/no kept on the camper". Storing the form's own choice gives the same screen, and the hint is worked out as `paying_by = paying_by_on_form ? "on the form" : "at the desk"`. Every Undo (of a payment, or of Change how they'll pay) then gives the right words with nothing extra to put back. A yes/no would need its own undo rules. **The v0.735 row gets this wording in the same commit** (same decision, storage detail only).

Column rights: `paying_by_on_form` is added to the app's `select` grant on `camp_campers` and to the `camp_roster` view (at the end of the view's columns: `create or replace view` can only add columns at the end). `paying_by_before` is **not** granted (the app doesn't need it; the history reader reads `change_log`).

### 1b. `camp_mark_paid(p_camper_id, p_expected_version, p_school, p_method text default null)` — replaces 0013's

- Drop the 3-input version and create the 4-input one in the same file. Two versions side by side would make the server refuse the call as ambiguous (`0003_testing_classes_ranks.sql:936–948`). The app before 0033 calls it with 3 named inputs, which the default covers.
- `p_method` null → the camper's Paying by (as today). Otherwise it must be cash/check/card, else `{"status":"invalid","field":"method"}`.
- Everything else stays as today: version check, withdrawn, already_paid, amount = owed now, school check, signature clean-up, `tkd.action` / `tkd.batch_id`.
- If `p_method <> paying_by`: in the same transaction, `paying_by := p_method` on the camper (logged in the same batch as the payment), and the payment row gets `paying_by_before = old paying_by`.
- Answer adds `"paying_by"` (the camper's Paying by after the save).

### 1c. `camp_edit_payment` — replaces 0022's (same signature)

Copy Color Belt 0030: if the new method differs from the camper's Paying by **and** the edited payment is the camper's newest payment that still stands, Paying by follows it, and the new payment row remembers `paying_by_before`. **Check against Color Belt's 0030 exactly which case it uses, and copy it**; if 0030 does not change Paying by on Edit payment, Camps doesn't either (then remove this section and say so in the summary).

### 1d. `camp_undo_payment(p_payment_id)` — replaces 0013's (same signature)

As today, plus: when the undone payment has `paying_by_before` **and** the camper's Paying by still equals that payment's method (nobody changed it since), Paying by goes back to `paying_by_before` in the same batch. Otherwise Paying by is left alone.

### 1e. `camp_change_paying_by` — unchanged

It needs no change: `paying_by_on_form` never moves, so the hint follows automatically.

### 1f. `camp_camper_history(p_camper_id uuid)` — new reader (C7)

- **Model:** Star's `star_candidate_history` and `star_history_strip` (0006), and Color Belt's `testing_registration_history` (0030).
- Staff and admins: `has_data_access()` first, else `no_access`; `not_found` when the camper doesn't exist.
- `security definer`, `stable`, `set search_path = ''`. Revoke from all, grant to `authenticated`.
- **Rows:** `change_log` rows where:
  - `table_name = 'camp_campers'` and `record_id = camper`;
  - `table_name in ('camp_camper_days', 'camp_camper_extras', 'camp_payments')` and the row's `camper_id` (from `after` or `before`) = camper. **Leave out** `camp_camper_days` updates that only change `checked_in_at` / `checked_in_by` / `checked_in_by_name` (check-ins, v0.736). Inserts and deletes of days (Edit details) stay;
  - `table_name = 'camp_signups'` and `record_id` = the camper's `signup_id` (shared by brothers and sisters: v0.736 A, every child sees it).
- Newest first; at most 500 rows.
- **Strip:** no login ids (`actor_id`, `session_id`, and every `*_by` uuid key in before/after, e.g. `created_by`, `updated_by`, `recorded_by`, `withdrawn_by`, `checked_in_by`); keep `*_by_name`. The sign-up's `signature` already shows only as "on file" (13i).
- Each row: `occurred_at`, `actor_name` ("Family form" for the anon form; use what change_log holds), `table_name`, `op`, `batch_id`, `action`, `before`, `after`.
- Answer: `{"status":"ok","rows":[…]}`.
- Check performance: `change_log` must have an index that makes this fast (look for existing indexes on `(table_name, record_id)`). Rows of days, extras and payments are found by `camper_id` inside the jsonb. Look at how Star/Color Belt did it and copy it. Seed a few thousand change_log rows in the test and time it.

---

## 2. Tests, setup and checks (CLAUDE.md rules)

- `supabase/tests/0033_tests.sql`:
  - Mark paid with no method, the same method and a different method. Paying by, `paying_by_before` and the log batch are checked each time.
  - Bad method; staff and admin; anon refused.
  - Undo puts Paying by back, but not when it was changed again since.
  - Edit payment, per 1c.
  - `paying_by_on_form` can't be changed by an update.
  - The history: own rows, sibling sign-up rows, no check-in rows, no login ids, at most 500, `no_access`, `not_found`.
  - Grants: nothing for anon; the old 3-input `camp_mark_paid` is gone.
  - 0013, 0017, 0022 and 0027's tests still pass.
- `supabase/tests/0033_fingerprints.sql` (model: 0027's).
- `supabase/tests/0033_preapply_check.sql`: read-only, counts what the backfill touches (model: 0027's).
- `supabase/tests/pglite/run.mjs`: `step0033`, the same way as `step0027` (production order with every live migration).
- `supabase/SETUP.md`: `## Migration 0033: …` with `### 0033a.` … (pre-check, paste, fingerprints, advisor, tests file, undo script).
- Run: `cd supabase/tests/pglite && npm ci && node run.mjs`.

## 3. App (camps files only; no shared files)

- `src/lib/camps/campsApi.js`:
  - `markPaid(camperId, version, school, method)` sends `p_method`.
  - New `loadCamperHistory(camperId)`.
  - `paying_by_on_form` added to `ROSTER_COLUMNS`.
- `src/lib/mockCamps.js`:
  - `camp_mark_paid` takes the optional `p_method`, with the same Paying by / `paying_by_before` / undo rules.
  - `paying_by_on_form` on fake campers.
  - Fake history for `camp_camper_history`: add it to `RPC_ARGS` and `CAMP_READ_RPC_NAMES`. Make it rich enough to show every kind of row, including siblings.
  - `mockClient.js` needs no change.
- `CampRoster.jsx`: the "$X due" / "Owes $X" tag opens the shared `MarkPaidBox`:
  - `name`, `amountCents = owesCents`, `familyChoice = payingBy`, `choiceWhere = payingBy === payingByOnForm ? 'form' : 'desk'`;
  - `onMarkPaid(method)` calls the page's mark-paid with the method;
  - remove Camps' own `PaymentPopover` and its CSS (`.cp-popover…`) and words that nothing uses any more.
- `CampPage.jsx`:
  - `doMarkPaid(row, method)` passes the method; the toast already names the way (`markedPaidToast(name, cents, method)` — use the answer's method).
  - Undo after Mark paid as today.
- `CamperDialog.jsx`: History at the end of the summary, after Sign-up and before More on touch (`components/HistoryLine.jsx`).
- New `src/screens/camps/CamperHistory.jsx`: the words, a copy of Star's `CandidateHistory.jsx` pattern.
  - The `describe` and the reader live there. The reader **throws** when the status isn't ok; `no_access` goes to the house path.
  - Words exactly as v0.736.
  - One entry per **batch** (an Edit details save writes several rows, in camper, days and extras, with one `batch_id`). Merge rows with the same `batch_id` into one entry, joined with "; ".
  - Sign-up rows end with " (whole family)" when the sign-up has more than one child, else nothing.
  - While hidden, payments and Paying by changes become `{ hiddenPayment: true }`.
- `src/screens/camps/text.js`: Camps' history words.
- `src/lib/camps/checks.mjs`: checks for the describe/merge words and `choiceWhere`.
- `npm run build` and `npm run build:preview-mode`; `node src/lib/camps/checks.mjs` and `node src/lib/shared/checks.mjs`.

## 4. Reviews before commit

- **Security review** (separate agent) of the migration: handoff §6, nothing to anon, no login ids leak, the public sign-up untouched, the ambiguity of the old/new `camp_mark_paid`, Finance's 0017/0018 functions still correct with the new payment column.
- **Design review** (separate agent) against pictures 16 and 17 and v0.735 / v0.736, with screenshots at 1280×800, 820×1180 touch, 390×844 touch and 320 wide.
