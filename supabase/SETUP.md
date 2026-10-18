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

**Status:** applied to production 2026-10-17; 11b checks and 11c tests passed. The screens are not deployed yet (branch `staff-accounts`), so 11d uses the local app.

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

