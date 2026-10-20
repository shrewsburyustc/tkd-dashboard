# Camps → Finance: camp payments in the Daily report — plan

**Status:** draft for Jeffrey, 2026-10-19. Nothing built. Branch `camps`.
**Why:** Finance's Daily report (migration 0011, live) only reads Color Belt (`testing_payments`) and Star (`star_payments`) payments. Camp payments (`camp_payments`, 0013) are cash / check / card taken at the desk too, so without this change **camp money never shows in the Daily report, History, Export, or Close the day** — the drawer count would come up short on every camp day.

## What changes for staff

| Screen | Today | After |
|---|---|---|
| Daily report → payments list | Color belt testing · Star testing | + **Camp** rows, e.g. "Mia Rossi · April Vacation Camp · Cash $166" |
| Totals (Cash / Check / Card) and **Close the day** | Color Belt + Star | + camp payments, so the expected cash matches the drawer |
| Undo / Edit payment on a camp | — | Shows exactly like Color Belt edits and undos (same "edited", "undone", hidden mis-click rules) |
| Payment detail (click a row) | Color Belt / Star | + camp payments: camper, camp, days, recorded by, its history |
| History, Export (CSV), Print, Home reminder | Color Belt + Star | + camps |

Nothing changes on the Camps screens except, maybe, decision 1.

## How it works (technical, short)

- `camp_payments` already has exactly the columns Finance reads from the other two (`kind` payment / reversal, `amount_cents`, `method` cash / check / card, `paid_on`, `recorded_at`, `recorded_by`, `recorded_by_name`, `reverses_payment_id`). So it becomes a **third source, `camp`**, next to `color_belt` and `star`.
- **New migration, not an edit of 0011:** 0011 is live, so the Finance functions that list the sources are **replaced** in a new migration that runs **after 0013** (it needs the camp tables). Working name `0016_finance_camps.sql` — number checked across all branches when it's written. Functions replaced (same names, same arguments, same answers, plus camp rows): `finance_chain_steps_core`, `finance_money_rows_core`, `finance_payment_detail`, and any other that names the two sources. A speed index on `camp_payments (paid_on)`.
- **School of a camp payment:** decision 1 below.
- **Screens:** `src/screens/finance/` (text "Camp", the detail dialog's camp lines), `src/lib/finance/csv.js` (export label), the preview mock `mockFinance.js` reads the preview camp payments.
- **Tests:** Finance's existing tests must still pass unchanged (Color Belt / Star answers identical); new tests: a camp payment counts on its day and school, an Edit / Undo chain, the mis-click rule, Close the day expects it, export row, speed check with camp rows in the big seed, and on the ICU-sorting database like the other Finance checks.
- **Reviews:** security review (it changes live Finance functions) + design review of the Daily report with camp rows.

## Order and who does it

1. Finish the Camps CP1 walkthrough first (no change to the plan above from it, unless decision 1 adds a field).
2. Build this in the **camps** branch as its own small step, because it depends on 0013 — but it changes Finance's live functions and screens, so **tell the Finance session** (decision 2).
3. It must go live **together with Camps** (same deploy), or camp days would close short.
4. Production order: 0013 (Camps), then `0016_finance_camps` (Finance reads camps) — both pasted by Jeffrey in the SQL Editor at CP3, each with its own fingerprints and tests.

## Decisions for Jeffrey (one at a time)

1. **Which school's Daily report gets a camp payment** — matters only for a **Both-schools** camp (single-school camps: that school). Picture `Decision images/Camps-finance-school-options.png`. → **A. The school whose desk took the money** (Jeffrey, 2026-10-19): camp payments get a `school` column; Mark paid records the device's school (location switcher); this applies to every camp, so the money always lands in the drawer of the desk that took it. Only on the Both view is there no device school: then a both-schools camp asks "Paid at which school?" (Worcester | Shrewsbury) and a single-school camp uses its own school. Edit payment can correct the school. Small change to 0013 (not applied yet) + the Camps payment dialog.
2. **Who builds it:** the Camps session (recommended; it depends on 0013 and must ship with Camps) or the Finance session. → **A. The Camps session** (Jeffrey, 2026-10-19), on the `camps` branch, shipped with Camps; Finance files touched are listed as shared; Jeffrey sends the Finance session a heads-up (paste-ready text in the Camps status file).
3. **What the row says:** "Camp" + camp name (recommended, like "Color belt testing" + event) — shown in the decision-1 picture. → **"Camp · <camp name>"** (Jeffrey, 2026-10-19); export column What = "Camp", event = the camp's name; the payment detail shows camper, camp, days, recorded by.

**Changed 2026-10-19 → rulebook v0.708 (Jeffrey, after the preview):** the school is **this device's school** (account menu → This device), for every camp, whatever the top switcher shows — Mark paid never asks; the "Paid at which school?" dialog is removed. A device never set falls back to Worcester, so each desk device must have This device set once. Edit payment → Paid at still corrects it.
**All three decided 2026-10-19 → rulebook v0.707.** **Built and reviewed 2026-10-19** (PGlite 338/338; security no Critical/High; design no MUST). Build started 2026-10-19 (Jeffrey: "build it now, with reviews"): A = `school` on camp payments in 0013 + new migration **`0017_finance_camps.sql`** (0016 is taken by `school_phone` on another branch) + tests; C = campsApi / mocks / Finance data layer; D = Mark paid school question + Finance screen labels. Then security + design review.
**Reviews (2026-10-19):** security — no Critical/High; M1 (CSV camp name) and M2 (owner check in 0017 tests) fixed; L1 test comparison tightened; L3/L4 in the screen fixes. Design — no MUST; wording, selected style, "Pick a school first." hint, "Paid at" line in the payment detail being fixed. **To show Jeffrey at CP1:** "Open in Camps" button in Finance's camp payment detail (built without a mockup); same-day school-only edit leaves no "moved" line at the old school; Finance's "Student" column header now also lists camp children who aren't members (leave, or rename to "Name").
**Coordination (2026-10-19):** the Finance session's next migration **0018** (Color Belt private testing payments in the Daily report) replaces the same Finance functions and is built on top of 0017. 0017 is based on the speed-fixed 0011 (16b1f52) and keeps the camp source as a separate, marked block (`-- ===== source: camp (0017) =====`) in each replaced function. **Sent to the Finance session 2026-10-19: final list (commit fb4ec24).** Production order: 0013 → 0017 → 0018. **Main confirmed 0017 = camps (2026-10-19, CLAUDE.md on main 8ff2ee7):** 0016 Black Belt, 0017 camps, 0018 Finance, 0019 school phone; ask Main before taking any new migration number. run.mjs merge order at main: 0014, then 0017, then 0018.
