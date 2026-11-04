# Rolling check — pass 1 report

**Date:** 2026-11-04 · **Branch:** `design-review` (not pushed) · **Phase:** 1d, the rolling check (Jeffrey, 2026-11-03: "B")

**What pass 1 covers:** everything the sections merged into `main` from 2026-10-28 up to e7fd75b:
- **Star:** Part 1 and Part 2 (v0.517, v0.518; migration 0028).
- **New students:** N1, N2, N4, N5, N6, N8, N9, N10, N12, N13, N14, N17 (v0.616–v0.626; migration 0031).
- **Finance:** F1–F7 (v0.817–v0.823; migration 0029).
- **Camps:** C1, C2, C3, C4b, C6, C7, C10, C11, C14, C17, C18, C20 (v0.735–v0.737; migration 0033).
- **Black Belt:** BB3–BB6, BB9, BB11, BB12, BB17, the database half of BB8 and BB13, and Edit cycle's Undo (v0.961–v0.970; migration 0032).
- **Dashboard core:** v1.114–v1.117.

**Not in pass 1; pass 2 picks them up when they're on `main`:** new students' N15 and the Calendar Event types fix (e640af5), Black Belt's BB13 time list (2e806e7, v0.971–v0.972), Dashboard core's v1.118, and Color Belt's Part 1 and Part 2. Color Belt isn't merged yet; `Notes-ColorBelt.md` lists what to check before its merge.

## How it was checked

- **Four reviewers**, one per topic: money; undo and safety nets; lists, menus and pickers; item by item, plus privacy.
- **Two separate checkers** tried to prove each finding wrong, and reproduced every High and Medium themselves. They rejected none. They merged 5 duplicates, lowered 5 findings and raised 1.
- **Pass 1b** (N10, N13, N14 and C10) had one reviewer; this session checked its findings in the code.
- **Preview mode only** (the fake database), at 1280 × 800, 820 × 1180 touch, 390 × 844 touch and 320 wide. Nothing touched the live site or database.

## Result

- **Every merged item is built as its row decided**, or differently under a newer row Jeffrey approved. No section copied an option the pictures marked as rejected.
- **49 findings** after duplicates are merged: **4 High** (plus 1 that is High if Jeffrey says so), **14 Medium**, **30 Low**, and some smaller lines.
- **About half are straight fixes.** They go to the sections now, in the fix files below.
- **The other half need Jeffrey to pick a rule first.** These are mostly places where two sections each follow their own approved rule. They are the questions below, one at a time.

### The four Highs (pictures in `pictures/`)

1. **Money counted at different schools** (R1-01). **Decided 2026-11-04: A** (rulebook v1.035): every section counts a payment at the desk that took it. Fix items now go to Star, Black Belt, Finance and Color Belt.
   - A camp payment taken at the Shrewsbury desk counts in Shrewsbury's report.
   - A Black Belt payment taken at the same desk counts in the family's school's report, so that school's Close the day expects cash that sits in the other drawer.
   - Picture: `Q1-payment-school.png`.
2. **Black Belt's ⋯ menu tells who has paid while Hide private details is on** (R1-04 + R4-01): Delete permanently is grayed "has payment records" only on paid rows. Straight fix for Black Belt. Picture: `H1-blackbelt-menu-tells-who-paid.png`.
3. **A failed Undo leaves a form closed to families** (R2-01): Forms promises a retry that never comes, and Prospects has the same gap. Straight fix for New students. Picture: `H2-forms-failed-undo-no-retry.png`.
4. **A half-failed Undo of a Star event edit leaves registration open** (R2-02), then blames "someone else".
   - Straight fix for Star, with a database change. Color Belt has the same code.
   - Picture: `H3-star-event-undo-half-done.png`.

A fifth High, decided 2026-11-04 (question 2: A, rulebook v1.036): a family's payment plan is a payment detail, so Black Belt's Plan column hides while private details are hidden (R4-01). It is now a fix item for Black Belt.

## Fix files: ready to pass on

