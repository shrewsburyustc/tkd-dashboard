# Prompt 7 — Finance: the design review's changes (F1–F7; F8 is done)

**Paste into:** the Finance session (branch `finance`, worktree `daily-report-finance-tab-2b782f`). Part 1 now (Jeffrey asked sections to start what's ready); Part 2 after Dashboard core's step 1 (branch `dashboard-core`) is merged into main. This file reaches your worktree when `design-review` is merged into main; until then the Design Review session sends its text by message.

**Starter for Part 2:**

> `git merge main` first (the shared parts are on main now). Check that `src/components/ConfirmBox.jsx` exists; if not, stop and tell Jeffrey. Then read and do Part 2 of `docs/Design Review/End review/Prompts/7-Finance.md`. Mockups first; nothing is built before I OK them.

---

## The brief

The design review decided eight Finance changes, F1–F8 (change list §2.6; rulebook rows v1.000–v1.034).

**F8 is finished:** migration 0026 is live (applied 2026-10-28) and its screens are deployed (main 56308ff). This brief is F1–F7, in two parts:
- **Part 1, ready now:** F1, F3, F4, F7 and F2's database half. They need no shared part, and your status file's §18 already lists them.
- **Part 2, after Dashboard core's step 1 is merged:** F2's screen, F5 and F6, which switch to the shared parts (rows v1.100–v1.111).

The decisions are made. You draw them on Finance's screens, Jeffrey OKs each screen, then you build.

### Rules

- Follow CLAUDE.md.
- **Preview mode for building and trying changes:** `npm run dev:preview-mode`. `npm run dev`, `npm run preview` and `Start dashboard.bat` use the live database (`.worktreeinclude` copies `.env.local` into every worktree): run them only for a check Jeffrey OKs, never to try a change. `npm run build` is fine: it only builds.
- **Plan first:** a short plan (each item, its files, its mockup, any migration) in your docs folder; show it to Jeffrey.
- **Mockups before code** for every visual change, at PC 1280×800, tablet 820×1180 touch, phone 390×844 touch and 320 wide: a self-contained HTML file plus one PNG per screen with what changes outlined in amber (Jeffrey reviews the PNGs). He OKs them one screen at a time, before any code.
- One decision at a time, with pictures.
- **Reviews:** a separate design reviewer (the rulebook, the approved mockups, screenshots at the four sizes, and §4's six WCAG 2.2 checks, v1.033); a separate code reviewer; a separate security reviewer for anything touching the database (handoff §6).
- **Don't change a shared part on your own** (`src/components/…`, the shared helpers in `src/lib/`, `src/styles/shared.css`): every section uses them. If you need something a part can't do, ask Jeffrey first. He decides whether you change it in your branch (then list it as a shared file) or the Dashboard core session does.
- **Order (a push to main deploys):** the migration is live before the push that brings the app that uses it. A step whose app calls a new or changed database function is merged only after Jeffrey has applied its migration and the checks passed (fingerprints, security advisor, tests file — CLAUDE.md). Screen-only steps can go first.
- Keep `docs/Finance/TKD-Finance-Status.md` current (§18 onward).
- Commit on `finance` after each reviewed step. Never push.
- List every CLAUDE.md shared file you touch. Dashboard core's merge adds `src/styles/shared.css` and `src/components/text.js` to that list; treat them as shared either way.

### Rulebook

- New rows only for what Jeffrey decides in your mockups. The decisions themselves are rows already.
- Your block is 0.800–0.899; the next free number is **0.817**.
- Run `git merge main` first, and re-read the rulebook right before editing.
  - The 10b row goes just above `| Approved 2026-10-16 (v0.26) |`, and the changelog line at the end of §11.
  - Bump the header's Version / Last updated, and keep CRLF.
- **The shared parts' looks are already approved** (v1.102–v1.109; Star's date picker since v0.502 / v0.503). Switching to one needs no new mockup of the part itself: draw your screens with them wherever your own layout changes.

### Read first

1. **The change list** `docs/Design Review/End review/TKD-DesignReview-ChangeList.md`: §1, §2.6 and §6 D3. **The decision log** `docs/Design Review/Walkthrough/Decisions.md`: items 14a, 14b, 15a, 15c, 16a, 17a and 19.
2. **Rulebook rows:**
   - the design review's: v1.018, v1.019, v1.020, v1.022, v1.024 (with the §2.4 map row "Go to today"), v1.026 and v1.030;
   - Dashboard core's: v1.100 (the shared dropdown), v1.101 (the minus sign; the CSV keeps plain numbers) and v1.109 (the time list);
   - Finance's own rows behind them: v0.197 (History), v0.198 (Both), v0.203 (Settings), v0.207 (the approved mockups: Export dates, Settings times), v0.209 (the refunds words) and v0.815 (F8, including Both).
3. **Pictures.** Each picture shows today in amber and the drawn options in green. Copy only the option the rulebook row names as chosen. These also draw rejected options in green: 15c picture 6; 17a picture 4; d3 picture 8.
   - In `docs/Design Review/Walkthrough/`:
     - `14-dates.png` (Star's picker: pictures 1 and 4);
     - `14b-times.png`;
     - `15-back-links.png` (Finance's History: picture 3 today, picture 5 chosen);
     - `15c-both-schools.png` (picture 4 is Finance);
     - `16a-one-icon.png` (picture 4);
     - `17a-money-names.png` (picture 3 is Finance);
     - `19-shared-parts.png`.
   - `docs/Design Review/End review/d3-both-refunds.png`: pictures 5–7 are the chosen option.
4. **Finance's approved screens:** `docs/Finance/TKD-Finance-DailyReport-Mockups.html` — D1 staff report, D4 the admin's day row (F1, F4), D5 History, D7 Export, D9 Settings, D14 phone ⋯.
5. **For Part 2, the shared parts.**
   - Check each shared part in three places before you use it: its own header comment (the built version; it wins where the plan differs), the plan `docs/Dashboard Core/TKD-DashboardCore-Plan.md`, and the parts page `/parts.html` (preview mode only; each state has its own address, e.g. `parts.html#M2/busy`).
   - The plan's sections for you: §2 M8, §3 (M9–M11), §6 (file names) and §10.
   - The approved time list: `docs/Dashboard Core/Mockups/M8-time-list.review.png`. Its "Nothing chosen yet" state draws Finance's Off list.

## Part 1 — ready now (no shared part needed)

**Mockups**, one screen at a time:
- **Daily report** (D4's day row: F1's calendar; D14: F4's ⋯ Today);
- **Export** (F1);
- **History** (F3).

Every visible change is on an admin screen. Staff see nothing new.

**F1 — Star's date picker** (v1.018, which changes v0.207; picture 14).
- **The part:** `src/components/DatePicker.jsx`. It is Star's, already on main; Star's event dialog uses it.
- **Two places change:**
  - **The Daily report's calendar** (admins): `DayReport.jsx`, lines 441–515. Today a "Pick a date" icon button (`IconCalendar`, `.fin-ibtn`) sits over a hidden `<input type="date">` and opens the browser's own picker (`showPicker()`).
  - **Export's From and To** (`ExportDialog.jsx`, `dateField`, line 103): the browser's date fields, with the weekday under each.
  - The change list named only "the day box". But v1.018 covers every date staff pick, and v0.207's row says "See v1.018: Star's date picker for the export dates".
- **What changes on screen:** the same big month calendar on the PC, the iPad and a phone, and dates in words ("Sat, Oct 24, 2026").
- **The question for the mockup** (one decision, with pictures):
  - `DatePicker` draws its own field, a button with the date in words. It can't be opened from another button.
  - Either the day row shows the picker's field, or the calendar button opens the picker. The second needs a new option in the shared `DatePicker.jsx` (Rules: don't change a shared part on your own).
  - Prospects' follow-up date (`ProspectPanel.jsx`, lines 258–270: a date box with "Set date" in its Follow up panel) may need the same kind of change. Ask once, so one change serves both.
- **Also for the mockups:**
  - Export's weekday line (the picker's field already shows the weekday);
  - no future days (`max`);
  - picking today shows "today" (`onDay(null)`).

**F3 — "← Back to the day" as a text link** (v1.020, which applies v0.59's rule and changes v0.197; picture 15: picture 3 today, picture 5 chosen).
- **Today:** `HistoryView.jsx`, the `top` row (line 99).
  - PC and tablet: an outline button "← Back to the day" beside the "History" heading.
  - Phones: a bare arrow (`icon-button fin-back`).
- **New:** "← Back to the day" as a text link above the heading, on every size.
  - The model is v0.59's "← Testing" link: `src/screens/testing/chooser/BackToTesting.jsx` (`link-button tc-back`, a 16 px `IconArrowLeft`, a screen-reader name).
  - Its style is `.tc-back` in `src/screens/testing/chooser/chooser.css`: 24 px tall, and a 44 px tap area on touch.
- **One question for Jeffrey:** neither `.tc-back` nor the other sections' `.ev-back` is in `src/styles/shared.css`. Copy the look, or share it? It is the same question as Forms' N8 (Rules: don't change a shared part on your own).
- Picture 15 draws only the PC. Draw all four sizes.

**F4 — the ⋯ "Today" item loses its icon** (v1.024, §2.4 "Go to today: no icon"; picture 16a, picture 4).
- **Today:** `DayReport.jsx`, line 467. The phone ⋯ sheet's Today item has the Event icon (`IconCalendarEvent`), and it goes. The PC "Today" button already has none.
- **How:**
  - `RowMenu` draws an icon for every item (`src/components/RowMenu.jsx`, line 126), so leaving `Icon` out breaks it.
  - Pass a blank 16 px slot, as Color Belt and Camps do: `NoIcon`, a `menu-icon ev-noicon` span (`src/screens/testing/events/EventsTab.jsx`, `src/screens/camps/CampRowMenu.jsx`). "Today" then lines up with the other items.
  - Don't change `RowMenu` itself.

**F7 — Both names the refunds** (v1.022 / D3; picture d3, pictures 5–7).
- **Already built with F8:** mockup B8 and row v0.815 (7) put "after $X refunds" after each school's payment count and on "Both schools together", with returned checks named apart (`BothSummary.jsx` `bothMoneyOut`, `text.js` `bothAfter`).
- No database change and no new row. Don't rebuild it; check it.
- **Check it in the preview on Both:**
  - a day where Shrewsbury had refunds: "$675.00 8 payments · after $445.00 refunds";
  - a day with only refunds: "−$190.00 0 payments · after $190.00 refunds", and "Both schools together" ends with "· after $190.00 refunds" too.
- **Where to find those days:** the fake data counts back from the day it was made. They are 7 and 2 days back (Oct 17 and Oct 22 in picture d3, made on Oct 24). `__tkdPreview.resetFinance()` makes it again from today.
- If it matches, write F7 as done in the status file. If not, show Jeffrey before changing anything.

**F2, the database half — migration 0029** (v1.019, v1.109).
- **Why:** `finance_reminder_time_is_valid` (`supabase/migrations/0011_finance.sql`, line 95) accepts only 11:00–23:00 on 15-minute steps.
  - `finance_set_reminder_time` (it answers `invalid`) and the table check on `finance_reminder_times.remind_at` both use it.
  - So the shared time list's 11:05 would be refused.
- **What:** replace that one function: the same range, 5-minute steps, no seconds. Saved times stay valid.
- Number: **0029**, reserved for F2 on 2026-10-28 (CLAUDE.md; `0029_finance_reminder_5min.sql`). SETUP section `## Migration 0029: …`, step `step0029`.
- Handoff §6 applies: `set search_path = ''`, and the explicit `revoke` kept.
- **Tests:**
  - 5-minute times are accepted;
  - the times 0011 refuses ('19:31', '10:45', '23:15', '19:30:30') are still refused.
  - Run the PGlite tests with `cd supabase/tests/pglite && npm ci && node run.mjs` (`npm ci` once per worktree).
- **The preview's fake database follows the same rule:**
  - `isReminderTime` and `REMINDER_TIME_CHOICES` in `src/lib/finance/financeRules.js` (line 397; used by `mockFinance.js`);
  - their check in `src/lib/finance/checks.mjs` (lines 347–354): the choices count 49 becomes 145, and "19:40" becomes a valid time.
- **Security review,** then Jeffrey applies it and runs the checks.
- **When:** it only widens the rule, so it can go live now. It must be live before Part 2's Settings screen is pushed.

## Part 2 — after Dashboard core's step 1 is merged

**Mockup:** **Settings** (F2).

F5 and F6 change nothing on screen, so they need no mockup. Prove it with before / after shots of:
- the Daily report (one school and Both);
- Close the day;
- a payment's detail;
- Export, History, Settings and Print.

**F2 — the shared time list on the Settings screen** (v1.019, v1.109, M8). 0029 must be live first.
- **The switch:** `SettingsTab.jsx` (line 160) has 14 browser `<select>`s: Off, then 11:00 AM–11:00 PM every 15 minutes, from `REMINDER_TIMES` in `format.js` (line 146).
  - They become `TimeList` (`src/components/TimeList.jsx`, on `Select.jsx`, choices from `src/lib/times.js`) with `from="11:00"`, `to="23:00"` and `offLabel={T.OFF}`.
  - `REMINDER_TIMES` goes.
- **What changes on screen:**
  - a time every 5 minutes: Off + 145 times = 146 choices;
  - AM/PM on every time;
  - the list opens at the chosen time;
  - phones get the same list instead of the device's own picker.
- **Draw the Settings tab with it:** mockup D9's table on PC and tablet, one school at a time on phones.
- **To settle in the mockup:** the gray times while the reminder is Off. Today they are `disabled`; `TimeList` has `readOnly` ("gray and can't open").
- **Screen readers:** today each box is named by an `aria-label` (`T.timeFor`: "Monday reminder time at Shrewsbury"). `TimeList` takes `labelId` only, so give it the day and the school (two ids work).

**F5 — money through the shared helper** (v1.026, v1.101, M9). Nothing on screen changes.
- `money()` in `src/screens/finance/format.js` (line 17) becomes a thin wrapper of `formatMoneyWithCents` from `src/lib/money.js`. Its callers don't change.
- **Checked 2026-10-28:**
  - The two write the same text for every whole number of cents: every cent from −$3,000 to $3,000, large amounts, and "−$190.00" with its real minus sign.
  - They differ only for a number that isn't whole cents: `money` rounds it, and the shared helper gives ''.
  - So check that every `money(` call passes whole cents (F8 added some in `text.js`), and compare the two again after the merge.
- Not touched: the CSV (`src/lib/finance/csv.js`) keeps plain numbers ("-190.00", v1.101).

**F6 — helpers from their shared places** (v1.030, M10). Nothing on screen changes.
- `useLiveLoad` comes from `src/lib/useLiveLoad.js` (in `DayReport.jsx`, `HistoryView.jsx` and `SettingsTab.jsx`).
- `ChoiceGroup` comes from `src/components/ChoiceGroup.jsx` (in `DayReport.jsx` and `SettingsTab.jsx`).
- Today both come from `../testing/events/`.
- `usePaymentsHidden`: **no Finance file imports it** (checked 2026-10-28).
  - `App.jsx` switches in Dashboard core's step 1. Black Belt's four imports switch in Black Belt's prompt.
  - Keep `src/screens/finance/usePaymentsHidden.js` (a one-line re-export) until `git grep usePaymentsHidden -- src` finds no importer; then remove it. If Black Belt still imports it, say so in the status file.
- **Optional, not in the change list:** `text.js`'s Retry, Dismiss, Back, Close and Cancel (about line 214) can come from the shared words in `src/components/text.js`. The words are the same. Ask Jeffrey in one line.

## Waits for, or belongs to, another session

- **Don't move CSS out of `finance.css`.**
  - Dashboard core's step 2 moves its three Main blocks (`.fin-menu-switch`, `.fin-hidden-chip`, `.fin-home-lines`).
  - The Calendar's arrows copy `.fin-ibtn`'s look (v1.025); that is the new-students session's work.
- **Shared looks:** Jeffrey decides who changes them (see Rules):
  - the date picker's trigger (F1, with Prospects' follow-up);
  - the back-link look (F3, with Forms' N8).
- **The ⋯ menu that sometimes opens in the top-left corner on PC** (Dashboard core plan §10) is `RowMenu`'s. Finance's ⋯ is a phone sheet, so you shouldn't meet it. If you do, tell Jeffrey; don't fix it here.
- **The offline bar** on every page (M12) comes with Dashboard core's step 2. There is nothing to do in Finance.

## Done when

- **Part 1:**
  - F1, F3 and F4: mockups approved; built, reviewed and approved by Jeffrey in the preview.
  - F7: checked and written down.
  - 0029: security-reviewed, its PGlite tests pass, and Jeffrey has applied it with the checks passed.
- **Part 2:**
  - F2's Settings screen: approved, built, reviewed and approved.
  - F5–F6: code-reviewed, and the before / after shots show nothing changed.
- What Jeffrey decided is recorded as rows from 0.817 on.
- `npm run build` and `npm run build:preview-mode` pass. So do `node src/lib/finance/checks.mjs` and, after any migration change, the PGlite tests.
- The status file is current, and each reviewed step is committed on `finance`.
- No push. The Main session merges when Jeffrey asks; Part 2's Settings screen only after 0029 is live.
