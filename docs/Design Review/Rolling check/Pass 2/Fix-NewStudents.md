# New students — fixes from the design review's rolling check (pass 2)

**Paste into:** the new students session.

This file reaches your worktree when `design-review` is merged into main; until then the Design Review session sends its text by message.

**Starter to paste:**

> `git merge main` first. Then read and do `docs/Design Review/Rolling check/Pass 2/Fix-NewStudents.md`: the fixes the design review's rolling check (pass 2) found in your merged work, and two corrections to your pass 1 file. Plan first. Mockups first for anything that changes how a screen looks. Nothing is built before I OK it.

---

## The brief

The design review's rolling check (phase 1d) looks at each section's design-review work after it merges: against the rulebook, the approved mockups, and the other sections that do the same job. Pass 2 covered what merged into `main` after pass 1's cut (e7fd75b), up to 6b27cdd (2026-11-05), in preview mode at the four sizes. Five reviewers looked (M money, records and privacy · U undo, safety nets, confirms and dialogs · L lists, pickers, forms and layout · P your visitor profile and printed sheet, item by item · C Color Belt). Two separate checkers then verified every finding. This file is what they confirmed in your merged work after the cut: N15 and the Calendar Event types fix (e640af5), "(now)" 1–7 and your Part 2 start (c5e38f8, 7456636, 9b562b3, 2881413), your N3 confirm boxes (v0.633) and the visitor profile (migration 0036, v0.634–v0.641; a5d0e1d, d7b5ebf).

The reviewers found the profile, the printed sheet, the new form fields and the N3 boxes built as their mockups say, and Hide private details holds on all of them. The problems below are three Mediums (a box that closes too soon, a sheet that misses a cancelled class, a window stuck on "Loading…") and smaller things.

- **Fix now:** straight fixes. Plan them, show Jeffrey, then build. An item marked "after [owner]'s [id]" waits until that fix is on main: plan it now, build it after.
- **Waits on Jeffrey:** nothing now. Jeffrey approved question 3 of the pass 2 report (`docs/Design Review/Rolling check/Pass 2/Pass 2 report.md`; v1.055), so its two items for you, M-05 and P-05, are under Fix now.
- **Smaller:** fix them while you're in the file, or check them.
- Each item keeps its finding id (U-01, P-02 …) so Jeffrey can trace it. Use the id in your plan, status file and commits.
- **Line numbers** are main 6b27cdd's (checked 2026-11-05); they may move.
- **Paths:** `Forms.jsx`, `Prospects.jsx` and `Calendar.jsx` are in `src/screens/`; `forms/…`, `prospects/…`, `calendar/…` and `schedule/…` are under `src/screens/`; `components/…` is `src/components/…`; `prospects.css`, `schedule.css`, `calendar.css` and `forms-public.css` are in `src/styles/`. Other sections' files are written in full.

### Rules

