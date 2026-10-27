# Dashboard core — status

**Updated:** 2026-10-27 (Dashboard core worktree session, branch `dashboard-core`)
**Rulebook at this update:** 1.034 on `main`; **1.109** on this branch. Dashboard core rows: **v1.100** (Q1), **v1.101** (Q2), **v1.102** (M1), **v1.103** (M2), **v1.104** (M3), **v1.105** (M4), **v1.106** (M5), **v1.107** (M6), **v1.108** (M7), **v1.109** (M8), all 2026-10-27 — block **1.100–1.199**, next free **1.110** (`git merge main` before any rulebook edit).
**Branch:** `dashboard-core`, started from `main` ffcdc92; `main` merged in up to ec733b7 (2026-10-27, fast-forward). Nothing committed yet on it. Never pushed.

> Read `CLAUDE.md` first. This file says where the Dashboard core work stands and what comes next. Keep it current: update it in the same turn a step finishes or a decision is made.

---

## 1. What this session does

- **Owner "Main" in the rulebook rows and the design review's change list** means the dashboard's own work, and that is this session. The **Main session** is a different one: it works in the main folder, merges branches, reserves migration numbers, and does no feature work.
- **Step 1 — the shared parts** (design review items M1–M11, rulebook v1.030).
  - Build each shared part once (UI in `src/components/`, helpers in `src/lib/`) and prove it.
  - **Nothing on screen changes in this step.** Each section switches to the parts in its own later prompt.
  - Brief: `docs/Design Review/End review/Prompts/1-DashboardCore-step1-shared-parts.md`. Plan: `TKD-DashboardCore-Plan.md` (this folder).
- **Step 2 — Main's own screens** (M12–M14, M17; M15 with Color Belt; M16 later): starts after step 1 is merged into `main`. Brief: `Prompts/2-DashboardCore-step2-main-screens.md`.
- **Rules:**
  - preview mode only: `npm run dev:preview-mode`. Never `npm run dev`, `npm run preview` or `Start dashboard.bat` here — `.env.local` is in this worktree;
  - mockups before code; Jeffrey OKs each part one at a time;
  - separate design and code reviewers;
  - no database changes in step 1;
  - commit on `dashboard-core` after each reviewed step; never push.

## 2. Step 1 — where each part stands

| # | Part | Plan | Mockup | OK | Built | Reviewed |
|---|---|---|---|---|---|---|
| M1 | Compare dialog + possible-duplicate box | drafted | reviewed, fixes applied (`Mockups/M1-compare-duplicate.*`; review picture `M1-compare-duplicate.review.png`) | **OK 2026-10-27 (v1.102)** | — | — |
| M2 | Confirm box ("are you sure?") | drafted | reviewed, fixes applied (`Mockups/M2-confirm-box.*`; review picture `M2-confirm-box.review.png`) | **OK 2026-10-27 (v1.103)** | — | — |
| M3 | Mark paid box | drafted | reviewed, fixes applied (`Mockups/M3-mark-paid-box.*`; review picture `M3-mark-paid-box.review.png`) | **OK 2026-10-27 (v1.104)** | — | — |
| M4 | Print receipt | drafted | reviewed, fixes applied (`Mockups/M4-receipt.*`; review picture `M4-receipt.review.png`) | **OK 2026-10-27 (v1.105)** | — | — |
| M5 | Registration link box | drafted | reviewed, fixes applied (`Mockups/M5-registration-link.*`; review picture `M5-registration-link.review.png`) | **OK 2026-10-27 (v1.106)** | — | — |
| M6 | Count cards | drafted | reviewed, fixes applied (`Mockups/M6-count-cards.*`; review picture `M6-count-cards.review.png`) | **OK 2026-10-27 (v1.107)** | — | — |
| M7 | History line and list | drafted | reviewed, fixes applied (`Mockups/M7-history-line.*`; review picture `M7-history-line.review.png`) | **OK 2026-10-27 (v1.108)** | — | — |
| M8 | Time list | drafted | reviewed, fixes applied (`Mockups/M8-time-list.*`; review picture `M8-time-list.review.png`) | **OK 2026-10-27 (v1.109)** | — | — |
| M9 | Money helper | drafted | no mockup (nothing on screen) | minus sign decided (v1.101) | — | — |
| M10 | Move the misplaced helpers | drafted | no mockup | — | — | — |
| M11 | Shared words and styles | drafted | no mockup | — | — | — |

