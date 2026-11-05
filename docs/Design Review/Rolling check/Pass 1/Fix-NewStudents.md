# New students — fixes from the design review's rolling check (pass 1)

**Paste into:** the new students session.

This file reaches your worktree when `design-review` is merged into main; until then the Design Review session sends its text by message.

**Starter to paste:**

> `git merge main` first. Then read and do `docs/Design Review/Rolling check/Pass 1/Fix-NewStudents.md`: the fixes the design review's rolling check found in your merged work. Plan first. Mockups first for anything that changes how a screen looks. Nothing is built before I OK it.

---

## The brief

The design review's rolling check (phase 1d) looks at each section's design-review work after it merges: against the rulebook, the approved mockups, and the other sections that do the same job. Pass 1 covered `main` up to 5f1db41 (2026-11-03), in preview mode at the four sizes. Four reviewers looked (R1 money · R2 changes, mistakes and safety nets · R3 lists, menus and pickers · R4 item-by-item conformance and privacy). Two separate checkers then verified every finding. This file is what they confirmed in your merged work (N1, N2, N4, N5, N6, N8, N9, N12, N17). Your N10, N13 and N14 merged after the cut (f8873e7); pass 2 checks them.

- **Fix now:** straight fixes. Plan them, show Jeffrey, then build. An item marked "after [owner]'s [id]" waits until that fix is on main: plan it now, build it after.
- **Waits on Jeffrey:** a rule must be picked first. Don't build these yet.
- **Smaller:** fix them while you're in the file. A few are questions your prompt already told you to ask Jeffrey.
- Each item keeps its finding id (R2-01, R2-06 …) so Jeffrey can trace it. Use the id in your plan, status file and commits.
- **Line numbers** are main 5f1db41's; they may have moved. N10, N13 and N14 changed `Calendar.jsx`, `Prospects.jsx`, `forms/Builder.jsx`, `forms/FillInDialog.jsx`, `calendar.css`, `forms-public.css` and `forms.css`, among others, after the cut.
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
  - **Prospects.** A failure shows "It wasn't saved. Check the connection and try again." with no Retry. After a failed Undo the toast is gone too, so nothing can be retried (the status stayed Contacted). Every Prospects save failure takes this path (status, Board drop, check-in, booking).
  - Calendar, Schedule, Camps, Star and Black Belt all give Retry.
- **Rule:** v1.004 / §3.5 and §8 Error banners: a connection failure always has Retry in the same bar.
- **Change in Forms:**
  - In `Forms.jsx:184, 206, 213` (and the New form dialog's note at `:162`) and `forms/Builder.jsx:376` (and its Undo path at :369), set the banner with `retry` that runs the same call. Words: "Undo didn't save. Check the connection, then retry." for an Undo, the section's "Couldn't save…" otherwise.
  - Pass `onRetry` to the bars at `Forms.jsx:410` and `Builder.jsx:613`.
  - Keep `SAVE_FAILED_BAR` only for the builder's draft autosave.
- **Change in Prospects:** give `afterWrite`'s 'error' branch (`Prospects.jsx:239`) a retry. `afterUndo` passes the same Undo, so a failed Undo can be retried. Pass `onRetry` at :779.
- **Check (preview mode):** Close a form → `__tkdPreview.failNextFormsSave()` → Undo within 5 s; then change a prospect's status → `__tkdPreview.failNextFormsSave()` → Undo. (The helper fails the very next Forms or Prospects call, read or write, so arm it after the change and before the Undo.) Each time: a bar with Retry → Retry → "Undone", and the form is Live again or the status is back.

### R2-06 — Prospects' dates are cut from a UTC time, so an evening change shows tomorrow · Medium

- **What's wrong:** at 11:11 PM on Nov 3 the history said "Status: New → Contacted · Nov 4", "Signed up online · Nov 4" and "waiver signed Nov 4", while the same panel said "· Nov 3" and "Signed up Nov 3". Prospects' history, the waiver's "signed" date and the builder's "last published" cut the date out of a UTC timestamp (`prospects/text.js:170, 207`, `forms/text.js:89`). (*UTC* is world time; Massachusetts is 5 hours behind it in winter, so after 7 PM the UTC date is already tomorrow.) This is your prompt's "(now)" point "Dates taken in UTC" (`STATUS-DesignReview.md:29`), not built yet; R4 saw the waiver line the same way.
- **Rule:** v1.108 (history dates in Massachusetts time).
- **Change:** show all three through `historyDate` from `src/lib/historyDates.js`, or `localDay` from `prospects/progress.js:18`.
- **Check (preview mode):** after 7 PM Eastern, change a prospect's status: the History, the waiver line and the panel's "Signed up" all show today's date. (Prospects uses the real date, not `setToday`.) Any time of day: add a `checks.mjs` case with an evening time (e.g. `2026-11-04T00:30:00Z` must read Nov 3).

### R2-05 (your part) — An Undo pressed during another save is dropped without a word · Medium · after Dashboard core's R2-05

- **What's wrong:** the shared Toast removes itself before it runs Undo (`components/Toast.jsx:73–77`), and your Undos return early while another save runs (`Calendar.jsx:594`, `Prospects.jsx:250` and the Board drop's `:429`, `Forms.jsx:194`). So the toast vanishes, nothing happens and nothing is said. Staff believe it was undone.
- **Rule:** rule 1.4 / v1.006; §3.5 (never silent).
- **Change:** after Dashboard core's R2-05 (an Undo pressed while a save runs is *queued*: it waits its turn and runs as soon as that save ends, and its toast stays as "Undoing…"), each of these Undos (Calendar's `runUndo`, Prospects' status and Board-drop Undos, Forms' `undo` in `toggleClosed`) uses Dashboard core's helper. The builder's switch Undo already waits its turn (`enqueue`, `Builder.jsx:361`).
- **Check (preview mode):** `__tkdPreview.setTestingDelay(2500)` (it slows Calendar and Forms too); make two changes, press the first one's Undo during the second save → it runs after it, with "Undone".

