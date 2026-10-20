# TKD Dashboard — design docs

**This `docs/` folder in the code repo is the master copy of every design doc** (decided 2026-10-16). Edit here, commit, push; `git pull` on the other computer. The OneDrive `TKD Dashboard` folder is an older copy and is no longer updated. The claude.ai project holds reading copies of the `.md` files.

School management dashboard for Jae H. Jeong's U.S. Taekwondo Center (Worcester and Shrewsbury), similar in scope to Kicksite.

**Status:** Home is **live** at https://tkd-dashboard.pages.dev (Oct 16, 2026). New sections are added **one at a time** — design → approve → build → use → refine. Nothing goes live without Jeffrey's explicit OK on that specific item. **New chat? Start with `TKD-Dashboard-Handoff.md`.**

## Files in this folder

| Folder / file | What it is |
|------|------------|
| `Dashboard Docs/TKD-Dashboard-Design-Guidelines.md` | **The rulebook.** Upload it at the start of any chat about the dashboard. Every screen and feature must follow it. |
| `Dashboard Docs/TKD-Dashboard-Handoff.md` | **Start here in a new chat.** Everything needed to continue: where things live, accounts, rules for new sections, open items. |
| `Dashboard Docs/TKD-Home-Mockups.html` | **Approved Home mockups (Oct 15, 2026):** sign-in, empty Home, account menu, lock screen at PC, tablet, and phone. |
| `Dashboard Docs/TKD-Account-Screens-Mockups.html` | Approved account screens (Set PIN, Change PIN, Change password). |
| `Dashboard Docs/TKD-Dashboard-Mockups.html` | Style reference only (colors, sizes, rail hover). Made before v0.9 — section names and layout are placeholders. |
| `Testing/Color Belt Testing/` | Color Belt: **status file (`TKD-ColorBelt-Status.md` — start here)**, inventory of the old system, approved mockups for every phase (Classes and ranks, belts, events, family form, roster, grading, private testing — PNG copies in `Phase 2/3/4 images/`), build plans for phases 1–4, and `DECISION-history-purge.md` (family history design for the Prospects purge). |
| `Testing/Star Testing/` | Star testing: inventory of the old prototype; `Old prototype/` holds the never-used prototype and its notes (feature reference only). |
| `Dashboard Docs/Build contracts/` | Build contracts for Home (`BUILD-CONTRACT.md`), migration 0002 (`CONTRACT-0002.md`) and Color Belt migrations 0003 (phase 1, `CONTRACT-0003.md`), 0005 (events, `CONTRACT-0005.md`), 0010 (results, `CONTRACT-0010.md`) and 0014 (private testing, `CONTRACT-0014.md`); other sections' contracts sit beside them. |
| `Prospects/` | New students: approved Schedule mockups (`TKD-Class-Schedule-Mockups.html`, rev 2) Calendar mockups (`TKD-Calendar-Mockups.html`, rev 1) Forms mockups (`TKD-Forms-Mockups.html`, rev 1) and Prospects mockups (`TKD-Prospects-Mockups.html`, rev 2), Oct 17, 2026. All four new-students designs are approved. Schedule screens are built and tried in preview mode (migration 0007, not live yet). |
| `README.md` | This file. |

The school logo used for brand colors lives in `U.S.T.C Projects\Logos\Logo.png` on the school PC (OneDrive).

## How we work
1. Every new screen is shown as a mockup at PC, tablet, and phone sizes, with an explanation of what it does, before anything is built.
2. Every choice is presented with a visual of each option, one decision at a time.
3. Each decision is written into the guidelines (version bumped, changelog updated).
4. Nothing is deployed until Jeffrey says OK for that item.
5. One section at a time: design → approve → build → use → refine, then pick the next section.

