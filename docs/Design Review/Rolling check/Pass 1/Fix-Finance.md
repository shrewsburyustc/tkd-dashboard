# Finance — fixes from the design review's rolling check (pass 1)

**Paste into:** the Finance session.

This file reaches your worktree when `design-review` is merged into main; until then the Design Review session sends its text by message.

**Starter to paste:**

> `git merge main` first. Then read and do `docs/Design Review/Rolling check/Pass 1/Fix-Finance.md`: the fixes the design review's rolling check found in your merged work. Plan first. Mockups first for anything that changes how a screen looks. Nothing is built before I OK it.

---

## The brief

The design review's rolling check (phase 1d) looks at each section's design-review work after it merges: against the rulebook, the approved mockups, and the other sections that do the same job. Pass 1 covered `main` up to 5f1db41 (2026-11-03), in preview mode at the four sizes. Four reviewers looked (R1 money · R2 changes, mistakes and safety nets · R3 lists, menus and pickers · R4 item-by-item conformance and privacy). Two separate checkers then verified every finding. This file is what they confirmed in your merged work (F1–F7; F8 was live already) and in how the other sections' payments reach your Daily report.

- **Fix now:** straight fixes. Plan them, show Jeffrey, then build.
- **Waits on Jeffrey:** a rule must be picked first. Don't build these yet. The biggest one, R1-01, is your rule.
- **Smaller:** fix them while you're in the file.
- Each item keeps its finding id (R4-12, R1-09 …) so Jeffrey can trace it. Use the id in your plan, status file and commits.
- **Line numbers** are main 5f1db41's; they may have moved.
- **Paths:** `HistoryView.jsx`, `HomeReminders.jsx` and `DayReport.jsx` are in `src/screens/finance/`; `finance/text.js` is `src/screens/finance/text.js`; `finance.css` and `forms.css` are in `src/styles/`; `mockFinance.js` is `src/lib/mockFinance.js`; `0026` is `supabase/migrations/0026_finance_black_belt.sql`.

### Rules

