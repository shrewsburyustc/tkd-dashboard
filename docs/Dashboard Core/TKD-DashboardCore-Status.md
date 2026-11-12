# Dashboard core — status

**Updated:** 2026-11-05 (Dashboard core worktree session, branch `dashboard-core`)
**Privacy fix (2026-11-08, branch `dashboard-core-privacy`, rulebook v1.134):** turning Hide private details ON now removes a busy "Undoing…" toast (`drop()`; the Undo carries on) and the left Undo bar shows only the section's name. One shared hook (`useDropWhenPrivateHidden` in `lib/toastLine.js`) used by `App.jsx` covers every section. Its own small head, pushed before the other follow-ups. Still open after it: `.back-link` align-self, the PageBar vs left-bar overlap decision, R2-04, the unavailable Select option (R3-12).
**R1-07 second part DECIDED (2026-11-08, Jeffrey: "C"; rulebook v1.135, branch `dashboard-core`):** payment line = Star's base + extras in the order date, for what, school, by who; History = Star's words in all four (only Camps changes); Paying by "Card (chosen on the form / at the desk)" in all four. To build: the shared words in `src/components/text.js` (with the next shared batch); each section then switches in its own batch.

**Follow-up head (2026-11-08, branch `dashboard-core`, rulebook v1.133, v1.135, v1.136):** main 58bd16a1 merged (privacy fix v1.134 live). Built: the shared `.back-link` has `align-self: flex-start` (Camps' and Color Belt's local rules removed); one written rule that every bar sits above the page and pushes it down (v1.136); R1-07 option C decided (v1.135). **Not in this head, own batch with a picture first:** R2-04 (toast room, full-screen detail pages) and R3-12 (Select's unavailable state). Two browser checks were updated because main's Camps batch (v0.750, C19) made them stale: Camps is on the save line now, and its own refresh note above the view is gone.

**Retry wording (2026-11-08, Jeffrey: "A for both"; rulebook v1.137, on the follow-up head):** Dashboard core's own failure sentences (sample dialogs M1/M2, sign-in, lock screen, PIN screens, Change password, Settings, Staff accounts' connection line) say "Check the connection, then retry.". QR_FAILED and the lines that name no connection stay.

