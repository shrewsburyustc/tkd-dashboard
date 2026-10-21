# Camps — go-live checklist (CP2 → CP6)

**Status:** plan, 2026-10-20. Nothing done yet. CP0 (plan) and CP1 (preview walkthrough) are passed.
**Rule for every step:** nothing is applied, changed in Cloudflare, merged into `main`, pushed or deployed without **Jeffrey's OK for that specific step**. Claude only reads the live database (read-only checks) and never handles a password. The detailed click-by-click steps are in `supabase/SETUP.md` → **Migration 0013** (0013a–0013k) and **Migration 0017** (0017a–0017d); this page is the order and the gates.

Words used below:
- **SQL Editor** — the box in the Supabase website where you paste and run SQL.
- **Read-only check** — Claude looks at the database through the Supabase connection; it can't change anything.
- **Fingerprints** — a list of every database function's code and rights; if production's list matches the tested copy, production has exactly what was tested.
- **Hyperdrive** — Cloudflare's database connector the family form uses (only the form, with its own restricted login).
- **Off switch** — `CAMPS_REGISTRATION` (a Cloudflare setting): `off` = every camp link says "not open" and the database isn't touched.

---

## Before CP2 — housekeeping (no OK needed for these, they're local)
- [ ] `camps` up to date with `main` (`git merge main`) and every check green — done 2026-10-20.
- [ ] Tell the Finance session the order is fixed: **0013 + 0017 before Finance's 0018** (0018 builds on 0017).

**2026-10-20 — Jeffrey: "Yes, but quickly. Do all of them at once"** (CP2 + CP3 now, to unblock Finance's 0018; Camps stays undeployed). Pre-checks done read-only: no camp object on production; live = 0005–0012, 0014, 0015, 0019 (not 0016, 0018); the six Finance functions 0017 replaces/reads are byte-identical to the tested 0011 (0014 didn't touch them). Shortened run sheet: before = 0011/0005/0006 tests; apply 0013; password (0013d); apply 0017; after = 0013/0017/0011 tests; then Claude's full fingerprint + advisor checks.

