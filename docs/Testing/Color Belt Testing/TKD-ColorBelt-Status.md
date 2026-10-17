# Color Belt Testing — status and next steps

**Updated:** 2026-10-17 (Color Belt worktree session, branch `color-belt`; belt look approved v0.67, narrow-phone rows v0.68 + v0.69)
**Rulebook at handoff:** v0.65 · **Contract:** `docs/Dashboard Docs/Build contracts/CONTRACT-0003.md` · **Plan:** `TKD-Testing-Phase1-Build-Plan.md` (this folder) · **Old system inventory:** `TKD-ColorBelt-Inventory.md` (this folder)

> Read `CLAUDE.md` (repo root) first. This file says where Color Belt phase 1 stands and what comes next. Keep it current.

---

## 1. Where things stand (one paragraph)

Phase 1 = **Testing → Classes and ranks** (admins edit each school's Classes, ranks, prices, final awards, belt pictures; staff view only). It is **fully built and reviewed in preview mode** and its files are **committed locally** (checkpoint `811b812` on `main`; Color Belt work continues on branch `color-belt`). Nothing is pushed, and **migration 0003 has not been applied anywhere** (the live site and live database are unchanged — Home only). The last thing built was **belt graphics + the belt picker** (rulebook v0.64/v0.65) — Jeffrey **approved the look in the preview on 2026-10-17 (rulebook v0.67)**; belts still exist **only in the preview (fake database)** — the database part (step A) is next.

**⚠ Don't push.** The screens now ask the database for `belt_*` columns and send `p_belt_*` arguments that migration 0003 doesn't have yet. Against the real database Testing would fail (`42703` / `PGRST202`). It only works in preview mode until step A below is done and 0003 is live.

## 2. Waiting on Jeffrey right now

1. ~~Approve the belt look in the preview.~~ **Done 2026-10-17** — approved by Jeffrey, recorded in the rulebook as v0.67 (v0.65 row updated, new 10b row, changelog line).
2. ~~Optional phone question~~ **Decided 2026-10-17 (rulebook v0.68) and built:** under 360 px wide, rank rows drop the Edit pencil (tap the row to edit); 320 px Bo Dan rows went from 159 px to 84 px tall. Follow-up **decided and built (v0.69):** under 360 px the rank ⋯ menu starts with "Edit rank", so screen readers can find Edit.

## 3. Next steps, in order (each needs his OK where marked)

**A. Belts into the database** (after the look is approved)
- Builder A: add to `supabase/migrations/0003_testing_classes_ranks.sql` the rank columns `belt_pattern text`, `belt_color text`, `belt_color_2 text null`, `belt_end_stripes integer`, `belt_end_stripe_color text` (planned default `'yellow'`), checks matching `validateBelt` in `src/lib/testing/belts.js` (contract §5.8), column-level select grants, version bump on belt change (belt columns are content columns), and the five `p_belt_*` arguments on `testing_add_rank` / `testing_update_rank` — **always sent, no defaults**. Re-run safety: the file must still upgrade an older copy (it drops old function signatures; fixture `supabase/tests/pglite/fixtures/0003_before_v062.sql`). Update `0003_tests.sql` (invalid-belt → `invalid`, grants, version rule), catalog checks, `0003_fingerprints.sql`, CONTRACT-0003 (remove "preview first; DB pending" notes as each piece lands), SETUP §10. All PGlite steps must pass (`supabase/tests/pglite`, last run 32/32 before belts).
- **Open DB detail to settle while building:** the screens/mock allow `belt_end_stripe_color` = null when end stripes = 0 (`validateBelt` allows it), but the contract only says "default `'yellow'`" (nullability undecided). Screens always send a color. Pick one and make DB, mock and contract agree.
- Builder B: add belts to the seed. `supabase/manual/make_seed.mjs` → belt per rank exactly as the "Belts" line in contract §6.3 (same values as `src/lib/mockTesting.js`): LT White solid white · LT Yellow/Green/Blue/Red/Black = stripe white + that color · White, Yellow, Orange, Green, Blue, Purple, Red, Brown solid · High Green/Blue/Red/Brown = stripe that color + white · Red / Black = half red (top) + black · Bo Dan = stripe black + white · Bo Dan - 1/2/3 Big Stripe = same + 1/2/3 yellow end stripes · Deputy = stripe black + yellow. End-stripe color yellow everywhere. Teen/Adult ranks = kids' rank of the same name. Regenerate `0003s_seed_classes_and_ranks.sql` + review table.
- Then a **security review** (DB) and a **design review** by separate agents; fix; re-review.

**B. Commit** — **done:** checkpoint commit `811b812` (+ `599edd1`, PGlite lockfile) on local `main`. From now on Color Belt commits go on branch `color-belt` and reach `main` through the Main session. **No push.**

**C. CP3 — database, with his OK at each step** (production Supabase SQL Editor, pasted by Jeffrey)
1. Run `supabase/tests/verify_pin_tests.sql` and `supabase/tests/0002_tests.sql` (both roll back; replace UID placeholders per their headers) → both print PASSED. Also confirm `select count(*) from auth.sessions;` returns a number, and that 5 wrong PINs on a test device removes that session (still-open handoff §8 items).
2. OK → paste `0003_testing_classes_ranks.sql`.
3. Read-only connector checks: `select version()` (≥15), list tables, `0003_fingerprints.sql` output must match what `run.mjs` printed, `get_advisors` (security).
4. Run `0003_tests.sql` → `ALL 0003 TESTS PASSED`.

**D. CP4 — seed**, with his OK after he checks the review table: paste `supabase/manual/0003s_seed_classes_and_ranks.sql`; check 7 classes / 42 ranks per school; run `0003_tests.sql` again.

**E. CP5 — real-database check locally** (`Start dashboard.bat`): sign in as admin and as the desk account, both schools, edit/undo, staff view.

**F. CP6 — OK to push** (= deploy). Only after 0003 + seed are live.

**G. Housekeeping:** rulebook 10b "phase 1 live" row + changelog; `TKD-Dashboard-Handoff.md` is stale (written at v0.30) — refresh it; `docs/README.md` sections list; fix `Start preview.bat` PIN text (1234 → 2580) if he wants; claude.ai project copies of changed `.md` docs. Before staff rely on it daily: handoff §8 items (Supabase Pro — Free projects pause after 7 days unused; grandmaster as second admin; bookmark + set This device per building) — his decisions.

**Later phases** (each: design → mockups at 3 sizes → approve → build → reviews → OK): 2 Events + public family registration form (Cloudflare Pages Function path, v0.33) · 3 Registrations and payments · 4 Testing roster (grading) · 5 Private testing. Also pending his OK: aligning the account dialogs' phone Back gesture with the Testing dialogs.

## 4. Decisions made for phase 1 (details in rulebook 10b)

v0.32 full rebuild in the dashboard · v0.33 public form via Pages Function · v0.34 one school per event · v0.35 "Both" blocked in Testing · v0.36 per-school classes/prices · v0.37 small phases, quality over speed · v0.38 tabs inside Testing · v0.39 `ti-certificate` · v0.40 admin edits / staff view · v0.41 permanent delete + confirm · v0.42 final award dropdown in class dialog · v0.43 reorder instant + Undo · v0.44 add rank copies last rank's prices · v0.45 add button in page header · v0.46 centered dialog + unsaved-changes guard · v0.47 no copy-between-schools · v0.49 mockups approved · v0.50 single tab until phase 2 · v0.51 custom dropdown · v0.52 arrow-key row nav · v0.53 empty states · v0.54 rail Home → Testing, nothing on Home yet, toast pause on hover · v0.55 plan approved · v0.56 phone "Discard changes" link · v0.57 Save blue when valid · v0.62 final award **None** (Group D and Teen/Adult), Deputy is practice-only ($10/$10/$10, Dan testing comes later), Teen/Adult = one-time 1:1 match of the kids' list (High Green private $95→$85) · v0.63 drag on every device by the grip (dashboard-wide; decided in the Star testing session) · v0.64 belt graphics + belt-color exception to rule 7 · v0.65 belt picker. (v0.58–v0.61 are Star testing.)

Real data: 7 classes / 42 ranks per school. Final awards: Little Tiger → Yellow (Group A), White → Yellow, Group A → Blue, Group B → High Red, Group C → Bo Dan, Group D → None, Teen/Adult → None.

## 5. Files (committed in `811b812`)

- **Database:** `supabase/migrations/0003_testing_classes_ranks.sql` (tables `locations`, `testing_classes`, `testing_ranks`, append-only `change_log`; 8 RPCs `testing_add_class / update_class / reorder_classes / delete_class / add_rank / update_rank / reorder_ranks / delete_rank`; statuses ok / no_access / not_allowed / not_found / stale / duplicate_name / invalid / not_empty), `supabase/tests/0003_tests.sql`, `0003_fingerprints.sql`, `supabase/tests/pglite/*`, `supabase/SETUP.md` §10.
- **Seed:** `supabase/manual/make_seed.mjs`, `0003s_export_from_old_system.json` (read-only export), `0003s_adjustments.json` (approved v0.62 changes; `--no-adjustments` only with a loud warning), `0003s_export_query.sql`, `0003s_review_table.txt`, `0003s_seed_classes_and_ranks.sql`, fixtures (`*_fixture*`, `..._NOT_FOR_PRODUCTION.sql`).
- **App:** `src/screens/Testing.jsx`, `src/screens/testing/*` (BeltPicker, BlockedOnBoth, ClassBlock, ClassDialog, ClassesRanksTab, DeleteDialog, FinalAwardSelect, RankDialog, RankRows, TestingSkeleton, text.js), `src/components/{Belt,Dialog,ErrorBanner,IconButton,RowMenu,Toast}.jsx`, `navItems.js`, `src/lib/testing/{api,belts,checks.mjs,names,rankOrder,useClassesRanks}.js`, `src/lib/{mockClient,mockTesting,money,device,useMediaQuery,useReorderDrag,useRowArrowNav,useShortcutN}.js`, `src/styles/{testing,app,tokens}.css`, `src/App.jsx`, `src/main.jsx`.
- **Docs:** this folder (inventory, approved mockups `TKD-Testing-Classes-Ranks-Mockups.html`, belt reference mockups `TKD-Testing-Belt-Graphics-Mockups.html` (reference for v0.64/v0.65; the look is approved in the preview, step §2.1), build plan, this status file); contract in `docs/Dashboard Docs/Build contracts/`.

## 6. Things that bit us (don't repeat)

- Rulebook edits: compute insert positions **after** replacements (an early script garbled two changelog lines); always re-read first — the Star session edits it too; keep CRLF.
- After copying/writing files, verify them (an earlier copy wrote a stale file).
- Worktree previews ignored every edit: `vite.config.js` watch-ignored `**/.claude/worktrees/**`, which matches a worktree's own path. Fixed on `color-belt` 2026-10-17 (ignore only this folder's own `.claude/worktrees/`); other worktrees get it when they merge `main`. Until then: restart their preview to see edits. Stopping a background `npm run dev` can leave its `node` child holding the port — find it by command line and stop it.
- Git on this PC: an interrupted `git status` from another environment once left `.git/index.lock` — if git says a lock file exists and no git is running, the empty lock file can be removed.
- Supabase connector cancels SQL containing `delete`/`drop` (even in comments) → Jeffrey pastes in SQL Editor.
- Invisible/control characters in names are refused (DB, `names.js`, `make_seed.mjs`) — keep the three in sync.
- Reviewer findings already fixed (don't regress): deferred position uniqueness tested; delete confirmations can't go stale (expected ids/versions passed to delete RPCs); service_role revokes; per-school lock order (locations row first) against deadlocks; `pronargdefaults` catalog check; 44 px touch targets; roving tabindex; phone back gesture; tooltips on all icon buttons; belt review items (phone row wrapping units, sparring as text on phone, 760 px two-column PC rank dialog with pinned Save, −/+ stepper, swatch grids, whole-pixel belt bands, same-color warnings, auto-scroll limited to the dragged item's own list).