**R2-04 and R3-12 built (2026-11-08, rulebook v1.138, branch `dashboard-core`):** the toast's own room (page area and ⋯ sheet end above it; `Toast.jsx` sets `--toast-room` and `--toast-room-window`; Black Belt's sheet rule removed) and the Select's `unavailable` state. One question open for Jeffrey: a fixed bottom button bar on a phone detail (room or lift; picture `Questions/R204-toast-on-full-screen-detail`). Next: his answer, then Star's Dan and Stars use `unavailable` (Star's batch) and New students drop their U-06 padding patch.

**R2-04 settled (2026-11-08, Jeffrey: "B for fixed bars"; rulebook v1.139):** a fixed bottom bar keeps its place and the toast lifts above it (Black Belt already does); everything that scrolls ends above the toast (built, v1.138). Nothing more to build for R2-04.

**Toast room on full-screen pages (2026-11-08, rulebook v1.140):** found by New students after v1.138 went live (the prospect profile's last button under the toast). Fixed in the shared toast: a full-screen page's body ends above it, a pinned bar keeps its place and the toast lifts above it (Black Belt's own lift rule removed). `check-toastroom.mjs` covers both.

**Last pass 2 batch (2026-11-10, rulebook v1.141, branch `dashboard-core`):** tick rows in RowMenu (N16), shared payment-line/History/Paying by words, straight apostrophes, L-05, one hidden gray, one NoIcon, DeleteDialog deleted, one deviceLocation prop, locked ChoiceGroup aria-disabled; toast room on full-screen pages (v1.140) is in the same head. Not built: Select group heading / Notice 12px, Mark paid / Retry 36px on phones, Date signed 13px vs Signature 12px (not clearly decided). Step 2 (M13, M14, M17, M15, M16) still waits on Jeffrey.

**Step 2 built (2026-11-10, rulebook v1.143, branch `dashboard-core`):** M13 Both schools on Home, M14 unsaved-changes guard on Change PIN / Change password (a click outside closes a clean dialog), M17 Staff accounts desk-only while private details are hidden; M15 was Color Belt's CB14; M16 and the Grandmaster side-panel toggle stay later. Security review: no High or Medium (two Lows noted in the row). `check-account.mjs` (7 checks).

**M16 people search built (2026-11-11, rulebook v1.144 decided, v1.145 built; migration 0049, branch `dashboard-core`):** the top-bar search with its database reader, phone page and hand-overs into Color Belt, Star, Black Belt, Camps and New students. Separate security review: no High or Medium (three accepted Lows in the v1.145 row); design review done at four sizes. **Waits on Jeffrey:** paste migration 0049 (after the security review he has, and his OK); the app part merges only after it is live. In the preview the people are made up, so a tap finds no real person; the end-to-end Camps check proves the real path.

**Rulebook at this update:** **1.122** on `main` 7511656 and on this branch. That's R4-07, merged by the Main session, pushed and **live** (2026-11-05). Dashboard core rows: **v1.100** (Q1), **v1.101** (Q2), **v1.102** (M1), **v1.103** (M2), **v1.104** (M3), **v1.105** (M4), **v1.106** (M5), **v1.107** (M6), **v1.108** (M7), **v1.109** (M8), **v1.110** (proof pictures in git), all 2026-10-27; **v1.111** (D4), **v1.112** (D6), **v1.113** (housekeeping: rows v1.100 and v1.104 corrected), **v1.114** (the date picker opened from a button) and **v1.115** (a count card's note of two lines), all 2026-10-28; **v1.116** (the dropdown and time list turned off, Finance's v0.823) and **v1.117** (Show all inside its gray line on touch, option (a)), both 2026-10-29; **v1.118** (each person's panel size: Standard, Large or Largest), 2026-11-03; **v1.119** (Show all's keyboard focus), **v1.120** (turned-off icon buttons, option A), **v1.121** (the success colors as shared settings) and **v1.122** (R4-07: the gray "Payment history is hidden" line in every history while hidden), all 2026-11-04 — block **1.100–1.199**, next free **1.123** (`git merge main` before any rulebook edit).
**Branch:** `dashboard-core`, started from `main` ffcdc92; `main` merged in up to ec733b7 (2026-10-27, fast-forward), then up to ddfc848 (2026-10-28, merge commit **524bd6b**: camps' 0027 and rulebook v0.720), then up to 6d140e4 (2026-10-28, merge commit **6626920**: Finance's F8 with migration 0026, rulebook v0.814–v0.816 and CLAUDE.md's 0026 notes), then up to ca02305 (2026-10-28, merge commits **93fca25** and **eff1fe4**: CLAUDE.md notes and the Design Review's six section prompts; no conflicts). Committed: **712e3a6** — the approved docs (2026-10-27); **2a9b8bc** — step 1: the shared parts, the parts page, the tools, the proof sheets and rulebook v1.110–v1.112 (2026-10-28); **fc3bea6** — the fact fixes (v1.113). **Merged into `main` as 95a9601** (2026-10-28, the Main session); this branch then moved forward to `main` 4c15146, and later to a3ff7ca (both fast-forwards; the second brought New students' N17 merge, rulebook v0.616). Then the date picker opener option (v1.114, committed as 1bb2683); `main` merged in up to 50022cf (2026-10-28, merge commit **bd3847e**: New students' N1, N2, Undone, class ages and classes taught together, with migration 0031 and rulebook v0.617–v0.620; the rulebook's three same-spot conflicts kept both sides, main's first); then the count cards' two-line note (v1.115, committed as 5628133). Both **merged into `main` as a287ee5** (2026-10-28, the Main session, no conflicts); this branch then moved forward to it, and later to c975428 (both fast-forwards; the second brought Star's merge, with Star's count cards on the shared part). The Main session pushed `main` c975428 on 2026-10-28, so all of this branch's work is live; `dashboard-core` itself is never pushed. On 2026-10-29 this branch moved forward to `main` 3fdbc0b (a fast-forward: New students' N4–N6 with rulebook v0.621–v0.623, and CLAUDE.md's 0030 notes); then the turned-off dropdown and time list (v1.116) was committed as cc92332, merged into `main` as e3e46d4 (the Main session; pushed and live 2026-10-29), and this branch moved forward to it (fast-forward). Later the same day it moved forward to `main` 5f28ed9 (a fast-forward: Finance's design review F1–F7 with migration 0029's files and rulebook v0.817–v0.823, and CLAUDE.md's 0029 and 0032 notes; none of it touches this branch's files), and Show all on touch (v1.117) was committed as 2bf89c6. On 2026-11-03 Main merged it into `main` as 7b665af; this branch moved forward to it, then to 1e6561d and 5f1db41 (all fast-forwards bringing other sections' work; see the log). Then Panel size (v1.118) was committed as 2baea38, and `main` was merged in up to e7fd75b (2026-11-03, merge commit **723c302**: Camps C10 and New students N10, N13, N14; the rulebook's three same-spot conflicts kept both sides, main's first). Both **merged into `main` as 942cfdd** (2026-11-04, the Main session; the same three conflicts, main's v0.627 and v0.972 kept first; pushed and live the same day), and this branch moved forward to it (fast-forward). Later the same day it moved forward through `main` 5087732, 301e7f1 and 9b562b3 (fast-forwards), and the shared-file cleanup (v1.119–v1.121) was committed as 2b859b4. That was **merged into `main` as 801b757** (2026-11-04, the Main session, after Color Belt's merge 84a6e7d; pushed and live the same day), and this branch moved forward to it. It then moved forward to `main` 392bc9e (see the log), and R4-07 (v1.122) was committed on top of it as **23d618d** on 2026-11-05. Then `main` was merged in up to 3a8dc70 (merge commit **a78ea18**, 2026-11-05: New students' N3 and profile work with migration 0036, Camps' v0.738; the rulebook's three same-spot conflicts kept both sides, main's first). Both were **merged into `main` as 7511656** (2026-11-05, the Main session; pushed and live the same day), and this branch moved forward to it (fast-forward).

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
  - The note to Main was held by Main's session and expired undelivered (the two sessions run in different permission modes). Jeffrey passed it on himself.
- **2026-10-28 — the date picker opener and the two-line note merged into `main` as a287ee5** (the Main session; no conflicts; not pushed).
  - Main reported: both builds pass, no preview code in `dist`, the check files 19 of 19, the Functions tests 173 of 173.
  - Checked here: `main` holds 1bb2683 and 5628133, and its files are the same as this branch's. This branch moved forward to a287ee5 (fast-forward, no new commit).
  - Notes for Finance (how to use the opener, with `DP.jsx`'s stand-in of its day row) and Star (how to pass two lines; its date fields' re-placement fix) were held by both sessions and not delivered (different permission modes). Jeffrey has both texts to paste.
- **2026-10-28 — live:** the Main session pushed `main` c975428 (a287ee5 plus Star's merge) and reported that the Cloudflare deploy succeeded. Checked here: GitHub's `main` (`origin/main`) is c975428 and holds 95a9601, 1bb2683 and 5628133.
- **2026-10-28 — Star's design reviewer, passed on by Main (a SHOULD for the shared part): "Show all" on touch screens.**
  - On touch, the shared cards' "Showing not paid only · Show all" has a gap after the dot, and its line is taller than Star's own "… · Show both schools" just under it (Star's `st-inline-link`).
  - The cause: `app.css` gives every touch link button a visible 44 px box with 8 px of side padding. Star's inline links keep the line's height and get their 44 px tap area from an invisible box (§2.5's "invisible padding").
  - The approved M6 mockup draws today's look, so a fix changes v1.107's picture on touch: asked Jeffrey first.
  - `main` merged in up to c975428 first: a fast-forward, bringing Star's merge with Star's count cards on the shared part (b2ec07f).
  - Measured on Star's Candidates tab (preview, fake data), with the fix put on the page from outside (nothing in the files changed):
    - on touch, the line 44 → 20 px tall and the gap after the dot 12 → 4 px, the same as Star's line;
    - Show all's tap area 64×44 → 56×44, with no overlap with Show both schools' tap area;
    - PC unchanged.
  - Picture: `Questions/M6-show-all-on-touch.png`.
  - Seen on the way (not this part's code):
    - Color Belt's own line (`EventPage.jsx`) has the same gap, until it switches to the shared cards;
    - Star's "Show both schools" tap area measures 118×39: what sits under it covers the bottom of its invisible box.
- **2026-10-29 — Jeffrey: A, "make it inline".**
  - **Built (not committed):**
    - `CountCards.jsx`: Show all gets the class `inline-link`;
    - `shared.css` (M6 section): `.inline-link`, copied from Star's `.st-inline-link`. On touch it drops app.css's 44 px box and side padding, and adds an invisible box 12 px above and below the words and 4 px at the sides (a 20 px line + 24 = a 44 px tap height);
    - `check-parts.mjs`: 4 checks. At 1280 they record the line's height and the gap after the dot; at the three touch sizes they require the same height and gap as on PC and a tap area of at least 44×44, found as a finger would.
  - **Proof:**
    - `check-parts.mjs` 83 of 83;
    - the new checks fail on the old look (390 touch with the class removed: a 44 px line, 12 px after the dot);
    - Star's screen with the built code is pixel-identical to the right column of the approved picture, at all four sizes;
    - of M6's pictures, only `filtered` at tablet, phone and 320 changed (24 px shorter); the other 21 are byte-identical;
    - both builds pass, with no parts-page words; the check files 19 of 19; `git diff --check` clean.
  - Rulebook **v1.116** drafted, not applied. The header shows Star's 0.518 since Star's merge, so the row script takes the header's number separately.
  - **Review** (a separate reviewer agent): **changes needed**. Checked again here with my own measurements; all of it holds.
    - On touch, Show all's invisible box is taller than the room around its line: 8 px above + the 19.5 px line + 8 px below = 35.5 px.
    - It reaches 4.5 px into the card above: a real touch on the bottom edge of "Not paid" cleared the filter.
    - On Star's default Both view, the Dan switch under the line leaves Show all 39.5 px tall.
    - The box is 43.5 px, not 44 (a 19.5 px line + 24).
    - The 4 new checks couldn't see it: the finger scan only finds what covers Show all, and the parts page has no control under the line.
  - **To fix whatever Jeffrey picks** (the review's smaller points):
    - `position: relative` on `.inline-link` itself;
    - drop `display: inline`, which does nothing on a button;
    - the checks wait for the line instead of a fixed 500 ms;
    - the checks gain a "takes no taps from another control" test and the exact box height;
    - M6's filtered sample gets a real control under the line.
  - **Question to Jeffrey,** with `Questions/M6-show-all-tap-area.png` (Star's tab, each option put on the page, tap areas drawn):
    - (a) room for the box: on touch, a line holding the shared link gets no −4 px top margin and 24 px under it, and the box is exactly 44 px. It takes no taps; things below sit 16 px lower than in the approved picture. **Recommended.**
    - (b) a tall line with no gap: app.css's 44 px box stays, only the side padding goes. Things below sit 25 px lower.
    - (c) as approved, plus a named exception in §2.5.
  - For later, not this part's code: Star's own "Show both schools" has the same flaw (118×39). When Color Belt moves to the shared cards, check what sits under its line (its class switch has the same 5 px boxes).
- **2026-10-29 — Finance → Dashboard core: a turned-off ("disabled") state for the shared dropdown and time list** (Jeffrey's message; Finance's v0.823, "C, via Dashboard core"; picture `docs/Finance/images/Finance-DR-F2-Settings-Off.png` on branch `finance`, option C). Plan §13.
  - **Set aside first:** the unfinished Show all work (5 files) went into a `git stash` entry (plus a copy in the scratchpad), so this commit holds only the turned-off state; it goes back after the commit. Then `main` 3fdbc0b came in as a fast-forward (New students' N4–N6, rulebook v0.621–v0.623).
  - **Built:**
    - `Select.jsx`, the `disabled` prop (default false): tabIndex -1, no `data-autofocus`, `aria-disabled="true"`; its `mousedown` is cancelled, so a click or tap doesn't focus it; no click, tap or key opens it; a list that is open when it is turned off closes before the screen is painted; `aria-readonly` is left off when both are on;
    - `TimeList.jsx` passes it on;
    - `shared.css`: `.fa-field.is-disabled` next to `.is-readonly`, where Finance asked: the `--color-surface` box, `--color-disabled-text` words and chevron (also with nothing chosen), the plain cursor; in Windows High Contrast, GrayText;
    - parts page: `M8/off` (listed apart, as it has no mockup) and `M8/offwhileopen`;
    - `check-parts.mjs`: 8 checks.
  - **Measured:** the look is Finance's picture C exactly (#F7F7F5 box, #8F8F8A border, #8A8A85 words and chevron, read from both). Today's real boxes look a shade lighter only because Chrome draws a disabled `<select>` at 70 % opacity; picture C was drawn at full strength.
  - **Review** (a separate reviewer agent): **ready**, nothing must-fix. It ran the new checks against 12 broken copies of the code.
    - Should-fixes, all done:
      - the rulebook row;
      - tighter checks: an empty + turned-off check, the focus asserted before the keys, and a control for every key, a click and a tap;
      - Windows High Contrast: a turned-off field looked like one that works; it now uses GrayText, as the browser's own does.
    - Minor, done: the CSS comment cites picture C and says why the rule sits next to `.is-readonly`; the M8 section points to it.
    - Minor, left: a field turned off while it has the focus keeps it. Keys do nothing and Tab moves on; native Chrome drops the focus instead. Inside a dialog, Shift+Tab from such a field, when it is the dialog's first field, leaves the dialog, because `Dialog.jsx`'s wrap starts only from the first item or the box. This is rare (only when the screen redraws under a focused field), and its fix would be in `Dialog.jsx`.
    - Checked after the fixes: removing either new CSS rule from the live page makes its check fail.
    - **Re-review of the fixes** (the same reviewer): **ready**. Its mutants of the two new CSS rules all fail their checks, every claim in the rulebook row matches its measurements, and check-parts gives 87 of 87. Its one nit is done: a pointer on the v1.100 row too.
  - **Proof:**
    - `check-parts.mjs` 87 of 87 (79 + 8);
    - both builds pass, with no parts-page code; the check files 19 of 19 (the real build last);
    - `git diff --check` clean; CRLF kept in `shared.css`, the plan and the rulebook;
    - picture: `Proof/parts/M8-off-vs-F2.png` (the four sizes, Finance's C and today's boxes, High Contrast).
  - Recorded as rulebook **v1.116**: a 10b row, pointers on the v1.100 and v1.109 rows, the changelog line and the header. Show all's drafted v1.116 becomes **v1.117**.
  - Committed on `dashboard-core` (the hash is in `git log`); not pushed. Shared files touched: `src/styles/shared.css` and the rulebook.
- **2026-10-29 — committed as cc92332** (on `main` 3fdbc0b; not pushed). Then the Show all work went back into the worktree from the stash.
  - `CountCards.jsx`, `shared.css` and `check-parts.mjs` merged cleanly. The status file kept the committed version (it already held Show all's log). The plan kept both sections: §13 is the turned-off state, and Show all is now §14.
  - Show all's mentions are renumbered to **v1.117** (2 lines each in `CountCards.jsx`, `shared.css` and `check-parts.mjs`; the plan's §14 title; the scratch row draft).
  - Compared with the copies saved before the stash, nothing else differs. The stash entry was dropped by its tag.
  - `check-parts.mjs` on the combined worktree: 91 of 91 (87 + Show all's 4). Show all stays uncommitted until Jeffrey picks (a), (b) or (c).
- **2026-10-29 — merged into `main` as e3e46d4** (the Main session; no conflicts; not pushed). Main's checks on `main`:
  - both builds pass, and the dist scan finds 0;
  - the forms checks pass; 19 of 19 check files;
  - 173 of 173 functions tests.

  Checked here: e3e46d4's parents are 3fdbc0b and cc92332, and its files are the same as cc92332's. This branch moved forward to it (fast-forward; Show all's uncommitted work untouched). Main told Finance it can merge `main` and build F2. The what's-left note to Main wasn't delivered (Main didn't pick it up in time); Jeffrey has it to paste.
- **2026-10-29 — live:** the Main session pushed `main` e3e46d4 with Jeffrey's OK, and the Cloudflare Pages deploy succeeded. Checked here: GitHub's `main` (`git ls-remote`) is e3e46d4 and holds cc92332. Nothing on screen changes until Finance's F2 uses `disabled`.
- **2026-10-29 — Main's new standing rule** (relayed by Main, quoting Jeffrey: "Whenever something is done have the sessions report to you…"): every finished step, ready merge or needed decision is reported to Main as Done / Needs Jeffrey / Next.
  - This session's status was sent at once, but it wasn't delivered: Main didn't pick it up within 20 s.
  - Main's addition, that Jeffrey's words quoted by Main count as his answer, was put to Jeffrey here to confirm; no answer yet.
- **2026-10-29 — Jeffrey: (a), "Room for box".**
  - **Built (not committed):**
    - `CountCards.jsx`: the gray line also has the class `cards-showing`.
    - `shared.css` (M6 section):
      - `.inline-link` has `position: relative` on the link itself, and `display: inline` is gone;
      - on touch, inside `.cards-showing` only, the invisible box is exactly 44 px (`--tap-size`) from 11 px above the words, 4 px past each side;
      - `.ev-filter-line.cards-showing` is 12 px under the cards with 24 px under it.
    - Parts page M6 `filtered`: a real control under the line, a class switch (the shared segmented ChoiceGroup); `parts.css` `.parts-under`.
    - `check-parts.mjs`: the 4 Show all checks wait for the gray line rather than a fixed time.
  - **Proof:**
    - Star's real Candidates tab (Both at 820, 390 and 320; one school at 390) is pixel-identical to option (a) in the question's picture. A finger finds Show all in 56.6×44.9, and it takes taps from nothing.
    - Side by side: `Proof/parts/M6-show-all-built-vs-a.png`.
    - Both builds pass, with no parts-page code; the check files 19 of 19; `git diff --check` clean; CRLF kept in `shared.css` and the plan.
  - **Review** (a fresh reviewer agent): **changes needed, all in the checks and the rulebook; none in the app code** ("The CSS and JSX produce option (a) exactly").
    - Should-fixes, all done:
      - the box assert is now exactly 44 (a 48 or 56 px box passed `>= 44`);
      - the class switch was measured only at each button's middle, so a box covering a neighbour's invisible strip passed. Now the card above and the switch's button under it are measured in the box's columns, with and without Show all's box, and must be the same;
      - rulebook v1.117 waits on Jeffrey's OK (drafted).
    - Minor, done:
      - the touch rules are scoped to `.cards-showing` (reusing `.inline-link` elsewhere can't bring the overlap back);
      - the comments no longer say "as Star's own inline links": Star's box is 43.5 px with no room made for it.
    - FYI, left as they are:
      - in the one-school view, Show all's box and "Show both schools"' box share a 5.5 px band, kept apart sideways (19.4 px at the closest);
      - Chrome's touch adjustment sends a tap up to about 9 px inside the bottom of the plain "Payments recorded" card to Show all at 390 and 320 (about 1 px on `main`). That is not an overlap, and §2.5 is met.
    - Its other results:
      - real taps on Show all clear the filter, and taps 1–2 px inside a card's bottom go to the card;
      - PC is unchanged (0 of 267 boxes moved with the new classes taken away);
      - Star's and Color Belt's own lines are unchanged;
      - the 20 non-filtered M6 pictures are byte-identical.
  - **After the fixes:**
    - `check-parts.mjs` 91 of 91;
    - the checks' own measuring code catches 4 broken layouts at 820, 390 and 320: the first build's, a 48 px box, a 56 px box, and a 44 px box moved down over the switch's strip (the switch's buttons lose 3/8 px);
    - both builds, 19 of 19, Star's screen still pixel-identical to option (a).
  - **Re-review** (the same reviewer): **ready**.
    - Its 16 broken layouts are all caught at 820, 390 and 320, including a box covering only the class switch's invisible 5 px strip, drawn on top or underneath. Built passes.
    - Scoping confirmed: a line without `.cards-showing` keeps app.css's touch box.
    - Geometry and PC are the same as in its first review.
    - Only rulebook v1.117 remains, waiting on Jeffrey's OK.
  - Plan §14 rewritten; rulebook **v1.117** drafted (scratch), not applied.
- **2026-10-29 — Jeffrey: "Yes, record it"** (record rulebook v1.117 and commit Show all (a)).
  - `git merge main` first: a fast-forward to `main` 5f28ed9 (31 commits: Finance's design review F1–F7, migration 0029's files, rulebook v0.817–v0.823, CLAUDE.md's 0029 and 0032 notes). None of them touch Show all's files, so the uncommitted work stayed as it was.
  - Recorded as rulebook **v1.117**: a 10b row, a pointer on the v1.107 row, a §8 line under v1.115's, the changelog line and the header (it showed Finance's 0.823). No number is used twice; CRLF kept.
  - Checked again on 5f28ed9: `check-parts.mjs` 91 of 91; both builds pass (exit 0, the real build last); the check files 19 of 19.
  - Committed on `dashboard-core` (the hash is in `git log`); not pushed. Shared files touched: `src/styles/shared.css` and the rulebook.
- **2026-10-29 — new item from Jeffrey, passed on by Main:** "Add to Dashboard core: a side-panel toggle for a large panel with names under the icons, for the Grandmaster". It is §4 item 10, its own item rather than part of step 2: its questions can start now, while step 2 waits on its starter. Next: check what the rulebook, the approved mockups and the code already say about the side panel, then ask Jeffrey one question at a time, with pictures at the four sizes. Nothing is built before he OKs the mockup.
- **2026-10-29 — committed as 2bf89c6** (Show all, v1.117). The report to Main (Done / Needs Jeffrey / Next) wasn't delivered within 20 s.
- **2026-10-29 — Jeffrey: "Yes, tell Main"** (to "Have Main merge Show all (2bf89c6) into main?"). Passed on to Main with his words; it wasn't delivered within 20 s either (Main may still pick both up). Jeffrey has a text to paste in Main.
- **2026-10-29 — Jeffrey: "Yes, that's it"** (the side panel for the Grandmaster is the task he gave Main). Research and question 1 (plan §15):
  - **Research** (a read-only agent, its key lines checked here):
    - Today the PC panel is icon-only and 52 px wide (v0.4); tablets get 72 px with 12 px names; phones get the bottom bar with names. Nothing expands or collapses.
    - "Hide private details" is the model for a per-device switch: the account menu, saved in that browser (v0.252, v0.253, v0.506). A per-account setting would need a migration.
    - Which device the Grandmaster uses isn't recorded.
  - **Question 1, which look:**
    - The pictures are Home with each option's CSS put on the real page, at the four sizes.
    - A sideways-scroll check on all 19 screens at 640, 820 and 1024 px found none.
  - **Review** (a fresh reviewer agent): **changes needed**. Must-fix: a placeholder left in the text, and C's height cost missing. Should-fix: the mouse's grey area, uneven pros and cons, a missing middle option, and the presentation. All done:
    - three options: A, the tablet's panel on PC; B, the same panel with 14 px names (the reviewer's middle option; recommended); C, a bigger panel;
    - the heights each needs: 492, 510 and 556 px;
    - the mouse greys only the pill;
    - amber boxes on the panel only, and tighter crops.
    - **Re-review** (the same reviewer): **ready after one wording fix**. C's names are as big as B's, not bigger. That fix and its minor points are done: the window height is a neutral fact rather than a plus; "12 → 14 px" for B; §1.3's tablet row is named for B and C; only Finance goes off-screen in C's short window; the quote is the design review's own checklist question; the phone row is smaller.
    - Final picture: `Questions/SP1-large-panel-look.png` (and `.html`); it is best viewed at 100% and scrolled. Sent to Jeffrey.
- **2026-11-03 — Remote Control turned on** for this session (Jeffrey: "turn on remote access").
- **2026-11-03 — Jeffrey answered question 1:** "B but make it a setting that I can change. For example, I dont need the icons that big but he might, so let us be able to change based on who is using the it."
  - The large panel is **B**: 72 px wide, 20 px icons, 14 px names, on PC and tablet. B doesn't make the icons bigger (20 px, the tablet's size); only the names grow, from 12 px to 14 px. That was said to Jeffrey.
  - It is **each person's own setting**: Jeffrey keeps today's panel, and the Grandmaster turns the large one on. That also answers question 4 (who can use it): everyone, each for themselves.
  - It works per person only when each person signs in with their own account (rulebook v0.13). On the shared front-desk login "Staff" (v0.27), everyone at the desk shares one setting.
  - Jeffrey's next message: **"Also allow for bigger icons as well"**.
    - Read as **one size setting per person, with three sizes**: Standard (today), Large (B) and Largest (C, with 24 px icons).
    - Question 2 confirms that shape against the other reading, two separate switches. Picture: `Questions/SP2-three-sizes.png`.
    - Then question 3, how each person's choice is remembered, and question 4, where it lives.
    - Found for question 3: a per-account setting can be built without a migration, in Supabase's own per-user settings (`user_metadata`, unused in the app today). See plan §15.
    - **Review of question 2's sheet** (the same reviewer): **changes needed, small**; all done.
      - The options are named "Three sizes" and "Two switches", not A/B, which clashed with question 1.
      - The other reading is named: Jeffrey setting each person's size. It is decided with where the setting lives.
      - Largest's costs are listed: the 24 px icon exception and the 556 px window.
      - Two switches' fourth look ("bigger icons alone") is drawn: PC 52 px with 24 px icons in 36×36 squares; tablet 72 px with 24 px icons over 12 px names.
      - "For example" replaces assuming Jeffrey stays on Standard. A new person or device starts on Standard. The PC labels are clearer, and there is a phone row.
      - The preview server was restarted (`npm run dev:preview-mode`, port 5190; the session had restarted), and all pictures were re-shot the same day; the numbers are unchanged.
- **2026-11-03 — Jeffrey answered question 2: "Three sizes".** One choice per person: **Standard** (today), **Large** (the 72 px panel with 14 px names) or **Largest** (96 px, 24 px icons, 14 px names). A new person or device starts on Standard.
  - Next, question 3: **who changes a person's size, and where.** Each person in their own account menu, Jeffrey for each person in Staff accounts, or both.
  - It comes before "how it's remembered" because it limits the choice. An admin setting another person's size must be saved with that person's account in the database, which needs a migration (the app can't change another person's sign-in settings).
- **2026-11-03 — Main merged 2bf89c6 (Show all, v1.117) into `main` as 7b665af** (not pushed). Main quoted Jeffrey: "For step one let all of the session that need to merge to do so". `main` also gained Camps, New students N8/N9 and Black Belt up to bf4d13f; the rulebook header is 1.117.
  - This branch moved forward to 7b665af with `git merge --ff-only main` (a fast-forward; 64 commits). The uncommitted plan, status and question files were untouched.
  - None of the incoming changes touch the side panel, the account menu, Staff accounts or the app shell, so the question pictures stay valid. Of CLAUDE.md's shared files, only the rulebook changed (other sessions' rows; CRLF intact).
  - `npm ci` was skipped: `package.json` and `package-lock.json` didn't change, so it would reinstall exactly what's there (and stop the preview server).
  - Checked on 7b665af: both builds pass (exit 0, the real build last); the check files 19 of 19; `check-parts.mjs` 91 of 91.
- **2026-11-03 — question 3's sheet reviewed** (the same reviewer): **changes needed, small**; all done.
  - The step-2 note now covers both places: step 2 hasn't started, and it will redesign the account menu and Staff accounts.
  - The shared front-desk "Staff" login (v0.27) means one size for everyone at the desk, whichever option is picked.
  - The row is left out of the phone's menu.
  - "You" and "Both" also settle question 4 (saved with each account, in the database).
  - A caption the crop couldn't show was removed, and the keyboard ring now sits on the new item only.
  - Its build notes are in plan §15: the account menu's own scroll, keyboard behaviour like "This device", radio-group keys in the box, and the icon map.
  - Final picture: `Questions/SP3-who-changes-it.png`. Sent to Jeffrey.
- **2026-11-03 — Jeffrey answered question 3: "Each person".**
  - Each person changes their own size, in their own account menu: a "Panel size" row under "This device", opening to Standard / Large / Largest, like "This device". It is left out of the phone's menu.
  - No Staff accounts change.
  - Next, question 4 (the last): how each person's choice is remembered, on each device or with their account. With their account would use Supabase's per-user settings, with no migration.
- **2026-11-03 — question 4's sheet reviewed** (the same reviewer): **ready**. Its minor points are done:
  - the account option's missing con: saving needs the internet, and a failed save shows "couldn't save";
  - a fair pro: after an iPad clears its storage he signs in again anyway, and the size comes back with that sign-in;
  - the timing: "the next time the dashboard opens there, or within about an hour if it stays open";
  - a note on the "Calendar" bubble in the picture.
  - Its build notes are in plan §15: read with `getUser()` at load; accept only the three sizes; fake `getUser`/`updateUser({ data })` in `mockClient.js`; what the 10b row says. It checked that nothing in `supabase/` or `src/` reads `user_metadata` today.
  - Final picture: `Questions/SP4-remembered.png`. Sent to Jeffrey.
- **2026-11-03 — Jeffrey answered question 4: "With their account".** Every question is now decided:
  - **Panel size** is each person's own choice, in their own account menu under "This device": Standard (today), Large (72 px, 20 px icons, 14 px names) or Largest (96 px, 24 px icons, 14 px names).
  - It applies on PC and tablet. Phones don't change, and the row is left out of the phone's menu.
  - It is saved **with the person's account**, in Supabase's per-user settings (`user_metadata`), with no migration. It follows them to every device, and new people start on Standard.
  - Next: the full mockup at the four sizes, a design review, then Jeffrey's OK. After that come the rulebook row (next free 1.118) and the build. Nothing is built before his OK.
- **2026-11-03 — the mockup** (`Mockups/SP-panel-size.png` / `.html`):
  - **What it shows:**
    - the three sizes at PC and tablet;
    - the "Panel size" row at PC and tablet, and the phone menu with no row;
    - Testing's menu beside the Large panel;
    - a short window (1093×514) where the panel and the menu scroll on their own;
    - a failed save: the amber bar under the top bar.
  - New pictures were staged on the preview by a scratch script. One run came out as the lock screen and couldn't be reproduced; the script now stops if the preview is locked.
  - **Design review** (the same reviewer): **changes needed**.
    - Must-fix: a scrolling panel would cut off the PC name labels and Testing's menu.
    - Should-fix: the thin scrollbar squeezed the buttons; open at the saved size with no jump; the failed-save bar belongs on the frame, not in one page; list what the OK records in the rulebook; the Color Belt roster overlap at 640–700 px.
    - Minor: "phones held upright"; read from `session.user` on refresh; keep the current section in view.
  - All done (plan §15 build notes).
  - **Re-review: ready after one CSS change and two wording fixes**, all done:
    - the buttons keep 4 px each side for the keyboard ring (`calc(100% - 8px)`);
    - the Color Belt note says "11 overlapping pairs in 4 rows; with Largest also at 700 px, not 768";
    - the keyboard note says only Tab moves between the panel's sections.
  - It confirmed that showing Testing's menu beside the panel is honest; the build's review checks it with the panel scrolled.
  - Final: `Mockups/SP-panel-size.png` / `.html`. Sent to Jeffrey for his OK.
  - Checked first: `main` hasn't moved since 5f28ed9 (2026-10-29), and 2bf89c6 (Show all) is still not merged. Main never received Jeffrey's "Yes, tell Main".

  - **Found on the way:** a phone turned sideways (844×390) gets the tablet panel, which doesn't fit. Prospects and Finance start off-screen, and the page scrolls 94 px. The fix is the panel's own scroll, a build note in plan §15.
- **2026-11-03 — Jeffrey: "OK, build it"** (the mockup). Built the same day (plan §15, "Built"):
  - `git merge --ff-only main` first (to 1e6561d; only CLAUDE.md had changed: Camps' migration 0033).
  - **Rulebook v1.118:** the 10b row, the changelog line, and short lines in §1.3, §2.2, §2.3, §2.4 (`ti-layout-sidebar`) and §6.
  - **Shared files touched:** the rulebook; `src/App.jsx` (two lines); `src/styles/tokens.css` (`--rail-width-largest`); `src/lib/mockClient.js` (the preview fakes `getUser` and `updateUser({ data })`, plus three helpers). The rest is Dashboard core's own: `src/lib/panelSize.js` (new), `Rail.jsx`, `RailMenu.jsx`, `AccountMenu.jsx`, `Shell.jsx`, `app.css`, `rail-menu.css`, and the tools.
  - **Checks:** `tools/check-panel.mjs` (new): 33 of 33 at first; 35 checks after the code review's fixes (below). check-parts: 91 of 91. The 19 check files pass. Both builds pass (the real one last).
  - **Proof:** `Proof/panel/SP-built-vs-mockup.png`. Compared pixel by pixel with the mockup's pictures, the panel and the account menu match exactly. The only differences:
    - the greeting on Home (the mockup was shot earlier in the day);
    - Standard's bubble and Testing's menu sit in the same place, with the same shadow, but their letters are smoothed slightly differently, because they are now drawn above the page;
    - the failed-save bar is the real shared bar (the mockup's hand-made copy had a taller ×);
    - the short-window menu uses the thin scrollbar.
  - **Found and fixed on the way:**
    - In a very short window, Standard's buttons were squashed (36 → about 29 px) instead of the panel scrolling (today too). They no longer shrink.
    - A dropdown that always had its own scroll changed Chrome's text smoothing. It now scrolls only when the window is too short.
    - The bubble now measures its icon again as it's pointed at or focused, so it can't be left behind if the panel moves without a redraw.
    - `tools/chrome.mjs` reused old browser profiles (337 were left in the temp folder). One held an old preview sign-in and opened on the lock screen: that was the "couldn't reproduce" lock while shooting the mockup. Now each run gets a fresh profile, removed afterwards.
  - **A quirk of the hidden Chrome, not of the app** (the same on `main`'s code): right after a sign-in through the form, the page gets no mouse input until it is opened again. The tools reload after signing in.
  - **A small call of mine, not in the mockup:** opening "This device" closes Panel size's choices, and the other way round (one open at a time).
  - **Code and security review:** no security problems. Fixed:
    - Must-fix (rare): when a sign-out can't reach Supabase with an expired sign-in, Supabase sends no signal. The next person could then see the last person's amber bar, and Retry would have saved the last person's size into their own account. Now a copy of another person's account starts afresh.
    - The buttons were 63 and 87 px in every window (the 1 px border). They now narrow only while the panel scrolls (`rail--scrolls`), so they are 64 and 88 px again, exactly as before; the checks assert the exact widths.
    - The preview now repeats Supabase re-sending the browser's older saved copy when a tab is shown again (`__tkdPreview.refocusTab()`), with a check that it can't undo a newer copy.
    - After × on a failed save, choosing the ticked size again now saves it.
    - The current section is kept in view when the lock screen closes.
    - Accepted (plan §15): two tabs saving at the same moment; a sign-in ended elsewhere can now land the person on Home after they sign in again.
  - **After the fixes:** `check-panel.mjs` 35 of 35. Its first run straight after the edits failed one check (the ticked size saved again). Three runs since, with the module's state printed at that step, passed, and the state was right each time; not reproduced.
  - **Design review: ready after small fixes.** It matches the mockup (10 scenes compared pixel by pixel), Standard is unchanged, and the menu row, the short windows and the failed-save bar work as specified. Fixed:
    - Must-fix: when Tab scrolled the rail in a short window, the keyboard ring's top or bottom line was cut off. Now `scroll-padding-block: 8px` on a scrolling rail. A new check tabs through the rail and back at 1093×514; it fails with the fix switched off and passes with it.
    - Should-fix: in normal windows the ring's right side lost 1 px, because the rail now always clipped. Now the rail scrolls and clips only while it must (`rail--scrolls`); a rail that fits is exactly as before (buttons 64 and 88 px, whole ring).
    - Minor: on a page with its own scrollbar (Schedule, Calendar, long rosters), the amber bar stuck out 15 px past the page's right edge. It now clears that scrollbar.
    - Its view of my one-list-open-at-a-time call: right. Recorded in the v1.118 row, so step 2's menu redesign (M17) keeps it.
    - Accepted: a keyboard ring on "Prospects" in a scrolling Large rail crosses its first and last letters; focus goes to the page after × or Retry (as with the shared bar everywhere).
    - Found in other sections, theirs to fix (plan §15): the Prospects board scrolls the page sideways at 640 px with a mouse (New students; already on `main`); the Color Belt and Star event lists are crushed at 640 px on touch (Color Belt with Largest; Star already with Standard).
  - **`main` moved** (Camps and Black Belt merged; 18 commits, to 5f1db41). Only the rulebook overlapped. I set my rulebook lines aside, fast-forwarded with `git merge --ff-only main`, and re-added v1.118 on top of the new rulebook (header 0.736 before). No conflicts.
  - **Checks after these fixes:** `check-panel.mjs` 38 of 38. check-parts 91 of 91, the 19 check files and both builds pass (on the merged code). The pixel comparison with the mockup is unchanged; the proof was rebuilt.
  - **The design reviewer's re-check: all three fixed, no new problems.** It tabbed through every short-window case (1093×514 Large and Largest, 844×390 touch at all three sizes, 1093×330 Standard) with no ring cut. Normal windows clip nothing (buttons 64 and 88 px, rings whole), and the bar lines up on Schedule, Calendar, other pages, the tablet and the phone. Resizing and switching sizes never let the page scroll, and the open section stayed in view.
  - Next: Jeffrey's OK to commit on `dashboard-core` (no push).
- **2026-11-03 — Jeffrey: "Yes, commit".** Committed on `dashboard-core` (the hash is in `git log`), on top of `main` 5f1db41; not pushed.
  - In it: the code, the rulebook (v1.118), the plan and this file, `tools/check-panel.mjs` and `tools/chrome.mjs`, the question pictures SP1–SP4 and the mockup (`.html` and `.png`), and the side-by-side proof `Proof/panel/SP-built-vs-mockup.png`. The proof sheet's `.html` stays on this PC (v1.110).
  - Shared files touched: the rulebook, `src/App.jsx`, `src/styles/tokens.css`, `src/lib/mockClient.js`.
  - Next: merging it into `main` is Jeffrey's call, through the Main session.
- **2026-11-03 — committed as 2baea38** (Panel size, v1.118; 26 files, on top of `main` 5f1db41). The report to Main (Done / Needs Jeffrey / Next, with the three notes for other sections) wasn't delivered within 20 s; Main may still pick it up. Jeffrey has the text to paste.
- **2026-11-03 — Jeffrey: "Yes, tell Main"** (the go to merge Panel size into `main`).
  - `main` had moved to e7fd75b (Camps C10; New students N10, N13, N14; rulebook v0.626 and v0.737). Only the rulebook overlapped.
  - So `git merge main` was run here first. It hit the usual three same-spot conflicts: the Version line, the 10b rows, and the changelog's last lines. They were resolved as always: both sides kept, main's first, with this branch's Version line (1.118).
  - Checked: the merged rulebook is main's plus exactly the v1.118 lines.
  - Checks on the merged code: the 19 check files, check-parts 91 of 91, check-panel 38 of 38, and both builds (the real one last). Committed as merge commit **723c302**.
  - Passed on to Main with Jeffrey's words quoted: queued (Main's session was busy), not confirmed read. If `main` is still e7fd75b, Main's merge is a fast-forward with no conflicts.
  - Next: Main merges. Pushing `main`, which puts it live, needs a separate OK.
- **2026-11-04 — `main` moved again, to 2e806e7, and was pushed** (Black Belt BB13, rulebook v0.971–v0.972; New students N15, v0.627). Panel size isn't in it yet.
  - Merging `dashboard-core` (723c302) into it now hits the same three rulebook conflicts again. No code file overlaps.
  - A correction to the go message was sent to Main: no longer a fast-forward, and how this branch resolves these clashes. It wasn't delivered within 20 s.
- **2026-11-04 — Jeffrey: "go ahead and tell main again".** `main` was still 2e806e7, without Panel size.
  - The go was sent again, complete in itself: what to merge (723c302), the three rulebook conflicts and how this branch resolves them, the checks, and the notes for other sections.
  - It wasn't delivered within 20 s; Main may be holding it for approval. Jeffrey has a short text to paste in Main.
- **2026-11-04 — merged into `main` as 942cfdd** (the Main session, on Jeffrey's own request there).
  - Checked here: its parents are 2e806e7 and 723c302. The rulebook has no conflict marks and its header is 1.118. It holds main's v0.627 and v0.972 rows plus exactly the v1.118 lines, and no changelog number is used twice.
  - This branch moved forward to it with `git merge --ff-only main`, as Main asked. Jeffrey then said the same: "go ahead and merge and report to main".
  - Checks on 942cfdd: the 19 check files, check-parts 91 of 91, check-panel 38 of 38, and both builds (the real one last).
- **2026-11-04 — live.** Main pushed `main` 942cfdd on Jeffrey's "push", and Cloudflare reported success. Checked: `origin/main` is 942cfdd, and the live site's code has Panel size.
- **2026-11-04 — Jeffrey: "ok lets go through them"** (the cleanup notes, §4 item 11).
  - Checked first: of all their files, only `testing-events.css` has work waiting elsewhere (on `color-belt`, and uncommitted in Color Belt's worktree).
  - Suggested order:
    1. the two out-of-date comments;
    2. Show all's keyboard focus;
    3. the turned-off icon button look;
    4. the three copies of the bordered icon button;
    5. the pale green.
  - Question 1: fix the two comments.
- **2026-11-04 — Jeffrey: "Yes, fix both".** Both comments are fixed: `shared.css` above the Mark paid box, and `times.js` lines 5–7. Not committed yet. Next, question 2: Show all's keyboard focus.
- **2026-11-04 — question 2's picture** (`Questions/CU2-show-all-focus.png` / `.html`; PC, parts page M6, keyboard only).
  - **Today:** after Enter on Show all, the focus falls to the page. No ring shows, and the next Tab starts again at the top of the page.
  - **With the fix** (imitated in the picture): the ring is back on the card that was on ("Not paid").
  - The fix moves the focus only when Show all had it, so a click or a tap shows no ring.
  - On Jeffrey's yes: rulebook v1.119.
  - Sent to Jeffrey.
- **2026-11-04 — Jeffrey: "Yes, fix it"** (question 2).
  - **Rulebook v1.119:** the 10b row, a pointer on v1.117's row, a line under Metric cards, and the changelog line.
  - **`CountCards.jsx`:** when Show all had the focus, the focus goes to the card that was on, then the filter clears.
  - **`check-parts.mjs`:** one new check. With the keyboard: the focus is back on "Not paid", ring showing. After a click: no ring.
  - Checks: check-parts 92 of 92, the 19 check files, and both builds.
  - Not committed yet (the review comes at the end of the cleanup).
  - Next, question 3: turned-off icon buttons.
- **2026-11-04 — question 3's picture** (`Questions/CU3-turned-off-icon-buttons.png` / `.html`).
  - **Found:**
    - The turned-off icon buttons (`disabled`) are Calendar's and Prospects' ⋯ while they save, and Forms' while read-only.
    - The unavailable ones (`aria-disabled`) are Finance's › on today (its own gray), the parts page's copy of it, and Black Belt's Delete day.
    - Black Belt's Delete day is meant to be gray, but no shared rule draws `.tib.is-unavailable`, so it looks normal. **Wrong, corrected by the code review:** `blackBelt.css` already grays it (`.bb-day-acts .tib[aria-disabled='true']`, at half strength), and only the square under the pointer reacted. Also, Forms' remove-option × is never read-only; the Forms button that turns off is the list's ⋯ while it works. And the picture's "Today" column for Finance's › missed that it too grayed the square under the pointer.
  - **The options:**
    - **A** (recommended): Finance's gray for all of them, shared, with the tooltip still showing the name.
    - **B:** the same gray, with no tooltip.
  - The plain-button half of the gray (a page-wide `.btn.is-unavailable`) stays with step 2.
  - Sent to Jeffrey.
- **2026-11-04 — `main` moved to 5087732.** It brought:
  - the Design Review's rolling check, pass 1: fix lists for six sessions, and rulebook v1.035–v1.039;
  - New students' v0.628–v0.629: Fill in grayed on Draft / Closed forms, with its reason as the tooltip.

  Only the rulebook overlapped this work. v1.119 was set aside, the branch moved forward (`git merge --ff-only main`), and v1.119 was added again on top (the same lines).
  - **The Design Review's fix list for this session** came with it: `docs/Design Review/Rolling check/Pass 1/Fix-DashboardCore.md` (§4 item 12).
- **2026-11-04 — Jeffrey: "A, tooltip shows"** (question 3).
  - **Rulebook v1.120:** the 10b row, a pointer on v1.116's row, a line under §1.4's tooltip rule, and the changelog line.
  - **`shared.css`:**
    - `.tib:disabled` and `.tib[aria-disabled='true']` get the icon in `--color-disabled-text` and the plain pointer;
    - the bordered one gets the light border;
    - no gray square under the pointer;
    - GrayText in High Contrast.

    `IconButton.jsx`'s header comment says so.
  - **`check-parts.mjs`:** one new check. It covers both kinds, plain and bordered, under a real pointer: the tooltip still shows, and High Contrast gives GrayText.
  - Checks: check-parts 93 of 93, the 19 check files, and both builds. Not committed yet.
  - **What changes on screen:**
    - The Forms list's ⋯ turns gray while it works, and Prospects' Statuses ⋯ while a status is being deleted. Calendar's Event types ⋯ never reach that state today. (Corrected after the reviews; the picture's "while saving" list was wrong too.)
    - Finance's gray › and Black Belt's gray Delete day look the same at rest. Under the pointer they no longer gray the square (corrected: Black Belt's already had its own gray).
  - Next, question 4: one bordered icon button.
- **2026-11-04 — Jeffrey: "Finance does it"** (question 4: who switches Finance's bordered ‹ › to the shared `.tib--outline`).
  - **Why not here:** Finance's own rolling-check fix list edits the same files (`finance.css` next to these rules, `DayReport.jsx`, `HistoryView.jsx`). v0.626 already says Finance's ‹ › "may move to it later". No rulebook row, as nothing on screen or in the rules changes.
  - **Done here:** the parts page's copy is gone.
    - `DP.jsx`'s four buttons use `tib--outline`.
    - `parts.css` lost `.parts-ibtn` and its touch rules; the first button's tooltip rule now names `.tib`.
  - **Proof** (before and after, pixel by pixel):
    - At rest, at the four sizes and with the calendar button turned off: the same pixels.
    - With the pointer on ‹ or ›: the copy had no hover rules of its own, so it grayed the whole square. It now has Finance's real hover (white inside, darker border). This is the parts page only.
  - **Finance's note:** to paste into Finance's session after this cleanup is on `main`; the text is in §4 item 11. Not committed yet.
  - Checks: check-parts 93 of 93 (the date picker's checks press these buttons), the 19 check files, and both builds.
  - **Next, question 5: the pale green.**
    - `tokens.css` already has `--color-success-text` (#3B6D11), but nothing for the pale green (#EAF3DE) or the green tag's edge (#CFE3B8).
    - Every page loads `tokens.css` (the family and kiosk pages too).
    - Every section's rolling-check fix list edits its own stylesheet.
- **2026-11-04 — `main` moved to 301e7f1.** It brought Black Belt's BB8 (migration 0034), New students' "(now)" 2 and 3, and the Design Review's v1.040. Again only the rulebook overlapped: v1.119–v1.120 were set aside, the branch moved forward, and they were added again on top (the same lines).
- **2026-11-04 — Jeffrey: "A, setting + notes"** (question 5).
  - **Rulebook v1.121:** the 10b row, a line under §7's color rules, and the changelog line.
  - **`tokens.css`:** `--color-success-bg` (#EAF3DE) and `--color-success-border` (#CFE3B8). **`shared.css`:** the green tag (`.ttag--ok`) uses them.
  - **`check-parts.mjs`:** one new check: the settings exist, and the green tag's colors are unchanged.
  - The notes for Camps, New students, Finance, Black Belt and Color Belt are in §4 item 11.
  - Checks on the whole cleanup (`main` 301e7f1 plus items 1–5): check-parts 94 of 94, check-panel 38 of 38, the 19 check files, and both builds. Not committed yet.
  - Next: a code reviewer and a design reviewer check the whole cleanup. Then Jeffrey's OK to commit.
- **2026-11-04 — code review of the cleanup:** one must-fix, three should-fix facts, small points; all done.
  - **Must-fix:** a click or a tap on Show all could scroll the page. Chrome, Edge and Android focus a clicked button, so focusing the card scrolled it into view when it sat partly off the screen (measured: up to 546 px). Now `focus({ preventScroll: event.detail > 0 })`, so only the keyboard brings the card into view. The check scrolls the card 20 px off the top and asserts that a click doesn't move the page.
  - **Should-fix (the v1.120 row's facts, corrected):**
    - Black Belt's Delete day already had its own gray.
    - The Forms button that turns off is the list's ⋯ while it works.
    - High Contrast didn't reach Finance's and Black Belt's own grays (their normal colours were swapped for the "works" colour). The High Contrast rules are now `!important`, and the check adds a button with a section's own gray.
  - **Small:**
    - The v1.119 row no longer says every browser restarts Tab at the top; that's only some.
    - The checks move the mouse away and remove their injected parts in `finally`.
  - **Left as they are:**
    - A turned-off ⋯ with its menu open would look pressed. No screen reaches that state.
    - A screen reader may say "pressed" then "not pressed" as the focus lands. That's the cost of keeping the ring.
  - **For Finance and Black Belt (notes to pass on):**
    - Under the pointer, their gray › / Delete day no longer gray the square (v1.120).
    - Black Belt's own rule (`.bb-day-acts .tib[aria-disabled='true']`, half strength) now draws it lighter than the shared gray and fades its tooltip to half. Black Belt can drop that rule; the shared look covers it.
  - **After the fixes:** check-parts 94 of 94, the 19 check files, and both builds. A probe shows the new scroll step catches the bug: with the old focus call, a click moved the page 20 px; as built, it doesn't move.
  - Next: the design reviewer's report.
- **2026-11-04 — design review of the cleanup** (real screens at the four sizes, with real keys, mouse and taps): **changes needed**; all done.
  - **Must-fix:** the same click-or-tap scroll as the code review (Star and Camps on phones jumped about 260–365 px); already fixed the same way (`preventScroll` unless it's the keyboard).
  - **Should-fix (facts, corrected):**
    - **Black Belt's Delete day** already had its own gray, and only the pointer reaction was wrong.
    - **Finance's gray ›** changes under the pointer (no square now), as option A says. At rest and on keyboard focus it is unchanged.
    - **The real turned-off cases** are the Forms list's ⋯ while it works and Prospects' Statuses ⋯ while a status is being deleted. Calendar's Event types ⋯ never reach it. The v1.120 row and this file now say so.
  - **Noted:**
    - A plain gray icon is only a little lighter than a working one (Jeffrey was told with question 3).
    - Outside this batch, for New students: in Edit statuses, while a delete saves, the drag grips stay dark although dragging is off.
  - **For Black Belt** (with the note above): its half-strength rule also fades the keyboard ring (about 2.9:1, not school blue, §4) and the tooltip (white on about #8E8E8E, about 3.3:1). Deleting the rule fixes both.
  - **Passed:**
    - The keyboard path on Star and Camps: the ring lands on the card, the next Tab carries on, and Enter turns the filter back on.
    - No ring after a click or a tap at 820, 390 and 320.
    - v1.120 on the Forms list, Prospects, Finance and the parts page. Tap areas unchanged. GrayText in High Contrast.
    - The parts page's date row: pixel-identical at rest at the four sizes.
    - v1.121: the same pixels on 5 screens.
    - The rulebook's mechanics.
- **2026-11-04 — `main` moved to 9b562b3** (New students' "(now)" 4, the kiosk's stylesheet; nothing in this cleanup's files). The branch moved forward with the cleanup in place (`git merge --ff-only main`).
  - Next: Jeffrey's OK to commit the cleanup on `dashboard-core` (no push).
- **2026-11-04 — Jeffrey: "Yes, commit".** The cleanup is committed on `dashboard-core` (the hash is in `git log`), on top of `main` 9b562b3; not pushed.
  - **In it:**
    - the code: `shared.css`, `tokens.css`, `CountCards.jsx`, `IconButton.jsx`, `times.js`, and the parts page's `DP.jsx` and `parts.css`;
    - `check-parts.mjs`, the rulebook (v1.119–v1.121) and this file;
    - the question pictures CU2 and CU3 (`.html` and `.png`).
  - Shared files touched: the rulebook, `shared.css` and `tokens.css`.
- **2026-11-04 — committed as 2b859b4** (the cleanup, v1.119–v1.121; 14 files, on top of `main` 9b562b3, so a merge into `main` is a fast-forward while `main` stays there). Not pushed.
  - The report to Main (Done / Needs Jeffrey / Next, with the notes for Finance, Camps, New students, Black Belt and Color Belt) was queued (Main's session was busy); not confirmed read.
  - Next: merging into `main` is Jeffrey's call, through Main. Step 2 and the rolling-check fix list each wait on Jeffrey pasting its starter.
- **2026-11-04 — Jeffrey: "Yes, tell Main"** (the go to merge the cleanup into `main`).
  - `main` had moved to 84a6e7d (Color Belt's design review Part 1 + Part 2, rulebook v0.420–v0.426). Only the rulebook conflicts, at 4 spots:
    1. the Version line (keep 1.121);
    2. **the v1.117 row, an edited row:** this branch added its "(See v1.119 …)" pointer, and main put Color Belt's new v0.420 row right after it. Keep this branch's v1.117 row, then v0.420; keeping both would duplicate the row, as 0c97e81 had to fix;
    3. the end of the 10b rows (main's v0.426, then v1.119–v1.121);
    4. the changelog's end (the same order).
  - Sent to Main with Jeffrey's words and these steps. Not delivered within 20 s. Jeffrey has a short text to paste in Main.
  - Color Belt now uses the shared count cards, so v1.119 reaches its rosters too. Its pale-green note can go to Color Belt once this is on `main`.
- **2026-11-04 — merged into `main` as 801b757** (the Main session, on Jeffrey's own request there; not pushed).
  - **Checked here:**
    - its parents are 84a6e7d and 2b859b4;
    - the rulebook has no conflict marks and its header is 1.121;
    - v1.117 has exactly one 10b row, with the "(See v1.119 …)" pointer, and Color Belt's v0.420 is right after it;
    - v1.119, v1.120 and v1.121 have one row each, and no changelog number is used twice;
    - the file is stored as before and has CRLF in the folder.
  - This branch moved forward to it (`git merge --ff-only main`). The preview was started again (the session had restarted).
  - Checks on 801b757: check-parts 94 of 94, check-panel 38 of 38, the 19 check files, and both builds.
  - Next: pushing `main` (which also holds Color Belt's Part 1 + 2) is Jeffrey's call, through Main. The section notes go out through Main once it's on `main`.
- **2026-11-04 — live.** Main pushed `main` 801b757 on Jeffrey's "Push now", and Cloudflare reported success.
  - Checked: `origin/main` is 801b757, and the live site's stylesheets contain `--color-success-bg`, the gray rule for `.tib[aria-disabled=…]`, and the High Contrast GrayText rule.
  - The section notes (§4 item 11) can all go out now, through Main or pasted by Jeffrey.
- **2026-11-04 — Jeffrey: "The fix list"** (the Design Review's rolling check, pass 1; he chose it over step 2).
  - `git merge --ff-only main` to 2881413 (New students' "(now)" 5–7 and the start of its Part 2). The fix file hasn't changed since it arrived.
  - Two read-only research helpers:
    - **R2-05:** 26 groups of Undo handlers in 8 areas, each with its own busy flag and nothing to wait on (some have no guard). The toast removes itself before Undo runs. A failing save clears the toast, and some Undos have 10-second limits.
    - **R1-08 and R3-12:** about 25 kinds of buttons are `aria-disabled` but look normal. A page-wide gray would also change some that shouldn't change: Camps' red Delete permanently, steppers and arrows at a limit, Finance's Copy Monday, and the kiosk. Also, how the dropdown's unavailable state fits.
  - Plan written: plan §16. Next: Jeffrey's OK of the plan and its order.
- **2026-11-04 — Color Belt's CB14 / M15 joint plan reviewed** (Jeffrey asked; the plan is on `color-belt` as e960d65, `docs/Testing/Color Belt Testing/TKD-ColorBelt-CB14-JointPlan.md`).
  - **Its proposal:** Color Belt builds all of it on `color-belt`. Classes and ranks moves into Settings as a second part after Schools, and Testing keeps a "Prices" tab. Dashboard core reviews the Settings fit. No database change.
  - **Reply sent to Color Belt: agree, with changes.** Color Belt's session held it, so it wasn't delivered (the sessions run in different permission modes). Jeffrey has the text to paste.
    - Nothing of Dashboard core's goes into `src/screens/Settings.jsx`: neither step 2 (M12–M14, M17) nor the fix list touches it.
    - Panel size isn't in Settings (it's in the account menu, v1.118).
    - If D6 gives staff a read-only view inside Settings, the account-menu entry for them is Dashboard core's change (`AccountMenu.jsx`; M17 changes it too). Color Belt builds the page side, and lists any `App.jsx` route change.
  - **Settings rules to keep:**
    - parts one under the other, each with its h2 heading and gray line;
    - Settings keeps ignoring the location switcher, with the school named wherever classes differ (the shared ChoiceGroup if it's a switch);
    - dialogs report through `onModalOpenChange`;
    - shared parts only;
    - an address of its own (e.g. `#settings/classes-and-ranks`) if N11's hints become links.
  - **Fix-list overlap:**
    - R2-05's Undo helper will land in ClassesRanksTab's four Undo handlers wherever they move.
    - R1-08's page-wide gray must not give BeltPicker's stepper a gray box.
  - Next: Color Belt's Settings mockups. Dashboard core reviews their fit when they arrive.
  - The held reply then expired undelivered, and nothing is waiting in Color Belt's session. Jeffrey has the text to paste.
- **2026-11-04 — Jeffrey: "Yes, start R4-07"** (the fix list's plan OK'd as proposed, plan §16).
  - **R4-07's picture:** `Questions/R407-history-hidden-line.png` / `.html`. It shows Camps → Thanksgiving Camp → Camper detail, with Hide private details on and the history opened.
    - **Today:** unpaid Ella Grant's list ends with no gray line, while paid Chloe Nguyen's ends with "Payment history is hidden on this tablet." The difference tells you who hasn't paid.
    - **With the fix** (imitated in the page): Ella's list gets the line too.
    - Sizes: PC, phone, tablet and 320 wide.
  - **On Jeffrey's yes:**
    - drop `hiddenPayments > 0` in `HistoryLine.jsx`;
    - rulebook v1.122;
    - a check in `check-parts.mjs`;
    - a security review, a code review and a design review.
  - Sent to Jeffrey.
- **2026-11-04 — Jeffrey: "Yes, build it"** (R4-07).
  - `git merge --ff-only main` first, to cceb2bf (CLAUDE.md: migration 0035 reserved for Color Belt).
  - **Rulebook v1.122:** the 10b row, a pointer on v1.108's row, and the changelog line. The header had been 0.632.
  - **`HistoryLine.jsx`:**
    - while hidden, the gray line shows in every history;
    - the counter that limited it is gone;
    - the comments say why.
  - **`parts/M7.jsx`:** two new samples, `hidden-unpaid` and `hidden-empty`.
  - **`check-parts.mjs`:** one new check. While hidden, a paid person's history, a never-paid person's and one with nothing recorded all end with the gray line; with the switch off, the history is unchanged. On the old code it fails, for never-paid and nothing-recorded.
  - **The real screens:** Camps' Ella Grant and Chloe Nguyen at the four sizes are pixel-identical to the approved picture's "With the fix".
  - **Checks:** check-parts 95 of 95 (its first run failed my own new check, which read two side-by-side words without their space; fixed), the 19 check files, and both builds.
  - Next: the security and code review, and the design review (both running).
- **2026-11-04 — R4-07's security and code review: approve, nothing must be fixed.**
  - **Verified:**
    - all six users of the shared history pass `hidden` from the same source that hides the rest of their screen;
    - each section's words leave out every money row, so paid and unpaid people with the same other changes show identical histories and counts (database-shaped rows, plus 68 real summaries in the preview, hidden and not);
    - the new check fails on the old rule;
    - the rulebook's mechanics.
  - **Fixed while in the file:** `HistoryLine.jsx`'s header still said Color Belt, Camps and Black Belt had no history line, and that nothing switched to it in step 1. It now says all four use it.
  - **Notes for other sessions** (their files):
    - Camps' `camperHistoryWords.js` (about lines 25–27) and Black Belt's `staff/candidates/historyWords.js` (about lines 33–35) still say money rows are "counted for the gray line". Suggested: "left out; the shared line shows the gray line in every history while hidden (v1.122)".
  - **For Jeffrey, information only:**
    - Black Belt's plan and Kukkiwon lines stay in the history while hidden (decided in v0.971 / v0.972, no amounts), though Black Belt's own details screen hides them. So a plan's name shows only there.
    - The history readers still send money rows to the device while hidden. That's the documented model: a screen guard, not a security lock (v0.161 / v0.249).
  - **Open for the design review:** in the new "hidden, nothing else" state the lone "History" label is gray, as in the approved M7 "can't read" state (the same rule).
  - **Before committing:** `main` moved to 392bc9e (Black Belt, rulebook v0.974–v0.975). The usual catch-up: set v1.122 aside, fast-forward, add it again.
- **2026-11-04 — R4-07's design review: ready**, nothing to fix.
  - **What it covered:**
    - 40 people in Camps, Star, Color Belt (event and private testing) and Black Belt, with the switch on and off;
    - all four sizes in each section;
    - Camps against the approved picture, matched at the four sizes.
  - **The line itself:** while hidden, everyone's history ends with the gray line, paid or not. It takes the same box and spacing for paid and unpaid people, is one line even at 320, and has 5.3:1 contrast. With the switch off, nothing changes.
  - **Nothing recorded:** that case was checked in Camps (with a camper's history emptied in a throwaway profile) and on the parts page.
  - **Optional notes:**
    - In the "hidden, nothing recorded" state the lone "History" label is gray. That's the same as M7's approved "can't read" look, so it's left as is unless Jeffrey wants it dark.
    - Black Belt's "on this device" wording is settled: Black Belt's v0.974 changed it to "on this tablet", now on `main`.
  - **Catch-up done:** v1.122 was set aside, the branch moved forward to 392bc9e, and v1.122 was added again (the same lines; the header had been 0.975).
  - **Checks on 392bc9e plus R4-07:** check-parts 95 of 95, check-panel 38 of 38, the 19 check files, and both builds.
  - Next: Jeffrey's OK to commit R4-07 on `dashboard-core` (no push).
- **2026-11-04 — Main asked: New students' N3 (b6a90a7, not merged) adds `actionUnavailable` to the shared `ConfirmBox.jsx`** (rulebook v0.633; Jeffrey: "Add it in this branch").
  - **Checked: it fits v1.008 / v1.103.** Only the action grays in the approved unavailable look, it stays focusable and a press does nothing, "Keep …" is unchanged, and it's off by default.
  - **Two small suggestions for New students:**
    - the first focus goes to "Keep …" when the action is unavailable, since a blue box focuses its action first;
    - the action is linked to its reason with `aria-describedby`, as MarkPaidBox does.
  - **No conflict:** Dashboard core isn't editing `ConfirmBox.jsx`. R1-08 (later) changes `shared.css`'s gray rules only.
  - Reply sent to Main; not delivered within 20 s. Jeffrey has the text to paste.
  - Then the notes to pass on, through Main: Finance (its bordered buttons; the pale green), Camps, New students and Black Belt (the pale green; Black Belt also its half-strength rule; New students also the grips), and Color Belt (the pale green, after its current work).
- **2026-11-04 — On hold: Jeffrey halted all sessions** (passed on by Main, quoting him: "I need to halt all of the chats right now, and focus on adding something to the form prospect section. Let all of the chats know").
  - Until he says to resume: nothing new is started, merged, committed or pushed, and no messages go to other sessions about new work. Step 2 stays parked on Main's list.
  - R4-07 stays as above: built, reviewed and checked, **not committed**.
  - The preview server (port 5190, fake database) is stopped.
- **2026-11-05 — Jeffrey: "Yes, commit"** (R4-07). It lifts the hold for this one item only. Everything else stays on hold until he says to resume, including catching up with `main` and the report to Main.
  - R4-07 is committed on `dashboard-core` on top of `main` 392bc9e (the hash is in `git log`); not pushed.
  - `main` has meanwhile moved to 6e35831: New students' N3 and its 0036 work (rulebook v0.633–v0.640) and CLAUDE.md's 0036 notes. Of R4-07's files, only the rulebook changed there, and only at the usual three spots: the header's version line, new 10b rows above v0.26, and new changelog lines at the end. So the merge needs the usual fix: keep both, main's first, with the newest version line.
  - Main's change to line 129 (the icon map's v1.108 entry, which now also names v0.640) is not the v1.108 10b row that R4-07 adds its pointer to.
- **2026-11-05 — committed as 23d618d** (R4-07, v1.122; 8 files, on top of `main` 392bc9e). Not pushed. The branch is 1 commit ahead of `main` and 6 behind. Main hasn't been told yet: the report waits for the resume.
- **2026-11-05 — The hold is lifted.** Main, quoting Jeffrey: "tell all other sessions to continue work"; Main: "Main is now 3a8dc70; merge main first".
  - **`main` 3a8dc70 merged in as a78ea18:** New students' N3 and its profile work with migration 0036 (rulebook v0.633–v0.640), Camps' early drop-off and late pick-up (v0.738), and CLAUDE.md's 0036 notes.
  - Only the rulebook conflicted, at the usual three spots. The Version line kept 1.122 with the later date (2026-11-05); the 10b rows and the changelog lines kept both, main's first. Checked: the merged rulebook is main's plus exactly this branch's four lines.
  - **Checks on the merged code:** the 19 check files, check-parts 95 of 95, check-panel 38 of 38, and both builds.
    - Yesterday's preview server was still running after its shell was stopped (PID 34204), so the first browser-check run used it. It was stopped, and both browser checks ran again on a fresh server, with the same results.
  - Main's two notes are §4 item 13 (to-do only).
  - `main` moved on to d7b5ebf meanwhile (New students: a long visitor sheet keeps the signature on its first page, rulebook v0.641). It touches only Prospects files and the rulebook, so Main's merge of this branch meets the usual three same-spot conflicts there again (keep both, main's first).
- **2026-11-05 — Camps asked, through Jeffrey, where M12 stands** (the one offline bar, v1.005; Camps' C19 waits on it).
  - Answered: not started (no mockup or code; step 2 hasn't started). About two days after Jeffrey's go if his answers come the same day; about a week later if the fix list's remaining steps go first.
  - The app shell shows the bar once, for every page: `Shell.jsx`, under the top bar, where Panel size's failed-save bar sits. Camps mounts nothing and passes nothing: its screens already use the shared `useLiveLoad`, whose `refreshFailing` the bar will collect. Planned look: picture 05b, option B (no Retry, no ×, no time). Camps' own "Updated …" on the roster's summary line stays.
  - Meanwhile Camps keeps its own bar and leaves alone `useLiveLoad.js`, `App.jsx` / `Shell.jsx`, `shared.css`, `components/text.js` and `mockClient.js`'s preview helpers.
  - Asked Jeffrey: M12 before the fix list's step 2?
- **2026-11-05 — reported to Main:** Done (R4-07 and the merge), Needs Jeffrey (the merge go; M12's place in the order), the d7b5ebf note, and the comment notes for Camps (`camperHistoryWords.js` 26–27) and Black Belt (`historyWords.js` 33–34), which still say money rows are "counted for" the gray line. Not delivered within 20 s; Main may still pick it up, and Jeffrey has a short text to paste.
- **2026-11-05 — R4-07 merged into `main` as 7511656** (the Main session; not pushed: `origin/main` is d7b5ebf). This branch moved forward to it (a fast-forward). A `--no-ff` merge started by mistake was aborted first, and the status notes were kept.
- **2026-11-05 — Jeffrey: "Yes, M12 first"** (M12 before the fix list's step 2).
  - M12's plan: plan §17.
  - **The mockup:** `Mockups/M12-offline-bar.html` and five pictures, `M12-offline-bar-1.png` to `-5.png`:
    1. the camp page at PC: today's own bar, and with M12;
    2. Color Belt's event page on a tablet;
    3. Home on a phone and at 320 wide;
    4. Star grading with one grade waiting (what stays);
    5. the question: Black Belt's Results tab, A (fold it in) or B (keep both).
  - Real preview screens, with the bar drawn using the app's own styles (`.shell-errbar` and `.errbar`). Star's and Black Belt's own lines are real: the browser's offline switch, plus `__tkdPreview.setStarOffline(true)` and a typed grade for Star's.
  - Waits on: Jeffrey's answer, A or B. His answer also OKs the rest of the mockup.
- **2026-11-05 — R4-07 is live.** Main pushed `main` 7511656 on Jeffrey's "Merge and push", and Cloudflare reported success (Main's report). Checked here: GitHub's `main` is 7511656, the same as this branch, so there is nothing to merge in. Main passed the comment notes on to Camps and Black Belt.
- **2026-11-05 — Jeffrey: "A, fold it in"** (M12: Black Belt Results' own offline bar folds into the one bar; the answer also approves the rest of the mockup).
  - Rulebook **v1.123**: the 10b row, a pointer on v1.005's row, and the changelog line. Plan §17 updated.
  - When M12 is on `main`, Main passes the word to Camps (C19: remove its own refresh bar) and to Black Belt (remove its Results offline bar; its grayed buttons get a gray line saying why, v1.004).
  - Next: the build (plan §17).
- **2026-11-05 — M12 built** (plan §17; not committed).
  - New `src/lib/connection.js`: the one store. It follows the browser's own offline / online events, and each screen's failing reloads.
  - New `src/components/OfflineBar.jsx`: the shared amber bar with no buttons.
  - `useLiveLoad.js`: each screen's live reload reports its `refreshFailing` there.
  - `Shell.jsx`: shows the bar first, in Panel size's slot.
  - `text.js`: the words (`OFFLINE_BAR`). `app.css`: a comment only.
  - `mockClient.js`: `__tkdPreview.cutConnection(true | 'internet' | false)`.
  - **Shared files touched:** `src/components/text.js`, `src/lib/mockClient.js` and the rulebook. Also Dashboard core's own `Shell.jsx`, `app.css` and `useLiveLoad.js`, which every section's live reloads use.
  - **Checks:** a new `docs/Dashboard Core/tools/check-offline.mjs` (15 checks, all pass; with the bar moved inside the page and the reports turned off, 11 of them fail), and two new shared checks (23 groups).
  - **The full suite on M12's code:** both builds, the 19 check files, check-parts 95 of 95, check-panel 38 of 38 (Panel size's bar unchanged after the `Shell.jsx` change), check-offline 15 of 15.
  - Reviews: design and code, running.
- **2026-11-05 — M12's code review: changes needed** (one must-fix, two should-fix, small points; the reviewer reproduced each in the preview).
  - **Must-fix:** pages without a refresh of their own also reported failed loads (Finance's Daily report, History and Settings; Camps' Templates). Nothing cleared them when the connection came back, so the bar could stay while online. Fix: only live reloads with a refresh time report (v1.005's "two failed refreshes").
  - **Should-fix:** (a) on pages that refresh themselves, the bar lingered up to 15 s after "online"; fix: reload on the browser's "online" event. (b) With the Wi-Fi up but no internet, switching school dropped the bar; fix: count failed refreshes across a key change, once the page has had an answer.
  - **Accepted limit, to tell Jeffrey:** for that cause only (failed refreshes), changing page drops the bar until the new page's own refreshes fail. When the browser says offline, it stays on every page.
  - Small: ErrorBanner's "never closes by itself" header names the exception; Shell measures before painting (`useLayoutEffect`); comment fixes; check-offline made exact (it ticks the 15-second timer itself) and gains checks for the three fixes.
  - Fixes wait for the design review to finish (editing code would reload the pages it is photographing).
- **2026-11-05 — M12's design review: the look is ready; changes needed on behaviour.**
  - The look is pixel-identical to the approved mockup, on 14 pages at the four sizes.
  - **Must-fix:** the same as the code review's: the bar didn't go when the connection was back (pages without a refresh never cleared it; pages with one waited up to 15 s).
  - **Should-fix, Jeffrey's call:** the page jumps 48px (PC) to 90px (phone) when the bar comes or goes, so a tap can land on the next row's Check in. The question goes to Jeffrey with pictures.
  - **Should-fix, a follow-up:** at very short windows (400% zoom, 320×256) both bars leave the page no height. Panel size's bar has the same problem.
  - **Small points:** dialogs hide the bar on phones and aren't announced (follow-up); Windows high contrast lost the bar's edge (fixed); the touch padding (as in the mockup; left); the frame scroll from `.visually-hidden` (pre-existing; follow-up).
- **2026-11-05 — the reviews' fixes are in** (plan §17, "After the reviews").
  - Only reloads with their own refresh report; every live reload reloads on "online"; failed refreshes count across a school switch, once the page has had an answer.
  - Shell measures before painting. ErrorBanner's header names the exception. The amber bar's edge in high contrast. Comment fixes.
  - The v1.123 row reworded to match, including the accepted limit (a page change drops the failed-refresh cause).
  - **check-offline** now ticks the 15-second timers itself and has 19 checks, all passing. With the three bugs put back on purpose, exactly the three new checks fail.
- **2026-11-05 — `main` moved to 6b27cdd** (the Design Review's v1.041–v1.051 and its fix files). Only the rulebook overlapped: v1.123 was set aside, the branch moved forward (fast-forward), and v1.123 was added again (the same lines, as reworded; the header had been 1.051).
  - The Design Review's updated `Fix-DashboardCore.md` gives Dashboard core newly decided items for the fix list, all after M12:
    - R2-04: the toast gets its own room (v1.042);
    - R1-06 / R1-07 / R2-07: shared payment, Undo and "someone else changed it" words (v1.045);
    - R3-06: one shared back link (v1.048);
    - S-2: one "Couldn't load" line (v1.051);
    - R2-09: Staff accounts' toast full stop (v1.051).
- **2026-11-05 — question to Jeffrey: the page jump** (the design review's should-fix 2). The picture is `Questions/M12-page-jump.html` / `-1.png` / `-2.png`: the camp page, PC and phone, with the real bar.
  - Shown: a finger on Chloe Nguyen's Check in. As built, when the bar goes, the same spot becomes Ella Grant's Check in (PC, 48px) or the gap under her name (phone, 91px). Kept still, it stays Chloe's.
  - A: keep it as built. B (my pick): the page's own scroll moves by the bar's height, for both bars in that place. B's cost: at the very top of a page, the back link sits just out of view while the bar shows.
  - **The full suite on the fixed code** (on `main` 6b27cdd): both builds, the 19 check files, check-parts 95 of 95, check-panel 38 of 38, check-offline 19 of 19.
- **2026-11-05 — Main sent the fix-list starter** (Jeffrey: "Yes, send them"). Dashboard core goes first, because the sections' items wait on its shared ones. Merge each shared item to `main` as soon as it's reviewed and OK'd; R2-05 unblocks the most.
  - `main` c769a66 merged in (a fast-forward; CLAUDE.md's migration reservations 0037–0039 only).
  - Plan §16 re-ordered: M12 first (Camps waits), then R2-05, then the shared words in one step (R1-06, R1-07's toasts, R2-07, S-2, R3-13, R2-09), then R2-04, R1-08, R3-12, R4-09, R3-06, R1-07's payment line, and the smaller items.
- **2026-11-05 — Jeffrey: "B, keep it still"** (the page jump).
  - Rulebook **v1.124**: the 10b row, pointers on v1.118 and v1.123, and the changelog line. `main` 2187dbe merged in first (a fast-forward; CLAUDE.md only).
  - **Built** in `Shell.jsx`: a ResizeObserver on the page's box moves the page's own scroll by the same height when a bar comes or goes, before painting. It covers both bars.
  - **Exception, found here:** the control the keyboard is on never goes out of sight (v1.033). If keeping the page still pushed it above the page's top edge, the page comes back down just enough. The v1.124 row says so.
  - **check-offline:** 24 checks, all pass. Five new ones cover: PC, phone, the very top of a page, Panel size's bar, and the keyboard focus. With keep-still turned off on purpose, exactly its four checks fail; with the focus rule turned off, exactly its one.
  - check-panel still 38 of 38.
  - **The full suite on the final code** (`main` 2187dbe plus M12): both builds, the 19 check files, check-parts 95 of 95, check-panel 38 of 38, check-offline 24 of 24.
  - The focused re-review (design and code) is running.
- **2026-11-05 — M12's code re-review: changes needed.** Each point was reproduced in the preview; the probes are in the scratchpad's `m12/rereview-code/`.
  - **Must-fix 1:** the bar stays when a live load's key turns null (Star's Results tab hook after switching to Candidates, Star's private list, Black Belt's grading hook). Its streak freezes at 2+ and nothing reloads it. Fix: report only while the hook is asking (a key, and enabled), and reset the count when the key goes null. Add a check.
  - **Must-fix 2:** keep-still jumps near the page's end. When the bar goes, the browser has already pulled the scroll back, and `+=` moved it again (47px on PC, 90px on a phone at the very bottom). Fix: work from the scroll position before the change (a scroll listener that ignores the browser's own pull-back), set it absolutely, and add an end-of-page check.
  - **Should-fix 3:** measure the page's place in the layout (`offsetTop`), not on screen, so a scroll of the whole frame (some phone pages; iOS's keyboard) can't throw it off. Whole pixels also stop a 1px creep each time the bar comes and goes (small point a).
  - **Small:** keep about 8px of room above a focused control, so its focus ring isn't clipped; mention the end-of-page case in the comment.
  - Optional and not now: count a hung, replaced request as a failed refresh. That's older behaviour; it goes to the follow-ups.
  - Fixes wait for the design re-review to finish.
- **2026-11-05 — M12's design re-review: changes needed.**
  - Confirmed fixed: the bar goes by itself (Daily report, camp page). The look still matches the mockup, and high contrast works.
  - Must-fix: the end-of-page jump (as the code re-review found); a **new** one, the focus rule yanking the page back to a control focused long ago (clicked into Find a camper, then scrolled away); and Star's stuck bar (as the code re-review found).
  - **Jeffrey's call:** two limits of B his picture didn't show:
    1. at the very top of a page on a phone, the 91px bar hides the title too, not just the back link;
    2. a page at or near its top when a bar goes still moves (e.g. opened during the outage), so a tap there can land on the next row.

    The reviewer's pick for both: accept, and say so in v1.124.
  - Small: the 1px creep; the focus ring clipped; an open ⋯ menu on a page that can't scroll stays while its row moves.
- **2026-11-05 — the re-reviews' fixes are in.**
  - `useLiveLoad` reports only while it's asking (a key, and enabled), and resets its count when the key goes null.
  - Shell's keep-still sets the scroll from where the person had it before the change: a scroll listener records it, ignoring the browser's own pull-back. It reads the page's place from the layout (`offsetTop`).
  - The focus rule acts only for a keyboard-focused control (`:focus-visible`) that was in view before the bar came, and keeps 8px for its ring.
  - **check-offline: 30 checks, all pass.** Six new ones cover: the very end of a page on PC and phone, the old focus yank, no creep over five comings and goings, a scroll of the whole frame, and Star's Results tab. On the code the re-reviewers saw, the first five fail; with the old hook alone, Star's fails.
  - The Star check needed one good refresh first, so the Results tab has its answer before the cut. Without it, the check passed on the old code.
  - **The full suite on the fixed code:** both builds, the 19 check files, check-parts 95 of 95, check-panel 38 of 38, check-offline 30 of 30.
  - A last focused review (design and code together) is running.
- **2026-11-05 — M12's last focused review: one must-fix, a regression of the end-of-page fix.**
  - Setting the scroll from before the change threw away any scroll in that same moment. That meant Chrome's own scroll anchoring when a note above the view comes with the bar: Camps' own "Couldn't refresh" bar until C19 dropped the roster 51.5px on PC and 70.5px on the phone. It also lost a wheel step.
  - Everything else confirmed: Star's stuck bar fixed, the end of the page, the layout position, the narrower focus rule, the lock, StrictMode; the look as approved.
  - **Fixed** as the reviewer suggested (and verified in the page): count from where the page is scrolled now. Only at the page's end, where the browser already pulled the scroll back, count from before.
  - A new check (a 30px note above the view in the same moment as the bar) failed before the fix (420 → 449) and passes now: **check-offline 31 of 31.**
  - Small points:
    - the focus rule's comment: `:focus-visible` means a control showing its focus ring (keyboard, or a text box being typed in);
    - a screen that stops asking (tab closed, turned off, the lock) keeps its count one short of the bar. Asking again, one more failure shows the bar and a good refresh clears it, so the bar never shows before that first reload answers. The reviewer suggested resetting to 0; one short keeps the bar coming straight back when the connection is still down;
    - the hook's header says it reports only while asking.
  - **The full suite on the final code:** both builds, the 19 check files, check-parts 95 of 95, check-panel 38 of 38, check-offline 31 of 31. A leftover blank line was removed afterwards, and the shared checks and both builds were run again on it.
  - The reviewer's suggested fix went in as written. The count kept one short of the bar (instead of 0) is a small variation, not re-reviewed.
  - Next: Jeffrey's answer on B's two limits, then his OK to commit M12.
- **2026-11-05 — Jeffrey: "Yes, accept both"** (B's two limits).
  - v1.124's row now says them: at a page's very top the first lines sit just out of view (the back link on PC; the back link and the title on a phone), and a page at or near its top when a bar goes still moves. Its changelog line says the limits are accepted.
  - `main` 2aaa385 merged in first (a fast-forward; CLAUDE.md only).
  - Next: Jeffrey's OK to commit M12 on `dashboard-core` (no push).
- **2026-11-05 — Jeffrey: "Yes, commit". Committed as cb2d072** (M12, rulebook v1.123 and v1.124; 25 files, on top of `main` 2aaa385, so a merge into `main` is a fast-forward while `main` stays there). Not pushed.
  - Main is told it's ready to merge; merging is Jeffrey's call. The message wasn't delivered within 20 s, so Jeffrey has a short text to paste.
  - After the merge, Main passes the word to Camps (C19) and Black Belt (its Results bar).
- **2026-11-05 — Jeffrey: "Yes, tell Main"** (the go to merge M12). Passed on to Main, quoting him. Not delivered within 20 s; Jeffrey has a short text to paste.
- **2026-11-05 — R2-05 (the queued Undo) started** (plan §16, step 2).
  - Today's toast: pressing Undo dismisses it first (`Toast.jsx` `handleUndo`), then runs the section's Undo, which returns early while another save runs. So nothing happens, silently.
  - The shared words already have "Undoing…" (`UNDOING`, the Undo payment box's busy label) and "Undone" (`TOAST_UNDONE`).
  - **Question 1, the "Undoing…" toast:** `Questions/R205-undoing-toast.html` / `-1.png` / `-2.png`, from Camps → Thanksgiving Camp after Withdraw on Zoe Park, at the four sizes. The busy look copies the "Are you sure?" box's (v1.008): grayed words, the busy cursor, still a Tab stop; the toast stays until done, then "Undone".
    - A (my pick): the Undo button is as wide as "Undoing…" from the start (the toast 236px instead of 207px), so nothing moves.
    - B: today's size, and the toast grows 29px when it says "Undoing…".
  - Still to come, one at a time: the running save's own toast, a running save that fails, and leaving the page while an Undo waits.
- **2026-11-05 — Jeffrey: "A, wide from the start"** (R2-05 question 1: the toast's Undo button is as wide as "Undoing…" from the start, so nothing moves).
  - **The rulebook row (v1.125) waits for M12's merge.** `main` has moved (Star's end time with migration 0041, Camps' pass 1 small fixes, v0.519–v0.520 and v0.739). Writing a row needs `git merge main` first, which would put new commits on top of cb2d072, the commit Jeffrey OK'd for merging. So the row goes in right after Main merges M12.
  - A dry run of that merge (`git merge-tree main cb2d072`): only the rulebook conflicts, at the usual three spots; `mockClient.js` merges cleanly. Main is told (not delivered within 20 s; Jeffrey has one combined text to paste).
- **2026-11-05 — R2-05 question 2: the waiting save's own toast.** Picture: `Questions/R205-q2-toast-order.html` / `.png`, a storyboard of real toasts. Zoe Park's Undo waits for Sofia Rivera's withdraw, which has its own toast.
  - A (my pick): Sofia's toast right after Zoe's Undo is done; "Undone" is skipped, because Zoe is back on the page.
  - B: "Undone" for 2 seconds, then Sofia's toast.
  - C: Sofia's toast as soon as her save ends, with Zoe's Undo running behind it.
- **2026-11-05 — Jeffrey: "A, right after"** (R2-05 question 2). A toast that arrives while "Undoing…" shows waits. When the Undo is done, the newest waiting toast shows with its full 5 seconds, and "Undone" is skipped in that case. The rulebook row waits for M12's merge, like question 1's.
- **2026-11-05 — R2-05 question 3: the save an Undo waited for fails.** Picture: `Questions/R205-q3-save-fails.html` / `.png`. Each frame stacks real pieces of the preview at phone width: the app's own bar and Sofia Rivera's "Not saved" tag from a withdraw made to fail with `failNextSave()`, and Zoe Park's toast copied into its place.
  - Today a failing save clears the toast (`CampPage.jsx` `end()`), and the newest problem takes the page's one bar.
  - A (my pick): Zoe's Undo still runs right after, since it only waited its turn. If it saves: "Undone", and Sofia's bar stays. If it fails too: one bar for both, "Neither change saved. Check the connection, then retry.", and Retry redoes Sofia's withdraw, then Zoe's Undo.
  - B: Zoe's Undo waits for Retry. The toast goes, the bar says "That didn't save, so your Undo didn't run. Check the connection, then retry.", Retry redoes both, and × drops both.
  - **Found while drawing it (the next question):** every page's amber bar sits at the top of its page. At 1280×800, scrolled down to Sofia (`scrollTop` 438), the camp page's bar was at y = −280, out of view. Her "Not saved" tag shows, but a failed Undo leaves no mark on its row (`runUndo` sets only the bar). No rule covers a bar that appears out of view, and the design review's files don't mention it.
  - `main` moved to 528bad7 (Finance's merge; migration 0043 reserved for Camps). M12 isn't merged yet. A new dry run (`git merge-tree main cb2d072`) still conflicts only in the rulebook, and `mockClient.js` merges cleanly.
- **2026-11-05 — M12 merged into `main` as 201b75f** (the Main session, on Jeffrey's "Yes, tell Main"; not pushed). Main reports both builds, every check file and the functions check (174/174) passing, and has told Camps (C19) and Black Belt (v1.123).
  - Checked here: cb2d072 is in `main`, v1.123 and v1.124 each appear once, the header says 1.124, and there are no conflict markers.
  - This branch moved forward to 201b75f with `git merge --ff-only main` (no new commit). The status file was untouched by `main`, so its uncommitted notes stayed.
- **2026-11-05 — R2-05's rulebook rows written** (not committed): **v1.125** (question 1: an Undo pressed while another save runs waits its turn as "Undoing…", and the Undo button is as wide as "Undoing…" from the start) and **v1.126** (question 2: a toast that comes meanwhile waits; then the newest one shows and "Undone" is skipped).
  - Also: one sentence in §8's toast rules; pointers on v1.006 and v1.051; changelog lines; header 1.126 (CRLF kept). Next free in this block: **1.127**.
  - Applied without a separate question: question 2's skip covers v1.051's longer "Undone. … is open again." too, since the page shows it reopened.
- **2026-11-05 — M12 is live.** Main pushed `main` 1cad458 on Jeffrey's "Merge and push all" (M12 with Finance's F6 and New students' R5-03 and v0.643), and Cloudflare deployed it (Main's report). Checked here: `origin/main` is 1cad458.
  - This branch moved to 1cad458 too. The two rows were set aside first (a backup and a patch in the scratchpad), then `git merge --ff-only main`, then the same six edits were made again on top.
  - The added lines match the first version exactly. The header goes from New students' 0.643 to 1.126, and the two changelog lines now follow 0.643's.
- **2026-11-05 — Jeffrey: "A, still runs"** (R2-05 question 3). When the save an Undo waited for fails, the Undo still runs right after: it's its own change and only waited its turn. Its toast stays "Undoing…" meanwhile; a failing save no longer clears it. If the Undo saves: "Undone", and the failed save's bar stays. If it fails too, one bar covers both: "Neither change saved. Check the connection, then retry.", and its Retry redoes the save, then the Undo. Rulebook row: v1.127.
- **2026-11-05 — question to Jeffrey: a new amber bar that shows up out of view** (found while drawing R2-05 question 3). Picture: `Questions/R205-bar-out-of-view.html` / `-1.png` / `-2.png`.
  - The screens are real preview screens. Zoe Park's Undo was made to fail with `failNextSave()`, and the app's own bar was 280px above the screen at PC and 1,295px above it on a phone; nothing on her row says so.
  - A (my pick): every page's amber bar shows under the top bar, where the offline bar and Panel size's bar show (v1.123, v1.118), and the page stays still (v1.124). Bars inside a box or side panel stay inside it. Drawn by putting the page's real bar in a `.shell-errbar` wrapper where `Shell.jsx` puts its bars, at the four sizes.
  - B: the page scrolls up to the bar. Zoe's row is then below the screen: 183px on PC, about 1.4 screens on a phone.
  - C: a small amber pointer with the bar's first words at the top of the page area; tapping it scrolls up. This would be a new element, drawn in the bar's own colors.
- **2026-11-05 — Jeffrey: "A, under the top bar"**. Every page's amber bar now shows just under the top bar, where the offline bar and Panel size's bar show, so it's in view however far the page is scrolled. The page stays still as it comes or goes (v1.124). Bars inside an open box or side panel stay inside it. Rulebook row: v1.128.
  - To build: the place once in the shared bar (Dashboard core); each section then switches its page bars to it, through matching items like R2-05's.
- **2026-11-05 — R2-05 question 4: leaving the page while an Undo waits.** Picture: `Questions/R205-q4-leave-page.html` / `.png` (real preview screens).
  - Today the toast lives in `App.jsx` and is cleared on every page change, so the Undo's fate is never said. The app already has a leave guard (`App.jsx` `guarded()`, contract 0010 §4.9) and a leave box ("Stay on this page" / "Leave anyway"), which the grading pages use.
  - A (my pick): nothing asks; the Undo still runs. If it saves, nothing more is said. If it fails, the bar shows under the top bar of whatever page you're on (v1.128): "Undo didn't save: “Zoe Park withdrawn” (Camps). Check the connection, then retry.", with Retry.
  - B: the shared box asks first ("The Undo isn't done yet"). Stay on this page waits for the result; Leave anyway drops the Undo. The action is blue, since nothing is lost for good.
  - Drawn with the real box (Camps' Undo payment box on Ethan Wu, words set) and a real bar copied from a failed save, placed where `Shell.jsx` puts its bars.
- **2026-11-05 — Jeffrey: "A, still runs"** (R2-05 question 4). Nothing asks when someone leaves the page while an Undo waits, and the Undo still runs. If it saves after they left, nothing more is said. If it fails, the bar shows under the top bar of whatever page they're on, naming the change and the section: "Undo didn't save: “Zoe Park withdrawn” (Camps). Check the connection, then retry." Its Retry runs the Undo again from there. Rulebook row: v1.129. That was the last of R2-05's design questions.
  - Before writing v1.129: `git merge --ff-only main` to beae745 (two CLAUDE.md commits only; the uncommitted files were untouched). Next free in this block: **1.130**.
- **2026-11-05 — R2-05's build plan written** (plan §18).
  - Dashboard core builds the busy toast and its waiting slot, the save line (`src/lib/saveLine.js`), the page-bar place and `PageBar`, the shared words, a parts-page sample and the checks. It also switches its own screens.
  - Afterwards, each section switches its Undo handlers and page bars to these, through its matching item.
  - Waits on Jeffrey's go. Not committed: rulebook v1.125–v1.129, the plan, this file and the R2-05 question pictures.
- **2026-11-05 — a note from New students, via Main: the shared Dialog loses focus when a dialog swaps steps.**
  - Checked in the code: `Dialog.jsx` moves focus only when it opens, and Esc is handled on the box.
  - My check on `main` beae745: Calendar's Event types (row → Edit → Cancel) already kept focus and Esc worked. The other cases are New students' and Camps' own, and those sections are adding a key per step.
  - Taken as a small shared item (plan §16 notes): Dialog moves focus back in when it falls to the page. It will be built together with the ⋯ menu's focus item after Jeffrey's go. Nothing needs Jeffrey now.
- **2026-11-05 — five notes from New students' design reviews** (via Main; nothing needs Jeffrey yet). Each was checked in the code and filed in plan §16:
  - the shared ⋯ menu gives no focus back after a choice: a new small item;
  - R2-04 confirmed on Forms;
  - the toast's padding at 320 goes into R2-04's mockup;
  - the shared tooltip can't be hovered or dismissed with Esc (WCAG 1.4.13): a new small item;
  - §7's Delete-on-hover words: for Jeffrey later;
  - Forms' Copy Undo joins R2-05.
- **2026-11-05 — question to Jeffrey: accept B's two extra limits?** Pictures: `Questions/M12-B-limit-1-phone-top.png` and `Questions/M12-B-limit-2-top-when-bar-goes.png` (made by the design re-reviewer).
- **2026-11-05 — Color Belt's CB14 Settings mockups reviewed** (relayed by Main): `cb14.png` and `cb14-q3.png` in the color-belt worktree; rulebook v0.427 on color-belt 46e745b. **OK: it fits Settings.**
  - Small points sent, none blocking:
    - the ChoiceGroup gets an accessible name ("School");
    - Add class's screen-reader name names the school (v1.111's pattern);
    - the `#settings/classes-and-ranks` address scrolls to the part and focuses its heading, and `src/lib/pageAddress.js` is listed with the shared files;
    - the part's load line ends "then retry" (S-2);
    - optional "→ Prices" wording.
  - Coordination: `Testing.jsx` (R3-06's focus helper), the moved Undo handlers (R2-05) and toasts (R2-04).
  - Not delivered within 20 s; Jeffrey has a short text to paste.
- **2026-11-06 — the design review's pass 2 arrived.** Main: it's merged and live on `main` 1751e82 (pushed on Jeffrey's "Merge and push both"). Fix file: `docs/Design Review/Rolling check/Pass 2/Fix-DashboardCore.md`. Main: "Do L-02 before your other pass 2 fixes", because Color Belt's, Star's and Camps' L-02 wait for it.
  - This branch moved to 1751e82. Main's merge changed the rulebook, so the rows v1.125–v1.129 were set aside first (a backup and a patch in the scratchpad).
  - Then a three-way merge of the rulebook with main's (`git merge-file`). The only conflicts were the header, the 10b rows' place and the changelog's end; main's rows went first, mine after.
  - Then `git checkout` of the file, `git merge --ff-only main`, and the merged file written back with CRLF. The added lines match the backup exactly; the header goes from New students' 0.644 to 1.129.
- **2026-11-06 — Main corrected New students' Dialog focus note.** Their first test ran in a hidden browser pane, where animation frames don't run. In a visible window, Edit statuses and Event types keep focus, as my own check found. Their real cases are fixed in their own code.
  - The safety net is on hold (plan §16): nothing is built unless a re-test in a visible window finds a case.
- **2026-11-06 — L-02 planned (plan §19), and a catch found in the plan as written.**
  - The plan makes the page area a CSS container. Before Chrome / Edge 129 (September 2024) and Safari 18.4 (iPadOS 18.4, March 2025), a container also made `position: fixed` pop-ups inside it measure from its corner, not the window's.
  - Shown on Star's Grading page at 820 × 1180 touch, with the old rule copied into today's Chrome: Noah Chen's grade list opens 72 px right of and 48 px below its cell. With today's rule it opens in its place. Black Belt's grade list and measured-number box and the "kept" notes are drawn the same way; dialogs and ⋯ menus aren't affected.
  - Question to Jeffrey: A, the container switched on only where it's safe, or B, no container, with the shared code measuring the room (my pick). Picture: `Questions/L02-measure-room.html` / `.png`.
- **2026-11-06 — Jeffrey: "B: shared code"** (L-02). No container query: the shared code measures the page area beside the panel, and a roster sets a class when the room is below its own limit. Dialogs and ⋯ menus keep following the window, and no tablet check is needed. Rulebook row: v1.130, with a "(See v1.130 …)" note on v1.053.
  - Before writing it: `main` had moved to f40bd36 (Camps' Fill in, with rulebook rows v0.740 and v0.741). The rows were set aside and merged back the same way as at 1751e82. The only conflict was the header; the added lines match the backup exactly.
  - Next free in this block: **1.131**. L-02's build waits on Jeffrey's go (plan §19).
- **2026-11-06 — Jeffrey: "Yes, build it"** (L-02's shared part, plan §19). Built:
  - `src/lib/pageRoom.js` (new): the room beside the panel, `usePageRoomBelow(px)` for a roster, `usePageRoom()` for the parts sample, and `useMeasurePageRoom(ref)`, which `Shell.jsx` calls on its page area. A comment in `src/lib/useMediaQuery.js` points to it.
  - A parts-page sample, `parts.html#L02/room` (`src/parts/L02.jsx`, `PartsPage.jsx`, `parts.css`): a small window with a gray panel, Window and Panel choices, and a sample roster that stacks under its 640 px limit.
  - Checks: a store group in `src/lib/shared/checks.mjs` (24 groups pass); a new browser check, `tools/check-room.mjs` (19 of 19 pass; with the `Shell.jsx` line taken out, its room checks fail and the others pass); `tools/shoot-parts.mjs` knows L02.
  - Proof that nothing on screen changed: 92 pictures (23 screens at the four sizes) taken before and after are identical, except the camp page's live "Updated [time]" clock (taken three times: after the build, after the review fixes, and with the final code). After `main` brought Camps' new area above its roster (v0.742), the camp page was pictured again on the new code with the `Shell.jsx` line off, then on: identical except the clock. Both builds pass, and all 19 check files pass. The real build doesn't contain the preview-only line.
  - The room is the page area's width (the window less the panel), less a scrollbar's width on a device whose scrollbars take room, whether or not the page scrolls. Measured: 683 with a mouse 596 px; 700 touch with Largest 604; 1024 with a mouse and Largest 913; a 390 phone 390. (This hidden Chrome draws scrollbars that take room at 768 px and wider even with touch on, so its iPad-sized rooms are 15 px less than a real iPad's: 744 → 657 here, 672 on an iPad mini.)
  - For the sections (the check's report): at 683 with a mouse, 4 Color Belt cells and 8 Star cells are wider than their room, and Camps' table is 127 px wider than its box; at 768 with Largest, Camps' table is 26 px wider; at 1024 × 768 with Largest, nothing overflows in any of the three.
  - **Reviews** (fresh agents, 2026-11-06), no must-fix in either:
    - Design: pass. Fixed: the sample window's inside is now exactly the chosen width (its edge was inside it: 2 px less); a gray note when the screen is too narrow for the chosen window; a second sample state with 683 px and Largest pressed; "px" kept on the same line as its number; three wordings in v1.130; one wrong sentence in plan §19.
    - Code: four should-fixes, all done. (1) A roster drawn together with the frame showed its old layout for one frame: one change of state after the first measure fixes it (5 of 5 loads showed "…" first without it, 0 of 5 with it). (2) Measuring the page's real scrollbar let a roster's layout switch change the room and flip it back (with "ResizeObserver loop" errors): the room now leaves out a scrollbar's width whether or not the page scrolls, and the observer watches the box's outer size. (3) The header now names the whole window rule (the rest of the page, dialogs, ⋯ menus, mouse button sizes). (4) The report now looks at each cell and box, not only whole rosters. Nits done: a check that no container sits around the page area, no padding subtraction, no touch-scrollbar assumption, the env line's comment.
    - Re-check of the code fixes (same reviewer): the four are resolved (its own test: 0 of 8 loads drew "…", 12 of 12 before). One new should-fix, done: the check's "no ResizeObserver loop error" part couldn't fail, because nothing switched during it, and one warning per switch was still left (from Shell's other observers of the same box, when a switch makes the page's scrollbar come or go). Now the room is measured one frame after a change of size (`ConfirmBox.jsx`'s way), and the check has a stand-in roster that really switches. With the old measuring it fails with exactly those warnings, one per switch; with the new, it passes.
    - For the sections (the reviewer's nit): this hidden Chrome draws scrollbars that take room at 768 px and wider even with touch on, so in review pictures an iPad-sized room is 15 px less than on a real iPad (820 × 1180: 733 here, 748 on an iPad). A limit within 15 px of a review size would show stacked rows in the pictures but columns on the iPad.
  - Before reporting: `main` had moved to d985896 (Camps v0.742, the area above its roster). Merged the same way: only the header and the two row places conflicted, and the added lines match the backup exactly. Checks re-run on the merged code: 18 of 18, both builds, 19 of 19 check files.
  - Shared files touched (CLAUDE.md's list): the rulebook only (v1.130). Also `Shell.jsx` and `useMediaQuery.js`, which every section uses.
- **2026-11-06 — L-02's shared part committed** (Jeffrey: "Yes, commit"; proof picture `Proof/L02/L02-built.png`). Not pushed, not merged.
  - Before committing, `main` had moved to 495f1b1 (Camps' Record refund, v0.743 and v0.744). It was merged in the same way: only the header and the two row places conflicted, and the added lines match the backup exactly. Both builds and all 19 check files pass on it. The room check last ran on d985896; main's later commits touch only Camps' refund files and the rulebook.
  - The commit also holds R2-05's decided rows (v1.125–v1.129) and their question pictures, which waited uncommitted until now.
  - Next: tell Main it's ready to merge, naming who adopts it (Color Belt, Star and Camps, whose L-02 items now use `usePageRoomBelow` and a class instead of `@container page`) and who has nothing to do (Black Belt).
- **2026-11-06 — L-02 is live.** Committed as c769eb1. Main merged it into `main` as 51ca85c and pushed it on Jeffrey's "Merge and push"; Cloudflare deployed it (Main's report: both builds, the dist scan, all checks and the 174 function tests passed). Main told Color Belt, Star and Camps to start their own L-02.
  - This branch moved to 51ca85c (`git merge --ff-only main`; checked: `origin/main` is 51ca85c too).
  - R2-05's build still waits on Jeffrey's go.

## 4. Next

1. **Jeffrey, one at a time:**
   - ~~which proof pictures go into the commit~~ — **decided: A, v1.110**;
   - ~~D4 (M5's two-school download name, WCAG 2.5.3)~~ — **decided: A, v1.111**;
   - ~~D6 (M4's 600 weights vs §7)~~ — **decided: A, 500, v1.112**.
   Every design review point is now settled.
2. ~~**Commit on `dashboard-core`**~~ — **done 2026-10-28**, not pushed. Shared files touched: `src/App.jsx`, and the rulebook (v1.110, v1.111, v1.112; v1.100–v1.109 were in 712e3a6). The merge commits 524bd6b and 6626920 hold only main's work.
3. ~~**Commit the fact fixes** (v1.113)~~ — **done 2026-10-28**, not pushed.
4. ~~**Merge `dashboard-core` into `main`**~~ — **done 2026-10-28: 95a9601** (the Main session, `--no-ff`, no conflicts; pushed later, live). The request was sent on Jeffrey's "Send it to Main"; it queued without reaching Main until Jeffrey pointed Main to it. CLAUDE.md's shared-files list gained `src/styles/shared.css` and `src/components/text.js` (4c15146, code review N6).
5. **The date picker opener option** (§11, Finance's v0.817): ~~Jeffrey reviews `Proof/parts/DP-built-vs-F1.png`~~ **OK'd 2026-10-28** ("OK: record and commit"), rulebook **v1.114**, committed on `dashboard-core` as 1bb2683, **merged into `main` as a287ee5** and **live** (pushed with `main` c975428, 2026-10-28). The notes to Finance ("Daily report finance tab": how to use the opener) and Star (its date fields get the re-placement fix) were held by those sessions and not delivered (different permission modes); Jeffrey has the texts to paste.
6. **The count cards' two-line note** (Star's v0.518: Q5 B / Q5b A, passed on by Main; Jeffrey: "Yes, build it"): built and reviewed (approve), 79 of 79 checks; **OK'd 2026-10-28** ("OK: record and commit"), rulebook **v1.115** (§12), committed on `dashboard-core` as 5628133 (not pushed). The note to Main that it is committed and reviewed was held by Main's session and expired undelivered (the two run in different permission modes); Jeffrey passed it on. **Merged into `main` as a287ee5** and **live** (pushed with `main` c975428, 2026-10-28). The note to Star (how to pass two lines) was held too; Jeffrey has the text to paste. Star's switch to the shared card is Star's own work.
7. **"Show all" on touch screens** (merged into `main` as 7b665af on 2026-11-03, the Main session; not pushed) (Star's design reviewer, passed on by Main; `Questions/M6-show-all-on-touch.png`): Jeffrey chose **A, inline** (2026-10-29). The first build's invisible tap box didn't fit, and Jeffrey then chose **(a) room for the box** (2026-10-29, "Room for box"; `Questions/M6-show-all-tap-area.png`). Built (§14): 91 of 91 checks, pixel-identical to his option (a) on Star's screen (`Proof/parts/M6-show-all-built-vs-a.png`). Reviewed: **ready** after its fixes (re-review, 2026-10-29). **OK'd 2026-10-29** ("Yes, record it"), rulebook **v1.117**, committed on `dashboard-core` as **2bf89c6** on top of `main` 5f28ed9 (not pushed). Jeffrey's go to merge: 2026-10-29, "Yes, tell Main"; passed on to Main, not delivered within 20 s (Jeffrey has the text to paste). Next: Main merges it into `main`; Star gets it with `git merge main`.
8. **The dropdown and time list turned off** (Finance's v0.823, "C, via Dashboard core"; §13): built, reviewed (ready; its should-fixes done), 87 of 87 checks; rulebook **v1.116**; committed on `dashboard-core` as **cc92332**, **merged into `main` as e3e46d4** (2026-10-29, the Main session, no conflicts) and **live** (pushed with Jeffrey's OK the same day; the Cloudflare deploy succeeded). Main told Finance it can merge `main` and build F2 with `<TimeList disabled={!on} … />`.
9. **Step 2 — the dashboard's own screens** (`docs/Design Review/End review/Prompts/2-DashboardCore-step2-main-screens.md`): the top bar, Home, the account dialogs and menu, Staff accounts and Settings (design review M12–M14, M17; M15 with Color Belt; M16 later). **M15's joint plan agreed 2026-11-04**: Color Belt builds all of it on `color-belt`, and Dashboard core reviews the Settings fit (see the log). **M12 done 2026-11-05** (plan §17; rulebook v1.123, v1.124): committed as cb2d072, not merged yet. `git merge main` first; rulebook rows take the next free number in 1.100–1.199. **Camps waits on M12** (the one offline bar, v1.005): its C19, the last Camps design-review item, removes the camp page's own "Couldn't refresh" bar once the shared bar is on `main` (Camps' request through Jeffrey, 2026-11-05). When M12 is merged, tell Main so it passes the word to Camps.
10. **A larger side panel for the Grandmaster** (Jeffrey via Main, 2026-10-29: "Add to Dashboard core: a side-panel toggle for a large panel with names under the icons, for the Grandmaster"). It is its own item, not part of step 2. If its switch lives in Settings or the account menu, step 2's designs of those include it.
   - Research done (plan §15).
   - ~~Question 1: which look~~ — **decided 2026-11-03: B**, the same 72 px panel with 14 px names on PC and tablet, as **each person's own setting** (Jeffrey keeps today's panel). That also settles who can use it: everyone, each for themselves. Picture: `Questions/SP1-large-panel-look.png`.
   - Then: "Also allow for bigger icons as well".
   - ~~Question 2: the setting's shape~~ — **decided 2026-11-03: three sizes**, one choice per person: Standard, Large (B) or Largest (C). Picture: `Questions/SP2-three-sizes.png`.
   - ~~Question 3: who changes it, and where~~ — **decided 2026-11-03: each person**, in their own account menu (a "Panel size" row like "This device"). Picture: `Questions/SP3-who-changes-it.png`.
   - ~~Question 4: how it's remembered~~ — **decided 2026-11-03: with their account** (Supabase's per-user settings, no migration). Picture: `Questions/SP4-remembered.png`.
   - **The mockup** (`Mockups/SP-panel-size.png`): **OK'd 2026-11-03** ("OK, build it"); rulebook **v1.118**.
   - **Built 2026-11-03:** 38 of 38 checks (`tools/check-panel.mjs`); proof `Proof/panel/SP-built-vs-mockup.png`. Code and security review: done, its fixes made. Design review: ready after small fixes, made; its re-check found them all fixed. **Committed 2026-11-03** on `dashboard-core` as **2baea38** (Jeffrey: "Yes, commit"), on top of `main` 5f1db41; not pushed. `main` merged in up to e7fd75b (merge commit **723c302**; the checks pass). Jeffrey's go to merge: 2026-11-03, "Yes, tell Main"; passed on to Main (queued, not confirmed read). **Merged into `main` as 942cfdd** (2026-11-04, the Main session, on Jeffrey's own request there; the rulebook's three conflicts kept both sides, main's first), and this branch moved forward to it. **Live:** Main pushed `main` 942cfdd on Jeffrey's "push" (2026-11-04). The Cloudflare deploy succeeded, and the live site's code has Panel size.
11. **Shared-file notes from other sessions** (passed on by Main, 2026-11-03). For the to-do list only: none is approved work yet, and each needs Jeffrey's go before anything changes. **All six done 2026-11-04**, each with Jeffrey's go (rulebook v1.119–v1.121), committed as 2b859b4, merged into `main` as 801b757, and **live**. What's left are the notes for other sessions below (Finance, Camps, New students, Black Belt, Color Belt).
   - **New students (N13, not on `main` yet):** a turned-off `.tib` (the shared icon button) has no turned-off look, and still shows its hover and its tooltip. **Done 2026-11-04** (Jeffrey: "A, tooltip shows"; rulebook v1.120; checked). Committed as 2b859b4.
   - **One look, three copies:** the bordered icon button exists as Finance's `.fin-ibtn`, `parts.css`'s `.parts-ibtn`, and New students' new `.tib--outline` in `shared.css` (a copy of Finance's look). Finance could switch to `.tib--outline` later.
     - **2026-11-04** (Jeffrey: "Finance does it"): the parts page's copy is gone (committed as 2b859b4).
     - Finance's switch is Finance's, after this cleanup is on `main`. The note to paste is below:
       > Finance: switch your bordered icon buttons to the shared one, after Dashboard core's cleanup (rulebook v1.119–v1.120) is on main (`git merge main` first). Nothing on screen changes.
       > (1) `DayReport.jsx`: Previous day, Next day and the calendar button take `className="tib--outline"` (Next day keeps its `aria-disabled`: the shared look grays any button with `aria-disabled="true"`, so `is-unavailable` isn't needed).
       > (2) `HistoryView.jsx`: Previous month and Next month, the same.
       > (3) `finance.css`: delete the copy (`.fin-ibtn.tib`, `.fin-ibtn .tib-box`, `.fin-ibtn.is-unavailable` and its `.tib-box`, about lines 142–162; in the hover section, `.fin-ibtn:not(.is-unavailable):hover .tib-box` out of the rule it shares with `.fin-hidden-chip:hover`, keeping the chip's; in the touch section, `.fin-ibtn.tib` and `.fin-ibtn .tib-box`). The first button's tooltip rule (`.fin-dayrow > .fin-ibtn:first-child .tib-tip` and its `::after`) becomes `.fin-dayrow > .tib:first-child …`.
       > Check: the Daily report and History at the four sizes look as before (at rest, with the pointer on ‹ and on the gray ›, and the tooltips). `shared.css`'s `.tib--outline` is then the only copy.
   - **From Camps:** `shared.css` around lines 1687–1688 still mentions `camps.css`'s `.cp-popover`, which Camps removed. A harmless out-of-date comment. **Fixed 2026-11-04** (Jeffrey: "Yes, fix both"); committed as 2b859b4.
   - **From New students** (passed on by Main, 2026-11-03): the pale green `#eaf3de` is typed out by hand, with no shared color setting in `tokens.css`. On `main` 5f1db41 it appears 7 times in 6 stylesheets: `shared.css`, `finance.css` (twice), `camps.css`, `testing-events.css`, `forms-public.css` and `blackBelt/form/form.css`. On 942cfdd, New students' N14 added one more, in `forms.css`: 8 times in 7 files, one of them in a comment.
     - **2026-11-04** (Jeffrey: "A, setting + notes"; rulebook v1.121): `tokens.css` has `--color-success-bg` (#EAF3DE) and `--color-success-border` (#CFE3B8) next to `--color-success-text`, and `shared.css`'s green tag uses them. Committed as 2b859b4.
     - Each section switches its own copies once this cleanup is on `main` (`git merge main` first). Nothing on screen changes. The notes to pass on:
       > **Camps:** `src/styles/camps.css`, `.cp-dc--came` (about line 763): `border-color: #cfe3b8` → `var(--color-success-border)`, `background: #eaf3de` → `var(--color-success-bg)` (rulebook v1.121: use the settings, don't type the colors).
       > **New students:** `src/styles/forms.css` (Fill in's Sent tick, about line 946) and `src/styles/forms-public.css` (the family page's tick, about line 496): `background: #eaf3de` → `var(--color-success-bg)` (v1.121). Both pages load `tokens.css`.
       > **Finance:** `src/styles/finance.css` lines 13–17: `--fin-ok-bg: #eaf3de` → `var(--color-success-bg)` and `--fin-ok-border: #cfe3b8` → `var(--color-success-border)` (or use the shared settings directly where `--fin-ok-*` are used); the comment on line 13 can then name the settings (v1.121).
       > **Black Belt:** `src/blackBelt/form/form.css`, the family form's tick circle (about line 765): `background: #eaf3de` → `var(--color-success-bg)` (v1.121). The form loads `tokens.css`.
       > **Color Belt** (after its current work in that file): `src/styles/testing-events.css`, `.gr-res-pass.is-chosen` (about line 750): `background: #eaf3de` → `var(--color-success-bg)` (v1.121).
   - **From Camps' C10 review** (passed on by Main, 2026-11-03): in the shared `CountCards.jsx`, pressing Show all with the keyboard sends focus to the page, when it should go back to the card that was on. Star does the same, so the fix belongs in the shared part.
     - Checked: Show all sits in the gray line, which disappears as soon as the filter is off. The focused button goes with it, and nothing moves focus first.
     - It's a miss in this branch's own part (v1.117's Show all), and its reviews didn't catch it.
     - Likely fix: focus the card that was on, then clear the filter. The look doesn't change.
     - **Fixed 2026-11-04** (Jeffrey: "Yes, fix it"; rulebook v1.119; checked). Committed as 2b859b4.
   - **From Black Belt** (passed on by Main, 2026-11-04): `src/lib/times.js`, lines 5–6, still says Black Belt picks times every 15 minutes. Since BB13 (live on `main` 2e806e7), it uses the shared time list: every 5 minutes, 6:00 AM–10:00 PM.
     - Checked: the whole sentence is out of date. On `main`, Star, Camps and Finance use the shared list too; only Color Belt doesn't yet.
     - A comment-only fix, best done with the next shared-file change. **Fixed 2026-11-04** (Jeffrey: "Yes, fix both"). It now names no section, so it can't go out of date again. Committed as 2b859b4.
12. **The Design Review's rolling check, pass 1** (`docs/Design Review/Rolling check/Pass 1/Fix-DashboardCore.md`, on `main` since 5087732).
   - It has 6 "fix now" items (R2-05, R4-07, R1-08, R4-09, R3-12, R3-13), 11 that wait on Jeffrey, and a "smaller" list.
   - Four of the smaller ones are item 11's: the `.cp-popover` comment, the turned-off icon button, the three bordered copies, and the pale green.
   - Waits on: Jeffrey pasting its starter here. Then a plan, and pictures for anything that changes how a screen looks.
   - **Started 2026-11-04** (Jeffrey: "The fix list"). The plan is plan §16, in six steps:
     1. R4-07, privacy;
     2. small fixes: R4-09, R3-13, and the Mark paid box on phones;
     3. R2-05, the Undo queue;
     4. R3-12, the dropdown's unavailable state;
     5. R1-08, unavailable plain buttons and tags;
     6. two refactors, nothing to see.

     The plan was OK'd 2026-11-04 ("Yes, start R4-07"). Step 1, R4-07, is built, reviewed, checked and committed as **23d618d** (2026-11-05, Jeffrey: "Yes, commit"; not pushed, not merged).

     The hold (2026-11-04) was lifted 2026-11-05, and `main` 3a8dc70 is merged in as a78ea18 (see the log). Main was told R4-07 is ready to merge (2026-11-05; not delivered within 20 s, so Jeffrey has the text). It was merged into `main` as 7511656 the same day, and is live. Jeffrey put M12 (step 2, item 9) first, because Camps waits on it; the fix list's step 2 comes after M12.
13. **Notes from Main, 2026-11-05** (to-do only; none is approved, and each needs Jeffrey's go):
   - `src/styles/shared.css` ~line 2204: a comment names prospects.css's `.pkv` / `.pkv-btn` / `.phistory-btn` / `.phistory-label`. None of them exists in `src/` any more (checked): New students' profile window replaced the side panel. Comment-only; best done with the next `shared.css` change.
   - The shared receipt's `@page rcpt-receipt` (`shared.css` ~2011: 0.6in × 0.7in margins) is overridden in print by Finance's unnamed `@page { margin: 0.6in }` inside `@media print` (`finance.css` ~1120), as Main reports (not checked in print here). Harmless today. New students fixes the same for its visitor sheet by copying Color Belt's / Black Belt's ResultsSheet pattern: an unnamed `PAGE_RULE` `<style>` inside the print portal.
   - (2026-11-06: this receipt note is now pass 2's P-04, below.)

## 5. Rolling check, pass 2

Fix file: `docs/Design Review/Rolling check/Pass 2/Fix-DashboardCore.md`. Plan: plan §19. No migration.

- **L-02**, rosters follow the room beside the panel (v1.053): Jeffrey chose B, the shared code measures the room (v1.130). Built, reviewed (code and design, with a code re-check) and committed as c769eb1; merged into `main` as 51ca85c and live since 2026-11-06. Color Belt, Star and Camps now switch their rosters (their own L-02 items; Main told them).
- **L-03**, touch tap areas 44 px, not 42, with R4-09's correction (`-2px 0`): planned, with R4-09.
- **L-05**, Panel size's bar ends "Check the connection, then retry." (v1.055): planned, with the shared words.
- **L-06**, a turned-off drag handle looks turned off: planned. One small picture first.
- **Smaller:** P-04, the receipt's own page margins in print (item 13's second note), and L-10, page tabs and sort headers 44 px wide on touch: planned.
- **C-04 and C-06:** decided in v1.055. Nothing to build here.
- **Corrections to pass 1:** R2-04 also covers full-screen dialog pages, R1-07's mockup includes the Paying by line, and R4-09 uses `-2px 0`. Each goes into its item's plan.

### The shared-parts batch (2026-11-07, under P8)

Main relayed Jeffrey's "Yes to your question" (one batch of every shared part the sections wait on). **Built, reviewed, not committed; rulebook v1.131.**
- **Built:** R2-05 (toast line, save line, "Undoing…", PageBar under the top bar; Settings and Staff accounts switched); R1-08 (page-wide unavailable gray); R4-09, L-03, L-10 (sizes); L-06 (grips: the hook marks them); R3-06 (`BackLink`); P-04 (`PrintPageRule` in the receipt); the shared words (R2-07, S-2 with my four lines and the sign-in Retry, R3-13, R1-07 toasts, R1-06, R2-09); Color Belt's two L-02 findings (page area positioned; Mark paid box kept inside the page area).
- **Added from Black Belt (via Main):** `PaidByField` takes a `label` (default "Paid by"), so Record refund's "Refunded by" needs no local copy. Black Belt's question to Jeffrey about the shared Date signed's forced weekday is open; Main will pass on his answer.
- **Added from Black Belt (via Main), 2026-11-07:** the shared `ChoiceGroup` takes `fill`, `compact`, `locked` and an amber border for `invalid` (Black Belt's Q2, Jeffrey: "What you recommend"); no existing caller passes `invalid`, so nothing changes on a screen. Date signed: Jeffrey accepted the shared weekday for Black Belt ("Yes what you recommend"): nothing to build. Black Belt switches its own `Choice` and Refunded-by copy after this merges.
- **Committed 2026-11-07 as 480fc9e9** (Jeffrey: "Yes, commit"). `main` then moved twice (Black Belt, then 38934d70: Finance, Star, Color Belt, Camps, Black Belt batches); the merges were done in this branch. At 38934d70 only the rulebook (kept both sides, header 1.131) and `Settings.jsx` (Color Belt's Classes and ranks section kept, with my `PageBar`) conflicted.
- **Added after Main's list (New students' batch review):** the shared `Select` takes `group` on an option and is 44px tall on touch; the shared Date signed label is 13px on every device (the hint 12px). `check-batch` has a check for each (7 of 7).
- **Independent review of the batch (Main's code review, 2026-11-07): fixed.** (1) A bar's Retry is single-flight and the bar shows `retrying`: a double press runs the Undo once. (2) `begin()` returns a token and `end()` ignores a stale or tokenless one while an Undo holds the line; the R205 sample shows the try/finally. (3) `check-batch` now has the L-10 check (touch tabs and sort headers ≥ 44px, in the app) and a red-Delete check; the 30-second give-up and the double Retry are in the shared checks (39 groups). (4) The stale comment in `shared.css` is corrected. **Visible changes of the page-wide gray, for the record:** Staff accounts' Reset password dialog (Generate, Copy: they carried `is-unavailable` with no gray rule before), Camps' Fill in Cancel and Send while saving, ErrorBanner's Retry while retrying, and a busy Delete (a ready Delete stays red: checked). (5) Signing out now ends the left-bar session (`endLeftUndoBarSession`): an Undo still running can't show a bar to the next person. (6) The save line gives up on an Undo that never answers after 30 seconds (the bar says "Undo didn't save", the line is free), and `no_access` leaves the same bar for after the unlock.
- **Second independent re-check (Main, 2026-11-08, head d8434aee): 8 Low, fixed in a follow-up commit (rulebook v1.132).** (1) Camps' busy cp-btn-danger is now fully gray (red only when ready); (2) Star's 12px label override is gone (13px everywhere); (3) a Select heading click no longer takes focus; (4) moving to a group's first choice keeps its heading in view, and the heading rows are ria-hidden (each choice says its group); (5) v1.132 written, counts corrected; (6) regression checks added to check-batch (14 of 14): the Mark paid box at 390 against the bottom bar (fails on the old rule: the box ended at 816, the bar starts at 783), locked arrows, compact Paid by, the dashed busy tag and its cursors, Select arrows by choice, the Camps Delete; (7) the R205 sample has a catch; (8) a hanging first save in Neither change saved is given up on, a Retry after sign-out says no Undone, the header notes the 
o_access-with-a-reason Retry and a late answer after a give-up. Leftover Past dates wording is in the sections' own copies (Black Belt PAST_DATES_HINT and DayDialog.jsx, Star PRIVATE_DAY_HINT and TESTING_DATE_HINT, Color Belt PAST_DATES_HINT, curly apostrophes): theirs to switch in their R3-13 items.
- **LIVE 2026-11-08.** The batch (d8434aee) was merged into `main` as cd76bfb8 ("Merge now, fix after"), and the follow-up (1538fa38, the 8 Lows, v1.132) as 166719a5 ("Merge and push"); Cloudflare built and deployed both. This branch is at 166719a5 (`git merge --ff-only main`). Main told Star, Black Belt, Camps, Color Belt, New students and Finance to start their waiting batches.
- **What is left to build here (nothing waits on a session):** R1-07's second part (payment line and History words: one picture, Jeffrey picks a set); R2-04 (the toast's own room, with a picture for the full-screen detail case); R3-12 (the Select's unavailable state; a small picture); step 2's M13, M14, M17 and M15 (with Color Belt); the ⋯ menu's focus after a choice and the tooltip's hover/Esc; the §7 Delete-on-hover wording question. Waiting on Jeffrey: his starter text for step 2.
- **Not built:** R1-07's payment line and History words (needs Jeffrey's pick from a picture of the four versions: one question for the next message to him); P-02 is New students' own line; R4-08 is Star's own (it uses the new gray); R3-12 and R2-04 are not in this batch.
- **Proof:** checks `check-undo` 11, `check-batch` 14, `check-room` 19, `check-offline` 31 (updated for `.shell-bars`), `check-panel` 38, shared checks 40 groups, 19 check files, both builds. The 92 app pictures against a clean copy of main differ only in the camp page's live clock and the touch tab widths (L-10, intended).
- **Reviews:** code (no must-fix; fixed: a left page's Undo bar kept after the session ended, a 30-second give-up on "Undoing…", a stale sign-in notice, a Retry that could stay unavailable) and design (nothing serious). Not changed, for the sections: Black Belt's price plan grip turns gray with one plan (it draws the grip with nothing to drag); grips go gray while a ⋯ menu is open (the section's `enabled` includes it); busy buttons should set `aria-busy` to keep the busy cursor; the delete button, ErrorBanner's Retry and Camps' Fill in Cancel/Send turn gray while busy (v1.103).
