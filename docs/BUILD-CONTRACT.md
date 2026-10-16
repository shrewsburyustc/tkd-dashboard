# TKD Dashboard — Home build contract

Shared by the database builder and the screens builder. Both MUST follow it exactly so the halves fit.
Rulebook: `/home/claude/TKD-Dashboard-Design-Guidelines.md` (v0.24). Approved visual design: `/home/claude/TKD-Home-Mockups.html`.
Project root: `/home/claude/tkd-dashboard/` (logo already at `public/logo.png`).

Audience: the owner (Jeffrey) is new to coding and learning IT. Every file gets a short header comment saying what the file is and why it exists; non-obvious lines get brief comments. Plain, readable code over clever code.

## Stack (pinned — use exactly these versions)
- react 19.3.0, react-dom 19.3.0
- vite 8.3.1, @vitejs/plugin-react 6.1.1
- @supabase/supabase-js 2.117.2
- @tabler/icons-react 3.48.0 (outline icons only: `import { IconHome } from '@tabler/icons-react'`)
- Plain CSS (no Tailwind, no CSS-in-JS). JavaScript (.jsx), not TypeScript.
- No other dependencies. No router library (Home is the only section; a simple state switch is enough).

## Scope of this build
IN: Sign-in screen, Home (empty, welcome header), app shell (rail / top bar / phone bottom bar), location switcher, account menu, Lock screen, 45-minute idle auto-lock, per-device default location, 7-day password re-check, preview (mock) mode.
OUT (not designed yet — must NOT appear anywhere in the UI, not even as disabled items): Set PIN, Change PIN, Change password, Staff accounts, Settings, search, notifications, add-new. The account menu in this build contains ONLY: who-line, Lock now, This device, Sign out.

## Database (Supabase / Postgres) — owned by the database builder
File: `supabase/migrations/0001_staff_and_pin.sql` (idempotent where practical; runnable in the Supabase SQL editor in one paste).

### Table `public.staff`
| column | type | notes |
|---|---|---|
| id | uuid PK | references `auth.users(id)` on delete cascade |
| full_name | text not null | |
| email | text not null | display copy of the login email |
| role | text not null default 'staff' | check in ('admin','staff') |
| active | boolean not null default true | inactive = no dashboard access |
| pin_hash | text null | bcrypt via pgcrypto `crypt(pin, gen_salt('bf', 10))`. NEVER readable by clients |
| pin_failed_attempts | int not null default 0 | |
| pin_locked_at | timestamptz null | set when 5th wrong PIN happens |
| created_at, updated_at | timestamptz not null default now() | updated_at maintained by trigger |

Security:
- RLS enabled. Clients (role `authenticated`) may SELECT only these columns: id, full_name, email, role, active, created_at — use column-level GRANT so `pin_hash`, `pin_failed_attempts`, `pin_locked_at` are not selectable at all. `anon` gets nothing.
- SELECT policy: a user can read their own row; admins (active, role='admin') can read all rows. Use a `security definer` helper `public.is_admin()` with `set search_path = ''` and fully-qualified names to avoid RLS recursion.
- No INSERT/UPDATE/DELETE grants or policies for clients in this build (staff rows are created by an admin in the Supabase dashboard / SQL editor for now).
- All functions: `security definer`, `set search_path = ''`, fully-qualified names (`public.staff`, `extensions.crypt`, `extensions.gen_salt`), `revoke execute ... from public, anon; grant execute ... to authenticated` where clients call them.

### RPC functions the screens call (via `supabase.rpc(name, args)`)
1. `get_my_profile()` → returns a single row (or empty if no staff row):
   `{ id uuid, full_name text, email text, role text, active boolean, has_pin boolean, pin_locked boolean }`
   `pin_locked` = true when the PIN is currently locked (see rule below).
2. `verify_pin(p_pin text)` → returns text, exactly one of:
   - `'ok'` — PIN correct; failed attempts reset to 0.
   - `'wrong:N'` — wrong PIN; N = tries left before password is required (5 total). e.g. after the 2nd wrong try → `'wrong:3'`.
   - `'password_required'` — no PIN set, OR PIN locked (5 wrong tries), OR the caller's last password sign-in is older than 7 days, OR caller has no active staff row.
   - `'invalid'` — p_pin is not exactly 4 digits (does not count as a wrong attempt).
   Rules:
   - Last password sign-in time comes from the JWT, not from the client: the max `timestamp` among `auth.jwt()->'amr'` entries whose `method` = 'password'. If none found → treat as `'password_required'`.
   - If `pin_locked_at` is not null AND the last password sign-in is AFTER `pin_locked_at` → clear the lock and attempts first (a fresh password sign-in unlocks the PIN).
   - On the 5th consecutive wrong PIN: set `pin_locked_at = now()` and return `'password_required'`.
   - Use row locking (`select ... for update`) so parallel calls can't bypass the attempt counter.
