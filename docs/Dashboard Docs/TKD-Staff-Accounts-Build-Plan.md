# Staff accounts build plan — Reset password + Reset PIN (DRAFT, security-reviewed)

**Branch:** `staff-accounts` · **Date:** 2026-10-17 · **Implements:** rulebook v0.70–v0.76 · **Approved design:** `TKD-Staff-Accounts-Mockups.html` (v0.76) · **Decisions:** `TKD-Staff-Accounts-Questions.html`

Nothing in this plan is built yet. Building starts only after Jeffrey OKs this plan. Applying SQL to production and any push each need their own OK (P2).

---

## 0. What gets built, in one paragraph

Admins get a **Staff accounts** page (account menu → Admin). It lists every account, and each row's `⋯` menu has **Reset password** and **Reset PIN**. Both start with the admin's own password ("Confirm it's you"), then the new password or PIN. The work happens inside the database, in new **security-definer functions** in migration `0004`. A security-definer function is a database function that runs with its owner's rights instead of the caller's, and checks every rule itself before doing anything. No secret / `service_role` key is used anywhere (v0.71).

**Facts checked on production 2026-10-17 (read-only):**
- The database owner (`postgres`) may update `auth.users` and delete from `auth.sessions` and `auth.one_time_tokens`. Deleting a session also deletes its refresh tokens, via a foreign key with cascade.
- `log_statement = ddl` and `log_parameter_max_length_on_error = 0`, so function arguments (the new password) are **not** written to the database logs, for normal calls or failed ones.
- `auto_explain` logs queries slower than 10 s with their parameters, but signed-in users' queries are cancelled at 8 s (`statement_timeout`), so it never reaches them.
- `log_min_duration_statement = -1` (off).
- `pgaudit` is not installed (`pgaudit.log = none`).
- No per-role or per-database setting turns statement logging on (`pg_db_role_setting` checked).
- `auth.users` has **no triggers**.
- `public.staff` has only `staff_set_updated_at`, with **no change-log trigger**.
- `staff.is_shared` is not readable by signed-in users, so the list needs its own function.
- There are 2 staff rows today: Main Admin and the desk.

---

## 1. Database — migration `0004_staff_accounts.sql`

**Number:** `0004`, provisionally. Star testing also takes "the next free number" but has no migration yet. Whichever merges into `main` second renumbers. Flag this to the Main session at merge.

Rules followed (handoff §6): `security definer`, `set search_path = ''`, fully qualified names, `extensions.crypt` / `extensions.gen_salt`. Each function gets `revoke execute … from public, anon, authenticated, service_role` and then `grant execute … to authenticated`. Each one returns `{status: …}` jsonb. A plain-English header and comments, in the style of 0002/0003. Safe to re-run (`create or replace`).

### 1a. `public.admin_list_staff()` → jsonb

- Refuses unless `is_admin() and has_data_access()`. Returns `{status:'not_allowed'}`, and the page shows "Only admins can see Staff accounts."
- `{status:'ok', accounts:[{id, full_name, email, role, is_shared, is_me}]}`, sorted admins → staff → shared, A–Z within each group.
- Never returns PIN hashes, password data, wrong-PIN counts or session details.
- Shows active accounts only. Disabling accounts comes later (v0.70); an inactive account can't sign in anyway.

### 1b. `public.admin_reset_password(p_staff_id uuid, p_new_password text)` → jsonb

Checks, in this order. The first failure returns its status and **changes nothing**:

