# Calendar follow-ups + the "Show" menu: build plan

**Rulebook:** v0.612 (follow-ups on the Calendar), v0.613 (one Show menu, a rule for every Calendar item), v0.614 (mockups approved).
**Mockups (approved 2026-10-21):** `Calendar-show-mockup-PC.png`, `Calendar-show-mockup-tablet-phone.png` (this folder).
**Branch:** `claude/prospect-form-system-cd893d`. Nothing is built, pushed or applied to the live database without Jeffrey's OK at each step.
**Reviewed** by an independent plan reviewer on 2026-10-21; its findings are worked in below (marked "review").

---

## 1. What gets built (in plain words)

1. **Follow-ups appear on the Calendar.**
   - Every prospect with an open follow-up shows on its date: one chip per day with the count ("2 follow-ups").
   - The chip is amber when the follow-ups are due today or overdue, and blue when they are still ahead.
   - Month view shows the chip in the day box. Week view shows it in the All day row. The phone shows a hollow ring under the day.
   - The day panel gets a **Follow-ups** list. Tapping a row opens that child in Prospects.
2. **One "Show" menu** in the Calendar toolbar.
   - It has a tick box for each kind of item: Classes, Closures, Events, Free classes, Follow-ups.
   - Unticking a kind hides it everywhere on the Calendar.
   - The choice is remembered **for that person on that device**, and everything is ticked at first.

## 2. The one open question: where the Calendar gets the follow-up dates (Q1)

The Calendar can't read the prospects table directly. The database only answers prospect questions through its own functions (rulebook §5, migration 0012). Image: `Calendar-Q1-followup-data.png`.

### Option A: reuse the function the Prospects list already uses (recommended)

The Calendar asks `prospects_list` for each school on screen (the same call the Prospects screen makes) and keeps only the follow-ups.

- **Pros:**
  - **No database change.** No migration, nothing for you to paste in the SQL Editor, no fingerprint checks.
  - Same data as the Prospects screen. "What counts as a follow-up" lives in **one shared helper** used by both screens (review), so the two can't disagree.
  - Already tested and live.
- **Cons:**
  - It loads the whole prospect list of the school (a few hundred rows today) to find a handful of follow-ups.
  - **It must not reload on every click (review).** The Calendar reloads its own data on every month or week change and after every save. The follow-ups get their own loader that runs only when the Calendar opens, the school switcher changes, or the browser tab comes back into view. On Both that is 2 calls, not 2 per click.
  - That function also runs the **automatic clean-up** (Not interested after 6 months, others after 2 years). It would now also run when the Calendar opens. Who and what gets deleted is the same; only the moment changes. The clean-up already skips itself safely when another one is running (review: checked). The rulebook and 0021's wording "the next Prospects load" become "the next Prospects or Calendar load".
- **Later:** if the school ever has thousands of prospects, switch to Option B. No screen would change.

### Option B: a new, small read-only database function

A new function, `prospects_follow_ups(school, from, to)`, returns only the open follow-ups between two dates (id, child's first name, parent's last initial, date).

- **Pros:**
  - It sends only what the Calendar needs.
  - The Calendar never triggers the clean-up.
- **Cons:**
  - It is a **migration** (number 0025, reserved through the Main session first). It needs tests, a security review, your paste in the SQL Editor, fingerprint and advisor checks, and the SETUP and run.mjs entries.
  - About half a working session more.
  - The "what counts" rule would then be written twice: once in SQL, once in Prospects.

**Recommendation: A.**

## 3. Details I'll use unless you say otherwise

1. **Which follow-ups count:** the same rule as Prospects' "Follow up today" list.
   - Any child with a follow-up date, **except Joined and Not interested children** (review). Marking a child Joined doesn't clear its date, and Prospects already leaves those out.
   - The status names come from the same status list Prospects loads.
2. **How a child is named (correction):** exactly as in the Prospects list (v0.245), the child's first name and the parent's last initial: **"Ruby A."**.
   - The mockup and the v0.612 wording added the parent's full name ("· Jo Allen"). That breaks v0.245, so I'll correct v0.612.
3. **The tag on each row:**
   - "Overdue" (amber) on a past date.
   - "Due today" (amber) today.
   - No tag on later dates: the date is already the panel's title.
   - This replaces v0.612's "or the date it is due".
4. **What hiding each kind hides** (review):
   - **Classes:** class chips and counts, the Week view's class boxes, the day panel's class list, and the "New schedule starts" chip (it is about classes).
   - **Closures:** closure chips, warnings and the Week view's amber stripes. Cancelled classes stay **crossed out** when Classes are shown, because that is a fact about the class: a hidden closure must never make a cancelled class look like it runs.
   - **Events:** event chips, dots and day-panel rows.
   - **Free classes:**
     - the "2 free classes" chips and the phone dot;
     - the Week view's `ti-user-plus` badge on classes;
     - the day panel's free-class list, including its Check in buttons. If you need Check in, tick Free classes back on.
   - **Follow-ups:** chips, rings and the day-panel list. While hidden, follow-ups aren't loaded at all.
   - **In every case:** the day box's spoken summary (screen readers) leaves out what is hidden.
