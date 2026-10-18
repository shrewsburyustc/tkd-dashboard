# Forms — build plan (approved 2026-10-18)

Branch `claude/prospect-form-system-cd893d` · 2026-10-18 · implements the Forms decisions (rulebook v0.139, the "Forms" row) and the free-class part of the Calendar (v0.138: "bookings appear once Forms is built") · approved mockup `docs/Prospects/TKD-Forms-Mockups.html` rev 1 (all 12 details) · builds on Schedule (0007), Calendar (0008) and the public registration path of Color Belt phase 2 (0005, `CONTRACT-0005.md`) · **nothing is built until Jeffrey says OK.**

## 0. What gets built

A new **Forms** section (rail icon `ti-clipboard-text`, after Calendar, address `#forms`). Admins build forms in the app, and families fill them in on a public page.

**Staff side:**
- **Forms list:** status tag (Draft / Live / Closed), sign-ups this month, type, Share, and `⋯` with Fill in for a family, Duplicate, Close and Delete. Each form belongs to one school.
- **New form** from a template: Free class (social media), Walk-in, Event, or Blank.
- **Builder:**
  - PC: three panels.
  - Tablet: "+ Add field" plus the settings panel.
  - Phone: a field list with full-screen editing and `⋯` Move up / down.
  - It saves as you go, and **Publish** makes the changes public.
  - Field types: short text, long text, phone, email, number, date, choice, checkboxes, dropdown, heading, step divider, Children block, waiver with signature, and **Book a class**.
  - Every form keeps parent name, phone, email and a Children block (relabel, not remove — `ti-lock`).
  - Any field can have **"Show only if"** one answer.
- **Book a class field:** any classes from the Schedule (none pre-chosen), a spot limit for each time (default 3, see **Q5**), "Show the next N days" (default 14, 1–60) and "Book at least N hours ahead" (default 3, 0–72). Times added to the Schedule later get the default limit. **Each child picks a time** (mockup step 2).
- **Share:** link `…/f/<editable-name>`, QR code (download, or print a sign) and kiosk. A Draft can't be shared. Changing a Live form's name warns that printed QR codes will stop working.
- **Staff** (not admins): preview, Share and **Fill in** for a family ("Entered by …"). No building.

**Family side (public, no login):**
- The school logo header, short steps with a progress bar, errors shown as they type, and Turnstile.
- Free-class times come from the Schedule. Times that are full, closed (Calendar), cancelled or too soon are **hidden**, and the last spots show "1 spot left".
- If no time is left: "No free-class times are open right now…", and the family can still send.
- A booking takes the spot at once.
- A thank-you screen with the form's own message (`{parent}`, `{class time}`) and "Add to calendar".
- Emails: see **Q2**.

**Kiosk:** see **Q3**.