Each file starts with a short starter to paste into that session. The file reaches the session's worktree once `design-review` is merged into `main` and the session runs `git merge main`.

| Session | File | Fix now | Waits on Jeffrey | Smaller |
|---|---|---|---|---|
| Star | `Fix-Star.md` | 8 + 4 after another session's fix | 10 | 3 |
| New students | `Fix-NewStudents.md` | 5 + 1 after another session's fix | 9 | 12 |
| Black Belt | `Fix-BlackBelt.md` | 11 + 5 after another session's fix | 14 | 8 |
| Camps | `Fix-Camps.md` | 3 + 3 after another session's fix | 12 | 9 |
| Finance | `Fix-Finance.md` | 3 + 2 after another session's fix | 4 | 2 |
| Dashboard core | `Fix-DashboardCore.md` | 7 | 10 | 8 |
| Color Belt | `Notes-ColorBelt.md` | check before its merge | (follows the answers) | — |

## Questions for Jeffrey, in order (one at a time)

Each answer becomes a 10b row and a changelog line from the design review's block (next: 1.044). The sections it changes hear it through the Main session.

1. **Money: which school's report counts a payment taken at one school's desk?** (R1-01, High.) **Answered 2026-11-04: A** (v1.035).
   - **A (recommended):** the desk that took it, for every section, as Camps does. The report then always matches the drawer.
   - **B:** the family's school, for every section.
   - **C:** keep each section's own rule.
   - Whichever is picked, Star also saves the school with each payment, so a later edit never moves counted money.
   - Picture: `Q1-payment-school.png`.
2. **Black Belt's payment plan while private details are hidden** (R4-01, High if yes). **Answered 2026-11-04: A** (v1.036).
   - **A (recommended):** the Plan column and plan words hide, and Change plan becomes desk-only, as Camps hides how a family pays.
   - **B:** keep the approved v0.900 roster, where the plan stays visible.
3. **Black Belt's desk-only items while hidden** (R4-04, Medium). **Answered 2026-11-04: A** (v1.037).
   - **A (recommended):** work like Star. Only New candidate is desk-only, Make-up keeps working, and Edit details opens with the birthday and email hidden.
   - **B:** keep Black Belt as built, and record "Edit details at the desk" in a row.
4. **What every "Payments recorded" card adds up** (R5-04 + R5-05, Medium). **Answered 2026-11-04: A** (v1.038): "Money received should be counted reguardless of removed status. If we refunded and undid the payment then it should go down."
   - **A (recommended):** all recorded money, as Finance counts it, with Color Belt's gray line "includes $X from removed …". Star stops dropping a withdrawn candidate's payment, and Camps adds the line.
   - **B:** only the people still on the roster.
5. **Camp money handed back** (R1-05, Medium). **Answered 2026-11-04: A** (v1.039).
   - **A (recommended):** Camps gets a "Record refund" like Star's, dated the day the money goes out.
   - **B:** keep Edit payment, which changes the payment's original, already-counted day.
   - **5b, asked after it:** which school counts a refund handed out at the other desk? **Answered 2026-11-04: A** (v1.040): the desk that hands the money back.
6. **Home's "N earlier days weren't closed" line** (R4-05, Medium). **Answered 2026-11-04: A** (v1.041).
   - **A (recommended):** it goes while History's "not closed" marks are switched off.
   - **B:** bring the History marks back.
   - **C:** keep as is. Home then warns about a page that shows nothing.
7. **The 5-second toast covers buttons under it** (R2-04, Medium). **Answered 2026-11-04: A** (v1.042).
   - **A (recommended):** the toast gets its own room on every page and size.
   - **B:** only fixed things move. Lists then still scroll under the Undo on phones.
8. **Undo after restoring a "Duplicate copy"** (R2-03, Medium). **Answered 2026-11-04: A** (v1.043).
   - **A (recommended):** Star's rule everywhere: no Undo there.
   - **B:** a real Undo everywhere, which needs a database change per section.