3. (Admin helper, NOT called by the screens) `admin_set_staff_pin(p_staff_id uuid, p_pin text)` → void; only callable when `public.is_admin()`; validates 4 digits; stores bcrypt hash; resets attempts/lock. Used temporarily from the SQL editor to give someone a PIN until the Set PIN screen exists. Also document how the project owner can run it in the SQL editor (where `auth.uid()` is null) — provide a separate plain SQL snippet in the setup doc instead of weakening the function.

### Setup doc (database builder writes it)
`supabase/SETUP.md`: numbered, beginner-friendly steps with WHY for each:
1. Create the project in the school org (name `tkd-dashboard`, region US East, strong DB password saved in a password manager). Note the free plan / 2-project limit.
2. Run `0001_staff_and_pin.sql` in SQL Editor.
3. Auth settings: disable public sign-ups (Authentication → Sign In / Providers → turn off "Allow new users to sign up"), keep email provider on, turn off "Confirm email" is NOT needed because admins create users with "Auto Confirm User" checked.
4. Create first admin: Authentication → Users → Add user → email + password, tick Auto Confirm. Copy the user's UID. Then run the provided `insert into public.staff ... role 'admin'` snippet.
5. Give yourself a PIN with the provided SQL snippet (bcrypt) until the Set PIN screen is built.
6. Repeat 4–5 for the grandmaster as second admin.
7. Copy Project URL and the publishable/anon key (Project Settings → API) into `.env.local`. Explain that the anon key is safe in the browser because row-level security protects the data, and that the `service_role`/secret key must NEVER go in the app or in git.

## Screens — owned by the screens builder
Structure (suggested):
```
index.html, vite.config.js, package.json, .gitignore, .env.example, README.md
src/main.jsx, src/App.jsx
src/lib/supabase.js      // real client, or mock client when VITE_PREVIEW_MODE=1
src/lib/mockClient.js    // preview mode fake backend
src/lib/session.js       // last-password-sign-in time from the access token's amr claim; 7-day check
src/lib/useIdleLock.js   // 45-minute idle detection + persisted lock flag
src/lib/device.js        // per-device default location in localStorage
src/lib/dates.js         // greeting + date text
src/components/*.jsx     // Shell, Rail, TopBar, BottomBar, LocationSwitcher, AccountMenu, Avatar, Logo
src/screens/SignIn.jsx, Home.jsx, LockScreen.jsx
src/styles/tokens.css, src/styles/app.css
```
- `package.json` scripts: `dev`, `build`, `preview`, `dev:preview-mode` (= `vite --mode preview`), with `.env.preview` containing `VITE_PREVIEW_MODE=1`.
- `.env.example`: `VITE_SUPABASE_URL=` and `VITE_SUPABASE_ANON_KEY=` with comments. `.gitignore` covers node_modules, dist, .env.local, .env.*.local.

### App states (App.jsx)
`loading` → `signedOut` (SignIn) → `home` ⇄ `locked`.
- On load: get session. If none → SignIn. If session: check 7-day rule from the token's amr (password timestamp older than 7 days → sign out, show SignIn with info line "For security, sign in with your password again." in the error/notice slot using the amber style). Then `get_my_profile()`. No row or `active=false` → sign out, show "This account doesn't have dashboard access. Ask an admin." 
- Lock persistence: the locked flag and last-activity time live in localStorage (`tkd.locked`, `tkd.lastActivity`) so a page reload or new tab cannot skip the lock. On load, if locked flag set OR last activity > 45 min ago → show Lock screen.
- Idle: activity events (pointerdown, keydown, wheel, touchstart, mousemove throttled) update `tkd.lastActivity` (throttle writes to ≤ 1 per 15s). Check every 30s and on `visibilitychange`. 45 minutes = 45*60*1000 ms; make it a single named constant.
- Sign out: `supabase.auth.signOut()`, clear `tkd.locked`, back to SignIn.

### Lock screen behavior
- Shows "Locked" (IconLock), large initials avatar, full name, "Enter your PIN", 4 dots.
- PC: typing digits on the keyboard fills dots (Backspace deletes); hint "Type the digits on your keyboard — no need to click". Touch (`pointer: coarse` OR width < 1024): on-screen keypad 1–9, blank, 0, "Del" (keys 36px tall, 64px wide, 8px gaps). Keypad also works with mouse.
- When 4 digits entered → `verify_pin`. `'ok'` → unlock (clear `tkd.locked`, set lastActivity now). `'wrong:N'` → clear dots, amber error with IconAlertTriangle: "That PIN didn't match. N tries left before your password is needed." (singular "1 try left"). `'password_required'` → sign out and show SignIn with notice "Sign in with your password to unlock." `'invalid'` → clear dots.
- If profile `has_pin` is false: instead of dots/keypad show text "You haven't set a PIN yet, so this screen unlocks with your password." and a primary "Sign in" button → signs out to SignIn. (Temporary until Set PIN exists.)
- "Not you? Sign out" link always visible → sign out.
- While verifying, ignore further input. Network failure → amber error "Couldn't check your PIN. Check the connection and try again." (does not count as attempt).
- No location switcher, no shell on this screen.

