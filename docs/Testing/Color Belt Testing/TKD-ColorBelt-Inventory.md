# Color Belt Testing — Inventory of the existing system

**Written:** 2026-10-16, start of the Color Belt section (read-only inventory, nothing changed)
**Sources:** code in `Testing\Color Belt Prototype`, Notion "Color Belt Testing System - Design" (the authoritative design note, 9/17–10/15), Supabase project "USTC Color Belt Staging" (`mfqcchrapunngwwvxzwu`).

---

## 1. How it runs today

| Piece | What it is |
|---|---|
| App | One Cloudflare Worker `ustc-color-belt-staging` → `https://ustc-color-belt-staging.shrewsburyustc.workers.dev`. Server-rendered HTML pages, no framework. |
| Database | Supabase "USTC Color Belt Staging". All tables in private schema `belt` (28 tables, 71 functions). Nothing granted to `anon`/`authenticated`; the Worker connects through Hyperdrive as `belt_server` → `belt_runtime`, and every write is a security-definer function. |
| Staff login | Google sign-in + required authenticator app (TOTP MFA). 30-min idle / 8-hr max; optional "keep me signed in" 30 days. Fresh MFA for backups and deleting events. |
| Roles | One **owner** (school Gmail) + staff with per-area permissions: events, registrations, payments, roster, settings, staff (view/edit). Jeffrey = staff with all six edit areas. No staff-management screen (SQL scripts). |
| Public form | `/register?eventId=…`, no account. Goes Browser → Worker (cookie, CSRF, rate limits) → 4 narrow DB functions. Browser never talks to Supabase. |
| Look | Light/dark mode, blue `#164b9b`, red `#bd2439`, rounded cards with shadows, 44px buttons, 32px headings, red top border on header. |
| Code backup | **Production code is not in git** (only the old demo is). OneDrive sync is the only backup. |

## 2. Live data (as of 2026-10-16)

- **October Teen/Adult Testing** — Thu 2026-10-29, Open, 0 registrations.
- **October Children Testing** — Fri 2026-10-30, Open, 4 real registrations (3 Registered, 1 Cancelled), real cash payments recorded.
- 2 archived test events with TEST records. 7 Classes, 42 ranks with real prices.
- Personal data stored: student names (minors), drawn signatures, grading notes, payments. **No** DOB, parent name, email, phone, address or medical fields anywhere (deliberate).
- **No location field** — Worcester/Shrewsbury not modelled.

## 3. Screens (staff)

1. **Testing events** — current/upcoming, past/closed (collapsed), archived. Per event: Registrations & payments, Testing, Edit details, family link + QR, Open/Close registration, Archive/Restore/Delete (unused draft).
2. **Event setup (draft editor)** — name, date, Classes included with start/end time (same times = one session), per-rank prices (pre-registration / testing-day / private) + sparring gear, description (≤4,000 chars) with reusable message templates.
3. **Edit details** — name, date, description; review step; date change moves registrations and closes registration.
4. **Registrations & payments** — session tiles (Class + time + count), "Time not set" and Private tabs; one row per student: name, Class/rank → next, time, status, Cash/Check, payment status/balance, History, Remove/Delete, Record payment/Undo. 50 rows/page, removed students collapsed, live refresh ~5 s.
5. **Payment history** — append-only entries, recorded-by, reversals.
6. **Testing roster (grading)** — same tiles; per student: rank → next, Paid/Unpaid, sparring gear; Pass / No Show / not recorded; notes; autosave. Pass does **not** promote rank.
7. **Correct belt** — change rank within the same Class, shows fee/balance change.
8. **Remove from roster** (owner) — Cancelled, history kept, no restore. **Permanently delete** (owner) — only solo, unpaid, ungraded registrations.
9. **Manage** — edits only for TEST records.
10. **Registration preview / fictional registration test** — rehearse the family form on a draft event.
11. **Settings: Classes & ranks** — collapsible Classes, rank order (drag/arrows), three prices per rank, final award, rename/remove Class.
12. **Calendar** — read-only month agenda of events; private calendar.
13. **Private testing** (staff-only, TEST bookings only) — appointment length, dated one-student slots, close/reopen, book up to 10 students with one signature, cancel (future, unpaid, ungraded).
14. **Encrypted backup** (owner, fresh MFA) — browser-encrypted file for OneDrive.

**Public family form:** Step 1 students (1–10: name, Class → rank, shows time / testing-for / both prices / sparring note; Cash or Check) → Step 2 review + acknowledgment + one drawn signature → Step 3 reference number. Closed-event page. Testing-day price only from midnight on the day.

## 4. Business rules

- Price: override → private fee (private) → pre-registration fee if paid in full before testing day → otherwise testing-day fee (earlier payments count).
- Record payment = one click, full remaining balance, method chosen at registration. Undo = reverses the latest payment (history kept). No refunds/credits.
- Events: Draft → Open → Closed (+ archived flag). Opening is owner-only and needs a ready event (future date, sessions, ranks, no TEST records). Several events can be open at once.
- Whole day of a regular testing event blocks private testing.
- Families can't edit or cancel — they contact the school.

## 5. Incomplete / deferred

- **Private testing:** public booking, real (non-TEST) bookings and payments, regular ↔ private transfers, refunds/credits; compact redesign never applied to private screens.
- Editing real registrations (Manage is TEST-only); restore after remove; staff-management screen; email/notifications; card payments; shared-tablet mode; privacy/retention policy; LT Black → Yellow and Deputy → Deputy 1 pricing.

## 6. Gaps and conflicts with the dashboard

| # | Item | Notes |
|---|---|---|
| 1 | **"3 stripes to register"** (handoff) | Not in the code, the Notion notes or the database. Needs a decision. |
| 2 | **Location** | Old system has none; dashboard has a Worcester/Shrewsbury/Both switcher. Testing runs at one location. |
| 3 | **Login model** | Old: Google + authenticator MFA. Dashboard: email + password + 4-digit PIN. A merge drops MFA for these screens unless added. |
| 4 | **Roles** | Old: owner + 6 permission areas. Dashboard: Admin / Staff (decision 10.5 open). |
| 5 | **Database access model** | Old: server-only (Worker). Dashboard: browser → Supabase with RLS + `has_data_access()`. Public form still needs a server-side path. |
| 6 | **Dark mode** | Old has it; dashboard v1 does not. |
| 7 | **Timing** | Real October testing on 10/29 and 10/30 runs on the old system. |
| 8 | **Design rules** | Old UI breaks most dashboard rules: 44px+ buttons, 32px titles, shadows, rounded 14–16px cards, red header border, red danger buttons beyond delete, side-scrolling tables on phones. |
