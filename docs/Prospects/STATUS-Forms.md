# Forms — status

Branch `claude/prospect-form-system-cd893d`. Plan: `TKD-Forms-Build-Plan.md` (approved 2026-10-18). Rulebook v0.235 (design) and v0.241 (plan answers). Approved mockup: `TKD-Forms-Mockups.html` rev 1.

**Database live, app and public page not yet.**
- Migration 0009 is applied to the live Supabase database (2026-10-19). Jeffrey pasted it into the Supabase SQL Editor on 2026-10-19 (order 0007 → 0008 → 0009 → 0012, after 0001–0006 and Color Belt's 0010). For each: the live fingerprints equal the PGlite live-order copy exactly (row count + one hash over every row), the security advisor showed only the expected entries (signed-in users may run the checked write functions; internal tables have RLS on and no read rule on purpose), and the tests file passed (run with the real admin and front-desk IDs, rolled back).
- The login `forms_registrar` exists **without a password** (it can't sign in until F6). Nothing has been pushed.
- The public page also needs Color Belt phase 2's public path.
- The public forms go live **together with Prospects** (v0.241 answer 1).

| Step | State |
|---|---|
| F0 Plan + questions Q1–Q7 | Done 2026-10-18 (v0.241) |
| F2 Migration 0009 + tests + security review | Done 2026-10-18; PGlite 78/78 |
| F4 Staff screens + Calendar bookings + preview data; design review | Done 2026-10-18 (preview only); 9 differences wait for Jeffrey in F5 |
| F1 Merge main (after Color Belt phase 2 is merged — the Main session merges when Jeffrey asks) | Waiting |
| F3 Public page + Cloudflare function; security review | Built 2026-10-19 in preview (commit c7f988e + the differences below); security and design reviews done; 4 differences from mockup screen 8 decided (v0.602–v0.605). 0019 (school phone) live 2026-10-19. **Next:** F6 |
| F5 Jeffrey tries it in preview (and decides the F4 differences below) | Done 2026-10-18: differences decided (v0.243), Jeffrey tried the forms and Fill in — fine. Sign-ups show nowhere yet except Calendar bookings: that is Prospects (step 4) |
| F6 Live setup (0009 after 0007 / 0008; two-connection race test; registrar password; Cloudflare settings) | 0009 applied and checked 2026-10-19 (fingerprints 190/192 rows before 0012, all 192 after; advisor expected-only; ALL 0009 TESTS PASSED). Still waiting: race test, registrar password, Cloudflare settings (with F3) |
| F7 Go live, with Prospects (step 4) | Needs a separate OK |

## What F2 added

`supabase/migrations/0009_forms.sql`:
- **Ten tables:**
  - `forms` (draft + published fields, settings, status)
  - `form_booking_offers` and `form_booking_limits`
  - `form_submissions` (never changed; keeps a copy of the fields)
  - `class_bookings` and the lock rows `class_booking_slots`
  - `form_kiosk_tokens` (hashed)
  - `form_email_results`
  - `forms_public_attempts`
  - `form_signature_views` (who looked at which signature)
- **Staff functions:**
  - admins build: create, save draft, publish, status, duplicate, delete-only-without-sign-ups, booking settings;
  - staff and admins: Fill in, open times, the Calendar booking list, one signature, kiosk token / revoke.
- **Three public functions** for the restricted login `forms_registrar` (created without a password).
- **Free-class times:**
  - the Schedule in effect, minus closures (matched like `days.js`) and times sooner than "hours ahead";
  - **one shared spot limit per class time** (the lowest of the live forms wins; a 0 only hides the time on its own form);
  - the last spot is locked, so two families can't both get it.

`supabase/tests/0009_tests.sql` and `0009_fingerprints.sql`; `pglite/run.mjs` runs 0009 before and after seed, after re-runs (rows, history and fingerprints unchanged) and on the upgrade path. A deliberate break of the shared limit was caught.

## Security review (2026-10-18)

No High findings. Fixed:
- **M1:** a bad booking date (Feb 30) no longer errors out, and it still counts toward the rate limit.
- **M2:** a 0 limit on one form no longer closes the time on other forms.
- **M3:** every signature read is recorded.
- **L1:** a submission key from another form is refused.
- **L2:** a repeated Send gets the same answer, bookings included.
- **L3:** the booking field can't be "required", and bookings are refused when it's hidden.
- **L4:** at most 5 kiosk tokens per form, a revoke function, and a token length check.
- **L5:** one rate-limit count at a time per connection.
- **L6:** forms without a booking field don't shape the shared limit.
- **L7:** a signature must be at least 200 characters.
- **Note:** closure records are also matched on the closure's school.

## Decided after F2 (Jeffrey, 2026-10-18, rulebook v0.242)

1. **Signatures:**
   - the picture is deleted 90 days after the free class, or after signing if no class was booked;
   - the sign-up keeps "Signed on" (`signed_at`);
   - this is built in 0009 (`forms_purge_old_signatures`), runs inside the Send, Fill in and signature-read functions, and is tested (11a–c). PGlite 78/78.
2. **Booking settings take effect right away** (already built that way). The screen must say "Changes here go live right away".
3. **Email sender: decided 2026-10-19 (v0.601): launch WITHOUT emails** (no school web address yet); later: a Cloudflare web address + Resend. (Was: open.)
   - Jeffrey checks whether the school owns a web address. Options: its own address + Resend, or launch without emails.
   - The school alert can go to the front-desk Gmail address.
   - Until a sender exists, the app's email switches say "Emails start once the school's sending address is set up."
   - Decided before F3.

## What F4 added (2026-10-18, preview only — nothing live, nothing pushed)

- **Forms section** (rail item "Forms", ti-clipboard-text, after Calendar; address `#forms`; the phone bar now has 5 buttons):
  - list (Form · Status · This month · Type; W/S letters on Both; Share; ⋯ Edit, Fill in, Duplicate, Close / Open again, Delete — only without sign-ups);
  - New form (name + 4 template cards; asks the school on Both);
  - builder: PC three panels, tablet "+ Add field", phone list + full-screen editor + ⋯ Move up / Move down / Delete; saves as you go (draft), Publish, "Accepting sign-ups";
  - booking settings with their own Save and "Changes here go live right away";
  - Share (link; QR and kiosk say they arrive with F3), Fill in (steps, children, a time per child as cards, waiver + drawn signature, Sent screen), Preview;
  - staff: no building; row → read-only Preview; Fill in and Share.
- **Calendar:** "N free classes" chip (amber "· class cancelled" when a booked class no longer runs), phone dot, day panel "Free classes" list with amber "Class cancelled — call the family", week-view badge, closure dialog warning "N free-class bookings are on these classes — you'll need to call…". If the Forms functions aren't in the database yet, the Calendar shows without bookings.
- **Code:** `src/lib/forms/` (fields.js rules = 0009's checks, api.js, useForms.js, checks.mjs — 8 groups pass), `src/lib/mockForms.js` (fake 0009 with the same answers), `src/screens/Forms.jsx`, `src/screens/forms/*`, `src/styles/forms.css`. Calendar checks gained a bookings group (11 groups pass). `npm run build` and `build:preview-mode` pass.
- **Shared files touched:** `src/App.jsx`, `src/components/navItems.js`, `src/lib/mockClient.js`.
- **Design review (separate agent):** 1 High (the phone ⋯ menu crashed the app — fixed), 5 Medium (time picker as cards, keyboard way back to Form settings, focus on the first field, link "not live until F3" note, amber chip says why — all fixed), 8 Low (6 fixed; the tablet "+ Add field" menu opening over the rail and the staff phone ⋯ sheet are left as they are).

## Differences from the approved mockup — decided in F5 (Jeffrey, 2026-10-18, rulebook v0.243)

Answers: 1 A (click to add), 2 A (own Save), 3 A (fixed wording, signature always), 4 A (notes, link can be copied), 5 A (Preview; phone ⋯), 6 A (rename in Form settings), **7 B (switches — built)**, **8 B (waiver never "Show only if" — built in the screens and in 0009, test 1h; PGlite 78/78)**, **9 B (spots on every time — built)**.

The list as it was asked:

1. Field types are added by **click** (after the chosen field); dragging a type from the palette into the form isn't built. Fields are moved by their grip.
2. **Booking settings have their own Save button** (they go live right away, v0.242); the rest saves as you go.
3. The waiver has **no "Checkbox wording" or "Signature required"** setting: the wording is "I have read and agree to the waiver" and a signature is always needed (the database stores only the waiver text).
4. **QR code and kiosk** are notes until step F3; the link can be copied but works only after F3 (the dialog says so).
5. **Staff:** clicking a row opens a read-only Preview; on a phone, staff reach Fill in through a ⋯ sheet (the mockup says "no ⋯" for staff).
6. The **form name** can also be changed in Form settings.
7. **Switches are checkboxes** (the same control used elsewhere in the app).
8. A **required waiver can be made "Show only if…"** — allowed by the database; confirm that's fine.
9. Fill in shows **"1 spot left" only on the last spot**, like the mockup; "No time yet — we'll call to set one up" is offered as the last choice.

## Security re-check of the waiver rule (2026-10-18)

No High or Medium findings. Applied: the answer check also treats a waiver as always visible (0009 forms_check_answers + preview), and the screen refuses any show_if that is not a plain object, like the database. Noted for go-live: a later rule change on a live database should also check the rows already saved. PGlite 78/78.

## What F3 added (2026-10-19, preview only — nothing live, nothing pushed)

- **Public page** `/f/<slug>` (`forms.html`, `src/forms/`): the steps, the children, a free-class time per child, the waiver with a drawn signature, the thank-you screen with "Add to calendar", and the closed / not found / paused / "didn't load" screens. Strict CSP on `/f`, `/f/*`, `/forms`.
- **Pages Function** `functions/api/forms/[slug].js` (+ `functions/_lib/forms/`): GET the published form and open times, POST a sign-up; Turnstile, rate limit, honeypot, one database function through the restricted login `forms_registrar` (SETUP §16). Server tests 67/67.
- **Merged main** (Finance) on 2026-10-19: conflicts in the rulebook, App.jsx, navItems.js, mockClient.js, SETUP.md, run.mjs — all "both sides added" (Finance kept SETUP §15 and run.mjs step 14; this branch's became §16 and steps 16-17).

## Differences from mockup screen 8 — decided (Jeffrey, 2026-10-19)

1. **v0.602** — each step's name is the heading, "Step n of N" under it.
2. **v0.603** — each child's time starts blank; a time or "No time yet" is required; no outer "Free class time" label while times show (the staff Fill in asks too).
3. **v0.604** — thank-you heading "Thanks, {first name}!", the form's message as normal text under it.
4. **v0.605** — the school's phone, entered in **Settings → Schools** (new optional field), shows on a closed form as a tap-to-call link. Needs **migration 0019** (`0019_school_phone.sql`, number reserved by Main; 0016-0018 belong to other branches). PGlite step 18 tests it in the live order; SETUP §17 has the paste steps. **0019 applied to production 2026-10-19** by Jeffrey (SQL Editor): fingerprints = the PGlite copy (10/10 rows, same hash), security advisor only the expected "security definer executable by authenticated" notice for `settings_update_school_contact`, **ALL 0019 TESTS PASSED** (real admin + desk IDs, rolled back). Re-checks per SETUP 17c step 2: **ALL 0005 TESTS PASSED** and **ALL 0009 TESTS PASSED** on production (2026-10-19). The app version that shows the phone is **not deployed** (needs Jeffrey's OK to push).

Reviews of the differences + 0019 (2026-10-19): security — no High / Medium; three Lows fixed (two history batch ids per save documented; the 0010 undo checklist now says to re-run 0019; the trigger test checks its type). Design review (4 sizes): no High; two Medium fixed (after Next, focus goes to the first child without a pick, and each unpicked child's list is marked with its own message); Lows fixed: a 44px tap area around the call link, the phone hint under the field with the approved wording. Open question for Jeffrey: the approval image put the phone line under the school's name, the build puts it under the address (his written answer). Database tests (PGlite) 424/424.

## Kiosk mode (2026-10-19) — built in preview; Jeffrey tried it and OK'd it (keep the 11 h 45 min end); committed, not pushed, not live

Plan and answers K1–K4: `TKD-Kiosk-Build-Plan.md` (rulebook v0.606–v0.609). No new migration (0009 already has the kiosk token). Inside the dashboard app (K3): Share → "Open kiosk mode on this device" → the dashboard locks on the server and the tablet shows the kiosk (welcome → the public form with autofill off → thank-you 30 s + "Take a photo" + Done → back to Start; 2 minutes idle → "Still there?" → wiped; the corner lock → PIN pad, Cancel back, the right PIN leaves). Ends 11 h 45 min after opening (the token's 12 h minus a 15-minute margin) with a 30-minute staff warning; "End kiosk mode on all tablets" in Share. The Pages Function saves a sign-up whose kiosk token was refused once more as a normal one (72/72 server tests). Security review: no bypass, no High; 2 Medium + 4 Low fixed. Design review: no High; 4 Medium + 4 Low fixed. Tablet setup steps for go-live are in the plan.

## F6 live setup (2026-10-19/20, Jeffrey)

Done: the `forms_registrar` password (only its SCRAM verifier is in the database; the password is in Jeffrey's password manager), Hyperdrive `tkd-forms-registrar` (checked: caching off, verify-full, limit 5), the Production binding `HYPERDRIVE_FORMS` and the Production variable `PUBLIC_FORMS=off`. Nothing deployed. Left for go-live (F7, each with Jeffrey's OK): merge this branch into `main` (Main session) and push = deploy; check the `/f/…` security headers; switch `PUBLIC_FORMS` to `on`; a real test sign-up; the two-connection race test.

