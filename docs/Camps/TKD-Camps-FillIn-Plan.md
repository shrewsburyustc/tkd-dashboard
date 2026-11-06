# Camps — plan for "Fill in" (staff sign up a walk-in family at the desk)

**What this is:** the plan for Jeffrey's ask on 2026-11-05: "I need to be able to add a cantidate in myself if someone walks in and cannot fill out the form", answered "A" (Fill in, copying New students). Written on `camps` after main 5253f78. It changes rulebook v0.232 ("Staff have no Add camper"), so it gets a new row from 0.740 on. Nothing is built before Jeffrey OKs the plan and the pictures.

## What it does

- A camp page gets **Fill in** (PC / tablet: a button next to Registration link; phone: "Fill in for a family" in the header ⋯ sheet — as New students, v0.243 (5)).
- It opens the camp's own family form inside the dashboard, in a dialog (full screen on phones), as New students' Fill in does (`src/screens/forms/FillInDialog.jsx`): the same children, days, extras, parent and emergency contact, Paying by, the waiver, and the parent signs on the screen. Line under the title: "You are filling this in for a family. It will be marked "Entered by" you." (copied from New students).
- After Send: "Sent" with the reference (CP-…) and the total, buttons **Fill in another** and **Close**; the roster shows the new camper(s) at once.
- The camper shows where they came from: Camper detail "Signed up at the desk by Jeffrey Berg · waiver signed on the screen · CP-4821" (today "Signed up on the family form …"); History "Signed up (entered by Jeffrey Berg)".
- Same rules as the family form: prices (early / regular by today's date), age range, extras rules, duplicate check (a possible duplicate gets the amber box as today), 3 children at most.
- Hide private details on: Fill in gray, "Fill in forms at the desk. …" (as v0.616).
- Staff and admins both can use it (Forms lets all staff Fill in).

## Decisions to ask Jeffrey (one at a time, each with a picture)

1. ~~When Fill in works~~ **Decided 2026-11-05 (v0.740), picture 22x: "C"** — while family sign-up is open, staff and admins; while it isn't open (not open yet, closed by hand, past the closing date) admins only, staff see it gray with a tip to ask an admin; after the camp's last day nobody. The online form stays closed. The database enforces the same rule.
2. Whatever the pictures show that is new (the words of the Sent screen and the "Signed up at the desk" line).

## Database — migration 0043 (reserved by Main 2026-11-05)

- New column `camp_signups.entered_by text null` (+ `source text not null default 'form'`, check `in ('form','desk')`), so a desk sign-up is told apart (no backfill needed: every existing row is 'form').
- New function `camp_staff_signup(...)` — copies `forms_staff_submit` (0009): `security definer`, `set search_path = ''`, checks `has_data_access()` first, granted to `authenticated` only (nothing to anon), returns `{status: …}`. It calls the same core as the family form (`camp_public_signup_core`, 0022) so the rules can't drift; the core gains `p_source` / `p_entered_by` (no client key and no per-client rate limit for staff, the way the staff Forms path skips them; the open/closed check follows decision 1). Logged in `change_log` as the staff member ("entered by").
- `camp_camper_detail` and the history reader return `source` / `entered_by` (no login ids).
- Full handoff §6 set: SETUP "## Migration 00NN", `step00NN` in the PGlite runner, tests file, fingerprints file, security review before Jeffrey pastes. Finance: nothing changes (no payment is taken in Fill in; Mark paid stays on the roster).

## App

- `src/screens/camps/FillInDialog.jsx` (new) built from the family page's parts (`src/camp/*`: StepDetails, StepCheck, SignaturePad, `form.js`); the family page's own files stay the same where possible — any part moved to be shared is listed.
- `campsApi.js` `staffSignup`; fake store (`mockCamps.js`) does the same, so the preview works.
- Words in `src/screens/camps/text.js`.

## Order

1. Jeffrey OKs this plan → Main reserves the migration number.
2. Picture for decision 1 → his answer → rulebook row.
3. Pictures of Fill in at 1280 / 820 touch / 390 touch / 320 (button, dialog steps, Sent, Camper detail line, History) → his OK.
4. Migration + PGlite tests → security review → he pastes it, after-apply checks.
5. App build → design, code reviewers → status file → commit on `camps`. The app push waits until the migration is live.

**Rough size:** about the size of pass 1 step 3 (Record refund): two to three sessions of build and review, plus the paste.

Pass 1 step 2 (picture 21) is still waiting on Jeffrey's go; either can go first.
