# New students: date of birth, last name, address, profile and printout — build plan

Approved design: rulebook v0.634–v0.639 (2026-11-04), mockups `TKD-Prospect-Profile-Mockups.html` rev 3. Status: `STATUS-ProspectProfile.md`. Branch `claude/prospect-form-system-cd893d`. Migration **0036** (reserved by Main, 2026-11-04).

Nothing here is applied to the live database or pushed without Jeffrey's OK for that step (CLAUDE.md).

## 1. What changes, in one paragraph

Each child on a New students form gets a **last name** and a **date of birth** (the age is worked out from it). Forms get an **Address** question (street, city, state, ZIP code; at most one per form). Every signature shows its **date signed** (the database already stores it as `form_submissions.signed_at`, so this part needs no database change). The prospect side panel becomes a **profile window** with **Print**, which prints a letter-size visitor sheet per child. The List and Board show "Ava N." from the child's own last name.

## 2. Database — migration `0036_new_students_profile.sql`

Builds on 0007, 0009, 0012, 0015, 0021 and 0031 (all live). Touches no other section's functions. Nothing new for `anon`; no new function for `forms_registrar` (it keeps exactly its 3 functions).

### 2a. Two child shapes during the switch

The live app (and a kiosk tablet, which keeps its page up to 12 hours) sends a child as `{first_name, age}`. The new app sends `{first_name, last_name, dob}`. **0036 accepts both**, so nothing breaks between Jeffrey's paste and the push. A later small migration removes the old shape once the new app has been live for a day (as 0035 follows 0030).

### 2b. Changes

