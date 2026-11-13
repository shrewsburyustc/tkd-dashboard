# Board breaking — go-live checklist (written 2026-11-13)

What is already done and live: migrations **0051** (the section's database) and **0052** (Finance reads Board breaking), applied and
tested on 2026-11-13. What is **not** live and not reachable by anyone: the staff screens (off in the live build), the family page,
the Function and the Square webhooks. **Nothing here happens without Jeffrey's OK for each step. Secrets are typed by Jeffrey in
Cloudflare or Square only: never in chat, git, a file or a screenshot.** Detailed click-by-click: `supabase/SETUP.md`
"Migration 0051", steps 0051f and 0051g. Every step below says who does it.

**Status 2026-11-13: step 1 is DONE** — Jeffrey said "push boardbreaking"; the branch and Domain's `/breaking` lines are live as `main` 297f30fa (Cloudflare success). Checked live by Main: `/breaking/<code>` serves the page (strict policy, noindex), `/api/breaking/<code>` answers `not_open` (switch off), the Square webhook answers 503 `no-store` (not configured). Nothing is on for users. The next step is 2 (logins), when Jeffrey is ready.

## Order (agreed with the Main and Domain sessions, 2026-11-13)

1. **Merge.** Main merges branch `board-breaking` and Domain's `_headers` / `_redirects` batch (the `/breaking` lines) into `main`,
   runs the checks and both builds, and pushes only when Jeffrey says so. After the push Cloudflare deploys; nothing is reachable yet
   (the family page is off until step 7; the staff page is off by its build switch).
2. **Logins (Jeffrey + Claude).** SETUP 0051f: Jeffrey makes the two random passwords on his PC (`brk_registrar`, `brk_square`), saves each in
   his password manager, pastes the two `alter role … password '<verifier>'` lines in the SQL Editor, deletes the snippets. Claude checks
   read-only that each login now has a password and that nothing else changed.
3. **Hyperdrive and bindings (Jeffrey).** SETUP 0051g steps 1–2: two Hyperdrive configurations (`tkd-brk-registrar`, `tkd-brk-square`),
   bindings `HYPERDRIVE_BREAKING` and `HYPERDRIVE_BREAKING_SQUARE`, Production only. Claude first checks the Free plan's connection budget.
4. **Sandbox, one school at a time (Jeffrey).** In that school's Square Developer dashboard: make an application, copy its **sandbox**
   access token and location id; add a webhook subscription for `payment.updated` at exactly
   `https://forms.ustaekwondo.net/api/square/breaking/<school>` (`worcester` or `shrewsbury`; not dashboard., not pages.dev); copy its
   signature key. In Cloudflare (Production variables and secrets) set for that school: `SQUARE_ENVIRONMENT_<SCHOOL>` = `sandbox`,
   `SQUARE_ACCESS_TOKEN_<SCHOOL>` (secret), `SQUARE_LOCATION_ID_<SCHOOL>`, `SQUARE_WEBHOOK_SIGNATURE_KEY_<SCHOOL>` (secret),
   `SQUARE_WEBHOOK_URL_<SCHOOL>` = the exact same address as registered, character for character. Register the webhooks with Square only
   **after** step 1 is pushed (the address must answer).
5. **Shared variables (Jeffrey).** `BREAKING_REGISTRATION` = `off` for now; `TURNSTILE_*`, `CLIENT_KEY_SECRET`, `PUBLIC_ORIGIN` already exist.
   Retry the deployment so variables take effect.
5b. **Staff page on (Jeffrey says go).** Build switch `VITE_BOARD_BREAKING` = `on` in Cloudflare (Production) and redeploy (as for Star): Board
   breaking appears inside Testing for staff. It is needed now because the test event is made there. It is safe: with
   `BREAKING_REGISTRATION` = `off` no family can reach anything.
6. **Sandbox test (Jeffrey + Claude).** Make a test event in Testing → Board breaking (mark it clearly as a test and delete it afterwards;
   an event with payments can't be deleted, so make the test payments only on this event and keep it), then turn
   `BREAKING_REGISTRATION` = `on`, make a test registration through the family page, pay with Square's sandbox test card, and check: the roster marks
   that student paid at that school only; Finance's Daily report shows one "Board breaking" card payment recorded by "Square" at that
   school; a payment for the other school's student cannot be marked by this school's webhook. Then repeat for the other school. Switch
   `BREAKING_REGISTRATION` back to `off` between tests.
7. **Remove the sandbox hosts (Claude, tiny migration; number through Main; Jeffrey pastes it).** Only after both schools pass:
   `brk_public_set_link` stops accepting Square's sandbox hosts, so a school left on sandbox can never hand families a checkout that takes
   no money.
8. **Production, one school at a time (Jeffrey).** That school's **production** token, location id, signature key (a new production webhook
   subscription at the same address) and `SQUARE_ENVIRONMENT_<SCHOOL>` = `production`. Make one real $1-sized registration and refund it
   in Square, check it appears once in Finance, then do the other school.
9. **Clean up the test — the same day.** Sandbox money is not real, but the dashboard records a sandbox payment like any card payment: it
   would appear in that school's Daily report and in Close the day's expected card total. So the same day, an **admin presses Undo payment**
   on every test payment (a Square payment has no staff login, so only an admin can undo it): the payment then counts as nothing and stays
   visible in History as undone. Do the sandbox test on a day that is **not** already closed, and close the day only after the undo.
   Keep the test event named "TEST – ignore" (an event with payments can't be deleted, on purpose).
10. **Open registration.** `BREAKING_REGISTRATION` = `on`; hand out the event's QR code / link from the roster's "Registration link".
    The old Netlify page and Google Sheet keep running until the first real event on the new system has gone well; then retire the old link.

## Things to know

- Until step 9 staff see nothing new; until step 10 families can reach nothing. A school whose Square set is incomplete tells its card
  families "pay at the front desk" and nothing else breaks.
- A payment on an **old** Square link (after a staff edit changed the amount) is never marked paid; it shows to admins under "Square
  payments need a look" with the student's name (refund it in Square or take it as that student's payment).
- Someone paying at the desk by card marks it in the roster (Mark paid → Card); it keeps the cash price unless an admin overrides it.
- If something goes wrong: set `BREAKING_REGISTRATION` = `off`. That closes the family page at once; nothing already recorded is lost.
