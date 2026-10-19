# Star testing — build phase 1: Rubrics and prices (build plan)

**Status:** DRAFT 2026-10-18 for Jeffrey (reviewed once; fixes applied). Nothing is built yet. Nothing is pushed or deployed without Jeffrey's OK for that push.
**Built from:** rulebook v0.58–v0.61, v0.63, v0.66 (approved Rubrics mockups, `TKD-StarTesting-Rubrics-Mockups.html`, 12 screens), v0.59 (Testing chooser), v0.60 (Star testing pages), v0.171 (Dans in their own list); the live database 0006 (`CONTRACT-0006.md` §2.1, §4.1 read columns incl. `version`, §6.1); the way Color Belt's Testing screens are built today.

## 1. What phase 1 delivers

1. **The Testing chooser (v0.59).** Clicking **Testing** in the rail opens a short choice page — **Color Belt testing** and **Star testing**, each with its next event — instead of going straight to Color Belt. Mouse hover on the Testing icon shows the same two choices as a small menu beside it; keyboard works; touch devices always get the choice page. Each testing page gets a "← Testing" back link. The chooser appears only now that Star exists (v0.59).
2. **Star testing home (v0.60)** at `#testing/star`: title "Star testing", "← Testing", tabs **Events** and **Rubrics and prices**. It works on **Both** (one shared set for both schools, v0.58), unlike Color Belt, which needs one school.
3. **The Rubrics and prices tab**, exactly as the approved mockups (v0.66, 12 screens): the three Dan blocks (subjects, credits, Assistant Instructor worked out from classes), the grade scale, the assistant-class table and the fees; admins edit with dialogs, drag or Move up/down, Undo toasts, delete with confirmation; staff see "View only. Ask an admin to make changes."
4. **No Events tab** in phase 1 (v0.177, rule P7); Events is build phase 2.

## 1b. Mockups — approved 2026-10-18 (v0.177), `TKD-StarTesting-Phase1-Chooser-Mockups.html`

v0.59 decides how the chooser behaves, but **no approved mockup shows it**. Before any code, these are drawn at PC, tablet and phone and taken through a screen-by-screen pass:
- the **chooser page** (Color Belt testing / Star testing, each with its "Next:" line — Star shows none while it has no events; what Color Belt's line shows on Both vs one school is to confirm);
- the **hover menu** beside the Testing icon (keyboard: focus opens, ↓ moves in, Esc closes);
- **Color Belt's page header** with "← Testing" and a new title (e.g. "Color belt testing" instead of "Testing") — a visible change to Color Belt;
- the **Star testing home** header and the Events tab in phase 1 (per P2).

## 1c. Addresses (v0.83: one address per page)

Today `#testing` and `#testing/event/<id>` are Color Belt pages. Decided (v0.177):
| Page | Address |
|---|---|
| Chooser | `#testing` |
| Color Belt home (its tabs) | `#testing/color-belt` |
| Color Belt event page | `#testing/color-belt/event/<id>` |
| Star testing home, Events tab | `#testing/star` |
| Star testing, Rubrics and prices | `#testing/star/rubrics` |
Old Color Belt addresses (`#testing/event/<id>`) redirect to the new ones so bookmarks keep working. Adds `src/lib/pageAddress.js` to the shared files.

## 1d. Both vs one school

Today `Testing.jsx` shows Color Belt's "choose a school" block before anything else when the switcher is on Both. Restructured so the **chooser and Star work on Both**, and only Color Belt's own pages show that block.

## 2. How it's built (same patterns as Color Belt)

- **Data:** a new `src/lib/star/rubricsApi.js` — reads with explicit columns from `star_dan_settings`, `star_categories`, `star_grade_values`, `star_assistant_table`; writes through the seven admin functions (`star_update_dan_settings`, `star_add_category`, `star_update_category`, `star_reorder_categories`, `star_delete_category`, `star_update_grade_values`, `star_update_assistant_table`) with the same `callRpc` pattern (never throws; statuses → messages). `callRpc` in `src/lib/testing/api.js` is not exported; Star **copies** it into its own module (no change to a Color Belt file).
- **Stale and Undo:** every save sends the expected version; `stale` shows the house "changed by someone else" message and reloads. Each Undo is a second call with the new version (Undo of Add = delete). Fees and Dan settings both save through `star_update_dan_settings` with one shared version, so an open Fees dialog and an open Dan-settings dialog can go stale against each other — handled the same way.
- **Text strings:** a Star `text.js` (same pattern as Color Belt's). **Icons:** `ti-star`, `ti-chevron-right`, `ti-arrow-left` added to the icon map. Browser-tab title "Star testing".
- **Screens:** new files under `src/screens/testing/star/` (home, Rubrics tab, its dialogs). Reuses Dialog, Toast with Undo, RowMenu (⋯), ErrorBanner, the drag hook, money helpers and the Color Belt collapsible block look.
- **Preview mode (fake database):** a new `src/lib/mockStarTesting.js` seeded with the same values as 0006, plugged into the fake client, so `Start preview.bat` shows Star with no real database. `failNextSave()`, `setRole()`, `simulateOtherAdminEdit()`, `resetTesting()` and `setTestingDelay()` work for Star too (`failNextSave` gains a way to target Star, since it currently picks whichever backend comes first).
- **Shared files touched** (CLAUDE.md — only what Star needs, listed in the summary): `src/App.jsx` (the `#testing/star` address), `src/components/navItems.js` and the rail (chooser hover menu), `src/screens/Testing.jsx` (the chooser page, back link, Both handling), `src/lib/pageAddress.js` (new addresses, old ones redirected), `src/lib/mockClient.js` (plug in the Star fake backend). **Visible Color Belt change:** its header gets "← Testing" and a new title, and its addresses move under `#testing/color-belt` — drawn in §1b first.

## 3. How it's checked before you see it

- `npm run build` and `npm run build:preview-mode` pass; front-end checks (`checks.mjs`) extended for the Star rubric rules (grade values go down, minimums go down, whole dollars, unique names).
- **Design review** by a separate agent against the rulebook and the approved Rubrics mockups, with screenshots at 1280×800, 820×1180 touch, 390×844 touch and 320 wide.
- **Security review** of the data layer (explicit columns, no `*`, no DOB/email anywhere, statuses handled).
- Then you try it in preview (`npm run dev:preview-mode`), and only then a commit. No push without your OK.

## 4. Order of work

1. Your answers to the questions below.
2. ✓ Mockups for §1b approved (v0.177).
3. Builder agents in parallel where files don't overlap: (a) data layer + fake backend; (b) screens; then (c) chooser + routing (shared files, done last, one agent).
4. Reviews (design, security), fixes, your preview walk-through, commit.

## 5. Questions for Jeffrey (one at a time)

| # | Question | Why it matters |
|---|---|---|
| P1 ✓ | **Answered v0.176: merged but hidden on the live site behind a build switch until phase 2; visible in preview (A).** Was: when does Star testing appear on the live dashboard? Live after phase 1, or hidden on the live site behind a build switch (visible in preview) until phase 2, or keep Star's code unmerged until phase 2 | Changes what staff see every day in Testing; keeping code unmerged breaks "merge small and often" |
| P2 ✓ | **Answered v0.177: no Events tab in phase 1 (rule P7); only Rubrics and prices.** Was: Events tab in phase 1: the approved empty state (v0.92) with no Add event button and wording that doesn't promise an admin can add one yet | v0.60 says Events and Rubrics; nothing to show yet |
