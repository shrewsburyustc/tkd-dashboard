# CB14 / M15 — Classes and ranks move to Settings: joint plan (proposal)

What: who builds which part of design review item CB14 (Color Belt) = M15 (Dashboard core), in which branch, and in what order.
Why: the briefs (`docs/Design Review/End review/Prompts/3-ColorBelt.md` CB14, `2-DashboardCore-step2-main-screens.md` M15) say to agree this first, through Jeffrey, before any mockup.
Rulebook: v1.023 (Classes and ranks move to Settings; Color Belt keeps a "Prices" tab), v0.36 / v0.38 / v0.40 (today's rules), D6 in the change list.
Status: **agreed 2026-11-04.** Dashboard core: "AGREE — Color Belt builds all of it on color-belt; Dashboard core reviews the
Settings fit" (relayed by Jeffrey in the Color Belt session). Next: the Settings mockups, which go to Jeffrey and to Dashboard core for review.

## Dashboard core's corrections and keeps (2026-11-04)

- Nothing of Dashboard core's goes into `src/screens/Settings.jsx`; step 2 (M12–M14, M17) and the Design Review fix list don't touch it.
- The panel size switch is in the account menu (v1.118), not in Settings.
- If D6 gives staff a read-only view inside Settings, the **account-menu entry is Dashboard core's change** (`AccountMenu.jsx`; M17
  changes it too). Color Belt builds the page side and lists any `App.jsx` route change.
- **Keep:**
  - the parts one under the other, each with its h2 heading and gray line;
  - Settings keeps ignoring the location switcher, and names the school wherever the classes differ (the shared ChoiceGroup if it's a switch);
  - dialogs report through `onModalOpenChange`;
  - shared parts only;
  - its own address (e.g. `#settings/classes-and-ranks`) if N11's hints become links.
- **Fix-list overlap:**
  - R2-05's Undo helper will land in ClassesRanksTab's four Undo handlers, so keep them as they are when moving;
  - R1-08's page-wide gray must not give BeltPicker's stepper a gray box.

## Today

- Classes and ranks is a tab inside Testing (`src/screens/Testing.jsx`, a shared file). It is built by Color Belt:
  `src/screens/testing/ClassesRanksTab.jsx`, `ClassBlock.jsx`, `ClassDialog.jsx`, `RankDialog.jsx`, `RankRows.jsx` (its `Grip` re-export
  stays for Calendar / Forms / Prospects), `BeltPicker.jsx`, `FinalAwardSelect.jsx`, `src/lib/testing/api.js`, `src/lib/testing/useClassesRanks.js`.
- Settings (`src/screens/Settings.jsx`, admins only, ignores the top bar) has one part, **Schools**. Color Belt built it in phase 2.
- Dashboard core's step 2 (M12 offline bar, M13 "Both schools", M14 PIN/password guard, M17 Staff accounts while hidden) touches none
  of these files. Step 2 hasn't started yet.

## Proposal

1. **Color Belt builds all of CB14 / M15 on `color-belt`.**
   - Settings gains a second part, **Classes and ranks**, after Schools.
   - The Classes and ranks code moves with it, still Color Belt's code.
   - Testing keeps a **Prices** tab (testing prices, sparring gear, final award).
   - Testing's own Classes and ranks tab goes away.
   Reason: Color Belt owns every file that moves, and none of them overlap Dashboard core's step 2. One branch means one move, with no two-branch hand-off.
   Same branch, same step: CB5's two Classes and ranks boxes and CB16's prices are already done (Part 2), so they move as they are.
2. **Dashboard core reviews** the Settings mockups for fit with its own Settings and account-menu work (M17; the panel size switch, if it is in Settings). It also tells Color Belt about any Settings layout rule it wants kept.
3. **Order:** Color Belt makes the mockups now. Dashboard core goes on with step 2. Whichever branch merges second runs `git merge main` first.
   Shared files Color Belt will touch: `src/screens/Testing.jsx` and `src/screens/Settings.jsx`. The latter is Color Belt-built but dashboard-wide, so Dashboard core is told before it changes.
4. **Database:** none expected. These are the same tables and the same write functions; admins already write them. The staff view (below) uses the existing reads. If the mockups show otherwise, Main is asked for a number, and the change gets a security review.
5. **The New students session (N11)** points the Schedule's and Forms' hints at Settings → Classes and ranks after this merges. Color Belt tells them through Main.

## To settle in the mockups (D6), one question at a time

- **Staff:** they can view Classes and ranks today (v0.40), but Settings is admins only. Do staff keep a read-only view? Where would it be?
- **Hints:** should the Schedule's and Forms' hints become links to Settings → Classes and ranks?
- **Both schools:** Settings ignores the top bar. How are each school's classes shown, e.g. one school under the other, or a school switch inside the part?
- **Names:** what is the Prices tab called?

## Answers (one rulebook row when all four are in)

- Q1 (2026-11-04): **B** — Settings stays admins only; staff read Color Belt’s Prices tab, view only (every class, rank, price and final award; not the “Testing for” column). No account-menu change for Dashboard core.
- Q2 (2026-11-05): **C** — links to `#settings/classes-and-ranks` only on the two "no classes yet" lines (Schedule's Add time slot with no classes; Forms → Book a class with no classes); the line under the Class choices in Add / Edit time slot stays plain text (a link there would leave the dialog mid-edit). All three say "Settings → Classes and ranks". The hint files are New students' (N11); Color Belt gives the address. Picture: `Design Review mockups/cb14/cb14-q2.png`.
- Q3 (2026-11-05): **B** — a school switch inside the Classes and ranks part: the shared ChoiceGroup "Worcester | Shrewsbury" at the top of the part, Add class on its right (wraps under it at 320); it starts on the top bar's school (Worcester when the top bar says Both), then Settings keeps ignoring the top bar; only the chosen school's classes show, and the empty line names the school ("No classes yet at Shrewsbury."). Picture: `Design Review mockups/cb14/cb14-q3.png`.
- Q4 (2026-11-05): **A** — the tab is called **"Prices"** (tab bar: Events · Prices · Private testing). A gray line above the list: "Testing prices, sparring gear and each class's final award. Classes and ranks are in Settings." (staff: "… Classes and ranks are set by an admin."). Picture: `Design Review mockups/cb14/cb14-q4.png`.

## Dashboard core's review of the Settings mockups (2026-11-05, relayed by Jeffrey)

**OK, it fits Settings** (sheets `cb14.png`, `cb14-q3.png`; v0.427). Small points, none blocking, all taken into the build plan (`TKD-ColorBelt-CB14-BuildPlan.md`):
1. the ChoiceGroup's accessible name is "School";
2. Add class's screen-reader name says the school ("Add class, Worcester", v1.111's pattern);
3. `#settings/classes-and-ranks` scrolls the part into view and puts focus on its heading; `src/lib/pageAddress.js` is listed with the shared files;
4. the part's load-failure line ends "Check the connection, then retry." with Retry (S-2; the shared sentence once Dashboard core's fix-list step 3 is on main);
5. optional: "Testing prices are in Color belt testing → Prices.";
6. coordination: R3-06 later adds one class to Testing.jsx's back-link focus helper; the moved Undo handlers take R2-05's queued Undo later; toasts get their own room through R2-04.
