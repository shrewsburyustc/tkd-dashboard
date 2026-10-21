# Black Belt testing — CP3 run sheet: paste migration 0016 into production

**What this is:** the exact steps for checkpoint CP3 (contract `docs/Dashboard Docs/Build contracts/CONTRACT-0016.md` §13), in order, with who does each step, what you should see, and when to stop. The full background is in `supabase/SETUP.md`, section **"Migration 0016"** (0016a–0016h).
**Why it's safe to do before the app is ready:** 0016 only **adds** Black Belt's own tables, functions and one locked-down login (`bb_registrar`). Nothing in the live app calls them yet, the family form's Function is switched off, and registration can't open while the waiver is the placeholder. 0016 changes nothing that any earlier migration made (tested).
**Nothing is applied without Jeffrey's OK for this paste.** Nothing secret goes into chat, git or a screenshot.

---

## 0. Already checked (read-only, 2026-10-21, through the Supabase connection)

| Check | Result |
|---|---|
| No Black Belt objects yet (`bb_` tables, functions, the `bb_registrar` login) | **None** — 0 / 0 / 0 |
| The 15 shared helpers 0016 relies on (test C8: `has_data_access`, `change_log_write`, `testing_today`, `current_session_id`, …) | **All 15 identical** to the versions 0016 was built and tested against (`current_session_id` is already Color Belt's fixed 0020 version, which C8 accepts) |
| Live migrations around it | camps (0013, 0017), Color Belt 0014 + 0020, Finance 0011 + 0018, new students 0007–0009, 0012, 0015, school phone 0019 — all present |
| Other form logins | `testing_registrar`, `star_registrar`, `forms_registrar` exist; `bb_registrar` doesn't yet |
| Schools | `shrewsbury`, `worcester` |
| Database size | **22 MB** of the Free plan's 500 MB; change_log has 757 rows |
| PostgreSQL | 17.11 |
| Security advisor before 0016 | 3 notices, none about Black Belt (leaked-password protection off; security-definer functions callable by signed-in staff; one table with RLS and no policy) — saved for comparison |
| PGlite | 0016 applied on top of **every live migration in production order** (0001–0006, 0010, 0007–0009, 0012, 0015, 0011, 0019, 0014, 0020, camps' 0013 + 0017, 0018), then every earlier test file again and 15 fingerprint files compared: **678 passed, 0 failed**. Gap: this branch has no camps fingerprint or 0013 test file, so camps is covered by step 1/4's whole-database check below and by camps' 0017 tests |

---

## 1. Just before the paste (Claude, read-only, ~2 min)

1. Re-check that no `bb_` object exists (someone could have pasted it meanwhile).
2. Take the **"before" fingerprints** of every live migration (`0003`–`0006`, `0007`–`0012`, `0014`, `0015`, `0018`, `0019`, `0020` fingerprint files; each is one read-only SELECT), plus one **whole-database snapshot** (`supabase/tests/0016_cp3_snapshot.sql`; taken once already on 2026-10-21: 401 functions, 86 tables, 50 policies, 194 triggers outside Black Belt): an md5 of every non-`bb_` function's code and rights, every table's columns and rights, every policy and trigger in `public` (this also covers camps, which has no fingerprint file on this branch). They are compared with the "after" ones in step 4.

**You (Jeffrey):** in the SQL Editor, run this one line and tell me the answer:
```sql
select session_user;
```
Expected: `postgres`. (The hand-fix exception for the starting point needs it; anything else → stop and tell me.)

## 2. Paste 0016 (Jeffrey, SQL Editor, ~1 min)

1. Open `supabase/migrations/0016_black_belt.sql` in VS Code (or Notepad), **Ctrl+A, Ctrl+C**.
2. Supabase → **SQL Editor → New query** → paste → **Run**.
3. Supabase warns about **destructive operations**. Expected: the words are inside rules (`on delete cascade / restrict`), inside functions that run later, and in `… if exists` lines that make re-running safe. **Nothing is removed now.** Confirm.
4. Expected: **Success**. A few small result grids may show (the seed labels its history rows with `select set_config(…)`).
   - **Any error → stop.** It's one transaction, so nothing was kept. Copy the error text to me.

## 3. Right after (Claude, read-only, ~3 min)

1. The new objects: **13 `bb_` tables**, the sequence `bb_candidate_ref_seq`, the `bb_registrar` login (no password yet = it can't log in).
2. **`0016_fingerprints.sql`** on production must equal what PGlite printed, line for line. One expected difference: the role row shows `members=postgres` on Supabase.
3. **Starting data:** the seed rows match `supabase/tests/0016_seed_review.txt` (the CP1 list you OK'd): one placeholder waiver `2026-1`, the starting point, empty keep-years, **no cycles, no candidates, no payments**.

## 4. Nothing else moved (Claude, read-only)

The "after" fingerprints of every live migration and the whole-database snapshot (ignoring `bb_` objects) must be **identical** to the "before" ones from step 1. Any difference → stop; 0016 must not have touched anything else.

## 5. Security advisor (Claude, read-only)

Expected new notices, all known and accepted (SETUP 0016c.4):
- "RLS enabled, no policy" on `bb_candidate_waivers` and `bb_starting_point` (INFO — nobody in the app may read them at all).
- "Security definer function executable by authenticated" for Black Belt's staff functions (each checks access and the role itself, like every earlier section).

**Anything else about a `bb_` object is a real problem → stop.**

## 6. Run the tests (Jeffrey, SQL Editor, ~5 min)

1. Open `supabase/tests/0016_tests.sql`. Replace `<paste-admin-UID-here>` and `<paste-desk-UID-here>` with the two UIDs from **Authentication → Users** (your admin account and the front desk). Paste the whole file → **Run** → confirm the destructive-operations warning (the test removes its own test rows; everything is rolled back).
2. Expected: one row, **ALL 0016 TESTS PASSED**.
   - A `TEST FAILED:` / `TEST SETUP:` row → run `rollback;` once on its own, then send me the text. Nothing was saved.
3. Run these again, the same way (UIDs where they ask): **`0005_tests.sql`**, **`0006_tests.sql`**, **`0011_tests.sql`**, **`0018_tests.sql`** → each shows its PASSED row. (Optional, if you have time: `0014`, `0020`, `0019`, `0010`, `0004`, `0003`, `0002`, `verify_pin` tests.)
4. **Close the test tabs without saving the UIDs** (put the placeholders back if the editor keeps them).
5. **Reset the reference counter** (first time only, while no real candidate exists), so the first family gets **BB-5001**. The test used up some numbers even though it rolled back:
   ```sql
   do $$ begin
     if exists (select 1 from public.bb_candidates) then
       raise exception 'Candidates exist - do NOT reset the reference counter';
     end if;
   end $$;
   select setval('public.bb_candidate_ref_seq', 5001, false);
   ```
   Expected: one row `5001`. Never run this once any family has registered.

## 7. Size and wrap-up (Claude)

1. Database size again (read-only) and the expected growth into the status file: a drawn signature is ≤ 70 KB, so about 14 MB a season for ~200 registrations, kept for years — well inside 500 MB.
2. Rulebook row "CP3: 0016 live" (0.9xx block), status file updated, committed on `black-belt` (no push).

---

## If something goes wrong

- **The paste fails:** nothing was kept (one transaction). Send me the error; we fix it in PGlite first, re-test, re-review, and only then try again.
- **A check after the paste fails:** don't run the tests yet; send me what you see. If 0016 itself is wrong and **no real data exists yet**, SETUP **0016h** has the undo script (it refuses to run once any candidate or payment exists).
- **Emergency off switch** (any time, later): SETUP **0016g**.

## What CP3 does **not** do

- No password for `bb_registrar` (that's **CP3b**, SETUP 0016e, on your PC — the password goes only into your password manager).
- No real waiver text (**CP4**), no Cloudflare setup (**CP5**), no deploy (**CP6**). The app code still lives only on the `black-belt` branch.
