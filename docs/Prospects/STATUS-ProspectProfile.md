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
| 7 | Print: a sheet too long for one page keeps the signature on the front how? (A) answers one line each like the old card, then up to 10% smaller; (B) the whole sheet smaller, just enough; (C) For staff use moves to the back. Pictures `ProspectProfile-Q7-print-today.png`, `-A.png`, `-B.png`, `-C.png` | A | **A** (Jeffrey, 2026-11-05: "A, one-line answers") → rulebook v0.641 |

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
- Committed **77046f3** (2026-11-04). Main updated the CLAUDE.md 0036 row (main d62b232, not pushed); a trial merge of 77046f3 into main is clean; merging also brings N3 (b6a90a7), so Main asks Jeffrey to OK both together.
- **2026-11-04, Jeffrey (away from home):** "Im not at home just push and deploy I will test on live right now", then "give it to me here and I will paste it now". Pre-apply check on production (read-only, connector): 0 / false / 15 / 8 / 8 / 0 / 0 / 0 = ready. 0036 sent to him as a file to paste from his phone. After his paste: the checks of SETUP 0036c, then Main merges and pushes (his words quoted). The 0036d test file (needs his UIDs) waits until he's at a computer.
- **0036 applied to production 2026-11-04** (Jeffrey pasted it: "success no rows"). Checks: pre-apply after = 2 / true / 4 / 8 / 0 / 0 / 0 / 0; all 22 fingerprint rows equal the tested ones (step0036: 94 passed); security advisor unchanged (3 known notices). Main asked to merge 77046f3 (+ N3 b6a90a7) and push, with his words quoted. Still to do: the 0036d tests in the SQL Editor (his UIDs; when he's at a computer); the clean-up migration ≥ 12 h after the push; one print on the school iPad.
- **Next:** Jeffrey tests live. Then, each with his OK: he pastes 0036 (SETUP "Migration 0036"), and Main merges and pushes **right after** (no new forms in between). Then reserve and write the clean-up migration (old child shape), at least 12 hours after the push. Before the next build here: one manual print on the school iPad (Safari's print after loading).

## After going live (2026-11-05)

- **Jeffrey:** "When I tried to print a student the signature went to the back of the paper, is there any way to ensure that it stays on the front?"
- **Why (checked):** Shrewsbury's live "Visitor Information" form asks 12 questions besides the child and parent (read-only check on production: question list only, no family data; its waiver is 589 characters, like the other forms). Printed in the preview with made-up answers, the whole sheet is 1,111 px tall where one page holds 967 px, so v0.636's default puts the waiver, signature and date signed on page 2.
- **Second problem found (a bug, no decision):** in Edge and Chrome every sheet prints an extra page holding only its bottom line ("Private: keep in the locked drawer…" + name). The unnamed `@page` rules inside `@media print` in `finance.css` (0.6in) and `testing-events.css` (0.75in) win over the sheet's top-level `@page pp-visitor` (0.4in × 0.5in), so a 10in page doesn't fit. Tested in headless Edge: the same named rule inside `@media print`, an unnamed one added last, or the unnamed ones removed each give the right margins and no extra page. **Fix to copy:** Color Belt's and Black Belt's `ResultsSheet.jsx` already met this and draw an unnamed `PAGE_RULE` `<style>` inside their print portal ("a later unnamed @page wins … and goes away with the sheet"). Only the shared receipt (`@page rcpt-receipt`, shared.css) still has the weakness (prints with Finance's 0.6in all round; harmless) — told Main 2026-11-05 (not this branch's file).
- **Deployed:** Main pushed 0036's app at main a5d0e1d on 2026-11-04, right after the paste (Cloudflare success). This branch fast-forwarded to main 3a8dc70 on 2026-11-05.
- **Question 7** asked with pictures (made by printing the real sheet to PDF in headless Edge and moving its parts: `scratchpad/pr/`). Recommendation A: on this sheet the answers one line each make it 981 px, then 1.5% smaller fits.
- Tip for Jeffrey (once): the Visitor Information form also asks "Today's Date" and "Address" as plain questions; the sheet now has "Date signed" and the Address question (Parent or guardian part), so removing / swapping those shortens every sheet.
- **Answer: A** (Jeffrey, 2026-11-05) → rulebook v0.641. **Built (uncommitted):** `lib/prospects/sheetPlan.js` (new: picks as it is → answers one line each → up to 10% smaller → page 2), `PrintSheet.jsx` (measures each sheet both ways, plans, checks a split sheet's real page 1, draws `PAGE_RULE`), `child.js` (`questionLead`, the one-line wide rule), `text.js` (4 lines), `prospects.css` (`.is-compact`, `.pps-more`, `--pps-zoom`). App only, no migration.
- **Checks:** prospects 11 groups (new: the plan's tiers, `questionLead`, the wide rule), forms 12 + public page 5, calendar, schedule, shared; both builds; render smoke check updated (two measuring copies per child). **Print tests in headless Edge** (built code, `scratchpad/pr/tests.py` + `pdfcheck.py`): Visitor Information → 1 page at 98.5%; a short form → as before, 1 page (no footer-only page); +30 questions → 2 pages, signature + boxes on page 1; a 5,000-character waiver → its wording on page 2; a family of two → 2 sheets; +80 questions → 3 pages, signature on page 1. Margins 0.4in × 0.5in on every page.
- **Reviews (2026-11-05), no blockers.** Design: the 10% shrink also shrank the 15 boxes (picture A said they keep their size) → now only the part above the signature (`.pps-top`) shrinks, the signature row, boxes and footer don't (Shrewsbury's form: 97.7%); "page 2" → "the next page" (no page numbers printed; a family's second child follows the first); show Jeffrey the next-page look → pictures `ProspectProfile-Q7-built-visitor.png`, `-built-next-page.png`, `-built-long-waiver.png` (defaults told to him); row v0.641 completed (the extra line, full size on a split sheet, the §7 12px exception on paper); a blank one-line answer's line sits level now; the waiver's wording moves only when that helps; stale comments. Code: `MAX_CHECKS` 60 → 20 (React stops after ~50 redraws in a row); `data-pps-page` removed; comments. Both re-checked by the reviewers.
- **Told Jeffrey (once):** a family printed together on a two-sided printer puts the second child's sheet on the back of the first's — print one-sided or one child at a time; the live form's question "Witch of the following benefits…" (typo, fix in the builder); print once from the iPad (Safari) after the deploy.
- **Known, not changed (older CSS, would change the approved look):** `.pps-page p { margin: 0 }` beats the margins of `.pps-waiver`, `.pps-agree`, `.pps-stafft`, `.pps-hint` and `.pps-box-title`; the pictures he approved show the sheet without them.
- After the fixes: prospects checks 11 groups, forms, calendar, both builds, render smoke check; 8 print cases in headless Edge pass (+ 16 answers → 1 page at 91.8%, 18 → next page); the 15 boxes measure 137.4pt on every sheet; short sheets pixel-identical to before. Re-checks: code clear; design clear after remaking the long-waiver picture (its made-up wording now ends on a whole sentence) and naming the waiver heading and ticked line among the parts that shrink.
- **Committed eb2de19** (2026-11-05, on main 3a8dc70). Main told it's merge-ready.
- **Deployed 2026-11-05:** Jeffrey answered "Merge and push" in Main's question (as Main quoted it); main d7b5ebf merges eb2de19, pushed, Cloudflare success. Checked here: the live site's main bundle has the new sheet ("More answers on the next page." and the page rule). This branch fast-forwarded to d7b5ebf.
- **Next:** Jeffrey prints the Visitor Information sheet from the desk PC and the iPad (one page; signature, date signed and 15 boxes on it; no footer-only page). Later, with his OK: the 0036 clean-up migration (number through Main), then the paused design-review queue (N7 onward).

## Build notes

- Needs a **migration** (number reserved through Main; next free 0036): each child's date of birth (forms' answer check, the sign-up → prospect trigger, the prospects table), the Address question type (field-list and answer checks), and the date signed on the signature. Security review before Jeffrey pastes it.
- App: `lib/forms/fields.js`, `screens/forms/FormFields.jsx` (family page, kiosk and staff Fill in), the builder palette, `mockForms.js` / `mockProspects.js`, `screens/prospects/ProspectPanel.jsx` → the profile window, Add prospect, a new print sheet (copy Finance / Camps print pattern).
- Privacy flag (told Jeffrey once): paper copies of a minor's date of birth and address can't be hidden or auto-deleted; keep sheets locked away and shred them.
- Rulebook rows from this branch's block (next free **v0.634**), after `git merge main`.

## The printed sheet's top, easier to read (Jeffrey, 2026-11-05)

Jeffrey, after printing a real sign-up: "The printable form is good but hard to read. Bottom is fine but the top is cluttered and hard to see information. Show me a couple of different options to improve this." (His screenshot showed a real family's details; none of it was copied into any file.)
- **Pictures** (made-up family; Shrewsbury's Visitor Information questions with the Address question, as his live form now has it). Each is printed to PDF from the preview with the option's CSS added before Print, so the sheet measures and plans itself with it.
  - `PrintTop-options.png`: Today, A, B, C.
  - `PrintTop-B-whole-page.png`: B on the whole page next to today's.
- **Shared by all three options:**
  - a calmer header: the "Printed … by …" line at 11 px, and the form's name on one line without its box;
  - stronger part titles (15 px, 600): Student, Parent or guardian, Form answers, Waiver.
- **The three options:**
  - **A · Labels first, one line each:** like the answers ("Phone: …"); the name biggest; it keeps a line under each value. Prints at 100%.
  - **B · Two boxes side by side (recommended):** Student and Parent boxes; small labels above big values; no writing lines; the name biggest. Prints at 100%.
  - **C · Big name, open layout:** no boxes and no lines. Prints at 98.5%.
- **Unchanged:** the bottom (answers, waiver, signature row, date signed, the 15 boxes). The first B draw had changed the signature row's labels; that was fixed before sending, and the rules now apply only to the Student and Parent parts.
- **Jeffrey: "B: two boxes"** (2026-11-05). Rulebook **v0.643** written (10b row, changelog line and header; CRLF kept). It records the 10.5 px capital labels as a paper exception to §7's 12 px minimum, like v0.641's.
- **Merged main** first: Star 0041 and Camps v0.739. Main touched the rulebook, SETUP.md and run.mjs, so the uncommitted work went into a stash (tagged; restored by its id; dropped afterwards). The rulebook and SETUP clashes kept both sides; run.mjs was rebuilt as main's file plus each 0042 piece after its 0041 counterpart. Checks: `node --check`; step0041 80 passed; step0042 93 passed, now applying 0041 first.
- **Built:**
  - `PrintSheet.jsx`: `Line` puts the label first and has `big`; Student and Parent sit in `.pps-people` > two `section.pps-box`; spans 6/4/2/6 and 3/3/6/6.
  - `prospects.css` (print part): the header, the form line without its box, the stronger `.pps-sec`, the boxes (as tall as each other), the labels and values scoped to `.pps-box`, and `.pps-f--4`.
  - The bottom's own rules are untouched.
- **Printed again (PDF, headless Edge):** all 8 v0.641 cases pass the page checker, plus the Visitor Information with the Address question and a long-values case (t9, one page at 98.2%, wraps cleanly).
  - The fit is better: the Visitor Information prints at 100% (before 97.7%); 16 answers at 96.7% (before 91.8%); 18 answers now fit one page at 93.7% (before they went on to a next page); the long forms keep 13 answers on page 1 (before 12).
  - The 15 boxes: the drawn grid is 121.5 pt on every sheet. The checker now measures the drawn lines, because the text positions move by under a pixel.
  - Pixel compare with the approved B picture: identical apart from font smoothing.
- **Known, older:** the +80-question test form (t6) ends with a page that holds only the footer, because its continued answers exactly fill page 2. No real form is near that length.
- **Builds and checks:** both builds, the 6 check scripts and 174 function tests pass.
- **Design review:** no must-fix. The top matches the picture (all 96 text spans identical to the approved PDF), and the bottom is unchanged (drawn lines measured against v0.641's PDFs). Its should-fix items:
  - the row now matches what prints: the 1 px title rule, the header's sizes, and three paper exceptions to §7 (the 10.5 px labels and the 11 px printed line under 12 px, and capitals, not sentence case);
  - gray #333 can print grainy on a black-and-white laser: one real test print on the front-desk printer, and black if grainy (his call).
  - **t6 corrected:** PrintSheet has only a first and a second page and never measures the second, so a second page taller than the paper overflows. About 79 answers put the footer alone on page 3; about 90 or more would put answers on a third page with no heading. This is an older limit (v0.641's build printed the same); no real form is near it.
- **Code review:** no must-fix. Its should-fix items are fixed:
  - a blank detail keeps a thin line to write on (`.pps-person .pps-v:empty`, checked with a blank-address case t10);
  - the dead `.pps-f--1` is removed;
  - `break-inside` is dropped from `.pps-people`;
  - `.pps-box` is renamed `.pps-person` (next to the staff part's `.pps-boxes`);
  - comments, and the prospects checks' Shrewsbury comment.
  **Re-check clear** after one more comment fix (PrintSheet.jsx: "the biggest words in the boxes").
- **Reprinted after the fixes:** all cases pass (one page each as before; 15 boxes 121.5 pt drawn). The rulebook row v0.643 is corrected (this branch's own row, not on main yet).