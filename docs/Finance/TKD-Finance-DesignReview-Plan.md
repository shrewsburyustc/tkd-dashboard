# Finance — design-review plan (F1–F7)

Source: the design review's brief (`docs/Design Review/End review/Prompts/7-Finance.md`), change list §2.6, rulebook v1.000–v1.034. F8 is done (0026 live, deployed 2026-10-28).

## Part 1 — ready now

| Item | What | Files | Mockup | Database |
|---|---|---|---|---|
| F1 | Star's date picker (`src/components/DatePicker.jsx`) for the Daily report's calendar and Export's From / To; dates in words, no future days, today = "today" | `DayReport.jsx` (~441–515), `ExportDialog.jsx` (`dateField`) | Daily report + Export screens. **Question for Jeffrey:** show the picker's own field in the day row (no shared-part change), or open the picker from the calendar button (needs a new option in the shared picker; Prospects' follow-up date may want the same) | — |
| F3 | History: "← Back to the day" as a text link above the heading, every size (v0.59 / v1.020) | `HistoryView.jsx` (`top` row) | History screen. **Question for Jeffrey:** copy the back link's look (`.tc-back` / `.ev-back`) into Finance, or make it shared (same as Forms' N8) | — |
| F4 | Phone ⋯ "Today" item without icon (v1.024), blank `NoIcon` slot; `RowMenu` unchanged | `DayReport.jsx` (~467) | Daily report screen (with F1) | — |
| F7 | Both: "after $X refunds" — already built with F8 (v0.815); check in the preview against `d3-both-refunds.png` pictures 5–7 | — | — | — |
| F2 (database) | Reminder accepts 5-minute steps | `0029_finance_reminder_5min.sql`, tests, SETUP; preview rule in `financeRules.js` / `checks.mjs` | — | **0029** — built, security-reviewed, waits on Jeffrey's paste |

## Part 2 — after Dashboard core's step 1 is merged

| Item | What |
|---|---|
| F2 (screen) | Settings' reminder uses the shared time list (M8 / v1.109), keeping 11 AM–11 PM and Off; needs 0029 live first |
| F5 | Money through the shared helper (M9), "$65.00" kept in Finance |
| F6 | `usePaymentsHidden`, `useLiveLoad`, `ChoiceGroup` from their new shared places (M10) |

## Order

Mockups → Jeffrey's OK one screen at a time → build → design, code reviews → commit on `finance` (no push). Screen-only steps can merge before 0029; Part 2's Settings screen only after 0029 is live.
