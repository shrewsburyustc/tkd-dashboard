# New students — fixes from the design review's rolling check (pass 1)
> **Pass 2 (2026-11-05) corrects or adds to items here:** see `../Pass 2/Fix-NewStudents.md`, "Corrections to pass 1".

**Paste into:** the new students session.

This file reaches your worktree when `design-review` is merged into main; until then the Design Review session sends its text by message.

**Starter to paste:**

> `git merge main` first. Then read and do `docs/Design Review/Rolling check/Pass 1/Fix-NewStudents.md`: the fixes the design review's rolling check found in your merged work. Plan first. Mockups first for anything that changes how a screen looks. Nothing is built before I OK it.

---

## The brief

The design review's rolling check (phase 1d) looks at each section's design-review work after it merges: against the rulebook, the approved mockups, and the other sections that do the same job. Pass 1 covered `main` up to 5f1db41 (2026-11-03), in preview mode at the four sizes. Four reviewers looked (R1 money · R2 changes, mistakes and safety nets · R3 lists, menus and pickers · R4 item-by-item conformance and privacy). Two separate checkers then verified every finding. This file is what they confirmed in your merged work (N1, N2, N4, N5, N6, N8, N9, N12, N17). Your N10, N13 and N14 merged after the cut (f8873e7); pass 2 checks them.

- **Fix now:** straight fixes. Plan them, show Jeffrey, then build. An item marked "after [owner]'s [id]" waits until that fix is on main: plan it now, build it after.
- **Waits on Jeffrey:** nothing now: Jeffrey answered every pass 1 question (v1.035–v1.051).
- **Smaller:** fix them while you're in the file. A few are questions your prompt already told you to ask Jeffrey.
- Each item keeps its finding id (R2-01, R2-06 …) so Jeffrey can trace it. Use the id in your plan, status file and commits.
- **Line numbers** are main d7b5ebf's (checked again 2026-11-05); they may move again. After the cut, your N10, N13 and N14 and then your N3 work (v0.633) and your 0036 work (v0.634–v0.641) changed the Prospects, Forms, Calendar and Schedule files, so every reference in this file was checked again and now cites d7b5ebf's lines.
- **Paths:** `Forms.jsx`, `Prospects.jsx` and `Calendar.jsx` are in `src/screens/`; `forms/…` and `prospects/…` are under `src/screens/`, and so are the bare names `Builder.jsx`, `FillInDialog.jsx` and `FormsList.jsx` (in `src/screens/forms/`); `FormsApp.jsx` is the family page's `src/forms/FormsApp.jsx`; `calendar.css` and `forms-public.css` are in `src/styles/`; `components/…` is `src/components/…`.

### Rules

