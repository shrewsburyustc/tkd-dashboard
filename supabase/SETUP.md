# Supabase setup: TKD dashboard

**What this file is:** the one-time steps to create the dashboard's database and the first admin logins. Do them in order. Each step says what to do, then why.

**What you need first:** the school's Supabase login (Owner of the "U.S Taekwondo Center" organization) and a password manager.

> **Rule for every step:** the `service_role` key (on newer projects it's called the **secret key**, starts `sb_secret_`) must never go in the app, in `.env.local`, in a chat message, or in git. It skips every security rule in the database. The app only ever uses the publishable key, also called the anon key (step 7).

---

## 1. Create the project

1. Sign in at supabase.com with the school account. Open the **U.S Taekwondo Center** organization.
2. Click **New project**.
   - Name: `tkd-dashboard`
   - Region: **US East** (closest to Massachusetts)
   - Database password: click **Generate a password**, then save it in your password manager **before** you click Create.
3. Click **Create new project** and wait a couple of minutes while it starts up.

**Why:**
- The project goes in the school organization so the school owns it, not your personal account (guidelines 10b).
- A region close to the school keeps the dashboard fast.
- The database password is the master key to the raw database. The app never uses it. You only need it for advanced tools later. If you lose it you can reset it, but the reset breaks anything that was using the old one.
- **Free plan limit:** a free organization can have 2 active projects. Color Belt staging is already #1, so this is #2, the last free one. A third project needs the Pro plan, or you pause or remove one.

---

## 2. Run the database migration

1. In the project: left sidebar, **SQL Editor**, then **New query**.
2. Open `supabase/migrations/0001_staff_and_pin.sql`, copy **the whole file**, paste it, and click **Run**.
3. You should see "Success. No rows returned."
4. Check it worked by running:

```sql
-- Should list 9 functions: admin_set_staff_pin, current_session_id,
-- get_my_profile, is_active_staff_with_fresh_password, is_admin,
-- last_password_sign_in_at, password_signed_in_recently,
-- staff_set_updated_at, verify_pin
select routine_name
from information_schema.routines
where routine_schema = 'public'
order by routine_name;
```

Then open **Table Editor**. You should see two tables, `staff` and `pin_attempts`. Neither should be labelled "Unrestricted" or "RLS disabled".

**Why:**
- This creates the tables, the PIN functions, and the security rules in one go. If any part fails, Postgres keeps none of it, so you never end up half-built.
- `pin_attempts` counts wrong PINs **per device sign-in** (per session), not per person. A correct PIN on the office PC can't reset the count on a tablet someone else is guessing at.
- The migration also makes every table and function created **later** private by default. Each future migration has to grant access on purpose.
- It's safe to run again. It won't duplicate anything, but it also won't change the columns of a table that already exists. Later changes go in a new file (`0002_...`).

---

## 3. Lock down sign-ins

**3a. Turn off public sign-ups**

1. Go to **Authentication**, then **Sign In / Providers**.
2. Turn **off** "Allow new users to sign up". Save.
3. Leave the **Email** provider **on**.
4. On the same page, make sure **Allow anonymous sign-ins** is **off**. (If it were on, anyone on the internet could get a signed-in session without any account.)
5. You don't need to change "Confirm email". Admins create users with **Auto Confirm User** ticked (step 4), so no confirmation email is involved.

**3b. Password rules**

1. In **Authentication**, find the password settings. Supabase moves this between dashboard versions; look for **Policies**, **Password settings / Password security**, or inside the **Email** provider under **Sign In / Providers**.
2. Set **Minimum password length** to **12**. Save.
3. **Leaked password protection** ("Prevent use of leaked passwords") is a **Pro plan** feature. The free plan doesn't have it. When the school upgrades to Pro, come back and turn it on.
4. Do this **before** step 4, so your own password has to meet the rule.

**3c. Protect password changes**

In the same password / Email provider settings:

1. Turn **on** **Require current password when updating password**.
2. Turn **on** **Secure password change**.
3. Under **Authentication → Emails** (or Notifications), turn **on** the **password changed** notification email if your dashboard version has it.

**Why:** without these, anyone with a few minutes at a signed-in device (even a locked one, using the browser's developer tools) could set a new password and take over that account — including an admin account. Requiring the current password closes that hole. Dashboard labels move between Supabase versions; if you can't find one, tell Claude what you see.

**Why:**
- With sign-ups on, anyone who finds the app's address could make themselves an account. With sign-ups off, the only way in is an account an admin created (guidelines section 5: no shared logins, no self-service).
- 12+ characters makes a password far harder to guess. Leaked password protection blocks passwords already published in data breaches.
- **Important to understand:** even with no "email me a link" button in the app, Supabase's Email provider still accepts **magic-link** and **password-recovery** requests sent straight to its API. Anyone who controls a staff member's inbox could use one to get a signed-in session **without the password**. That's why every data rule in the database also requires `is_active_staff_with_fresh_password()`. A session only counts if it came from a **password** sign-in within the last 7 days and the person is active staff. A magic-link or recovery session can't read data or use the PIN. **But it is not harmless:** a recovery session can still set a new password, and then sign in properly with it. Turning on 3c reduces this; the remaining protection is that staff keep their email accounts secure. **Every future table's security rule must include this check** (the migration file explains how).

---

## 4. Create the first admin (you)

**4a. Create the login**

1. **Authentication**, then **Users**, then **Add user**, then **Create new user**.
2. Enter your email and a strong password (12+ characters). Save it in your password manager.
3. Tick **Auto Confirm User**, then click **Create user**.
4. Click the new user and copy its **UID** (a long ID like `3f2b...-...`).

**4b. Make the login a dashboard admin.** In **SQL Editor**, paste this, fill in the three `<...>` values, and Run:

```sql
-- Links the login (auth.users) to a dashboard staff row and makes it an admin.
-- Safe to re-run: if the row already exists it is updated instead of duplicated.
insert into public.staff (id, full_name, email, role)
values (
  '<paste-user-UID-here>',            -- the UID you copied in 4a
  '<Full name>',                      -- e.g. how your name should show in the app
  '<login-email@example.com>',        -- the same email you used in 4a
  'admin'
)
on conflict (id) do update
  set full_name = excluded.full_name,
      email     = excluded.email,
      role      = excluded.role,
      active    = true;
```

**Why:**
- A Supabase login by itself does **not** get into the dashboard. The app also needs a matching `staff` row, and refuses anyone without an active one ("This account doesn't have dashboard access. Ask an admin."). That gives you two separate switches: who can sign in, and who can use the dashboard.
- **Auto Confirm User** skips the confirmation email, because you are creating the account yourself.
- You do this in the SQL Editor because there's no Staff accounts screen yet (decision v0.23: no setup screen or script).

---

## 5. Give yourself a PIN (temporary method)

> **Temporary.** Use this only until the **Set PIN** screen is built. After that, people set their own PIN in the app and you won't need this snippet. To change the **front desk's** PIN later, use the section [Admin: change the front-desk PIN or password](#admin-change-the-front-desk-pin-or-password).
>
> **Needs migration 0002.** The snippet uses two things 0002 adds: the weak-PIN check (`pin_is_too_easy`) and the server lock table (`session_unlock`). If you get `function public.pin_is_too_easy(text) does not exist` or `relation "public.session_unlock" does not exist`, apply 0002 first (section 9). On a brand-new project, run the whole 0002 file right after 0001 in step 2.

In **SQL Editor**, paste this, replace `<4-digit-PIN>` and `<paste-user-UID-here>`, and Run:

```sql
-- Sets (or replaces) one person's 4-digit unlock PIN. Stores only a bcrypt
-- hash; the PIN itself is never saved in the table. Also clears their
-- wrong-PIN counts (a device that hit 5 wrong PINs STAYS locked - it needs
-- the password), and locks every device they're signed in on right now,
-- so each one asks for the new PIN.
with new_pin as (
  select '<4-digit-PIN>'::text as pin          -- type the PIN ONLY here
),
updated as (
  update public.staff as s
     set pin_hash = extensions.crypt(n.pin, extensions.gen_salt('bf', 10))
    from new_pin as n
   where s.id = '<paste-user-UID-here>'
     and n.pin ~ '^[0-9]{4}$'                  -- refuses anything that is not exactly 4 digits
     and not public.pin_is_too_easy(n.pin)     -- refuses 1111, 1234, 4321, ...
  returning s.id, s.full_name
),
cleared as (
  delete from public.pin_attempts as a         -- clear wrong-PIN counts...
   using updated as u
   where a.staff_id = u.id
     and a.locked_at is null                   -- ...but keep PIN-locked devices locked
  returning a.session_id
),
locked as (
  update public.session_unlock as l            -- lock their devices now
     set unlocked_until = now(),
         updated_at     = now()
    from updated as u
   where l.staff_id = u.id
  returning l.session_id
)
select u.full_name,
       'PIN set' as result,
       (select count(*) from cleared) as device_counters_cleared,
       (select count(*) from locked)  as devices_locked
from updated as u;
```

- **1 row returned** ("PIN set"): it worked.
- **0 rows returned**: the PIN wasn't exactly 4 digits, it was too easy (all the same digit like 1111, or a straight run up or down like 1234 or 4321), or the UID is wrong. Fix it and run again.
- Supabase may warn about **destructive operations** (the `delete` line). Expected; confirm.

> **Warning: don't leave your real PIN in the editor.** The SQL Editor saves your queries as snippets in its sidebar. Right after it works, either replace your PIN in the query with `XXXX` or delete the snippet. Don't save this file anywhere with a real PIN in it, and never commit it to git.

**Why:**
- The lock screen unlocks with your own 4-digit PIN (guidelines section 5). Until a screen exists to set one, the SQL Editor is the only way.
- `extensions.crypt(..., extensions.gen_salt('bf', 10))` creates a **bcrypt hash**, a one-way scramble. Even someone who could read the table can't turn the hash back into your PIN.
- The weak-PIN check is the same rule the app and the database use everywhere else.
- A new PIN clears that person's wrong-PIN counts, so devices start counting again. A device that already hit **5 wrong PINs stays locked**: it might be lost or stolen, and a new PIN shouldn't hand it 5 more guesses. Its owner signs in with the password on it instead.
- **Locking** their devices (setting the time to "now") makes every device ask for the new PIN. It can only lock, never unlock. If you run this for yourself, your own dashboard tab locks too; unlock it with the new PIN.
- Why not call `admin_set_staff_pin()`? In the SQL Editor you aren't signed in as a staff member, so the function can't tell you're an admin, and it correctly refuses. Keeping that check strict is safer than adding a back door for the editor. The future Set PIN and Staff accounts screens will call that function as a signed-in admin.

---

## 6. Add the grandmaster as the second admin

Repeat **step 4** (new login, then the `insert` snippet with his UID, name, email, and `'admin'`) and **step 5** (his PIN). Let him type his own PIN into the snippet if possible, then clear it from the editor.

**Why:** with two admins, one person being away or locked out never locks the school out of its own dashboard (decision v0.23). The dashboard admin role is separate from Supabase organization ownership, which stays with the school account.

---

### 6b. Check that both rows exist

```sql
-- Staff rows with a yes/no for "has a PIN" and how many devices are PIN-locked.
-- Never shows the PIN hash itself.
select s.id,
       s.full_name,
       s.email,
       s.role,
       s.active,
       s.pin_hash is not null as has_pin,
       (select count(*)
          from public.pin_attempts a
         where a.staff_id = s.id
           and a.locked_at is not null) as locked_devices
from public.staff s
order by s.created_at;
```

You should see both admins with `role = admin`, `active = true`, `has_pin = true`, and `locked_devices = 0`.

**Why:** this catches a typo'd UID, a wrong role, or a PIN that didn't save before you try signing in and wonder why the app won't let you in.

---

## 7. Connect the app

1. In the project: **Project Settings**, then **API Keys** (on some projects: **Project Settings**, then **API**).
2. Copy the **Project URL** (looks like `https://abcdefgh.supabase.co`, also shown under **Data API**).
3. Copy the **publishable key** (starts `sb_publishable_`). On older-style projects it's the **anon / public** key (a long `eyJ...` string). Either one works.
4. In the project folder, copy `.env.example` to a new file named `.env.local` and fill it in:

```
VITE_SUPABASE_URL=https://abcdefgh.supabase.co
VITE_SUPABASE_ANON_KEY=<the publishable / anon key>
```

**Why:**
- The app needs to know which project to talk to (the URL) and needs a key to identify itself (the publishable/anon key).
- **The publishable/anon key is safe in the browser.** Anyone can see it in the page code, and that's expected. It only gets someone as far as the security rules allow:
  - not signed in: they can read nothing
  - signed in with a password in the last 7 days as active staff: only their own row (admins: all rows, but only while their session is unlocked), and never PIN data
  - anything else: nothing

  Row Level Security protects the data, not secrecy of this key.
- **The `service_role` / secret key is NOT safe anywhere near the app.** It ignores Row Level Security completely, so whoever has it can read and change everything. Never put it in `.env.local`, the code, git, or a screenshot. If it ever leaks, rotate it right away in **Project Settings**, then **API Keys**.
- `.env.local` is listed in `.gitignore`, so it is never uploaded to GitHub.

---

## 8. (Optional, recommended) Run the PIN tests

Open `supabase/tests/verify_pin_tests.sql`, paste your UID into the one marked line, paste the whole file into a new SQL Editor query, and Run. You should get one row: **ALL PIN TESTS PASSED**.

**Why:** the script checks the security rules for real:
- wrong-PIN countdown per device
- a correct PIN on one device can't reset another device's count
- the lock on the 5th wrong try stays locked for that sign-in
- a new password sign-in starts fresh
- the 7-day rule
- magic-link sessions refused
- dry-run requests refused
- the browser can't read PIN data

It undoes all its changes at the end (`rollback`), so your real PIN and data are untouched.

**After migration 0002:** paste a UID of **either** account. With an admin's UID, test 14 checks that an admin **can't** set their own PIN through `admin_set_staff_pin` (a 0002 rule); with the desk's UID it checks that a non-admin can't set any PIN. Then run the 0002 tests too (section 9, step 4). (Before 0002, use a non-admin UID: test 14 already expects the 0002 rule.) The test briefly adds its pretend sign-ins to `auth.sessions` (undone at the end); if you get a **TEST SETUP** error about that, tell Claude.

---

## 9. Migration 0002: server-side lock and account screens

**What it does** (`supabase/migrations/0002_server_lock_and_accounts.sql`):
- **Makes the lock screen real on the server.** A new table, `session_unlock`, records for each device sign-in whether it is unlocked, and until when. A locked session — or one that hit 5 wrong PINs, was signed out, came from a magic link / recovery email, or is more than 7 days past its password sign-in — gets **no data**. This is the "hard gate" from guidelines 10b that must be in before any student data.
- **Idle time per account:** new `staff.idle_lock_minutes` (default 45). The front desk (`shrewsburyustc@gmail.com`) is set to **120**.
- **Shared account flag:** new `staff.is_shared`. The front desk is marked shared: it sets its PIN once at its first sign-in, and can't change its PIN or password from the app afterwards (only an admin can — see the next section).
- **Account screens:** `set_my_pin` for the Set your PIN and Change PIN screens. Weak PINs (1111, 1234, 4321, …) are refused.
- **Tighter admin rules:** `is_admin()` now also needs a password sign-in within 7 days; `admin_set_staff_pin` refuses your own account, needs an unlocked session, refuses weak PINs, and leaves devices that hit 5 wrong PINs locked.
- **Staff read rule:** an admin sees the other staff rows only while their session is unlocked; a locked admin session sees just its own row. (`is_admin()` on its own is never enough to see data — it's always paired with `has_data_access()`.)
- **Signed-out devices are refused at once:** if a sign-in is ended (signed out, or removed by an admin), the database stops answering it straight away — no data, no PIN tries, no PIN changes — even though the browser's login token would otherwise keep working for up to an hour.

**How it's applied (two parts).** Claude's Supabase connection refuses any SQL that contains the word DELETE, so 0002 also comes split in two (`supabase/manual/`):

1. **Part A — Claude applies it** through the connection: `0002a_connector_part.sql`. Claude tells you when it's done.
2. **Part B — you run it** in the SQL Editor: open `supabase/manual/0002b_functions_with_delete_RUN_IN_SQL_EDITOR.sql`, copy the whole file, then in Supabase **SQL Editor → New query**, paste and **Run**. Supabase will probably warn that the query has **destructive operations** — that's expected (the DELETE lines inside the functions only run later, during normal use). Confirm. You should see "Success. No rows returned."
   - If you see `relation "public.session_unlock" does not exist`, part A hasn't been applied yet. Nothing changed; tell Claude.
3. **Check it worked.** Run:

```sql
-- Should list 19 functions: the 9 from 0001 plus
-- clear_pin_attempts_for, cleanup_session_unlock, has_data_access,
-- lock_session, mark_session_unlocked, pin_is_too_easy, session_exists,
-- session_is_pin_locked, set_my_pin, touch_session
select routine_name
from information_schema.routines
where routine_schema = 'public'
order by routine_name;

-- The front desk should show 120 / true, everyone else 45 / false.
select full_name, email, idle_lock_minutes, is_shared
from public.staff
order by created_at;

-- The server lock needs to read Supabase's own list of sign-ins.
-- This should return a number (any number). If it says "permission denied",
-- tell Claude: until that's fixed, the database would refuse ALL data.
select count(*) from auth.sessions;
```

4. **Run both test files** (each in its own new query; both undo everything they do):
   - `supabase/tests/0002_tests.sql` — replace `<paste-admin-UID-here>` with your UID and `<paste-desk-UID-here>` with the front desk's UID (Authentication → Users). Expected: one row **ALL 0002 TESTS PASSED**.
   - `supabase/tests/verify_pin_tests.sql` again (step 8). Expected: **ALL PIN TESTS PASSED**.

   The 0002 tests briefly add pretend sign-ins to `auth.sessions` (undone at the end). If you get a **TEST SETUP** error about that, tell Claude.

**For a brand-new project** (not the one already running): run the whole `supabase/migrations/0002_server_lock_and_accounts.sql` in the SQL Editor instead of the two parts. Running part A then part B gives exactly the same result as the whole file.

**Why:**
- Before 0002, only the **browser** decided whether the screen was locked. Someone with the browser's developer tools could skip the Lock screen and still read data with the signed-in person's login. Now the database itself refuses a locked session, so skipping the screen gets nothing.
- **Rule for every future data table** (students, attendance, billing, …): its security rule must include `(select public.has_data_access())`. That one check covers active staff + 7-day password + still signed in + not PIN-locked + unlocked right now.
- A session that sat unused for longer than its idle time (a tab left open overnight) starts **locked** when the app reopens, even if the browser forgot it was locked.

---

## 10. Migration 0003: Testing → Classes and ranks

**What it does** (`supabase/migrations/0003_testing_classes_ranks.sql`):
- **Four new tables:** `locations` (the two schools), `testing_classes`, `testing_ranks` (prices in cents, sparring gear, and the rank's **belt**: five `belt_*` columns, see below), and `change_log`, an **append-only history** of every change for the whole dashboard (who, when, which app action, old and new values).
- **Reading:** any active staff member whose session is **unlocked** (`has_data_access()` from 0002) can read classes and ranks for both schools. A locked, PIN-locked, signed-out, magic-link or 8-day-old session sees nothing. Nobody in the app can read `change_log`, or the login ids in `created_by` / `updated_by`. The `service_role` (secret key) gets **nothing** on these tables and functions either, because the app never uses it.
- **Changing:** only admins, and only through 8 database functions (`testing_add_class`, `testing_update_class`, `testing_reorder_classes`, `testing_delete_class`, `testing_add_rank`, `testing_update_rank`, `testing_reorder_ranks`, `testing_delete_rank`). Nobody can write to the tables directly. Each function checks the session first, then the admin role, then the input, then that nothing changed since the screen loaded ("stale").
- **Final award, three states** (v0.62): a **rank** (what students get after the class's last rank), **None** (the last rank doesn't promote, on purpose, e.g. Group D and Teen/Adult whose last rank is Dan-testing practice), or **Not set** (not decided yet; the app shows an amber reminder). The database refuses "a rank and None" at the same time.
- **Belts** (v0.64/v0.65): each rank stores what its belt looks like, for the small belt picture: `belt_pattern` (`solid`, `stripe` = a middle stripe, `half` = top/bottom halves), `belt_color`, `belt_color_2` (the stripe or bottom half; empty for solid, never the same as `belt_color`), `belt_end_stripes` (0–3) and `belt_end_stripe_color` (always set, default `yellow`, even with 0 end stripes). Colors come from a fixed list of 9 (white, yellow, orange, green, blue, purple, red, brown, black). One table rule (`testing_ranks_belt_check`, using the helper `testing_belt_is_valid`) refuses any other belt, and the two rank functions answer `invalid` for one — the same rules as the app's `belts.js`. Ranks that existed before the belt columns get a plain white belt. Changing only the belt counts as a change (new version, history row).
- **Automatic bookkeeping** (triggers): version numbers, "Last changed by", the history rows, and the rules that a class can't change school, a rank can't change class, and a final award can't be one of the class's own ranks. The class and rank tables also refuse `TRUNCATE` (emptying a table in one go), because that would skip the history.
- **One change at a time per school:** every change function locks its school first, so two admins saving at the same moment simply take turns (no "deadlocks").

**Before you start:** the 0002 open items in the handoff are done. `verify_pin_tests.sql` and `0002_tests.sql` both pass in production (section 9, step 4).

### 10a. Apply 0003 (you, in the SQL Editor)

1. Open `supabase/migrations/0003_testing_classes_ranks.sql` and copy **the whole file**.
2. In Supabase, go to **SQL Editor**, then **New query**. Paste it and click **Run**.
3. Supabase will warn that the query has **destructive operations**. That's expected. The words *delete* and *drop* are inside rules (`on delete cascade`), inside the two delete functions (they only run later, when an admin deletes something in the app), and in `drop … if exists` lines that make re-running safe. **Nothing is deleted now.** Confirm.
4. You should see "Success. No rows returned." The file is one transaction (`begin;` … `commit;`). If you see any error, nothing was kept. Copy the error to Claude.

**Running it again** is safe **only until a later migration (0004 or later) changes any of these tables, functions or rules.** After that, re-running this old file would put the old versions back. Never re-run it then.

**Why the SQL Editor and not Claude's connection:** the connection cancels any SQL containing the words *delete* or *drop*, and almost every part of 0003 contains one of them. So the connection is only used for the read-only checks below.

### 10b. Read-only checks (Claude runs these through the connection)

Claude runs these and reports the results. None of them change anything.
1. `select version();` must say **PostgreSQL 15 or newer** (production is 17). The final-award rule `on delete set null (final_award_rank_id)` needs 15+.
2. **List tables:** `locations`, `testing_classes`, `testing_ranks`, `change_log` exist, each with RLS enabled.
3. **Fingerprints:** run `supabase/tests/0003_fingerprints.sql`. It lists all 19 functions with their arguments, code fingerprint (md5), security-definer flag, settings, owner and who may call them. Every line must match exactly what `supabase/tests/pglite/run.mjs` printed for the tested copy. A match means production has exactly the code and call rights that passed the tests.
4. **Security advisor** (`get_advisors`, security). These notices are **expected**, by design:
   - "RLS enabled, no policy" (INFO) on `public.change_log`: nobody in the app may read it.
   - "Security definer function executable by authenticated" (or similar) for the 8 `testing_*` app functions: they are the only way to write, and each checks access and admin role itself. The same applies to the 0001/0002 functions the app calls.

   Anything else about the 0003 tables or functions (for example, a table without RLS, or a function without a fixed `search_path`) is a real problem. Claude reports it before anything else happens.

### 10c. Run the 0003 tests (you, in the SQL Editor)

1. Open `supabase/tests/0003_tests.sql`. Replace `<paste-admin-UID-here>` with your UID and `<paste-desk-UID-here>` with the front desk's UID (**Authentication → Users**).
2. Paste the whole file into a new query and click **Run**. Supabase may warn about destructive operations, because the test checks that deletes are **refused**. Everything is rolled back. Confirm.
3. Expected: one row, **ALL 0003 TESTS PASSED**. If it fails, you get an error starting with `TEST FAILED:` (or `TEST SETUP:`). Nothing is saved either way. Run `rollback;` on its own once, then tell Claude.
4. Then run `0002_tests.sql` and `verify_pin_tests.sql` again (section 9, step 4). 0003 must not have broken them.

The test creates its own classes named `zz test …` and rolls them back, so it works **before and after** the seed. Run it both times.

### 10d. The seed: copying the classes and ranks in (later, separate OK)

The real list (7 classes, 42 ranks per school) is copied from the old Color Belt project with `supabase/manual/0003s_seed_classes_and_ranks.sql`. It is generated by `make_seed.mjs`. **Don't run it as part of 0003.** It needs its own OK, after you've checked the review table Claude shows you (names, order, prices, sparring, final awards, and each rank's belt in plain English).
- Run it the same way (SQL Editor, whole file). It skips any school that already has classes, so running it twice adds nothing.
- Afterwards, run `0003_tests.sql` again (10c).
- In the history its rows show as action `seed` by "Initial copy from the old system".

### 10e. Undo 0003 (only if something is badly wrong)

> **This deletes every testing class and rank** (including anything typed in since). Put the app back to the version without the Testing section **first**, so nothing calls these functions. Then run this in the SQL Editor. It is one transaction (all or nothing). Supabase will warn about destructive operations. This time that is real.

```sql
-- Undo migration 0003: removes the Testing tables, functions and triggers.
-- change_log (the history) is KEPT, with its append-only protection,
-- unless Jeffrey decides otherwise (see the optional part below).
begin;

-- the 8 app functions
drop function if exists public.testing_add_class(text, text, uuid, boolean);
drop function if exists public.testing_update_class(uuid, integer, text, uuid, boolean);
drop function if exists public.testing_reorder_classes(text, uuid[], uuid[]);
drop function if exists public.testing_delete_class(uuid, integer, uuid[], uuid[], boolean);
drop function if exists public.testing_add_rank(uuid, text, integer, integer, integer, boolean, text, text, text, integer, text);
drop function if exists public.testing_update_rank(uuid, integer, text, integer, integer, integer, boolean, text, text, text, integer, text);
drop function if exists public.testing_reorder_ranks(uuid, uuid[], uuid[]);
drop function if exists public.testing_delete_rank(uuid, integer, integer, uuid[], uuid[]);

-- the two tables (one statement, because they point at each other);
-- their triggers, rules and indexes go with them
drop table if exists public.testing_ranks, public.testing_classes;

-- helpers and trigger functions only the testing tables used
drop function if exists public.testing_classes_before_write();
drop function if exists public.testing_ranks_before_write();
drop function if exists public.testing_normalize_name(text);
drop function if exists public.testing_name_is_valid(text);
drop function if exists public.testing_cents_is_valid(integer);
drop function if exists public.testing_ids_are_valid(uuid[]);
drop function if exists public.testing_belt_is_valid(text, text, text, integer, text);
drop function if exists public.testing_refuse_truncate();

-- the schools lookup
drop table if exists public.locations;

commit;
```

**Optional, only if Jeffrey says so:** also remove the history and its functions. Every recorded change is lost.

```sql
begin;
drop table if exists public.change_log;
drop function if exists public.change_log_write();
drop function if exists public.change_log_actor_name();
drop function if exists public.change_log_refuse_change();
commit;
```

**Why:**
- **Only through functions:** with no direct writes, every change passes the same checks: unlocked session, admin, valid name and price, not stale. And every change lands in the history with who made it (guidelines section 5).
- **`has_data_access()` first, then `is_admin()`:** an admin's locked or magic-link session gets "no access" before its role is even looked at. `is_admin()` is never a gate on its own (0002 rule). The tests prove the order with the front desk's locked session.
- **Stale protection:** two admins on two devices can't silently overwrite each other. The second save is refused and the screen reloads. Delete confirmations are protected too: if the class or rank changed after the dialog opened, nothing is deleted.
- **The history can't be edited:** updates, deletes and truncate are refused, even from the SQL Editor, unless someone deliberately removes that protection (the database owner can switch the trigger off). Later sections must leave sensitive columns (PIN hashes, medical notes) out of it.

---

## 11. Migration 0004: Staff accounts (reset password / PIN)

**What it does** (`supabase/migrations/0004_staff_accounts.sql`, rulebook v0.70–v0.76):
- **`admin_list_staff()`** returns the Staff accounts list: name, email, role, shared or not, and "is this me". It never returns PINs, password data or sign-in details. Admins only, unlocked session.
- **`admin_reset_password(staff_id, new_password)`** sets a new password for **someone else**. In one all-or-nothing step it:
  - saves the password as a bcrypt hash in `auth.users`, the same way Supabase Auth does;
  - cancels every emailed or texted link (password reset, magic link, email change, confirmation);
  - **signs the person out on every device**;
  - writes one history row (`change_log`): who reset whose password, and how many devices were signed out. **Never the password.**

  It refuses: non-admins; a locked, PIN-locked, signed-out or 8-day-old session; an admin whose **password sign-in was more than 10 minutes ago** (the app's "Confirm it's you" step handles that); your own account; inactive, deleted or banned logins; passwords under 12 characters or over 72 bytes.
- **`admin_reset_pin(staff_id, pin)`** sets a new 4-digit PIN for someone else, with the same checks plus the weak-PIN rule. It clears their wrong-PIN counts, but a device that hit 5 wrong PINs **stays locked**. Nobody is signed out.
- **`admin_set_staff_pin`** (from 0002) **can no longer be called by the app.** `admin_reset_pin` replaces it, and has the 10-minute rule. Its code is unchanged.
- **No secret key:** these functions run as the database owner, which is allowed to change Supabase Auth's tables (checked 2026-10-17). If Supabase ever changes those tables, a reset fails with an error and **changes nothing**. The fingerprint check below spots it first.

**Before you start:** 0001–0003 are applied, and their tests pass.

**Status:** applied to production 2026-10-17; 11b checks and 11c tests passed. The screens are **live** since 2026-10-17 (rulebook v0.84): use **Staff accounts** on the live site. 11d was done with the local app before the deploy.

### 11a. Apply 0004 (you, in the SQL Editor)

1. Copy **the whole file** `supabase/migrations/0004_staff_accounts.sql`.
2. **SQL Editor → New query**, paste, **Run**.
3. Supabase will warn about **destructive operations**. That's expected: the word *delete* is inside the reset function (it removes sign-ins and emailed links later, only when an admin resets a password). **Nothing is deleted now.** Confirm.
4. You should see "Success. No rows returned." It's one transaction: on any error nothing is kept. Copy the error to Claude.

**Running it again is safe.** You **must** run it again if 0001 or 0002 is ever re-run, because those would give `admin_set_staff_pin` back to the app. `0002_tests.sql` and `0004_tests.sql` both fail until you do.

### 11b. Read-only checks (Claude runs these through the connection)

1. **Fingerprints:** `supabase/tests/0004_fingerprints.sql`. Every line must match what `supabase/tests/pglite/run.mjs` printed for the tested copy:
   - the 5 functions, with code fingerprint, settings, owner and call rights;
   - the Supabase Auth columns 0004 relies on;
   - the triggers: only `staff_set_updated_at`, and **none** on the Auth tables.
2. **Security advisor:** "security definer function executable by authenticated" for `admin_list_staff`, `admin_reset_password` and `admin_reset_pin` is **expected**. They are how the app calls them, and each one checks access itself. Anything else about 0004 is a real problem.
3. **No triggers** on `auth.users`, `auth.sessions`, `auth.refresh_tokens`, `auth.one_time_tokens` or `auth.flow_state` (part of the fingerprints). The tests in 11c add throwaway rows to those tables, so this is checked before you run them.

### 11c. Run the 0004 tests (you, in the SQL Editor)

1. Paste the whole `supabase/tests/0004_tests.sql` into a new query and click **Run**. **No UIDs to fill in**: it makes its own throwaway logins (`zz-test-…@example.com`) and never touches the real accounts. Supabase may warn about destructive operations. Everything is rolled back. Confirm.
2. Expected: one row, **ALL 0004 TESTS PASSED**. A failure shows `TEST FAILED:` / `TEST SETUP:`. Nothing is saved either way. Run `rollback;` once on its own, then tell Claude.
3. Then run `0002_tests.sql` and `verify_pin_tests.sql` again (section 9, step 4). Test 12 in 0002 now checks that the app can't call `admin_set_staff_pin`.

### 11d. The real check (you, with the local app on the real database)

Do this **outside class hours**: resetting the desk password signs every desk device out.
1. `Start dashboard.bat`, then sign in as yourself.
2. Initials → **Staff accounts** → Staff → ⋯ → **Reset password**: your password, then **Generate**, **Copy**, save it in the password manager, then **Reset password**. The toast says how many desk devices were signed out.
3. On a desk device, within about a minute it shows the sign-in screen. The new password works there, and the old one doesn't.
4. Same for **Reset PIN**: the new desk PIN works on the desk device right away.
5. Clipboard: the copied password stays on the clipboard until something else is copied. Copy something harmless afterwards.

### 11e. Undo 0004 (only if something is badly wrong)

Put the app back to a version without Staff accounts **first**. Then:

```sql
-- Undo migration 0004. Passwords and PINs already reset stay as they are.
begin;
drop function if exists public.admin_list_staff();
drop function if exists public.admin_reset_password(uuid, text);
drop function if exists public.admin_reset_pin(uuid, text);
drop function if exists public.staff_admin_gate();
-- Give admin_set_staff_pin back to the app ONLY together with removing the
-- functions above (0002's state). Leave this line out if nothing calls it.
grant execute on function public.admin_set_staff_pin(uuid, text) to authenticated;
commit;
```

**Why:**
- **No secret key, ever** (handoff §6): the alternative, a server function holding the full-power key, was rejected in v0.71.
- **Your password first + 10 minutes:** an admin screen left unlocked can't be used to take over another account, including the other admin's (v0.74).
- **Signs out everywhere and cancels links:** a reset usually means someone shouldn't have the old password. Without this, they'd keep access for up to 7 days (v0.72).
- **Supabase extras skipped:** no "password changed" email, and no leaked-password check (Pro plan only, off today). Accepted in v0.71.
- **Sign-in providers:** the reset closes email sign-ins only. Keep **Authentication → Sign In / Providers** on **email only**. Don't turn on Google or others without a new decision.

---

## 12. Migration 0005: Color Belt phase 2 (events, family form, payments, school addresses)

**What it does** (`supabase/migrations/0005_testing_events.sql`, contract `docs/Dashboard Docs/Build contracts/CONTRACT-0005.md` §1):
- **Events:** `testing_events` (one school, one testing day, the Open / Closed switch, an optional automatic closing date, a random 8-character link code), and the event's own **copy** of the classes and ranks it tests (`testing_event_classes`, `testing_event_ranks`): names, belts, prices and final award are copied when a class is added, and later changes in Classes and ranks never change the event.
- **Registrations:** `testing_registrations` (names, belt, paying by, the 3-stripes tick, a `CB-` reference, the drawn signature for form entries) and **append-only** `testing_payments` (a mistake is fixed by a reversal row; rows are never changed). The drawn signature can **never** be read by the app, is **never** copied into `change_log` (the history shows "on file"), and is removed automatically **90 days after the testing date**.
- **The family form:** a new restricted login, **`testing_registrar`**, used only by the Cloudflare Function (through Hyperdrive). It can run exactly two functions (`testing_public_event`, `testing_public_register`) and nothing else: no table, no other function, can't create anything, isn't part of any role, and Supabase's API can't switch into it. Every call is counted for a rate limit in `testing_public_attempts` (a hashed key, never a raw IP).
- **School addresses:** four columns on `locations` (street, city, state, ZIP), changed by admins in **Settings → Schools** (`settings_update_school_address`).
- **15 staff functions** (the only way to write), the roster view `testing_roster`, and the same security rules as 0003: RLS with `has_data_access()`, column rights only, nothing for `anon`, every change in `change_log`.

**The order** (build plan §5): **CP2a** Cloudflare part 1 (12a) → **CP3** database (12b–12f) → **CP2b** Cloudflare part 2 (12g) → CP4 local check → **CP5** deploy with the switch **off**, then the TEST event (12h). Each step needs Jeffrey's OK. **Nothing secret goes into chat, git, `.env.local` or a screenshot** (handoff §6).

### 12a. CP2a — Cloudflare part 1 (you, in the Cloudflare dashboard)

0. **Before you copy any secret in this section (12a, 12d, 12g): turn off Windows clipboard history.** Windows **Settings → System → Clipboard**: switch **Clipboard history** off and **Sync across your devices** off. (Otherwise every secret you copy is kept in the Win+V list, and with sync on it's also sent to your other devices.) If you'd rather keep history on, then when this section is done, same page → **Clear clipboard data** → **Clear**.
1. **Turnstile** (the "are you human" check). Cloudflare → **Turnstile** → **Add widget**: name `TKD family form`, hostname `tkd-dashboard.pages.dev`, widget mode **Managed**. Save. It shows a **Site Key** (public, fine to see) and a **Secret Key** (secret).
2. **The client-key secret** (makes the hashed rate-limit key; never stored in the database). On your PC, in PowerShell, this puts 32 random bytes on the clipboard without showing them:
   ```powershell
   node -e "require('child_process').execSync('clip', { input: require('crypto').randomBytes(32).toString('base64url') })"
   ```
3. Cloudflare → **Workers & Pages** → `tkd-dashboard` → **Settings** → **Variables and Secrets** → **Production** only (leave **Preview** empty, so branch preview sites can never reach the database). Add:

   | Name | Type | Value |
   |---|---|---|
   | `TURNSTILE_SITE_KEY` | Text | the Site Key |
   | `TURNSTILE_SECRET` | **Secret** | the Secret Key (paste, save) |
   | `CLIENT_KEY_SECRET` | **Secret** | paste from step 2 |
   | `PUBLIC_REGISTRATION` | Text | `off` |
   | `PUBLIC_ORIGIN` | Text | `https://tkd-dashboard.pages.dev` |

   Then copy something harmless so the secret leaves the clipboard.
4. Same project → **Settings** → **Runtime**: **Compatibility date** = a fixed date (today's is fine). The Function's database driver needs Node.js support: with a date of **2026-08-04 or later** Cloudflare turns it on by default and the **Compatibility flags** box can stay empty; with an older date, add `nodejs_compat` there. (Done 2026-10-18: date 2026-10-16, no flag.)
5. **Rate limiting (optional)** — limits guessing link codes. A WAF rate-limiting rule **can't** be attached to a `pages.dev` address (those rules belong to a domain you own), so instead: same project → **Settings** → **Bindings** → **Add**. If the list offers **Rate limiting** (Cloudflare's Workers Rate Limiting binding) for this Pages project, add it for **Production** only:

   | Setting | Value |
   |---|---|
   | Variable name | `RATE_LIMITER` |
   | Namespace id | `1001` (any positive whole number not used by another rate limiter in your account) |
   | Limit | `60` |
   | Period | `60` seconds |

   The Function uses `env.RATE_LIMITER` **only if it's there**, so skipping this breaks nothing.
   **If the list doesn't offer it:** skip this step. The leftover risk is accepted for now (open item b): link codes are 8 random characters, and the database still counts every call per hashed key (`testing_public_attempts`) and refuses too many registrations. When the school has its own domain, add a WAF rate-limiting rule then (Cloudflare → that domain → **Security** → **WAF** → **Rate limiting rules**: URI path starts with `/api/register/`, per IP, 10 requests per 10 seconds, **Block**).
6. Changes to variables take effect on the **next deployment** (nothing is deployed yet, so nothing changes now).

### 12b. CP3 — before you apply 0005

In the **SQL Editor**, run these in production and check each passes (sections 9, 10c, 11c): `verify_pin_tests.sql`, `0002_tests.sql`, `0003_tests.sql`, `0004_tests.sql`.
`0003_tests.sql` passes before **and** after 0005: its catalog checks look only at the columns and functions 0003 itself makes (by name), so 0005's new read rights on `locations` and new `testing_*` functions don't count against it. 0005's own tests check those.

### 12c. Apply 0005 (you, in the SQL Editor)

1. Copy **the whole file** `supabase/migrations/0005_testing_events.sql`.
2. **SQL Editor → New query**, paste, **Run**.
3. Supabase will warn about **destructive operations**. That's expected: the words are inside rules (`on delete cascade`), inside functions that run later (an admin removing an event or a student; old rate-limit rows being cleaned up) and in `… if exists` lines that make re-running safe. **Nothing is removed now.** Confirm.
4. "Success. No rows returned." It's one transaction: on any error nothing is kept. Copy the error to Claude.

**Running it again is safe** (it never changes the role's password or attributes). **Never re-run 0003 after this:** that would take away 0005's read rights on `locations` — if it ever happens, run 0005 again.

### 12d. Set the `testing_registrar` password (you, on your PC + SQL Editor)

**Clipboard history off first** (12a step 0). The real password must **never** be typed into the SQL Editor (it would sit in the query history and the database logs). Instead your PC makes a random password and its **SCRAM verifier** (a one-way scramble Postgres stores and checks logins against). Only the verifier goes into the SQL Editor; the password goes into your password manager and, in 12g, into Hyperdrive.

1. Make a file **outside the repo**, e.g. `C:\Users\jberg\Documents\make-scram.mjs`, with exactly this:
   ```js
   // Makes a random password for testing_registrar and its SCRAM-SHA-256 verifier.
   // The password goes to the clipboard (never shown); only the verifier is printed.
   import { randomBytes, pbkdf2Sync, createHmac, createHash } from 'node:crypto';
   import { execSync } from 'node:child_process';
   const password = randomBytes(32).toString('base64url');   // 43 letters, digits, - and _
   const salt = randomBytes(16);
   const salted = pbkdf2Sync(password, salt, 4096, 32, 'sha256');
   const clientKey = createHmac('sha256', salted).update('Client Key').digest();
   const storedKey = createHash('sha256').update(clientKey).digest();
   const serverKey = createHmac('sha256', salted).update('Server Key').digest();
   execSync('clip', { input: password });
   console.log(`alter role testing_registrar password 'SCRAM-SHA-256$4096:${salt.toString('base64')}$${storedKey.toString('base64')}:${serverKey.toString('base64')}';`);
   ```
   (Checked by Claude: for the same password and salt it gives exactly what PostgreSQL itself stores.)
2. In PowerShell: `node C:\Users\jberg\Documents\make-scram.mjs`. The password is now on the clipboard: **save it in your password manager** as "TKD testing_registrar (Hyperdrive)". The terminal shows one `alter role … password 'SCRAM-SHA-256$4096:…';` line.
3. Copy that line into a **new** SQL Editor query and **Run**. Then **delete that snippet** in the SQL Editor (handoff §6), copy something harmless, and delete `make-scram.mjs`.
4. If the password ever leaks: run the script again (new password + verifier), update Hyperdrive (12g), and the old one stops working.

### 12e. Read-only checks (Claude runs these through the connection)

1. **Fingerprints:** `supabase/tests/0005_fingerprints.sql`. Every line must match what `supabase/tests/pglite/run.mjs` printed for the tested copy: the 45 functions (code, settings, owner, who may call them), the `testing_registrar` row (attributes, settings, memberships), the view, each table's rights, and every trigger. **One expected difference:** on Supabase the role row shows `members=postgres` (PostgreSQL 16+ automatically makes the role that created a login an administrator of it; that gives the registrar nothing). In PGlite it's empty.
2. `0003_fingerprints.sql` and `0004_fingerprints.sql`: their 0003 / 0004 lines must be **unchanged**. (0003's list now also shows the new `testing_*` functions — expected.)
3. **Security advisor:** expected notices — "RLS enabled, no policy" on `testing_public_attempts` (INFO; nobody in the app may read it) and "security definer function executable by authenticated" for the 15 staff functions (each checks access and role itself). Anything else about 0005 is a real problem.

### 12f. Run the 0005 tests (you, in the SQL Editor)

1. Open `supabase/tests/0005_tests.sql`, replace `<paste-admin-UID-here>` and `<paste-desk-UID-here>` (**Authentication → Users**), paste the whole file, **Run**. Supabase may warn about destructive operations (the test removes its own test rows and checks some removals are refused). Everything is rolled back. Confirm.
2. Expected: one row, **ALL 0005 TESTS PASSED**. A failure shows `TEST FAILED:` / `TEST SETUP:`; nothing is saved. Run `rollback;` once on its own, then tell Claude.
3. Then run `0002_tests.sql`, `verify_pin_tests.sql`, `0003_tests.sql` and `0004_tests.sql` again — 0005 must not have broken them.
4. The test makes its own `zz test …` classes and events, so it works before **and** after real events exist. Run it again after the TEST event in 12h.

### 12g. CP2b — Cloudflare part 2: Hyperdrive (you, after 12d)

Hyperdrive is Cloudflare's connector from the Function to the database.
1. Supabase → **Connect** → **Session pooler**: note the host (`aws-0-<region>.pooler.supabase.com`) and port **5432**. (The Free plan's direct address is IPv6-only, so the pooler is used.)
2. Cloudflare → **Storage & Databases** → **Hyperdrive** → **Create configuration**: name `tkd-registrar`; host = the pooler host; port `5432`; database `postgres`; user **`testing_registrar.eozkfbdfxqlcbpewhach`**; password = from your password manager.
   - **Caching: Disabled.** (Otherwise "register" could be answered from a cache without writing, and "closed" could show "open" for a minute — plan §8 Must 1.)
   - **Origin connection limit: 5 or less** if the field is offered (the role allows at most 5 connections; more would be refused by the database). If your plan doesn't offer the field, tell Claude.
   - **TLS / SSL:** if the form offers an **SSL mode** with a **CA certificate**, choose **`verify-full`** and give it Supabase's CA certificate: Supabase → **Project Settings** → **Database** → **SSL Configuration** → **Download certificate** (a `.crt` file; it's public, not a secret). `verify-full` checks that the other end really is your Supabase database before the password is sent. If the form doesn't offer it, leave the default (`require`: the connection is always encrypted, and Cloudflare checks the server's certificate against the usual public certificate authorities) and tell Claude — it can also be set later with Cloudflare's `wrangler` tool (`wrangler cert upload certificate-authority`, then the config's `--sslmode verify-full`). If `verify-full` makes the connection fail (TLS handshake / cert validation error in 12h), switch back to the default and tell Claude.
3. `tkd-dashboard` → **Settings** → **Bindings** → **Add** → **Hyperdrive**: variable name `HYPERDRIVE`, configuration `tkd-registrar`, environment **Production only**. Preview gets no binding.
4. Like the variables, the binding takes effect with the next deployment.

**Done 2026-10-18 — what the dashboard actually looked like:**
- Supabase **Connect**: pick **Session pooler** (the panel opens on Direct connection). Host `aws-0-us-east-1.pooler.supabase.com`, port 5432.
- Cloudflare: **Storage & databases → Postgres & MySQL (Hyperdrive) → Connect database → Connect to public database** (not "Create PlanetScale database"). Enter the details under **Manual entry (advanced)** and keep the **Connection String** box empty — Cloudflare writes the password into that box in plain text (once it reached a screenshot, so the password was replaced). Chrome may autofill an unrelated saved password into the Password box: clear it first. The password is saved in Google Password Manager under the made-up site `tkd-registrar.example.com` so Chrome never autofills it anywhere.
- **Server certificates → Verify full** offers only certificates already uploaded to the account (uploading a new one needs `wrangler`). The existing `ustc-color-belt-staging-supabase-ca` (from the old system) is Supabase's shared CA and works — the test connection passed. **Don't delete that certificate when the old system is retired**: `tkd-registrar` uses it too.
- Created with **origin connection limit 20**; lowered to **5** in the config's Settings (5 is Hyperdrive's minimum and the role's connlimit; it's a soft limit, so in rare network trouble an extra connection is refused and the family sees "try again").
- Checked through the Cloudflare connection: caching disabled, sslmode verify-full, limit 5. Binding `HYPERDRIVE` → `tkd-registrar` on Production; no deployment was triggered.

### 12h. CP5 — after the deploy (each with Jeffrey's OK)

1. Deploy with `PUBLIC_REGISTRATION=off`. Open a made-up link `https://tkd-dashboard.pages.dev/register/abcdefgh`: it must say registration isn't open.
2. In the app, create a **TEST** event; set `PUBLIC_REGISTRATION=on` (Production variable) and **redeploy** (Deployments → latest → **Retry deployment**); register once from a phone with the TEST event's link.
3. Check: the student is on the roster; `change_log` has the row by "Family form"; Hyperdrive → `tkd-registrar` → **Metrics**: queries show as **not cached**.
4. Delete the TEST event in the app. Run `0005_tests.sql` again (12f). Only then create the first real event; its link goes to families after Jeffrey has tried it once.
5. Enter both schools' addresses in **Settings → Schools**.

### 12i. Kill switch and rollback (any time)

In an emergency do all three, **in this order** (step 1 works in seconds; the others take longer or only stop new connections):

1. **Database off switch (instant):** in the SQL Editor, run
   ```sql
   revoke execute on function public.testing_public_event(text) from testing_registrar;
   revoke execute on function public.testing_public_register(text, text, uuid, text, text, uuid, text, boolean, text, text) from testing_registrar;
   ```
   From the next call on, both functions are refused for the family form's login — **even on connections Hyperdrive already has open** (the right is checked on every call). The Function then gets an error on every call and the family page shows its error message; nothing is written.
   **To turn it back on:** re-run the whole 0005 file (it grants these two back), or run just:
   ```sql
   grant execute on function public.testing_public_event(text) to testing_registrar;
   grant execute on function public.testing_public_register(text, text, uuid, text, text, uuid, text, boolean, text, text) to testing_registrar;
   ```
   **Note:** because re-running 0005 grants them back, re-run 0005 during an emergency only if you then repeat this step 1.
   **While the off switch is in force,** `supabase/tests/0005_tests.sql` (check T2a) and `supabase/tests/0005_fingerprints.sql` fail — that is expected, and they pass again once you grant the two rights back.
2. **Stop the family form:** set `PUBLIC_REGISTRATION=off` and **Retry deployment** (variables only apply to a new deployment; takes a minute or two). Every link then says "not open" without touching the database.
3. **Lock the login:** in the SQL Editor, `alter role testing_registrar nologin;` (re-running 0005 does **not** turn it back on; `alter role testing_registrar login;` does). This stops **new** connections only; connections already open end when Hyperdrive recycles them (step 1 has already made them useless). To end them now: `select pg_terminate_backend(pid) from pg_stat_activity where usename = 'testing_registrar';` (if Supabase says permission denied, that's fine).

**Previous site version:** Cloudflare Pages → **Deployments** → the previous one → **Rollback to this deployment**.

No data needs undoing for these: registrations already made stay. Only if Jeffrey decides to remove phase 2 completely, put the app back to a version without Events **first**, then run this in the SQL Editor (one transaction; tested in PGlite: afterwards the database is exactly as after 0004, and `0003_tests.sql` passes again). **This deletes every event, registration, payment and school address.** Supabase's destructive-operations warning is real this time.

```sql
-- Undo migration 0005. change_log (the history) is KEPT.
begin;

-- the roster view, then the functions (the ones that name a 0005 table
-- in their arguments or result must go before the tables)
drop view if exists public.testing_roster;
drop function if exists public.testing_public_register(text, text, uuid, text, text, uuid, text, boolean, text, text);
drop function if exists public.testing_public_register_core(text, text, uuid, text, text, uuid, text, boolean, text, text);
drop function if exists public.testing_public_event(text);
drop function if exists public.settings_update_school_address(text, integer, text, text, text, text);
drop function if exists public.testing_add_event(text, text, date, jsonb, boolean, date, text);
drop function if exists public.testing_update_event(uuid, integer, text, date, jsonb, date, text);
drop function if exists public.testing_set_registration(uuid, integer, boolean);
drop function if exists public.testing_delete_event(uuid, integer, integer, integer);
drop function if exists public.testing_add_student(uuid, text, text, uuid, boolean, text);
drop function if exists public.testing_update_student(uuid, integer, text, text, uuid);
drop function if exists public.testing_change_paying_by(uuid, integer, text);
drop function if exists public.testing_mark_paid(uuid, integer);
drop function if exists public.testing_undo_payment(uuid);
drop function if exists public.testing_edit_payment(uuid, text, integer, date);
drop function if exists public.testing_resolve_duplicate(uuid, integer, uuid, integer, boolean);
drop function if exists public.testing_withdraw_student(uuid, integer);
drop function if exists public.testing_restore_student(uuid, integer);
drop function if exists public.testing_delete_student(uuid, integer, uuid[]);
drop function if exists public.testing_lock_payment(uuid);
drop function if exists public.testing_lock_registration(uuid);
drop function if exists public.testing_public_answer(uuid);
drop function if exists public.testing_copy_class_into_event(uuid, uuid, time, time);
drop function if exists public.testing_check_classes_for_event(text, uuid[]);
drop function if exists public.testing_recheck_pointing_at(uuid);
drop function if exists public.testing_recheck_duplicate(uuid);
drop function if exists public.testing_find_duplicate(uuid, uuid, text, text);
drop function if exists public.testing_purge_old_signatures();
drop function if exists public.testing_location_address(text);
drop function if exists public.testing_rank_testing_for(uuid);
drop function if exists public.testing_event_state(public.testing_events, date);

-- the six tables (their triggers, rules and indexes go with them), then
-- the reference counter
drop table if exists public.testing_payments, public.testing_registrations, public.testing_event_ranks,
                     public.testing_event_classes, public.testing_events, public.testing_public_attempts;
drop sequence if exists public.testing_registration_ref_seq;

-- public.locations back to how 0003 made it (the addresses are lost)
drop trigger if exists locations_before_write on public.locations;
drop trigger if exists locations_log on public.locations;
alter table public.locations
  drop constraint if exists locations_id_key,
  drop constraint if exists locations_address_street_check,
  drop constraint if exists locations_address_city_check,
  drop constraint if exists locations_address_state_check,
  drop constraint if exists locations_address_zip_check,
  drop constraint if exists locations_address_all_or_none_check,
  drop constraint if exists locations_version_check;
alter table public.locations
  drop column if exists id,
  drop column if exists address_street,
  drop column if exists address_city,
  drop column if exists address_state,
  drop column if exists address_zip,
  drop column if exists version,
  drop column if exists updated_at,
  drop column if exists updated_by,
  drop column if exists updated_by_name;

-- the trigger functions and rule helpers (nothing uses them any more)
drop function if exists public.testing_locations_before_write();
drop function if exists public.testing_events_before_write();
drop function if exists public.testing_event_copies_before_write();
drop function if exists public.testing_registrations_before_write();
drop function if exists public.testing_registrations_log();
drop function if exists public.testing_payments_guard();
drop function if exists public.testing_classes_arg_is_valid(jsonb);
drop function if exists public.testing_new_public_code();
drop function if exists public.testing_fee_cents(integer, integer, date, date);
drop function if exists public.testing_today();
drop function if exists public.testing_school_date(timestamptz);
drop function if exists public.testing_signature_is_valid(text);
drop function if exists public.testing_note_is_valid(text);
drop function if exists public.testing_normalize_note(text);
drop function if exists public.testing_line_is_valid(text, integer);

-- the family form's login
revoke usage on schema public from testing_registrar;
drop role if exists testing_registrar;

commit;
```

**Then the Cloudflare side** (you, in the Cloudflare dashboard, after the SQL above):
1. `tkd-dashboard` → **Settings** → **Bindings**: remove the **`HYPERDRIVE`** binding (and **`RATE_LIMITER`**, if you added it in 12a step 5).
2. **Storage & Databases** → **Hyperdrive** → `tkd-registrar` → **Settings** → **Delete** the configuration (it holds the registrar's password). If you uploaded Supabase's CA certificate for it (12g), remove that too.
3. `tkd-dashboard` → **Settings** → **Variables and Secrets** → Production: delete **`TURNSTILE_SECRET`** and **`CLIENT_KEY_SECRET`** (and `TURNSTILE_SITE_KEY`, `PUBLIC_REGISTRATION`, `PUBLIC_ORIGIN`, which nothing uses any more).
4. **Turnstile** → `TKD family form` → **Delete** the widget.
5. **Retry deployment** so the site runs without them.
6. In your password manager, delete the entry "TKD testing_registrar (Hyperdrive)" (the login no longer exists).

**Why:**
- **A separate login with two functions** (rulebook v0.33): the family page never talks to Supabase and the Function never holds the `anon` or secret key; even with the registrar's password, someone could only read an event's public page or register a student, with every rule checked again in the database.
- **Production-only bindings and the kill switch:** branch preview sites can never reach the database, and the form can be switched off without touching it.
- **SCRAM verifier made on your PC:** the real password never appears in Supabase's history or logs.
- **Signatures:** never readable by the app, never in the history, removed after 90 days (plan answer 3) — the registration keeps "Signed on the form, <date>".

---

## 13. Migration 0006: Star testing (rubrics, events, family form, grading, results)

**Status: APPLIED to production and verified 2026-10-18** (Jeffrey's OK; pasted from `main` c5af308 in the SQL Editor). 13a–13d done: before the paste no `star_` object or `star_registrar` role existed; the 0006 fingerprints (142 function/table/trigger/view rows: 71 functions, 18 tables, 52 triggers, 1 view) match the PGlite run exactly, and the `star_registrar` role row matches except `members=postgres` (expected, 13c); the 0003, 0004 and 0005 fingerprints are identical to production's before 0006 (63, 25 and 74 rows); security advisor shows only the expected `star_` findings (RLS-no-policy INFO on `star_candidate_signatures` and `star_downloads`; the 37 staff functions as security definer executable by authenticated); `0006_tests.sql` on production: ALL 0006 TESTS PASSED (`0005_tests.sql` passed with a one-off fix to its T9, a 0005 test bug from the real Shrewsbury address, reported to Color Belt). **Not done yet:** 13e (`star_registrar` password) and 13f (Hyperdrive) — later, when the Star family-form Function is built, each with Jeffrey's OK. Until a password is set, `star_registrar` can't sign in.

**What it does** (`supabase/migrations/0006_star_testing.sql`, contract `docs/Dashboard Docs/Build contracts/CONTRACT-0006.md`):
- **Rubrics and prices** (the template every new event copies): each Dan's pass mark, highest star and three fees (`star_dan_settings`), its subjects and credits (`star_categories`, with Assistant Instructor worked out from the class count), the 7 grade values (`star_grade_values`) and the Assistant Instructor table (`star_assistant_table`). Seeded with today's values (1st/2nd/3rd Dan, 70 credits each, pass mark 245, A+ = 4.5 … D = 0.0); the seed never overwrites what an admin changed.
- **Events** (`star_events`): one testing day for both schools, the Open / Closed switch, an automatic closing date, and **two** family links (one per school; the link sets the candidate's school). Each event takes its own **copy** of the rubrics when it is created; later rubric changes never change it.
- **Candidates** (`star_candidates`), the family form's **signatures** (`star_candidate_signatures` — nobody in the app can read this table), make-up subjects, **append-only payments and refunds** (`star_payments`; the total can never go below zero), **grades**, "Mark as sent" (`star_result_emails`) and the results-CSV download log (`star_downloads`).
- The **result** (passed / make-up / not finished …) is always worked out from the grades by one database rule, never stored.
- **Date of birth and the results email** are never readable through the app's normal rights — only through the one-candidate detail and the admin CSV. Both are in the history in full (decided v0.169).
- A new restricted login **`star_registrar`** for the Star family form: exactly two functions (`star_public_event`, `star_public_register`), no table, can't create anything, the same settings as `testing_registrar`. The two logins can't run each other's functions.
- **37 staff functions** (the only way to write), the roster view `star_roster`, and the same security rules as 0003/0005: RLS with `has_data_access()`, column rights only, nothing for `anon` or `service_role`, every change in `change_log`.
- 0006 changes **nothing** that 0001–0005 made.
- **Known and accepted:** `star_registrar`, like `testing_registrar`, can create *temporary* tables (PostgreSQL gives every role the TEMP right on the database by default; it is not revoked). They live only in its own session's private temp schema and vanish with it; every Star function uses full `public.` names with `search_path = ''`, so nothing ever looks there.

**Nothing secret goes into chat, git, `.env.local` or a screenshot** (handoff §6). Each step below needs Jeffrey's OK.

### 13a. Before you apply 0006

1. Jeffrey's OK for this paste. The PGlite run passed (`cd supabase/tests/pglite && node run.mjs` → `… passed, 0 failed.`, exit code 0) and the security review is done.
2. Claude checks read-only (through the connection) that **no `star_` object exists yet**: no table, view, sequence or function whose name starts with `star_`, and no role `star_registrar`.

### 13b. Apply 0006 (you, in the SQL Editor)

1. Copy **the whole file** `supabase/migrations/0006_star_testing.sql`.
2. **SQL Editor → New query**, paste, **Run**.
3. Supabase will warn about **destructive operations**. That's expected: the words appear inside rules (`on delete cascade`), inside functions that run later (an admin removing an event, a candidate or a subject; old rate-limit rows being cleaned up) and in `… if exists` lines that make re-running safe. **Nothing is removed now.** Confirm.
4. "Success." It's one transaction: on any error nothing is kept. Copy the error to Claude. (A few small result grids may show — the seed sets its "who wrote this" label with `select set_config(…)`. That's fine.)

**Running it again is safe** (the seed never overwrites, and the role's attributes and password are never touched).

### 13c. Read-only checks (Claude runs these through the connection)

1. `select version()` (PostgreSQL 17) and the list of new tables (16 `star_*` tables, the view `star_roster`, the sequence `star_candidate_ref_seq`).
2. **Fingerprints:** `supabase/tests/0006_fingerprints.sql`. Every line must match what `supabase/tests/pglite/run.mjs` printed for the tested copy (71 functions, the `star_registrar` row, the view, 18 table rows, 52 triggers). **One expected difference:** on Supabase the role row shows `members=postgres` (PostgreSQL 16+ makes the role that created a login an administrator of it; that gives the registrar nothing). In PGlite it's empty. The file is a single read-only SELECT and contains neither of the words the connection refuses (run.mjs checks that).
3. `0005_fingerprints.sql`, `0004_fingerprints.sql`, `0003_fingerprints.sql`: **unchanged** from their production records (0006 touches none of their objects).
4. **Security advisor:** expected notices — "RLS enabled, no policy" on `star_candidate_signatures` and `star_downloads` (INFO; nobody in the app may read them) and "security definer function executable by authenticated" for the 37 staff functions (each checks access and role itself). Anything else about a `star_` object is a real problem.

### 13d. Run the tests (you, in the SQL Editor)

1. Open `supabase/tests/0006_tests.sql`, replace `<paste-admin-UID-here>` and `<paste-desk-UID-here>` (**Authentication → Users**), paste the whole file, **Run**. Supabase may warn about destructive operations (the test sets the rubrics to known values, removes its own test rows and checks some removals are refused). Everything is rolled back. Confirm.
2. Expected: one row, **ALL 0006 TESTS PASSED**. A failure shows `TEST FAILED:` / `TEST SETUP:`; nothing is saved. Run `rollback;` once on its own, then tell Claude.
3. Then run `0005_tests.sql` again → **ALL 0005 TESTS PASSED** (and, if you like, `0003_tests.sql`, `0004_tests.sql`, `0002_tests.sql`, `verify_pin_tests.sql` — 0006 must not have broken them).
4. Put the two placeholders back afterwards (don't save the file with the UIDs in it).
5. The test makes its own `zz test …` events and candidates, so it works before **and** after real Star events exist.

### 13e. Set the `star_registrar` password (you, on your PC + SQL Editor)

Same method as 12d, with its **own** script and its **own** password — never the Color Belt one.

0. **Clipboard history off** first (12a step 0): Windows **Settings → System → Clipboard** → Clipboard history off, Sync across your devices off.
1. Make a file **outside the repo**, e.g. `C:\Users\jberg\Documents\make-scram-star.mjs`, with exactly this (the role name `star_registrar` is written in; there is no password in it — it makes a new random one each time):
   ```js
   // Makes a random password for star_registrar and its SCRAM-SHA-256 verifier.
   // The password goes to the clipboard (never shown); only the verifier is printed.
   import { randomBytes, pbkdf2Sync, createHmac, createHash } from 'node:crypto';
   import { execSync } from 'node:child_process';
   const role = 'star_registrar';
   const password = randomBytes(32).toString('base64url');   // 43 letters, digits, - and _
   const salt = randomBytes(16);
   const salted = pbkdf2Sync(password, salt, 4096, 32, 'sha256');
   const clientKey = createHmac('sha256', salted).update('Client Key').digest();
   const storedKey = createHash('sha256').update(clientKey).digest();
   const serverKey = createHmac('sha256', salted).update('Server Key').digest();
   execSync('clip', { input: password });
   console.log(`alter role ${role} password 'SCRAM-SHA-256$4096:${salt.toString('base64')}$${storedKey.toString('base64')}:${serverKey.toString('base64')}';`);
   ```
   (The same SCRAM code as 12d, which Claude checked against what PostgreSQL itself stores; only the role name differs.)
2. In PowerShell: `node C:\Users\jberg\Documents\make-scram-star.mjs`. The password is now on the clipboard: **save it in your password manager as a NEW entry**, "Supabase star_registrar (Hyperdrive)" — not the Color Belt entry.
3. **Check the printed line says `alter role star_registrar password 'SCRAM-SHA-256$4096:…';`** — `star_registrar`, **not** `testing_registrar`. If it names any other role, stop and tell Claude.
4. Copy only that line into a **new** SQL Editor query and **Run**. Then **delete that snippet** in the SQL Editor (handoff §6), copy something harmless, and **delete `make-scram-star.mjs`**.
5. If the password ever leaks: run the script again (new password + verifier), update the Hyperdrive config (13f), and the old one stops working.

### 13f. Hyperdrive for the Star form (later — when the Star Function is built, with Jeffrey's OK)

Not part of the 0006 paste. When the Star family form's Pages Function (`functions/api/star/[code].js`, page `/star/<code>`) is built:
1. Cloudflare → **Hyperdrive** → a **second** configuration `tkd-star-registrar`: the same Session pooler host and port as 12g, database `postgres`, user **`star_registrar.eozkfbdfxqlcbpewhach`**, password from the "Supabase star_registrar (Hyperdrive)" entry. **Caching: Disabled.** **Origin connection limit: 5 or less.** TLS as 12g (Verify full with the existing Supabase CA certificate).
2. `tkd-dashboard` → **Settings** → **Bindings** → **Add** → **Hyperdrive**: variable name `HYPERDRIVE_STAR`, configuration `tkd-star-registrar`, **Production only**.
3. The Star Function has its own kill switch, the Production variable `STAR_PUBLIC_REGISTRATION` (default `off`).

### 13i. Star Function settings at go-live (you, in Cloudflare — after the final merge into `main` and the push)

The Star family form's Function (`functions/api/star/[code].js`, page `/star/<code>`) reaches production only with the final Star merge into `main` and its push (build plan §2, v0.222). It is deployed with that push **whatever `VITE_STAR_TESTING` says**; its only guards are its own kill switch and failing closed when a setting is missing — with no Star settings at all, every request answers "not open" and no database connection is opened. So these steps can wait until after the push. Each step needs Jeffrey's OK. **No value goes into git, `.env.local`, chat or a screenshot.**

**Before the final push:** Cloudflare → **Workers & Pages** → `tkd-dashboard` → **Settings** → **Variables and Secrets** → **Production**: check `VITE_STAR_TESTING` is **not** `on` (the push starts a production build at once).

**After the push, in this order:**
1. **The kill switch, off.** Same page (**Production** only; leave **Preview** empty): add

   | Name | Type | Value |
   |---|---|---|
   | `STAR_PUBLIC_REGISTRATION` | Text | `off` |

   Only the exact text `on` turns the Star form on; anything else, or no setting, is off.
2. **Reused, not new — check they are there, don't change them:** `TURNSTILE_SITE_KEY`, `TURNSTILE_SECRET`, `CLIENT_KEY_SECRET`, `PUBLIC_ORIGIN` (from 12a). The Star Function reads the same ones as Color Belt's. **`CLIENT_KEY_SECRET` must stay the same one**: the database's limit of 20 tries an hour per visitor counts both forms together, and that only works when both Functions make the same anonymous key. Don't make a second Turnstile widget either: the same widget serves both pages (the Star page asks for its own action, `star_register`, and the Function refuses a Color Belt token and the other way round).
3. **No `RATE_LIMITER` step** (rulebook v0.410, 2026-10-21). Pages Functions can't have a Rate Limiting binding (it exists for Workers only), and a Cloudflare WAF rule needs the school's own domain, so Star — like every public form — goes live with the current protections: the per-server memory counter, Turnstile on Send, the database's 20-tries-an-hour limit per visitor, and the off switches (13g). **The risk accepted until then:** the Star link code is printed on flyers, and each Cloudflare server keeps its own count, so a flood of page loads spread over many servers isn't stopped and can use up all 5 of `star_registrar`'s database connections — real families then can't register until it stops. If that happens, use the off switches (13g). **Revisit** with a WAF rate-limiting rule when the school has its own domain. (If a `RATE_LIMITER` binding ever exists, the Function uses it by itself.)
4. **The `star_registrar` password:** do **13e** first if it isn't set yet (13f needs it).
5. **Hyperdrive:** **13f** (the second configuration `tkd-star-registrar`, caching disabled, origin connection limit 5 or less, bound as `HYPERDRIVE_STAR`, **Production only**). Preview gets no binding, so a branch preview site can never reach the database.
6. **Retry deployment** (Deployments → latest → **Retry deployment**): variables and bindings only take effect with the next deployment.
7. **Check it is off:** open a made-up link `https://tkd-dashboard.pages.dev/star/abcdefgh` — it must say registration isn't open.
8. **Before `STAR_PUBLIC_REGISTRATION` is ever set to `on`** (for the TEST registration or for families): follow build plan §2 steps 4–6: both street addresses in **Settings → Schools**, one TEST registration with `STAR_PUBLIC_REGISTRATION = on` (+ Retry deployment), and the switches on when families should register. To stop it again: 13g.

### 13g. Off switch (any time)

In this order (step 1 works in seconds):
1. **Database off switch (instant):** in the SQL Editor, run
   ```sql
   revoke execute on function public.star_public_event(text) from star_registrar;
   revoke execute on function public.star_public_register(text, text, uuid, text, text, date, text, integer, integer, text, boolean, text, text) from star_registrar;
   ```
   From the next call on, both are refused for the Star form's login, even on connections Hyperdrive already has open. **To turn it back on:** re-run the whole 0006 file, or `grant execute on function …` the same two lines `to star_registrar`. While it is off, `0006_tests.sql` (T2a) and `0006_fingerprints.sql` fail — expected.
2. **Stop the Star form:** set `STAR_PUBLIC_REGISTRATION=off` (Production) and **Retry deployment**.
3. **Lock the login:** `alter role star_registrar nologin;` (re-running 0006 does **not** turn it back on; `alter role star_registrar login;` does).

Color Belt's form (12i) is not affected by any of these, and Color Belt's off switch doesn't affect Star.

### 13h. Undo 0006 (only if something is badly wrong, before real Star data exists)

Only if Jeffrey decides to remove Star testing completely: put the app back to a version without the Star screens **first**, then run this in the SQL Editor (one transaction; tested in PGlite: afterwards no `star_` object or role is left, and `0005_tests.sql` and `0003_tests.sql` pass again). **This deletes every Star rubric change, event, candidate, payment and grade.** Supabase's destructive-operations warning is real this time.

**What stays:** the `change_log` rows Star wrote (the history is append-only — including any dates of birth and emails, S10), and Star's rows in `testing_public_attempts`, which age out within 2 days. Nothing from 0001–0005 is touched.

```sql
-- Undo migration 0006. change_log (the history) is KEPT.
begin;

-- the family form's two functions first (the instant off switch), then the view
revoke execute on function public.star_public_event(text) from star_registrar;
revoke execute on function public.star_public_register(text, text, uuid, text, text, date, text, integer, integer, text, boolean, text, text) from star_registrar;
drop view if exists public.star_roster;

-- the functions (those naming a 0006 table in their arguments or result
-- must go before the tables)
drop function if exists public.star_public_register(text, text, uuid, text, text, date, text, integer, integer, text, boolean, text, text);
drop function if exists public.star_public_register_core(text, text, uuid, text, text, date, text, integer, integer, text, boolean, text, text);
drop function if exists public.star_public_event(text);
drop function if exists public.star_home_today();
drop function if exists public.star_makeup_list(uuid);
drop function if exists public.star_event_results(uuid, integer);
drop function if exists public.star_age_groups(uuid);
drop function if exists public.star_view_signature(uuid);
drop function if exists public.star_candidate_history(uuid);
drop function if exists public.star_candidate_detail(uuid);
drop function if exists public.star_results_csv(uuid, integer);
drop function if exists public.star_undo_result_sent(uuid);
drop function if exists public.star_mark_result_sent(uuid, text);
drop function if exists public.star_set_makeup_subjects(uuid, uuid[], uuid[]);
drop function if exists public.star_set_count(uuid, text, integer);
drop function if exists public.star_set_grade(uuid, uuid, text);
drop function if exists public.star_record_refund(uuid, integer, text, integer, date);
drop function if exists public.star_edit_payment(uuid, text, integer, date);
drop function if exists public.star_undo_payment(uuid);
drop function if exists public.star_record_payment(uuid, integer, text, integer, date);
drop function if exists public.star_delete_candidate(uuid, integer, uuid[]);
drop function if exists public.star_restore_candidate(uuid, integer);
drop function if exists public.star_withdraw_candidate(uuid, integer);
drop function if exists public.star_set_private(uuid, integer, date, time);
drop function if exists public.star_resolve_duplicate(uuid, integer, uuid, integer, boolean);
drop function if exists public.star_change_paying_by(uuid, integer, text);
drop function if exists public.star_update_candidate(uuid, integer, text, text, date, text, text, integer, integer, integer);
drop function if exists public.star_add_makeup(uuid, uuid);
drop function if exists public.star_add_candidate(uuid, text, text, date, text, text, integer, integer, text);
drop function if exists public.star_delete_event(uuid, integer, integer, integer);
drop function if exists public.star_set_registration(uuid, integer, boolean);
drop function if exists public.star_update_event(uuid, integer, text, date, time, text, date, text);
drop function if exists public.star_add_event(text, date, time, text, boolean, date, text);
drop function if exists public.star_update_assistant_table(integer, integer, integer[], integer[]);
drop function if exists public.star_update_grade_values(integer[], numeric[]);
drop function if exists public.star_delete_category(uuid, integer);
drop function if exists public.star_reorder_categories(integer, uuid[], uuid[]);
drop function if exists public.star_update_category(uuid, integer, text, integer);
drop function if exists public.star_add_category(integer, text, integer);
drop function if exists public.star_update_dan_settings(integer, integer, numeric, integer, integer, integer, integer);
drop function if exists public.star_history_strip(jsonb);
drop function if exists public.star_public_answer(uuid);
drop function if exists public.star_copy_template_into_event(uuid);
drop function if exists public.star_lock_payment(uuid);
drop function if exists public.star_lock_candidate(uuid);
drop function if exists public.star_recheck_pointing_at(uuid);
drop function if exists public.star_recheck_duplicate(uuid);
drop function if exists public.star_find_duplicate(uuid, uuid, text, text, date);
drop function if exists public.star_purge_old_signatures();
drop function if exists public.star_sent_state(uuid, jsonb);
drop function if exists public.star_candidate_result(uuid);
drop function if exists public.star_assistant_grade(uuid, text, integer);
drop function if exists public.star_age_group_of(date, date, integer);
drop function if exists public.star_expected_fee_cents(uuid);
drop function if exists public.star_fee_kind(uuid);
drop function if exists public.star_net_paid_cents(uuid);
drop function if exists public.star_event_state(public.star_events, date);
drop function if exists public.star_ids_are_valid(uuid[]);

-- the 16 tables (their triggers, rules and indexes go with them), then
-- the reference counter
drop table if exists public.star_downloads, public.star_result_emails, public.star_grades, public.star_payments,
                     public.star_makeup_subjects, public.star_candidate_signatures, public.star_candidates,
                     public.star_event_assistant, public.star_event_grades, public.star_event_categories,
                     public.star_event_dans, public.star_events, public.star_assistant_table, public.star_grade_values,
                     public.star_categories, public.star_dan_settings;
drop sequence if exists public.star_candidate_ref_seq;

-- the trigger functions and the two rule helpers the tables used
drop function if exists public.star_before_write();
drop function if exists public.star_events_rules();
drop function if exists public.star_event_copies_before_write();
drop function if exists public.star_candidates_rules();
drop function if exists public.star_candidate_signatures_rules();
drop function if exists public.star_candidate_signatures_log();
drop function if exists public.star_makeup_subjects_rules();
drop function if exists public.star_payments_guard();
drop function if exists public.star_grades_rules();
drop function if exists public.star_result_emails_guard();
drop function if exists public.star_downloads_guard();
drop function if exists public.star_email_is_valid(text);
drop function if exists public.star_start_time_is_valid(time);

-- the Star form's login
revoke usage on schema public from star_registrar;
drop role if exists star_registrar;

commit;
```

**Then the Cloudflare side** (only if 13f was done): remove the `HYPERDRIVE_STAR` binding, delete the `tkd-star-registrar` Hyperdrive configuration, delete the `STAR_PUBLIC_REGISTRATION` variable, **Retry deployment**, and delete the "Supabase star_registrar (Hyperdrive)" password-manager entry.

**Why:**
- **Its own login and its own password:** a leak of one form's password can't reach the other form's functions; each can be switched off on its own.
- **Never readable, only through two functions:** dates of birth, emails and signatures are about minors (rulebook §5); leaving them out of a view wouldn't protect them, not granting them does.
- **The result is worked out, never stored:** the Grading grid, Results, the CSV and Mark as sent always agree.

---

## 14. Migration 0010: Color Belt grading (results on the Grading tab)

**What it does** (`supabase/migrations/0010_testing_results.sql`, contract `docs/Dashboard Docs/Build contracts/CONTRACT-0010.md` §1):
- **Results:** a new table `testing_results`, one row per graded student: a result (**Pass** `pass`, **Not passed** `not_passed`, **No show** `no_show`) and/or a one-line note of up to 200 characters, plus when and by whom it was last changed. Clearing both removes the row. It is a separate table on purpose: a grader's tap never changes the registration's version, so the desk's Mark paid / Edit details never get "someone else changed this" because of grading (rulebook v0.187: the last change wins).
- **Two staff functions** (the only way to write): `testing_set_result` and `testing_set_result_note`. **Before the testing day** nobody can record anything (`not_open`); **on the testing day** staff and admins can; **after it** only admins (staff get `finished`) — rulebook v0.186, decided by the database's own clock in school time (America/New_York).
- **Five 0005 functions replaced** (same names and arguments, so the live phase 2 screens keep working until phase 3 is deployed): Edit details clears a student's result when their belt changes, and after the testing day only an admin may change a graded student's belt; after the testing day "keep one" of a possible duplicate is **admin-only** for every student (v0.194; "keep both" still works for staff), and staff can't Undo a keep-one of a graded student then; **admins can add a student after the testing day** (v0.191); and an event's date **can't change once it has results** (new status `has_results`).
- **Same security rules as 0005:** RLS with `has_data_access()`, read rights on five columns only (never `updated_by`, a login id), no direct writes for anyone in the app, nothing for `anon` or the family form's login, every change in `change_log` (actions `set_result`, `set_result_note`, `clear_result`; removing a student or an event logs its result's removal under `delete_student` / `delete_event`).

**The order** (build plan §5): **CP2** database (14a–14c, Jeffrey's OK) → **CP3** real check from the local app (14d) → **CP4** deploy (Jeffrey's OK). The live site keeps working between CP2 and CP4 (it doesn't read results yet).

### 14a. Apply 0010 (you, in the SQL Editor)

1. Copy **the whole file** `supabase/migrations/0010_testing_results.sql`.
2. **SQL Editor → New query**, paste, **Run**.
3. Supabase will warn about **destructive operations**. That's expected: the words are inside a rule (`on delete cascade`: removing a student removes their result), inside functions that run later (clearing a result removes its row; a belt change clears a result) and in `drop … if exists` lines that make re-running safe. **Nothing is removed now.** Confirm.
4. "Success. No rows returned." It's one transaction: on any error nothing is kept. Copy the error to Claude.

**Running it again is safe** (tested: a second run changes no row and no fingerprint). **Never re-run 0005 on its own after this** — see 14e.

### 14b. Read-only checks (Claude runs these through the connection)

1. **Fingerprints:** `supabase/tests/0010_fingerprints.sql`. Every line must match what `supabase/tests/pglite/run.mjs` printed for the tested copy: 18 rows — the 9 functions (2 new, 2 trigger functions, 5 replaced: code, settings, owner, who may call them), the table (RLS, rights per column, its read rule), its 3 triggers and its 5 rules.
2. `0005_fingerprints.sql`: **only** the lines of the five replaced functions (`testing_update_student`, `testing_resolve_duplicate`, `testing_restore_student`, `testing_add_student`, `testing_update_event`) differ from before — expected; their new code is checked in step 1. Every other 0005 line is unchanged. `0003_fingerprints.sql` and `0004_fingerprints.sql`: unchanged.
3. **Security advisor:** the only new expected notice is "security definer function executable by authenticated" for `testing_set_result` and `testing_set_result_note` (each checks access itself, then the testing-day rule). Anything else about `testing_results` (for example RLS off, or a function without a fixed `search_path`) is a real problem.

### 14c. Run the tests (you, in the SQL Editor)

1. Open `supabase/tests/0010_tests.sql`, replace `<paste-admin-UID-here>` and `<paste-desk-UID-here>` (**Authentication → Users**), paste the whole file, **Run**. Supabase may warn about destructive operations (the test removes its own test students and events and checks some changes are refused). Everything is rolled back. Confirm.
2. Expected: one row, **ALL 0010 TESTS PASSED**. A failure shows `TEST FAILED:` / `TEST SETUP:`; nothing is saved. Run `rollback;` once on its own, then tell Claude.
3. Then run `0005_tests.sql`, `0004_tests.sql`, `0003_tests.sql`, `0002_tests.sql` and `verify_pin_tests.sql` again — 0010 must not have broken them.
4. The test makes its own `zz test …` classes and events (dated tomorrow, today and yesterday), so it works before **and** after real events exist.

### 14d. CP3 — the real check (you, with the local app on the real database; Claude watches)

Run `Start dashboard.bat`, sign in as the admin.
1. Create a **TEST** event dated **today** (any school, one or two classes) and add **two** students.
2. On the **Grading** tab: give one **Pass**, the other **No show**; tap Pass again to clear it; add a note to one, then clear it; **Print grading sheet** (print preview is enough).
3. The admin after-the-day rule needs a TEST event whose date is **yesterday**. The app can't make one: an event can't be created in the past, **Edit event refuses a date before today** (`invalid`, phase 2 rule), and once an event has a result its date can't move at all (`has_results`). So, either:
   - **(a) wait a day:** create a **second TEST event dated today**, add one student, grade **nothing**, and leave it until tomorrow; then grade that student as the admin (works) and check the desk account sees the read-only view; or
   - **(b) move it in the SQL Editor** (a direct write to production — only with Jeffrey's OK): create the second TEST event dated today with one student, grade nothing, then run `update public.testing_events set testing_date = public.testing_today() - 1 where name = '<the TEST event's exact name>';` and check it said `UPDATE 1`. Then grade as the admin and check the desk's read-only view as in (a).
4. **Delete both TEST events** (Events → ⋯ → Delete event).
5. Claude checks through the connection (read-only): the history has the `set_result` / `set_result_note` rows with the right names, the removals under `delete_event`, and no `testing_results` row is left for the TEST events.

### 14e. Undo and re-run warnings (only with Jeffrey's OK)

If migration 0014 exists, remove it first (§0014e) — 0010 can only be removed after 0014.

**Re-running 0005 after 0010** puts back the phase 2 versions of the five replaced functions, **without the grading locks** (0005's header says so too). If 0005 is ever re-run, run **0010 again straight after it**. (And if the family-form off switch of 12i is in force, repeat 12i step 1 after re-running 0005, because 0005 grants the two public functions back.)

**Rollback without touching data:** put the previous site version back (Cloudflare Pages → Deployments → **Rollback**). 0010 can stay: the phase 2 screens don't read results.

**Removing 0010 completely** (only if Jeffrey decides so). First put the app back to a version **without Grading**. Then two steps, **in this order** (so the live phase 2 site keeps working the whole time):

1. **Re-run the whole 0005 file** (12c). That puts back the phase 2 versions of the five replaced functions, which don't read `testing_results` at all, so nothing breaks when the table goes in step 2. (Repeat 12i step 1 afterwards if the family-form off switch is in force — re-running 0005 grants the two public functions back.)
2. Run this in the SQL Editor (one transaction). **This deletes every result and note.** Each removed result is first logged in `change_log` (action `undo_0010`), and the history keeps all its earlier rows too. Supabase's destructive-operations warning is real this time.

```sql
-- Undo migration 0010 (step 2; run AFTER re-running 0005). change_log is KEPT.
begin;

-- remove the results row by row first, so every removal is in the history
select set_config('tkd.action', 'undo_0010', true);
select set_config('tkd.batch_id', gen_random_uuid()::text, true);
delete from public.testing_results;
select set_config('tkd.action', '', true);
select set_config('tkd.batch_id', '', true);

-- the table (its triggers, rules and read rule go with it)
drop table if exists public.testing_results;

-- the two staff functions and the two trigger functions
drop function if exists public.testing_set_result(uuid, text);
drop function if exists public.testing_set_result_note(uuid, text);
drop function if exists public.testing_results_log();
drop function if exists public.testing_results_before_write();

commit;
```

Tested in PGlite on every run (`run.mjs` step 13g, both steps exactly as written here): afterwards `0005_fingerprints.sql` equals a database that never had 0010, `change_log` has one `undo_0010` row per removed result, and `0005_tests.sql` and `0003_tests.sql` pass.

**Why:**
- **A separate results table:** grading never makes the desk's screen "stale", and the results can be locked down on their own (no `updated_by`, nothing for the family form).
- **The date rule in the database:** a device with a wrong clock, or an old browser tab, can't record results before the testing day or (for staff) after it.
- **The locks on Edit details, keep one and Undo:** after the testing day staff can't take a graded student off the Grading tab or change what they tested for; an admin can.

---

## 15. Migration 0011: Finance (Daily report, Close the day, History, Export, reminder)

**What it does** (`supabase/migrations/0011_finance.sql`, contract `docs/Dashboard Docs/Build contracts/CONTRACT-0011.md` §1):
- **Reads** the payments Color Belt (`testing_payments`, 0005) and Star (`star_payments`, 0006) already store — it **never changes a payment**. Each payment is followed through its corrections ("chains": an edit = a reversal + a new payment written together; an undo = a reversal alone; a staff mis-click undone by the same login within 10 seconds is hidden), then added up per school and school day (America/New_York).
- **5 new tables:** `finance_day_closings` (close / undo / reopen of a school's day: what was counted, what the server expected, the note, who and when — append-only), `finance_day_closing_items` (the exact items each close counted, so any later change shows as **Changed after closing** — append-only), `finance_settings` (one row: reminder On / Off + a version), `finance_reminder_times` (a time or Off per school per weekday, seeded **Off**), `finance_exports` (one row per CSV export — append-only).
- **14 functions** the app calls (`finance_day`, `finance_day_both`, `finance_history`, `finance_payment_detail`, `finance_home`, `finance_close_day`, `finance_undo_close`, `finance_reopen_day`, `finance_export`, `finance_export_preview`, `finance_settings_get`, `finance_set_reminder_on`, `finance_set_reminder_time`, `finance_copy_monday`). Staff see and close **today only**; admins any day up to today, plus History, Reopen, Export and Settings.
- **Same security rules as 0005 / 0006:** RLS on every table with **no** read rule and **no** rights for anyone in the app (every read goes through the functions), `has_data_access()` first in every function, nothing for `anon` or `service_role`, every change in `change_log`, no `truncate`. No answer ever holds a date of birth, an email, a signature or a login id (tested).
- 0011 changes **nothing** that 0001–0006 or 0010 made (tested: their fingerprints are identical before and after).

**Each step below needs Jeffrey's OK.** Apply only after 0006 is confirmed live (it is, 13).

### 15a. Apply 0011 (you, in the SQL Editor)

1. Copy **the whole file** `supabase/migrations/0011_finance.sql`.
2. **SQL Editor → New query**, paste, **Run**.
3. Supabase will warn about **destructive operations**. That's expected: the words are in `drop trigger if exists` lines that make re-running safe and inside guards that **refuse** removals. **Nothing is removed.** Confirm.
4. "Success." It's one transaction: on any error nothing is kept. Copy the error to Claude. (A few small result grids may show — the seed sets its label with `select set_config(…)`. That's fine.)

**Running it again is safe** (tested: a second run changes no row and no fingerprint; the seed never overwrites what an admin set).

### 15b. Read-only checks (Claude runs these through the connection)

1. **Fingerprints:** `supabase/tests/0011_fingerprints.sql`. Every line must match what `supabase/tests/pglite/run.mjs` printed for the tested copy (every `finance_` function with its code, settings, owner and who may call it; the 5 tables; their triggers and rules). The file is a single read-only SELECT and contains neither of the words the connection refuses (run.mjs checks that).
2. `0003`–`0006` and `0010` fingerprints: **unchanged**.
3. **Security advisor:** expected notices — "RLS enabled, no policy" on the 5 `finance_` tables (INFO; nobody in the app reads them directly) and "security definer function executable by authenticated" for the 14 functions (each checks access and role itself). Anything else about a `finance_` object is a real problem.

### 15c. Run the tests (you, in the SQL Editor)

1. Open `supabase/tests/0011_tests.sql`, replace `<paste-admin-UID-here>` and `<paste-desk-UID-here>` (**Authentication → Users**), paste the whole file, **Run**. Since the speed fix (15e) it finishes in seconds; **only if 15e is not applied yet**, add `set statement_timeout = '10min';` as the first line (the first version of 0011 made the test run for over 10 minutes on production on 2026-10-19; it was cancelled and rolled back). Supabase may also offer “Run and enable RLS” for the test's temporary table `t_answers`: choose **Run without RLS** (it exists only inside this session and is rolled back). Supabase may warn about destructive operations (the test removes its own test students and events and checks some removals are refused). Everything is rolled back. Confirm.
2. Expected: one row, **ALL 0011 TESTS PASSED**. A failure shows `TEST FAILED:` / `TEST SETUP:`; nothing is saved. Run `rollback;` once on its own, then tell Claude.
3. The test makes its own `zz fin …` classes, events, students and payments on days in 2020–2023 (no real data there; Finance refuses days before 2020-01-01), so it works before **and** after real payments exist. To try Close the day as the desk it adds a test payment **today** in Worcester (and, if today's Worcester drawer is already closed for real, reopens it inside the test) — all rolled back.
4. Then run `0010_tests.sql`, `0006_tests.sql`, `0005_tests.sql`, `0004_tests.sql`, `0003_tests.sql`, `0002_tests.sql` and `verify_pin_tests.sql` again — 0011 must not have broken them.

### 15d. After applying

An admin sets the reminder times in **Finance → Settings** (they start Off; plan Q3).

### 15e. Speed fix: apply the NEW 0011 over the first one (you, in the SQL Editor; Jeffrey's OK)

**Why:** the first version of 0011 (pasted 2026-10-19) built the payment "chains" with one big query that compared every payment with every other. On long date ranges (a year's export, the test file) it took minutes — `0011_tests.sql` was cancelled on production after 10 minutes. The new version builds the chains owner by owner and adds two date indexes on the payment tables. Measured in PGlite on ~11,000 payment rows (5 years, both schools): every Finance function answers in under 50 ms (the year export took over 20 minutes before); `0011_tests.sql` takes about 1 second.

0. **Paste it outside desk hours** (no one recording a payment): building the two new indexes briefly holds back payment writes on `testing_payments` and `star_payments` until the paste finishes (seconds; an empty or small table takes well under a second). A payment saved at that moment just waits, it isn't lost.
1. Copy **the whole file** `supabase/migrations/0011_finance.sql` (the new version), **SQL Editor → New query**, paste, **Run**, confirm the destructive-operations warning (the words are in `drop … if exists` lines; the only thing removed is the old internal function `finance_chain_steps(date, date)`, which nothing calls).
2. **What it changes:** functions only (replaced), two new indexes (`finance_testing_payments_paid_on_idx`, `finance_star_payments_paid_on_idx`), one old internal function removed. **What it keeps:** every table and row — the settings row, the 14 reminder times, closings, exports — and every right. Tested in `run.mjs` step 14b: the exact production copy of the first version is applied, the settings are changed like an admin would, then the new file is pasted over it: the settings and times are unchanged and all tests pass.
3. Claude re-runs `0011_fingerprints.sql` through the connection: the lines must match the new PGlite run (95 rows: 83 as before + 12 index rows — the two new `paid_on` indexes and the finance tables' own keys). The 0003–0006 and 0010 fingerprints stay unchanged.
3b. Claude runs the **Security Advisor** through the connection: no new warnings for any `finance_` object or the two new indexes (only the notices listed in 15b).
4. Run `0011_tests.sql` (15c step 1 — with the admin and desk ids filled in; no timeout line needed) → **ALL 0011 TESTS PASSED**. Then run `0010_tests.sql`, `0006_tests.sql`, `0005_tests.sql`, `0004_tests.sql`, `0003_tests.sql`, `0002_tests.sql` and `verify_pin_tests.sql` again — the new 0011 must not have broken them.

**Rollback:** Finance only reads payments, so turning it off is a code rollback (Cloudflare Pages → Deployments → **Rollback**). The 0011 tables can stay; nothing else depends on them.
## 16. Forms public page: Cloudflare settings (at go-live, F6 / F7 — each with Jeffrey's OK)

**What it is:** the public form page `/f/<slug>` (free-class sign-ups, and the kiosk tablet) talks only to the Pages Function `functions/api/forms/[slug].js`. That Function signs in to the database as its **own** restricted login, `forms_registrar` (migration 0009 §8: it can run exactly `forms_public_get`, `forms_public_submit` and `forms_public_email_result`, nothing else). It is built the same way as Color Belt's family form (section 12) but shares **nothing secret with it except** the Turnstile widget and the client-key secret. Emails are **off** (rulebook v0.601): no email settings are needed.

**16a–16c done 2026-10-19/20 (F6, Jeffrey):** `forms_registrar` has its own password (checked read-only: a SCRAM-SHA-256 verifier is stored), the Hyperdrive configuration `tkd-forms-registrar` exists (checked through the Cloudflare connection: Session pooler host, port 5432, database `postgres`, user `forms_registrar.eozkfbdfxqlcbpewhach`, caching disabled, `verify-full` with the same Supabase CA certificate as `tkd-registrar`, origin connection limit 5 — it was created with 20 and lowered), the binding `HYPERDRIVE_FORMS` (Production) and the Production text variable `PUBLIC_FORMS=off` were added. No deployment was made. The public forms go live together with Prospects (rulebook v0.241 answer 1); until `PUBLIC_FORMS` is `on`, every form link says "not open" without touching the database. Still to do at go-live: deploy (with Jeffrey's OK), check the security headers of `/f/…` with `curl -I`, a test sign-up with `PUBLIC_FORMS=on`, then the two-connection race test (F6).

### 16a. The `forms_registrar` password (you, on your PC + SQL Editor)

The same method as 12d, with its **own** script and its **own** password — never the Color Belt or Star one. In the script, the role name is `forms_registrar` (as in 13e's script: `const role = 'forms_registrar';`). Save the password as a **new** entry, "Supabase forms_registrar (Hyperdrive)". **Check the printed line says `alter role forms_registrar password 'SCRAM-SHA-256$4096:…';`** before running it, then delete the SQL Editor snippet and the script.

### 16b. Hyperdrive for the Forms page (you)

1. Cloudflare → **Hyperdrive** → a **separate** configuration `tkd-forms-registrar`: the same Session pooler host and port as 12g, database `postgres`, user **`forms_registrar.eozkfbdfxqlcbpewhach`**, password from the "Supabase forms_registrar (Hyperdrive)" entry. **Caching: Disabled** (otherwise "spots left" and "closed" could be answered from a cache). **Origin connection limit: 5** (the role allows at most 5). TLS as 12g (Verify full with the existing Supabase CA certificate).
2. `tkd-dashboard` → **Settings** → **Bindings** → **Add** → **Hyperdrive**: variable name **`HYPERDRIVE_FORMS`**, configuration `tkd-forms-registrar`, **Production only**.

### 16c. Variables (you, Production only — leave Preview empty)

`tkd-dashboard` → **Settings** → **Variables and Secrets** → **Production**:

| Name | Type | Value | New? |
|---|---|---|---|
| `PUBLIC_FORMS` | Text | `off` (later `on` to go live) | **new** — the Forms kill switch; anything other than `on` = forms closed |
| `HYPERDRIVE_FORMS` | Binding | 15b | **new** |
| `PUBLIC_ORIGIN` | Text | `https://tkd-dashboard.pages.dev` | already there (12a) — shared |
| `TURNSTILE_SITE_KEY` | Text | the Site Key | already there (12a) — shared |
| `TURNSTILE_SECRET` | Secret | the Secret Key | already there (12a) — shared |
| `CLIENT_KEY_SECRET` | Secret | — | already there (12a) — shared (Forms adds "forms\|" before hashing, so its keys never match Color Belt's) |
| ~~`RATE_LIMITER`~~ | — | — | **replaced by rulebook v0.410:** not set up (Pages Functions can't have this binding; Workers only). The Function still uses one if it ever exists (Forms' keys start with "forms:"). Protection meanwhile: the per-server memory counter, Turnstile on Send, `forms_registrar`'s limits and the `PUBLIC_FORMS` off switch; revisit with a WAF rule once the school has its own domain. |

**Turnstile:** the same widget (hostname `tkd-dashboard.pages.dev`) works; the Forms page asks for action **`form`** and the Function refuses any other action (so a Color Belt token can't be reused). If the school later gets its own web address, add that hostname to the widget and change `PUBLIC_ORIGIN` for both Functions together.

Variables and bindings take effect on the **next deployment**.

### 16d. Off switch (any time)

In this order (step 1 works in seconds):
1. **Database off switch (instant):** in the SQL Editor, run
   ```sql
   revoke execute on function public.forms_public_get(text) from forms_registrar;
   revoke execute on function public.forms_public_submit(text, text, uuid, integer, jsonb, jsonb, jsonb, text, text) from forms_registrar;
   ```
   The Function then gets "permission denied" and the page shows "try again"; nothing is written. **To turn it back on:** re-run the whole 0009 file, or `grant execute on function …` the same two lines `to forms_registrar`. While it is off, the 0009 tests and fingerprints fail — expected.
2. **Stop the forms:** set `PUBLIC_FORMS=off` (Production) and **Retry deployment**.
3. **Lock the login:** `alter role forms_registrar nologin;` (`alter role forms_registrar login;` turns it back on).

Color Belt's form (12i) is not affected by any of these, and its off switch doesn't affect Forms.

## 17. Migration 0019: school phone (Settings → Schools → Phone; a closed sign-up form shows it)

**What it does** (`supabase/migrations/0019_school_phone.sql`, rulebook v0.605):
- `public.locations` gets an optional **`phone`** (empty, or 7–20 characters of digits, spaces, `+ ( ) - .` with 7–15 digits — checked by the table itself).
- **`settings_update_school_contact`** (admins only; `has_data_access()` first): saves the address (through 0005's `settings_update_school_address`, unchanged) **and** the phone — both or neither. Settings → Schools → Edit uses it.
- A second BEFORE trigger, `locations_phone_before_write`, raises the version and stamps "last changed by" when the phone changes (0005's trigger is unchanged). History: 0005's `locations_log` already logs every school change to `change_log`.
- Staff may **read** the phone (the school's public number). **Nothing for `anon`.** 0009 is **unchanged**: its `forms_public_get` already hands the phone to a closed form.

**Each step needs Jeffrey's OK.** Apply **before** deploying the app version that shows the phone (that version reads the `phone` column; without 0019 Settings → Schools can't load).

### 17a. Apply 0019 (you, in the SQL Editor)

1. Copy **the whole file** `supabase/migrations/0019_school_phone.sql` → **SQL Editor → New query** → paste → **Run**.
2. Supabase may warn about **destructive operations**: the words are in `drop … if exists` lines that make re-running safe. **Nothing is removed.** Confirm.
3. "Success." One transaction: on any error nothing is kept. Copy the error to Claude. **Running it again is safe** (tested: the saved phones and versions stay).

### 17b. Read-only checks (Claude runs these through the connection)

1. **Fingerprints:** `supabase/tests/0019_fingerprints.sql` — every line must match what `supabase/tests/pglite/run.mjs` printed (10 rows).
2. **0005's fingerprints move by exactly one line on purpose:** the `table locations` line gains `phone>authenticated:SELECT`, and the trigger list gains `locations.locations_phone_before_write`. Every other migration's fingerprints: **unchanged** (run.mjs step 18 checks all of them).
3. **Security advisor:** at most the expected "security definer function executable by authenticated" for `settings_update_school_contact` (it checks access and the admin role itself). Anything else about `locations` or the new function is a real problem.

### 17c. Run the tests (you, in the SQL Editor)

1. Open `supabase/tests/0019_tests.sql`, replace `<paste-admin-UID-here>` and `<paste-desk-UID-here>`, paste the whole file, **Run** → one row **ALL 0019 TESTS PASSED**. Everything is rolled back (it empties Worcester's address and phone inside the test only; they come back).
2. Then run `0005_tests.sql` again (it now allows the one new read right) and `0009_tests.sql`.

### 17d. If 0005 is ever re-run

The 0010 undo (14e) re-runs 0005, and 0005 starts by removing **all** read rights on `locations` and granting back only its own columns, so the phone can't be read any more (Settings → Schools stops loading). **Re-run 0019 right after**; the phone numbers themselves stay in the table (tested in run.mjs step 18e).
## Migration 0016: Black Belt testing (cycles, family form, candidates, payments)

**Status: APPLIED to production on 2026-10-21 (CP3)** from commit 5a670d0 (file SHA-256 `74808d79…6afe4f`), following `docs/Testing/Black Belt Testing/TKD-BlackBelt-CP3-RunSheet.md`: 0016's fingerprints equal the tested copy (only `members=postgres` differs), every earlier migration's fingerprints and the whole-database snapshot unchanged, the security advisor shows only the 25 + 2 expected notices, `0016_tests.sql`, `0006`, `0011` and `0018` tests pass on production, the reference counter reset to 5001. Still to do: 0016e (password, CP3b), CP4 waiver, 0016f Hyperdrive (CP5).

**What it does** (`supabase/migrations/0016_black_belt.sql`, contract `docs/Dashboard Docs/Build contracts/CONTRACT-0016.md`, rulebook v0.909):
- **Rubric and prices:** one settings row with the two **keep-years** numbers for signed waivers (`bb_settings`; both start empty = nothing is ever deleted until the insurer's numbers are entered) and every **waiver text** ever saved (`bb_waiver_versions`; written once, never removed). The seeded text is a **PLACEHOLDER**: registration can't be opened until an admin saves the school's waiver (CP4).
- **Cycles** (`bb_cycles`): one Black Belt season for both schools, with its testing days and the parts graded on each (`bb_cycle_days`, `bb_cycle_day_parts`), Application / Submissions due, the Open / Closed switch, **two family links** (one per school) and the requirements sheet the family form shows. Each cycle has **its own prices**, set when the cycle is added and never changed afterwards (`bb_cycle_plans`, `bb_cycle_plan_amounts`, `bb_cycle_kukkiwon_fees`); the due dates stay editable (`bb_cycle_plan_payments`). The very first Add cycle is filled in from the Fall 2026 values (`bb_starting_point` — nobody in the app can read it; the plain-English list of every seeded number is `supabase/tests/0016_seed_review.txt`, for the CP1 check).
- **Candidates** (`bb_candidates`, references BB-5001 …) and their **signed waivers** (`bb_candidate_waivers`: drawn on the form, or ticked as signed on paper at the desk — nobody in the app can read this table).
- **Payments** (`bb_payments`): **append-only and never removed** — payments, refunds, reversals (Undo / Edit) and **returned checks**; each row keeps the school and the cycle's name of the moment it was recorded (for Finance's Daily report). A candidate or cycle with any payment row can't be deleted (withdraw instead).
- **The date of birth, the results email, the drawn signature and the signer's name** are never readable through the app's normal rights (only through one-candidate staff functions) and are **never written to the history in plain text** ("on file" / "changed"). Once the keeping time has passed they are removed automatically (the "purge", run inside a few staff calls; nothing runs overnight).
- A new restricted login **`bb_registrar`** for the Black Belt family form: exactly two functions (`bb_public_cycle`, `bb_public_register`), no table, can't create anything, the same settings as `testing_registrar` and `star_registrar`. None of the three form logins can run another form's functions.
- **25 staff functions** (19 writes, 6 reads), the same security rules as 0003/0005/0006: RLS with `has_data_access()`, column rights only, nothing for `anon` or `service_role`, every change in `change_log`.
- 0016 changes **nothing** that 0001–0006, 0010 or 0011 made (tested: their fingerprints are identical before and after).
- **Known and accepted (as 13):** `bb_registrar` can create *temporary* tables (PostgreSQL's default TEMP right); they live only in its own session and every Black Belt function uses full `public.` names with `search_path = ''`.
- **Known and accepted:** the starting point and a cycle's requirements sheet can be changed only by hand in the SQL Editor (when a seeded number is wrong, v0.901). The guard allows that only for the `postgres` login with no action tag — a convenience, not a security wall (whoever connects as `postgres` can switch triggers off anyway). CP3 confirms read-only that the SQL Editor's `session_user` is `postgres`.

**Nothing secret goes into chat, git, `.env.local` or a screenshot** (handoff §6).

### 0016a. Before you apply 0016

1. Jeffrey's OK for this paste. The PGlite run passed and the security review of the SQL is done.
2. **CP1:** Jeffrey has checked `supabase/tests/0016_seed_review.txt` against the old Sheet (days, places, deadlines, prices, due dates, the requirements sheet, the placeholder waiver).
3. Claude checks read-only (through the connection) that **no `bb_` object exists yet**: no table, sequence or function whose name starts with `bb_`, and no role `bb_registrar`; and that `select session_user` in the SQL Editor answers `postgres` (Jeffrey runs that one line himself).

### 0016b. Apply 0016 (you, in the SQL Editor)

1. Copy **the whole file** `supabase/migrations/0016_black_belt.sql`.
2. **SQL Editor → New query**, paste, **Run**.
3. Supabase will warn about **destructive operations**. That's expected: the words appear inside rules (`on delete cascade`, `on delete restrict`), inside functions that run later (an admin removing a cycle or a fake registration; old rate-limit rows being cleaned up) and in `… if exists` lines that make re-running safe. **Nothing is removed now.** Confirm.
4. "Success." It's one transaction: on any error nothing is kept. Copy the error to Claude. (A few small result grids may show — the seed sets its "who wrote this" label with `select set_config(…)`. That's fine.)

**Running it again is safe** (tested: a second run changes no row and no fingerprint; the seed never overwrites, and the role's attributes and password are never touched).

**After migration 0024, never re-run this file except as step 0024f:** it silently undoes 0024's rubric lock and copy rules (0024's fingerprints then show `0016 RE-RUN`).

**After migration 0025, never re-run this file except through 0025g.**

### 0016c. Read-only checks (Claude runs these through the connection)

1. The list of new objects: 13 `bb_*` tables and the sequence `bb_candidate_ref_seq`.
2. **Fingerprints:** `supabase/tests/0016_fingerprints.sql`. Every line must match what `supabase/tests/pglite/run.mjs` printed for the tested copy (every `bb_` function with its code, settings, owner and who may call it; the `bb_registrar` role row; the 14 table / sequence rows; the read rules; the triggers, rules and indexes). **One expected difference:** on Supabase the role row shows `members=postgres` (as 13c). The file is a single read-only SELECT and contains neither of the words the connection refuses (run.mjs checks that).
3. `0003`–`0006`, `0010` and `0011` fingerprints: **unchanged** from their production records.
4. **Security advisor:** expected notices — "RLS enabled, no policy" on `bb_candidate_waivers` and `bb_starting_point` (INFO; nobody in the app may read them) and "security definer function executable by authenticated" for the 25 staff functions (each checks access and role itself). Anything else about a `bb_` object is a real problem.
5. **Size check** (contract CP3): the database size now vs the Free plan's 500 MB, and the expected growth (a drawn signature is at most 70 KB, so about 14 MB a season for 200 registrations, kept for years) — written into the Black Belt status file.

### 0016d. Run the tests (you, in the SQL Editor)

1. Open `supabase/tests/0016_tests.sql`, replace `<paste-admin-UID-here>` and `<paste-desk-UID-here>` (**Authentication → Users**), paste the whole file, **Run**. Supabase may warn about destructive operations (the test removes its own test rows and checks some removals are refused). Everything is rolled back. Confirm.
2. Expected: one row, **ALL 0016 TESTS PASSED**. A failure shows `TEST FAILED:` / `TEST SETUP:`; nothing is saved. Run `rollback;` once on its own, then tell Claude.
3. Then run `0005_tests.sql` and `0006_tests.sql` again → their PASSED rows (and, if you like, `0011_tests.sql`, `0010_tests.sql`, `0004_tests.sql`, `0003_tests.sql`, `0002_tests.sql`, `verify_pin_tests.sql` — 0016 must not have broken them).
4. Put the two placeholders back afterwards (don't save the file with the UIDs in it).
5. **Only the first time, while no Black Belt candidate exists yet:** the rollback undoes the test rows but not the reference-number counter, so the first real family would get e.g. BB-5040 instead of **BB-5001**. Reset it (security review N4); it refuses if any candidate exists:
   ```sql
   do $$ begin
     if exists (select 1 from public.bb_candidates) then
       raise exception 'Candidates exist - do NOT reset the reference counter';
     end if;
   end $$;
   select setval('public.bb_candidate_ref_seq', 5001, false);
   ```
   Once any family has registered, never run this (numbers are never reused, S14).
6. The test makes its own `zz test …` cycles and candidates, so it works before **and** after real Black Belt cycles exist. On a database where the school's waiver was already saved, it makes a test placeholder current for its first checks (rolled back).

### 0016e. Set the `bb_registrar` password (CP3b — you, on your PC + SQL Editor)

**Done 2026-10-21 (CP3b):** a SCRAM-SHA-256 password is stored for `bb_registrar` (checked read-only, value not shown); it's in Jeffrey's password manager as "Supabase bb_registrar (Hyperdrive)", user `bb_registrar.eozkfbdfxqlcbpewhach`; the script file was deleted.

Same method as 12d / 13e, with its **own** script and its **own** password — never the Color Belt or Star one.

0. **Clipboard history off** first (12a step 0): Windows **Settings → System → Clipboard** → Clipboard history off, Sync across your devices off.
1. Make a file **outside the repo**, e.g. `C:\Users\jberg\Documents\make-scram-bb.mjs`, with exactly this (the role name `bb_registrar` is written in; there is no password in it — it makes a new random one each time):
   ```js
   // Makes a random password for bb_registrar and its SCRAM-SHA-256 verifier.
   // The password goes to the clipboard (never shown); only the verifier is printed.
   import { randomBytes, pbkdf2Sync, createHmac, createHash } from 'node:crypto';
   import { execSync } from 'node:child_process';
   const role = 'bb_registrar';
   const password = randomBytes(32).toString('base64url');   // 43 letters, digits, - and _
   const salt = randomBytes(16);
   const salted = pbkdf2Sync(password, salt, 4096, 32, 'sha256');
   const clientKey = createHmac('sha256', salted).update('Client Key').digest();
   const storedKey = createHash('sha256').update(clientKey).digest();
   const serverKey = createHmac('sha256', salted).update('Server Key').digest();
   execSync('clip', { input: password });
   console.log(`alter role ${role} password 'SCRAM-SHA-256$4096:${salt.toString('base64')}$${storedKey.toString('base64')}:${serverKey.toString('base64')}';`);
   ```
   (The same SCRAM code as 12d and 13e; only the role name differs.)
2. In PowerShell: `node C:\Users\jberg\Documents\make-scram-bb.mjs`. The password is now on the clipboard: **save it in your password manager as a NEW entry**, "Supabase bb_registrar (Hyperdrive)" — not the Color Belt or Star entry.
3. **Check the printed line says `alter role bb_registrar password 'SCRAM-SHA-256$4096:…';`** — `bb_registrar`, **not** `testing_registrar` or `star_registrar`. If it names any other role, stop and tell Claude.
4. Copy only that line into a **new** SQL Editor query and **Run**. Then **delete that snippet** in the SQL Editor (handoff §6), copy something harmless, and **delete `make-scram-bb.mjs`**.
5. If the password ever leaks: run the script again (new password + verifier), update the Hyperdrive config (0016f), and the old one stops working.

### 0016f. Hyperdrive for the Black Belt form (CP5 — later, when the Black Belt Function is built, with Jeffrey's OK)

**Done 2026-10-21 (CP5, Jeffrey):** `tkd-bb-registrar` created (checked read-only: Session pooler host, port 5432, database `postgres`, user `bb_registrar.eozkfbdfxqlcbpewhach`, caching disabled, verify-full with the shared CA `572acb39…`, origin limit 5 — created at 20 and lowered); binding `HYPERDRIVE_BB` (Production) and variable `BB_PUBLIC_REGISTRATION=off` (Production) added; no deployment triggered. The password was made a second time (the first saved copy didn't match); the password manager entry is site `bb-registrar.example.com`.

Not part of the 0016 paste. When the Black Belt family form's Pages Function (`functions/api/black-belt/[code].js`, page `/black-belt/<code>`) is built:
1. Cloudflare → **Hyperdrive** → a **third** configuration `tkd-bb-registrar`: the same Session pooler host and port as 12g, database `postgres`, user **`bb_registrar.eozkfbdfxqlcbpewhach`**, password from the "Supabase bb_registrar (Hyperdrive)" entry. **Caching: Disabled.** **Origin connection limit: 5 or less.** TLS as 12g (Verify full with the existing Supabase CA certificate).
2. `tkd-dashboard` → **Settings** → **Bindings** → **Add** → **Hyperdrive**: variable name `HYPERDRIVE_BB`, configuration `tkd-bb-registrar`, **Production only**.
3. The Black Belt Function has its own kill switch, the Production variable `BB_PUBLIC_REGISTRATION` (default `off`; missing = the form says "not open").
4. **The shared rate limit** (20 tries an hour per visitor) counts the three forms together only while every Function makes its visitor key with the **same** `CLIENT_KEY_SECRET` (true today). A separate secret would make the limit per form.
5. Turnstile must accept the action `bb_register` on the production hostname.

### 0016g. Off switch (any time)

In this order (step 1 works in seconds):
1. **Database off switch (instant):** in the SQL Editor, run
   ```sql
   revoke execute on function public.bb_public_cycle(text) from bb_registrar;
   revoke execute on function public.bb_public_register(text, text, uuid, text, text, date, text, integer, uuid, boolean, boolean, text, text, text) from bb_registrar;
   ```
   From the next call on, both are refused for the Black Belt form's login, even on connections Hyperdrive already has open. **To turn it back on:** re-run the whole 0016 file, or `grant execute on function …` the same two lines `to bb_registrar`. While it is off, `0016_tests.sql` (T2a) and `0016_fingerprints.sql` fail — expected.
2. **Stop the Black Belt form:** set `BB_PUBLIC_REGISTRATION=off` (Production) and **Retry deployment**.
3. **Lock the login:** `alter role bb_registrar nologin;` (re-running 0016 does **not** turn it back on; `alter role bb_registrar login;` does).

Color Belt's and Star's forms (12i, 13g) are not affected by any of these.

### 0016h. Undo 0016 (only if something is badly wrong, and only BEFORE real data exists)

Only if Jeffrey decides to remove Black Belt testing completely: put the app back to a version without the Black Belt screens **first**, then run this in the SQL Editor (one transaction; tested in a scratch PGlite run: afterwards no `bb_` object or role is left, and `0005_tests.sql`, `0006_tests.sql` and `0011_tests.sql` pass again). **This deletes every Black Belt setting, waiver text, cycle, candidate, signed waiver and payment.** Supabase's destructive-operations warning is real this time.

**Why only before real money exists:** the payment rows can never be removed one by one (the guard refuses every row removal, on purpose); this script removes the payment **table** as a whole, which no app path can do.

**After an undo and a second paste:** because the history is kept, `0016_tests.sql` test T3a then finds the seed recorded twice and fails; adjust T3a (count only the newest seed batch) before re-running the tests.

**What stays:** the `change_log` rows Black Belt wrote (the history is append-only — the DOB, email, signature and signer's name are masked there), and Black Belt's rows in `testing_public_attempts`, which age out within 2 days. Nothing from 0001–0006, 0010 or 0011 is touched.

```sql
-- Undo migration 0016. change_log (the history) is KEPT.
begin;

-- safety stop (security review N5): refuse while any payment or any
-- candidate exists (remove test candidates with Delete permanently first)
do $$ begin
  if exists (select 1 from public.bb_payments) or exists (select 1 from public.bb_candidates) then
    raise exception 'Black Belt still has candidates or payments - undo refused';
  end if;
end $$;

-- the family form's two functions first (the instant off switch)
revoke execute on function public.bb_public_cycle(text) from bb_registrar;
revoke execute on function public.bb_public_register(text, text, uuid, text, text, date, text, integer, uuid, boolean, boolean, text, text, text) from bb_registrar;

-- the public, staff and helper functions (those naming a 0016 table in
-- their result must go before the tables)
drop function if exists public.bb_public_register(text, text, uuid, text, text, date, text, integer, uuid, boolean, boolean, text, text, text);
drop function if exists public.bb_public_register_core(text, text, uuid, text, text, date, text, integer, uuid, boolean, boolean, text, text, text);
drop function if exists public.bb_public_cycle(text);
drop function if exists public.bb_receipt(uuid);
drop function if exists public.bb_view_signature(uuid);
drop function if exists public.bb_candidate_detail(uuid);
drop function if exists public.bb_cycle_roster(uuid);
drop function if exists public.bb_cycles_list();
drop function if exists public.bb_cycle_defaults();
drop function if exists public.bb_mark_check_returned(uuid, text);
drop function if exists public.bb_record_refund(uuid, integer, integer, text, text);
drop function if exists public.bb_edit_payment(uuid, integer, text, text[], text, text);
drop function if exists public.bb_undo_payment(uuid);
drop function if exists public.bb_record_payment(uuid, integer, integer, text, text[], text);
drop function if exists public.bb_record_paper_waiver(uuid, integer);
drop function if exists public.bb_delete_candidate(uuid, integer);
drop function if exists public.bb_restore_candidate(uuid, integer);
drop function if exists public.bb_withdraw_candidate(uuid, integer);
drop function if exists public.bb_resolve_duplicate(uuid, integer, uuid, integer, boolean);
drop function if exists public.bb_change_plan(uuid, integer, uuid, boolean);
drop function if exists public.bb_update_candidate(uuid, integer, text, text, date, text, text, integer);
drop function if exists public.bb_add_candidate(uuid, text, text, date, text, text, integer, uuid, boolean, boolean);
drop function if exists public.bb_delete_cycle(uuid, integer, integer);
drop function if exists public.bb_set_registration(uuid, integer, boolean);
drop function if exists public.bb_update_cycle(uuid, integer, jsonb);
drop function if exists public.bb_add_cycle(jsonb, uuid);
drop function if exists public.bb_set_keep_years(integer, integer, integer, integer);
drop function if exists public.bb_save_waiver(uuid, text);
drop function if exists public.bb_public_answer(uuid);
drop function if exists public.bb_purge_due();
drop function if exists public.bb_recheck_pointing_at(uuid);
drop function if exists public.bb_recheck_duplicate(uuid);
drop function if exists public.bb_find_duplicate(uuid, uuid, text, text, date);
drop function if exists public.bb_lock_payment(uuid);
drop function if exists public.bb_lock_candidate(uuid);
drop function if exists public.bb_waiver_version_ok(uuid, timestamptz);
drop function if exists public.bb_purge_is_due(uuid, date);
drop function if exists public.bb_purge_due_on(uuid);
drop function if exists public.bb_candidate_money(uuid, date);
drop function if exists public.bb_candidate_items(uuid);
drop function if exists public.bb_cycle_state(uuid, date);
drop function if exists public.bb_age_on(date, date);

-- the 13 tables (their triggers, rules and indexes go with them), then
-- the reference counter
drop table if exists public.bb_payments, public.bb_candidate_waivers, public.bb_candidates,
                     public.bb_cycle_plan_payments, public.bb_cycle_kukkiwon_fees, public.bb_cycle_plan_amounts,
                     public.bb_cycle_plans, public.bb_cycle_day_parts, public.bb_cycle_days, public.bb_cycles,
                     public.bb_starting_point, public.bb_waiver_versions, public.bb_settings;
drop sequence if exists public.bb_candidate_ref_seq;

-- the trigger functions and the rule helpers the tables used
drop function if exists public.bb_before_write();
drop function if exists public.bb_waiver_versions_guard();
drop function if exists public.bb_starting_point_guard();
drop function if exists public.bb_cycles_rules();
drop function if exists public.bb_cycle_day_parts_guard();
drop function if exists public.bb_cycle_prices_guard();
drop function if exists public.bb_cycle_plan_payments_guard();
drop function if exists public.bb_candidates_rules();
drop function if exists public.bb_candidates_log();
drop function if exists public.bb_candidate_waivers_rules();
drop function if exists public.bb_candidate_waivers_log();
drop function if exists public.bb_payments_guard();
drop function if exists public.bb_requirements_is_valid(jsonb);
drop function if exists public.bb_price_is_valid(integer);
drop function if exists public.bb_email_is_valid(text);
drop function if exists public.bb_time_is_valid(time);

-- the Black Belt form's login
revoke usage on schema public from bb_registrar;
drop role if exists bb_registrar;

commit;
```

**Then the Cloudflare side** (only if 0016f was done): remove the `HYPERDRIVE_BB` binding, delete the `tkd-bb-registrar` Hyperdrive configuration, delete the `BB_PUBLIC_REGISTRATION` variable, **Retry deployment**, and delete the "Supabase bb_registrar (Hyperdrive)" password-manager entry.

**Why:**
- **Its own login and its own password:** a leak of one form's password can't reach another form's functions; each can be switched off on its own.
- **Never readable, only through one-candidate functions, and masked in the history:** dates of birth, emails, signatures and signers' names are mostly about minors (rulebook §5); leaving them out of a list wouldn't protect them, not granting them does — and the history is kept forever, so it never gets them in plain text.
- **Payments are never removed:** Finance's Daily report and the family's receipt must always add up; corrections are new rows.

---

## Migration 0014: Color Belt private testing (the Private testing tab)

**What it does** (`supabase/migrations/0014_testing_private.sql`, contract `docs/Dashboard Docs/Build contracts/CONTRACT-0014.md` §2):
- **Private testing is its own record, not part of any event** (rulebook v0.401). Three new tables: `testing_private` (one row per private testing: school, student, a **copy** of their class, belt, what they test for and the private price, paying by, day, time, active / cancelled), `testing_private_payments` (append-only, like event payments) and `testing_private_results` (Pass / Not passed / No show and a note, like the Grading tab). Plus a read view `testing_private_list` (the row + its payment state + what is still owed).
- **The rules, in the database:** the day from today up to a year ahead, the time 6:00 AM–10:00 PM in 5-minute steps; the private price is copied from Classes and ranks (never typed); **Mark paid** records what is owed (the full price, or just the difference); grading opens on the private day, after it only an admin; Change day or time is refused after Pass / Not passed and clears a No show (logged); Cancel keeps the payments; Restore (admins) only while the day is still ahead; Delete permanently (admins) removes it with its payments and result.
- **Move to private testing** (from an event roster's ⋯, all staff, any time — v0.404): the student leaves the event (withdrawn) and becomes a private testing; **the money moves with them** — for every live event payment an event reversal and a private payment, both dated on the **original** day (a transfer, not a refund). A testing-day No show is cleared (logged); Pass / Not passed refuse. Undo (only the mover, within 10 seconds) puts everything back — except when the move cleared a No show.
- **One live function replaced:** `testing_restore_student` (0010's version + one check): a moved registration can't be restored onto the event (new status `moved`). Nothing else that is live changes — no live table, view, trigger or other function.
- **Same security rules as 0005 / 0010:** RLS with `has_data_access()`, read rights for the app on every column except the login ids, no direct writes for anyone in the app, nothing for `anon`, the secret key or the family form's login; every change is in `change_log` (actions `private_add`, `private_update`, `private_change_day`, `private_change_paying_by`, `private_mark_paid`, `private_undo_payment`, `private_edit_payment`, `private_cancel`, `private_restore`, `private_delete`, `private_set_result`, `private_set_result_note`, `move_to_private`, `undo_move_to_private`, `clear_result`). Private testings are logged in `change_log` like all testing data (v0.400's `family_history` is for Prospects only).

**The order** (build plan §5): **CP2** database (0014a–0014c, Jeffrey's OK) → **CP3** real check from the local app (0014d) → **CP4** deploy (Jeffrey's OK). The live site keeps working between CP2 and CP4: it never reads the new tables, and the replaced Restore behaves as before for every registration that wasn't moved (none can be until phase 4 is deployed).

### 0014a. Apply 0014 (you, in the SQL Editor)

1. Copy **the whole file** `supabase/migrations/0014_testing_private.sql`.
2. **SQL Editor → New query**, paste, **Run**.
3. Supabase will warn about **destructive operations**. That's expected: the words are inside rules (`on delete cascade`: removing a private testing removes its payments and result), inside functions that run later (Delete permanently, clearing a No show, Undo move) and in `drop … if exists` lines that make re-running safe. **Nothing is removed now.** Confirm.
4. "Success. No rows returned." It's one transaction: on any error nothing is kept. Copy the error to Claude.

**Running it again is safe** (tested: a second run changes no row and no fingerprint). **Never re-run 0005 or 0010 on its own after this** — see 0014e.

### 0014b. Read-only checks (Claude runs these through the connection)

1. **Fingerprints:** `supabase/tests/0014_fingerprints.sql`. Every line must match what `supabase/tests/pglite/run.mjs` printed for the tested copy: the 24 functions (4 trigger functions, 5 helpers, 14 staff functions and the replaced `testing_restore_student`: code, settings, owner, who may call them), the 3 tables (RLS, rights per column, read rules), the view, the 9 triggers and every rule.
2. `0005_fingerprints.sql` and `0010_fingerprints.sql`: **only** the `testing_restore_student` line differs from before — expected. `0004_fingerprints.sql`, `0006_fingerprints.sql` and `0011_fingerprints.sql` (Finance): unchanged. `0003_fingerprints.sql`: identical except the rows of the new `testing_*` functions and `testing_restore_student` — expected (0003's file lists every `testing_*` function).
3. **Security advisor:** the only new expected notice is "security definer function executable by authenticated" for the 14 new staff functions (each checks access itself, then its rules). Anything else about the three new tables or the view (for example RLS off, or a function without a fixed `search_path`) is a real problem.

### 0014c. Run the tests (you, in the SQL Editor)

1. Open `supabase/tests/0014_tests.sql`, replace `<paste-admin-UID-here>` and `<paste-desk-UID-here>` (**Authentication → Users**), paste the whole file, **Run**. Supabase may warn about destructive operations (the test removes its own test rows, switches one trigger off for a moment to backdate a time, and checks some changes are refused). Everything is rolled back. Confirm.
2. Expected: one row, **ALL 0014 TESTS PASSED**. A failure shows `TEST FAILED:` / `TEST SETUP:`; nothing is saved. Run `rollback;` once on its own, then tell Claude.
3. Then run `0011_tests.sql`, `0010_tests.sql`, `0005_tests.sql`, `0006_tests.sql`, `0004_tests.sql`, `0003_tests.sql`, `0002_tests.sql` and `verify_pin_tests.sql` again — 0014 must not have broken them.
4. The test makes its own `zz test …` classes, events and private testings, so it works before **and** after real data exists.

### 0014d. CP3 — the real check (you, with the local app on the real database; Claude watches)

Run `Start dashboard.bat`, sign in as the admin.
1. On the **Private testing** tab: **Add private testing** for a TEST student, today, a time later today. **Mark paid** (the private price).
2. Create a **TEST** event and leave its registration **Closed** (so families never see it). Add one student, **Mark paid** (the regular price). Then **⋯ → Move to private testing** (today, another time): the student shows as Removed on the event ("Moved to private testing"), and on the Private testing tab with "Paid $… · $… more to collect"; **Mark paid** records just the difference (the top-up).
3. Open the first private testing's grading page: record a result and a note (the private day is today, so grading is open); **Print** (print preview is enough).
4. **Cancel** the moved one, then **Delete permanently** both private testings (admin), and delete the TEST event.
5. Claude checks through the connection (read-only): the history has the `private_add`, `move_to_private`, `private_mark_paid`, `private_set_result`, `private_cancel` and `private_delete` rows with the right names, the event money of the moved student nets 0, and nothing is left of the TEST data.

### 0014e. Undo and re-run warnings (only with Jeffrey's OK)

**Re-running 0005 after 0014** → re-run **0010**, then **0014**, straight after. **Re-running 0010 after 0014** → re-run **0014** straight after. (0005 and 0010 put back a `testing_restore_student` that ignores moves, so a moved student could be restored onto the event while their private testing exists. If the family-form off switch of 12i is in force, repeat 12i step 1 after re-running 0005.)

**Rollback without touching data:** put the previous site version back (Cloudflare Pages → Deployments → **Rollback**). 0014 can stay: the older screens never read the new tables.

**Removing 0014 completely** (only if Jeffrey decides so, and only **before real private testings exist**: it deletes every private testing **and the money moved into it**). **0014 is removed first, then (if wanted) 0010 (14e)** — never the other way round. **Never after Finance’s migration 0018 is live**: 0018’s Daily report functions read `testing_private` / `testing_private_payments`, so removing 0014 would break the Daily report — 0018 would have to be undone first (Finance’s SETUP §18). Three steps, **in this order**:

1. Put the app back to a version **without the Private testing tab**.
2. **Re-run the whole 0010 file** (14a). That puts back 0010's `testing_restore_student` (without the `moved` check).
3. Run this in the SQL Editor (one transaction). **This deletes every private testing with its payments and result.** Each removed row is first logged in `change_log` (action `undo_0014`), and the history keeps all its earlier rows too. Supabase's destructive-operations warning is real this time. It first checks that step 2 was done (if `testing_restore_student` still mentions private testings, it stops with a message and removes nothing). (The two lock helpers are removed before the tables because they return the tables' row types.)

```sql
-- Undo migration 0014 (step 3; run AFTER re-running 0010). change_log is KEPT.
begin;

-- safety check: stop here if step 2 (re-running 0010) wasn't done first
do $$
begin
  if pg_get_functiondef('public.testing_restore_student(uuid,integer)'::regprocedure) like '%testing_private%' then
    raise exception 'Do step 2 first: re-run the whole 0010 file, then run this block again. Nothing was removed.';
  end if;
end
$$;

-- remove the private testings row by row first (their payments and
-- results go with them), so every removal is in the history
select set_config('tkd.action', 'undo_0014', true);
select set_config('tkd.batch_id', gen_random_uuid()::text, true);
delete from public.testing_private;
select set_config('tkd.action', '', true);
select set_config('tkd.batch_id', '', true);

-- the view, the two helpers that return the tables' row types, then the
-- tables (their triggers, rules and read rules go with them)
drop view if exists public.testing_private_list;
drop function if exists public.testing_private_lock(uuid);
drop function if exists public.testing_private_lock_payment(uuid);
drop table if exists public.testing_private_results;
drop table if exists public.testing_private_payments;
drop table if exists public.testing_private;

-- every other 0014 function
drop function if exists public.testing_private_add(text, text, text, uuid, boolean, text, date, time);
drop function if exists public.testing_private_update(uuid, integer, text, text, uuid);
drop function if exists public.testing_private_change_day(uuid, integer, date, time);
drop function if exists public.testing_private_change_paying_by(uuid, integer, text);
drop function if exists public.testing_private_mark_paid(uuid, integer);
drop function if exists public.testing_private_undo_payment(uuid);
drop function if exists public.testing_private_edit_payment(uuid, text, integer, date);
drop function if exists public.testing_private_cancel(uuid, integer);
drop function if exists public.testing_private_restore(uuid, integer);
drop function if exists public.testing_private_delete(uuid, integer, uuid[]);
drop function if exists public.testing_private_set_result(uuid, text);
drop function if exists public.testing_private_set_result_note(uuid, text);
drop function if exists public.testing_move_to_private(uuid, integer, date, time);
drop function if exists public.testing_private_undo_move(uuid, integer);
drop function if exists public.testing_private_rank_copy(text, uuid);
drop function if exists public.testing_private_amount_due(uuid);
drop function if exists public.testing_private_time_is_valid(time);
drop function if exists public.testing_private_log();
drop function if exists public.testing_private_payments_guard();
drop function if exists public.testing_private_results_before_write();
drop function if exists public.testing_private_before_write();

commit;
```

Afterwards `0005_fingerprints.sql` and `0010_fingerprints.sql` equal a database that never had 0014. Tested in PGlite on every run (`run.mjs` step 15i, steps 2–3 exactly as written here, then the 0010 removal of 14e on top — the real removal order): the tables, the view and every 0014 function are gone, the 0005 / 0010 / 0003 fingerprints equal the ones from before 0014, `change_log` has one `undo_0014` row per removed row, and `0010_tests.sql` / `0005_tests.sql` pass.

**Why:**
- **Separate tables, not event registrations:** a registration must belong to an event; bending that would have changed live tables, checks and nine live functions. New tables leave everything live untouched except Restore.
- **The money moves append-only:** the event side gets reversals and the private side new payments, both on the original day, so nothing is ever edited or lost and a daily money report stays right.
- **Restore refuses a moved registration:** otherwise the student could be on the event and in a private testing at the same time.

---
## Migration 0020: session id only from the login token (security fix, rulebook v0.408)

**What it does** (`supabase/migrations/0020_session_id_claims.sql`):
- **Replaces one live function, `current_session_id()` (0001), and nothing else.** It answers "which sign-in session (device) is this?" for the PIN lock, the server lock and every history row (`change_log.session_id`).
- **Why:** 0001's version read the session id through Supabase's `auth.jwt()`, which looks at the old (legacy) setting `request.jwt.claim` **before** `request.jwt.claims`. The public form functions empty only `request.jwt.claims` and `request.jwt.claim.sub`, so whoever holds the family form's database login could plant a staff session id in a history row the form writes. No access gain (`auth.uid()` and `has_data_access()` stay empty) — low severity, fixed anyway.
- **The fix (decision B):** read the session id **only** from `request.jwt.claims` — what Supabase's API server fills for a signed-in user. A missing, empty, non-JSON or non-uuid value gives NULL, never an error. Same language (sql), stable, security definer, `search_path = ''`, same owner, same rights (`create or replace` keeps them; 0001's revoke is repeated).
- **What the app sees:** nothing. A real signed-in request carries the session id in `request.jwt.claims`, so every answer is the same uuid as before. That is exactly what the live checks in 0020d confirm.

**The order:** 0020a–0020c (Jeffrey's OK to paste) → **0020d live checks right after applying** (the PIN lock and server lock depend on this function). No app deploy is needed — no screen changes.

### 0020a. Before you paste (you, in the SQL Editor; Claude runs one read-only check)

1. **Green start:** run `supabase/tests/verify_pin_tests.sql` (one active staff UID) and `supabase/tests/0002_tests.sql` (admin + desk UIDs). Both must say **ALL PIN TESTS PASSED** / **ALL 0002 TESTS PASSED**. If either fails now, stop — the problem is older than 0020.
2. Claude runs `supabase/tests/0020_fingerprints.sql` through the read-only connection and writes the row down: that is **0001's version** (the undo below must give it back exactly).

### 0020b. Apply 0020 (you, in the SQL Editor)

1. Copy **the whole file** `supabase/migrations/0020_session_id_claims.sql`.
2. **SQL Editor → New query**, paste, **Run**.
3. Expected: "Success. No rows returned." There should be **no** destructive-operations warning (the file removes nothing). It's one transaction: on any error nothing is kept. If it stops with a message starting `0020:`, an earlier migration is missing — copy the message to Claude.

**Running it again is safe** (tested: a second run changes no fingerprint). **Re-running 0001 after this** puts the old function back → re-run 0020 straight after.

### 0020c. Read-only checks, then the tests

1. **Fingerprint** (Claude, connector): `supabase/tests/0020_fingerprints.sql` — the one row must match what `supabase/tests/pglite/run.mjs` printed for the tested copy (code, `lang=sql`, `volatility=s`, `definer=true`, `settings=search_path=""`, owner, rights).
2. **Security advisor** (Claude): no new notice. (`current_session_id` is not callable by `anon` or `authenticated`, so it never shows up as "executable by authenticated".)
3. **Tests** (you): open `supabase/tests/0020_tests.sql`, replace `<paste-admin-UID-here>` (**Authentication → Users**), paste the whole file, **Run**. Supabase may warn about destructive operations (the setup clears the admin's test PIN counters inside the transaction). Everything is rolled back. Confirm. Expected: one row, **ALL 0020 TESTS PASSED**. A failure shows `TEST FAILED:` / `TEST SETUP:`; nothing is saved. Run `rollback;` once on its own, then tell Claude.
4. Then run `verify_pin_tests.sql`, `0002_tests.sql`, `0004_tests.sql` and `0014_tests.sql` again (they use the PIN, the server lock and the history) — all must still pass. If you have time, also `0003`, `0005`, `0010` and `0011_tests.sql`.
5. `0006_tests.sql` (Star) passes before **and** after 0020: its check C9 (shared helpers Star uses must not change) accepts both the 0001 and the 0020 version of `current_session_id`.

### 0020d. LIVE CHECKS on the real site, right after applying (you; Claude watches)

Do these on **https://tkd-dashboard.pages.dev** (no deploy needed — the live app already uses the database functions). If **any** step fails: do the undo in 0020e straight away, then tell Claude.

1. **Sign in** with your admin password. The PIN screen (or the app) appears as usual.
2. **Enter your PIN** → the app opens and shows data (e.g. Testing → Classes and ranks lists the classes).
3. **Wrong PIN counts:** **Lock now** (top bar). Enter a **wrong** PIN **once** → the screen says how many tries are left (4). Then enter the right PIN → the app opens. (Don't go to 5 wrong tries — that signs this device out on purpose.)
4. **Lock / unlock:** **Lock now** again → the Lock screen; enter the PIN → back in.
5. **Server lock:** Lock now, then **reload the page** (F5) while locked → it must still ask for the PIN (the database, not just the browser, says "locked"); PIN → back in.
6. **One small change with a history row:** Testing → Classes and ranks → edit one rank's **testing-day price** up by $1 and save, then put it back (two changes, two history rows). Claude then checks through the read-only connection:
   `select id, occurred_at, action, table_name, session_id, actor_name from public.change_log order by id desc limit 2;`
   Both rows must have a **session_id** (not NULL) and your name. (A NULL here means the API server does not put the session id in `request.jwt.claims` — undo 0020e at once.)
7. On the **front desk** computer (or a private window signed in as the desk account): sign in, PIN → data shows. Same function, second account.

### 0020e. Undo (only with Jeffrey's OK)

Puts back **0001's exact** `current_session_id()` (word for word, same rights). Nothing else changes; no data is touched. Afterwards `0020_fingerprints.sql` must show the row written down in 0020a step 2. Paste in the SQL Editor:

```sql
-- Undo migration 0020: put back 0001's current_session_id() exactly.
begin;

-- 4c. current_session_id()
-- This sign-in session's id from the token's "session_id" claim, or NULL if
-- it is missing or not a valid uuid (checked with a pattern first, so a bad
-- value returns NULL instead of crashing the cast).
create or replace function public.current_session_id()
returns uuid
language sql
stable
security definer
set search_path = ''
as $$
  select case
           when (auth.jwt() ->> 'session_id')
                ~* '^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$'
           then (auth.jwt() ->> 'session_id')::uuid
         end;   -- no "else" = NULL
$$;

revoke execute on function public.current_session_id() from public, anon, authenticated;

commit;
```

Tested in PGlite on every run (`run.mjs` step 19f, this block exactly as written here): afterwards the fingerprint equals the one from before 0020, and `verify_pin_tests.sql` / `0002_tests.sql` pass. Then 0020 is applied again and its tests pass (undo → redo works).

**Why:**
- **Fix the one reader, not every form:** changing `current_session_id()` covers every current and future public form (Color Belt, Star, Forms, Camps) without touching any of them.
- **Only `request.jwt.claims`:** that is the setting Supabase's API server fills from the real login token. The legacy `request.jwt.claim` exists only for old setups; nothing in this app needs it.
- **Never an error:** this function runs inside every logged change. A crash on a strange value would block saving, so every bad value becomes NULL instead (the same as 0001 did for a bad uuid).

---

## Migration 0018: Finance — Color Belt private testing payments in the Daily report

**What it does** (`supabase/migrations/0018_finance_private.sql`, contract `docs/Dashboard Docs/Build contracts/CONTRACT-0018.md`): the Daily report, Close the day, History, Export, the payment detail, the Home reminder and the Both summary include Color Belt **private testing** payments (0014). A **Move to private testing** is a transfer: the payment's line carries on as the private row, and the day's totals, expected cash and fingerprint don't change. A closed day is **not** "changed after closing" because of a move. An **Undo move** leaves the day as it was (no "undone" line). It replaces six Finance functions, adds one index (`finance_testing_private_payments_paid_on_idx`) and changes no table, row, setting or right.

**Order:** 0011 (with its speed fix, §15e) → camps' 0013 + 0017 → 0014 → **0018**. **0018 is forward-only** — there is no undo file. It is built over the Finance functions as camps' 0017 leaves them (git `fb4ec24`; every camp part kept byte for byte). A **guard** at the top of the file stops it — and changes nothing — if 0011's speed fix, 0014 or camps' 0017 is missing, or if the three Finance functions it shares with 0017 aren't exactly what 0017 at `fb4ec24` made (then 0018 must be rebuilt first). Each step needs Jeffrey's OK.

### 0018-0. First: remove the CP3 test private testings (you, then Claude checks)
Color Belt's CP3 (2026-10-19) left **2 test private testings** on production ("Jeff Berg", Worcester, $70 each = **$140**, paid 2026-10-19). 0011 doesn't count private testing money, so today the Daily report doesn't show them. Once 0018 is in, it **would** count them as real money on Oct 19. So, before 0018:
1. **Delete both permanently**, the same way as in CP3: the local app on the real database from the `color-belt` worktree (`Start dashboard.bat`), as an admin, private testing → **Delete permanently** (the Color Belt session can walk you through it). Each delete removes the testing, its payments and its result, and is logged.
2. Nothing else needs removing (checked by the Color Belt session, 2026-10-20): the CP3 test event was already deleted with its payments, so `testing_payments` is empty. The only test money left is these 3 private payment rows (a $50 copy moved in from that event plus a $20 top-up, and one $70). After step 0, Oct 19 has no Color Belt money.
3. **Claude checks (read-only):** `select count(*) from public.testing_private;` must be **0**. Phase 4 isn't deployed, so there are no real private testings yet. If it isn't 0, stop.

### 0018a. Before you apply 0018 (Claude, read-only)
1. Run camps' `0017_fingerprints.sql` through the connection and compare it with the record of the PGlite run at git `fb4ec24` (camps' SETUP section for 0017): every line must match. If not, camps' 0017 on production isn't the one 0018 was built over — stop; 0018 must be rebuilt (the guard would refuse it anyway).
2. Run `supabase/tests/0018_preapply_check.sql` through the connection. It lists the **closed** days that have private testing payments, a payment moved to a private testing **before** the day was closed, or an undone move. After 0018, days with private payments or moves-before-close **will show "Changed after closing"** — correctly: that money wasn't counted when they were closed. Undone moves don't change anything. Show Jeffrey the list; an admin can reopen and close those days again afterwards if wanted. An empty list means no closed day changes.

### 0018b. Apply 0018 (you, in the SQL Editor; outside desk hours)
1. **Outside desk hours:** building the index briefly holds back private payment writes until the paste finishes (seconds).
2. Copy the whole file, **SQL Editor → New query**, paste, **Run**. The destructive-operations warning comes from the `drop function if exists` lines (the chain helpers are recreated straight after, with more output columns). One transaction; safe to run again.
3. **Forward-only — don't re-run earlier Finance files after 0018:** re-running **0011** stops with "cannot change return type of existing function" and is rolled back (nothing changes). Re-running camps' **0017** runs and puts back a chain helper *without* private payments — `finance_chain_items` then fails when called and the Daily report breaks until 0018 is pasted again, so 0018 must follow straight after, in the same sitting.

4. **A Daily report left open during the paste** gets one amber “Someone else changed this just now” when Close the day is pressed (0018 builds the day's fingerprint differently), then reloads — nothing is lost; just close the day again.

### 0018c. Read-only checks (Claude, through the connection)
1. `0018_fingerprints.sql`: every line matches the PGlite run (6 functions + 1 index). `0011_fingerprints.sql` and camps' `0017_fingerprints.sql` differ from their records only in the functions 0018 replaces (and the new index line). 0003–0006, 0010 and 0014: unchanged.
2. **Security advisor:** nothing new (no new table; the replaced functions keep their rights).

### 0018d. Run the tests (you, in the SQL Editor)
1. `supabase/tests/0018_tests.sql` with the two UIDs pasted, **Run** (it finishes in seconds). Expected: **ALL 0018 TESTS PASSED**. It uses the real Color Belt private testing functions and test events named `zz fin18 …`, on days in 2021. A test payment is also recorded **today** in Shrewsbury. Everything is rolled back.
2. Then `0011_tests.sql` and camps' `0017_tests.sql` again — both must still pass with 0018.

---

## Migration 0021: Not interested families deleted after 6 months (rulebook v0.611)

**What it does** (`supabase/migrations/0021_prospects_not_interested_sooner.sql`): replaces **one** function, `prospects_purge_old` — the clean-up that runs whenever Prospects (and, since v0.615, the Calendar) is loaded. A family in which **every** child is Not interested is deleted **6 months** after its last activity (a note, a call, a status change, a booking or a check-in; marking someone Not interested counts, so it restarts the 6 months). Every other family without a Joined child keeps the **2 years** (v0.244); Joined is never deleted. How a deletion happens is unchanged from 0015 (rule checked again at the moment of deleting, the family's history removed with it, one counts-only row in `change_log`). No table, permission or other function changes.

**Each step needs Jeffrey's OK.** Only after 0015 is live (it is).

**Before you paste:** the next time anyone opens Prospects after this, every all-Not-interested family that has been quiet for **6 months or more** is deleted for good. Look at the "Not interested" chip first if that matters.

### 0021a. Apply 0021 (you, in the SQL Editor)

1. Copy **the whole file** `supabase/migrations/0021_prospects_not_interested_sooner.sql` → **SQL Editor → New query** → paste → **Run**.
2. Supabase may warn about **destructive operations**: the word is inside the clean-up function, which only runs later. **Nothing is removed now.** Confirm.
3. "Success." One transaction: on any error nothing is kept. **Running it again is safe.**

### 0021b. Read-only checks (Claude runs these through the connection)

1. **Fingerprints:** `supabase/tests/0021_fingerprints.sql` must match what `supabase/tests/pglite/run.mjs` (step0021) printed (2 rows).
2. **0012's and 0015's fingerprints move by exactly one line each on purpose:** the `prospects_purge_old()` line (both list that function). Everything else: unchanged.
3. **Security advisor:** nothing new (the function can't be called from the app; only the Prospects list calls it).

### 0021c. Run the tests (you, in the SQL Editor)

1. `supabase/tests/0021_tests.sql` with `<paste-admin-UID-here>` / `<paste-desk-UID-here>` replaced → **ALL 0021 TESTS PASSED**. It makes its own test families and rolls everything back; it only checks its own families.
2. Then `0015_tests.sql` and `0012_tests.sql` again. (Those two count the clean-up's results exactly. If a real family happens to become due at that very moment they can fail for that reason alone — nothing is harmed, they roll back; run them again, or tell Claude. `0021_tests.sql` only counts its own families.)

### 0021d. Never re-run 0012 or 0015 after this

They would put back the 2-year-only clean-up (0012 also its old history triggers — see 0015's header). If 0015 is ever re-run, re-run 0021 straight after.

## Migration 0024: Black Belt rubric editor (rulebook v0.921–v0.933)

**Status: built and tested locally (PGlite), NOT applied.** Each step below needs Jeffrey's OK for that step. Contract: `docs/Dashboard Docs/Build contracts/CONTRACT-0024.md`; the paste follows the run sheet `docs/Testing/Black Belt Testing/TKD-BlackBelt-0024-RunSheet.md` (CP2).

**What it does** (`supabase/migrations/0024_black_belt_rubric.sql`):
- **The default rubric** (`bb_default_rubric`, one row): what each Dan is tested on — the four parts, subjects, how each is scored, points, pass marks, extra points. Admins edit it **one Dan at a time** (Save [Dan]); every new cycle starts from a copy of it (v0.921). Staff can read it.
- **A cycle's own copy** (`bb_cycles.requirements`): copied from the default when the cycle is added, editable until registration **first** opens, then **locked** — by the functions and by the table itself (only a hand fix in the SQL Editor can change a locked copy).
- **The first opening is admins only** (v0.930); its toast Undo (15 seconds, same admin, nothing changed since, no family registered) makes the cycle "never opened" again (v0.929). Closing and later reopening stay as 0016 (staff may).
- **Undo of a save** (R11): the last save of each Dan can be undone for 15 seconds by the admin who saved, as one more save. The "undo slots" live in `bb_rubric_undo` (nobody in the app can read it).
- **Every value is checked by the database** before it is stored (the "validator", contract §3; the screen checks the same rules while typing — both are run against `supabase/tests/0024_rubric_cases.json`).
- **The family form** gets a *public view* of the rubric: no revision numbers, no "saved by" names, no source, and nothing at all while the cycle has never opened.
- **One-time conversion:** every existing cycle's sheet (version 1) is converted to the new shape (version 2) **without changing any number** (tested), and the default is made from the Fall 2026 starting point (the CP1-approved numbers). The starting point itself stays as it is.
- Changes **no object of 0001–0023** except six 0016 objects, each replaced (never by editing 0016): `bb_cycles_rules()`, the trigger `bb_cycles_before_write` (the rubric column no longer raises the cycle's version), the rule `bb_cycles_requirements_check` (now version 2 only), `bb_set_registration`, `bb_add_cycle` (copies the default) and `bb_public_cycle`.
- **Known and accepted (contract §2.4, OI-15):** the rubric's table rule runs on *every* update of a cycle (a few milliseconds; timed in PGlite). It calls the shared character rules of 0003 / 0005: a later migration that makes those stricter must first re-check every stored rubric.

### 0024a. Before you apply (Claude, read-only through the connection)
1. **No `bb_default_rubric` yet** (`select to_regclass('public.bb_default_rubric')` is empty).
2. **How many cycles exist, and how many hold a version 1 sheet** (`select count(*), count(*) filter (where requirements -> 'schema_version' = '1') from public.bb_cycles`). Expected on production: none. If any exist, they are converted by 0024 — report them to Jeffrey first (OI-14) and snapshot their sheets (the run sheet says how).
3. `0016_fingerprints.sql` = the live record (0016's CP3). Take the baseline of **every** fingerprint file (0003 … 0022) for step 0024c.

### 0024b. Apply 0024 (you, in the SQL Editor)
1. Copy **the whole file** `supabase/migrations/0024_black_belt_rubric.sql` → **SQL Editor → New query** → paste → **Run**.
2. Supabase will warn about **destructive operations**: the words are in rules (`on delete cascade`), inside functions that run later (removing an undo slot) and in `… if exists` lines that make re-running safe. **Nothing is removed now.** Confirm.
3. "Success." One transaction: on any error nothing is kept — copy the error to Claude. **Running it again is safe** (tested: no second seed, no second conversion, nothing logged).
4. **Never re-run `0016_black_belt.sql` after this** (except as part of 0024f): it would silently put back 0016's Add cycle, opening and lock rules. `0024_fingerprints.sql` then shows `check | 0016_rerun | 0016 RE-RUN OVER 0024`; the fix is to paste 0024 again.
5. **After migration 0025, never re-run this file except through 0025g.**

### 0024c. Read-only checks (Claude runs these through the connection)
1. **`supabase/tests/0024_fingerprints.sql`**: every line equals what `supabase/tests/pglite/run.mjs` (step0024) printed, including **`check | 0016_rerun | ok`**. (A single read-only SELECT without the words the connection refuses; run.mjs checks that.)
2. **Every earlier fingerprint file** is byte-identical to the 0024a baseline, **except `0016_fingerprints.sql`**, which differs by exactly this (contract §11.3) and nothing else:
   - the `function` rows of `bb_add_cycle`, `bb_set_registration`, `bb_public_cycle` and `bb_cycles_rules()`: only the md5 changes (definer, volatility, settings, owner, rights identical);
   - the `trigger` row `bb_cycles.bb_cycles_before_write`: its arguments end in `'requirements')` (was `'')`);
   - the `constraint` row `bb_cycles.bb_cycles_requirements_check`: `CHECK (bb_rubric_is_valid(requirements))` (was `bb_requirements_is_valid`);
   - 19 **added** `function` rows: `bb_save_default_dan`, `bb_undo_default_dan`, `bb_save_cycle_dan`, `bb_undo_cycle_dan`, `bb_undo_first_open` and the 14 internal ones (`bb_rubric_num_ok`, `bb_rubric_int_ok`, `bb_rubric_letters`, `bb_rubric_brackets_problems`, `bb_rubric_dan_problems`, `bb_rubric_is_valid`, `bb_rubric_part_max`, `bb_rubric_most_points`, `bb_rubric_from_v1`, `bb_rubric_fresh_copy`, `bb_rubric_public`, `bb_rubric_put_dan`, `bb_default_rubric_guard`, `bb_rubric_undo_guard`).
3. **Security advisor:** exactly **+5** "security definer function executable by authenticated" (the five new functions; each checks access and role itself) and **+1** "RLS enabled, no policy" (`bb_rubric_undo`, INFO: nobody in the app may read it). Nothing else new.
4. If cycles existed (0024a step 2): their converted sheets give the same numbers as their snapshots (the run sheet's comparison) and their `version` did not change.

### 0024d. Run the tests (you, in the SQL Editor)
1. `supabase/tests/0024_tests.sql` with `<paste-admin-UID-here>` / `<paste-desk-UID-here>` replaced → **ALL 0024 TESTS PASSED**. It makes its own `zz test …` cycles, saves the default and takes one rule off for a moment (U8) — everything is rolled back. Supabase may warn about destructive operations: confirm.
2. Then `0016_tests.sql` (it knows about 0024 and checks the new behaviour where 0024 changed it) → **ALL 0016 TESTS PASSED**. Put the UIDs back to the placeholders afterwards (never commit real UIDs).

### 0024e. What the app needs
Deploy the new front end (rubric editor, the cycle's Rubric tab, admin-only first opening with its Undo, the family form's new requirements panel) **right after** the paste — with Jeffrey's OK for the push. Until then the old screens keep working: Add cycle copies the default, a staff first opening is refused (`not_allowed`), nothing old reads the new sheet shape (no cycle exists, and the family form stays off, `BB_PUBLIC_REGISTRATION=off`).

### 0024f. Undo 0024 (only with Jeffrey's OK, and only while NO Black Belt cycle exists)
Removes 0024's tables and functions and puts 0016's rule back; then **paste `0016_black_belt.sql` again** straight after — it is re-run safe and puts back its `bb_add_cycle`, `bb_set_registration`, `bb_public_cycle`, `bb_cycles_rules` and the trigger exactly. The script refuses (and changes nothing) if any cycle exists, because a cycle's sheet is version 2 by then.

**Paste the two straight after each other, with nothing in between** (or put both in one SQL Editor tab, this block first and 0016 under it, and run them together). Why: between the two, the database is half-undone. 0024's versions of `bb_add_cycle`, `bb_set_registration`, `bb_public_cycle` and `bb_cycles_rules` are still in place, but the table and helper functions they use are gone, so **Add cycle, opening registration and the family form's cycle page give errors** until 0016 puts its own versions back. Nobody should be using the Black Belt screens while you do this.

Paste in the SQL Editor:

```sql
-- Undo migration 0024 (the Black Belt rubric editor). Then paste 0016_black_belt.sql again.
begin;

-- refuse while any Black Belt cycle exists (its rubric is version 2 now)
do $$
begin
  if exists (select 1 from public.bb_cycles) then
    raise exception 'Undo 0024 refused: a Black Belt cycle exists. Nothing was changed. Tell Claude.';
  end if;
end
$$;

-- 0016's rule on the cycles' sheet back (before its 0024 function goes)
alter table public.bb_cycles drop constraint if exists bb_cycles_requirements_check;
alter table public.bb_cycles add constraint bb_cycles_requirements_check check (public.bb_requirements_is_valid(requirements));

-- the two tables (their triggers, rules and rights go with them)
drop table if exists public.bb_rubric_undo;
drop table if exists public.bb_default_rubric;

-- the five staff functions and 0024's internal helpers
drop function if exists public.bb_save_default_dan(integer, integer, jsonb);
drop function if exists public.bb_undo_default_dan(integer, integer);
drop function if exists public.bb_save_cycle_dan(uuid, integer, integer, jsonb);
drop function if exists public.bb_undo_cycle_dan(uuid, integer, integer);
drop function if exists public.bb_undo_first_open(uuid, integer);
drop function if exists public.bb_rubric_num_ok(jsonb, numeric, numeric);
drop function if exists public.bb_rubric_int_ok(jsonb, integer, integer);
drop function if exists public.bb_rubric_letters(text, text);
drop function if exists public.bb_rubric_brackets_problems(jsonb, jsonb);
drop function if exists public.bb_rubric_dan_problems(jsonb, integer);
drop function if exists public.bb_rubric_is_valid(jsonb);
drop function if exists public.bb_rubric_part_max(jsonb, integer, integer);
drop function if exists public.bb_rubric_most_points(jsonb, integer, integer);
drop function if exists public.bb_rubric_from_v1(jsonb);
drop function if exists public.bb_rubric_fresh_copy(jsonb);
drop function if exists public.bb_rubric_public(jsonb);
drop function if exists public.bb_rubric_put_dan(jsonb, integer, jsonb, integer);
drop function if exists public.bb_default_rubric_guard();
drop function if exists public.bb_rubric_undo_guard();

commit;
```

Then **paste `supabase/migrations/0016_black_belt.sql` again** (0016b; its re-run changes no row). Tested in PGlite on every run (`run.mjs` step0024 (k), this block exactly as written here, then 0016): with a cycle the block refuses and changes nothing; without one, 0016's fingerprints afterwards equal those from before 0024 and `0016_tests.sql` passes; then 0024 applies again. The history (`change_log`) keeps 0024's rows (it is append-only).

---

## Migration 0025: Black Belt grading and results (rulebook v0.938–v0.955)

**Status: APPLIED to production on 2026-10-24 (CP2)** from commit f2cfddc (file SHA-256 `6f81c92a…15765a`): 0025's fingerprints equal the tested copy row for row, nothing outside Black Belt changed, the advisor shows only the expected +15 / +2 notices, `0025_tests.sql`, `0024_tests.sql` and `0016_tests.sql` pass on production, and the reference counter was reset to **5002** (BB-5001 was used once by a live try-out; rulebook v0.960). On production the SQL Editor login may not switch to `bb_registrar` (no SET right), so the tests check that role from the catalog there. Contract: `docs/Dashboard Docs/Build contracts/CONTRACT-0025.md` (approved at CP0, rulebook v0.958); the paste follows the run sheet `docs/Testing/Black Belt Testing/TKD-BlackBelt-0025-RunSheet.md` (CP2, written 2026-10-23).

**What it does** (`supabase/migrations/0025_black_belt_grading.sql`):
- **Grades** (`bb_grades`): one row per graded subject of a candidate — a letter, or a measured number with the way it was done (Pull-up or Hold). **Extra-points counts** (`bb_extra_counts`) and **make-up subjects** (`bb_makeup_subjects`: the ones an admin chose, and the ones a make-up retests).
- **The result is never stored**: one pure function (`bb_grade_result`) works it out every time from the cycle's rubric, the age on the first testing day and the rows above (v0.938). The app has an exact twin; both are checked against `supabase/tests/0025_grading_cases.json`.
- **Make-up candidates** (v0.941): a candidate whose result is a Make-up comes back on a later cycle as a row with `source = 'makeup'` — no plan, never a fee (the database refuses any money row for it), the same BB reference, the kept grades copied in (grayed "kept") and the rest retested.
- **Locks that protect grades:** the cycle's rubric is locked **for good** once its first grading row is written (`bb_cycle_grading_started`, Q-G1 / v0.956); a past testing day or part with grades can't be removed or moved, and the first day can't move once grading started (S2); a candidate or cycle with real grades can't be deleted (Q-G3: withdraw instead); a Dan change asks before clearing the old Dan's grades (Q-G4).
- **The purge keeps the result** (Q-G2): when the date of birth is removed, the age on the first testing day is kept (`bb_candidates.age_kept`, masked in the history like the DOB). A make-up row's waiver keeps the earlier row's data as long as the make-up's own (S20).
- **Results:** the three result email texts admins edit (`bb_result_texts`, seeded word for word from R03), **Mark as sent** with its Undo (`bb_result_sends`), and the admin-only **CSV**, logged in `bb_downloads` before any row leaves the database.
- **Replaces 15 live functions** of 0016 / 0024 (each marked `-- 0025: replaced`; their answers only gain keys, so the live app keeps working until the new screens are deployed) and the trigger `bb_candidates_before_write`. Changes nothing in Finance, Star, Color Belt or the family form.

### 0025a. Before you apply (Claude, read-only through the connection)
1. **No `bb_grades` yet** (`select to_regclass('public.bb_grades')` is empty).
2. **`0016_fingerprints.sql` and `0024_fingerprints.sql` = the live baseline** (0024's CP2 record, with `check | 0016_rerun | ok`). Take the baseline of **every** fingerprint file (0003 … 0024) for step 0025c.
3. **Counts:** how many cycles and candidates exist (`select count(*) from public.bb_cycles`, `… bb_candidates`), for the run sheet.
4. **Baselines:** the security advisor's list, and the whole-database snapshot outside Black Belt (the run sheet's query).

### 0025b. Apply 0025 (you, in the SQL Editor)
1. Copy **the whole file** `supabase/migrations/0025_black_belt_grading.sql` → **SQL Editor → New query** → paste → **Run**.
2. Supabase will warn about **destructive operations**: the words are in rules (`on delete cascade`, `on delete set null`), inside functions that run later (Clear removes a grade row), in `… if exists` lines that make re-running safe and in `alter column … drop not null`. **Nothing is removed now.** Confirm.
3. "Success." One transaction: on any error nothing is kept — copy the error to Claude. **Running it again is safe** (tested: no second seed, nothing logged, no fingerprint change).
4. **Never re-run `0016_black_belt.sql` or `0024_black_belt_rubric.sql` after this** (except as part of 0025g): they would silently put back their versions of the replaced functions. `0025_fingerprints.sql` then shows `check | rerun | 0016 OR 0024 RE-RUN OVER 0025 (…)`; the fix is to paste 0025 again (tested).

### 0025c. Read-only checks (Claude runs these through the connection)
1. **`supabase/tests/0025_fingerprints.sql`**: every line equals what `supabase/tests/pglite/run.mjs` (step0025) printed, including **`check | rerun | ok`**, the `column | bb_candidates.cycle_plan_id | attnotnull=false` row and the three `text` rows (the seeded texts' md5). (A single read-only SELECT without the words the connection refuses; run.mjs checks that.)
2. **Every earlier fingerprint file** is byte-identical to the 0025a baseline, except (contract §12.3) and nothing else:
   - `0016_fingerprints.sql`: the `function` rows of the 15 replaced functions — `bb_purge_due_on`, `bb_purge_due`, `bb_candidates_rules`, `bb_candidates_log`, `bb_update_cycle`, `bb_delete_cycle`, `bb_update_candidate`, `bb_change_plan`, `bb_restore_candidate`, `bb_delete_candidate`, `bb_cycle_roster`, `bb_candidate_detail`, `bb_cycles_rules`, `bb_save_cycle_dan`, `bb_undo_cycle_dan` — **md5 only**; the `trigger` row `bb_candidates.bb_candidates_before_write` with the new arguments (`…,makeup_of_cycle_name` / `…,makeup_of_candidate_id,age_kept`); the `constraint` row `bb_candidates.bb_candidates_source_check` (now also `'makeup'`); the `constraint` and `index` rows `bb_candidates_reference_key` **gone**; **added**: the 42 new functions, the 4 triggers `bb_payments_makeup_guard`, `bb_cycle_days_grading`, `bb_cycle_day_parts_grading`, `bb_candidates_keep_age`, the 7 rules `bb_candidates_makeup_of_fk`, `…_makeup_of_self_check`, `…_makeup_of_check`, `…_makeup_name_check`, `…_makeup_plan_check`, `…_makeup_kukkiwon_check`, `…_age_kept_check`, and the 3 indexes `bb_candidates_reference_idx`, `bb_candidates_one_active_makeup_idx`, `bb_candidates_makeup_of_idx`;
   - `0024_fingerprints.sql`: the md5 of `bb_cycles_rules()`, `bb_save_cycle_dan` and `bb_undo_cycle_dan` only; its `check | 0016_rerun | ok` stays.
3. **Security advisor:** exactly **+15** "security definer function executable by authenticated" (the 15 new staff functions; each checks access and role itself) and **+2** "RLS enabled, no policy" (`bb_downloads`, `bb_cycle_grading_started`: INFO, nobody in the app may read them). Nothing else new.
4. **The three texts:** `select kind, md5(body) from public.bb_result_texts order by kind` = the `text` rows of step 1.
5. **How long the "Make-up from an earlier cycle" picker takes on production** (`bb_makeup_list`; it missed its 300 ms limit in PGlite on a 6-year, 720-candidate seed — accepted, timed here instead). The function itself answers `no_access` through the connection (it needs a signed-in staff session), so this read-only query times its main work: working out the result of every active, not-purged candidate who has a typed grade, as the picker does. Read `Execution Time` at the bottom (a few ms right after the paste: no grades exist yet; run it again once real cycles are graded):

```sql
explain (analyze, timing off, summary on)
select public.bb_candidate_result(c.id)
  from public.bb_candidates c
 where c.status = 'active' and c.personal_removed_at is null
   and (c.source = 'makeup' or exists (select 1 from public.bb_grades g where g.candidate_id = c.id and not g.kept));
```

### 0025d. Run the tests (you, in the SQL Editor)
1. `supabase/tests/0025_tests.sql` with `<paste-admin-UID-here>` / `<paste-desk-UID-here>` replaced → **ALL 0025 TESTS PASSED**. It makes its own `zz test …` cycles and candidates, moves some into the past, turns the purge numbers on for a moment and switches one trigger off for one statement (the 10-second undo test) — everything is rolled back. Supabase may warn about destructive operations: confirm.
2. Then `0024_tests.sql` and `0016_tests.sql` (both know about 0025 and check the new behaviour where 0025 changed it) → **ALL 0024 TESTS PASSED** / **ALL 0016 TESTS PASSED**. Put the UIDs back to the placeholders afterwards (never commit real UIDs).

### 0025e. What the app needs
Deploy the new front end (Grading and Results tabs, Result emails, Make-up from an earlier cycle, the Dan-change dialog, the "has grades" refusals) **after** the paste, with Jeffrey's OK for the push. Until then the old screens keep working: every replaced read only gains keys (tested: the version-aware `0016_tests.sql` checks the old answers' exact keys), and no grade, make-up or send exists until the new screens write one.

### 0025f. Hand-fix check (Claude, read-only — after any hand fix of a locked rubric or of grading rows)
A grade or count row that no longer fits its cycle's rubric (a subject or item that isn't there any more, a subject in another part, a way that doesn't exist) is **ignored** by the result (it counts nowhere). This lists them; each one is fixed by hand, deliberately:

```sql
select 'grade' as what, c.cycle_id, g.candidate_id, g.dan, g.part_code, g.subject_id, g.way, null::text as item_name
  from public.bb_grades g join public.bb_candidates c on c.id = g.candidate_id join public.bb_cycles y on y.id = c.cycle_id
 where not exists (select 1 from jsonb_array_elements(y.requirements -> 'dans' -> (g.dan - 1) -> 'parts') as p(e)
                   cross join lateral jsonb_array_elements(p.e -> 'subjects') as s(e)
                   where p.e ->> 'code' = g.part_code and s.e ->> 'id' = g.subject_id
                     and (g.way is null or g.way < jsonb_array_length(s.e -> 'ways')))
union all
select 'count', c.cycle_id, x.candidate_id, x.dan, null, null, null, x.item_name
  from public.bb_extra_counts x join public.bb_candidates c on c.id = x.candidate_id join public.bb_cycles y on y.id = c.cycle_id
 where not exists (select 1 from jsonb_array_elements(y.requirements -> 'dans' -> (x.dan - 1) -> 'extra_points' -> 'items') as i(e)
                   where i.e ->> 'name' = x.item_name);
```

Also: **removing a cycle by hand** in the SQL Editor is refused once it ever had grading (the "grading started" mark only goes with Delete cycle). To do it on purpose, run `select set_config('tkd.action', 'bb_delete_cycle', true);` first, in the same transaction.

### 0025g. Undo 0025 (only with Jeffrey's OK, and only before anyone graded)
Paste **`supabase/manual/0025u_undo.sql`** (whole file) into the SQL Editor and Run. It **refuses** (and changes nothing) while any grade, count or make-up subject, any "grading started" mark, make-up candidate, "sent" mark, CSV download row, changed result text or kept age exists — those are real records. Otherwise it removes 0025's seven tables (with their triggers), its three `bb_candidates` columns, the seven new rules, the three new indexes, the four triggers on old tables and every new function, and puts back — **from copies kept in the script, never by re-running 0016 or 0024** — `bb_candidates_before_write`'s arguments, `not null` on `cycle_plan_id`, `bb_candidates_reference_key`, the `source` rule and every replaced 0016 / 0024 function. Afterwards `0016_fingerprints.sql` and `0024_fingerprints.sql` equal 0025a's baseline and `0016_tests.sql` / `0024_tests.sql` pass. Tested in PGlite on every run (`run.mjs` step0025 (g): the refusals, then on a clean copy the script exactly as written, then 0025 again). The history (`change_log`) keeps 0025's rows (it is append-only). To redo: paste 0025 again.

## Admin: change the front-desk PIN or password

The front desk (`shrewsburyustc@gmail.com`) is a **shared account**, so the app hides Change PIN and Change password for it. Only an admin changes them, here in Supabase, until the Staff accounts screen exists.

> **Once 0004 and the Staff accounts screen are live, use Staff accounts instead** (initials → Admin → Staff accounts; section 11). The snippets below stay as an **emergency backup** only, for when the app can't be used.

### Change the desk's PIN

In **SQL Editor**, paste this, replace `<4-digit-PIN>` and `<paste-desk-UID-here>`, and Run:

```sql
-- Sets (or replaces) the front desk's 4-digit unlock PIN.
-- Stores only a bcrypt hash; the PIN itself is never saved in the table.
-- Also clears the desk's wrong-PIN counts (a desk device that hit 5 wrong
-- PINs STAYS locked - it needs the password), and locks every desk device
-- right now, so each one asks for the new PIN.
with new_pin as (
  select '<4-digit-PIN>'::text as pin            -- type the PIN ONLY here
),
updated as (
  update public.staff as s
     set pin_hash = extensions.crypt(n.pin, extensions.gen_salt('bf', 10))
    from new_pin as n
   where s.id = '<paste-desk-UID-here>'
     and n.pin ~ '^[0-9]{4}$'                    -- exactly 4 digits
     and not public.pin_is_too_easy(n.pin)       -- not 1111, 1234, 4321, ...
  returning s.id, s.full_name
),
cleared as (
  delete from public.pin_attempts as a           -- clear wrong-PIN counts...
   using updated as u
   where a.staff_id = u.id
     and a.locked_at is null                     -- ...but keep PIN-locked devices locked
  returning a.session_id
),
locked as (
  update public.session_unlock as l              -- lock the desk's devices now
     set unlocked_until = now(),
         updated_at     = now()
    from updated as u
   where l.staff_id = u.id
  returning l.session_id
)
select u.full_name,
       'PIN set' as result,
       (select count(*) from cleared) as device_counters_cleared,
       (select count(*) from locked)  as devices_locked
from updated as u;
```

- **1 row returned** ("PIN set"): it worked. Tell the desk staff the new PIN in person.
- **0 rows returned**: the PIN wasn't exactly 4 digits, it was too easy, or the UID is wrong. Fix it and run again.
- **Check the PIN by eye first:** not all the same digit (1111), not a straight run up or down (0123, 1234, … 6789, or 9876, … 3210). The snippet refuses those too, but it's quicker to pick a good one.
- Supabase may warn about **destructive operations** (the `delete` line). Expected; confirm.

> **Warning: don't leave the PIN in the editor.** Right after it works, replace the PIN in the query with `XXXX` or delete the snippet from the SQL Editor sidebar.

**Why:**
- The desk's PIN is shared by everyone at the desk, so it's changed centrally (e.g. when someone leaves).
- A desk device that hit **5 wrong PINs stays locked** after a new PIN: someone may have been guessing at it. It needs the desk password again (sign in on that device), which also gives it a fresh counter.
- Why **lock** the desk's devices rather than clear its `session_unlock` rows: removing a device's row would make the database recalculate it from the sign-in time, which could **unlock** a device that was locked. Setting the time to "now" can only lock.
- Why not `admin_set_staff_pin()`: in the SQL Editor you aren't signed in as a staff member, so it correctly refuses you (see step 5).

### Change the desk's password

Do this when someone who knew the desk password leaves, or you think it's been shared too widely. Three things should happen together: the **new password** is set, any **emailed sign-in link** (password reset / magic link) is cancelled, and the desk is **signed out everywhere**, so every desk device needs the new password.

**Option 1 — Supabase dashboard (try this first).** **Authentication → Users**, find `shrewsburyustc@gmail.com`, and click it (or its **⋯** menu). What you'll see depends on the dashboard version, and **I'm not sure of the exact labels**. Typically:
- **Send password recovery** / **Send magic link**: these email a sign-in link. **Don't use them for the desk** — the dashboard has no screen for those links, and magic-link / recovery sessions are refused for data anyway.
- If your version has a box to **type a new password** directly (some versions call it something like "Update password" or "Reset password"), use that: at least **12 characters**.
- If it also has a way to **sign the user out** of all sessions, use it after setting the password. If not, run the "sign out everywhere" snippet at the end of this section.

If you don't see a way to type a new password, use Option 2. If you're unsure what an option does, tell Claude what you see before clicking.

**Option 2 — SQL Editor (fallback).**

**Step 1 — check the SQL Editor is allowed to do it.** Run this on its own:

```sql
-- Can this SQL Editor login change Supabase Auth's own tables?
-- All three should say true.
select has_table_privilege('auth.users',            'UPDATE') as can_set_password,
       has_table_privilege('auth.sessions',         'DELETE') as can_sign_out,
       has_table_privilege('auth.one_time_tokens',  'DELETE') as can_cancel_email_links;
```

- **All true**: go on to step 2.
- **Any false** (or an error such as `relation "auth.one_time_tokens" does not exist`): **don't run step 2** — Supabase doesn't let the SQL Editor change these tables on your project. Use the dashboard's own user tools instead (Option 1: set the password, and its sign-out option if it has one). If the dashboard can't do it either, tell Claude what you see.

**Step 2 — change it.** Paste, replace the two `<...>` values, Run:

```sql
-- Sets a new password for the front-desk login, cancels any password-reset
-- or magic-link email already sent, and signs the desk out on every device.
-- Supabase Auth stores passwords as bcrypt hashes in auth.users, the same
-- kind of hash as PINs. One statement = all or nothing.
with new_password as (
  select '<new-password-12+-characters>'::text as pw   -- type the password ONLY here
),
updated as (
  update auth.users as u
     set encrypted_password = extensions.crypt(n.pw, extensions.gen_salt('bf', 10)),
         recovery_token     = '',             -- cancels a password-reset link already emailed
         updated_at         = now()
    from new_password as n
   where u.id = '<paste-desk-UID-here>'
     and length(n.pw) >= 12                   -- refuses anything shorter than 12 characters
  returning u.id, u.email
),
email_links as (
  delete from auth.one_time_tokens as t       -- cancels any other emailed sign-in links
   using updated as u
   where t.user_id = u.id
  returning t.id
),
signed_out as (
  delete from auth.sessions as s              -- signs the desk out everywhere
   using updated as u
   where s.user_id = u.id
  returning s.id
)
select u.email,
       'Password changed' as result,
       (select count(*) from email_links) as email_links_cancelled,
       (select count(*) from signed_out)  as devices_signed_out
from updated as u;
```

- **1 row returned**: done. `devices_signed_out` is how many desk devices now need the new password. **0 rows**: wrong UID, or the password is shorter than 12 characters. **"permission denied"**: nothing changed; use Option 1 and tell Claude.
- Supabase will warn about **destructive operations** (the `delete` lines). Expected; confirm.
- Same warning as the PIN: replace the password in the query with `XXXX` straight after, and store the new password in the password manager.

**Sign the desk out everywhere (on its own).** Only needed if you changed the password with Option 1 and the dashboard had no sign-out option. Run step 1's check first (`can_sign_out` must be true):

```sql
-- Ends every desk sign-in. Each desk device goes back to the sign-in screen
-- and needs the password. (Their session_unlock / pin_attempts rows are
-- left behind harmlessly and cleaned up automatically after 8 days.)
delete from auth.sessions
 where user_id = '<paste-desk-UID-here>'
returning id;
```

The number of rows returned is the number of desk devices signed out.

**When does a signed-out device notice?** The **database** refuses it straight away: no data, no PIN tries, no PIN change. The **app** notices at its next check with the database — within about a minute while someone is using it (its activity check-in), when the page is reloaded, or when someone tries to unlock it with the PIN — and then goes to the sign-in screen.

**Why:**
- A changed password doesn't end sign-ins that already exist, and a reset link already sitting in someone's inbox would still work. Signing out everywhere and cancelling the links closes both.
- `gen_salt('bf', 10)` is the same bcrypt strength Supabase Auth uses itself.

---

## Quick reference: what the app calls

| Call | Who | Returns |
|---|---|---|
| `supabase.rpc('get_my_profile')` | signed-in users | array with 0 or 1 row: `id, full_name, email, role, active, has_pin, pin_locked, password_fresh, idle_lock_minutes, is_shared` |
| `supabase.rpc('touch_session')` | signed-in users | text: `'unlocked'`, `'locked'` (show the Lock screen), or `'password_required'` (sign out). Call on load / after sign-in and while the person is active (the app does it at most once a minute). Never reopens a locked session. `'password_required'` also when the sign-in was ended (signed out). |
| `supabase.rpc('lock_session')` | signed-in users | nothing. Idle lock and Lock now: locks this session on the server. |
| `supabase.rpc('verify_pin', { p_pin: '2580' })` | signed-in users | text: `'ok'` (also unlocks the session on the server), `'wrong:N'`, `'password_required'` (also when the sign-in was ended — nothing is counted), or `'invalid'`. Raises an error only for dry-run / read-only requests, which the app never sends. |
| `supabase.rpc('set_my_pin', { p_pin: '2580' })` | signed-in users | text: `'ok'` (PIN saved, session unlocked), `'invalid'`, `'too_easy'`, `'password_required'` (password sign-in not within the last 10 minutes, the session is locked / PIN-locked, or the sign-in was ended), or `'not_allowed'` (shared account that already has a PIN) |
| `supabase.rpc('admin_set_staff_pin', { p_staff_id, p_pin })` | active admins with a recent password sign-in and an unlocked session (future Staff accounts screen) | nothing; errors if not allowed, it's your own account, the PIN isn't 4 digits or is too easy ("PIN is too easy to guess."), or there's no such staff row. Clears that person's wrong-PIN counts; devices that hit 5 wrong PINs stay locked. |
| `public.has_data_access()` | used inside security rules, not called by the app directly | `true` only for an unlocked, still-signed-in, not PIN-locked session of active staff with a password sign-in within 7 days |

## If someone's PIN gets locked

After 5 wrong PINs, that **device's sign-in** is locked. The database also tries to end that sign-in on Supabase's side. They sign in with their email and password again. That creates a new sign-in with a fresh counter. Other devices they're signed in on aren't affected. Changing your own PIN in the app does **not** lift that lock (a lost device must need the password). An admin giving them a new PIN (the step 5 snippet, or for the desk the snippet in [Admin: change the front-desk PIN or password](#admin-change-the-front-desk-pin-or-password)) does **not** lift that lock either — the locked device still needs the password. A new PIN only resets the wrong-PIN counts on devices that aren't locked.

---

## Known limitations (accepted on purpose)

These were looked at and accepted. They're written down so nobody mistakes them for protections that exist.

- **A borrowed, unlocked device can set a new PIN for 10 minutes after a password sign-in.** Set your PIN / Change PIN only need a password sign-in within the last 10 minutes (that's what lets them work without asking for the password twice). So in those 10 minutes, someone using that **unlocked** session could choose a new PIN for its owner. A locked screen can't be used for this (the database checks), and after 10 minutes it needs the password again. Lock the screen ("Lock now") before handing a device to anyone.
- **Anyone who knows the desk password can change it.** The app hides Change password for the shared front-desk account, but that's only the menu. Someone who knows the desk password could still change it by talking to Supabase Auth directly (its API). The database can't block that. Keep the desk password to trusted staff, and when someone leaves, change it and sign the desk out everywhere ([Change the desk's password](#change-the-desks-password)).

---

## Before going live (deploy checklist — not needed for local testing)

1. **Authentication → URL Configuration:** set **Site URL** and **Redirect URLs** to the dashboard's real address (for now the `.pages.dev` address). The default is `localhost`.
2. **After upgrading to Pro:** turn on **Leaked password protection** (3b) and set **time-boxed sessions** to **7 days** (Authentication → Sessions), so Supabase itself also ends sessions after 7 days.
3. **Check that 5 wrong PINs really ends the session:** on the real project, sign in on a test device, enter 5 wrong PINs, then in **SQL Editor** run `select id, user_id, created_at from auth.sessions order by created_at desc limit 5;` — the session from that device should be gone. Tell Claude if it is still there.
4. **Hard gate before the first data section (e.g. Color Belt):** migration `0002` must make the lock screen real on the server (the database refuses a locked or PIN-locked session, not just the browser). See `docs/Dashboard Docs/TKD-Dashboard-Design-Guidelines.md` section 10b. Do not add student data until this is in: both parts applied (section 9), `select count(*) from auth.sessions;` works, both test files pass, and every data table's security rule uses `(select public.has_data_access())`.

## Migration 0013: Camps (camps, templates, family sign-up form, check-in, payments)

**Status: APPLIED to production 2026-10-20** (from camps a2d1f4e; fingerprints + tests verified). Hyperdrive (0013g) and later steps not done yet.

**What it does** (`supabase/migrations/0013_camps.sql`, contract `docs/Dashboard Docs/Build contracts/CONTRACT-0013.md` §1):
- **Camps** (`camps`): held at one school, optionally **for both schools**; 1–10 days (`camp_days`, any dates); daily hours; sign-up opening / closing dates, an early-price date and a **Close sign-up** switch; the ages the family form accepts; a description and a waiver; a random 8-character link code (`/camp/<code>`, never changes).
- **Prices:** a small grid (`camp_prices`: one row per number of days, member / non-member × early / regular) and up to 10 **extras** (`camp_extras`: once or per day, optionally "not for all-days campers", and a per-day extra optionally only on some camp days — `only_on`, e.g. pizza on Wed and Fri; families choose it, it is never added by itself). A camper's prices are written at sign-up and are **never** changed by a later price edit; only a change to that camper's own days, member box or extras in Edit details prices the whole camper again at the current prices (rulebook v0.700).
- **Templates** (`camp_templates`): everything except dates and campers, shared by both schools.
- **Payments record the desk's school** (`camp_payments.school`, v0.707): Mark paid takes the school (`camp_mark_paid(p_camper_id, p_expected_version, p_school)`; the app sends this device's school — account menu → This device — and never asks, rulebook v0.708), Edit payment can correct it (`camp_edit_payment(p_payment_id, p_method, p_amount_cents, p_paid_on, p_school)`), a reversal keeps its payment's school; an unknown school → `{status:'invalid', field:'school'}`. Finance counts camp money only after 0017 (section 0017).
- **Sign-ups and campers:** `camp_signups` (one family form send: parent and emergency contact with phones, a `CP-` reference, early / regular fixed by the sign-up date, the drawn signature, a copy of the waiver) and `camp_campers` (1–3 children per sign-up), with `camp_camper_days` (the days they come, with the **check-in** time and who) and `camp_camper_extras` (the extras chosen, with their price at the time). **Append-only** `camp_payments` (a mistake is fixed by a reversal row).
- **Phones** are readable only through `camp_camper_detail` (staff and admins, v0.700). The **signature** and the **waiver copy** can never be read by the app, are never copied into `change_log` (the history shows "on file"), and the signature is removed automatically **3 years after the camp's last day**.
- **The family form:** a new restricted login, **`camps_registrar`**, used only by the Camps Cloudflare Function through its own Hyperdrive config. It can run exactly two functions (`camp_public_camp`, `camp_public_signup`) and nothing else. Every call is counted in Camps' **own** ledger `camp_public_attempts` (a hashed key, never a raw IP; 30 tries per hour per key; Color Belt's `testing_public_attempts` is never used).
- **18 staff functions + `camp_camper_detail`** (the only way to write), the roster view `camp_roster`, and the same security rules as 0003 / 0005: RLS with `has_data_access()`, column rights only, nothing for `anon` or `service_role`, every change in `change_log` (actions `camp_…`).
- 0013 changes **nothing** that 0001–0012 made. It uses a few of 0003's and 0005's helpers (school date, name / price / signature rules, the link-code maker, the history writer).

**The order** (build plan §8): **CP2** Cloudflare variable (0013a) → **CP3** database (0013b–0013f) → **CP4** Hyperdrive (0013g) → **CP5** staff side on the real database + the test sign-up (0013h) → **CP6** deploy (0013i). **Each step needs Jeffrey's OK. Nothing secret goes into chat, git, `.env.local` or a screenshot** (handoff §6).

### 0013a. CP2 — Cloudflare variable (you, in the Cloudflare dashboard)

`tkd-dashboard` → **Settings** → **Variables and Secrets** → **Production** only: add `CAMPS_REGISTRATION` = `off` (Text). Leave **Preview** empty. Turnstile, `CLIENT_KEY_SECRET` and `PUBLIC_ORIGIN` from 12a are reused. Variables take effect on the next deployment.

### 0013b. CP3 — before you apply 0013

1. Claude first checks read-only which migrations are live on production (the list grows as other branches go live — e.g. 0007–0009, 0011, 0012, 0014, 0015, 0019 by 2026-10-20). In the **SQL Editor**, run the test file of **every live migration** and check each passes: `verify_pin_tests.sql`, `0002_tests.sql`, `0003_tests.sql`, `0004_tests.sql`, `0005_tests.sql`, `0006_tests.sql`, `0010_tests.sql`, `0011_tests.sql` and the other live ones (replace the UID placeholders as in 12f; put them back afterwards).
2. Claude checks read-only (through the connection) that **no camp object exists yet**: no table, view, sequence or function whose name starts with `camp` in schema `public`, and no role `camps_registrar`:
   ```sql
   select 'relation' as kind, c.relname as name from pg_class c join pg_namespace n on n.oid = c.relnamespace
    where n.nspname = 'public' and (c.relname = 'camps' or c.relname like 'camp\_%')
   union all
   select 'function', p.proname from pg_proc p join pg_namespace n on n.oid = p.pronamespace
    where n.nspname = 'public' and (p.proname like 'camp\_%' or p.proname like 'camps\_%')
   union all
   select 'role', r.rolname from pg_roles r where r.rolname = 'camps_registrar';
   ```
   Expected: no rows.

### 0013c. Apply 0013 (you, in the SQL Editor)

1. Copy **the whole file** `supabase/migrations/0013_camps.sql`.
2. **SQL Editor → New query**, paste, **Run**.
3. Supabase will warn about **destructive operations**. That's expected: the words are inside rules (`on delete cascade`), inside functions that run later (an admin removing a camp, a camper, a template, a camp day or an extra; old rate-limit rows being cleaned up) and in `… if exists` lines that make re-running safe. **Nothing is removed now.** Confirm.
4. "Success. No rows returned." It's one transaction: on any error nothing is kept. Copy the error to Claude.

**Running it again is safe** (tested in PGlite: a second run changes no row and no fingerprint; the role's attributes and password are never touched).

### 0013d. Set the `camps_registrar` password (you, on your PC + SQL Editor)

Same method as 12d / 13e, with its **own** script and its **own** password — never the Color Belt or Star one.

0. **Clipboard history off** first (12a step 0): Windows **Settings → System → Clipboard** → Clipboard history off, Sync across your devices off.
1. Make a file **outside the repo**, e.g. `C:\Users\jberg\Documents\make-scram-camps.mjs`, with exactly this (the role name `camps_registrar` is written in; there is no password in it — it makes a new random one each time):
   ```js
   // Makes a random password for camps_registrar and its SCRAM-SHA-256 verifier.
   // The password goes to the clipboard (never shown); only the verifier is printed.
   import { randomBytes, pbkdf2Sync, createHmac, createHash } from 'node:crypto';
   import { execSync } from 'node:child_process';
   const role = 'camps_registrar';
   const password = randomBytes(32).toString('base64url');   // 43 letters, digits, - and _
   const salt = randomBytes(16);
   const salted = pbkdf2Sync(password, salt, 4096, 32, 'sha256');
   const clientKey = createHmac('sha256', salted).update('Client Key').digest();
   const storedKey = createHash('sha256').update(clientKey).digest();
   const serverKey = createHmac('sha256', salted).update('Server Key').digest();
   execSync('clip', { input: password });
   console.log(`alter role ${role} password 'SCRAM-SHA-256$4096:${salt.toString('base64')}$${storedKey.toString('base64')}:${serverKey.toString('base64')}';`);
   ```
   (The same SCRAM code as 12d, which Claude checked against what PostgreSQL itself stores; only the role name differs.)
2. In PowerShell: `node C:\Users\jberg\Documents\make-scram-camps.mjs`. The password is now on the clipboard: **save it in your password manager as a NEW entry**, "Supabase camps_registrar (Hyperdrive)".
3. **Check the printed line says `alter role camps_registrar password 'SCRAM-SHA-256$4096:…';`** — `camps_registrar`, **not** `testing_registrar` or `star_registrar`. If it names any other role, stop and tell Claude.
4. Copy only that line into a **new** SQL Editor query and **Run**. Then **delete that snippet** in the SQL Editor (handoff §6), copy something harmless, and **delete `make-scram-camps.mjs`**.
5. If the password ever leaks: run the script again (new password + verifier), update the Hyperdrive config (0013g), and the old one stops working.

### 0013e. Read-only checks (Claude runs these through the connection)

1. **Fingerprints:** `supabase/tests/0013_fingerprints.sql`. Every line must match what `supabase/tests/pglite/run.mjs` printed for the tested copy: 115 rows — the 69 functions (code, settings, owner, who may call them), the `camps_registrar` row, the view, the 14 table / counter rows and the 30 triggers. **One expected difference:** on Supabase the role row shows `members=postgres` (PostgreSQL 16+ makes the role that created a login an administrator of it; that gives the registrar nothing). In PGlite it's empty. The file is a single read-only SELECT and contains neither of the words the connection refuses (run.mjs checks that).
2. `0003_fingerprints.sql`, `0004_fingerprints.sql`, `0005_fingerprints.sql`, `0006_fingerprints.sql`, `0010_fingerprints.sql`: **unchanged** from their production records (0013 touches none of their objects; run.mjs checks the same).
3. **Security advisor:** expected notices — "RLS enabled, no policy" on `camp_public_attempts` (INFO; nobody in the app may read it) and "security definer function executable by authenticated" for the 18 staff functions and `camp_camper_detail` (each checks access and role itself). Anything else about a `camp` object is a real problem.

### 0013f. Run the tests (you, in the SQL Editor)

1. Open `supabase/tests/0013_tests.sql`, replace `<paste-admin-UID-here>` and `<paste-desk-UID-here>` (**Authentication → Users**), copy the whole file **as UTF-8** (it contains a few non-English characters such as "§"), paste, **Run**. Supabase may warn about destructive operations (the test removes its own test rows, adds and removes a test-only table rule, and checks some removals are refused). Everything is rolled back. Confirm. (The test-only rule briefly locks `camp_campers` until the test ends — run it when nobody is using the camp pages, as before real use.)
2. Expected: one row, **ALL 0013 TESTS PASSED**. A failure shows `TEST FAILED:` / `TEST SETUP:`; nothing is saved. Run `rollback;` once on its own, then tell Claude.
3. Then run the earlier tests again — every live migration's test file from 0013b step 1 — 0013 must not have broken them.
4. Put the placeholders back afterwards (don't save the file with the UIDs in it).
5. The test makes its own `zz test …` camps, so it works before **and** after real camps exist.

### 0013g. CP4 — Hyperdrive for the camp form (you, with Jeffrey's OK)

1. Cloudflare → **Storage & databases → Postgres & MySQL (Hyperdrive) → Connect database → Connect to public database**: name **`tkd-camps-registrar`**; the same Session pooler host and port as 12g (`aws-0-us-east-1.pooler.supabase.com`, 5432); database `postgres`; user **`camps_registrar.eozkfbdfxqlcbpewhach`**; password from the "Supabase camps_registrar (Hyperdrive)" entry. Use **Manual entry** and keep the Connection String box empty (12g "what the dashboard looked like").
   - **Caching: Disabled.**
   - **Server certificates → Verify full** with the existing Supabase CA certificate (as 12g).
   - **Origin connection limit: 5 or less** (the role allows at most 5).
2. `tkd-dashboard` → **Settings** → **Bindings** → **Add** → **Hyperdrive**: variable name **`HYPERDRIVE_CAMPS`**, configuration `tkd-camps-registrar`, **Production only**.
3. Check the Free plan's pooler connection budget with Claude (this adds up to 5 connections; the role's limit can be lowered to 3 with `alter role camps_registrar connection limit 3;`).

### 0013h. CP5 — the staff side on the real database, and a test sign-up (each with Jeffrey's OK)

Run `Start dashboard.bat` and sign in as the admin. Create a **TEST** camp (Add camp, Edit, Save as template, Use template, Registration link + QR + Download, Close / Reopen). Then, because the family page isn't deployed yet, make the sign-up **in the SQL Editor** — it calls the real function (never inserts directly):

```sql
-- 1. the TEST camp's days (copy the ids)
select d.id, d.day from public.camp_days d
  join public.camps c on c.id = d.camp_id
 where c.public_code = '<TEST camp code>' order by d.day;
-- 2. sign up two test children. Run once with 0 as the last value: the answer is
--    {"status":"price_changed","new_total_cents":…}. Run again with that number.
select public.camp_public_signup(
  '<TEST camp code>', 'cp5-test', gen_random_uuid(),
  '[{"first_name":"Test","last_name":"One","age":8,"member":true,"day_ids":["<day id>"],"extras":[]},
    {"first_name":"Test","last_name":"Two","age":10,"member":false,"day_ids":["<day id>"],"extras":[]}]'::jsonb,
  'Test Parent', '5085550100', 'Parent', 'Test Contact', '5085550101', 'Friend',
  'cash', true, 'data:image/png;base64,iVBORw0KGgo=', 'camp-2026-10-18',
  (select md5(c.waiver_text) from public.camps c where c.public_code = '<TEST camp code>'),
  0);
```
- The ages must be inside the TEST camp's age range (otherwise the answer is `camp_changed`).
- A second run with `"Test","One"` again makes a **possible duplicate**.
- The attempt rows (in `camp_public_attempts`) count toward the `cp5-test` key only (30 per hour).
- The SQL Editor's own role runs the function exactly as `camps_registrar` would (it always runs as its owner).

Then in the app: Check in + Undo (today), Mark paid + Undo, Edit details add a day → Owes → Mark paid $X, admin Edit / Undo payment, the possible duplicate → Keep this one / Restore, Withdraw / Restore, Delete camper, **Delete camp**. Claude then checks read-only: every step is in `change_log` (actions `camp_…`, the sign-up by "Family form", no `data:image` anywhere), the attempt rows say `ok` / `price_changed`, and **zero rows** are left for the TEST camp.

### 0013i. CP6 — after the deploy (each with Jeffrey's OK)

1. Deploy with `CAMPS_REGISTRATION=off`. Live checks: the dashboard works; `https://tkd-dashboard.pages.dev/camp/abcdefgh` shows the page with the strict CSP; `/api/camp/abcdefgh` answers `not_open`.
2. **Phone path:** open the TEST camp; set `CAMPS_REGISTRATION=on` (Production) and **Retry deployment**; Jeffrey signs up from his phone, and several times in a row from the desk tablet; sign-ups show on the camp page within 15 seconds; check one child in; Hyperdrive → `tkd-camps-registrar` → **Metrics**: queries **not cached**.
3. Delete the TEST camp in the app; Claude checks read-only that zero camp rows are left for it. Only then create the first real camp.

### 0013j. Off switch (any time)

In this order (step 1 works in seconds):
1. **Database off switch (instant):** in the SQL Editor, run
   ```sql
   revoke execute on function public.camp_public_camp(text) from camps_registrar;
   revoke execute on function public.camp_public_signup(text, text, uuid, jsonb, text, text, text, text, text, text, text, boolean, text, text, text, integer) from camps_registrar;
   ```
   From the next call on, both are refused for the camp form's login, even on connections Hyperdrive already has open. **To turn it back on:** re-run the whole 0013 file, or
   ```sql
   grant execute on function public.camp_public_camp(text) to camps_registrar;
   grant execute on function public.camp_public_signup(text, text, uuid, jsonb, text, text, text, text, text, text, text, boolean, text, text, text, integer) to camps_registrar;
   ```
   While it is off, `0013_tests.sql` (T2a) and `0013_fingerprints.sql` fail — expected.
2. **Stop the camp form:** set `CAMPS_REGISTRATION=off` (Production) and **Retry deployment**. Every camp link then says "not open" without touching the database.
3. **Lock the login:** `alter role camps_registrar nologin;` (re-running 0013 does **not** turn it back on; `alter role camps_registrar login;` does).

Color Belt's form (12i) and Star's (13g) are not affected by any of these, and their off switches don't affect Camps. **Previous site version:** Cloudflare Pages → **Deployments** → the previous one → **Rollback to this deployment**.

### 0013k. Undo 0013 (only if something is badly wrong, before real camp data exists)

Only if Jeffrey decides to remove Camps completely: put the app back to a version without the Camps screens and the camp page **first**, and if 0017 is applied **undo 0017 first** (section 0017d — Finance's functions read the camp tables), then run this in the SQL Editor (one transaction; tested in PGlite on every run: afterwards no camp object or role is left, the earlier fingerprints equal a database that never had 0013, and the earlier tests pass). **This deletes every camp, template, sign-up, camper, check-in and payment.** Supabase's destructive-operations warning is real this time.

**What stays:** the `change_log` rows Camps wrote (the history is append-only — including the phones, v0.700). Nothing from 0001–0012 is touched.

```sql
-- Undo migration 0013. change_log (the history) is KEPT.
begin;

-- the family form's two functions first (the instant off switch), then the view
revoke execute on function public.camp_public_camp(text) from camps_registrar;
revoke execute on function public.camp_public_signup(text, text, uuid, jsonb, text, text, text, text, text, text, text, boolean, text, text, text, integer) from camps_registrar;
drop view if exists public.camp_roster;

-- the functions (the two that name a 0013 table in their result must go
-- before the tables)
drop function if exists public.camp_public_camp(text);
drop function if exists public.camp_public_signup_core(text, text, uuid, jsonb, text, text, text, text, text, text, text, boolean, text, text, text, integer);
drop function if exists public.camp_public_signup(text, text, uuid, jsonb, text, text, text, text, text, text, text, boolean, text, text, text, integer);
drop function if exists public.camp_lock_camper(uuid);
drop function if exists public.camp_lock_payment(uuid);
drop function if exists public.camp_first_day(uuid);
drop function if exists public.camp_last_day(uuid);
drop function if exists public.camp_day_count(uuid);
drop function if exists public.camp_signup_state(uuid, date);
drop function if exists public.camp_base_cents(uuid, integer, boolean, text);
drop function if exists public.camp_camper_total_cents(uuid);
drop function if exists public.camp_camper_paid_cents(uuid);
drop function if exists public.camp_purge_old_signatures();
drop function if exists public.camp_find_duplicate(uuid, uuid, text, text);
drop function if exists public.camp_recheck_duplicate(uuid);
drop function if exists public.camp_recheck_pointing_at(uuid);
drop function if exists public.camp_public_camp_answer(uuid);
drop function if exists public.camp_public_signup_answer(uuid);
drop function if exists public.camp_add_parts(uuid, jsonb, jsonb);
drop function if exists public.camp_tidy_extras(jsonb);
drop function if exists public.camp_tidy_prices(jsonb);
drop function if exists public.camp_setup_args_are_valid(text, boolean, text, date[], time, time, date, date, date, integer, integer, jsonb, jsonb, boolean, text, text);
drop function if exists public.camp_extra_rows(jsonb);
drop function if exists public.camp_camper_extras_are_ok(uuid, uuid[], jsonb);
drop function if exists public.camp_extras_cents_now(jsonb);
drop function if exists public.camp_extras_only_on_ok(jsonb, date[], date[]);
drop function if exists public.camp_only_on_dates(jsonb, date[]);
drop function if exists public.camp_add_camp(text, boolean, text, date[], time, time, date, date, date, integer, integer, jsonb, jsonb, text, text);
drop function if exists public.camp_update_camp(uuid, integer, text, boolean, text, date[], time, time, date, date, date, integer, integer, jsonb, jsonb, text, text);
drop function if exists public.camp_set_signup(uuid, integer, boolean);
drop function if exists public.camp_delete_camp(uuid, integer, integer, integer);
drop function if exists public.camp_save_template(uuid, text);
drop function if exists public.camp_update_template(uuid, integer, text, text, boolean, integer, time, time, integer, integer, integer, integer, integer, jsonb, jsonb, text, text);
drop function if exists public.camp_delete_template(uuid, integer);
drop function if exists public.camp_update_details(uuid, integer, integer, text, text, integer, boolean, uuid[], jsonb, text, text, text, text, text, text);
drop function if exists public.camp_change_paying_by(uuid, integer, text);
drop function if exists public.camp_mark_paid(uuid, integer, text);
drop function if exists public.camp_undo_payment(uuid);
drop function if exists public.camp_edit_payment(uuid, text, integer, date, text);
drop function if exists public.camp_resolve_duplicate(uuid, integer, uuid, integer, boolean);
drop function if exists public.camp_withdraw_camper(uuid, integer);
drop function if exists public.camp_restore_camper(uuid, integer);
drop function if exists public.camp_delete_camper(uuid, integer, uuid[]);
drop function if exists public.camp_check_in(uuid, uuid);
drop function if exists public.camp_undo_check_in(uuid, uuid);
drop function if exists public.camp_camper_detail(uuid);

-- the 11 tables (their triggers, rules and indexes go with them), then the
-- reference counter
drop table if exists public.camp_payments, public.camp_camper_extras, public.camp_camper_days, public.camp_campers,
                     public.camp_signups, public.camp_templates, public.camp_extras, public.camp_prices, public.camp_days,
                     public.camps, public.camp_public_attempts;
drop sequence if exists public.camp_signup_ref_seq;

-- the trigger functions and the rule helpers the tables used
drop function if exists public.camp_text_is_valid(text, integer);
drop function if exists public.camp_days_arg_is_valid(date[]);
drop function if exists public.camp_uuid_text_is_valid(text);
drop function if exists public.camp_int_text_is_valid(jsonb, integer, integer);
drop function if exists public.camp_time_is_valid(time);
drop function if exists public.camp_prices_arg_is_valid(jsonb, integer);
drop function if exists public.camp_extras_arg_is_valid(jsonb, text);
drop function if exists public.camp_dates_are_sorted_set(date[]);
drop function if exists public.camp_uuid_list_is_valid(jsonb, integer, integer);
drop function if exists public.camp_camper_extras_arg_is_valid(jsonb);
drop function if exists public.camp_children_arg_is_valid(jsonb);
drop function if exists public.camp_template_setup_is_valid(integer, jsonb, jsonb);
drop function if exists public.camp_price_kind(date, date);
drop function if exists public.camps_before_write();
drop function if exists public.camp_templates_before_write();
drop function if exists public.camp_parts_before_write();
drop function if exists public.camp_extras_before_write();
drop function if exists public.camp_signups_before_write();
drop function if exists public.camp_campers_before_write();
drop function if exists public.camp_camper_days_before_write();
drop function if exists public.camp_camper_extras_before_write();
drop function if exists public.camp_payments_guard();
drop function if exists public.camp_signups_log();

-- the camp form's login
revoke usage on schema public from camps_registrar;
drop role if exists camps_registrar;

commit;
```

**Then the Cloudflare side** (only if 0013a / 0013g were done): remove the `HYPERDRIVE_CAMPS` binding, delete the `tkd-camps-registrar` Hyperdrive configuration, delete the `CAMPS_REGISTRATION` variable, **Retry deployment**, and delete the "Supabase camps_registrar (Hyperdrive)" password-manager entry.

**Why:**
- **Its own login, password, Hyperdrive config and off switch:** a leak of one form's password can't reach another form's functions; each form can be stopped on its own.
- **Its own rate-limit ledger:** the desk tablet's camp sign-ups never use up Color Belt's tries (and the other way round).
- **Phones only through one function, signatures never:** the records are mostly about minors (rulebook §5); leaving columns out of a view wouldn't protect them, not granting them does.
- **Prices as snapshots:** a price edit during an open sign-up never changes what a family was shown; the form refuses a send whose total changed (`price_changed`).

---

## Migration 0017: camp payments in Finance

**Status: APPLIED to production 2026-10-20** (from camps a2d1f4e = fb4ec24). Apply it **right after 0013** (section 0013), in the same CP3 session — Camps and this go live together (rulebook v0.707), or camp days would close short.

**Production order:** 0011 (Finance, live) → **0013 + 0017** (Camps, together) → Color Belt 0014 (already live; it doesn't touch these Finance functions) → **Finance 0018** (private Color Belt payments), which is built on 0017's text of the Finance functions.

**What it does** (`supabase/migrations/0017_finance_camps.sql`, plan `docs/Camps/TKD-Camps-Finance-Plan.md`):
- Camp payments become a **third source** in Finance, next to Color Belt and Star: the Daily report (list and Cash / Check / Card totals), **Close the day**, Both, History, Export (+ preview), the payment detail and the Home reminder.
- A camp line belongs to **the school whose desk took the money** (`camp_payments.school`, which 0013's Mark paid / Edit payment record): each line takes the school of its own payment row, so a both-schools camp paid at Shrewsbury lands in Shrewsbury's drawer.
- A camp line reads "Camp · <camp name>": `what` = `camp`, `event_name` = the camp's name (Daily report lines, export rows and the payment detail — **camp lines only**; Color Belt and Star lines keep exactly their old keys), event date = the camp's first day. The payment detail of a camp payment also has `camp_days`.
- Same chain rules as the other two (edit, undo, the 10-second mis-click).
- How: it **replaces five 0011 functions** (`finance_chain_steps_core` by drop + create; `finance_money_rows_core`, `finance_day`, `finance_payment_detail`, `finance_export` by create or replace — same names, arguments, rights), lets a close's snapshot hold camp items of up to $2,000 (two rules of `finance_day_closing_items`), and adds an index `camp_payments_paid_on_idx`. Every camp part is in a block marked `-- ===== source: camp (0017) =====` … `-- ===== end camp =====`; the Finance session's next migration (0018, private Color Belt payments) builds on these versions.
- It stops with a clear message if 0011 or 0013 is missing. Tested in PGlite: every Color Belt / Star answer identical before and after; 0011's own tests still pass; speed with ~4,000 camp rows on top of Finance's big seed, also on a database that sorts text like production.

### 0017a. Apply 0017 (you, in the SQL Editor, after 0013c–0013f)

1. Copy **the whole file** `supabase/migrations/0017_finance_camps.sql`, **SQL Editor → New query**, paste, **Run**.
2. Supabase may warn about destructive operations: the words are only in `drop constraint if exists` lines and one `drop function if exists` line (`finance_chain_steps_core`, created again straight after with 0011's rights) that make re-running safe. **No data is removed.** Confirm.
3. "Success." One transaction: on any error nothing is kept (e.g. "0017 needs migration 0013 … first"). Copy the error to Claude.

**Running it again is safe** (tested: no row and no fingerprint changes). **If 0017 is ever re-run after Finance's 0018 is applied, re-run 0018 straight after it** (0018 is built on 0017's function text; re-running 0017 alone puts back the versions without 0018's changes). `finance_chain_steps_core` is written as `drop function if exists` + `create` for exactly this case: 0018 changes its return columns, which `create or replace` could not change back.

### 0017b. Read-only checks (Claude runs these through the connection)

1. **Fingerprints:** `supabase/tests/0017_fingerprints.sql` (Finance after 0017). Every line must match what `run.mjs` printed ("0017 fingerprints"). The file contains neither of the words the connection refuses.
2. `0011_fingerprints.sql`: **only** the lines of the five replaced functions and the two widened rules (`finance_day_closing_items_source_check`, `…_amount_check`) differ from 15b's record — expected. `0013_fingerprints.sql`: unchanged.
3. **Security advisor:** nothing new (the replaced functions keep 0011's rights; the index is not a security object).

### 0017c. Run the tests (you, in the SQL Editor)

1. `supabase/tests/0017_tests.sql`: replace `<paste-admin-UID-here>` and `<paste-desk-UID-here>`, paste, **Run** → **ALL 0017 TESTS PASSED**. It makes its own `zz fin camp …` camp with payments in June 2021 and rolls everything back.
2. Then `0011_tests.sql` and `0013_tests.sql` again — both must still pass.
3. Put the placeholders back afterwards.

### 0017d. Undo 0017 (only if something is badly wrong, and only while no closed day has counted a camp payment)

Put the app back to a version without camp lines in Finance first. Then two steps, **in this order**:
1. **Re-run the whole 0011 file** (section 15) — that puts back 0011's versions of the five functions (Finance then ignores camp payments again).
2. Run this in the SQL Editor (one transaction). If a close already counted a camp payment (or an amount over $1,000), the old rule can't come back and it stops — nothing is changed; tell Claude.

```sql
-- Undo migration 0017 (step 2; run AFTER re-running 0011). change_log is KEPT.
begin;

-- the index on camp_payments (paid_on)
drop index if exists public.camp_payments_paid_on_idx;

-- finance_day_closing_items back to 0011's two rules
alter table public.finance_day_closing_items drop constraint if exists finance_day_closing_items_source_check;
alter table public.finance_day_closing_items add constraint finance_day_closing_items_source_check
  check (source in ('color_belt', 'star'));
alter table public.finance_day_closing_items drop constraint if exists finance_day_closing_items_amount_check;
alter table public.finance_day_closing_items add constraint finance_day_closing_items_amount_check
  check (amount_cents between -100000 and 100000 and amount_cents <> 0);

commit;
```

Tested in PGlite on every run (both steps exactly as written here): afterwards the 0011 fingerprints equal a database that never had 0017, and `0011_tests.sql` passes. **Once the Finance session's 0018 is applied on top, undo 0018 first.** Undo 0017 always comes **before** Undo 0013 (0013k): 0017's functions read the camp tables.

**Why:**
- **A new migration, not an edit of 0011:** 0011 is live; replacing its functions in a later file keeps the history clear and the undo simple (re-run 0011).
- **The desk's school:** the money lands in the drawer that actually holds it, also for both-schools camps.
- **Camp lines only get new keys:** the Color Belt and Star answers stay byte-for-byte the same, which run.mjs proves.

---

## Migration 0022: camps weekly pricing and longer camps

**Status: APPLIED 2026-10-21** (Jeffrey, SQL Editor; production had no camps or templates, so section 6 changed no rows). Claude read-only: 0022 fingerprints 71/71 identical to the tested copy (md5 d849cf8b…), security advisor nothing new; Jeffrey ran 0022_tests → ALL 0022 TESTS PASSED, 0 camps left. (Built on `camps`, rulebook v0.717.) Apply it only with Jeffrey's OK, **together with the app version that knows the weekly grid** (the Camps screens, the family form and its Function change with it — see `docs/Camps/TKD-Camps-Weekly-Pricing.md`). The app before 0022 still loads after it (every old answer key is kept), but its Add / Edit camp would send a grid of the old size, which 0022 refuses.

**Production order:** … 0013 + 0017 (camps, live) → 0018 → 0016 → 0021 (live) → **0022**. It needs 0013 (it stops with a clear message if 0013 is missing) and does not touch 0017's or 0018's Finance functions.

**What it does** (`supabase/migrations/0022_camps_weekly_pricing.sql`, spec `docs/Camps/TKD-Camps-Weekly-Pricing.md`, rules R1–R8):
- **Per-week prices:** a camp's days are grouped into Monday–Sunday weeks. The grid has rows 1 … **W** (W = the most camp days in one week, 1–7). A camper pays, for each week they come, the row for the number of days they come that week; the weeks add up (5 + 3 days = row 5 + row 3). Early / regular and member / non-member work as before. Prices stay snapshots.
- **Longer camps:** 1–60 days (was 10). Extras per camp / per child stay 10; children per sign-up stay 1–3.
- **$10,000 per camper** (was $2,000): base price, total, a payment (reversal down to −$10,000), Edit payment, and Finance's copy of a closed day (`finance_day_closing_items`, only widened).
- **Pizza (not for all-days campers) per week:** a per-day extra can't be chosen on a day in a week the camper comes every day of; a once extra keeps the whole-camp meaning. Checked by the functions and by the table's own trigger.
- **Templates:** `day_count` now means days in a week (1–7); Save as template stores W.
- **Answers:** the family form's "You're signed up" (each child) and Camper detail (breakdown) get a new key `weeks`: `[{monday, day_count, cents}]`, one per week the child comes. `cents` = the camp's current grid row for that week's days, at the sign-up's early / regular and the camper's member box (`null` if that row is missing); listed earliest first. All old keys stay (`day_count` = total days, `base_cents` = the stored price).
- How: 4 new internal helpers (`camp_week_size`, `camp_weekly_base_cents`, `camp_comes_whole_week`, `camp_weeks_breakdown` — nobody in the app can call them), **18 of 0013's functions replaced** with `create or replace` (same names, arguments, rights, security definer and `search_path`), 5 table rules replaced (`drop constraint if exists` + add). `camps_registrar` still runs only `camp_public_camp` and `camp_public_signup`; nothing goes to `anon`.

**What it does to the existing data (once, logged in the history as "Migration 0022", action `0022_weekly_pricing`):**
- A camp's grid rows **above its W are removed** and the camp's version goes up (an Edit camp screen open at that moment answers "stale"). On production that is camp **Test 2** (10 days: Oct 26–30, Nov 9–11, Nov 16–17 → W = 5): its rows 6–10 go, rows 1–5 keep their prices. Camp **Test** (1 day) keeps its one row.
- A **template with day_count over 7** (the old "days of the camp") becomes **7 days a week** (`least(day_count, 7)`) with its grid rows 1–7. Templates of 1–7 days are kept as they are (their number now reads "days a week" — check them in Edit template).
- **No camper's price changes** (snapshots, R8): campers who signed up under the old rule keep what they were shown. Only a later Edit details that changes their days, member box or extras re-prices them, by the new rule.

### 0022a. Before you apply 0022 (Claude, read-only)

Claude runs through the connection: the camps with their number of days and W, and how many grid rows each has (`select c.name, count(distinct d.id), …`), and the templates' `day_count` — so you know exactly which rows section 6 will remove. Expected on production today: Test (1 day, 1 row), Test 2 (10 days, W = 5, 10 rows → 5).

### 0022b. Apply 0022 (you, in the SQL Editor; outside camp sign-up hours if you can)

1. Copy **the whole file** `supabase/migrations/0022_camps_weekly_pricing.sql`, **SQL Editor → New query**, paste, **Run**.
2. Supabase **will** warn about destructive operations: the words are in `drop constraint if exists` lines (each rule is added again at once), inside functions copied from 0013 that run later, and in section 6, which **removes the grid rows above each camp's W** (above). Confirm.
3. "Success." One transaction: on any error nothing is kept (e.g. "0022 needs migration 0013 (Camps) first"). Copy the error to Claude.

**Running it again is safe** (tested: the second run changes no row, no history and no fingerprint). **If 0013 is ever re-run after 0022, re-run 0022 straight after it** (re-running 0013 alone puts the old functions back — that is exactly the undo's step 2).

### 0022c. Read-only checks (Claude runs these through the connection)

1. **Fingerprints:** `supabase/tests/0022_fingerprints.sql`. Every line must match what `run.mjs` printed ("0022 fingerprints"). The file contains neither of the words the connection refuses.
2. `0013_fingerprints.sql`: **only** the lines of the 18 replaced functions differ from 0013e's record — expected (`run.mjs` checks exactly that list). `0011_fingerprints.sql` and `0017_fingerprints.sql`: **only** the `finance_day_closing_items_amount_check` line differs (now ±1000000). Every other migration's fingerprints: unchanged.
3. The data: Test 2 has grid rows 1–5 (same prices as before), no template has `day_count` over 7, every camper's `base_cents` and every payment as before.
4. **Security advisor:** nothing new (the 4 helpers are internal, `search_path = ''`, executable by nobody but the owner).

### 0022d. Run the tests (you, in the SQL Editor)

1. `supabase/tests/0022_tests.sql`: replace `<paste-admin-UID-here>` and `<paste-desk-UID-here>`, paste, **Run** → **ALL 0022 TESTS PASSED**. It makes its own `zz test …` camps (two Mon–Fri weeks, Thanksgiving, one day, 60 days, a $10,000 camp) and rolls everything back.
2. Then `0013_tests.sql`, `0017_tests.sql`, `0011_tests.sql` and `0018_tests.sql` again — all must still pass. (`0013_tests.sql` and `0017_tests.sql` were updated where a rule changed — marked "changed by 0022, rulebook v0.717"; they pass before and after 0022.)
3. Put the placeholders back afterwards.
4. **Live check** (with the new app version, Jeffrey's OK): open Test 2 in Edit camp — 5 grid rows ("5 days (full week)"); a family-form sign-up of 5 + 3 days shows two "Week of …" lines and the sum.

### 0022e. Undo 0022 (only if something is badly wrong)

Put the app back to the version without weekly pricing first. Only possible while **no camp has more than 10 days and no camper, payment or closed-day amount is over $2,000** — step 1 checks that. The grid rows section 6 removed do **not** come back (re-enter them in Edit camp if needed); campers keep their prices. Three steps, **in this order**:

1. Run this check in the SQL Editor (changes nothing; if it stops, don't go on — tell Claude):

```sql
-- Undo 0022, step 1: can it be undone? (reads only)
do $$
begin
  if exists (select 1 from public.camp_days d group by d.camp_id having count(*) > 10)
     or exists (select 1 from public.camp_campers c where c.base_cents > 200000)
     or exists (select 1 from public.camp_payments p where abs(p.amount_cents) > 200000)
     or exists (select 1 from public.finance_day_closing_items i where abs(i.amount_cents) > 200000) then
    raise exception 'Undo 0022 is not possible: a camp has more than 10 days or an amount is over $2,000. Nothing was changed. Tell Claude.';
  end if;
end
$$;
```

2. **Re-run the whole 0013 file** (section 0013c) — that puts back 0013's versions of the 18 functions (the old rules).
3. Run this in the SQL Editor (one transaction; the same check again first):

```sql
-- Undo 0022, step 3 (run AFTER re-running 0013). change_log is KEPT.
begin;

do $$
begin
  if exists (select 1 from public.camp_days d group by d.camp_id having count(*) > 10)
     or exists (select 1 from public.camp_campers c where c.base_cents > 200000)
     or exists (select 1 from public.camp_payments p where abs(p.amount_cents) > 200000)
     or exists (select 1 from public.finance_day_closing_items i where abs(i.amount_cents) > 200000) then
    raise exception 'Undo 0022 is not possible: a camp has more than 10 days or an amount is over $2,000. Nothing was changed. Tell Claude.';
  end if;
end
$$;

-- the 4 helpers 0022 added (nothing uses them after 0013's re-run)
drop function if exists public.camp_weeks_breakdown(uuid, uuid[], boolean, text);
drop function if exists public.camp_comes_whole_week(uuid, uuid[], uuid);
drop function if exists public.camp_weekly_base_cents(uuid, uuid[], boolean, text);
drop function if exists public.camp_week_size(date[]);

-- the table rules back to 0013's (and 0017's for Finance's snapshot)
alter table public.camp_prices drop constraint if exists camp_prices_day_count_check;
alter table public.camp_prices add constraint camp_prices_day_count_check check (day_count between 1 and 10);
alter table public.camp_templates drop constraint if exists camp_templates_day_count_check;
alter table public.camp_templates add constraint camp_templates_day_count_check check (day_count between 1 and 10);
alter table public.camp_campers drop constraint if exists camp_campers_base_check;
alter table public.camp_campers add constraint camp_campers_base_check check (base_cents between 0 and 200000);
alter table public.camp_payments drop constraint if exists camp_payments_kind_check;
alter table public.camp_payments add constraint camp_payments_kind_check
  check ((kind = 'payment' and amount_cents between 1 and 200000 and reverses_payment_id is null)
         or (kind = 'reversal' and amount_cents between -200000 and -1 and reverses_payment_id is not null));
alter table public.finance_day_closing_items drop constraint if exists finance_day_closing_items_amount_check;
alter table public.finance_day_closing_items add constraint finance_day_closing_items_amount_check
  check (amount_cents between -200000 and 200000 and amount_cents <> 0);

commit;
```

Tested in PGlite on every run (all three steps exactly as written here): afterwards the 0013, 0011, 0017 and 0018 fingerprints equal the ones before 0022, no helper is left, and `0013_tests.sql`, `0017_tests.sql` and `0011_tests.sql` pass. Undo 0022 always comes **before** Undo 0017 (0017d) and Undo 0013 (0013k).

**Why:**
- **Per week, not per camp:** the school charges by the week ("max per week"); a 2-week camp costs two weeks. W keeps the grid as small as the camp's busiest week (Thanksgiving: 2 rows).
- **Snapshots stay:** a family is never charged differently from what the form showed them; only an Edit details that changes days / member / extras re-prices (rulebook v0.700's rule, unchanged).
- **The old grid rows are removed, not kept:** a row above W could never be used again and would make Edit camp refuse the camp (the grid must be exactly 1 … W).
- **A new migration, not an edit of 0013:** 0013 is live; replacing its functions in a later file keeps the history clear and the undo simple (re-run 0013).

## Migration 0023: Star result email texts, registration stays closed on edit, CSV row keys

**What it does** (`supabase/migrations/0023_star_result_texts.sql`, contract `docs/Dashboard Docs/Build contracts/CONTRACT-0023.md`, rulebook v0.514 and v0.504):
- **Result email texts (R11):** a new table `star_result_texts` with the three texts Email result fills in (Passed · Make-up with a D · Make-up below the pass mark — kinds `passed`, `makeup_d`, `makeup_below`), seeded with the approved starting texts (R3). Every signed-in staff member can read them (Rubrics and prices shows them read-only to staff); only admins change them, through one function `star_set_result_text` (version check, the blank rules, every change in the history). Nothing for `anon` or the family form's login.
- **M5:** replaces **one** 0006 function, `star_update_event`, so moving a finished event into the future (or removing / moving a passed closing date) keeps registration **closed in the same save**, instead of a second call closing it afterwards. Same arguments, answers and rights; the app needs no change.
- **The results CSV:** replaces a second 0006 function, `star_results_csv` (admins only, still writes the download log first). Each row gains `candidate_id`, `paid_on` (the newest payment that still counts: reversed payments skipped, refunds never change it — the same rule as the Candidates tab) and, inside `sent`, `result_status` (which result that send was for). So the Results screen matches CSV rows to candidates by id, never by look-alike values. Same arguments, checks and rights; the extra keys are ignored by anything that doesn't use them.
- Removes nothing. Supabase **will** probably warn about destructive operations: the word delete appears only in the new table's history trigger ("after insert or update or delete", so removals are logged too, as 0006 does). Nothing is removed now.

**Each step needs Jeffrey's OK.** Before the Star family form goes live (M5 must be in place by then).

### 0023a. Before you paste (Claude, read-only)

1. Claude runs `supabase/tests/0006_fingerprints.sql` through the read-only connection and keeps the result: after 0023 **only** the `star_update_event(...)` and `star_results_csv(...)` lines may differ.

### 0023b. Apply 0023 (you, in the SQL Editor)

1. Copy **the whole file** `supabase/migrations/0023_star_result_texts.sql` → **SQL Editor → New query** → paste → **Run**.
2. Supabase may warn about **destructive operations** (the history trigger's "or delete", see above). Nothing is removed. Confirm.
3. Expected: "Success. No rows returned." One transaction: on any error nothing is kept. If it stops with a message starting `0023:`, an earlier migration is missing — copy the message to Claude.
4. **Running it again is safe** (tested: no fingerprint changes, and a text an admin already changed is never overwritten). **Re-running 0006 after this** puts 0006's old `star_update_event` and `star_results_csv` back → re-run 0023 straight after.

### 0023c. Read-only checks (Claude, through the connection)

1. **Fingerprints:** `supabase/tests/0023_fingerprints.sql` — every `function`, `table`, `policy` and `trigger` line must match what `supabase/tests/pglite/run.mjs` printed ("0023 fingerprints"); the three `seed` lines too (version 1 and the same md5) while no admin has changed a text.
2. `supabase/tests/0006_fingerprints.sql`: **only** the `star_update_event(...)` (M5) and `star_results_csv(...)` (the CSV keys) lines differ from 0023a's — expected. Everything else unchanged.
3. **Security advisor:** nothing new. (`star_set_result_text` is callable by `authenticated` on purpose — it checks data access and admin first; the helper `star_result_text_problem` is callable by nobody.)

### 0023d. Run the tests (you, in the SQL Editor)

1. `supabase/tests/0023_tests.sql` with `<paste-admin-UID-here>` / `<paste-desk-UID-here>` replaced → **ALL 0023 TESTS PASSED**. Supabase may warn about destructive operations: the test really runs a `delete` of the Make-up below text inside its transaction (to check the `not_found` answer) and checks that emptying the table is refused. Everything is rolled back, so the text is back afterwards. Confirm. A failure shows `TEST FAILED:` / `TEST SETUP:`; nothing is saved — run `rollback;` once on its own, then tell Claude.
2. Then `0006_tests.sql` again — every old Edit event and CSV test must still pass. (Its CSV key check accepts 0006's keys and 0023's.)
3. Put the placeholders back afterwards.

### 0023e. Undo (only with Jeffrey's OK)

1. Paste **the whole file** `supabase/manual/0023u_undo_star_update_event.sql` in the SQL Editor → **Run**. It holds only 0006's exact `star_update_event` and `star_results_csv`, each with 0006's revoke and grant (one transaction). M5 is undone (moving a finished event into the future again relies on the app's second call to close registration) and the CSV rows lose the three new keys — **put the app back to a version that doesn't need them first.**
2. Claude checks `supabase/tests/0006_fingerprints.sql`: the `star_update_event(...)` and `star_results_csv(...)` lines must equal 0023a's again (tested in PGlite, step0023). Then run `0006_tests.sql`.
3. **Not undone, on purpose:** the table `star_result_texts` (its rule, triggers and the three texts) and the functions `star_set_result_text` / `star_result_text_problem`. They are harmless while the app doesn't use them (staff can only read three email texts; only admins can change them). Before the Results screens use them, removing them would need its own reviewed script and Jeffrey's OK — and once the app uses them, the app must go back first.
4. To redo: paste 0023 again (safe; tested).

---

## Migration 0027: Edit camp refuses changes that break campers' extras

**Status: NOT APPLIED YET.** (Built on `camps`, rulebook v0.720.) Apply it only with Jeffrey's OK, **together with the app version whose Edit camp knows the two new answers** (built on the same branch). Every old answer stays exactly as it was.

**Production order:** … 0022 (live) → 0024 → 0023 → 0025 (live) → **0027**. It needs 0022 (it stops with "0027 needs migration 0022 (camps weekly pricing) first" if 0022 is missing).

**What it does** (`supabase/migrations/0027_camps_edit_guard.sql`):
- **The bug:** Edit camp could save a change that left an **active** camper holding an extra the camp's rules no longer allow. The camper's row stayed, but Edit details for that camper was then refused until staff removed the extra. Three ways: (1) a day nobody picked was removed, so a camper now came every camp day of that Monday–Sunday week (a per-day "not charged to all-days campers" extra like pizza that week became "included", rule R6) — or every day of the whole camp, for a once extra; (2) "not charged to all-days campers" was switched **on** for an extra such a camper already had; (3) an extra's **per** changed (once ↔ day) while campers had chosen it (a once row has no day, a per-day row needs one).
- **The fix:** `camp_update_camp` gets two new refusals, checked after the existing ones (removed day / removed extra / extra_day) and **before anything is written** — a refused save changes nothing:
  - `{"status":"not_empty","kind":"extra_per","extra_name":"<saved name>","count":<active campers who chose it>}` — a kept extra's per would change while active campers chose it.
  - `{"status":"not_empty","kind":"extra_included","extra_name":"<saved name>","count":<active campers affected>}` — a kept extra that will be "not charged to all-days campers" after the save, which an active camper has on a week they would come every day of (per-day extra, judged against the **new** day list) or on a camp they would come every day of (once extra).
  - When several extras break, the first in the camp's extras order is named. Withdrawn campers never count; a camper who comes only part of the week (or of the camp) doesn't count. Adding days is always fine.
- **Withdrawn campers' rows are cleaned up** (security review): in the write part of the same save, **withdrawn** campers' rows of kept extras that would no longer fit are removed — logged in the history under the save's batch, the same way 0022 already removes withdrawn campers' rows of a removed day. So **Restore** can never bring back an active camper holding a broken extra. Removed: (a) every row of an extra whose per changes; (b) rows of an extra that will be "not charged to all-days campers" where the camper comes every camp day of that row's week (per-day) or of the whole camp (once), against the new days; (c) per-day rows on a day the extra's new "only on these days" list no longer offers (0022 refused that for active campers but left withdrawn campers' rows behind).
- Replaces **only** `public.camp_update_camp` (`create or replace`, same arguments, owner, security definer, `search_path = ''`, `has_data_access()` first, then `is_admin()`; revoked from public, anon, authenticated and service_role, granted to `authenticated` only — as 0022). No table, rule, other function or data changes.

### 0027a. Before you apply (Claude, read-only through the connection)

1. **Pre-apply check:** Claude runs `supabase/tests/0027_preapply_check.sql` (one read-only SELECT, connector-safe). It counts **active** campers who already hold an extra row 0027 would refuse (the bug may have left some): `active_campers`, `camps`, `extra_rows`. **0 → go on.** Above 0 → staff fix those campers first (Edit details: remove the extra, or withdraw the camper; Claude lists them through the connection), because after 0027 **every** Edit camp save on such a camp is refused until they are fixed. (Tested in PGlite: 0 on a clean database, 1 / 1 / 1 with a row planted the way the bug made it.)
2. Claude runs `supabase/tests/0027_fingerprints.sql` and keeps the result (one row: 0022's `camp_update_camp`). It must equal the `camp_update_camp` line of 0022c's record.

### 0027b. Apply 0027 (you, in the SQL Editor)

1. Copy **the whole file** `supabase/migrations/0027_camps_edit_guard.sql`, **SQL Editor → New query**, paste, **Run**.
2. Supabase may warn about destructive operations: the words are inside the function (copied from 0022; they run only when an admin saves Edit camp). This file removes nothing. Confirm.
3. "Success." One transaction: on any error nothing is kept. Copy the error to Claude.

**Running it again is safe** (tested: no fingerprint changes). **If 0022 (or 0013) is ever re-run after 0027, re-run 0027 straight after it** — re-running 0022 puts its older `camp_update_camp` back (that is exactly what the undo does).

### 0027c. Read-only checks (Claude runs these through the connection)

1. **Fingerprints:** `supabase/tests/0027_fingerprints.sql` — the one line must match what `run.mjs` printed ("0027 fingerprints"): body md5 `9f70638fc19aee55c562f7df01ed5edc`, `definer=true`, `settings=search_path=""`, `rights=authenticated:EXECUTE,postgres:EXECUTE`. The file contains neither of the words the connection refuses.
2. `0013_fingerprints.sql` and `0022_fingerprints.sql`: **only** the `camp_update_camp(...)` line differs from before (its body md5; rights, owner and settings the same). Every other migration's fingerprints: unchanged (`run.mjs` step0027 checks exactly that).
3. **Security advisor:** nothing new.

### 0027d. Run the tests (you, in the SQL Editor)

1. `supabase/tests/0027_tests.sql`: replace `<paste-admin-UID-here>` and `<paste-desk-UID-here>`, paste, **Run** → **ALL 0027 TESTS PASSED**. It makes its own `zz test …` camps (two weeks of Mon–Wed, starting on a Monday 15–21 days from now, so it works on any weekday) and rolls everything back. Supabase may warn about destructive operations (some removals are tested to be refused, others really happen to the test camps). Confirm.
2. Then `0013_tests.sql`, `0017_tests.sql` and `0022_tests.sql` again — all must still pass.
3. Put the placeholders back afterwards.

### 0027e. Undo 0027 (only with Jeffrey's OK)

1. Paste **the whole file** `supabase/manual/0027u_undo_camp_update_camp.sql` in the SQL Editor → **Run**. It holds only 0022's exact `camp_update_camp` (0022 section 20b, word for word) with its revoke and grant (one transaction). Edit camp then no longer refuses the `extra_per` / `extra_included` cases — the bug is back. Re-running the whole 0022 file would do the same, but this touches only the one function 0027 replaced.
2. Claude checks `supabase/tests/0027_fingerprints.sql`: the line must equal 0027a's again; `0013_fingerprints.sql` and `0022_fingerprints.sql` must match their records from before 0027. Then run `0013_tests.sql`, `0017_tests.sql` and `0022_tests.sql`.
3. To redo: paste 0027 again (safe).

Tested in PGlite on every run (`run.mjs` step0027: the undo file exactly as named here; afterwards every fingerprint file equals the one before 0027 and the camps tests pass; 0027 again gives the tested fingerprints and `0027_tests.sql` passes).

**Why:**
- **Refuse, don't clean up:** removing a family's paid extra silently would change what they were charged; the admin decides (remove the extra in Edit details, or withdraw the camper) and then saves again — the same rule as a removed day or extra (v0.701).
- **Checked before any write:** a refused save leaves the camp exactly as it was (tested byte for byte).
- **A new migration, not an edit of 0022:** 0022 is live; replacing one function in a later file keeps the history clear and the undo simple.

---