- Follow CLAUDE.md.
- **Plan first:** a short plan (each item, its files, its mockup, any migration) in your docs folder; show it to Jeffrey.
- **Preview mode for building and trying changes:** `npm run dev:preview-mode`. `npm run dev`, `npm run preview` and `Start dashboard.bat` use the live database (`.worktreeinclude` copies `.env.local` into every worktree): run them only for a check Jeffrey OKs, never to try a change. `npm run build` is fine: it only builds.
- **Mockups before code** for every visual change, at PC 1280×800, tablet 820×1180 touch, phone 390×844 touch and 320 wide: a self-contained HTML file plus one PNG per screen with what changes outlined in amber (Jeffrey reviews the PNGs). He OKs them one screen at a time, before any code.
- **One decision at a time,** with pictures: each option drawn, its pros and cons, a recommendation.
- **Reviews:** a separate design reviewer (the rulebook, the approved mockups, screenshots at the four sizes, and §4's six WCAG 2.2 checks, v1.033); a separate code reviewer; a separate security reviewer for anything touching the database (handoff §6).
- **Don't change a shared part on your own** (`src/components/…`, the shared helpers in `src/lib/`, `src/styles/shared.css`): every section uses them. If you need something a part can't do, or new shared words in `src/components/text.js`, ask Jeffrey first. He decides whether you change it in your branch (then list it as a shared file) or the Dashboard core session does.
- List every CLAUDE.md shared file you touch (`src/styles/shared.css` and `src/components/text.js` are on that list; so is `src/lib/mockClient.js`: a new preview helper goes in your own fake-data file, e.g. `src/lib/mockProspects.js`, and mockClient.js only registers it).
- **Database:** none expected; every item is screen-only. If one turns up: ask the Main session for a migration number, follow handoff §6, and get a separate security review.
- **Order (a push to main deploys):** the migration is live before the push that brings the app that uses it. Screen-only steps can go first.
- **CSS order:** in the real build `forms.css` loads before `app.css` and `shared.css`, so check any `forms.css` or `forms-public.css` change in a preview-mode build served as plain files (`npm run build:preview-mode -- --outDir dist-preview`, served with `node "docs/Dashboard Core/tools/serve-static.mjs"`; never `npm run preview`).
- **Status:** keep `docs/Prospects/STATUS-DesignReview.md` current, with a short "Rolling check, pass 2" part. Update it in the same turn a step finishes or a decision is made.
- **Commit** on your branch (`claude/prospect-form-system-cd893d`) after each reviewed step, and explain the commands. **Never push.**
- When a step is done, send the Main session a short report: Done (with the commit) · Needs Jeffrey (one question, options, your recommendation) · Next.

### Rulebook

- New rows only for what Jeffrey decides in your mockups and questions, from your block **0.600–0.699**: the next unused number (check the rulebook first).
- `git merge main` first; re-read the rulebook right before editing (other sessions edit it); keep its CRLF line endings.
- The 10b row goes just above `| Approved 2026-10-16 (v0.26) |`, the changelog line at the end of §11. Bump the header's **Version** and **Last updated**. A row you change gets a "(See v0.6xx …)" note at its start, not a rewrite.

---

## Fix now

Most severe first.

### U-01 — Delete prospect, Came, Joined and Book a free class close before the save answers · Medium

- **What's wrong** (drift):
  - Prospects closes the box or dialog before it looks at the answer. So a dropped connection loses the box (and the picked date or time) and shows the amber bar instead, with no Retry:
    - Delete prospect: `confirmDelete`, `Prospects.jsx:516–530`, closes at `:522`.
    - Came: `saveCame`, `:492–512`, closes at `:509` on the status path, and at `:499` on the check-in path, before anything is saved, so "Saving…" never shows there.
    - Joined: `saveJoined`, `:325–336`, closes at `:331`.
    - Book a free class: `saveBook`, `:374–397`, closes at `:388` / `:392`.
  - The boxes promise the note: "a problem shows as the amber note under the buttons" (`prospects/Dialogs.jsx:223–225`), and they pass `failed={state.note …}` (`:170`, `:236`). But nothing sets `note`, except Book's "time taken" case (`Prospects.jsx:381–384`).
  - Checker 2 reproduced it at 1280: Delete prospect showed "Keep prospect · Deleting…" (right), then no box, and the window's bar said "It wasn't saved. Check the connection and try again." with no Retry. Came on the Board and Joined did the same.
  - Every other box stays open on a connection failure: `Forms.jsx:232`, `schedule/ScheduleSchool.jsx:430–432`, Calendar's Delete type (`Calendar.jsx:555–556`), Camps (`src/screens/camps/CampPage.jsx:519–524`) and Black Belt (`src/blackBelt/staff/cycles/CyclesTab.jsx:285–288`).
- **Rule:** v1.103 ("If it fails, the box stays open with the section's amber note under the buttons (v0.81) until it closes (v1.004); pressing the action again tries again"); v0.81; your approved N3 picture `docs/Prospects/DesignReview-N3-1-prospects.png` (a failure note sits under the buttons).
- **Change:**
  - Keep the box or dialog open until the answer comes back.
  - On `'error'`, set its `note`, so the amber note shows under the buttons (U-08's words), and pressing the action again tries again. Joined and Book a free class keep the picked date or time.
  - Close it only on `'ok'`, on `'no_access'`, or on a refusal that goes to the page's bar (someone else changed it, or it's gone: U-03's pattern).
  - For Came's check-in path, run the check-in inside the box like the status path, so "Saving…" shows.
  - These four keep their failure inside the box, not in R2-01's bar: see "Corrections to pass 1".
- **Check (preview mode):** `__tkdPreview.setTestingDelay(2500)`. Then, each time arming `__tkdPreview.failNextFormsSave()` just before the action:
  - Prospects → List → open a child → Delete prospect → Delete prospect: "Deleting…", then the box stays with the amber note under its buttons; press Delete prospect again → it is deleted.
  - Board → drag Ruby M. (Contacted, no class) onto Came → Came: "Saving…", then the note in the box; Came again → saved.
  - Ruby's profile → status tag → Joined → pick a date → Save: the dialog stays, with the date and the note.
  - Book a free class the same way: the picked time stays.
  - Afterwards `__tkdPreview.setTestingDelay(200)`.

### P-01 — The printed sheet shows a cancelled free class as if it will still happen · Medium

- **What's wrong** (missing — not planned: rev 3's printout, the build plan and `STATUS-ProspectProfile.md` never draw a cancelled class on paper):
  - The sheet checks only the booking's status (`prospects/PrintSheet.jsx:172`: `b.status === 'booked' ? T.classLineYear(b) : …`).
  - So when the class itself is cancelled (for example by a closure), the sheet still prints "Free class: Mon, Nov 9, 2026 · 5:00 pm · Group A", with no word about the cancellation.
  - The screens tell the two apart: the profile (`prospects/ProspectPanel.jsx:148`, `classGone = booked && !b.classRunning`; the amber box at `:662–669`, "Class cancelled — call the family") and the List ("class cancelled", `prospects/text.js:54`).
  - Checker 2 reproduced it with the sample data's Leo N. (the storm closure). The screens still prompt the call, so the harm is a wrong line on paper: the sheet and the screen disagree on a fact.
- **Rule:** v0.636 (the sheet's Student part carries the free class); consistency with your own profile and List.
- **Change:** the sheet uses the same state as the profile and the List (for example one small helper in `src/lib/prospects/child.js` that all three use: booked, class cancelled, booking cancelled, none). On paper a cancelled class reads, for example, "Class cancelled — call the family (Mon, Nov 9, 2026 · 5:00 pm · Group A)", the profile's own words. Show Jeffrey the sheet's words in one line with your plan.
- **Check (preview mode):** `__tkdPreview.resetForms()`, reload. Prospects (Worcester) → Leo N. (the sample closure cancels his class) → in the console `window.print = () => {}` → Print → "Leo only": the sheet's Student part reads the cancelled-class line. A child whose class runs still prints "Free class: …" as today.

### P-02 — The profile window stays on "Loading…" for good when its read fails · Medium

- **What's wrong** (drift; older code, carried into the v0.639 window):
  - `loadDetail` (`Prospects.jsx:189–199`) handles only `'ok'`, `'no_access'` and `'not_found'`. On a connection failure the profile stays empty, and the window shows "Loading…" with `aria-busy` for good (`prospects/ProspectPanel.jsx:770–776`): no message and no Retry.
  - The same happens when a brother or sister is opened inside the window.
  - Checker 2: after 12 seconds the window still read "Liam Park / Loading…". × and Esc still close it, and opening the child again reads again, so it isn't High.
  - This is also the Design Review status file's "Noted for pass 2" line, and reviewer U's.
- **Rule:** v1.004 / §8 (a connection failure always has Retry in the same bar); v1.051 (2) ("Couldn't load. Check the connection, then retry." with Retry; a read that fails inside a dialog is a connection failure too). The other detail dialogs give the reason and Retry: Black Belt with the shared amber bar (`src/blackBelt/staff/candidates/CandidateDialog.jsx:535–541`), Camps (`src/screens/camps/CamperDialog.jsx:189–202`), Star (`src/screens/testing/star/candidates/CandidateDialog.jsx:301–306`).
- **Change:** as Black Belt does. `loadDetail` returns the failure, and the window shows the shared amber bar (`ErrorBanner`) with Retry in place of "Loading…": "Couldn't load [name]'s details. Check the connection, then retry." Retry reads again. Show the line in your mockup (it joins your S-2 lines).
- **Check (preview mode):** Prospects → `__tkdPreview.failNextFormsSave()` (it fails the next Forms or Prospects call, read or write) → click Liam P.: the window shows the bar with Retry, not "Loading…"; Retry opens his profile. The same for a brother or sister opened inside the window.

### U-02 — The builder's refused Undo of Delete field is a 5-second toast · Low

- **What's wrong** (drift; pass 1 left exactly this line for pass 2: `docs/Design Review/Rolling check/Pass 1/Fix-NewStudents.md:186`):
  - `undoDelete` (`forms/Builder.jsx:267–275`) refuses with a toast at `:273`: "Couldn't undo — the form has changed since." (`forms/text.js:142`). It is gone after 5 seconds.
  - In the stale case the field may already be back on screen (the reload brought the other admin's copy) while the toast says it couldn't undo.
- **Rule:** v1.004 / §3.5, §8 (problems never go in a toast; refusals use the amber bar); v1.045 (4) ("Couldn't undo: [reason].").
- **Change:** use the builder's own amber bar (`setBanner({ kind: 'stale', … })`, as `Builder.jsx:175` does), with v1.045 (4)'s pattern, e.g. "Couldn't undo: the form has changed since." After Dashboard core's R2-07 the sentence comes from `src/components/text.js`. Add `forms/text.js:142` to your R2-07 point.
- **Check (preview mode):** Forms → ⋯ for "Summer camp sign-up" → Edit → click "Anything we should know?" → `__tkdPreview.simulateOtherAdminEditForms()` → Delete this field → press Undo within about 2 s: the amber bar shows the refusal and stays until ×. No toast.

### U-03 — Two confirm boxes handle "someone else changed it" their own way · Low

- **What's wrong** (drift; checker 2 narrowed it to two boxes):
  - **Delete form**, on `'stale'` or `'not_found'`, stays open with Delete form grayed (`Forms.jsx:229–231` → `actionUnavailable`, `:380`), and asks him to "redo your last change" (`forms/text.js:108`). Pressing again can't work, because the box keeps the old version. v0.633 (3) approved a grayed action only for its two refusals: a form with sign-ups, and the only event type in use.
  - **Delete status**, on `'stale'`, stays open with "Someone else changed this prospect …" (`prospects/StatusesDialog.jsx:34`, `prospects/text.js:321`). That names the wrong thing. (Pressing again does work there: `confirmDeleteStatus`, `Prospects.jsx:609–618`, reads the reloaded version.)
  - Delete type goes back to its list with its own note (`Calendar.jsx:552–554`), and Delete planned schedule (`schedule/ScheduleSchool.jsx:426–429`) and Delete prospect close and use the page's bar. Those are fine, as Color Belt, Camps (`src/screens/camps/CampPage.jsx:526–534`) and Black Belt (`src/blackBelt/staff/cycles/CyclesTab.jsx:289–299`) do.
- **Rule:** consistency; v0.633 (3) (only its two refusals gray the action); v1.045 (4) (the sentence names the thing).
- **Change:**
  - Delete form closes on `'stale'` / `'not_found'` and shows the sentence in the page's bar.
  - Delete status names the status, or steps back to the list with its note, as Delete type does.
  - The sentence is R2-07's ("Someone else changed [Name] just now, so nothing was done. Their change is shown."), from `src/components/text.js` after Dashboard core's R2-07. The way the boxes behave can change now.
- **Check (preview mode):**
  - Forms → ⋯ for "Summer camp sign-up" → Delete form → `__tkdPreview.simulateOtherAdminEditForms()` → Delete form: the box closes, and the page's bar says the form changed.
  - Prospects → ⋯ → Edit statuses → ⋯ for Contacted → Delete status → pick a "Move them to" → in the console `(()=>{const d=JSON.parse(localStorage['tkd.preview.forms']);d.statuses.find(s=>s.name==='Contacted'&&s.location_code==='worcester').version++;localStorage['tkd.preview.forms']=JSON.stringify(d)})()` → Delete status: the note names the status (or the list shows it).

### U-04 — Print on a child deleted elsewhere offers a Retry that can never work · Low

- **What's wrong** (drift):
  - Print (`prospects/ProspectPanel.jsx:183–203`) treats every answer that isn't `'ok'` (except `'no_access'`) as a connection failure (`setPrintError({ ids })`, `:202`).
  - So for a child deleted on another device (or by the 6-month clean-up, v0.611), the bar says "Couldn't get the pages ready to print. Check the connection and try again.", and Retry fails every time. The same happens when a brother or sister in a family print is gone (`:188–189`).
- **Rule:** v1.004, §8 ("always include Retry where it applies").
- **Change:** a `'not_found'` takes the window's own not-found path: close the window and show "That prospect no longer exists." (`T.PROSPECT_GONE`, `prospects/text.js:211`) in the page's bar. Retry stays for `'error'` only.
- **Check (preview mode):** Prospects → List → open Ethan B. → in the console `(()=>{const d=JSON.parse(localStorage['tkd.preview.forms']);d.prospects.splice(d.prospects.findIndex(p=>p.child_first_name==='Ethan'),1);localStorage['tkd.preview.forms']=JSON.stringify(d)})()` → Print: the window closes and the page's bar says "That prospect no longer exists." With `__tkdPreview.failNextFormsSave()` instead, Print shows the bar with Retry, and Retry gets the pages ready.

### U-05 — Copy number and Share's Copy fail without a word · Low

- **What's wrong** (drift: v1.004 asks that a failure shows, and every other section shows it):
  - The profile window's Copy number (`prospects/ProspectPanel.jsx:162–170`, v0.639) and the Share dialog's Copy (`forms/ShareDialog.jsx:71–79`) catch a clipboard failure and only reset "Copied". Nothing is said.
  - Color Belt (`src/screens/testing/events/EventsTab.jsx:593`), Star (`src/screens/testing/star/events/StarEventsTab.jsx:634`), Black Belt (`src/blackBelt/staff/cycles/useCycleActions.js:147`) and the shared Registration link box (`components/RegistrationLinkBox.jsx:119–126`, words at `components/text.js:83`) say "Couldn't copy …".
- **Rule:** §3.5 (a failure is never silent); v1.004.
- **Change:** show a "Couldn't copy …" note next to the button, as the shared Registration link box does. Share's Copy copies a link, so it can use the shared `COPY_FAILED` as it is ("Couldn't copy the link. Select the link and copy it yourself."). Copy number needs words for a phone number in the same pattern: put them in your plan for Jeffrey (if they go in `src/components/text.js`, that is Dashboard core's file: ask Jeffrey).
- **Check (preview mode):** open a child → Call (PC) → in the console `navigator.clipboard.writeText = () => Promise.reject(new Error('x'))` → Copy number: the note shows. Forms → ⋯ → Share → Copy: the same.

### U-07 — After Undo of Delete field, keyboard focus drops to the page · Low

- **What's wrong** (missing — not planned):
  - The shared Toast removes itself, and its Undo button, before it runs Undo (`components/Toast.jsx:73–77`).
  - `undoDelete` (`forms/Builder.jsx:267–281`) puts the field back and selects it, but never moves focus. So focus falls to the page (`document.activeElement` is `BODY`), and Tab starts again from the top.
  - Color Belt's Undo puts focus back on what came back (`focusLater`, `src/screens/testing/events/EventsTab.jsx:526`), and so does your Prospects window (`keepFocusInWindow`, `Prospects.jsx:204`).
- **Rule:** §4 (WCAG 2.2 AA: 2.4.3, focus order); consistency.
- **Change:** after "Undone", focus the restored field's row in the field list.
- **Check (preview mode):** builder → select a field → Delete this field → Tab to the toast's Undo → Enter: the field is back, and focus is on its row (`document.activeElement` isn't `BODY`).

### U-08 — A failed delete says "It wasn't saved" in Prospects and "… and try again." in Calendar · Low

- **What's wrong** (drift; this merges the Design Review status file's "Noted for pass 2" Calendar line):
  - Delete status's note, and Delete prospect's bar, say "It wasn't saved. Check the connection and try again." (`prospects/text.js:322`).
  - Calendar's delete failure says "Couldn't delete. Check the connection and try again." (`calendar/text.js:239`).
  - Forms (`forms/text.js:63`), the Schedule (`schedule/text.js:166`), Color Belt (`src/screens/testing/text.js:280`), Star (`src/screens/testing/star/candidates/text.js:152`) and Black Belt (`src/blackBelt/staff/text.js:86`) all say "Couldn't delete. Check the connection, then try again."
- **Rule:** v1.045 (one set of words for repeated messages); consistency.
- **Change:** Prospects' two delete failures and Calendar's say "Couldn't delete. Check the connection, then try again." (once in `src/components/text.js` if Jeffrey has Dashboard core keep it there). After U-01 it is the note inside Delete prospect's box. Your other save failures keep their own lines.
- **Check (preview mode):** Prospects → Edit statuses → Delete status (pick a "Move them to") → `__tkdPreview.failNextFormsSave()` → Delete status: the note reads "Couldn't delete. Check the connection, then try again." Calendar → Event types → Delete type with `__tkdPreview.failNextCalendarSave()` armed: the same words.

### P-03 — The deleted-signature line says "after the free class" when none was booked · Low

- **What's wrong** (drift; the words are older, and now sit beside v0.640's "Kept until" line):
  - `SIGNATURE_GONE` (`prospects/text.js:229`, shown at `prospects/ProspectPanel.jsx:437–438` whenever `sigGone`, `:220`) always says "The picture was deleted 90 days after the free class. …".
  - The "Kept until" line beside it uses `signatureKeptUntil`'s `afterClass` (`src/lib/prospects/child.js:91–96`, shown at `ProspectPanel.jsx:448`), and says "(90 days after signing)" for a family that never booked.
  - So once the picture is deleted, a family with no booking reads the wrong reason.
