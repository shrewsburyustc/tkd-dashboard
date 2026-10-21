# Black Belt testing — CP3 run sheet: paste migration 0016 into production

**What this is:** the exact steps for checkpoint CP3 (contract `docs/Dashboard Docs/Build contracts/CONTRACT-0016.md` §13), in order: who does each step, what you should see, and when to stop. Background: `supabase/SETUP.md`, section **"Migration 0016"** (0016a–0016h).
**Why it's safe before the app is ready:** 0016 only **adds** Black Belt's own tables, functions and one locked-down login (`bb_registrar`). Nothing in the live app calls them yet, the family form's Function isn't deployed, and registration can't open while the waiver is the placeholder. 0016 changes no object any earlier migration made (tested, and checked again in step 4). One side effect to know: Black Belt rows point at the schools, so once real Black Belt data exists a school row can't be removed while they do.
**Nothing is applied without Jeffrey's OK for this paste.** Nothing secret goes into chat, git or a screenshot. **Do steps 2 and 6 outside desk hours** (the tests briefly reopen today's day in Finance inside their own rolled-back transaction, which could block a real Close the day at that moment).

---

## 0. Already checked (read-only, 2026-10-21, through the Supabase connection)

| Check | Result |
|---|---|
| No Black Belt objects yet (`bb_` tables, functions, the `bb_registrar` login) | **None** — 0 / 0 / 0 |
| The 15 shared helpers 0016 relies on (test C8) | **All 15 identical** to the versions 0016 was built and tested against (`current_session_id` is already Color Belt's 0020 version, which C8 accepts) |
| Live migrations around it | camps (0013, 0017), Color Belt 0014 + 0020, Finance 0011 + 0018, new students 0007–0009, 0012, 0015, school phone 0019 |
| Accounts the tests need | exactly 1 active admin; exactly 1 active desk account with role `staff` named **"Staff"** (the test stops with `TEST SETUP` otherwise) |
| Other form logins | `testing_registrar`, `star_registrar`, `forms_registrar` exist; `bb_registrar` doesn't yet |
| Schools | `shrewsbury`, `worcester` |
| Database size | **22 MB** of the Free plan's 500 MB; change_log has 757 rows |
| PostgreSQL | 17.11 |
| Security advisor before 0016 | 3 notices, none about Black Belt — saved for comparison |
| Whole-database snapshot (`supabase/tests/0016_cp3_snapshot.sql`, everything that isn't `bb_`) | functions 401 `d3d29491…`, tables 86 `29b495f3…`, policies 50 `79632e56…`, triggers 194 `75d54f44…` |
| PGlite | 0016 applied on top of **every live migration in production order** (0001–0006, 0010, 0007–0009, 0012, 0015, 0011, 0019, 0014, 0020, camps' 0013 + 0017, 0018), then every earlier test file again and 15 fingerprint files compared: **678 passed, 0 failed** |

---

## 1. Just before the paste

**1.0 (Jeffrey) — the go-ahead.** Say "OK to paste 0016" in chat. Already done: CP1 seed check (v0.910), security review of the SQL, contract approved (v0.909).

**1.1 (Claude) — the exact file.**
- `git status` on `black-belt` must be clean.
- Note the commit hash.
- Take the SHA-256 of the file (`Get-FileHash`).
- Run `node run.mjs` once more at that commit, and keep its printed 0016 fingerprints as the reference for step 3.

**1.2 (Claude, read-only):**
- Re-check that no `bb_` object exists.
- Take the **"before" fingerprints** of every live migration: the `0003`–`0012`, `0014`, `0015`, `0018`, `0019`, `0020` fingerprint files, with comment lines stripped before sending (one of them has a refused word in a comment).
- Take the **whole-database snapshot** again.
- Check the accounts (1 admin, 1 "Staff").

**1.3 (Jeffrey):** in the SQL Editor run this one line and tell me the answer:
```sql
select session_user;
```
Expected: `postgres`. (The hand-fix exception for the starting point needs it.) Anything else → stop.

## 2. Paste 0016 (Jeffrey, SQL Editor, ~1 min)

1. Open **this exact file** (it exists only in the Black Belt worktree, not in the main folder):
   `C:\Users\jberg\projects\tkd-dashboard\.claude\worktrees\black-belt-testing-section-b90531\supabase\migrations\0016_black_belt.sql`
   Use VS Code or Notepad, then **Ctrl+A, Ctrl+C**.
2. Supabase → **SQL Editor → New query** → paste → **Run**.
3. Supabase warns about **destructive operations**. That's expected: the words are inside rules (`on delete cascade / restrict`), inside functions that run later, and in `… if exists` lines that make re-running safe. **Nothing is removed now.** Confirm.
4. Expected: **Success** (often "Success. No rows returned"; a small result grid is fine too).
   - **Any error → stop.** It's one transaction, so nothing was kept. Copy the error text to me.

## 3. Right after (Claude, read-only, ~3 min)

1. **New objects:** 13 `bb_` tables, the sequence `bb_candidate_ref_seq`, and the `bb_registrar` login (no password yet, so it can't log in).
2. **`0016_fingerprints.sql`:** production must equal the reference from 1.1, line for line. One expected difference: the role row shows `members=postgres` on Supabase.
3. **Starting data:** matches `supabase/tests/0016_seed_review.txt` (the CP1 list you OK'd):
   - one placeholder waiver `2026-1`
   - the starting point
   - empty keep-years
   - **no cycles, no candidates, no payments**

## 4. Nothing else moved (Claude, read-only)

The "after" fingerprints of every live migration, and the whole-database snapshot, must be **identical** to step 1.2's. (0016's only grant outside its own objects is `usage on schema public` to `bb_registrar`, which the snapshot doesn't include.) Any difference → stop.

## 5. Security advisor (Claude, read-only)

The notices that are expected and accepted are the same kinds every earlier section has (SETUP 0016c.4):
- **INFO** "RLS enabled, no policy" on exactly **2** tables, `bb_candidate_waivers` and `bb_starting_point`. Nobody in the app may read them at all; the other 11 tables each have their rule.
- **WARN** "Security definer function executable by authenticated" for exactly **25** Black Belt staff functions. Each one checks access and the caller's role itself and has `search_path = ''`.

The contract's CP3 line says "no new warnings". These two kinds are the accepted pattern since 0003, recorded here. **Anything else about a `bb_` object is a real problem → stop.**

## 6. Run the tests (Jeffrey, SQL Editor, ~5–10 min, outside desk hours)

1. **Prepare the test file.**
   - Open `supabase/tests/0016_tests.sql` (same worktree folder as step 2).
   - Replace `<paste-admin-UID-here>` with your admin account's UID, and `<paste-desk-UID-here>` with the front desk's UID (the account named **Staff**). Find both under **Authentication → Users**, in the UID column.
   - Paste the whole file → **Run** → confirm the destructive-operations warning. The test removes only its own test rows, and everything is rolled back.
2. **Expected:** one row, **ALL 0016 TESTS PASSED**.
   - A `TEST FAILED:` or `TEST SETUP:` row → run `rollback;` once on its own, then send me the text. Nothing was saved.
   - "canceling statement due to statement timeout" → add `set statement_timeout = '10min';` as the very first line and run again. Nothing is kept either way.
3. **Run four more test files** the same way (all four ask for both UIDs): **`0005_tests.sql`**, **`0006_tests.sql`**, **`0011_tests.sql`**, **`0018_tests.sql`**. Each must show its PASSED row.
   - Optional if you have time: `0014`, `0019`, `0020`, `0010`, `0004`, `0003`, `0002`, `verify_pin`.
4. **Delete the test snippets** from the SQL Editor's list afterwards. It saves every query automatically, and the UIDs shouldn't stay there.
5. **Reset the reference counter** (first time only), so the first family gets **BB-5001**. The tests used up some numbers even though they rolled back. Run this as **one block**: it refuses if any Black Belt candidate exists or ever existed.
   ```sql
   do $$ begin
     if exists (select 1 from public.bb_candidates)
        or exists (select 1 from public.change_log where table_name = 'bb_candidates') then
       raise exception 'Black Belt candidates exist or existed - do NOT reset the reference counter';
     end if;
     perform setval('public.bb_candidate_ref_seq', 5001, false);
   end $$;
   ```
   Expected: "Success. No rows returned". I then check (read-only) that the counter reads `5001 / not yet used`. Never run this once any family has registered.

## 7. Size and wrap-up (Claude)

1. **Database size** again (read-only), plus the expected growth, into the status file. A drawn signature is ≤ 70 KB, so about 14 MB a season for ~200 registrations, kept for years. That's well inside 500 MB.
2. **Records to update:**
   - SETUP's "Migration 0016" line **Status: NOT APPLIED** becomes **Applied on [date]**.
   - Status file updated.
   - `git merge main`, re-read the rulebook, then a rulebook row "CP3: 0016 live" (0.9xx block).
   - Commit on `black-belt` (no push).

---

## If something goes wrong

- **The paste fails:** nothing was kept (one transaction). Send me the error. We fix it in PGlite first, re-test and re-review, and only then try again.
- **A check after the paste fails:** don't run the tests yet; send me what you see. If 0016 itself is wrong and **no real data exists yet**, SETUP **0016h** has the undo script. It refuses to run once any candidate or payment exists.
  - **Know before you undo:** the history (change_log) is kept, so after an undo and a second paste, test **T3a** in `0016_tests.sql` finds the seed recorded twice and fails. That's expected after an undo, not a new problem; tell me and I'll adjust the test before the re-run.
- **Emergency off switch** (any time, later): SETUP **0016g**.

## What CP3 does **not** do

- No password for `bb_registrar`. That's **CP3b** (SETUP 0016e, on your PC); the password goes only into your password manager.
- No real waiver text (**CP4**), no Cloudflare setup (**CP5**), no deploy (**CP6**). The app code still lives only on the `black-belt` branch.