5. **Testing events:** the Calendar has a place for Color Belt / Star testing events, but its loader still returns nothing (`loadTestingEvents` in `src/lib/calendar/api.js`). When that is connected, it **adds a "Testing" line** to the menu (rule v0.613). It doesn't count as a sixth kind until then.
6. **On Both:**
   - Follow-ups from both schools are shown.
   - Each chip starts with W or S, like the other chips.
   - The day panel lists each school's follow-ups under that school's heading.
7. **Staff and admins see the same thing.** Nothing about a follow-up is changed from the Calendar.
8. **What is saved:**
   - The list of **hidden** kinds, in this browser, under a key that includes the signed-in person's id (`tkd.calendar.hidden.<id>`, the same pattern as Prospects' `tkd.prospects.view.<id>`).
   - Saving what is *hidden* means a kind added later starts **shown**.
   - The shared front-desk account has one setting for everyone who uses it.
   - Signing out keeps the choice, and nothing goes to the database.
   - If the browser blocks storage, everything is shown.
9. **If follow-ups fail to load:** the rest of the Calendar still shows (follow-ups are kept apart from the Calendar's own loading, review), with a small gray note in the day panel: "Couldn't load follow-ups."
10. **Opening a child from the Calendar** (review):
    - The Calendar hands the child's id to Prospects in memory, the same way Finance's reminder opens a month. Nothing goes into the web address or browser history.
    - Prospects waits for its list to load, then opens that child's panel. That counts as "opened" and refreshes the badge.
    - If the child was deleted in the meantime, the toast says "That prospect no longer exists" (changed by v1.004 / N1: the amber bar, until closed) and no empty panel opens.
    - Calendar and Prospects follow the same school switcher, so the child's school is always the one loaded.

## 4. Build steps

| Step | What | Files |
|---|---|---|
| **B1** | **The shared rule:** move "is this an open follow-up" (and `lastInitial`) out of `Prospects.jsx` into a shared helper. Prospects keeps working exactly as now. | new `src/lib/prospects/followUps.js`, `src/screens/Prospects.jsx` |
| **B2** | **Data:** a separate follow-ups loader (`listProspects` + `loadStatuses` per school on screen, keeping only `{id, school, childFirstName, initial, followUpOn}`; the rest of each answer is dropped at once). It reloads only on open, school change and tab return. `buildDay` adds each day's `followUps`, `followUpCount` and `followUpDue`. | new `src/lib/calendar/useFollowUps.js`, `src/lib/calendar/days.js` |
| **B3** | **The Show rules:** the list of kinds, reading and saving per person, and `applyShow(day, hidden)`. That function removes hidden kinds from a day (including the spoken summary), so every view uses the same answer. Plain functions with tests. | new `src/lib/calendar/showKinds.js`, `src/lib/calendar/checks.mjs` |
| **B4** | **The menu:** a new `ShowMenu` with the same look and placement as the ⋯ menu (dropdown on PC/tablet, sheet on the phone, same CSS), but its rows are tick boxes (`menuitemcheckbox` with `aria-checked`), ticking doesn't close it, and it ends with "Show everything" and "Done" (phone). Plus the Show button with `ti-filter` and the "4 of 5" badge (heard as "Show, 4 of 5 kinds shown"). **`RowMenu.jsx` is not changed**: about 30 screens use it. | new `src/screens/calendar/ShowMenu.jsx`, `src/screens/Calendar.jsx` |
| **B5** | **Drawing:** the Month chip (no wrap, "…" when narrow), the Week All day chip, the phone hollow ring (`dotsFor` keeps a place for it among its 3 dots), the day panel's Follow-ups list. Every view hides what `applyShow` hides. All texts go in `text.js`. | `MonthGrid.jsx`, `WeekView.jsx`, `PhoneMonth.jsx`, `DayPanel.jsx`, `src/screens/calendar/text.js`, calendar CSS |
| **B6** | **Open in Prospects:** the in-memory hand-over (see 3.10). | `src/App.jsx`, `src/screens/Prospects.jsx` |
| **B7** | **Preview data:** follow-ups in the fake database that are overdue, due today and later, on both schools, plus a Joined child and a Not interested child with old follow-up dates (they must **not** show). | `src/lib/mockProspects.js` |
| **B8** | **Checks:**<br>• `checks.mjs` (rules, saving, hiding), plus the Prospects checks still passing; `npm run build` and `npm run build:preview-mode`.<br>• A **design review** against the mockups and rulebook, with screenshots at 1280×800, 820×1180 touch, 390×844 touch and 320 wide, including keyboard and screen reader on the menu.<br>• A **security review**: no database change; only `{id, school, first name, initial, date}` is kept; no phone, age, notes or answers. | — |
| **B9** | **You try it in preview**, then I commit on this branch (no push). The Main session merges, and you OK the deploy. | — |

With Option B, a step **B0** comes first: reserve 0025 through Main, write the migration with its tests and fingerprints, review it, then you paste it and I run the read-only checks.

**Rulebook updates when you approve this plan:**
- v0.612: the name is "Ruby A.", and the tags are as in 3.3.
- v0.611 / 0021 wording: the clean-up runs on "the next Prospects or Calendar load" (Option A only).
- The Q1 answer.

**Shared files touched:** `src/App.jsx` (the signed-in person's id passed to the Calendar, and the in-memory hand-over to Prospects) and the rulebook. `src/lib/pageAddress.js` (web addresses) is **not** touched.

**Time:** about **one working session** for B1–B8 with Option A, and about one and a half with Option B. It depends mostly on how many fixes the design review finds.