- Follow CLAUDE.md.
- **Plan first:** a short plan (each item, its files, its mockup, any migration) in your docs folder; show it to Jeffrey.
- **Preview mode for building and trying changes:** `npm run dev:preview-mode`. `npm run dev`, `npm run preview` and `Start dashboard.bat` use the live database (`.worktreeinclude` copies `.env.local` into every worktree): run them only for a check Jeffrey OKs, never to try a change. `npm run build` is fine: it only builds.
- **Mockups before code** for every visual change, at PC 1280×800, tablet 820×1180 touch, phone 390×844 touch and 320 wide: a self-contained HTML file plus one PNG per screen with what changes outlined in amber (Jeffrey reviews the PNGs). He OKs them one screen at a time, before any code.
- **One decision at a time,** with pictures: each option drawn, its pros and cons, a recommendation.
- **Reviews:** a separate design reviewer (the rulebook, the approved mockups, screenshots at the four sizes, and §4's six WCAG 2.2 checks, v1.033); a separate code reviewer; a separate security reviewer for anything touching the database (handoff §6).
- **Don't change a shared part on your own** (`src/components/…`, the shared helpers in `src/lib/`, `src/styles/shared.css`): every section uses them. If you need something a part can't do, ask Jeffrey first. He decides whether you change it in your branch (then list it as a shared file) or the Dashboard core session does.
- List every CLAUDE.md shared file you touch (`src/styles/shared.css` and `src/components/text.js` are on that list). (`src/lib/mockClient.js` is one too: a new preview helper goes in your own fake-data file, e.g. `src/lib/mockProspects.js`; mockClient.js only registers it.)
- **Database:** none expected; every item is screen-only. If one turns up: ask the Main session for a migration number, follow handoff §6, and get a separate security review.
- **Order (a push to main deploys):** the migration is live before the push that brings the app that uses it. A step whose app calls a new or changed database function is merged only after Jeffrey has applied its migration and the checks passed (fingerprints, security advisor, tests file — CLAUDE.md). Screen-only steps can go first.
- **CSS order:** mind prompt 8's "CSS order" note. In the real build `forms.css` loads before `app.css` and `shared.css`, so check any `forms.css` or `forms-public.css` change in a preview-mode build served as plain files (`npm run build:preview-mode -- --outDir dist-preview`, served with `node "docs/Dashboard Core/tools/serve-static.mjs"`, as prompt 8 says; never `npm run preview`).
- **Status:** keep `docs/Prospects/STATUS-DesignReview.md` current, with a short "Rolling check, pass 1" part. Update it in the same turn a step finishes or a decision is made.
- **Commit** on your branch (`claude/prospect-form-system-cd893d`) after each reviewed step, and explain the commands. **Never push.**
- When a step is done, send the Main session a short report: Done (with the commit) · Needs Jeffrey (one question, options, your recommendation) · Next.

### Rulebook

- New rows only for what Jeffrey decides in your mockups and questions, from your block **0.600–0.699**: the next unused number (check the rulebook first).
- `git merge main` first; re-read the rulebook right before editing (other sessions edit it); keep its CRLF line endings.
- The 10b row goes just above `| Approved 2026-10-16 (v0.26) |`, the changelog line at the end of §11. Bump the header's **Version** and **Last updated**. A row you change gets a "(See v0.6xx …)" note at its start, not a rewrite.

---

## Fix now

Most severe first.

### R2-01 — A failed save or Undo in Forms and Prospects has no Retry, and Forms promises a retry that never comes · High

Picture (today, with amber outlines): `docs/Design Review/Rolling check/Pass 1/pictures/H2-forms-failed-undo-no-retry.png`.

- **What's wrong:**
  - **Forms.** When Close / Open form, its Undo or Duplicate fails, the list shows the builder's autosave sentence: "Your last change wasn't saved. Check the connection — it will try again with your next change." with × only. Nothing ever tries again. In the checker's run the form stayed Closed even after a later change saved, and families opening its link saw "This form is closed".
  - **Prospects.** A failure shows "It wasn't saved. Check the connection and try again." with no Retry. After a failed Undo the toast is gone too, so nothing can be retried (the status stayed Contacted). Every Prospects save failure takes this path (status, Board drop, check-in, booking). While a child's profile window is open, it shows in the window's own amber bar instead (`prospects/ProspectPanel.jsx:765–769`, your 0036 work, v0.640), also with no Retry.
  - Calendar, Schedule, Camps, Star and Black Belt all give Retry.
- **Rule:** v1.004 / §3.5 and §8 Error banners: a connection failure always has Retry in the same bar.
- **Change in Forms:**
  - In `Forms.jsx:184, 206, 213` (and the New form dialog's note at `:162`) and `forms/Builder.jsx:416` (and its Undo path at :409), set the banner with `retry` that runs the same call. Words: "Undo didn't save. Check the connection, then retry." for an Undo, the section's "Couldn't save…" otherwise.
  - Pass `onRetry` to the bars at `Forms.jsx:417` and `Builder.jsx:652`.
  - Keep `SAVE_FAILED_BAR` only for the builder's draft autosave.
- **Change in Prospects:** give `afterWrite`'s 'error' branch (`Prospects.jsx:290`) a retry. `afterUndo` passes the same Undo, so a failed Undo can be retried. Pass `onRetry` to both bars: the page's (`:867`) and the profile window's (`prospects/ProspectPanel.jsx:767`, which gets the bar through its `banner` prop, `Prospects.jsx:650`).
- **Check (preview mode):** Close a form → `__tkdPreview.failNextFormsSave()` → Undo within 5 s; then change a prospect's status, once in its profile window and once on the Board → `__tkdPreview.failNextFormsSave()` → Undo. (The helper fails the very next Forms or Prospects call, read or write, so arm it after the change and before the Undo.) Each time: a bar with Retry → Retry → "Undone", and the form is Live again or the status is back.

### R2-06 — Prospects' dates are cut from a UTC time, so an evening change shows tomorrow · Medium · done in your "(now)" point 2 — check only

- **Done** in your "(now)" point 2 (2379605, on main since 7456636; a bug fix under v1.108, no new row): the history (`prospects/text.js:311`), the waiver's Date signed and the profile window's sent date (`prospects/text.js:237`, used at `prospects/ProspectPanel.jsx:434, 584`) and the builder's "last published" (`forms/text.js:97`) all go through `localDay` (`src/lib/schedule/versions.js:42`), with evening-time checks in `src/screens/prospects/progress.checks.mjs:70–75`.
- **Check:** `node src/screens/prospects/progress.checks.mjs` passes; a status change made after 8 PM shows today's date in its History line.

### R2-05 (your part) — An Undo pressed during another save is dropped without a word · Medium · after Dashboard core's R2-05

- **What's wrong:** the shared Toast removes itself before it runs Undo (`components/Toast.jsx:73–77`), and your Undos return early while another save runs (`Calendar.jsx:595`, `Prospects.jsx:303` and the Board drop's `:485`, `Forms.jsx:194`). So the toast vanishes, nothing happens and nothing is said. Staff believe it was undone.
- **Rule:** rule 1.4 / v1.006; §3.5 (never silent).
- **Change:** after Dashboard core's R2-05 (an Undo pressed while a save runs is *queued*: it waits its turn and runs as soon as that save ends, and its toast stays as "Undoing…"), each of these Undos (Calendar's `runUndo`, Prospects' status and Board-drop Undos, Forms' `undo` in `toggleClosed`) uses Dashboard core's helper. The builder's switch Undo already waits its turn (`enqueue`, `Builder.jsx:401`).
- **Check (preview mode):** `__tkdPreview.setTestingDelay(2500)` (it slows Calendar and Forms too); make two changes, press the first one's Undo during the second save → it runs after it, with "Undone".

