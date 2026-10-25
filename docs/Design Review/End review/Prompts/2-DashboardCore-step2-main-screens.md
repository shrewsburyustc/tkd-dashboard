# Prompt 2 — Dashboard core, step 2: the dashboard's own screen changes (design review M12–M14, M17; M15 with Color Belt; M16 later)

**Paste into:** the Dashboard core session, **after step 1 is merged into main.** Keep that session open between the two steps (don't archive it). If it was archived anyway, ask the Main session how to start a new worktree on the existing `dashboard-core` branch. The short starter is below; the full brief follows it.

**Starter to paste:**

> Dashboard core, step 2. `git merge main` first (step 1 is on main now). Then read and do `docs/Design Review/End review/Prompts/2-DashboardCore-step2-main-screens.md` — the dashboard's own screen changes. Mockups first; nothing is built before I OK them.

---

## The brief

Step 1 built the shared parts. Step 2 changes **the dashboard's own screens**: the top bar, Home, the account dialogs, the account menu and Staff accounts, and Settings. These are the design review's "Main, step 2" items. ("Main" as an owner in the rows and the change list means this dashboard work, which is you. "The Main session" is the one that merges and reserves migration numbers.)

Same rules as step 1:
- follow CLAUDE.md;
- mockups first at the four sizes;
- a separate reviewer agent;
- one decision at a time;
- status file `docs/Dashboard Core/TKD-DashboardCore-Status.md`;
- no push.

Rulebook rows come from your block **1.100–1.199**, continuing after step 1's:
- the row goes just above "| Approved 2026-10-16 (v0.26) |";
- the changelog line goes at the end of §11;
- the header's Version / Last updated are bumped;
- CRLF is kept.

**Preview mode only**, as in step 1. Run `npm run dev:preview-mode`. Never run `npm run dev`, `npm run preview` or `Start dashboard.bat` here: this worktree has `.env.local`, so they would use the live database. For M14 this matters most: trying Change PIN or Change password there would change a real account.

### Read first

The rulebook rows named below (v1.000–v1.034), the change list `docs/Design Review/End review/TKD-DesignReview-ChangeList.md` §2.1 (M12–M17) and §6, `docs/Design Review/Walkthrough/Decisions.md`, and the pictures named. Each picture shows today in amber and the drawn options in green. Two also draw rejected options in green: 15c picture 6 and d2b pictures 5–7. Copy only the option the rulebook row names as chosen.

### Build now (in this order)

**M12 — one offline bar** (v1.005, §3.5; v1.032; picture `Walkthrough/05b-wifi-drops.png`).
- **Where and when:** amber, under the top bar, on **every page** while the device is offline **or after two failed refreshes in a row**. It goes away by itself when the connection is back.
- **"Failed refreshes":** the 15-second reloads in the shared `useLiveLoad` (moved in step 1, M10).
  - It already counts failures for each screen (`refreshFailing`: true after 2 failed reloads in a row).
  - The bar needs one place that collects them.
- **Testing it:** the preview can't fake failed refreshes today (picture 05b says so).
  - Plan a `__tkdPreview` helper for it.
  - That edits `src/lib/mockClient.js`, a shared file.
- **Words** (adapted from Star's approved message, as drawn in 05b): "You're offline. Changes won't save until the connection is back. Keep this page open — this bar goes away by itself."
- **What stays:** Star grading keeps its grade-by-grade line (v1.005).
  - Black Belt's grading, merged after the walkthrough, reuses Star's offline banner and adds one line of its own (`src/blackBelt/staff/grading/text.js`). Treat both like Star's.
- **To ask Jeffrey:** Black Belt's Results tab has its own offline bar ("You're offline. These results may be out of date…", `src/blackBelt/staff/results/text.js`).
  - Show it with the shared bar in your mockup.
  - Ask him whether it folds into the bar (like Camps') or stays.
- **What goes:** Camps' own refresh warning (v0.718) folds into the bar, and Camps removes it in its prompt (C19). Tell Jeffrey when the bar is ready so Camps can.
- **Check-ins need the connection** (v1.032): nothing is queued on the device. A Wi-Fi drop is covered by this bar, the failed tap's Retry and "Not saved" tag, and Print roster as the paper backup.
- **WCAG 2.2** (v1.033, §4): the bar must never cover the control the keyboard is on.

**M13 — "Both schools"** (v1.022; picture `Walkthrough/15c-both-schools.png`). Home's date line says **"Both schools"** on Both: `src/lib/dates.js`, which today returns "Worcester and Shrewsbury". The Schedule's and Camps' lines are their own sessions' work.

**M14 — Change PIN and Change password join the unsaved-changes guard** (v1.027 — Jeffrey's OK for v0.56's alignment; picture `Walkthrough/17b-unsaved-changes.png`).
- Files: `src/components/AccountDialog.jsx`, `src/screens/ChangePinDialog.jsx`, `src/screens/ChangePasswordDialog.jsx`.
- With typed changes, Esc, a click outside or Back keep the dialog open with the amber note "Unsaved changes. Save or cancel first."
- Phones add "Discard changes" (v0.56).
- **To settle in your mockup:**
  - Today a click outside does nothing, on purpose (`AccountDialog.jsx`: Cancel is the one way out).
  - Decide whether a click outside closes the dialog when nothing is typed, as in other dialogs (v0.46).
  - Picture 17b doesn't draw these dialogs, so your mockup must.
- **Security review.** These dialogs handle a password and a PIN, so they need one. It checks two things:
  - nothing typed is kept after the dialog closes;
  - the lock still closes an open Change PIN / Change password at once (`App.jsx` does this today; nothing is saved).

**M17 — Staff accounts can only be opened at the desk while Hide private details is on** (v1.000, end-review D2b; picture `End review/d2b-staff-emails.png`, picture 8).
- The account menu's **"Staff accounts"** grays: the approved unavailable look, still focusable, with one gray line under it, **"Off while private details are hidden."** It works like Star's desk-only New candidate (v0.507).
- **Your own email stays** in the account menu and on Set PIN.
- **To settle in your mockup:** the Staff accounts page itself, if it is open when the switch goes on (or opened by its address), shows the same line instead of the list.
- Files: `src/components/AccountMenu.jsx`, `src/screens/StaffAccounts.jsx`; the switch hook is `usePrivateDetailsHidden` in `src/lib/privateDetails.js`.

### Plan together with Color Belt

**M15 — Settings → Classes and ranks** (v1.023; picture `Walkthrough/15d-settings.png`). Large.
- Classes and ranks move from Testing into **Settings** (account menu → Admin), as a second part after Schools (v0.135).
- Color Belt keeps its testing prices, sparring gear and final award in a **"Prices"** tab. The tab's name is settled in the mockups.
- **Color Belt's session owns that code today (its item CB14).** Before any mockup, agree a joint plan with it (through Jeffrey): who builds which part, in which branch, and in what order.
- **Settle these in the mockups (open detail D6):**
  - Today staff can **view** Classes and ranks (v0.40), but Settings is admins only. Do staff keep a view?
  - The Schedule's and Forms' hints should point to Settings → Classes and ranks (new students' N11). Should they be links?
  - Settings ignores the top bar. How does it show each school's classes (one under the other)?
- **Database:** "same tables". Check whether any database change is needed. If one is, ask the Main session for a migration number, and the change needs a security review.

### Later — not in this step

**M16 — the top-bar people search** (v1.031; picture `Walkthrough/20a-search.png`).
- "Search people" on every page, across Color Belt, Star, Black Belt, Camps and Prospects.
- Results are grouped by section and show **name, event and school only**: nothing private, and Prospects keep "Ava R.". A tap opens the person's summary. The in-list search boxes stay, and the "/" key then works (§3.6).
- It comes **after the design review's fixes** are built, with its own design review and **security review**: one search across every section's people, with RLS, and nothing private in the results. It needs database work, so ask the Main session for a migration number when you plan it.
- Write its plan only when Jeffrey asks.

### Done when

- M12, M13, M14 and M17 are built, reviewed (design review at the four sizes; security review for M14) and approved in the preview by Jeffrey, and recorded as rows from your block.
- M15's joint plan with Color Belt is agreed and its mockups are approved, or it is scheduled.
- Both builds pass, the status file is current, and the work is committed on `dashboard-core`. No push. The Main session merges it when Jeffrey asks.