| What | How |
|---|---|
| `forms_check_answers` (0009; immutable, internal) | Children: each child is exactly `{first_name, age}` (old, as today) **or** exactly `{first_name, last_name, dob}` (new): last name like the first name (≤ 40, `calendar_text_is_valid`), `dob` a real date (`forms_date_ok`). The age range of a new child is checked in `forms_submit_core` (it needs today's date; this function is immutable). **New `address` type:** the answer is `{street, city, state, zip}` (no other keys; street ≤ 120, city ≤ 60, state ≤ 30, ZIP `^\d{5}(-\d{4})?$`; all four filled), **or a plain text** of ≤ 200 (only what an old page still open on a kiosk would send; removed with the old child shape). Required / not required as any question. |
| `forms_fields_are_valid` (0009; internal) | `address` joins the type list; **at most one Address question per form** (like the waiver and booking); no `options` or `text` on it; `show_if` allowed like any question. |
| `forms_template` (0009; internal) | Free class and Walk-in: `{id: 'address', type: 'address', label: 'Home address', required: true}` right after Email; Event: the same, not required. (Only new forms; live forms ask it once an admin adds it.) |
| `forms_submit_core` (0031's; internal) | A new-shape child is stored as `{first_name, last_name, dob, age}`, `age` worked out from the date of birth on the school's today (America/New_York); a child whose age isn't 2–99 is refused (`invalid`), the same range as today. Old-shape children stored as today. Same arguments, same rights. |
| `form_submissions.children` size check | 2000 → 4000 bytes (six long last names in other alphabets could pass 2000). |
| `prospects` table (0012) | New columns `child_last_name text` and `child_dob date`, both null for children who signed up before; checks: last name null or valid text ≤ 40; date of birth null or between 1900-01-01 and 2100-01-01. `child_age` stays (filled for every child, worked out for new ones). |
| `prospects_from_submission()` (0012; trigger) | Also copies `last_name` and `dob`. |
| `prospects_list` (0012) | Each row also returns `child_last_name` (the List and Board build "Ava N." from it; old rows fall back to the parent's last name as today). Never the date of birth or age (v0.245, rule 5). |
| `prospects_search` (0012) | Also matches the child's last name. |
| `prospects_get` (0012) | Also returns `child_last_name` and `child_dob`, and each sibling's `child_last_name`. |

Old sign-ups are never rewritten (0009's trigger refuses changes to a sign-up), so nothing is backfilled and no one's `version` moves.

### 2c. Files with it

- `supabase/migrations/0036_new_students_profile.sql`, `supabase/tests/0036_tests.sql`, `supabase/tests/0036_fingerprints.sql`, `supabase/tests/0036_preapply_check.sql`, `supabase/manual/0036u_undo_new_students_profile.sql` (the undo puts every replaced function back word for word, drops the two columns and restores the 2000-byte check).
- `supabase/SETUP.md`: **## Migration 0036: each child's last name and date of birth, the Address question** with 0036a (pre-apply check), 0036b (paste), 0036c (fingerprints), 0036d (tests), 0036e (undo).
- `supabase/tests/pglite/run.mjs`: **step0036**, modelled on step0031: every earlier migration, the baseline tests before and after, only the planned functions move in the fingerprints, re-run safety, undo and redo.
- Earlier test files that pick template fields by position (`'{8,text}'`, `-> 4`, `{5,required}`) are changed to find the field by its id, so they pass before and after 0036 (0009, 0012, 0015, 0019, 0021, 0031 tests). Same checks, same counts.

### 2d. Review and paste

A separate **security review** of the SQL, the tests and the undo before Jeffrey pastes it. Then: Jeffrey pastes 0036 in the Supabase SQL Editor (his OK first), runs the fingerprints and the tests file, and the security advisor. **0036 goes live before the app that uses it** (the new app needs the new columns; the old app keeps working on 0036).

## 3. App — forms side (family page, kiosk, staff Fill in, builder)

| Where | Change |
|---|---|
| `src/lib/forms/fields.js` | Child = `{ first_name, last_name, dob }` (`emptyFillValues`, `stepProblems`, `answerProblems`): first and last name 1–40 (`textProblem`), date of birth a real date giving an age of 2–99 on the school's today (America/New_York). New question type `address` (in `QUESTION_TYPES`, the Contact `PALETTE` after Date, `DEFAULT_LABEL` "Home address", one per form like the waiver/booking): the answer `{ street, city, state, zip }`, all four filled and valid (street ≤ 120, city ≤ 60, state ≤ 30, ZIP 5 digits or ZIP+4); blank street, city and ZIP = no answer; `cleanAnswers` trims the parts. `template()` = the database's `forms_template` (Address after Email; required on Free class and Walk-in, not on Event). |
| `src/screens/forms/FormFields.jsx` (+ `forms.css`, `forms-public.css`) | Children block: First name and Last name side by side (stacked on phones), then **Date of birth** with the shared `DatePicker` (as Star's date of birth, `src/star-register/DobField.jsx`; up to today, years back to 99; inline on the family page and kiosk) and "N years old" under it once picked. Address block: Street address; City; State (starts as MA) and ZIP code (side by side on phones). Under the signature pad: **Date signed** — today's date, gray read-only box, hint "Filled in automatically with today's date." (not part of the form's values). |
| `src/forms/FormsApp.jsx`, `src/screens/forms/useFillIn.js`, `FillInDialog.jsx` | Send `{ first_name, last_name, dob }`; the "touched" and focus logic learn the date picker and the address block. |
| Builder: `FieldPalette.jsx` (`ICONS`: address → `IconHome`, `addBlocked`), `Builder.jsx` (`fieldHint`: "Street, city, state, ZIP code"; Children hint "First name, last name, date of birth"), `src/screens/forms/text.js` (`TYPE_LABEL`, `ONLY_ONE`, `FIELD_PROBLEM`) | The Address type, as in the Q1 picture. |
| Preview fakes and checks: `src/lib/mockForms.js` (`checkAnswers`, `submitCore`, samples, `FORMS_STORE_SCHEMA` 2 → 3), `src/forms/checks.mjs`, `src/lib/forms/checks.mjs` | Same rules as 0036 (both child shapes, the address answer); new-shape sample families with an address. The `schema: 2` lines follow the bump. |
| Pages Function `functions/` | No code change (it passes children and answers through; the database checks them). Its tests gain one new-shape sample. |

## 4. App — prospects side (profile window, print, names)

| Where | Change |
|---|---|
| `src/lib/prospects/api.js`, `src/lib/mockProspects.js`, `src/lib/prospects/checks.mjs` | `childLastName`, `childDob` (list: last name only); search by last name; the age shown = from the date of birth on today, else the stored age; new-shape samples. |
| "Ava N." | From the child's own last name, else the parent's as today: `Prospects.jsx` (`initials`), `lib/prospects/followUps.js`, `screens/calendar/text.js`, `lib/calendar/checks.mjs`. |
| `src/screens/Prospects.jsx`, `ProspectPanel.jsx` → the profile window (`prospects.css`) | Clicking a child opens the shared `Dialog` (about 960 px wide on PC, nearly full width on tablet, the full page on phones) laid out as mockup rev 3: the form strip, age + status + Print, the progress track with the boxes that need staff under it, then Child and family / Form answers / Waiver (Date signed, Show signature) on the left and Free class and follow-up / Notes and calls / History / Delete on the right (one column on tablet and phone, family → free class → answers → waiver → notes). The side column and the tablet "under the list" layout go. Book, Joined, Delete and the status menu open on top of it on every device (`onTop`, `returnFocusTo`). Focus: the window's heading on open, the child's row on close; Esc and the unsaved-note guard as today. |
| Hide private details | Date of birth, email, home address and every answer: "Hidden on this tablet"; Email grays with today's line; Print grays with "Print is off while private details are hidden. Print at the desk." |
| Print (new `src/screens/prospects/PrintSheet.jsx`, print CSS in `prospects.css`) | One child: prints straight away; brothers or sisters: a `RowMenu` (a sheet on phones) "Ava only" / "Ava and Noah · 2 pages". Each page as mockup screen 4 (US Letter, black on white, weight ≤ 500): school and town, "Visitor information", "Printed [date] by [name]"; the form strip; Student (full name, date of birth, age, free class); Parent or guardian (name, phone, email, home address); every answer (address on one line); the waiver text, "I have read and agree", the signature picture (each one loaded with `loadSignature`, which records the look) or "Signed on [date]" when it was deleted; Date signed; For staff use: 15 boxes and Comments. If a page doesn't fit, the waiver part moves to its own page after it. Copies `Receipt.jsx`'s print method (portal, named `@page`, doubled class for `testing-events.css`'s print rule, `afterprint`). "Printed by" needs the signed-in person's name: one prop from `App.jsx` (shared file), as Finance has. |

## 5. Order, reviews, deploy

1. Three builders in parallel (database / forms side / prospects side), each on its own files; then `npm run build` and `npm run build:preview-mode` (real build last), the forms checks, the Function tests and the PGlite runner.
2. A **security review** (0036 and the app's data paths) and a **design review** (screenshots at 1280, 820 touch, 390 touch, 320 against the rulebook rows and mockup rev 3); fixes.
3. Jeffrey tries it in preview. Then, each with his OK: he pastes 0036 (SETUP "Migration 0036"), Main merges and pushes. A day later, the small clean-up migration removes the old child shape.

Shared files touched: `src/App.jsx` (one prop), the rulebook. Nothing in `shared.css`, `mockClient.js` or `src/components/*`.