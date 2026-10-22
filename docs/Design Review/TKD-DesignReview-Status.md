# Design & Quality Review — status

**Updated:** 2026-10-22 (Design Review worktree session, branch `design-review`)
**Rulebook at this update:** 0.515 on `main`. Design Review rows: none yet — block **1.000–1.099**, next free **1.000** (`git merge main` before any rulebook edit).
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
| 1b | **Walkthrough of the phase 1 findings, one item at a time, each with a today-vs-after picture** (Jeffrey, 2026-10-21: "I cannot understand it all at once") | **In progress** — items 1–8 decided; item 9a shown, waiting for Jeffrey | `Walkthrough/` |
| 2 | Other systems (martial arts + gym software, modern apps): comparison, sources, copy / avoid | **On hold** until the walkthrough is done (Jeffrey, 2026-10-21) | — |
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
- Screenshot tool (now in `tools/`): `shoot.mjs` drives headless Chrome over the DevTools protocol with Node 24's built-in WebSocket — no downloads. Exact sizes, touch emulation (`pointer: coarse`, `hover: none`), full-page captures.

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

**Walkthrough** (`Walkthrough/README.md` has the order of all 20 items; `Walkthrough/Decisions.md` is the decision log).

**Jeffrey's rules for it (2026-10-22):** no changes for now — nothing in the app, no prompts sent to other sessions, no rulebook edits; record each decision, and at the end go over everything that will be changed (including the rulebook rows to write). **Planned is not missing:** the system is still incomplete, so before anything is called missing, check the owning session's status file, plans, contracts, rulebook rows and unmerged branches; each finding gets a label (planned — not built yet / approved this way / drift / missing — not planned / unclear).

Item 1 — Black Belt money in Finance — was shown 2026-10-21 (reproduced in the preview: a $500 Black Belt cash payment doesn't reach the Daily report; Close the day says "Over $500.00") and **relabelled 2026-10-22 as planned, not built yet**: Finance owns it (v0.808 / v0.809; Finance status §8). No decision needed; one note kept for the end (Black Belt's payment screens went live before Finance reads them). The ready-to-paste Finance prompt from phase 1 is **not** to be sent during the walkthrough.

**Re-check done (2026-10-22):** two checker agents labelled every phase 1 finding (`Phase 1 inventory/Planned-vs-missing-A.md`, `-B.md`; summary in `TKD-DesignReview-Inventory.md` §1b; the overview picture is relabelled). Most "different design" findings were **approved separately in each section**, so those walkthrough items ask "make them match?" rather than reporting mistakes. Missing and not planned: Camps and the switch, the Prospects email under the switch, the offline bar, offline check-ins, Color Belt private detail view, Color Belt/Camps history, top-bar search, 7 icon-map rows. Seven open questions are listed in §1b. The walkthrough now has 20 items (item 20: rules no section has built).

Item 2 — Camps and "Hide private details" — shown 2026-10-22 (tablet-size picture; label: missing, not planned); **decided 2026-10-22: yes**, Camps hides money as drawn.

Item 3 — taking a payment — shown 2026-10-22 (label: approved in each section; four ways side by side, then option C drawn: the same small Mark paid box with Paid by everywhere, Black Belt keeps its dialog with the same words); **decided 2026-10-22: C** (one small Mark paid box with Paid by everywhere; Black Belt keeps its dialog with the same words). Item 3b — receipts — **decided 2026-10-22: B** (Black Belt's Print receipt in every section's ⋯ menu and detail, printed when a family asks). Item 4 — fixing a payment — **decided 2026-10-22: B with Color Belt's ⋯ menu as the model** (Edit payment and Undo payment together in the person's ⋯ menu; Undo payment always asks first; Edit payment ends with "Payment changed" + Undo; Black Belt's row items act on the latest payment). Item 5a — problem messages that vanish — **decided 2026-10-22: B** (problems stay on screen in the amber bar; a grayed button gets a gray reason line; toasts only say something was done). Item 5b — Wi-Fi drops — **decided 2026-10-22: B** (one offline bar on every page while offline or after two failed refreshes; gone by itself). Item 6 — Undo after a change — **decided 2026-10-22: B** (rule 1.4 everywhere: Undo for 5 seconds after every reversible change, including Black Belt's Edit details and cycle saves; Finance's "Day reopened" stays as is). Item 7 — taking someone off a roster — **decided 2026-10-22: C** (red means "gone for good": Withdraw plain everywhere, only Delete permanently red and asks first; Black Belt gets the same two items, its choice box goes; rule §7 reworded). Item 8 — "are you sure?" boxes — shown 2026-10-22 (approved in each section, plus drift: Prospects / Forms / Calendar "Cancel" and Camps "Keep …" were never drawn); **decided 2026-10-22: B** ("Keep …" everywhere — Keep payment, Keep student, Keep class, Keep prospect, "Keep it" where there's no short name — and the other button repeats the words he pressed). Item 9a — opening a person — shown 2026-10-22 (one pattern already; Color Belt private testing rows don't open — missing, not planned); **waiting for Jeffrey: A / B / C** (recommended B: the event roster's summary). 9b, the change history, comes next. Phase 2 waits until the walkthrough is done.

**Found during the walkthrough (check in phase 3, not yet labelled):** in the preview with the Star switch on, after opening Black Belt from Color Belt's page, the Testing choice page's "Color belt testing" row and a reload of `#testing/color-belt` both kept showing Black Belt; only Black Belt's own "← Testing" link returned to Color Belt. Possibly temporary until Black Belt moves into the choice page (step C2, planned). Cause seen 2026-10-22: `src/screens/Testing.jsx` keeps `blackBeltOpen` in memory while the dashboard is open, so "Color belt testing" reopens Black Belt until a full page reload. Also seen: Black Belt's Undo payment box for one card payment that covered three installments is titled "Undo payment 1 + Payment 2 + Payment 3?" — hard to read. From the full confirm-box list (helper agent, 2026-10-22): on screens under 700px tall the confirm boxes pick up the form dialogs' pinned button row with a line above it (seen at 320×640; probably unintended); in most confirm boxes nothing visible changes while they save (`aria-disabled` draws nothing in the staff app); Prospects' Delete status may give no first focus (not checked); Star's failure note says "Couldn't save…" on a delete; apostrophes are mixed (' and ’).

**Tools (on this branch, `tools/`):** `cdp.mjs` (remote control for a hidden Chrome: open, click by label, type, screen size and touch mode, screenshots, element boxes), `shoot.mjs` (one-shot screenshot), `compose.mjs` (combined today/after picture from a `.json` spec), `mock-item*.js` (the "after" drawings per item: 01 Finance, 02 Camps hidden, 03 pay box, 03b receipt, 04 undo-payment confirm, 05b offline bar, 07 remove menu, 08 confirm-box words, 09 private testing summary). Preview server: `.claude/launch.json` → "design-review-live-look" (Star switch off, like the live site) and "design-review-preview" (Star on); not committed, like the other sessions' launch files.

## 7. Shared files touched by this session

None. Everything is under `docs/Design Review/`.
