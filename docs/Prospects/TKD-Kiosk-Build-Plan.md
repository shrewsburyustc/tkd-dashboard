# Kiosk mode — build plan (draft, for Jeffrey's OK)

Branch `claude/prospect-form-system-cd893d`. Part of Forms step 3 (status: `STATUS-Forms.md`).
Approved design: `TKD-Forms-Mockups.html` screen 9 (rulebook v0.235) and the build-plan answer
Q3 (v0.241 answer 3). Nothing here is built yet.

## What is already done (live since 0009)

- `forms_kiosk_token(form)` — staff or admins, Live forms only: a random 12-hour token for ONE
  form. Only its SHA-256 is stored; at most 5 per form.
- `forms_kiosk_revoke(form)` — ends kiosk mode on every tablet of that form (lost tablet).
- The public sign-up function accepts the token: a kiosk may send **120 sign-ups an hour**
  (instead of 20 — a desk tablet shares the school's wifi), and the sign-up is logged as
  **"Kiosk"** in the history and Prospects.
- **No new migration is needed** for anything below.

## What kiosk mode will do (screen 9 + v0.241)

1. **Opening it** — Share → "Open kiosk mode on this device" (Live forms only):
   - a short confirm dialog: what happens, "turn on Guided Access (iPad) or screen pinning
     (Android) so nobody can leave the page", and an **amber warning** when the signed-in account
     is not the shared front-desk account (v0.241);
   - the app asks the database for a kiosk token, keeps it **on this tablet only**, **locks the
     dashboard** (the same server lock as Lock now) and opens the form full screen.
2. **Between families: a welcome screen** — school logo and name, "Welcome to U.S. Taekwondo
   Center", "New here? Tell us about your family.", one big **Start**.
3. **The form** — the same public page (steps, children, times, waiver, signature), with kiosk
   rules:
   - the browser's **autofill is turned off** (otherwise the next family would be offered the
     previous parent's name, phone and email — the records are about minors);
   - no "Add to calendar" and no "save this page" wording (it's a shared tablet).
4. **After Submit: the thank-you** with the booked time in large text, "Take a photo of this
   screen with your phone, or write the time down.", a **Done** button and a 30-second countdown;
   Done or the countdown goes back to Start (**K1 → B**, Jeffrey 2026-10-19).
5. **Idle:** 2 minutes without a tap mid-form → everything typed, the picked times and the
   signature are wiped and it goes back to Start (a 15-second "Still there?" first).
6. **Leaving (K2 → A, Jeffrey 2026-10-19):** the small lock in the corner (`ti-lock`) opens
   **mockup 9's PIN pad on the kiosk screen** ("Staff PIN to leave kiosk mode", Cancel goes back
   to the form). The PIN is the one of the account signed in on that tablet, checked by the
   dashboard's real PIN check (5 wrong PINs → password, as always). After the PIN, the dashboard
   is back and the tablet forgets its kiosk token. It runs **inside the dashboard app** (K3 → A).
7. **When kiosk mode ends (K4 → A, Jeffrey 2026-10-19):** the token lasts 12 hours from opening; the
   tablet stops new sign-ups 15 minutes before that (security review M2), so staff see an end time
   11 h 45 min after opening.
   For the last 30 minutes the welcome screen shows staff an amber line "Staff: kiosk mode ends at
   {time}. Unlock and open it again from Share." After 12 hours: "Please ask at the front desk to
   sign up.", Start greyed out, and the staff line "kiosk mode has ended — tap the lock, enter your
   PIN, then open it again from Share". If "End kiosk mode on all tablets" is used mid-day, a family
   already filling in is never lost: the server saves it as a normal sign-up and the tablet then
   shows the ended screen. No database change needed.
8. **Share dialog** also gets **"End kiosk mode on all tablets"** (staff and admins; the
   database function exists) for a lost or stolen tablet.

## Steps

| Step | What | Gate |
|---|---|---|
| S1 | This plan + questions K1–K4, one at a time, each with a picture | Jeffrey's answers |
| S2 | Build in **preview** (fake database): Share → open / end, the kiosk screens, lock-screen "Back to kiosk", the server's expired-token retry + tests | — |
| S3 | **Security review** (token kept on the tablet, autofill, wiping, lock bypass, the retry) and **design review** (1280×800, 820×1180 touch — the main size for a kiosk, 390×844 touch, 320) | fixes done |
| S4 | Jeffrey tries it in preview (on the tablet if possible: same Wi-Fi, the preview address) | Jeffrey's OK → commit (no push) |
| S5 | Goes live **with the public forms** (F6/F7: registrar password, Cloudflare settings) | separate OK |

## Files (expected)

- `src/screens/forms/ShareDialog.jsx`, `src/screens/forms/text.js` — open / end kiosk.
- `src/screens/kiosk/` (new) — the kiosk inside the dashboard app (K3 → A): welcome, the form (reusing
  `src/forms/` parts and its server calls), thank-you, idle wipe, mockup 9's PIN pad (the real
  `verify_pin`). Loaded only when kiosk opens. `src/App.jsx` (**shared file**) gets the `#kiosk`
  route. The public page `/f/…` is not changed.
