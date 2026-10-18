# Forms — status

Branch `claude/prospect-form-system-cd893d`. Plan: `TKD-Forms-Build-Plan.md` (approved 2026-10-18). Rulebook v0.139 (design) and v0.145 (plan answers). Approved mockup: `TKD-Forms-Mockups.html` rev 1.

**Nothing is live.**
- Migration 0009 has not been applied to Supabase, and nothing has been pushed.
- 0009 can only go live after 0007 (Schedule) and 0008 (Calendar).
- The public page also needs Color Belt phase 2's public path.
- The public forms go live **together with Prospects** (v0.145 answer 1).

| Step | State |
|---|---|
| F0 Plan + questions Q1–Q7 | Done 2026-10-18 (v0.145) |
| F2 Migration 0009 + tests + security review | Done 2026-10-18; PGlite 78/78 |
| F4 Staff screens + Calendar bookings + preview data; design review | Done 2026-10-18 (preview only); 9 differences wait for Jeffrey in F5 |
| F1 Merge main (after Color Belt phase 2 is merged — the Main session merges when Jeffrey asks) | Waiting |
| F3 Public page + Cloudflare function; security review | Waiting for F1 |
| F5 Jeffrey tries it in preview (and decides the F4 differences below) | Next |
| F6 Live setup (0009 after 0007 / 0008; two-connection race test; registrar password; Cloudflare settings) | Waiting |
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

## Decided after F2 (Jeffrey, 2026-10-18, rulebook v0.146)

1. **Signatures:**
   - the picture is deleted 90 days after the free class, or after signing if no class was booked;
   - the sign-up keeps "Signed on" (`signed_at`);
   - this is built in 0009 (`forms_purge_old_signatures`), runs inside the Send, Fill in and signature-read functions, and is tested (11a–c). PGlite 78/78.
2. **Booking settings take effect right away** (already built that way). The screen must say "Changes here go live right away".
3. **Email sender: open.**
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

## Differences from the approved mockup — for Jeffrey to decide in F5

1. Field types are added by **click** (after the chosen field); dragging a type from the palette into the form isn't built. Fields are moved by their grip.
2. **Booking settings have their own Save button** (they go live right away, v0.146); the rest saves as you go.
3. The waiver has **no "Checkbox wording" or "Signature required"** setting: the wording is "I have read and agree to the waiver" and a signature is always needed (the database stores only the waiver text).
4. **QR code and kiosk** are notes until step F3; the link can be copied but works only after F3 (the dialog says so).
5. **Staff:** clicking a row opens a read-only Preview; on a phone, staff reach Fill in through a ⋯ sheet (the mockup says "no ⋯" for staff).
6. The **form name** can also be changed in Form settings.
7. **Switches are checkboxes** (the same control used elsewhere in the app).
8. A **required waiver can be made "Show only if…"** — allowed by the database; confirm that's fine.
9. Fill in shows **"1 spot left" only on the last spot**, like the mockup; "No time yet — we'll call to set one up" is offered as the last choice.
