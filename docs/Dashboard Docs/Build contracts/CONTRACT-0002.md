# Contract for migration 0002 + account screens build

Shared by the database builder and the app builder. Follow exactly so the halves fit.
Rulebook: `docs/Dashboard Docs/TKD-Dashboard-Design-Guidelines.md` (v0.28 — sections 5 and 10b are the source of truth).
Approved screens: `docs/Dashboard Docs/TKD-Account-Screens-Mockups.html` (Set your PIN, Change PIN, Change password) and `docs/Dashboard Docs/TKD-Home-Mockups.html`.
Existing code: `supabase/migrations/0001_staff_and_pin.sql` (applied to production, DO NOT edit it), `src/` (React 19 + Vite, plain JS).
Audience: Jeffrey is learning IT — every file has a header comment (what + why); non-obvious lines get short plain-English comments. Readable over clever.

## Facts about production (already true)
- Supabase project `tkd-dashboard`. 0001 applied. Two staff rows:
  - "Staff" — shrewsburyustc@gmail.com — role `staff` — the shared front-desk account.
  - "Main Admin" — jberg412@gmail.com — role `admin`.
- Supabase's connector cancels any SQL containing the word `delete`. 0002 must be split into two files:
  - `supabase/migrations/0002_server_lock_and_accounts.sql` — everything (the canonical migration, for the repo).
  - `supabase/manual/0002b_functions_with_delete_RUN_IN_SQL_EDITOR.sql` — ONLY the statements whose text contains `delete` (copied verbatim from 0002), with a header like 0001e's explaining how to paste it into the SQL Editor. Everything else must be appliable through the connector (contain no `delete` anywhere, including comments). Order must work: part A (no-delete) first, then part B.

## Migration 0002 — database builder
All security-definer functions: `set search_path = ''`, fully qualified names, revoke from public/anon, grant to authenticated only where the app calls them. Idempotent where practical (`add column if not exists`, `create or replace`). Never selectable PIN data.

### New columns on public.staff
- `idle_lock_minutes integer not null default 45` check between 5 and 480.
- `is_shared boolean not null default false` — shared accounts (the desk) can't change their own PIN/password.
- Data step (in 0002): set the desk row (email `shrewsburyustc@gmail.com`) to `idle_lock_minutes = 120, is_shared = true`. Match by email via `public.staff.email`.

### Server-side lock (hard gate, guidelines 10b)
- Table `public.session_unlock (session_id uuid primary key, staff_id uuid not null references public.staff(id) on delete cascade, unlocked_until timestamptz not null, updated_at timestamptz not null default now())`. RLS on, no policies, no grants.
- `public.touch_session() returns text` (granted to authenticated) — called by the app on load/sign-in and every few minutes while the person is active:
  - no uid / no session id / not active staff / password not fresh (7 days) → `'password_required'`
  - no row for this session: insert with `unlocked_until = last_password_sign_in_at() + idle_lock_minutes` (so a brand-new password sign-in starts unlocked, but a session older than its idle time starts LOCKED) → return `'unlocked'` or `'locked'` accordingly
  - row exists and `unlocked_until > now()`: extend to `now() + idle_lock_minutes` → `'unlocked'`
  - row exists and expired → `'locked'` (never reopens a locked session)
  - this session hit 5 wrong PINs (`pin_attempts.locked_at` not null) → `'password_required'`
- `public.lock_session() returns void` (granted) — sets `unlocked_until = now()` for this session (inserts if missing).
- `verify_pin` (replace, keep ALL existing behaviour and return values from 0001): on `'ok'` ALSO upsert this session's `session_unlock.unlocked_until = now() + idle_lock_minutes`.
- `public.has_data_access() returns boolean` (granted; used by future RLS policies): true only if ALL: `is_active_staff_with_fresh_password()`; the session still exists in `auth.sessions` for this user (wrap in exception handler → false if not readable); no PIN lock for this session; a `session_unlock` row for this session with `unlocked_until > now()`.
- Housekeeping inside touch_session: remove session_unlock rows older than 8 days (this is a `delete` → part B file).

### Account functions
- `public.set_my_pin(p_pin text) returns text` (granted):
  - `'invalid'` unless exactly 4 digits; `'too_easy'` if all digits the same or a straight run up or down (0123…6789, 9876…3210, incl. 1234/4321).
  - `'password_required'` unless active staff, valid session, AND last password sign-in within the last **10 minutes** (Set PIN happens right after sign-in; Change PIN re-signs-in first).
  - `'not_allowed'` if `is_shared` AND a PIN is already set (desk sets its PIN once; admin changes it later).
  - Otherwise store bcrypt hash (`extensions.crypt(p_pin, extensions.gen_salt('bf', 10))`), reset ONLY this session's wrong-PIN counter (changed after security review: other devices keep their counters and PIN locks), mark this session unlocked (`now() + idle_lock_minutes`), return `'ok'`.
- `admin_set_staff_pin` (replace): additionally refuse when `p_staff_id = auth.uid()` (use set_my_pin), and require `public.has_data_access()` for the caller. Also accept the weak-PIN rule (raise `'PIN is too easy to guess.'`).
- `is_admin()` (replace): also require `is_active_staff_with_fresh_password()` — keep signature.
- `get_my_profile()` — return type changes, so `drop function` then `create` it again (note: `drop` is fine, only `delete` is blocked). New columns appended at the END: `idle_lock_minutes integer, is_shared boolean`. Re-grant to authenticated.