**Calendar (v0.138):** free-class bookings now show in the Calendar:
- written out in the day box ("2 free classes");
- listed in the day panel (child's first name, time, class);
- a `ti-user-plus` count badge on the class in Week view.

**Not in this step:** the Prospects list, statuses, follow-ups, deleting after 2 years, and the dashboard badge (step 4). Sign-ups are **stored** from day one; see **Q1** for when forms go live.

## 1. Order, dependencies, numbers

- **Migration number: `0009`.** Checked 2026-10-18 on main, color-belt, star-testing and every worktree. 0005 is Color Belt phase 2 (built on its branch, not merged). 0006 is only **reserved** for Star testing — no file exists yet. 0007 is Schedule and 0008 is Calendar; nothing claims 0009.
- **What can start now:** F2 (migration 0009 needs only 0001–0004, 0007, 0008) and F4 (the staff screens, with the preview database).
- **What waits:** F3 (the public path) waits until Color Belt phase 2 is merged into main and this branch has merged main. The **Main session** does that merge when Jeffrey asks for it.
- **Going live:** in order 0007 → 0008 → 0009. 0009 doesn't need 0006. The public path needs Color Belt's server pieces to be live first.
- **Server pieces (corrected after review):** Color Belt's `functions/_lib` is written for its own route:
  - `db.js` uses `env.HYPERDRIVE` and the testing SQL;
  - `register.js` uses `PUBLIC_REGISTRATION` and its own statuses.

  A Hyperdrive config belongs to **one** database login, so Forms needs its own. The plan:
  - **copy** the generic helpers (Origin, size, honeypot, speed, Turnstile, client key) into `functions/_lib/forms/*`, or — only if the Color Belt session agrees — move them into a shared module both use. Color Belt's files are never changed without that agreement;
  - new Cloudflare settings: Hyperdrive config + binding `HYPERDRIVE_FORMS` (login `forms_registrar`, caching off, connection limit ≤ the role's), kill switch `PUBLIC_FORMS`, Turnstile action `form`, the `RATE_LIMITER` binding;
  - `public/_redirects` (`/f/* /f 200`), a strict CSP block for `/f` in `public/_headers`, and a Vite dev rewrite for `/f/*`. `_routes.json` already covers `/api/*`.

## 2. Database — migration `0009_forms.sql`

### 2a. Tables

| Table | Holds |
|---|---|
| `forms` | One row per form: `location_code`, `name`, `slug` (unique; lowercase a-z, 0-9 and dashes; 3–40 characters; some names reserved, e.g. `api`, `admin`), `kind`, `status` (draft / live / closed), `draft` (field list jsonb), `published` (field list jsonb), `published_version` (goes up with each Publish), `settings` (thank-you text, school alert address, confirmation email and Add to calendar on/off), bookkeeping. |
| `form_booking_offers` | (form, class): `default_limit` (1–20), `days_ahead` (1–60), `min_hours_ahead` (0–72). |
| `form_booking_limits` | (form, class, weekday, start time) → a limit that differs from the default. |
| `form_submissions` | **Never changed after saving:** `form_id`, `location_code`, `published_version`, **a copy of the published field list** (so old answers stay readable after edits), `answers` (jsonb), parent name / phone / email (also as columns), `children` (jsonb, 1–6 children, first name 1–40 characters, age 2–99), the signature (0005's rule: `data:image/png;base64,` plus base64 only, ≤ 70 000 characters) and the waiver text version, `entered_by` (staff name or null), `source` (`public` / `kiosk` / `staff` — set by the database, never taken from the page as `staff`), `submission_key`, `created_at`. |
| `class_bookings` | One row per child's free class: `submission_id`, `form_id`, `location_code`, `class_id`, `date`, `starts_at`, `ends_at`, `child_index`, `status` (booked / cancelled — see **Q6**). |
| `class_booking_slots` | One row per (school, class, date, start time) that has ever been booked. It is the thing that gets **locked**: created with `insert … on conflict do nothing`, then `select … for update`. That serializes two families racing for the last spot. |
| `forms_public_attempts` | The rate-limit log: hashed client key (never an IP), form, time, outcome. Removed after 2 days. Not in history. |

**Safety:**
- RLS on every table; column `select` grants only; nothing to `anon`; `service_role` revoked; bookkeeping, `change_log` and truncate guards (as 0003 / 0007 / 0008).
- **The signature column is not granted to anyone.** Staff see it only through a single-record function, `forms_submission_signature(id)` (admins and staff with data access; logged).
- History (`change_log`) of submissions stores the signature as "on file" (tested: no `data:image` in `change_log`).

**Field list rules** (`forms_fields_are_valid`):
- known types and unique ids;
- labels 1–120 characters with no hidden characters;
- at most 60 fields and 30 options per field;
- show-if may only point at an earlier choice field;
- every locked field present;
- at most one Book a class field;
- total size at most 50 KB.

### 2b. Staff functions (authenticated)

- **Admin:**
  - `forms_create`, `forms_save_draft` (version check), `forms_publish`, `forms_set_status`, `forms_duplicate`, `forms_set_booking`;
  - `forms_delete` — **only for a form with no sign-ups**; otherwise Close it. This is the default from review, so it isn't asked.
- **Staff and admin:**
  - `forms_staff_submit` — the same checks as the public submit, no Turnstile, "Entered by" from the session;
  - `forms_open_times(form_id, from, to)`;
  - `forms_bookings_between(location_code | null, from, to)` → child first name, time, class, form, status (minimal columns, for the Calendar);
  - `forms_submission_signature(id)`.

### 2c. Public functions (login `forms_registrar` only)

- **`forms_public_get(slug)`** returns a **fixed, short list:**
  - the published fields and version;
  - the school name and phone (from Settings → Schools in 0005, adding a `phone` column there if 0005 doesn't have one — agreed with the Color Belt session);
  - the thank-you text and the on/off toggles;
  - the open times with the spots left.

  It never returns the school's alert email or anything staff-only. A Draft or unknown form → `not_found`; Closed → `closed`.
- **`forms_public_submit(slug, client_key, submission_key, published_version, answers, bookings[], signature, kiosk_token)`**, in order:
  1. **Rate limit** (the attempt is written in its own block, so it stays even when the submit is refused):
     - 20 per hour per client key, as Color Belt does;
     - a per-form flood is only logged;
     - a valid **kiosk token** (see Q3) raises the limit to 120 per hour, because a kiosk or school wifi shares one connection.
  2. The form is Live → `not_found` / `closed`.
  3. `published_version` still matches → otherwise `form_changed` (the page reloads the form and keeps what was typed where it can).
  4. **Answers vs. the published list:**
     - unknown keys are refused, and so are answers to fields hidden by show-if;
     - types, required fields, lengths and choices from the options only;
     - total answers ≤ 20 KB → otherwise `invalid`.
  5. **Bookings:** at most one per child. The slots are locked in a fixed sorted order (no deadlock) and each is re-counted. Any slot that's full, closed, cancelled or too soon → `time_taken` with fresh times.
  6. Save the submission and its bookings in one transaction. `submission_key` is unique **per form**:
     - a repeat returns the first answer;
     - a key used by another form → `invalid`;
     - the unique-index race is caught.
  7. Log it as "Family form" (or "Kiosk").
- **`forms_public_email_result(submission_key, which, ok)`:** only if emails are on (Q2), so the Function can record a failed email for staff to see.
- **`forms_registrar`:** `login noinherit`, connection limit 5, member of nothing, no table rights, execute on exactly these functions. The password is never in the file; it's set at F6 and kept only as a Cloudflare secret. The same proofs as `testing_registrar`.

**Open times:** for each day in the window, use the school's Schedule in effect (0007) and the offered classes' slots. Then remove:
- whole-day and "some classes" closures (0008), matched exactly like `days.js` `recordMatches` (same day, times, classes in order);
- times sooner than "hours ahead";
- full times.

All dates and times are Massachusetts time, including the days the clocks change.

## 3. Public path (Cloudflare) and preview stand-in

- **Page:** `/f/<slug>` is a separate small page (`forms.html` plus `src/forms/**`). It has no dashboard code and no Supabase key, and its look follows v0.106 (44px buttons and 16px fields on phones).
- **Function:** `functions/api/forms/[slug].js`.
  - `GET` → `forms_public_get`.
  - `POST` → kill switch, Origin, JSON only, body ≤ 100 KB, honeypot, too-fast, Turnstile → `forms_public_submit`.
  - Missing settings fail closed. Statuses are mapped to messages, and no database error text reaches the page.
- **Add to calendar:** a `.ics` file made in the browser.
- **Preview stand-in:** in preview mode the page uses `src/forms/publicApi.preview.js` (`getForm(slug)`, `submit(payload)`), sharing the staff preview's fake data. Turnstile isn't loaded. Console helpers: `setPublicForms(on/off)`, `forceTimeTaken()`, `forceRateLimited()`, `forceFormChanged()`. A check confirms the real `dist/` bundle contains no preview code.

## 4. Front end (staff side + Calendar)

- **New files:**
  - `src/screens/Forms.jsx`;
  - in `src/screens/forms/`: `FormsList`, `NewFormDialog`, `Builder`, `FieldPalette`, `FieldEditor`, `BookingSettings`, `ShowIfEditor`, `WaiverEditor`, `FormSettings`, `ShareDialog` (QR via `qrcode-generator`, approved in 0005), `FillInDialog`, `FormPreview`, `text.js`;
  - in `src/lib/forms/`: `api.js`, `fields.js` (the field rules shared by the builder, the public page, the preview database and the checks), `templates.js`, `openTimes.js`, `useForms.js`, `checks.mjs`;
  - `src/lib/mockForms.js`;
  - `src/styles/forms.css`.
- **Calendar changes:**
  - `useCalendar` also loads `forms_bookings_between`;
  - `days.js` adds bookings to each day;
  - MonthGrid gets the "N free classes" chip (`ti-user-plus`, white outlined);
  - DayPanel gets a Free classes list;
  - WeekView gets the count badge.
- **Shared files touched:** `navItems.js` and the bottom bar (see **Q7**), `pageAddress.js`, `App.jsx`, `main.jsx`, `mockClient.js`, `vite.config.js`, `public/_headers`, `public/_redirects`, the rulebook and both READMEs.

## 5. Tests and checks

- **`0009_tests.sql`:**
  - every shut-out session type and anon are refused; staff can't build but can fill in;
  - build, publish, status, delete-only-when-empty, and `stale`;
  - field-list rules;
  - answer checks (each type, unknown keys, hidden fields, choices, lengths, sizes, children 1–6, ages);
  - `form_changed`;
  - signature format and size; the signature column isn't readable; `change_log` never contains `data:image`;
  - bookings: the window, hours ahead, closures (including a "some classes" closure on a **combined** slot), a cancelled class, a window that crosses a planned schedule's start date, a day the clocks change, the limit, one booking per child, sorted locking;
  - idempotency per form;
  - rate limit, the kiosk token, and the flood check only logged;
  - registrar catalog proofs; catalog checks.
- **The race for the last spot:** PGlite has one connection, so the test proves the slot row is locked `for update`. A **real two-connection test** runs at F6 on a scratch Supabase branch (read/write there only, never on production).
- **PGlite** runs 0009 after 0007 and 0008 (0005 / 0006 when they exist), twice, with fingerprints and the upgrade path.
- **`functions/tests/forms.mjs`:**
  - every refusal and status, missing settings failing closed, the `/f` CSP header;
  - the kiosk token can't be forged or reused on another form.
- **`src/lib/forms/checks.mjs`:**
  - field rules, templates, open-times maths (the same answers as the SQL on shared cases), the preview database.
- Also: the Calendar, Schedule and Testing checks and both builds.
- **Reviews:** an independent **security review** after F2 and again after F3 (the public path is the focus), and a **design review** after F4 at 1280×800, 820×1180 touch, 390×844 touch and 320 — including the public form, the kiosk and the Calendar's free-class bits.

## 6. Steps and checkpoints

| Step | What | Gate |
|---|---|---|
| F0 | This plan + questions | **Jeffrey's OK** |
| F2 | Migration 0009 + tests; security review | Tests green |
| F4 | Staff screens + Calendar bookings, preview database; design review | Builds green |
| F1 | (when Color Belt phase 2 is merged — the Main session merges on Jeffrey's request) bring main into this branch | — |
| F3 | Public page + Cloudflare function (+ preview stand-in); security review | Tests green |
| F5 | **Jeffrey tries it in preview** (staff side, public form, kiosk, Calendar) | Jeffrey's OK |
| F6 | Live setup, each with Jeffrey's OK: paste 0009 (after 0007, 0008 and Color Belt's 0005 are live); the two-connection race test on a scratch branch; set the `forms_registrar` password; Cloudflare settings and kill switch; read-only checks | Jeffrey's OK |
| F7 | Go live — **see Q1** | **Separate OK** |

## 7. Questions for Jeffrey (one at a time, with visuals)

- **Q1 — When do forms go live?** Recommended: together with Prospects (step 4), so no sign-up sits unseen. The other option is sooner, with an email alert per sign-up.
- **Q2 — Emails:** set up an email-sending service now (account plus settings on the school's web address; confirmation emails are one per sign-up, a fixed message, rate-limited), or launch without emails and add them later?
- **Q3 — Kiosk:** recommended — "Open kiosk mode" **locks the dashboard on that device** and shows the form full screen with a kiosk token. Leaving asks for **the PIN of the account signed in on that device** (the normal unlock). Details:
  - kiosk should be opened from the **shared front-desk account**, and the app warns otherwise;
  - the tablet's own "Guided Access" (iPad) or "screen pinning" (Android) should be on, so nobody can leave the page;
  - 5 wrong PINs, or a password older than 7 days, means signing in with the password (the normal rules).

  The other option is a kiosk inside the signed-in dashboard.
- **Q4 — Waiver text:** do you have the school's wording for the templates, or should they start with a placeholder?
- **Q5 — Spot limit per form or per class time?** If two forms (Instagram, walk-in) both offer Wed 4:00 with 3 spots, can 6 free-class kids land in one class? Recommended: **one limit per class time, shared by all forms** (set in each form, the lowest wins). The other option is a separate count per form.
- **Q6 — A booked class is cancelled later** (a closure or schedule change after the family booked): recommended — the booking stays, marked amber "Class cancelled — call the family", in the Calendar and later in Prospects (like v0.143). Nothing is sent automatically.
- **Q7 — Phone bottom bar with Forms:** recommended — switch now to the approved final bar (v0.140: Home, Calendar, Prospects, More), showing Home, Calendar and More (Testing, Schedule, Forms) until Prospects exists. The other option is five buttons until step 4.

**New rulebook rows after the answers:** Q1–Q7, the limits (fields, options, labels, children 1–6, ages 2–99, days 1–60, hours 0–72, spots 1–20, 20 per hour / kiosk 120), delete-only-when-empty, and the `time_taken` / `form_changed` messages.

## 8. Risks

- **Size:** this is the biggest step. It's split F2 → F4 → F3 with a review after each.
- **Depends on another session:** F3 waits for Color Belt phase 2. The shared helpers are copied, not changed, unless that session agrees.
- **Privacy:** sign-ups hold children's first names and ages, parents' contact details and signatures.
  - Only signed-in, unlocked staff read them.
  - Signatures are read one at a time and never stored in history.
  - **Step 4's 2-year deletion must also remove the copies of answers kept in `change_log`.** Noted for the Prospects plan.
- **The last spot:** locked slot rows plus a real two-connection test before going live.

## 9. Progress log

- 2026-10-18 — Draft written.
- 2026-10-18 — Independent review: 5 High, 7 Medium, 9 Low. All folded in:
  - the server pieces are copied, with Forms' own Hyperdrive login and settings;
  - each child books a time;
  - a lockable slot row plus a real two-connection race test;
  - free-class bookings in the Calendar;
  - new questions Q5 (spot limit), Q6 (cancelled classes) and Q7 (bottom bar);
  - signature rules and a single-record read;
  - stricter answer checks, `form_changed`, and a copy of the fields kept with each sign-up;
  - idempotency per form, rate limits written down, and a kiosk token;
  - the kiosk unlock is the account's own PIN;
  - F2 and F4 can start before Color Belt merges;
  - the preview stand-in;
  - a fixed public answer;
  - `source` set by the database;
  - slug warnings;
  - a note on `change_log` for the 2-year deletion.

  Q5 (delete form) became a stated default.
- 2026-10-18 — **Plan approved by Jeffrey (F0).** Questions Q1–Q7 are asked one at a time next.
- 2026-10-18 — **Q1 → A:** the public forms (link and kiosk) stay off until Prospects (step 4) is built; then both go live together. F7 becomes "go live with step 4".
- 2026-10-18 — **Q2 → A:** emails at launch (confirmation to the family, alert to the school; on/off per form). Which email service is chosen with Jeffrey before F3, including the DNS settings for the school web address. Emails are one per sign-up with a fixed message, and a failed email is recorded for staff (`forms_public_email_result`).
- 2026-10-18 — **Q3 → A:** opening kiosk mode locks the dashboard on that device (the same lock as Lock now) and shows the public form full screen with a kiosk token. Leaving needs the PIN of the account signed in there. The app warns when kiosk is opened from an account other than the shared front desk, and the help text says to turn on Guided Access (iPad) or screen pinning (Android).
- 2026-10-18 — **Q4:** no set waiver wording. Templates start with an **empty waiver block**, and admins write their own text in the app per form. A form with an empty waiver block can't be published (`forms_publish` → `invalid`, message "Write the waiver text first"), and the waiver block can be removed from a form.
- 2026-10-18 — **Q5 → A:** one free-class spot limit per class time (school, class, date, start), **shared by all forms**. Each form still sets its own limit, and the lowest limit among the forms offering that time wins. `class_booking_slots` counts across forms.
- 2026-10-18 — **Q6 → A:** a booking whose class is later cancelled (a closure or a Schedule change) stays and is shown amber, "Class cancelled — call the family", in the Calendar day panel (and in Prospects from step 4). Saving a closure that cancels booked free classes first warns, e.g. "2 free-class bookings are on these classes — you'll need to call them." Nothing is sent to the family automatically; a cancellation email could be a later decision.
- 2026-10-18 — **Q7 → B:** the phone bottom bar shows five buttons (Home, Testing, Schedule, Calendar, Forms) until step 4, then changes to the approved final bar (v0.140: Home, Calendar, Prospects, More). All seven answers are recorded in the rulebook as v0.145.
- 2026-10-18 — **F2 done:** `0009_forms.sql`, its tests and fingerprints, plus the runner steps. PGlite 78/78. Independent security review: no High; M1–M3 and L1–L7 fixed, with a test for each. Open points for Jeffrey are in `STATUS-Forms.md`. Note: F2 ran before F1 (as planned, §1).
- 2026-10-18 — **Open points after F2 (v0.146):** signature pictures are deleted 90 days after the free class (built and tested), booking settings take effect right away, and the email sender stays open until Jeffrey checks for a school web address.
