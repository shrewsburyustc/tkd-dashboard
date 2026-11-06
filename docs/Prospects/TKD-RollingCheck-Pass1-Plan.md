# New students — rolling check pass 1: plan

Source: `docs/Design Review/Rolling check/Pass 1/Fix-NewStudents.md` (on main 6b27cdd; Jeffrey: "Yes, send them", relayed by Main 2026-11-05). Branch `claude/prospect-form-system-cd893d`, main merged in (6b27cdd). Each item keeps its finding id. **Nothing is built before Jeffrey OKs it. No push.**

Every step goes the same way: picture or mockup (PC 1280, tablet 820 touch, phone 390 touch, 320 wide; amber = what changes) → Jeffrey's OK → build in preview mode → design review + code review → Jeffrey tries it in the preview → commit on this branch → report to Main.

No database change in steps 1–6. Step 7 is the 0036 clean-up migration, **0040** (reserved by Main 2026-11-05, main 2187dbe).

## The order (proposed)

### Step 1 — The family page's trash icon (R5-02, R5-03). Unblocks Camps.
- **R5-02:** on the family page (`/f/…` → Add another child) the trash icons are near-black (#1F1F1F); in Fill in and the kiosk they are the approved gray (#6B6B6B, v0.626 picture A). One CSS rule makes them gray there too. Nothing new: it matches what was approved.
- **R5-03:** that icon-button look moves out of `forms-public.css` into one small stylesheet of its own, loaded where `forms-public.css` loads (family page, kiosk). Nothing changes on screen. Then Main tells Camps, whose family page loads it (Camps' R5-03 waits on this).
- **Picture:** the trash icons before / after.
- **Files:** `src/styles/forms-public.css`, a new `src/styles/icon-button-public.css`, `src/forms/main.jsx`, `src/screens/kiosk/KioskApp.jsx`.

### Step 1b — Focus when a dialog changes step (found by Camps' review, relayed by Main 2026-11-05)
- **Found:**
  - After Send in Fill in, focus falls to the page instead of the Sent screen's Close. Esc then does nothing, and the first Tab lands on "Fill in another" (WCAG 2.4.3). Prospects' "+ Add prospect" uses the same dialog.
  - ~~Prospects' Edit statuses and the Calendar's Event types have the same problem.~~ **Corrected 2026-11-06:** they already move focus when the step changes (the 2026-11-05 test ran in a hidden pane, where animation frames don't run). Their real gap: back on the list, focus goes to the first row, not the one you came from.
  - Jeffrey 2026-11-06: "Focus fix first" (before the Calendar plan).
- **Why:** each is one dialog whose steps are drawn in the same place, so React keeps the dialog open instead of opening it fresh. The dialog moves focus only when it opens, and the button that had focus is gone.
- **Change:** each step's dialog gets its own key, so it opens fresh and focus goes where the step marks it (`data-autofocus`):
  - Fill in's Sent screen → Close;
  - a status's or type's step → its Name box;
  - back to the list → the row you came from, as Star's signature link does (G5).
  - Black Belt does this already (`blackBelt/staff/cycle/CyclePage.jsx`), and Camps is fixing its copy of Fill in the same way.
- **No picture:** nothing changes on screen. Checks: the keyboard at the four sizes in the preview, then a code review.
- **Files:** `forms/FillInDialog.jsx`, `prospects/StatusesDialog.jsx`, `Prospects.jsx`, `calendar/EventTypesDialog.jsx`, `Calendar.jsx`.

### Step 2 — Retry when a save or an Undo fails (R2-01, High)
- **Today:** in Forms, a failed Close / Open form, its Undo, or Duplicate shows "Your last change wasn't saved … it will try again with your next change." Nothing ever tries again (the form can stay Closed). In Prospects, a failed save shows a bar with no Retry, and a failed Undo can't be retried at all.
- **Change:** each bar gets **Retry**, which repeats the same call (as Calendar, Schedule, Camps, Star and Black Belt do). This covers the Forms list, the builder, the Prospects page and the profile window's own bar.
- **Words:**
  - Undo: "Undo didn't save. Check the connection, then retry."
  - Other saves: "Couldn't save. Check the connection, then try again." (Black Belt's and the Schedule's words). Prospects' "It wasn't saved. Check the connection and try again." changes to the same; it's outlined in amber in the mockup.
  - The builder's draft autosave keeps its own line, because it really does try again.
- **Mockup:** the bars at the four sizes.
- **Files:** `Forms.jsx`, `forms/Builder.jsx`, `forms/text.js`, `Prospects.jsx`, `prospects/ProspectPanel.jsx`, `prospects/text.js`.

### Step 3 — Toasts and short words (R2-09, R2-07's "open again", R2-08, ⋯ names, Forms' empty line)
- **R2-09:** 14 toasts in Prospects, Forms and Calendar drop the ✓ (Prospects and Forms) and their closing full stop. Examples: "Note saved", "Copied as "Copy of …" (a Draft)", "[name] checked in" (v1.046 (7), v1.051 (5)).
- **R2-07 (after an Undo):** an Undo that opens a form again says "Undone. The form is open again." This applies in the Forms list and in the builder (v1.051 (1)).
- **R2-08:** Duplicate's toast gets **Undo**, which deletes the new Draft copy, as Camps' Save as template does (v1.006). It uses the same delete call as ⋯ Delete form; a copy made a moment ago has no sign-ups.
- **⋯ names:** a planned schedule's ⋯ is named "More actions for Winter", not "More for Winter" (v1.045 (6)).
- **Forms' staff empty line:** "No forms yet." becomes "No forms yet. An admin adds them." (v0.53).
- **Plus:** a stale comment in `forms/FillInDialog.jsx`.
- **Picture:** the words before → after, with Duplicate's toast drawn.
- **Files:**
  - Prospects: `Prospects.jsx`, `prospects/text.js`
  - Forms: `Forms.jsx`, `forms/Builder.jsx`, `forms/text.js`, `forms/FillInDialog.jsx`
  - Calendar and Schedule: `calendar/text.js`, `schedule/text.js`

### Step 4 — Prospects' list: "Showing … only" and "Find a prospect" (R3-03 + R3-09)
- **R3-03:** while the List is filtered (it opens on Follow up today), one gray line shows "Showing follow up today only · Show all". It is drawn as the shared line under the count cards (v1.047 (10)). The Board shows everyone, so it gets none.
- **R3-09:** the search box reads "Find a prospect". It leaves the chip row and sits on the left, above the list, under the "Showing" line (v1.050, v1.047 (15)). It still finds by phone, and its screen-reader name says so.
- **When nothing matches**, one line shows: 'No prospects match "zz". · Clear search'. The box's own ✕ stays as it is.
- **Board and Both:** the same; the Board says what a search shows in its own note.
- **Mockup:** List, Board and Both at the four sizes. It shows each filter's words, nothing found, and the tap areas on touch.
- **Files:** `Prospects.jsx`, `prospects/PipelineBar.jsx`, `prospects/Board.jsx`, `prospects/text.js`, `src/styles/prospects.css`.

### Step 5 — Small looks (one picture per screen)
- **R3-11:** the page ⋯ goes last, to the right of the blue button. This applies to Prospects, Calendar, and the Schedule's phone headers (v1.047 (16)).
- **R4-06 and smaller:**
  - Calendar's W / S school letters go from 11 px to 12 px (§7's minimum).
  - Four screen texts go from weight 600 to 500 (§7): the W / S letters, the week's "free" mark, the "done" mark, and the family page's phone number.
- **Family page Send:** it grays while it says "Sending…", in the approved unavailable look. Fill in's Send is checked after Dashboard core's R1-08.
- **Fill in's phone Sent page:** 8 px between the two stacked buttons (Black Belt's spacing).
- **Edit statuses on a phone:** "No-show" and "Not interested" stop wrapping inside the name column.
- **S-10 (decided, v1.048 (20)):** a screen this step works on swaps the browser's dropdown for the shared one. That means Edit statuses' "Move to" and the Schedule's Current / Planned picker. The picker has a "Planned" group: if the shared dropdown can't show groups, I ask before changing a shared part.
- **Files:**
  - Pages: `Prospects.jsx`, `Calendar.jsx`, `Schedule.jsx`, `schedule/ScheduleSchool.jsx`, `prospects/StatusesDialog.jsx`
  - Styles: `calendar.css`, `forms-public.css`, `forms.css`, `prospects.css`
  - Family page and Fill in: `src/forms/FormsApp.jsx`, `forms/FillInDialog.jsx`

### Step 6 — N7: the shared time list (Part 2)
- Add / Edit time slot and Add / Edit event drop the browser's time box for the shared time list (M8, v1.109). The picture was drawn 2026-11-04 (`DesignReview-N7-time-list.png`). It is redrawn because S-10 also swaps two dropdowns in these dialogs: the event's Type and an edited time slot's Day.
- No database change.
- **Files:** `schedule/SlotDialog.jsx`, `calendar/EventDialog.jsx`, `calendar.css`, the Schedule's CSS.

### Step 7 — The 0036 clean-up migration: 0040
- Reserved by Main 2026-11-05 (main 2187dbe). The file is `supabase/migrations/0040_<what>.sql`; its SETUP section is "## Migration 0040: …"; its test-runner step is `step0040`.
- Forms stop accepting what only an old page could send: a child as `{first_name, age}` and an address as plain text. The new app has been live since 2026-11-04, more than the 12 hours a kiosk page can stay open.
- It replaces `forms_check_answers` and `forms_submit_core` (0036's versions). Nothing new for anon.
- PGlite tests, then a security review, then Jeffrey pastes it in the SQL Editor (fingerprints, security advisor, tests file).
- No screen change, so no merge waits on it.

## Waits on Dashboard core (Main tells me when each is on main)
- **R2-05:** an Undo pressed during another save waits its turn ("Undoing…"). This covers Calendar, Prospects' status and Board drop, Forms' Close / Open, and Forms' "Copy to the other school" Undo (v0.642; its design review found the same silent drop, 2026-11-05).
- **R2-07:** the shared words for "Someone else changed [name] just now …" and a failed Undo.
- **R3-06:** the builder's "← Forms" becomes the shared back link; `.fb-back` goes.
- **S-2:** every load-failure line ends "…, then retry." with Retry. It also covers:
  - opening a form, Add prospect's list of forms, and a failed check-in in the Calendar's day panel (its own words);
  - follow-ups, the family page's open times, Print, and Show signature.
  - Mockup then, including the family page's line and whether the signature's Retry is its own.
- **Fill in's Send** grays after R1-08.
- **Part 2's last two:** N16's Show menu (after the shared menu gets tick boxes) and N11 (after Color Belt's CB14 / M15 moves Classes and ranks to Settings).

## Check only (already done)
- **R2-06:** dates use the Massachusetts day ("(now)" 2).
- **Smaller list:** a Draft form's Fill in is grayed (v0.628); "Delete form" (N3); the Clear search ✕ (R5-01); R4-02; Delete field (v0.630).

## Questions for Jeffrey (one at a time, when the step comes)
1. **Step 3:** Forms ⋯ "Duplicate" uses the copy icon, which the icon map gives to "Copy to clipboard". Either add a map row (nothing changes on screen), or use another icon?
2. **Step 3:** Prospects' note box warns "Unsaved note. Save it or cancel first."; the shared warning (N15) says "Unsaved changes. Save or cancel first." Keep the note's own words, or switch?
3. **Step 5:** Prospects' follow-up date and booking a free class have no 5-second Undo. Add Undo, or record them as exceptions?

## Shared files (CLAUDE.md list)
- None expected in steps 1–7.
- S-2 (later) needs a failed-read helper. It goes in our own fake-data file and is only registered in `src/lib/mockClient.js`, so that file gets listed then.
- Step 1's new stylesheet becomes shared once Camps loads it.
