# CB14 / M15 — build plan (Classes and ranks move to Settings; the Prices tab)

What: how CB14 / M15 gets built on `color-belt`, step by step. It follows rulebook v0.427 (the four answers) and the joint plan
(`TKD-ColorBelt-CB14-JointPlan.md`).
Why: CLAUDE.md asks for a plan first, then mockups, then the build. Jeffrey OKs this plan before any code.
Status: **proposal, 2026-11-05.** Dashboard core reviewed the Settings mockups and said OK (2026-11-05, relayed by Jeffrey). Its small points are folded in below.

## What changes for the people using it

- **Settings** (admins only) gets a second part, **Classes and ranks**, under Schools:
  - its h2 and gray line, then the Worcester | Shrewsbury switch with Add class on its right;
  - the class list without prices: each class's name, its ranks, their belts, the order (drag / ↑ ↓) and "Testing for";
  - the last rank says "Final award: set in the Prices tab";
  - add, edit, delete and reorder for classes and ranks, with the same Undo they have today.
- **Color belt testing**: the tab bar is Events · **Prices** · Private testing.
  - The Prices tab shows each class's ranks with Early / Testing day / Private and Sparring gear, plus the class's final award on the class line.
  - Admins edit them with the pencils. Staff see the same list, view only, without the "Testing for" column.
  - There is no Add, no reorder and no delete on this tab.
- **Nothing changes in the database.** It uses the same tables, reads and write functions, so no migration and no new grants are needed.

## The one thing the mockups didn't draw: the dialogs

Today one rank dialog holds name, belt, "Testing for", the three prices and Sparring gear, and one class dialog holds name and final award. The split moves each field to one place:

| Dialog | Where | Fields |
|---|---|---|
| Edit rank | Settings | Rank name, Belt ("Testing for" shown, as today) |
| Edit prices (rank pencil) | Prices tab | Early, Testing day, Private, Sparring gear |
| Add class / Edit class | Settings | Class name |
| Final award (class pencil) | Prices tab | Final award after this class |
| **Add rank** | Settings | Name, Belt **+ ? (see question)** |

The database needs all three prices when a rank is made (`testing_add_rank`). **Open question for step 1:** where does a new rank get its prices?
- **A:** Add rank (Settings only) keeps the price fields and Sparring gear.
- **B:** the new rank copies the prices of the rank above it, and the toast says so.

Each option will be drawn on the dialog sheet, with a recommendation.

How each save works: the app still calls the same `testing_update_rank` / `testing_update_class`, which take every field.
- A Settings save sends the saved prices back unchanged.
- A Prices save sends the saved name and belt back unchanged.
- If someone changed the rank in the meantime, the version check stops the save with the "stale" note we already have, so nothing is overwritten.

## Steps (each one is reviewed before the next)

1. **Dialog mockups** (one combined PNG at 4 sizes, amber outlines).
   - Draws: the four dialogs above, the Add rank options A / B, and the staff view of Edit prices.
   - Jeffrey answers the Add rank question.
   - Rulebook row v0.428.
2. **Split the code (no visible change yet).**
   - `ClassesRanksTab.jsx` gets a `part` setting: `'settings'` (structure) or `'prices'`. Each part shows only its own columns and controls.
   - The Undo handlers, ConfirmBox and stale handling stay as they are, so Dashboard core's R2-05 Undo helper can land in them later.
   - `RankDialog` and `ClassDialog` get the same `part` setting.
   - `ClassBlock` / `RankRows` drop the columns the part doesn't show. Their `Grip` re-export stays.
3. **Settings → Classes and ranks.** `Settings.jsx` adds the part under Schools:
   - the h2 and gray line: "Each school's classes and belt ranks. The Schedule, Calendar, Forms and Testing all use them. Testing prices are in Color belt testing → Prices." This takes Dashboard core's optional point 5 (it adds "→ Prices"; recommended).
   - the shared `ChoiceGroup` labeled **"School"** for screen readers (point 1);
   - Add class, whose screen-reader name is "Add class, Worcester" (v1.111's pattern, point 2);
   - "No classes yet at Shrewsbury." for an empty school;
   - a load failure says "Couldn't load the classes and ranks. Check the connection, then retry." with Retry (point 4, S-2's wording; it switches to the shared sentence once Dashboard core's fix-list step 3 is on main).
   - It opens on the top bar's school (Worcester when it says Both), then ignores the top bar.
   - Dialogs report through `onModalOpenChange` as before.
4. **The address `#settings/classes-and-ranks`.**
   - `pageAddress.js` reads and writes it, and App.jsx opens Settings with the part scrolled into view and focus on its heading (point 3).
   - Staff following the link get what any staff member gets on `#settings` today.
   - App.jsx also passes `location` to Settings, for the first school.
5. **The Prices tab.**
   - `Testing.jsx`: the tab is renamed (the key `classes` → `prices`) and gets the gray line above the list: admins see "… Classes and ranks are in Settings.", staff see "… Classes and ranks are set by an admin."
   - The Classes and ranks tab goes away.
6. **Preview mode and checks.**
   - The fake database already serves both reads.
   - `npm run build` and `npm run build:preview-mode` must pass.
   - `src/lib/testing/checks.mjs` gets checks for the split saves (each sends the other half unchanged).
7. **Reviewers (separate agents).**
   - **Design review** against v0.427 and the approved sheets, with screenshots at 1280×800, 820×1180 touch, 390×844 touch and 320 wide (admin and staff).
   - **Code review** of the diff.
   - No security review is needed: there is no database change. The reviewer still checks that Settings stays admins only.
8. **Commit on `color-belt`** (no push) and report to Main.
   - The report goes to Main as Done / Needs Jeffrey / Next.
   - Main tells New students (N11) the address for the two "no classes yet" links.
   - It also tells Dashboard core that the moved Undo handlers are ready for R2-05, that R3-06's focus-helper class goes in Testing.jsx, and that toasts wait for R2-04.

## Shared files this touches

`src/screens/Settings.jsx`, `src/screens/Testing.jsx`, `src/App.jsx` (the Settings route and the `location` prop), `src/lib/pageAddress.js`, the rulebook (v0.428).
`src/lib/mockClient.js` only if preview mode needs it.

## Not in this step

- The two "no classes yet" links in Schedule and Forms belong to New students (N11), after this merges.
- The pass 1 fixes (`Notes-ColorBelt.md`) come after CB14, with their own plan.
- Migration 0035 waits for Jeffrey's OK to paste it.