**Added by Q1 (v1.100), no mockup of their own** (plan §2b):

| Part | Plan | Built | Reviewed |
|---|---|---|---|
| A dialog on top of a dialog (`Dialog.jsx` "on top" mode) | drafted | — | — |
| One dropdown (`components/Select.jsx`, M8's base) | drafted | — | — |
| The drag handle (`components/Grip.jsx`) | drafted | — | — |

**Open with Jeffrey, one at a time:**
1. ~~Q1 — which copies join step 1~~ — **decided 2026-10-27: 1–3 now, 4–6 later** (rulebook v1.100, written on this branch, not committed).
2. ~~Q2 — the minus sign~~ — **decided 2026-10-27: A, "−$190" / "−$190.00"** (rulebook v1.101, written on this branch, not committed).
3. ~~The mockups, one part at a time (M1 → M8)~~ — **all eight OK'd 2026-10-27**: M1 (v1.102), M2 (v1.103), M3 (v1.104), M4 (v1.105), M5 (v1.106), M6 (v1.107), M7 (v1.108), M8 (v1.109). Next free rulebook number: 1.110.
4. **Commit the approved docs now?** — the plan, status, mockups, tools and rulebook rows v1.100–v1.109, on `dashboard-core` only (no push). Asked 2026-10-27.

## 3. Log

- **2026-10-27 — setup.**
  - Branch renamed to `dashboard-core`. It already sat on `main`'s latest commit ffcdc92, so no fast-forward was needed.
  - `npm ci` done (32 packages, 0 vulnerabilities).
  - Remote Control turned on for this session (Jeffrey's ask).
  - Read: CLAUDE.md, rulebook §0–§8 and v1.000–v1.034, handoff §6, the change list (§1, §2.1, §4, §6), `Walkthrough/Decisions.md`, and the decision pictures for M1–M9.
- **2026-10-27 — the "before" checks.**
  - All 18 check files pass: `src/lib/*/checks.mjs`, `src/lib/star/*Checks.mjs`, `src/screens/prospects/progress.checks.mjs`, and `src/forms/checks.mjs` after a build (it reads `dist/`).
  - `npm run build` passes.
  - The before *shots* are taken right before the first app file changes (after the mockup OKs).
- **2026-10-27 — code re-survey.** Five read-only search agents covered:
  - confirm boxes;
  - Compare / payment / receipt / link / cards;
  - history / time lists / money;
  - helpers / words / other copies / build guards;
  - CSS load order.

  Findings are in the plan: §2–§3 per part, §9 the 39 confirm boxes, §10 problems found on the way for the owning sessions. The headlines:
  - 39 confirm boxes in 20 files on four frames. Most show nothing while they work; nine close on Esc / Back while they work. Under 700 px tall they pick up the pinned button row by accident.
  - Star's time list is a custom dropdown (StarSelect), so the time list is built on a shared dropdown.
  - Of the money helpers, only Black Belt's `formatCents` writes exactly the rule. It becomes a wrapper; Finance's `money` matches too, but Finance is left alone for now.
  - Two dialogs stacked with `Dialog.jsx` already happen (Star's Dan change, Prospects' phone delete), and one Back reaches both.
  - The real build loads forms.css before app.css. That causes two live-only Forms differences.
- **2026-10-27 — plan drafted** (`TKD-DashboardCore-Plan.md`).
- **2026-10-27 — mockups drafted for M1–M8**, in `Mockups/`:
  - `src/*.src.html` is the source; `*.html` is self-contained, built with the app's real stylesheets and Tabler icons; `*.png` is the review picture (all states × 1280×800, 820×1180 touch, 390×844 touch, 320×640 touch).
  - Tools in `tools/`: `build-mockup.mjs`, `shoot-states.mjs`, `compose-sheet.mjs`, `shoot-page.mjs`, `chrome.mjs`. They use headless Chrome through the DevTools Protocol, as the design review's tools do.
- **2026-10-27 — Q1 sent to Jeffrey** with its picture.
- **2026-10-27 — Q1 decided** (Jeffrey: "copies 1–3 join step 1 (stacked dialogs, one dropdown, the grip). 4–6 later.").
  - Recorded as rulebook **v1.100**: a 10b row above the v0.26 row, a changelog line, the header bumped, and a "(See v1.100 …)" pointer on the v1.030 row. CRLF kept: 0 LF-only lines.
  - `git merge main` first: already up to date, as `main` is still ffcdc92.
  - The plan has a new §2b for the three parts.
- **2026-10-27 — mockups design-reviewed** by a separate reviewer agent against the rulebook rows and the decision pictures. It found 6 must-fix and 12 should-fix items plus 9 notes. Each was checked against the files and all are applied:
  - M2's buttons no longer move while it works: stacking is decided from the usual words.
  - M1's failure note was hidden under the pinned buttons; the buttons and note now share `.dialog-footer`. This is a live bug in today's four Compare dialogs, and in small confirm boxes under 700 px tall — plan §10.
  - M3's gray button was missing; Camps' box now opens from its tag.
  - M8: Finance uses 5-minute steps (v1.019; v0.207's row says so). The arrow-key row gets the 2 px blue ring. The scroll bar is drawn.
  - M6 shows Black Belt's phone pills (v0.219) next to the shared cards.
  - M4 and M1 show their loading and failed states separately.
  - Today's words are copied exactly, curly apostrophes included.
  - The plan is updated to match.
- **2026-10-27 — Q2 sent** with its picture (`Questions/Q2-minus-sign.png`).
- **2026-10-27 — Q2 decided** (Jeffrey: "A — a real minus before the dollar sign: −$190 on screens, −$190.00 in Finance.").
  - Recorded as rulebook **v1.101**: a 10b row above the v0.26 row, a changelog line, the header bumped, and a "(See v1.101 …)" pointer on the v1.026 row. CRLF kept: 0 LF-only lines. `git merge main` first: already up to date.
  - Checked in the code: Finance's CSV writes "-35.00" (`src/lib/finance/csv.js`), so the row says the CSV keeps plain numbers.
  - The plan's §0 and §3 (M9) updated; §3's check list now says Finance's list is every 5 minutes (146 choices), matching §2 M8.
- **2026-10-27 — review pictures re-cut to screen width.** The full sheets are too big to read (M1's is 5030×22954 px; the design review pictures Jeffrey approved are about 2000×1500). New tool `tools/compose-review.mjs` makes a 2200 px wide picture per part: the main state at all four sizes, the other states at PC, every picture shrunk by the same amount (0.6). The full sheets stay as the record.
- **2026-10-27 — M1 sent** for OK (`Mockups/M1-compare-duplicate.review.png`).
- **2026-10-27 — M1 OK'd** (Jeffrey: "M1 OK — both details as drawn: the visible “⚠ different” and “Keeping…”.").
  - `git merge main` first: fast-forward ffcdc92 → ec733b7 (CLAUDE.md only — migration 0027 reserved for Camps' edit-camp guard).
  - Recorded as rulebook **v1.102**: a 10b row above the v0.26 row, a changelog line, the header bumped, and "(See v1.102 …)" pointers on v0.114 (Star's duplicate box and compare) and v0.702 (Camps'). CRLF kept: 0 LF-only lines.
- **2026-10-27 — M2 sent** for OK (`Mockups/M2-confirm-box.review.png`, 2200×6376 px).
- **2026-10-27 — M2 OK'd** (Jeffrey: "M2 OK — all three details as drawn.").
  - `git merge main` first: already up to date (ec733b7).
  - Recorded as rulebook **v1.103**: a 10b row above the v0.26 row, a bullet in §8 "Are you sure?" boxes, a "(See v1.103 …)" pointer on the v1.008 row, a changelog line, the header bumped. CRLF kept: 0 LF-only lines. (The row script's own "already there" check first stopped it before it wrote anything, because the new §8 bullet also says "decided v1.103"; the check was narrowed to the 10b row and the script re-run.)
- **2026-10-27 — M3 sent** for OK (`Mockups/M3-mark-paid-box.review.png`, 2200×4124 px).
- **2026-10-27 — M3 OK'd** (Jeffrey: "M3 OK — both details as drawn.").
  - `git merge main` first: already up to date (ec733b7).
  - Recorded as rulebook **v1.104**: a 10b row above the v0.26 row, a "(See v1.104 …)" pointer on the v1.001 row, a changelog line, the header bumped. CRLF kept: 0 LF-only lines.
- **2026-10-27 — M4 sent** for OK (`Mockups/M4-receipt.review.png`, 2240×6942 px).
  - Checked in the code first: Black Belt's receipt today keeps Print blue while it loads (only `aria-disabled`, no gray class) and says "Payments are hidden on this device." — the two details the picture asks about.
- **2026-10-27 — M4 OK'd** (Jeffrey: "M4 OK — both details as drawn.").
  - `git merge main` first: already up to date (ec733b7).
  - Recorded as rulebook **v1.105**: a 10b row above the v0.26 row, a "(See v1.105 …)" pointer on the v1.002 row, a changelog line, the header bumped. CRLF kept: 0 LF-only lines.
- **2026-10-27 — M5 sent** for OK (`Mockups/M5-registration-link.review.png`, 2240×7384 px).
  - A status-file script written through the shell lost the backslashes in two of its patterns and put stray text on this file's first line. Repaired by hand the same turn: the title line and the M4 / M5 table cells. Scripts with backslashes are now written with the file tool, not the shell.
- **2026-10-27 — M5 OK'd** (Jeffrey: "M5 OK — both details as drawn.").
  - `git merge main` first: already up to date.
  - Recorded as rulebook **v1.106**: a 10b row above the v0.26 row, a "(See v1.106 …)" pointer on the row it extends, a changelog line, the header bumped. CRLF kept: 0 LF-only lines.
- **2026-10-27 — M6 sent** for OK (`Mockups/M6-count-cards.review.png`, 2240×6652 px).
- **2026-10-27 — M6 OK'd** (Jeffrey: "M6 OK — Black Belt's phones get the 2×2 cards (changes v0.219).").
  - `git merge main` first: already up to date.
  - Recorded as rulebook **v1.107**: a 10b row above the v0.26 row, a "(See v1.107 …)" pointer on the row it extends, a changelog line, the header bumped. CRLF kept: 0 LF-only lines.
- **2026-10-27 — M7 sent** for OK (`Mockups/M7-history-line.review.png`, 2240×6148 px).
  - The pointers went on both v1.013 and v0.219, plus a bullet in §8 Metric cards.
  - Flagged with M7: the approved history drawing writes dates as "Oct 22", so Star's history loses the year and the time of day ("Oct 22, 2026, 4:05 PM" today, `stampLong` in Star's text.js).
- **2026-10-27 — M7 OK'd** (Jeffrey: "M7 OK — both details as drawn, dates only (“Oct 22 · Jeffrey Berg”).").
  - `git merge main` first: already up to date.
  - Recorded as rulebook **v1.108**: a 10b row above the v0.26 row, a "(See v1.108 …)" pointer on the row it extends, a changelog line, the header bumped. CRLF kept: 0 LF-only lines.
- **2026-10-27 — M8 sent** for OK (`Mockups/M8-time-list.review.png`, 2240×4806 px).
  - The row also adds a line to §2.4 Master icon map (› while closed, ⌄ while open: the one place › doesn't open a page).
  - **Two mockup-tool faults found and fixed before M8 went out.** (1) The sheet tool wrote its own page as `<name>.html` — the built mockup's name — so all eight self-contained mockups (`Mockups/M*.html`) had been overwritten at 10:44–10:46 by 5–10 KB sheet pages. Rebuilt from `Mockups/src/` with build-mockup.mjs (85–326 KB each, every state present); compose-sheet.mjs now writes `<name>.sheet.html`. (2) The Chrome helper measured each page with its 15 px scroll bar but took the full-page picture without it, so crops landed off: a few px sideways at PC (e.g. M2's gray backdrop, M1's duplicate box at tablet) and about 19 px too low on all six M8 tablet shots. Fixed in chrome.mjs (the page's own scroll bar is hidden while shooting); all eight parts re-shot, their sheets and review pictures recomposed. Only the crops changed — nothing inside any frame did, so M1–M7's approvals stand.
- **2026-10-27 — M8 OK'd** (Jeffrey: "M8 OK — both details as drawn.").
  - `git merge main` first: already up to date.
  - Recorded as rulebook **v1.109**: a 10b row above the v0.26 row, a "(See v1.109 …)" pointer on the row it extends, a changelog line, the header bumped. CRLF kept: 0 LF-only lines.

## 4. Next

1. Jeffrey's answer on committing the approved docs (a checkpoint before any app file changes).
2. Then the build, as the brief says:
   - take the before shots in the preview (`npm run dev:preview-mode` only): a roster, a confirm box, Finance's Daily report, Staff accounts, Camps' roster, the Calendar — four sizes; re-run the check files;
   - build M1–M11 and the three §2b parts, with the parts page kept out of the build;
   - after shots (dev preview and a static preview-mode build), check files, `npm run build` and `npm run build:preview-mode`;
   - a separate design reviewer and a separate code reviewer;
   - commit on `dashboard-core` (ask first); never push.
