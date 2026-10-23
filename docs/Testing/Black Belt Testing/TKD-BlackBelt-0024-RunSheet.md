# Black Belt testing — run sheet: paste migration 0024 (the rubric editor) into production

**What this is:** the steps for pasting `supabase/migrations/0024_black_belt_rubric.sql` (CONTRACT-0024 CP2), in order: who does each, what you should see, when to stop. Background and exact expected results: `supabase/SETUP.md`, section **"Migration 0024"** (0024a–0024f). It works like the 0016 paste (CP3 run sheet): Claude pins the file and checks before and after; you paste and run the tests.
**OK given:** Jeffrey, 2026-10-21, "push it through" (this paste and the deploy right after it).
**Do it outside desk hours.** Nothing secret goes into chat or a screenshot.

---

## 0. Already checked (read-only, 2026-10-21)
- No `bb_default_rubric` yet; **0 Black Belt cycles, 0 candidates** on production (so nothing to convert; OI-14 doesn't apply). Reference counter at 5001, unused.
- PGlite: 0024 applied on top of every live migration in production order, then every earlier test file, the exact 0016 fingerprint difference and the "no number changes" conversion proof: all pass (see the latest `node run.mjs`).

## 1. Just before the paste (Claude)
1. Pin the file: clean `git status`, note the commit, take its SHA-256.
2. Read-only: no `bb_default_rubric`; cycles still 0.
3. Take the **"before" fingerprints** of every live migration (0003–0022 files, comment lines stripped) and the whole-database snapshot (`supabase/tests/0016_cp3_snapshot.sql`), and the security advisor list.

## 2. Paste 0024 (Jeffrey, SQL Editor)
1. Claude puts the whole file on your clipboard (checked character for character).
2. SQL Editor → **+ New query** (empty) → **Ctrl+V** → check the first and last lines Claude gives you → **Run** → confirm the destructive-operations warning (the words are in rules and re-run guards; **nothing is removed now**).
3. Expected: **Success** (a small result grid is fine). Any error → stop and copy it to Claude; one transaction, nothing kept.

## 3. After the paste (Claude, read-only) — SETUP 0024c
1. `0024_fingerprints.sql` equals PGlite's, incl. `check | 0016_rerun | ok`.
2. `0016_fingerprints.sql` differs from the "before" by **exactly** SETUP 0024c's list (4 function md5s, 1 trigger row, 1 constraint row, 19 added functions); every other fingerprint file byte-identical. The whole-database snapshot (everything not `bb_`) identical.
3. Advisor: exactly **+5** "security definer executable by authenticated" (the five new functions) and **+1** "RLS enabled, no policy" (`bb_rubric_undo`). Nothing else new.
4. The default rubric's numbers equal the CP1-approved ones (spot checks: 1st Dan Egg test B 11, most points 339 / 361.5; 4th Dan Target kick B 9).

## 4. Tests (Jeffrey, SQL Editor) — SETUP 0024d
Claude puts each file on your clipboard with your admin and desk IDs filled in:
1. `0024_tests.sql` → **ALL 0024 TESTS PASSED**.
2. `0016_tests.sql` → **ALL 0016 TESTS PASSED** (it checks the new behaviour where 0024 changed it).
3. The tests use up reference numbers → **counter reset** again (the same guarded block as CP3; it refuses if any candidate exists or existed).
4. Delete the test snippets from the SQL Editor afterwards.

## 5. Deploy (Main session, with this OK)
Black-belt is merged into main and pushed right after the paste (SETUP 0024e): the old screens keep working meanwhile (Add cycle copies the default, a staff first opening is refused). Then you check everything on the live site.

## If something goes wrong
- **Paste fails:** nothing kept; send the error.
- **A check fails after the paste:** stop, send it to Claude. While no cycle exists, SETUP **0024f** undoes 0024 (paste its block and then 0016 straight after each other).
- **Never re-run `0016_black_belt.sql`** on its own after 0024 (SETUP 0024b step 4).