- `functions/_lib/forms/forms.js` + `functions/tests/forms.test.mjs` — the expired-token retry.
- Preview fakes: `src/lib/mockForms.js`, `src/forms/publicApi.preview.js`.
- Rulebook rows from this branch's block (next **0.606**), status file.

## Question K1 (first) — the kiosk thank-you

Emails are off (v0.601) and a shared tablet can't keep "this page", so on a kiosk the thank-you
screen is the only confirmation a walk-in family sees. See `Kiosk-K1-thanks.png`.

**Answer (Jeffrey, 2026-10-19): B** — 30 seconds, "Take a photo of this screen", and a Done button.

**K2 (Jeffrey, 2026-10-19): A** — a PIN pad on the kiosk screen, as in mockup 9 (not the dashboard's lock screen).

## Question K3 — where the kiosk runs

See `Kiosk-K3-where.png`.

**K3 (Jeffrey, 2026-10-19): A** — the kiosk runs inside the dashboard app (`…/#kiosk`, dashboard locked on the server); the public page stays untouched (no sign-in code).

## Question K4 — when the kiosk token ends

See `Kiosk-K4-ended.png`.

**K4 (Jeffrey, 2026-10-19): A** — after 12 hours "Please ask at the front desk to sign up" (Start greyed out), with a 30-minute staff warning before.

## Built (S2, 2026-10-19, preview only) — S4: Jeffrey tried it and OK'd it, 11 h 45 min end kept; committed (no push)

- `src/lib/kiosk.js`, `src/screens/kiosk/KioskApp.jsx`, `KioskLoadGuard.jsx`, `src/styles/kiosk.css`;
  the public form's own screens with a `kiosk` prop (`src/forms/FormsApp.jsx`, `ThankYou.jsx`);
  the PIN pad = `src/screens/LockScreen.jsx` in a kiosk look; Share → open / end
  (`src/screens/forms/ShareDialog.jsx`); `src/App.jsx` shows the kiosk while locked.
- Server: a refused kiosk token → one more try as a normal sign-up, answered with `kiosk_ended`
  (`functions/_lib/forms/forms.js`; 72/72 server tests).
- Checked in preview: open, welcome, form (autofill off), thank-you (30 s + Done), PIN pad (Cancel
  keeps the form; the right PIN leaves and reloads), the 30-minute warning, the end, "End kiosk mode
  on all tablets" mid-form (the family is still signed up, as a normal sign-up), the 2-minute idle
  wipe ("Still there?" → empty form for the next family).

## Security review (S3, 2026-10-19)

No lock bypass, no High. Fixed: **M1** the idle wipe now also runs while the PIN pad is open (a
family that tapped the lock and walked away can't leave their answers behind); **M2** the tablet
stops new sign-ups 15 minutes before the token ends, and a refused fall-back now also shows the
ended screen; **L1** opening kiosk mode reloads the page, so nothing of the dashboard stays in memory;
**L2** a "Reload" message if the kiosk's file can't load; **L3** the thank-you countdown pauses while
the PIN pad is open; **L4** spell-check and word suggestions off as well. Accepted / noted: a
temporary database conflict can end the kiosk early (L5, rare; a database status for "kiosk token
refused" would fix it — a future migration); 5 wrong PINs sign the tablet out (L6, the normal rule);
Cloudflare's Turnstile script now also runs inside the dashboard (only on the kiosk).

## Setting up the tablet (at go-live)

1. Sign in with the **shared front-desk account**; its PIN is the one that ends kiosk mode.
2. Turn on **Guided Access** (iPad: Settings → Accessibility) or **screen pinning** (Android).
3. Turn off the browser's **saved addresses / autofill** and the keyboard's **predictive text** —
   the page asks for them to be off, but browsers don't always listen.
4. Forms → Share → "Open kiosk mode on this device", once a day (it ends after 11 h 45 min).
