# New students: date of birth, address, profile and printout — status

Started 2026-11-04. Jeffrey halted the other sessions to focus on this (via Main). The design-review queue (N7 onward, Part 2) is paused until he says to go back to it; N3 (b6a90a7) waits on Main's list.

## What Jeffrey asked (2026-11-04, with a photo of the old paper card, saved as `Old-visitor-information-card.png`)

1. Each student's **date of birth** with the name — the exact birthday, not the age.
2. An **address** section on the form: street, city, state, ZIP.
3. The prospect view is too small (the side panel on the right). Clicking a prospect should open a **profile** where important information stands out: **at the top, which form they filled out**; everything easy to see at a glance.
4. **Print** a prospect's information, using the old "Visitor Information" card as a reference: the filled-in information at the top, the **signature** on the page, and spots at the bottom to mark when they come to class. Possibly temporary (until everything is online), but needed now.
5. The printout follows **whatever is on the form we created**, not the old card's exact sections, but it needs the attendance spots at the bottom: **15 days**.
6. (Added mid-turn) **Signatures always require the date signed.**

## Mockups (not built)

- `TKD-Prospect-Profile-Mockups.html` (screens `#form`, `#waiver`, `#profile`, `#print`; open in a browser, resize for tablet / phone).
- Pictures (rev 2): `ProspectProfile-mockup-1-form.png`, `-2-signature.png`, `-3-profile-pc.png`, `-3-profile-tablet-phone.png`, `-3b-hidden.png`, `-3c-states.png`, `-4-printout.png`; questions: `ProspectProfile-Q1-address.png`, `ProspectProfile-Q2-date-signed.png`.
- Design review of rev 1 (2026-11-04) found: no "Hide private details" version; boxed cards instead of the detail rows (§1.2); missing states (desk entry, older sign-ups, Did … come?); 28 px status button on touch; Print without its word on phones; the date picker's look; printout weights 600, capitals, mixed date styles, no "Printed … by". All fixed in rev 2. Also kept from v0.242: the signature opens with Show signature (every look recorded); printing counts as a look.

## Decisions (one at a time)

| # | Question | Recommendation | Answer |
|---|---|---|---|
| 1 | Address: a new question type "Address" (A) or always on every form like Phone/Email (B) | A | **A** (Jeffrey, 2026-11-04) → rulebook v0.634 |
| 2 | Date signed: filled in automatically (today, can't be changed) or picked by the family | automatic | **A, automatic** (Jeffrey, 2026-11-04) → rulebook v0.635 |
| 3 | Print with brothers/sisters in one sign-up: this child only (A), the whole family (B), or ask with a small menu (C); one page per child; a sheet that doesn't fit one page | C | **C** (Jeffrey, 2026-11-04) → rulebook v0.636 (with the sheet's defaults: page 2 for the waiver when it doesn't fit, print = a recorded look, grayed while hidden) |
| 4 | Each child's last name too (the old card had the student's full name; the form asks the first name only) | A, add it | **A** (Jeffrey, 2026-11-04) → rulebook v0.637; mockups rev 3 show it |
| 5 | Does "every signature has its date signed" include the other family forms (Color Belt, Star, Black Belt, Camps)? Those are other sessions' work, through Main | B, every form, later | **B** (Jeffrey, 2026-11-04) → rulebook v0.638; owners Color Belt, Star, Black Belt, Camps, after this work (told Main) |
| 6 | The paper keeps the signature after the dashboard deletes the picture (90 days) — his call, to record | ask with question 3 | — |

Defaults (no question, copied from existing patterns): Print grays with one line while "Hide private details" is on (as Email, v1.000 (2)); the switch also hides the home address (rule 5); children who signed up before this change keep their typed age ("Not asked" + the age); the age is worked out from the date of birth everywhere it shows; the list never shows the age or date of birth (v0.245, rule 5); the old card's Email / Birthday tick boxes are left out, Comments kept.

Flag for Jeffrey (once): the big window covers the list, so working through "Follow up today" takes a close for every family; previous / next arrows in the window's header could help (not drawn).