| # | Check | Status |
|---|---|---|
| 0 | Any argument is NULL (`p_staff_id`, `p_new_password`) | `invalid` |
| 1 | `is_admin() and has_data_access()` (active admin, unlocked, still signed in, not PIN-locked, password within 7 days) | `not_allowed` |
| 2 | Password sign-in within the last **10 minutes**: `coalesce(last_password_sign_in_at() >= now() - interval '10 minutes', false)`, written so a NULL fails closed (v0.74). The app's step 1 (`confirmPassword`) supplies it. | `password_required` |
| 3 | `p_staff_id` is not the caller (`auth.uid()`): use Change password instead | `own_account` |
| 4 | `select … from public.staff where id = p_staff_id and active for update`: the row must exist and be active, and it is **locked from this point**, so the check and the change can't be separated by another call. The login must also exist in `auth.users` with `deleted_at is null` and not `banned_until > now()`. This stops it touching any login that isn't a working dashboard account. | `not_found` |
| 5 | `char_length` ≥ 12 (v0.28) | `too_short` |
| 6 | `octet_length` ≤ 72 **bytes**: bcrypt ignores everything after 72 bytes, and Supabase Auth refuses longer passwords too. The app shows "Use 72 characters or fewer." | `too_long` |

Then, in one statement block (all or nothing; any error rolls back the whole call):
1. (The staff row is already locked by check 4.) The caller's own `auth.sessions` row is locked `for share`, so two admins resetting each other at the same moment take turns.
2. `update auth.users set encrypted_password = extensions.crypt(p_new_password, extensions.gen_salt('bf', 10)), recovery_token = '', reauthentication_token = '', confirmation_token = '', email_change_token_new = '', email_change_token_current = '', email_change = '', email_change_confirm_status = 0, phone_change_token = '', updated_at = now() where id = p_staff_id`. Empty strings, never NULL: Supabase Auth can't read NULLs in these columns. This cancels every emailed or texted link, including a pending email change to someone else's address. Bcrypt cost 10 is the same as Supabase Auth's own. The update must touch exactly 1 row, or it raises (fails closed).
3. `delete from auth.one_time_tokens where user_id = p_staff_id` and `delete from auth.flow_state where user_id = p_staff_id`: cancels every emailed link (password reset, magic link, email change) and any half-finished sign-in code (v0.72).
4. `delete from auth.sessions where user_id = p_staff_id`, counting the rows: signs the person out everywhere. Their refresh tokens go with the sessions (cascade). As a backstop, `delete from auth.refresh_tokens where user_id = p_staff_id::text` also catches any token without a session. Their old `session_unlock` rows are left, as SETUP.md already does: they're harmless and cleaned up after 8 days.
5. `insert into public.change_log` with action `admin_reset_password`, `table_name 'staff'`, `record_id p_staff_id`, `op 'update'`, `before null`, `after {"password":"reset","devices_signed_out":n}`, plus actor, session and batch id the same way 0003's helpers record them. **The password never appears in the log, the return value or an error message.**
6. Returns `{status:'ok', devices_signed_out: n}`.

**Schema-change guard:** if Supabase ever renames these Auth columns or tables, the function errors with nothing changed. The app shows "Couldn't reset the password. Nothing was changed. Try again." and the 0004 fingerprint check flags it. The fallback in that case is the Cloudflare Function (v0.71).

### 1c. `public.admin_reset_pin(p_staff_id uuid, p_pin text)` → jsonb

- Same checks 0–4 as above (NULL PIN → `invalid`), then `pin_is_too_easy()` / exactly 4 digits. Statuses are `invalid` and `too_easy`.
- Then does exactly what `admin_set_staff_pin` does today: bcrypt-hashes the PIN and clears that person's wrong-PIN counts, while devices that hit 5 wrong PINs **stay locked** (0002).
- Writes the change log (action `admin_reset_pin`, after `{"pin":"reset"}`, never the digits).
- Returns `{status:'ok'}`.
- **Nobody is signed out** (v0.75).

### 1d. `public.admin_set_staff_pin` (from 0002)

The app never calls it, and it has no 10-minute rule. v0.74 says it must not stay weaker than the new path, so 0004 **revokes execute from `authenticated` and `service_role`** (its body is unchanged). Re-running 0002 would grant it back; the 0004 fingerprint check catches that. SETUP.md's undo for 0004 says to put the grant back only together with removing 0004's functions. Admin PIN resets then go through `admin_reset_pin` only. The SETUP.md SQL Editor snippets don't use this function, so they're unaffected.