### R2-08 (Forms' part) — Duplicate has no 5-second Undo · Low

- **What's wrong:** Forms' "Duplicate" makes a new Draft with no Undo (`Forms.jsx:182`), while Camps' Save as template (a new template) has one (v0.726). In one place a slip can be undone, in the next it can't.
- **Rule:** v1.006 / rule 1.4: every change that can be reversed gets Undo for 5 seconds.
- **Change:** Duplicate's toast gets Undo, which deletes the new Draft, as Camps' Save as template does. (Star's part of R2-08 is in Star's file.)
- **Check (preview mode):** Duplicate a form → toast with Undo → Undo → "Undone", and the copy is gone.

### R5-01 — Prospects' "Clear search" ✕ is 18 px with no tooltip · Medium (pass 1b)

- **What's wrong:** on the PC, Prospects' Clear search ✕ (List, Board and Both) is 18 × 18 px with a 14 px icon and no tooltip. It is the one icon-only button N13 left behind: every other one in Calendar, Schedule, Prospects and Forms is now the shared 28 px icon button.
- **Rule:** §4 check 1 (v1.033): anything you tap or click is at least 24 × 24 px. §1.4: every icon has a tooltip on hover and keyboard focus. §2.2: 16 px icons in buttons. v0.626: icon-only buttons in Prospects use the shared icon button.
- **Change:** `Prospects.jsx:786–788` and `prospects/PipelineBar.jsx:53–55` → the shared `IconButton` (label "Clear search", `IconX`), kept inside the right end of the box. `prospects.css:189–197` keeps only the position; the touch `::after` at `:1402–1410` goes, because IconButton already gives 44 px on touch.
- **Check (preview mode):** Prospects at 1280, type "Ru": the ✕ is 28 × 28 with a 16 px icon and shows "Clear search" on hover and on Tab. At 820 / 390 / 320 touch it has a 44 px tap area and the box doesn't grow. Board view and Both the same. Clicking it empties the box and brings back the "Follow up today" chip.

### R5-02 — The family page's Remove child icon is near-black, not the approved gray · Low (pass 1b)

- **What's wrong:** on the public family page (`/f/free-class-instagram` → Add another child) the trash icons are #1F1F1F; in Fill in and the kiosk they are the approved gray #6B6B6B. The page's own reset `button { color: inherit }` (`forms-public.css:49–55`) beats the zero-weight `:where(.tib)` copy (`:130–143`).
- **Rule:** v0.626 (2): the family page draws Remove child the same way; `docs/Prospects/DesignReview-N13-question2.png`, option A.
- **Change:** in `forms-public.css`, after `:where(.tib)` (`:130–143`), add `button:where(.tib) { color: var(--color-text-secondary); }`. It wins on the family page; inside the kiosk the dashboard's own `.tib` still wins, with the same color.
- **Check (preview mode):** `/f/free-class-instagram` → Add another child: both trash icons compute rgb(107, 107, 107) at 1280 / 820 / 390 / 320 and darken on hover (PC). Kiosk and Fill in unchanged.

---

## Waits on Jeffrey (don't build yet)