## Approval and build

- **Mockups rev 3 approved** by Jeffrey 2026-11-04 ("Ok go ahead") → rulebook v0.639.
- **Migration 0036 reserved** by Main (main 5523ace, CLAUDE.md; next free 0037), 2026-11-04: file `0036_<what>.sql`, SETUP section "## Migration 0036: …", run.mjs step `step0036`. If the build plan changes its scope, tell Main to update the CLAUDE.md row.
- Build plan written: `TKD-ProspectProfile-Build-Plan.md` (2026-11-04).
- **Built (2026-11-04, uncommitted), by three builders in parallel:**
  - Database: `0036_new_students_profile.sql` + tests, fingerprints, pre-apply check, undo, SETUP "Migration 0036", run.mjs `step0036`. PGlite: 2,145 passed, 0 failed. Earlier tests now find template fields by id (and leave the Address out of their own test forms). The undo refuses once anyone has used the new parts.
  - Forms side: last name + date of birth per child, the Address question (builder, family page, kiosk, Fill in), "Date signed". Checks pass; Function tests 174/174.
  - Prospects side: the profile window, Print (+ menu for brothers/sisters), the printed sheet, Hide private details, "Ava N." from the child's own last name. Checks pass.
  - `npm run build:preview-mode` and `npm run build` pass; the public forms dist check passes.
  - Lead's own run in preview: a family sign-up (Mila Lee) with an address and date of birth → listed as "Mila L." → profile shows everything; the print sheet and the Print menu work.
- Builders' differences to tell Jeffrey: an older child reads "Not asked · age on the form: 9" (mockup 3c had a longer line); the window has its own heading row with × (the shared Dialog has none); kiosk sign-ups read "Sent on the kiosk at the desk"; opening a brother/sister clears their "not opened" dot; the Year list goes back 100 years (Star's).
- Switch risk (from the database builder): between the paste and the push, a new form made in the old builder gets the Address question but shows it as an unlabeled text box — no new forms in that window.
- **Reviews (2026-11-04):** security (no blockers; 2 should-fix: staff could read sign-ups' children/answers straight from the table → 0036 now grants only `id, form_id, location_code, created_at`; staff Fill in offered the browser's address autofill → off), design (no blockers; every wrong child box at once, label sizes, siblings' age from date of birth, page counts → "2 sheets", icon map), code (no blockers; removing a child now moves the free-class picks (older bug), stale profile answers ignored, focus kept in the window, print cancelled when Hide private details turns on, failed-save bar inside the window). All fixed; security re-check clear.
- **Final checks:** forms 12 groups, prospects 10 groups, calendar, progress — pass; Function tests 174/174; PGlite 2,147 passed, 0 failed (step0036: 94); `npm run build:preview-mode` and `npm run build` pass; public forms dist check passes. Rulebook v0.640 records the build's details and two icon-map entries.
- **Next:** Jeffrey tries it in preview. Then, each with his OK: he pastes 0036 (SETUP "Migration 0036"), and Main merges and pushes **right after** (no new forms in between). Then reserve and write the clean-up migration (old child shape), at least 12 hours after the push. Before the next build here: one manual print on the school iPad (Safari's print after loading).

## Build notes

- Needs a **migration** (number reserved through Main; next free 0036): each child's date of birth (forms' answer check, the sign-up → prospect trigger, the prospects table), the Address question type (field-list and answer checks), and the date signed on the signature. Security review before Jeffrey pastes it.
- App: `lib/forms/fields.js`, `screens/forms/FormFields.jsx` (family page, kiosk and staff Fill in), the builder palette, `mockForms.js` / `mockProspects.js`, `screens/prospects/ProspectPanel.jsx` → the profile window, Add prospect, a new print sheet (copy Finance / Camps print pattern).
- Privacy flag (told Jeffrey once): paper copies of a minor's date of birth and address can't be hidden or auto-deleted; keep sheets locked away and shred them.
- Rulebook rows from this branch's block (next free **v0.634**), after `git merge main`.