- Follow CLAUDE.md.
- **Preview mode for building and trying changes:** `npm run dev:preview-mode`. `npm run dev`, `npm run preview` and `Start dashboard.bat` use the live database (`.worktreeinclude` copies `.env.local` into every worktree): run them only for a check Jeffrey OKs, never to try a change. `npm run build` is fine: it only builds.
- **Plan first:** a short plan (each item, its files, its mockup, any migration) in your docs folder; show it to Jeffrey.
- **Mockups before code** for every visual change, at PC 1280×800, tablet 820×1180 touch, phone 390×844 touch and 320 wide: a self-contained HTML file plus one PNG per screen with what changes outlined in amber (Jeffrey reviews the PNGs). He OKs them one screen at a time, before any code.
- One decision at a time, with pictures.
- **Reviews:** a separate design reviewer (the rulebook, the approved mockups, screenshots at the four sizes, and §4's six WCAG 2.2 checks, v1.033); a separate code reviewer; a separate security reviewer for anything touching the database (handoff §6).
- **Don't change a shared part on your own** (`src/components/…`, the shared helpers in `src/lib/`, `src/styles/shared.css`): every section uses them. If you need something a part can't do, ask Jeffrey first. He decides whether you change it in your branch (then list it as a shared file) or the Dashboard core session does.
- **Order (a push to main deploys):** the migration is live before the push that brings the app that uses it. A step whose app calls a new or changed database function is merged only after Jeffrey has applied its migration and the checks passed (fingerprints, security advisor, tests file — CLAUDE.md). Screen-only steps can go first.
- **Migrations:** only the Export smaller line needs one. Follow handoff §6 (`docs/Dashboard Docs/TKD-Dashboard-Handoff.md`), with a SETUP section "## Migration 00NN: …" and a `step00NN` in `supabase/tests/pglite/run.mjs`. Run the PGlite tests with `cd supabase/tests/pglite && npm ci && node run.mjs` (`npm ci` once per worktree).
- Keep `docs/Finance/TKD-Finance-Status.md` current (§18 onward), with a short "Rolling check, pass 1" part.
- Commit on `finance` after each reviewed step. Never push.
- List every CLAUDE.md shared file you touch (`src/styles/shared.css` and `src/components/text.js` are on that list).
- When a step is done, send the Main session a short report: Done (with the commit) · Needs Jeffrey (one question, options, your recommendation) · Next.

### Rulebook

- New rows only for what Jeffrey decides in your mockups. Your block is **0.800–0.899**: take the next unused number (check the rulebook first).
- Run `git merge main` first, and re-read the rulebook right before editing.
  - The 10b row goes just above `| Approved 2026-10-16 (v0.26) |`, and the changelog line at the end of §11.
  - Bump the header's Version / Last updated, and keep CRLF.
- A row that changes an older one adds a "(See v0.8xx …)" note at the start of that row.

---

## Fix now

Most severe first.

### R4-12 (= R3-06's Finance part) — "← Back to the day" is 28 px and pushes the heading down on touch · Low

- **What's wrong:** History's back link (`.fin-back-link`) is 28 px tall, not v0.820's 24 px. On touch it becomes a plain 44 px box that pushes the "History" heading down: R4 measured the heading's top at 224 px at 1280, 250 at 820 touch, and 260 at 390 and 320 (16 px of the 26 px jump is the link; the rest is the taller month arrows on touch, which stay). Forms' builder copied `.tc-back`, whose touch box is pulled back with negative margins, so its title stays at 124 px on both PC and tablet. (Your status says the style question "settled itself", status line 204: that was the session's call, not Jeffrey's.)
- **Rule:** v0.820 ("blue text, 16 px arrow, 24 px tall, 44 px tap area on touch"); v1.020 (the v0.59 back link everywhere); v0.624.
- **Change:** `finance.css:98–105, 948–952` take `.tc-back`'s numbers (24 px tall, and the touch margins that pull the 44 px tap box back so the heading doesn't move), as Forms' `.fb-back` did (`forms.css:196–210`, copied from `src/screens/testing/chooser/chooser.css:90–104`). If Jeffrey later picks one shared back link (R3-06, below), switch to it then.
- **Check (preview mode):** History at 1280, 820 touch, 390 touch and 320: the link is 24 px tall with a mouse, its tap area is 44 px on touch, and the History row (`.fin-dayrow`) starts at the same height at 1280 and 820. The heading itself still sits a few px lower on touch, because the month arrows beside it grow from 32 to 44 px; that is right and stays.

### R1-09 — Preview only: Star payments never reach the Daily report · Low (preview only)

- **What's wrong:** Finance's preview keeps its own made-up Star candidates (`mockFinance.js:26–29`; its comment "Star testing has no preview database in this branch" is no longer true) and never reads Star's preview store `tkd.preview.star`. So a Star payment marked in the preview never reaches the Daily report: Lily Brooks's $140 card (Worcester, Nov 3) was missing from Worcester's Nov 3, while Shrewsbury listed the made-up Liam Walsh, Ava Rossi and Mason Hill for a "Star testing · Nov 24" that doesn't exist in Star's preview. It also hides Star's half of R1-01 from every preview check.
- **Rule:** the file's own promise: "What you see in preview is what the real dashboard will do" (live 0026 reads `star_payments`).
- **Change:** add a `readStar()` input next to `readCamps` / `readBlackBelt` (`mockFinance.js:367–414`) that reads Star's candidates, events and payments, with the school worked out the way live 0026 does (or the way R1-01's answer says, once it comes); keep the old sample only when Star's store has no payments. It is passed in where `src/lib/mockClient.js` creates the Finance backend (`:770–775`, next to `readCamps` / `readBlackBelt`). mockClient.js is a CLAUDE.md shared file: list it.
- **Check (preview mode):** mark Lily Brooks paid $140 by card on Worcester → Finance, Worcester, today lists "Star testing · [the Fall event's date] · $140.00" under Card.