- **Rule:** v0.242 (1): the picture is deleted 90 days after the free class, "or 90 days after signing when no free class was booked".
- **Change:** both lines use the same `afterClass`: "The picture was deleted 90 days after the free class. …" or "The picture was deleted 90 days after signing. …". Put the second wording in your plan.
- **Check (preview mode):** in the console `const db=JSON.parse(localStorage.getItem('tkd.preview.forms')); db.submissions.find(s=>s.parent_name==='Sara Smith').signature=null; localStorage.setItem('tkd.preview.forms', JSON.stringify(db));` → reload → Prospects → search "Mia" → Mia S.: the Signature row says "… 90 days after signing."

### L-09 — The date-of-birth hint and the ZIP error use their own words · Low

- **What's wrong** (drift; both lines are new in your 0036 work, and the build plan said "as Star's"):
  - The forms' date-of-birth calendar hint (`forms/text.js:266`): "Pick the month and year first, then the day. Future dates can't be chosen." (a straight apostrophe). Star's family form, Black Belt's family form and staff dialog, and Star's candidate dialog say "… then tap the day. Future dates can’t be chosen." (a curly one): `src/star-register/text.js:31`, `src/blackBelt/form/text.js:34`, `src/blackBelt/staff/text.js:902`, `src/screens/testing/star/candidates/text.js:220`.
  - The Address question's ZIP error (`forms/text.js:311`): "Enter a 5-digit ZIP code." Settings → Schools (`src/screens/settings/text.js:55`): "Enter a 5-digit ZIP code, like 01604."