### Sign-in
- Centered card: logo (72px), "U.S. Taekwondo Center", "Sign in to the dashboard", Email, Password, primary "Sign in" (full width ONLY on phone < 640px), "Forgot password? Ask an admin to reset it." (plain text). No location switcher. No sign-up.
- Error: amber box with IconAlertTriangle above the button: "That email or password doesn't match. Try again." Never red.
- Button shows "Signing in…" and is not re-clickable while waiting.
- On success: clear `tkd.locked`, set `tkd.lastActivity` now, load profile.

### Shell + Home
- Desktop ≥ 1024px and fine pointer: 52px icon rail, one item Home (IconHome, current = blue tint `#E6EBF4` bg / `#003595` icon), dark label bubble on hover AND keyboard focus within 150ms ("Home"), aria-label="Home".
- Tablet 640–1023px, or any width ≥ 640 with coarse pointer: 72px rail, label "Home" always visible under the icon.
- Phone < 640px: no rail; bottom bar with one item Home (icon + label), 48px tall items.
- Top bar 48px: spacer, LocationSwitcher, Avatar button (initials from full_name, 28px circle, 12px text; touch tap area ≥ 44px). Nothing else.
- LocationSwitcher: segmented control Worcester | Shrewsbury | Both, 32px tall (36px on touch). Active option = blue tint bg + blue text + IconMapPin. Initial value = device default (`device.js`, key `tkd.deviceLocation`, default 'Worcester' when unset). Changing the switcher does NOT change the device default. role="radiogroup" with radio semantics and arrow-key support.
- Home content (padding 24px desktop/tablet, 16px phone): welcome header = logo 40px + greeting (20px, 500) + sub line "Thursday, October 15 · Worcester" (12px secondary; real current date, en-US long weekday + month + day; location = current switcher value, "Both" shows "Worcester and Shrewsbury"). Greeting: before 12:00 "Good morning", before 17:00 "Good afternoon", else "Good evening". 1px divider under header. Then centered gray line: "Nothing on Home yet. Items appear here as sections are added."
- Page title (document.title): "Home · U.S. Taekwondo Center"; sign-in: "Sign in · U.S. Taekwondo Center"; lock: "Locked · U.S. Taekwondo Center".

### Account menu
- Opens from the avatar. Desktop/tablet: dropdown 248px wide under the avatar, right-aligned. Phone: bottom sheet with dimmed backdrop. Avatar gets a 2px blue ring when open.
- Contents: who-line (full name 13px/500, then "email · Admin" or "email · Staff" 12px secondary); Lock now (IconLock); This device (IconMapPin) with current value on the right; separator; Sign out (IconLogout). Sign out is NOT red.
- "This device": clicking expands an inline choice under it — Worcester / Shrewsbury (radio items, check mark `IconCheck` on the selected one). Picking one saves the device default AND sets the switcher to it, then collapses.
- Close on: Esc, click/tap outside, choosing an item. Focus moves into the menu when opened and returns to the avatar on close. Arrow keys move between items.
- Rows 32px with mouse, 44px on touch.

### Preview mode (`VITE_PREVIEW_MODE=1`)
A fake backend so the screens can be tried without Supabase: any email + password `preview` signs in as "Jeffrey Berg" (jeffrey@ustc.com, admin, has_pin true); PIN `1234` correct; wrong PINs count down like the real rules (5 → password_required). A small amber banner at the very top: "Preview mode — not connected to the real database." Also expose `window.__tkdPreview = { lockNow(), setHasPin(bool) }` for testing. Session persists in localStorage like the real client.

### Visual rules (from the guidelines — enforce)
Colors: bg #FFFFFF, surface #F7F7F5, border #E5E5E2 (strong #CFCFCA), text #1F1F1F, secondary #6B6B6B, blue #003595 (hover #002A77, tint #E6EBF4), warning/error amber #633806 on #FAEEDA. No red anywhere except inside the logo image. Font: system-ui stack; sizes 20/16/14/13/12 only, min 12px; weights 400/500; sentence case. Radius 8px controls, 6px tags. Spacing 4/8/12/16/24/32. Flat: no gradients; only the dropdown menu may have a subtle shadow. Focus ring: 2px solid #003595 (outline-offset 2px) on every focusable element, never removed. Controls: 32px desktop; touch buttons/switcher 36px with ≥44px tap area; inputs 32px (36px on phone). Max one blue filled button per screen. No horizontal scrolling at 320px+ width. Icons 16px in controls, 18–20px in nav, stroke 1.75–2.
