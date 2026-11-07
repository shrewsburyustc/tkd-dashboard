# Finance — rolling check, pass 1: plan

**What this is:** the plan for `docs/Design Review/Rolling check/Pass 1/Fix-Finance.md` (the fixes the design review's rolling check found in Finance's merged work). Written 2026-11-05 on `finance` after merging main 6b27cdd. Nothing is built until Jeffrey OKs it.

**Checked on main 6b27cdd before planning — what isn't there yet:**

| Waits on | Needed by | On main? |
|---|---|---|
| Star's R1-01 (school stored on `star_payments`) | R1-01, part of R1-09 | No |
| Camps' R1-05 (camp refunds, kind `refund`) | R1-05 | No (0033 has no refunds) |
| Dashboard core's R2-07 (three shared sentences in `src/components/text.js`) | R2-07 (your part) | No |
| Dashboard core's R3-06 (one shared back link) | R3-06 (your part) | No |

---

## Step 1: screen-only fixes, buildable now (no database change)

| Id | What changes | Files | Mockup |
|---|---|---|---|
| **R4-05** | Home's "N earlier days at … weren't closed" line follows History's switch: `SHOW_UNCLOSED` moves to one exported constant (new `src/screens/finance/flags.js`), read by `HistoryView.jsx` and `HomeReminders.jsx`. While it's off, Home doesn't read History and doesn't wait for it. Today's "drawer isn't closed yet" line is unchanged. | `HistoryView.jsx`, `HomeReminders.jsx`, new `flags.js` | None: the line just disappears. Jeffrey's picture `Q6-home-not-closed-line.png` already shows the decision. |
| **R2-09** ✓ + full stop | The close-day toast: "Today's drawer is closed" / "The drawer for [day] is closed", with no ✓ and no full stop. Export: "CSV downloaded" with no ✓. | `DayReport.jsx` (`icon: false` ×2), `finance/text.js` | None: wording only, already decided (v1.046, v1.051). |
| **R2-07** words after an Undo | Close-day Undo → "Undone. The day is open again." A Settings Undo that worked → "Undone" (today it says nothing). | `finance/text.js`, `SettingsTab.jsx` `runUndo` | None: wording only (v1.051). |
| **S-1** | Settings: Worcester's column first; at 390, Worcester first in the school choice. | `SettingsTab.jsx` | **Yes:** Settings at the 4 sizes, swap outlined. |
| **S-11** | History rows drop the "›" column (chevron cell, empty header cell, `.fin-col-chev`). The whole row still opens the day. | `HistoryView.jsx`, `finance.css` | **Yes:** History at 1280 and 820 (the brief asks for this one). |
| **R4-12** | "← Back to the day" takes `.tc-back`'s numbers: 24 px tall with a mouse; on touch, a 44 px tap box pulled back with −10/−8 px margins so the History heading doesn't move. | `finance.css` | **Yes:** in the same History picture as S-11, at all 4 sizes, with the heading's height marked. |

**Mockups:** one HTML file `docs/Finance/TKD-Finance-RollingCheck-Pass1-Mockups.html` → two PNGs (History: S-11 + R4-12; Settings: S-1), with changes outlined in amber. Jeffrey OKs them one screen at a time.

