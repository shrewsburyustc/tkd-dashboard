# CB14 / M15 — Classes and ranks move to Settings: joint plan (proposal)

What: who builds which part of design review item CB14 (Color Belt) = M15 (Dashboard core), in which branch, and in what order.
Why: the briefs (`docs/Design Review/End review/Prompts/3-ColorBelt.md` CB14, `2-DashboardCore-step2-main-screens.md` M15) say to agree this first, through Jeffrey, before any mockup.
Rulebook: v1.023 (Classes and ranks move to Settings; Color Belt keeps a "Prices" tab), v0.36 / v0.38 / v0.40 (today's rules), D6 in the change list.
Status: **proposal by Color Belt, 2026-11-04** — waiting for Dashboard core's view, then Jeffrey's OK.

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