### R2-08 (Forms' part) — Duplicate has no 5-second Undo · Low

- **What's wrong:** Forms' "Duplicate" makes a new Draft with no Undo (`Forms.jsx:182`), while Camps' Save as template (a new template) has one (v0.726). In one place a slip can be undone, in the next it can't.
- **Rule:** v1.006 / rule 1.4: every change that can be reversed gets Undo for 5 seconds.
- **Change:** Duplicate's toast gets Undo, which deletes the new Draft, as Camps' Save as template does. (Star's part of R2-08 is in Star's file.)
- **Check (preview mode):** Duplicate a form → toast with Undo → Undo → "Undone", and the copy is gone.

### R5-02 — The family page's Remove child icon is near-black, not the approved gray · Low (pass 1b)

- **What's wrong:** on the public family page (`/f/free-class-instagram` → Add another child) the trash icons are #1F1F1F; in Fill in and the kiosk they are the approved gray #6B6B6B. The page's own reset `button { color: inherit }` (`forms-public.css:49–55`) beats the zero-weight `:where(.tib)` copy (`:130–143`).
- **Rule:** v0.626 (2): the family page draws Remove child the same way; `docs/Prospects/DesignReview-N13-question2.png`, option A.
- **Change:** in `forms-public.css`, after `:where(.tib)` (`:130–143`), add `button:where(.tib) { color: var(--color-text-secondary); }`. It wins on the family page; inside the kiosk the dashboard's own `.tib` still wins, with the same color.
- **Check (preview mode):** `/f/free-class-instagram` → Add another child: both trash icons compute rgb(107, 107, 107) at 1280 / 820 / 390 / 320 and darken on hover (PC). Kiosk and Fill in unchanged.

### R3-03 — Prospects says when its list is filtered · Low · decided 2026-11-04 (v1.047)