**2026-10-20 — production-order check PASSED (71/0):** fresh PGlite built like production (0001–0006, 0010, 0007–0009, 0012, 0015, 0011, 0019, 0014, 0020) + 0013 + 0017: every test file passes before and after (0014/0020 files and `0006_tests.sql` taken from `color-belt` — camps' copy of `0006_tests.sql` predates 0020 and fails on production even without Camps); all earlier fingerprints unchanged except the 7 intended 0011 lines; 0013 = 115 rows, 0017 = 96 rows, identical to run.mjs (saved in the scratchpad `prodorder/`). 0017 unchanged = fb4ec24's text (Finance's 0018 guard depends on it). **GO given to Jeffrey for the paste.**

## CP2 — Cloudflare setting (you, ~2 min) · *your OK needed*
SETUP 0013a. Cloudflare → `tkd-dashboard` → Settings → Variables and Secrets → **Production**: add `CAMPS_REGISTRATION` = `off`. Nothing visible changes (it takes effect at the next deploy).
**Done when:** the variable is listed under Production only.

## CP3 — database: apply 0013 + 0017 (you in the SQL Editor, me read-only, ~45 min) · *your OK needed*
Pick a quiet time (one of the tests briefly locks a camp table; nobody uses Camps yet anyway).
1. **Me:** read-only check of which migrations are live, and that **no camp object exists yet** (0013b step 2).
2. **You:** run the test file of every live migration (0013b step 1) — all must pass **before** anything new goes in.
3. **You:** paste `0013_camps.sql` → Run (0013c). Supabase warns about "destructive operations" — expected, explained in 0013c.
4. **You:** set the `camps_registrar` password with the script on your PC (0013d) — the password goes straight into your password manager; only a scrambled version goes into SQL. Then delete the script and the SQL snippet.
5. **Me:** read-only checks (0013e): 0013 fingerprints match the tested copy (115 rows), earlier fingerprints unchanged, security advisor shows only the expected notices.
6. **You:** run `0013_tests.sql` (0013f) → **ALL 0013 TESTS PASSED**, then the earlier test files again.
7. **You:** paste `0017_finance_camps.sql` → Run (0017a).
8. **Me:** 0017 fingerprints match; 0011's differ only in the 5 replaced functions + 2 rules (0017b).
9. **You:** run `0017_tests.sql`, then `0011_tests.sql` and `0013_tests.sql` again (0017c).
**Done when:** every test file says ALL … PASSED and every fingerprint matches. **If anything fails:** stop, paste the error to me; nothing half-applied stays (each file is one transaction).
**After CP3:** tell the Finance session 0017 is live (their 0018 may then go in).

## CP4 — Hyperdrive for the family form (you in Cloudflare, ~10 min) · *your OK needed*
SETUP 0013g. New Hyperdrive config `tkd-camps-registrar` (user `camps_registrar.…`, the password from your password manager, caching **off**, verify-full, ≤ 5 connections), bound as `HYPERDRIVE_CAMPS` to **Production** only. I check the connection budget on the Free plan with you.
**Done when:** the binding shows on Production; still nothing visible to families (the off switch is `off` and the code isn't deployed).

## CP5 — the staff side on the real database (you on this PC, ~30 min) · *your OK needed*
SETUP 0013h. `Start dashboard.bat` (real database, only on this PC — still nothing deployed):
1. Make a **TEST** camp: Add camp, Edit, Save as template, Use template, Registration link / QR / Download, Close / Reopen sign-up.
2. Make a test sign-up **in the SQL Editor** with the snippet in 0013h (it calls the real sign-up function; the family page isn't live yet).
3. In the app: Check in + Undo, Mark paid + Undo, Edit details → Owes → Mark paid $X, admin Edit / Undo payment, possible duplicate → Keep this one / Restore, Withdraw / Restore, Delete camper, then **Delete camp**.
4. Finance: the TEST camp's payments show in that day's Daily report (this device's school) and in Close the day's expected cash — then they disappear when the TEST camp is deleted (or undo them first).
5. **Me:** read-only — everything is in the change history, no signature image anywhere, **zero rows** left for the TEST camp.

## CP6 — deploy (Main session + you) · *your OK needed for the merge, the push, and each live step*
1. **Merge:** you ask the **Main session** to merge `camps` into `main` (it explains any conflicts). Camps' old rulebook rows are already renumbered, so no number clashes.
2. **Push = deploy:** only with your explicit OK; Cloudflare builds the live site (with `CAMPS_REGISTRATION=off`).
3. **Live checks (0013i step 1):** the dashboard works; Camps is in the rail; `…/camp/abcdefgh` shows the family page with the strict security headers; `/api/camp/abcdefgh` answers "not open".
4. **Phone test (0013i step 2), with your OK:** make a TEST camp live → set `CAMPS_REGISTRATION=on` → Retry deployment → you sign up from your phone, and a few times from the desk tablet → they appear on the camp page within 15 s → check one in → Hyperdrive metrics show "not cached".
5. **Clean up:** delete the TEST camp; I confirm zero rows left. Only then make the first real camp.

## Before the first real camp (you, in the app — no deploy needed)
- [ ] Paste the school's **real waiver** into the camp templates (Edit template → 5. Family form). The preview text is a placeholder.
- [ ] On **every desk device**, account menu → **This device** = its school (Mark paid uses it; an unset device counts as Worcester).
- [ ] Confirm the **3-year signature retention** with the school's insurer (v0.700).
- [ ] Optional: bind Cloudflare's `RATE_LIMITER` (security review note) before heavy sign-up days.

## If something goes wrong (any time)
SETUP 0013j: (1) instant database off switch (two `revoke` lines), (2) `CAMPS_REGISTRATION=off` + Retry deployment, (3) lock the login. Color Belt's and Star's forms aren't affected. Cloudflare → Deployments → **Rollback** puts the previous site back. Removing Camps completely (0017d then 0013k) only before real camp data exists.
