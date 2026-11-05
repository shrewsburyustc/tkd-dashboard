# Rolling check — pass 1 report

**Date:** 2026-11-04 · **Branch:** `design-review` (not pushed) · **Phase:** 1d, the rolling check (Jeffrey, 2026-11-03: "B")

**What pass 1 covers:** everything the sections merged into `main` from 2026-10-28 up to e7fd75b:
- **Star:** Part 1 and Part 2 (v0.517, v0.518; migration 0028).
- **New students:** N1, N2, N4, N5, N6, N8, N9, N10, N12, N13, N14, N17 (v0.616–v0.626; migration 0031).
- **Finance:** F1–F7 (v0.817–v0.823; migration 0029).
- **Camps:** C1, C2, C3, C4b, C6, C7, C10, C11, C14, C17, C18, C20 (v0.735–v0.737; migration 0033).
- **Black Belt:** BB3–BB6, BB9, BB11, BB12, BB17, the database half of BB8 and BB13, and Edit cycle's Undo (v0.961–v0.970; migration 0032).
- **Dashboard core:** v1.114–v1.117.

**Not in pass 1; pass 2 picks them up when they're on `main`:** new students' N15 and the Calendar Event types fix (e640af5), Black Belt's BB13 time list (2e806e7, v0.971–v0.972), Dashboard core's v1.118, and Color Belt's Part 1 and Part 2. Color Belt merged after the cut (main 84a6e7d); `Notes-ColorBelt.md` lists what pass 1 found in code it shares, as fixes on its merged work.

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
| Star | `Fix-Star.md` | 13 + 9 after another session's fix | 0 | 7 |
| New students | `Fix-NewStudents.md` | 12 + 4 after another session's fix, and 1 check (already done on main) | 0 | 15 |
| Black Belt | `Fix-BlackBelt.md` | 22 + 10 after another session's fix | 0 | 12 |
| Camps | `Fix-Camps.md` | 10 + 8 after another session's fix | 0 | 13 |
| Finance | `Fix-Finance.md` | 8 + 4 after another session's fix | 0 | 3 |
| Dashboard core | `Fix-DashboardCore.md` | 13 | 0 | 15 |
| Color Belt | `Notes-ColorBelt.md` | 8 + 7 after another session's fix, and 3 checks (its merged work, main 84a6e7d) | 0 | 9 |

## Questions for Jeffrey, in order (one at a time)

Each answer becomes a 10b row and a changelog line from the design review's block (next: 1.052). The sections it changes hear it through the Main session.

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
9. **Black Belt's past-due "Not paid" in the Delete red** (R3-01, Medium). **Answered 2026-11-04: A** (v1.044).
   - **A (recommended):** amber, like its own "Late" tag.
   - **B:** gray, like Star and Color Belt.
   - **C:** keep red, written into §7 as an exception.
