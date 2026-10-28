# Prompt 8 — New students (Prospects, Forms, Schedule, Calendar): the design review's changes (N1–N17)

**Paste into:** the new students session (branch `claude/prospect-form-system-cd893d`, worktree `prospect-form-system-cd893d`). Part 1 now (Jeffrey asked sections to start what's ready); Part 2 after Dashboard core's step 1 (branch `dashboard-core`) is merged into main. This file reaches your worktree when `design-review` is merged into main; until then the Design Review session sends its text by message.

**Starter to paste (for Part 2):**

> New students, Part 2. `git merge main` first (the shared parts are on main now). Check that `src/components/ConfirmBox.jsx` exists; if not, stop and tell Jeffrey. Then read and do Part 2 of `docs/Design Review/End review/Prompts/8-NewStudents.md`. Mockups first; nothing is built before I OK them.

---

## The brief (both parts)

The design review decided 17 changes for your four sections: Prospects, Forms (with its family page and the kiosk), Schedule and Calendar (N1–N17). The decisions are already rulebook rows **v1.000–v1.034**. **Part 1** is everything that needs no new shared part: start it now. **Part 2** switches to the shared parts the Dashboard core session built and Jeffrey approved (rows **v1.100–v1.111**); they reach main with its step 1, which is built but not yet merged. Each item keeps its change-list ID (N3, N17 …) in your plan, mockups, status and commits, so Jeffrey can trace it.

### Rules
- Follow CLAUDE.md.
- **Plan first:** a short plan (each item, its files, its mockup, any migration) in your docs folder; show it to Jeffrey.
- **Preview mode for building and trying changes:** `npm run dev:preview-mode`. `npm run dev`, `npm run preview` and `Start dashboard.bat` use the live database (`.worktreeinclude` copies `.env.local` into every worktree): run them only for a check Jeffrey OKs, never to try a change. `npm run build` is fine: it only builds.
  - Your `.claude/launch.json` has two entries: "schedule-preview" (port 5179) is the preview; "live-dashboard" (port 5180) runs `npm run dev` on the live database.
- **Mockups before code** for every visual change, at PC 1280×800, tablet 820×1180 touch, phone 390×844 touch and 320 wide: a self-contained HTML file plus one PNG per screen with what changes outlined in amber (Jeffrey reviews the PNGs). He OKs them one screen at a time, before any code.
- **One decision at a time,** with pictures: each option drawn, its pros and cons, a recommendation.
- **Reviews:** a separate design reviewer (the rulebook, the approved mockups, screenshots at the four sizes, and §4's six WCAG 2.2 checks, v1.033); a separate code reviewer; a separate security reviewer for anything touching the database (handoff §6).
- **Don't change a shared part on your own** (`src/components/…`, the shared helpers in `src/lib/`, `src/styles/shared.css`): every section uses them. If you need something a part can't do, ask Jeffrey first. He decides whether you change it in your branch (then list it as a shared file) or the Dashboard core session does.
- List every CLAUDE.md shared file you touch. Dashboard core's merge adds `src/styles/shared.css` and `src/components/text.js` to that list; treat them as shared either way. (`src/lib/mockClient.js` is one too: a new preview helper goes in your own fake-data file, e.g. `src/lib/mockProspects.js`; mockClient.js only registers it.)
- **Database:** none expected; every item is screen-only. If one turns up: a migration number from the Main session (next free 0030 on 2026-10-28), handoff §6 and a separate security review.
- **Status:** one table for N1–N17 in `docs/Prospects/` (e.g. `STATUS-DesignReview.md`), with a pointer at the top of your four `STATUS-*.md` files; update it in the same turn a step finishes or a decision is made.
- **Commit** on your branch after each reviewed step, and explain the commands. **Never push.**

### Rulebook
- New rows only for what Jeffrey decides in your mockups and questions (the "to settle" points below). Building what a row already says needs no new row.
- Your block **0.600–0.699**. **Next free: 0.616** (v0.612–v0.615 are on main). `git merge main` first; re-read the rulebook right before editing (other sessions edit it); keep its CRLF line endings.
- The 10b row goes just above `| Approved 2026-10-16 (v0.26) |`, the changelog line at the end of §11. Bump the header's **Version** and **Last updated**. A row you change gets a "(See v0.6xx …)" note at its start, not a rewrite.

### Read first
- **The rulebook** `docs/Dashboard Docs/TKD-Dashboard-Design-Guidelines.md`: §3.5, §4, §7 (red means gone for good), §8 (Toasts and errors; "Are you sure?" boxes); the rows named with each item (`grep -n "decided v1.0"`); your own rows these change or touch: v0.233–v0.236, v0.240, v0.243, v0.245, v0.246, v0.255, v0.600, v0.610, v0.613–v0.615.
- **The change list** `docs/Design Review/End review/TKD-DesignReview-ChangeList.md`: §2.7 (N1–N17), §4, §6 (D1d, D2a, D10b). **Jeffrey's decisions** in `docs/Design Review/Walkthrough/Decisions.md`: items 2, 5, 6, 8, 12b, 13, 14a, 14b, 15a–15d, 16a, 16b, 17b, 19.
- **The pictures** are in `docs/Design Review/Walkthrough/` (e.g. `06-undo-after-a-change.png`) and `docs/Design Review/End review/` (e.g. `d2a-prospects-hidden.png`), each with a `.json` of captions beside it; "picture 06 #5" below means picture 5 in `06-undo-after-a-change.png`. Each picture shows today in amber and the drawn options in green. Copy only the option the rulebook row names as chosen. These also draw rejected options in green: 08 picture 10; 15c picture 6; d1b picture 4; d2a pictures 4–5; d10b pictures 3–4.
- **Handoff §6** (`docs/Dashboard Docs/TKD-Dashboard-Handoff.md`), only if a database change turns up.

**CSS order.** In the real build `forms.css` loads before `app.css` and the shared looks (`testing.css` today, `shared.css` after the merge), because it shares a file with the family page; the dev preview loads it after them. A `forms.css` rule that must win against them needs a more specific selector; check it in a preview-mode build served as plain files (`npm run build:preview-mode -- --outDir dist-preview`; Dashboard core's `docs/Dashboard Core/tools/serve-static.mjs` serves it, once that's on main).

**Preview helpers** (header of `src/lib/mockClient.js`): `__tkdPreview.setRole('staff' | 'admin')`, `lockNow()`, `setShared(true)`, `kioskEndsIn(20)`, and `failNext…Save()` / `reset…()` for Schedule, Calendar and Forms. Prospects lives in the fake Forms store and uses the real date, not `setToday`.

Line numbers are main's on 2026-10-28; they may have moved.

---

## Part 1 — ready now (no shared part needed)

In this order: **N17 first**, as its own reviewed step and commit, so Jeffrey can have it merged ahead of the rest; then N1, N2, N4, N5, N6, N8, N9, N10, N12, N13, N14, N15. D10b changes nothing. The points marked **(now)** under "Found on the way" near the end are ready now too.

### N17 — Hide private details in Prospects (live today)
Rows v1.000 (2) and (3), applying v0.249 / v0.506 / v0.507; D2a; picture d2a #3 (#2 is the model, Star's candidate detail).
- **Today** no file in your four sections reads the switch: `usePrivateDetailsHidden()` and the words `HIDDEN_ON_THIS_TABLET`, in `src/lib/privateDetails.js` (it updates live). File: `src/screens/prospects/ProspectPanel.jsx`.
- **Email** (`:134`) is a `mailto:` link. While the switch is on:
  - it grays in the approved unavailable look, still focusable (`aria-disabled`, never `disabled`), as a button: **no `mailto:` address stays in the page** (a browser shows a link's address on hover);
  - one gray line under the Call · Text · Email row, with the top bar's icon (`ti-currency-dollar-off`): **"Email is off while private details are hidden. Email the family at the desk."**;
  - the model is Star's Email result (`src/screens/testing/star/results/ResultRows.jsx:139–160`, `ResultsTab.jsx:596–602`, `src/lib/star/resultsText.js:93`);
  - main has no gray for a plain button yet (only `.btn-primary.is-unavailable`, `testing.css:1063`; a page-wide one comes with Dashboard core's step 2): give Email that gray in `prospects.css`.
- **Form answers** (`:405–428`): every answer (the `<dd>`, `:411`) reads **"Hidden on this tablet"**. The questions, the "N answers · waiver signed …" line and Show signature stay.
- **Stay:** Call, Text and the Phone row (phone numbers stay, v1.000 (3)). Screen only: the switch is a screen guard (v0.161).
- **Draw:** the panel with the switch on and Form answers open: PC beside the list, tablet below it, the phone page (under way: `docs/Prospects/DesignReview-N17-private-details-mockup.png`).
- **A question no decision covers:** Fill in and "+ Add prospect" (the same `src/screens/forms/useFillIn.js`) show the typed email and answers while Hide private details is on (`parent_email` is always asked, `FormFields.jsx:53`). Desk-only like Star's New candidate (v0.507: grayed with "Add new candidates at the desk."), or unchanged? Ask Jeffrey (one question, with a picture).

### N1 — "That prospect no longer exists." moves to the amber bar
v1.004; v0.615 (the Calendar's hand-over); picture 05 #3–4.
- Today a toast with a ✓ (`Prospects.jsx:204`; the toast's default icon), when a follow-up tapped in the Calendar belongs to a child deleted meanwhile.
- Show it in the page's amber `ErrorBanner` (`Prospects.jsx:731`), with × to close. The ✓ goes; the words stay (`prospects/text.js:150`).
- **Draw:** the Prospects page with the bar.

### N2 — Undo for 5 seconds
v1.006; picture 06 #5–7.
- **Prospects' panel status** (`Prospects.jsx:234–245`; toast "Status: …", `prospects/text.js:208`) gets the Board drop's Undo (`Prospects.jsx:396–404`: the old status back, with its joined date when it was Joined).
  - **To settle:** Joined, which asks a date first (`saveJoined`, `:246–254`). The Board's Joined drop has no Undo either.
- **Forms' Close / Open:** the list's ⋯ (`Forms.jsx:169–182`) and the builder's "Accepting sign-ups (Live)" switch (`Builder.jsx:327–344`). Undo sets the status back. The toasts' words stay ("… is closed — the link now says so." / "… is taking sign-ups again.").
- **Draw:** the toasts with Undo, PC and phone.

### N4 — "Open form again" → "Open form", no door icons; N12 — Edit uses `ti-edit`
v1.016 (picture 12b #4, #7); v1.024 (picture 16a #4). Both in the Forms list's ⋯ (`Forms.jsx:207–223`).
- "Open form again" (`forms/text.js:42`) → **"Open form"**; "Close form" stays. Their door icons (`IconDoorExit` / `IconDoorEnter`, `Forms.jsx:217`) go: no icon.
- Edit's pencil (`IconPencil`, `Forms.jsx:211`) → `IconEdit`.
- The Walk-in template's `ti-door` (`NewFormDialog.jsx:12`) is a different, approved icon (v0.235): it stays.
- **Draw:** the ⋯ for a Live and a Closed form (PC dropdown, phone sheet).

### N5 — the family page: "Next" → "Continue", "Submit" → "Send"
v1.017; picture 13 #3, #5–7.
- `src/forms/text.js:17` "Next" → **"Continue"**; `:19` "Submit" → **"Send"** (used at `FormsApp.jsx:354`). Back and "Sending…" stay. The kiosk runs the same page (`KioskApp.jsx:24`), so it changes too.
- The sentences that name the button follow: "press Submit again" → "press Send again" (`src/forms/text.js:30`, `:31`, `:32`).
- Done pages keep their words (v0.604).
- **To settle:** staff Fill in says "Next" / "Submit" too (`FillInDialog.jsx:140`; `forms/text.js:23`, `:249`, and `:274` "press Submit again"). v1.017 names only the family page: ask whether Fill in follows.
- **Draw:** a middle and the last step on the phone (390 and 320) and the PC, and the kiosk.

### N6 — the shared date picker
v1.018; picture 14 #3–4. The part is Star's `src/components/DatePicker.jsx`, already on main.
- Nine browser date boxes:
  - Prospects: Joined's date (`prospects/Dialogs.jsx:98`), the follow-up's date (`ProspectPanel.jsx:259`), a note's "Pick a date" (`:349`);
  - Calendar: a closure's From / To (`calendar/ClosureDialog.jsx:144`, `:160`), an event's dates (`EventDialog.jsx:188`, `:219`);
  - Schedule: "Starts on" (`schedule/PlanDialog.jsx:114`);
  - Forms: the Date question (`forms/FormFields.jsx:122`), drawn in staff Fill in, the family page and the kiosk.
- The family page (`forms.html`) loads only `tokens.css`, `forms.css` and `forms-public.css` (`src/forms/main.jsx`). Star's family form already uses the picker on such a page: copy its set-up (`src/star-register/DobField.jsx`).
- **The follow-up's date** (`ProspectPanel.jsx:258–272`: a date box and "Set date" among the follow-up choices) needs the picker opened from another button, and so does Finance's day box (F1). The picker opens only from its own field today: one change to the shared DatePicker serves both, so ask Jeffrey first (rule above).
- **To settle:** a form's Date question can be a birthday or a future date: which years and days it offers, and where an empty calendar opens.
- **Draw:** each date field closed and open, one per section, and the family page's on a phone.

### N8 — the builder's "← Forms"
v1.020, applying v0.59; picture 15 #2, #4.
- The bare arrow beside the title (`Builder.jsx:349–355`, an icon button named "Back to Forms") becomes the text link **"← Forms"** above the title, like Color Belt's "← Testing" (`src/screens/testing/chooser/BackToTesting.jsx`; its look `.tc-back`, `chooser.css:90`).
- Keep its save-first step (`await saveNow()`).
- No back-link look is shared yet (Star and Black Belt keep their own copies, `.st-back`, `.bb-back`). Copying `.tc-back` into Forms or making it shared is one question for Jeffrey, the same as Finance's F3 (rule above).
- **Draw:** the builder's header (PC three panels, tablet, phone).

### N9 — the staff lines
v1.021; picture 15b #2–3, #6–7.
- Calendar (`calendar/text.js:10`): "View only — ask an admin to make changes." → **"View only. Ask an admin to make changes."**
- Forms (`forms/text.js:10`): "View only — ask an admin to create or change forms." → **"Staff can fill in and share forms. Ask an admin to create or change forms."**
- **To settle:** the Calendar's event and closure dialogs show the old form too (`calendar/text.js:158`, "View only — ask an admin to change this.").
- **Draw:** both pages signed in as staff (`setRole('staff')`).

### N10 — "Both schools" on the Schedule
v1.022; picture 15c #2 (Prospects on Both, the model).
- `schedule/text.js:15` "Worcester and Shrewsbury" → **"Both schools"**. On main it shows only as the phone ⋯ sheet's subtitle (`Schedule.jsx:147`).
- **The Both page has no page line** (`Schedule.jsx:129` passes no subtitle), while Prospects, Calendar and Forms show "Both schools" under the title. Draw that line on Both and confirm it with Jeffrey (v1.022 assumed one).
- **Draw:** the Schedule on Both (PC, tablet, and the phone with its ⋯ sheet).

### N13 — the icon-only buttons become the shared `IconButton`
v1.025 (1); picture 16b #1, #2, #5. The part (`src/components/IconButton.jsx`) is on main; its look is `.tib*`, in `testing.css` today and `shared.css` after Dashboard core's merge.
- The 13, checked on main (each a plain `icon-button`, 44 px with a 20 px icon, no tooltip):
  - Calendar: ⋯ (`Calendar.jsx:627`), previous / next (`:663`, `:666`), the Event types rows' ⋯ (`EventTypesDialog.jsx:83`);
  - Schedule: the three ⋯ (`Schedule.jsx:106`, `ScheduleSchool.jsx:489`, `:547`);
  - Prospects: ⋯ (`Prospects.jsx:723`), the panel's ✕ (`ProspectPanel.jsx:107`), the Edit statuses rows' ⋯ (`StatusesDialog.jsx:63`);
  - Forms: a field's ⋯ (`Builder.jsx:538`), remove option ✕ (`FieldEditor.jsx:81`) and remove child (`FormFields.jsx:150`, a trash icon).
- The 14th, the builder's bare back arrow (`Builder.jsx:350`), goes with N8. The dialogs' phone back arrows stay (v1.025).
- What changes: 28 px with a 16 px icon; on PC a tooltip with the same words as today's hidden names ("More actions", "Previous month" …); a 44 px tap area on touch.
- **Calendar's previous / next take Finance's bordered look:** Finance's own class `.fin-ibtn` (`src/styles/finance.css:132–151`). Don't edit `finance.css` (Finance changes it in its own prompt). Finance's class as it is, a copy, or one shared look: ask Jeffrey (rule above).
- **Remove child is also on the family page** (`src/forms/FormsApp.jsx:28` draws `FormFields`), which loads neither stylesheet with the button's look. The kiosk runs inside the dashboard (`App.jsx:90`) and has it, but `forms-public.css` loads after it there (`KioskApp.jsx:29`). Make it right on both, or keep the family page's button as it is: ask Jeffrey.
- **Draw:** every screen with one of the 13 (Fill in's children included).

### N14 — Forms' Sent tick
v1.025 (2); picture 16b #3, #6.
- Fill in's Sent screen (`FillInDialog.jsx:59`) draws a 40 px `ti-circle-check`. Use the family page's 24 px `ti-check` in its 48 px pale-green circle (`src/forms/ThankYou.jsx:36–38`). That style (`.fp-done__ok`, `forms-public.css:414`) isn't loaded by the dashboard; `forms.css` is loaded by both (mind the CSS order above).
- **Draw:** the Sent screen (PC dialog, phone page).

### N15 — the unsaved-changes guard
v1.027, finishing v0.46 / v0.56; v0.81; picture 17b #2–3, #7.
- **Fill in** (`forms/useFillIn.js:104–110`, also Prospects' "+ Add prospect") and **New form** (`Forms.jsx:299–303`) close on the second Esc or Back today. Keep their note until Send / Save or Cancel: a second Esc does nothing.
  - The notes: Fill in's "This sign-up isn't sent yet. Send it or press Cancel to throw it away." (`forms/text.js:278`); New form's "Unsaved changes. Save or cancel first."
  - Both sit above the buttons (`FillInDialog.jsx:119–123`, `NewFormDialog.jsx:89–93`); on PC and tablet they go under them (v0.81).
  - **Phones:** neither has a Cancel or "Discard changes" today (`FillInDialog.jsx:125`, `NewFormDialog.jsx:94–95`; `forms/text.js:279`, "Throw it away", is unused), so after the fix a phone couldn't leave. Add v0.56's "Discard changes" inside the note, as the Schedule's dialogs have it (`SlotDialog.jsx:104–115`). Settle Fill in's phone words: "press Cancel" has no Cancel there.
- **Prospects' Edit statuses** (`Prospects.jsx:702–707`): a changed Add / Edit status step goes back to the list and drops the change. Show **"Unsaved changes. Save or cancel first."** The step's way out is "← Edit statuses" on PC (`StatusesDialog.jsx:213–216`) and only Save on phones: settle which button throws the change away.
- **Draw:** each of the three after Esc, PC and phone.

### D10b — no change
The Calendar's and Schedule's red **Remove** (`calendar/EventDialog.jsx:112`, `ClosureDialog.jsx:91`, `schedule/SlotDialog.jsx:98`) stays red and instant with Undo (v1.007, §7: "gone for good" means nothing to bring it back from later). Don't "fix" it. Picture d10b #1–2 is today, the chosen option.

---

## Part 2 — after Dashboard core's step 1 is merged

`git merge main` first, and check that `src/components/ConfirmBox.jsx` exists; if not, stop and tell Jeffrey.

Rows v1.102–v1.109 (and v1.111) approved each shared part as drawn: switching to one needs no new mockup of the part itself. Draw your screens with the parts wherever your own layout changes (e.g. Prospects' Came box stops being a full-screen page on phones).

Check each shared part in three places before you use it: its own header comment (the built version; it wins where the plan differs), the plan `docs/Dashboard Core/TKD-DashboardCore-Plan.md`, and the parts page `/parts.html` (preview mode only; each state has its own address, e.g. `parts.html#M2/busy`). In the plan, read §2 (M2, M8), §2b, §3 (M10, M11), §6, §8, §9 rows 31–39 (yours) and §10; its approved pictures are `docs/Dashboard Core/Mockups/M2-confirm-box.review.png` and `M8-time-list.review.png`.

| Today | Shared part | What visibly changes |
|---|---|---|
| 9 confirm boxes drawn by hand | `components/ConfirmBox.jsx`, `ConfirmButtons` (v1.008, v1.103) | N3 |
| the browser's time boxes | `components/TimeList.jsx` (v1.109) | N7 |
| two dialogs open at once on phones | `Dialog.jsx`'s `onTop` + `returnFocusTo` (v1.100) | Back closes only the top one |
| `Grip` from `screens/testing/RankRows.jsx` (`calendar/EventTypesDialog.jsx:18`, `forms/Builder.jsx:29`, `prospects/StatusesDialog.jsx:16`) | `components/Grip.jsx` (v1.100) | nothing: switch the three imports (`RankRows.jsx` re-exports it) |

`shared.css` now holds the nav badge (`.rail-icon`, `.bottombar-icon`, `.nav-badge`, from `prospects.css`) and the red button's gray (`.btn-delete.is-unavailable`, from `calendar.css`): don't add them back. **Not for you:** the other parts (Prospects has no duplicate check, v0.244; Forms keeps its Share box, v1.015; Prospects keeps its own history line, v1.010); your `<select>` dropdowns stay.

### N3 — the confirm boxes
v1.008, v1.103; D1a–D1d; pictures 08 #5 and #9, d1a #4, d1b #3, d1c #3, d1d #5–8. Plan §9 rows 31–39:

| # | Box | Where | Today | New |
|---|---|---|---|---|
| 31 | Delete prospect | `prospects/Dialogs.jsx:182` | "Delete Ava?" · Cancel · Delete · "Deleting…" | **Keep prospect** · **Delete prospect** (the panel button's words, `prospects/text.js:162`) |
| 32 | Delete status | `prospects/StatusesDialog.jsx:114–147` (a step with "Move them to") | Cancel · Delete; no first focus; closes while it works | **Keep status** · **Delete status** (the ⋯ item, `text.js:255`) |
| 33 | Came (a Board card dropped on Came) | `prospects/Dialogs.jsx:114–136` | Cancel · Came (focused) · "Saving…"; on phones a full page with only Came | **Keep in Booked** · **Came**, focus on Came. "Booked" is the column the card sits in, by its current name (a No-show's card sits in Booked, v0.610; "Keep in New" from New). |
| 34 | "… 's free class is still ahead" | same | one button, Cancel | one button, **Keep in Booked** (d1d #8) |
| 35 | Delete form | `Forms.jsx:310–329` | "Delete this form?" · Cancel · Delete · "Saving…" | **Keep form** · the ⋯ item's words · "Deleting…" |
| 36 | Open kiosk mode on this device? | `forms/ShareDialog.jsx:204–221` (inside Share) | Cancel · Open kiosk mode (focused) · "Opening…" | **Stay in the dashboard** · **Open kiosk mode** |
| 37 | End kiosk mode on all tablets? | `ShareDialog.jsx:223–236` | Cancel · End kiosk mode; nothing shows while it works | **Keep kiosk mode on** · **End kiosk mode** · "Ending…" |
| 38 | Delete event type | `calendar/EventTypesDialog.jsx:138–176` (a step with "Move to") | Cancel · Delete · "Deleting…" | **Keep type** · **Delete type** (the ⋯ item, `calendar/text.js:55`) |
| 39 | Delete planned schedule | `schedule/ScheduleSchool.jsx:664–687` | Cancel · Delete; nothing shows while it works | **Keep schedule** · **Delete planned schedule** (the ⋯ item, `schedule/text.js:42`) · "Deleting…" |

- **Which part:** `ConfirmBox` for 31, 33, 35 and 39. `ConfirmButtons` (the button row alone, with `autoFocus`) for 36–37 inside Share, and for 32 and 38: ConfirmBox's sentence is a `<p>`, so a box with a "Move to" picker keeps its own confirm dialog. `autoFocus` also gives 32 its missing first focus.
- **`loses`:** `'forGood'` for the deletes (red, first focus on "Keep …"); `'nothing'` for Came and the kiosk asks (blue, first focus on the action, D1c).
- **What visibly changes:** the words; while it works the pressed button grays with its busy words, "Keep …" grays too, and Esc, a click outside and Back wait (today 32, 36 and 37 close); the buttons stack full width when they don't fit (likely 36 at 320); the action is as wide as its wider words ("Came" as wide as "Saving…"); always a first focus, never the pinned row, a failure note under the buttons; 33–34 become the small box on every device (today a full page on phones).
- **31 on phones** opens on top of the panel page: `onTop` and `returnFocusTo` (see "On top").
- **34 has one button;** ConfirmBox draws two, so don't use it (or change it) here. Draw the same small box with one "Keep in Booked" (a `Dialog` with `variant="confirm"`), and give its button row ConfirmBox's classes `dialog-actions cfm-actions`: a plain confirm dialog pins its button row on screens under 700 px tall (`shared.css`, the `max-height: 699.98px` rule), the bug v1.103 (c) fixes. Check it at 820×600.
- **To settle in your mockup:**
  - 35: the ⋯ item says only "Delete" (`forms/text.js:43`); v1.008's example is "Delete class", not "Delete": draw "Delete form" in the menu and the box;
  - 38: the Edit type dialog's own button says only "Delete" (`EventTypesDialog.jsx:238`, `:254`): "Delete type" there too?
  - 35's refusal for a form with sign-ups (`Forms.jsx:193`) and 38's "only type, in use" state show a single Close / Cancel today: draw them with the shared box (the note under the buttons, v1.103);
  - 36's notes (`KIOSK_NOT_SHARED`, a failure) sit above the buttons today.
- **"Cancel" stays in form dialogs** (Cancel · Save); it only leaves the confirm boxes.

### N7 — the shared time list
v1.019, v1.109; picture 14b #2 and #4.
- The browser's time boxes go: `schedule/SlotDialog.jsx:234`, `:251` (Starts / Ends) and `calendar/EventDialog.jsx:203`, `:231`.
- **No migration.** Both databases accept any whole minute on a 5-minute step, at any hour (`schedule_time_is_valid`, `0007_schedule.sql:108–121`; `calendar_event_times_are_valid`, `0008_calendar.sql:183–202`; the boxes use `step={300}`). The list offers only such times, and a saved time outside it still shows.
- Keep v0.600: a new time slot opens on 4:00 PM–4:40 PM (`ScheduleSchool.jsx:35`).
- What changes: a list instead of the typed box (on phones too), AM/PM on every time, opening at the chosen time.
- **To settle:** the Calendar's range. v1.019 names 6:00 AM–10:00 PM for classes, testing and camps; an event (a tournament's early start, a party until 11 PM) may need a wider one (`from` / `to` are props).

### On top — two dialogs at once on phones
v1.100; plan §2b.
- On phones the prospect panel is a full-screen dialog (`Prospects.jsx:747`); the dialogs it opens are drawn as a second one (`:766`), and one Back press closes both.
- Give them `onTop` (and `returnFocusTo`), so Back closes only the top one: Delete (box 31) and, the same case though not in Dashboard core's list, Book a free class / Change time and Joined. Check each in the preview.

### N16 — Calendar's Show menu; Prospects' delete box
- **The Show menu waits.** It becomes the shared menu only after the Dashboard core session gives `RowMenu` tick-box items (v1.100 "later"; plan §8). You don't change `RowMenu` (rule above); Jeffrey decides when. Until then `calendar/ShowMenu.jsx` stays as it is (v0.613–v0.615).
- **Prospects' delete box:** the change list says Prospects uses Testing's `DeleteDialog`. It doesn't: Prospects has its own (`prospects/Dialogs.jsx:182`; Testing's has two users, Color Belt and Star, plan §3 M10). Nothing to re-import; box 31 becomes ConfirmBox (N3).

---

### Waits for another session

**N11 — the hints point to Settings → Classes and ranks** (v1.023; picture 15d #10).
- Waits for Main's M15 and Color Belt's CB14, which move Classes and ranks to Settings. Until Jeffrey says that's on main, the hints stay: Schedule `schedule/text.js:48` (shown at `SlotDialog.jsx:122`) and `:60` (`SlotDialog.jsx:149`); Forms `forms/text.js:154` (`BookingSettings.jsx:35`).
- Whether they become links is the change list's D6 (Classes and ranks in Settings), settled in Dashboard core's and Color Belt's mockups.
- Then: `git merge main`; draw the new words — links too, if the change list's D6 (Classes and ranks in Settings) says so — and build.

**N16's Show menu:** when Jeffrey says `RowMenu` has tick-box items on main.

### Found on the way (not decided)

From Dashboard core's plan §10 and from writing this prompt. Confirm each point in the preview. Where a shared part already fixes it, fix it with the switch. Where a fix would change the screen in a way no row decided, ask Jeffrey first (one question, with a picture).

- **(now) Dates taken in UTC:** Prospects' notes and history (`whenLine`, `prospects/text.js:205`) take the date from the timestamp, so in the evening (after 8 PM, 7 PM in winter) a change shows the next day. The same in the waiver's "signed" date (`text.js:168`) and the builder's "last published" (`forms/text.js:82`). Use the Massachusetts date (`localDay`, `prospects/progress.js:18`; after the merge also `src/lib/historyDates.js`).
- **(now) Forms on the live site only:** the spots box (`.fslot-spots`, `forms.css:603`) is full width instead of 64 px, and the waiver box (`.fwaiver-edit`, `forms.css:533`) 88 px tall instead of 160 px: `app.css`'s `.input` and `calendar.css`'s `.ctextarea` win in the real build (CSS order, above). Make both win in any order; check in the built copy.
- **(now) The kiosk** loads `forms-public.css` (`KioskApp.jsx:29`), which re-declares `.btn`, `.input`, `.field` … for the whole page while kiosk mode is open. Check what the dashboard still draws there (the PIN pad); fix only what differs from the approved kiosk.
- **(now) Forms' builder "Delete field"** (the ⋯ item, `Builder.jsx:566`; "Delete this field", `FieldEditor.jsx:171`) is red, acts at once and has no Undo, and drops any "Show only if" that pointed at the field (`Builder.jsx:222–236`). Rule 1.4: what can't be undone asks first. Found with D10b: ask Jeffrey; don't fix it on your own.
- **(now) Prospects' search clear ✕** (`Prospects.jsx:739`, `PipelineBar.jsx:53`): about 18 px with a mouse (under §4's 24 px, v1.033), no tooltip (rule 1.4), not one of N13's 13. Ask Jeffrey.
- **(now) Edit statuses' ⋯ "Delete status"** (`StatusesDialog.jsx:101`) is grayed with no reason line (v1.004) for staff, who can never delete a status (v0.244 (5); §8: staff don't see what they can never do), and for the built-in ones. Ask Jeffrey.
- **(Part 2) The Share dialog doesn't wait** while a kiosk ask works (`ShareDialog.jsx:141`: its Esc / Back isn't held while `busy`): fix it with boxes 36–37.
- **The ⋯ menu sometimes opens in the top-left corner on PC** (`RowMenu.jsx`, Dashboard core's file): tell Jeffrey if you see it; don't fix it here.
- **Weight 600 breaks §7** (400 and 500 only): `calendar.css:227`, `:937`, `:1051` and `forms-public.css:396`. Ask Jeffrey after his answer to Dashboard core's D6 (the receipt's font weights).

### Done when

- **Part 1:** N1, N2, N4, N5, N6, N8, N9, N10, N12, N13, N14, N15 and N17, and the "(now)" points Jeffrey wants fixed, are built, reviewed (design review at the four sizes, code review) and approved in the preview by Jeffrey. It can be merged on its own.
- **Part 2:** N3, N7, the on-top fix and the Grip imports, the same way, after the merge.
- N11 and N16's Show menu are done, or wait for their sessions; the status file says which.
- Jeffrey's new decisions are rows from your block.
- These pass:
  - `npm run build:preview-mode`, then `npm run build`;
  - `node src/lib/prospects/checks.mjs`, `node src/lib/forms/checks.mjs`, `node src/lib/calendar/checks.mjs`, `node src/lib/schedule/checks.mjs`, `node src/screens/prospects/progress.checks.mjs`;
  - `node src/forms/checks.mjs` after `npm run build` (it reads `dist/`, which `build:preview-mode` also writes, so run `build` last);
  - `node --test functions/tests/`;
  - after any migration, `node run.mjs` in `supabase/tests/pglite` (`npm ci` there first, CLAUDE.md).
- The status file is current, the work is committed on your branch, and every shared file you touched is listed.
- No push: the Main session merges when Jeffrey asks.
