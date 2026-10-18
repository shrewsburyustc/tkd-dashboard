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
| F4 Staff screens + Calendar bookings + preview data; design review | Next |
| F1 Merge main (after Color Belt phase 2 is merged — the Main session merges when Jeffrey asks) | Waiting |
| F3 Public page + Cloudflare function; security review | Waiting for F1 |
| F5 Jeffrey tries it in preview | Waiting |
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

## Open points for Jeffrey (later, one at a time)

1. **How long signatures are kept.** Color Belt deletes them 90 days after testing. Forms currently keeps them with the sign-up. The 2-year clean-up comes with Prospects (step 4), and it must also remove the history copies.
2. **Booking settings take effect straight away** on a Live form, without Publish (spot limits and which classes). The field list still needs Publish.
3. **The email service** (v0.145 answer 2) is chosen before F3.