## Decisions so far (Oct 15, 2026)
- PC, tablet, and phone are optimized equally; same features on every device.
- PC navigation is an icon-only rail; a clear dark label appears on hover. Touch screens show labels under icons.
- Primary buttons are blue. The current section is marked with a blue tint.
- Top bar shows only controls that work: day one is the location switcher + account menu.
- Login: personal email + password for each person (no shared login). No self-service password reset; admins reset passwords in Staff accounts.
- Sign-in and lock screens have no location switcher.
- Two account levels: Admin and Staff.
- Build platform: Supabase (database + logins), screens on Cloudflare Pages. Lives in the school's existing Supabase organization (school account is Owner). Free until staff use it daily, then Pro ≈ $35/month (≈ $25 if Color Belt staging is paused); billing moves to the school by swapping the card.
- Code: private GitHub repository `shrewsburyustc/tkd-dashboard` (school-owned); Jeffrey pushes as `jberg412-jb` (collaborator).
- First admin: Jeffrey, created in the Supabase dashboard; grandmaster added as second admin. Dashboard admin is separate from the Supabase org Owner.
- Recommended: invite Jeffrey's personal email to the school Supabase org as Administrator (check his personal account's free-project count first).
- Web address: free `.pages.dev` address for now; moves to `dashboard.<new school domain>` once the domain exists. Account emails move to the new domain later (add new owner, then remove old). Staff accounts must let admins edit a staff member's email.
- Auto-lock after 45 minutes idle; unlock with your own 4-digit PIN.
- Account menu: Lock now, Change PIN/password, this device's location, Sign out; admins also get Staff accounts and Settings.
- Red is used only for delete/remove actions. Errors and warnings are amber.
- Brand blue is the exact logo navy `#003595`. Logo red `#FD0000` is for the logo only.

## Still open
- Roles and access: what Admin vs. Staff can see or edit inside each section.
- **LIVE:** https://tkd-dashboard.pages.dev (deployed Oct 16, 2026). Code: `C:\Users\shrew\projects\tkd-dashboard` → GitHub `shrewsburyustc/tkd-dashboard` → Cloudflare Pages auto-deploys every push.
- Server-side lock (migration 0002): done and live.
- Built: Set PIN, Change PIN, Change password. Later (with personal logins): Staff accounts, Settings.
- Approved Oct 16: no-PIN users signed out instead of locked; "This device" choice inside the menu; darker control borders (`#8F8F8A`).
- Optional: turn the school GitHub user account (`shrewsburyustc`) into an organization with Jeffrey as co-owner.

## Sections
- **Home** (mockups approved Oct 15, 2026 — not approved to build): "today at a glance" style. Welcome header (logo, greeting, date, location). Starts empty with a one-line message; items are added only as other sections are built.

- **Color Belt testing — phases 1–3 LIVE; phase 4 database live, screens not yet deployed (Oct 2026):** Testing → Classes and ranks (phase 1, migration 0003), events + public family form + registrations, payments and the testing roster (phase 2, migration 0005), grading and results (phase 3, migration 0010). Phase 4: a separate **Private testing** tab (its own roster, payments, Move from an event, grading) — migration 0014 live since Oct 19; the screens deploy only after Finance's migration 0018 (private testing money in the Daily report) is live. The old Color Belt Supabase project stays read-only and in use until the new section replaces it. Planned: Classes and ranks move to school-wide Settings after the Calendar is built. Details: `Testing/Color Belt Testing/TKD-ColorBelt-Status.md`.

- **Schedule** (mockups approved Oct 17, 2026 — not approved to build): first step of the new-students work (Schedule → Calendar → Forms → Prospects list). Built after Color Belt phase 1 is merged, because schedule classes come from Classes and ranks.
- **Calendar** (mockups approved Oct 17, 2026 — not approved to build): Month view (default) and Week view; classes, closures, events colored by event type, and free-class bookings once Forms exist.
- **Forms** (mockups approved Oct 17, 2026 — not approved to build): in-app three-panel form builder, public forms in short steps with free-class booking, link / QR / front-desk kiosk, confirmation and school emails.
- **Prospects** (mockups approved Oct 17, 2026 — not approved to build): pipeline bar + follow-up list per school, side panel with calls, notes and follow-ups, staff Check in on arrival, Joined as the place for new students until a Students section exists.

Sections are added only when Jeffrey says so, one at a time.