### 1e. Fingerprints

Add `supabase/tests/0004_fingerprints.sql`, in the style of 0003's:
- function definitions and owners,
- grants (nothing to `anon` / `public`),
- the Auth columns 0004 relies on (every `auth.users` token column in §1b, `email_change`, `email_change_confirm_status`, `deleted_at`, `banned_until`; `auth.one_time_tokens.user_id`, `auth.flow_state.user_id`, `auth.refresh_tokens.user_id`, `auth.sessions.user_id`) still exist with the expected types;
- `public.staff` has **no** `change_log_write` trigger. If one were ever added, `pin_hash` would be copied into change_log; 0004 says so in a comment.

---

## 2. Tests — `supabase/tests/0004_tests.sql` (PGlite first, then production)

**Safe on production:** everything runs in one transaction ending in `rollback;`, like 0003_tests. If anything errors, the transaction is aborted and nothing is kept. The header keeps "NEVER change the final rollback; to commit;". Before Jeffrey runs it, Claude re-checks (read-only) that `auth.users` still has no triggers (checked 2026-10-17: none), because the tests add throwaway logins. It creates **its own throwaway logins** (`zz-test-…@example.com`) and never touches the real accounts. It pretends to be signed-in users the same way 0002/0003 tests do.

**PGlite stubs** (`supabase/tests/pglite/stubs.sql`, shared test file): add the `auth.users` columns `encrypted_password`, every token column from §1b, `email_change`, `email_change_confirm_status`, `deleted_at`, `banned_until`, `updated_at`; `auth.one_time_tokens (id, user_id, …)`; `auth.flow_state (id, user_id)`; `auth.refresh_tokens (id, user_id text, session_id → auth.sessions on delete cascade)`. `run.mjs` gets 0004 + 0004_tests and a second apply of 0004 (re-run safety).

