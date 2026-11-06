# Forms — status

**Design review changes (N1–N17):** see `STATUS-DesignReview.md`.

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

## Deployed 2026-10-20

This branch is on `main` and live (the push included `0ccf776`; live `main` = `cc8b095`). Checked on https://tkd-dashboard.pages.dev: `/f/…` and `/forms` have the strict security policy, the dashboard keeps its own, and `GET /api/forms/<slug>` answers `not_open` (PUBLIC_FORMS=off). Next: Jeffrey looks at the new sections signed in; then PUBLIC_FORMS=on + redeploy, one real test sign-up, the two-connection race test.

## Go-live test 2026-10-20: every sign-up refused → fixed in `58e9d0f` (waiting for deploy)

Jeffrey made a test form ("Test - Delete Me", `/f/test-delete-me`, Live), set `PUBLIC_FORMS=on`, and a test sign-up from his phone said "Some answers were refused" twice (two `invalid` rows in forms_public_attempts; nothing saved). Cause: `functions/_lib/forms/db.js` sent `JSON.stringify(value)::jsonb`; Postgres.js encodes jsonb parameters itself, so the answers arrived as one quoted string (proved with the driver's own encoder and the live database: old payload = `string`, new = `object`). Fix: `sql.json(value)`. Never caught before because the preview and the server tests use a fake database (this was the open item "db.js against real Postgres"). Next: Main fast-forwards and pushes; then the test sign-up again.

## Go-live test passed (2026-10-20/21)

After the `db.js` fix went live (in `main`), Jeffrey's test sign-ups on `/f/test-delete-me` were saved (two `ok` attempts), and an admin then deleted the two test prospects in the dashboard (family history removed with them; two counts-only rows in change_log, as 0015 intends). **Rate limiting (2026-10-21, rulebook v0.410, Color Belt branch):** no `RATE_LIMITER` binding — Pages Functions can't have one — so it is not a go-live step; protection = memory counter, Turnstile, `forms_registrar` limits, `PUBLIC_FORMS`; WAF rule once the school has its own domain. Still open: the two-connection race test (two phones taking the last spot at the same moment); the real (non-test) form with the school's waiver wording; Shrewsbury's schedule.

**2026-10-21 (Jeffrey):** the remaining tests (the two-connection race test, the kiosk on the real tablet) are done as the system is used; no separate test session. Building for this branch is finished.


## Copy to the other school (Jeffrey, 2026-11-05)

Jeffrey asked for a Worcester copy of Shrewsbury's live "Visitor Information" form, "copy it exactly". The app can't copy a form to the other school: Duplicate (`forms_duplicate`, 0031) stays in the form's own school, and New form starts from a template.
- He picked **B: a "Copy to the other school" item in the form's ⋯ menu**. The rejected options were A (I build the copy in the browser pane after he signs in) and C (he rebuilds it by hand).
- **Mockup (two pictures, 2026-11-05):**
  - `CopyToSchool-1-menu.png`: "Copy to Worcester" (or "Copy to Shrewsbury") right after Duplicate, with the location pin, admins only. Drawn on the four sizes.
  - `CopyToSchool-2-after.png`: one question for Jeffrey. A (recommended): stay in the list with the 5-second toast "Copied to Worcester as a Draft" and Undo. B: open the copy in the builder.
- **Defaults told to him with it:**
  - The copy is a Draft at the other school, made from the form's draft.
  - It has the same questions, waiver and settings, and the same name ("Copy of …" only if that school already has a form with that name).
  - Its link is `<link>-worcester`, which can be changed.
  - Booking times aren't copied (they are the other school's classes). A booking form's toast says "… Pick its class times before you publish."
  - Undo deletes the copy for 5 seconds.
- **Needs a migration:** a new function `forms_copy_to_school(form, school)`. New name, so the live Duplicate keeps working. The number comes from Main once the design is OK'd. Then a security review, and Jeffrey pastes it.
- **Found on the way (read-only, live):**
  - Shrewsbury's Visitor Information asks "Address" as a Short text, so the profile says "Not asked on this form" and families get one box.
  - The fix is his, in the builder: swap it for an Address question and publish, ideally before copying.