- **What's wrong:** the List opens on "Follow up today" (`Prospects.jsx:692`), and a stage or chip filters it too, but only the pressed chip says so: there is no "Showing … only · Show all" line, as under the count cards (v1.107).
- **Rule:** v1.047 (10) (Jeffrey, 2026-11-04: "Approve all"): when Prospects' list is filtered (it still opens on Follow up today, v0.236), the gray "Showing … only · Show all" line shows, as under the count cards.
- **Change:** under the `PipelineBar` (`Prospects.jsx:712`), in the List while a filter is on (the opening one included): one gray line, "Showing [filter] only · Show all", drawn as the shared one (`<p className="ev-filter-line cards-showing">` with a `link-button inline-link`, as `src/components/CountCards.jsx:110` draws it; v1.117's touch rules, `src/styles/shared.css:2166–2201`, work only inside `.cards-showing`). Show all shows everyone. After Show all with the keyboard, the focus goes to the chip or stage that was on (v1.119, as the shared cards do). The Board always shows everyone, so it gets none. The row adds only the line: the stage counts keep v0.236's look (R3's note S-12). Mockup first, with the line's words for each filter.
- **Check (preview mode):** Prospects at 1280, 820 touch and 390: the List opens with the line ("Showing follow up today only · Show all", or the approved words); Show all → everyone, and the line goes; tap Booked → its own line. At 820 / 390 / 320 touch, Show all's tap area covers neither the chips nor the list.

### R3-11 — The page ⋯ goes last, right of the blue button · Low · decided 2026-11-04 (v1.047)

- **What's wrong:** the page ⋯ sits left of the blue add button in Prospects (`Prospects.jsx:845` before `:847–857`) and Calendar (`Calendar.jsx:626–632` before `:633–643`), and in the Schedule's phone headers (`Schedule.jsx:106–112` before `:119–122`; `schedule/ScheduleSchool.jsx:502–508` before `:511–519`). Camps and Black Belt put it last.
- **Rule:** v1.047 (16) (Jeffrey, 2026-11-04: "Approve all"): a page's ⋯ comes last, to the right of the blue button.
- **Change:** move each of the four ⋯ after its blue button.
- **Check (preview mode):** Prospects and Calendar at 1280, 820 touch and 390, and the Schedule (one school and Both) at 390: the ⋯ is the last button in the header, and Tab reaches the blue button first.

### R2-09 (your part) — Prospects' and Forms' toasts drop the ✓ · Low · decided 2026-11-04 (v1.046)

- **What's wrong:** in Prospects "✓ Note saved.", "✓ Free class booked for [name]." and "✓ [name] was deleted.", and in Forms "✓ Copied as "…" (a Draft).", "✓ … was deleted.", "✓ … is published — families see the new version." and "✓ Booking settings saved — they are live now." show the check icon and a full stop. The shared Toast keeps the ✓ for the account toasts (`src/components/Toast.jsx:6–10`); Testing, Camps and Black Belt toasts have neither.
- **Rule:** v1.046 (7) (Jeffrey, 2026-11-04: "Approve all"): only the account toasts (PIN, password) show a ✓; Prospects', Forms' and Finance's success toasts drop the ✓.
- **Change:** pass `icon: false` where the ✓ shows today (`Prospects.jsx:274`, which passes `{}` when there is no Undo, and `:528`; `Forms.jsx:182, 223`; `forms/Builder.jsx:356, 384`).
- **Check (preview mode):** save a note on a prospect: "Note saved", with no ✓; Duplicate a form: "Copied as "Copy of …" (a Draft)", with no ✓; publish a form: the same.

### R3-09 (your part) — "Find a prospect", on the left above the list · Low · decided 2026-11-04 (v1.047, v1.050)

- **What's wrong:** Prospects' box reads "Search name or phone" (`prospects/text.js:31`), sits at the right end of the chip row on PC and tablet (`prospects/PipelineBar.jsx:144`; on phones on its own line under the chips, `:107`; on Both, one box for the two schools, `Prospects.jsx:870–887`) and says "No one matches that search." (`prospects/text.js:48`). Black Belt says "Search candidates", on the left above its table; Camps says "Find a camper".
- **Rule:** v1.050 (Jeffrey, 2026-11-04: "A: Find a …"; settles v1.047 (14)): the three in-list search boxes read "Find a candidate" (Black Belt), "Find a camper" (Camps, as v0.715) and "Find a prospect" (Prospects), and sit on the left, above the list; Prospects' box moves out of the chip row. When nothing is found, one line: 'No candidates / campers / prospects match "[text]".' followed by a Clear search link, as "Showing … only · Show all"; the box's own ✕ stays the shared icon button (v0.631). Prospects' box still finds by phone, and its screen-reader name keeps saying so. Picture: `docs/Design Review/Rolling check/Pass 1/pictures/Q11-list-search-words.png`.
- **Change:**
  - The placeholder reads "Find a prospect" (`prospects/text.js:31`). The screen-reader name (`:32`, today "Search prospects by child, parent or phone") keeps saying that the box finds by phone, and starts with the words shown (e.g. "Find a prospect by child, parent or phone").
  - The box (`prospects/PipelineBar.jsx:48–67`) leaves the chip row (`:144`) and sits on the left, above the list, in v1.047 (15)'s order: after R3-03's "Showing … only" line, before the list. Phones (`:107`) and Both (`Prospects.jsx:870–887`) the same.
  - The no-match line (`prospects/text.js:48`, used at `Prospects.jsx:703`) reads 'No prospects match "[text]".' and ends with "· Clear search", a link that empties the box, drawn like the shared "Showing … only · Show all" line; the box's ✕ stays the shared `IconButton` (v0.631).
  - The Board says what a search shows in its own note (`prospects/Board.jsx:98–104`, "Showing N of … · matching …"): draw the Board with nothing found in your mockup.
  - Mockup first, with R3-03's line.
- **Check (preview mode):** Prospects at 1280, 820 touch and 390: the box reads "Find a prospect" and sits on the left, above the list, out of the chip row; type "zz": 'No prospects match "zz". · Clear search', and the Clear search link brings everyone back (so does the box's ✕); four digits of a family's phone number still find it. Board and Both the same.

### R4-06 (your part) — Screen text drops from weight 600 to 500 · Low · decided 2026-11-04 (v1.048)

- **What's wrong:** four screen rules use weight 600, which §7 doesn't allow (400 and 500 only): `.cchip-letters`, `.cweek-free` and `.cshow-done` in `calendar.css:238, 959, 1073`, and `.fp-tel` in `forms-public.css:471`.
- **Rule:** v1.048 (23) (Jeffrey, 2026-11-04: "Approve all"): screen text uses weights 400 and 500 only (§7): Black Belt's, Camps' and New students' 600s go to 500; printed sheets keep their heavier weights (v0.142, v0.143).
- **Change:** those four → 500. Check `forms-public.css` in the preview-mode build served as plain files (Rules, "CSS order").
- **Check (preview mode):** Calendar at 1280 and the family page (`/f/free-class-instagram`) at 390: those four compute weight 500.

### R5-03 (your part) — The family pages' icon-button look in one small stylesheet · Low · decided 2026-11-04 (v1.048)

- **What's wrong:** your family page removes a child with the trash icon button, and its look lives inside `forms-public.css` (`:124–211`). Camps' family page shows the word "Remove" instead, and it doesn't load `forms-public.css`, so it can't share the look today.
- **Rule:** v1.048 (22) (Jeffrey, 2026-11-04: "Approve all"): every family page removes a child with the trash icon button (v0.626's look), so Camps' "Remove" link changes.
- **Change:** move the `:where(.tib…)` block (`forms-public.css:124–211`, with R5-02's color rule, so do it with or after R5-02) into one small public stylesheet, loaded wherever `forms-public.css` loads today (`src/forms/main.jsx:15`; the kiosk, `src/screens/kiosk/KioskApp.jsx:29`). Check it in the preview-mode build served as plain files (Rules, "CSS order"). Then tell the Main session, so Camps can load it on its family page (Camps' R5-03).
- **Check (preview mode):** `/f/free-class-instagram` → Add another child, Fill in and the kiosk: the trash icons look and act as after R5-02 (gray, 28 px, the tooltip, 44 px on touch).

### Pass 1b ⋯ names (your part) — The planned schedule's ⋯ says "More for Winter" · Low · decided 2026-11-04 (v1.045)

- **What's wrong:** a planned schedule's ⋯ is named "More for [name]" (`schedule/text.js:39`, used at `schedule/ScheduleSchool.jsx:558, 722`), which its tooltip shows. Every other row ⋯ says "More actions for [name]", Prospects' and Calendar's included.
- **Rule:** v1.045 (6) (Jeffrey, 2026-11-04: "Approve all"): a row's ⋯ is labelled "More actions for [name]".
- **Change:** `schedule/text.js:39`: "More for …" → "More actions for …" (keep the fallback "this planned schedule").
- **Check (preview mode):** the Schedule with a planned schedule: hover or Tab to its ⋯, and the tooltip reads "More actions for Winter" (or that schedule's name).

### R2-07 (your part) — One set of words for "someone else changed it" and a failed Undo · Low · decided 2026-11-04 (v1.045) · after Dashboard core's R2-07

- **What's wrong:** Prospects says "Someone else changed this prospect. It was reloaded — please try again." (`prospects/text.js:321`); Forms "Couldn't undo. Someone else changed this form just now." and "Someone else changed this form. It was reloaded — please redo your last change." (`forms/text.js:56, 108`); Calendar "Couldn't undo: it changed meanwhile. …", "Couldn't undo. Check the connection and try again." and "Someone else changed this. The calendar now shows the latest." (`calendar/text.js:253–255`); Schedule "Someone else changed this just now. Your change wasn't saved." and "Couldn't undo. Someone else changed this just now." (`schedule/text.js:159, 169`).
- **Rule:** v1.045 (4) (Jeffrey, 2026-11-04: "Approve all"): a refused change or Undo says "Someone else changed [Name] just now, so nothing was done. Their change is shown." or "Couldn't undo: [reason].", and a failed Undo says "Undo didn't save. Check the connection, then retry."
- **Change:** after Dashboard core's R2-07, use its three sentences from `src/components/text.js` at those lines: a refused change or Undo names the prospect, form, event or time slot; a failed Undo says "Undo didn't save. Check the connection, then retry." (as R2-01 already does).
- **Check (preview mode):** close a form, then `__tkdPreview.simulateOtherAdminEditForms()`, then Undo within 5 s: "Someone else changed [name] just now, so nothing was done. Their change is shown."; in Calendar, add an event, then `__tkdPreview.simulateOtherAdminEditCalendar()`, then Undo: the same sentence.

### R3-06 (your part) — Forms' back link switches to the shared one · Low · decided 2026-11-04 (v1.048) · after Dashboard core's R3-06

- **What's wrong:** the builder's "← Forms" is your own copy of `.tc-back` (`.fb-back`, `forms.css:196–210`; `forms/Builder.jsx:425`), as v0.624 chose until a shared one existed.
- **Rule:** v1.048 (12) (Jeffrey, 2026-11-04: "Approve all"): Dashboard core builds one shared back link in `.tc-back`'s look (24 px, a 16 px arrow, a 44 px touch box pulled back so the title doesn't move), and every section switches to it.
- **Change:** after Dashboard core's R3-06, use it at `Builder.jsx:425` (keep its words, its "Back to Forms" name and its save-first step), and `.fb-back` goes.
- **Check (preview mode):** the builder at 1280, 820 touch, 390 and 320: "← Forms" looks as today, and the form's name doesn't move between 1280 and 820.

### S-2 (your part) — One line when a page can't load · Low · decided 2026-11-04 (v1.051) · after Dashboard core's S-2

- **What's wrong:** Calendar, Forms and Prospects end their load failures "… Check the connection and try again." (`calendar/text.js:252`, `forms/text.js:15`, `prospects/text.js:18`), where your Schedule, Camps, Finance and Color Belt end "… Check the connection, then retry.". Three places show the line with nothing to press:
  - opening a form in the builder (`Forms.jsx:96`);
  - the Add prospect box's list of forms (`prospects/Dialogs.jsx:197`), where the line says "the prospects";
  - a check-in from the Calendar's day panel that failed (`Calendar.jsx:589`), which isn't a load at all.
- **Rule:** v1.051 (2) (Jeffrey, 2026-11-04: "Yes approved go ahead"): when a page can't load, it says "Couldn't load. Check the connection, then retry." with Retry, everywhere. A line may still name what didn't load ("Couldn't load the calendar. Check the connection, then retry."), so only the endings change: Calendar, Forms, Prospects and Black Belt … (R3's S-2). A read that fails behind a menu or inside a dialog is a connection failure too: v1.004 and §8 ("always include Retry where it applies") already ask for its Retry.
- **Change:**
  - After Dashboard core's S-2 puts the sentence in `src/components/text.js`, the three lines end "Check the connection, then retry." (they keep naming what didn't load: "Couldn't load the calendar.").
  - `Forms.jsx:96` gets a Retry that opens the form again, and the Add prospect box a Retry that reads the forms again, with words that name the forms.
  - `Calendar.jsx:589`: a failed check-in gets its own words and a Retry that checks in again (v1.004: a connection failure always has Retry in the same bar), not the load line.
  - Two shorter lines say less and have no Retry: the day panel's "Couldn't load follow-ups." (`calendar/text.js:88`, `calendar/DayPanel.jsx:182`) and "Couldn't load the open times. Check the connection." (`forms/text.js:284`, `forms/FormFields.jsx:351`, which the family page draws too). They end the same way, with Retry (v1.051 (2): everywhere): "Couldn't load follow-ups. Check the connection, then retry." and "Couldn't load the open times. Check the connection, then retry."; show the family page's line in your mockup.
  - Your 0036 work added two lines in the profile window that end the old way: "Couldn't get the pages ready to print. Check the connection and try again." (`prospects/text.js:201`; its bar already has Retry, `prospects/ProspectPanel.jsx:628`) and "Couldn't load the signature. Check the connection and try again." (`prospects/text.js:230`, a note under Show signature at `prospects/ProspectPanel.jsx:449`, with no Retry of its own). Both end "Check the connection, then retry."; Show signature can still be pressed after a failure (`prospects/ProspectPanel.jsx:441–447`), so your mockup shows whether it is the signature's Retry or the line gets its own.
- **Check (preview mode):** `failNextFormsSave()` and `failNextCalendarSave()` fail the next function call, not a table read (opening a form and the Calendar's month read tables), so add a failed-read helper in your own fake-data files (registered in `src/lib/mockClient.js`: list it), or a check case. With it armed: open a form, + Add prospect, and the Calendar: each says "… Check the connection, then retry." with Retry, and Retry reads again. In a child's profile window (`failNextFormsSave()` fails the next Prospects read too): arm it and press Print; arm it again and press Show signature: both lines end "Check the connection, then retry." with Retry.

### R2-09 (the full stop) — One-sentence toasts drop their full stop · Low · decided 2026-11-04 (v1.051)

- **What's wrong:** these toasts are one sentence and end with a full stop, where Testing's, Camps' and Black Belt's one-sentence toasts have none:
  - Prospects (`prospects/text.js`): "Note saved." (`:315`, shown at `Prospects.jsx:348`); "[name] checked in." and "[name] didn't show — call back tomorrow." (`:316–317`, `Prospects.jsx:358`); "Free class booked for [name]." (`:318`, `:393`); "[name]'s free class was cancelled." (`:319`, `:403`); "[name] moved to [stage]." (`:118`, `:484, 511`); "[name] was deleted." (`:320`, `:528`).
  - Forms (`forms/text.js`): "Copied as "…" (a Draft)." (`:51`, `Forms.jsx:182`); "… is closed — the link now says so." and "… is taking sign-ups again." (`:52–53`, `Forms.jsx:208` and `forms/Builder.jsx:409`); "… was deleted." (`:57`, `Forms.jsx:223`); "… is published — families see the new version." (`:104`, `Builder.jsx:384`); "Booking settings saved — they are live now." (`:192`, `Builder.jsx:356`).
  - Calendar: "[name] checked in." (`calendar/text.js:104`, `Calendar.jsx:583`).
- **Rule:** v1.051 (5) (Jeffrey, 2026-11-04: "Yes approved go ahead"): a one-sentence toast has no full stop at the end ("Ava Reed restored"); a two-sentence toast keeps them; Prospects, Forms, Finance and Calendar change, and so does Staff accounts' "Password reset for [name]." (Dashboard core), the one other one-sentence toast with a full stop (R2-09).
- **Change:** drop the closing full stop from each of those words. A dash doesn't make two sentences, so "… is closed — the link now says so" loses it too. Build it with your R2-09 item: Prospects' and Forms' toasts drop their ✓ at the same time. Not on this list: "Couldn't undo — the form has changed since." (`forms/text.js:142`, a toast at `Builder.jsx:273`) is a refused Undo shown as a toast, from your "(now)" 5–7, which pass 2 checks.
- **Check (preview mode):** save a note on a prospect: "Note saved"; Duplicate a form: "Copied as "Copy of …" (a Draft)"; in the Calendar's day panel, check in a child booked today: "[name] checked in". None ends with a full stop.

### R2-07 (the words after an Undo) — Reopening a form says so · Low · decided 2026-11-04 (v1.051)

- **What's wrong:** the Undo of Close form opens the form again but says only "Undone": in the Forms list (`Forms.jsx:201`, inside `toggleClosed`) and in the builder (`forms/Builder.jsx:410`, `setAccepting`'s Undo). Your other Undos say "Undone", as v1.051 asks.
- **Rule:** v1.051 (1) (Jeffrey, 2026-11-04: "Yes approved go ahead"): after an Undo the toast says "Undone" everywhere; when the Undo reopens something people depend on, it adds one short sentence: Finance "Undone. The day is open again.", Star "Undone. Registration is open again."; the same rule covers every Undo that opens registration, sign-up or a form again, in the same pattern: Forms "Undone. The form is open again." (R2-07's open part).
- **Change:** when the Undo opened the form again, show "Undone. The form is open again." (`forms/text.js`, next to `UNDONE`, `:55`). An Undo that closes it stays "Undone".
- **Check (preview mode):** Forms → ⋯ Close form → Undo → "Undone. The form is open again."; in the builder, turn off "Accepting sign-ups (Live)" → Undo → the same; ⋯ Open form → Undo → "Undone".

---

## Waits on Jeffrey (don't build yet)

Nothing now. Jeffrey answered every pass 1 question on 2026-11-04 (v1.035–v1.051); each answer is a Fix now or Smaller item in this file.

---

## Smaller (fix while you're in the file)

- **Done in your "(now)" point 1 — check only:** a Draft form's staff Fill in grays in the unavailable look and stays focusable (`aria-disabled`, `FormsList.jsx:29–44`; v0.628, on main since c5e38f8).
- Stale header comment: `forms/FillInDialog.jsx:3` still says "Back / Next, then Submit" (v0.622 made it Continue / Send). Low.
- Fill in's and the family page's Send stay blue while they say "Sending…" (`FillInDialog.jsx:131`, `FormsApp.jsx:383`; `forms-public.css:119–122` sets only `cursor: progress`). Fill in's Send may gray by itself after Dashboard core's R1-08 (if it grays every `aria-disabled` `.btn` in `shared.css`): check after it. The family page loads only `forms-public.css`, so its Send is yours either way. A form dialog's Save grays (detail 8). Low.
- The W / S school letters (`.cchip-letters`) are 11 px, under §7's 12 px minimum (`calendar.css:233–239`; their weight 600 goes to 500 with R4-06). Low.
- Prospects' own note guard says "Unsaved note. Save it or cancel first." (`prospects/text.js:132`); the shared guard says "Unsaved changes. Save or cancel first.". Settle it with N15's guard work. Low.
- Prospects' follow-up date and booking a free class have no Undo: flagged in your status (`STATUS-DesignReview.md:12`, "flag only"), not decided. Ask Jeffrey. Low.
- **Forms builder "Delete field" is decided** (v0.630, on main): nothing to do here.
- Forms ⋯ "Duplicate" uses `ti-copy` (`Forms.jsx:264`), which the §2.4 map gives to "Copy to clipboard". It was in v0.621's approved menu, so it's a gap in the map, not a build error: ask Jeffrey for a map row. Low.
- **Done in your N3 work (b6a90a7) — check only:** Forms ⋯ and its confirm box say "Delete form" (`forms/text.js:47`, used at `Forms.jsx:272, 375`; N3, v0.633 (1)).
- Forms' staff empty line "No forms yet." has no "An admin adds them." (`forms/text.js:36`): drift from v0.53 (§8 Empty states). Low.
- Fill in's phone Sent page stacks "Fill in another" and "Close" full width with no gap (`FillInDialog.jsx:73–80`), so two 36 px targets touch; Black Belt's stacked phone buttons keep 8 px between them (`blackBelt.css:1354–1358`). Pass 1b, Low.
- Edit statuses on a phone wraps "No-/show" and "Not / interested" inside the name column. Pass 1b, Low.
- **R5-01 is done on main** (v0.631, 8f47f9c): Prospects' Clear search ✕ is the shared `IconButton` in both search boxes (28 px, the "Clear search" tooltip, 44 px on touch). Nothing to do here.
- **R4-02 is decided** (2026-11-04, v1.049 (a)): an open Fill in or "+ Add prospect" keeps what was typed when Hide private details is turned on from another browser tab. Your "Left as is" (`STATUS-DesignReview.md:10`) is now Jeffrey's rule, recorded as a known gap in v0.249's "every screen". Nothing to build.
- **S-10 is decided** (2026-11-04, v1.048 (20)): when you next work on one of these screens, its browser dropdown becomes the shared Select (v1.100): Edit statuses (`prospects/StatusesDialog.jsx:157`), the field editor (`forms/FieldEditor.jsx:136, 155`), Calendar's event and event-type boxes (`calendar/EventDialog.jsx:168`, `calendar/EventTypesDialog.jsx:172`) and the Schedule (`schedule/ScheduleSchool.jsx:529`, `schedule/SlotDialog.jsx:291`). `forms/FormFields.jsx:134` also draws the family page's Dropdown field, which doesn't load the shared styles: ask before switching that one. No sweep, so nothing to build until then.

---

## Done when

- Every Fix now item is built, reviewed and approved by Jeffrey in the preview: a design reviewer at the four sizes for visual changes, a code reviewer, and a security reviewer for anything touching the database or privacy.
- These pass: `npm run build:preview-mode`, then `npm run build`; `node src/lib/prospects/checks.mjs`, `node src/lib/forms/checks.mjs`, `node src/lib/calendar/checks.mjs`, `node src/lib/schedule/checks.mjs`, `node src/screens/prospects/progress.checks.mjs`; `node src/forms/checks.mjs` after `npm run build`; `node --test functions/tests/`.
- Jeffrey's decisions are rows from your block.
- The status file is current, the work is committed on your branch, and every shared file you touched is listed. **No push.**
- The report is sent to the Main session.