- **R3-03** (Low, plausible) — when Prospects' list is filtered (it opens on Follow up today, your v0.236 bar), should the shared gray "Showing … only · Show all" line say so? This also settles whether the stage counts take the shared count-card look (R3's note S-12). The design review asks Jeffrey; the answer reaches you through the Main session.
- **R3-11** (Low) — should a page's ⋯ always come last, right of the blue button (Prospects, `Prospects.jsx:756–769`, and Calendar, `Calendar.jsx:628–645`, would move theirs)? The design review asks Jeffrey; the answer reaches you through the Main session. Pass 1b found the same in the Schedule's phone headers (`Schedule.jsx:106`, `ScheduleSchool.jsx:503`).
- **R2-07** (Low) — one set of words for "someone else changed it" and "Undo failed" (Prospects, Forms and Calendar change under either option: `prospects/text.js:217`, `forms/text.js:55, 100`, `calendar/text.js:249–251`). The design review asks Jeffrey; the answer reaches you through the Main session.
- **R2-09** (Low) — the ✓ and the full stop only on the account toasts (recommended: Prospects' and Forms' toasts lose theirs, `Prospects.jsx:226, 472`, `Forms.jsx:182, 223`, `Builder.jsx:316, 344`), or on every success toast. The design review asks Jeffrey; the answer reaches you through the Main session.
- **R3-06** (Low) — one shared back link made by Dashboard core (Forms' `.fb-back` would switch to it). The design review asks Jeffrey; the answer reaches you through the Main session.
- **R3-09** (Low) — in-list search: one wording and place for every box ("Search name or phone", `prospects/text.js:28`, and its no-match line, `:45`, may change). The design review asks Jeffrey; the answer reaches you through the Main session.
- **R4-02** (Low) — what an open Fill in or "+ Add prospect" does when Hide private details turns on in another tab (your status records "Left as is" as your own call, `STATUS-DesignReview.md:10`; recommended: leave it and record it in a row). The design review asks Jeffrey; the answer reaches you through the Main session.
- **R4-06** (Low) — should your weight-600 text go to 500 (`calendar.css:227, 948, 1062`, `forms-public.css:396`)? Don't change weights unless Jeffrey decides. The design review asks Jeffrey; the answer reaches you through the Main session.
- **R5-03** (Low, pass 1b) — one way to remove a child on every family page: the trash icon button (Forms' family page since v0.626; recommended, so Camps' family page changes) or the word "Remove" (Camps' link, never in a mockup). If it's the icon, the public icon-button look moves out of `forms-public.css` into one small public stylesheet that both family pages load; that part may land with you. The design review asks Jeffrey; the answer reaches you through the Main session.

---

## Smaller (fix while you're in the file)

- A Draft form's staff Fill in is natively `disabled`, so it can't be focused (`FormsList.jsx:34`). It's already your open question in `STATUS-DesignReview.md:29`, still unanswered: ask Jeffrey (one question, with a picture). Low.
- Stale header comment: `forms/FillInDialog.jsx:3` still says "Back / Next, then Submit" (v0.622 made it Continue / Send). Low.
- Fill in's and the family page's Send stay blue while they say "Sending…" (`FillInDialog.jsx:139`, `FormsApp.jsx:354`; `forms-public.css:119–122` sets only `cursor: progress`). Fill in's Send may gray by itself after Dashboard core's R1-08 (if it grays every `aria-disabled` `.btn` in `shared.css`): check after it. The family page loads only `forms-public.css`, so its Send is yours either way. A form dialog's Save grays (detail 8). Low.
- The W / S school letters (`.cchip-letters`) are 11 px, under §7's 12 px minimum (`calendar.css:222–228`; their weight 600 waits for R4-06). Low.
- Prospects' own note guard says "Unsaved note. Save it or cancel first." (`prospects/text.js:126`); the shared guard says "Unsaved changes. Save or cancel first.". Settle it with N15's guard work. Low.
- Prospects' follow-up date and booking a free class have no Undo: flagged in your status (`STATUS-DesignReview.md:12`, "flag only"), not decided. Ask Jeffrey. Low.
- Forms builder "Delete field" is red, acts at once and has no Undo: your prompt's "(now)" point says ask Jeffrey, and don't fix it on your own. Low.
- Forms ⋯ "Duplicate" uses `ti-copy` (`Forms.jsx:264`), which the §2.4 map gives to "Copy to clipboard". It was in v0.621's approved menu, so it's a gap in the map, not a build error: ask Jeffrey for a map row. Low.
- Forms ⋯ says just "Delete" (`forms/text.js:46`); the other list menus say "Delete event / camp / cycle / template". Your N3 box 35 already plans "Delete form" in the menu and the box. Low.
- Forms' staff empty line "No forms yet." has no "An admin adds them." (`forms/text.js:36`): drift from v0.53 (§8 Empty states). Low.
- Fill in's phone Sent page stacks "Fill in another" and "Close" full width with no gap (`FillInDialog.jsx:72–79`), so two 36 px targets touch; Black Belt's stacked phone buttons keep 8 px between them (`blackBelt.css:1354–1358`). Pass 1b, Low.
- Edit statuses on a phone wraps "No-/show" and "Not / interested" inside the name column. Pass 1b, Low.

---

## Done when

- Every Fix now item is built, reviewed and approved by Jeffrey in the preview: a design reviewer at the four sizes for visual changes, a code reviewer, and a security reviewer for anything touching the database or privacy.
- These pass: `npm run build:preview-mode`, then `npm run build`; `node src/lib/prospects/checks.mjs`, `node src/lib/forms/checks.mjs`, `node src/lib/calendar/checks.mjs`, `node src/lib/schedule/checks.mjs`, `node src/screens/prospects/progress.checks.mjs`; `node src/forms/checks.mjs` after `npm run build`; `node --test functions/tests/`.
- Jeffrey's decisions are rows from your block.
- The status file is current, the work is committed on your branch, and every shared file you touched is listed. **No push.**
- The report is sent to the Main session.
