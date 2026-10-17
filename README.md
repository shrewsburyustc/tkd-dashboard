# TKD Dashboard

The staff dashboard for Jae H. Jeong's U.S. Taekwondo Center (Worcester and Shrewsbury, MA).

So far it has the basics: **sign in**, an empty **Home** page, the **app frame** (rail, top bar, phone bottom bar), the **location switcher**, the **account menu**, the **lock screen** (per-account idle lock, 4-digit PIN), and the **account screens**: **Set your PIN**, **Change PIN** and **Change password**. Sections such as Color Belt testing get added one at a time later.

The design rules live in `docs/Dashboard Docs/TKD-Dashboard-Design-Guidelines.md`. The approved look is in `docs/Dashboard Docs/TKD-Home-Mockups.html` and `docs/Dashboard Docs/TKD-Account-Screens-Mockups.html`. The build contracts (what the database and the app agree on) are `docs/BUILD-CONTRACT.md` and `docs/CONTRACT-0002.md`.

---

## Run it

You need **Node.js 22** (LTS). Download it from nodejs.org. Node comes with `npm`, which downloads the packages the app uses.

Open a terminal in this folder, then:

```bash
npm install
```

This reads `package.json` and downloads everything into a `node_modules/` folder. Run it once, and again whenever `package.json` changes.

### Option A: try it without a database (preview mode)

```bash
npm run dev:preview-mode
```

