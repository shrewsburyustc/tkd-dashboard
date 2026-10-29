# Dashboard core — status

**Updated:** 2026-10-28 (Dashboard core worktree session, branch `dashboard-core`)
**Rulebook at this update:** 0.620 on `main`; **1.115** on this branch. Dashboard core rows: **v1.100** (Q1), **v1.101** (Q2), **v1.102** (M1), **v1.103** (M2), **v1.104** (M3), **v1.105** (M4), **v1.106** (M5), **v1.107** (M6), **v1.108** (M7), **v1.109** (M8), **v1.110** (proof pictures in git), all 2026-10-27; **v1.111** (D4), **v1.112** (D6), **v1.113** (housekeeping: rows v1.100 and v1.104 corrected), **v1.114** (the date picker opened from a button) and **v1.115** (a count card's note of two lines), all 2026-10-28 — block **1.100–1.199**, next free **1.116** (`git merge main` before any rulebook edit).
**Branch:** `dashboard-core`, started from `main` ffcdc92; `main` merged in up to ec733b7 (2026-10-27, fast-forward), then up to ddfc848 (2026-10-28, merge commit **524bd6b**: camps' 0027 and rulebook v0.720), then up to 6d140e4 (2026-10-28, merge commit **6626920**: Finance's F8 with migration 0026, rulebook v0.814–v0.816 and CLAUDE.md's 0026 notes), then up to ca02305 (2026-10-28, merge commits **93fca25** and **eff1fe4**: CLAUDE.md notes and the Design Review's six section prompts; no conflicts). Committed: **712e3a6** — the approved docs (2026-10-27); **2a9b8bc** — step 1: the shared parts, the parts page, the tools, the proof sheets and rulebook v1.110–v1.112 (2026-10-28); **fc3bea6** — the fact fixes (v1.113). **Merged into `main` as 95a9601** (2026-10-28, the Main session); this branch then moved forward to `main` 4c15146, and later to a3ff7ca (both fast-forwards; the second brought New students' N17 merge, rulebook v0.616). Then the date picker opener option (v1.114, committed as 1bb2683); `main` merged in up to 50022cf (2026-10-28, merge commit **bd3847e**: New students' N1, N2, Undone, class ages and classes taught together, with migration 0031 and rulebook v0.617–v0.620; the rulebook's three same-spot conflicts kept both sides, main's first); then the count cards' two-line note (v1.115, committed). Never pushed.

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
| M1 | Compare dialog + possible-duplicate box | drafted | reviewed, fixes applied (`Mockups/M1-compare-duplicate.*`; review picture `M1-compare-duplicate.review.png`) | **OK 2026-10-27 (v1.102)** | **built 2026-10-27** (part 2; parts page `parts.html`) | **reviewed 2026-10-27** (design + code; re-checked after fixes) |
| M2 | Confirm box ("are you sure?") | drafted | reviewed, fixes applied (`Mockups/M2-confirm-box.*`; review picture `M2-confirm-box.review.png`) | **OK 2026-10-27 (v1.103)** | **built 2026-10-27** (part 2; parts page `parts.html`) | **reviewed 2026-10-27** (design + code; re-checked after fixes) |
| M3 | Mark paid box | drafted | reviewed, fixes applied (`Mockups/M3-mark-paid-box.*`; review picture `M3-mark-paid-box.review.png`) | **OK 2026-10-27 (v1.104)** | **built 2026-10-27** (part 2; parts page `parts.html`) | **reviewed 2026-10-27** (design + code; re-checked after fixes) |
| M4 | Print receipt | drafted | reviewed, fixes applied (`Mockups/M4-receipt.*`; review picture `M4-receipt.review.png`) | **OK 2026-10-27 (v1.105)** | **built 2026-10-27** (part 2; parts page `parts.html`) | **reviewed 2026-10-27** (design + code; re-checked after fixes) |
| M5 | Registration link box | drafted | reviewed, fixes applied (`Mockups/M5-registration-link.*`; review picture `M5-registration-link.review.png`) | **OK 2026-10-27 (v1.106)** | **built 2026-10-27** (part 2; parts page `parts.html`) | **reviewed 2026-10-27** (design + code; re-checked after fixes) |
| M6 | Count cards | drafted | reviewed, fixes applied (`Mockups/M6-count-cards.*`; review picture `M6-count-cards.review.png`) | **OK 2026-10-27 (v1.107)** | **built 2026-10-27** (part 2; parts page `parts.html`) | **reviewed 2026-10-27** (design + code; re-checked after fixes) |
| M7 | History line and list | drafted | reviewed, fixes applied (`Mockups/M7-history-line.*`; review picture `M7-history-line.review.png`) | **OK 2026-10-27 (v1.108)** | **built 2026-10-27** (part 2; parts page `parts.html`) | **reviewed 2026-10-27** (design + code; re-checked after fixes) |
| M8 | Time list | drafted | reviewed, fixes applied (`Mockups/M8-time-list.*`; review picture `M8-time-list.review.png`) | **OK 2026-10-27 (v1.109)** | **built 2026-10-27** (part 2; parts page `parts.html`) | **reviewed 2026-10-27** (design + code; re-checked after fixes) |
| M9 | Money helper | drafted | no mockup (nothing on screen) | minus sign decided (v1.101) | **built 2026-10-27** (foundations) | **reviewed 2026-10-27** (design + code; re-checked after fixes) |
| M10 | Move the misplaced helpers | drafted | no mockup | — | **built 2026-10-27** (foundations) | **reviewed 2026-10-27** (design + code; re-checked after fixes) |
| M11 | Shared words and styles | drafted | no mockup | — | **built 2026-10-27** (foundations; the new parts' words and styles come with M1–M8) | **reviewed 2026-10-27** (design + code; re-checked after fixes) |

**Added by Q1 (v1.100), no mockup of their own** (plan §2b):

| Part | Plan | Built | Reviewed |
|---|---|---|---|
| A dialog on top of a dialog (`Dialog.jsx` "on top" mode) | drafted | **built 2026-10-27** | **reviewed 2026-10-27** (design + code; re-checked after fixes) |
| One dropdown (`components/Select.jsx`, M8's base) | drafted | **built 2026-10-27** | **reviewed 2026-10-27** (design + code; re-checked after fixes) |
| The drag handle (`components/Grip.jsx`) | drafted | **built 2026-10-27** | **reviewed 2026-10-27** (design + code; re-checked after fixes) |

**Open with Jeffrey, one at a time:**
1. ~~Q1 — which copies join step 1~~ — **decided 2026-10-27: 1–3 now, 4–6 later** (rulebook v1.100, committed in 712e3a6).
2. ~~Q2 — the minus sign~~ — **decided 2026-10-27: A, "−$190" / "−$190.00"** (rulebook v1.101, committed in 712e3a6).
3. ~~The mockups, one part at a time (M1 → M8)~~ — **all eight OK'd 2026-10-27**: M1 (v1.102), M2 (v1.103), M3 (v1.104), M4 (v1.105), M5 (v1.106), M6 (v1.107), M7 (v1.108), M8 (v1.109).
4. ~~Commit the approved docs~~ — **done 2026-10-27: 712e3a6** on `dashboard-core` (Jeffrey: "Yes — commit the approved docs on dashboard-core (no push)."). Not pushed.
5. ~~Which proof pictures go into the commit~~ — **decided 2026-10-27: A, only the 8 side-by-side sheets** (rulebook v1.110). Next free rulebook number: 1.111.
6. ~~D4 — M5's two-school download name (WCAG 2.5.3)~~ — **decided 2026-10-27: A, "Download QR code, Worcester"** (rulebook v1.111). Nothing on screen changes.
7. ~~D6 — M4's 600 weights vs §7~~ — **decided 2026-10-28: A, weight 500, as §7 says** (rulebook v1.112). Nothing changes in Chrome on Windows; on Apple devices the two lines are a shade lighter.
8. ~~The step 1 commit~~ — **done 2026-10-28** on `dashboard-core` (Jeffrey: "Yes, commit"): 83 files, **2a9b8bc**. Not pushed.
9. ~~The fact fixes from the Design Review session~~ — **made and committed 2026-10-28** (plan, status, rulebook v1.113; Jeffrey: "Yes, commit"). Not pushed.
10. ~~Merge into `main`~~ — **done 2026-10-28: 95a9601**, by the Main session. Step 1 is on `main` (not pushed).

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
  - Two dialogs stacked with `Dialog.jsx` already happen (Star's Dan change, Prospects' phone delete), and one Back reaches both. *(Corrected 2026-10-28, v1.113: Star's Dan-change box takes the candidate dialog's place, so only Prospects' phone delete stacks.)*
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
- **2026-10-27 — the approved docs committed** on `dashboard-core` as **712e3a6**: the rulebook (+36 / −13 lines; v1.100–v1.109) and `docs/Dashboard Core/` (279 new files, about 29 MB — the plan, status, mockups, crops, question pictures and tools). `git status` was clean after it; nothing from `.env.local`, `node_modules` or `dist`. Not pushed.

- **2026-10-27 — the "before" state of the app, recorded before any app file changes** (`Proof/`):
  - The preview runs on **http://localhost:5190** (`npm run dev:preview-mode -- --port 5190 --strictPort`); a preview-mode build (`npm run build:preview-mode -- --outDir dist-preview`, fake database) is served as plain files on **http://localhost:5191** by `tools/serve-static.mjs` — `npm run preview` is never used.
  - **23 screens × 4 sizes = 92 pictures** from each: `Proof/before/` (dev) and `Proof/before-build/` (built copy), by `tools/shoot-app.mjs`. The list was widened from the plan's six screens because M11 moves styles every section uses: Home; Testing; Color Belt's Events, Classes and ranks (the drag handle) and Private testing; an event roster, its ⋯ menu open, Edit details, the Delete permanently box and that box with its failure note (the preview's `failNextSave`, nothing saved); Star's events and an event; Black Belt's Cycles and Rubric (its fake data has no cycles); Camps and a camp; Schedule; Calendar; Forms; Prospects; Finance; Staff accounts; Settings. The public family pages don't load `testing.css`, so the style move can't reach them.
  - **Known differences that aren't changes:** the camp page's "Updated h:mm:ss" clock differs on every run (two identical runs: 28 of 32 pictures byte-for-byte equal, the clock the only change); the built copy differs from dev only there and in one small spot on Forms (the known live-only Forms styles, plan §10). Each environment is compared with itself. Home's greeting changes with the time of day. On PC the shooting tool's click has no pointer position, so the ⋯ menu opens in the top-left corner — the same before and after.
  - **Check files:** all 18 pass (`tools/run-checks.mjs`; Forms' after `npm run build`). **Both builds pass** (`npm run build`, `npm run build:preview-mode`).
  - Tools added: `shoot-app.mjs`, `compare-app.mjs` (pixel-by-pixel, differences painted red), `run-checks.mjs`, `serve-static.mjs`.
- **2026-10-27 — build, part 1: the foundations** (a build agent; checked by this session; not committed).
  - **M9:** `formatMoney` and `formatMoneyWithCents` in `src/lib/money.js`. Black Belt's `formatCents` now just calls `formatMoney`; the old and new were compared over 10.3 million values with 0 differences.
  - **M10:** `ChoiceGroup.jsx` and `DeleteDialog.jsx` moved to `src/components/`, `useLiveLoad.js` to `src/lib/`. The old paths re-export them, so nothing that imports them changed. `App.jsx` reads `usePrivateDetailsHidden` from `src/lib/privateDetails.js` (its only change; the one shared file touched).
  - **M11:** the shared parts' words are in `src/components/text.js`, and Testing's, Staff accounts' and Settings' words files re-export them. The shared styles moved from `testing.css`, `testing-events.css`, `calendar.css`, `staff.css` and `prospects.css` into `src/styles/shared.css` (1,513 lines), imported once from `main.jsx` right after `app.css`, in `testing.css`'s old place. The blocks keep their old order inside it.
    - `.ev-sum` stays in `testing-events.css` on purpose: moving it would change the private grading card's bottom margin by 4 px.
    - A declaration-by-declaration comparison of all sheets, in both dev and build order: 21,902 declarations, 0 lost. Every built CSS file except the main one is byte-identical to before.
  - **§2b:** `Dialog` has an `onTop` mode, with `openTopLayer` / `closeTopLayer` in `backButton.js`. Also new: `components/Select.jsx` (the 2 px ring, a gray placeholder, type-ahead) and `components/Grip.jsx` (`RankRows.jsx` re-exports it).
  - **Proof:** after pictures in `Proof/after/` and `Proof/after-build/`, 92 each.
    - In both, 88 of 92 are byte-identical; the other 4 are the camp page, where only the "Updated" clock differs (a 37×8 px box; this session cropped it to check).
    - 19 of 19 check files pass, the 18 old ones plus the new `src/lib/shared/checks.mjs`. `npm run build` and `npm run build:preview-mode` pass.
  - **Noted for later:**
    - (1) the disabled `Grip` looks the same as an enabled one, as Black Belt's does today;
    - (2) M8's "typing a number jumps to that hour" needs a matcher option on `Select` — part 2 adds it;
    - (3) `DeleteDialog` still takes "Delete" / "Couldn't delete" from Testing's words (it moved as it was);
    - (4) Finance's `money()` and `formatMoneyWithCents` agree for every amount up to $50,000 (they differ only above about $70 trillion) — for Finance's prompt.
- **2026-10-27 — build, part 2: the eight parts and the parts page** (a second build agent; checked by this session; not committed).
  - **Parts** in `src/components/`:
    - `CompareDialog.jsx` + `DuplicateBox.jsx` (M1)
    - `ConfirmBox.jsx` with `ConfirmButtons` (M2)
    - `MarkPaidBox.jsx` with `PaidByField` (M3)
    - `Receipt.jsx` (M4)
    - `RegistrationLinkBox.jsx` (M5)
    - `CountCards.jsx` (M6)
    - `HistoryLine.jsx` (M7)
    - `TimeList.jsx` (M8, on `Select.jsx`, which gained an optional `matcher` for "typing a number jumps to that hour")
  - **Helpers:** `src/lib/times.js` (193 choices; Finance's Off + 146) and `src/lib/qr.js` (one QR helper; a 1024 × 1024 PNG named "[event] - [school] QR code.png").
  - **Words, styles and checks:**
    - the parts' words are in `components/text.js`;
    - their styles are appended to the end of `shared.css`, new selectors only;
    - `Dialog.jsx` gained two opt-in props, `className` and `busy`;
    - the time-list and QR checks are in `src/lib/shared/checks.mjs`.
  - **The parts page:** `parts.html` + `src/parts/`. It is dev-only: not in `vite.config.js`, and it refuses to draw outside preview mode. It makes no database calls. Every state of the mockups has its own address (e.g. `parts.html#M2/busy`).
  - **Pictures:** `Proof/parts/M#/` holds 50 states × 4 sizes, and `Proof/parts/M#-built-vs-mockup.png` holds 8 side-by-side sheets, approved mockup next to the built part. The behaviour checks (`tools/check-parts.mjs`) pass 30 of 30, with real keys and clicks.
  - **Checked by this session:**
    - after pictures: 88 of 92 identical in dev and in the built copy; the 4 `camp@*` differ only in the clock (37×8 px box);
    - 19 of 19 check files pass;
    - `dist/` holds none of the parts page's words;
    - the built main CSS still loads app → shared (17,231; the new parts from about 37,600) → testing (47,190);
    - the receipt's print rules apply only while a receipt is printing (`body:has(> .rcpt-print)`, a named `@page`), so other pages' printing is untouched.
  - **The builder's judgement calls** (going to the reviewers):
    - `.btn.is-unavailable` (M2's plain-button gray) is written for the new parts only. Staff accounts' Reset password dialog already gives its plain Generate and Copy buttons `is-unavailable`, but they have no gray rule, so a page-wide rule would gray them — a change on screen. It goes to step 2, Main's screens.
    - The mockup's `.cbox` became `cfm-`, because `.cbox` is Calendar's and Forms' checkbox class.
  - **Proof pictures: 64 MB in total** — 11 MB each in `before/`, `before-build/`, `after/` and `after-build/`, 21 MB in `parts/` (of which 9.2 MB is the 8 side-by-side sheets). Asked Jeffrey which go into the commit.
  - **A slip:** one of the builder's shell lines briefly tried `npm run dev:preview-mode` in the scratchpad (a quoting slip). It failed at once ("no package.json"), so nothing started. That command is the fake-database one anyway.
- **2026-10-27 — code review (a separate reviewer agent): no bugs; 2 risks and 5 small points.**
  - **Clean:**
    - **The CSS move:** its own cascade check over 5,848 declarations in dev and build order. It re-found the `.ev-sum` / `.pg-sum` case, which proves the method works. Nothing was lost or reordered in a way that matters, and no new rule matches an element in today's screens.
    - **Re-exports, words, money and dates:** the re-exports and words are identical; `formatCents` matches over 2 million values; there are no time-zone slips.
    - **`Dialog` and `Select`:** `Dialog` without the new props draws the same markup as before; `onTop` was tried in the browser (Back, Esc, click outside, busy, StrictMode). `Select` is Star's dropdown plus the optional matcher.
    - **QR:** the same output as the five existing copies.
    - **The parts page:** not in either build, and it reaches no database.
  - **To fix before the commit:**
    - (R1) focus after a box on top closes: Safari and iPad don't focus a tapped button, so it can go back to the wrong place. Add an explicit `returnFocusTo`.
    - (R2) `ConfirmBox` swallows a rejected `onConfirm`. Log it, and say in the comment that the section shows its own failure sentence.
    - (N3) `ConfirmButtons`' first focus inside an already-open dialog: an opt-in `autoFocus` plus a corrected comment.
    - (N4) `HistoryLine`: sort by real time, not text, and drop the " · " when a date is missing.
    - (N5) the "hidden" sentence sits in `components/text.js`, against that file's own note that privacy words live in `lib/privateDetails.js`.
  - **Left as is:**
    - `DeleteDialog`'s words still come from Testing's file, as noted in part 1.
  - **For the Main session's merge prompt:** add `src/styles/shared.css` and `src/components/text.js` to CLAUDE.md's shared-files list. Every section's switch will edit them.
- **2026-10-27 — design review (a separate reviewer agent): every part matches its approved mockup at all four sizes, apart from 1 must-fix and 7 small points.**
  - **The builder's pictures are honest:** the reviewer re-shot M2, M6 and M8 itself (76 pictures, pixel-identical to `Proof/parts`), plus its own full-screen shots, and printed real PDFs from the receipt box (1 Letter page, the right margins).
  - **Also checked:** focus rings, tap sizes, sideways scrolling at 320, long names, and text size and words. It accepted all of the builder's known differences, and the plain-button gray written only for the new parts.
  - **To fix:**
    - (D1, must-fix) M8: typing "10" or "11" a second time doesn't reach 10 PM / 11 PM — v1.109 (b). "6" and "9" work.
    - (D2) M2: "Keep …" slides about 54 px while the side-by-side pair works ("Delete permanently" → "Deleting…"). The mockup draws the slide, but v1.103 and §8 say the buttons never move while it works. The fix keeps the button's usual width, following the written rule.
    - (D3) M1: while it works, the screen-reader name hides "Keeping…".
    - (D7) M3: Tab leaves the open box. Copy the ⋯ menu's behaviour.
    - (D8) the parts page's own printed "paper" state prints on 2 pages.
  - **Kept as built:** (D5) M5's failure note also clears when that action later works — the "until fixed" rule, v1.004 / §8.
  - **Jeffrey's call (asked one at a time, after the proof-pictures question):**
    - (D4) M5's two-school screen-reader name "Download Worcester QR code" breaks WCAG 2.5.3 (the spoken name must contain the visible words in order). "Download QR code, Worcester" would fix it.
    - (D6) M4's school line and Balance line are weight 600, as drawn (copied from Black Belt's receipt), but §7 allows only 400 and 500.
- **2026-10-27 — fix round started:** the part-2 builder makes D1–D3, D7, D8 and the code review's R1, R2, N3, N4 and N5, then re-runs the whole proof.
- **2026-10-27 — fix round done** (the part-2 builder; checked by this session; not committed).
  - **Design fixes:**
    - (D1) The time list counts "typed again" from the row where the number started, so "10" twice → 10:00 PM, "12" twice and Finance's "11" twice work (`Select.jsx`, `times.js` `hourJump`).
    - (D2) While it works, the busy button keeps its usual width side by side, so "Keep …" doesn't move. At 320 the stacked pair is unchanged. A first try also widened the stacked pair and stuck out sideways at 320; the re-shoot caught it.
    - (D3) While the Compare dialog works, the pressed button has no separate screen-reader name, so "Keeping…" is heard.
    - (D7) A Tab that would leave the Mark paid box closes it and returns to the opener.
    - (D8) The parts page's print sample prints on 1 Letter page.
    - (D5) A comment ties the "Couldn't copy" note clearing to the "until fixed" rule.
  - **Code fixes:**
    - (R1) `Dialog`'s onTop mode takes an opt-in `returnFocusTo`, passed through the confirm box, the receipt dialog and the Compare dialog (which also takes `onTop`, default off). Dialogs without it are unchanged.
    - (R2) A failed `onConfirm` is logged.
    - (N3) An opt-in `autoFocus` on `ConfirmButtons`.
    - (N4) `HistoryLine` sorts by real time and drops a stray " · ".
    - (N5) `text.js`'s header is corrected.
  - **Proof:**
    - 212 parts pictures and the 8 side-by-side sheets re-shot.
    - `check-parts.mjs`: 37 of 37 pass, re-run by this session.
    - 19 of 19 check files pass; both builds pass; `dist/` holds no parts-page words.
    - App pictures, dev and built: 84 of 92 identical. The other 8 are the camp clock and Home's greeting, "Good afternoon" (before) vs "Good evening" (now). This session cropped both. Home's greeting changes with the time of day, as the before entry already said, and with the page clock set to the before time Home matches 4 of 4.
- **2026-10-27 — the two reviewers are re-checking their own items** (design: D1–D3, D7, D8 live on the parts page; code: R1, R2, N3–N5 and the new code from the design fixes).
- **2026-10-27 — design re-check: D1, D3, D7 and D8 OK; D2 only half done.**
  - **OK, with real key presses:**
    - the time list ("10" → AM, PM, AM; Finance's "11" → AM, PM, AM; "6", "66", "9", "o" → Off);
    - the Compare dialog's busy button is heard as "Keeping…";
    - Tab and Shift+Tab out of the Mark paid box return to the opener;
    - the print sample is 1 Letter page.
  - **D2, not yet:** when the busy words are SHORTER ("Delete permanently" → "Deleting…"), nothing moves at any size. When they're LONGER (Prospects' "Came" → "Saving…", plan §9), "Keep in Booked" still slides about 15 px, because the fix only sets a minimum width. At 320 that pair fits with about 3 px to spare; a longer busy word, such as "Withdraw" → "Withdrawing…", would stick out, because the stack decision still measures only the usual words.
  - **Next fix:** size the action button for the wider of its usual and busy words, at rest too, and use the same width for the stack decision. Such buttons get a few px wider at rest. Waiting for the code re-check first, so the file doesn't change under it.
- **2026-10-27 — code re-check: no bugs; 1 new risk and 1 small point.**
  - **Every fix does what it says.** R1 was tried with a click that doesn't focus the button, as Safari does; R2 logs once and clears busy.
  - **Today's dialogs are unchanged:** all 109 `<Dialog>`s were scanned, and only the new parts pass the new props. `Select` without `matcher` is Star's behaviour.
  - **The live build:** every CSS file is byte-identical to the last round, and the main JS grew about 120 bytes (Dialog's unused `returnFocusTo`). No text from the new parts and no trace of the parts page is in `dist/`.
  - **New risk:** inside a dialog, a Tab out of the Mark paid box lands on the dialog's first field, because the key travels on. It needs `stopPropagation()`, as Escape already has.
  - **Small point:** `HistoryLine` sorts with `Date.parse` but shows dates with `new Date()`, so a time given in milliseconds sorts last.
- **2026-10-27 — last small fix round started** (the builder): D2 (size for the wider of the usual and busy words), the Mark paid Tab-out `stopPropagation()`, and the HistoryLine sort, then the proof again.
- **2026-10-27 — last small fix round done** (checked by this session; not committed).
  - **The fixes:**
    - (D2) the "are you sure?" box's hidden sizer measures the action's usual AND busy words. The stack decision and the button's width use the wider, so nothing moves while it works, whichever words are longer. A button whose busy words are longer is that wide at rest too, e.g. "Came" as wide as "Saving…". The approved samples are unchanged.
    - (Tab) The Mark paid box's Tab-out calls `stopPropagation()`.
    - (Sort) A new `src/lib/historyDates.js` reads a row's date once, for both showing and sorting: school dates as local midnight, a missing one as no date (before, "Dec 31").
  - **The proof:**
    - Behaviour checks: 46 of 46 pass, re-run by this session. Before the fixes, the 9 new cases failed, which proves the checks catch them.
    - 19 of 19 check files pass; both builds pass; `dist/` holds no parts-page words.
    - App pictures, dev and built: 84 of 92 identical, re-checked by this session. The 8 others are the camp clock and Home's greeting.
    - Two picture-timing flukes were re-taken: a focus ring caught mid-fade, and the ⋯ menu's PC placement, which varies between takes and is in the before pictures too (plan §10).
- **2026-10-27 — last design check: all OK** (real key presses, live page).
  - "Came" → "Saving…" and "Withdraw" → "Withdrawing…": nothing moves at any size, and no button passes the row's edges at rest or while busy. At 320 "Came" fits side by side with 2.7 px to spare, and "Withdraw" is stacked both ways.
  - The approved M2 states are pixel-identical to the first round. The exception is the busy state at PC, tablet and phone, where the busy button holds its width (D2, as intended).
  - Only "nothing" changed: "Came" is about 15 px wider than its words at rest, a small deliberate difference from the approved picture.
  - The Mark paid box inside a dialog: Tab and Shift+Tab out return to that row's tag, and the dialog stays open.
- **2026-10-27 — last code check: ready.** No bugs and no risks.
  - **D2:** the button's width, the stack decision and changing words all hold up: no wrap and no overflow at any width, at rest or while busy.
  - **The other two fixes:** the Tab-out works inside a dialog, and the dates sort by real time.
  - **The live build:** it gained only the 98 characters of `.cfm-sizer-action` CSS (`main.css` 153,014 → 153,112 bytes); every other asset is byte-identical apart from the main file's name.
  - **One cosmetic point:** `.cfm-actions.is-stacked .btn` also matched the sizer's hidden copies, so when a stacked pair unstacked at rest (a tablet turned sideways, say) with longer busy words, the button was narrow for about 2 frames.
- **2026-10-27 — that last point fixed by this session.**
  - **The change:** `shared.css` now uses `.cfm-actions.is-stacked > .btn`, the real buttons only, with a comment saying why.
  - **Checked:**
    - the reviewer's own frame-by-frame test now goes straight from stacked to the held 81.4 px;
    - all 28 M2 pictures are identical to before;
    - `check-parts.mjs` 46 of 46, and 19 of 19 check files;
    - `npm run build` and `npm run build:preview-mode -- --outDir dist-preview` both pass;
    - the built `main.css` differs from the last build only in that one selector (" .btn" → ">.btn", same size), and `.cfm-actions` matches nothing the app draws, so the app pictures stand;
    - `dist/` has no parts-page words, and `git status` lists no `.env.local`, `node_modules`, `dist` or `dist-preview`.
- **2026-10-27 — step 1 is built and reviewed; not committed.** The 8 side-by-side pictures were sent to Jeffrey.
- **2026-10-27 — Jeffrey: proof pictures, option A** ("A — commit only the 8 side-by-side review pictures (9 MB); keep the rest on this PC only.").
  - `git merge main` first: already up to date. Recorded as rulebook **v1.110**: a 10b row above the v0.26 row, a changelog line, the header bumped. CRLF kept: 0 LF-only lines (1,314 lines).
  - The commit takes `Proof/parts/M1…M8-built-vs-mockup.png` only. `Proof/before`, `before-build`, `after`, `after-build`, the single state pictures in `Proof/parts/M#/` and the sheets' `.html` sources stay untracked on this PC.
- **2026-10-28 — Jeffrey: D4, option A** ("D4: A — “Download QR code, Worcester”; nothing changes on screen.", sent 2026-10-27 at 11:56 PM).
  - **The change:** `downloadSchoolQr` in `src/components/text.js` now gives "Download QR code, Worcester": the button's own words, then the school. The parts page's "a failure" sample presses that button by its name, so `src/parts/M5.jsx` uses the new one. Comments in `RegistrationLinkBox.jsx` and the plan's M5 notes updated. With one school the button still has no hidden name.
  - **New checks:** `src/lib/shared/checks.mjs` group 21 (the words, starting with "Download QR code"); `check-parts.mjs` two checks on the live page (two schools: "Download QR code, Worcester" / "Download QR code, Shrewsbury"; one school: no hidden name).
  - **`git merge main` first.** Main had moved: camps' 0027 merge, rulebook v0.720 and CLAUDE.md's 0027 note. Git won't merge into a file with uncommitted changes, so:
    - this branch's v1.110 rulebook was saved to the scratchpad and the committed version put back;
    - `git merge main` hit a conflict in the rulebook only: both sides had added a 10b row and a changelog line at the same places;
    - resolved by keeping both (main's v0.720 lines first, then this branch's v1.100+; this branch's Version line), and committed as **524bd6b**;
    - v1.110 was put back with the same script and checked against the saved copy: only main's 2 lines differ.
  - Recorded as rulebook **v1.111**: a 10b row, a pointer at the start of the v1.106 row, a changelog line, the header. CRLF kept: 0 LF-only lines (1,318 lines).
  - **Proof:**
    - shared checks: 21 groups pass;
    - `check-parts.mjs`: 48 of 48 (the 46 plus the 2 new);
    - 19 of 19 check files pass, including camps' updated checks from the merge;
    - both builds pass, and `dist/` has no parts-page words;
    - M5 re-shot: all 26 pictures are identical to `Proof/parts/M5`;
    - the M5 side-by-side sheet doesn't change, since its rows show only each state's bold words.
  - The app pictures (`Proof/before` / `after`) were taken before this merge. They still prove step 1 changes nothing on screen, because both sides were on ec733b7. A new comparison would need new "before" pictures from today's `main`.
- **2026-10-28 — D6 asked** with `Questions/D6-receipt-weights.png` (source `.src.html`, self-contained `.html`).
  - **Measured on this PC first** (Windows 11, Chrome, the app's font list):
    - Segoe UI has no medium style, so Chrome draws 500 with its semibold, the same as 600: same width and ink, in both the classic and the "Variable" Segoe UI.
    - The shared receipt at 500 is pixel-identical to 600: the printed page, the box on screen, and both lines cut out.
    - Apple's font has a real medium, so there 500 is a shade lighter. Chrome here ignores exact weight settings for this system font (`font-variation-settings`), so that difference isn't pictured. Firefox wasn't measured.
  - **Options:** A (recommended) — 500, as §7 says: no exception, and nothing changes in Chrome on the school PCs; on Apple devices the two lines match the receipt's other dark words (its details and table headings are 500). B — 600 as drawn, with an exception written into §7.
  - **Found on the way:** weight 600 is used 33 more times in 10 style files; noted in plan §10 for a later question.
- **2026-10-28 — Jeffrey: D6, option A** ("A: 500 (§7)").
  - **The change:** in `src/styles/shared.css`, `.rcpt-title` and `.rcpt-totals > .rcpt-balance` are weight 500, each with a comment saying why. No comment or check anywhere named the old weight.
  - **`git merge main` first.** Main had moved again: Finance's F8 merge (migration 0026, rulebook v0.814–v0.816) and two CLAUDE.md notes about 0026; it went from 402341a to 6d140e4 while this was being checked, and the merge took 6d140e4. Main's changes met this branch's uncommitted work in 2 files, so:
    - this branch's rulebook (v1.110, v1.111) and `src/App.jsx` were saved to the scratchpad and their committed versions put back;
    - `git merge main` hit a conflict in the rulebook only (both sides add rows at the same places); `App.jsx` merged by itself (Finance's new Black Belt link is far from this branch's change);
    - resolved by keeping both, main's lines first (v0.814 and v0.815 after v1.034, v0.816 after v0.720) and this branch's Version line; committed as **6626920** after checking it holds exactly main's 44 files;
    - put back on top: `App.jsx` by a three-way merge (0 conflicts; only this branch's 2 lines differ from main's), v1.110 and v1.111 by the same script; the rulebook matches the saved copy apart from main's 6 new lines.
    - Main's new Black Belt code still imports `usePaymentsHidden` from Finance's old file, which main already points at `src/lib/privateDetails.js`, so nothing breaks.
  - Recorded as rulebook **v1.112**: a 10b row, a pointer at the start of the v1.105 row, a changelog line, the header. CRLF kept: 0 LF-only lines (1,326 lines).
  - **Proof:**
    - 19 of 19 check files pass, including Finance's new checks from the merge; shared checks: 21 groups pass;
    - `check-parts.mjs`: 48 of 48;
    - both builds pass, the build has no parts-page words, and `git status` lists no `.env.local`, `node_modules`, `dist` or `dist-preview`;
    - M4 re-shot: all 24 pictures are identical to `Proof/parts/M4` (Chrome on Windows draws 500 like 600), so the M4 side-by-side sheet stands;
    - the whole app against today's `main`, both as real preview-mode builds made from clean copies (no `.env.local`; scratch script `app-proof.sh`): **88 of 92 pictures identical**. The other 4 are the Camps page's "Updated …" clock (the two runs were minutes apart). So step 1 still changes nothing on screen with Finance's new screens in.
  - **The first comparison runs didn't count:**
    - the first stopped because the copies lacked the Black Belt fake-data file that `mockClient.js` imports from `docs/`;
    - the second used `localhost:5191`, which reached another session's Vite dev server holding the same port on IPv6 (`localhost` tries IPv6 first, and `serve-static.mjs` listens on IPv4 only), so its "before" pictures were dev-mode pictures of other code;
    - the third used `127.0.0.1`. `serve-static.mjs` now prints that address and says why.
    - The 2026-10-27 proof was taken from real builds (its build pictures show Forms' gray Live tag), so it stands.
  - **Found on the way:** in real builds, `main`'s too, the Forms list's Live tag is gray instead of green (`.ftag--live` loses to `.ttag`, which loads later). Added to plan §10 for the Forms owner.
- **2026-10-28 — Jeffrey: commit step 1** ("Yes, commit"). Committed on `dashboard-core`: 83 files.
  - What's in it: the code, the parts page, the tools, the plan and this file, the D4 and D6 questions, the 8 side-by-side proof sheets and the rulebook (v1.110–v1.112). The other proof pictures stay untracked on this PC (v1.110).
  - Not pushed. Main had 3 more commits, all CLAUDE.md migration reservations; nothing to merge for them first.
- **2026-10-28 — three facts corrected** (found by the Design Review session while writing the section prompts; passed on by Jeffrey). Each was checked against the code here first:
  - **Star's Dan-change box takes the candidate dialog's place** while open (`src/screens/testing/star/candidates/CandidatesTab.jsx` draws `overlayElement ?? dialogElement`), so Star has no one-Back-closes-both bug. Black Belt's takes the dialog's place too (its `Dialogs` shows one child or the detail). Prospects' phone Delete really does open on top of the full-screen panel `Dialog` (checked in `Prospects.jsx`), so the "on top" mode still serves it and Black Belt's 8 `InnerDialog` boxes. Fixed in plan §2b, §8's InnerDialog row, §9 row 14, §10, the M2 notes and row v1.100.
  - **Star's `star_record_payment` (0006) already takes the way to pay** (`p_method text`). Only Color Belt's `testing_mark_paid` (0005) and `testing_private_mark_paid` (0014) and Camps' `camp_mark_paid` (0013) lack it; no later migration replaces them. Fixed in plan M3 "Later" and row v1.104.
  - **The plan's M5 and M7 props were older than the built parts:** `links` takes `{ url, school?, heading?, shortUrl?, flyer? }` (no `copyLabel`; Copy's words come from the shared words), and `describe` returns `{ text, at, who }`. Fixed in plan M5 and M7.
  - **`git merge main` first**, twice, because main moved during the work: **93fca25** (the Design Review's section prompts, CLAUDE.md) and **eff1fe4** (CLAUDE.md: 0029 live). No conflicts.
  - Recorded as rulebook **v1.113**, a housekeeping change like v0.31 and v0.304: the two rows corrected in place (each marked "corrected v1.113"), a changelog line and the header. No new 10b row, since nothing new is decided. CRLF kept: 0 LF-only lines (1,327 lines); no changelog number used twice.
  - No code, mockup or question page stated these facts, so nothing else changes. No checks to re-run: only docs changed.
- **2026-10-28 — step 1 is on `main`: 95a9601.** The Main session merged `dashboard-core` with `--no-ff` (no conflicts, not pushed) and added `src/styles/shared.css` and `src/components/text.js` to CLAUDE.md's shared-files list (4c15146).
  - Main's checks: both builds pass, the live bundle has no fake-database or parts-page code, run-checks 19 of 19, database function tests 172 passed and 0 failed.
  - Checked here: 95a9601's parents are ca02305 and fc3bea6, and its files are exactly this branch's. This branch then moved forward to `main` (4c15146) with `git merge --ff-only main`: no new commit.
- **2026-10-28 — Finance → Dashboard core: the date picker opened from a button** (Jeffrey's message; Finance's v0.817 on branch `finance`; design review F1 / v1.018). Plan §11.
  - **Asked:** a new option in the shared `src/components/DatePicker.jsx`: the calendar opens from the section's own button, with no field.
    - The same calendar, with `max`, `today` and the hint "Days after today can't be chosen.".
    - A pick calls `onChange` and closes; Esc or a click outside closes, with focus back on the button; the keyboard as today.
    - Phones: in the page under the row.
    - For Finance's Daily report day row; Prospects' follow-up date may use it too (check with the Prospects session). Export's From / To keep the field.
  - **Built (not committed):** `opener` + `open` / `onOpenChange`, and `datePickerOpener()` for the button.
    - The builder's choice: after a click outside, focus goes back to the button unless the click put it on another control.
    - The field mode is unchanged.
  - **Parts page `DP`:** `src/parts/DP.jsx` (registered in `PartsPage.jsx`, styles in `parts.css`).
    - `shoot-parts.mjs` takes DP's states from the page and crops the floating calendar.
    - `check-parts.mjs` gained 23 DP checks (16, then 7 for the review's cases), and its key helper gained ← →, Page Up / Down and Alt; four check-only states (`panel-in-box`, `panel-low`, `row-disabled`, `row-autoclose`).
  - **Proof so far:**
    - `check-parts.mjs` 71 of 71 (the 48 and 23 new);
    - the check files 19 of 19. Two runs showed 1 failure: `src/forms/checks.mjs` reads `dist/` and fails when that holds a preview-mode build (`npm run build:preview-mode` writes there too); after a real build it passes. Confirmed both ways; the runs had come right after a preview-mode build. Noted in `run-checks.mjs`'s header: run the real build last;
    - both builds pass with no parts-page words;
    - DP pictured at the four sizes, and the side-by-side `Proof/parts/DP-built-vs-F1.png`;
    - M1–M8 re-shot after the tool and `parts.css` changes: every picture matches `Proof/parts`;
    - a real mouse click opens with no keyboard ring on the day, and the keyboard shows it (the ring in the pictures comes from the script's press).
  - **Design and code review** (a separate reviewer agent, 2026-10-28; it reproduced each problem on the running preview):
    - must-fix: on phones, after ‹ › the calendar opened with focus on the old day, and across a month the focus was lost (Esc and the arrow keys then did nothing). The calendar's first drawing still showed the old month;
    - should-fix: opened above its button, a month with a 6th week grew over the button (Star's fields have it too);
    - should-fix: "focus back on the button" after a click outside failed on touch and inside a box that can take the focus (the shared Dialog's box);
    - minor: a disabled picker scrolled the phone page; the help text promised more than the code did.
    - **All fixed:** the opening starts while drawing (React's "adjusting state while rendering"); the box is placed again whenever its size changes (a ResizeObserver; Star's fields get it too); after a click or tap outside, the target decides (another control keeps the focus, anywhere else the button gets it back once the click is over); focus goes back to the button whenever the calendar closes with the focus lost; a disabled picker never draws (and `datePickerOpener` takes `{ disabled }`); Esc on the button closes it; the help text rewritten.
    - The review also confirmed: the field mode unchanged line by line, Esc one step at a time inside a real Dialog, no React warnings, the placement and look as F1.
    - For Jeffrey: while open, the calendar button has the app's gray "pressed" look (the ⋯ menus' rule), which F1 doesn't draw.
    - **Re-check by the same reviewer:** every finding fixed (its probes re-run, also under React's StrictMode); no new problem (no leaking refocus listener, no ResizeObserver loop). Its one leftover is fixed too: a box above its button covered it for 1–2 frames when a 6th week appeared. The box is now placed again before the screen is drawn when the month changes; its frame-by-frame probe measures a 4px gap on every frame, in both modes.
    - **Final:** `check-parts.mjs` 71 of 71, the check files 19 of 19 (the real build last), both builds pass, no parts-page words. The DP pictures and `DP-built-vs-F1.png` were taken after the review's fixes (the last change only moves a box when the month changes, which no picture shows).
  - **The Prospects check:** the message to the Prospects session was held there and expired undelivered (the two sessions run in different permission modes). Jeffrey has the text to paste.
- **2026-10-28 — Jeffrey: the date picker option is OK** ("OK: record and commit").
  - `git merge main` first: a fast-forward to a3ff7ca (New students' N17 merge with rulebook v0.616, and CLAUDE.md notes; nothing overlaps this work).
  - Recorded as rulebook **v1.114**: a 10b row above the v0.26 row, a pointer at the start of the v1.018 row, a changelog line, the header. CRLF kept: 0 LF-only lines (1,331 lines); no changelog number used twice.
  - Committed on `dashboard-core` (the hash is in `git log`): the picker, the parts page's DP sample, the tools, the plan and this file, the rulebook, and the side-by-side `Proof/parts/DP-built-vs-F1.png`. The single DP pictures and the sheet's `.html` stay on this PC (v1.110). Not pushed.
- **2026-10-28 — Star's request, passed on by the Main session: a two-line note in the shared count cards.**
  - Star's Candidates card on Both shows "Shrewsbury 5" / "Worcester 8" on two lines; the shared `CountCards.jsx` drew only one line under the number.
  - Jeffrey decided it in Star's Part 2 questions: **Q5 B**, keep the two lines; **Q5b A**, Dashboard core makes the change. Picture: Star's `docs/Testing/Star Testing/DR2 images/StarDR2-Q5.png` (since committed on `star-testing`). Star recorded it in its rulebook row **v0.518** (committed on `star-testing` as 6d47c29, not on `main` yet). That row says Dashboard core records the two lines in its own row, which changes v1.107's "one small line".
  - It wasn't in this branch's rows or plans, so asked first. Jeffrey: **"Yes, build it"**.
  - **Built (not committed):**
    - a card's `note` may be an array of two lines, each its own small gray line under the one before, as Star draws them today (same tags and styles, so the same look);
    - the parts page's M6 gained two extra states: `twolines` (Star's four on Both) and `twolines-hidden` (Hide private details on: the one card);
    - `check-parts.mjs` gained 6 checks: the lines stack at the four sizes, the cards beside it are as tall, a screen reader hears "Candidates 13 Shrewsbury 5 Worcester 8", Camps' one-line note is unchanged.
  - **Proof so far:**
    - `check-parts.mjs` 77 of 77, the check files 19 of 19 (the real build last), both builds pass;
    - M6's 24 step-1 pictures are byte-identical after the change;
    - the side-by-side `Proof/parts/M6-two-lines-vs-Q5.png`: Star's Q5 option B next to the built card at the four sizes.
  - **Design and code review** (a separate reviewer agent, 2026-10-28): **approve**, nothing that must be fixed.
    - Should-fix, done: this log called Star's plan uncommitted, but Star had meanwhile committed v0.518. The v1.115 row must cite v0.518 and say it changes v1.107; the draft does, and it waits for Jeffrey's OK.
    - Minor 1: screen readers hear the card's parts separated by spaces only, so "13 Shrewsbury" can run together. Star's screen does the same today. A hidden pause would change every count card, so it is left to Jeffrey.
    - Minor 2, done: the comment now says a blank note (0 and false too) draws nothing, and that the rulebook allows two lines.
    - Minor 3, done: the sheet now says why the cards are a little wider than in Q5 (the parts page has no side rail) and that each line is 18 px tall.
    - Minor 4, done: two more checks, Hide private details' one card (PC and phone), and Camps' note measured as one line on screen.
    - The reviewer also confirmed:
      - a selected filter card with two lines: the blue edge, and the lines stay inside;
      - the edge cases: blank values draw nothing, one or two lines draw as given;
      - no console warnings, and no other caller or look changes.
  - **Final:**
    - `check-parts.mjs` 79 of 79;
    - the check files 19 of 19 (the real build last);
    - both builds pass;
    - `git diff --check` clean;
    - the sheet remade.
  - Next: Jeffrey's OK, then rulebook **v1.115** and a commit; then a note to Main. Main merges on Jeffrey's go and tells Star.
- **2026-10-28 — Jeffrey: the two-line note is OK** ("OK: record and commit"). Minor 1 (the screen readers' pause) stays as it is.
  - `git merge main` first. Main had moved on to 50022cf: New students' merge (N1, N2, Undone, class ages and classes taught together, migration 0031, rulebook v0.617–v0.620) and CLAUDE.md notes. Merge commit **bd3847e**.
    - The rulebook conflicted only where both sides had added lines at the same spot: the header's Version line (kept this branch's 1.114), the 10b rows above the v0.26 row, and the end of the changelog (kept both, main's first).
    - Checked: the merged rulebook is main's plus exactly this branch's v1.114 changes. Nothing else overlapped, and Star's branch doesn't touch the count-card files.
  - Recorded as rulebook **v1.115**:
    - a 10b row above the v0.26 row (it cites Star's picture by its full path);
    - a pointer at the start of the v1.107 row;
    - a §8 line under Black Belt's phones line;
    - a changelog line and the header.
    - CRLF kept: 0 LF-only lines (1,342 lines); no changelog number used twice.
  - Plan §12 written.
  - **Re-checked after the merge:**
    - both builds pass, with no parts-page words in `dist/` or `dist-preview/`;
    - the check files 19 of 19 (the real build last);
    - `check-parts.mjs` 79 of 79.
  - Committed on `dashboard-core` (the hash is in `git log`): the count cards, the parts page's M6 samples, the checks, the plan and this file, the rulebook, and the side-by-side `Proof/parts/M6-two-lines-vs-Q5.png`. The single M6 pictures stay on this PC (v1.110). Not pushed.

## 4. Next

1. **Jeffrey, one at a time:**
   - ~~which proof pictures go into the commit~~ — **decided: A, v1.110**;
   - ~~D4 (M5's two-school download name, WCAG 2.5.3)~~ — **decided: A, v1.111**;
   - ~~D6 (M4's 600 weights vs §7)~~ — **decided: A, 500, v1.112**.
   Every design review point is now settled.
2. ~~**Commit on `dashboard-core`**~~ — **done 2026-10-28**, not pushed. Shared files touched: `src/App.jsx`, and the rulebook (v1.110, v1.111, v1.112; v1.100–v1.109 were in 712e3a6). The merge commits 524bd6b and 6626920 hold only main's work.
3. ~~**Commit the fact fixes** (v1.113)~~ — **done 2026-10-28**, not pushed.
4. ~~**Merge `dashboard-core` into `main`**~~ — **done 2026-10-28: 95a9601** (the Main session, `--no-ff`, no conflicts, not pushed). The request was sent on Jeffrey's "Send it to Main"; it queued without reaching Main until Jeffrey pointed Main to it. CLAUDE.md's shared-files list gained `src/styles/shared.css` and `src/components/text.js` (4c15146, code review N6).
5. **The date picker opener option** (§11, Finance's v0.817): ~~Jeffrey reviews `Proof/parts/DP-built-vs-F1.png`~~ **OK'd 2026-10-28** ("OK: record and commit"), rulebook **v1.114**, committed on `dashboard-core` (not pushed). Next: the merge into `main` through the Main session; once it is on `main`, a note to the Finance session ("Daily report finance tab") and to the Star session (its date fields get the re-placement fix).
6. **The count cards' two-line note** (Star's v0.518: Q5 B / Q5b A, passed on by Main; Jeffrey: "Yes, build it"): built and reviewed (approve), 79 of 79 checks; **OK'd 2026-10-28** ("OK: record and commit"), rulebook **v1.115** (§12), committed on `dashboard-core` (not pushed), then a note to Main that it is committed and reviewed. Next: the merge into `main` through the Main session, on Jeffrey's go (with item 5); Main then tells Star, and Star's switch to the shared card is Star's own work.
7. **Step 2 — the dashboard's own screens** (`docs/Design Review/End review/Prompts/2-DashboardCore-step2-main-screens.md`): the top bar, Home, the account dialogs and menu, Staff accounts and Settings (design review M12–M14, M17; M15 with Color Belt; M16 later). Waits on: Jeffrey pasting its starter here. `git merge main` first; rulebook rows take the next free number in 1.100–1.199.