- Pass 1's step 1 (trash icon) is built and reviewed but waits for his OK to commit. Steps 2–7 wait until this is done.
- **Jeffrey: "A: stay in the list"** (2026-11-05). Rulebook **v0.642** written (10b row, changelog line and header; CRLF kept). One flag, told to him once: the copy keeps the alert email too. No form has one set today (checked read-only); if one is set later, change it on the copy.
- **App built** (uncommitted):
  - `src/screens/Forms.jsx`: the ⋯ item after Duplicate (`IconMapPin`) and `copyToOtherSchool`. The toast's Undo deletes the copy. A failed copy or Undo shows the bar with Retry; the bar can now take a `retry`.
  - `src/screens/forms/text.js`: `copyTo`, `copiedTo`, `SAVE_FAILED`, `UNDO_FAILED`.
  - `src/lib/forms/api.js`: `copyFormToSchool`.
  - `src/lib/mockForms.js`: the preview's `forms_copy_to_school`, with the same rules.
  - `src/lib/forms/checks.mjs`: a new group, now 13 groups, passing.
- **Tried in the preview:** the toast for the booking form, the copy in the other list, Undo then "Undone", a failed copy and a failed Undo each with Retry, and "Copy of …" on a second copy. Both builds and every check pass.
- **Database: migration 0042** (Main reserved it 2026-11-05, main 2aaa385, merged in here).
  - The package is being built from the draft SQL: `0042_forms_copy_to_school.sql`, its pre-apply check, fingerprints, tests and undo file.
  - Also SETUP "Migration 0042" and run.mjs `step0042`.
  - **Built** (helper agent, from the draft SQL): the migration, `0042_preapply_check.sql`, `0042_fingerprints.sql`, `0042_tests.sql`, `supabase/manual/0042u_undo.sql`, SETUP "Migration 0042" (0042a–e) and run.mjs `step0042`.
  - **Test runs:** `--only-step0042` 92 passed. The full `run.mjs` gave 2235 passed and 4 failed; all four are Black Belt timing checks run while other sessions loaded the PC, not 0042's, and are to re-run when the PC is idle.
  - **Mutation test:** the function was broken 10 ways and the tests caught every one.
  - **Fingerprint:** `forms_copy_to_school … 72c5c12845b75462313c8364237a403b … definer=true settings=search_path="" … rights=authenticated:EXECUTE,postgres:EXECUTE`. `0009_fingerprints.sql` gains its two lines.