- **Rule:** consistency (v1.045: shared words live once in `src/components/text.js`).
- **Change:** one hint and one ZIP line, kept once in `src/components/text.js` (Dashboard core's file: ask Jeffrey who adds them), used by your two lines. Show Jeffrey the words with your plan: checker 2 suggests "then the day", which reads right with a mouse too, and one kind of apostrophe; for the ZIP line, for example Settings' "Enter a 5-digit ZIP code, like 01604." Keep "Future dates can't be chosen." (pass 1's R3-13 left that part alone). If the hint's words change from Star's, Star's and Black Belt's four copies switch too: say so in your report, so Main can tell them.
- **Check (preview mode):** Forms → ⋯ → Fill in for a family → open Date of birth: the hint reads the agreed words. Type "123" as the ZIP code: the agreed ZIP line.

### L-10 (your part) — Prospects' chips and the Schedule's slots are under 44 px on touch · Low

- **What's wrong** (drift; older work, found while measuring Panel size):
  - Prospects' chips ("No-show · 1", "Not interested · 1") are 36 px tall on touch, with no tap box (`prospects.css:1511–1516`, under a "44px taps" comment).
  - The Schedule's 30-minute slots (e.g. Little Tiger 4:00–4:30) are 33 px tall: `.sslot` takes all of its time-sized box (`schedule.css:126–142`), with no touch minimum.
  - Not a WCAG AA failure (2.5.8's 24 px passes); §2.5's 44 × 44 misses. Calendar's Month / Week has the same cause as Dashboard core's L-03, which fixes it (see Smaller).
- **Rule:** §2.5: every tap area is at least 44 × 44 px on touch.
- **Change:**
  - The chips get an invisible 44 px tap box on touch (the shared touch rule, with Dashboard core's corrected number from its L-03), outside any `overflow: hidden`.
  - A Schedule slot can't grow without covering the next one, so it needs a design choice: draw it for Jeffrey in your mockup (for example a 44 px touch box that stays inside its day column).
- **Check (preview mode):** 820×1180 touch: a tap 3 px above or below a chip still picks it; the Schedule's 30-minute slots take a 44 px tap as the mockup shows.

### X-1 — A failure bar follows you into the next child's window · Low

- **What's wrong** (drift; checker 2 saw it while checking):
  - The page has one `banner`, cleared only by its × (`Prospects.jsx:651`, `:867`). `openProspect` (`:225`) and `closePanel` (`:262`) never clear it, and the window shows the page's bar (`prospects/ProspectPanel.jsx:765–769`).
  - Checker 2: Ruby's save failed, he closed her window with Esc and opened Leo N. Leo's window showed Ruby's "It wasn't saved. Check the connection and try again." at the top, as if it were about Leo.
- **Rule:** v1.004 (the bar says what failed, and stays until fixed or closed); pass 1's R2-01 (Retry runs "the same call").
- **Change:** clear the bar when another child's window opens (or keep each bar with the child it belongs to). Build it with R2-01: built as written, R2-01's Retry inside Leo's window would re-run Ruby's save (see "Corrections to pass 1").
- **Check (preview mode):** Ruby M. → status tag → Booked with `__tkdPreview.failNextFormsSave()` armed: the bar shows in her window → Esc → open Leo N.: no bar in his window.

### M-05 — The desk-only lines don't name the date of birth · Low · Jeffrey approved question 3 (d), v1.055

- **What's wrong** (approved this way in v0.616, now out of date):
  - With Hide private details on, the two desk-only lines read "Add prospects at the desk. Email and form answers are hidden on this tablet." (`prospects/text.js:16`, shown at `Prospects.jsx:863`) and "Fill in forms at the desk. Email and form answers are hidden on this tablet." (`forms/text.js:41`, shown at `Forms.jsx:245, 411`).
  - Since your 0036 work every child on these forms has a date of birth, and the switch hides it (v0.634 (1), v0.639). The home address is an answer to the form's Address question, so "form answers" already covers it; the date of birth is the one thing missing.
  - Star's line names it: "Add new candidates at the desk. Date of birth, email and payments are hidden on this tablet." (`src/screens/testing/star/candidates/text.js:120`).
- **Change (Jeffrey approved A, v1.055):** "Add prospects at the desk. Dates of birth, email and form answers are hidden on this tablet." and "Fill in forms at the desk. Dates of birth, email and form answers are hidden on this tablet." v1.055 records it, and the design review wrote the "(See v1.055 …)" note on your v0.616, so you need no row of your own.
- **Check (preview mode):** Hide private details on → Prospects and Forms: the two lines read as above.

### P-05 — A date of birth carries a weekday on the form and in the profile · Low · Jeffrey approved question 3 (h), v1.055

- **What's wrong** (approved this way: rev 3, v0.639, draws "Mon, Mar 4, 2019" on the form and in the profile and "Mar 4, 2019" on the printout):
  - The same date of birth reads "Wed, Apr 19, 2017" on the form (the family page, the kiosk and Fill in: the forms' date picker has no `formatValue`, `forms/FormFields.jsx:249–262`) and in the profile (`T.longDate(p.childDob)`, `prospects/ProspectPanel.jsx:233`; `prospects/text.js:235`).
  - The printed sheet reads "Apr 19, 2017" (`prospects/PrintSheet.jsx:207`), and so do Star and Black Belt (Star's family form uses `formatValue={monthDayYear}`, `src/star-register/DobField.jsx:12, 42`). Your build plan said "as Star's date of birth".
- **Change (Jeffrey approved A, v1.055):** "Apr 19, 2017" everywhere: the forms' date-of-birth field gets Star's `formatValue`, and the profile calls `T.longDate(p.childDob, false)`, as the sheet does. v1.055 records it (it changes the rev 3 mockups), and the design review wrote the "(See v1.055 …)" note on your v0.639, so you need no row of your own unless Jeffrey decides something new in your mockup.
- **Check (preview mode):** a child's date of birth on the family page, the kiosk and Fill in, and in the child's profile, reads month, day and year with no weekday (like "Apr 19, 2017"), as the printed sheet does.

### L-06 (your grips) — Drag handles look ready while dragging is off · Low · after Dashboard core's L-06

- **What's wrong** (drift for the unused `disabled`; unclear for the look, since no row covers a turned-off grip):
  - Three of your screens turn dragging off but leave the shared grips looking ready, with no `disabled` (so screen readers don't hear "dimmed" either):
    - the Forms builder, while it publishes (`forms/Builder.jsx:294`; grips `:547`, `:559`);
    - Edit statuses, while a row's ⋯ is open or the dialog saves (`prospects/StatusesDialog.jsx:39`; grip `:57`);
    - Event types, the same (`calendar/EventTypesDialog.jsx:57–58`; grip `:83`).
  - Dashboard core noted the Edit statuses part on 2026-11-04 (`docs/Dashboard Core/TKD-DashboardCore-Status.md:816`).
- **Rule:** the shared Grip's own header (`disabled`: "true: shown, but can't drag (e.g. while saving)", `components/Grip.jsx:16`); v1.116 / v1.120 (a turned-off control looks turned off).
- **Change:** after Dashboard core's L-06 (the shared Grip grays itself while dragging is off; Jeffrey sees a small picture first), check your three screens. If Dashboard core asks screens to pass the state, pass it.
- **Check (preview mode):** `__tkdPreview.setTestingDelay(2500)`; the builder → Publish: the field grips are gray while it publishes. Edit statuses → open a row's ⋯: the grips are gray until it closes. Afterwards `__tkdPreview.setTestingDelay(200)`.

---

## Smaller (fix while you're in the file)

- **U-06, after Dashboard core's R2-04:** on a phone, your profile page's buttons scroll under the toast's Undo (390 touch, Ruby M. → status tag → Booked: "Status: Booked · Undo" sits over "Book a free class"). Dashboard core's R2-04 now also covers full-screen dialog pages (`.dialog-page-body`; its pass 2 correction). When it is on main, check that "Book a free class" is never under the Undo. (Part of R2-04, Medium; a check for you.)
- **L-03, after Dashboard core's:** the touch buttons' tap box is 42 px, not 44, because `inset: -4px 0` counts from inside the 1 px border. The same number is in your `forms-public.css:545–549` (the family pages and the kiosk) and `calendar.css:775–779`, where `.cseg { overflow: hidden }` (`calendar.css:58–63`) clips it altogether, so Calendar's Month / Week tap at only 36 px (L-10's Calendar part). Dashboard core fixes the number (`-5px 0`) and names your files in its report; if it leaves them to you, use the same number and move `overflow: hidden` off the tap box. Then check at 820 touch: a tap 3 px above Month still switches. Low.
- **L-04 is rejected:** Fill in's gray on a Draft or Closed form keeps its reason as its tooltip, as v0.628 chose on purpose ("No reason line next to it … the row's Draft / Closed tag already says why"). Nothing to do.
- **Pass 1 points seen still open on main 6b27cdd** (R2-01, R2-09, R3-03, R3-09, R3-11, R5-02, S-2): nothing new; they stay in your pass 1 file, with the corrections below.

---

## Corrections to pass 1

- **R2-01** (pass 1's `Fix-NewStudents.md`, "A failed save or Undo in Forms and Prospects has no Retry"):
  - **The bar (and its Retry) must be cleared when another child's profile opens (X-1).** The page's one bar follows you into the next child's window today. Clear it in `openProspect`, or keep each bar with the child it belongs to; otherwise R2-01's Retry inside Leo's window re-runs Ruby's save.
  - **U-01's four boxes keep their own note, not R2-01's bar.** For Delete prospect, Came, Joined and Book a free class, a connection failure stays inside the box or dialog: the amber note under its buttons, and pressing the action again tries again (v1.103). R2-01's bar with Retry stays for the saves that have no box: the status tag, a Board drop that saves at once, notes, the follow-up date, a check-in from the window, and every Undo.
- **Pass 1's note on U-02** (`Fix-NewStudents.md:186`: "a refused Undo shown as a toast … which pass 2 checks"): pass 2 checked it, and it is U-02 above.
- **S-2 gains one line:** P-02's "Couldn't load [name]'s details. Check the connection, then retry." joins the load lines S-2 ends the new way.

---

## Done when

- Every Fix now item is built, reviewed and approved by Jeffrey in the preview: a design reviewer at the four sizes for visual changes, a code reviewer, and a security reviewer for anything touching the database or privacy.
- These pass: `npm run build:preview-mode`, then `npm run build`; `node src/lib/prospects/checks.mjs`, `node src/lib/forms/checks.mjs`, `node src/lib/calendar/checks.mjs`, `node src/lib/schedule/checks.mjs`, `node src/screens/prospects/progress.checks.mjs`; `node src/forms/checks.mjs` after `npm run build`; `node --test functions/tests/`.
- Jeffrey's decisions are rows from your block.
- The status file is current, the work is committed on your branch, and every shared file you touched is listed. **No push.**
- The report is sent to the Main session.