Cases (each function):
- **Refused:** `anon`, plain staff, the shared desk, an admin whose session is locked / PIN-locked / signed out / password older than 7 days, and an admin whose password sign-in is older than 10 minutes (`password_required`).
- **Refused:** each NULL argument (`invalid`), own account, unknown id, an Auth login with no staff row, an inactive staff row, a deleted or banned login; passwords of 11 characters and of 73 bytes (also a multi-byte case: 25 × "é" = 50 bytes is OK); PINs `123`, `12a4`, `1111`, `1234`, `4321`.
- **Each refusal changes nothing:** hash, tokens, sessions and change_log are the same as before.
- **Success (password):**
  - `extensions.crypt(new, hash) = hash` (the new password works, the old one doesn't);
  - `recovery_token` and `reauthentication_token` are empty;
  - that user's one-time tokens and sessions are gone (and their refresh tokens, by cascade);
  - `devices_signed_out` equals the number of sessions deleted;
  - **other users' rows are untouched**, including the admin's own session;
  - exactly one change_log row, and **the password text appears nowhere in change_log**;
  - every token column is `''` and the user's `flow_state` / refresh-token rows are gone;
  - immediately afterwards, the reset user's **old** session gets `false` from `has_data_access()`, `password_required` from `touch_session`, and `not_allowed` from all three admin functions (for when the person reset is an admin);
  - **an admin resetting the other admin** works and is logged (allowed on purpose, v0.23 / v0.74).
- **Success (PIN):** the new PIN verifies through `verify_pin` on an unlocked test session; wrong-PIN counts are cleared; a device locked by 5 wrong PINs stays locked; no session is deleted; change_log has no digits.
- **`admin_list_staff`:** non-admins get `not_allowed`; admins get the expected keys only (catalog check: no `pin_hash` key); `is_me` is correct.
- **Catalog:** every 0004 function is security definer with an empty `search_path`, owned by `postgres`, executable by `authenticated` only; `admin_set_staff_pin` is no longer executable by `authenticated`.
- **Earlier suites still pass:** 0002, 0003 and `verify_pin_tests.sql` rerun after 0004. They call `admin_set_staff_pin` as a signed-in admin (0002_tests: 8 places, verify_pin_tests: 3). Those calls are adjusted or moved, either to the new `admin_reset_pin` or to "refused for authenticated". Every adjusted test is listed as a deliberate change, never quietly deleted.

---

## 3. Front end

| File | What |
|---|---|
| `src/screens/StaffAccounts.jsx` (new) | The page: title, gray line, list (name · email · one tag · `⋯`; own row "(you)", no `⋯`, not clickable), row click/Enter opens the row menu (exception to rule 8, v0.76), ↑ ↓ via `useRowArrowNav` (skips own row), loading skeleton, couldn't-load banner + Retry (`ErrorBanner`), "Only admins can see Staff accounts." |
| `src/screens/staff/ResetPasswordDialog.jsx` (new) | 2 steps on `Dialog.jsx` (phone full screen): who-line; step 1 "Confirm it's you" → `confirmPassword()`; step 2 plain-text field (normal font, `autocomplete="new-password"`, `spellcheck=false`, `autocapitalize="off"`), live "12 characters minimum (N so far)" → "Long enough", Generate / Copy, warning line (+ desk line when `is_shared`), Back, unsaved-changes guard (v0.46/v0.56), errors kept in the dialog. |
| `src/screens/staff/ResetPinDialog.jsx` (new) | Same step 1; step 2 four **shown** digit boxes (typed on PC, approved keypad on touch, via `usePinDigits` with a "show digits" option), weak-PIN message from `pinRules.js`, saves only on **Reset PIN**, desk / personal hint line. |
| `src/lib/staffAccounts.js` (new) | `listStaff()`, `resetPassword()`, `resetPin()` (rpc wrappers) + one table mapping each `status` to the approved wording. |
| `src/lib/passphrase.js` + `src/lib/wordlist.js` (new) | Generate: 4 words from **our own list of 1,687 common, everyday lowercase words**, 3–8 letters, no repeats (written for this project rather than downloaded, so there's no outside file to vet or license; built 2026-10-17), chosen with `crypto.getRandomValues` with rejection sampling (no `Math.random`), joined by dashes. Re-rolls until ≥ 20 characters. ≈ 43 bits; enough with Supabase's sign-in rate limit, and much stronger than typical hand-typed passwords. |
| `src/components/AccountMenu.jsx` (shared) | "Admin" group + **Staff accounts** (`IconUserCog`) for `role === 'admin'` only, above Sign out. |
| `src/App.jsx` (shared) | New section id `staffAccounts` (**not** in `navItems.js`, so no rail item is highlighted), tab title "Staff accounts · U.S. Taekwondo Center", toast for the two successes (no Undo, no icon), dialogs hide the page behind them as the account dialogs do. |
| `src/lib/mockClient.js` (shared) | Fake `admin_list_staff` / `admin_reset_password` / `admin_reset_pin` for preview, using the same rules and statuses; reuses `failNextSave()`; `__tkdPreview.setRole('staff')` hides the Admin group. |
| `src/styles/app.css` (shared) | Page, row and dialog styles from tokens only. |

- **Copy:** `navigator.clipboard.writeText`. If the browser blocks it, show "Couldn't copy. Select the password and copy it." (amber, under the buttons). The button shows "Copied" for 2 s.
- **Icons:** `IconUserCog`, `IconWand`, `IconCopy`, `IconPassword`, `IconKey`, `IconDots`, `IconArrowLeft`, `IconAlertTriangle`, `IconRefresh` (all in the 2.4 map).
- **Requests:** `supabase.rpc(...)` with the default **POST** (never `{ get: true }`), so the password travels in the request body, never in a URL that could reach the API logs. No error reporter or fetch logger is added that could capture request bodies.
- **Statuses inside the dialog:** `not_allowed` there (for example the new session's unlock record didn't save) shows "Couldn't reset the password. Nothing was changed. Try again.", **not** the page's "Only admins…" line. `password_required` (step 2 open for more than 10 minutes) goes back to step 1 with "For security, enter your password again."
- **Step 1 starts a new sign-in** on the admin's device (that's how `confirmPassword` works today). The previous session stays alive on the server until it expires. Harmless, the same as Change PIN.
- **Never** store the new password or PIN in React state longer than the dialog is open, in localStorage, in the URL, or in console logs. The field is cleared when the dialog closes.
- **Signed-out devices:** the desk devices notice through the existing heartbeat / `touch_session` (`password_required` → sign-in screen). No new code.

**Docs (shared):** `supabase/SETUP.md` gets section 11 "Migration 0004: Staff accounts" (apply, checks, tests, undo), and the desk password / PIN snippets are relabelled "emergency backup (use Staff accounts normally)". `README.md` / `docs/README.md` list the new docs.

---

## 4. Order and checkpoints

| Step | What | Who / gate |
|---|---|---|
| S1 | 0004 + stubs + `0004_tests.sql` + fingerprints; PGlite run passes (incl. 0002/0003 suites, re-run) | Claude; **security review by a separate agent** (functions, grants, logging, the auth-table writes); fixes applied |
| S2 | Front end + preview fake data; `npm run build` and `npm run build:preview-mode` pass | Claude; **design review by a separate agent** with screenshots at 1280×800, 820×1180 touch, 390×844 touch, 320 wide; fixes applied |
| S3 | Jeffrey tries it in the preview (`npm run dev:preview-mode` in this worktree) | Jeffrey |
| S4 | Jeffrey pastes 0004 into the Supabase **SQL Editor** (its own OK); Claude runs read-only checks (function list, grants, fingerprints, security advisor); Jeffrey runs `0004_tests.sql` (ends in rollback) | Jeffrey's OK for production SQL |
| S5 | Real check **outside class hours** (it signs the desk devices out) with `Start dashboard.bat` (local app, real database): Jeffrey resets the **desk password** from the screen, the desk devices go to sign-in, and the new password works; then a desk PIN reset | Jeffrey |
| S6 | Commit on `staff-accounts`; Main session merges into `main` (rulebook v0.70–v0.76 renumbered if Star testing merged first; migration number checked) | Jeffrey asks the Main session |
| S7 | Push / deploy | **Separate OK.** Pushing `main` deploys whatever else is on `main` too (see the Color Belt CP6 note in CLAUDE.md). The Main session checks this first. |

Until S4, the SETUP.md snippet stays the way to reset the desk password.

---

## 5. Risks and how they're handled

| Risk | Handling |
|---|---|
| Supabase changes its Auth tables | Fails closed (error, nothing changed); fingerprint check catches it; fallback documented (v0.71). |
| Password visible in logs | Checked: params not logged (§0). The function never puts it in errors, change_log or return values; tests assert this. |
| Password on screen / clipboard | Accepted in v0.73 (plain text); the warning line asks the admin to save it; the field clears on close. The clipboard keeps it until something else is copied (mention in SETUP.md). |
| A stolen, unlocked admin screen | Step 1 password + database 10-minute rule (v0.74); `has_data_access()` refuses locked sessions. |
| Supabase extras skipped | No "password changed" email, no leaked-password check (Pro only, off today). Accepted (v0.71). |
| bcrypt 72-byte limit | Refused above 72 bytes (`too_long`). |
| Two admins at once | Staff row locked `for update`, caller's session `for share`; the second call simply resets again (last one wins); both are logged. |
| A sign-in with the old password that is mid-way when the reset commits | Could still create one new session. It can't be prevented from SQL. Accepted; the person reset is normally the one who forgot the password. |
| Old access token after the reset (up to 1 hour) | It can only read the person's own staff row and profile; `session_exists()` refuses everything else at once. Tested. |
| Migration / version number clash with Star testing | Renumber the later merge (CLAUDE.md rule). |

---

## 6. Open questions

None need Jeffrey's decision; the technical choices above are made. One to confirm when you OK the plan: **§1d revokes `admin_set_staff_pin` from the app** instead of rewriting it. It's simpler and stricter than v0.74's wording ("tightened"), with the same outcome: the app path has the 10-minute rule.

---

## 7. Independent security review (2026-10-17)

A separate agent reviewed this plan against handoff §6, migrations 0001–0003 and `confirmPassword.js`. Its verdict: safe to build once the fixes were folded in. All 11 findings are now in the sections above:

1. Every emailed token column is cleared, plus `flow_state` and orphan refresh tokens.
2. Logging re-checked: pgaudit, role settings, duration logging; POST-only requests.
3. NULL inputs refused; `octet_length`; the 10-minute rule fails closed.
4. The row is locked before it's checked.
5. Tests that the old session is refused.
6. Statuses inside the dialog; 10-minute timeout goes back to step 1.
7. `service_role` revoke and undo note.
8. Test for resetting the other admin.
9. Production test safety and no-trigger check; S5 outside class hours.
10. Deleted or banned logins refused.
11. Fingerprint check that `public.staff` has no change-log trigger.

---

## 8. Progress

- **S1 done (2026-10-17):** `0004_staff_accounts.sql`, `0004_tests.sql`, `0004_fingerprints.sql`, PGlite stubs and runner, 0002 Test 12 adjusted (and it now fails if the revoke is ever lost), SETUP.md section 11.
  - PGlite: **43 passed, 0 failed**, including re-running 0004 and the upgrade path. Three deliberately broken copies of 0004 were each caught by the tests.
  - Independent security review, re-checked after the fixes: verdict **safe to apply**. Fixed:
    - mutual-reset race: both staff rows are locked in id order (`for no key update`), then the caller is checked again;
    - a lost revoke is now detected by 0002 Test 12;
    - the triggers on all five Auth tables are fingerprinted;
    - the test snapshot is wider (all 8 test logins, session ids).
  - Production checked read-only: there are no triggers on the Auth tables, and flow_state's challenge columns are optional.
  - **Not applied to production.** That's S4 and needs its own OK.
- **S2 done (2026-10-17):** the Staff accounts page, the Reset password / Reset PIN dialogs, the account menu's Admin group, the App wiring, the preview fake data (`mockStaff.js`), `staff.css`, and one new token (`--color-success-text`).
  - `npm run build` and `npm run build:preview-mode` pass. Clicked through in the preview at 1280 and 320.
  - Independent design review: no must-fix. Fixed: the field and Generate/Copy are locked while saving; the PIN focus ring only shows while the PIN box has focus; the unsaved note sits above the buttons on step 1; password managers are told to ignore the field; emails break after the "@"; the phone "Admin" label is indented; a screen-reader hint on rows; a smaller font under 360px.
  - Open for Jeffrey: (a) the extra PC line "Type the 4 digits on your keyboard." (as in Change PIN; not in the mockup); (b) browser Back doesn't return from Staff accounts (no section uses history today; the mockup's "or browser Back" wording was wrong); (c) the shared dialog re-centres when a note appears.
- **S3 done (2026-10-17):** Jeffrey tried it in the preview: OK.
- **S4 done (2026-10-17, Jeffrey's OK):** 0004 pasted into the SQL Editor ("Success").
  - All 25 lines of `0004_fingerprints.sql` match the tested copy.
  - Security advisor: only the expected notices. `admin_set_staff_pin` and `staff_admin_gate` are no longer callable by the app.
  - On production: `0004_tests.sql`, `0002_tests.sql` and `verify_pin_tests.sql` pass.
  - The first 0004 run failed check 8f. That was a false alarm: a Color Belt seed row's random id contained "4719". Fixed by searching only the test's own history rows (`ca0fc0f`); a deliberately leaking copy is still caught.
  - Also fixed: `0004_fingerprints.sql` had the word `deleted_at`, which the Supabase connection refuses. It's now spelled in two pieces.
- Next: S5 (the real check from the local app, outside class hours).