---

## Waits on Jeffrey (don't build yet)

- **R1-01** (High) — when a family pays at one school's desk, which school's Daily report and drawer count the money? Today Camps books it to the desk's school, Black Belt to the candidate's school when paid, and Star to the candidate's *current* school (`0026:597–602`). Recommended: the desk that took it (This device), for every section. You own the rule; Star and Black Belt then change their record functions, and your read functions and R1-09's preview reader follow the answer. The design review asks Jeffrey; the answer reaches you through the Main session.
- **R1-05** (Medium) — camp money handed back: a Camps "Record refund" dated the day the money goes out, which you would read like Star's and Black Belt's refunds (recommended), or Camps' Edit payment as today, shown on the payment's original, already-counted day (v0.199). The design review asks Jeffrey; the answer reaches you through the Main session.
- **R4-05** (Medium) — while History's "not closed" marks are off (v0.821, v0.822), should Home's "N earlier days weren't closed" line go too? Today it leads to a History that shows nothing (`HomeReminders.jsx:131–135` doesn't read `SHOW_UNCLOSED`, `HistoryView.jsx:32, 53, 213`). Recommended: yes, the same switch. The design review asks Jeffrey; the answer reaches you through the Main session.
- **R2-07** (Low) — one set of words for "someone else changed it" and "Undo failed" (yours: `finance/text.js:200, 209`; "Close undone. The day is open again.", `:198`, is folded in). The design review asks Jeffrey; the answer reaches you through the Main session.
- **R2-09** (Low) — the ✓ and the full stop only on the account toasts (recommended: your "✓ Today's drawer is closed." and "✓ CSV downloaded", `DayReport.jsx:378, 689`, lose theirs, although your approved Daily report mockup draws the ✓), or on every success toast. The design review asks Jeffrey; the answer reaches you through the Main session.
- **R3-06** (Low) — one shared back link made by Dashboard core, which every section then uses (yours, after R4-12's fix, would switch to it). The design review asks Jeffrey; the answer reaches you through the Main session.
- **Row chevrons** (R3's S-11, Low) — History's rows end with a `ti-chevron-right` (`HistoryView.jsx:198`). The §2.4 map allows it ("go to a page"), but Star's events, Black Belt's cycles and Camps' camps open a page from a row with no chevron. One look for every list whose rows open a page? The design review asks Jeffrey; the answer reaches you through the Main session.

---

## Smaller (fix while you're in the file)

- Export loses "private": the report says "Star testing, private" / "Color belt testing, private", but the CSV's For cell just "Star testing", because `finance_export` builds its rows without `is_private` (`0026:1307–1330`; `finance_day` has it, `:1176`; the CSV is built in `src/lib/finance/csv.js:52`). Low; older than pass 1. It needs a new version of `finance_export`: replace only that function, starting from 0026's version (the live one), with a tests file, a fingerprints file and a `step00NN`. Ask the Main session for a migration number. Jeffrey applies it. The migration is live before the push that brings the app that uses it.
- F6's optional one-line ask (take Retry, Dismiss, Back, Close and Cancel from the shared words in `src/components/text.js`) has no recorded answer: status line 199 says F6 is done, with no ask, and `finance/text.js:214–215` keeps your own. Ask Jeffrey in one line, or record that it wasn't asked. Low.

---

## Done when

- Every Fix now item is built, reviewed and approved by Jeffrey in the preview: a design reviewer at the four sizes for visual changes, a code reviewer, and a security reviewer for anything touching the database or privacy (the Export migration).
- After the migration, its PGlite tests pass, Jeffrey has applied it, and the after-apply checks passed (fingerprints, security advisor, tests file).
- `npm run build` and `npm run build:preview-mode` pass, and so does `node src/lib/finance/checks.mjs`.
- What Jeffrey decided is recorded as rows from your block.
- The status file is current, and each reviewed step is committed on `finance`. No push.
- The report is sent to the Main session.