Open the address it prints (usually http://localhost:5173). An amber strip at the top says you're in preview mode and reminds you of the password and PIN.

- **Sign in:** use any email, with the password `preview`. You're signed in as Jeffrey Berg (admin).
- **PIN:** `2580`. (`1234` no longer works as a PIN: straight runs like 1234 are refused as too easy.) Wrong PINs count down just like the real rules. After 5 wrong tries you need the password again.
- **Change PIN / Change password:** open the initials menu (top right). Both ask for the current password first: type `preview`. Preview never really changes the password, so `preview` keeps working afterwards. A new password shorter than 12 characters, or `preview` itself, gets the same messages the real Supabase gives. Like the real Supabase, preview also refuses the change if the current password isn't sent with it, or is wrong.
- **Test helpers:** open the browser console (F12 → Console) and type:
  - `__tkdPreview.lockNow()`: locks the screen right away (or signs you out, if no PIN is set).
  - `__tkdPreview.setHasPin(false)`: removes the PIN. **Reload** to see **Set your PIN** (it appears before Home whenever an account has no PIN). Or run `lockNow()` instead to see the "Signed out after being idle. Set a PIN to unlock faster." note. `setHasPin(true)` puts the PIN back to `2580`.
  - `__tkdPreview.setShared(true)`: pretends this is the shared front-desk account. Reload: the menu no longer has Change PIN or Change password. `setShared(false)` undoes it.
  - `__tkdPreview.setPasswordAgeMinutes(11)`: pretends you typed your password 11 minutes ago. Saving a PIN on **Set your PIN** then signs you out with "Sign in with your password again to set your PIN." (the database only accepts a new PIN within 10 minutes of typing the password).
  - `__tkdPreview.setPasswordAgeDays(8)`: pretends you typed your password 8 days ago. Reload the page to see the 7-day rule sign you out.

**Walk through every new screen in preview:**
1. In the console run `__tkdPreview.setHasPin(false)`, then sign in → **Set your PIN**. Try `1111` (too easy), then a PIN, then a different one (they don't match), then the same PIN twice → Home with a "PIN set" toast.
2. Initials menu → **Change PIN** → password `preview` → choose and confirm a new PIN → "PIN changed" toast. Esc or Cancel closes it at any step.
3. Initials menu → **Change password** → current `preview`, new password twice (12+ characters) → "Password changed" toast.
4. Initials menu → **Lock now** → unlock with your new PIN.
5. Make the browser window narrower than 640px (or use the browser's phone view, F12 → device toolbar) to see the phone versions: full-screen pages with a back arrow.

### Option B: the real thing (with Supabase)

1. Set up the database first: follow `supabase/SETUP.md`.
2. Copy `.env.example` to a new file named `.env.local`, and fill in the two values from Supabase (Project Settings → API).
3. Run:

```bash
npm run dev
```

If `.env.local` is missing, the page shows a "Setup needed" message telling you what to do.

### Other commands

| Command | What it does |
|---|---|
| `npm run build` | Makes the finished, optimized website in `dist/`. This is what gets deployed. |
| `npm run preview` | Serves `dist/` locally so you can check the build. (Despite the name, this has nothing to do with "preview mode".) |
| `npm run build:preview-mode` | Builds the fake-backend version, e.g. to show someone the screens. |

---

## What each file and folder is

```
index.html            The single HTML page. React draws every screen inside it.
vite.config.js        Settings for Vite (the dev server + build tool). Just "we use React".
package.json          The project's name, its commands (scripts), and the exact package versions.
.env.example          Template for .env.local (your Supabase URL + anon key).
.gitignore            Files git must never save (node_modules, dist, .env.local).
public/logo.png       The school logo, served as-is.
supabase/             The database side (tables, security rules, PIN functions). Has its own SETUP.md.
docs/                 All design docs (master copy): Dashboard Docs/ (guidelines, handoff, mockups, build contracts), Testing/ (Color Belt, Star Testing). See docs/README.md.

src/main.jsx          Starting point: loads the styles and draws <App />.
src/App.jsx           The "brain": decides which screen shows (sign-in, home, or lock) and enforces the rules.

src/screens/          Whole screens.
  SignIn.jsx          Email + password.
  SetPinScreen.jsx    "Set your PIN" — required after a password sign-in when the account has no PIN.
  Home.jsx            Welcome header + "Nothing on Home yet…" line.
  LockScreen.jsx      "Locked", the name, and the PIN dots (plus a keypad on touch screens).
  ChangePinDialog.jsx       Change PIN: password first, then choose + confirm the new PIN.
  ChangePasswordDialog.jsx  Change password: current, new, confirm.
  SetupNeeded.jsx     Developer message when .env.local is missing.

src/components/       Smaller building blocks used by the screens.
  Shell.jsx           The frame around signed-in pages (rail + top bar + content + bottom bar).
  Rail.jsx            Left navigation on PC/tablet.
  BottomBar.jsx       Bottom navigation on phones.
  navItems.js         The list of sections (just Home). Both nav bars read it.
  TopBar.jsx          The 48px bar: location switcher + initials button.
  LocationSwitcher.jsx  Worcester | Shrewsbury | Both.
  AccountMenu.jsx     The initials button and its menu (dropdown on PC/tablet, bottom sheet on phone).
  Avatar.jsx          The initials circle.
  Logo.jsx            The logo image.
  Notice.jsx          The amber message box with the warning triangle.
  PinEntry.jsx        PIN dots + on-screen keypad + hidden PIN box (lock screen, Set PIN, Change PIN).
  AccountDialog.jsx   The frame for Change PIN / Change password: dialog on PC/tablet, full page on phone.
  Toast.jsx           The 5-second "done" message ("PIN set", "PIN changed", "Password changed").
  PreviewBanner.jsx   The "Preview mode" strip.

src/lib/              Logic with no screens of its own.
  supabase.js         Creates the connection to Supabase (or the fake one in preview mode).
  mockClient.js       The fake backend for preview mode.
  session.js          Reads "last password sign-in" from the sign-in token (7-day rule).
  useIdleLock.js      The per-account idle auto-lock and the saved "locked" flag.
  serverLock.js       touch_session / lock_session: keeps the database's lock in step with the screen.
  useSessionHeartbeat.js  While someone is active, tells the database "still here" (at most once a minute).
  usePinDigits.js     The PIN typing rules (keypad, keyboard, hidden box) shared by every PIN screen.
  useNewPin.js        "Choose a PIN, then type it again" — shared by Set PIN and Change PIN.
  pinRules.js         The weak-PIN rule (no 1111, no 1234 / 4321) and the PIN messages.
  myPin.js            Saves your own new PIN (set_my_pin).
  confirmPassword.js  "Is this really you?" — re-checks the current password before a change.
  authErrors.js       Sorts sign-in errors into wrong password / no connection / too many tries.
  device.js           This device's default location (saved in the browser).
  dates.js            The greeting and date text.
  storage.js          Safe localStorage helpers (never crash if storage is blocked).
  useMediaQuery.js    Lets code ask "is this a touch screen / narrow screen?".

src/styles/
  tokens.css          Every color, size and spacing value from the guidelines, by name.
  app.css             All the styles, grouped by screen. Phone/tablet/PC/touch rules are at the bottom.
```

---

## React in three ideas

**Components.** A component is a JavaScript function that returns what to draw (written in JSX, which looks like HTML). Screens are built from small components. For example, `TopBar` uses `LocationSwitcher` and `AccountMenu`. Each component lives in its own `.jsx` file.

**State.** State is a value a component remembers between redraws, created with `useState`. Examples are the typed PIN digits or whether the menu is open. When state changes, React redraws that component automatically. You never update the page by hand.

**Props.** Props are the inputs a parent passes to a child, like arguments to a function. For example, `<Home location="Worcester" />`. Data flows down through props. When a child needs to change something, the parent passes a function (like `onChange`) for the child to call.

### How the pieces talk to each other

`App.jsx` holds the important state: the `phase` (`loading` → `signedOut` → `setPin` (only if no PIN yet) → `home` ⇄ `locked`), the signed-in `profile`, which account dialog is open, the toast, the switcher `location`, and this device's default location. It passes values down as props and gets function props back. For example, `LockScreen` calls `onUnlock()` when the PIN is right, and `App` then switches back to Home.

---

## How the lock works

- **When it locks:** after the account's idle time with no mouse, keyboard or touch activity, or when someone picks **Lock now**. The idle time belongs to the account and comes from the database (`idle_lock_minutes`): 45 minutes by default, 2 hours for the shared front-desk account. If the database doesn't say, the app uses 45 (`DEFAULT_IDLE_MINUTES` in `src/lib/useIdleLock.js`).
- **No PIN, no lock screen:** an account without a PIN is **signed out** instead of locked, with the note "Signed out after being idle. Set a PIN to unlock faster." In practice every account has a PIN, because **Set your PIN** is required after a password sign-in.
- **It survives reloads:** the "locked" flag and the last-activity time are saved in the browser (`tkd.locked`, `tkd.lastActivity`). Reloading the page or opening a new tab still shows the lock screen. Locking or unlocking in one tab also updates the others.
- **The database locks too (migration 0002):** the database keeps its own "unlocked until" time for each sign-in session.
  - On page load and right after signing in, the app asks it (`touch_session`). A brand-new password sign-in starts unlocked; a session older than its idle time starts **locked**, even if the browser's own flag was cleared. If the database says the password is needed (too old, account switched off, or 5 wrong PINs), the app signs out.
  - While someone is active, the app sends `touch_session` again, at most once a minute, to keep the session unlocked (`src/lib/useSessionHeartbeat.js`). If the answer is "locked", the screen locks too.
  - Whenever the lock screen shows (idle lock, **Lock now**, another tab, or a reload that opens on the lock screen), the app also tells the database (`lock_session`). The screen locks straight away even if that call fails. If it fails (for example, the device is offline), the app sends it again as soon as the browser is back online, and every 30 seconds meanwhile, until it works once.
  - A right PIN (`verify_pin`) or a newly saved PIN (`set_my_pin`) unlocks the session on the database side.
- **Unlocking:** the 4-digit PIN goes to the database (`verify_pin`), and the database decides whether it's right. The browser never sees the stored PIN. The full password is needed instead after 5 wrong PINs, or if the password was last typed more than 7 days ago.
- **Where you land:** the dashboard stays in memory behind the lock screen, so unlocking returns you to exactly where you were. (An open Change PIN or Change password closes when the screen locks; nothing in it is saved.)

**Why both locks:** the lock screen hides the dashboard from people looking at it, such as parents at the mat. On its own it is not a barrier against someone with technical tools (for example, the browser's developer tools) on an unattended, signed-in device. The database lock closes that gap: future data sections only hand out data to a session the database itself considers unlocked (`has_data_access()` in migration 0002). For anything longer than a short break, **Sign out** is still best.

## The account screens

- **Set your PIN** appears right after a password sign-in when the account has no PIN (first sign-in, or after an admin reset). It can't be skipped. Type the PIN, then type it again. PINs that are all the same digit (1111) or a straight run up or down (1234, 4321) are refused — the app checks first, and the database checks again.
- **Change PIN** (initials menu) asks for your password first, so nobody can quietly set a PIN on an unattended screen. Then choose and confirm the new PIN.
- **Change password** (initials menu) asks for the current password, then the new one twice (at least 12 characters). The app checks the current password first, then sends it to Supabase along with the new one (`updateUser({ password, current_password })`). That's needed because Supabase's **"Require current password when updating password"** setting is on: Supabase refuses a password change without it. Saving it signs out this account's other devices; this one stays signed in.
- The shared front-desk account doesn't show Change PIN or Change password. Only an admin changes those (see `supabase/SETUP.md`).
- On PC and tablet these open as a dialog (Esc or Cancel closes it). On phones they open as a full page with a back arrow.
- Success shows a toast for 5 seconds: "PIN set", "PIN changed", or "Password changed".

## Security notes

- The anon (publishable) key in `.env.local` is safe in the browser, because row-level security in the database decides what each signed-in person can read.
- The `service_role` / secret key must **never** go in this app, in `.env.local`, or in git.
- Every `.env` file except `.env.example` is listed in `.gitignore`, so git won't upload it.
- The app refuses to start if a **secret** key is put in `.env.local` by mistake.