9. **Black Belt's past-due "Not paid" in the Delete red** (R3-01, Medium).
   - **A (recommended):** amber, like its own "Late" tag.
   - **B:** gray, like Star and Color Belt.
   - **C:** keep red, written into §7 as an exception.
10. **The small ones, as one batch.** Jeffrey approves the recommendations together, or pulls any out to see one by one:
    - **Words: "Hidden on this tablet".** Use this everywhere; Black Belt says "device" (R4-03).
    - **Words: Undo payment box.** Use Black Belt's "Paid on [date]" (R1-06).
    - **Words: payment toasts.** "[Name] marked paid · $X [way]" and "Payment undone for [Name]" everywhere. The payment line and the history words follow (R1-07).
    - **Words: "someone else changed it" and "Undo failed".** Use Black Belt's newer set, kept once in the shared words file (R2-07, R4-14).
    - **Words: closed staff line.** "Ask an admin to open it." everywhere, as Camps (R4-13).
    - **Words: row menu labels.** "More actions for …" everywhere (pass 1b).
    - **Toasts: ✓.** The ✓ stays only on the account toasts (PIN, password) (R2-09).
    - **Counts: possible duplicates.** Possible duplicates stay out of Paid / Not paid until resolved, with a gray line, as Black Belt does. Mark paid on a possible duplicate follows the same answer (R3-02).
    - **Counts: cards while hidden.** People counts stay and money cards go: Star, Color Belt and Camps already do this. Black Belt keeps its Candidates card (pass 1b).
    - **Lists: Prospects' filter line.** Prospects shows "Showing … only · Show all" like the rosters (R3-03).
    - **Lists: Camps' touch roster.** Keep it (no row ⋯; the actions are in Camper detail's More), written as a named exception (R3-04).
    - **Lists: back link.** One shared back link, built by Dashboard core (R3-06).
    - **Lists: Star's icons.** "Back to the testing day" gets the testing day's `ti-calendar-event` instead of Undo's icon. "Change private day or time" gets `ti-calendar`, as Color Belt has it (R3-08).
    - **Lists: search boxes.** Same words and place for the three in-list search boxes. Star and Color Belt rely on the planned top-bar people search (R3-09).
    - **Lists: order above a roster.** One order above every roster: duplicate box, count cards, "Showing" line, school line, search, switches. Black Belt and Camps move lines (R3-10, C10).
    - **Lists: page ⋯.** The page's ⋯ always goes last, to the right of the blue button. Prospects, Calendar and the Schedule's phone headers move it (R3-11).
    - **Lists: roster order line.** A roster says its sort order only when it isn't by name. Black Belt's "Dan, then school…" stays (S-9).
    - **Lists: event list ⋯ order.** One order on every event list: Copy link(s), Close / Open, Edit, then the rest. Camps changes (S-8).
    - **Lists: school order.** Worcester first everywhere, as in the location switcher (S-1).
    - **Lists: dropdowns.** The browser dropdowns become the shared dropdown when a section next touches that screen; no sweep (S-10).
    - **Lists: after Edit details.** Edit details closes back to the roster, as Star and Camps do; Black Belt changes.
    - **Family pages: removing a child.** Use the trash icon button on every family page; Camps' "Remove" link changes (R5-03).
    - **Weights.** Screen text drops from weight 600 to 500 in Black Belt, Camps and New students; print keeps its heavier weights (R4-06).
    - **Records only.** A desk-only form that's open while the switch is flipped in another browser tab is left as is, and recorded (R4-02). "Kept both" has no Undo, recorded as a named exception.

## Next

- **Jeffrey:** question 9, then the batch of small ones (questions 1–8 and 5b answered 2026-11-04).
- **Pass 2:** everything merged after e7fd75b (N15, the Calendar Event types fix, Black Belt's BB13 and BB8 History, new students' "(now)" 2 + 3, Dashboard core's v1.118), and Color Belt when it merges.
- **The review's screenshot tool** (`docs/Design Review/tools/cdp.mjs`) re-applies the screen size on every command. On phones that can re-draw a page between two commands. It gets fixed on this branch before pass 2. The tool is the review's own, not part of the app.
