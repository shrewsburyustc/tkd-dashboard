# Star Step B (batch 1) build review: code + design (R5-05, R3-02, S-1, C-05 (b), M-03)

Reviewer: independent, read-only. All eight Star check files and `src/lib/shared/checks.mjs` pass. Preview at :5174 checked at 1280, 390 and 320 (820 not shot; no overflow found by script at 390/320).

## MUST-FIX
None.

## SHOULD
1. A possible-duplicate pair split across schools, viewed at one school, is a dead end. `pairs` is built from the school-filtered `active` list (`CandidatesTab.jsx:288-298`), so no orange box and no pair exist at that school. The row still shows the "Possible duplicate" tag (`CandidateRows.jsx:35`), no longer offers Mark paid (`CandidateRows.jsx:119`, new), and has no Review item (`flagged` comes from `pairs`, `CandidatesTab.jsx:1171`; `openCompare` returns silently at `:994`). Meanwhile the gray line counts that pair once (`candidateCards.js:25-34`). Result: a gray line about a duplicate that the page offers no way to review until staff switch to Both. Fix: make `pairs` use the whole-event list (`candidates` filtered to active), as the comment at `:287` already says ("in the whole event"), or at least show the line only when a pair is reviewable. Old behaviour let staff pay the row; this change makes the gap matter.
2. Stale comment: `CandidateDialog.jsx:35` still says the receipt rule excludes "withdrawn rows". Now wrong (M-03). Change to "(make-ups and hidden: none; withdrawn rows only with money that stands)".
3. `candidateCards.js:34` counts a flagged pair if either row is in view, but the card numbers (Paid / Not paid) only drop rows in view. Fine today; just note the gray line can say "1" while no row of that pair is shown in the Dan being looked at. Acceptable, matches the plan's "pairs in the whole event".

## OK (with evidence)
- Card maths: net `paidCents` summed over active plus withdrawn (`candidateCards.js:23,45-46`), same `inSchool` filter. Preview, Both, Noah withdrawn: Candidates 12 (Worcester 7 / Shrewsbury 5), Paid 5, Not paid 3, Payments $930 "includes $140 from removed candidates". Worcester only: Paid 0, Payments $140 with the same gray line. Candidates and school counts stay active-only.
- Paid / Not paid use the row's own `duplicateState` and leave out make-ups (`:22`); `filterRows` uses the same `countable` list, so the cards, filters and the list under them agree (preview: Both, Not paid filter shows the 3 unpaid rows, none of the Ava Reed rows). Flagged rows' money still counts in Payments (`:45`).
- S-1: Worcester first on Both (`:41`), preview shows "Worcester 7 / Shrewsbury 5"; one-school view unchanged.
- C-05 (b): `emptyLineKind` (`candidateCards.js:62-65`). Preview: Paid + 1st Dan at Worcester gives "No paid candidates in this Dan."; Both + Not paid + 2nd Dan gives "Every candidate in this Dan has paid."; a Dan with nobody keeps "No candidates for this Dan." for Paid and Not paid. Empty Dan wins, as asked.
- M-03 menus (preview, DOM read): admin Noah (paid, withdrawn) "Print receipt | line | Restore | line | Delete permanently" (two separators); admin Owen (nothing paid) "Restore | line | Delete permanently"; staff Noah "Print receipt" only; staff Owen no ⋯ button. Hide private details on: admin Noah and Owen "Restore | Delete permanently" (one separator); staff, no ⋯ on either, and the Paid / Not paid / Payments cards and the gray line are not drawn. Restore and Delete stay admin-only (`candidateMenu.js:36-39`).
- The receipt reader works for a withdrawn row: staff Noah, Print receipt opens "Star testing · payment receipt", Nov 1 Testing fee Check $140, Paid to date $140, Balance $0. No status check in the reader (`CandidatesTab.jsx:645-661`).
- Old rules gone: no `NO_MATCHES` / "No candidates match." left in Star's src (Black Belt's own text is a different section). Menu header comment updated (`candidateMenu.js:11-13`).
- Phone: 390 sheet "Noah Chen / 1st Dan", items and Cancel 44 px high; 320: cards 2 by 2, gray lines wrap, no horizontal page scroll (scrollWidth equals clientWidth), ⋯ button 44x44 on phone rows (28x28 on wide rows, above the 24 px minimum, row itself is the larger target). Gray line colour #6B6B6B on the light card/page, about 5:1, 12-13 px (existing note style).
- Style: files LF as required (0 CR bytes); new file has a what-and-why header in plain English; text.js uses curly apostrophes as decided.

## Could not check
- Screenshots at 820 wide and focus order inside the open ⋯ menu (checked by DOM only, not keyed through).
- Side-by-side pixel comparison with `B3-count-cards.png` / `B4-withdrawn-receipt.png`; compared by wording and structure only.
- A real split-across-schools pair in the preview (the seed has none); SHOULD 1 comes from reading the code and the unit check (`candidatesChecks.mjs:1252-1253`), which tests the maths but not the screen's `pairs`.
- Staff phone sheet for withdrawn Noah (staff checked at 1280 only).