### Tests
- Extend/add `supabase/tests/0002_tests.sql` in the same style as `verify_pin_tests.sql` (one transaction, ROLLBACK at the end, `TEST FAILED:` exceptions, final row `ALL 0002 TESTS PASSED`; uses `set local role authenticated` + `request.jwt.claims` with session_id/amr). Cover: touch_session states (fresh/expired/extend/never-reopen/password_required), lock_session, verify_pin ok unlocks, has_data_access true/false cases (locked, PIN-locked, stale password, inactive), set_my_pin (invalid, too_easy for 1111/1234/4321/0123/9876, password older than 10 min, shared with existing PIN → not_allowed, ok), admin_set_staff_pin refuses self, is_admin false when password stale. Needs TWO staff rows: use placeholders `<paste-admin-UID-here>` and `<paste-desk-UID-here>`.
- The original `verify_pin_tests.sql` must still pass after 0002.
- Update `supabase/SETUP.md`: section on 0002 (how it's applied), and an "Admin: change the front-desk PIN or password" section — password via Supabase Authentication → Users (explain the options the dashboard offers; if unsure of exact labels say so), PIN via a plain SQL snippet for the SQL Editor (bcrypt with weak-PIN check done by eye), plus clearing that person's session_unlock/pin_attempts if needed.

## App changes — app builder
RPCs (via `supabase.rpc`): `get_my_profile()` (now also `idle_lock_minutes`, `is_shared`), `touch_session()`, `lock_session()`, `verify_pin(p_pin)`, `set_my_pin(p_pin)`.

1. **Server lock wiring**: after sign-in/load (once profile loaded) call `touch_session()`. `'locked'` → show Lock screen; `'password_required'` → sign out with the matching notice. While unlocked and the person is active, call `touch_session()` at most every 3 minutes (activity-throttled). On idle lock and "Lock now" call `lock_session()` (UI locks immediately even if the call fails). Unlock via `verify_pin` → `'ok'` already unlocks the server side.
2. **Per-account idle time**: replace the fixed 45-minute constant with `profile.idle_lock_minutes` (fallback 45).
3. **No PIN → sign out at idle** (approved v0.26): if `has_pin` is false when idle/Lock now happens, sign out (scope local) and show the amber notice "Signed out after being idle. Set a PIN to unlock faster." (Lock now with no PIN can't happen in practice because Set PIN is required, but handle it the same way.) Remove the old no-PIN lock-screen variant.
4. **Set your PIN screen** (required): after a password sign-in, if `has_pin` is false, show it before Home. Matches the approved mockup exactly (identity block with initials circle + name + email, "Set your PIN", "Unlocks this screen after it goes idle.", "Step 1 of 2"/"Step 2 of 2", "Choose a 4-digit PIN" + hint "Not all the same (1111) and not a straight run (1234).", "Enter it again to confirm", dots, keyboard on PC via hidden input like LockScreen, keypad on touch, "Back" link on step 2, "Not you? Sign out"). Check weak PINs client-side too (same rule) before calling the server. Mismatch → back to step 1 with "The PINs didn't match. Choose your PIN again." Results: `'ok'` → Home + toast "PIN set"; `'too_easy'` → "That PIN is too easy to guess. Choose another."; `'password_required'` → sign out with notice "Sign in with your password again to set your PIN."; `'not_allowed'` → go to Home (shouldn't happen). Reuse LockScreen pieces (dots, keypad, hidden input) by extracting shared components rather than copying.
5. **Change PIN** (menu item, `ti-key`/IconKey; hidden when `profile.is_shared`): dialog on PC/tablet (no X; Cancel button; Esc cancels; focus trapped; backdrop dims), full-screen page with back arrow on phone (< 640px). Step 1 "Confirm it's you" password field + Continue → re-check by `supabase.auth.signInWithPassword({email: profile.email, password})` (this refreshes the password timestamp). Wrong → "That password doesn't match. Try again." Steps 2–3 choose/confirm (same components as Set PIN, with "Back"). Then `set_my_pin` → toast "PIN changed". If the account has no PIN, the menu item reads "Set PIN" and opens the Set PIN flow.
6. **Change password** (menu item, IconPassword; hidden when `is_shared`): fields Current / New (hint "At least 12 characters") / Confirm, Cancel + primary "Change password". On submit: validate (new ≥ 12, confirm matches → "The new passwords don't match. Type the same password in both."), re-check current via `signInWithPassword`, then `supabase.auth.updateUser({ password })`. Map Supabase errors to plain messages (weak/too short/same as old/rate limited). Success → close + toast "Password changed".
7. **Account menu order**: who-line; Lock now; Change PIN (or Set PIN); Change password; This device; separator; Sign out. Shared account: Lock now; This device; Sign out.
8. **Toast component**: bottom-right (bottom-center above the phone bottom bar on phones), auto-dismiss 5 s, `role="status"`, no Undo for these.
9. **Control borders (v0.26)**: add token `--color-border-control: #8F8F8A` in tokens.css; use it for inputs, PIN dots, keypad keys, location switcher outline, secondary buttons, and the avatar button. Dividers keep the light border.
10. **Preview mode** (`src/lib/mockClient.js`): support all new RPCs with the same rules (PIN 1234 is too easy now — make the preview PIN `2580` and update README/banner hints), `idle_lock_minutes` 45, `is_shared` false by default; expose `__tkdPreview.setShared(bool)`, `setHasPin(bool)`, `lockNow()`; signInWithPassword re-check works with password `preview`.
11. Keep everything that already works (focus restore, hidden PIN input, scope:'local' sign-out, 7-day checks, secret-key refusal). Update README.md for the new screens and preview PIN.