**Reviews:** a design reviewer (the 4 sizes, §4's six WCAG checks) and a code reviewer. No security review: no database change.

**Shared files:** none.

## Step 2: preview only, buildable now

| Id | What changes | Files | Mockup |
|---|---|---|---|
| **R1-09** | Finance's preview reads Star's real preview store (`tkd.preview.star`) through a new `readStar()` input, next to `readCamps` / `readBlackBelt`. The school comes from the candidate (like live 0026) until Star stores one on the payment; then the stored school is used. The made-up Star sample is kept only when Star's store has no payments. | `src/lib/mockFinance.js`, **`src/lib/mockClient.js` (CLAUDE.md shared file)** | None: no screen change. |

**Review:** a code reviewer. **Shared file:** `mockClient.js` (one line, where the Finance backend is created).

## Step 3: database

| Id | What | Migration | When |
|---|---|---|---|
| **Export "private"** (Smaller) | `finance_export` adds `is_private`, so the CSV's For cell says "Star testing, private" / "Color belt testing, private", like the report. It replaces only that function, starting from 0026's live version; `csv.js` uses the new field. | **0037** (reserved by Main 2026-11-05, main 940e43f): `0037_finance_export_private.sql`, SETUP "## Migration 0037: …", `step0037`. | **Built and reviewed 2026-11-06** (step0037 65 passed, full suite 2601 passed; security + code review OK). Waiting for Jeffrey's paste, then the Finance app push. |
| **R1-01** | `finance_money_rows_core` reads Star's stored school (refund rows included, v1.040), starting from 0026's version. **Also adds `was_school`** to edited items so a school-only edit shows "Edited · Was Worcester · edited by …" (U-1 follow-up; mockup first). Tests file, fingerprints file, `step00NN`. | **Needs a number from Main** when I start it (next free was 0041 on 2026-11-05). | After Star's **0038** (adds `star_payments.school`) is live. Jeffrey applies this one after 0038 and before Star's app push. |
| **R1-01 part 2** (Color Belt) | Folded into R1-01: Color Belt's migration **0044** (reserved 2026-11-05, main f2779ec) stores the desk's school on Color Belt payments (Star 0038's pattern; touches only testing_* / testing_private_* functions). So one R1-01 migration reads all three stored schools: `star_payments.school` (0038), `testing_payments.school` and `testing_private_payments.school` (0044). Color Belt keeps its app (the one sending `p_school`) on color-belt until R1-01 is live (Color Belt security review, main f40bd36); say this order when asking Main for R1-01's number. | — | R1-01 runs after **both** Star's 0038 and Color Belt's 0044 are live (Main, 2026-11-06). |
| **R1-05** | A PGlite test proves the live 0026 functions already list camp refunds (Refunds group, "after $X refunds", Close the day's cash, History, Export, detail). Camps confirmed (via Main, 2026-11-06): 0026's readers already treat a camp `refund` row as a refund, so no migration is expected. Checked here: the app needs no change either (the Refunds group, totals and Close the day go by the row's kind, not its section; the preview's `readCamps` runs camp rows through the same `chainItems`). A migration only if a check fails. | None: **tested 2026-11-06, all passed** (`finance_camp_refunds_tests.sql`, `stepFinanceCampRefunds`, run against 0039 from the camps branch 19e727b) | Written before 0039 is live; 0039 live 2026-11-06; passed on production 2026-11-06 (Jeffrey). Push order (CLAUDE.md 0039 row, main cd2de3b): paste 0039 → Finance's R1-05 test → Camps app push. |

**Reviews:** a security reviewer (handoff §6) and a code reviewer for each migration; the PGlite tests must pass. Jeffrey applies each migration, then the after-apply checks run.

## Step 4: after Dashboard core's shared parts land

| Id | What | Mockup |
|---|---|---|
| **R2-07** (your part) | Refusal and failed-Undo sentences come from `src/components/text.js`. `STALE` names what changed ("the day" or "the setting"); `UNDO_FAILED` → "Undo didn't save. Check the connection, then retry."; `TOO_LATE_UNDO` stays. | **Yes:** the refusal bar on the Daily report and on Settings (it names what changed). |
| **R3-06** (your part) | History's back link becomes the shared one; `.fin-back-link` goes. If it lands before Step 1 is built, R4-12 is done with it directly. | None beyond R4-12's picture. |

## Smaller, done along the way

- **F6's one-line ask:** should Finance's own Retry / Dismiss / Back / Close / Cancel (`finance/text.js:214–218`) come from the shared `src/components/text.js`? The words are identical; only the source changes. **Decided:** Jeffrey, 2026-11-05: "Yes, shared words"; built. Then Finance can't drift if the shared words change. It's a 5-line change, built with Step 1. (Jeffrey's answer goes in the status file.)
- **S-2:** already done. Nothing to build.
- **U-1 (found by Camps, sent by Main 2026-11-05):** after Edit payment and then Undo, the Daily report row still shows "Edited" with "Was · edited by …" and nothing after "Was". Cause: `PaymentsList.jsx` `rowText` builds `was` only from the fields that differ, but the `edited` state still adds the tag and `editedLine` still prints "Was ". Any section with Edit payment is affected (Camps; Black Belt is probably affected too, not tested). **Recommendation:** when nothing differs, show the row as a plain payment (no tag, no second line); the payment detail still lists the edit and its Undo. **Decided:** Jeffrey, 2026-11-05: "A: plain payment" (rulebook v0.824); built. Gap: a school-only edit also looks plain; Jeffrey: "Commit A, fix in R1-01".

## Order

1. Step 1 mockups → Jeffrey OKs History, then Settings → build Step 1 → reviews → commit.
2. Step 2 (R1-09) → review → commit. It can be built while Jeffrey looks at the mockups.
3. Export migration (after Main's number and the Star check) → security + code review → Jeffrey applies → checks → commit.
4. R1-01 / R1-05 / Step 4, as each dependency lands on main (Main tells me).

Rulebook rows: only if Jeffrey decides something new in the mockups (next free Finance number: 0.824).
