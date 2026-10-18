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
| `Testing/Color Belt Testing/` | Color Belt: inventory of the old system, approved phase 1 mockups (Classes and ranks), phase 1 build plan. |
| `Testing/Star Testing/` | Star testing: inventory of the old prototype; `Old prototype/` holds the never-used prototype and its notes (feature reference only). |
| `Prospects/` | New students: approved Schedule mockups (`TKD-Class-Schedule-Mockups.html`, rev 2, Oct 17, 2026). Calendar, forms and prospects list come next, one at a time. |
| `Dashboard Docs/Build contracts/` | Build contracts for Home (`BUILD-CONTRACT.md`) and migration 0002 (`CONTRACT-0002.md`). |
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

- **Color Belt testing** (next, not designed yet): the existing Color Belt project merges into the dashboard after Home is built; its separate Supabase project is then retired.

- **Schedule** (mockups approved Oct 17, 2026 — not approved to build): first step of the new-students work (Schedule → Calendar → Forms → Prospects list). Built after Color Belt phase 1 is merged, because schedule classes come from Classes and ranks.

Sections are added only when Jeffrey says so, one at a time.
