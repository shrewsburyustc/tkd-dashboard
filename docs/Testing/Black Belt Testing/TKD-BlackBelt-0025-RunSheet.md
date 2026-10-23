# Black Belt testing — run sheet: paste migration 0025 (grading and results) into production

**What this is:** the steps for pasting `supabase/migrations/0025_black_belt_grading.sql` (CONTRACT-0025, CP1 → CP2), in order: who does each, what you should see, when to stop. Background and exact expected results: `supabase/SETUP.md`, section **"Migration 0025"** (0025a–0025g). It works like the 0016 and 0024 pastes: Claude pins the file and checks before and after (read-only); you paste and run the tests.
**OK needed:** Jeffrey's OK for **this paste** (CP1). Nothing is pasted before that.
**Do it outside desk hours.** Nothing secret goes into chat or a screenshot. The admin and desk UIDs are filled in **only on your clipboard**, never in a file.

---

## 0. Already checked (2026-10-23)
- **Contract:** CONTRACT-0025 approved at CP0 (rulebook v0.958) after two security reviews.
- **Build:** the migration, its tests (`0025_tests.sql`), fingerprints, the undo script and the shared fixture were security-reviewed line by line; every finding fixed (commit 794e8ee) and each new test shown to fail when its fix is removed.
- **PGlite** (`node run.mjs`): 0025 on top of every live migration in production order, then every earlier test file, the exact fingerprint differences, re-apply = no change, the undo script (refuses in all 7 unsafe states, round-trips cleanly), a re-run of 0016 / 0024 is caught: **1292 passed, 1 accepted miss** — the "Make-up from an earlier cycle" picker took ~1.2 s on a deliberately huge 6-year seed (limit 300 ms). It is timed on production in step 3.5.
- **App twin:** `src/lib/blackBelt/grading.js` gives the same answer as the database, key by key, on all 54 fixture cases.
- **The live app keeps working after the paste:** every replaced function only gains keys (proven by the version-aware `0016_tests.sql`); no grade, make-up or send exists until the new screens (deployed later, CP4) create them.

## 1. Just before the paste (Claude, read-only) — SETUP 0025a
1. Pin the file: clean `git status`, note the commit, take its SHA-256.
2. No `bb_grades` yet; count cycles and candidates.
3. Take the **"before" fingerprints** of every live migration (0003 … 0024 files) and the whole-database snapshot outside Black Belt, and the security advisor list.

## 2. Paste 0025 (you, SQL Editor) — SETUP 0025b
1. Claude puts the whole file on your clipboard (checked character for character against the pinned SHA-256).
2. SQL Editor → **+ New query** (empty) → **Ctrl+V** → check the first and last lines Claude gives you → **Run** → confirm the destructive-operations warning (the words are in rules and re-run guards; **nothing is removed now**).
3. Expected: **Success** (a small result grid is fine). Any error → stop and copy it to Claude; it's one transaction, nothing is kept.
4. **Never re-run `0016_black_belt.sql` or `0024_black_belt_rubric.sql` after this.**

## 3. After the paste (Claude, read-only) — SETUP 0025c
1. `0025_fingerprints.sql` equals PGlite's, incl. `check | rerun | ok` and the `cycle_plan_id` row.
2. `0016_fingerprints.sql` / `0024_fingerprints.sql` differ from the "before" by **exactly** SETUP 0025c's list; every other fingerprint file byte-identical; the whole-database snapshot outside Black Belt identical.
3. Advisor: exactly **+15** "security definer executable by authenticated" (the 15 new staff functions) and **+2** "RLS enabled, no policy" (`bb_downloads`, `bb_cycle_grading_started`). Nothing else new.
4. The three result email texts equal the seeded ones (md5).
5. **Picker timing on production** (SETUP 0025c step 5's read-only query). Under ~1 s → fine. Over ~1 s → Claude brings you a choice (e.g. limit the picker to recent cycles); nothing changes without your OK.

## 4. Tests (you, SQL Editor) — SETUP 0025d
Claude puts each file on your clipboard with your admin and desk IDs filled in:
1. `0025_tests.sql` → **ALL 0025 TESTS PASSED** (makes its own `zz test` rows; everything is rolled back).
2. `0024_tests.sql` → **ALL 0024 TESTS PASSED**.
3. `0016_tests.sql` → **ALL 0016 TESTS PASSED**.
4. The tests use up reference numbers → **counter reset** again (the same guarded block as CP3; it refuses if any real candidate exists or existed).
5. Delete the test snippets from the SQL Editor afterwards.

## 5. After that
- Claude records the paste in the status file and the rulebook (next Black Belt number) and CLAUDE.md's migration table is marked "applied" through the Main session.
- **The screens** (Grading, Results, Result emails, Make-up from an earlier cycle, Dan-change dialog) are built next in the preview (P3–P5), reviewed, and walked through with you (CP3). The deploy (CP4) needs its own OK.
- You may also choose to **hold the paste until after the preview walkthrough** — the contract allows either order.

## If something goes wrong
- **Paste fails:** nothing kept; send the error.
- **A check fails after the paste:** stop, send it to Claude. While nobody has graded, SETUP **0025g** undoes 0025 (`supabase/manual/0025u_undo.sql`; it refuses on its own if any real grading record exists).
