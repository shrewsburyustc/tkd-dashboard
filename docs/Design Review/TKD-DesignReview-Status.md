# Design & Quality Review — status

**Updated:** 2026-10-21 (Design Review worktree session, branch `design-review`)
**Rulebook at this update:** v0.719 on `main`. Design Review rows: none yet — block **1.000–1.099**, next free **1.000** (`git merge main` before any rulebook edit).
**Branch:** `design-review` = `main` (dbbacc2) + this folder. Never pushed. Phase 1 covers `main` up to **45a8b79**; `main` keeps moving while other sessions merge, so each phase states its cut-off commit and picks up later merges at the start of the next phase (next: dbbacc2, Star's Home "Today" card, v0.515).

> Read `CLAUDE.md` first. This file says where the Design & Quality Review stands and what comes next. Keep it current: update it in the same turn a step finishes or a decision is made.

---

## 1. What this session does

- **Goal: one consistent system.** The whole dashboard looks, feels and works the same everywhere. Find every place where two sections do the same job differently (rosters, payments, edit dialogs, filters, menus, confirms, wording, icons, toasts and banners, empty and error states, settings pages, print views, public forms) and propose **one shared pattern** for each, written into the rulebook. Real differences (Black Belt's rubric, Camps' days) stay, inside the shared pattern.
- **Who it's for: the Grandmaster.** Used to pen and paper (clipboard roster, receipt book, paper testing sheet), not comfortable with technology; he must be able to use it flawlessly. On every screen: is the next step obvious, do the words match his words, can he undo a mistake, is it big enough on the mat-side tablet? Still modern, and WCAG 2.2 AA.
- **Rules for this session:**
  - Review, test and propose only. **No app code or migration changes.** Each fix goes to the owning session as a ready-to-paste prompt that Jeffrey passes on. Test scripts may be added on this branch.
  - Preview mode and PGlite only. Never write to the live site or database; never sign in there with a password.
  - Scope is `main`. Unmerged work is listed and reviewed after it merges.
  - Commit on `design-review` after each reviewed phase; never push. One decision at a time.
- **Owning sessions:** Main (shell, Home, sign-in/lock, account menu, Staff accounts, Settings, shared components) · Color Belt · Star · Finance · new students (Prospects, Forms + kiosk, Schedule, Calendar) · Camps · Black Belt.

## 2. Phases (Jeffrey sees each result before the next starts)

| # | Phase | Status | Output |
|---|---|---|---|
| 1 | Inventory: every screen, dialog and public page, owner, rulebook rows, paper task, "same job, different design" list | **Done 2026-10-21** — checked by a separate agent | `Phase 1 inventory/` |
| 2 | Other systems (martial arts + gym software, modern apps): comparison, sources, copy / avoid | Next — waits for Jeffrey's go | — |
| 3 | Design review in preview mode at 1280×800, 820×1180 touch, 390×844 touch, 320 wide; Grandmaster walkthroughs | Not started | — |
| 4 | Code review + bug hunt (all of `src/`, `functions/`, `supabase/`) + separate security review (handoff §6) | Not started | — |
| 5 | Stress tests (thousands of rows, slow/failed/offline saves, two devices, double taps, bad input, PIN lock mid-dialog, 320 wide, 200% zoom) | Not started | — |
| 6 | Report: one combined PNG per screen with amber outlines; findings High/Medium/Low with owner and fix prompt; top 10 for the Grandmaster | Not started | — |
| 7 | Consistency rules: one question at a time → 10b rows + changelog from block 1.000–1.099 | Not started | — |
| 8 | Real-world checklist for the real devices, with "passing looks like" | Not started | — |
| 9 | What to add: ranked recommendations with why, size and owner | Not started | — |

## 3. Setup (done 2026-10-21)

- Branch renamed to `design-review`; fast-forwarded to `main` 45a8b79 during phase 1 (no merge commit). `npm ci` done in the root and in `supabase/tests/pglite`. `npm run build` and `npm run build:preview-mode` pass. The preview build warns that one JavaScript chunk is over 500 kB — check first-load time on the tablet in phase 4/5.
- `/claudex:review` was **not** used for phase 1: it hands Codex a fixed "review the git diff" prompt (ignores this brief), the diff was empty, and it runs Codex with its sandbox and approvals turned off. It can be run later on a phase's output if Jeffrey wants.
- Screenshot tool (scratchpad for now, added to this branch in phase 3): `shoot.mjs` drives headless Chrome over the DevTools protocol with Node 24's built-in WebSocket — no downloads. Exact sizes, touch emulation (`pointer: coarse`, `hover: none`), full-page captures.

## 4. Phase 1 result

Files in `Phase 1 inventory/`:
- `TKD-DesignReview-Inventory.md` — the summary: owners, the "same job, different design" list (G1–G19), early warnings, rulebook gaps, unmerged work.
- `Phase1-consistency-matrix.png` (+ `.html` source) — one picture: 18 repeated jobs × 7 sections, same color = same way.
- `Area-1-Core.md` … `Area-7-NewStudents.md` — every screen, dialog, menu and public page per area (Part A), how each area does 25 common jobs (Part B), rule mismatches noticed (Part C), pending work (Part D).
- `Area-8-Delta-45a8b79.md` — what the 44 commits that landed during the phase added (Star Results, Camps weekly pricing).
- `Checker-report.md` — the independent check: 6 of 7 early warnings and 82 of 93 claims confirmed as first written; the 11 wrong details are corrected in the summary.

**Early warnings (to confirm in phases 3–5):**
1. Black Belt payments are not in Finance — live today (owner Finance).
2. Camps ignores "Hide private details" (owner Camps).
3. Only Black Belt prints a receipt — ask Jeffrey whether the desk gives paper receipts today.
4. Four ways to take a payment, four ways to fix one.
5. Errors shown as 5-second toasts (Black Belt, Prospects).
6. No offline warning outside Star grading; background refreshes fail silently.
7. Withdraw is never red (rule §7); Black Belt's code also differs from its approved mockup.

## 5. Open questions for Jeffrey

- Does the desk hand out paper receipts today (decides how urgent "receipts everywhere" is)?
- Prospects, Forms, Schedule and Calendar docs never say what paper or old process they replace — what did staff use before?

## 6. Next step

Show Jeffrey the phase 1 result. On his OK, phase 2 (other systems).

## 7. Shared files touched by this session

None. Everything is under `docs/Design Review/`.
