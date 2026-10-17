# TKD Dashboard — Handoff for the next chat

**School:** Jae H. Jeong's U.S. Taekwondo Center (U.S.T.C.), Worcester and Shrewsbury, MA
**Written:** 2026-10-16, end of the Home + setup session
**Rulebook:** `TKD-Dashboard-Design-Guidelines.md` (v0.30) — the source of truth. Read sections 0 (process), 5 (privacy/access) and 10b (build plan) first.

> Paste or attach this file at the start of the new chat. Then say what you want to build (next: Color Belt testing).
>
> Where the guidelines or README seem to conflict, the 10b rows marked v0.29/v0.30 and the changelog win.

---

## 1. Where things stand

- **Live:** https://tkd-dashboard.pages.dev — sign-in, empty Home ("today at a glance", starts empty), app shell, location switcher, account menu, lock screen with PIN, Set PIN / Change PIN / Change password.
- **No student data yet.** Home stays empty until a section feeds it.
- **Next section:** Color Belt testing — merge the existing "USTC Color Belt Staging" project into the dashboard, then retire that separate Supabase project.

## 2. Where everything lives

| What | Where |
|---|---|
| Design docs (guidelines, mockups, inventories, build plans, this file) | **Master copy: `docs/` in the code repo** (GitHub `shrewsburyustc/tkd-dashboard`), organized 2026-10-16 as `docs/Dashboard Docs/` (guidelines, this handoff, Home/account mockups, build contracts), `docs/Testing/Color Belt Testing/`, `docs/Testing/Star Testing/`. Reading copies of the `.md` files in the claude.ai project "Taekwondo Management System". The OneDrive `TKD Dashboard` folder is an older copy, no longer updated. |
| Code | `C:\Users\shrew\projects\tkd-dashboard` (outside OneDrive on purpose — OneDrive breaks git). Shortcut: `Open dashboard code folder.url` in the TKD Dashboard folder |
| GitHub | `shrewsburyustc/tkd-dashboard` (private, school-owned). Jeffrey pushes as his personal account `jberg412-jb` (collaborator) |
| Hosting | Cloudflare Pages project `tkd-dashboard` on the school Cloudflare account (shrewsburyustc@gmail.com). Auto-deploys every push to `main`. Build `npm run build` → `dist`. Env vars: `VITE_SUPABASE_URL`, `VITE_SUPABASE_ANON_KEY` (publishable), `NODE_VERSION=24` |
| Database + logins | Supabase org "U.S Taekwondo Center" (school email is Owner; Jeffrey has access). Project **tkd-dashboard**, ref `eozkfbdfxqlcbpewhach`, us-east-1, **Free plan**. Other project in the org: **USTC Color Belt Staging** (`mfqcchrapunngwwvxzwu`) |
| Security headers | `public/_headers` in the code (served by Cloudflare Pages): no framing by other sites, no camera/mic/location. Update it if a new section must load something from another site |
| Local run | `Start dashboard.bat` (real database) / `Start preview.bat` (fake database: password `preview`, PIN `2580`) in the code folder |

## 3. Stack

React 19 + Vite (plain JavaScript, plain CSS, `@tabler/icons-react`), Supabase (Postgres + Auth), Cloudflare Pages. Code is written for a learner: every file has a header comment (what + why) and plain-English comments.

## 4. Accounts

| Display name | Login | Role | Notes |
|---|---|---|---|
| Main Admin | jberg412@gmail.com | admin | Jeffrey. 45-min idle lock |
| Staff | shrewsburyustc@gmail.com | staff | **Shared front-desk account** (interim until school domain + employee emails). `is_shared` = sets its PIN once at first sign-in, then can't change its PIN or password (admin only, via SETUP.md); 2-hour idle lock |

- Logins are created in Supabase (Authentication → Users → Add user, Auto Confirm), then a `public.staff` row is added. Public sign-ups and anonymous sign-ins are OFF. Min password 12; "require current password" and "secure password change" ON.
- Admin changes the desk PIN/password via `supabase/SETUP.md` ("Admin: change the front-desk PIN or password").
- PIN: 4 digits, no all-same or straight runs (1111, 1234, 4321…). 5 wrong PINs on a device → password required. Password required every 7 days.

## 5. How Jeffrey wants to work (follow exactly)

- **Show before build (P1):** every new screen as a mockup at PC / tablet / phone with an explanation of what it does, before any code.
- **One decision at a time**, each option shown **visually** with a detailed description of pros/cons and a recommendation.
- **Nothing deployed without his explicit OK** for that item (P2). Deploy = push to `main` (auto-deploys), so pushing to main counts as deploying.
- **Update the guidelines** for every decision (version bump + changelog line, P4) — in the repo's `docs/Dashboard Docs/` (master copy — commit and push) and the claude.ai project copy.
- **Split multi-part work across subagents and have a separate agent review before finalizing** (security review for database/auth work; design review against the rulebook + mockups).
- **Explain technical steps as learning** (what each command/tool is and why). Direct, blunt; flag a flaw once, then defer to his call.
- **Sections are added only when he says so (P7)**, one at a time: design → approve → build → use → refine.

## 6. Rules for every new section (security — non-negotiable)

Migration `0002` is live: the database itself refuses data to a locked, PIN-locked, signed-out or magic-link/recovery session, or one whose password sign-in is more than 7 days old.