10. **The small ones, as one batch.** Jeffrey approves the recommendations together, or pulls any out to see one by one. **Answered 2026-11-04: "Approve all"** (v1.045–v1.049). The list he was shown:

    **Words**

    1. "Hidden on this tablet" everywhere (Black Belt still says "device" in places).
    2. The Undo payment box uses Black Belt's "Paid on [date]" wording everywhere.
    3. One set of payment toasts everywhere: "[Name] marked paid · $X [way]" and "Payment undone for [Name]". The payment line and the history words match them.
    4. One set of "someone else changed it" and "Undo didn't save" messages (Black Belt's newer ones), kept once in the shared words file.
    5. "Ask an admin to open it." everywhere, as Camps already says.
    6. Row menu labels read "More actions for …" everywhere.

    **Toasts**

    7. The ✓ appears only on account toasts (PIN, password).

    **Counts**

    8. A "Possible duplicate" row stays out of Paid and Not paid until it's resolved, with a gray line saying so (Black Belt's rule). Mark paid on a possible duplicate follows the same answer.
    9. While private details are hidden, people counts stay and money cards go. Black Belt shows its Candidates card.

    **Lists**

    10. Prospects gets the "Showing … only · Show all" line, like the rosters.
    11. Camps keeps its touch roster (actions in Camper detail's "More"), written down as an exception.
    12. Dashboard core builds one shared "← back" link for every section.
    13. Star's icons: "Back to the testing day" gets the testing-day calendar icon, and "Change private day or time" gets the calendar icon, as in Color Belt.
    14. The three in-list search boxes use the same words and place. Star and Color Belt rely on the planned top-bar search instead.
    15. One order above every roster: duplicate box, count cards, "Showing" line, school line, search, switches.
    16. A page's ⋯ always goes last, to the right of the blue button.
    17. A roster states its sort order only when it isn't by name, so Black Belt's line stays.
    18. One order for event-list ⋯ menus: Copy link(s), Close / Open, Edit, then the rest.
    19. Worcester comes first everywhere.
    20. The browser's own dropdowns become the shared dropdown whenever a section next touches that screen.
    21. Edit details closes back to the roster in every section; Black Belt changes.

    **Family pages and look**

    22. Every family page uses the trash icon to remove a child; Camps' "Remove" link changes.
    23. Screen text goes from weight 600 to 500 in Black Belt, Camps and New students. Printed sheets keep their heavier weights.

    **Recorded only (nothing to build)**

    24. A desk-only form left open while the switch is flipped in another browser tab stays as it is. "Kept both" having no Undo becomes a written exception.

11. **The in-list search boxes: which words, and where?** (R3-09; it follows item 14.) **Answered 2026-11-04: "A: Find a …"** (v1.050).
    - **A (recommended):** "Find a candidate", "Find a camper" (as today), "Find a prospect".
    - **B:** "Search candidates", "Search campers", "Search prospects".
    - Both put every box on the left, above the list (Prospects' box moves out of the chip row), with one line when nothing is found, 'No [candidates / campers / prospects] match "…".', followed by a Clear search link; the box's own ✕ stays the shared icon button (v1.050). Prospects' box still finds by phone.
    - Picture: `Q11-list-search-words.png`.

## Next

- **Jeffrey:** every pass 1 question is answered (2026-11-04): questions 1–11 and 5b, and the follow-up batch. The fix files carry the answers, and the design review has no open questions left; five Smaller lines are questions the sections ask Jeffrey themselves (New students 2, Black Belt 1, Finance 1, Color Belt 1). What was still to ask after question 10:
  - (a) the in-list search's words, place and no-match line (v1.047 (14)): **answered as question 11, "A: Find a …"** (v1.050).
  - (b) R2-07's open part: the words after an Undo (Finance's "Close undone. The day is open again.", Star's "Registration open") and the load-failure words (S-2: Camps / Finance "then retry", Black Belt "then try again", Calendar "and try again"): **answered** (v1.051 (1) and (2)).
  - (c) Finance's row chevrons (S-11): **answered** (v1.051 (3)).
  - (d) Color Belt's weight-600 family-page text (`register.css:375, 394, 659`, which Star's and Camps' family pages load too, so Camps' page keeps 600 text after its own R4-06): **answered** (v1.051 (4)).
  - (e) whether section toasts also drop their closing full stop (v1.046 (7) drops only the ✓): **answered** (v1.051 (5)).
  - Jeffrey answered (b)–(e) together, as the follow-up batch: "Yes approved go ahead".
  - The list he was shown:
    1. "After an Undo: the toast says 'Undone' everywhere. When the Undo reopens something people depend on, it adds one short sentence: Finance 'Undone. The day is open again.'; Star 'Undone. Registration is open again.'"
    2. "When a page can't load: 'Couldn't load. Check the connection, then retry.' with a Retry button, everywhere. Calendar, Forms, Prospects and Black Belt change their endings."
    3. "Finance's History rows drop the '›' arrow at the end, like every other list whose rows open a page."
    4. "Color Belt's family-page text (Star's and Camps' family pages use the same file) goes from weight 600 to 500, like all other screen text."
    5. "Toasts: a one-sentence toast has no full stop at the end ('Ava Reed restored'); a two-sentence toast keeps them. Prospects, Forms, Finance and Calendar change."
- **Next:** the Main session merges `design-review` when Jeffrey says so; then pass 2. This branch also removes the duplicate v0.737 row that main carries (392bc9e, lines 939 and 942); the merge keeps the copy with the notes.
- **Re-merged 2026-11-05:** `main` moved on while Jeffrey paused the sessions (New students' N3 confirm boxes, v0.633, and visitor profile, migration 0036 and v0.634–v0.641; Camps' v0.738), so this branch merged it in (main d7b5ebf, merge fdf2770; only the rulebook conflicted). The New students and Camps fix files were then checked again against that code: their references cite main d7b5ebf's lines; New students' R2-06 and two of its smaller lines were already done, so they are checks now; three new places were added to items New students already had (R2-01, S-2); and Camps' two items about the pizza line (R3-02, R3-10) name v0.738's count line instead. Main's new v0.738 note sits on the kept v0.737 row.
- **Pass 2:** what merged into `main` after pass 1's cut (e7fd75b):
  - N15 + Calendar Event types (e640af5)
  - Black Belt BB13 (2e806e7) and BB8 History (b428666)
  - new students "(now)" 1–4 (c5e38f8, 7456636, 9b562b3)
  - Dashboard core v1.118 (942cfdd) and v1.119–v1.121 (801b757)
  - Color Belt Part 1 + 2 (84a6e7d)
  - new students "(now)" 5–7 and its Part 2 start (2881413)
  - Black Belt v0.974–v0.975 (392bc9e)
  - new students' N3 confirm boxes (v0.633) and visitor profile: migration 0036 and v0.634–v0.640 (a5d0e1d), and v0.641 (d7b5ebf)
  - Camps v0.738, Early drop-off and Late pick-up on the roster (3a8dc70)
- **The review's screenshot tool** (`docs/Design Review/tools/cdp.mjs`) re-applies the screen size on every command. On phones that can re-draw a page between two commands. It gets fixed on this branch before pass 2. The tool is the review's own, not part of the app.