- **Security review:** clear, no must-fix. Its should-fix (the wording about 0040, which is this branch's) is fixed. Its notes:
  - the copied alert email (a question for Jeffrey);
  - the waiver and thank-you words may name the original school (told to him);
  - the security advisor note added to SETUP 0042c;
  - SETUP's "can't be mixed up" was too strong and is reworded.
- **Code review:** no must-fix. Its should-fix items are fixed: each bar says what it belongs to (`kind` plus the form or copy, Camps' pattern); no Retry for `invalid` / `duplicate_slug` (new words `COPY_REFUSED` / `copyTooMany`); comments. The checks gained edge cases. Re-checked in the preview; **re-review clear**. Its last note: the two new bar messages need Jeffrey's OK and a rulebook entry before the commit, so they were added to the "three small changes" question.
- **Also fixed:** SETUP's 0036 section now says "applied 2026-11-04".
- **Design review (app, four sizes):** no must-fix. The menu, the copy, both toasts, both failure bars with Retry, and the staff view match v0.642 and the mockups. Its findings:
  - **Undo pressed during another save is dropped silently:** added to R2-05, which waits on Dashboard core, like Close / Open's.
  - **The link can name the wrong school** (`walk-in-shrewsbury` → `walk-in-shrewsbury-worcester`), and long links get cut mid-word: a question for Jeffrey, because it changes v0.642's link rule.
  - **Copy and its Undo cleared a bar already showing:** fixed, because a bar stays until its Retry works or × is pressed (v1.004). Re-checked in the preview.
  - **For screen readers on Both, two same-named rows sound the same** ("More actions for Walk-in"): the next small question.
  - **Shared, passed to Main for Dashboard core:** focus after a menu choice; focus under the toast (R2-04); the toast's padding at 320.
- **Jeffrey: "OK, all five"** (2026-11-05). Rulebook **v0.644** written, with a "(See v0.644 …)" note on v0.642. The five:
  - the link swaps a trailing own-school name for the other school's and is cut at a dash, never in a word;
  - the copy has no alert email;
  - on Both, the row buttons name the school ("More actions for Walk-in, Worcester");
  - and the two refusal messages without Retry, as built.
- **Built:**
  - the SQL (`v_base` / `v_cut`; `jsonb_set` for `alert_email`) and the preview stand-in;
  - `FormsList.jsx` `rowName` and the RowMenu label; `T.withSchool`;
  - checks: the al-hamra case, the swap, an "odd" link, the alert email; `0042_tests.sql`: K2, K2b, L7, L8.
- **Checksum:** `72c5c12845b75462313c8364237a403b`, in `run.mjs`, the pre-apply check and SETUP 0042c. SETUP's 0042 text is updated.
- **Checks:** `--only-step0042` 93 passed; Forms checks 13 groups; both builds; 174 function tests.
- **In the preview:** the Both names carry the school; `walk-in-shrewsbury` → `walk-in-worcester`; the copy's alert email is null; Undo works.
- **Security re-check: clear.** It also fixed a wording slip: SETUP and the run.mjs header now say 0038 / 0040 join step0042's list when their files exist, and the order includes 0041.
- **Code re-check: clear** after one fix: on PC / tablet the row's open button on Both is named "Open Walk-in, Worcester" too (it had only its visible name).
- **Next:** Jeffrey's OK to commit; tell Main that 0042's contents changed (the CLAUDE.md row); then the 0042 steps (SETUP 0042a–d), and Main merges and pushes after 0042 is live.
- **Committed 7ddf439** (2026-11-05, Jeffrey: "Yes, commit"; on main bcd8ab9). Main has been told 0042's contents changed (for its CLAUDE.md row), and that the app is NOT merge-ready until 0042 is live (SETUP 0042a–d).
- **0042a done 2026-11-05** (Jeffrey: "Yes, start 0042"; read-only through the connector):
  - the pre-apply check answers 0 / false / true / 2 (ready);
  - 0009's fingerprints before: 196 lines, md5 `b049ef4eb998e77c5dbe7f0c438e69dc`, no forms_copy_to_school line;
  - the security advisor before: 3 kinds, 255 findings (rls_enabled_no_policy 29 INFO, authenticated_security_definer_function_executable 225 WARN, auth_leaked_password_protection 1 WARN), none naming forms_copy_to_school.
- **0042b done 2026-11-05:** Jeffrey pasted the migration in the SQL Editor ("pass").
- **0042c done 2026-11-05** (read-only through the connector) — **0042 is live**:
  - the pre-apply check answers 1 / true / true / 2;
  - `0042_fingerprints.sql`: the one line equals the PGlite line (`72c5c128…`, definer, search_path "", owner postgres, EXECUTE for authenticated and postgres only);
  - 0009's fingerprints: 198 lines = the 196 from before (md5 `b049ef4e…` unchanged) plus exactly the two new `forms_copy_to_school` lines;
  - the security advisor: 256 findings = the 255 from before plus one `authenticated_security_definer_function_executable` for `forms_copy_to_school` (expected: the app calls it, like the other `forms_*` functions); nothing went away.
- **SETUP 0042 fixed:** its order text said Star's 0038 is live. It isn't (read-only check 2026-11-05: no `star_undo_event_edit`, no new Star payment columns); only 0041 is. run.mjs's order was already right.
- **Next:** 0042d (Jeffrey at a computer: `0042_tests.sql` with his UIDs, then the 0009, 0031 and 0036 tests); Main may merge this branch and push once Jeffrey OKs that push.