- Every table: RLS on; policies `to authenticated` with `(select public.has_data_access())` **plus** the table's own rule (e.g. location, role). Use `has_data_access()` — **never** `is_active_staff_with_fresh_password()` alone (older wording in SETUP.md §3 and 0001's comments was superseded by 0002).
- `is_admin()` is **never** a data gate on its own — always `is_admin() and has_data_access()`.
- Explicit column/table grants only; **nothing to `anon`**. New objects created by `postgres` start private, but still write explicit `revoke … from public, anon, authenticated` + the needed `grant` in every migration (as 0002 does).
- Views `with (security_invoker = true)`. Security-definer functions: `set search_path = ''`, fully qualified names, revoke execute from public/anon, grant to `authenticated` only where the app calls them. Functions that **return data** check `has_data_access()` first (lock/PIN functions deliberately don't).
- Every change to a record is logged with who made it and when (guidelines section 5).
- Each new section decides what Admin vs Staff can see/edit (open decision 10.5) — one question at a time.
- The secret / `service_role` key never goes in the app, `.env.local`, git, a chat message or a screenshot; rotate it immediately if it leaks. After any SQL Editor snippet containing a real PIN or password, replace it with `XXXX` or delete the snippet.
- Records are mostly about minors: list views and the mat-side tablet never show DOB, address, medical or billing details (guidelines section 5).
- Every new table gets tests showing a locked / PIN-locked / signed-out / stale session can't read it (style: `supabase/tests/0002_tests.sql`).

## 7. How changes get made (workflow that worked)

- **Migrations:** write `supabase/migrations/000N_*.sql`. Test in **PGlite** (Postgres in Node) with Supabase-style stubs before touching production.
- **Applying to Supabase:** the Supabase connector **cancels SQL containing `delete` anywhere** (even in comments or function bodies), and in practice also cancelled the part containing `drop` + a data update — so expect to hand Jeffrey a file for the SQL Editor for anything beyond plain creates/grants. Apply clean parts through the connector; give Jeffrey the rest as a file to paste in **SQL Editor** (he's done this three times). After applying, **fingerprint every function** (md5 of `prosrc` without comments/whitespace) against the tested copy and run Supabase's security advisor.
- **App testing:** preview mode (fake backend) + Playwright screenshots at 1280×800, 820×1180 touch, 390×844 touch, 320 wide. Real `vite build` is done on Jeffrey's machine's Linux environment (npm works there; not in the cloud workspace).
- **Shipping code:** files are written to `C:\Users\shrew\projects\tkd-dashboard`, then Jeffrey runs `git add .` → `git commit -m "…"` → `git push`. Check `git status` never lists `.env.local`, `node_modules`, `dist`, `dist-preview`.

## 8. Open items

**REQUIRED before Color Belt stores any student data**
- [ ] Run `supabase/tests/verify_pin_tests.sql` and `supabase/tests/0002_tests.sql` in the production SQL Editor (both roll back; replace the UID placeholders as their headers say). Both must print their PASSED line.
- [ ] Confirm `select count(*) from auth.sessions;` returns a number, and that 5 wrong PINs on a test device removes that session from `auth.sessions`.

**Before staff rely on it daily**
- [ ] **Upgrade Supabase to Pro** (~$25/mo once Color Belt staging is retired; ~$35/mo while both projects exist). Free projects **pause after 7 days without use** — the dashboard would go down over a school vacation. On Pro also: turn on leaked-password protection; set time-boxed sessions to 7 days.
- [ ] Add the **grandmaster as a second admin** (so the school is never locked out).
- [ ] Bookmark the live address on each school device; sign in; set **This device** to that building.

**Later**
- [ ] When the school domain exists: `dashboard.<domain>` as a custom domain in Cloudflare; move accounts to domain emails (add new owner, then remove old; GitHub `shrewsburyustc` is a user account → change its email); personal staff logins replace the shared desk account.
- [ ] Design + build **Staff accounts** and **Settings** screens when personal logins arrive (until then: Supabase dashboard + SETUP.md snippets). Staff accounts needs a secure server function (creating logins requires the secret key, which must never be in the app).
- [ ] Decide code ownership in writing with the owner if the dashboard may ever be sold to other schools (currently school-owned GitHub).
- [ ] Delete `C:\Users\shrew\projects\_to_delete\` (temporary test files).

**Known, accepted limitations** (documented in SETUP.md)
- A borrowed *unlocked* session within 10 minutes of a password sign-in can set a new PIN.
- Anyone who knows the shared desk password could change it through the API (the menu hides it, but that's UI-only) — and doing so signs out the other desk computers.

## 9. Color Belt — starting point for the next chat

- Existing project: Supabase "USTC Color Belt Staging" (`mfqcchrapunngwwvxzwu`, same org). Its tables, code location and current use need to be inventoried first (read-only).
- Context: colour belt testing registration went online for the first time in October 2026; from now on all students register online; students need 3 stripes on one side of their belt to register. Colour belt testing runs at one location.
- **Decide early (its own question, with visuals):** online registration is a public, not-signed-in path, which conflicts with "nothing to `anon`". Options include a narrow insert-only server function or keeping the public form separate from the dashboard. Never grant `anon` table access to copy the old staging project.
- Process: inventory the existing project → brainstorm the section one question at a time with visuals → mockups at 3 sizes → approval → migration (with the section 6 rules) + screens → reviews → his OK → push.
- Decide what (if anything) Color Belt puts on Home, and the section's rail icon (add to the icon map, guidelines 2.4).
